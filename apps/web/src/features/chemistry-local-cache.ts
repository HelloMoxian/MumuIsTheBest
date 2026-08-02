export const CHEMISTRY_LOCAL_CACHE_SCHEMA_VERSION = 1;

export type LocalStorageLike = Pick<Storage, "getItem" | "setItem">;

export type ChemistryCacheMetadata = {
  createdAt: string;
  updatedAt: string;
};

export type ChemistryLocalCacheSpec<T> = {
  key: string;
  stableId: string;
  parsePayload: (value: unknown) => T | undefined;
  migrateLegacy?: (value: unknown) => T | undefined;
};

type ChemistryLocalCacheRecord<T> = ChemistryCacheMetadata & {
  schemaVersion: typeof CHEMISTRY_LOCAL_CACHE_SCHEMA_VERSION;
  stableId: string;
  payload: T;
};

export type ChemistryLocalCacheRead<T> = {
  payload: T;
  metadata: ChemistryCacheMetadata;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function currentTimestamp() {
  return new Date().toISOString();
}

export function getBrowserLocalStorage(): LocalStorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readChemistryLocalCache<T>(
  spec: ChemistryLocalCacheSpec<T>,
  storage: LocalStorageLike | undefined = getBrowserLocalStorage(),
  now: () => string = currentTimestamp,
): ChemistryLocalCacheRead<T> | undefined {
  if (!storage) return undefined;
  let raw: string | null;
  try {
    raw = storage.getItem(spec.key);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  if (
    value.schemaVersion === CHEMISTRY_LOCAL_CACHE_SCHEMA_VERSION
    && value.stableId === spec.stableId
    && isTimestamp(value.createdAt)
    && isTimestamp(value.updatedAt)
  ) {
    const payload = spec.parsePayload(value.payload);
    return payload
      ? {
        payload,
        metadata: { createdAt: value.createdAt, updatedAt: value.updatedAt },
      }
      : undefined;
  }

  if (value.schemaVersion === 0 && value.stableId === spec.stableId && spec.migrateLegacy) {
    const payload = spec.migrateLegacy(value);
    if (!payload) return undefined;
    const timestamp = now();
    return {
      payload,
      metadata: { createdAt: timestamp, updatedAt: timestamp },
    };
  }
  return undefined;
}

export function writeChemistryLocalCache<T>(
  spec: ChemistryLocalCacheSpec<T>,
  payload: T,
  previous: ChemistryCacheMetadata | undefined,
  storage: LocalStorageLike | undefined = getBrowserLocalStorage(),
  now: () => string = currentTimestamp,
): ChemistryCacheMetadata | undefined {
  if (!storage) return undefined;
  const updatedAt = now();
  const metadata = {
    createdAt: previous?.createdAt ?? updatedAt,
    updatedAt,
  } satisfies ChemistryCacheMetadata;
  const record: ChemistryLocalCacheRecord<T> = {
    schemaVersion: CHEMISTRY_LOCAL_CACHE_SCHEMA_VERSION,
    stableId: spec.stableId,
    ...metadata,
    payload,
  };
  try {
    storage.setItem(spec.key, JSON.stringify(record));
    return metadata;
  } catch {
    return undefined;
  }
}
