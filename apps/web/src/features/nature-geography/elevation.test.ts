import assert from "node:assert/strict";
import { test } from "node:test";
import { elevationColor, ELEVATION_COLORS, ELEVATION_STOPS, ELEVATION_RELIEF_STOPS, ELEVATION_GRADIENT, elevationLabel, featureElevation, passFeature } from "./elevation";
const feature = passFeature({ id: "sample", name: "测试关口", longitude: 105, latitude: 32, elevation: 850, source: "https://example.org" });
test("seven height anchors use actual metre intervals and clamp outside the range", () => {
  assert.deepEqual([0, 1000, 2000, 3000, 5000, 7000, 8900].map(elevationColor),
    ["#238348", "#1269cc", "#e6c52c", "#e58022", "#943e32", "#783fa0", "#101114"]);
  assert.equal(elevationColor(500), "#1b768a");
  assert.equal(elevationColor(1500), "#7c977c");
  assert.equal(elevationColor(2500), "#e6a327");
  assert.equal(elevationColor(3500), "#d17026");
  assert.equal(elevationColor(4000), "#bd5f2a");
  assert.equal(elevationColor(6000), "#863f69");
  assert.equal(elevationColor(7950), "#44285a");
  assert.equal(elevationColor(-400), ELEVATION_COLORS[0]);
  assert.equal(elevationColor(10000), "#101114");
});
test("terrain, text and legend share the same scale; zero land differs from sea blue", () => {
  assert.deepEqual(ELEVATION_RELIEF_STOPS.slice(4), ELEVATION_STOPS.flatMap(s => [s.meters, s.color]));
  assert.notEqual(ELEVATION_RELIEF_STOPS[3], elevationColor(0));
  assert.ok(ELEVATION_GRADIENT.includes("#1269cc " + 1000 / 8900 * 100 + "%"));
  assert.ok(ELEVATION_GRADIENT.includes("#943e32 " + 5000 / 8900 * 100 + "%"));
  assert.ok(ELEVATION_GRADIENT.includes("#101114 100%"));
});
test("height labels distinguish absent source data, real zero, and approximate DEM samples", () => {
  assert.equal(elevationLabel(feature), "约 850 米");
  for (const value of [null, "", false, NaN, Infinity]) assert.equal(featureElevation({ ...feature, properties: { kind: "elevation", elevation: value } }), null);
  assert.equal(elevationLabel({ ...feature, properties: { kind: "elevation", elevation: 0 } }), "海拔未收录");
  assert.equal(elevationLabel({ ...feature, properties: { kind: "elevation", elevation: 0, detail: "海拔 0 米" } }), "0 米");
  assert.equal(elevationLabel({ ...feature, properties: { kind: "elevation", elevation: 8848 } }), "8,848 米");
  assert.equal(feature.properties.focusZoom, 12);
});
