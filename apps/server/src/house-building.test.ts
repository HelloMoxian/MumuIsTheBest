import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import Fastify from "fastify";
import {
  migrateHouseWorkspace,
  generateChallenge,
  DEFAULT_VIEW,
  parseHouseHistory,
  type HouseRecord,
} from "./house-building-workspace.js";
import { registerPersistentUserDataApi } from "./persistent-user-data.js";
import {
  DEFAULT_SETTINGS,
  parseHouseDesign,
} from "./house-building-contract.js";
const payload = () => ({
  schemaVersion: 1,
  parts: [
    {
      id: "block-1",
      shape: "block",
      material: "wood",
      x: 0,
      y: 0.4,
      width: 0.8,
      height: 0.8,
      angle: 0,
      strength: 1,
      stiffness: 1,
      loadMass: 200,
    },
  ],
  connections: [],
  settings: { ...DEFAULT_SETTINGS },
});

test("house v2: migrate legacy blueprint to separate workspace and keep rollback source", async () => {
  await fixture(async (app, dir) => {
    await app.inject({ method: "PUT", url, payload: { payload: payload() } });
    const oldPath = resolve(dir, "learning/physics/house-design.json"),
      old = await readFile(oldPath, "utf8");
    const w = migrateHouseWorkspace(payload())!;
    w.view = { ...w.view, x: 20, y: 15, span: 60, showMass: true, wind: true };
    w.challenge = generateChallenge(
      { height: true, target: true, foundation: false },
      42,
    );
    const workspaceUrl = "/api/persistent-data/physics-house-workspace";
    assert.equal(
      (await app.inject({ method: "GET", url: workspaceUrl })).json().state,
      null,
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: workspaceUrl,
          payload: { payload: w },
        })
      ).statusCode,
      200,
    );
    assert.deepEqual(
      (await app.inject({ method: "GET", url: workspaceUrl })).json().state
        .payload,
      w,
    );
    assert.equal(await readFile(oldPath, "utf8"), old);
    assert.equal(
      (await stat(resolve(dir, "learning/physics/house-workspace.v2.json")))
        .mode & 0o777,
      0o600,
    );
    const invalid = await app.inject({
      method: "PUT",
      url: workspaceUrl,
      payload: { payload: { ...w, schemaVersion: 99 } },
    });
    assert.equal(invalid.statusCode, 400);
    assert.deepEqual(
      (await app.inject({ method: "GET", url: workspaceUrl })).json().state
        .payload,
      w,
    );
  });
});
function completion(id: string): HouseRecord {
  const design = parseHouseDesign(payload())!,
    challenge = generateChallenge(
      { height: false, target: false, foundation: true },
      33,
    );
  const r = challenge.regions[0];
  design.parts[0].x = (r.left + r.right) / 2;
  return {
    id,
    createdAt: "2026-09-28T00:00:00.000Z",
    modelVersion: 2,
    workspace: {
      schemaVersion: 2,
      design,
      challenge,
      view: { ...DEFAULT_VIEW },
    },
    result: {
      duration: 10,
      maxHeight: 0.82,
      finalHeight: 0.82,
      mass: 53.76,
      componentCount: 1,
      windForcePeak: 0,
      quakeAccelerationPeak: 0,
    },
  };
}
test("house v3: new triangle and material grade with cost persist alongside legacy records", async () => {
  await fixture(async (app) => {
    const historyUrl = "/api/persistent-data/physics-house-history";
    const legacy = completion("legacy-report"),
      current = completion("graded-report");
    current.modelVersion = 3;
    Object.assign(current.workspace.design.parts[0], {
      shape: "triangle",
      material: "stone_t4",
      y: 0.8 / 3,
    });
    Object.assign(current.result, { mass: 160, cost: 8 });
    const put = (record: HouseRecord) =>
      app.inject({
        method: "PUT",
        url: historyUrl,
        payload: { payload: { schemaVersion: 1, records: [record] } },
      });
    assert.equal((await put(legacy)).statusCode, 200);
    assert.equal((await put(current)).statusCode, 200);
    assert.equal(
      (
        await put({
          ...current,
          id: "invalid-cost",
          result: { ...current.result, cost: -1 },
        })
      ).statusCode,
      400,
    );
    assert.deepEqual(
      (await app.inject({ method: "GET", url: historyUrl })).json().state
        .payload.records,
      [legacy, current],
    );
  });
});
test("house history: concurrent append, idempotent retry, full layout reload and protected records", async () => {
  await fixture(async (app, dir) => {
    const historyUrl = "/api/persistent-data/physics-house-history";
    assert.equal(
      (await app.inject({ method: "GET", url: historyUrl })).json().state,
      null,
    );
    const put = (record: HouseRecord) =>
      app.inject({
        method: "PUT",
        url: historyUrl,
        payload: { payload: { schemaVersion: 1, records: [record] } },
      });
    const records = Array.from({ length: 6 }, (_, i) =>
      completion("result-" + i),
    );
    const replies = await Promise.all(records.map(put));
    assert.ok(replies.every((r) => r.statusCode === 200));
    assert.equal((await put(records[0])).statusCode, 200);
    const got = (await app.inject({ method: "GET", url: historyUrl })).json()
      .state.payload;
    assert.ok(parseHouseHistory(got));
    assert.deepEqual(got.records, records);
    const file = resolve(dir, "learning/physics/house-history.json"),
      before = await readFile(file, "utf8");
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal(
      (
        await put({
          ...records[0],
          result: { ...records[0].result, maxHeight: 8 },
        })
      ).statusCode,
      500,
    );
    assert.equal(await readFile(file, "utf8"), before);
    assert.equal(
      (
        await put({
          ...completion("bad"),
          result: { ...records[0].result, duration: 9 as 10 },
        })
      ).statusCode,
      400,
    );
    assert.equal(await readFile(file, "utf8"), before);
  });
});
test("house v2 files: failed writes retry and corrupt or future files refuse overwrite", async () => {
  for (const [stableId, file, payloadValue] of [
    [
      "physics-house-workspace",
      "house-workspace.v2.json",
      migrateHouseWorkspace(payload())!,
    ],
    [
      "physics-house-history",
      "house-history.json",
      { schemaVersion: 1, records: [completion("first")] },
    ],
  ] as const)
    await fixture(async (app, dir) => {
      const route = "/api/persistent-data/" + stableId,
        put = () =>
          app.inject({
            method: "PUT",
            url: route,
            payload: { payload: payloadValue },
          });
      await writeFile(resolve(dir, "learning"), "obstacle");
      assert.equal((await put()).statusCode, 500);
      await rm(resolve(dir, "learning"));
      assert.equal((await put()).statusCode, 200);
      const path = resolve(dir, "learning/physics", file),
        saved = await readFile(path, "utf8");
      for (const broken of [
        "{broken",
        JSON.stringify({ ...JSON.parse(saved), schemaVersion: 99 }),
      ]) {
        await writeFile(path, broken);
        assert.equal(
          (await app.inject({ method: "GET", url: route })).statusCode,
          500,
        );
        assert.equal((await put()).statusCode, 500);
        assert.equal(await readFile(path, "utf8"), broken);
      }
    });
});
const url = "/api/persistent-data/physics-house";
async function fixture(
  work: (app: ReturnType<typeof Fastify>, directory: string) => Promise<void>,
) {
  const dir = await mkdtemp(resolve(tmpdir(), "mumu-house-test-"));
  const app = Fastify({ logger: false });
  registerPersistentUserDataApi(app, dir);
  try {
    await app.ready();
    await work(app, dir);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
}
test("house: missing record, private atomic save, reload and stable metadata", async () => {
  await fixture(async (app, dir) => {
    assert.deepEqual((await app.inject({ method: "GET", url })).json(), {
      state: null,
    });
    const first = await app.inject({
      method: "PUT",
      url,
      payload: { payload: payload() },
    });
    assert.equal(first.statusCode, 200);
    const state = first.json().state;
    const p = resolve(dir, "learning/physics/house-design.json");
    assert.equal((await stat(p)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(p, "utf8")).schemaVersion, 1);
    assert.ok(parseHouseDesign(state.payload));
    const second = await app.inject({
      method: "PUT",
      url,
      payload: { payload: { ...payload(), parts: [] } },
    });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().state.id, state.id);
    assert.equal(second.json().state.createdAt, state.createdAt);
    assert.deepEqual(
      (await app.inject({ method: "GET", url })).json().state.payload.parts,
      [],
    );
  });
});
test("house: invalid input and future version never replace a valid record", async () => {
  await fixture(async (app, dir) => {
    await app.inject({ method: "PUT", url, payload: { payload: payload() } });
    const p = resolve(dir, "learning/physics/house-design.json"),
      before = await readFile(p, "utf8");
    for (const invalid of [
      { ...payload(), schemaVersion: 2 },
      { ...payload(), parts: [...payload().parts, ...payload().parts] },
      { ...payload(), settings: { ...DEFAULT_SETTINGS, windSpeed: 999 } },
      {
        ...payload(),
        connections: [
          {
            id: "x",
            a: "block-1",
            b: "ghost",
            kind: "hinge",
            anchor: { x: 0, y: 0 },
            strength: 1000,
          },
        ],
      },
    ]) {
      assert.equal(
        (
          await app.inject({
            method: "PUT",
            url,
            payload: { payload: invalid },
          })
        ).statusCode,
        400,
      );
      assert.equal(await readFile(p, "utf8"), before);
    }
    const old = JSON.parse(before);
    old.schemaVersion = 99;
    await writeFile(p, JSON.stringify(old));
    const protectedContents = await readFile(p, "utf8");
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 500);
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url,
          payload: { payload: payload() },
        })
      ).statusCode,
      500,
    );
    assert.equal(await readFile(p, "utf8"), protectedContents);
  });
});
test("house: damaged file is protected and write errors can be retried", async () => {
  await fixture(async (app, dir) => {
    await writeFile(resolve(dir, "learning"), "filesystem obstacle");
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url,
          payload: { payload: payload() },
        })
      ).statusCode,
      500,
    );
    await rm(resolve(dir, "learning"));
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url,
          payload: { payload: payload() },
        })
      ).statusCode,
      200,
    );
    const p = resolve(dir, "learning/physics/house-design.json");
    await writeFile(p, "{broken");
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 500);
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url,
          payload: { payload: payload() },
        })
      ).statusCode,
      500,
    );
    assert.equal(await readFile(p, "utf8"), "{broken");
  });
});
test("house: serialized concurrent writes leave a complete latest design", async () => {
  await fixture(async (app) => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        app.inject({
          method: "PUT",
          url,
          payload: {
            payload: {
              ...payload(),
              settings: { ...DEFAULT_SETTINGS, windSpeed: i },
            },
          },
        }),
      ),
    );
    assert.ok(results.every((r) => r.statusCode === 200));
    assert.equal(
      (await app.inject({ method: "GET", url })).json().state.payload.settings
        .windSpeed,
      7,
    );
  });
});
