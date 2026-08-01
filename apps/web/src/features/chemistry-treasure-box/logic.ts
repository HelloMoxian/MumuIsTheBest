import type { AtomCounts, ReactionCompound } from "../reaction-furnace/logic";

export const TREASURE_BOX_ELEMENT_LIMIT = 90;
export const TREASURE_BOX_FREE_ATOM_LIMIT = 240;

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

export function buildTreasureBoxLibrary(
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

export function addTreasureAtom(pool: AtomCounts, symbol: string): AtomCounts {
  return {
    ...pool,
    [symbol]: (pool[symbol] ?? 0) + 1,
  };
}

export function treasureAtomTotal(pool: AtomCounts) {
  return Object.values(pool).reduce((total, count) => total + count, 0);
}

export function indexTreasureDiscoveries(
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

export function canFormTreasureCompound(
  pool: AtomCounts,
  compound: ReactionCompound,
) {
  return Object.entries(compound.atomCounts).every(
    ([symbol, count]) => (pool[symbol] ?? 0) >= count,
  );
}

export function findTreasureBoxMatch(
  pool: AtomCounts,
  library: readonly ReactionCompound[],
  completedIds: ReadonlySet<string>,
) {
  const poolTotal = treasureAtomTotal(pool);
  return library
    .filter(
      (compound) => !completedIds.has(compound.id) && canFormTreasureCompound(pool, compound),
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
