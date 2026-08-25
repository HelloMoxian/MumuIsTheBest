export const RESEARCH_ATTRIBUTE_KEYS = [
  "name",
  "classification",
  "crystalStructure",
  "formation",
  "rarity",
  "mohsHardness",
  "introduction",
  "chemicalComposition",
  "uses",
  "products",
  "value",
  "safety",
] as const;

export type ResearchAttributeKey = typeof RESEARCH_ATTRIBUTE_KEYS[number];
export type SampleKind = "mineral" | "variety" | "rock" | "ore-aggregate";
export type SoilVariant = "clay" | "sand" | "gravel" | "deep";

export type MineralCatalogItem = {
  id: string;
  name: string;
  aliases: string[];
  kind: SampleKind;
  group: string;
  chemicalComposition: { formula: string; summary: string };
  crystalStructure: { system: string; detail: string };
  formation: string;
  rarity: number;
  mohsHardness: { min: number; max: number; description: string };
  introduction: string;
  uses: string[];
  products: string[];
  value: { score: number; label: string; description: string };
  safety: string;
  image: { path: string; atlasId: string; cellIndex: number };
};

export type RockMineralCatalog = {
  schemaVersion: 1;
  catalogId: string;
  title: string;
  itemCount: number;
  semantics: {
    itemLabel: string;
    rarityNote: string;
    valueNote: string;
    hardnessNote: string;
    imageNote: string;
  };
  gameplay: {
    columns: number;
    rows: number;
    mineralProbability: number;
    hammer: {
      energyCoinCost: number;
      durability: number;
      starterHammers: number;
      energyCoinAdapter: string;
    };
    research: {
      knowledgeCoinCost: number;
      inventoryCost: number;
      attributeKeys: ResearchAttributeKey[];
    };
    hitsByRarity: Array<{ minRarity: number; maxRarity: number; hits: number }>;
    rarityWeights: Record<string, number>;
    soilVariants: SoilVariant[];
  };
  items: MineralCatalogItem[];
};

export type DigCell = {
  id: string;
  depth: number;
  column: number;
  soilVariant: SoilVariant;
  mineralId: string | null;
  status: "covered" | "revealed" | "cleared";
  hitsRemaining: number;
  totalHits: number;
};

export type DigBoard = {
  baseDepth: number;
  cells: DigCell[];
};

export type PendingResearch = {
  eventId: string;
  mineralId: string;
  attributeKey: ResearchAttributeKey;
};

export type RockMineralProgress = {
  schemaVersion: 1;
  board: DigBoard;
  currentDepth: number;
  currentHammerDurability: number;
  spareHammers: number;
  inventory: Record<string, number>;
  discoveredIds: string[];
  unlockedAttributes: Record<string, ResearchAttributeKey[]>;
  pendingResearch: PendingResearch | null;
  pendingHammerPurchase: { eventId: string } | null;
  soundEnabled: boolean;
};

export type StrikeOutcome =
  | "blocked"
  | "soil"
  | "crack"
  | "mineral"
  | "no-hammer";

export type StrikeResult = {
  progress: RockMineralProgress;
  outcome: StrikeOutcome;
  cellId: string;
  collectedMineralId: string | null;
  firstDiscovery: boolean;
};

export type CatalogSortKey =
  | "discovery"
  | "name"
  | "kind"
  | "rarity"
  | "hardness"
  | "value"
  | "inventory"
  | "research";
