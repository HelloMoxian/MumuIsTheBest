export type ResourceKind = "particle" | "action" | "condition" | "environment" | "knowledge";
export type ResourceGroupKey = "particlePacks" | "actions" | "conditions" | "environments" | "knowledge";

export type WorldTowerProgress = {
  schemaVersion: 1;
  graphId: string;
  updatedAt: string;
  coinBalance: number;
  unlockedNodeIds: string[];
  permanentResourceIds: string[];
  resourceInventory: Record<string, number>;
};

export type WorldTowerLevel = {
  id: string;
  order: number;
  name: string;
  description: string;
  imagePath: string;
};

export type WorldTowerCluster = {
  id: string;
  order: number;
  name: string;
  parentClusterId: string | null;
  levelId: string | null;
};

export type ResourcePrice = {
  targetId: string;
  priceCoins: number;
  grantMode: "permanent-unlock" | "inventory-charge";
  grantQuantity: number | null;
};

export type WorldTowerResource = {
  id: string;
  kind: ResourceKind;
  name: string;
  description: string;
  inventoryMode: "charge" | "state" | "permanent-unlock";
  shop: {
    purchasable: boolean;
    coinCost: number | null;
  };
  imagePath: string | null;
  price: ResourcePrice | null;
};

export type WorldTowerManifest = {
  schemaVersion: 1;
  graphId: string;
  title: string;
  counts: {
    nodes: number;
    recipes: number;
    levels: number;
    clusters: number;
    resources: number;
    levelCounts: Record<string, number>;
    kindCounts: Record<string, number>;
  };
  semantics: Record<string, unknown>;
  loadingHints: Record<string, unknown>;
  backgroundAsset: string;
  levels: WorldTowerLevel[];
  clusters: WorldTowerCluster[];
  frames: Record<string, string>;
  placeholderTexture: string;
  currency: {
    id: "currency:discovery-coin";
    name: string;
    symbol: string;
    startingBalance: number;
    earningRulesStatus: "reserved-for-future";
  };
  resources: Record<ResourceGroupKey, WorldTowerResource[]>;
  progress: WorldTowerProgress;
};

export type WorldTowerNode = {
  id: string;
  name: string;
  kind: string;
  levelId: string;
  clusterId: string;
  summary: string;
  imagePath: string | null;
  unlockPriceCoins: number | null;
  isUnlocked: boolean;
  recipeCount: number;
  art?: {
    mode: string;
    imageAssetId: string | null;
    symbol: string;
    frameStyle: string;
  };
};

export type RecipeRequirement = {
  resourceId: string;
  amount: number;
};

export type WorldTowerRecipe = {
  id: string;
  type: string;
  logic: "ALL";
  inputs: Array<{
    nodeId: string;
    amount: number;
    unit: string;
    role: string;
    consumed: boolean;
  }>;
  requirements: Record<ResourceGroupKey, RecipeRequirement[]>;
  outputs: Array<{ nodeId: string; amount: number }>;
  childExplanation: string;
  safety: string;
};

export type WorldTowerNodeDetail = {
  node: WorldTowerNode & {
    aliases: string[];
    tags: string[];
    recipes: WorldTowerRecipe[];
    properties?: Record<string, unknown>;
  };
  inputs: WorldTowerNode[];
  dependents: WorldTowerNode[];
};

export type NodePage = {
  levelId: string;
  clusterId: string | null;
  offset: number;
  limit: number;
  total: number;
  items: WorldTowerNode[];
};

export type WorldTowerMapEdge = {
  sourceId: string;
  targetId: string;
  recipeId: string;
};

export type WorldTowerMap = {
  schemaVersion: 1;
  graphId: string;
  totalNodes: number;
  isTruncated: boolean;
  levelNodeCounts: Record<string, number>;
  items: WorldTowerNode[];
  edges: WorldTowerMapEdge[];
};

export type WorldTowerLoadStrategy = "all" | "locked" | "unlocked";

export type WorldTowerLevelGroup = {
  id: string;
  name: string;
  clusterId: string;
  nodeIds: string[];
};

export type WorldTowerLevelMap = {
  schemaVersion: 1;
  graphId: string;
  levelId: string;
  visibility: WorldTowerLoadStrategy;
  totalInLevel: number;
  matchedTotal: number;
  groups: WorldTowerLevelGroup[];
  items: WorldTowerNode[];
  edges: WorldTowerMapEdge[];
};
