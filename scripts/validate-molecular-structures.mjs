import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ASSET_PATH = path.resolve(
  process.cwd(),
  "content/chemistry/molecular-structures.v1.json",
);
const asset = JSON.parse(await readFile(ASSET_PATH, "utf8"));
const failures = [];

function fail(message) {
  failures.push(message);
}

function parseFormula(formula) {
  const counts = {};
  let cursor = 0;
  for (const match of formula.matchAll(/([A-Z][a-z]?)(\d*)/gu)) {
    if (match.index !== cursor) return null;
    counts[match[1]] = (counts[match[1]] ?? 0) + Number(match[2] || 1);
    cursor = match.index + match[0].length;
  }
  return cursor === formula.length && cursor > 0 ? counts : null;
}

function symbolCounts(atoms) {
  const counts = {};
  for (const atom of atoms) counts[atom.symbol] = (counts[atom.symbol] ?? 0) + 1;
  return counts;
}

function sameCounts(first, second) {
  if (!first || !second) return false;
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...keys].every((key) => first[key] === second[key]);
}

function isConnected(atomCount, bonds) {
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

if (asset.schemaVersion !== 1) fail("schemaVersion 必须为 1");
if (asset.count !== 300 || asset.records?.length !== 300) {
  fail(`必须恰好包含 300 个结构，当前为 ${asset.records?.length ?? 0}`);
}

const ids = new Set();
const cids = new Set();
for (const record of asset.records ?? []) {
  if (!record.id || ids.has(record.id)) fail(`结构 ID 缺失或重复：${record.id}`);
  if (!Number.isInteger(record.cid) || cids.has(record.cid)) fail(`PubChem CID 无效或重复：${record.cid}`);
  ids.add(record.id);
  cids.add(record.cid);
  if (!record.name || !record.formula || !record.feature) fail(`${record.id} 缺少展示文案`);
  if (!record.source?.url?.endsWith(`/${record.cid}`)) fail(`${record.id} 缺少可追溯 PubChem URL`);
  if (
    record.atoms.length < 2
    || (record.atoms.length > 36 && record.cid !== 123591)
  ) {
    fail(`${record.id} 原子数越界`);
  }
  if (record.bonds.length < record.atoms.length - 1) fail(`${record.id} 键数量不足`);
  if (!record.atoms.every((atom) => (
    /^[A-Z][a-z]?$/u.test(atom.symbol)
    && Number.isFinite(atom.x)
    && Number.isFinite(atom.y)
  ))) {
    fail(`${record.id} 存在无效原子或坐标`);
  }
  const bondKeys = new Set();
  for (const bond of record.bonds) {
    if (
      !Number.isInteger(bond.from)
      || !Number.isInteger(bond.to)
      || bond.from < 0
      || bond.to < 0
      || bond.from >= record.atoms.length
      || bond.to >= record.atoms.length
      || bond.from === bond.to
      || ![1, 2, 3].includes(bond.order)
    ) {
      fail(`${record.id} 存在无效键`);
      continue;
    }
    const key = [bond.from, bond.to].sort((a, b) => a - b).join("-");
    if (bondKeys.has(key)) fail(`${record.id} 存在重复键 ${key}`);
    bondKeys.add(key);
  }
  if (!isConnected(record.atoms.length, record.bonds)) fail(`${record.id} 不是单一连通分子`);
  if (!sameCounts(parseFormula(record.formula), symbolCounts(record.atoms))) {
    fail(`${record.id} 的分子式与显式原子不一致`);
  }
}

const acetylene = asset.records?.find((record) => record.cid === 6326);
if (!acetylene) {
  fail("必须包含 PubChem CID 6326 乙炔");
} else {
  const carbonIndexes = acetylene.atoms
    .map((atom, index) => atom.symbol === "C" ? index : -1)
    .filter((index) => index >= 0);
  const hydrogenIndexes = acetylene.atoms
    .map((atom, index) => atom.symbol === "H" ? index : -1)
    .filter((index) => index >= 0);
  const carbonBond = acetylene.bonds.find((bond) => (
    carbonIndexes.includes(bond.from) && carbonIndexes.includes(bond.to)
  ));
  if (carbonIndexes.length !== 2 || hydrogenIndexes.length !== 2 || carbonBond?.order !== 3) {
    fail("乙炔必须呈现 H—C≡C—H 的碳碳三键拓扑");
  }
  for (const carbonIndex of carbonIndexes) {
    const hydrogenNeighbors = acetylene.bonds.filter((bond) => (
      (bond.from === carbonIndex && hydrogenIndexes.includes(bond.to))
      || (bond.to === carbonIndex && hydrogenIndexes.includes(bond.from))
    ));
    if (hydrogenNeighbors.length !== 1) fail("乙炔每个碳原子必须只连接一个氢原子");
  }
}

if (asset.records?.some((record) => record.formula === "NaCl")) {
  fail("氯化钠属于离子晶体，不能进入单分子共价结构库");
}
const fullerene = asset.records?.find((record) => record.cid === 123591);
if (!fullerene || fullerene.formula !== "C60" || fullerene.atoms.length !== 60) {
  fail("必须保留经 PubChem 核验的 60 原子富勒烯 C60 碳笼");
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  const atomCount = asset.records.reduce((total, record) => total + record.atoms.length, 0);
  const bondCount = asset.records.reduce((total, record) => total + record.bonds.length, 0);
  console.log(`分子结构校验通过：${asset.records.length} 种、${atomCount} 个显式原子、${bondCount} 条权威键连接。`);
}
