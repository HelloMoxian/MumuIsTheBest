import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { CURRENCY_MANAGEMENT_PASSWORD } from "./currency-management.js";

const requirementSchema = z.object({
  resourceId: z.string().min(1).max(160),
  amount: z.number().int().min(0).max(10_000),
});

const graphInputSchema = z.object({
  nodeId: z.string().min(1).max(160),
  amount: z.number().int().min(0).max(10_000),
  unit: z.string().min(1).max(80),
  role: z.string().min(1).max(80),
  consumed: z.boolean(),
});

const recipeSchema = z.object({
  id: z.string().min(1).max(240),
  type: z.string().min(1).max(120),
  relationLabel: z.string().min(1).max(40),
  knowledgeTopic: z.string().min(1).max(300),
  logic: z.literal("ALL"),
  inputs: z.array(graphInputSchema).max(40),
  requirements: z.object({
    particlePacks: z.array(requirementSchema).max(20),
    actions: z.array(requirementSchema).max(20),
    conditions: z.array(requirementSchema).max(20),
    environments: z.array(requirementSchema).max(20),
    knowledge: z.array(requirementSchema).max(30),
  }),
  outputs: z.array(z.object({
    nodeId: z.string().min(1).max(160),
    amount: z.number().int().min(1).max(10_000),
  })).min(1).max(4),
  childExplanation: z.string().min(1).max(1_000),
  safety: z.string().min(1).max(160),
});

const artSchema = z.object({
  mode: z.string().min(1).max(80),
  imageAssetId: z.string().nullable(),
  symbol: z.string().min(1).max(80),
  frameStyle: z.string().min(1).max(80),
});

const graphNodeSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(120),
  aliases: z.array(z.string().max(160)).max(20),
  tags: z.array(z.string().max(120)).max(30),
  art: artSchema,
  kind: z.string().min(1).max(120),
  levelId: z.string().min(1).max(120),
  clusterId: z.string().min(1).max(160),
  summary: z.string().min(1).max(1_000),
  recipes: z.array(recipeSchema).max(8),
  sublevel: z.number().int().min(1).max(20).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  sourceRefs: z.array(z.record(z.string(), z.unknown())).optional(),
});

const levelSchema = z.object({
  id: z.string().min(1).max(120),
  order: z.number().int().min(1).max(100),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
});

const clusterSchema = z.object({
  id: z.string().min(1).max(160),
  order: z.number().int().min(1).max(500),
  name: z.string().min(1).max(160),
  parentClusterId: z.string().nullable(),
});

const resourceSchema = z.object({
  id: z.string().min(1).max(160),
  kind: z.enum(["particle", "action", "condition", "environment", "knowledge"]),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(600),
  inventoryMode: z.enum(["charge", "state", "permanent-unlock"]),
  shop: z.object({
    purchasable: z.boolean(),
    coinCost: z.number().int().min(0).nullable(),
  }),
});

const graphSchema = z.object({
  schemaVersion: z.literal(1),
  graphId: z.string().min(1).max(160),
  title: z.string().min(1).max(200),
  language: z.literal("zh-CN"),
  counts: z.object({
    nodes: z.number().int().min(1).max(2_000),
    recipes: z.number().int().min(1),
    levels: z.number().int().min(1),
    clusters: z.number().int().min(1),
    resources: z.number().int().min(0),
    levelCounts: z.record(z.string(), z.number().int().min(0)),
    kindCounts: z.record(z.string(), z.number().int().min(0)),
  }),
  semantics: z.record(z.string(), z.unknown()),
  loadingHints: z.record(z.string(), z.unknown()),
  levels: z.array(levelSchema).min(1),
  clusters: z.array(clusterSchema).min(1),
  resources: z.object({
    particlePacks: z.array(resourceSchema),
    actions: z.array(resourceSchema),
    conditions: z.array(resourceSchema),
    environments: z.array(resourceSchema),
    knowledge: z.array(resourceSchema),
  }),
  nodes: z.array(graphNodeSchema).min(1).max(2_000),
  indexes: z.object({
    nodeIdsByLevel: z.record(z.string(), z.array(z.string())),
    nodeIdsByCluster: z.record(z.string(), z.array(z.string())),
    dependentsByNodeId: z.record(z.string(), z.array(z.string())),
  }),
});

const priceSchema = z.object({
  schemaVersion: z.literal(1),
  catalogId: z.string().min(1).max(160),
  graphId: z.string().min(1).max(160),
  currency: z.object({
    id: z.literal("currency:discovery-coin"),
    name: z.string().min(1).max(40),
    symbol: z.string().min(1).max(8),
    startingBalance: z.number().int().min(0).max(1_000_000),
    earningRulesStatus: z.literal("active"),
  }),
  nodePrices: z.array(z.object({
    targetId: z.string().min(1).max(160),
    priceCoins: z.number().int().min(0).max(1_000_000),
    grantMode: z.literal("permanent-unlock"),
  })).min(1).max(2_000),
  resourcePrices: z.array(z.object({
    targetId: z.string().min(1).max(160),
    priceCoins: z.number().int().min(0).max(1_000_000),
    grantMode: z.enum(["permanent-unlock", "inventory-charge"]),
    grantQuantity: z.number().int().min(1).nullable(),
  })),
});

const iconManifestSchema = z.object({
  schemaVersion: z.literal(1),
  assetPackId: z.string().min(1).max(160),
  backgroundAsset: z.string().min(1),
  frameAssets: z.record(z.string(), z.string()),
  levelFallbacks: z.record(z.string(), z.string()),
  clusterFallbacks: z.record(z.string(), z.string()).default({}),
  nodeAssets: z.record(z.string(), z.object({
    path: z.string().min(1),
    atlas: z.object({
      columns: z.number().int().min(1).max(24),
      rows: z.number().int().min(1).max(24),
      index: z.number().int().min(0).max(600),
    }).nullable(),
  })),
  resourceAssets: z.record(z.string(), z.string()),
  placeholderTexture: z.string(),
});

const transactionSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum([
    "node-unlock",
    "resource-unlock",
    "resource-charge",
    "admin-unlock-all",
    "admin-clear-all",
    "admin-coin-reset",
    "admin-coin-set",
    "coin-grant",
    "learning-reward",
    "knowledge-spend",
  ]),
  targetId: z.string().min(1).max(160),
  quantity: z.number().int().min(0).max(1_000_000_000),
  coinDelta: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  balanceAfter: z.number().int().min(0).max(1_000_000_000),
  createdAt: z.string().datetime(),
});

const learningRewardSourceSchema = z.enum([
  "math:add-subtract",
  "math:arithmetic-battle",
  "math:multiplication",
  "math:find-number",
  "math:cat-mouse-game",
  "english:echo-island",
]);

const rewardSessionSchema = z.object({
  id: z.string().uuid(),
  source: learningRewardSourceSchema,
  multiplier: z.union([z.literal(1), z.literal(3)]),
  promotionId: z.string().min(1).max(200).nullable(),
  createdAt: z.string().datetime(),
});

const progressSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  graphId: z.string().min(1).max(160),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  coinBalance: z.number().int().min(0).max(1_000_000_000),
  unlockedNodeIds: z.array(z.string().min(1).max(160)).max(2_000),
  permanentResourceIds: z.array(z.string().min(1).max(160)).max(500),
  resourceInventory: z.record(z.string(), z.number().int().min(0).max(100_000)),
  appliedGrantIds: z.array(z.string().min(1).max(160)).max(100).default([]),
  rewardSessions: z.array(rewardSessionSchema).max(20_000).default([]),
  transactions: z.array(transactionSchema).max(20_000),
}).superRefine((progress, context) => {
  if (new Set(progress.unlockedNodeIds).size !== progress.unlockedNodeIds.length) {
    context.addIssue({ code: "custom", message: "点亮节点不能重复。" });
  }
  if (new Set(progress.permanentResourceIds).size !== progress.permanentResourceIds.length) {
    context.addIssue({ code: "custom", message: "永久资源不能重复。" });
  }
});

const nodeListQuerySchema = z.object({
  levelId: z.string().min(1).max(120),
  clusterId: z.string().min(1).max(160).optional(),
  offset: z.coerce.number().int().min(0).max(2_000).default(0),
  limit: z.coerce.number().int().min(1).max(60).default(36),
});

const levelMapQuerySchema = z.object({
  levelId: z.string().min(1).max(120),
  visibility: z.enum(["all", "locked", "unlocked"]).default("all"),
});

const targetInputSchema = z.object({
  targetId: z.string().min(1).max(160),
});

const progressActionSchema = z.object({
  action: z.enum(["unlock-all", "clear-all"]),
});

const learningRewardSchema = z.object({
  eventId: z.string().uuid(),
  source: learningRewardSourceSchema,
  sessionId: z.string().uuid().optional(),
  rewardKey: z
    .enum([
      "easy",
      "medium",
      "hard",
      "facts",
      "reverse",
      "advanced",
      "100",
      "1000",
      "10000",
      "100000",
    ])
    .optional(),
});

const rewardSessionInputSchema = z.object({
  source: learningRewardSourceSchema,
  promotionId: z.string().min(1).max(200).optional(),
});

const coinResetSchema = z.object({
  password: z.string().min(1).max(64),
});

const coinSetSchema = coinResetSchema.extend({
  balance: z.number().int().min(0).max(1_000_000_000),
});

const knowledgeCoinSpendSchema = z.object({
  eventId: z.string().uuid(),
  purpose: z.literal("nature:rock-mineral-research"),
  amount: z.literal(1),
});

type WorldGraph = z.infer<typeof graphSchema>;
type UnlockCatalog = z.infer<typeof priceSchema>;
type IconManifest = z.infer<typeof iconManifestSchema>;
type Progress = z.infer<typeof progressSchema>;
type GraphNode = z.infer<typeof graphNodeSchema>;
type LearningRewardSource = z.infer<typeof learningRewardSourceSchema>;

const LEARNING_COIN_RESET_GRANT_ID = "learning-coins-reset-to-zero-v1";
const LEARNING_REWARDS = {
  "math:add-subtract": 2,
  "math:cat-mouse-game": 20,
  "english:echo-island": 1,
} as const;
const ARITHMETIC_BATTLE_REWARDS = {
  easy: 4,
  medium: 6,
  hard: 8,
} as const;
const MULTIPLICATION_REWARDS = {
  facts: 2,
  reverse: 3,
  advanced: 5,
} as const;
const FIND_NUMBER_REWARDS = {
  "100": 10,
  "1000": 30,
  "10000": 60,
  "100000": 150,
} as const;
const PROMOTION_INTERVAL_MS = 10 * 60 * 1_000;
const PROMOTION_SOURCES = [
  "math:add-subtract",
  "math:arithmetic-battle",
  "math:multiplication",
  "math:find-number",
  "math:cat-mouse-game",
] as const satisfies readonly LearningRewardSource[];

export function echoIslandRewardMultiplier(random: () => number = Math.random): 1 | 5 {
  return random() < 0.15 ? 5 : 1;
}

function promotionAt(time = Date.now()) {
  const startsAtMs = Math.floor(time / PROMOTION_INTERVAL_MS) * PROMOTION_INTERVAL_MS;
  const digest = createHash("sha256")
    .update(`mumu-learning-promotion-v1:${startsAtMs}`)
    .digest();
  const source = PROMOTION_SOURCES[digest.readUInt32BE(0) % PROMOTION_SOURCES.length];
  return {
    id: `learning-promotion:${startsAtMs}:${source}`,
    source,
    multiplier: 3 as const,
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(startsAtMs + PROMOTION_INTERVAL_MS).toISOString(),
  };
}

function rewardFor(
  source: LearningRewardSource,
  rewardKey?: z.infer<typeof learningRewardSchema>["rewardKey"],
) {
  if (source === "math:arithmetic-battle") {
    if (!rewardKey || !(rewardKey in ARITHMETIC_BATTLE_REWARDS)) {
      throw new WorldTowerError(
        "MISSING_REWARD_DIFFICULTY",
        400,
        "算术大战需要提供有效的难度档位。",
      );
    }
    return ARITHMETIC_BATTLE_REWARDS[
      rewardKey as keyof typeof ARITHMETIC_BATTLE_REWARDS
    ];
  }
  if (source === "math:multiplication") {
    if (!rewardKey || !(rewardKey in MULTIPLICATION_REWARDS)) {
      throw new WorldTowerError(
        "MISSING_REWARD_DIFFICULTY",
        400,
        "乘法小能手需要提供有效的练习档位。",
      );
    }
    return MULTIPLICATION_REWARDS[rewardKey as keyof typeof MULTIPLICATION_REWARDS];
  }
  if (source === "math:find-number") {
    if (!rewardKey || !(rewardKey in FIND_NUMBER_REWARDS)) {
      throw new WorldTowerError("MISSING_FIND_NUMBER_RANGE", 400, "找数字奖励需要确认本局的数字范围。");
    }
    return FIND_NUMBER_REWARDS[rewardKey as keyof typeof FIND_NUMBER_REWARDS];
  }
  return LEARNING_REWARDS[source as keyof typeof LEARNING_REWARDS];
}

class WorldTowerError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function artworkForNode(node: GraphNode, iconManifest: IconManifest) {
  const dedicatedAsset = iconManifest.nodeAssets[node.id];
  if (dedicatedAsset) return dedicatedAsset;
  const clusterPath = iconManifest.clusterFallbacks[node.clusterId];
  return clusterPath ? { path: clusterPath, atlas: null } : null;
}

function nodeSummary(
  node: GraphNode,
  prices: ReadonlyMap<string, number>,
  unlocked: ReadonlySet<string>,
  iconManifest: IconManifest,
) {
  const artwork = artworkForNode(node, iconManifest);
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    levelId: node.levelId,
    clusterId: node.clusterId,
    summary: node.summary,
    art: node.art,
    imagePath: artwork?.path ?? null,
    imageCrop: artwork?.atlas ?? null,
    unlockPriceCoins: prices.get(node.id) ?? null,
    isUnlocked: unlocked.has(node.id),
    recipeCount: node.recipes.length,
  };
}

function buildGraphOverview(
  graph: WorldGraph,
  iconManifest: IconManifest,
  maximumNodes = 160,
) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const selectedIds = new Set<string>();
  const countsByLevel = new Map<string, number>();
  const rootIds = new Set(graph.semantics.rootNodeIds as string[]);
  const preferredAncestors: string[] = [];
  const maximumPerLevel = 10;
  const minimumPerLevel = 6;

  function addNode(nodeId: string, ignoreLevelLimit = false) {
    const node = nodeById.get(nodeId);
    if (!node || selectedIds.has(nodeId) || selectedIds.size >= maximumNodes) return false;
    const levelCount = countsByLevel.get(node.levelId) ?? 0;
    if (!ignoreLevelLimit && levelCount >= maximumPerLevel) return false;
    selectedIds.add(nodeId);
    countsByLevel.set(node.levelId, levelCount + 1);
    return true;
  }

  for (const rootId of rootIds) addNode(rootId, true);
  for (const nodeId of Object.keys(iconManifest.nodeAssets)) {
    const node = nodeById.get(nodeId);
    if (!node || (countsByLevel.get(node.levelId) ?? 0) >= 2) continue;
    addNode(nodeId);
    preferredAncestors.push(nodeId);
  }

  for (let index = 0; index < preferredAncestors.length && selectedIds.size < maximumNodes; index += 1) {
    const node = nodeById.get(preferredAncestors[index]);
    for (const input of node?.recipes[0]?.inputs ?? []) {
      if (addNode(input.nodeId, rootIds.has(input.nodeId))) {
        preferredAncestors.push(input.nodeId);
      }
    }
  }

  for (const level of graph.levels) {
    const levelNodeIds = graph.indexes.nodeIdsByLevel[level.id] ?? [];
    const sampleSize = Math.min(levelNodeIds.length, minimumPerLevel * 2);
    const sampleIds = Array.from({ length: sampleSize }, (_, index) => (
      levelNodeIds[Math.floor(index * levelNodeIds.length / sampleSize)]
    ));
    const candidates = [...new Set([...sampleIds, ...levelNodeIds])];
    for (const nodeId of candidates) {
      if ((countsByLevel.get(level.id) ?? 0) >= minimumPerLevel || selectedIds.size >= maximumNodes) break;
      addNode(nodeId, true);
    }
  }

  const edgeKeys = new Set<string>();
  const edges: Array<{ sourceId: string; targetId: string; recipeId: string }> = [];
  for (const targetId of selectedIds) {
    const node = nodeById.get(targetId);
    for (const recipe of node?.recipes ?? []) {
      for (const input of recipe.inputs) {
        if (!selectedIds.has(input.nodeId)) continue;
        const edgeKey = `${input.nodeId}\u0000${targetId}`;
        if (edgeKeys.has(edgeKey)) continue;
        edgeKeys.add(edgeKey);
        edges.push({ sourceId: input.nodeId, targetId, recipeId: recipe.id });
      }
    }
  }

  return {
    nodeIds: [...selectedIds],
    edges,
    levelNodeCounts: Object.fromEntries(graph.levels.map((level) => [
      level.id,
      countsByLevel.get(level.id) ?? 0,
    ])),
  };
}

function graphEdgesForIds(
  nodeIds: ReadonlySet<string>,
  nodeById: ReadonlyMap<string, GraphNode>,
) {
  const edgeKeys = new Set<string>();
  const edges: Array<{ sourceId: string; targetId: string; recipeId: string }> = [];
  for (const targetId of nodeIds) {
    const node = nodeById.get(targetId);
    for (const recipe of node?.recipes ?? []) {
      for (const input of recipe.inputs) {
        if (!nodeIds.has(input.nodeId)) continue;
        const edgeKey = `${input.nodeId}\u0000${targetId}`;
        if (edgeKeys.has(edgeKey)) continue;
        edgeKeys.add(edgeKey);
        edges.push({ sourceId: input.nodeId, targetId, recipeId: recipe.id });
      }
    }
  }
  return edges;
}

function buildLevelGroups(
  graph: WorldGraph,
  nodeIds: string[],
) {
  const selectedIds = new Set(nodeIds);
  const clusterNameById = new Map(graph.clusters.map((cluster) => [cluster.id, cluster.name]));
  const groups: Array<{ id: string; name: string; clusterId: string; nodeIds: string[] }> = [];
  const clusterIds = [...new Set(nodeIds.map((nodeId) => (
    graph.nodes.find((node) => node.id === nodeId)?.clusterId
  )).filter((clusterId): clusterId is string => Boolean(clusterId)))];

  for (const clusterId of clusterIds) {
    const clusterNodeIds = (graph.indexes.nodeIdsByCluster[clusterId] ?? [])
      .filter((nodeId) => selectedIds.has(nodeId));
    const chunkCount = Math.ceil(clusterNodeIds.length / 30);
    for (let index = 0; index < chunkCount; index += 1) {
      const chunkNodeIds = clusterNodeIds.slice(index * 30, (index + 1) * 30);
      if (chunkNodeIds.length === 0) continue;
      groups.push({
        id: clusterId + ":section:" + String(index + 1),
        name: (clusterNameById.get(clusterId) ?? "其他发现")
          + (chunkCount > 1 ? " · 第" + String(index + 1) + "组" : ""),
        clusterId,
        nodeIds: chunkNodeIds,
      });
    }
  }
  return groups;
}

function sendKnownError(error: unknown, reply: FastifyReply) {
  if (error instanceof WorldTowerError) {
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  }
  return reply.code(500).send({
    code: "WORLD_TOWER_STORAGE_FAILED",
    message: "万物图谱进度暂时无法读取或保存，请让家长检查本机数据目录。",
  });
}

export function registerWorldTowerApi(
  app: FastifyInstance,
  appDataDir: string,
  projectRoot: string,
) {
  const graphPath = resolve(projectRoot, "content", "world-tower", "world-graph.v1.json");
  const catalogPath = resolve(projectRoot, "content", "world-tower", "unlock-catalog.v1.json");
  const iconManifestPath = resolve(projectRoot, "content", "world-tower", "icon-manifest.v1.json");
  const progressPath = resolve(appDataDir, "learning", "world-tower", "progress.json");
  let contentPromise: Promise<{
    graph: WorldGraph;
    catalog: UnlockCatalog;
    icons: IconManifest;
    nodeById: Map<string, GraphNode>;
    nodePriceById: Map<string, number>;
    resourcePriceById: Map<string, UnlockCatalog["resourcePrices"][number]>;
    resourceById: Map<string, z.infer<typeof resourceSchema>>;
  }> | undefined;

  async function loadContent() {
    contentPromise ??= Promise.all([
      readFile(graphPath, "utf8"),
      readFile(catalogPath, "utf8"),
      readFile(iconManifestPath, "utf8"),
    ]).then(([graphText, catalogText, iconText]) => {
      const graph = graphSchema.parse(JSON.parse(graphText));
      const catalog = priceSchema.parse(JSON.parse(catalogText));
      const icons = iconManifestSchema.parse(JSON.parse(iconText));
      if (catalog.graphId !== graph.graphId) throw new Error("WORLD_TOWER_CATALOG_MISMATCH");
      const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
      const nodePriceById = new Map(catalog.nodePrices.map((price) => [price.targetId, price.priceCoins]));
      const resourcePriceById = new Map(catalog.resourcePrices.map((price) => [price.targetId, price]));
      const resourceById = new Map(
        Object.values(graph.resources).flat().map((resource) => [resource.id, resource]),
      );
      if (
        nodeById.size !== graph.counts.nodes
        || nodePriceById.size !== graph.counts.nodes
        || resourceById.size !== catalog.resourcePrices.length
      ) {
        throw new Error("WORLD_TOWER_CONTENT_INCOMPLETE");
      }
      return { graph, catalog, icons, nodeById, nodePriceById, resourcePriceById, resourceById };
    });
    return contentPromise;
  }

  function emptyProgress(graph: WorldGraph, catalog: UnlockCatalog, now = new Date().toISOString()): Progress {
    return {
      schemaVersion: 1,
      id: randomUUID(),
      graphId: graph.graphId,
      createdAt: now,
      updatedAt: now,
      coinBalance: catalog.currency.startingBalance,
      unlockedNodeIds: [],
      permanentResourceIds: [],
      resourceInventory: {},
      appliedGrantIds: [LEARNING_COIN_RESET_GRANT_ID],
      rewardSessions: [],
      transactions: [],
    };
  }

  async function readProgress(): Promise<Progress> {
    const { graph, catalog, nodeById, resourceById } = await loadContent();
    try {
      const progress = progressSchema.parse(JSON.parse(await readFile(progressPath, "utf8")));
      if (progress.graphId !== graph.graphId) {
        const hasCoinReset = progress.appliedGrantIds.includes(LEARNING_COIN_RESET_GRANT_ID);
        return {
          ...progress,
          graphId: graph.graphId,
          updatedAt: new Date().toISOString(),
          coinBalance: hasCoinReset ? progress.coinBalance : 0,
          unlockedNodeIds: [],
          permanentResourceIds: [],
          resourceInventory: {},
          appliedGrantIds: hasCoinReset
            ? progress.appliedGrantIds
            : [...progress.appliedGrantIds, LEARNING_COIN_RESET_GRANT_ID],
        };
      }
      if (
        progress.unlockedNodeIds.some((id) => !nodeById.has(id))
        || progress.permanentResourceIds.some((id) => !resourceById.has(id))
        || Object.keys(progress.resourceInventory).some((id) => !resourceById.has(id))
      ) {
        throw new Error("WORLD_TOWER_PROGRESS_REFERENCE_MISMATCH");
      }
      if (progress.appliedGrantIds.includes(LEARNING_COIN_RESET_GRANT_ID)) {
        return progress;
      }
      return {
        ...progress,
        updatedAt: new Date().toISOString(),
        coinBalance: 0,
        appliedGrantIds: [...progress.appliedGrantIds, LEARNING_COIN_RESET_GRANT_ID],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyProgress(graph, catalog);
      }
      throw error;
    }
  }

  async function saveProgress(progress: Progress) {
    await mkdir(dirname(progressPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${progressPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(progress, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, progressPath);
    await chmod(progressPath, 0o600);
  }

  let writeQueue: Promise<void> = Promise.resolve();

  function updateProgress(
    mutate: (progress: Progress) => Promise<Progress> | Progress,
  ) {
    const operation = writeQueue.then(async () => {
      const progress = await readProgress();
      const next = progressSchema.parse(await mutate(progress));
      await saveProgress(next);
      return next;
    });
    writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  function publicProgress(progress: Progress) {
    return {
      schemaVersion: progress.schemaVersion,
      graphId: progress.graphId,
      updatedAt: progress.updatedAt,
      coinBalance: progress.coinBalance,
      unlockedNodeIds: progress.unlockedNodeIds,
      permanentResourceIds: progress.permanentResourceIds,
      resourceInventory: progress.resourceInventory,
    };
  }

  app.get("/api/world-tower/manifest", async (_request, reply) => {
    try {
      const [{ graph, catalog, icons, nodeById, resourcePriceById }, progress] = await Promise.all([
        loadContent(),
        readProgress(),
      ]);
      return {
        schemaVersion: 1,
        graphId: graph.graphId,
        title: graph.title,
        counts: graph.counts,
        semantics: graph.semantics,
        loadingHints: graph.loadingHints,
        backgroundAsset: icons.backgroundAsset,
        levels: graph.levels.map((level) => ({
          ...level,
          imagePath: icons.levelFallbacks[level.id] ?? icons.placeholderTexture,
        })),
        clusters: graph.clusters.map((cluster) => {
          const firstNodeId = graph.indexes.nodeIdsByCluster[cluster.id]?.[0];
          return {
            ...cluster,
            levelId: firstNodeId ? nodeById.get(firstNodeId)?.levelId ?? null : null,
          };
        }),
        frames: icons.frameAssets,
        placeholderTexture: icons.placeholderTexture,
        currency: catalog.currency,
        resources: Object.fromEntries(
          Object.entries(graph.resources).map(([key, values]) => [
            key,
            values.map((resource) => ({
              ...resource,
              imagePath: icons.resourceAssets[resource.id] ?? null,
              price: resourcePriceById.get(resource.id) ?? null,
            })),
          ]),
        ),
        progress: publicProgress(progress),
      };
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.get("/api/world-tower/coins", async (_request, reply) => {
    try {
      const progress = await readProgress();
      return {
        schemaVersion: 1,
        coinBalance: progress.coinBalance,
        updatedAt: progress.updatedAt,
        promotion: promotionAt(),
      };
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.post("/api/world-tower/coins/spend", async (request, reply) => {
    const parsed = knowledgeCoinSpendSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_KNOWLEDGE_COIN_SPEND",
        message: "这次研究费用不符合玩法规则，因此没有扣除知识币。",
      });
    }
    try {
      let alreadySpent = false;
      const progress = await updateProgress((current) => {
        const existing = current.transactions.find(
          (transaction) => transaction.id === parsed.data.eventId,
        );
        if (existing) {
          if (
            existing.kind !== "knowledge-spend"
            || existing.targetId !== parsed.data.purpose
            || existing.coinDelta !== -parsed.data.amount
          ) {
            throw new WorldTowerError(
              "KNOWLEDGE_COIN_EVENT_REUSED",
              409,
              "这次研究编号已经用于其他操作，请重新发起研究。",
            );
          }
          alreadySpent = true;
          return current;
        }
        if (current.coinBalance < parsed.data.amount) {
          throw new WorldTowerError(
            "WORLD_TOWER_INSUFFICIENT_COINS",
            409,
            "知识币还不够，完成学习任务获得至少 1 个知识币后再研究。",
          );
        }
        const now = new Date().toISOString();
        const balanceAfter = current.coinBalance - parsed.data.amount;
        return {
          ...current,
          updatedAt: now,
          coinBalance: balanceAfter,
          transactions: [...current.transactions, {
            id: parsed.data.eventId,
            kind: "knowledge-spend" as const,
            targetId: parsed.data.purpose,
            quantity: 1,
            coinDelta: -parsed.data.amount,
            balanceAfter,
            createdAt: now,
          }].slice(-20_000),
        };
      });
      return reply.code(alreadySpent ? 200 : 201).send({
        alreadySpent,
        eventId: parsed.data.eventId,
        purpose: parsed.data.purpose,
        coinDelta: alreadySpent ? 0 : -parsed.data.amount,
        progress: publicProgress(progress),
      });
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.post("/api/world-tower/reward-sessions", async (request, reply) => {
    const parsed = rewardSessionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_REWARD_SESSION",
        message: "这次玩法奖励场次无法建立，请返回首页后再进入。",
      });
    }
    try {
      const nowMs = Date.now();
      const currentPromotion = promotionAt(nowMs);
      const previousPromotion = promotionAt(nowMs - PROMOTION_INTERVAL_MS);
      const matchingPromotion = parsed.data.promotionId
        ? [currentPromotion, previousPromotion].find((promotion) => (
            promotion.id === parsed.data.promotionId
            && promotion.source === parsed.data.source
          ))
        : currentPromotion.source === parsed.data.source ? currentPromotion : undefined;
      const session = rewardSessionSchema.parse({
        id: randomUUID(),
        source: parsed.data.source,
        multiplier: matchingPromotion ? 3 : 1,
        promotionId: matchingPromotion?.id ?? null,
        createdAt: new Date(nowMs).toISOString(),
      });
      await updateProgress((current) => ({
        ...current,
        updatedAt: session.createdAt,
        rewardSessions: [...current.rewardSessions, session].slice(-20_000),
      }));
      return reply.code(201).send(session);
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.post("/api/world-tower/coins/earn", async (request, reply) => {
    const parsed = learningRewardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_LEARNING_REWARD",
        message: "这次学习奖励无法确认，请重新完成一道题。",
      });
    }
    try {
      let alreadyAwarded = false;
      let baseRewardCoins = 0;
      let multiplier: 1 | 3 | 5 = 1;
      let criticalHit = false;
      const progress = await updateProgress((current) => {
        if (current.transactions.some((transaction) => transaction.id === parsed.data.eventId)) {
          alreadyAwarded = true;
          return current;
        }
        const session = parsed.data.sessionId
          ? current.rewardSessions.find((candidate) => candidate.id === parsed.data.sessionId)
          : undefined;
        if (parsed.data.sessionId && (!session || session.source !== parsed.data.source)) {
          throw new WorldTowerError(
            "INVALID_REWARD_SESSION",
            409,
            "这次奖励场次已经无法确认，请返回首页重新进入玩法。",
          );
        }
        if (parsed.data.source === "english:echo-island") {
          multiplier = echoIslandRewardMultiplier();
          criticalHit = multiplier === 5;
        } else {
          multiplier = session?.multiplier ?? 1;
        }
        baseRewardCoins = rewardFor(parsed.data.source, parsed.data.rewardKey);
        const rewardCoins = baseRewardCoins * multiplier;
        const now = new Date().toISOString();
        const balanceAfter = current.coinBalance + rewardCoins;
        if (balanceAfter > 1_000_000_000) {
          throw new WorldTowerError("COIN_BALANCE_LIMIT", 409, "知识币已经达到最高余额，先去物质塔使用一些吧。");
        }
        return {
          ...current,
          updatedAt: now,
          coinBalance: balanceAfter,
          transactions: [...current.transactions, {
            id: parsed.data.eventId,
            kind: "learning-reward" as const,
            targetId: parsed.data.rewardKey
              ? `${parsed.data.source}:${parsed.data.rewardKey}`
              : parsed.data.source,
            quantity: rewardCoins,
            coinDelta: rewardCoins,
            balanceAfter,
            createdAt: now,
          }].slice(-20_000),
        };
      });
      return reply.code(alreadyAwarded ? 200 : 201).send({
        alreadyAwarded,
        baseRewardCoins: alreadyAwarded ? 0 : baseRewardCoins,
        multiplier,
        criticalHit: alreadyAwarded ? false : criticalHit,
        rewardCoins: alreadyAwarded ? 0 : baseRewardCoins * multiplier,
        source: parsed.data.source,
        progress: publicProgress(progress),
      });
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.post("/api/world-tower/coins/reset", async (request, reply) => {
    const parsed = coinResetSchema.safeParse(request.body);
    if (!parsed.success || parsed.data.password !== CURRENCY_MANAGEMENT_PASSWORD) {
      return reply.code(403).send({
        code: "INVALID_COIN_RESET_PASSWORD",
        message: "密码不正确，知识币没有改变。",
      });
    }
    try {
      let coinDelta = 0;
      const progress = await updateProgress((current) => {
        const now = new Date().toISOString();
        coinDelta = -current.coinBalance;
        return {
          ...current,
          updatedAt: now,
          coinBalance: 0,
          transactions: [...current.transactions, {
            id: randomUUID(),
            kind: "admin-coin-reset" as const,
            targetId: "currency:discovery-coin",
            quantity: 0,
            coinDelta,
            balanceAfter: 0,
            createdAt: now,
          }].slice(-20_000),
        };
      });
      return reply.code(201).send({
        coinDelta,
        progress: publicProgress(progress),
      });
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.post("/api/world-tower/coins/set", async (request, reply) => {
    const parsed = coinSetSchema.safeParse(request.body);
    if (!parsed.success || parsed.data.password !== CURRENCY_MANAGEMENT_PASSWORD) {
      return reply.code(403).send({
        code: "INVALID_COIN_MANAGEMENT_REQUEST",
        message: parsed.success
          ? "密码不正确，知识币没有改变。"
          : "请输入有效的家长密码和 0 至 10 亿之间的整数余额。",
      });
    }
    try {
      let coinDelta = 0;
      const progress = await updateProgress((current) => {
        const now = new Date().toISOString();
        coinDelta = parsed.data.balance - current.coinBalance;
        return {
          ...current,
          updatedAt: now,
          coinBalance: parsed.data.balance,
          transactions: [...current.transactions, {
            id: randomUUID(),
            kind: "admin-coin-set" as const,
            targetId: "currency:discovery-coin",
            quantity: parsed.data.balance,
            coinDelta,
            balanceAfter: parsed.data.balance,
            createdAt: now,
          }].slice(-20_000),
        };
      });
      return reply.code(201).send({
        coinDelta,
        progress: publicProgress(progress),
      });
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.get("/api/world-tower/map", async (_request, reply) => {
    try {
      const [{ graph, nodeById, nodePriceById, icons }, progress] = await Promise.all([
        loadContent(),
        readProgress(),
      ]);
      const unlocked = new Set(progress.unlockedNodeIds);
      const allNodeIds = graph.nodes.map((node) => node.id);
      return {
        schemaVersion: 1,
        graphId: graph.graphId,
        totalNodes: graph.counts.nodes,
        isTruncated: false,
        levelNodeCounts: graph.counts.levelCounts,
        items: allNodeIds.map((nodeId) => (
          nodeSummary(nodeById.get(nodeId)!, nodePriceById, unlocked, icons)
        )),
        edges: graphEdgesForIds(new Set(allNodeIds), nodeById),
      };
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.get("/api/world-tower/level-map", async (request, reply) => {
    const query = levelMapQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({
        code: "INVALID_WORLD_TOWER_LEVEL_MAP_QUERY",
        message: "请选择要展开的尺度层和加载方式。",
      });
    }
    try {
      const [{ graph, nodeById, nodePriceById, icons }, progress] = await Promise.all([
        loadContent(),
        readProgress(),
      ]);
      if (!graph.levels.some((level) => level.id === query.data.levelId)) {
        return reply.code(404).send({
          code: "WORLD_TOWER_LEVEL_NOT_FOUND",
          message: "没有找到这个图谱层级。",
        });
      }
      const unlocked = new Set(progress.unlockedNodeIds);
      const allLevelNodeIds = graph.indexes.nodeIdsByLevel[query.data.levelId] ?? [];
      const levelNodeIds = allLevelNodeIds.filter((nodeId) => (
        query.data.visibility === "all"
        || (query.data.visibility === "unlocked" && unlocked.has(nodeId))
        || (query.data.visibility === "locked" && !unlocked.has(nodeId))
      ));
      const overview = buildGraphOverview(graph, icons);
      const visibleNodeIds = new Set([
        ...overview.nodeIds.filter((nodeId) => nodeById.get(nodeId)?.levelId !== query.data.levelId),
        ...levelNodeIds,
      ]);
      return {
        schemaVersion: 1,
        graphId: graph.graphId,
        levelId: query.data.levelId,
        visibility: query.data.visibility,
        totalInLevel: allLevelNodeIds.length,
        matchedTotal: levelNodeIds.length,
        groups: buildLevelGroups(graph, levelNodeIds),
        items: levelNodeIds.map((nodeId) => (
          nodeSummary(nodeById.get(nodeId)!, nodePriceById, unlocked, icons)
        )),
        edges: graphEdgesForIds(visibleNodeIds, nodeById),
      };
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.get("/api/world-tower/nodes", async (request, reply) => {
    const query = nodeListQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({
        code: "INVALID_WORLD_TOWER_QUERY",
        message: "图谱分页条件不完整，请重新选择层级。",
      });
    }
    try {
      const [{ graph, nodeById, nodePriceById, icons }, progress] = await Promise.all([
        loadContent(),
        readProgress(),
      ]);
      if (!graph.levels.some((level) => level.id === query.data.levelId)) {
        return reply.code(404).send({ code: "WORLD_TOWER_LEVEL_NOT_FOUND", message: "没有找到这个图谱层级。" });
      }
      const sourceIds = query.data.clusterId
        ? graph.indexes.nodeIdsByCluster[query.data.clusterId] ?? []
        : graph.indexes.nodeIdsByLevel[query.data.levelId] ?? [];
      const filteredIds = sourceIds.filter((id) => nodeById.get(id)?.levelId === query.data.levelId);
      const unlocked = new Set(progress.unlockedNodeIds);
      const items = filteredIds
        .slice(query.data.offset, query.data.offset + query.data.limit)
        .map((id) => nodeSummary(nodeById.get(id)!, nodePriceById, unlocked, icons));
      return {
        levelId: query.data.levelId,
        clusterId: query.data.clusterId ?? null,
        offset: query.data.offset,
        limit: query.data.limit,
        total: filteredIds.length,
        items,
      };
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.get("/api/world-tower/nodes/:nodeId", async (request, reply) => {
    const parsed = z.object({ nodeId: z.string().min(1).max(160) }).safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ code: "INVALID_WORLD_TOWER_NODE", message: "节点编号不完整。" });
    }
    try {
      const [{ graph, nodeById, nodePriceById, icons }, progress] = await Promise.all([
        loadContent(),
        readProgress(),
      ]);
      const node = nodeById.get(parsed.data.nodeId);
      if (!node) return reply.code(404).send({ code: "WORLD_TOWER_NODE_NOT_FOUND", message: "没有找到这个物质塔节点。" });
      const unlocked = new Set(progress.unlockedNodeIds);
      const inputIds = [...new Set(node.recipes.flatMap((item) => item.inputs.map((value) => value.nodeId)))];
      const dependentIds = graph.indexes.dependentsByNodeId[node.id] ?? [];
      const artwork = artworkForNode(node, icons);
      return {
        node: {
          ...node,
          imagePath: artwork?.path ?? null,
          imageCrop: artwork?.atlas ?? null,
          unlockPriceCoins: nodePriceById.get(node.id) ?? null,
          isUnlocked: unlocked.has(node.id),
        },
        inputs: inputIds.slice(0, 24).map((id) => nodeSummary(nodeById.get(id)!, nodePriceById, unlocked, icons)),
        dependents: dependentIds.slice(0, 24).map((id) => nodeSummary(nodeById.get(id)!, nodePriceById, unlocked, icons)),
      };
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.post("/api/world-tower/unlock-node", async (request, reply) => {
    const parsed = targetInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "INVALID_WORLD_TOWER_UNLOCK", message: "需要选择一个可以点亮的节点。" });
    }
    try {
      const { nodeById, nodePriceById } = await loadContent();
      const targetNode = nodeById.get(parsed.data.targetId);
      if (!targetNode) {
        return reply.code(404).send({ code: "WORLD_TOWER_NODE_NOT_FOUND", message: "没有找到这个物质塔节点。" });
      }
      let alreadyUnlocked = false;
      const progress = await updateProgress((current) => {
        if (current.unlockedNodeIds.includes(parsed.data.targetId)) {
          alreadyUnlocked = true;
          return current;
        }
        const unlocked = new Set(current.unlockedNodeIds);
        const usableRecipe = targetNode.recipes.find((recipe) => (
          recipe.inputs.every((input) => unlocked.has(input.nodeId))
        ));
        if (targetNode.recipes.length > 0 && !usableRecipe) {
          throw new WorldTowerError(
            "WORLD_TOWER_REQUIREMENTS_MISSING",
            409,
            "还缺少前置节点，请先沿着下方的发现路线点亮它们。",
          );
        }
        const price = nodePriceById.get(parsed.data.targetId);
        if (price === undefined) throw new WorldTowerError("WORLD_TOWER_PRICE_NOT_FOUND", 500, "这个节点还没有配置点亮价格。 ");
        if (current.coinBalance < price) throw new WorldTowerError("WORLD_TOWER_INSUFFICIENT_COINS", 409, "知识币还不够，先完成更多学习任务再回来看看。 ");
        const now = new Date().toISOString();
        const balanceAfter = current.coinBalance - price;
        return {
          ...current,
          updatedAt: now,
          coinBalance: balanceAfter,
          unlockedNodeIds: [...current.unlockedNodeIds, parsed.data.targetId],
          transactions: [...current.transactions, {
            id: randomUUID(),
            kind: "node-unlock" as const,
            targetId: parsed.data.targetId,
            quantity: 1,
            coinDelta: -price,
            balanceAfter,
            createdAt: now,
          }],
        };
      });
      return reply.code(alreadyUnlocked ? 200 : 201).send({
        alreadyUnlocked,
        progress: publicProgress(progress),
      });
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.post("/api/world-tower/purchase-resource", async (request, reply) => {
    const parsed = targetInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "INVALID_WORLD_TOWER_RESOURCE", message: "需要选择一种粒子包、动作、条件、环境或知识。" });
    }
    try {
      const { resourceById, resourcePriceById } = await loadContent();
      const resource = resourceById.get(parsed.data.targetId);
      const price = resourcePriceById.get(parsed.data.targetId);
      if (!resource || !price) {
        return reply.code(404).send({ code: "WORLD_TOWER_RESOURCE_NOT_FOUND", message: "没有找到这个图谱资源。" });
      }
      if (!resource.shop.purchasable) {
        return reply.code(409).send({
          code: "WORLD_TOWER_RESOURCE_NOT_PURCHASABLE",
          message: "这是过程需要满足的状态，不是需要购买或消耗的道具。",
        });
      }
      let alreadyUnlocked = false;
      const progress = await updateProgress((current) => {
        const permanent = price.grantMode === "permanent-unlock";
        if (permanent && current.permanentResourceIds.includes(resource.id)) {
          alreadyUnlocked = true;
          return current;
        }
        if (current.coinBalance < price.priceCoins) throw new WorldTowerError("WORLD_TOWER_INSUFFICIENT_COINS", 409, "知识币还不够，先完成更多学习任务再回来看看。 ");
        const now = new Date().toISOString();
        const balanceAfter = current.coinBalance - price.priceCoins;
        return {
          ...current,
          updatedAt: now,
          coinBalance: balanceAfter,
          permanentResourceIds: permanent
            ? [...current.permanentResourceIds, resource.id]
            : current.permanentResourceIds,
          resourceInventory: permanent
            ? current.resourceInventory
            : {
                ...current.resourceInventory,
                [resource.id]: (current.resourceInventory[resource.id] ?? 0) + (price.grantQuantity ?? 1),
              },
          transactions: [...current.transactions, {
            id: randomUUID(),
            kind: permanent ? "resource-unlock" as const : "resource-charge" as const,
            targetId: resource.id,
            quantity: price.grantQuantity ?? 1,
            coinDelta: -price.priceCoins,
            balanceAfter,
            createdAt: now,
          }],
        };
      });
      return reply.code(alreadyUnlocked ? 200 : 201).send({
        alreadyUnlocked,
        progress: publicProgress(progress),
      });
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });

  app.post("/api/world-tower/manage-progress", async (request, reply) => {
    const parsed = progressActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_WORLD_TOWER_PROGRESS_ACTION",
        message: "需要选择点亮全部或清空全部。",
      });
    }
    try {
      const { graph } = await loadContent();
      let affectedNodes = 0;
      const progress = await updateProgress((current) => {
        const now = new Date().toISOString();
        if (parsed.data.action === "unlock-all") {
          const allNodeIds = graph.nodes.map((node) => node.id);
          affectedNodes = allNodeIds.length - current.unlockedNodeIds.length;
          return {
            ...current,
            updatedAt: now,
            unlockedNodeIds: allNodeIds,
            transactions: [...current.transactions, {
              id: randomUUID(),
              kind: "admin-unlock-all" as const,
              targetId: "world-tower:all-nodes",
              quantity: affectedNodes,
              coinDelta: 0,
              balanceAfter: current.coinBalance,
              createdAt: now,
            }],
          };
        }
        affectedNodes = current.unlockedNodeIds.length;
        return {
          ...current,
          updatedAt: now,
          unlockedNodeIds: [],
          permanentResourceIds: [],
          resourceInventory: {},
          transactions: [...current.transactions, {
            id: randomUUID(),
            kind: "admin-clear-all" as const,
            targetId: "world-tower:all-progress",
            quantity: affectedNodes,
            coinDelta: 0,
            balanceAfter: current.coinBalance,
            createdAt: now,
          }],
        };
      });
      return reply.code(201).send({
        action: parsed.data.action,
        affectedNodes,
        coinDelta: 0,
        progress: publicProgress(progress),
      });
    } catch (error) {
      return sendKnownError(error, reply);
    }
  });
}
