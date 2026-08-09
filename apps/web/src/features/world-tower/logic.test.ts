import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WORLD_MAP_NODE_ROW_HEIGHT,
  activeLevelAtViewport,
  atlasCellPlacement,
  bottomAlignedScrollTop,
  frameQualityForLevel,
  initialWorldTowerTarget,
  layoutWorldTowerMap,
  traceWorldTowerRelations,
  visibleNodeName,
} from "./logic";
import type { WorldTowerLevel, WorldTowerMapEdge, WorldTowerNode } from "./types";

function level(id: string, order: number): WorldTowerLevel {
  return { id, order, name: id, description: "", imagePath: "" };
}

function node(id: string, levelId: string): WorldTowerNode {
  return { id, name: id, levelId, clusterId: levelId } as WorldTowerNode;
}

describe("material tower presentation logic", () => {
  it("positions atlas cells safely", () => {
    assert.deepEqual(atlasCellPlacement({ columns: 4, rows: 3, index: 99 }), {
      widthPercent: 400,
      heightPercent: 300,
      translateXPercent: -75,
      translateYPercent: -(2 / 3) * 100,
    });
  });

  it("uses richer frames toward the universe end of all sixteen levels", () => {
    assert.equal(frameQualityForLevel(1), "legendary");
    assert.equal(frameQualityForLevel(4), "legendary");
    assert.equal(frameQualityForLevel(5), "epic");
    assert.equal(frameQualityForLevel(9), "rare");
    assert.equal(frameQualityForLevel(13), "common");
    assert.equal(frameQualityForLevel(16), "common");
  });

  it("keeps locked node names mysterious until they are unlocked", () => {
    const locked = { ...node("水", "matter"), isUnlocked: false };
    assert.equal(visibleNodeName(locked), "？");
    assert.equal(visibleNodeName({ ...locked, isUnlocked: true }), "水");
  });

  it("opens at the bottom particle level and prefers the electron", () => {
    const levels = [level("universe", 1), level("particles", 16)];
    const nodes = [
      { ...node("proton", "particles"), name: "质子" },
      { ...node("electron", "particles"), name: "电子" },
      node("space", "universe"),
    ];
    assert.deepEqual(initialWorldTowerTarget(nodes, levels), {
      levelId: "particles",
      nodeId: "electron",
    });
    assert.equal(bottomAlignedScrollTop(2_400, 600, 1), 1_800);
    assert.equal(bottomAlignedScrollTop(400, 600, 1), 0);
  });

  it("lays universe at the top and particles at the bottom", () => {
    const levels = [level("universe", 1), level("matter", 8), level("particles", 16)];
    const nodes = [node("u", "universe"), node("m", "matter"), node("p", "particles")];
    const layout = layoutWorldTowerMap(nodes, [], levels);
    assert.ok(layout.positions.get("u")!.y < layout.positions.get("m")!.y);
    assert.ok(layout.positions.get("m")!.y < layout.positions.get("p")!.y);
  });

  it("places all 118 elements in compact rows and preserves every node", () => {
    const nodes = Array.from({ length: 118 }, (_, index) => node(`element:${index}`, "elements"));
    const layout = layoutWorldTowerMap(nodes, [], [level("elements", 15)], 1_220);
    assert.equal(layout.positions.size, 118);
    assert.equal(layout.columnCount, 10);
    const distinctRows = new Set(nodes.map((item) => layout.positions.get(item.id)!.y));
    assert.equal(distinctRows.size, 12);
    const band = layout.bands.get("elements")!;
    assert.ok(band.height < 12 * WORLD_MAP_NODE_ROW_HEIGHT + 100);
  });

  it("centers rows while adding columns in a wider viewport", () => {
    const nodes = Array.from({ length: 11 }, (_, index) => node(`wide:${index}`, "one"));
    const layout = layoutWorldTowerMap(nodes, [], [level("one", 1)], 1_600);
    const center = nodes.reduce((sum, item) => sum + layout.positions.get(item.id)!.x, 0) / nodes.length;
    assert.equal(layout.columnCount, 11);
    assert.equal(center, 800);
  });

  it("finds the active rail item from the independent graph viewport", () => {
    const levels = [level("one", 1), level("two", 2), level("three", 3)];
    const layout = layoutWorldTowerMap(
      [node("a", "one"), node("b", "two"), node("c", "three")],
      [],
      levels,
    );
    const second = layout.bands.get("two")!;
    assert.equal(activeLevelAtViewport(layout.bands, levels, second.top, 200, 1), "two");
    assert.equal(activeLevelAtViewport(layout.bands, levels, second.top * 0.8, 160, 0.8), "two");
    assert.equal(activeLevelAtViewport(layout.bands, levels, layout.height - 500, 500, 1), "three");
  });

  it("traces only a selected node's immediate prerequisites and dependents", () => {
    const edges = [
      { sourceId: "root", targetId: "water", recipeId: "one" },
      { sourceId: "water", targetId: "flood", recipeId: "two" },
      { sourceId: "flood", targetId: "landform", recipeId: "three" },
    ] satisfies WorldTowerMapEdge[];
    const relation = traceWorldTowerRelations("flood", edges);
    assert.deepEqual([...relation.ancestors], ["water"]);
    assert.deepEqual([...relation.descendants], ["landform"]);
    assert.equal(relation.ancestors.has("root"), false);
  });
});
