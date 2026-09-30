import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import Fastify from "fastify";
import sharp from "sharp";
import { openDemPack, readDemTile, registerNatureDemApi } from "./nature-dem.js";

async function fixture(version = 1) {
  const dir = await mkdtemp(resolve(tmpdir(), "nature-dem-test-"));
  const folder = resolve(dir, "cache/nature-maps"); await mkdir(folder, { recursive: true });
  // Two very different encoded heights: nearest resampling must not mix RGB carries.
  const raw = Buffer.alloc(256 * 256 * 3);
  for (let i = 0; i < 256 * 256; i++) { raw[i * 3] = i % 256 < 128 ? 128 : 132; raw[i * 3 + 1] = 255; raw[i * 3 + 2] = 128; }
  const png = await sharp(raw, { raw: { width: 256, height: 256, channels: 3 } }).png().toBuffer();
  const now = "2026-09-30T00:00:00.000Z";
  const metadata = { schemaVersion: version, id: "china-terrain", createdAt: now, updatedAt: now,
    coordinateSystem: "WGS84", encoding: "terrarium", bounds: [73, 18, 136, 54], minZoom: 4, nationalZoom: 9, maxZoom: 12,
    attribution: "Synthetic DEM", source: "https://example.org/{z}/{x}/{y}.png", passes: [{ id: "sample", name: "测试关口", longitude: 110, latitude: 35, elevation: 260, source: "https://example.org/pass" }],
    tiles: { "9/412/202": [0, png.length, createHash("sha256").update(png).digest("hex")] } };
  const header = Buffer.from(JSON.stringify(metadata)), prefix = Buffer.alloc(12); prefix.write("MUMUDEM1"); prefix.writeUInt32LE(header.length, 8);
  const path = resolve(folder, "china-terrain.v1.pack"); await writeFile(path, Buffer.concat([prefix, header, png]));
  return { dir, path, png, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
test("offline DEM serves original tiles and preserves encoded heights when overscaling", async () => {
  const f = await fixture();
  const pack = await openDemPack(f.path);
  try {
    assert.deepEqual((await readDemTile(pack, 9, 412, 202))?.data, f.png);
    const child = await readDemTile(pack, 10, 825, 404);
    assert.equal(child?.sourceZoom, 9);
    const data = await sharp(child!.data).raw().toBuffer();
    assert.deepEqual([...data.subarray(0, 3)], [132, 255, 128]);
    assert.deepEqual([...data.subarray(-3)], [132, 255, 128]);
    assert.equal(await readDemTile(pack, 12, 0, 0), null);
    assert.equal(await readDemTile(pack, 20, 0, 0), null);
  } finally { await pack.file.close(); await f.cleanup(); }
});
test("terrain metadata and requests handle missing packs, validation, and reload after install", async () => {
  const f = await fixture(), app = Fastify(); registerNatureDemApi(app, f.dir);
  try {
    const info = (await app.inject("/api/nature/terrain/china")).json();
    assert.equal(info.available, true); assert.equal(info.tiles, undefined);
    const tile = await app.inject("/api/nature/terrain/china/10/825/404.png");
    assert.equal(tile.statusCode, 200); assert.match(String(tile.headers["content-type"]), /image\/png/);
    assert.equal(tile.headers["x-terrain-source-zoom"], "9");
    assert.equal((await app.inject("/api/nature/terrain/china/12/0/0.png")).statusCode, 404);
    assert.equal((await app.inject("/api/nature/terrain/china/9/999/0.png")).statusCode, 400);
    assert.equal((await app.inject("/api/nature/terrain/china/NaN/0/0.png")).statusCode, 400);
  } finally { await app.close(); await f.cleanup(); }
  const missing = await mkdtemp(resolve(tmpdir(), "nature-dem-empty-")), empty = Fastify(); registerNatureDemApi(empty, missing);
  try { assert.equal((await empty.inject("/api/nature/terrain/china")).json().available, false); }
  finally { await empty.close(); await rm(missing, { recursive: true, force: true }); }
});
test("damaged and future DEM versions fail without rewriting the pack", async () => {
  const future = await fixture(2);
  try { const before = await readFile(future.path); await assert.rejects(openDemPack(future.path)); assert.deepEqual(await readFile(future.path), before); }
  finally { await future.cleanup(); }
  const f = await fixture();
  try {
    const bytes = await readFile(f.path); bytes[bytes.length - 30] ^= 0xff; await writeFile(f.path, bytes);
    const pack = await openDemPack(f.path);
    try { await assert.rejects(readDemTile(pack, 9, 412, 202), /Damaged/); }
    finally { await pack.file.close(); }
    await writeFile(f.path, bytes.subarray(0, bytes.length - 100));
    await assert.rejects(openDemPack(f.path), /range/);
    await writeFile(f.path, Buffer.from("invalid")); await assert.rejects(openDemPack(f.path));
  } finally { await f.cleanup(); }
});
