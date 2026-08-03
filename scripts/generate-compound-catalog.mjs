import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const chemistryDir = path.resolve(process.cwd(), "content", "chemistry");
const outputPath = path.join(chemistryDir, "compound-catalog.v1.json");

const CHILD_UNSUITABLE_CIDS = new Set([991, 441072]);
const REPLACED_STRUCTURE_CIDS = new Set([123591]);
const INORGANIC_COMPOUND_CIDS = new Set([
  222, 260, 280, 281, 313, 402, 767, 783, 784, 807, 944, 947, 948, 962,
  977, 1004, 1118, 1119, 7628, 14917, 23953, 24341, 24404, 24408, 24524,
  24526, 24682, 24823, 24841, 3032552, 145068, 123591,
]);
const CURRICULUM_COMMON_FORMULAS = new Set([
  "H2O", "H2O2", "NH3", "CO", "CO2", "SO2", "SO3", "HCl", "HF", "H2CO3",
  "HNO3", "H2SO4", "H3PO4", "NaCl", "KCl", "CaO", "MgO", "Al2O3", "Fe2O3",
  "MnO2", "CuO", "BaSO4",
]);
const CONVENTIONAL_FORMULA_BY_CID = new Map([
  [222, "NH3"], [1119, "SO2"], [24682, "SO3"], [313, "HCl"], [14917, "HF"],
  [260, "HBr"], [24341, "HClO"], [767, "H2CO3"], [1118, "H2SO4"],
  [1004, "H3PO4"], [7628, "H3BO3"], [23953, "SiH4"], [24404, "PH3"],
]);
const SUBSCRIPT_DIGITS = {
  0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄",
  5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉",
};
const FAMILY_LABELS = { organic: "有机物", inorganic: "无机物" };
const KIND_LABELS = {
  molecule: "分子",
  "formula-unit": "配方单元",
  allotrope: "单质结构",
  hydrate: "水合物",
  intermetallic: "材料结构",
};
const CATEGORY_LABELS = {
  acid: "酸",
  base: "碱",
  salt: "盐",
  oxide: "氧化物",
  allotrope: "同素异形体",
  "simple-substance": "单质",
  other: "其他物质",
};
const STRUCTURE_NOTES = {
  "authoritative-topology": "原子连接关系来自权威结构记录，实线表示记录中的化学键。",
  "composition-schematic": "这是组成示意；虚线帮助辨认配比，不把离子晶体误画成孤立共价分子。",
  "representative-lattice": "这是无限材料或晶格的有限代表片段，只用于观察重复组成。",
};

async function readJson(fileName) {
  return JSON.parse(await readFile(path.join(chemistryDir, fileName), "utf8"));
}

function displayFormula(formula) {
  return [...formula].map((character) => SUBSCRIPT_DIGITS[character] ?? character).join("");
}

function countAtoms(atoms) {
  const counts = {};
  for (const atom of atoms) counts[atom.symbol] = (counts[atom.symbol] ?? 0) + 1;
  return counts;
}

function inferCategory(name, kind, family) {
  if (kind === "allotrope") return "allotrope";
  if (family === "organic") return "other";
  if (name.endsWith("酸") || ["氯化氢", "氟化氢", "溴化氢"].includes(name)) return "acid";
  if (name.includes("氢氧化")) return "base";
  if (name.includes("氧化") || ["水", "过氧化氢"].includes(name)) return "oxide";
  if (kind === "formula-unit" || kind === "hydrate") return "salt";
  if (/^[氢氮氧氟氯溴碘磷硫]气?$|臭氧|富勒烯/u.test(name)) return "simple-substance";
  return "other";
}

function compositionText(atomCounts) {
  return Object.entries(atomCounts)
    .map(([symbol, count]) => `${symbol} × ${count}`)
    .join("、");
}

function childReadableFeature(record, family, category, atomCounts) {
  if (/[\u3400-\u9fff]/u.test(record.feature)) return record.feature;
  return `${record.name}是一种${FAMILY_LABELS[family]}，知识库把它归入${CATEGORY_LABELS[category]}；化学式中的元素配比是 ${compositionText(atomCounts)}。`;
}

function safetyNote(record) {
  if (/剧毒|有毒|毒性|腐蚀|强氧化|放射|易燃|爆炸|危险/u.test(record.feature)) {
    return `资料提示这种物质可能具有危险性：${record.feature} 页面只做知识展示，不提供制备条件或实验步骤。`;
  }
  return "页面只展示组成、结构与用途知识，不提供制备条件或实验步骤。";
}

function sourceNote(record) {
  if (record.cid) return `结构与数值关联 PubChem CID ${record.cid}；原始资料入口为 ${record.source.name}。`;
  return `该条目没有可靠 PubChem CID，保留 ${record.source.name} 的组成或材料结构来源。`;
}

function profileFor(record, atomCounts, family, kind, category, properties) {
  const totalAtoms = Object.values(atomCounts).reduce((total, count) => total + count, 0);
  const classification = `${FAMILY_LABELS[family]} · ${KIND_LABELS[kind]} · ${CATEGORY_LABELS[category]}`;
  return {
    summary: record.feature,
    englishName: record.nameEnglish,
    composition: `${compositionText(atomCounts)}；当前结构记录共展示 ${totalAtoms} 个原子。`,
    classification,
    structureNote: STRUCTURE_NOTES[record.representation] ?? STRUCTURE_NOTES["authoritative-topology"],
    learningPoints: [
      `化学式 ${displayFormula(record.formula)} 对应的元素配比是 ${compositionText(atomCounts)}。`,
      `知识库把它归入“${classification}”。`,
      sourceNote(record),
    ],
    safetyNote: safetyNote(record),
    properties: properties ? {
      molecularFormula: properties.MolecularFormula ?? null,
      molecularWeight: properties.MolecularWeight ?? null,
      iupacName: properties.IUPACName ?? null,
      xLogP: properties.XLogP ?? null,
      topologicalPolarSurfaceArea: properties.TPSA ?? null,
      complexity: properties.Complexity ?? null,
      charge: properties.Charge ?? null,
      hydrogenBondDonorCount: properties.HBondDonorCount ?? null,
      hydrogenBondAcceptorCount: properties.HBondAcceptorCount ?? null,
      rotatableBondCount: properties.RotatableBondCount ?? null,
      heavyAtomCount: properties.HeavyAtomCount ?? null,
    } : null,
  };
}

function imageFor(record, pubchemAsset) {
  if (!record.cid) return null;
  const index = pubchemAsset.imageAtlas.cids.indexOf(record.cid);
  if (index < 0) return null;
  return {
    kind: "pubchem-atlas",
    path: pubchemAsset.imageAtlas.path,
    atlasIndex: index,
    columns: pubchemAsset.imageAtlas.columns,
    rows: pubchemAsset.imageAtlas.rows,
    alt: `${record.name}的 PubChem 二维结构图`,
    sourceUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${record.cid}`,
    attribution: pubchemAsset.imageAtlas.attribution,
  };
}

function normalizeRecord(record, origin, pubchemByCid, pubchemAsset) {
  const isMolecularSource = origin === "molecular-structures.v1.json";
  const formula = isMolecularSource
    ? (CONVENTIONAL_FORMULA_BY_CID.get(record.cid) ?? record.formula)
    : record.formula;
  const family = isMolecularSource
    ? (INORGANIC_COMPOUND_CIDS.has(record.cid) ? "inorganic" : "organic")
    : record.family;
  const kind = isMolecularSource ? "molecule" : record.kind;
  const category = record.category ?? inferCategory(record.name, kind, family);
  const representation = record.representation ?? "authoritative-topology";
  const curriculumPriority = record.curriculumPriority
    ?? (CURRICULUM_COMMON_FORMULAS.has(formula) ? 2 : 0);
  const sourceRecord = { ...record, formula, representation };
  const atomCounts = countAtoms(record.atoms);
  const totalAtoms = Object.values(atomCounts).reduce((total, count) => total + count, 0);
  const feature = childReadableFeature(record, family, category, atomCounts);
  sourceRecord.feature = feature;
  return {
    id: isMolecularSource ? `compound-${record.id}` : record.id,
    cid: record.cid ?? null,
    formula,
    displayFormula: displayFormula(formula),
    name: record.name,
    nameEnglish: record.nameEnglish,
    feature,
    family,
    kind,
    category,
    curriculumPriority,
    atomCounts,
    totalAtoms,
    structure: {
      cid: record.cid ?? null,
      atoms: record.atoms,
      bonds: record.bonds,
      representation,
      source: record.source,
    },
    profile: profileFor(
      sourceRecord,
      atomCounts,
      family,
      kind,
      category,
      record.cid ? pubchemByCid.get(record.cid) : undefined,
    ),
    image: imageFor(record, pubchemAsset),
    provenance: {
      origin,
      source: record.source,
      originalFeature: record.feature,
    },
  };
}

const [molecularAsset, elementAsset, curriculumAsset, pubchemAsset] = await Promise.all([
  readJson("molecular-structures.v1.json"),
  readJson("element-compounds.v1.json"),
  readJson("curriculum-compounds.v1.json"),
  readJson("pubchem-compound-properties.v1.json"),
]);
const pubchemByCid = new Map(pubchemAsset.records.map((record) => [record.CID, record]));
const molecularRecords = molecularAsset.records.filter((record) => (
  !CHILD_UNSUITABLE_CIDS.has(record.cid) && !REPLACED_STRUCTURE_CIDS.has(record.cid)
));
const records = [
  ...molecularRecords.map((record) => normalizeRecord(
    record,
    "molecular-structures.v1.json",
    pubchemByCid,
    pubchemAsset,
  )),
  ...elementAsset.records.map((record) => normalizeRecord(
    record,
    "element-compounds.v1.json",
    pubchemByCid,
    pubchemAsset,
  )),
  ...curriculumAsset.records.map((record) => normalizeRecord(
    record,
    "curriculum-compounds.v1.json",
    pubchemByCid,
    pubchemAsset,
  )),
];
const catalog = {
  schemaVersion: 1,
  assetId: "mumu-compound-catalog",
  generatedOn: "2026-08-03",
  description: "分子工厂、反应熔炉和元素周期表共享的唯一运行时化合物目录。",
  sourceAssets: [
    "molecular-structures.v1.json",
    "element-compounds.v1.json",
    "curriculum-compounds.v1.json",
    "pubchem-compound-properties.v1.json",
  ],
  imageAtlas: pubchemAsset.imageAtlas,
  records,
};
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await rename(temporaryPath, outputPath);
console.log(`Generated ${records.length} canonical compound records.`);
