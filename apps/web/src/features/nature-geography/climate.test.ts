import assert from "node:assert/strict";
import { test } from "node:test";
import { CLIMATE_GROUPS, CLIMATE_VIEWS, availableClimateGroups, climateGroupState, toggleClimateGroup } from "./climate";
import { EMPTY, normalizeWorldLabels, selectedRegionIds, type MapFeature } from "./model";

const codes = ["Af","Am","Aw","BWh","BWk","BSh","BSk","Csa","Csb","Csc","Cwa","Cwb","Cwc","Cfa","Cfb","Cfc","Dsa","Dsb","Dsc","Dsd","Dwa","Dwb","Dwc","Dwd","Dfa","Dfb","Dfc","Dfd","ET","EF"];
const polygon = (id: string, name: string, kind = "climate"): MapFeature => ({
  type: "Feature", properties: { id, name, kind, color: Number(id.at(-1)) || 0 },
  geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
});
test("every climate view covers all 30 types without invented codes", () => {
  for (const view of CLIMATE_VIEWS) assert.deepEqual(new Set(CLIMATE_GROUPS[view].flatMap(g => g.codes)), new Set(codes));
});
test("desert selection includes hot and cold deserts; parent and child share checked/mixed state", () => {
  const desert = CLIMATE_GROUPS["常见类型"].find(g => g.name === "沙漠")!.codes;
  assert.deepEqual(desert, ["BWh", "BWk"]);
  let selected = toggleClimateGroup(["Af"], desert);
  assert.deepEqual(selected, ["Af", "BWh", "BWk"]);
  assert.deepEqual(climateGroupState(selected, desert), { checked: true, mixed: false });
  selected = toggleClimateGroup(selected, ["BWh"]);
  assert.deepEqual(climateGroupState(selected, desert), { checked: false, mixed: true });
  assert.deepEqual(new Set(toggleClimateGroup(selected, desert)), new Set(["Af", "BWh", "BWk"]));
  assert.deepEqual(toggleClimateGroup(["Af", ...desert], desert), ["Af"]);
});
test("overlapping perspectives keep one shared set, and missing types never become phantom selections", () => {
  const dry = CLIMATE_GROUPS["干湿季节"][0].codes;
  const selected = toggleClimateGroup(["BWh", "BWk"], dry);
  assert.equal(selected.length, 4);
  assert.equal(new Set(selected).size, selected.length);
  assert.deepEqual(climateGroupState([], []), { checked: false, mixed: false });
  assert.deepEqual(availableClimateGroups(EMPTY, "冷暖"), []);
  const old = { ...EMPTY, features: [polygon("BWh", "炎热沙漠")] };
  assert.deepEqual(availableClimateGroups(old, "常见类型"), [{ name: "沙漠", codes: ["BWh"] }]);
});
test("ocean color and selection follow names across the equator, not feature order", () => {
  const data = { ...EMPTY, features: [polygon("o1", "太平洋", "oceans"), polygon("o4", "太平洋", "oceans"),
    polygon("o2", "大西洋", "oceans"), polygon("o6", "大西洋", "oceans"), polygon("o5", "印度洋", "oceans")] };
  const normalized = normalizeWorldLabels(data);
  assert.equal(normalized.features[0].properties.color, normalized.features[1].properties.color);
  assert.equal(normalized.features[2].properties.color, normalized.features[3].properties.color);
  assert.deepEqual(selectedRegionIds(normalized, "o1"), ["o1", "o4"]);
  assert.deepEqual(selectedRegionIds(normalized, "o6"), ["o2", "o6"]);
  assert.deepEqual(selectedRegionIds(normalized, "missing"), []);
  assert.equal(normalized.features[0].geometry, data.features[0].geometry);
});
