import assert from "node:assert/strict";
import test from "node:test";
import {
  CHEMISTRY_LOCAL_CACHE_SCHEMA_VERSION,
  readChemistryLocalCache,
  writeChemistryLocalCache,
  type LocalStorageLike,
} from "../chemistry-local-cache";

class MemoryStorage implements LocalStorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const spec = {
  key: "mumu.test.chemistry-cache",
  stableId: "chemistry-test-cache",
  parsePayload(value: unknown) {
    if (!isRecord(value)) return undefined;
    return typeof value.label === "string" ? { label: value.label } : undefined;
  },
  migrateLegacy(value: unknown) {
    if (!isRecord(value)) return undefined;
    return typeof value.legacyLabel === "string" ? { label: value.legacyLabel } : undefined;
  },
};

test("化学本地缓存会保留稳定标识、版本和创建时间", () => {
  const storage = new MemoryStorage();
  const firstTime = "2026-08-02T01:02:03.000Z";
  const secondTime = "2026-08-02T01:04:05.000Z";
  const firstMetadata = writeChemistryLocalCache(
    spec,
    { label: "第一次探索" },
    undefined,
    storage,
    () => firstTime,
  );
  const secondMetadata = writeChemistryLocalCache(
    spec,
    { label: "继续探索" },
    firstMetadata,
    storage,
    () => secondTime,
  );

  assert.deepEqual(secondMetadata, { createdAt: firstTime, updatedAt: secondTime });
  const stored = JSON.parse(storage.getItem(spec.key)!);
  assert.equal(stored.schemaVersion, CHEMISTRY_LOCAL_CACHE_SCHEMA_VERSION);
  assert.equal(stored.stableId, spec.stableId);
  assert.equal(stored.payload.label, "继续探索");
  assert.deepEqual(readChemistryLocalCache(spec, storage), {
    payload: { label: "继续探索" },
    metadata: { createdAt: firstTime, updatedAt: secondTime },
  });
});

test("化学本地缓存会拒绝损坏或不符合结构的数据", () => {
  const storage = new MemoryStorage();
  storage.setItem(spec.key, "not-json");
  assert.equal(readChemistryLocalCache(spec, storage), undefined);

  storage.setItem(spec.key, JSON.stringify({
    schemaVersion: CHEMISTRY_LOCAL_CACHE_SCHEMA_VERSION,
    stableId: spec.stableId,
    createdAt: "2026-08-02T01:02:03.000Z",
    updatedAt: "2026-08-02T01:04:05.000Z",
    payload: { noLabel: true },
  }));
  assert.equal(readChemistryLocalCache(spec, storage), undefined);
});

test("化学本地缓存可迁移版本零的安全旧记录", () => {
  const storage = new MemoryStorage();
  storage.setItem(spec.key, JSON.stringify({
    schemaVersion: 0,
    stableId: spec.stableId,
    legacyLabel: "旧版百宝箱",
  }));

  assert.deepEqual(
    readChemistryLocalCache(spec, storage, () => "2026-08-02T02:00:00.000Z"),
    {
      payload: { label: "旧版百宝箱" },
      metadata: {
        createdAt: "2026-08-02T02:00:00.000Z",
        updatedAt: "2026-08-02T02:00:00.000Z",
      },
    },
  );
});

test("浏览器拒绝写入时保留玩法本身且不抛出异常", () => {
  const storage: LocalStorageLike = {
    getItem: () => null,
    setItem: () => {
      throw new Error("storage unavailable");
    },
  };
  assert.equal(writeChemistryLocalCache(spec, { label: "不会中断" }, undefined, storage), undefined);
});
