import { SHAPES, emptyStatistics, type Kind, type TetrisStatistics } from "./logic";

export const TETRIS_HISTORY_STORAGE = "mumu.tetris.statistics.v1";
export const TETRIS_PREFERENCES_STORAGE = "mumu.tetris.preferences.v1";
export const TETRIS_BLOCK_THEMES = ["default", "classic-fc", "clear-glass", "random-crystal", "random-gem", "smile", "dimensional", "orb", "solid"] as const;
export type TetrisBlockTheme = typeof TETRIS_BLOCK_THEMES[number];
export type TetrisHistory = {
  all: TetrisStatistics;
  today: { date: string; statistics: TetrisStatistics };
  createdAt: string;
  updatedAt: string;
};
export type TetrisPreferences = { mouseMode: boolean; blockTheme: TetrisBlockTheme; createdAt: string; updatedAt: string };

const KINDS = Object.keys(SHAPES) as Kind[];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000_000;
const isoDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function parseKindCounts(value: unknown): Record<Kind, number> | undefined {
  if (!object(value)) return;
  const result = Object.fromEntries(KINDS.map(kind => [kind, 0])) as Record<Kind, number>;
  for (const [kind, count] of Object.entries(value)) {
    if (!KINDS.includes(kind as Kind) || !integer(count)) return;
    result[kind as Kind] = count as number;
  }
  return result;
}
export function parseStatistics(value: unknown): TetrisStatistics | undefined {
  if (!object(value)) return;
  const appearances = parseKindCounts(value.appearances);
  // Statistics saved before per-piece clear attribution are migrated as zero.
  const clearedLines = value.clearedLines === undefined ? emptyStatistics().clearedLines : parseKindCounts(value.clearedLines);
  const placements = parseKindCounts(value.placements);
  const perfect = parseKindCounts(value.perfect);
  const lineClears = Array.isArray(value.lineClears) && value.lineClears.length === 4 && value.lineClears.every(integer)
    ? [...value.lineClears] as TetrisStatistics["lineClears"] : undefined;
  if (!appearances || !clearedLines || !placements || !perfect || !lineClears) return;
  if (KINDS.some(kind => perfect[kind] > placements[kind])) return;
  return { appearances, clearedLines, placements, perfect, lineClears };
}
export function cloneStatistics(value: TetrisStatistics): TetrisStatistics {
  return { appearances: { ...value.appearances }, clearedLines: { ...value.clearedLines }, placements: { ...value.placements }, perfect: { ...value.perfect }, lineClears: [...value.lineClears] };
}
export function addStatistics(left: TetrisStatistics, right: TetrisStatistics): TetrisStatistics {
  const next = emptyStatistics();
  for (const kind of KINDS) {
    next.appearances[kind] = left.appearances[kind] + right.appearances[kind];
    next.clearedLines[kind] = left.clearedLines[kind] + right.clearedLines[kind];
    next.placements[kind] = left.placements[kind] + right.placements[kind];
    next.perfect[kind] = left.perfect[kind] + right.perfect[kind];
  }
  next.lineClears = left.lineClears.map((count, index) => count + right.lineClears[index]) as TetrisStatistics["lineClears"];
  return next;
}
export function statisticsDelta(current: TetrisStatistics, committed: TetrisStatistics): TetrisStatistics {
  const next = emptyStatistics();
  for (const kind of KINDS) {
    next.appearances[kind] = Math.max(0, current.appearances[kind] - committed.appearances[kind]);
    next.clearedLines[kind] = Math.max(0, current.clearedLines[kind] - committed.clearedLines[kind]);
    next.placements[kind] = Math.max(0, current.placements[kind] - committed.placements[kind]);
    next.perfect[kind] = Math.max(0, current.perfect[kind] - committed.perfect[kind]);
  }
  next.lineClears = current.lineClears.map((count, index) => Math.max(0, count - committed.lineClears[index])) as TetrisStatistics["lineClears"];
  return next;
}
export function hasStatistics(value: TetrisStatistics) {
  return KINDS.some(kind => value.appearances[kind] || value.clearedLines[kind] || value.placements[kind] || value.perfect[kind]) || value.lineClears.some(Boolean);
}
export function perfectRate(value: TetrisStatistics, kind?: Kind) {
  const placements = kind ? value.placements[kind] : KINDS.reduce((sum, item) => sum + value.placements[item], 0);
  const perfect = kind ? value.perfect[kind] : KINDS.reduce((sum, item) => sum + value.perfect[item], 0);
  return placements ? perfect / placements : null;
}
export function emptyTetrisHistory(now = new Date()): TetrisHistory {
  const timestamp = now.toISOString();
  return { all: emptyStatistics(), today: { date: isoDate(now), statistics: emptyStatistics() }, createdAt: timestamp, updatedAt: timestamp };
}
export function rollTetrisHistory(history: TetrisHistory, now = new Date()): TetrisHistory {
  const date = isoDate(now);
  return history.today.date === date ? history : { ...history, today: { date, statistics: emptyStatistics() }, updatedAt: now.toISOString() };
}
export function loadTetrisHistory(storage: Pick<Storage, "getItem">, now = new Date()): TetrisHistory {
  const raw = storage.getItem(TETRIS_HISTORY_STORAGE);
  if (!raw) return emptyTetrisHistory(now);
  const value = JSON.parse(raw) as unknown;
  if (!object(value) || value.schemaVersion !== 1 || value.stableId !== "tetris-statistics" || !object(value.today)
    || typeof value.today.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.today.date)
    || !Number.isFinite(Date.parse(value.createdAt as string)) || !Number.isFinite(Date.parse(value.updatedAt as string))) throw new Error("俄罗斯方块统计不可用");
  const all = parseStatistics(value.all);
  const today = parseStatistics(value.today.statistics);
  if (!all || !today) throw new Error("俄罗斯方块统计不可用");
  return rollTetrisHistory({ all, today: { date: value.today.date, statistics: today }, createdAt: value.createdAt as string, updatedAt: value.updatedAt as string }, now);
}
export function saveTetrisHistory(storage: Pick<Storage, "setItem">, history: TetrisHistory, now = new Date()) {
  storage.setItem(TETRIS_HISTORY_STORAGE, JSON.stringify({ schemaVersion: 1, stableId: "tetris-statistics", ...history, updatedAt: now.toISOString() }));
}
export function clearTetrisHistory(storage: Pick<Storage, "setItem">, now = new Date()) {
  const history = emptyTetrisHistory(now);
  saveTetrisHistory(storage, history, now);
  return history;
}
export function defaultTetrisPreferences(now = new Date()): TetrisPreferences {
  const timestamp = now.toISOString();
  return { mouseMode: false, blockTheme: "default", createdAt: timestamp, updatedAt: timestamp };
}
export function loadTetrisPreferences(storage: Pick<Storage, "getItem">): TetrisPreferences {
  const raw = storage.getItem(TETRIS_PREFERENCES_STORAGE);
  if (!raw) return defaultTetrisPreferences();
  const value = JSON.parse(raw) as unknown;
  if (!object(value) || value.schemaVersion !== 1 || value.stableId !== "tetris-preferences" || typeof value.mouseMode !== "boolean"
    || !Number.isFinite(Date.parse(value.createdAt as string)) || !Number.isFinite(Date.parse(value.updatedAt as string))) throw new Error("俄罗斯方块设置不可用");
  const blockTheme = value.blockTheme === undefined ? "default" : value.blockTheme;
  if (!TETRIS_BLOCK_THEMES.includes(blockTheme as TetrisBlockTheme)) throw new Error("俄罗斯方块设置不可用");
  return { mouseMode: value.mouseMode, blockTheme: blockTheme as TetrisBlockTheme, createdAt: value.createdAt as string, updatedAt: value.updatedAt as string };
}
export function saveTetrisPreferences(storage: Pick<Storage, "setItem">, preferences: TetrisPreferences) {
  storage.setItem(TETRIS_PREFERENCES_STORAGE, JSON.stringify({ schemaVersion: 1, stableId: "tetris-preferences", ...preferences, updatedAt: new Date().toISOString() }));
}
