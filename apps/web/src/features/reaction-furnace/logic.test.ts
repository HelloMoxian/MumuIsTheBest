import assert from "node:assert/strict";
import test from "node:test";
import { REACTION_COMPOUNDS } from "./compound-library";
import {
  buildAtomBundles,
  consumeAtomCounts,
  findCompletableCompound,
  isCarbonFreeCompound,
  parseFormula,
  REACTION_FURNACE_ATOM_BUDGET,
  REACTION_FURNACE_MIN_CARBON_FREE_COUNT,
  REACTION_FURNACE_TARGET_COUNT,
  selectReactionRound,
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
  assert.equal(REACTION_COMPOUNDS.length, 300);
  assert.ok(REACTION_COMPOUNDS.every((compound) => (
    compound.kind === "molecule"
    && compound.totalAtoms === compound.structure.atoms.length
    && compound.structure.source.name === "PubChem"
    && compound.structure.bonds.length >= compound.totalAtoms - 1
  )));
  assert.equal(new Set(REACTION_COMPOUNDS.map((compound) => compound.id)).size, REACTION_COMPOUNDS.length);
  assert.ok(REACTION_COMPOUNDS.some((compound) => compound.formula === "C₆₀"));
  assert.ok(REACTION_COMPOUNDS.some((compound) => compound.formula === "CO₂"));
  assert.ok(!REACTION_COMPOUNDS.some((compound) => compound.formula === "NaCl"));
  assert.equal(REACTION_COMPOUNDS.find((compound) => compound.name === "氨")?.formula, "NH₃");
  assert.equal(REACTION_COMPOUNDS.find((compound) => compound.name === "硫酸")?.formula, "H₂SO₄");
});

test("乙炔严格使用 H—C≡C—H 的 PubChem 拓扑", () => {
  const acetylene = REACTION_COMPOUNDS.find((compound) => compound.structure.cid === 6326)!;
  const carbonIndexes = acetylene.structure.atoms
    .map((atom, index) => atom.symbol === "C" ? index : -1)
    .filter((index) => index >= 0);
  const hydrogenIndexes = acetylene.structure.atoms
    .map((atom, index) => atom.symbol === "H" ? index : -1)
    .filter((index) => index >= 0);
  assert.equal(carbonIndexes.length, 2);
  assert.equal(hydrogenIndexes.length, 2);
  assert.ok(acetylene.structure.bonds.some((bond) => (
    bond.order === 3
    && carbonIndexes.includes(bond.from)
    && carbonIndexes.includes(bond.to)
  )));
  for (const carbonIndex of carbonIndexes) {
    assert.equal(acetylene.structure.bonds.filter((bond) => (
      (bond.from === carbonIndex && hydrogenIndexes.includes(bond.to))
      || (bond.to === carbonIndex && hydrogenIndexes.includes(bond.from))
    )).length, 1);
  }
});

test("每局无重复抽取 10 种物质且总原子量受控", () => {
  const selected = selectReactionRound(
    REACTION_COMPOUNDS,
    REACTION_FURNACE_TARGET_COUNT,
    REACTION_FURNACE_ATOM_BUDGET,
    () => 0.42,
  );
  const totalAtoms = selected.reduce((total, compound) => total + compound.totalAtoms, 0);

  assert.equal(selected.length, 10);
  assert.equal(new Set(selected.map((compound) => compound.id)).size, 10);
  assert.ok(totalAtoms <= REACTION_FURNACE_ATOM_BUDGET);
  assert.ok(
    selected.filter(isCarbonFreeCompound).length
    >= REACTION_FURNACE_MIN_CARBON_FREE_COUNT,
  );
});

test("不同随机批次都至少包含五种不含碳的物质", () => {
  for (let seed = 1; seed <= 80; seed += 1) {
    let state = seed;
    const random = () => {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const selected = selectReactionRound(
      REACTION_COMPOUNDS,
      REACTION_FURNACE_TARGET_COUNT,
      REACTION_FURNACE_ATOM_BUDGET,
      random,
      REACTION_FURNACE_MIN_CARBON_FREE_COUNT,
    );
    assert.ok(
      selected.filter(isCarbonFreeCompound).length >= 5,
      `随机种子 ${seed} 的无碳结构不足五种`,
    );
  }
});

test("原子上限无法容纳目标数量时明确拒绝", () => {
  assert.throws(
    () => selectReactionRound(REACTION_COMPOUNDS, 10, 10, () => 0.5),
    /原子总量上限/,
  );
});

test("资料库无足够无碳物质时明确拒绝", () => {
  const carbonContainingOnly = REACTION_COMPOUNDS.filter(
    (compound) => !isCarbonFreeCompound(compound),
  );
  assert.throws(
    () => selectReactionRound(carbonContainingOnly),
    /无法提供 5 种不含碳/,
  );
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
    structure: {
      cid: 280,
      atoms: [
        { symbol: "C", x: 0, y: 0 },
        { symbol: "O", x: -1, y: 0 },
        { symbol: "O", x: 1, y: 0 },
      ],
      bonds: [
        { from: 0, to: 1, order: 2 },
        { from: 0, to: 2, order: 2 },
      ],
      source: {
        name: "PubChem",
        url: "https://pubchem.ncbi.nlm.nih.gov/compound/280",
      },
    },
  };
  assert.equal(findCompletableCompound({ C: 1, O: 1 }, [target], new Set()), undefined);
  assert.equal(findCompletableCompound({ C: 2, O: 2 }, [target], new Set())?.id, "co2");
  assert.deepEqual(consumeAtomCounts({ C: 2, O: 3 }, target.atomCounts), { C: 1, O: 1 });
  assert.throws(() => consumeAtomCounts({ C: 1 }, target.atomCounts), /原子数量不足/);
});
