export type PersistentDataMetadata = {
  createdAt: string;
  updatedAt: string;
};

export type PersistentDataRead<T> = {
  payload: T;
  metadata: PersistentDataMetadata;
};

export type LegacyPersistentDataCandidate<T> = () =>
  | PersistentDataRead<T>
  | { payload: T }
  | undefined;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type LoadOptions<T> = {
  stableId: string;
  parsePayload: (value: unknown) => T | undefined;
  legacyCandidates?: readonly LegacyPersistentDataCandidate<T>[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseState<T>(
  stableId: string,
  parsePayload: (value: unknown) => T | undefined,
  value: unknown,
): PersistentDataRead<T> | undefined {
  if (!isRecord(value) || value.stableId !== stableId) return undefined;
  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) return undefined;
  const payload = parsePayload(value.payload);
  return payload
    ? {
        payload,
        metadata: { createdAt: value.createdAt, updatedAt: value.updatedAt },
      }
    : undefined;
}

async function responseBody(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

function responseMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.message === "string" ? value.message : fallback;
}

export async function savePersistentData<T>(
  stableId: string,
  payload: T,
  parsePayload: (value: unknown) => T | undefined,
  fetcher: Fetcher = fetch,
): Promise<PersistentDataRead<T>> {
  const response = await fetcher(`/api/persistent-data/${encodeURIComponent(stableId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  const body = await responseBody(response);
  if (!response.ok) {
    throw new Error(responseMessage(body, "本机记录暂时无法保存。"));
  }
  const state = isRecord(body) ? parseState(stableId, parsePayload, body.state) : undefined;
  if (!state) throw new Error("服务端返回了无法校验的本机记录。");
  return state;
}

export async function loadPersistentData<T>(
  options: LoadOptions<T>,
  fetcher: Fetcher = fetch,
): Promise<PersistentDataRead<T> | undefined> {
  const response = await fetcher(
    `/api/persistent-data/${encodeURIComponent(options.stableId)}`,
  );
  const body = await responseBody(response);
  if (!response.ok) {
    throw new Error(responseMessage(body, "本机记录暂时无法读取。"));
  }
  if (!isRecord(body)) throw new Error("服务端返回了无法校验的本机记录。");
  if (body.state !== null) {
    const state = parseState(options.stableId, options.parsePayload, body.state);
    if (!state) throw new Error("本机记录内容已损坏或版本不兼容。");
    return state;
  }

  for (const readLegacy of options.legacyCandidates ?? []) {
    const legacy = readLegacy();
    if (!legacy) continue;
    return savePersistentData(
      options.stableId,
      legacy.payload,
      options.parsePayload,
      fetcher,
    );
  }
  return undefined;
}

const writeQueues = new Map<string, Promise<void>>();

export function queuePersistentDataWrite<T>(
  stableId: string,
  payload: T,
  parsePayload: (value: unknown) => T | undefined,
  fetcher: Fetcher = fetch,
) {
  const previous = writeQueues.get(stableId) ?? Promise.resolve();
  const operation = previous
    .catch(() => undefined)
    .then(() => savePersistentData(stableId, payload, parsePayload, fetcher));
  writeQueues.set(stableId, operation.then(() => undefined, () => undefined));
  return operation;
}
