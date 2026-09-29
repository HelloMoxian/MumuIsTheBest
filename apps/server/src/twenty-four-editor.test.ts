import assert from "node:assert/strict";
import test from "node:test";
import { canGroup, editorFromBoard, editorResult, emptyEditor, isEditor, isLegacyEditor, normalizeEditor, parseEditor } from "./twenty-four-editor.js";
import { bracketDepth, formatExpression, formatFraction, generatePuzzle, isSolved, initialBoard, type Expression } from "./twenty-four-engine.js";
test("空白起步，数字与运算都必须填齐；单层括号保持优先级与精确分数", () => {
  const blank = emptyEditor();
  assert.deepEqual(blank.slots, [null, null, null, null]);
  assert.deepEqual(blank.operators, [null, null, null]);
  assert(isEditor(blank)); assert.throws(() => parseEditor(blank), /四个数字/);
  assert.throws(() => parseEditor({ ...blank, slots: [0, 1, 2, 3] }), /三个运算符/);
  const e = { ...blank, slots: [0, 1, 2, 3] }, cards = [8, 3, 8, 3, 0, 11, 12, 13];
  assert.equal(formatFraction(editorResult({ ...e, operators: ["+", "*", "-"] }, cards)), "29");
  assert.equal(formatFraction(editorResult({ ...e, operators: ["/", "*", "/"] }, cards)), "64/9");
  const solution = { ...e, operators: ["/", "-", "/"] as const, groups: [{ start: 1, end: 3 }] };
  const node = parseEditor({ ...solution, operators: [...solution.operators] });
  assert(isSolved(node, cards)); assert.equal(formatExpression(node, cards), "8 ÷ (3 − 8 ÷ 3)");
  const pairs = { ...e, operators: ["+", "*", "-"] as ("+" | "*" | "-")[], groups: [{ start: 0, end: 1 }, { start: 2, end: 3 }] };
  assert.equal(formatFraction(editorResult(pairs, cards)), "55");
});
test("拒绝所有套括号和交叉；半括号可以保存但不能提交", () => {
  const e = { ...emptyEditor(), slots: [0, 1, 2, 3], operators: ["+", "+", "+"] as "+"[] };
  assert(isEditor({ ...e, pendingStart: 0 })); assert.throws(() => parseEditor({ ...e, pendingStart: 0 }), /右括号/);
  for (const groups of [
    [{ start: 0, end: 1 }, { start: 0, end: 2 }], [{ start: 1, end: 2 }, { start: 0, end: 3 }],
    [{ start: 1, end: 2 }, { start: 1, end: 3 }], [{ start: 0, end: 2 }, { start: 1, end: 3 }],
  ]) assert(!isEditor({ ...e, groups }));
  assert(!isEditor({ ...e, slots: [0, 0, 2, 3] }));
  assert(!isEditor({ ...e, operators: ["+", "^", "*"] }));
  assert(!isEditor({ ...e, version: 3 })); assert(!isEditor({ ...e, version: "2" }));
  assert(!canGroup([{ start: 0, end: 1 }], 1, 2)); assert(!canGroup([], 2, 2));
  assert(canGroup([{ start: 0, end: 1 }], 2, 3));
  assert.throws(() => editorResult({ ...e, operators: ["/", "+", "+"] }, [1, 0, 2, 3, 4, 5, 6, 7]), /除数/);
});
test("160 个随机题及保底题的参考解，最多单层且可在编辑器原样作答", () => {
  let seed = 41;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (const rng of [...Array.from({ length: 160 }, () => random), () => 0, () => .99999]) {
    const puzzle = generatePuzzle(rng), e = editorFromBoard([puzzle.solution]);
    assert(bracketDepth(puzzle.solution) <= 1); assert(isEditor(e)); assert(isSolved(parseEditor(e), puzzle.cards));
    let depth = 0;
    for (const char of formatExpression(puzzle.solution, puzzle.cards)) { if (char === "(") depth++; if (char === ")") depth--; assert(depth >= 0 && depth <= 1); }
    assert.equal(depth, 0);
  }
});
test("旧编辑器移除冗余嵌套但保持原值；不可简化时保留源对象并给出空白编辑器", () => {
  const old = { version: 1 as const, slots: [0, 1, 2, 3], operators: ["+", "*", "-"] as ("+" | "*" | "-")[], groups: [{ start: 0, end: 1 }, { start: 0, end: 2 }], pendingStart: null };
  assert(isLegacyEditor(old)); const snapshot = JSON.stringify(old);
  const e = normalizeEditor(old, initialBoard());
  assert(isEditor(e)); assert.equal(formatFraction(editorResult(e, [2, 3, 4, 5, 6, 7, 8, 9])), "15");
  assert.equal(JSON.stringify(old), snapshot);
  const nested = { ...old, operators: ["/", "-", "-"] as ("/" | "-")[], groups: [{ start: 1, end: 3 }, { start: 2, end: 3 }] };
  assert(isLegacyEditor(nested)); assert.deepEqual(normalizeEditor(nested, initialBoard()), emptyEditor());
  const block: Expression = { op: "-", left: { card: 5 }, right: { card: 1 } };
  assert.deepEqual(editorFromBoard([block, ...initialBoard().filter(n => "card" in n && n.card !== 5 && n.card !== 1)]).slots.slice(0, 2), [5, 1]);
});
