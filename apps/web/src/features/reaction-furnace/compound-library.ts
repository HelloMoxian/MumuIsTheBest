import molecularStructureAsset from "../../../../../content/chemistry/molecular-structures.v1.json";
import elementCompoundAsset from "../../../../../content/chemistry/element-compounds.v1.json";
import type {
  CompoundFamily,
  CompoundKind,
  MolecularStructure,
  ReactionCompound,
  StructureRepresentation,
} from "./logic";

type AssetRecord = {
  id: string;
  cid: number;
  formula: string;
  name: string;
  nameEnglish: string;
  feature: string;
  atoms: MolecularStructure["atoms"];
  bonds: MolecularStructure["bonds"];
  source: MolecularStructure["source"];
};

type ElementCompoundAssetRecord = {
  id: string;
  cid?: number;
  formula: string;
  name: string;
  nameEnglish: string;
  feature: string;
  family: CompoundFamily;
  kind: CompoundKind;
  representation: StructureRepresentation;
  atoms: MolecularStructure["atoms"];
  bonds: MolecularStructure["bonds"];
  source: MolecularStructure["source"];
};

// These entries come from the generator's explicitly curated inorganic whitelist.
// Carbon alone is not a safe organic/inorganic classifier: CO, CO₂, H₂CO₃ and C₆₀
// all contain carbon but are inorganic substances.
const INORGANIC_COMPOUND_CIDS = new Set([
  222, 260, 280, 281, 313, 402, 767, 783, 784, 807, 944, 947, 948, 962,
  977, 1004, 1118, 1119, 7628, 14917, 23953, 24341, 24404, 24408, 24524,
  24526, 24682, 24823, 24841, 3032552, 145068, 123591,
]);
const CHILD_UNSUITABLE_CIDS = new Set([
  991, // 巴拉松（对硫磷），旧资料生成时使用别名绕过了农药名称过滤。
]);

const SUBSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
};

const CONVENTIONAL_FORMULA_BY_CID = new Map<number, string>([
  [222, "NH3"],
  [1119, "SO2"],
  [24682, "SO3"],
  [313, "HCl"],
  [14917, "HF"],
  [260, "HBr"],
  [24341, "HClO"],
  [767, "H2CO3"],
  [1118, "H2SO4"],
  [1004, "H3PO4"],
  [7628, "H3BO3"],
  [23953, "SiH4"],
  [24404, "PH3"],
]);

function displayFormula(formula: string) {
  return [...formula]
    .map((character) => SUBSCRIPT_DIGITS[character] ?? character)
    .join("");
}

function countAtoms(structure: MolecularStructure) {
  const counts: Record<string, number> = {};
  for (const atom of structure.atoms) {
    counts[atom.symbol] = (counts[atom.symbol] ?? 0) + 1;
  }
  return counts;
}

const records = (molecularStructureAsset.records as readonly AssetRecord[])
  .filter((record) => !CHILD_UNSUITABLE_CIDS.has(record.cid));
const elementCompoundRecords = elementCompoundAsset.records as readonly ElementCompoundAssetRecord[];

const molecularCompounds: readonly ReactionCompound[] = records.map((record) => {
  const structure: MolecularStructure = {
    cid: record.cid,
    atoms: record.atoms,
    bonds: record.bonds,
    representation: "authoritative-topology",
    source: record.source,
  };
  return {
    id: `compound-${record.id}`,
    formula: displayFormula(CONVENTIONAL_FORMULA_BY_CID.get(record.cid) ?? record.formula),
    name: record.name,
    feature: record.feature,
    kind: "molecule",
    family: INORGANIC_COMPOUND_CIDS.has(record.cid) ? "inorganic" : "organic",
    atomCounts: countAtoms(structure),
    totalAtoms: structure.atoms.length,
    structure,
  };
});

const elementCompounds: readonly ReactionCompound[] = elementCompoundRecords.map((record) => {
  const structure: MolecularStructure = {
    cid: record.cid,
    atoms: record.atoms,
    bonds: record.bonds,
    representation: record.representation,
    source: record.source,
  };
  return {
    id: record.id,
    formula: displayFormula(record.formula),
    name: record.name,
    feature: record.feature,
    kind: record.kind,
    family: record.family,
    atomCounts: countAtoms(structure),
    totalAtoms: structure.atoms.length,
    structure,
  };
});

export const REACTION_COMPOUNDS: readonly ReactionCompound[] = [
  ...molecularCompounds,
  ...elementCompounds,
];

export const COMPOUND_KIND_LABELS: Readonly<Record<CompoundKind, string>> = {
  molecule: "分子",
  "formula-unit": "配方单元",
  allotrope: "单质结构",
  hydrate: "水合物",
  intermetallic: "材料结构",
};
