import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseAudioPreferences, type AudioPreferences } from "./audio-preferences.js";
import { parseControllerPreferences, type ControllerPreferences } from "./game-controller-preferences.js";

const stateIdSchema = z.enum([
  "audio-preferences",
  "game-controller-preferences",
  "chemistry-reaction-furnace",
  "chemistry-molecule-factory",
  "drawing-studio",
  "experience-preferences",
  "nature-rock-minerals",
]);

const identifierSchema = z.string().min(1).max(180);
const elementSymbolSchema = z.string().regex(/^[A-Z][a-z]{0,2}$/);
const atomCountsSchema = z.record(
  elementSymbolSchema,
  z.number().int().positive().max(240),
).refine((counts) => Object.keys(counts).length <= 90, "原子种类过多。");

function hasUniqueValues(values: readonly string[]) {
  return new Set(values).size === values.length;
}

function atomTotal(counts: Readonly<Record<string, number>>) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

const reactionFurnacePayloadSchema = z.object({
  targetIds: z.array(identifierSchema).length(10),
  targetElements: z.array(elementSymbolSchema).length(10),
  usedBundleIds: z.array(identifierSchema).max(120),
  pool: atomCountsSchema,
  completedIds: z.array(identifierSchema).max(10),
  assemblingId: identifierSchema.nullable(),
  batchNumber: z.number().int().min(1).max(1_000_000),
}).superRefine((payload, context) => {
  if (
    !hasUniqueValues(payload.targetIds)
    || !hasUniqueValues(payload.targetElements)
    || !hasUniqueValues(payload.usedBundleIds)
    || !hasUniqueValues(payload.completedIds)
  ) {
    context.addIssue({ code: "custom", message: "反应熔炉记录不能包含重复 ID。" });
  }
  const targetIds = new Set(payload.targetIds);
  if (payload.completedIds.some((id) => !targetIds.has(id))) {
    context.addIssue({ code: "custom", message: "已完成物质必须属于当前批次。" });
  }
  if (
    payload.assemblingId !== null
    && (!targetIds.has(payload.assemblingId) || payload.completedIds.includes(payload.assemblingId))
  ) {
    context.addIssue({ code: "custom", message: "聚合中的物质状态无效。" });
  }
  if (atomTotal(payload.pool) > 160) {
    context.addIssue({ code: "custom", message: "反应熔炉游离原子超过上限。" });
  }
});

const moleculeFactoryPayloadSchema = z.object({
  pool: atomCountsSchema,
  discoveryIds: z.array(identifierSchema).max(600),
  selectedSymbol: elementSymbolSchema,
  assemblingId: identifierSchema.nullable(),
  excludeOrganic: z.boolean(),
  autoAssemble: z.boolean(),
  formedIonIds: z.array(identifierSchema).max(20),
}).superRefine((payload, context) => {
  if (!hasUniqueValues(payload.discoveryIds) || !hasUniqueValues(payload.formedIonIds)) {
    context.addIssue({ code: "custom", message: "分子工厂记录不能包含重复 ID。" });
  }
  if (payload.assemblingId !== null && payload.discoveryIds.includes(payload.assemblingId)) {
    context.addIssue({ code: "custom", message: "聚合中的物质不能已经收藏。" });
  }
  if (atomTotal(payload.pool) > 240) {
    context.addIssue({ code: "custom", message: "分子工厂游离原子超过上限。" });
  }
});

const experiencePreferencesPayloadSchema = z.object({
  interfaceMode: z.enum(["zh", "en", "bilingual"]),
  readAloudMode: z.enum(["none", "zh", "en", "bilingual"]),
});

const drawingColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const drawingElementIdSchema = z.string().trim().min(1).max(80);
const drawingCoordinateSchema = z.number().finite().min(-1_000_000).max(1_000_000);
const drawingColorMapSchema = z.record(
  z.string().trim().min(1).max(80),
  drawingColorSchema,
).refine((colors) => Object.keys(colors).length <= 64, "涂色区域过多。");
const drawingBaseElementSchema = z.object({
  id: drawingElementIdSchema,
  x: drawingCoordinateSchema,
  y: drawingCoordinateSchema,
  width: z.number().finite().min(1).max(10_000),
  height: z.number().finite().min(1).max(10_000),
  rotation: z.number().finite().min(-3_600).max(3_600),
  stroke: drawingColorSchema,
  strokeWidth: z.number().finite().min(1).max(80),
  layer: z.number().int().min(-1_000).max(1_000).optional(),
  createdOrder: z.number().int().min(0).max(1_000_000_000).optional(),
  groupId: drawingElementIdSchema.optional(),
});
const drawingElementSchema = z.discriminatedUnion("type", [
  drawingBaseElementSchema.extend({
    type: z.literal("shape"),
    shape: z.enum([
      "diamond", "pentagon", "hexagon", "octagon", "right-triangle",
      "arrow-right", "arrow-left", "double-arrow", "cross", "quarter-circle", "ring", "chevron",
      "free-rectangle", "free-ellipse", "free-triangle",
      "tian-grid", "round-tian-grid", "rice-grid", "round-rice-grid", "nine-grid",
      "paw-print", "footprint", "scalloped-frame", "cloud-frame", "speech-bubble", "banner",
      "crown", "clover", "bow",
      "circle",
      "ellipse",
      "semicircle",
      "triangle",
      "square",
      "rectangle",
      "rounded-rectangle",
      "trapezoid",
      "parallelogram",
      "star",
      "heart",
    ]),
    fill: drawingColorSchema,
  }),
  drawingBaseElementSchema.extend({
    type: z.literal("solid"),
    solid: z.enum(["cube", "cuboid", "sphere", "cylinder", "cone", "triangular-pyramid"]),
    yaw: z.number().finite().min(-75).max(75),
    pitch: z.number().finite().min(-60).max(60),
    depth: z.number().finite().min(10).max(180),
    faceFills: drawingColorMapSchema,
  }),
  drawingBaseElementSchema.extend({
    type: z.literal("sticker"),
    sticker: z.string().regex(/^[a-z0-9-]{1,100}$/),
    mirrored: z.boolean().default(false),
    regionFills: drawingColorMapSchema,
  }),
  drawingBaseElementSchema.extend({
    type: z.literal("stroke"),
    points: z.array(z.object({
      x: drawingCoordinateSchema,
      y: drawingCoordinateSchema,
    })).min(2).max(2_000),
    lineStyle: z.enum(["smooth", "sharp", "dashed"]),
    smoothing: z.boolean(),
  }),
  drawingBaseElementSchema.extend({
    type: z.literal("text"),
    text: z.string().trim().min(1).max(200),
    fontSize: z.number().finite().min(12).max(240),
    color: drawingColorSchema,
    layout: z.enum(["horizontal", "vertical"]),
  }),
]);

function drawingElementsHaveUniqueIds(elements: readonly { id: string }[]) {
  return hasUniqueValues(elements.map((element) => element.id));
}

const drawingPresetSchema = z.object({
  id: drawingElementIdSchema,
  name: z.string().trim().min(1).max(40),
  createdAt: z.string().datetime(),
  width: z.number().finite().min(1).max(10_000),
  height: z.number().finite().min(1).max(10_000),
  elements: z.array(drawingElementSchema).min(2).max(100),
}).refine((preset) => drawingElementsHaveUniqueIds(preset.elements), "预制件图元 ID 不能重复。");

export const drawingStudioPayloadSchema = z.object({
  schemaVersion: z.union([z.literal(2), z.literal(3)]),
  id: drawingElementIdSchema,
  title: z.string().trim().min(1).max(80),
  author: z.string().max(80),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  viewport: z.object({
    x: z.number().finite().min(-10_000_000).max(10_000_000),
    y: z.number().finite().min(-10_000_000).max(10_000_000),
    zoom: z.number().finite().min(0.25).max(4),
  }),
  elements: z.array(drawingElementSchema).max(1_000),
  presets: z.array(drawingPresetSchema).max(60),
}).superRefine((payload, context) => {
  if (
    payload.schemaVersion === 3
    && [...payload.elements, ...payload.presets.flatMap((preset) => preset.elements)]
      .some((element) => element.layer === undefined || element.createdOrder === undefined)
  ) {
    context.addIssue({ code: "custom", message: "新版画图图元必须包含层级与创建顺序。" });
  }
  if (!drawingElementsHaveUniqueIds(payload.elements)) {
    context.addIssue({ code: "custom", message: "画布图元 ID 不能重复。" });
  }
  if (!hasUniqueValues(payload.presets.map((preset) => preset.id))) {
    context.addIssue({ code: "custom", message: "预制件 ID 不能重复。" });
  }
  if (payload.presets.reduce((total, preset) => total + preset.elements.length, 0) > 1_000) {
    context.addIssue({ code: "custom", message: "预制件图元总数不能超过 1000。" });
  }
});

const researchAttributeSchema = z.enum([
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
]);

const rockMineralCellSchema = z.object({
  id: identifierSchema,
  depth: z.number().int().min(1).max(10_000_000),
  column: z.number().int().min(0).max(4),
  soilVariant: z.enum(["clay", "sand", "gravel", "deep"]),
  mineralId: identifierSchema.nullable(),
  status: z.enum(["covered", "revealed", "cleared"]),
  hitsRemaining: z.number().int().min(0).max(3),
  totalHits: z.number().int().min(0).max(3),
});

const rockMineralPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  board: z.object({
    baseDepth: z.number().int().min(1).max(10_000_000),
    cells: z.array(rockMineralCellSchema).length(30),
  }),
  currentDepth: z.number().int().min(0).max(10_000_000),
  currentHammerDurability: z.number().int().min(0).max(30),
  spareHammers: z.number().int().min(0).max(100_000),
  inventory: z.record(identifierSchema, z.number().int().min(0).max(100_000)),
  discoveredIds: z.array(identifierSchema).max(128),
  unlockedAttributes: z.record(
    identifierSchema,
    z.array(researchAttributeSchema).max(12),
  ),
  pendingResearch: z.object({
    eventId: z.string().uuid(),
    mineralId: identifierSchema,
    attributeKey: researchAttributeSchema,
  }).nullable(),
  pendingHammerPurchase: z.object({
    eventId: z.string().uuid(),
  }).nullable(),
  soundEnabled: z.boolean(),
}).superRefine((payload, context) => {
  const cellIds = payload.board.cells.map((cell) => cell.id);
  const positions = payload.board.cells.map((cell) => `${cell.depth}:${cell.column}`);
  if (!hasUniqueValues(cellIds) || !hasUniqueValues(positions)) {
    context.addIssue({ code: "custom", message: "地层格 ID 与位置不能重复。" });
  }
  if (!hasUniqueValues(payload.discoveredIds)) {
    context.addIssue({ code: "custom", message: "已发现样本不能重复。" });
  }
  if (
    Object.values(payload.unlockedAttributes)
      .some((attributes) => !hasUniqueValues(attributes))
  ) {
    context.addIssue({ code: "custom", message: "同一样本的研究词条不能重复。" });
  }
  const discovered = new Set(payload.discoveredIds);
  if (
    Object.keys(payload.inventory).some((id) => !discovered.has(id))
    || Object.keys(payload.unlockedAttributes).some((id) => !discovered.has(id))
    || (payload.pendingResearch && !discovered.has(payload.pendingResearch.mineralId))
  ) {
    context.addIssue({ code: "custom", message: "库存和研究记录必须属于已发现样本。" });
  }
});

const storedStateBaseSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  stableId: stateIdSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  payload: z.unknown(),
});

type StateId = z.infer<typeof stateIdSchema>;
type StoredState = z.infer<typeof storedStateBaseSchema>;

const definitions: Record<StateId, { relativePath: string; payloadSchema: z.ZodType }> = {
  "game-controller-preferences": {
    relativePath: "preferences/game-controllers.json",
    payloadSchema: z.custom<ControllerPreferences>(value => parseControllerPreferences(value) !== undefined),
  },
  "audio-preferences": {
    relativePath: "preferences/audio.json",
    payloadSchema: z.custom<AudioPreferences>(value => parseAudioPreferences(value) !== undefined),
  },
  "chemistry-reaction-furnace": {
    relativePath: "learning/chemistry/reaction-furnace-state.json",
    payloadSchema: reactionFurnacePayloadSchema,
  },
  "chemistry-molecule-factory": {
    relativePath: "learning/chemistry/molecule-factory-state.json",
    payloadSchema: moleculeFactoryPayloadSchema,
  },
  "drawing-studio": {
    relativePath: "creative/drawing-studio-state.json",
    payloadSchema: drawingStudioPayloadSchema,
  },
  "experience-preferences": {
    relativePath: "preferences/experience.json",
    payloadSchema: experiencePreferencesPayloadSchema,
  },
  "nature-rock-minerals": {
    relativePath: "learning/nature/rock-minerals-state.json",
    payloadSchema: rockMineralPayloadSchema,
  },
};

function parseStoredState(stableId: StateId, value: unknown): StoredState {
  const state = storedStateBaseSchema.parse(value);
  if (state.stableId !== stableId) throw new Error("PERSISTENT_STATE_ID_MISMATCH");
  return { ...state, payload: definitions[stableId].payloadSchema.parse(state.payload) };
}

export function registerPersistentUserDataApi(
  app: FastifyInstance,
  appDataDir: string,
) {
  const writeQueues = new Map<StateId, Promise<void>>();

  function statePath(stableId: StateId) {
    return resolve(appDataDir, definitions[stableId].relativePath);
  }

  async function readState(stableId: StateId): Promise<StoredState | undefined> {
    try {
      return parseStoredState(
        stableId,
        JSON.parse(await readFile(statePath(stableId), "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async function saveState(stableId: StateId, state: StoredState) {
    const destination = statePath(stableId);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const temporaryPath = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, destination);
    await chmod(destination, 0o600);
  }

  function updateState(stableId: StateId, payload: unknown) {
    const previousQueue = writeQueues.get(stableId) ?? Promise.resolve();
    const operation = previousQueue.then(async () => {
      const current = await readState(stableId);
      // Each controller write contains only changed games. Merge inside the file's
      // queue so two game tabs cannot overwrite one another's saved controls.
      const nextPayload = stableId === "game-controller-preferences" ? {
        schemaVersion: 1,
        games: {
          ...(current?.payload as ControllerPreferences | undefined)?.games,
          ...(payload as ControllerPreferences).games,
        },
      } : payload;
      const now = new Date().toISOString();
      const state = parseStoredState(stableId, {
        schemaVersion: 1,
        id: current?.id ?? randomUUID(),
        stableId,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        payload: nextPayload,
      });
      await saveState(stableId, state);
      return state;
    });
    writeQueues.set(stableId, operation.then(() => undefined, () => undefined));
    return operation;
  }

  app.get("/api/persistent-data/:stableId", async (request, reply) => {
    const params = z.object({ stableId: stateIdSchema }).safeParse(request.params);
    if (!params.success) {
      return reply.code(404).send({
        code: "UNKNOWN_PERSISTENT_DATA",
        message: "没有找到对应的本机数据记录。",
      });
    }
    try {
      return { state: await readState(params.data.stableId) ?? null };
    } catch {
      return reply.code(500).send({
        code: "PERSISTENT_DATA_READ_FAILED",
        message: "本机记录暂时无法读取，请让家长检查数据目录。",
      });
    }
  });

  app.put("/api/persistent-data/:stableId", async (request, reply) => {
    const params = z.object({ stableId: stateIdSchema }).safeParse(request.params);
    const input = z.object({ payload: z.unknown() }).safeParse(request.body);
    if (!params.success || !input.success) {
      return reply.code(400).send({
        code: "INVALID_PERSISTENT_DATA",
        message: "这次本机记录不完整，因此没有保存。",
      });
    }
    const payload = definitions[params.data.stableId].payloadSchema.safeParse(input.data.payload);
    if (!payload.success) {
      return reply.code(400).send({
        code: "INVALID_PERSISTENT_DATA",
        message: "这次本机记录不符合玩法规则，因此没有保存。",
      });
    }
    try {
      return { state: await updateState(params.data.stableId, payload.data) };
    } catch {
      return reply.code(500).send({
        code: "PERSISTENT_DATA_WRITE_FAILED",
        message: "本机记录暂时无法保存，请让家长检查数据目录。",
      });
    }
  });
}
