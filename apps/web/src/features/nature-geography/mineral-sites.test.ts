import assert from "node:assert/strict";
import { test } from "node:test";
import rawSites from "../../../../../content/nature/maps/mineral-sites.v1.json";
import { MINERAL_RESOURCES } from "./minerals";
import { MINERAL_SITES, mineralSites, parseMineralSites, mineralSymbol, mineralZoneFocus } from "./mineral-sites";

test("curated localities cover every resource and carry provenance and honest coordinate precision", () => {
  assert.equal(MINERAL_SITES.length, rawSites.sites.length);
  assert.ok(MINERAL_SITES.length >= 150);
  for (const r of MINERAL_RESOURCES) {
    assert.ok(MINERAL_SITES.filter(s => s.resources.includes(r.id)).length >= 2, r.id);
    assert.notEqual(mineralSymbol(r.id).char, "?");
  }
  for (const s of MINERAL_SITES) {
    assert.equal(new URL(s.source).protocol, "https:");
    assert.ok(s.accuracy && s.coordinateSource && s.asOf);
    assert.notEqual(s.coordinates.join(","), "0,0");
  }
});
test("oil is located in North African fields and inside Russia, never painted across national polygons", () => {
  const oil = mineralSites(["oil"]);
  assert.ok(oil.features.every(f => f.geometry.type === "Point"));
  for (const region of ["利比亚", "阿尔及利亚", "埃及", "西西伯利亚", "伏尔加—乌拉尔"]) {
    assert.ok(oil.features.some(f => String(f.properties.region).includes(region)), region);
  }
  assert.ok(oil.features.filter(f => f.geometry.type === "Point" && f.geometry.coordinates[0] > 43 && f.geometry.coordinates[0] < 57 && f.geometry.coordinates[1] > 21 && f.geometry.coordinates[1] < 33).length >= 25);
  const daqing = oil.features.find(f => f.properties.name === "大庆油田·萨尔图")!;
  const shengli = oil.features.find(f => f.properties.name === "胜利油田·胜坨")!;
  assert.ok(daqing && shengli);
  if (daqing.geometry.type === "Point") assert.ok(daqing.geometry.coordinates[1] > 45 && daqing.geometry.coordinates[1] < 48);
  if (shengli.geometry.type === "Point") assert.ok(shengli.geometry.coordinates[1] > 36 && shengli.geometry.coordinates[1] < 39);
});
test("co-products remain one location, with deterministic symbols independent of selection order", () => {
  const cu = mineralSites(["copper"]), co = mineralSites(["cobalt"]);
  const both = mineralSites(["cobalt", "copper", "copper"]);
  const union = new Set([...cu.features, ...co.features].map(f => f.properties.id));
  assert.equal(both.features.length, union.size);
  const tenke = both.features.find(f => f.properties.id === "site-tenke")!;
  assert.equal(tenke.properties.resourceIds, "copper|cobalt");
  assert.equal(mineralSites(["cobalt"]).features.find(f => f.properties.id === "site-tenke")!.properties.resourceIds, "cobalt");
  assert.deepEqual(both, mineralSites(["copper", "cobalt"]));
  assert.equal(mineralSites([]).features.length, 0);
  assert.equal(mineralSites(["unknown"]).features.length, 0);
});
test("future/corrupt catalogues fail closed instead of inventing locations or resources", () => {
  assert.deepEqual(parseMineralSites(null), []);
  assert.deepEqual(parseMineralSites({ ...rawSites, schemaVersion: 2 }), []);
  assert.deepEqual(parseMineralSites({ ...rawSites, sites: [] }), []);
  for (const patch of [
    { coordinates: [190, 30] }, { coordinates: [30, NaN] }, { coordinates: [0] },
    { resources: ["unverified"] }, { resources: [] }, { resources: ["oil", "oil"] },
    { source: "javascript:alert(1)" }, { accuracy: "" }, { coordinateSource: "" }, { name: "" },
  ]) {
    const bad = structuredClone(rawSites); Object.assign(bad.sites[0], patch);
    assert.deepEqual(parseMineralSites(bad), [], JSON.stringify(patch));
  }
  assert.deepEqual(parseMineralSites({ ...rawSites, sites: [...rawSites.sites, rawSites.sites[0]] }), []);
});
test("navigation boxes never enter the resource data", () => {
  assert.equal(mineralZoneFocus("unknown"), null);
  assert.equal(mineralZoneFocus("gulf")!.geometry.type, "Polygon");
  assert.ok(mineralSites(MINERAL_RESOURCES.map(r => r.id)).features.every(f => f.geometry.type === "Point"));
});
