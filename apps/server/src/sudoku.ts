import { randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LEVELS, THEME_IDS, act, makeGame, publicGame, rewardForLevel, solve, type Game } from "./sudoku-engine.js";

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const level = z.number().int().min(0).max(5);
const stamp = z.string().datetime();
const cellSchema = z.object({ value: integer.max(9), crossed: z.array(integer.min(1).max(9)).max(9), noted: z.boolean() }).strict();
const gameSchema = z.object({
  id: z.string().uuid(), level, theme: z.enum(THEME_IDS), seed: integer.max(0xffffffff),
  algorithm: z.enum(["随机回溯", "结构置换"]),
  createdAt: stamp, updatedAt: stamp, completedAt: stamp.nullable(),
  given: z.array(integer.max(9)).min(16).max(81), solution: z.array(integer.min(1).max(9)).min(16).max(81),
  cells: z.array(cellSchema).min(16).max(81), undo: z.array(z.array(cellSchema).min(16).max(81)).max(200), hints: integer,
  story: z.object({ title: z.string().min(1).max(100), teaser: z.string().max(200), rows: z.array(z.array(z.string().min(1).max(200)).min(4).max(9)).min(4).max(9) }).strict(),
}).strict().superRefine((game, context) => {
  const spec = LEVELS[game.level], n = spec.n;
  const validCells = (cells: typeof game.cells) => cells.length === n * n && cells.every((cell, i) =>
    cell.value <= n && (!game.given[i] || cell.value === game.given[i])
    && new Set(cell.crossed).size === cell.crossed.length && cell.crossed.every(v => v <= n));
  const solved = solve(game.given, spec);
  if (game.given.length !== n * n || game.solution.length !== n * n
    || game.given.filter(Boolean).length !== spec.clues || solved.count !== 1
    || !solved.first?.every((v, i) => v === game.solution[i])
    || !validCells(game.cells) || !game.undo.every(validCells)
    || game.story.rows.length !== n || game.story.rows.some(row => row.length !== n)
    || (game.completedAt !== null) !== game.cells.every((cell, i) => cell.value === game.solution[i])) {
    context.addIssue({ code: "custom", message: "数独棋盘记录不完整" });
  }
});
const completionSchema = z.object({
  id: z.string().uuid(), level, theme: z.enum(THEME_IDS), title: z.string().min(1).max(100),
  createdAt: stamp, updatedAt: stamp, completedAt: stamp, amount: integer,
  rewardStatus: z.enum(["pending", "granted"]),
}).strict().refine(record => record.amount === rewardForLevel(record.level), "奖励与难度不一致");
export const sudokuStateSchema = z.object({
  schemaVersion: z.literal(1), id: z.literal("game-sudoku"), createdAt: stamp, updatedAt: stamp,
  revision: integer, game: gameSchema.nullable(), history: z.array(completionSchema).max(100_000),
  receipts: z.array(z.object({ operationId: z.string().uuid(), command: z.string().max(1000) }).strict()).max(200),
}).strict().superRefine((state, context) => {
  const current = state.game && state.history.find(record => record.id === state.game!.id);
  if (new Set(state.history.map(record => record.id)).size !== state.history.length
    || new Set(state.receipts.map(receipt => receipt.operationId)).size !== state.receipts.length
    || Boolean(state.game?.completedAt) !== Boolean(current)
    || (current && (current.level !== state.game!.level || current.theme !== state.game!.theme))) {
    context.addIssue({ code: "custom", message: "通关记录与棋盘不一致" });
  }
});
export type SudokuState = z.infer<typeof sudokuStateSchema>;
export function parseSudokuState(raw: unknown): SudokuState {
  // First formal schema; never import the temporary prototype's local wallet.
  return sudokuStateSchema.parse(raw);
}
export function emptySudokuState(): SudokuState {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id: "game-sudoku", createdAt: now, updatedAt: now, revision: 0, game: null, history: [], receipts: [] };
}
const base = { operationId: z.string().uuid(), revision: integer };
const target = { ...base, gameId: z.string().uuid() };
const index = integer.max(80);
export const sudokuCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("new"), level, theme: z.enum(THEME_IDS) }).strict(),
  z.object({ ...target, type: z.literal("set"), index, value: integer.min(1).max(9) }).strict(),
  z.object({ ...target, type: z.literal("cross"), index, value: integer.min(1).max(9) }).strict(),
  z.object({ ...target, type: z.literal("note"), index }).strict(),
  z.object({ ...target, type: z.literal("clear"), index }).strict(),
  z.object({ ...target, type: z.literal("hint"), index }).strict(),
  z.object({ ...target, type: z.literal("undo") }).strict(),
]);
export type SudokuCommand = z.infer<typeof sudokuCommandSchema>;
export type SudokuWallets = {
  knowledge: (id: string, difficulty: number) => Promise<{ balance: number; updatedAt: string }>;
  energy: (id: string, difficulty: number) => Promise<{ balance: number; updatedAt: string }>;
};
export type SudokuSettlement = { eventId: string; amount: number; knowledgeBalance: number; energyBalance: number; updatedAt: string };
function view(state: SudokuState, message = "", settlement: SudokuSettlement | null = null, hintValues?: number[]) {
  const record = state.history.find(item => item.id === state.game?.id);
  return {
    schemaVersion: 1 as const, revision: state.revision, game: publicGame(state.game),
    history: state.history.slice(-30).reverse(), completedCount: state.history.length,
    pendingRewards: state.history.filter(item => item.rewardStatus === "pending").length,
    reward: record ? { amount: record.amount, status: record.rewardStatus } : null,
    message, settlement, ...(hintValues ? { hintValues } : {}),
  };
}
export type SudokuView = ReturnType<typeof view>;
class ActionError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function writeSudokuState(path: string, state: SudokuState) {
  const checked = sudokuStateSchema.parse(state);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, JSON.stringify(checked), { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(() => undefined); }
}
export function registerSudokuApi(app: FastifyInstance, dataDir: string, wallets: SudokuWallets,
  writer: typeof writeSudokuState = writeSudokuState) {
  const path = resolve(dataDir, "learning/games/sudoku-state.json");
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(action: () => Promise<T>) {
    const next = queue.then(action, action); queue = next.catch(() => undefined); return next;
  }
  async function read() {
    try { return parseSudokuState(JSON.parse(await readFile(path, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptySudokuState(); throw error; }
  }
  async function recover(initial: SudokuState) {
    let state = initial, settlement: SudokuSettlement | null = null;
    for (const record of initial.history.filter(item => item.rewardStatus === "pending")) {
      try {
        const knowledge = await wallets.knowledge(record.id, record.level + 1);
        const energy = await wallets.energy(record.id, record.level + 1);
        const next = structuredClone(state), item = next.history.find(item => item.id === record.id)!;
        item.rewardStatus = "granted"; item.updatedAt = next.updatedAt = new Date().toISOString();
        await writer(path, next);
        state = next;
        settlement = { eventId: item.id, amount: item.amount, knowledgeBalance: knowledge.balance, energyBalance: energy.balance, updatedAt: knowledge.updatedAt };
      } catch { /* The saved entitlement and wallet receipts allow a later retry. */ }
    }
    return { state, settlement };
  }
  app.addHook("onReady", () => serial(async () => { await recover(await read()); }).catch(() => undefined));
  app.get("/api/games/sudoku", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    try { const result = await serial(async () => recover(await read())); return view(result.state, "", result.settlement); }
    catch { return reply.code(503).send({ message: "暂时无法读取数独进度，原文件已保留，请稍后重试。" }); }
  });
  app.post("/api/games/sudoku", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = sudokuCommandSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "这一步的信息不完整，请重新选择格子。" });
    try {
      return await serial(async () => {
        const command = parsed.data, fingerprint = JSON.stringify(command);
        const restored = await recover(await read()), current = restored.state;
        const receipt = current.receipts.find(receipt => receipt.operationId === command.operationId);
        if (receipt) {
          if (receipt.command !== fingerprint) throw new ActionError(409, "同一次操作的内容发生了变化，请恢复最新棋盘。");
          return view(current, "这一步已保存", restored.settlement);
        }
        if (current.revision !== command.revision) throw new ActionError(409, "另一页面更新了进度，请恢复最新棋盘后继续。");
        const next = structuredClone(current), now = new Date().toISOString();
        let message = "新故事准备好了，点一个空格开始吧";
        if (command.type === "new") next.game = makeGame(command.level, command.theme, randomInt(0x100000000), randomUUID(), now);
        else {
          if (!next.game || next.game.id !== command.gameId) throw new ActionError(409, "这局已经更换，请恢复最新棋盘。");
          let result;
          try { result = act(next.game as Game, command); }
          catch (error) { throw new ActionError(422, error instanceof Error ? error.message : "请选择一个可以填写的格子"); }
          if (command.type === "hint") return view(current, result.message, restored.settlement, result.hintValues);
          if (next.game.completedAt) return view(current, result.message, restored.settlement);
          message = result.message; next.game.updatedAt = now;
          if (result.completed) {
            next.game.completedAt = now;
            next.history.push({ id: next.game.id, level: next.game.level, theme: next.game.theme, title: next.game.story.title,
              createdAt: now, updatedAt: now, completedAt: now, amount: rewardForLevel(next.game.level), rewardStatus: "pending" });
            message = "整本故事拼好啦！";
          }
        }
        next.updatedAt = now; next.revision++;
        next.receipts.push({ operationId: command.operationId, command: fingerprint }); next.receipts = next.receipts.slice(-200);
        // Save the verified completion before either wallet is credited.
        await writer(path, next);
        const result = await recover(next);
        return view(result.state, message, result.settlement ?? restored.settlement);
      });
    } catch (error) {
      return reply.code(error instanceof ActionError ? error.status : 503).send({
        message: error instanceof ActionError ? error.message : "这一步暂时没有确认保存，请保留页面并重试。进度和奖励不会重复增加。",
      });
    }
  });
}
