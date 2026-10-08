export const SIZE = 15;
export type Stone = 1 | 2;
export type Game = { cells: (Stone | null)[]; turn: Stone; moves: number[]; winning: number[]; draw: boolean };
export const newGame = (): Game => ({ cells: Array(SIZE * SIZE).fill(null), turn: 1, moves: [], winning: [], draw: false });

/** Freestyle rules: five or more consecutive stones, with no forbidden moves. */
export function place(game: Game, index: number): Game {
  if (!Number.isInteger(index) || index < 0 || index >= SIZE * SIZE || game.cells[index] || game.winning.length || game.draw) return game;
  const cells = [...game.cells];
  cells[index] = game.turn;
  const row = Math.floor(index / SIZE), col = index % SIZE;
  let winning: number[] = [];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [index];
    for (const sign of [-1, 1]) {
      for (let step = 1; step < SIZE; step++) {
        const r = row + dr * step * sign, c = col + dc * step * sign;
        if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || cells[r * SIZE + c] !== game.turn) break;
        if (sign < 0) line.unshift(r * SIZE + c); else line.push(r * SIZE + c);
      }
    }
    if (line.length >= 5) {
      // Keep exactly five highlighted stones, always including the final move.
      const start = Math.min(Math.max(0, line.indexOf(index) - 2), line.length - 5);
      winning = line.slice(start, start + 5);
      break;
    }
  }
  const moves = [...game.moves, index];
  return { cells, moves, winning, draw: !winning.length && moves.length === SIZE * SIZE, turn: winning.length ? game.turn : game.turn === 1 ? 2 : 1 };
}
export function moveCursor(index: number, dr: number, dc: number) {
  return Math.max(0, Math.min(SIZE - 1, Math.floor(index / SIZE) + dr)) * SIZE + Math.max(0, Math.min(SIZE - 1, index % SIZE + dc));
}
