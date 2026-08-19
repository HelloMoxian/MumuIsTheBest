import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { echoIslandRewardMultiplier } from "./world-tower.js";

describe("English Echo Island critical reward", () => {
  it("uses a fixed 15 percent boundary and returns only one-times or five-times", () => {
    assert.equal(echoIslandRewardMultiplier(() => 0), 5);
    assert.equal(echoIslandRewardMultiplier(() => 0.149999), 5);
    assert.equal(echoIslandRewardMultiplier(() => 0.15), 1);
    assert.equal(echoIslandRewardMultiplier(() => 0.99), 1);
  });
});
