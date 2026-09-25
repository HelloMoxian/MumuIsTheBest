import assert from "node:assert/strict";
import test from "node:test";
import { act, createGame } from "./logic";
import { TetrisHeldInput } from "./input";

test("双人同时按住移动各自连发，松开一人不会停止另一人", () => {
  const input = new TetrisHeldInput();
  assert.equal(input.press("ArrowLeft", 0), true);
  assert.equal(input.press("KeyD", 0), true);
  assert.equal(input.press("KeyJ", 30), true);
  assert.equal(input.press("KeyN", 30), true);
  assert.equal(input.press("ArrowLeft", 20), false);
  assert.deepEqual(input.repeat(169), []);
  assert.deepEqual(input.repeat(170), [[1, "left"], [0, "right"]]);
  input.release("ArrowLeft");
  assert.deepEqual(input.repeat(245), [[0, "right"]]);
  input.clear();
  assert.deepEqual(input.repeat(5000), []);
});

test("下移与水平移动各有节奏；旋转直落不因按住反复触发", () => {
  const input = new TetrisHeldInput();
  for (const code of ["ArrowDown", "KeyA", "KeyN", "KeyK", "Enter", "KeyE"]) input.press(code, 0);
  assert.deepEqual(input.repeat(170), [[1, "down"], [0, "left"]]);
  assert.deepEqual(input.repeat(220), [[1, "down"]]);
  assert.deepEqual(input.repeat(245), [[0, "left"]]);
  input.release("Enter");
  assert.equal(input.press("Enter", 250), true);
  assert.equal(input.press("Tab", 250), false);
  assert.equal(input.press("ArrowUp", 250), false);
  assert.equal(input.press("KeyW", 250), true);
});

test("长按只影响按下时的积木；松开重按后恢复，左右不受影响", () => {
  const input = new TetrisHeldInput();
  input.press("KeyS", 0, 4);
  input.press("KeyA", 0, 4);
  assert.deepEqual(input.repeat(170, [4, 0]), [[0, "down"], [0, "left"]]);
  assert.deepEqual(input.repeat(250, [5, 0]), [[0, "left"]]);
  assert.equal(input.press("KeyS", 300, 5), false);
  input.release("KeyS");
  assert.equal(input.press("KeyS", 300, 5), true);
  assert.ok(input.repeat(470, [5, 0]).some(([, action]) => action === "down"));
});

test("自定义键、触控按住、消行期间按住均遵循积木身份", () => {
  const input = new TetrisHeldInput({ KeyF: [0, "down"] });
  assert.equal(input.press("KeyS", 0), false);
  input.press("KeyF", 0, 2);
  input.press("pointer-1", 0, 7, [1, "down"]);
  assert.deepEqual(input.repeat(170, [2, 7]), [[0, "down"], [1, "down"]]);
  assert.deepEqual(input.repeat(220, [3, 7]), [[1, "down"]]);
  input.clear();
  input.press("KeyF", 300, -1);
  assert.deepEqual(input.repeat(500, [3, 7]), []);
});

test("持续下落固定一块后下一块保持出生位置，多输入来源不越过保护", () => {
  const game = createGame({ initialSpeed: 0, speedIncrement: 0 }, 4);
  const input = new TetrisHeldInput();
  input.press("KeyS", 0, game.pieceId);
  input.press("pointer-1", 0, game.pieceId, [0, "down"]);
  for (let now = 170; now < 6000; now += 50) {
    for (const [, action] of input.repeat(now, [game.pieceId])) act(game, action);
  }
  assert.equal(game.pieceId, 1);
  assert.equal(game.piece.y, 0);
  input.release("KeyS");
  input.press("KeyS", 6000, game.pieceId);
  for (const [, action] of input.repeat(6170, [game.pieceId])) act(game, action);
  assert.equal(game.piece.y, 1);
  act(game, "drop");
  assert.deepEqual(input.repeat(7000, [game.pieceId]), []);
});
