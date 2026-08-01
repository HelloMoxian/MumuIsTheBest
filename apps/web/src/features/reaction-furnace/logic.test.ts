import assert from "node:assert/strict";
import test from "node:test";
import { ELEMENTS } from "../periodic-table/elements.generated";
import { REACTION_COMPOUNDS } from "./compound-library";
import {
  buildAtomBundles,
  compoundElementSymbols,
  consumeAtomCounts,
  findCompletableCompound,
  isOrganicCompound,
  parseFormula,
  REACTION_FURNACE_ATOM_BUDGET,
  REACTION_FURNACE_MIN_DISTINCT_ELEMENT_COUNT,
  REACTION_FURNACE_ORGANIC_COUNT,
  REACTION_FURNACE_PRIORITY_ELEMENT_COUNT,
  REACTION_FURNACE_TARGET_COUNT,
  selectReactionRound,
  selectReactionRoundPlan,
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

test("反应资料库覆盖前八十号元素且结构表示规则明确", () => {
  assert.equal(REACTION_COMPOUNDS.length, 518);
  assert.ok(REACTION_COMPOUNDS.every((compound) => (
    compound.totalAtoms === compound.structure.atoms.length
    && compound.structure.source.url.startsWith("https://")
    && (compound.structure.representation !== "composition-schematic"
      ? compound.structure.bonds.length >= compound.totalAtoms - 1
      : compound.structure.bonds.length === 0
        || (compound.structure.bonds.length === compound.totalAtoms - 1
          && compound.structure.bonds.every((bond) => bond.style === "dashed")))
  )));
  assert.equal(new Set(REACTION_COMPOUNDS.map((compound) => compound.id)).size, REACTION_COMPOUNDS.length);
  const coveredElements = new Set(REACTION_COMPOUNDS.flatMap(compoundElementSymbols));
  for (const element of ELEMENTS.slice(0, 80)) {
    assert.ok(coveredElements.has(element.symbol), `资料库缺少 ${element.symbol} 的化合物`);
  }
  assert.equal(REACTION_COMPOUNDS.filter(isOrganicCompound).length, 268);
  assert.equal(REACTION_COMPOUNDS.filter((compound) => !isOrganicCompound(compound)).length, 250);
  assert.ok(REACTION_COMPOUNDS.some((compound) => compound.formula === "C₆₀"));
  assert.ok(REACTION_COMPOUNDS.some((compound) => compound.formula === "CO₂"));
  assert.ok(REACTION_COMPOUNDS.some((compound) => compound.formula === "NaCl"));
  assert.ok(REACTION_COMPOUNDS.some((compound) => compound.formula === "HArF"));
  assert.ok(!REACTION_COMPOUNDS.some((compound) => compound.name === "巴拉松"));
  assert.ok(!REACTION_COMPOUNDS.some((compound) => compound.name === "毒芹碱"));
  assert.equal(REACTION_COMPOUNDS.find((compound) => compound.name === "氨")?.formula, "NH₃");
  assert.equal(REACTION_COMPOUNDS.find((compound) => compound.name === "硫酸")?.formula, "H₂SO₄");
});

test("教材常见物质与四种碳结构都进入随机池", () => {
  for (const name of [
    "三氧化二铁", "四氧化三铁", "五水硫酸铜", "高锰酸钾",
    "碳酸氢钠（小苏打）", "碳酸钠（苏打）", "氢氧化钠", "氢氧化钙",
  ]) {
    assert.ok(REACTION_COMPOUNDS.some((compound) => compound.name === name), `缺少 ${name}`);
  }
  const carbonStructures = new Map([
    ["金刚石", { atoms: 10, bonds: 9 }],
    ["碳六十（C₆₀）", { atoms: 60, bonds: 90 }],
    ["碳纳米管", { atoms: 48, bonds: 66 }],
    ["石墨烯", { atoms: 22, bonds: 27 }],
  ]);
  for (const [name, expectation] of carbonStructures) {
    const compound = REACTION_COMPOUNDS.find((item) => item.name === name)!;
    assert.equal(compound.structure.atoms.length, expectation.atoms);
    assert.equal(compound.structure.bonds.length, expectation.bonds);
    assert.ok(compound.structure.bonds.every((bond) => bond.style !== "dashed"));
  }
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

test("每局先选十种元素，再选八种无机物和两种有机物", () => {
  let state = 42;
  const random = () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const round = selectReactionRoundPlan(
    REACTION_COMPOUNDS,
    REACTION_FURNACE_TARGET_COUNT,
    REACTION_FURNACE_ATOM_BUDGET,
    random,
  );
  const selected = round.compounds;
  const totalAtoms = selected.reduce((total, compound) => total + compound.totalAtoms, 0);
  const selectedElements = new Set(selected.flatMap(compoundElementSymbols));

  assert.equal(selected.length, 10);
  assert.equal(new Set(selected.map((compound) => compound.id)).size, 10);
  assert.ok(totalAtoms <= REACTION_FURNACE_ATOM_BUDGET);
  assert.equal(selected.filter(isOrganicCompound).length, REACTION_FURNACE_ORGANIC_COUNT);
  assert.equal(round.targetElements.length, REACTION_FURNACE_PRIORITY_ELEMENT_COUNT);
  assert.equal(new Set(round.targetElements).size, REACTION_FURNACE_PRIORITY_ELEMENT_COUNT);
  assert.ok(round.targetElements.every((symbol) => selectedElements.has(symbol)));
  assert.ok(selectedElements.size >= REACTION_FURNACE_MIN_DISTINCT_ELEMENT_COUNT);
});

test("不同随机批次都保持类别配额、元素覆盖和原子预算", () => {
  for (let seed = 1; seed <= 80; seed += 1) {
    let state = seed;
    const random = () => {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const round = selectReactionRoundPlan(
      REACTION_COMPOUNDS,
      REACTION_FURNACE_TARGET_COUNT,
      REACTION_FURNACE_ATOM_BUDGET,
      random,
    );
    const selectedElements = new Set(round.compounds.flatMap(compoundElementSymbols));
    assert.equal(
      round.compounds.filter(isOrganicCompound).length,
      REACTION_FURNACE_ORGANIC_COUNT,
      `随机种子 ${seed} 的有机物数量不正确`,
    );
    assert.ok(
      round.targetElements.every((symbol) => selectedElements.has(symbol)),
      `随机种子 ${seed} 没有覆盖全部优先元素`,
    );
    assert.ok(selectedElements.size >= REACTION_FURNACE_MIN_DISTINCT_ELEMENT_COUNT);
    assert.ok(
      round.compounds.reduce((total, compound) => total + compound.totalAtoms, 0)
      <= REACTION_FURNACE_ATOM_BUDGET,
    );
  }
});

test("原子上限无法容纳目标数量时明确拒绝", () => {
  assert.throws(
    () => selectReactionRound(REACTION_COMPOUNDS, 10, 10, () => 0.5),
    /原子总量上限/,
  );
});

test("资料库缺少类别配额时明确拒绝", () => {
  const organicOnly = REACTION_COMPOUNDS.filter(isOrganicCompound);
  const inorganicOnly = REACTION_COMPOUNDS.filter((compound) => !isOrganicCompound(compound));
  assert.throws(
    () => selectReactionRound(organicOnly),
    /无法提供 8 种无机物/,
  );
  assert.throws(
    () => selectReactionRound(inorganicOnly),
    /无法提供 2 种有机物/,
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
    family: "inorganic",
    category: "oxide",
    curriculumPriority: 2,
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
      representation: "authoritative-topology",
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
