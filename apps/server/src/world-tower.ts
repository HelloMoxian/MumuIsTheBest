import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

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
  logic: z.literal("ALL"),
  inputs: z.array(graphInputSchema).max(40),
  requirements: z.object({
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
  kind: z.enum(["action", "condition", "environment", "knowledge"]),
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
    nodes: z.literal(2_000),
    recipes: z.number().int().min(1),
    levels: z.number().int().min(1),
    clusters: z.number().int().min(1),
    resources: z.number().int().min(1),
    levelCounts: z.record(z.string(), z.number().int().min(0)),
    kindCounts: z.record(z.string(), z.number().int().min(0)),
  }),
  semantics: z.record(z.string(), z.unknown()),
  loadingHints: z.record(z.string(), z.unknown()),
  levels: z.array(levelSchema).min(1),
  clusters: z.array(clusterSchema).min(1),
  resources: z.object({
    actions: z.array(resourceSchema),
    conditions: z.array(resourceSchema),
    environments: z.array(resourceSchema),
    knowledge: z.array(resourceSchema),
  }),
  nodes: z.array(graphNodeSchema).length(2_000),
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
    earningRulesStatus: z.literal("reserved-for-future"),
  }),
  nodePrices: z.array(z.object({
    targetId: z.string().min(1).max(160),
    priceCoins: z.number().int().min(0).max(1_000_000),
    grantMode: z.literal("permanent-unlock"),
  })).length(2_000),
  resourcePrices: z.array(z.object({
    targetId: z.string().min(1).max(160),
    priceCoins: z.number().int().min(0).max(1_000_000),
    grantMode: z.enum(["permanent-unlock", "inventory-charge"]),
    grantQuantity: z.number().int().min(1).nullable(),
  })).min(1),
});

const iconManifestSchema = z.object({
  schemaVersion: z.literal(1),
  assetPackId: z.string().min(1).max(160),
  backgroundAsset: z.string().min(1),
  frameAssets: z.record(z.string(), z.string()),
  levelFallbacks: z.record(z.string(), z.string()),
  clusterFallbacks: z.record(z.string(), z.string()).default({}),
  nodeAssets: z.record(z.string(), z.string()),
  resourceAssets: z.record(z.string(), z.string()),
  placeholderTexture: z.string(),
});

const transactionSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["node-unlock", "resource-unlock", "resource-charge"]),
  targetId: z.string().min(1).max(160),
  quantity: z.number().int().min(1).max(10_000),
  coinDelta: z.number().int().max(0),
  balanceAfter: z.number().int().min(0).max(1_000_000),
  createdAt: z.string().datetime(),
});

const progressSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  graphId: z.string().min(1).max(160),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  coinBalance: z.number().int().min(0).max(1_000_000),
  unlockedNodeIds: z.array(z.string().min(1).max(160)).max(2_000),
  permanentResourceIds: z.array(z.string().min(1).max(160)).max(500),
  resourceInventory: z.record(z.string(), z.number().int().min(0).max(100_000)),
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

const targetInputSchema = z.object({
  targetId: z.string().min(1).max(160),
});

type WorldGraph = z.infer<typeof graphSchema>;
type UnlockCatalog = z.infer<typeof priceSchema>;
type IconManifest = z.infer<typeof iconManifestSchema>;
type Progress = z.infer<typeof progressSchema>;
type GraphNode = z.infer<typeof graphNodeSchema>;

class WorldTowerError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function nodeSummary(
  node: GraphNode,
  prices: ReadonlyMap<string, number>,
  unlocked: ReadonlySet<string>,
  iconManifest: IconManifest,
) {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    levelId: node.levelId,
    clusterId: node.clusterId,
    summary: node.summary,
    art: node.art,
    imagePath:
      iconManifest.nodeAssets[node.id]
      ?? iconManifest.clusterFallbacks[node.clusterId]
      ?? iconManifest.levelFallbacks[node.levelId]
      ?? null,
    unlockPriceCoins: prices.get(node.id) ?? null,
    isUnlocked: unlocked.has(node.id),
    recipeCount: node.recipes.length,
  };
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
      unlockedNodeIds: [...graph.semantics.rootNodeIds as string[]],
      permanentResourceIds: [],
      resourceInventory: {},
      transactions: [],
    };
  }

  async function readProgress(): Promise<Progress> {
    const { graph, catalog, nodeById, resourceById } = await loadContent();
    try {
      const progress = progressSchema.parse(JSON.parse(await readFile(progressPath, "utf8")));
      if (progress.graphId !== graph.graphId) throw new Error("WORLD_TOWER_GRAPH_MISMATCH");
      if (
        progress.unlockedNodeIds.some((id) => !nodeById.has(id))
        || progress.permanentResourceIds.some((id) => !resourceById.has(id))
        || Object.keys(progress.resourceInventory).some((id) => !resourceById.has(id))
      ) {
        throw new Error("WORLD_TOWER_PROGRESS_REFERENCE_MISMATCH");
      }
      return progress;
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
      if (!node) return reply.code(404).send({ code: "WORLD_TOWER_NODE_NOT_FOUND", message: "没有找到这个万物节点。" });
      const unlocked = new Set(progress.unlockedNodeIds);
      const inputIds = [...new Set(node.recipes.flatMap((item) => item.inputs.map((value) => value.nodeId)))];
      const dependentIds = graph.indexes.dependentsByNodeId[node.id] ?? [];
      return {
        node: {
          ...node,
          imagePath:
            icons.nodeAssets[node.id]
            ?? icons.clusterFallbacks[node.clusterId]
            ?? icons.levelFallbacks[node.levelId]
            ?? null,
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
        return reply.code(404).send({ code: "WORLD_TOWER_NODE_NOT_FOUND", message: "没有找到这个万物节点。" });
      }
      let alreadyUnlocked = false;
      const progress = await updateProgress((current) => {
        if (current.unlockedNodeIds.includes(parsed.data.targetId)) {
          alreadyUnlocked = true;
          return current;
        }
        const unlocked = new Set(current.unlockedNodeIds);
        const permanentResources = new Set(current.permanentResourceIds);
        const usableRecipe = targetNode.recipes.find((recipe) => (
          recipe.inputs.every((input) => unlocked.has(input.nodeId))
          && recipe.requirements.actions.every(
            (requirement) =>
              (current.resourceInventory[requirement.resourceId] ?? 0) >= requirement.amount,
          )
          && recipe.requirements.knowledge.every(
            (requirement) => permanentResources.has(requirement.resourceId),
          )
        ));
        if (!usableRecipe) {
          throw new WorldTowerError(
            "WORLD_TOWER_REQUIREMENTS_MISSING",
            409,
            "还缺少来路节点、动作数量或知识点，请先把配方需要的星格准备好。",
          );
        }
        const price = nodePriceById.get(parsed.data.targetId);
        if (price === undefined) throw new WorldTowerError("WORLD_TOWER_PRICE_NOT_FOUND", 500, "这个节点还没有配置点亮价格。 ");
        if (current.coinBalance < price) throw new WorldTowerError("WORLD_TOWER_INSUFFICIENT_COINS", 409, "发现币还不够，先完成更多学习任务再回来看看。 ");
        const now = new Date().toISOString();
        const balanceAfter = current.coinBalance - price;
        return {
          ...current,
          updatedAt: now,
          coinBalance: balanceAfter,
          unlockedNodeIds: [...current.unlockedNodeIds, parsed.data.targetId],
          resourceInventory: usableRecipe.requirements.actions.reduce(
            (inventory, requirement) => ({
              ...inventory,
              [requirement.resourceId]:
                (inventory[requirement.resourceId] ?? 0) - requirement.amount,
            }),
            current.resourceInventory,
          ),
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
      return reply.code(400).send({ code: "INVALID_WORLD_TOWER_RESOURCE", message: "需要选择一种动作、条件、环境或知识。" });
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
        if (current.coinBalance < price.priceCoins) throw new WorldTowerError("WORLD_TOWER_INSUFFICIENT_COINS", 409, "发现币还不够，先完成更多学习任务再回来看看。 ");
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
}
