import type {
  NodePage,
  WorldTowerLevelMap,
  WorldTowerLoadStrategy,
  WorldTowerMap,
  WorldTowerManifest,
  WorldTowerNodeDetail,
  WorldTowerProgress,
} from "./types";

type ProgressMutationResponse = {
  alreadyUnlocked: boolean;
  progress: WorldTowerProgress;
};

export type WorldTowerProgressAction = "unlock-all" | "clear-all" | "add-1000-coins";

type ProgressManagementResponse = {
  action: WorldTowerProgressAction;
  affectedNodes: number;
  coinDelta: number;
  progress: WorldTowerProgress;
};

export class WorldTowerApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = await response.json().catch(() => null) as
    | { code?: string; message?: string }
    | null;
  if (!response.ok) {
    throw new WorldTowerApiError(
      body?.message ?? "探索舱暂时没有回应，请稍后再试。",
      body?.code ?? "WORLD_TOWER_REQUEST_FAILED",
      response.status,
    );
  }
  return body as T;
}

export function loadWorldTowerManifest(signal?: AbortSignal) {
  return requestJson<WorldTowerManifest>("/api/world-tower/manifest", { signal });
}

export function loadWorldTowerMap(signal?: AbortSignal) {
  return requestJson<WorldTowerMap>("/api/world-tower/map", { signal });
}

export function loadWorldTowerLevelMap(
  levelId: string,
  visibility: WorldTowerLoadStrategy,
  signal?: AbortSignal,
) {
  const search = new URLSearchParams({ levelId, visibility });
  return requestJson<WorldTowerLevelMap>(
    "/api/world-tower/level-map?" + search.toString(),
    { signal },
  );
}

export function loadWorldTowerNodes(
  levelId: string,
  clusterId: string | null,
  offset: number,
  limit: number,
  signal?: AbortSignal,
) {
  const search = new URLSearchParams({
    levelId,
    offset: String(offset),
    limit: String(limit),
  });
  if (clusterId) search.set("clusterId", clusterId);
  return requestJson<NodePage>(`/api/world-tower/nodes?${search}`, { signal });
}

export function loadWorldTowerNode(nodeId: string, signal?: AbortSignal) {
  return requestJson<WorldTowerNodeDetail>(
    `/api/world-tower/nodes/${encodeURIComponent(nodeId)}`,
    { signal },
  );
}

export function unlockWorldTowerNode(targetId: string) {
  return requestJson<ProgressMutationResponse>("/api/world-tower/unlock-node", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetId }),
  });
}

export function purchaseWorldTowerResource(targetId: string) {
  return requestJson<ProgressMutationResponse>("/api/world-tower/purchase-resource", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetId }),
  });
}

export function manageWorldTowerProgress(action: WorldTowerProgressAction) {
  return requestJson<ProgressManagementResponse>("/api/world-tower/manage-progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}
