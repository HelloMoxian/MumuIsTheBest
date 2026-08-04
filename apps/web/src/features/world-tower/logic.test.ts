import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  frameQualityForLevel,
  hasRequirement,
  resourceCount,
  visibleNodeName,
} from "./logic";
import type { WorldTowerNode, WorldTowerProgress, WorldTowerResource } from "./types";

const progress: WorldTowerProgress = {
  schemaVersion: 1,
  graphId: "graph",
  updatedAt: "2026-08-05T00:00:00.000Z",
  coinBalance: 10,
  unlockedNodeIds: [],
  permanentResourceIds: ["knowledge:mechanics"],
  resourceInventory: { "action:assemble": 2 },
};

function resource(
  id: string,
  inventoryMode: WorldTowerResource["inventoryMode"],
): WorldTowerResource {
  return {
    id,
    kind: id.split(":")[0] as WorldTowerResource["kind"],
    name: id,
    description: id,
    inventoryMode,
    shop: { purchasable: inventoryMode !== "state", coinCost: 1 },
    imagePath: null,
    price: null,
  };
}

describe("world tower presentation logic", () => {
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
    const action = resource("action:assemble", "charge");
    const knowledge = resource("knowledge:mechanics", "permanent-unlock");
    const environment = resource("environment:workbench", "state");

    assert.equal(resourceCount(action, progress), 2);
    assert.equal(resourceCount(knowledge, progress), "permanent");
    assert.equal(resourceCount(environment, progress), "state");
    assert.equal(hasRequirement(action, { resourceId: action.id, amount: 2 }, progress), true);
    assert.equal(hasRequirement(action, { resourceId: action.id, amount: 3 }, progress), false);
    assert.equal(hasRequirement(knowledge, { resourceId: knowledge.id, amount: 1 }, progress), true);
    assert.equal(hasRequirement(environment, { resourceId: environment.id, amount: 1 }, progress), true);
  });
});
