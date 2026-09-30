import assert from "node:assert/strict";
import { test } from "node:test";
import rawAtlas from "../../../../../content/nature/maps/mineral-atlas.v1.json";
import { COUNTRY_PROFILES } from "./countries";
import { EMPTY, type MapFeature } from "./model";
import { MINERAL_RESOURCES, parseMineralAtlas, mineralRegions, mineralSelection, historicalMinerals, mineralMapData, mineralPattern, mineralValue } from "./minerals";

function country(code: string): MapFeature {
  const [id, profile] = Object.entries(COUNTRY_PROFILES).find(([, p]) => p.code === code)!;
  return { type: "Feature", properties: { id, name: profile.name, kind: "countries" }, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } };
}
function point(id: string, group: string): MapFeature {
  return { type: "Feature", properties: { id, name: id, kind: "minerals", group, detail: "历史资料" }, geometry: { type: "Point", coordinates: [0, 0] } };
}
test("resource catalogue has dated, sourced and resolvable statistics for all 16 categories", () => {
  assert.equal(MINERAL_RESOURCES.length, 16);
  const codes = new Set(Object.values(COUNTRY_PROFILES).map(p => p.code));
  for (const r of MINERAL_RESOURCES) {
    assert.ok(r.use && r.name);
    for (const metric of [r.production, r.reserves]) if (metric) {
      assert.match(metric.year, /^20\d{2}$/);
      assert.match(metric.source, /^https:\/\//);
      assert.ok(metric.basis && metric.unit && metric.note);
      assert.ok(metric.entries.every(e => codes.has(e.code)), r.id);
    }
  }
  assert.equal(MINERAL_RESOURCES.find(r => r.id === "diamond")!.reserves, null);
  assert.ok(!MINERAL_RESOURCES.find(r => r.id === "lithium")!.reserves!.entries.some(e => e.code === "BO"), "resources must not be taught as reserves");
});
test("multi-select is a union; removing one resource updates the country and detail without changing geometry", () => {
  const countries = { ...EMPTY, features: [country("US"), country("VE"), country("QA")] };
  const both = mineralRegions(countries, ["oil", "gas"], "production");
  assert.equal(both.features.length, 1);
  assert.equal(both.features[0].properties.resourceIds, "oil|gas");
  assert.equal(both.features[0].geometry, countries.features[0].geometry);
  assert.equal(countries.features[0].properties.kind, "countries");
  assert.deepEqual(mineralSelection(both.features[0]).map(f => f.resource.id), ["oil", "gas"]);
  assert.equal(mineralRegions(countries, ["gas"], "production").features[0].properties.resourceIds, "gas");
  const reserves = mineralRegions(countries, ["oil", "gas"], "reserves");
  assert.deepEqual(new Set(reserves.features.map(f => f.properties.resourceCode)), new Set(["US", "VE", "QA"]));
  assert.deepEqual(mineralRegions(countries, [], "production"), EMPTY);
  assert.deepEqual(mineralRegions(countries, ["diamond"], "reserves"), EMPTY);
});
test("mismatched country identities fail closed and an empty atlas cannot invent distribution", () => {
  const wrong = country("US"); wrong.properties.name = "另一个快照";
  assert.deepEqual(mineralRegions({ ...EMPTY, features: [wrong] }, ["oil"], "production"), EMPTY);
  assert.deepEqual(mineralRegions(EMPTY, ["oil"], "production"), EMPTY);
  assert.deepEqual(mineralSelection(null), []);
});
test("historical point filtering matches exact commodity codes; oil is never guessed from mine names", () => {
  const points = { ...EMPTY, features: [point("a", "AU CU"), point("b", "CU2"), point("Diamond Oil Mine", "AG"), point("c", "NI CO"), country("US")] };
  assert.deepEqual(historicalMinerals(points, ["copper"]).features.map(f => f.properties.id), ["a"]);
  assert.deepEqual(historicalMinerals(points, ["gold", "copper"]).features.map(f => f.properties.id), ["a"]);
  assert.deepEqual(historicalMinerals(points, ["oil", "gas", "diamond"]), EMPTY);
  assert.deepEqual(historicalMinerals(points, []).features, []);
  const result = historicalMinerals(points, ["nickel"]);
  assert.match(String(result.features[0].properties.detail), /不代表现有储量/);
  assert.equal(points.features[3].properties.detail, "历史资料");
});
test("hiding historical points preserves country distribution and removes every marker feature", () => {
  const regions = mineralRegions({ ...EMPTY, features: [country("US")] }, ["oil"], "production");
  const points = { ...EMPTY, features: [point("a", "AU")] };
  assert.equal(mineralMapData(regions, points, false), regions);
  assert.equal(mineralMapData(regions, points, true).features.length, 2);
  assert.ok(mineralMapData(regions, points, false).features.every(f => f.geometry.type !== "Point"));
});
test("future versions and corrupt or duplicate statistics fail closed", () => {
  assert.deepEqual(parseMineralAtlas(null), []);
  assert.deepEqual(parseMineralAtlas({ ...rawAtlas, schemaVersion: 2 }), []);
  const invalid = structuredClone(rawAtlas); invalid.resources[0].production.entries[0].value = -1;
  assert.deepEqual(parseMineralAtlas(invalid), []);
  const duplicate = structuredClone(rawAtlas); duplicate.resources.push(duplicate.resources[0]);
  assert.deepEqual(parseMineralAtlas(duplicate), []);
  const duplicateCountry = structuredClone(rawAtlas); duplicateCountry.resources[0].production.entries.push(duplicateCountry.resources[0].production.entries[0]);
  assert.deepEqual(parseMineralAtlas(duplicateCountry), []);
});
test("stripes give equal area to each selected category rather than inventing quantitative proportions", () => {
  const pattern = mineralPattern(["#ff0000", "#00ff00", "#0000ff"]);
  const counts = [0, 0, 0];
  for (let i = 0; i < pattern.data.length; i += 4) {
    assert.equal(pattern.data[i + 3], 255);
    for (let c = 0; c < 3; c++) if (pattern.data[i + c] === 255) counts[c]++;
  }
  assert.equal(counts[0], counts[1]); assert.equal(counts[1], counts[2]);
  assert.equal(mineralValue(110000, "千吨"), "1.1 亿吨");
  assert.equal(mineralValue(88000, "吨"), "8.8 万吨");
  assert.equal(mineralValue(25, "%"), "25%");
});
