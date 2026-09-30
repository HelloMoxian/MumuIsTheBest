import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { parseMusicLibrary, parseMusicState, type MusicState } from "./metronome-contract.js";

export function registerMetronomeApi(app: FastifyInstance, appDataDir: string) {
  const destination = resolve(appDataDir, "creative/metronome-library.json");
  let queue: Promise<unknown> = Promise.resolve();
  async function read(): Promise<{ state: MusicState; legacySource: string | null } | null> {
    try {
      const original = await readFile(destination, "utf8"), raw = JSON.parse(original);
      const state = parseMusicState(raw);
      if (!state) throw new Error("INVALID_MUSIC_FILE");
      return { state, legacySource: raw.library.schemaVersion === 1 ? original : null };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async function preserveLegacy(original: string) {
    // A content-specific recovery point also preserves a later restored v1 file.
    const backup = destination + ".v1." + createHash("sha256").update(original).digest("hex") + ".bak";
    const temporary = backup + "." + randomUUID() + ".tmp";
    try {
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(original); await handle.sync(); }
      finally { await handle.close(); }
      try { await link(temporary, backup); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || await readFile(backup, "utf8") !== original) throw error;
      }
    } finally { await rm(temporary, { force: true }).catch(() => undefined); }
  }
  app.get("/api/metronome", async (_request, reply) => {
    try { return { state: (await read())?.state ?? null }; }
    catch { return reply.code(500).send({ code: "READ_FAILED", message: "作品暂时无法读取，原文件已保留。请重试。" }); }
  });
  app.put("/api/metronome", { bodyLimit: 4 * 1024 * 1024 }, async (request, reply) => {
    const body = request.body as { library?: unknown; expectedRevision?: unknown } | null;
    const library = parseMusicLibrary(body?.library);
    const revision = body?.expectedRevision;
    if (!library || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
      return reply.code(400).send({ code: "INVALID_MUSIC", message: "作品内容不完整，因此没有保存。" });
    }
    const operation = queue.catch(() => undefined).then(async () => {
      const stored = await read(), current = stored?.state;
      if ((current?.revision ?? 0) !== revision) return null;
      const now = new Date().toISOString();
      const state: MusicState = {
        schemaVersion: 1, id: "metronome-library", createdAt: current?.createdAt ?? now,
        updatedAt: now, revision: revision + 1, library,
      };
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      if (stored?.legacySource) await preserveLegacy(stored.legacySource);
      const temporary = destination + "." + randomUUID() + ".tmp";
      try {
        const handle = await open(temporary, "wx", 0o600);
        try { await handle.writeFile(JSON.stringify(state) + "\n"); await handle.sync(); }
        finally { await handle.close(); }
        await rename(temporary, destination);
      } finally { await rm(temporary, { force: true }).catch(() => undefined); }
      return state;
    });
    queue = operation;
    try {
      const state = await operation;
      if (!state) return reply.code(409).send({ code: "CONFLICT", message: "另一个窗口更新了作品。请先下载这份作品，再重新打开。" });
      return { state };
    } catch { return reply.code(500).send({ code: "WRITE_FAILED", message: "作品还未保存，当前编辑已保留。请重试。" }); }
  });
}
