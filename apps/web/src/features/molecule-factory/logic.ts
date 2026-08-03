import type { AtomCounts, ReactionCompound } from "../reaction-furnace/logic";

export const TREASURE_BASIN_ELEMENT_LIMIT = 90;
export const TREASURE_BASIN_FREE_ATOM_LIMIT = 240;
export const MOLECULE_FACTORY_SUGGESTION_LIMIT = 3;
export const MOLECULE_FACTORY_SUGGESTION_DURATION_MS = 5_000;

export type PolyatomicIon = {
  id: string;
  formula: string;
  name: string;
  charge: number;
  chargeLabel: string;
  atomCounts: AtomCounts;
};

export type TreasureBasinAssemblyPlan = {
  freeAtomCounts: AtomCounts;
  ionIds: readonly string[];
};

export const POLYATOMIC_IONS: readonly PolyatomicIon[] = [
  { id: "hydroxide", formula: "OH⁻", name: "氢氧根", charge: -1, chargeLabel: "−1", atomCounts: { O: 1, H: 1 } },
  { id: "nitrate", formula: "NO₃⁻", name: "硝酸根", charge: -1, chargeLabel: "−1", atomCounts: { N: 1, O: 3 } },
  { id: "sulfate", formula: "SO₄²⁻", name: "硫酸根", charge: -2, chargeLabel: "−2", atomCounts: { S: 1, O: 4 } },
  { id: "carbonate", formula: "CO₃²⁻", name: "碳酸根", charge: -2, chargeLabel: "−2", atomCounts: { C: 1, O: 3 } },
  { id: "ammonium", formula: "NH₄⁺", name: "铵根", charge: 1, chargeLabel: "+1", atomCounts: { N: 1, H: 4 } },
  { id: "phosphate", formula: "PO₄³⁻", name: "磷酸根", charge: -3, chargeLabel: "−3", atomCounts: { P: 1, O: 4 } },
  { id: "bicarbonate", formula: "HCO₃⁻", name: "碳酸氢根", charge: -1, chargeLabel: "−1", atomCounts: { H: 1, C: 1, O: 3 } },
  { id: "permanganate", formula: "MnO₄⁻", name: "高锰酸根", charge: -1, chargeLabel: "−1", atomCounts: { Mn: 1, O: 4 } },
  { id: "sulfite", formula: "SO₃²⁻", name: "亚硫酸根", charge: -2, chargeLabel: "−2", atomCounts: { S: 1, O: 3 } },
  { id: "nitrite", formula: "NO₂⁻", name: "亚硝酸根", charge: -1, chargeLabel: "−1", atomCounts: { N: 1, O: 2 } },
];

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
  formedIons: readonly PolyatomicIon[] = [],
) {
  return planTreasureBasinCompoundAssembly(pool, formedIons, compound) !== undefined;
}

export function discoverPolyatomicIons(
  pool: AtomCounts,
  formedIds: ReadonlySet<string>,
) {
  return POLYATOMIC_IONS
    .filter((ion) => (
      !formedIds.has(ion.id)
      && Object.entries(ion.atomCounts).every(
        ([symbol, count]) => (pool[symbol] ?? 0) >= count,
      )
    ))
    .sort((first, second) => (
      treasureBasinAtomTotal(second.atomCounts) - treasureBasinAtomTotal(first.atomCounts)
      || first.id.localeCompare(second.id)
    ));
}

function countsFitWithin(available: AtomCounts, required: AtomCounts) {
  return Object.entries(required).every(
    ([symbol, count]) => (available[symbol] ?? 0) >= count,
  );
}

function subtractCounts(available: AtomCounts, consumed: AtomCounts) {
  const next = { ...available };
  for (const [symbol, count] of Object.entries(consumed)) {
    const remaining = (next[symbol] ?? 0) - count;
    if (remaining > 0) next[symbol] = remaining;
    else delete next[symbol];
  }
  return next;
}

export function planTreasureBasinCompoundAssembly(
  pool: AtomCounts,
  formedIons: readonly PolyatomicIon[],
  compound: ReactionCompound,
): TreasureBasinAssemblyPlan | undefined {
  const usableIons = formedIons.filter((ion) => countsFitWithin(compound.atomCounts, ion.atomCounts));
  let bestPlan: TreasureBasinAssemblyPlan | undefined;
  let bestIonAtomCount = -1;
  const subsetCount = 2 ** usableIons.length;

  for (let mask = 0; mask < subsetCount; mask += 1) {
    let remaining = { ...compound.atomCounts };
    const ionIds: string[] = [];
    let ionAtomCount = 0;
    let validSubset = true;
    for (let index = 0; index < usableIons.length; index += 1) {
      if ((mask & (2 ** index)) === 0) continue;
      const ion = usableIons[index]!;
      if (!countsFitWithin(remaining, ion.atomCounts)) {
        validSubset = false;
        break;
      }
      remaining = subtractCounts(remaining, ion.atomCounts);
      ionIds.push(ion.id);
      ionAtomCount += treasureBasinAtomTotal(ion.atomCounts);
    }
    if (
      validSubset
      && countsFitWithin(pool, remaining)
      && ionAtomCount > bestIonAtomCount
    ) {
      bestPlan = { freeAtomCounts: remaining, ionIds };
      bestIonAtomCount = ionAtomCount;
    }
  }
  return bestPlan;
}

type MatchOptions = {
  excludeOrganic?: boolean;
  limit?: number;
  random?: () => number;
  avoidIds?: ReadonlySet<string>;
  formedIons?: readonly PolyatomicIon[];
};

function scoreTreasureBasinCompound(
  pool: AtomCounts,
  formedIons: readonly PolyatomicIon[],
  compound: ReactionCompound,
) {
  const plan = planTreasureBasinCompoundAssembly(pool, formedIons, compound);
  const usedIonIds = new Set(plan?.ionIds ?? []);
  const usedIonAtomCount = formedIons
    .filter((ion) => usedIonIds.has(ion.id))
    .reduce((total, ion) => total + treasureBasinAtomTotal(ion.atomCounts), 0);
  const freeAtomCount = treasureBasinAtomTotal(plan?.freeAtomCounts ?? {});
  const poolTotal = treasureBasinAtomTotal(pool)
    + formedIons.reduce((total, ion) => total + treasureBasinAtomTotal(ion.atomCounts), 0);
  const distinctElements = Object.keys(compound.atomCounts).length;
  const exactComposition = compound.totalAtoms === poolTotal
    && Object.keys(pool).every(
      (symbol) => (compound.atomCounts[symbol] ?? 0) === (pool[symbol] ?? 0),
    );
  return (
    (usedIonAtomCount > 0 ? 1_000_000 : 0)
    + usedIonAtomCount * 10_000
    - freeAtomCount * 100
    + (exactComposition ? 100_000 : 0)
    + compound.totalAtoms * 100
    + distinctElements * 20
    + compound.curriculumPriority * 5
  );
}

function shuffle<T>(values: readonly T[], random: () => number) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

export function findTreasureBasinMatches(
  pool: AtomCounts,
  library: readonly ReactionCompound[],
  completedIds: ReadonlySet<string>,
  options: MatchOptions = {},
) {
  const candidates = library
    .filter((compound) => (
      !completedIds.has(compound.id)
      && (!options.excludeOrganic || compound.family !== "organic")
      && canFormTreasureBasinCompound(pool, compound, options.formedIons)
    ));
  const ranked = options.random
    ? shuffle(candidates, options.random)
    : candidates.sort((first, second) => (
      scoreTreasureBasinCompound(pool, options.formedIons ?? [], second)
      - scoreTreasureBasinCompound(pool, options.formedIons ?? [], first)
      || first.id.localeCompare(second.id)
    ));
  const rotated = options.avoidIds?.size
    ? [
      ...ranked.filter((compound) => !options.avoidIds!.has(compound.id)),
      ...ranked.filter((compound) => options.avoidIds!.has(compound.id)),
    ]
    : ranked;
  return rotated.slice(0, options.limit ?? MOLECULE_FACTORY_SUGGESTION_LIMIT);
}

export function findTreasureBasinMatch(
  pool: AtomCounts,
  library: readonly ReactionCompound[],
  completedIds: ReadonlySet<string>,
  options: Pick<MatchOptions, "excludeOrganic" | "formedIons"> = {},
) {
  return findTreasureBasinMatches(pool, library, completedIds, {
    ...options,
    limit: 1,
  })[0];
}
