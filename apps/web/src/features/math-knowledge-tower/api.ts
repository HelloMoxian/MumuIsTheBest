import type {
  KnowledgeTowerProgress,
  KnowledgeTowerResponse,
  LightMutationResponse,
  MasteryId,
} from "./types";

export class KnowledgeTowerApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProgress(value: unknown): value is KnowledgeTowerProgress {
  return isRecord(value)
    && value.schemaVersion === 1
    && typeof value.id === "string"
    && Array.isArray(value.litLightIds)
    && value.litLightIds.every((id) => typeof id === "string")
    && typeof value.litCount === "number"
    && typeof value.score === "number"
    && value.totalLights === 2_068
    && value.maxScore === 2_068
    && typeof value.progressPercent === "number"
    && isRecord(value.equivalentAge)
    && typeof value.equivalentAge.label === "string";
}

function isTowerResponse(value: unknown): value is KnowledgeTowerResponse {
  if (!isRecord(value) || !isRecord(value.catalog) || !isProgress(value.progress)) return false;
  const catalog = value.catalog;
  if (
    catalog.schemaVersion !== 1
    || catalog.title !== "数学知识塔"
    || catalog.knowledgePointCount !== 517
    || catalog.totalLights !== 2_068
    || !Array.isArray(catalog.masteryLevels)
    || catalog.masteryLevels.length !== 4
    || !Array.isArray(catalog.grades)
    || catalog.grades.length !== 9
  ) return false;
  const points = catalog.grades.flatMap((grade) => {
    if (!isRecord(grade) || !Array.isArray(grade.semesters)) return [];
    return grade.semesters.flatMap((semester) => (
      isRecord(semester) && Array.isArray(semester.points) ? semester.points : []
    ));
  });
  return points.length === 517
    && new Set(points.map((point) => (isRecord(point) ? point.id : undefined))).size === 517;
}

async function requestJson(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = isRecord(body) ? body : null;
    throw new KnowledgeTowerApiError(
      typeof errorBody?.message === "string"
        ? errorBody.message
        : "数学知识塔暂时没有回应，请稍后再试。",
      typeof errorBody?.code === "string" ? errorBody.code : "KNOWLEDGE_TOWER_REQUEST_FAILED",
      response.status,
    );
  }
  return body;
}

export async function loadKnowledgeTower(signal?: AbortSignal) {
  const body = await requestJson("/api/math/knowledge-tower", { signal });
  if (!isTowerResponse(body)) {
    throw new KnowledgeTowerApiError(
      "数学知识塔返回了无法识别的数据，请刷新页面后再试。",
      "INVALID_KNOWLEDGE_TOWER_RESPONSE",
      500,
    );
  }
  return body;
}

export async function toggleKnowledgeMastery(topicId: string, masteryId: MasteryId) {
  const body = await requestJson("/api/math/knowledge-tower/lights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topicId, masteryId }),
  });
  if (!isRecord(body) || typeof body.isLit !== "boolean" || !isProgress(body.progress)) {
    throw new KnowledgeTowerApiError(
      "这盏灯已经送出，但返回状态无法识别，请刷新页面确认。",
      "INVALID_KNOWLEDGE_LIGHT_RESPONSE",
      500,
    );
  }
  return body as LightMutationResponse;
}
