import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import Fastify from "fastify";
import { registerNatureGeographyApi } from "./nature-geography.js";

const feature = { type: "Feature", geometry: { type: "Polygon", coordinates: [[[100, 30], [101, 30], [101, 31], [100, 30]]] },
  properties: { id: "fixture", name: "测试山脉", kind: "chinamountains" } };
const pack = { schemaVersion: 1, id: "physical-v1", createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z",
  coordinateSystem: "WGS84", attribution: "Synthetic fixture", description: "No real personal data",
  datasets: { continentsv2: { type: "FeatureCollection", features: [feature] }, chinamountains: { type: "FeatureCollection", features: [feature] } } };

test("physical layers work offline, missing/corrupt/future/empty packs fail without replacing files", async t => {
  const dir = await mkdtemp(resolve(tmpdir(), "nature-physical-test-"));
  await mkdir(resolve(dir, "cache/nature-maps"), { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = resolve(dir, "cache/nature-maps/physical.json.gz");
  const app = Fastify(); registerNatureGeographyApi(app, dir); await app.ready();
  t.after(() => app.close());
  const route = "/api/nature/maps/world/chinamountains";
  assert.equal((await app.inject(route)).statusCode, 503);
  for (const bytes of [Buffer.from("broken"), gzipSync(JSON.stringify({ ...pack, schemaVersion: 99 })),
    gzipSync(JSON.stringify({ ...pack, coordinateSystem: "GCJ-02" }))]) {
    await writeFile(path, bytes);
    assert.equal((await app.inject(route)).statusCode, 503);
  }
  await writeFile(path, gzipSync(JSON.stringify(pack)));
  assert.deepEqual((await app.inject(route)).json(), pack.datasets.chinamountains);
  assert.deepEqual((await app.inject("/api/nature/maps/world/continentsv2")).json(), pack.datasets.continentsv2);
  // Success does not create a private learning state, and legacy packs are not rewritten.
  assert.equal((await app.inject("/api/nature/maps/world")).statusCode, 503);

  const emptyApp = Fastify(); registerNatureGeographyApi(emptyApp, dir); await emptyApp.ready();
  t.after(() => emptyApp.close());
  await writeFile(path, gzipSync(JSON.stringify({ ...pack, datasets: { chinamountains: { type: "FeatureCollection", features: [] } } })));
  assert.equal((await emptyApp.inject(route)).statusCode, 503);
});
