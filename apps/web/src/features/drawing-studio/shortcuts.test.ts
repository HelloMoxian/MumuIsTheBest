import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRAWING_TOOL_SHORTCUTS,
  drawingToolForShortcut,
} from "./shortcuts";

describe("drawing studio tool shortcuts", () => {
  it("uses familiar single-key image-editor shortcuts", () => {
    assert.deepEqual(DRAWING_TOOL_SHORTCUTS, {
      select: "V",
      pan: "H",
      shape: "U",
      solid: "D",
      sticker: "K",
      preset: "P",
      brush: "B",
      eraser: "E",
      fill: "G",
    });
    assert.equal(drawingToolForShortcut("b"), "brush");
    assert.equal(drawingToolForShortcut("V"), "select");
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
