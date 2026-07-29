import assert from "node:assert/strict";
import test from "node:test";
import { REACTION_COMPOUNDS } from "./compound-library";
import {
  buildAtomBundles,
  consumeAtomCounts,
  findCompletableCompound,
  parseFormula,
  selectRandomCompounds,
  type ReactionCompound,
} from "./logic";

test("解析普通、括号、配合物和结晶水分子式", () => {
  assert.deepEqual(parseFormula("CO₂"), { C: 1, O: 2 });
  assert.deepEqual(parseFormula("Ca(OH)₂"), { Ca: 1, O: 2, H: 2 });
  assert.deepEqual(parseFormula("K₄[Fe(CN)₆]"), { K: 4, Fe: 1, C: 6, N: 6 });
  assert.deepEqual(
    parseFormula("(NH₄)₂Fe(SO₄)₂·6H₂O"),
    { N: 2, H: 20, Fe: 1, S: 2, O: 14 },
  );
});

test("拒绝变量聚合物和无法解析的名称缩写", () => {
  assert.equal(parseFormula("(C₂F₄)ₙ"), null);
  assert.equal(parseFormula("Gd-DTPA"), null);
  assert.equal(parseFormula(""), null);
});

test("反应资料库足够丰富且所有配方可解析", () => {
  assert.ok(REACTION_COMPOUNDS.length >= 300);
  assert.ok(REACTION_COMPOUNDS.every((compound) => compound.totalAtoms > 0));
  assert.equal(new Set(REACTION_COMPOUNDS.map((compound) => compound.id)).size, REACTION_COMPOUNDS.length);
  assert.ok(REACTION_COMPOUNDS.some((compound) => compound.formula === "C₆₀"));
  assert.ok(REACTION_COMPOUNDS.some((compound) => compound.formula === "CO₂"));
  assert.ok(REACTION_COMPOUNDS.some((compound) => compound.formula === "NaCl"));
});

test("每局无重复抽取 20 种物质", () => {
  const selected = selectRandomCompounds(REACTION_COMPOUNDS, 20, () => 0.42);
  assert.equal(selected.length, 20);
  assert.equal(new Set(selected.map((compound) => compound.id)).size, 20);
});

test("少量原子逐个陈列，大量原子按最多十个成组", () => {
  const carbon60 = REACTION_COMPOUNDS.find((compound) => compound.formula === "C₆₀")!;
  const bundles = buildAtomBundles([carbon60]);
  assert.equal(bundles.length, 6);
  assert.deepEqual(bundles.map((bundle) => bundle.count), [10, 10, 10, 10, 10, 10]);

  const carbonDioxide = REACTION_COMPOUNDS.find((compound) => compound.formula === "CO₂")!;
  const smallBundles = buildAtomBundles([carbonDioxide]);
  assert.deepEqual(
    smallBundles.map(({ symbol, count }) => ({ symbol, count })),
    [{ symbol: "C", count: 1 }, { symbol: "O", count: 1 }, { symbol: "O", count: 1 }],
  );
});

test("只在原子齐全时命中未完成配方并正确消耗", () => {
  const target: ReactionCompound = {
    id: "co2",
    formula: "CO₂",
    name: "二氧化碳",
    feature: "测试",
    kind: "molecule",
    atomCounts: { C: 1, O: 2 },
    totalAtoms: 3,
  };
  assert.equal(findCompletableCompound({ C: 1, O: 1 }, [target], new Set()), undefined);
  assert.equal(findCompletableCompound({ C: 2, O: 2 }, [target], new Set())?.id, "co2");
  assert.deepEqual(consumeAtomCounts({ C: 2, O: 3 }, target.atomCounts), { C: 1, O: 1 });
  assert.throws(() => consumeAtomCounts({ C: 1 }, target.atomCounts), /原子数量不足/);
});
