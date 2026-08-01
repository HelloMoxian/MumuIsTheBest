import { readFile } from "node:fs/promises";
import path from "node:path";

const molecularPath = path.resolve(
  process.cwd(),
  "content/chemistry/molecular-structures.v1.json",
);
const elementCompoundPath = path.resolve(
  process.cwd(),
  "content/chemistry/element-compounds.v1.json",
);

const ELEMENT_SYMBOLS_THROUGH_80 = [
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
  "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
  "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
];

function fail(message) {
  throw new Error(message);
}

function parseFormula(formula) {
  const counts = {};
  let cursor = 0;
  const matcher = /([A-Z][a-z]?)(\d*)/gu;
  for (const match of formula.matchAll(matcher)) {
    if (match.index !== cursor) return null;
    counts[match[1]] = (counts[match[1]] ?? 0) + Number(match[2] || 1);
    cursor = match.index + match[0].length;
  }
  return cursor === formula.length && cursor > 0 ? counts : null;
}

function countAtoms(atoms) {
  const counts = {};
  for (const atom of atoms) counts[atom.symbol] = (counts[atom.symbol] ?? 0) + 1;
  return counts;
}

function sameCounts(first, second) {
  const symbols = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...symbols].every((symbol) => first[symbol] === second[symbol]);
}

function isConnected(atomCount, bonds) {
  if (atomCount < 2 || bonds.length < atomCount - 1) return false;
  const neighbors = Array.from({ length: atomCount }, () => []);
  for (const bond of bonds) {
    neighbors[bond.from].push(bond.to);
    neighbors[bond.to].push(bond.from);
  }
  const visited = new Set([0]);
  const pending = [0];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const neighbor of neighbors[current]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
  }
  return visited.size === atomCount;
}

const molecularAsset = JSON.parse(await readFile(molecularPath, "utf8"));
const elementAsset = JSON.parse(await readFile(elementCompoundPath, "utf8"));

if (elementAsset.schemaVersion !== 1) fail("元素化合物资料 schemaVersion 必须为 1");
if (elementAsset.count !== elementAsset.records?.length || elementAsset.records.length !== 68) {
  fail("元素化合物资料必须包含 68 条新增记录");
}
const ids = new Set();
const formulas = new Set();
for (const record of elementAsset.records) {
  if (!record.id || ids.has(record.id)) fail(`元素化合物 ID 缺失或重复：${record.id}`);
  ids.add(record.id);
  if (!record.formula || formulas.has(record.formula)) fail(`元素化合物分子式缺失或重复：${record.formula}`);
  formulas.add(record.formula);
  if (!record.name || !record.feature) fail(`${record.formula} 缺少中文名称或儿童说明`);
  if (record.family !== "inorganic") fail(`${record.formula} 必须归类为无机物`);
  if (!record.source?.name || !record.source?.url?.startsWith("https://")) {
    fail(`${record.formula} 缺少可追溯 HTTPS 来源`);
  }
  if (!Array.isArray(record.atoms) || record.atoms.length < 2) fail(`${record.formula} 缺少原子结构`);
  if (record.atoms.some((atom) => (
    !ELEMENT_SYMBOLS_THROUGH_80.includes(atom.symbol)
    || !Number.isFinite(atom.x)
    || !Number.isFinite(atom.y)
  ))) {
    fail(`${record.formula} 含有未知元素或无效坐标`);
  }
  const formulaCounts = parseFormula(record.formula);
  const atomCounts = countAtoms(record.atoms);
  if (!formulaCounts || !sameCounts(formulaCounts, atomCounts)) {
    fail(`${record.formula} 的配方与显式原子不一致`);
  }
  if (record.representation === "authoritative-topology") {
    if (!isConnected(record.atoms.length, record.bonds)) {
      fail(`${record.formula} 的权威拓扑必须是单一连通结构`);
    }
    if (record.bonds.some((bond) => (
      !Number.isInteger(bond.from)
      || !Number.isInteger(bond.to)
      || bond.from < 0
      || bond.to < 0
      || bond.from >= record.atoms.length
      || bond.to >= record.atoms.length
      || ![1, 2, 3].includes(bond.order)
    ))) {
      fail(`${record.formula} 含有无效化学键`);
    }
  } else if (
    record.representation !== "composition-schematic"
    || record.kind !== "formula-unit"
    || record.bonds.length !== 0
  ) {
    fail(`${record.formula} 的组成示意不得伪造化学键`);
  }
}

const coveredSymbols = new Set([
  ...molecularAsset.records.flatMap((record) => record.atoms.map((atom) => atom.symbol)),
  ...elementAsset.records.flatMap((record) => record.atoms.map((atom) => atom.symbol)),
]);
const missingElements = ELEMENT_SYMBOLS_THROUGH_80.filter((symbol) => !coveredSymbols.has(symbol));
if (missingElements.length > 0) fail(`前 80 号元素仍缺少化合物：${missingElements.join("、")}`);

console.log(
  `元素化合物资料校验通过：新增 ${elementAsset.records.length} 种，前 80 号元素全部至少有一种结构记录。`,
);
