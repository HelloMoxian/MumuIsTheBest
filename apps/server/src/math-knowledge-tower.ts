import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const KNOWLEDGE_POINT_COUNT = 517;
const MASTERY_LEVEL_COUNT = 4;
const TOTAL_LIGHTS = KNOWLEDGE_POINT_COUNT * MASTERY_LEVEL_COUNT;
const AGE_SPAN_DAYS = 9 * 365;

const masteryIdSchema = z.enum(["aware", "understand", "calculate", "master"]);

const masteryLevelSchema = z.object({
  id: masteryIdSchema,
  label: z.string().min(1).max(40),
  description: z.string().min(1).max(160),
});

const knowledgePointTupleSchema = z.tuple([
  z.string().regex(/^g\d{2}-\d{3}$/),
  z.string().min(1).max(300),
]);

const semesterSchema = z.object({
  id: z.enum(["upper", "lower"]),
  label: z.enum(["上册", "下册"]),
  points: z.array(knowledgePointTupleSchema).min(1).max(100),
});

const gradeSchema = z.object({
  id: z.string().regex(/^grade-[1-9]$/),
  order: z.number().int().min(1).max(9),
  label: z.string().min(2).max(8),
  stage: z.enum(["小学", "初中"]),
  semesters: z.array(semesterSchema).length(2),
});

const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  catalogId: z.literal("mumu-math-knowledge-tower-v1"),
  title: z.literal("数学知识塔"),
  language: z.literal("zh-CN"),
  knowledgePointCount: z.literal(KNOWLEDGE_POINT_COUNT),
  masteryLevels: z.array(masteryLevelSchema).length(MASTERY_LEVEL_COUNT),
  grades: z.array(gradeSchema).length(9),
});

const progressSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  catalogId: z.literal("mumu-math-knowledge-tower-v1"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  litLightIds: z.array(z.string().min(1).max(80)).max(TOTAL_LIGHTS),
}).superRefine((progress, context) => {
  if (new Set(progress.litLightIds).size !== progress.litLightIds.length) {
    context.addIssue({ code: "custom", message: "点亮记录不能重复。" });
  }
});

const legacyProgressSchema = z.object({
  schemaVersion: z.literal(0),
  id: z.string().uuid(),
  catalogId: z.literal("mumu-math-knowledge-tower-v1"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  litLights: z.record(z.string(), z.array(masteryIdSchema).max(MASTERY_LEVEL_COUNT)),
});

const lightInputSchema = z.object({
  topicId: z.string().min(1).max(80),
  masteryId: masteryIdSchema,
}).strict();

type Catalog = z.infer<typeof catalogSchema>;
type Progress = z.infer<typeof progressSchema>;

type ReadProgressResult = {
  progress: Progress;
  migrated: boolean;
};

function lightId(topicId: string, masteryId: z.infer<typeof masteryIdSchema>) {
  return `${topicId}:${masteryId}`;
}

function emptyProgress(catalogId: Catalog["catalogId"]): Progress {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: randomUUID(),
    catalogId,
    createdAt: now,
    updatedAt: now,
    litLightIds: [],
  };
}

export function mathKnowledgeAge(litCount: number, totalLights = TOTAL_LIGHTS) {
  const safeLitCount = Math.min(Math.max(Math.trunc(litCount), 0), totalLights);
  const progressDays = Math.floor((safeLitCount / totalLights) * AGE_SPAN_DAYS);
  const addedYears = Math.floor(progressDays / 365);
  const remainingDays = progressDays - addedYears * 365;
  const averageMonthDays = 365 / 12;
  const months = Math.min(11, Math.floor(remainingDays / averageMonthDays));
  const days = Math.floor(remainingDays - months * averageMonthDays);
  const years = 6 + addedYears;
  return {
    years,
    months,
    days,
    progressDays,
    label: `${years}岁${months}月${days}天`,
  };
}

function publicProgress(progress: Progress) {
  const litCount = progress.litLightIds.length;
  return {
    ...progress,
    litCount,
    score: litCount,
    totalLights: TOTAL_LIGHTS,
    maxScore: TOTAL_LIGHTS,
    progressRatio: litCount / TOTAL_LIGHTS,
    progressPercent: (litCount / TOTAL_LIGHTS) * 100,
    equivalentAge: mathKnowledgeAge(litCount),
  };
}

function validateCatalog(catalog: Catalog) {
  const pointIds = catalog.grades.flatMap((grade) => (
    grade.semesters.flatMap((semester) => semester.points.map(([id]) => id))
  ));
  const masteryIds = catalog.masteryLevels.map((level) => level.id);
  if (
    pointIds.length !== KNOWLEDGE_POINT_COUNT
    || new Set(pointIds).size !== KNOWLEDGE_POINT_COUNT
    || new Set(masteryIds).size !== MASTERY_LEVEL_COUNT
    || catalog.grades.some((grade, index) => grade.order !== index + 1)
  ) {
    throw new Error("数学知识塔课程目录数量、顺序或稳定 ID 不符合约定。");
  }
  return new Set(pointIds.flatMap((pointId) => (
    masteryIds.map((masteryId) => lightId(pointId, masteryId))
  )));
}

function publicCatalog(catalog: Catalog) {
  let sequence = 0;
  return {
    schemaVersion: catalog.schemaVersion,
    catalogId: catalog.catalogId,
    title: catalog.title,
    language: catalog.language,
    knowledgePointCount: catalog.knowledgePointCount,
    totalLights: TOTAL_LIGHTS,
    masteryLevels: catalog.masteryLevels,
    grades: catalog.grades.map((grade) => ({
      id: grade.id,
      order: grade.order,
      label: grade.label,
      stage: grade.stage,
      pointCount: grade.semesters.reduce((sum, semester) => sum + semester.points.length, 0),
      semesters: grade.semesters.map((semester) => ({
        id: semester.id,
        label: semester.label,
        points: semester.points.map(([id, description]) => ({
          id,
          sequence: sequence += 1,
          description,
        })),
      })),
    })),
  };
}

async function saveProgress(path: string, progress: Progress) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(progress, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
}

async function readProgress(
  path: string,
  catalog: Catalog,
  validLightIds: ReadonlySet<string>,
): Promise<ReadProgressResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { progress: emptyProgress(catalog.catalogId), migrated: false };
    }
    throw error;
  }

  const current = progressSchema.safeParse(raw);
  if (current.success) {
    if (!current.data.litLightIds.every((id) => validLightIds.has(id))) {
      throw new Error("数学知识塔进度包含课程目录中不存在的灯。" );
    }
    return { progress: current.data, migrated: false };
  }

  const legacy = legacyProgressSchema.safeParse(raw);
  if (!legacy.success) {
    throw new Error("数学知识塔进度文件损坏或版本不受支持。" );
  }

  const migratedLightIds = Object.entries(legacy.data.litLights).flatMap(
    ([topicId, masteryIds]) => masteryIds.map((masteryId) => lightId(topicId, masteryId)),
  );
  if (!migratedLightIds.every((id) => validLightIds.has(id))) {
    throw new Error("旧版数学知识塔进度包含课程目录中不存在的灯。" );
  }
  return {
    migrated: true,
    progress: progressSchema.parse({
      schemaVersion: 1,
      id: legacy.data.id,
      catalogId: legacy.data.catalogId,
      createdAt: legacy.data.createdAt,
      updatedAt: new Date().toISOString(),
      litLightIds: [...new Set(migratedLightIds)],
    }),
  };
}

export async function registerMathKnowledgeTowerApi(
  app: FastifyInstance,
  appDataDir: string,
  projectRoot: string,
) {
  const catalogPath = resolve(projectRoot, "content", "math", "knowledge-tower.v1.json");
  const progressPath = resolve(
    appDataDir,
    "learning",
    "math",
    "knowledge-tower-progress.json",
  );
  const catalog = catalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
  const validLightIds = validateCatalog(catalog);
  const responseCatalog = publicCatalog(catalog);
  let writeQueue: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>) {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  app.get("/api/math/knowledge-tower", async (_request, reply) => {
    try {
      let result = await readProgress(progressPath, catalog, validLightIds);
      if (result.migrated) {
        result = await enqueue(async () => {
          const latest = await readProgress(progressPath, catalog, validLightIds);
          if (latest.migrated) await saveProgress(progressPath, latest.progress);
          return { progress: latest.progress, migrated: false };
        });
      }
      return { catalog: responseCatalog, progress: publicProgress(result.progress) };
    } catch {
      return reply.code(500).send({
        code: "KNOWLEDGE_TOWER_READ_FAILED",
        message: "数学知识塔进度暂时无法读取，请让家长检查本机数据文件。",
      });
    }
  });

  app.post("/api/math/knowledge-tower/lights", async (request, reply) => {
    const parsed = lightInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_KNOWLEDGE_LIGHT",
        message: "这盏灯不在当前数学知识塔中，请刷新页面后再试。",
      });
    }
    const targetLightId = lightId(parsed.data.topicId, parsed.data.masteryId);
    if (!validLightIds.has(targetLightId)) {
      return reply.code(400).send({
        code: "UNKNOWN_KNOWLEDGE_LIGHT",
        message: "这盏灯不在当前数学知识塔中，请刷新页面后再试。",
      });
    }

    try {
      const result = await enqueue(async () => {
        const { progress } = await readProgress(progressPath, catalog, validLightIds);
        const wasLit = progress.litLightIds.includes(targetLightId);
        const nextProgress = progressSchema.parse({
          ...progress,
          updatedAt: new Date().toISOString(),
          litLightIds: wasLit
            ? progress.litLightIds.filter((id) => id !== targetLightId)
            : [...progress.litLightIds, targetLightId],
        });
        await saveProgress(progressPath, nextProgress);
        return { isLit: !wasLit, progress: nextProgress };
      });
      return { isLit: result.isLit, progress: publicProgress(result.progress) };
    } catch {
      return reply.code(500).send({
        code: "KNOWLEDGE_TOWER_WRITE_FAILED",
        message: "这盏灯暂时没有保存，请再点一次。",
      });
    }
  });
}
