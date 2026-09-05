import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { emptyHistory, historySchema, registerGemConnectHistoryApi, migrateHistory } from "./gem-connect-history.js";

import { registerFruitSliceHistoryApi } from "./fruit-slice-history.js";
import { registerWorldTowerApi } from "./world-tower.js";

const payload = () => ({ rulesVersion: 2 as const, id: randomUUID(), level: 1, durationMs: 12345, hints: 1, shuffles: 2, pairCount: 30 });
async function setup(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "mumu-gem-test-"));
  const app = Fastify();
  const energy = registerFruitSliceHistoryApi(app, dir);
  const knowledge = registerWorldTowerApi(app, dir, resolve(import.meta.dirname, "../../.."));
  registerGemConnectHistoryApi(app, dir, { energy: energy.awardGemConnect, knowledge: knowledge.awardGemConnect });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  return { app, dir, path: join(dir, "learning/games/gem-connect-history.json") };
}
test("空记录、保存、重复重试、并发写入、重启恢复及权限", async t => {
  const { app, dir, path } = await setup(t);
  const empty = await app.inject({ url: "/api/games/gem-connect/history" });
  assert.deepEqual(empty.json().records, []);
  const first = payload();
  const post = (data: ReturnType<typeof payload>) => app.inject({ method: "POST", url: "/api/games/gem-connect/history", payload: data });
  assert.equal((await post(first)).statusCode, 200);
  assert.equal((await post(first)).json().records.length, 1);
  assert.equal((await post({ ...first, durationMs: 42 })).statusCode, 409);
  const writes = await Promise.all(Array.from({ length: 10 }, () => post(payload())));
  assert.ok(writes.every(response => response.statusCode === 200));
  const stored = historySchema.parse(JSON.parse(await readFile(path, "utf8")));
  assert.equal(stored.records.length, 11);
  if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o777, 0o600);
  const secondApp = Fastify(); registerGemConnectHistoryApi(secondApp, dir, { energy: registerFruitSliceHistoryApi(secondApp, dir).awardGemConnect, knowledge: registerWorldTowerApi(secondApp, dir, resolve(import.meta.dirname, "../../..")).awardGemConnect });
  t.after(() => secondApp.close());
  assert.equal((await secondApp.inject({ url: "/api/games/gem-connect/history" })).json().records.length, 11);
});
test("拒绝非法输入、损坏文件和未来版本，不能覆盖原记录", async t => {
  const { app, path } = await setup(t);
  for (const invalid of [{ ...payload(), level: 11 }, { ...payload(), durationMs: -1 }, { ...payload(), pairCount: 7 }, { ...payload(), extra: true }]) {
    assert.equal((await app.inject({ method: "POST", url: "/api/games/gem-connect/history", payload: invalid })).statusCode, 400);
  }
  await mkdir(join(path, ".."), { recursive: true });
  for (const contents of ["{ broken", JSON.stringify({ ...emptyHistory(), schemaVersion: 3 })]) {
    await writeFile(path, contents);
    assert.equal((await app.inject({ url: "/api/games/gem-connect/history" })).statusCode, 503);
    assert.equal((await app.inject({ method: "POST", url: "/api/games/gem-connect/history", payload: payload() })).statusCode, 503);
    assert.equal(await readFile(path, "utf8"), contents);
  }
});
test("写入失败后队列可恢复，不返回虚假的已保存状态", async t => {
  const { app, dir } = await setup(t);
  await writeFile(join(dir, "learning"), "blocked");
  const request = { method: "POST" as const, url: "/api/games/gem-connect/history", payload: payload() };
  assert.equal((await app.inject(request)).statusCode, 503);
  await rm(join(dir, "learning"));
  const retry = await app.inject(request);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.json().records.length, 1);
});

test("新版十关各发10至100双币，原有钱包余额准确且重试不重复", async t => {
  const { app, dir } = await setup(t);
  const pairs = [30,36,42,48,54,60,70,77,84,90];
  for (let level = 1; level <= 10; level++) {
    const data = { ...payload(), level, pairCount: pairs[level - 1] };
    const request = { method: "POST" as const, url: "/api/games/gem-connect/history", payload: data };
    const first = await app.inject(request);
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().settlement.amount, level * 10);
    assert.equal((await app.inject(request)).statusCode, 200);
  }
  const energy = JSON.parse(await readFile(join(dir, "learning/games/fruit-slice-history.json"), "utf8"));
  const knowledge = JSON.parse(await readFile(join(dir, "learning/world-tower/progress.json"), "utf8"));
  assert.equal(energy.energyCoinBalance, 550);
  assert.equal(knowledge.coinBalance, 550);
  assert.equal(Object.keys(energy.gemConnectRewards).length, 10);
  assert.equal(Object.keys(knowledge.gemConnectRewards).length, 10);
});
test("一方钱包失败后重启可补发另一方，不重复入账", async t => {
  const dir = await mkdtemp(join(tmpdir(), "mumu-gem-partial-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const app = Fastify();
  const knowledge = registerWorldTowerApi(app, dir, resolve(import.meta.dirname, "../../.."));
  const energy = registerFruitSliceHistoryApi(app, dir);
  let fail = true;
  registerGemConnectHistoryApi(app, dir, { knowledge: knowledge.awardGemConnect, energy: async (...args) => {
    if (fail) throw new Error("simulated unavailable wallet");
    return energy.awardGemConnect(...args);
  } });
  const data = payload();
  assert.equal((await app.inject({ method: "POST", url: "/api/games/gem-connect/history", payload: data })).statusCode, 503);
  const historyPath = join(dir, "learning/games/gem-connect-history.json");
  assert.equal(JSON.parse(await readFile(historyPath, "utf8")).records[0].rewardStatus, "pending");
  assert.equal(JSON.parse(await readFile(join(dir, "learning/world-tower/progress.json"), "utf8")).coinBalance, 10);
  await app.close(); fail = false;
  const restarted = Fastify();
  registerGemConnectHistoryApi(restarted, dir, {
    knowledge: registerWorldTowerApi(restarted, dir, resolve(import.meta.dirname, "../../..")).awardGemConnect,
    energy: registerFruitSliceHistoryApi(restarted, dir).awardGemConnect,
  });
  t.after(() => restarted.close());
  const restored = await restarted.inject({ url: "/api/games/gem-connect/history" });
  assert.equal(restored.json().records[0].rewardStatus, "granted");
  assert.equal(JSON.parse(await readFile(join(dir, "learning/world-tower/progress.json"), "utf8")).coinBalance, 10);
  assert.equal(JSON.parse(await readFile(join(dir, "learning/games/fruit-slice-history.json"), "utf8")).energyCoinBalance, 10);
});
test("版本1迁移保留成绩及原文件恢复点，不给旧小棋盘补币", async t => {
  const { app, path, dir } = await setup(t);
  const now = "2026-01-01T00:00:00.000Z";
  const { rulesVersion: _version, ...oldRecord } = payload();
  const legacy = { schemaVersion: 1, stableId: "gem-connect-history", createdAt: now, updatedAt: now,
    records: [{ ...oldRecord, pairCount: 6, createdAt: now, updatedAt: now }] };
  await mkdir(join(path, ".."), { recursive: true });
  const bytes = JSON.stringify(legacy);
  await writeFile(path, bytes);
  assert.equal(migrateHistory(legacy).records[0].rulesVersion, 1);
  const read = await app.inject({ url: "/api/games/gem-connect/history" });
  assert.equal(read.json().records[0].rewardStatus, "legacy");
  assert.equal(await readFile(path, "utf8"), bytes);
  await app.inject({ method: "POST", url: "/api/games/gem-connect/history", payload: payload() });
  assert.equal(await readFile(path + ".v1.bak", "utf8"), bytes);
  if (process.platform !== "win32") assert.equal((await stat(path + ".v1.bak")).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(path, "utf8")).records.length, 2);
  assert.equal(JSON.parse(await readFile(join(dir, "learning/world-tower/progress.json"), "utf8")).coinBalance, 10);
});
