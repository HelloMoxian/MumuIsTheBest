import { BOARD_SIZES, type BoardSize, type Game2048, type State2048 } from "../../../../server/src/game-2048-contract";
export { BOARD_SIZES, parse2048 } from "../../../../server/src/game-2048-contract";
export type { BoardSize, Game2048, State2048 } from "../../../../server/src/game-2048-contract";
export type Direction = "left" | "right" | "up" | "down";
export type TileMovement = { from: number; to: number; power: number };
export const tileValue = (power: number) => (2n ** BigInt(power)).toString();

// Fixed, readable domain colours: pale yellow → orange → red → deep blue → black.
// Precomputed linear RGB interpolation between powers 1, 4, 7, 10, 15, 20.
// In particular, powers 10→15 change by (-19.8, +2, +3) per step before rounding.
export const TILE_STYLES = [
  ["#fff0b3", "#493416"], ["#ffd68f", "#493416"],
  ["#ffbd6a", "#493016"], ["#ffa346", "#432718"],
  ["#ee7e42", "#351b12"], ["#de5a3d", "#271210"],
  ["#cd3539", "#ffffff"], ["#af2b34", "#ffffff"],
  ["#922230", "#ffffff"], ["#74182b", "#ffffff"],
  ["#601a2e", "#ffffff"], ["#4c1c31", "#ffffff"],
  ["#391e34", "#ffffff"], ["#252037", "#ffffff"],
  ["#11223a", "#ffffff"], ["#0f1d31", "#ffffff"],
  ["#0d1828", "#ffffff"], ["#0c1420", "#ffffff"],
  ["#0a0f17", "#ffffff"], ["#080a0e", "#ffffff"],
] as const;

export function addTile(game: Game2048, random = Math.random): Game2048 {
  const cells = [...game.cells];
  let spawnPower = game.spawnPower;
  const peak = Math.max(...cells);
  while (peak >= spawnPower + 13 && !cells.includes(spawnPower)) spawnPower += 1;
  const empty = cells.flatMap((cell, index) => cell === 0 ? [index] : []);
  if (empty.length) cells[empty[Math.floor(random() * empty.length)]] = spawnPower + (random() < 0.9 ? 0 : 1);
  return { ...game, cells, spawnPower };
}

export function newGame(size: BoardSize, best = "0", random = Math.random): Game2048 {
  return addTile(addTile({ cells: Array<number>(size * size).fill(0), score: "0", best, spawnPower: 1 }, random), random);
}
export function newState(): State2048 {
  return { schemaVersion: 1, activeSize: 4, games: Object.fromEntries(BOARD_SIZES.map(size => [size, newGame(size)])) as State2048["games"] };
}

export function move(game: Game2048, size: BoardSize, direction: Direction, random = Math.random) {
  const cells = [...game.cells];
  const merged: number[] = [];
  const movements: TileMovement[] = [];
  let gained = 0n;
  for (let line = 0; line < size; line++) {
    const positions = Array.from({ length: size }, (_, i) => {
      const offset = direction === "right" || direction === "down" ? size - i - 1 : i;
      return direction === "left" || direction === "right" ? line * size + offset : offset * size + line;
    });
    const sources = positions.filter(i => game.cells[i] > 0);
    const values = sources.map(i => game.cells[i]);
    const output: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const to = positions[output.length];
      movements.push({ from: sources[i], to, power: values[i] });
      if (values[i] === values[i + 1]) {
        movements.push({ from: sources[i + 1], to, power: values[i + 1] });
        const power = values[i] + 1;
        merged.push(positions[output.length]);
        output.push(power);
        gained += 2n ** BigInt(power);
        i++;
      } else output.push(values[i]);
    }
    positions.forEach((position, i) => { cells[position] = output[i] ?? 0; });
  }
  if (cells.every((value, i) => value === game.cells[i])) return { game, merged: [], movements: [], gained: "0" };
  const score = BigInt(game.score) + gained;
  return {
    game: addTile({ ...game, cells, score: score.toString(), best: (score > BigInt(game.best) ? score : BigInt(game.best)).toString() }, random),
    merged, movements, gained: gained.toString(),
  };
}

export function canMove(game: Game2048, size: BoardSize) {
  return game.cells.some((value, i) => value === 0
    || (i % size < size - 1 && value === game.cells[i + 1])
    || (i + size < game.cells.length && value === game.cells[i + size]));
}
