export type AtomCounts = Readonly<Record<string, number>>;

export type CompoundKind =
  | "molecule"
  | "formula-unit"
  | "allotrope"
  | "hydrate"
  | "intermetallic";

export type CompoundFamily = "organic" | "inorganic";

export type StructureRepresentation =
  | "authoritative-topology"
  | "composition-schematic"
  | "representative-lattice";

export type CompoundCategory =
  | "acid"
  | "base"
  | "salt"
  | "oxide"
  | "allotrope"
  | "simple-substance"
  | "other";

export type MolecularAtom = {
  symbol: string;
  x: number;
  y: number;
  z?: number;
};

export type MolecularBond = {
  from: number;
  to: number;
  order: 1 | 2 | 3;
  style?: "solid" | "dashed";
};

export type MolecularStructure = {
  cid?: number;
  atoms: readonly MolecularAtom[];
  bonds: readonly MolecularBond[];
  representation: StructureRepresentation;
  source: {
    name: string;
    url: string;
    wikidataId?: string;
    wikipediaTitle?: string;
  };
};

export type CompoundProperties = {
  molecularFormula: string | null;
  molecularWeight: string | null;
  iupacName: string | null;
  xLogP: number | null;
  topologicalPolarSurfaceArea: number | null;
  complexity: number | null;
  charge: number | null;
  hydrogenBondDonorCount: number | null;
  hydrogenBondAcceptorCount: number | null;
  rotatableBondCount: number | null;
  heavyAtomCount: number | null;
};

export type CompoundProfile = {
  summary: string;
  englishName: string;
  composition: string;
  classification: string;
  structureNote: string;
  learningPoints: readonly string[];
  safetyNote: string;
  properties: CompoundProperties | null;
};

export type CompoundImage = {
  kind: "pubchem-atlas";
  path: string;
  atlasIndex: number;
  columns: number;
  rows: number;
  alt: string;
  sourceUrl: string;
  attribution: string;
};

export type ReactionCompound = {
  id: string;
  cid: number | null;
  formula: string;
  sourceFormula: string;
  name: string;
  nameEnglish: string;
  feature: string;
  kind: CompoundKind;
  family: CompoundFamily;
  category: CompoundCategory;
  curriculumPriority: 0 | 1 | 2;
  atomCounts: AtomCounts;
  totalAtoms: number;
  structure: MolecularStructure;
  profile: CompoundProfile;
  image: CompoundImage | null;
};

export type AtomBundle = {
  id: string;
  symbol: string;
  count: number;
};

export const REACTION_FURNACE_TARGET_COUNT = 10;
export const REACTION_FURNACE_ATOM_BUDGET = 160;
export const REACTION_FURNACE_ORGANIC_COUNT = 2;
export const REACTION_FURNACE_PRIORITY_ELEMENT_COUNT = 10;
export const REACTION_FURNACE_MIN_DISTINCT_ELEMENT_COUNT = 10;

const SUBSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
};

export function normalizeFormula(formula: string) {
  return [...formula]
    .map((character) => SUBSCRIPT_DIGITS[character] ?? character)
    .join("")
    .replace(/\s+/g, "")
    .replace(/[⁺⁻]+$/u, "")
    .replace(/[+-]\d*$/, "");
}

function readNumber(source: string, start: number) {
  let index = start;
  while (/\d/.test(source[index] ?? "")) index += 1;
  if (index === start) return { value: 1, next: start };
  return { value: Number(source.slice(start, index)), next: index };
}

function mergeCounts(target: Record<string, number>, source: AtomCounts, multiplier = 1) {
  for (const [symbol, count] of Object.entries(source)) {
    target[symbol] = (target[symbol] ?? 0) + count * multiplier;
  }
}

function parseGroup(
  source: string,
  start: number,
  closing: ")" | "]" | null,
): { counts: Record<string, number>; next: number } | null {
  const counts: Record<string, number> = {};
  let index = start;

  while (index < source.length) {
    const character = source[index]!;
    if (closing && character === closing) {
      return { counts, next: index + 1 };
    }
    if (character === "(" || character === "[") {
      const nested = parseGroup(source, index + 1, character === "(" ? ")" : "]");
      if (!nested) return null;
      const multiplier = readNumber(source, nested.next);
      mergeCounts(counts, nested.counts, multiplier.value);
      index = multiplier.next;
      continue;
    }
    if (!/[A-Z]/.test(character)) return null;

    let symbol = character;
    index += 1;
    if (/[a-z]/.test(source[index] ?? "")) {
      symbol += source[index];
      index += 1;
    }
    const multiplier = readNumber(source, index);
    counts[symbol] = (counts[symbol] ?? 0) + multiplier.value;
    index = multiplier.next;
  }

  return closing ? null : { counts, next: index };
}

export function parseFormula(formula: string): Record<string, number> | null {
  const normalized = normalizeFormula(formula);
  if (!normalized) return null;

  const total: Record<string, number> = {};
  for (const rawSegment of normalized.split(/[·.]/u)) {
    if (!rawSegment) return null;
    const coefficient = readNumber(rawSegment, 0);
    const segmentSource = rawSegment.slice(coefficient.next);
    if (!segmentSource) return null;
    const parsed = parseGroup(segmentSource, 0, null);
    if (!parsed || parsed.next !== segmentSource.length) return null;
    mergeCounts(total, parsed.counts, coefficient.value);
  }
  return Object.keys(total).length > 0 ? total : null;
}

export function atomCountTotal(counts: AtomCounts) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

export function selectRandomCompounds<T>(
  library: readonly T[],
  count: number,
  random: () => number = Math.random,
) {
  const pool = [...library];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex]!, pool[index]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

export function isOrganicCompound(compound: ReactionCompound) {
  return compound.family === "organic";
}

export function compoundElementSymbols(compound: ReactionCompound) {
  return Object.keys(compound.atomCounts);
}

function distinctElementSymbols(compounds: readonly ReactionCompound[]) {
  return new Set(compounds.flatMap(compoundElementSymbols));
}

function shuffled<T>(values: readonly T[], random: () => number) {
  return selectRandomCompounds(values, values.length, random);
}

function selectPriorityElements(
  inorganicPool: readonly ReactionCompound[],
  count: number,
  random: () => number,
) {
  const frequency = new Map<string, number>();
  for (const compound of inorganicPool) {
    for (const symbol of compoundElementSymbols(compound)) {
      frequency.set(symbol, (frequency.get(symbol) ?? 0) + 1);
    }
  }
  const byFrequency = [...frequency]
    .sort((first, second) => second[1] - first[1])
    .map(([symbol]) => symbol);
  const bridgePool = byFrequency.slice(0, Math.min(6, byFrequency.length));
  const bridgeCount = Math.min(2, count, bridgePool.length);
  const bridges = shuffled(bridgePool, random).slice(0, bridgeCount);
  const bridgeSet = new Set(bridges);
  const lessFrequent = byFrequency.filter(
    (symbol) => !bridgeSet.has(symbol) && !bridgePool.includes(symbol),
  );
  const remainingPool = [
    ...shuffled(lessFrequent, random),
    ...shuffled(
      bridgePool.filter((symbol) => !bridgeSet.has(symbol)),
      random,
    ),
  ];
  return [...bridges, ...remainingPool.slice(0, count - bridges.length)];
}

function chooseDiverseCompounds(
  candidates: readonly ReactionCompound[],
  count: number,
  preferredElements: ReadonlySet<string>,
  alreadySelected: readonly ReactionCompound[],
  atomBudget: number,
  random: () => number,
) {
  const selected: ReactionCompound[] = [];
  const coveredElements = distinctElementSymbols(alreadySelected);
  const coveredPreferred = new Set(
    [...coveredElements].filter((symbol) => preferredElements.has(symbol)),
  );
  const coveredCategories = new Set(alreadySelected.map((compound) => compound.category));
  let usedAtoms = alreadySelected.reduce((total, compound) => total + compound.totalAtoms, 0);

  while (selected.length < count) {
    const slotsAfterCandidate = count - selected.length - 1;
    const usedIds = new Set([...alreadySelected, ...selected].map((compound) => compound.id));
    const available = candidates.filter((candidate) => {
      if (usedIds.has(candidate.id) || usedAtoms + candidate.totalAtoms > atomBudget) return false;
      const remainingAtomCounts = candidates
        .filter((compound) => compound.id !== candidate.id && !usedIds.has(compound.id))
        .map((compound) => compound.totalAtoms)
        .sort((first, second) => first - second)
        .slice(0, slotsAfterCandidate);
      if (remainingAtomCounts.length < slotsAfterCandidate) return false;
      const remainingMinimum = remainingAtomCounts.reduce((total, atoms) => total + atoms, 0);
      return slotsAfterCandidate === 0
        || usedAtoms + candidate.totalAtoms + remainingMinimum <= atomBudget;
    });
    if (available.length === 0) return null;

    const ranked = shuffled(available, random)
      .map((candidate) => {
        const symbols = compoundElementSymbols(candidate);
        const preferredGain = symbols.filter(
          (symbol) => preferredElements.has(symbol) && !coveredPreferred.has(symbol),
        ).length;
        const diversityGain = symbols.filter((symbol) => !coveredElements.has(symbol)).length;
        const preferredRelation = symbols.some((symbol) => preferredElements.has(symbol)) ? 1 : 0;
        const categoryGain = coveredCategories.has(candidate.category) ? 0 : 1;
        return {
          candidate,
          score:
            preferredGain * 100
            + diversityGain * 12
            + categoryGain * 7
            + candidate.curriculumPriority * 4
            + preferredRelation * 3,
        };
      })
      .sort((first, second) => second.score - first.score);
    const bestScore = ranked[0]!.score;
    const equallyUseful = ranked.filter((entry) => entry.score === bestScore);
    const chosen = equallyUseful[Math.floor(random() * equallyUseful.length)]!.candidate;
    selected.push(chosen);
    usedAtoms += chosen.totalAtoms;
    for (const symbol of compoundElementSymbols(chosen)) {
      coveredElements.add(symbol);
      if (preferredElements.has(symbol)) coveredPreferred.add(symbol);
    }
    coveredCategories.add(chosen.category);
  }
  return selected;
}

export type ReactionRoundSelection = {
  targetElements: readonly string[];
  compounds: readonly ReactionCompound[];
};

export function selectReactionRoundPlan(
  library: readonly ReactionCompound[],
  count = REACTION_FURNACE_TARGET_COUNT,
  atomBudget = REACTION_FURNACE_ATOM_BUDGET,
  random: () => number = Math.random,
  organicCount = REACTION_FURNACE_ORGANIC_COUNT,
  priorityElementCount = REACTION_FURNACE_PRIORITY_ELEMENT_COUNT,
  minimumDistinctElementCount = REACTION_FURNACE_MIN_DISTINCT_ELEMENT_COUNT,
): ReactionRoundSelection {
  const targetCount = Math.min(Math.max(0, Math.floor(count)), library.length);
  if (targetCount === 0) return { targetElements: [], compounds: [] };
  const requiredOrganicCount = Math.max(0, Math.floor(organicCount));
  const requiredInorganicCount = targetCount - requiredOrganicCount;
  if (requiredOrganicCount > targetCount) {
    throw new RangeError(`有机物数量 ${requiredOrganicCount} 超过了本批目标数 ${targetCount}`);
  }

  const organicPool = library.filter(isOrganicCompound);
  const inorganicPool = library.filter((compound) => !isOrganicCompound(compound));
  if (organicPool.length < requiredOrganicCount) {
    throw new RangeError(`资料库无法提供 ${requiredOrganicCount} 种有机物`);
  }
  if (inorganicPool.length < requiredInorganicCount) {
    throw new RangeError(`资料库无法提供 ${requiredInorganicCount} 种无机物`);
  }

  const availableElements = [...distinctElementSymbols(inorganicPool)];
  const selectedPriorityElementCount = Math.min(
    Math.max(0, Math.floor(priorityElementCount)),
    availableElements.length,
  );
  const requiredDistinctElementCount = Math.min(
    Math.max(0, Math.floor(minimumDistinctElementCount)),
    availableElements.length,
  );

  const smallestPossibleAtoms = [
    ...inorganicPool.map((compound) => compound.totalAtoms).sort((a, b) => a - b).slice(0, requiredInorganicCount),
    ...organicPool.map((compound) => compound.totalAtoms).sort((a, b) => a - b).slice(0, requiredOrganicCount),
  ].reduce((total, atoms) => total + atoms, 0);
  if (smallestPossibleAtoms > atomBudget) {
    throw new RangeError(`原子总量上限 ${atomBudget} 无法容纳 ${targetCount} 种物质`);
  }

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const targetElements = selectPriorityElements(
      inorganicPool,
      selectedPriorityElementCount,
      random,
    );
    const preferredElements = new Set(targetElements);
    const selectedInorganic = chooseDiverseCompounds(
      inorganicPool,
      requiredInorganicCount,
      preferredElements,
      [],
      atomBudget,
      random,
    );
    if (!selectedInorganic) continue;
    const selectedOrganic = chooseDiverseCompounds(
      organicPool,
      requiredOrganicCount,
      preferredElements,
      selectedInorganic,
      atomBudget,
      random,
    );
    if (!selectedOrganic) continue;

    const compounds = shuffled([...selectedInorganic, ...selectedOrganic], random);
    const selectedElements = distinctElementSymbols(compounds);
    if (targetElements.some((symbol) => !selectedElements.has(symbol))) continue;
    if (selectedElements.size < requiredDistinctElementCount) continue;
    return { targetElements, compounds };
  }

  throw new Error(
    `无法同时满足 ${requiredOrganicCount} 种有机物、${requiredDistinctElementCount} 种元素和原子总量限制`,
  );
}

export function selectReactionRound(
  library: readonly ReactionCompound[],
  count = REACTION_FURNACE_TARGET_COUNT,
  atomBudget = REACTION_FURNACE_ATOM_BUDGET,
  random: () => number = Math.random,
) {
  return selectReactionRoundPlan(library, count, atomBudget, random).compounds;
}

export function buildAtomBundles(compounds: readonly ReactionCompound[]) {
  const totals: Record<string, number> = {};
  for (const compound of compounds) mergeCounts(totals, compound.atomCounts);

  const bundles: AtomBundle[] = [];
  for (const [symbol, total] of Object.entries(totals).sort(([a], [b]) => a.localeCompare(b))) {
    if (total <= 12) {
      for (let index = 0; index < total; index += 1) {
        bundles.push({ id: `${symbol}-${index + 1}`, symbol, count: 1 });
      }
      continue;
    }
    let remaining = total;
    let group = 1;
    while (remaining > 0) {
      const count = Math.min(10, remaining);
      bundles.push({ id: `${symbol}-group-${group}`, symbol, count });
      group += 1;
      remaining -= count;
    }
  }
  return bundles;
}

export function findCompletableCompound(
  pool: AtomCounts,
  compounds: readonly ReactionCompound[],
  completedIds: ReadonlySet<string>,
) {
  return compounds.find((compound) => (
    !completedIds.has(compound.id)
    && Object.entries(compound.atomCounts)
      .every(([symbol, count]) => (pool[symbol] ?? 0) >= count)
  ));
}

export function consumeAtomCounts(pool: AtomCounts, required: AtomCounts) {
  const next = { ...pool };
  for (const [symbol, count] of Object.entries(required)) {
    const remaining = (next[symbol] ?? 0) - count;
    if (remaining < 0) throw new Error(`原子数量不足：${symbol}`);
    if (remaining === 0) delete next[symbol];
    else next[symbol] = remaining;
  }
  return next;
}
