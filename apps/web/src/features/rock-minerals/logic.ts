import {
  RESEARCH_ATTRIBUTE_KEYS,
  type DigBoard,
  type DigCell,
  type MineralCatalogItem,
  type ResearchAttributeKey,
  type RockMineralCatalog,
  type RockMineralProgress,
  type SoilVariant,
  type StrikeResult,
} from "./types";

type RandomSource = () => number;

function randomIndex(length: number, random: RandomSource) {
  return Math.min(length - 1, Math.floor(Math.max(0, random()) * length));
}

export function hitsForRarity(catalog: RockMineralCatalog, rarity: number) {
  return catalog.gameplay.hitsByRarity.find(
    (rule) => rarity >= rule.minRarity && rarity <= rule.maxRarity,
  )?.hits ?? 1;
}

export function pickRarity(catalog: RockMineralCatalog, random: RandomSource = Math.random) {
  const weighted = Object.entries(catalog.gameplay.rarityWeights)
    .map(([rarity, weight]) => ({ rarity: Number(rarity), weight }))
    .filter(({ rarity, weight }) => Number.isInteger(rarity) && weight > 0)
    .sort((left, right) => left.rarity - right.rarity);
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.max(0, random()) * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.rarity;
  }
  return weighted.at(-1)?.rarity ?? 1;
}

export function pickMineral(
  catalog: RockMineralCatalog,
  random: RandomSource = Math.random,
) {
  const rarity = pickRarity(catalog, random);
  const exact = catalog.items.filter((item) => item.rarity === rarity);
  const candidates = exact.length > 0 ? exact : catalog.items;
  return candidates[randomIndex(candidates.length, random)];
}

function makeCell(
  catalog: RockMineralCatalog,
  depth: number,
  column: number,
  random: RandomSource,
): DigCell {
  const hasMineral = random() < catalog.gameplay.mineralProbability;
  const mineral = hasMineral ? pickMineral(catalog, random) : null;
  const soilVariants = catalog.gameplay.soilVariants;
  const soilVariant = soilVariants[randomIndex(soilVariants.length, random)] ?? "clay";
  const totalHits = mineral ? hitsForRarity(catalog, mineral.rarity) : 0;
  return {
    id: `depth-${depth}-column-${column}-${Math.floor(random() * 1_000_000_000)}`,
    depth,
    column,
    soilVariant,
    mineralId: mineral?.id ?? null,
    status: "covered",
    hitsRemaining: totalHits,
    totalHits,
  };
}

export function createBoard(
  catalog: RockMineralCatalog,
  baseDepth = 1,
  random: RandomSource = Math.random,
): DigBoard {
  const cells: DigCell[] = [];
  for (let row = 0; row < catalog.gameplay.rows; row += 1) {
    for (let column = 0; column < catalog.gameplay.columns; column += 1) {
      cells.push(makeCell(catalog, baseDepth + row, column, random));
    }
  }
  return { baseDepth, cells };
}

export function createInitialProgress(
  catalog: RockMineralCatalog,
  random: RandomSource = Math.random,
): RockMineralProgress {
  const starterHammers = Math.max(0, catalog.gameplay.hammer.starterHammers);
  return {
    schemaVersion: 1,
    board: createBoard(catalog, 1, random),
    currentDepth: 0,
    currentHammerDurability: starterHammers > 0 ? catalog.gameplay.hammer.durability : 0,
    spareHammers: Math.max(0, starterHammers - 1),
    inventory: {},
    discoveredIds: [],
    unlockedAttributes: {},
    pendingResearch: null,
    pendingHammerPurchase: null,
    soundEnabled: false,
  };
}

export function isCellAccessible(board: DigBoard, cell: DigCell) {
  if (cell.status === "cleared") return false;
  const activeCells = board.cells.filter((candidate) => candidate.status !== "cleared");
  if (activeCells.length === 0) return false;
  const columnCount = Math.max(...activeCells.map((candidate) => candidate.column)) + 1;
  const ceilingDepth = board.baseDepth - 1;
  const floorDepth = Math.max(...board.cells.map((candidate) => candidate.depth));
  const coordinate = (column: number, depth: number) => `${column}:${depth}`;
  const occupied = new Set(activeCells.map((candidate) => coordinate(candidate.column, candidate.depth)));
  const reachableAir = new Set<string>();
  const queue = Array.from(
    { length: columnCount },
    (_, column) => ({ column, depth: ceilingDepth }),
  );

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const key = coordinate(current.column, current.depth);
    if (reachableAir.has(key) || occupied.has(key)) continue;
    reachableAir.add(key);
    for (const [columnOffset, depthOffset] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const column = current.column + columnOffset;
      const depth = current.depth + depthOffset;
      if (
        column < 0
        || column >= columnCount
        || depth < ceilingDepth
        || depth > floorDepth
      ) continue;
      const nextKey = coordinate(column, depth);
      if (!reachableAir.has(nextKey) && !occupied.has(nextKey)) queue.push({ column, depth });
    }
  }

  return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([columnOffset, depthOffset]) => (
    reachableAir.has(coordinate(cell.column + columnOffset, cell.depth + depthOffset))
  ));
}

function advanceWindowIfBottomHasHole(
  catalog: RockMineralCatalog,
  board: DigBoard,
  random: RandomSource,
) {
  const bottomDepth = board.baseDepth + catalog.gameplay.rows - 1;
  const bottomHasHole = board.cells.some(
    (cell) => cell.depth === bottomDepth && cell.status === "cleared",
  );
  if (!bottomHasHole) return board;

  const nextBaseDepth = board.baseDepth + 1;
  const cells = board.cells.filter(
    (cell) => cell.depth >= nextBaseDepth && cell.depth <= bottomDepth,
  );
  const nextBottomDepth = bottomDepth + 1;
  for (let column = 0; column < catalog.gameplay.columns; column += 1) {
    cells.push(makeCell(catalog, nextBottomDepth, column, random));
  }

  return {
    baseDepth: nextBaseDepth,
    cells,
  };
}

function equipSpareHammer(
  progress: RockMineralProgress,
  catalog: RockMineralCatalog,
) {
  if (progress.currentHammerDurability > 0 || progress.spareHammers <= 0) return progress;
  return {
    ...progress,
    currentHammerDurability: catalog.gameplay.hammer.durability,
    spareHammers: progress.spareHammers - 1,
  };
}

export function addPurchasedHammer(
  progress: RockMineralProgress,
  catalog: RockMineralCatalog,
) {
  if (progress.currentHammerDurability <= 0) {
    return { ...progress, currentHammerDurability: catalog.gameplay.hammer.durability };
  }
  return { ...progress, spareHammers: progress.spareHammers + 1 };
}

export function strikeCell(
  progress: RockMineralProgress,
  cellId: string,
  catalog: RockMineralCatalog,
  random: RandomSource = Math.random,
): StrikeResult {
  const cell = progress.board.cells.find((candidate) => candidate.id === cellId);
  if (!cell || !isCellAccessible(progress.board, cell)) {
    return {
      progress,
      outcome: "blocked",
      cellId,
      collectedMineralId: null,
      firstDiscovery: false,
    };
  }

  if (!cell.mineralId) {
    const cells = progress.board.cells.map((candidate) => (
      candidate.id === cellId ? { ...candidate, status: "cleared" as const } : candidate
    ));
    return {
      progress: {
        ...progress,
        board: advanceWindowIfBottomHasHole(catalog, { ...progress.board, cells }, random),
        currentDepth: Math.max(progress.currentDepth, cell.depth),
      },
      outcome: "soil",
      cellId,
      collectedMineralId: null,
      firstDiscovery: false,
    };
  }

  const equipped = equipSpareHammer(progress, catalog);
  if (equipped.currentHammerDurability <= 0) {
    return {
      progress: equipped,
      outcome: "no-hammer",
      cellId,
      collectedMineralId: null,
      firstDiscovery: false,
    };
  }

  const hitsRemaining = Math.max(0, cell.hitsRemaining - 1);
  const durability = equipped.currentHammerDurability - 1;
  if (hitsRemaining > 0) {
    return {
      progress: {
        ...equipped,
        currentHammerDurability: durability,
        board: {
          ...equipped.board,
          cells: equipped.board.cells.map((candidate) => (
            candidate.id === cellId
              ? { ...candidate, status: "revealed" as const, hitsRemaining }
              : candidate
          )),
        },
      },
      outcome: "crack",
      cellId,
      collectedMineralId: null,
      firstDiscovery: false,
    };
  }

  const firstDiscovery = !equipped.discoveredIds.includes(cell.mineralId);
  const cells = equipped.board.cells.map((candidate) => (
    candidate.id === cellId
      ? { ...candidate, status: "cleared" as const, hitsRemaining: 0 }
      : candidate
  ));
  return {
    progress: {
      ...equipped,
      currentHammerDurability: durability,
      currentDepth: Math.max(equipped.currentDepth, cell.depth),
      board: advanceWindowIfBottomHasHole(catalog, { ...equipped.board, cells }, random),
      inventory: {
        ...equipped.inventory,
        [cell.mineralId]: (equipped.inventory[cell.mineralId] ?? 0) + 1,
      },
      discoveredIds: firstDiscovery
        ? [...equipped.discoveredIds, cell.mineralId]
        : equipped.discoveredIds,
    },
    outcome: "mineral",
    cellId,
    collectedMineralId: cell.mineralId,
    firstDiscovery,
  };
}

export function remainingResearchAttributes(
  progress: RockMineralProgress,
  mineralId: string,
) {
  const unlocked = new Set(progress.unlockedAttributes[mineralId] ?? []);
  return RESEARCH_ATTRIBUTE_KEYS.filter((key) => !unlocked.has(key));
}

export function prepareResearch(
  progress: RockMineralProgress,
  mineralId: string,
  eventId: string,
  random: RandomSource = Math.random,
) {
  if (progress.pendingResearch) return progress;
  if ((progress.inventory[mineralId] ?? 0) < 1) return progress;
  const remaining = remainingResearchAttributes(progress, mineralId);
  if (remaining.length === 0) return progress;
  const attributeKey = remaining[randomIndex(remaining.length, random)];
  return {
    ...progress,
    pendingResearch: { eventId, mineralId, attributeKey },
  };
}

export function completeResearch(progress: RockMineralProgress) {
  const pending = progress.pendingResearch;
  if (!pending) return progress;
  const currentInventory = progress.inventory[pending.mineralId] ?? 0;
  if (currentInventory < 1) return { ...progress, pendingResearch: null };
  const unlocked = progress.unlockedAttributes[pending.mineralId] ?? [];
  return {
    ...progress,
    inventory: {
      ...progress.inventory,
      [pending.mineralId]: currentInventory - 1,
    },
    unlockedAttributes: {
      ...progress.unlockedAttributes,
      [pending.mineralId]: unlocked.includes(pending.attributeKey)
        ? unlocked
        : [...unlocked, pending.attributeKey],
    },
    pendingResearch: null,
  };
}

export function cancelResearch(progress: RockMineralProgress) {
  return progress.pendingResearch ? { ...progress, pendingResearch: null } : progress;
}

export function researchCompletion(
  progress: RockMineralProgress,
  mineralId: string,
) {
  return (progress.unlockedAttributes[mineralId]?.length ?? 0) / RESEARCH_ATTRIBUTE_KEYS.length;
}

export function averageHardness(item: MineralCatalogItem) {
  return (item.mohsHardness.min + item.mohsHardness.max) / 2;
}

export function isResearchAttributeKey(value: unknown): value is ResearchAttributeKey {
  return typeof value === "string"
    && (RESEARCH_ATTRIBUTE_KEYS as readonly string[]).includes(value);
}

export function isSoilVariant(value: unknown): value is SoilVariant {
  return value === "clay" || value === "sand" || value === "gravel" || value === "deep";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deterministicCellRandom(depth: number, column: number): RandomSource {
  let state = (
    Math.imul(depth + 1, 2_654_435_761)
    ^ Math.imul(column + 1, 1_597_334_677)
  ) >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function makeMigratedHole(depth: number, column: number): DigCell {
  return {
    id: `cleared-depth-${depth}-column-${column}`,
    depth,
    column,
    soilVariant: "deep",
    mineralId: null,
    status: "cleared",
    hitsRemaining: 0,
    totalHits: 0,
  };
}

function normalizeBoardGeometry(
  catalog: RockMineralCatalog,
  baseDepth: number,
  cells: DigCell[],
): DigBoard {
  const coordinate = (column: number, depth: number) => `${column}:${depth}`;
  const cellsByCoordinate = new Map(
    cells.map((cell) => [coordinate(cell.column, cell.depth), cell]),
  );
  const maximumDepths = Array.from(
    { length: catalog.gameplay.columns },
    (_, column) => Math.max(
      baseDepth - 1,
      ...cells.filter((cell) => cell.column === column).map((cell) => cell.depth),
    ),
  );

  let bottomDepth = baseDepth + catalog.gameplay.rows - 1;
  while (true) {
    const unsafeColumns = Array.from(
      { length: catalog.gameplay.columns },
      (_, column) => column,
    ).filter((column) => {
      const existing = cellsByCoordinate.get(coordinate(column, bottomDepth));
      return existing?.status === "cleared"
        || (!existing && bottomDepth <= maximumDepths[column]!);
    });
    if (unsafeColumns.length === 0) break;
    bottomDepth = Math.max(
      bottomDepth + 1,
      ...unsafeColumns.map((column) => {
        const deepest = maximumDepths[column]!;
        const deepestCell = cellsByCoordinate.get(coordinate(column, deepest));
        return deepestCell?.status === "cleared" ? deepest + 1 : deepest;
      }),
    );
  }

  const normalizedBaseDepth = bottomDepth - catalog.gameplay.rows + 1;
  const normalizedCells: DigCell[] = [];
  for (let depth = normalizedBaseDepth; depth <= bottomDepth; depth += 1) {
    for (let column = 0; column < catalog.gameplay.columns; column += 1) {
      const existing = cellsByCoordinate.get(coordinate(column, depth));
      if (existing) {
        normalizedCells.push(existing);
      } else if (depth <= maximumDepths[column]!) {
        normalizedCells.push(makeMigratedHole(depth, column));
      } else {
        normalizedCells.push(
          makeCell(catalog, depth, column, deterministicCellRandom(depth, column)),
        );
      }
    }
  }
  return { baseDepth: normalizedBaseDepth, cells: normalizedCells };
}

export function parseRockMineralProgress(
  value: unknown,
  catalog: RockMineralCatalog,
): RockMineralProgress | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1) return undefined;
  if (!isRecord(value.board) || !Array.isArray(value.board.cells)) return undefined;
  const ids = new Set(catalog.items.map((item) => item.id));
  const cells: DigCell[] = [];
  for (const candidate of value.board.cells) {
    if (
      !isRecord(candidate)
      || typeof candidate.id !== "string"
      || !Number.isInteger(candidate.depth)
      || !Number.isInteger(candidate.column)
      || !isSoilVariant(candidate.soilVariant)
      || !["covered", "revealed", "cleared"].includes(String(candidate.status))
      || !Number.isInteger(candidate.hitsRemaining)
      || !Number.isInteger(candidate.totalHits)
      || !(candidate.mineralId === null || (
        typeof candidate.mineralId === "string" && ids.has(candidate.mineralId)
      ))
    ) return undefined;
    cells.push(candidate as DigCell);
  }
  if (cells.length !== catalog.gameplay.columns * catalog.gameplay.rows) return undefined;
  if (!isRecord(value.inventory) || !Array.isArray(value.discoveredIds)) return undefined;
  const discoveredIds = value.discoveredIds.filter(
    (id): id is string => typeof id === "string" && ids.has(id),
  );
  if (discoveredIds.length !== value.discoveredIds.length) return undefined;
  const inventory: Record<string, number> = {};
  for (const [id, count] of Object.entries(value.inventory)) {
    if (!ids.has(id) || !Number.isInteger(count) || Number(count) < 0) return undefined;
    inventory[id] = Number(count);
  }
  if (!isRecord(value.unlockedAttributes)) return undefined;
  const unlockedAttributes: Record<string, ResearchAttributeKey[]> = {};
  for (const [id, attributes] of Object.entries(value.unlockedAttributes)) {
    if (
      !ids.has(id)
      || !Array.isArray(attributes)
      || attributes.some((key) => !isResearchAttributeKey(key))
      || new Set(attributes).size !== attributes.length
    ) return undefined;
    unlockedAttributes[id] = attributes as ResearchAttributeKey[];
  }
  const pending = value.pendingResearch;
  if (
    pending !== null
    && (
      !isRecord(pending)
      || typeof pending.eventId !== "string"
      || typeof pending.mineralId !== "string"
      || !ids.has(pending.mineralId)
      || !isResearchAttributeKey(pending.attributeKey)
    )
  ) return undefined;
  const pendingHammerPurchase = value.pendingHammerPurchase;
  if (
    pendingHammerPurchase !== null
    && (
      !isRecord(pendingHammerPurchase)
      || typeof pendingHammerPurchase.eventId !== "string"
    )
  ) return undefined;
  if (
    !Number.isInteger(value.currentDepth)
    || !Number.isInteger(value.currentHammerDurability)
    || !Number.isInteger(value.spareHammers)
    || typeof value.soundEnabled !== "boolean"
    || !Number.isInteger(value.board.baseDepth)
  ) return undefined;
  const uniqueCoordinates = new Set(
    cells.map((cell) => `${cell.column}:${cell.depth}`),
  );
  if (
    uniqueCoordinates.size !== cells.length
    || cells.some((cell) => (
      cell.column < 0
      || cell.column >= catalog.gameplay.columns
      || cell.depth < 1
    ))
  ) return undefined;
  const normalizedBoard = normalizeBoardGeometry(
    catalog,
    Number(value.board.baseDepth),
    cells,
  );
  return {
    schemaVersion: 1,
    board: normalizedBoard,
    currentDepth: Number(value.currentDepth),
    currentHammerDurability: Number(value.currentHammerDurability),
    spareHammers: Number(value.spareHammers),
    inventory,
    discoveredIds,
    unlockedAttributes,
    pendingResearch: pending as RockMineralProgress["pendingResearch"],
    pendingHammerPurchase:
      pendingHammerPurchase as RockMineralProgress["pendingHammerPurchase"],
    soundEnabled: value.soundEnabled,
  };
}
