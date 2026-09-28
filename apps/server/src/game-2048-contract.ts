// Pure shared contract: cells store powers of two (0 means empty), never floats.
export type BoardSize = 4 | 5 | 6;
export type Game2048 = { cells: number[]; score: string; best: string; spawnPower: number };
export type State2048 = { schemaVersion: 1; activeSize: BoardSize; games: Record<BoardSize, Game2048> };
export const BOARD_SIZES = [4, 5, 6] as const;

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const decimal = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9][0-9]*)$/.test(v) && v.length <= 4096;

export function parse2048(value: unknown): State2048 | undefined {
  if (!record(value) || value.schemaVersion !== 1 || !BOARD_SIZES.includes(value.activeSize as BoardSize) || !record(value.games)) return;
  for (const size of BOARD_SIZES) {
    const game = value.games[size];
    if (!record(game) || !Array.isArray(game.cells) || game.cells.length !== size * size
      || !game.cells.every(p => Number.isSafeInteger(p) && p >= 0 && p <= 10000)
      || game.cells.filter(p => p > 0).length < 2
      || !decimal(game.score) || !decimal(game.best) || BigInt(game.best) < BigInt(game.score)
      || !Number.isSafeInteger(game.spawnPower) || (game.spawnPower as number) < 1
      || (game.spawnPower as number) > Math.max(1, Math.max(...game.cells) - 12)
      || game.cells.some(p => p > 0 && p < (game.spawnPower as number))) return;
  }
  return value as State2048;
}

export function merge2048Best(current: State2048 | undefined, next: State2048): State2048 {
  const games = { ...next.games };
  for (const size of BOARD_SIZES) {
    const best = current?.games[size].best ?? "0";
    games[size] = { ...games[size], best: BigInt(best) > BigInt(games[size].best) ? best : games[size].best };
  }
  return { ...next, games };
}
