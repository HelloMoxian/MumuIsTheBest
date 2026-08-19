import { randomInt, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

const sentenceIdSchema = z.string().regex(/^echo-\d{4}$/);
const sourceFileSchema = z.string().regex(/^\d{4}\.mp3$/);
const sentenceSchema = z.object({
  id: sentenceIdSchema,
  english: z.string().min(2).max(240),
  chinese: z.string().min(2).max(240),
  topic: z.object({
    lesson: z.number().int().min(1).max(100),
    chinese: z.string().min(1).max(80),
    english: z.string().min(1).max(120),
  }),
  audio: z.object({
    english: z.string().min(1),
    chinese: z.string().min(1),
    sourceFile: sourceFileSchema,
  }),
});
const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  catalogId: z.literal("mumu-english-echo-island-v1"),
  title: z.string().min(1),
  description: z.string().min(1),
  source: z.record(z.string(), z.unknown()),
  audioArchive: z.object({
    path: z.string().min(1),
    format: z.literal("ustar"),
    entryPattern: z.string().min(1),
  }),
  learningRules: z.object({
    initialPoolSize: z.literal(20),
    masteryCompletionCount: z.literal(50),
    reviewEveryRegularCompletions: z.literal(5),
    criticalHitChance: z.literal(0.15),
    criticalHitMultiplier: z.literal(5),
  }),
  counts: z.object({ sentences: z.literal(1_000), audioFiles: z.literal(2_000) }),
  sentences: z.array(sentenceSchema).length(1_000),
}).superRefine((catalog, context) => {
  const ids = new Set(catalog.sentences.map((sentence) => sentence.id));
  const files = new Set(catalog.sentences.map((sentence) => sentence.audio.sourceFile));
  if (ids.size !== catalog.sentences.length || files.size !== catalog.sentences.length) {
    context.addIssue({ code: "custom", message: "英语句子 ID 和音频编号必须唯一。" });
  }
});

const progressRecordSchema = z.object({
  sentenceId: sentenceIdSchema,
  completionCount: z.number().int().min(1).max(1_000_000),
  lastCompletedAt: z.string().datetime(),
});
const progressSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  catalogId: z.literal("mumu-english-echo-island-v1"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  markedSentenceIds: z.array(sentenceIdSchema).min(1).max(20),
  regularCompletionsSinceReview: z.number().int().min(0).max(5),
  totalCompletions: z.number().int().min(0).max(1_000_000_000),
  appliedCompletionIds: z.array(z.string().uuid()).max(20_000),
  records: z.array(progressRecordSchema).max(1_000),
}).superRefine((progress, context) => {
  if (new Set(progress.markedSentenceIds).size !== progress.markedSentenceIds.length) {
    context.addIssue({ code: "custom", message: "标记句子不能重复。" });
  }
  if (new Set(progress.records.map((record) => record.sentenceId)).size !== progress.records.length) {
    context.addIssue({ code: "custom", message: "每个句子只能有一条练习记录。" });
  }
});

const completionSchema = z.object({
  eventId: z.string().uuid(),
  sentenceId: sentenceIdSchema,
  mode: z.enum(["regular", "review"]),
  completedAt: z.string().datetime(),
});
const markSchema = z.object({ sentenceId: sentenceIdSchema, marked: z.boolean() });
const audioParamsSchema = z.object({
  language: z.enum(["en", "zh"]),
  sourceFile: sourceFileSchema,
});

type Catalog = z.infer<typeof catalogSchema>;
type Progress = z.infer<typeof progressSchema>;
type Completion = z.infer<typeof completionSchema>;
type TarEntry = { offset: number; size: number };

function randomSample<T>(items: readonly T[], count: number) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

function completionCounts(progress: Progress) {
  return new Map(progress.records.map((record) => [record.sentenceId, record.completionCount]));
}

function lowestCountSentence(
  sentenceIds: readonly string[],
  counts: ReadonlyMap<string, number>,
  excluded: ReadonlySet<string>,
) {
  const candidates = sentenceIds.filter((id) => !excluded.has(id));
  const minimum = Math.min(...candidates.map((id) => counts.get(id) ?? 0));
  const tied = candidates.filter((id) => (counts.get(id) ?? 0) === minimum);
  return tied.length ? tied[randomInt(tied.length)] : undefined;
}

function emptyProgress(catalog: Catalog, now = new Date().toISOString()): Progress {
  return progressSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    catalogId: catalog.catalogId,
    createdAt: now,
    updatedAt: now,
    markedSentenceIds: randomSample(catalog.sentences.map((sentence) => sentence.id), 20),
    regularCompletionsSinceReview: 0,
    totalCompletions: 0,
    appliedCompletionIds: [],
    records: [],
  });
}

function publicProgress(progress: Progress, masteryCount: number) {
  return {
    ...progress,
    masteredSentenceCount: progress.records.filter(
      (record) => record.completionCount >= masteryCount,
    ).length,
  };
}

function tarName(header: Buffer) {
  return header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
}

function tarSize(header: Buffer) {
  const value = header.subarray(124, 136).toString("ascii").replace(/\0.*$/s, "").trim();
  return Number.parseInt(value, 8);
}

async function indexTar(path: string) {
  const entries = new Map<string, TarEntry>();
  const archive = await open(path, "r");
  let offset = 0;
  try {
    while (true) {
      const header = Buffer.alloc(512);
      const { bytesRead } = await archive.read(header, 0, 512, offset);
      if (bytesRead === 0) break;
      if (bytesRead !== 512) throw new Error("AUDIO_ARCHIVE_TRUNCATED");
      if (header.every((byte) => byte === 0)) break;
      const name = tarName(header);
      const size = tarSize(header);
      if (!name || !Number.isSafeInteger(size) || size < 0 || entries.has(name)) {
        throw new Error("AUDIO_ARCHIVE_INVALID");
      }
      entries.set(name, { offset: offset + 512, size });
      offset += 512 + Math.ceil(size / 512) * 512;
    }
  } finally {
    await archive.close();
  }
  if (entries.size !== 2_000) throw new Error("AUDIO_ARCHIVE_INCOMPLETE");
  return entries;
}

async function readEntry(path: string, entry: TarEntry, start: number, end: number) {
  const archive = await open(path, "r");
  try {
    const buffer = Buffer.alloc(end - start + 1);
    const { bytesRead } = await archive.read(buffer, 0, buffer.length, entry.offset + start);
    if (bytesRead !== buffer.length) throw new Error("AUDIO_ARCHIVE_TRUNCATED");
    return buffer;
  } finally {
    await archive.close();
  }
}

function parseRange(value: string | undefined, size: number) {
  if (!value) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : NaN;
  if (!Number.isFinite(start) && Number.isFinite(end)) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else {
    if (!Number.isFinite(start)) return null;
    if (!Number.isFinite(end)) end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1), partial: true };
}

function progressError(reply: FastifyReply, code: string, message: string) {
  return reply.code(500).send({ code, message });
}

export async function registerEnglishEchoIslandApi(
  app: FastifyInstance,
  appDataDir: string,
  projectRoot: string,
) {
  const catalogPath = resolve(projectRoot, "content", "english", "echo-island.v1.json");
  const audioArchivePath = resolve(projectRoot, "content", "english", "echo-island-audio.v1.tar");
  const progressPath = resolve(appDataDir, "learning", "english", "echo-island-progress.json");
  const catalog = catalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
  const sentenceIds = catalog.sentences.map((sentence) => sentence.id);
  const sentenceIdSet = new Set(sentenceIds);
  const sentenceOrder = new Map(sentenceIds.map((id, index) => [id, index]));
  const archiveEntries = await indexTar(audioArchivePath);
  let writeQueue: Promise<void> = Promise.resolve();

  async function readProgress(): Promise<Progress | null> {
    try {
      const parsed = progressSchema.parse(JSON.parse(await readFile(progressPath, "utf8")));
      if (parsed.markedSentenceIds.some((id) => !sentenceIdSet.has(id))) {
        throw new Error("PROGRESS_CATALOG_MISMATCH");
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
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

  function updateProgress(mutator: (progress: Progress) => Progress | Promise<Progress>) {
    const operation = writeQueue.then(async () => {
      const current = (await readProgress()) ?? emptyProgress(catalog);
      const next = progressSchema.parse(await mutator(current));
      await saveProgress(next);
      return next;
    });
    writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async function ensureProgress() {
    const existing = await readProgress();
    return existing ?? updateProgress((current) => current);
  }

  app.get("/api/english/echo-island", async (_request, reply) => {
    try {
      const progress = await ensureProgress();
      return { ...catalog, progress: publicProgress(progress, catalog.learningRules.masteryCompletionCount) };
    } catch {
      return progressError(reply, "ECHO_ISLAND_READ_FAILED", "英语回声岛暂时无法读取，请让家长检查本机数据文件。");
    }
  });

  app.post("/api/english/echo-island/completions", async (request, reply) => {
    const parsed = completionSchema.safeParse(request.body);
    if (!parsed.success || !sentenceIdSet.has(parsed.data.sentenceId)) {
      return reply.code(400).send({ code: "INVALID_ECHO_COMPLETION", message: "这次听力记录不完整，因此没有增加次数。" });
    }
    try {
      let alreadyRecorded = false;
      let poolChange: { removedSentenceId: string; addedSentenceId: string | null } | null = null;
      const progress = await updateProgress((current) => {
        if (current.appliedCompletionIds.includes(parsed.data.eventId)) {
          alreadyRecorded = true;
          return current;
        }
        const existing = current.records.find((record) => record.sentenceId === parsed.data.sentenceId);
        const updatedRecord = progressRecordSchema.parse({
          sentenceId: parsed.data.sentenceId,
          completionCount: (existing?.completionCount ?? 0) + 1,
          lastCompletedAt: parsed.data.completedAt,
        });
        const records = [
          ...current.records.filter((record) => record.sentenceId !== parsed.data.sentenceId),
          updatedRecord,
        ].sort((left, right) => sentenceOrder.get(left.sentenceId)! - sentenceOrder.get(right.sentenceId)!);
        let markedSentenceIds = [...current.markedSentenceIds];
        if (
          updatedRecord.completionCount >= catalog.learningRules.masteryCompletionCount &&
          markedSentenceIds.includes(updatedRecord.sentenceId)
        ) {
          markedSentenceIds = markedSentenceIds.filter((id) => id !== updatedRecord.sentenceId);
          const nextCounts = new Map(records.map((record) => [record.sentenceId, record.completionCount]));
          const addedSentenceId = lowestCountSentence(sentenceIds, nextCounts, new Set(markedSentenceIds));
          if (addedSentenceId) markedSentenceIds.push(addedSentenceId);
          poolChange = { removedSentenceId: updatedRecord.sentenceId, addedSentenceId: addedSentenceId ?? null };
        }
        const now = new Date().toISOString();
        return {
          ...current,
          updatedAt: now,
          markedSentenceIds,
          regularCompletionsSinceReview: parsed.data.mode === "review"
            ? 0
            : Math.min(5, current.regularCompletionsSinceReview + 1),
          totalCompletions: current.totalCompletions + 1,
          appliedCompletionIds: [...current.appliedCompletionIds, parsed.data.eventId].slice(-20_000),
          records,
        };
      });
      return reply.code(alreadyRecorded ? 200 : 201).send({
        alreadyRecorded,
        poolChange,
        progress: publicProgress(progress, catalog.learningRules.masteryCompletionCount),
      });
    } catch {
      return progressError(reply, "ECHO_COMPLETION_WRITE_FAILED", "这句已经听完，但练习次数暂时无法保存，请稍后再试。");
    }
  });

  app.put("/api/english/echo-island/marks", async (request, reply) => {
    const parsed = markSchema.safeParse(request.body);
    if (!parsed.success || !sentenceIdSet.has(parsed.data.sentenceId)) {
      return reply.code(400).send({ code: "INVALID_ECHO_MARK", message: "这条标记无法识别，请刷新清单后再试。" });
    }
    try {
      let replacedSentenceId: string | null = null;
      let fallbackSentenceId: string | null = null;
      const progress = await updateProgress((current) => {
        const counts = completionCounts(current);
        let markedSentenceIds = [...current.markedSentenceIds];
        if (parsed.data.marked && !markedSentenceIds.includes(parsed.data.sentenceId)) {
          if (markedSentenceIds.length >= 20) {
            replacedSentenceId = markedSentenceIds
              .filter((id) => id !== parsed.data.sentenceId)
              .sort((left, right) => (counts.get(right) ?? 0) - (counts.get(left) ?? 0))[0] ?? null;
            if (replacedSentenceId) markedSentenceIds = markedSentenceIds.filter((id) => id !== replacedSentenceId);
          }
          markedSentenceIds.push(parsed.data.sentenceId);
        } else if (!parsed.data.marked && markedSentenceIds.includes(parsed.data.sentenceId)) {
          markedSentenceIds = markedSentenceIds.filter((id) => id !== parsed.data.sentenceId);
          if (markedSentenceIds.length === 0) {
            fallbackSentenceId = lowestCountSentence(sentenceIds, counts, new Set([parsed.data.sentenceId])) ?? sentenceIds[0]!;
            markedSentenceIds.push(fallbackSentenceId);
          }
        }
        return { ...current, updatedAt: new Date().toISOString(), markedSentenceIds };
      });
      return {
        replacedSentenceId,
        fallbackSentenceId,
        progress: publicProgress(progress, catalog.learningRules.masteryCompletionCount),
      };
    } catch {
      return progressError(reply, "ECHO_MARK_WRITE_FAILED", "标记暂时无法保存，请让家长检查本机数据目录。");
    }
  });

  app.post("/api/english/echo-island/progress/clear", async (_request, reply) => {
    try {
      const progress = await updateProgress((current) => ({
        ...current,
        updatedAt: new Date().toISOString(),
        regularCompletionsSinceReview: 0,
        totalCompletions: 0,
        appliedCompletionIds: [],
        records: [],
      }));
      return { progress: publicProgress(progress, catalog.learningRules.masteryCompletionCount) };
    } catch {
      return progressError(reply, "ECHO_CLEAR_FAILED", "练习次数暂时无法清空，请让家长检查本机数据目录。");
    }
  });

  app.get("/api/english/echo-island/audio/:language/:sourceFile", async (request, reply) => {
    const parsed = audioParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(404).send({ code: "ECHO_AUDIO_NOT_FOUND", message: "没有找到这段录音。" });
    const entry = archiveEntries.get(`${parsed.data.language}/${parsed.data.sourceFile}`);
    if (!entry) return reply.code(404).send({ code: "ECHO_AUDIO_NOT_FOUND", message: "没有找到这段录音。" });
    const range = parseRange(request.headers.range, entry.size);
    if (!range) {
      return reply.header("Content-Range", `bytes */${entry.size}`).code(416).send();
    }
    try {
      const bytes = await readEntry(audioArchivePath, entry, range.start, range.end);
      reply.header("Accept-Ranges", "bytes");
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      reply.header("Content-Type", "audio/mpeg");
      if (range.partial) {
        reply.header("Content-Range", `bytes ${range.start}-${range.end}/${entry.size}`);
        return reply.code(206).send(bytes);
      }
      return reply.send(bytes);
    } catch {
      return progressError(reply, "ECHO_AUDIO_READ_FAILED", "这段录音暂时无法读取，请稍后再试。");
    }
  });
}

export type EnglishEchoProgress = Progress;
export type EnglishEchoCompletion = Completion;
