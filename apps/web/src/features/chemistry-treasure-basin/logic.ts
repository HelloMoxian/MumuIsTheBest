import type { AtomCounts, ReactionCompound } from "../reaction-furnace/logic";

export const TREASURE_BASIN_ELEMENT_LIMIT = 90;
export const TREASURE_BASIN_FREE_ATOM_LIMIT = 240;

const TREASURE_ELEMENT_BATCH_SIZES: Readonly<Record<string, number>> = {
  H: 5,
  C: 5,
  O: 3,
};

export function treasureBasinElementBatchSize(symbol: string) {
  return TREASURE_ELEMENT_BATCH_SIZES[symbol] ?? 1;
}

export function canAddTreasureBasinElementBatch(
  pool: AtomCounts,
  symbol: string,
) {
  return (
    treasureBasinAtomTotal(pool) + treasureBasinElementBatchSize(symbol)
    <= TREASURE_BASIN_FREE_ATOM_LIMIT
  );
}

export function atomCountsKey(counts: AtomCounts) {
  return Object.entries(counts)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([symbol, count]) => `${symbol}:${count}`)
    .join("|");
}

function isBetterRepresentative(
  candidate: ReactionCompound,
  current: ReactionCompound,
) {
  return (
    candidate.curriculumPriority > current.curriculumPriority
    || (
      candidate.curriculumPriority === current.curriculumPriority
      && candidate.family === "inorganic"
      && current.family !== "inorganic"
    )
    || (
      candidate.curriculumPriority === current.curriculumPriority
      && candidate.family === current.family
      && candidate.id.localeCompare(current.id) < 0
    )
  );
}

export function buildTreasureBasinLibrary(
  library: readonly ReactionCompound[],
  allowedSymbols: ReadonlySet<string>,
) {
  const representativeByComposition = new Map<string, ReactionCompound>();
  for (const compound of library) {
    const symbols = Object.keys(compound.atomCounts);
    if (
      compound.totalAtoms < 2
      || symbols.some((symbol) => !allowedSymbols.has(symbol))
    ) {
      continue;
    }
    const key = atomCountsKey(compound.atomCounts);
    const current = representativeByComposition.get(key);
    if (!current || isBetterRepresentative(compound, current)) {
      representativeByComposition.set(key, compound);
    }
  }
  return [...representativeByComposition.values()];
}

export function addTreasureBasinAtom(
  pool: AtomCounts,
  symbol: string,
  amount = 1,
): AtomCounts {
  return {
    ...pool,
    [symbol]: (pool[symbol] ?? 0) + amount,
  };
}

export function treasureBasinAtomTotal(pool: AtomCounts) {
  return Object.values(pool).reduce((total, count) => total + count, 0);
}

export function indexTreasureBasinDiscoveries(
  discoveries: readonly ReactionCompound[],
) {
  const byElement: Record<string, ReactionCompound[]> = {};
  for (const compound of discoveries) {
    for (const symbol of Object.keys(compound.atomCounts)) {
      (byElement[symbol] ??= []).push(compound);
    }
  }
  return byElement;
}

export function canFormTreasureBasinCompound(
  pool: AtomCounts,
  compound: ReactionCompound,
) {
  return Object.entries(compound.atomCounts).every(
    ([symbol, count]) => (pool[symbol] ?? 0) >= count,
  );
}

export function findTreasureBasinMatch(
  pool: AtomCounts,
  library: readonly ReactionCompound[],
  completedIds: ReadonlySet<string>,
) {
  const poolTotal = treasureBasinAtomTotal(pool);
  return library
    .filter(
      (compound) => !completedIds.has(compound.id) && canFormTreasureBasinCompound(pool, compound),
    )
    .map((compound) => {
      const distinctElements = Object.keys(compound.atomCounts).length;
      const exactComposition = compound.totalAtoms === poolTotal
        && Object.keys(pool).every(
          (symbol) => (compound.atomCounts[symbol] ?? 0) === (pool[symbol] ?? 0),
        );
      return {
        compound,
        score:
          (exactComposition ? 100_000 : 0)
          + compound.totalAtoms * 100
          + distinctElements * 20
          + compound.curriculumPriority * 5,
      };
    })
    .sort((first, second) => (
      second.score - first.score
      || first.compound.id.localeCompare(second.compound.id)
    ))[0]?.compound;
}
