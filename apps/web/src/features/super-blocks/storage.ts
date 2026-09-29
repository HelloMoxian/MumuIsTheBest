import { HEIGHT, SHAPE_BY_ID, WIDTH, validateSettings, type Cell, type Game, type Matrix, type Piece } from "./logic";

export const SESSION_KEY = "mumu.super-blocks.session.v1";
export const HISTORY_KEY = "mumu.super-blocks.history.v1";
export const PREFERENCES_KEY = "mumu.super-blocks.preferences.v1";
export type StoredPhase = "playing" | "paused" | "finished";
export type SuperBlocksHistory = { totalLines: number; totalCells: number; appearances: Record<string, number>; createdAt: string; updatedAt: string };
export type SuperBlocksPreferences = { enabledKinds: string[]; mouseMode: boolean; createdAt: string; updatedAt: string };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min = 0, max = 1_000_000_000) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const kind = (value: unknown): value is string => typeof value === "string" && SHAPE_BY_ID.has(value);
function board(value: unknown): Cell[][] | undefined {
  if (!Array.isArray(value) || value.length !== HEIGHT) return;
  const rows = value.map(row => Array.isArray(row) && row.length === WIDTH && row.every(cell => cell === null || kind(cell)) ? [...row] as Cell[] : undefined);
  return rows.every(Boolean) ? rows as Cell[][] : undefined;
}
function matrix(value: unknown, expectedCells?: number): Matrix | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5 || value.some(row => !Array.isArray(row) || row.length !== value.length || row.some(cell => cell !== 0 && cell !== 1))) return;
  if (expectedCells && value.flat().filter(Boolean).length !== expectedCells) return;
  return value.map(row => [...row]) as Matrix;
}
function piece(value: unknown): Piece | undefined {
  if (!object(value) || !kind(value.kind) || !integer(value.x, -5, WIDTH) || !integer(value.y, -5, HEIGHT)) return;
  const shape = SHAPE_BY_ID.get(value.kind)!;
  const savedMatrix = matrix(value.matrix, shape.size);
  return savedMatrix ? { kind: value.kind, matrix: savedMatrix, x: value.x as number, y: value.y as number } : undefined;
}
function counts(value: unknown) {
  if (!object(value)) return;
  const result: Record<string, number> = {};
  for (const [id, count] of Object.entries(value)) {
    if (!kind(id) || !integer(count)) return;
    result[id] = count as number;
  }
  return result;
}
function parseGame(value: unknown): Game | undefined {
  if (!object(value)) return;
  const savedBoard = board(value.board); const savedPiece = piece(value.piece); const appearances = counts(value.appearances);
  const next = Array.isArray(value.next) && value.next.length === 3 && value.next.every(kind) ? [...value.next] as string[] : undefined;
  let settings; try { settings = object(value.settings) ? validateSettings({ initialSpeed: value.settings.initialSpeed as number, speedIncrement: value.settings.speedIncrement as number }) : undefined; } catch { return; }
  if (!savedBoard || !savedPiece || !appearances || !next || !settings || !integer(value.seed, 0, 0xffffffff) || !integer(value.lines) || !integer(value.score)
    || typeof value.ended !== "boolean" || typeof value.elapsed !== "number" || !Number.isFinite(value.elapsed) || value.elapsed < 0 || !integer(value.pieceId) || !integer(value.serial) || !integer(value.cellsSpawned)) return;
  let clearing: Game["clearing"] = null;
  if (value.clearing !== null) {
    if (!object(value.clearing)) return;
    const saved = board(value.clearing.board);
    const rows = Array.isArray(value.clearing.rows) && value.clearing.rows.length <= 5 && value.clearing.rows.every(row => integer(row, 0, HEIGHT - 1)) ? value.clearing.rows as number[] : undefined;
    if (!saved || !rows || typeof value.clearing.elapsed !== "number" || !Number.isFinite(value.clearing.elapsed)) return;
    clearing = { board: saved, rows: [...rows], elapsed: value.clearing.elapsed };
  }
  let fastDrop: Game["fastDrop"] = null;
  if (value.fastDrop !== undefined && value.fastDrop !== null) {
    if (!object(value.fastDrop) || !integer(value.fastDrop.targetY, 0, HEIGHT - 1) || typeof value.fastDrop.elapsed !== "number" || !Number.isFinite(value.fastDrop.elapsed) || value.fastDrop.elapsed < 0) return;
    fastDrop = { targetY: value.fastDrop.targetY as number, elapsed: value.fastDrop.elapsed };
  }
  return { board: savedBoard, piece: savedPiece, next, seed: value.seed as number, lines: value.lines as number, score: value.score as number, ended: value.ended,
    elapsed: value.elapsed, pieceId: value.pieceId as number, clearing, fastDrop, settings, events: [], sounds: [], serial: value.serial as number,
    cellsSpawned: value.cellsSpawned as number, appearances };
}
export function loadSession(storage: Pick<Storage, "getItem">): { phase: StoredPhase; game: Game } | undefined {
  const raw = storage.getItem(SESSION_KEY); if (!raw) return;
  const value = JSON.parse(raw) as unknown;
  if (!object(value) || value.schemaVersion !== 1 || value.stableId !== "super-blocks-session" || !["playing", "paused", "finished"].includes(value.phase as string)) throw new Error("超级积木进度不可用");
  const game = parseGame(value.game); if (!game) throw new Error("超级积木进度不可用");
  return { phase: value.phase as StoredPhase, game };
}
export function saveSession(storage: Pick<Storage, "setItem">, phase: StoredPhase, game: Game) {
  storage.setItem(SESSION_KEY, JSON.stringify({ schemaVersion: 1, stableId: "super-blocks-session", savedAt: new Date().toISOString(), phase, game }));
}
export function clearSession(storage: Pick<Storage, "removeItem">) { storage.removeItem(SESSION_KEY); }
export function emptyHistory(): SuperBlocksHistory { const now = new Date().toISOString(); return { totalLines: 0, totalCells: 0, appearances: {}, createdAt: now, updatedAt: now }; }
export function loadHistory(storage: Pick<Storage, "getItem">): SuperBlocksHistory {
  const raw = storage.getItem(HISTORY_KEY); if (!raw) return emptyHistory();
  const value = JSON.parse(raw) as unknown;
  if (!object(value) || value.schemaVersion !== 1 || value.stableId !== "super-blocks-history" || !integer(value.totalLines) || !integer(value.totalCells) || !Number.isFinite(Date.parse(value.createdAt as string)) || !Number.isFinite(Date.parse(value.updatedAt as string))) throw new Error("超级积木历史记录不可用");
  const appearances = counts(value.appearances); if (!appearances) throw new Error("超级积木历史记录不可用");
  return { totalLines: value.totalLines as number, totalCells: value.totalCells as number, appearances, createdAt: value.createdAt as string, updatedAt: value.updatedAt as string };
}
export function saveHistory(storage: Pick<Storage, "setItem">, history: SuperBlocksHistory) {
  storage.setItem(HISTORY_KEY, JSON.stringify({ schemaVersion: 1, stableId: "super-blocks-history", ...history, updatedAt: new Date().toISOString() }));
}
export function defaultPreferences(): SuperBlocksPreferences {
  const now = new Date().toISOString();
  return { enabledKinds: [...SHAPE_BY_ID.keys()], mouseMode: false, createdAt: now, updatedAt: now };
}
export function loadPreferences(storage: Pick<Storage, "getItem">): SuperBlocksPreferences {
  const raw = storage.getItem(PREFERENCES_KEY); if (!raw) return defaultPreferences();
  const value = JSON.parse(raw) as unknown;
  if (!object(value) || value.schemaVersion !== 1 || value.stableId !== "super-blocks-preferences" || typeof value.mouseMode !== "boolean"
    || !Array.isArray(value.enabledKinds) || !value.enabledKinds.length || !value.enabledKinds.every(kind) || new Set(value.enabledKinds).size !== value.enabledKinds.length
    || !Number.isFinite(Date.parse(value.createdAt as string)) || !Number.isFinite(Date.parse(value.updatedAt as string))) throw new Error("超级积木设置不可用");
  return { enabledKinds: [...value.enabledKinds] as string[], mouseMode: value.mouseMode, createdAt: value.createdAt as string, updatedAt: value.updatedAt as string };
}
export function savePreferences(storage: Pick<Storage, "setItem">, preferences: SuperBlocksPreferences) {
  storage.setItem(PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, stableId: "super-blocks-preferences", ...preferences, updatedAt: new Date().toISOString() }));
}
