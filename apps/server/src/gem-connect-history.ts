import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const PAIRS = [30, 36, 42, 48, 54, 60, 70, 77, 84, 90];
const LEGACY_PAIRS = [6, 8, 10, 12, 15, 18, 21, 24, 27, 30];
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const fields = {
  id: z.string().uuid(), level: z.number().int().min(1).max(10),
  durationMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  hints: count, shuffles: count, pairCount: z.number().int(),
};
export const completionSchema = z.object({ ...fields, rulesVersion: z.literal(2) }).strict()
  .refine(value => value.pairCount === PAIRS[value.level - 1], "通关宝石数量不符合关卡");
const legacyEntry = z.object({
  ...fields, createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict().refine(value => value.pairCount === LEGACY_PAIRS[value.level - 1], "旧版数量不正确");
const entrySchema = z.object({
  ...fields, rulesVersion: z.union([z.literal(1), z.literal(2)]),
  rewardStatus: z.enum(["legacy", "pending", "granted"]),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict().refine(value =>
  value.pairCount === (value.rulesVersion === 1 ? LEGACY_PAIRS : PAIRS)[value.level - 1]
  && (value.rulesVersion === 1 ? value.rewardStatus === "legacy" : value.rewardStatus !== "legacy"), "版本与关卡不一致");
const historyFields = {
  stableId: z.literal("gem-connect-history"),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
};
const legacyHistorySchema = z.object({ ...historyFields, schemaVersion: z.literal(1), records: z.array(legacyEntry) }).strict();
export const historySchema = z.object({
  ...historyFields, schemaVersion: z.literal(2), records: z.array(entrySchema),
}).strict().refine(value => new Set(value.records.map(record => record.id)).size === value.records.length, "重复通关 ID");
export type GemHistory = z.infer<typeof historySchema>;
export type GemWallets = {
  knowledge: (id: string, level: number) => Promise<{ balance: number; updatedAt: string }>;
  energy: (id: string, level: number) => Promise<{ balance: number; updatedAt: string }>;
};
export function migrateHistory(raw: unknown): GemHistory {
  if ((raw as { schemaVersion?: number } | null)?.schemaVersion === 1) {
    const legacy = legacyHistorySchema.parse(raw);
    return historySchema.parse({ ...legacy, schemaVersion: 2,
      records: legacy.records.map(record => ({ ...record, rulesVersion: 1, rewardStatus: "legacy" })) });
  }
  return historySchema.parse(raw);
}
export function emptyHistory(): GemHistory {
  const now = new Date().toISOString();
  return { schemaVersion: 2, stableId: "gem-connect-history", createdAt: now, updatedAt: now, records: [] };
}
export function registerGemConnectHistoryApi(app: FastifyInstance, dataDir: string, wallets: GemWallets) {
  const path = resolve(dataDir, "learning/games/gem-connect-history.json");
  let queue: Promise<unknown> = Promise.resolve();
  async function read() {
    try { return migrateHistory(JSON.parse(await readFile(path, "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHistory();
      throw error;
    }
  }
  async function save(history: GemHistory) {
    const valid = historySchema.parse(history);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    // A private, byte-for-byte v1 recovery point before the first version-changing write.
    try {
      const original = await readFile(path, "utf8");
      if (JSON.parse(original).schemaVersion === 1) {
        const backupTemp = path + "." + randomUUID() + ".backup.tmp";
        try {
          await writeFile(backupTemp, original, { flag: "wx", mode: 0o600 });
          await link(backupTemp, path + ".v1.bak").catch(error => {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          });
        } finally { await unlink(backupTemp).catch(() => undefined); }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const temp = path + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temp, JSON.stringify(valid, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      await rename(temp, path);
    } finally { await unlink(temp).catch(() => undefined); }
  }
  type Settlement = { eventId: string; level: number; amount: number; knowledgeBalance: number; energyBalance: number; updatedAt: string };
  async function settle(history: GemHistory, id: string): Promise<Settlement> {
    const record = history.records.find(item => item.id === id)!;
    const knowledge = await wallets.knowledge(id, record.level);
    const energy = await wallets.energy(id, record.level);
    if (record.rewardStatus !== "granted") {
      record.rewardStatus = "granted";
      record.updatedAt = history.updatedAt = new Date().toISOString();
      await save(history);
    }
    return { eventId: id, level: record.level, amount: record.level * 10,
      knowledgeBalance: knowledge.balance, energyBalance: energy.balance, updatedAt: knowledge.updatedAt };
  }
  function serialized<T>(operation: () => Promise<T>) {
    const next = queue.catch(() => undefined).then(operation);
    queue = next;
    return next;
  }
  // Durable outbox: recover even if the browser left after one wallet was credited.
  async function recover() {
    const history = await read();
    for (const record of history.records) {
      if (record.rewardStatus === "pending") {
        try { await settle(history, record.id); }
        catch { record.rewardStatus = "pending"; }
      }
    }
    return history;
  }
  app.addHook("onReady", async () => { await serialized(recover).catch(() => undefined); });
  app.get("/api/games/gem-connect/history", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    try { return await serialized(recover); }
    catch { return reply.code(503).send({ message: "暂时读不到星光记录，原记录已保留，请稍后重试。" }); }
  });
  app.post("/api/games/gem-connect/history", async (request, reply) => {
    const input = completionSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ message: "这份通关记录格式不正确。" });
    try {
      const result = await serialized(async () => {
        const history = await read();
        const existing = history.records.find(record => record.id === input.data.id);
        if (existing && !Object.entries(input.data).every(([key, value]) => existing[key as keyof typeof existing] === value)) return null;
        if (!existing) {
          const now = new Date().toISOString();
          history.updatedAt = now;
          history.records.push({ ...input.data, rewardStatus: "pending", createdAt: now, updatedAt: now });
          // Save entitlement before crediting either wallet.
          await save(history);
        }
        const settlement = await settle(history, input.data.id);
        return { ...history, settlement };
      });
      if (!result) return reply.code(409).send({ message: "这条记录已保存，请不要更改同一次通关。" });
      return result;
    } catch { return reply.code(503).send({ message: "通关啦！奖励和记录正在途中，可以继续玩，稍后重试。" }); }
  });
}
