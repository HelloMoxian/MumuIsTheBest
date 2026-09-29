import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { maskTerrainToLand } from "./nature-terrain.js";

const unzip = promisify(gunzip);
const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const line = z.array(position).min(2);
const ring = z.array(position).min(4).refine(points => points[0]?.[0] === points.at(-1)?.[0] && points[0]?.[1] === points.at(-1)?.[1], "Unclosed polygon ring");
const geometry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: position }),
  z.object({ type: z.literal("MultiPoint"), coordinates: z.array(position) }),
  z.object({ type: z.literal("LineString"), coordinates: line }),
  z.object({ type: z.literal("MultiLineString"), coordinates: z.array(line) }),
  z.object({ type: z.literal("Polygon"), coordinates: z.array(ring) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ring)) }),
]);
const featureCollection = z.object({ type: z.literal("FeatureCollection"), features: z.array(z.object({
  type: z.literal("Feature"), properties: z.record(z.string(), scalar), geometry,
})) });
export const mapPackSchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  coordinateSystem: z.enum(["GCJ-02", "WGS84"]), datasets: z.record(z.string(), featureCollection),
  attribution: z.string(), description: z.string(), terrainDataUrl: z.string().startsWith("data:image/webp;base64,").optional(),
  missing: z.array(z.string()).optional(),
});
const photoSchema = z.object({ id: z.string().uuid(), width: z.number().int().positive(), height: z.number().int().positive(), createdAt: z.string().datetime() }).strict();
const footprintFields = {
  title: z.string().trim().min(1).max(60), note: z.string().max(2000),
  date: z.iso.date(), longitude: z.number().min(70).max(140), latitude: z.number().min(0).max(56),
};
const footprintSchema = z.object({
  id: z.string().uuid(), ...footprintFields, coordinateSystem: z.literal("GCJ-02"), mapVersion: z.string(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), photos: z.array(photoSchema).max(4),
}).strict();
export const geographyStateSchema = z.object({
  schemaVersion: z.literal(1), id: z.literal("nature-geography"), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  revision: z.number().int().nonnegative(), lights: z.array(z.string().regex(/^\d{6}$/)).max(6000),
  footprints: z.array(footprintSchema).max(1000),
}).strict().superRefine((state, ctx) => {
  if (new Set(state.lights).size !== state.lights.length || new Set(state.footprints.map(f => f.id)).size !== state.footprints.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate geography identifiers" });
  }
});
type GeographyState = z.infer<typeof geographyStateSchema>;
type Pack = z.infer<typeof mapPackSchema>;
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export function registerNatureGeographyApi(app: FastifyInstance, appDataDir: string) {
  const statePath = resolve(appDataDir, "learning/nature/geography.json");
  const photoDir = resolve(appDataDir, "media/nature-footprints");
  const packs = new Map<string, Promise<Pack>>();
  let landTerrain: Promise<Buffer> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => {
    const next = queue.then(fn, fn); queue = next.catch(() => undefined); return next;
  };
  async function atomic(path: string, bytes: string | Buffer) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const tmp = `${path}.${randomUUID()}.tmp`;
    try { await writeFile(tmp, bytes, { mode: 0o600 }); await rename(tmp, path); }
    finally { await unlink(tmp).catch(() => undefined); }
  }
  async function readState(): Promise<GeographyState> {
    try { return geographyStateSchema.parse(JSON.parse(await readFile(statePath, "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new ApiError(503, "记录暂时无法读取，原有数据已保留。请重试或检查本机数据文件。");
      const now = new Date().toISOString();
      return { schemaVersion: 1, id: "nature-geography", createdAt: now, updatedAt: now, revision: 0, lights: [], footprints: [] };
    }
  }
  async function save(state: GeographyState) {
    state.updatedAt = new Date().toISOString(); state.revision += 1;
    await atomic(statePath, JSON.stringify(geographyStateSchema.parse(state)));
    return state;
  }
  async function pack(id: "world" | "china") {
    if (!packs.has(id)) {
      const promise = (async () => {
        const bytes = await readFile(resolve(appDataDir, `cache/nature-maps/${id}.json.gz`));
        const data = mapPackSchema.parse(JSON.parse((await unzip(bytes, { maxOutputLength: 512 * 1024 * 1024 })).toString()));
        if (data.coordinateSystem !== (id === "china" ? "GCJ-02" : "WGS84")) throw new Error("Coordinate system mismatch");
        return data;
      })();
      packs.set(id, promise);
      promise.catch(() => { packs.delete(id); });
    }
    try { return await packs.get(id)!; }
    catch { throw new ApiError(503, "本机地图包尚未准备好，请在项目中运行地图安装脚本后重试。"); }
  }
  // All failures are sanitized: file paths, uploaded content and parser errors never reach the client.
  app.register(async (api) => {
    api.setErrorHandler((error, _req, reply) => {
      if (error instanceof ApiError) return reply.code(error.status).send({ error: error.message });
      if (error instanceof z.ZodError) return reply.code(400).send({ error: "请检查地点、日期、记录或照片格式。" });
      return reply.code(503).send({ error: "暂时无法完成，请保留输入后重试。" });
    });
    api.get("/maps/:scope", async (req) => {
      const { scope } = z.object({ scope: z.enum(["world", "china"]) }).parse(req.params);
      const data = await pack(scope);
      return { schemaVersion: 1, updatedAt: data.updatedAt, coordinateSystem: data.coordinateSystem, attribution: data.attribution,
        description: data.description, layers: Object.keys(data.datasets), missing: data.missing ?? [] };
    });
    api.get("/maps/:scope/:layer", async (req, reply) => {
      const { scope, layer } = z.object({ scope: z.enum(["world", "china"]), layer: z.string().regex(/^[a-z0-9]+$/) }).parse(req.params);
      const data = await pack(scope);
      if (scope === "world" && layer === "terrainlandv1" && data.terrainDataUrl && data.datasets.land) {
        if (!landTerrain) {
          landTerrain = maskTerrainToLand(Buffer.from(data.terrainDataUrl.split(",")[1], "base64"), data.datasets.land);
          landTerrain.catch(() => { landTerrain = undefined; });
        }
        return reply.type("image/webp").header("Cache-Control", "private, max-age=3600").send(await landTerrain);
      }
      if (scope === "world" && layer === "terrain" && data.terrainDataUrl) {
        return reply.type("image/webp").header("Cache-Control", "private, max-age=3600").send(Buffer.from(data.terrainDataUrl.split(",")[1], "base64"));
      }
      if (!data.datasets[layer]) throw new ApiError(404, "这个地区暂时没有更细的地图。");
      return reply.header("Cache-Control", "private, max-age=3600").send(data.datasets[layer]);
    });
    api.get("/state", async (_req, reply) => reply.header("Cache-Control", "no-store").send(await readState()));
    api.put("/lights/:id", async (req) => {
      const { id } = z.object({ id: z.string().regex(/^\d{6}$/) }).parse(req.params);
      const { lit } = z.object({ lit: z.boolean() }).strict().parse(req.body);
      const data = await pack("china");
      if (!Object.values(data.datasets).some(d => d.features.some(f => f.properties.id === id && f.properties.name))) throw new ApiError(400, "请选择地图上的地区。");
      return serial(async () => {
        const state = await readState(); const set = new Set(state.lights);
        if (lit === set.has(id)) return state;
        if (lit) set.add(id); else set.delete(id);
        state.lights = [...set]; return save(state);
      });
    });
    api.post("/footprints", { bodyLimit: 46 * 1024 * 1024 }, async (req, reply) => {
      const input = z.object({ id: z.string().uuid(), ...footprintFields,
        photos: z.array(z.string().max(12_000_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)).max(4),
      }).strict().parse(req.body);
      const data = await pack("china");
      return serial(async () => {
        const state = await readState();
        // A retried create request must never append the same visit or photographs twice.
        if (state.footprints.some(f => f.id === input.id)) return state;
        if (state.footprints.length >= 1000) throw new ApiError(400, "相册已经有 1000 条足迹，请先整理一些记录。");
        const now = new Date().toISOString();
        const created: string[] = [];
        const photos: z.infer<typeof photoSchema>[] = [];
        try {
          for (const encoded of input.photos) {
            const raw = Buffer.from(encoded.slice(encoded.indexOf(",") + 1), "base64");
            if (raw.length > 8 * 1024 * 1024) throw new ApiError(400, "每张照片请小于 8 MB。");
            let image: Buffer; let width: number; let height: number;
            try {
              const processor = sharp(raw, { limitInputPixels: 40_000_000, animated: false });
              const meta = await processor.metadata();
              if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1) throw new Error("format");
              const result = await processor.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
              image = result.data; width = result.info.width; height = result.info.height;
            } catch { throw new ApiError(400, "照片无法打开，请选用普通 JPG、PNG 或 WebP 图片。"); }
            const id = randomUUID();
            const full = resolve(photoDir, `${id}.webp`), thumb = resolve(photoDir, `${id}.thumb.webp`);
            created.push(full, thumb);
            await atomic(full, image);
            await atomic(thumb, await sharp(image).resize(240, 180, { fit: "cover" }).webp({ quality: 80 }).toBuffer());
            photos.push({ id, width, height, createdAt: now });
          }
          state.footprints.unshift({ id: input.id, title: input.title, note: input.note, date: input.date,
            longitude: input.longitude, latitude: input.latitude, coordinateSystem: "GCJ-02", mapVersion: data.updatedAt,
            createdAt: now, updatedAt: now, photos });
          const result = await save(state); reply.code(201); return result;
        } catch (error) {
          await Promise.all(created.map(p => unlink(p).catch(() => undefined))); throw error;
        }
      });
    });
    api.patch("/footprints/:id", async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const input = z.object({ title: footprintFields.title, note: footprintFields.note, date: footprintFields.date }).strict().parse(req.body);
      return serial(async () => {
        const state = await readState(); const record = state.footprints.find(f => f.id === id);
        if (!record) throw new ApiError(404, "这条足迹已经不存在了。");
        Object.assign(record, input, { updatedAt: new Date().toISOString() }); return save(state);
      });
    });
    api.delete("/footprints/:id", async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return serial(async () => {
        const state = await readState(); const record = state.footprints.find(f => f.id === id);
        if (!record) return state;
        state.footprints = state.footprints.filter(f => f.id !== id);
        await save(state);
        await Promise.all(record.photos.flatMap(p => [`${p.id}.webp`, `${p.id}.thumb.webp`]).map(p => unlink(resolve(photoDir, p)).catch(() => undefined)));
        return state;
      });
    });
    api.get("/photos/:id/:size", async (req, reply) => {
      const { id, size } = z.object({ id: z.string().uuid(), size: z.enum(["full", "thumb"]) }).parse(req.params);
      const state = await readState();
      if (!state.footprints.some(f => f.photos.some(p => p.id === id))) throw new ApiError(404, "这张照片已经不存在了。");
      try { return reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff").type("image/webp").send(await readFile(resolve(photoDir, `${id}${size === "thumb" ? ".thumb" : ""}.webp`))); }
      catch { throw new ApiError(404, "这张照片暂时无法读取。"); }
    });
  }, { prefix: "/api/nature" });
}
