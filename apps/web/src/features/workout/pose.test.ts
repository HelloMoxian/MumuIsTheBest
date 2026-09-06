import assert from "node:assert/strict";
import test from "node:test";
import { poseFor } from "./Coach";
import { MOVES } from "../../../../server/src/workout-contract";
test("every exercise has finite, visible joint poses throughout both alternating cycles", () => {
  for (const move of MOVES) {
    for (let frame = 0; frame <= 120; frame++) {
      const pose = poseFor(move.id, frame / 60);
      for (const [key, value] of Object.entries(pose)) {
        const points = ["head", "chest", "hips"].includes(key) ? [value] : value;
        for (const point of points as number[][]) {
          assert.equal(point.length, 3);
          assert.ok(point.every(Number.isFinite), move.id + ":" + key);
          assert.ok(point[0] > -1.1 && point[0] < 1.1 && point[1] >= 0 && point[1] < 2.5);
        }
      }
    }
    assert.deepEqual(poseFor(move.id, 0), poseFor(move.id, 2), move.id + " must loop smoothly");
  }
});
test("squat feet remain grounded, hips move back and down, hands extend forward", () => {
  const standing = poseFor("squat", 0), down = poseFor("squat", .5);
  assert.deepEqual(standing.feet, down.feet);
  assert.ok(down.hips[1] < standing.hips[1] && down.hips[2] < standing.hips[2]);
  assert.ok(down.knees[0][2] > standing.knees[0][2]);
  assert.ok(down.hands[0][2] > standing.hands[0][2]);
});
test("alternating knees use both sides, rest stays still, jumping lifts both feet", () => {
  assert.ok(poseFor("knees", .5).feet[1][1] > poseFor("knees", .5).feet[0][1]);
  assert.ok(poseFor("knees", 1.5).feet[0][1] > poseFor("knees", 1.5).feet[1][1]);
  assert.deepEqual(poseFor("rest", 0), poseFor("rest", .5));
  assert.ok(poseFor("jack", .5).feet.every(p => p[1] > .1));
});

