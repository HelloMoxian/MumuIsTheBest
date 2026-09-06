import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { drawingStudioPayloadSchema } from "./persistent-user-data.js";

const MAX_DRAWING_WORKS = 120;
const workIdSchema = z.string().uuid();
const thumbnailSchema = z.string()
  .max(400_000)
  .regex(/^data:image\/(?:jpeg|png);base64,[a-z0-9+/=]+$/i)
  .nullable();

const drawingWorkInputSchema = z.object({
  document: drawingStudioPayloadSchema.refine(
    (document) => document.schemaVersion === 3,
    "作品需要先升级到当前版本。",
  ),
  thumbnailDataUrl: thumbnailSchema.default(null),
});

const drawingWorkFileSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  locked: z.boolean().optional(),
  id: workIdSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  thumbnailDataUrl: thumbnailSchema,
  document: drawingStudioPayloadSchema,
}).superRefine((work, context) => {
  if (work.schemaVersion === 2 && work.locked === undefined) {
    context.addIssue({ code: "custom", message: "作品锁定状态缺失。" });
  }
  if (work.document.id !== work.id) {
    context.addIssue({ code: "custom", message: "作品文件 ID 与画布 ID 不一致。" });
  }
}).transform((work) => ({ ...work, locked: work.locked ?? false, schemaVersion: 2 as const }));

type DrawingWorkFile = z.infer<typeof drawingWorkFileSchema>;

function summarizeWork(work: DrawingWorkFile) {
  return {
    id: work.id,
    locked: work.locked,
    title: work.document.title,
    author: work.document.author,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    elementCount: work.document.elements.length,
    thumbnailDataUrl: work.thumbnailDataUrl,
  };
}

export function registerDrawingStudioWorksApi(app: FastifyInstance, appDataDir: string) {
  const worksDirectory = resolve(appDataDir, "creative", "drawing-studio-works");
  let writeQueue: Promise<void> = Promise.resolve();

  function workPath(workId: string) {
    return resolve(worksDirectory, `${workId}.json`);
  }

  async function readWork(workId: string): Promise<DrawingWorkFile | undefined> {
    try {
      return drawingWorkFileSchema.parse(JSON.parse(await readFile(workPath(workId), "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async function listWorks(): Promise<DrawingWorkFile[]> {
    let entries;
    try {
      entries = await readdir(worksDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const candidates = entries.filter((entry) => entry.isFile() && /^[0-9a-f-]{36}\.json$/i.test(entry.name));
    const works = await Promise.all(candidates.map(async (entry) => {
      try {
        return drawingWorkFileSchema.parse(JSON.parse(await readFile(resolve(worksDirectory, entry.name), "utf8")));
      } catch {
        return undefined;
      }
    }));
    return works.filter((work): work is DrawingWorkFile => work !== undefined)
      .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt));
  }

  async function writeWork(work: DrawingWorkFile) {
    await mkdir(worksDirectory, { recursive: true, mode: 0o700 });
    const destination = workPath(work.id);
    try {
      const original = JSON.parse(await readFile(destination, "utf8")) as { schemaVersion?: number };
      if (original.schemaVersion === 1) {
        try {
          await copyFile(destination, `${destination}.v1.bak`, constants.COPYFILE_EXCL);
          await chmod(`${destination}.v1.bak`, 0o600);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(work, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, destination);
    await chmod(destination, 0o600);
  }

  app.get("/api/drawing-studio/works", async (_request, reply) => {
    try {
      return { works: (await listWorks()).map(summarizeWork) };
    } catch {
      return reply.code(500).send({
        code: "DRAWING_WORKS_READ_FAILED",
        message: "作品清单暂时打不开，请让家长检查本机数据目录。",
      });
    }
  });

  app.get("/api/drawing-studio/works/:workId", async (request, reply) => {
    const params = z.object({ workId: workIdSchema }).safeParse(request.params);
    if (!params.success) {
      return reply.code(404).send({ code: "DRAWING_WORK_NOT_FOUND", message: "没有找到这幅作品。" });
    }
    try {
      const work = await readWork(params.data.workId);
      if (!work) return reply.code(404).send({ code: "DRAWING_WORK_NOT_FOUND", message: "没有找到这幅作品。" });
      return { work };
    } catch {
      return reply.code(500).send({
        code: "DRAWING_WORK_READ_FAILED",
        message: "这幅作品暂时打不开，请让家长检查作品文件。",
      });
    }
  });

  app.put("/api/drawing-studio/works/:workId", { bodyLimit: 16 * 1024 * 1024 }, async (request, reply) => {
    const params = z.object({ workId: workIdSchema }).safeParse(request.params);
    const input = drawingWorkInputSchema.safeParse(request.body);
    if (!params.success || !input.success || input.data.document.id !== params.data.workId) {
      return reply.code(400).send({
        code: "INVALID_DRAWING_WORK",
        message: "这次作品数据不完整，因此没有保存。",
      });
    }

    let saved: DrawingWorkFile | undefined;
    let operationError: unknown;
    const operation = writeQueue.then(async () => {
      const current = await readWork(params.data.workId);
      if (current?.locked) throw new Error("DRAWING_WORK_LOCKED");
      if (!current && (await listWorks()).length >= MAX_DRAWING_WORKS) {
        throw new Error("DRAWING_WORK_LIMIT");
      }
      const now = new Date().toISOString();
      saved = drawingWorkFileSchema.parse({
        schemaVersion: 2,
        locked: false,
        id: params.data.workId,
        createdAt: current?.createdAt ?? input.data.document.createdAt,
        updatedAt: now,
        thumbnailDataUrl: input.data.thumbnailDataUrl,
        document: { ...input.data.document, updatedAt: now },
      });
      await writeWork(saved);
    }).catch((error) => {
      operationError = error;
    });
    writeQueue = operation;
    await operation;

    if (operationError instanceof Error && operationError.message === "DRAWING_WORK_LOCKED") {
      return reply.code(409).send({ code: "DRAWING_WORK_LOCKED", message: "此画布已经保存锁定，请创建副本编辑。" });
    }
    if (operationError instanceof Error && operationError.message === "DRAWING_WORK_LIMIT") {
      return reply.code(409).send({
        code: "DRAWING_WORK_LIMIT",
        message: `作品清单最多保存 ${MAX_DRAWING_WORKS} 幅作品。`,
      });
    }
    if (operationError || !saved) {
      return reply.code(500).send({
        code: "DRAWING_WORK_WRITE_FAILED",
        message: "作品暂时无法保存，请让家长检查本机数据目录。",
      });
    }
    return { work: saved, summary: summarizeWork(saved) };
  });

  const metadataSchema = z.object({
    title: z.string().trim().min(1).max(80).optional(),
    locked: z.boolean().optional(),
  }).strict().refine((value) => value.title !== undefined || value.locked !== undefined);

  async function manageWork(workId: string, operation: (work: DrawingWorkFile) => Promise<void>) {
    const pending = writeQueue.then(async () => {
      const work = await readWork(workId);
      if (!work) throw new Error("DRAWING_WORK_NOT_FOUND");
      await operation(work);
    });
    writeQueue = pending.catch(() => undefined);
    await pending;
  }

  function managementError(error: unknown, reply: import("fastify").FastifyReply) {
    if (error instanceof Error && error.message === "DRAWING_WORK_LOCKED") {
      return reply.code(409).send({ code: error.message, message: "此画布已经保存锁定，请创建副本编辑。" });
    }
    if (error instanceof Error && error.message === "DRAWING_WORK_NOT_FOUND") {
      return reply.code(404).send({ code: error.message, message: "没有找到这幅作品。" });
    }
    return reply.code(500).send({ code: "DRAWING_WORK_WRITE_FAILED", message: "作品暂时无法更新，请稍后再试。" });
  }

  app.patch("/api/drawing-studio/works/:workId", async (request, reply) => {
    const params = z.object({ workId: workIdSchema }).safeParse(request.params);
    const input = metadataSchema.safeParse(request.body);
    if (!params.success || !input.success) {
      return reply.code(400).send({ code: "INVALID_DRAWING_WORK", message: "请填写 1—80 字的作品名称。" });
    }
    let updated: DrawingWorkFile | undefined;
    try {
      await manageWork(params.data.workId, async (work) => {
        const now = new Date().toISOString();
        updated = drawingWorkFileSchema.parse({
          ...work, ...input.data, updatedAt: now,
          document: { ...work.document, title: input.data.title ?? work.document.title, updatedAt: now },
        });
        await writeWork(updated);
      });
      return { summary: summarizeWork(updated!) };
    } catch (error) {
      return managementError(error, reply);
    }
  });

  app.delete("/api/drawing-studio/works/:workId", async (request, reply) => {
    const params = z.object({ workId: workIdSchema }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ message: "没有找到这幅作品。" });
    try {
      await manageWork(params.data.workId, async (work) => {
        if (work.locked) throw new Error("DRAWING_WORK_LOCKED");
        const trash = resolve(worksDirectory, "trash");
        await mkdir(trash, { recursive: true, mode: 0o700 });
        await rename(workPath(work.id), resolve(trash, `${work.id}-${randomUUID()}.json`));
      });
      return { deleted: true };
    } catch (error) {
      return managementError(error, reply);
    }
  });
}
