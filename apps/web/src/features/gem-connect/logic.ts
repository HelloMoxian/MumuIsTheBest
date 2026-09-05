export const GEMS = [
  { id: "ruby", name: "红心宝石", symbol: "♥" },
  { id: "sapphire", name: "蓝菱宝石", symbol: "◆" },
  { id: "emerald", name: "绿方宝石", symbol: "■" },
  { id: "gold", name: "金星宝石", symbol: "★" },
  { id: "amethyst", name: "紫滴宝石", symbol: "♠" },
  { id: "amber", name: "橙六角宝石", symbol: "⬡" },
  { id: "rose", name: "粉椭圆宝石", symbol: "●" },
  { id: "moon", name: "月牙宝石", symbol: "☾" },
] as const;

export const RULES_VERSION = 2 as const;
export const LEGACY_PAIRS = [6, 8, 10, 12, 15, 18, 21, 24, 27, 30] as const;
export const LEVELS = [
  { name: "初见星光", rows: 6, cols: 10, kinds: 4 },
  { name: "水晶花园", rows: 6, cols: 12, kinds: 4 },
  { name: "彩虹溪流", rows: 7, cols: 12, kinds: 5 },
  { name: "月光小径", rows: 8, cols: 12, kinds: 5 },
  { name: "极光山谷", rows: 9, cols: 12, kinds: 6 },
  { name: "星砂海岸", rows: 10, cols: 12, kinds: 6 },
  { name: "云端宝库", rows: 10, cols: 14, kinds: 7 },
  { name: "银河漫游", rows: 11, cols: 14, kinds: 7 },
  { name: "彗星奇遇", rows: 12, cols: 14, kinds: 8 },
  { name: "璀璨星河", rows: 12, cols: 15, kinds: 8 },
] as const;
export const IDLE_HINT_MS = 20_000;
export const MATCH_ANIMATION_MS = 620;
export const ENTRY_ANIMATION_MS = 850;
export const LEVEL_TRANSITION_MS = 2200;
/** Time spent paused/entering/celebrating is excluded by the caller. */
export function needsIdleHint(activeMs: number, lastMatchMs: number, hasHint: boolean) {
  return !hasHint && activeMs - lastMatchMs >= IDLE_HINT_MS;
}
export function entryDelay(index: number, rows: number, cols: number) {
  return Math.round((Math.floor(index / cols) + index % cols) / (rows + cols - 2) * 380);
}
export type Board = { rows: number; cols: number; tiles: (number | null)[] };
export type Point = { r: number; c: number };
const DIRECTIONS = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;

/** One empty perimeter is sufficient for every legal path with at most two turns. */
export function findPath(board: Board, a: number, b: number, compare = true): Point[] | null {
  if (a === b || a < 0 || b < 0 || a >= board.tiles.length || b >= board.tiles.length
    || board.tiles[a] === null || board.tiles[b] === null
    || (compare && board.tiles[a] !== board.tiles[b])) return null;
  const start = { r: Math.floor(a / board.cols), c: a % board.cols };
  const end = { r: Math.floor(b / board.cols), c: b % board.cols };
  const queue = [{ ...start, direction: -1, turns: 0, path: [start] }];
  const best = new Map<string, number>();
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    for (let direction = 0; direction < 4; direction++) {
      const turns = node.turns + (node.direction !== -1 && node.direction !== direction ? 1 : 0);
      if (turns > 2) continue;
      const [dr, dc] = DIRECTIONS[direction];
      const r = node.r + dr, c = node.c + dc;
      if (r < -1 || c < -1 || r > board.rows || c > board.cols) continue;
      const path = [...node.path, { r, c }];
      if (r === end.r && c === end.c) return path;
      if (r >= 0 && c >= 0 && r < board.rows && c < board.cols
        && board.tiles[r * board.cols + c] !== null) continue;
      const key = `${r},${c},${direction}`;
      if ((best.get(key) ?? 3) <= turns) continue;
      best.set(key, turns);
      queue.push({ r, c, direction, turns, path });
    }
  }
  return null;
}
export function findMove(board: Board): [number, number] | null {
  for (let a = 0; a < board.tiles.length; a++) {
    if (board.tiles[a] === null) continue;
    for (let b = a + 1; b < board.tiles.length; b++) {
      if (board.tiles[a] === board.tiles[b] && findPath(board, a, b)) return [a, b];
    }
  }
  return null;
}
export function shuffleBoard(board: Board, random = Math.random): Board {
  const values = board.tiles.filter((tile): tile is number => tile !== null);
  if (values.length === 0) return { ...board, tiles: [...board.tiles] };
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  let index = 0;
  const result = { ...board, tiles: board.tiles.map(tile => tile === null ? null : values[index++]) };
  if (findMove(result)) return result;
  // Force one legal pair without dropping tiles or relying on unbounded random retries.
  for (let a = 0; a < result.tiles.length; a++) {
    if (result.tiles[a] === null) continue;
    for (let b = a + 1; b < result.tiles.length; b++) {
      if (result.tiles[b] === null || !findPath(result, a, b, false)) continue;
      const partner = result.tiles.findIndex((tile, i) => i !== a && tile === result.tiles[a]);
      if (partner < 0) throw new Error("宝石必须成对出现");
      [result.tiles[b], result.tiles[partner]] = [result.tiles[partner], result.tiles[b]];
      return result;
    }
  }
  throw new Error("棋盘缺少可连接的位置");
}
export function createBoard(level: number, random = Math.random): Board {
  const config = LEVELS[level - 1];
  if (!config) throw new Error("关卡应为 1 至 10");
  const tiles = Array.from({ length: config.rows * config.cols }, (_, i) => Math.floor(i / 2) % config.kinds);
  return shuffleBoard({ rows: config.rows, cols: config.cols, tiles }, random);
}
export function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export type Completion = {
  id: string; rulesVersion: 2; level: number; durationMs: number; hints: number; shuffles: number; pairCount: number;
};
export type RecordEntry = Omit<Completion, "rulesVersion"> & { rulesVersion: 1 | 2; rewardStatus: "legacy" | "pending" | "granted"; createdAt: string; updatedAt: string };
export function rankRecords(records: RecordEntry[], level: number) {
  return records.filter(record => record.level === level && record.rulesVersion === RULES_VERSION)
    .sort((a, b) => a.durationMs - b.durationMs || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
