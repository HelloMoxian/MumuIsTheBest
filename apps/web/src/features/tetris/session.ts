import { HEIGHT, SHAPES, WIDTH, emptyStatistics, validateSettings, type Cell, type Game, type Kind, type Matrix, type Piece } from "./logic";
import { parseStatistics } from "./statistics";

export const TETRIS_SESSION_STORAGE = "mumu.tetris.session.v1";
export type StoredTetrisPhase = "playing" | "paused" | "finished";
export type TetrisSession = { phase: StoredTetrisPhase; games: Game[]; savedAt: string };

const KINDS = new Set(Object.keys(SHAPES) as Kind[]);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
function kind(value: unknown): value is Kind { return typeof value === "string" && KINDS.has(value as Kind); }
function board(value: unknown): Cell[][] | undefined {
  if (!Array.isArray(value) || value.length !== HEIGHT) return;
  const rows = value.map(row => Array.isArray(row) && row.length === WIDTH && row.every(cell => cell === null || kind(cell)) ? [...row] as Cell[] : undefined);
  return rows.every(Boolean) ? rows as Cell[][] : undefined;
}
function matrix(value: unknown): Matrix | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4 || value.some(row => !Array.isArray(row) || row.length !== value.length || row.some(cell => cell !== 0 && cell !== 1))) return;
  if (value.flat().filter(Boolean).length !== 4) return;
  return value.map(row => [...row]) as Matrix;
}
function piece(value: unknown): Piece | undefined {
  if (!object(value) || !kind(value.kind) || !integer(value.x, -4, WIDTH) || !integer(value.y, -4, HEIGHT)) return;
  const shape = matrix(value.matrix);
  return shape ? { kind: value.kind, matrix: shape, x: value.x as number, y: value.y as number } : undefined;
}
function game(value: unknown): Game | undefined {
  if (!object(value)) return;
  const savedBoard = board(value.board);
  const savedPiece = piece(value.piece);
  const next = Array.isArray(value.next) && value.next.length === 3 && value.next.every(kind) ? [...value.next] as Kind[] : undefined;
  const bag = Array.isArray(value.bag) && value.bag.length <= 7 && value.bag.every(kind) && new Set(value.bag).size === value.bag.length ? [...value.bag] as Kind[] : undefined;
  let settings;
  try { settings = object(value.settings) ? validateSettings({ initialSpeed: value.settings.initialSpeed as number, speedIncrement: value.settings.speedIncrement as number }) : undefined; } catch { return; }
  if (!savedBoard || !savedPiece || !next || !bag || !settings || !integer(value.seed, 0, 0xffffffff)
    || !integer(value.lines, 0, 10_000_000) || !integer(value.score, 0, 1_000_000_000)
    || typeof value.ended !== "boolean" || typeof value.elapsed !== "number" || !Number.isFinite(value.elapsed) || value.elapsed < 0
    || !integer(value.pieceId, 0, 1_000_000_000) || !integer(value.serial, 0, 1_000_000_000)) return;
  let clearing: Game["clearing"] = null;
  if (value.clearing !== null) {
    if (!object(value.clearing)) return;
    const clearingBoard = board(value.clearing.board);
    const rows = Array.isArray(value.clearing.rows) && value.clearing.rows.length <= 4 && value.clearing.rows.every(row => integer(row, 0, HEIGHT - 1)) ? value.clearing.rows as number[] : undefined;
    if (!clearingBoard || !rows || new Set(rows).size !== rows.length || typeof value.clearing.elapsed !== "number" || !Number.isFinite(value.clearing.elapsed) || value.clearing.elapsed < 0) return;
    clearing = { board: clearingBoard, rows: [...rows], elapsed: value.clearing.elapsed };
  }
  const statistics = value.statistics === undefined ? emptyStatistics() : parseStatistics(value.statistics);
  if (!statistics) return;
  return {
    board: savedBoard, piece: savedPiece, next, bag, settings, clearing,
    seed: value.seed as number, lines: value.lines as number, score: value.score as number,
    ended: value.ended, elapsed: value.elapsed, pieceId: value.pieceId as number,
    serial: value.serial as number, events: [], sounds: [], statistics,
  };
}

export function loadTetrisSession(storage: Pick<Storage, "getItem">): TetrisSession | undefined {
  const raw = storage.getItem(TETRIS_SESSION_STORAGE);
  if (!raw) return;
  const value = JSON.parse(raw) as unknown;
  if (!object(value) || value.schemaVersion !== 1 || value.stableId !== "tetris-session"
    || !["playing", "paused", "finished"].includes(value.phase as string) || !Number.isFinite(Date.parse(value.savedAt as string))
    || !Array.isArray(value.games) || value.games.length < 1 || value.games.length > 2) throw new Error("俄罗斯方块进度不可用");
  const games = value.games.map(game);
  if (games.some(item => !item)) throw new Error("俄罗斯方块进度不可用");
  return { phase: value.phase as StoredTetrisPhase, games: games as Game[], savedAt: value.savedAt as string };
}

export function saveTetrisSession(storage: Pick<Storage, "setItem">, phase: StoredTetrisPhase, games: readonly Game[]) {
  if (!games.length) return;
  storage.setItem(TETRIS_SESSION_STORAGE, JSON.stringify({ schemaVersion: 1, stableId: "tetris-session", savedAt: new Date().toISOString(), phase, games }));
}
export function clearTetrisSession(storage: Pick<Storage, "removeItem">) { storage.removeItem(TETRIS_SESSION_STORAGE); }
