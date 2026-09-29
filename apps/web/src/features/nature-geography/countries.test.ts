import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { COUNTRY_PROFILES, parseCountryAtlas, countryProfile, countryRegions, countryCities, cityVisible, cityFeature, formatCountryNumber, countryEconomy } from "./countries";
import { EMPTY, selectedRegionIds, visibleFeatures, type MapFeature } from "./model";

const entry = (code: string) => Object.entries(COUNTRY_PROFILES).find(([, p]) => p.code === code)!;
const feature = (code: string): MapFeature => {
  const [id, p] = entry(code);
  return { type: "Feature", properties: { id, name: p.name, kind: "countries" }, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } };
};
test("country content contract: finite dated metrics, unique cities, bounded coordinates and local flags", () => {
  assert.equal(Object.keys(COUNTRY_PROFILES).length, 258);
  const ids = new Set<string>();
  const svg = readFileSync(new URL("../../../public/images/nature/geography/flags.v1.svg", import.meta.url), "utf8");
  for (const [id, p] of Object.entries(COUNTRY_PROFILES)) {
    assert.match(id, /^countries-\d+$/);
    assert.ok(p.name && p.overview);
    for (const metric of [p.population, p.area, p.services, p.gdpPerCapita]) {
      if (metric) { assert.ok(Number.isFinite(metric.value) && metric.value >= 0); assert.ok(metric.source); assert.match(metric.year, /^(\d{4})?$/); }
    }
    if (p.flag) assert.ok(svg.includes(`id="${p.flag}"`), `${p.name} missing flag`);
    for (const city of p.cities) {
      assert.ok(!ids.has(city.id), city.id); ids.add(city.id);
      assert.equal(city.coordinates.length, 2);
      assert.ok(city.coordinates.every(Number.isFinite));
      assert.ok(Math.abs(city.coordinates[0]) <= 180 && Math.abs(city.coordinates[1]) <= 90);
      assert.ok(city.name && city.role); assert.equal(typeof city.capital, "boolean");
    }
  }
  assert.ok(ids.size > 800);
  const svgIds = [...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(svgIds).size, svgIds.length, "flag clip IDs must not collide");
});
test("mismatched map snapshots, non-country features and empty selection cannot show another country's facts", () => {
  assert.equal(countryProfile(feature("CN"))?.code, "CN");
  assert.equal(countryProfile(null), null);
  assert.equal(countryProfile({ ...feature("CN"), properties: { ...feature("CN").properties, name: "Wrong snapshot" } }), null);
  assert.equal(countryProfile({ ...feature("CN"), properties: { ...feature("CN").properties, kind: "province" } }), null);
  assert.deepEqual(countryRegions(EMPTY), EMPTY); assert.deepEqual(countryCities(EMPTY), EMPTY);
});
test("country metadata preserves geometry and supports searching by capital or major city", () => {
  const source = { ...EMPTY, features: [feature("CN"), feature("JP"), feature("US")] };
  const result = countryRegions(source);
  assert.equal(result.features[0].geometry, source.features[0].geometry);
  assert.equal(source.features[0].properties.detail, undefined);
  assert.equal(visibleFeatures(result, "北京")[0].properties.name, "中华人民共和国");
  assert.equal(visibleFeatures(result, "旧金山")[0].properties.name, "美国");
  assert.equal(visibleFeatures(result, "大阪")[0].properties.name, "日本");
});
test("city points belong to the selected country and do not replace its polygons or linked China selection", () => {
  const source = { ...EMPTY, features: [feature("CN"), feature("HK"), feature("TW"), feature("MO")] };
  const cities = countryCities(source);
  assert.ok(cities.features.every(city => city.geometry.type === "Point" && city.properties.kind === "country-city"));
  assert.equal(cities.features.find(city => city.properties.name === "北京")?.properties.countryId, source.features[0].properties.id);
  assert.deepEqual(selectedRegionIds(source, String(source.features[0].properties.id)), source.features.map(f => String(f.properties.id)));
  assert.ok(cities.features.filter(city => ["台北", "香港", "澳门"].includes(String(city.properties.name))).every(city => city.properties.capital === false));
});
test("historical capitals and government seats are not taught as current national capitals", () => {
  assert.deepEqual(entry("JP")[1].capitals, ["东京"]);
  assert.deepEqual(entry("NL")[1].capitals, ["阿姆斯特丹"]);
  assert.deepEqual(entry("BO")[1].capitals, ["苏克雷"]);
  assert.deepEqual(entry("LK")[1].capitals, ["斯里贾亚瓦德纳普拉科特"]);
  assert.equal(entry("CH")[1].cities.find(c => c.name === "伯尔尼")?.role, "联邦政府驻地");
  assert.equal(entry("NR")[1].capitals.length, 0);
  assert.ok(entry("ZA")[1].cities.some(c => c.role === "行政首都"));
});
test("city density follows zoom and selection; unrelated world layers receive no city data", () => {
  const [id, p] = entry("CN");
  const capital = cityFeature(p.cities.find(c => c.capital)!, id);
  const city = cityFeature(p.cities.find(c => !c.capital)!, id);
  assert.equal(cityVisible(capital, 1, []), false);
  assert.equal(cityVisible(capital, 1, [id]), true);
  assert.equal(cityVisible(city, 1, [id]), false);
  assert.equal(cityVisible(city, 2, [id]), true);
  assert.equal(cityVisible(city, 4, []), true);
  assert.equal(countryCities({ ...EMPTY, features: [{ ...feature("CN"), properties: { ...feature("CN").properties, kind: "languageareas" } }] }).features.length, 0);
});
test("statistics distinguish unknown and zero and display readable Chinese units", () => {
  assert.equal(formatCountryNumber(1408975000, "人"), "约 14.09亿人");
  assert.equal(formatCountryNumber(9600000, ""), "约 960万");
  assert.equal(formatCountryNumber(0, "人"), "0人");
  assert.equal(formatCountryNumber(NaN, "人"), "资料暂缺");
  assert.equal(formatCountryNumber(-1, "人"), "资料暂缺");
  assert.match(countryEconomy(entry("CN")[1]), /2024/);
});
test("small offshore features cannot inherit the sovereign state's full national statistics", () => {
  const island = entry("CLP")[1];
  assert.equal(island.cities.length, 0); assert.equal(island.area, null);
  assert.notEqual(island.population?.value, entry("FR")[1].population?.value);
  assert.equal(island.independent, false);
});

test("invalid atlas versions, coordinates and metrics fail closed without losing the map", () => {
  const valid = { schemaVersion: 1, id: "country-atlas", regions: { "countries-9": entry("CN")[1] } };
  assert.equal(Object.keys(parseCountryAtlas(valid)).length, 1);
  assert.deepEqual(parseCountryAtlas({ ...valid, schemaVersion: 2 }), {});
  assert.deepEqual(parseCountryAtlas(null), {});
  const broken = structuredClone(valid); broken.regions["countries-9"].cities[0].coordinates[1] = 120;
  assert.deepEqual(parseCountryAtlas(broken), {});
  const badMetric = structuredClone(valid); badMetric.regions["countries-9"].population!.value = -1;
  assert.deepEqual(parseCountryAtlas(badMetric), {});
});
