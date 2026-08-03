import { readFile } from "node:fs/promises";
import path from "node:path";

const chemistryDir = path.resolve(process.cwd(), "content/chemistry");
const molecularPath = path.join(chemistryDir, "molecular-structures.v1.json");
const elementPath = path.join(chemistryDir, "element-compounds.v1.json");
const curriculumPath = path.join(chemistryDir, "curriculum-compounds.v1.json");

const VALID_CATEGORIES = new Set([
  "acid", "base", "salt", "oxide", "allotrope", "simple-substance", "other",
]);
const LATER_METALS = [
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
];
const REQUIRED_NAMES = [
  "三氧化二铁", "四氧化三铁", "五水硫酸铜", "硝酸", "氯化氢", "硫酸",
  "氢氧化钠", "氢氧化钾", "氢氧化钙", "碳酸氢钠（小苏打）", "碳酸钠（苏打）",
  "高锰酸钾", "金刚石", "碳六十（C₆₀）", "碳纳米管", "石墨烯",
];

function fail(message) {
  throw new Error(message);
}

function readNumber(source, start) {
  let index = start;
  while (/\d/u.test(source[index] ?? "")) index += 1;
  return index === start
    ? { value: 1, next: start }
    : { value: Number(source.slice(start, index)), next: index };
}

function mergeCounts(target, source, multiplier = 1) {
  for (const [symbol, count] of Object.entries(source)) {
    target[symbol] = (target[symbol] ?? 0) + count * multiplier;
  }
}

function parseGroup(source, start, closing) {
  const counts = {};
  let index = start;
  while (index < source.length) {
    const character = source[index];
    if (closing && character === closing) return { counts, next: index + 1 };
    if (character === "(" || character === "[") {
      const nested = parseGroup(source, index + 1, character === "(" ? ")" : "]");
      if (!nested) return null;
      const multiplier = readNumber(source, nested.next);
      mergeCounts(counts, nested.counts, multiplier.value);
      index = multiplier.next;
      continue;
    }
    if (!/[A-Z]/u.test(character)) return null;
    let symbol = character;
    index += 1;
    if (/[a-z]/u.test(source[index] ?? "")) {
      symbol += source[index];
      index += 1;
    }
    const multiplier = readNumber(source, index);
    counts[symbol] = (counts[symbol] ?? 0) + multiplier.value;
    index = multiplier.next;
  }
  return closing ? null : { counts, next: index };
}

function parseFormula(formula) {
  const subscripts = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
  const normalized = [...formula]
    .map((character) => subscripts[character] ?? character)
    .join("")
    .replace(/\s+/gu, "")
    .replace(/[+-]\d*$/u, "");
  const total = {};
  for (const rawSegment of normalized.split(/[·.]/u)) {
    if (!rawSegment) return null;
    const coefficient = readNumber(rawSegment, 0);
    const segment = rawSegment.slice(coefficient.next);
    const parsed = parseGroup(segment, 0, null);
    if (!parsed || parsed.next !== segment.length) return null;
    mergeCounts(total, parsed.counts, coefficient.value);
  }
  return Object.keys(total).length > 0 ? total : null;
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

function validateBond(record, bond) {
  if (
    !Number.isInteger(bond.from)
    || !Number.isInteger(bond.to)
    || bond.from < 0
    || bond.to < 0
    || bond.from >= record.atoms.length
    || bond.to >= record.atoms.length
    || ![1, 2, 3].includes(bond.order)
    || ![undefined, "solid", "dashed"].includes(bond.style)
  ) {
    fail(`${record.name} 含有无效结构连接`);
  }
}

const [molecularAsset, elementAsset, curriculumAsset] = await Promise.all([
  readFile(molecularPath, "utf8").then(JSON.parse),
  readFile(elementPath, "utf8").then(JSON.parse),
  readFile(curriculumPath, "utf8").then(JSON.parse),
]);

if (curriculumAsset.schemaVersion !== 1) fail("教材物质资料 schemaVersion 必须为 1");
if (curriculumAsset.count !== curriculumAsset.records?.length || curriculumAsset.records.length < 150) {
  fail("教材物质资料必须包含至少 150 条记录");
}

const ids = new Set();
for (const record of curriculumAsset.records) {
  if (!record.id || ids.has(record.id)) fail(`教材物质 ID 缺失或重复：${record.id}`);
  ids.add(record.id);
  if (!record.formula || !record.name || !record.feature) fail(`${record.id} 缺少名称、化学式或说明`);
  if (!VALID_CATEGORIES.has(record.category)) fail(`${record.name} 的类别无效`);
  if (![0, 1, 2].includes(record.curriculumPriority)) fail(`${record.name} 的教材优先级无效`);
  if (!record.source?.name || !record.source?.url?.startsWith("https://")) {
    fail(`${record.name} 缺少可追溯 HTTPS 来源`);
  }
  if (!Array.isArray(record.atoms) || record.atoms.length < 2) fail(`${record.name} 缺少结构原子`);
  if (record.atoms.some((atom) => (
    !/^[A-Z][a-z]?$/u.test(atom.symbol)
    || !Number.isFinite(atom.x)
    || !Number.isFinite(atom.y)
    || (atom.z !== undefined && !Number.isFinite(atom.z))
  ))) {
    fail(`${record.name} 含有未知元素或无效坐标`);
  }
  record.bonds.forEach((bond) => validateBond(record, bond));
  if (!isConnected(record.atoms.length, record.bonds)) fail(`${record.name} 的结构必须连通`);

  const formulaCounts = parseFormula(record.formula);
  const atomCounts = countAtoms(record.atoms);
  if (!formulaCounts) fail(`${record.name} 的化学式无法解析`);
  if (record.kind !== "allotrope" && !sameCounts(formulaCounts, atomCounts)) {
    fail(`${record.name} 的化学式与显式原子不一致`);
  }
  if (record.representation === "composition-schematic") {
    if (record.bonds.length !== record.atoms.length - 1) fail(`${record.name} 的虚线示意必须使用最小连通树`);
    if (record.bonds.some((bond) => bond.style !== "dashed" || bond.order !== 1)) {
      fail(`${record.name} 的组成示意只能使用虚线，不得伪装单双键`);
    }
  } else if (
    !["authoritative-topology", "representative-lattice"].includes(record.representation)
    || record.bonds.some((bond) => bond.style === "dashed")
  ) {
    fail(`${record.name} 的明确拓扑或晶格只能使用实线`);
  }
}

const allRecords = [
  ...molecularAsset.records,
  ...elementAsset.records,
  ...curriculumAsset.records,
];
for (const name of REQUIRED_NAMES) {
  if (!allRecords.some((record) => record.name === name)) fail(`缺少用户指定物质：${name}`);
}

const carbonExpectations = new Map([
  ["curriculum-diamond", { atoms: 10, minimumBonds: 9 }],
  ["curriculum-buckminsterfullerene", { atoms: 60, minimumBonds: 90 }],
  ["curriculum-carbon-nanotube", { atoms: 48, minimumBonds: 60 }],
  ["curriculum-graphene", { atoms: 22, minimumBonds: 25 }],
]);
for (const [id, expectation] of carbonExpectations) {
  const record = curriculumAsset.records.find((item) => item.id === id);
  if (!record || record.atoms.length !== expectation.atoms || record.bonds.length < expectation.minimumBonds) {
    fail(`${id} 的代表结构原子数或连接数不正确`);
  }
}
const fullerene = curriculumAsset.records.find((record) => record.id === "curriculum-buckminsterfullerene");
if (fullerene.bonds.filter((bond) => bond.order === 2).length !== 30) {
  fail("C60 必须包含一组 30 条双键的代表性 Kekulé 拓扑");
}

for (const symbol of LATER_METALS) {
  const related = allRecords.filter((record) => parseFormula(record.formula)?.[symbol]);
  if (related.length < 2) fail(`${symbol} 在资料池中少于两种物质`);
  const nonOxide = related.some((record) => {
    const symbols = Object.keys(parseFormula(record.formula));
    return !(symbols.length === 2 && symbols.includes("O"));
  });
  if (!nonOxide) fail(`${symbol} 仍然只有氧化物，没有非氧化物选择`);
}

console.log(
  `教材物质资料校验通过：${curriculumAsset.records.length} 条新增记录，后段金属均至少两种且含非氧化物。`,
);
