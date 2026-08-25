import assert from "node:assert/strict";
import test from "node:test";
import {
  loadPersistentData,
  queuePersistentDataWrite,
} from "./persistent-data";

function parseLabel(value: unknown) {
  if (typeof value !== "object" || value === null || !("label" in value)) return undefined;
  return typeof value.label === "string" ? { label: value.label } : undefined;
}

test("空服务端记录会把旧浏览器记录一次性迁入文件存储", async () => {
  const requests: Array<{ method: string; body?: unknown }> = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const method = init?.method ?? "GET";
    requests.push({
      method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    if (method === "GET") {
      return Response.json({ state: null });
    }
    return Response.json({
      state: {
        schemaVersion: 1,
        id: "ee8bab8d-3123-4a3d-a536-0f6627457755",
        stableId: "test-state",
        createdAt: "2026-08-24T01:00:00.000Z",
        updatedAt: "2026-08-24T01:00:00.000Z",
        payload: { label: "旧浏览器进度" },
      },
    });
  };

  const restored = await loadPersistentData({
    stableId: "test-state",
    parsePayload: parseLabel,
    legacyCandidates: [() => ({ payload: { label: "旧浏览器进度" } })],
  }, fetcher);

  assert.deepEqual(restored?.payload, { label: "旧浏览器进度" });
  assert.deepEqual(requests, [
    { method: "GET", body: undefined },
    { method: "PUT", body: { payload: { label: "旧浏览器进度" } } },
  ]);
});

test("服务端已有记录时优先使用服务端且不读取旧缓存", async () => {
  let legacyRead = false;
  const fetcher: typeof fetch = async () => Response.json({
    state: {
      schemaVersion: 1,
      id: "e0583fd3-a26c-4641-bcd5-e4f5561d5d3e",
      stableId: "test-existing",
      createdAt: "2026-08-24T01:00:00.000Z",
      updatedAt: "2026-08-24T02:00:00.000Z",
      payload: { label: "服务端进度" },
    },
  });
  const restored = await loadPersistentData({
    stableId: "test-existing",
    parsePayload: parseLabel,
    legacyCandidates: [() => {
      legacyRead = true;
      return { payload: { label: "旧进度" } };
    }],
  }, fetcher);
  assert.equal(legacyRead, false);
  assert.equal(restored?.payload.label, "服务端进度");
});

test("同一记录的连续写入会严格串行", async () => {
  const savedLabels: string[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as { payload: { label: string } };
    await new Promise((resolve) => setTimeout(resolve, payload.payload.label === "first" ? 20 : 0));
    savedLabels.push(payload.payload.label);
    return Response.json({
      state: {
        schemaVersion: 1,
        id: "426cda26-77a7-4fdf-8579-95f5a787f6ad",
        stableId: "test-queue",
        createdAt: "2026-08-24T01:00:00.000Z",
        updatedAt: "2026-08-24T02:00:00.000Z",
        payload: payload.payload,
      },
    });
  };
  await Promise.all([
    queuePersistentDataWrite("test-queue", { label: "first" }, parseLabel, fetcher),
    queuePersistentDataWrite("test-queue", { label: "second" }, parseLabel, fetcher),
  ]);
  assert.deepEqual(savedLabels, ["first", "second"]);
});
