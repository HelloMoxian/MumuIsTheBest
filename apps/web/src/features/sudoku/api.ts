import { LEVELS, THEME_IDS, rewardForLevel } from "../../../../server/src/sudoku-engine";
import type { SudokuCommand, SudokuView } from "../../../../server/src/sudoku";
export type { SudokuCommand, SudokuView };

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;
const text = (value: unknown): value is string => typeof value === "string";
export function isSudokuView(value: unknown): value is SudokuView {
  if (!object(value) || value.schemaVersion !== 1 || !integer(value.revision) || !integer(value.completedCount)
    || !integer(value.pendingRewards) || !text(value.message) || !Array.isArray(value.history)) return false;
  if (!value.history.every(record => object(record) && text(record.id) && integer(record.level, 5)
    && text(record.title) && THEME_IDS.includes(record.theme as typeof THEME_IDS[number])
    && text(record.completedAt) && record.amount === rewardForLevel(record.level)
    && (record.rewardStatus === "granted" || record.rewardStatus === "pending"))) return false;
  if (value.reward !== null && (!object(value.reward) || !integer(value.reward.amount)
    || !["pending", "granted"].includes(String(value.reward.status)))) return false;
  if (value.settlement !== null && (!object(value.settlement) || !text(value.settlement.eventId)
    || !integer(value.settlement.amount) || !integer(value.settlement.knowledgeBalance)
    || !integer(value.settlement.energyBalance) || !text(value.settlement.updatedAt))) return false;
  const game = value.game;
  if (game === null) return value.reward === null;
  if (!object(game) || !integer(game.level, 5) || !text(game.id) || !THEME_IDS.includes(game.theme as typeof THEME_IDS[number])
    || !(game.completedAt === null || text(game.completedAt)) || typeof game.canUndo !== "boolean"
    || !Array.isArray(game.given) || !Array.isArray(game.cells) || !Array.isArray(game.conflicts) || !object(game.story)) return false;
  const n = LEVELS[game.level].n, given = game.given;
  return given.length === n * n && given.every(v => integer(v, n)) && game.cells.length === n * n
    && game.cells.every((cell, i) => object(cell) && integer(cell.value, n) && typeof cell.noted === "boolean"
      && (!given[i] || cell.value === given[i]) && Array.isArray(cell.crossed)
      && cell.crossed.every(v => integer(v, n) && v > 0) && new Set(cell.crossed).size === cell.crossed.length)
    && game.conflicts.every(i => integer(i, n * n - 1))
    && text(game.story.title) && text(game.story.teaser) && Array.isArray(game.story.rows)
    && game.story.rows.length === n && game.story.rows.every(row => object(row) && typeof row.complete === "boolean"
      && Array.isArray(row.pieces) && row.pieces.length === n && row.pieces.every(piece => piece === null || text(piece)))
    && (value.hintValues === undefined || (Array.isArray(value.hintValues) && value.hintValues.every(v => integer(v, n) && v > 0)));
}
export class SudokuApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}
export async function requestSudoku(command?: SudokuCommand, signal?: AbortSignal): Promise<SudokuView> {
  const response = await fetch("/api/games/sudoku", command ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
    signal: signal ?? AbortSignal.timeout(15000),
  } : { signal: signal ?? AbortSignal.timeout(15000) });
  const body: unknown = await response.json();
  if (!response.ok) throw new SudokuApiError(object(body) && text(body.message) ? body.message : "探索舱暂时没有回应，请重试。", response.status);
  if (!isSudokuView(body)) throw new SudokuApiError("收到的棋盘信息不完整，请重试读取。");
  return body;
}
