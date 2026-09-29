export const GEMS = [
  { id: "ruby", name: "红心宝石", symbol: "♥" },
  { id: "sapphire", name: "蓝菱宝石", symbol: "◆" },
  { id: "emerald", name: "绿方宝石", symbol: "■" },
  { id: "gold", name: "金星宝石", symbol: "★" },
  { id: "amethyst", name: "紫滴宝石", symbol: "♠" },
  { id: "amber", name: "橙六角宝石", symbol: "⬡" },
  { id: "rose", name: "粉椭圆宝石", symbol: "●" },
  { id: "moon", name: "月牙宝石", symbol: "☾" },
  { id: "pearl", name: "珍珠宝石", symbol: "◉" },
  { id: "triangle", name: "三角宝石", symbol: "▲" },
  { id: "clover", name: "四叶宝石", symbol: "♣" },
  { id: "flower", name: "花朵宝石", symbol: "✿" },
  { id: "lightning", name: "闪电宝石", symbol: "ϟ" },
  { id: "butterfly", name: "蝴蝶宝石", symbol: "⋈" },
  { id: "shell", name: "贝壳宝石", symbol: "♧" },
  { id: "shield", name: "盾牌宝石", symbol: "⬟" },
  { id: "comet", name: "彗星宝石", symbol: "☄" },
  { id: "leaf", name: "叶片宝石", symbol: "❧" },
  { id: "bow", name: "蝴蝶结宝石", symbol: "⋈" },
  { id: "snowflake", name: "雪花宝石", symbol: "❄" },
  { id: "gear", name: "齿轮宝石", symbol: "⚙" },
  { id: "crown", name: "皇冠宝石", symbol: "♛" },
  { id: "ring", name: "圆环宝石", symbol: "◯" },
  { id: "key", name: "钥匙宝石", symbol: "⚿" },
  { id: "flame", name: "火焰宝石", symbol: "♨" },
  { id: "hourglass", name: "沙漏宝石", symbol: "⌛" },
  { id: "prism", name: "棱镜宝石", symbol: "▱" },
] as const;

export const RULES_VERSION = 5 as const;
export const PREVIOUS_PAIRS = [30, 36, 42, 48, 54, 60, 70, 77, 84, 90, 104, 112, 126, 135, 144] as const;
export const LEGACY_PAIRS = [6, 8, 10, 12, 15, 18, 21, 24, 27, 30] as const;
export const LEVELS = [
  { name: "初见星光", rows: 5, cols: 12, baseKinds: 4, kinds: 4 },
  { name: "水晶花园", rows: 6, cols: 12, baseKinds: 4, kinds: 5 },
  { name: "彩虹溪流", rows: 6, cols: 14, baseKinds: 5, kinds: 7 },
  { name: "月光小径", rows: 7, cols: 14, baseKinds: 5, kinds: 8 },
  { name: "极光山谷", rows: 7, cols: 16, baseKinds: 6, kinds: 10 },
  { name: "星砂海岸", rows: 8, cols: 16, baseKinds: 6, kinds: 11 },
  { name: "云端宝库", rows: 8, cols: 18, baseKinds: 7, kinds: 13 },
  { name: "银河漫游", rows: 9, cols: 18, baseKinds: 7, kinds: 14 },
  { name: "彗星奇遇", rows: 9, cols: 20, baseKinds: 8, kinds: 16 },
  { name: "璀璨星河", rows: 10, cols: 20, baseKinds: 8, kinds: 17 },
  { name: "星云秘境", rows: 10, cols: 22, baseKinds: 8, kinds: 19 },
  { name: "量子晶宫", rows: 11, cols: 22, baseKinds: 8, kinds: 21 },
  { name: "时光星港", rows: 11, cols: 24, baseKinds: 8, kinds: 23 },
  { name: "超新星域", rows: 12, cols: 24, baseKinds: 8, kinds: 25 },
  { name: "宇宙之心", rows: 12, cols: 26, baseKinds: 8, kinds: 27 },
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
export function levelGemKinds(level: number): number[] {
  const config = LEVELS[level - 1];
  if (!config) throw new Error("关卡应为 1 至 15");
  return [...Array.from({ length: config.baseKinds }, (_, i) => i),
    ...Array.from({ length: config.kinds - config.baseKinds }, (_, i) => 8 + i)];
}
export function adjacentPairs(board: Board) {
  return board.tiles.reduce<number>((count, kind, index) => count + (kind === null ? 0 :
    Number(index % board.cols < board.cols - 1 && kind === board.tiles[index + 1])
    + Number(index + board.cols < board.tiles.length && kind === board.tiles[index + board.cols])), 0);
}
export function createBoard(level: number, random = Math.random): Board {
  const config = LEVELS[level - 1];
  if (!config) throw new Error("关卡应为 1 至 15");
  const kinds = levelGemKinds(level);
  const tiles = Array.from({ length: config.rows * config.cols }, (_, i) => kinds[Math.floor(i / 2) % kinds.length]);
  let board = shuffleBoard({ rows: config.rows, cols: config.cols, tiles }, random);
  // Compare a bounded set of valid deals to avoid large clusters of identical neighbours.
  if (level > 1) for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = shuffleBoard({ rows: config.rows, cols: config.cols, tiles }, random);
    if (adjacentPairs(candidate) < adjacentPairs(board)) board = candidate;
  }
  return board;
}
export function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export type Completion = {
  id: string; rulesVersion: 5; level: number; durationMs: number; hints: number; shuffles: number; pairCount: number;
};
export type RecordEntry = Omit<Completion, "rulesVersion"> & { rulesVersion: 1 | 2 | 3 | 4 | 5; rewardStatus: "legacy" | "pending" | "granted"; createdAt: string; updatedAt: string };
export function rankRecords(records: RecordEntry[], level: number) {
  return records.filter(record => record.level === level && record.rulesVersion === RULES_VERSION)
    .sort((a, b) => a.durationMs - b.durationMs || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
