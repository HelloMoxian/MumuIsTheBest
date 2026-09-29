import { isExpression, isSolved, rewardForTime, validBoard, type Expression } from "../../../../server/src/twenty-four-engine";
import { isEditor, type EquationEditor } from "../../../../server/src/twenty-four-editor";
import type { TwentyFourCommand, TwentyFourView } from "../../../../server/src/twenty-four";
export type { TwentyFourCommand, TwentyFourView };
export type Action = { type: "new" | "undo" | "reset" | "pause" | "resume" | "hint" | "edit-undo" | "edit-reset" | "submit" }
  | { type: "edit"; editor: EquationEditor }
  | { type: "merge"; left: number; right: number; op: "+" | "-" | "*" | "/" };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const stamp = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const cards = (v: unknown): v is number[] => Array.isArray(v) && v.length === 8 && v.every(n => integer(n) && n <= 13);
const amount = (v: unknown) => [5, 10, 20, 30, 40].includes(Number(v)) && typeof v === "number";
const status = (v: unknown) => v === "granted" || v === "pending";
export function isTwentyFourView(raw: unknown): raw is TwentyFourView {
  try {
    if (!object(raw) || raw.schemaVersion !== 1 || !integer(raw.revision)
      || !integer(raw.completedCount) || !integer(raw.pendingRewards) || !Array.isArray(raw.history) || raw.history.length > 20) return false;
    if (!raw.history.every(r => object(r) && uuid(r.id) && cards(r.cards) && isExpression(r.expression)
      && isSolved(r.expression, r.cards) && integer(r.elapsedMs) && typeof r.assisted === "boolean"
      && r.amount === rewardForTime(r.elapsedMs, r.assisted) && status(r.rewardStatus)
      && stamp(r.createdAt) && stamp(r.updatedAt) && stamp(r.completedAt))) return false;
    if (raw.reward !== null && (!object(raw.reward) || !amount(raw.reward.amount) || !status(raw.reward.status))) return false;
    if (raw.settlement !== null && (!object(raw.settlement) || !uuid(raw.settlement.eventId) || !amount(raw.settlement.amount)
      || !integer(raw.settlement.balance) || !stamp(raw.settlement.updatedAt))) return false;
    const g = raw.game;
    if (g === null) return raw.reward === null;
    if (!object(g) || !uuid(g.id) || !cards(g.cards) || !Array.isArray(g.board)
      || g.board.length < 2 || g.board.length > 8 || !g.board.every(isExpression)
      || !validBoard(g.board as Expression[], g.cards) || !integer(g.elapsedMs)
      || typeof g.paused !== "boolean" || typeof g.assisted !== "boolean" || typeof g.canUndo !== "boolean"
      || !(g.completedAt === null || stamp(g.completedAt))) return false;
    const solved = g.board.some(node => isSolved(node as Expression, g.cards as number[]));
    if (!isEditor(g.editor) || typeof g.canUndoEditor !== "boolean") return false;
    if (Boolean(g.completedAt) !== solved || Boolean(raw.reward) !== solved || (solved && g.paused)) return false;
    return g.solution === null ? !g.assisted && !g.completedAt
      : isExpression(g.solution) && isSolved(g.solution, g.cards) && (g.assisted || solved);
  } catch { return false; }
}
export class TwentyFourApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}
export async function requestTwentyFour(command?: TwentyFourCommand, signal?: AbortSignal): Promise<TwentyFourView> {
  const response = await fetch("/api/math/twenty-four", {
    ...(command ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command), keepalive: true } : {}),
    signal: signal ?? AbortSignal.timeout(15000),
  });
  const body: unknown = await response.json();
  if (!response.ok) throw new TwentyFourApiError(object(body) && typeof body.message === "string" ? body.message : "暂时没有收到回复，请重试。", response.status);
  if (!isTwentyFourView(body)) throw new TwentyFourApiError("收到的题目信息不完整，请重试读取。");
  return body;
}
