import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { maskTerrainToLand } from "./nature-terrain.js";

const ring = (w: number, s: number, e: number, n: number) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
test("terrain clipping preserves land colors, offshore islands, and transparent oceans/lake holes", async () => {
  const input = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#669944" } }).png().toBuffer();
  const result = await maskTerrainToLand(input, { features: [
    { geometry: { type: "Polygon", coordinates: [ring(-40, -40, 40, 40), ring(-10, -10, 10, 10)] } },
    { geometry: { type: "MultiPolygon", coordinates: [[ring(100, 10, 120, 30)], [ring(-120, -30, -100, -10)]] } },
  ] });
  const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (lng: number, lat: number) => {
    const x = Math.floor((lng + 180) / 360 * info.width);
    const y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * info.height);
    return [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  };
  assert.deepEqual(pixel(25, 25), [102, 153, 68, 255]);
  assert.equal(pixel(0, 0)[3], 0); // Lake remains a hole, regardless of ring winding.
  assert.equal(pixel(70, 0)[3], 0);
  assert.equal(pixel(110, 20)[3], 255);
  assert.equal(pixel(-110, -20)[3], 255);
});
test("invalid image and empty land do not return an opaque fallback", async () => {
  await assert.rejects(maskTerrainToLand(Buffer.from("invalid"), { features: [] }));
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ffffff" } }).png().toBuffer();
  await assert.rejects(maskTerrainToLand(image, { features: [] }), /Missing land/);
});
