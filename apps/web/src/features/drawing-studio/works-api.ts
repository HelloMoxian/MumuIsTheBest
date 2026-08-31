import { parseDrawingDocument, type DrawingDocument } from "./logic";

export type DrawingWorkSummary = {
  id: string;
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  elementCount: number;
  thumbnailDataUrl: string | null;
};

export type DrawingWorkRecord = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  thumbnailDataUrl: string | null;
  document: DrawingDocument;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseThumbnail(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 400_000 || !/^data:image\/(?:jpeg|png);base64,/i.test(value)) {
    throw new Error("作品缩略图无法识别。");
  }
  return value;
}

function parseSummary(value: unknown): DrawingWorkSummary {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || typeof value.title !== "string"
    || typeof value.author !== "string"
    || !isDateTime(value.createdAt)
    || !isDateTime(value.updatedAt)
    || typeof value.elementCount !== "number"
    || !Number.isInteger(value.elementCount)
    || value.elementCount < 0
    || value.elementCount > 1_000
  ) throw new Error("作品清单的数据不完整。");
  return {
    id: value.id,
    title: value.title,
    author: value.author,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    elementCount: value.elementCount,
    thumbnailDataUrl: parseThumbnail(value.thumbnailDataUrl),
  };
}

async function readResponse(response: Response): Promise<unknown> {
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.message === "string"
      ? payload.message
      : "作品服务暂时没有响应。";
    throw new Error(message);
  }
  return payload;
}

export async function listDrawingWorks(): Promise<DrawingWorkSummary[]> {
  const payload = await readResponse(await fetch("/api/drawing-studio/works"));
  if (!isRecord(payload) || !Array.isArray(payload.works)) throw new Error("作品清单的数据不完整。");
  return payload.works.map(parseSummary);
}

export async function loadDrawingWork(workId: string): Promise<DrawingWorkRecord> {
  const payload = await readResponse(await fetch(`/api/drawing-studio/works/${encodeURIComponent(workId)}`));
  if (!isRecord(payload) || !isRecord(payload.work)) throw new Error("这幅作品的数据不完整。");
  const work = payload.work;
  if (
    work.schemaVersion !== 1
    || typeof work.id !== "string"
    || !isDateTime(work.createdAt)
    || !isDateTime(work.updatedAt)
  ) throw new Error("这幅作品的数据不完整。");
  return {
    schemaVersion: 1,
    id: work.id,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    thumbnailDataUrl: parseThumbnail(work.thumbnailDataUrl),
    document: parseDrawingDocument(work.document),
  };
}

export async function saveDrawingWork(
  document: DrawingDocument,
  thumbnailDataUrl: string | null,
): Promise<DrawingWorkSummary> {
  const payload = await readResponse(await fetch(`/api/drawing-studio/works/${encodeURIComponent(document.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document, thumbnailDataUrl }),
  }));
  if (!isRecord(payload)) throw new Error("作品保存结果无法识别。");
  return parseSummary(payload.summary);
}
