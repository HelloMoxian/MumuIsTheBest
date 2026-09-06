import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRAWING_TOOL_SHORTCUTS,
  drawingToolForShortcut,
  arrowMovement,
  spatialNavigationIndex,
} from "./shortcuts";

describe("drawing studio tool shortcuts", () => {
  it("moves by one canvas pixel initially and ten pixels on key repeat", () => {
    assert.deepEqual(arrowMovement("ArrowLeft", false), { x: -1, y: 0 });
    assert.deepEqual(arrowMovement("ArrowRight", true), { x: 10, y: 0 });
    assert.deepEqual(arrowMovement("ArrowDown", false), { x: 0, y: 1 });
    assert.deepEqual(arrowMovement("ArrowUp", true), { x: 0, y: -10 });
    assert.equal(arrowMovement("Enter", false), null);
  });

  it("follows actual wrapped rows and columns rather than linear DOM order", () => {
    const grid = Array.from({ length: 6 }, (_, index) => ({
      left: (index % 2) * 120, top: Math.floor(index / 2) * 40, width: 110, height: 34,
    }));
    assert.equal(spatialNavigationIndex(grid, 0, "ArrowDown"), 2);
    assert.equal(spatialNavigationIndex(grid, 2, "ArrowRight"), 3);
    assert.equal(spatialNavigationIndex(grid, 3, "ArrowUp"), 1);
    assert.equal(spatialNavigationIndex(grid, 0, "ArrowLeft"), 0);
    assert.equal(spatialNavigationIndex(grid, 5, "ArrowDown"), 5);
    const wrapped = [
      { left: 0, top: 0, width: 70, height: 48 },
      { left: 78, top: 0, width: 130, height: 48 },
      { left: 0, top: 56, width: 130, height: 48 },
    ];
    assert.equal(spatialNavigationIndex(wrapped, 1, "ArrowDown"), 2);
    assert.equal(spatialNavigationIndex(wrapped, 2, "ArrowUp"), 0);
  });
  it("uses familiar single-key image-editor shortcuts", () => {
    assert.deepEqual(DRAWING_TOOL_SHORTCUTS, {
      select: "V",
      pan: "H",
      shape: "U",
      solid: "D",
      sticker: "K",
      preset: "P",
      text: "T",
      brush: "B",
      eraser: "E",
      fill: "G",
    });
    assert.equal(drawingToolForShortcut("b"), "brush");
    assert.equal(drawingToolForShortcut("V"), "select");
    for (const [tool, key] of Object.entries(DRAWING_TOOL_SHORTCUTS)) {
      assert.equal(drawingToolForShortcut(key.toLowerCase()), tool);
      assert.equal(drawingToolForShortcut("Unidentified", { code: `Key${key}` }), tool);
    }
    assert.equal(drawingToolForShortcut("Process", { code: "KeyT", isComposing: true }), undefined);
  });

  it("does not take over modified, repeated, or context-blocked key presses", () => {
    assert.equal(drawingToolForShortcut("b", { ctrlKey: true }), undefined);
    assert.equal(drawingToolForShortcut("b", { metaKey: true }), undefined);
    assert.equal(drawingToolForShortcut("b", { altKey: true }), undefined);
    assert.equal(drawingToolForShortcut("b", { repeat: true }), undefined);
    assert.equal(drawingToolForShortcut("b", { blocked: true }), undefined);
    assert.equal(drawingToolForShortcut("Backspace"), undefined);
  });
});
