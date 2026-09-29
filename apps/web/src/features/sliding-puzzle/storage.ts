import { parsePuzzle, STORAGE_KEY, type Puzzle } from "./logic";
type StoragePort = Pick<Storage, "getItem" | "setItem">;
export class PuzzleConflict extends Error {}
export function readPuzzle(storage: StoragePort): { raw: string | null; puzzle: Puzzle | null } {
  const raw = storage.getItem(STORAGE_KEY);
  return { raw, puzzle: raw === null ? null : parsePuzzle(JSON.parse(raw)) };
}
export function savePuzzle(storage: StoragePort, puzzle: Puzzle, expected: string | null, replace = false): string {
  if (!replace && storage.getItem(STORAGE_KEY) !== expected) throw new PuzzleConflict("另一页面更新了进度，请重新读取");
  const raw = JSON.stringify(puzzle);
  // localStorage replaces the whole value atomically; a quota error leaves the old value intact.
  storage.setItem(STORAGE_KEY, raw);
  return raw;
}
