import assert from "node:assert/strict";
import { test } from "node:test";
import { addTile, canMove, move, newGame, newState, parse2048, tileValue, type Game2048 } from "./logic";
const game = (cells: number[], score = "0"): Game2048 => ({ cells: [...cells, ...Array(16 - cells.length).fill(0)], score, best: score, spawnPower: 1 });
test("merges each tile once, scores exactly and does not spawn on unchanged moves", () => {
  const result = move(game([1, 1, 1, 1]), 4, "left", () => 0);
  assert.deepEqual(result.game.cells.slice(0, 4), [2, 2, 1, 0]);
  assert.equal(result.game.score, "8");
  const original = game([1, 2]);
  assert.equal(move(original, 4, "left").game, original);
  const huge = move(game([60, 60]), 4, "left", () => 0);
  assert.equal(huge.game.score, "2305843009213693952");
  assert.equal(tileValue(70), "1180591620717411303424");
});
test("all four directions and all sizes merge toward the requested edge", () => {
  for (const size of [4, 5, 6] as const) {
    const base = newGame(size);
    base.cells = Array(size * size).fill(0); base.cells[0] = 1; base.cells[1] = 1;
    assert.equal(move(base, size, "right", () => 0).game.cells[size - 1], 2);
    base.cells[1] = 0; base.cells[size] = 1;
    assert.equal(move(base, size, "up", () => 0).game.cells[0], 2);
    assert.equal(move(base, size, "down", () => 0).game.cells[size * (size - 1)], 2);
  }
});
test("promotion waits for the lowest tile to disappear and repeats at doubled thresholds", () => {
  assert.equal(addTile(game([14, 1]), () => 0).spawnPower, 1);
  assert.equal(addTile(game([13, 2]), () => 0).spawnPower, 1);
  const promoted = addTile(game([14, 2]), () => 0);
  assert.equal(promoted.spawnPower, 2);
  assert.equal(promoted.cells[2], 2);
  assert.equal(addTile({ ...game([15, 3]), spawnPower: 2 }, () => 0).spawnPower, 3);
  const state = newState(); state.games[4] = promoted;
  assert.ok(parse2048(state));
});
test("a full board ends only without adjacent equals; reaching 2048 keeps playing", () => {
  const full = game([1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1]);
  assert.equal(canMove(full, 4), false);
  full.cells[1] = 1; assert.equal(canMove(full, 4), true);
  assert.equal(canMove(game([11, 1]), 4), true);
});
test("state validates empty input, future versions, malformed cells and scores", () => {
  assert.equal(parse2048(null), undefined);
  assert.ok(parse2048(newState()));
  assert.equal(parse2048({ ...newState(), schemaVersion: 2 }), undefined);
  const state = newState(); state.games[4].score = "1e+21";
  assert.equal(parse2048(state), undefined);
  state.games[4] = game([1.2, 2]); assert.equal(parse2048(state), undefined);
});

test("animation paths preserve both merge sources and every moving tile", () => {
  const result = move(game([0, 1, 1, 2]), 4, "left", () => 0);
  assert.deepEqual(result.movements, [
    { from: 1, to: 0, power: 1 }, { from: 2, to: 0, power: 1 },
    { from: 3, to: 1, power: 2 },
  ]);
  assert.deepEqual(result.merged, [0]);
  // A second move is evaluated immediately, without waiting for animation.
  const next = move(result.game, 4, "right", () => 0);
  assert.equal(next.game.score, "12");
  assert.deepEqual(next.movements.slice(0, 3), [
    { from: 2, to: 3, power: 1 }, { from: 1, to: 2, power: 2 },
    { from: 0, to: 2, power: 2 },
  ]);
  assert.deepEqual(move(game([1, 2]), 4, "left").movements, []);
});
