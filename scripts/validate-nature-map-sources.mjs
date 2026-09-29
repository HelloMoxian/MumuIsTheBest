import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const root = new URL("../content/nature/maps/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("sources.v1.json", root), "utf8"));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.purpose, "research-only");
assert.equal(manifest.runtimeEnabled, false);
assert.equal(manifest.datasets.length, 3);
const ids = new Set();

for (const data of manifest.datasets) {
  assert(!ids.has(data.id), "Duplicate dataset ID");
  ids.add(data.id);
  assert.match(data.file, /^research\/[a-z0-9.-]+$/);
  assert(["identity", "gzip"].includes(data.encoding));
  assert(data.source.startsWith("https://") && data.license && data.attribution);
  const bytes = readFileSync(new URL(data.file, root));
  assert.equal(bytes.length, data.bytes, data.id + ": byte size");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), data.sha256, data.id + ": SHA-256");
  const raw = data.encoding === "gzip" ? gunzipSync(bytes) : bytes;
  if (data.uncompressedBytes) assert.equal(raw.length, data.uncompressedBytes);
  if (data.encoding === "gzip") assert.equal(createHash("sha256").update(raw).digest("hex"), data.sourceSha256);
  const geojson = JSON.parse(raw.toString("utf8"));
  assert.equal(geojson.type, "FeatureCollection");
  assert.equal(geojson.features.length, data.featureCount);
  let vertices = 0;
  const featureIds = new Set();
  for (const feature of geojson.features) {
    assert.equal(feature.type, "Feature");
    assert(feature.properties && typeof feature.properties === "object");
    const geometry = feature.geometry;
    assert(["Polygon", "MultiPolygon"].includes(geometry?.type));
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    assert(polygons.length > 0);
    for (const polygon of polygons) {
      assert(polygon.length > 0);
      for (const ring of polygon) {
        assert(ring.length >= 4);
        assert.deepEqual(ring[0], ring.at(-1), data.id + ": unclosed ring");
        for (const point of ring) {
          assert(point.length >= 2 && point.every(Number.isFinite));
          assert(Math.abs(point[0]) <= 180.000001 && Math.abs(point[1]) <= 90.000001);
          vertices++;
        }
      }
    }
    if (feature.properties.shapeID) {
      assert(!featureIds.has(feature.properties.shapeID), "Duplicate shape ID");
      featureIds.add(feature.properties.shapeID);
    }
  }
  if (data.sourceFeatureCount) {
    const source = geojson.researchProvenance;
    assert.equal(source.sourceSha256, data.sourceSha256);
    assert.equal(source.sourceFeatureCount, data.sourceFeatureCount);
    assert.equal(source.sourceBytes, data.sourceBytes);
    assert.equal(source.license, data.license);
    assert.equal(source.dataYear, data.dataYear);
  }
  console.log(data.id + ": " + geojson.features.length + " features, " + vertices + " vertices; checksum and structure OK");
}
console.log("Research assets verified; not a production boundary accuracy/completeness check.");
