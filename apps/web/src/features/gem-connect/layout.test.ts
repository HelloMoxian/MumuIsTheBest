import assert from "node:assert/strict";
import test from "node:test";
import { displayIndex, displayPoint, fitBoard, logicalIndex } from "./layout";
import { LEVELS, findPath } from "./logic";

test("十关在横屏、竖屏、小窗口及全屏剩余空间内完整显示，含外缘连线", () => {
  for (const [width, height] of [[1440, 700], [1920, 980], [3840, 2080], [390, 540], [360, 360], [844, 260], [320, 180], [0, 0]]) {
    for (const level of LEVELS) {
      const layout = fitBoard(level.rows, level.cols, width, height);
      assert.ok(layout.cell >= 0);
      assert.ok((layout.cols + 2) * layout.cell <= width + .001);
      assert.ok((layout.rows + 2) * layout.cell <= height + .001);
      assert.equal(layout.rows * layout.cols, level.rows * level.cols);
      for (let i = 0; i < level.rows * level.cols; i++) {
        const index = displayIndex(i, level.cols, layout);
        assert.ok(index >= 0 && index < level.rows * level.cols);
        assert.equal(logicalIndex(index, level.cols, layout), i);
      }
    }
  }
  assert.equal(fitBoard(12, 15, 390, 700).transposed, true);
  assert.equal(fitBoard(12, 15, 1400, 700).transposed, false);
  assert.ok(fitBoard(12, 15, 3840, 2080).cell > 100, "大屏幕宝石随空间增大");
});
test("屏幕转置保留相邻关系和外缘路径，不改变正在消除的逻辑位置", () => {
  const board = { rows: 1, cols: 3, tiles: [0, 1, 0] };
  const path = findPath(board, 0, 2)!;
  const mapped = path.map(point => displayPoint(point, true));
  assert.deepEqual(mapped[0], { r: 0, c: 0 });
  assert.deepEqual(mapped.at(-1), { r: 2, c: 0 });
  for (let i = 1; i < mapped.length; i++) {
    assert.equal(Math.abs(mapped[i].r - mapped[i - 1].r) + Math.abs(mapped[i].c - mapped[i - 1].c), 1);
  }
  assert.deepEqual(board.tiles, [0, 1, 0]);
});
