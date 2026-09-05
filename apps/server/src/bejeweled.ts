import { randomBytes, randomUUID } from "node:crypto";
import { copyFile, chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { COLORS, createGame, emptyCounts, findMove, findRuns, playMove, type Game, type MoveResult } from "./bejeweled-engine.js";
import { calculateGemRewards, type BejeweledWallets, type GemReward } from "./bejeweled-rewards.js";

const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const gemSchema = z.object({
  id: integer,
  color: z.enum(COLORS),
  special: z.enum(["normal", "flame", "star", "cube", "nova"]),
}).strict();
const gameSchema = z.object({
  board: z.array(gemSchema).length(64),
  seed: z.number().int().min(0).max(4294967295),
  nextId: integer,
  mode: z.enum(["endless", "classic"]),
  status: z.enum(["playing", "finished"]),
  score: integer, cleared: integer, moves: integer, level: integer.min(1),
}).strict().superRefine((game, context) => {
  if (new Set(game.board.map(gem => gem.id)).size !== 64
    || game.board.some(gem => gem.id >= game.nextId)
    || findRuns(game.board).length
    || game.level !== 1 + Math.floor(game.cleared / 100)
    || (game.status === "playing" && !findMove(game.board))
    || (game.status === "finished" && (game.mode !== "classic" || findMove(game.board)))) {
    context.addIssue({ code: "custom", message: "棋盘记录不完整。" });
  }
});
const legacyStateSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.literal("game-bejeweled"),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  revision: integer,
  lastOperationId: z.string().uuid().nullable(),
  game: gameSchema,
  totalScore: integer, totalCleared: integer, totalMoves: integer,
  counts: z.object({ red: integer, orange: integer, yellow: integer, green: integer, blue: integer, purple: integer, white: integer }).strict(),
  bestScore: integer,
  longestCascade: integer,
}).strict().superRefine((state, context) => {
  if (Object.values(state.counts).reduce((a, b) => a + b, 0) !== state.totalCleared
    || state.game.score > state.totalScore || state.game.cleared > state.totalCleared
    || state.game.moves > state.totalMoves || state.bestScore < state.game.score) {
    context.addIssue({ code: "custom", message: "累计统计不一致。" });
  }
});
export type BejeweledState = z.infer<typeof bejeweledStateSchema>;
const rewardSchema = z.object({ knowledge: integer, energy: integer }).strict();
export const bejeweledStateSchema = z.object({
  ...legacyStateSchema.shape, schemaVersion: z.literal(2),
  rewardTotals: rewardSchema, lastReward: rewardSchema,
  rewardStatus: z.enum(["pending", "settled"]),
}).strict().superRefine((state, context) => {
  const { rewardTotals, lastReward, rewardStatus: _status, ...old } = state;
  if (!legacyStateSchema.safeParse({ ...old, schemaVersion: 1 }).success
    || lastReward.knowledge > rewardTotals.knowledge || lastReward.energy > rewardTotals.energy) {
    context.addIssue({ code: "custom", message: "宝石奖励或统计不一致。" });
  }
});
export function migrateBejeweled(raw: unknown): BejeweledState {
  if ((raw as { schemaVersion?: number } | null)?.schemaVersion === 1) {
    return bejeweledStateSchema.parse({ ...legacyStateSchema.parse(raw), schemaVersion: 2,
      rewardTotals: { knowledge: 0, energy: 0 }, lastReward: { knowledge: 0, energy: 0 }, rewardStatus: "settled" });
  }
  return bejeweledStateSchema.parse(raw);
}
const base = { operationId: z.string().uuid(), revision: integer };
const commandSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("swap"), a: z.number().int().min(0).max(63), b: z.number().int().min(0).max(63) }).strict(),
  z.object({ ...base, type: z.literal("new"), mode: z.enum(["endless", "classic"]) }).strict(),
]);
export type BejeweledCommand = z.infer<typeof commandSchema>;
export type BejeweledResponse = { state: BejeweledState; move: MoveResult | null; replayed?: boolean; balances: GemReward };

function newState(): BejeweledState {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2, id: "game-bejeweled", createdAt: now, updatedAt: now,
    rewardTotals: { knowledge: 0, energy: 0 }, lastReward: { knowledge: 0, energy: 0 }, rewardStatus: "settled",
    revision: 0, lastOperationId: null, game: createGame(randomBytes(4).readUInt32LE()) as BejeweledState["game"],
    totalScore: 0, totalCleared: 0, totalMoves: 0, counts: emptyCounts(), bestScore: 0, longestCascade: 0,
  };
}
export function registerBejeweledApi(app: FastifyInstance, dataDir: string, wallets: BejeweledWallets) {
  const path = resolve(dataDir, "learning/games/bejeweled-state.json");
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(action: () => Promise<T>): Promise<T> {
    const next = tail.then(action, action);
    tail = next.catch(() => undefined);
    return next;
  }
  async function write(state: BejeweledState) {
    const checked = bejeweledStateSchema.parse(state);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try {
      const raw = JSON.parse(await readFile(path, "utf8"));
      if (raw.schemaVersion === 1) {
        await copyFile(path, path + ".v1.bak", constants.COPYFILE_EXCL).catch(error => {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        });
        await chmod(path + ".v1.bak", 0o600);
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const temporary = path + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temporary, JSON.stringify(checked), { mode: 0o600, flag: "wx" });
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
  async function read(): Promise<BejeweledState> {
    try {
      return migrateBejeweled(JSON.parse(await readFile(path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const state = newState();
      await write(state);
      return state;
    }
  }
  async function settle(state: BejeweledState): Promise<GemReward> {
    // Credit cumulative entitlements through the existing wallet queues. Each
    // wallet saves its cursor with its balance, so a crash between them is safe.
    const knowledge = await wallets.knowledge(state.rewardTotals.knowledge);
    const energy = await wallets.energy(state.rewardTotals.energy);
    if (state.rewardStatus === "pending") {
      state.rewardStatus = "settled";
      await write(state);
    }
    return { knowledge: knowledge.balance, energy: energy.balance };
  }
  app.addHook("onReady", async () => {
    await serial(async () => {
      const state = migrateBejeweled(JSON.parse(await readFile(path, "utf8")));
      if (state.rewardStatus === "pending") await settle(state);
    }).catch(() => undefined);
  });
  app.get("/api/games/bejeweled", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    try { return await serial(async () => { const state = await read(); return { ...state, balances: await settle(state) }; }); }
    catch { return reply.code(503).send({ message: "暂时无法读取宝石进度，请检查本机数据文件或稍后重试。已有文件不会被覆盖。" }); }
  });
  app.post("/api/games/bejeweled", async (request, reply) => {
    const parsed = commandSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "这一步的内容不完整，请重新打开棋盘。" });
    try {
      return await serial(async () => {
        const command = parsed.data;
        const current = await read();
        const balances = await settle(current);
        if (current.lastOperationId === command.operationId) return { state: current, move: null, replayed: true, balances };
        if (current.revision !== command.revision) return reply.code(409).send({ message: "另一页面已经更新进度，请恢复最新棋盘。", state: current, balances });
        const state = structuredClone(current);
        let move: MoveResult | null = null;
        if (command.type === "swap") {
          move = playMove(state.game as Game, command.a, command.b);
          if (!move) return reply.code(422).send({ message: "试着交换相邻宝石，让三个同色宝石排成一线。" });
          state.game = move.game as BejeweledState["game"];
          state.totalScore += move.points;
          state.totalCleared += move.cleared;
          state.totalMoves++;
          for (const color of COLORS) state.counts[color] += move.counts[color];
          state.bestScore = Math.max(state.bestScore, state.game.score);
          state.longestCascade = Math.max(state.longestCascade, move.longestCascade);
          state.lastReward = calculateGemRewards(move);
          state.rewardTotals.knowledge += state.lastReward.knowledge;
          state.rewardTotals.energy += state.lastReward.energy;
          state.rewardStatus = "pending";
        } else {
          state.game = createGame(randomBytes(4).readUInt32LE(), command.mode) as BejeweledState["game"];
          state.lastReward = { knowledge: 0, energy: 0 };
        }
        state.revision++;
        state.lastOperationId = command.operationId;
        state.updatedAt = new Date().toISOString();
        await write(state);
        return { state, move, balances: await settle(state) } satisfies BejeweledResponse;
      });
    } catch {
      return reply.code(503).send({ message: "这一步尚未确认保存，请保留页面并点击重试。累计成绩不会重复增加。" });
    }
  });
}
