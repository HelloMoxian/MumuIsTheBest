import { PICTURES } from "./pictures";

export const STORAGE_KEY = "mumu:sliding-puzzle:v1";
export const SHUFFLE_STEPS = 50;
export type Slide = { from: number; empty: number };
export type Puzzle = {
  schemaVersion: 1; id: string; createdAt: string; updatedAt: string;
  rows: number; cols: number; imageId: string; cropX: number; cropY: number;
  cells: number[]; shuffle: Slide[]; history: Slide[]; completedAt: string | null;
};
export const solvedCells = (rows: number, cols: number) => Array.from({ length: rows * cols }, (_, i) => (i + 1) % (rows * cols));
export const isSolved = (cells: number[]) => cells.every((tile, i) => tile === (i + 1) % cells.length);
export const validSize = (value: number) => Number.isInteger(value) && value >= 2 && value <= 6;
export function movable(cells: number[], cols: number, from: number): boolean {
  const empty = cells.indexOf(0);
  return Number.isInteger(from) && from >= 0 && from < cells.length && from !== empty
    && (Math.floor(from / cols) === Math.floor(empty / cols) || from % cols === empty % cols);
}
/** Shift every intervening tile by exactly one cell, preserving its order. */
export function slide(cells: number[], cols: number, from: number): number[] {
  if (!movable(cells, cols, from)) return cells;
  const next = [...cells], empty = cells.indexOf(0);
  const stride = Math.floor(from / cols) === Math.floor(empty / cols) ? Math.sign(from - empty) : Math.sign(from - empty) * cols;
  for (let i = empty; i !== from; i += stride) next[i] = cells[i + stride];
  next[from] = 0;
  return next;
}
export function scramble(rows: number, cols: number, random = Math.random) {
  let cells = solvedCells(rows, cols);
  const moves: Slide[] = [];
  for (let i = 0; i < SHUFFLE_STEPS; i++) {
    const empty = cells.indexOf(0);
    const candidates = cells.map((_, index) => index).filter(index =>
      movable(cells, cols, index) && index !== moves.at(-1)?.empty
      && (i < SHUFFLE_STEPS - 1 || !isSolved(slide(cells, cols, index))));
    const from = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
    moves.push({ from, empty });
    cells = slide(cells, cols, from);
  }
  return { cells, moves };
}
export function createPuzzle(rows: number, cols: number, imageId?: string): Puzzle {
  if (!validSize(rows) || !validSize(cols)) throw new Error("请选择 2—6 行、2—6 列");
  const picture = imageId ? PICTURES.find(p => p.id === imageId) : PICTURES[Math.floor(Math.random() * PICTURES.length)];
  if (!picture) throw new Error("图片不存在");
  const { cells, moves } = scramble(rows, cols);
  const now = new Date().toISOString();
  return { schemaVersion: 1, id: crypto.randomUUID(), createdAt: now, updatedAt: now, rows, cols,
    imageId: picture.id, cropX: Math.random(), cropY: Math.random(), cells, shuffle: moves, history: [], completedAt: null };
}
export function play(puzzle: Puzzle, from: number): Puzzle {
  const cells = slide(puzzle.cells, puzzle.cols, from);
  if (cells === puzzle.cells || isSolved(puzzle.cells)) return puzzle;
  const now = new Date().toISOString();
  return { ...puzzle, cells, updatedAt: now,
    history: [...puzzle.history, { from, empty: puzzle.cells.indexOf(0) }],
    completedAt: puzzle.completedAt ?? (isSolved(cells) ? now : null) };
}
export function undo(puzzle: Puzzle): Puzzle {
  const last = puzzle.history.at(-1);
  if (!last) return puzzle;
  return { ...puzzle, cells: slide(puzzle.cells, puzzle.cols, last.empty),
    history: puzzle.history.slice(0, -1), updatedAt: new Date().toISOString() };
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
/** Replay both histories, so corrupt or impossible cached states never silently overwrite a game. */
export function parsePuzzle(value: unknown): Puzzle {
  if (!record(value) || value.schemaVersion !== 1) throw new Error("存档版本暂不支持");
  const p = value;
  if (typeof p.rows !== "number" || !validSize(p.rows) || typeof p.cols !== "number" || !validSize(p.cols)
    || typeof p.id !== "string" || !p.id || !date(p.createdAt) || !date(p.updatedAt)
    || !PICTURES.some(image => image.id === p.imageId)
    || typeof p.cropX !== "number" || !Number.isFinite(p.cropX) || p.cropX < 0 || p.cropX > 1
    || typeof p.cropY !== "number" || !Number.isFinite(p.cropY) || p.cropY < 0 || p.cropY > 1
    || (p.completedAt !== null && !date(p.completedAt))
    || !Array.isArray(p.cells) || p.cells.length !== p.rows * p.cols
    || !Array.isArray(p.shuffle) || ![SHUFFLE_STEPS, 200].includes(p.shuffle.length)
    || !Array.isArray(p.history)) throw new Error("存档内容不完整");
  let replay = solvedCells(p.rows, p.cols);
  for (const step of [...p.shuffle, ...p.history]) {
    if (!record(step) || typeof step.from !== "number" || step.empty !== replay.indexOf(0)
      || !movable(replay, p.cols, step.from)) throw new Error("移动记录不完整");
    replay = slide(replay, p.cols, step.from);
  }
  if (!replay.every((v, i) => v === (p.cells as unknown[])[i])
    || (isSolved(replay) && p.completedAt === null)) throw new Error("棋盘与记录不一致");
  return p as Puzzle;
}
