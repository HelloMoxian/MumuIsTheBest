import assert from "node:assert/strict";
import test from "node:test";
import { ELEMENTS } from "../periodic-table/elements.generated";
import { parseFormula } from "../reaction-furnace/logic";
import { CONSERVATION_REACTIONS } from "./reaction-library";
import {
  balanceRows,
  canonicalGuess,
  createPuzzle,
  evaluateBalance,
  fillOneHint,
  flattenGuess,
  formatBalancedEquation,
  selectRandomReactions,
  validateReaction,
} from "./logic";

test("资料库包含大量常见且不重复的守恒反应", () => {
  assert.ok(CONSERVATION_REACTIONS.length >= 150);
  assert.equal(
    new Set(CONSERVATION_REACTIONS.map((reaction) => reaction.id)).size,
    CONSERVATION_REACTIONS.length,
  );
  const equations = CONSERVATION_REACTIONS.map(formatBalancedEquation);
  assert.equal(new Set(equations).size, equations.length);
  assert.ok(CONSERVATION_REACTIONS.every((reaction) => reaction.description.length >= 10));
  assert.ok(CONSERVATION_REACTIONS.every((reaction) => reaction.observation.length >= 4));
});

test("每条反应均使用最简正整数系数且所有元素守恒", () => {
  const elementSymbols = new Set(ELEMENTS.map((element) => element.symbol));
  for (const reaction of CONSERVATION_REACTIONS) {
    assert.deepEqual(validateReaction(reaction), { valid: true }, reaction.id);
    assert.ok(
      flattenGuess(canonicalGuess(reaction)).every((coefficient) => coefficient! <= 15),
      `${reaction.id} 的系数超出数字控制台`,
    );
    for (const species of [...reaction.reactants, ...reaction.products]) {
      assert.ok(Object.keys(species.atoms).every((symbol) => elementSymbols.has(symbol)), species.formula);
    }
  }
});

test("分子式解析不会把含 n 的合法元素符号误判为聚合物", () => {
  assert.deepEqual(parseFormula("KMnO₄"), { K: 1, Mn: 1, O: 4 });
  assert.deepEqual(parseFormula("SnO₂"), { Sn: 1, O: 2 });
  assert.equal(parseFormula("(C₂F₄)ₙ"), null);
});

test("包含用户关心的碳燃烧与常见复杂配平", () => {
  assert.ok(CONSERVATION_REACTIONS.some((reaction) => (
    formatBalancedEquation(reaction) === "C + O₂ → CO₂"
  )));
  assert.ok(CONSERVATION_REACTIONS.some((reaction) => (
    formatBalancedEquation(reaction) === "CH₄ + 2O₂ → CO₂ + 2H₂O"
  )));
  assert.ok(CONSERVATION_REACTIONS.some((reaction) => (
    formatBalancedEquation(reaction) === "4FeS₂ + 11O₂ → 2Fe₂O₃ + 8SO₂"
  )));
});

test("区分未填写、不守恒、可约分和最简配平", () => {
  const reaction = CONSERVATION_REACTIONS.find((item) => item.id === "water-formation")!;
  assert.deepEqual(
    evaluateBalance(reaction, { reactants: [null, null], products: [null] }),
    { status: "incomplete" },
  );
  const unbalanced = evaluateBalance(reaction, { reactants: [1, 1], products: [1] });
  assert.equal(unbalanced.status, "unbalanced");
  if (unbalanced.status === "unbalanced") assert.equal(unbalanced.focus.symbol, "O");
  assert.deepEqual(
    evaluateBalance(reaction, { reactants: [4, 2], products: [4] }),
    { status: "proportional", commonFactor: 2 },
  );
  assert.deepEqual(evaluateBalance(reaction, canonicalGuess(reaction)), { status: "balanced" });
});

test("元素天平按当前系数实时计算左右原子数", () => {
  const reaction = CONSERVATION_REACTIONS.find((item) => item.id === "methane-combustion")!;
  const rows = balanceRows(reaction, { reactants: [1, 1], products: [1, 1] });
  assert.deepEqual(rows, [
    { symbol: "C", left: 1, right: 1, balanced: true, difference: 0 },
    { symbol: "H", left: 4, right: 2, balanced: false, difference: 2 },
    { symbol: "O", left: 2, right: 3, balanced: false, difference: -1 },
  ]);
});

test("三个难度生成合理数量的可编辑槽位", () => {
  const reaction = CONSERVATION_REACTIONS.find((item) => item.id === "methane-combustion")!;
  const starter = createPuzzle(reaction, "starter", () => 0.4);
  const explorer = createPuzzle(reaction, "explorer", () => 0.4);
  const challenge = createPuzzle(reaction, "challenge", () => 0.4);
  const editableCount = (puzzle: typeof starter) => [
    ...puzzle.locked.reactants,
    ...puzzle.locked.products,
  ].filter((locked) => !locked).length;
  assert.equal(editableCount(starter), 2);
  assert.equal(editableCount(explorer), 3);
  assert.equal(editableCount(challenge), 4);
  assert.equal(flattenGuess(challenge.initial).every((value) => value === null), true);
});

test("提示每次只填写一个未完成或不正确的系数", () => {
  const reaction = CONSERVATION_REACTIONS.find((item) => item.id === "methane-combustion")!;
  const puzzle = createPuzzle(reaction, "challenge", () => 0.5);
  const first = fillOneHint(puzzle, puzzle.initial);
  assert.ok(first.filled);
  assert.equal(flattenGuess(first.guess).filter((value) => value !== null).length, 1);
  const second = fillOneHint(puzzle, first.guess);
  assert.ok(second.filled);
  assert.equal(flattenGuess(second.guess).filter((value) => value !== null).length, 2);
});

test("随机抽题不重复并遵循级别范围", () => {
  const starter = selectRandomReactions(CONSERVATION_REACTIONS, 20, "starter", () => 0.27);
  const challenge = selectRandomReactions(CONSERVATION_REACTIONS, 20, "challenge", () => 0.61);
  assert.equal(starter.length, 20);
  assert.equal(challenge.length, 20);
  assert.equal(new Set(starter.map((reaction) => reaction.id)).size, 20);
  assert.equal(new Set(challenge.map((reaction) => reaction.id)).size, 20);
  assert.ok(starter.every((reaction) => reaction.level === "starter"));
  assert.ok(challenge.every((reaction) => reaction.level !== "starter"));
});
