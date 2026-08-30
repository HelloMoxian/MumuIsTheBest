import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cappedEchoIslandAutoPlayReward,
  ECHO_ISLAND_AUTO_PLAY_REWARD_LIMIT,
  echoIslandRewardMultiplier,
} from "./world-tower.js";

describe("English Echo Island critical reward", () => {
  it("uses a fixed 15 percent boundary and returns only one-times or five-times", () => {
    assert.equal(echoIslandRewardMultiplier(() => 0), 5);
    assert.equal(echoIslandRewardMultiplier(() => 0.149999), 5);
    assert.equal(echoIslandRewardMultiplier(() => 0.15), 1);
    assert.equal(echoIslandRewardMultiplier(() => 0.99), 1);
  });

  it("caps each continuous-play batch at exactly twenty knowledge coins", () => {
    assert.equal(ECHO_ISLAND_AUTO_PLAY_REWARD_LIMIT, 20);
    assert.equal(cappedEchoIslandAutoPlayReward(0, 5), 5);
    assert.equal(cappedEchoIslandAutoPlayReward(18, 5), 2);
    assert.equal(cappedEchoIslandAutoPlayReward(19, 1), 1);
    assert.equal(cappedEchoIslandAutoPlayReward(20, 5), 0);
    assert.equal(cappedEchoIslandAutoPlayReward(25, 1), 0);
  });
});
