import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMON_ELEMENT_COLORS,
  getReactionElementTheme,
} from "./element-colors";

test("十种常见元素使用约定的明暗与色相", () => {
  const expectedColors = {
    H: "#b8e8ff",
    C: "#4f5565",
    N: "#3657c8",
    O: "#168f5f",
    Na: "#a93a4e",
    Ca: "#ff9aae",
    F: "#c7a7ff",
    Cl: "#6e3baa",
    S: "#f3d44e",
    K: "#f39a38",
  } as const;
  const symbols = Object.keys(expectedColors) as Array<keyof typeof expectedColors>;
  const themes = symbols.map(getReactionElementTheme);

  assert.deepEqual(COMMON_ELEMENT_COLORS, expectedColors);
  assert.deepEqual(
    themes.map((theme) => theme.color),
    symbols.map((symbol) => expectedColors[symbol]),
  );
  assert.equal(new Set(themes.map((theme) => theme.color)).size, symbols.length);
});
