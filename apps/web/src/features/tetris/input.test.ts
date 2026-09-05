import assert from "node:assert/strict";
import test from "node:test";
import { TetrisHeldInput } from "./input";

test("双人同时按住移动各自连发，松开一人不会停止另一人", () => {
  const input = new TetrisHeldInput();
  assert.equal(input.press("ArrowLeft", 0), true);
  assert.equal(input.press("KeyD", 0), true);
  assert.equal(input.press("KeyJ", 30), true);
  assert.equal(input.press("KeyN", 30), true);
  assert.equal(input.press("ArrowLeft", 20), false);
  assert.deepEqual(input.repeat(169), []);
  assert.deepEqual(input.repeat(170), [[0, "left"], [1, "right"]]);
  input.release("ArrowLeft");
  assert.deepEqual(input.repeat(245), [[1, "right"]]);
  input.clear();
  assert.deepEqual(input.repeat(5000), []);
});

test("下移与水平移动各有节奏；旋转直落不因按住反复触发", () => {
  const input = new TetrisHeldInput();
  for (const code of ["ArrowDown", "KeyA", "KeyN", "KeyK", "Enter", "KeyE"]) input.press(code, 0);
  assert.deepEqual(input.repeat(170), [[0, "down"], [1, "left"]]);
  assert.deepEqual(input.repeat(220), [[0, "down"]]);
  assert.deepEqual(input.repeat(245), [[1, "left"]]);
  input.release("Enter");
  assert.equal(input.press("Enter", 250), true);
  assert.equal(input.press("Tab", 250), false);
  assert.equal(input.press("ArrowUp", 250), false);
  assert.equal(input.press("KeyW", 250), false);
});
