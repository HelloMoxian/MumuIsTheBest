import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DEFAULT_MOVES, makePlan, validPlan, validPool, WORKOUT_MS, WORKOUT_REWARD, type MoveId } from "./workout-contract.js";

const poolSchema = z.custom<MoveId[]>(validPool);
const stageSchema = z.object({
  kind: z.enum(["warmup", "move", "rest", "cooldown"]),
  move: z.custom<MoveId>(value => validPool([value])),
  durationMs: z.number().int().positive().max(40_000), round: z.number().int().min(0).max(7),
}).strict();
const sessionSchema = z.object({
  id: z.string().uuid(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  plan: z.array(stageSchema).length(14).refine(validPlan),
  elapsedMs: z.number().int().min(0).max(WORKOUT_MS),
}).strict();
export const workoutSchema = z.object({
  schemaVersion: z.literal(1), stableId: z.literal("kids-workout"),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  enabledMoves: poolSchema, sessions: z.array(sessionSchema).max(100_000),
}).strict().refine(data => new Set(data.sessions.map(s => s.id)).size === data.sessions.length);
export function emptyWorkout(now = Date.now()) {
  return workoutSchema.parse({
    schemaVersion: 1, stableId: "kids-workout", createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(), enabledMoves: [...DEFAULT_MOVES], sessions: [],
  });
}
type Wallet = (total: number) => Promise<{ balance: number; updatedAt: string }>;
export function registerWorkoutApi(app: FastifyInstance, dataDir: string, credit: Wallet, now = Date.now) {
  const path = resolve(dataDir, "learning/games/workout.json");
  let queue: Promise<unknown> = Promise.resolve();
  function serialized<T>(fn: () => Promise<T>) {
    const next = queue.catch(() => undefined).then(fn); queue = next; return next;
  }
  async function read() {
    try { return workoutSchema.parse(JSON.parse(await readFile(path, "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyWorkout(now());
      throw error; // Never overwrite an invalid or newer file.
    }
  }
  async function save(raw: z.infer<typeof workoutSchema>) {
    const data = workoutSchema.parse(raw);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temp = path + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temp, JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      await rename(temp, path);
    } finally { await unlink(temp).catch(() => undefined); }
  }
  const totalFor = (data: z.infer<typeof workoutSchema>) =>
    data.sessions.filter(s => s.elapsedMs === WORKOUT_MS).length * WORKOUT_REWARD;
  const unavailable = { message: "运动记录暂时没有保存好，请稍后重试；原记录会保留。" };
  // The saved completion count is a durable outbox; the wallet cursor makes recovery idempotent.
  app.addHook("onReady", async () => {
    await serialized(async () => { const data = await read(); if (totalFor(data)) await credit(totalFor(data)); }).catch(() => undefined);
  });
  app.get("/api/games/workout/preferences", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    try { return await serialized(async () => ({ enabledMoves: (await read()).enabledMoves })); }
    catch { return reply.code(503).send(unavailable); }
  });
  app.put("/api/games/workout/preferences", async (req, reply) => {
    const parsed = z.object({ enabledMoves: poolSchema }).strict().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ message: "请至少保留一个动作。" });
    try {
      return await serialized(async () => {
        const data = await read();
        data.enabledMoves = parsed.data.enabledMoves; data.updatedAt = new Date(now()).toISOString();
        await save(data); return { enabledMoves: data.enabledMoves };
      });
    } catch { return reply.code(503).send(unavailable); }
  });
  app.post("/api/games/workout/sessions", async (req, reply) => {
    const parsed = z.object({ id: z.string().uuid() }).strict().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ message: "课程编号无效，请刷新课程。" });
    try {
      return await serialized(async () => {
        const data = await read();
        let session = data.sessions.find(s => s.id === parsed.data.id);
        if (!session) {
          const time = new Date(now()).toISOString();
          session = { id: parsed.data.id, createdAt: time, updatedAt: time, elapsedMs: 0, plan: makePlan(data.enabledMoves) };
          // Only abandon old unfinished sessions; reward entitlements are never pruned.
          data.sessions = data.sessions.filter(s => s.elapsedMs === WORKOUT_MS || now() - Date.parse(s.createdAt) < 86_400_000);
          data.sessions.push(session); data.updatedAt = time; await save(data);
        }
        return { session, enabledMoves: data.enabledMoves };
      });
    } catch { return reply.code(503).send(unavailable); }
  });
  app.put("/api/games/workout/sessions/:id", async (req, reply) => {
    const id = z.object({ id: z.string().uuid() }).safeParse(req.params);
    const input = z.object({ elapsedMs: z.number().int().min(0).max(WORKOUT_MS) }).strict().safeParse(req.body);
    if (!id.success || !input.success) return reply.code(400).send({ message: "运动进度格式不正确。" });
    try {
      const result = await serialized(async () => {
        const data = await read(), session = data.sessions.find(s => s.id === id.data.id);
        if (!session) return null;
        if (input.data.elapsedMs > now() - Date.parse(session.createdAt))
          return { tooEarly: true as const };
        // Older/retried requests cannot rewind a session.
        if (input.data.elapsedMs > session.elapsedMs) {
          session.elapsedMs = input.data.elapsedMs;
          session.updatedAt = data.updatedAt = new Date(now()).toISOString();
          await save(data); // Entitlement must exist before any wallet mutation.
        }
        const complete = session.elapsedMs === WORKOUT_MS;
        const wallet = complete ? await credit(totalFor(data)) : undefined;
        return { elapsedMs: session.elapsedMs, reward: complete ? WORKOUT_REWARD : 0, balance: wallet?.balance };
      });
      if (!result) return reply.code(404).send({ message: "找不到这节课程，请刷新重开。" });
      if ("tooEarly" in result) return reply.code(409).send({ message: "课程仍在进行，稍后再保存进度。" });
      return result;
    } catch { return reply.code(503).send(unavailable); }
  });
}
