import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WORLD_MAP_GRAPH_CENTER_X,
  atlasCellPlacement,
  frameQualityForLevel,
  hasRequirement,
  layoutWorldTowerMap,
  resourceCount,
  shouldDisplayRecipeRequirement,
  traceWorldTowerRelations,
  visibleNodeName,
} from "./logic";
import type {
  WorldTowerLevel,
  WorldTowerMapEdge,
  WorldTowerNode,
  WorldTowerProgress,
  WorldTowerResource,
} from "./types";

const progress: WorldTowerProgress = {
  schemaVersion: 1,
  graphId: "graph",
  updatedAt: "2026-08-05T00:00:00.000Z",
  coinBalance: 10,
  unlockedNodeIds: [],
  permanentResourceIds: ["knowledge:mechanics"],
  resourceInventory: { "action:assemble": 2, "particle-pack:electron": 1 },
};

function resource(
  id: string,
  inventoryMode: WorldTowerResource["inventoryMode"],
): WorldTowerResource {
  return {
    id,
    kind: id.startsWith("particle-pack:")
      ? "particle"
      : id.split(":")[0] as WorldTowerResource["kind"],
    name: id,
    description: id,
    inventoryMode,
    shop: { purchasable: inventoryMode !== "state", coinCost: 1 },
    imagePath: null,
    price: null,
  };
}

describe("world tower presentation logic", () => {
  it("positions a non-square atlas cell without depending on the display frame ratio", () => {
    assert.deepEqual(atlasCellPlacement({ columns: 24, rows: 21, index: 458 }), {
      widthPercent: 2_400,
      heightPercent: 2_100,
      translateXPercent: -(2 / 24) * 100,
      translateYPercent: -(19 / 21) * 100,
    });
    assert.deepEqual(atlasCellPlacement({ columns: 4, rows: 3, index: 99 }), {
      widthPercent: 400,
      heightPercent: 300,
      translateXPercent: -75,
      translateYPercent: -(2 / 3) * 100,
    });
  });

  it("maps all fifteen levels into four stable frame qualities", () => {
    assert.equal(frameQualityForLevel(1), "common");
    assert.equal(frameQualityForLevel(3), "common");
    assert.equal(frameQualityForLevel(4), "rare");
    assert.equal(frameQualityForLevel(8), "epic");
    assert.equal(frameQualityForLevel(12), "legendary");
    assert.equal(frameQualityForLevel(15), "legendary");
  });

  it("keeps locked node names hidden", () => {
    const node = {
      id: "node",
      name: "水",
      isUnlocked: false,
    } as WorldTowerNode;
    assert.equal(visibleNodeName(node), "未发现");
    assert.equal(visibleNodeName({ ...node, isUnlocked: true }), "水");
  });

  it("distinguishes charges, permanent knowledge and state requirements", () => {
    const electronPack = resource("particle-pack:electron", "charge");
    const action = resource("action:assemble", "charge");
    const knowledge = resource("knowledge:mechanics", "permanent-unlock");
    const environment = resource("environment:workbench", "state");

    assert.equal(resourceCount(electronPack, progress), 1);
    assert.equal(resourceCount(action, progress), 2);
    assert.equal(resourceCount(knowledge, progress), "permanent");
    assert.equal(resourceCount(environment, progress), "state");
    assert.equal(hasRequirement(electronPack, { resourceId: electronPack.id, amount: 1 }, progress), true);
    assert.equal(hasRequirement(electronPack, { resourceId: electronPack.id, amount: 2 }, progress), false);
    assert.equal(hasRequirement(action, { resourceId: action.id, amount: 2 }, progress), true);
    assert.equal(hasRequirement(action, { resourceId: action.id, amount: 3 }, progress), false);
    assert.equal(hasRequirement(knowledge, { resourceId: knowledge.id, amount: 1 }, progress), true);
    assert.equal(hasRequirement(environment, { resourceId: environment.id, amount: 1 }, progress), true);
  });

  it("hides learned knowledge while keeping missing knowledge and other preparations visible", () => {
    const learnedKnowledge = resource("knowledge:mechanics", "permanent-unlock");
    const missingKnowledge = resource("knowledge:astronomy", "permanent-unlock");
    const action = resource("action:assemble", "charge");

    assert.equal(shouldDisplayRecipeRequirement(
      "knowledge",
      { resourceId: learnedKnowledge.id, amount: 1 },
      learnedKnowledge,
      progress,
    ), false);
    assert.equal(shouldDisplayRecipeRequirement(
      "knowledge",
      { resourceId: missingKnowledge.id, amount: 1 },
      missingKnowledge,
      progress,
    ), true);
    assert.equal(shouldDisplayRecipeRequirement(
      "actions",
      { resourceId: action.id, amount: 1 },
      action,
      progress,
    ), true);
  });

  it("lays every level into one continuous map from macro top to particle bottom", () => {
    const levels = [
      { id: "low", order: 1, name: "粒子", description: "", imagePath: "" },
      { id: "middle", order: 2, name: "元素", description: "", imagePath: "" },
      { id: "high", order: 3, name: "物质", description: "", imagePath: "" },
    ] satisfies WorldTowerLevel[];
    const nodes = [
      { id: "a", levelId: "low", clusterId: "a" },
      { id: "b", levelId: "low", clusterId: "b" },
      { id: "c", levelId: "middle", clusterId: "c" },
      { id: "d", levelId: "high", clusterId: "d" },
    ] as WorldTowerNode[];
    const edges = [
      { sourceId: "a", targetId: "c", recipeId: "one" },
      { sourceId: "c", targetId: "d", recipeId: "two" },
    ] satisfies WorldTowerMapEdge[];
    const layout = layoutWorldTowerMap(nodes, edges, levels);
    assert.ok(layout.positions.get("d")!.y < layout.positions.get("c")!.y);
    assert.ok(layout.positions.get("c")!.y < layout.positions.get("a")!.y);
    assert.notEqual(layout.positions.get("a")!.x, layout.positions.get("b")!.x);
  });

  it("traces only the selected node's direct inputs and outputs", () => {
    const edges = [
      { sourceId: "root", targetId: "water", recipeId: "one" },
      { sourceId: "water", targetId: "flood", recipeId: "two" },
      { sourceId: "flood", targetId: "landform", recipeId: "three" },
      { sourceId: "other", targetId: "landform", recipeId: "four" },
    ] satisfies WorldTowerMapEdge[];
    const relation = traceWorldTowerRelations("flood", edges);
    assert.deepEqual([...relation.ancestors], ["water"]);
    assert.deepEqual([...relation.descendants], ["landform"]);
    assert.equal(relation.ancestors.has("root"), false);
    assert.equal(relation.ancestors.has("other"), false);
  });

  it("expands one scale into groups of at most six nodes per row", () => {
    const levels = [
      { id: "low", order: 1, name: "粒子", description: "", imagePath: "" },
      { id: "high", order: 2, name: "元素", description: "", imagePath: "" },
    ] satisfies WorldTowerLevel[];
    const nodes = Array.from({ length: 25 }, (_, index) => ({
      id: "element:" + String(index),
      levelId: "high",
      clusterId: "elements",
    })) as WorldTowerNode[];
    const group = {
      id: "elements:one",
      name: "化学元素",
      clusterId: "elements",
      nodeIds: nodes.map((node) => node.id),
    };
    const layout = layoutWorldTowerMap(nodes, [], levels, {
      levelId: "high",
      groups: [group],
    });
    assert.ok(layout.bands.get("high")!.height > 1_300);
    assert.equal(layout.groupLayouts[0].nodeCount, 25);
    const rows = new Map<number, number>();
    for (const node of nodes) {
      const y = layout.positions.get(node.id)!.y;
      rows.set(y, (rows.get(y) ?? 0) + 1);
    }
    assert.deepEqual([...rows.values()], [6, 6, 6, 6, 1]);
    for (const y of rows.keys()) {
      const rowNodes = nodes.filter((node) => layout.positions.get(node.id)!.y === y);
      const center = rowNodes.reduce((sum, node) => sum + layout.positions.get(node.id)!.x, 0)
        / rowNodes.length;
      assert.equal(center, WORLD_MAP_GRAPH_CENTER_X);
    }
  });

  it("wraps overview layers after six nodes instead of widening the map", () => {
    const levels = [
      { id: "one", order: 1, name: "元素", description: "", imagePath: "" },
    ] satisfies WorldTowerLevel[];
    const nodes = Array.from({ length: 10 }, (_, index) => ({
      id: "overview:" + String(index),
      levelId: "one",
      clusterId: "overview",
    })) as WorldTowerNode[];
    const layout = layoutWorldTowerMap(nodes, [], levels);
    const rows = new Map<number, number>();
    for (const node of nodes) {
      const y = layout.positions.get(node.id)!.y;
      rows.set(y, (rows.get(y) ?? 0) + 1);
    }
    assert.equal(layout.width, 1_120);
    assert.deepEqual([...rows.values()], [6, 4]);
    for (const y of rows.keys()) {
      const rowNodes = nodes.filter((node) => layout.positions.get(node.id)!.y === y);
      const center = rowNodes.reduce((sum, node) => sum + layout.positions.get(node.id)!.x, 0)
        / rowNodes.length;
      assert.equal(center, WORLD_MAP_GRAPH_CENTER_X);
    }
  });

  it("fills a wider viewport while keeping each node row centered", () => {
    const levels = [
      { id: "one", order: 1, name: "元素", description: "", imagePath: "" },
    ] satisfies WorldTowerLevel[];
    const nodes = Array.from({ length: 6 }, (_, index) => ({
      id: "wide:" + String(index),
      levelId: "one",
      clusterId: "wide",
    })) as WorldTowerNode[];
    const availableWidth = 1_600;
    const layout = layoutWorldTowerMap(nodes, [], levels, null, availableWidth);
    const center = nodes.reduce(
      (sum, node) => sum + layout.positions.get(node.id)!.x,
      0,
    ) / nodes.length;

    assert.equal(layout.width, availableWidth);
    assert.equal(
      center,
      WORLD_MAP_GRAPH_CENTER_X + (availableWidth - 1_120) / 2,
    );
  });
});
