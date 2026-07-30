import molecularStructureAsset from "../../../../../content/chemistry/molecular-structures.v1.json";
import type {
  CompoundKind,
  MolecularStructure,
  ReactionCompound,
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

const records = molecularStructureAsset.records as readonly AssetRecord[];

export const REACTION_COMPOUNDS: readonly ReactionCompound[] = records.map((record) => {
  const structure: MolecularStructure = {
    cid: record.cid,
    atoms: record.atoms,
    bonds: record.bonds,
    source: record.source,
  };
  return {
    id: `compound-${record.id}`,
    formula: displayFormula(CONVENTIONAL_FORMULA_BY_CID.get(record.cid) ?? record.formula),
    name: record.name,
    feature: record.feature,
    kind: "molecule",
    atomCounts: countAtoms(structure),
    totalAtoms: structure.atoms.length,
    structure,
  };
});

export const COMPOUND_KIND_LABELS: Readonly<Record<CompoundKind, string>> = {
  molecule: "分子",
  "formula-unit": "配方单元",
  allotrope: "单质结构",
  hydrate: "水合物",
  intermetallic: "材料结构",
};
