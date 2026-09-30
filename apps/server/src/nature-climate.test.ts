import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import Fastify from "fastify";
import { registerNatureGeographyApi } from "./nature-geography.js";

const layer = { type: "FeatureCollection", features: [{ type: "Feature",
  geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  properties: { id: "BWh", kind: "climate", name: "炎热沙漠", group: "B", resolutionDegrees: 1 / 12 } }] };
const pack = { schemaVersion: 1, id: "climate-v1", coordinateSystem: "WGS84", createdAt: "2026-09-30T00:00:00Z",
  updatedAt: "2026-09-30T00:00:00Z", attribution: "Synthetic fixture", description: "Public map fixture", datasets: { climatev2: layer } };

test("fine climate data is offline and invalid, future, empty or missing packs fail without writes", async t => {
  const dir = await mkdtemp(resolve(tmpdir(), "nature-climate-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(resolve(dir, "cache/nature-maps"), { recursive: true });
  const file = resolve(dir, "cache/nature-maps/climate.json.gz");
  const app = Fastify(); registerNatureGeographyApi(app, dir); await app.ready(); t.after(() => app.close());
  const route = "/api/nature/maps/world/climatev2";
  assert.equal((await app.inject(route)).statusCode, 503);
  for (const data of [Buffer.from("broken"), gzipSync(JSON.stringify({ ...pack, schemaVersion: 2 })),
    gzipSync(JSON.stringify({ ...pack, id: "wrong" })), gzipSync(JSON.stringify({ ...pack, coordinateSystem: "GCJ-02" })),
    gzipSync(JSON.stringify({ ...pack, datasets: { climatev2: { type: "FeatureCollection", features: [] } } }))]) {
    await writeFile(file, data);
    assert.equal((await app.inject(route)).statusCode, 503);
    assert.deepEqual(await readFile(file), data);
  }
  await writeFile(file, gzipSync(JSON.stringify(pack)));
  const result = await app.inject(route);
  assert.equal(result.statusCode, 200); assert.deepEqual(result.json(), layer);
  assert.equal((await app.inject("/api/nature/maps/china/climatev2")).statusCode, 503);
  await assert.rejects(readFile(resolve(dir, "learning/nature/geography.json")), { code: "ENOENT" });
});
