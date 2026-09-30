import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_GLOBAL_GAMEPAD_BINDINGS, chooseSpatialIndex, isNumericDraft, moveGridIndex, nextSteppedValue, parseGlobalGamepadBindings, spatialNavigationScore, type NavigationRect } from "./gamepad-navigation";

const rect = (left: number, top: number, width = 80, height = 48): NavigationRect => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

test("spatial navigation rejects targets behind the requested direction", () => {
  assert.equal(spatialNavigationScore(rect(100, 100), rect(0, 100), "right"), Infinity);
  assert.equal(spatialNavigationScore(rect(100, 100), rect(100, 0), "down"), Infinity);
});

test("spatial navigation prefers an aligned target over a diagonal target", () => {
  const rectangles = [rect(100, 100), rect(210, 104), rect(155, 190), rect(20, 102)];
  assert.equal(chooseSpatialIndex(0, rectangles, "right"), 1);
  assert.equal(chooseSpatialIndex(0, rectangles, "down"), 2);
  assert.equal(chooseSpatialIndex(0, rectangles, "left"), 3);
});

test("numeric keypad grid never leaves its valid cells", () => {
  assert.equal(moveGridIndex(0, "left", 4, 16), 0);
  assert.equal(moveGridIndex(0, "up", 4, 16), 0);
  assert.equal(moveGridIndex(3, "right", 4, 16), 3);
  assert.equal(moveGridIndex(3, "down", 4, 16), 7);
  assert.equal(moveGridIndex(15, "down", 4, 16), 15);
});

test("stepped controls clamp and preserve decimal precision", () => {
  assert.equal(nextSteppedValue(.9, "right", { min: 0, max: 1, step: .05 }), .95);
  assert.equal(nextSteppedValue(.98, "right", { min: 0, max: 1, step: .05 }), 1);
  assert.equal(nextSteppedValue(0, "left", { min: 0, max: 100, step: 10 }), 0);
});

test("numeric drafts allow useful intermediate states but reject malformed values", () => {
  ["", "-", ".", "-.5", "0", "12", "12.5"].forEach(value => assert.equal(isNumericDraft(value), true, value));
  ["--1", "1.2.3", "abc", "1-"].forEach(value => assert.equal(isNumericDraft(value), false, value));
});

test("global bindings add a default column key, migrate v1, and reject corrupt caches", () => {
  assert.equal(DEFAULT_GLOBAL_GAMEPAD_BINDINGS.fullscreenEnter, DEFAULT_GLOBAL_GAMEPAD_BINDINGS.fullscreenExit);
  assert.equal(DEFAULT_GLOBAL_GAMEPAD_BINDINGS.columnSwitch, 5);
  assert.deepEqual(parseGlobalGamepadBindings(DEFAULT_GLOBAL_GAMEPAD_BINDINGS), DEFAULT_GLOBAL_GAMEPAD_BINDINGS);
  assert.deepEqual(parseGlobalGamepadBindings({
    schemaVersion: 1, accept: 0, back: 1, fullscreenEnter: 10, fullscreenExit: 10,
  }), DEFAULT_GLOBAL_GAMEPAD_BINDINGS);
  assert.equal(parseGlobalGamepadBindings({ ...DEFAULT_GLOBAL_GAMEPAD_BINDINGS, accept: -1 }), null);
  assert.equal(parseGlobalGamepadBindings({ ...DEFAULT_GLOBAL_GAMEPAD_BINDINGS, columnSwitch: 40 }), null);
  assert.equal(parseGlobalGamepadBindings({ ...DEFAULT_GLOBAL_GAMEPAD_BINDINGS, schemaVersion: 3 }), null);
});
