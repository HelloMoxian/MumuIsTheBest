import { open, type FileHandle } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";

const integer = z.number().int().nonnegative();
const passSchema = z.object({ id: z.string().regex(/^[a-z]+$/), name: z.string().min(1).max(60),
  longitude: z.number().min(73).max(136), latitude: z.number().min(18).max(54),
  elevation: z.number().min(-500).max(9000), source: z.string().url() });
export const demManifestSchema = z.object({
  schemaVersion: z.literal(1), id: z.literal("china-terrain"), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  coordinateSystem: z.literal("WGS84"), encoding: z.literal("terrarium"),
  bounds: z.tuple([z.literal(73), z.literal(18), z.literal(136), z.literal(54)]),
  minZoom: z.union([z.literal(0), z.literal(4)]), nationalZoom: z.number().int().min(8).max(10), maxZoom: z.literal(12),
  attribution: z.string(), source: z.string().url(), passes: z.array(passSchema).min(1).max(100),
  tiles: z.record(z.string().regex(/^(?:[0-9]|1[0-2])\/\d{1,4}\/\d{1,4}$/),
    z.tuple([integer, integer.positive().max(1024 * 1024), z.string().regex(/^[a-f0-9]{64}$/)])),
});
type Manifest = z.infer<typeof demManifestSchema>;

async function readExactly(file: FileHandle, size: number, offset: number) {
  const data = Buffer.alloc(size);
  let done = 0;
  while (done < size) {
    const { bytesRead } = await file.read(data, done, size - done, offset + done);
    if (!bytesRead) throw new Error("Truncated terrain pack");
    done += bytesRead;
  }
  return data;
}

export async function openDemPack(path: string) {
  const file = await open(path, "r");
  try {
    const header = await readExactly(file, 12, 0);
    if (header.toString("ascii", 0, 8) !== "MUMUDEM1") throw new Error("Invalid terrain pack");
    const size = header.readUInt32LE(8);
    if (size < 2 || size > 16 * 1024 * 1024) throw new Error("Invalid terrain index size");
    const manifest = demManifestSchema.parse(JSON.parse((await readExactly(file, size, 12)).toString()));
    const start = 12 + size, bytes = (await file.stat()).size;
    if (!Object.keys(manifest.tiles).length) throw new Error("Empty terrain pack");
    for (const [key, [offset, length]] of Object.entries(manifest.tiles)) {
      const [z, x, y] = key.split("/").map(Number);
      if (x >= 2 ** z || y >= 2 ** z || start + offset + length > bytes) throw new Error("Invalid terrain tile range");
    }
    return { file, manifest, start };
  } catch (error) { await file.close(); throw error; }
}
type Pack = Awaited<ReturnType<typeof openDemPack>>;

export async function readDemTile(pack: Pack, z: number, x: number, y: number) {
  if (![z, x, y].every(Number.isInteger) || z < pack.manifest.minZoom || z > 12 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return null;
  // Outside detailed patches, retain the actual national DEM resolution.
  // Nearest-neighbour RGB resampling preserves the packed height encoding.
  for (let parent = z; parent >= pack.manifest.minZoom; parent--) {
    const factor = 2 ** (z - parent);
    if (factor > 256) return null;
    const entry = pack.manifest.tiles[`${parent}/${Math.floor(x / factor)}/${Math.floor(y / factor)}`];
    if (!entry) continue;
    const [offset, length, digest] = entry;
    const data = await readExactly(pack.file, length, pack.start + offset);
    if (createHash("sha256").update(data).digest("hex") !== digest) throw new Error("Damaged terrain tile");
    if (parent === z) return { data, sourceZoom: parent };
    const width = 256 / factor;
    const result = await sharp(data, { limitInputPixels: 256 * 256 }).extract({ left: x % factor * width, top: y % factor * width, width, height: width })
      .resize(256, 256, { kernel: "nearest" }).png().toBuffer();
    return { data: result, sourceZoom: parent };
  }
  return null;
}

export function registerNatureDemApi(app: FastifyInstance, dataDir: string) {
  let pending: Promise<Pack> | undefined;
  const cache = new Map<string, Promise<Awaited<ReturnType<typeof readDemTile>>>>();
  const getPack = () => {
    if (!pending) { pending = openDemPack(resolve(dataDir, "cache/nature-maps/china-terrain.v1.pack")); pending.catch(() => { pending = undefined; }); }
    return pending;
  };
  app.addHook("onClose", async () => { if (pending) await (await pending.catch(() => null))?.file.close(); });
  app.get("/api/nature/terrain/china", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      const { tiles: _tiles, ...metadata } = (await getPack()).manifest;
      return { available: true, ...metadata };
    } catch {
      return { available: false, message: "中国精细地形包尚未就绪，当前仍可查看全球地形。" };
    }
  });
  app.get("/api/nature/terrain/china/:z/:x/:y.png", async (req, reply) => {
    const parsed = z.object({ z: z.coerce.number().int().min(0).max(12), x: z.coerce.number().int().min(0).max(4095), y: z.coerce.number().int().min(0).max(4095) }).safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "地形位置无效。" });
    const { z: zoom, x, y } = parsed.data;
    if (x >= 2 ** zoom || y >= 2 ** zoom) return reply.code(400).send({ error: "地形位置无效。" });
    try {
      const pack = await getPack(), key = `${zoom}/${x}/${y}`;
      let tile = cache.get(key);
      if (!tile) {
        tile = readDemTile(pack, zoom, x, y); cache.set(key, tile);
        tile.catch(() => cache.delete(key));
        if (cache.size > 128) cache.delete(cache.keys().next().value!);
      }
      const result = await tile;
      if (!result) return reply.code(404).send({ error: "此处未安装地形数据。" });
      return reply.header("Cache-Control", "private, max-age=3600").header("X-Terrain-Source-Zoom", result.sourceZoom).type("image/png").send(result.data);
    } catch { return reply.code(503).send({ error: "精细地形暂时无法读取，请重试。" }); }
  });
}
