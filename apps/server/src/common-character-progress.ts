import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const poolSizeSchema = z.union([
  z.literal(500),
  z.literal(1_000),
  z.literal(1_500),
  z.literal(2_000),
  z.literal(2_500),
]);

const attemptInputSchema = z.object({
  character: z.string().regex(/^\p{Script=Han}$/u),
  rank: z.number().int().min(1).max(2_500),
  poolSize: poolSizeSchema,
  known: z.boolean(),
  studiedAt: z.string().datetime(),
}).superRefine((attempt, context) => {
  if (attempt.rank > attempt.poolSize) {
    context.addIssue({
      code: "custom",
      message: "目标字不属于本次所选字池。",
    });
  }
});

const progressRecordSchema = z.object({
  id: z.string().uuid(),
  character: z.string().regex(/^\p{Script=Han}$/u),
  rank: z.number().int().min(1).max(2_500),
  studiedCount: z.number().int().min(1),
  knownCount: z.number().int().min(0),
  notKnownCount: z.number().int().min(0),
  lastStudiedAt: z.string().datetime(),
  lastKnownAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine((record, context) => {
  if (record.knownCount + record.notKnownCount !== record.studiedCount) {
    context.addIssue({
      code: "custom",
      message: "掌握次数与尚未掌握次数必须等于学习总次数。",
    });
  }
  if (record.knownCount === 0 && record.lastKnownAt !== null) {
    context.addIssue({
      code: "custom",
      message: "从未掌握的字不能包含最近掌握时间。",
    });
  }
});

const progressFileSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  records: z.array(progressRecordSchema).max(2_500),
}).superRefine((file, context) => {
  const characters = new Set(file.records.map((record) => record.character));
  const ranks = new Set(file.records.map((record) => record.rank));
  if (
    characters.size !== file.records.length ||
    ranks.size !== file.records.length
  ) {
    context.addIssue({
      code: "custom",
      message: "每个汉字和频率序号只能有一条学习记录。",
    });
  }
});

type AttemptInput = z.infer<typeof attemptInputSchema>;
type ProgressFile = z.infer<typeof progressFileSchema>;
type ProgressRecord = z.infer<typeof progressRecordSchema>;

function emptyProgressFile(now = new Date().toISOString()): ProgressFile {
  return {
    schemaVersion: 1,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    records: [],
  };
}

let writeQueue: Promise<void> = Promise.resolve();

export function registerCommonCharacterProgressApi(
  app: FastifyInstance,
  appDataDir: string,
) {
  const progressPath = resolve(
    appDataDir,
    "learning",
    "chinese",
    "common-characters-progress.json",
  );

  async function readProgress(): Promise<ProgressFile> {
    try {
      return progressFileSchema.parse(
        JSON.parse(await readFile(progressPath, "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyProgressFile(new Date(0).toISOString());
      }
      throw error;
    }
  }

  async function saveProgress(file: ProgressFile) {
    await mkdir(dirname(progressPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${progressPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporaryPath, progressPath);
    await chmod(progressPath, 0o600);
  }

  function appendAttempt(input: AttemptInput) {
    const operation = writeQueue.then(async () => {
      const file = await readProgress();
      const now = new Date().toISOString();
      const existing = file.records.find(
        (record) => record.character === input.character,
      );
      if (existing && existing.rank !== input.rank) {
        throw new Error("CHARACTER_RANK_MISMATCH");
      }

      const record: ProgressRecord = progressRecordSchema.parse(
        existing
          ? {
              ...existing,
              studiedCount: existing.studiedCount + 1,
              knownCount: existing.knownCount + (input.known ? 1 : 0),
              notKnownCount:
                existing.notKnownCount + (input.known ? 0 : 1),
              lastStudiedAt: input.studiedAt,
              lastKnownAt: input.known ? input.studiedAt : existing.lastKnownAt,
              updatedAt: now,
            }
          : {
              id: randomUUID(),
              character: input.character,
              rank: input.rank,
              studiedCount: 1,
              knownCount: input.known ? 1 : 0,
              notKnownCount: input.known ? 0 : 1,
              lastStudiedAt: input.studiedAt,
              lastKnownAt: input.known ? input.studiedAt : null,
              createdAt: now,
              updatedAt: now,
            },
      );

      const records = existing
        ? file.records.map((item) =>
            item.character === input.character ? record : item,
          )
        : [...file.records, record];
      await saveProgress(
        progressFileSchema.parse({
          ...file,
          updatedAt: now,
          records: records.sort((left, right) => left.rank - right.rank),
        }),
      );
      return record;
    });

    writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  app.get("/api/chinese/common-characters/progress", async (_request, reply) => {
    try {
      return await readProgress();
    } catch {
      return reply.code(500).send({
        code: "COMMON_CHARACTER_PROGRESS_READ_FAILED",
        message: "识字进度暂时无法读取，请让家长检查本机数据文件。",
      });
    }
  });

  app.post(
    "/api/chinese/common-characters/progress/attempt",
    async (request, reply) => {
      const parsed = attemptInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "INVALID_COMMON_CHARACTER_ATTEMPT",
          message: "这次识字记录不完整，因此没有写入学习进度。",
        });
      }

      try {
        const record = await appendAttempt(parsed.data);
        return reply.code(201).send({ record });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "CHARACTER_RANK_MISMATCH"
        ) {
          return reply.code(409).send({
            code: "COMMON_CHARACTER_RANK_MISMATCH",
            message: "这个字的频率序号与已有记录不一致，请检查字库版本。",
          });
        }
        return reply.code(500).send({
          code: "COMMON_CHARACTER_PROGRESS_WRITE_FAILED",
          message: "学习记录暂时无法保存，请让家长检查本机数据目录。",
        });
      }
    },
  );
}
