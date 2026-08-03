import compoundCatalogAsset from "../../../../../content/chemistry/compound-catalog.v1.json";
import type {
  CompoundCategory,
  CompoundFamily,
  CompoundImage,
  CompoundKind,
  CompoundProfile,
  MolecularStructure,
  ReactionCompound,
  StructureRepresentation,
} from "./logic";

type CatalogRecord = {
  id: string;
  cid: number | null;
  formula: string;
  displayFormula: string;
  name: string;
  nameEnglish: string;
  feature: string;
  family: CompoundFamily;
  kind: CompoundKind;
  category: CompoundCategory;
  curriculumPriority: 0 | 1 | 2;
  atomCounts: Readonly<Record<string, number>>;
  totalAtoms: number;
  structure: {
    cid: number | null;
    atoms: MolecularStructure["atoms"];
    bonds: MolecularStructure["bonds"];
    representation: StructureRepresentation;
    source: MolecularStructure["source"];
  };
  profile: CompoundProfile;
  image: CompoundImage | null;
};

const records = compoundCatalogAsset.records as unknown as readonly CatalogRecord[];

export const REACTION_COMPOUNDS: readonly ReactionCompound[] = records.map((record) => ({
  id: record.id,
  cid: record.cid,
  formula: record.displayFormula,
  sourceFormula: record.formula,
  name: record.name,
  nameEnglish: record.nameEnglish,
  feature: record.feature,
  family: record.family,
  kind: record.kind,
  category: record.category,
  curriculumPriority: record.curriculumPriority,
  atomCounts: record.atomCounts,
  totalAtoms: record.totalAtoms,
  structure: {
    ...(record.structure.cid === null ? {} : { cid: record.structure.cid }),
    atoms: record.structure.atoms,
    bonds: record.structure.bonds,
    representation: record.structure.representation,
    source: record.structure.source,
  },
  profile: record.profile,
  image: record.image,
}));

const compoundsByElement = new Map<string, ReactionCompound[]>();
for (const compound of REACTION_COMPOUNDS) {
  for (const symbol of Object.keys(compound.atomCounts)) {
    const current = compoundsByElement.get(symbol) ?? [];
    current.push(compound);
    compoundsByElement.set(symbol, current);
  }
}
for (const compounds of compoundsByElement.values()) {
  compounds.sort((first, second) => (
    second.curriculumPriority - first.curriculumPriority
    || first.name.localeCompare(second.name, "zh-CN")
    || first.id.localeCompare(second.id)
  ));
}

export function compoundsContainingElement(symbol: string): readonly ReactionCompound[] {
  return compoundsByElement.get(symbol) ?? [];
}

export const COMPOUND_KIND_LABELS: Readonly<Record<CompoundKind, string>> = {
  molecule: "分子",
  "formula-unit": "配方单元",
  allotrope: "单质结构",
  hydrate: "水合物",
  intermetallic: "材料结构",
};

export const COMPOUND_CATEGORY_LABELS: Readonly<Record<CompoundCategory, string>> = {
  acid: "酸",
  base: "碱",
  salt: "盐",
  oxide: "氧化物",
  allotrope: "同素异形体",
  "simple-substance": "单质",
  other: "其他",
};
