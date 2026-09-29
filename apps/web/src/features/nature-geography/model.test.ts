import assert from "node:assert/strict";
import { test } from "node:test";
import { canShowPhoto, CORE_LANGUAGES, coreLanguageRegions, languageStripe, selectedRegionIds, normalizeWorldLabels, clusterSummary, pointTitle, usesTerrain, featureBounds, featureCenter, featureFocusBounds, shouldDrill, visibleFeatures, type MapFeature } from "./model";
const polygon: MapFeature = { type: "Feature", properties: { id: "1", name: "测试省", detail: "山脉" },
  geometry: { type: "MultiPolygon", coordinates: [[[[100, 20], [103, 20], [103, 24], [100, 20]]], [[[105, 25], [106, 25], [106, 26], [105, 25]]]] } };
test("multipart island bounds include all polygons and remain finite", () => {
  assert.deepEqual(featureBounds(polygon), [[100, 20], [106, 26]]);
  assert.deepEqual(featureBounds({ ...polygon, geometry: { type: "Point", coordinates: [120, 30] } }), [[120, 30], [120, 30]]);
});
test("labels stay on the main land component instead of between distant islands", () => {
  const center = featureCenter(polygon)!;
  assert.ok(center[0] >= 100 && center[0] <= 103);
  assert.ok(center[1] >= 20 && center[1] <= 24);
  assert.deepEqual(featureCenter(polygon), center);
  assert.deepEqual(featureFocusBounds({ ...polygon, properties: { ...polygon.properties, kind: "countries" } }), [[100, 20], [103, 24]]);
});
test("search uses source names and metadata, and never creates invented regions", () => {
  const data = { type: "FeatureCollection" as const, features: [polygon, { ...polygon, properties: { id: "supplement", name: "" } }] };
  assert.equal(visibleFeatures(data, "山脉").length, 1); assert.equal(visibleFeatures(data, "").length, 1);
  assert.equal(visibleFeatures(data, "未收录").length, 0);
});
test("photos and automatic administrative drill-down have explicit zoom thresholds", () => {
  assert.equal(canShowPhoto(7.99), false); assert.equal(canShowPhoto(8), true);
  assert.equal(shouldDrill(6, 1), true); assert.equal(shouldDrill(8.4, 2), false);
  assert.equal(shouldDrill(8.5, 2), true); assert.equal(shouldDrill(16, 3), false);
});

test("old map packs receive simplified labels and consistent China region coloring without geometry changes", () => {
  const feature = (name: string, kind = "countries", color = 4): MapFeature => ({ ...polygon, properties: { name, kind, color, id: name } });
  const originals = [feature("中华人民共和国", "countries", 2), feature("中华民国"), feature("香港"), feature("澳门"), feature("裏海", "oceans"), feature("孟加拉灣", "oceans"), feature("巴倫支海", "oceans"), feature("臺灣", "languages")];
  const result = normalizeWorldLabels({ type: "FeatureCollection", features: originals });
  assert.deepEqual(result.features.map(f => f.properties.name), ["中华人民共和国", "中国台湾", "中国香港", "中国澳门", "里海", "孟加拉湾", "巴伦支海", "臺灣"]);
  for (const i of [1, 2, 3]) { assert.equal(result.features[i].properties.color, 2); assert.equal(result.features[i].properties.group, "中国"); }
  assert.equal(result.features[1].geometry, originals[1].geometry);
  assert.equal(originals[1].properties.name, "中华民国");
  assert.deepEqual(normalizeWorldLabels(result), result);
  assert.equal(visibleFeatures(result, "里海").length, 1);
  assert.equal(visibleFeatures(result, "中国台湾").length, 1);
  assert.deepEqual(normalizeWorldLabels({ type: "FeatureCollection", features: [] }).features, []);
});
test("point feedback explains cluster counts, supplies unnamed-point titles, and oceans share terrain", () => {
  assert.match(clusterSummary("languages", 42), /42 个语种/);
  assert.match(clusterSummary("minerals", 7), /7 个矿点/);
  assert.match(clusterSummary("elevation", 12), /12 个高程点/);
  assert.equal(pointTitle({ ...polygon, properties: { name: "", kind: "elevation" } }), "未命名高程点");
  assert.equal(usesTerrain("elevation"), true); assert.equal(usesTerrain("oceans"), true);
  assert.equal(usesTerrain("countries"), false); assert.equal(usesTerrain("climate"), false);
});

test("selecting China links Taiwan, Hong Kong and Macao consistently, and switching clears the group", () => {
  const countries = normalizeWorldLabels({ type: "FeatureCollection", features: ["中华人民共和国", "中华民国", "香港", "澳门", "日本"].map((name, i) =>
    ({ ...polygon, properties: { id: String(i), name, kind: "countries", color: i } })) });
  assert.deepEqual(selectedRegionIds(countries, "0"), ["0", "1", "2", "3"]);
  assert.deepEqual(selectedRegionIds(countries, "4"), ["4"]);
  assert.deepEqual(selectedRegionIds(countries, "1"), ["1"]);
  assert.deepEqual(selectedRegionIds(countries, ""), []);
  assert.deepEqual(selectedRegionIds({ ...countries, features: countries.features.slice(0, 2) }, "0"), ["0", "1"]);
  const provinces = { ...countries, features: countries.features.map(f => ({ ...f, properties: { ...f.properties, kind: "province" } })) };
  assert.deepEqual(selectedRegionIds(provinces, "0"), ["0"]);
});

test("language overview uses at most two selected languages per country and never retains point clouds", () => {
  const country = (id: string, name: string): MapFeature => ({ ...polygon, properties: { id, name, kind: "countries" } });
  const countries = { type: "FeatureCollection" as const, features: [country("countries-9", "中华人民共和国"), country("countries-155", "加拿大"), country("countries-49", "德国"), country("unlisted", "未列入地区")] };
  const regions = coreLanguageRegions(countries);
  assert.equal(CORE_LANGUAGES.length, 18);
  assert.equal(regions.features[0].properties.primaryLanguage, "zh");
  assert.equal(regions.features[0].properties.secondaryLanguage, "");
  assert.equal(regions.features[1].properties.primaryLanguage, "en");
  assert.equal(regions.features[1].properties.secondaryLanguage, "fr");
  assert.equal(regions.features[2].properties.primaryLanguage, "de");
  assert.equal(regions.features[2].properties.secondaryLanguage, ""); // English learners do not make Germany an English region.
  assert.equal(regions.features[3].properties.primaryLanguage, "other");
  assert.ok(regions.features.every((f, i) => f.geometry === countries.features[i].geometry));
  assert.equal(visibleFeatures(regions, "法语").length, 1);
  assert.equal(coreLanguageRegions({ ...countries, features: [country("countries-9", "Different pack order")] }).features[0].properties.primaryLanguage, "other");
  assert.deepEqual(coreLanguageRegions({ type: "FeatureCollection", features: [] }).features, []);
});
test("secondary language stripes preserve transparent base-color gaps", () => {
  const stripe = languageStripe("#123456");
  assert.equal(stripe.data.length, 16 * 16 * 4);
  assert.deepEqual([...stripe.data.slice(0, 4)], [18, 52, 86, 255]);
  assert.equal(stripe.data[8 * 4 + 3], 0);
});
