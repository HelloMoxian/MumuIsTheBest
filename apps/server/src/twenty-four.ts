import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { editorFromBoard, emptyEditor, isEditor, isLegacyEditor, normalizeEditor, parseEditor, type EquationEditor, type LegacyEditor } from "./twenty-four-editor.js";
import { generatePuzzle, bracketDepth, singleLayerSolution, initialBoard, isExpression, isSolved, mergeBoard, rewardForTime, validBoard, OPERATORS, type Expression } from "./twenty-four-engine.js";

const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const stamp = z.string().datetime();
const expression = z.custom<Expression>(isExpression, "算式结构不完整");
const cardsSchema = z.array(integer.max(13)).length(8);
const boardSchema = z.array(expression).min(2).max(8);
const editorSchema = z.custom<EquationEditor>(isEditor, "四格算式信息不完整");
const storedEditorSchema = z.union([editorSchema, z.custom<LegacyEditor>(isLegacyEditor)]);
const gameSchema = z.object({
  id: z.string().uuid(), createdAt: stamp, updatedAt: stamp, cards: cardsSchema,
  solution: expression, board: boardSchema, undo: z.array(boardSchema).max(100),
  elapsedMs: integer, runningSince: integer.nullable(), assisted: z.boolean(),
  completedAt: stamp.nullable(),
  editor: storedEditorSchema.nullable().default(null), editorUndo: z.array(storedEditorSchema).max(100).default([]),
  legacyEditor: z.custom<LegacyEditor>(isLegacyEditor).nullable().default(null),
}).strict().superRefine((game, ctx) => {
  if (!isSolved(game.solution, game.cards) || !validBoard(game.board, game.cards)
    || !game.undo.every(board => validBoard(board, game.cards) && !board.some(node => isSolved(node, game.cards)))
    || Boolean(game.completedAt) !== game.board.some(node => isSolved(node, game.cards))
    || (game.completedAt && game.runningSince !== null)) {
    ctx.addIssue({ code: "custom", message: "题目与算式记录不一致" });
  }
});
const historySchema = z.object({
  id: z.string().uuid(), createdAt: stamp, updatedAt: stamp, completedAt: stamp,
  cards: cardsSchema, expression, elapsedMs: integer, assisted: z.boolean(),
  amount: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(30), z.literal(40)]),
  rewardStatus: z.enum(["pending", "granted"]),
}).strict().refine(record => isSolved(record.expression, record.cards)
  && record.amount === rewardForTime(record.elapsedMs, record.assisted), "完成记录不一致");
export const twentyFourStateSchema = z.object({
  schemaVersion: z.literal(1), id: z.literal("math-twenty-four"), createdAt: stamp, updatedAt: stamp,
  revision: integer, game: gameSchema.nullable(), history: z.array(historySchema).max(100_000),
  receipts: z.array(z.object({ operationId: z.string().uuid(), command: z.string().max(1000) }).strict()).max(200),
}).strict().superRefine((state, ctx) => {
  const record = state.history.find(item => item.id === state.game?.id);
  if (new Set(state.history.map(item => item.id)).size !== state.history.length
    || new Set(state.receipts.map(item => item.operationId)).size !== state.receipts.length
    || Boolean(record) !== Boolean(state.game?.completedAt)
    || (record && (record.elapsedMs !== state.game!.elapsedMs || record.assisted !== state.game!.assisted
      || JSON.stringify(record.cards) !== JSON.stringify(state.game!.cards)))) {
    ctx.addIssue({ code: "custom", message: "通关与奖励记录不一致" });
  }
});
export type TwentyFourState = z.infer<typeof twentyFourStateSchema>;
export function emptyTwentyFourState(now = Date.now()): TwentyFourState {
  const time = new Date(now).toISOString();
  return { schemaVersion: 1, id: "math-twenty-four", createdAt: time, updatedAt: time, revision: 0, game: null, history: [], receipts: [] };
}
export function parseTwentyFourState(raw: unknown) { return twentyFourStateSchema.parse(raw); }
const target = { operationId: z.string().uuid(), revision: integer, gameId: z.string().uuid().nullable() };
export const twentyFourCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...target, type: z.literal("new") }).strict(),
  z.object({ ...target, type: z.literal("merge"), left: integer.max(7), right: integer.max(7), op: z.enum(OPERATORS) }).strict(),
  z.object({ ...target, type: z.literal("edit"), editor: editorSchema }).strict(),
  ...(["edit-undo", "edit-reset", "submit"] as const).map(type => z.object({ ...target, type: z.literal(type) }).strict()),
  ...(["undo", "reset", "pause", "resume", "hint"] as const).map(type => z.object({ ...target, type: z.literal(type) }).strict()),
]);
export type TwentyFourCommand = z.infer<typeof twentyFourCommandSchema>;
export type TwentyFourWallet = (id: string, amount: number) => Promise<{ balance: number; updatedAt: string }>;
export type TwentyFourSettlement = { eventId: string; amount: number; balance: number; updatedAt: string };
export function elapsedTime(game: TwentyFourState["game"], now: number) {
  return game ? game.elapsedMs + (game.runningSince === null ? 0 : Math.max(0, now - game.runningSince)) : 0;
}
function view(state: TwentyFourState, now: number, settlement: TwentyFourSettlement | null = null) {
  const game = state.game, record = state.history.find(item => item.id === game?.id);
  return {
    schemaVersion: 1 as const, revision: state.revision,
    game: game ? {
      id: game.id, cards: game.cards, board: game.board, elapsedMs: elapsedTime(game, now),
      paused: game.runningSince === null && !game.completedAt, assisted: game.assisted,
      completedAt: game.completedAt, canUndo: game.undo.length > 0,
      editor: normalizeEditor(game.editor, game.board), canUndoEditor: game.editorUndo.length > 0,
      solution: game.assisted || game.completedAt ? singleLayerSolution(game.cards, game.solution) : null,
    } : null,
    reward: record ? { amount: record.amount, status: record.rewardStatus } : null,
    history: state.history.slice(-20).reverse(), completedCount: state.history.length,
    pendingRewards: state.history.filter(item => item.rewardStatus === "pending").length, settlement,
  };
}
export type TwentyFourView = ReturnType<typeof view>;
export async function writeTwentyFourState(path: string, state: TwentyFourState) {
  const checked = parseTwentyFourState(state);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, JSON.stringify(checked), { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(() => undefined); }
}
class ActionError extends Error { constructor(public status: number, message: string) { super(message); } }
export function registerTwentyFourApi(app: FastifyInstance, dataDir: string, award: TwentyFourWallet,
  options: { now?: () => number; puzzle?: typeof generatePuzzle; writer?: typeof writeTwentyFourState } = {}) {
  const path = resolve(dataDir, "learning/math/twenty-four-state.json");
  const now = options.now ?? Date.now, writer = options.writer ?? writeTwentyFourState;
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(action: () => Promise<T>) {
    const next = queue.then(action, action); queue = next.catch(() => undefined); return next;
  }
  async function read() {
    try { return parseTwentyFourState(JSON.parse(await readFile(path, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyTwentyFourState(now()); throw error; }
  }
  async function recover(initial: TwentyFourState) {
    let state = initial, settlement: TwentyFourSettlement | null = null;
    for (const record of initial.history.filter(item => item.rewardStatus === "pending")) {
      try {
        const wallet = await award(record.id, record.amount);
        const next = structuredClone(state), item = next.history.find(item => item.id === record.id)!;
        item.rewardStatus = "granted"; item.updatedAt = next.updatedAt = new Date(now()).toISOString();
        await writer(path, next); state = next;
        settlement = { eventId: record.id, amount: record.amount, balance: wallet.balance, updatedAt: wallet.updatedAt };
      } catch { /* Durable entitlement plus wallet receipt supports retry after either write fails. */ }
    }
    return { state, settlement };
  }
  app.addHook("onReady", () => serial(async () => { await recover(await read()); }).catch(() => undefined));
  app.get("/api/math/twenty-four", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    try { return await serial(async () => { const result = await recover(await read()); return view(result.state, now(), result.settlement); }); }
    catch { return reply.code(503).send({ message: "暂时无法读取 24 点进度，原文件已保留，请重试。" }); }
  });
  app.post("/api/math/twenty-four", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = twentyFourCommandSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "这一步的信息不完整，请重新选择。" });
    try {
      return await serial(async () => {
        const command = parsed.data, fingerprint = JSON.stringify(command);
        const restored = await recover(await read()), current = restored.state;
        const receipt = current.receipts.find(item => item.operationId === command.operationId);
        if (receipt) {
          if (receipt.command !== fingerprint) throw new ActionError(409, "同一步的内容变了，请恢复最新题目。");
          return view(current, now(), restored.settlement);
        }
        if (command.revision !== current.revision || command.gameId !== (current.game?.id ?? null)) {
          throw new ActionError(409, "另一页面更新了题目，请恢复最新进度。");
        }
        const next = structuredClone(current), time = now(), stamp = new Date(time).toISOString();
        if (command.type === "new") {
          const puzzle = (options.puzzle ?? generatePuzzle)();
          next.game = { id: randomUUID(), createdAt: stamp, updatedAt: stamp, ...puzzle,
            board: initialBoard(), undo: [], elapsedMs: 0, runningSince: time, assisted: false, completedAt: null,
            editor: emptyEditor(), editorUndo: [], legacyEditor: null };
        } else {
          const game = next.game;
          if (!game || game.completedAt) throw new ActionError(422, "这一题已经结束，试试下一题吧。");
          game.elapsedMs = elapsedTime(game, time);
          if (game.runningSince !== null) game.runningSince = time;
          game.updatedAt = stamp;
          if (command.type === "pause") game.runningSince = null;
          else if (command.type === "resume") { if (game.runningSince === null) game.runningSince = time; }
          else {
            if (game.runningSince === null) throw new ActionError(422, "休息好了，先点继续吧。");
            try {
              if (command.type === "hint") game.assisted = true;
              else if (command.type === "edit" || command.type === "edit-reset") {
                if (game.editor?.version === 1 && !game.legacyEditor) game.legacyEditor = game.editor;
                game.editorUndo.push(normalizeEditor(game.editor, game.board));
                game.editorUndo = game.editorUndo.slice(-100);
                game.editor = command.type === "edit" ? command.editor : emptyEditor();
              } else if (command.type === "edit-undo") {
                const prior = game.editorUndo.pop(); if (prior) game.editor = normalizeEditor(prior, game.board);
              } else if (command.type === "submit") {
                const answer = parseEditor(normalizeEditor(game.editor, game.board));
                if (!isSolved(answer, game.cards)) throw new Error("还没有到 24，换个数字、符号或括号再试试");
                const used = new Set((normalizeEditor(game.editor, game.board)).slots);
                game.board = [...initialBoard().filter(node => "card" in node && !used.has(node.card)), answer];
              }
              else if (command.type === "undo") { const prior = game.undo.pop(); if (prior) game.board = prior; }
              else {
                const board = command.type === "merge" ? mergeBoard(game.board, game.cards, command.left, command.right, command.op) : initialBoard();
                if (board.some(node => bracketDepth(node) > 1)) throw new Error("只用单层括号，换一种组合吧");
                game.undo.push(game.board); game.undo = game.undo.slice(-100); game.board = board;
              }
              if (command.type === "merge" || command.type === "undo" || command.type === "reset") {
                game.editor = editorFromBoard(game.board); game.editorUndo = [];
              }
            } catch (error) { throw new ActionError(422, error instanceof Error ? error.message : "换一种组合试试"); }
            const answer = game.board.find(node => isSolved(node, game.cards));
            if (answer) {
              game.completedAt = stamp; game.runningSince = null;
              next.history.push({ id: game.id, createdAt: stamp, updatedAt: stamp, completedAt: stamp,
                cards: game.cards, expression: answer, elapsedMs: game.elapsedMs, assisted: game.assisted,
                amount: rewardForTime(game.elapsedMs, game.assisted) as 5 | 10 | 20 | 30 | 40, rewardStatus: "pending" });
            }
          }
        }
        next.updatedAt = stamp; next.revision++;
        next.receipts.push({ operationId: command.operationId, command: fingerprint }); next.receipts = next.receipts.slice(-200);
        await writer(path, next);
        const result = await recover(next);
        return view(result.state, now(), result.settlement ?? restored.settlement);
      });
    } catch (error) {
      return reply.code(error instanceof ActionError ? error.status : 503).send({
        message: error instanceof ActionError ? error.message : "这一步还没有确认保存，请保留页面并重试；奖励不会重复增加。",
      });
    }
  });
}
