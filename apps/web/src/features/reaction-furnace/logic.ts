export type AtomCounts = Readonly<Record<string, number>>;

export type CompoundKind =
  | "molecule"
  | "formula-unit"
  | "allotrope"
  | "hydrate"
  | "intermetallic";

export type MolecularAtom = {
  symbol: string;
  x: number;
  y: number;
};

export type MolecularBond = {
  from: number;
  to: number;
  order: 1 | 2 | 3;
};

export type MolecularStructure = {
  cid: number;
  atoms: readonly MolecularAtom[];
  bonds: readonly MolecularBond[];
  source: {
    name: "PubChem";
    url: string;
    wikidataId?: string;
    wikipediaTitle?: string;
  };
};

export type ReactionCompound = {
  id: string;
  formula: string;
  name: string;
  feature: string;
  kind: CompoundKind;
  atomCounts: AtomCounts;
  totalAtoms: number;
  structure: MolecularStructure;
};

export type AtomBundle = {
  id: string;
  symbol: string;
  count: number;
};

export const REACTION_FURNACE_TARGET_COUNT = 10;
export const REACTION_FURNACE_ATOM_BUDGET = 160;
export const REACTION_FURNACE_MIN_CARBON_FREE_COUNT = 5;

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

export function isCarbonFreeCompound(compound: ReactionCompound) {
  return (compound.atomCounts.C ?? 0) === 0;
}

function minimumCompletionAtomCount(
  candidates: readonly ReactionCompound[],
  slotCount: number,
  minimumCarbonFreeCount: number,
) {
  if (slotCount < minimumCarbonFreeCount || candidates.length < slotCount) {
    return Number.POSITIVE_INFINITY;
  }
  const carbonFree = candidates
    .filter(isCarbonFreeCompound)
    .sort((first, second) => first.totalAtoms - second.totalAtoms);
  if (carbonFree.length < minimumCarbonFreeCount) {
    return Number.POSITIVE_INFINITY;
  }

  const requiredCarbonFree = carbonFree.slice(0, minimumCarbonFreeCount);
  const requiredSet = new Set(requiredCarbonFree);
  const remaining = candidates
    .filter((compound) => !requiredSet.has(compound))
    .sort((first, second) => first.totalAtoms - second.totalAtoms)
    .slice(0, slotCount - minimumCarbonFreeCount);
  if (remaining.length !== slotCount - minimumCarbonFreeCount) {
    return Number.POSITIVE_INFINITY;
  }
  return [...requiredCarbonFree, ...remaining]
    .reduce((total, compound) => total + compound.totalAtoms, 0);
}

export function selectReactionRound(
  library: readonly ReactionCompound[],
  count = REACTION_FURNACE_TARGET_COUNT,
  atomBudget = REACTION_FURNACE_ATOM_BUDGET,
  random: () => number = Math.random,
  minimumCarbonFreeCount = REACTION_FURNACE_MIN_CARBON_FREE_COUNT,
) {
  const targetCount = Math.min(Math.max(0, Math.floor(count)), library.length);
  if (targetCount === 0) return [];
  const requiredCarbonFreeCount = Math.max(0, Math.floor(minimumCarbonFreeCount));
  if (requiredCarbonFreeCount > targetCount) {
    throw new RangeError(`无碳结构下限 ${requiredCarbonFreeCount} 超过了本批目标数 ${targetCount}`);
  }

  const shuffled = selectRandomCompounds(library, library.length, random);
  const minimumPossibleAtoms = minimumCompletionAtomCount(
    library,
    targetCount,
    requiredCarbonFreeCount,
  );
  if (!Number.isFinite(minimumPossibleAtoms)) {
    throw new RangeError(`资料库无法提供 ${requiredCarbonFreeCount} 种不含碳的目标物质`);
  }
  if (minimumPossibleAtoms > atomBudget) {
    throw new RangeError(`原子总量上限 ${atomBudget} 无法容纳 ${targetCount} 种物质`);
  }

  const selected: ReactionCompound[] = [];
  let selectedAtomCount = 0;
  let selectedCarbonFreeCount = 0;
  for (let index = 0; index < shuffled.length && selected.length < targetCount; index += 1) {
    const candidate = shuffled[index]!;
    const remainingSlots = targetCount - selected.length - 1;
    const nextCarbonFreeCount = selectedCarbonFreeCount
      + (isCarbonFreeCompound(candidate) ? 1 : 0);
    const remainingCarbonFreeNeeded = Math.max(
      0,
      requiredCarbonFreeCount - nextCarbonFreeCount,
    );
    const minimumFutureAtoms = minimumCompletionAtomCount(
      shuffled.slice(index + 1),
      remainingSlots,
      remainingCarbonFreeNeeded,
    );
    if (
      Number.isFinite(minimumFutureAtoms)
      && selectedAtomCount + candidate.totalAtoms + minimumFutureAtoms <= atomBudget
    ) {
      selected.push(candidate);
      selectedAtomCount += candidate.totalAtoms;
      selectedCarbonFreeCount = nextCarbonFreeCount;
    }
  }

  if (
    selected.length !== targetCount
    || selectedCarbonFreeCount < requiredCarbonFreeCount
  ) {
    throw new Error(`无法为反应熔炉选出 ${targetCount} 种目标物质`);
  }
  return selected;
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
