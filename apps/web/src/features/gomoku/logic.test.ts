import test from "node:test";
import assert from "node:assert/strict";
import { SIZE, moveCursor, newGame, place } from "./logic";

test("black starts, turns alternate, occupied and invalid cells never change the board", () => {
  const start = newGame(), black = place(start, 112), white = place(black, 113);
  assert.equal(black.cells[112], 1); assert.equal(black.turn, 2);
  assert.equal(white.cells[113], 2); assert.equal(white.turn, 1);
  for (const index of [112, -1, 225, NaN, 1.5]) assert.equal(place(white, index), white);
  assert.equal(start.moves.length, 0);
});
test("all four lines win on the fifth move and finished games reject further moves", () => {
  for (const line of [[0, 1, 2, 3, 4], [0, 15, 30, 45, 60], [0, 16, 32, 48, 64], [14, 28, 42, 56, 70]]) {
    let game = newGame();
    line.forEach((index, step) => {
      game = place(game, index);
      if (step < 4) { assert.equal(game.winning.length, 0); game = place(game, 210 + step); }
    });
    assert.deepEqual(game.winning, line);
    assert.equal(game.turn, 1); assert.equal(place(game, 100), game);
  }
});
test("white can win; long lines highlight exactly five including the final move", () => {
  let game = newGame();
  for (let i = 0; i < 5; i++) { game = place(game, i * 2); game = place(game, 30 + i); }
  assert.equal(game.turn, 2); assert.deepEqual(game.winning, [30, 31, 32, 33, 34]);
  const long = newGame();
  for (const index of [60, 61, 62, 64, 65]) long.cells[index] = 1;
  const won = place(long, 63);
  assert.equal(won.winning.length, 5); assert.ok(won.winning.includes(63));
});
test("rows do not wrap and cursor clamps to board edges", () => {
  const game = newGame();
  for (const index of [13, 14, 15, 16]) game.cells[index] = 1;
  assert.equal(place(game, 17).winning.length, 0);
  assert.equal(moveCursor(0, -1, -1), 0);
  assert.equal(moveCursor(SIZE * SIZE - 1, 1, 1), SIZE * SIZE - 1);
});
test("a full board without a line is a draw", () => {
  const game = newGame();
  game.cells = game.cells.map((_, i) => (Math.floor(i / 15) + Math.floor((i % 15) / 2)) % 2 ? 1 : 2);
  game.cells[224] = null;
  game.moves = Array.from({ length: 224 }, (_, i) => i);
  game.turn = 2;
  const result = place(game, 224);
  assert.equal(result.draw, true); assert.equal(result.winning.length, 0);
  assert.equal(place(result, 224), result);
});
