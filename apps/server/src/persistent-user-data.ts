import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const stateIdSchema = z.enum([
  "chemistry-reaction-furnace",
  "chemistry-molecule-factory",
  "experience-preferences",
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
  "chemistry-reaction-furnace": {
    relativePath: "learning/chemistry/reaction-furnace-state.json",
    payloadSchema: reactionFurnacePayloadSchema,
  },
  "chemistry-molecule-factory": {
    relativePath: "learning/chemistry/molecule-factory-state.json",
    payloadSchema: moleculeFactoryPayloadSchema,
  },
  "experience-preferences": {
    relativePath: "preferences/experience.json",
    payloadSchema: experiencePreferencesPayloadSchema,
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
      const now = new Date().toISOString();
      const state = parseStoredState(stableId, {
        schemaVersion: 1,
        id: current?.id ?? randomUUID(),
        stableId,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        payload,
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
