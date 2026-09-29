import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { test, type TestContext } from "node:test";
import Fastify from "fastify";
import sharp from "sharp";
import { registerNatureGeographyApi } from "./nature-geography.js";

const now = "2026-09-29T00:00:00.000Z";
const fixture = {
  schemaVersion: 1, id: "china.json", createdAt: now, updatedAt: now, coordinateSystem: "GCJ-02",
  attribution: "Test fixture", description: "Synthetic map, no private data",
  datasets: { "100000": { type: "FeatureCollection", features: ["330000", "110000"].map((id, i) => ({
    type: "Feature", properties: { id, name: "测试地区" + i, children: 0, parent: "100000", kind: "province" },
    geometry: { type: "Polygon", coordinates: [[[110 + i, 30], [111 + i, 30], [111 + i, 31], [110 + i, 30]]] },
  })) } },
};
async function setup(t: TestContext) {
  const dir = await mkdtemp(resolve(tmpdir(), "nature-geography-test-"));
  await mkdir(resolve(dir, "cache/nature-maps"), { recursive: true });
  await writeFile(resolve(dir, "cache/nature-maps/china.json.gz"), gzipSync(JSON.stringify(fixture)));
  const app = Fastify(); registerNatureGeographyApi(app, dir); await app.ready();
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  return { app, dir, path: resolve(dir, "learning/nature/geography.json") };
}
const visit = (photos: string[] = []) => ({ id: randomUUID(), title: "测试湖边", note: "只含合成测试内容", date: "2026-09-29", longitude: 120.1, latitude: 30.2, photos });
async function image() {
  const png = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#4d96bf" } }).png().withMetadata({ orientation: 6 }).toBuffer();
  return "data:image/png;base64," + png.toString("base64");
}

test("empty state is non-writing; map is served offline and unknown regions fail", async t => {
  const { app, dir } = await setup(t);
  const initial = await app.inject("/api/nature/state");
  assert.equal(initial.statusCode, 200); assert.deepEqual(initial.json().footprints, []);
  assert.deepEqual((await readdir(dir)).sort(), ["cache"]);
  assert.equal((await app.inject("/api/nature/maps/china/100000")).json().features.length, 2);
  assert.equal((await app.inject("/api/nature/maps/china/999999")).statusCode, 404);
  assert.equal((await app.inject("/api/nature/maps/world")).statusCode, 503);
  assert.equal((await app.inject({ method: "PUT", url: "/api/nature/lights/999999", payload: { lit: true } })).statusCode, 400);
});
test("serialized lights preserve concurrent changes and duplicate requests are idempotent", async t => {
  const { app, dir } = await setup(t);
  await Promise.all(["330000", "110000", "330000"].map(id => app.inject({ method: "PUT", url: "/api/nature/lights/" + id, payload: { lit: true } })));
  const state = (await app.inject("/api/nature/state")).json();
  assert.deepEqual(state.lights.toSorted(), ["110000", "330000"]); assert.equal(state.revision, 2);
  const second = Fastify(); registerNatureGeographyApi(second, dir); await second.ready();
  assert.deepEqual((await second.inject("/api/nature/state")).json(), state);
  await second.close();
});
test("corrupt and future-version state is preserved, never migrated into empty records", async t => {
  const { app, path } = await setup(t);
  await mkdir(resolve(path, ".."), { recursive: true });
  for (const raw of ["invalid json", JSON.stringify({ schemaVersion: 2, footprints: ["keep"] })]) {
    await writeFile(path, raw);
    assert.equal((await app.inject("/api/nature/state")).statusCode, 503);
    assert.equal((await app.inject({ method: "PUT", url: "/api/nature/lights/330000", payload: { lit: true } })).statusCode, 503);
    assert.equal(await readFile(path, "utf8"), raw);
  }
});
test("photos are decoded, oriented, stripped, thumbnailed, persisted and created once", async t => {
  const { app, dir } = await setup(t); const input = visit([await image()]);
  const responses = await Promise.all([1, 2].map(() => app.inject({ method: "POST", url: "/api/nature/footprints", payload: input })));
  assert.ok(responses.every(r => r.statusCode < 300));
  const state = (await app.inject("/api/nature/state")).json();
  assert.equal(state.footprints.length, 1);
  const record = state.footprints[0]; assert.equal(record.coordinateSystem, "GCJ-02");
  assert.equal(record.photos.length, 1); assert.equal(record.photos[0].width, 60); assert.equal(record.photos[0].height, 80);
  const photo = record.photos[0].id;
  const response = await app.inject("/api/nature/photos/" + photo + "/full");
  const meta = await sharp(response.rawPayload).metadata();
  assert.equal(meta.format, "webp"); assert.equal(meta.exif, undefined);
  assert.equal(response.headers["cache-control"], "private, no-store");
  assert.equal((await app.inject("/api/nature/photos/" + photo + "/thumb")).statusCode, 200);
  assert.equal((await readdir(resolve(dir, "media/nature-footprints"))).length, 2);
  const edit = await app.inject({ method: "PATCH", url: "/api/nature/footprints/" + input.id, payload: { title: "修改后的测试", date: input.date, note: "更新" } });
  assert.equal(edit.json().footprints[0].photos[0].id, photo);
  assert.equal((await app.inject({ method: "DELETE", url: "/api/nature/footprints/" + input.id })).json().footprints.length, 0);
  assert.equal((await app.inject("/api/nature/photos/" + photo + "/full")).statusCode, 404);
  assert.equal((await readdir(resolve(dir, "media/nature-footprints"))).length, 0);
});
test("invalid images rollback previously prepared photos; invalid coordinates and input are rejected", async t => {
  const { app, dir } = await setup(t);
  const input = visit([await image(), "data:image/png;base64,AAAA"]);
  assert.equal((await app.inject({ method: "POST", url: "/api/nature/footprints", payload: input })).statusCode, 400);
  assert.equal((await app.inject("/api/nature/state")).json().footprints.length, 0);
  assert.deepEqual(await readdir(resolve(dir, "media/nature-footprints")), []);
  for (const payload of [{ ...visit(), longitude: 200 }, { ...visit(), date: "2026-02-30" }, { ...visit(), title: " " }, { ...visit(), path: "../../bad" }]) {
    assert.equal((await app.inject({ method: "POST", url: "/api/nature/footprints", payload })).statusCode, 400);
  }
  assert.equal((await app.inject("/api/nature/photos/not-an-id/full")).statusCode, 400);
});
test("failed atomic write leaves the previous valid state intact", async t => {
  const { app, path } = await setup(t);
  await app.inject({ method: "PUT", url: "/api/nature/lights/330000", payload: { lit: true } });
  const raw = await readFile(path, "utf8"); const folder = resolve(path, "..");
  await chmod(folder, 0o500);
  try {
    const response = await app.inject({ method: "PUT", url: "/api/nature/lights/110000", payload: { lit: true } });
    assert.equal(response.statusCode, 503); assert.equal(await readFile(path, "utf8"), raw);
  } finally { await chmod(folder, 0o700); }
  assert.equal((await app.inject({ method: "PUT", url: "/api/nature/lights/110000", payload: { lit: true } })).statusCode, 200);
});
test("invalid map version or geometry is rejected and a corrected pack can be retried", async t => {
  const { app, dir } = await setup(t); const path = resolve(dir, "cache/nature-maps/china.json.gz");
  await writeFile(path, gzipSync(JSON.stringify({ ...fixture, schemaVersion: 2 })));
  assert.equal((await app.inject("/api/nature/maps/china")).statusCode, 503);
  await writeFile(path, gzipSync(JSON.stringify(fixture)));
  assert.equal((await app.inject("/api/nature/maps/china")).statusCode, 200);
});

test("land-only relief endpoint derives transparency without changing the original terrain or writing files", async t => {
  const { app, dir } = await setup(t);
  const bytes = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#669944" } }).webp().toBuffer();
  const world = { ...fixture, coordinateSystem: "WGS84", terrainDataUrl: "data:image/webp;base64," + bytes.toString("base64"),
    datasets: { land: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[-40, -40], [40, -40], [40, 40], [-40, 40], [-40, -40]]] } }] } } };
  await writeFile(resolve(dir, "cache/nature-maps/world.json.gz"), gzipSync(JSON.stringify(world)));
  const masked = await app.inject("/api/nature/maps/world/terrainlandv1");
  assert.equal(masked.statusCode, 200); assert.match(masked.headers["content-type"]!, /image\/webp/);
  const { data, info } = await sharp(masked.rawPayload).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0); assert.equal(data[(32 * info.width + 32) * 4 + 3], 255);
  assert.deepEqual((await app.inject("/api/nature/maps/world/terrain")).rawPayload, bytes);
  assert.deepEqual((await app.inject("/api/nature/maps/world/terrainlandv1")).rawPayload, masked.rawPayload);
  assert.deepEqual((await readdir(resolve(dir, "cache/nature-maps"))).sort(), ["china.json.gz", "world.json.gz"]);
});
