import assert from "node:assert/strict";
import test from "node:test";
import type { MoveId } from "./plan";
import { FLOOR_HEIGHT, MOM_LIMBS, momPoseFor, type Point } from "./pose";

const moves: MoveId[] = ["march", "step", "heel-dig", "reach", "knee-drive", "punch", "squat", "skater", "jack", "hamstring-curl", "side-stretch", "calf-stretch", "quad-stretch", "chest-open", "breathe"];
const distance = (a: Point, b: Point) => Math.hypot(...a.map((v, i) => v - b[i]));

test("every demonstration retains adult bone lengths and finite joints throughout both sides and impact settings", () => {
  for (const move of moves) for (const low of [false, true]) for (const side of ["left", "right"] as const) {
    for (let frame = 0; frame <= 160; frame++) {
      const pose = momPoseFor(move, frame / 80, low, side);
      for (const value of Object.values(pose)) {
        const numbers = value.flat();
        assert.ok(numbers.every(Number.isFinite), `${move} has finite coordinates`);
      }
      for (let i = 0; i < 2; i++) {
        const segments = [
          [pose.hipsPair[i], pose.knees[i], MOM_LIMBS.thigh],
          [pose.knees[i], pose.feet[i], MOM_LIMBS.shin],
          [pose.shoulders[i], pose.elbows[i], MOM_LIMBS.upperArm],
          [pose.elbows[i], pose.hands[i], MOM_LIMBS.forearm],
        ] as const;
        for (const [a, b, expected] of segments) {
          assert.ok(Math.abs(distance(a, b) - expected) < .00001, `${move} / ${frame} / ${low} has length ${distance(a, b)} vs ${expected}`);
        }
        assert.ok(pose.feet[i][1] >= FLOOR_HEIGHT, `${move}: no foot below the floor`);
      }
    }
    assert.deepEqual(momPoseFor(move, 0, low, side), momPoseFor(move, 2, low, side), `${move} loops`);
    const before = momPoseFor(move, 1 - .000001, low, side), after = momPoseFor(move, 1 + .000001, low, side);
    for (let i = 0; i < 2; i++) {
      assert.ok(distance(before.hands[i], after.hands[i]) < .0001, `${move} hands transition continuously between sides`);
      assert.ok(distance(before.feet[i], after.feet[i]) < .0001, `${move} feet transition continuously between sides`);
    }
  }
});

test("low-impact demonstrations retain at least one grounded foot without jumping", () => {
  for (const move of moves) for (let frame = 0; frame < 100; frame++) {
    const p = momPoseFor(move, frame / 50, true);
    assert.ok(p.feet.some(foot => Math.abs(foot[1] - FLOOR_HEIGHT) < .00001), move);
  }
  assert.ok(momPoseFor("jack", .25).feet.every(foot => foot[1] > FLOOR_HEIGHT));
  assert.ok(momPoseFor("jack", .25, true).feet.every(foot => foot[1] === FLOOR_HEIGHT));
});

test("stretch sequences hold stable poses and both unilateral sides can be demonstrated", () => {
  for (const move of ["side-stretch", "calf-stretch", "quad-stretch", "chest-open"] as const) {
    assert.deepEqual(momPoseFor(move, 0), momPoseFor(move, 5.37), move);
    if (move !== "chest-open") assert.notDeepEqual(momPoseFor(move, 0, false, "left"), momPoseFor(move, 0, false, "right"));
  }
});

test("squats sit back and down, knee drives alternate, punches reach forward, and curls move behind", () => {
  const standing = momPoseFor("squat", 0), squat = momPoseFor("squat", .5);
  assert.deepEqual(squat.feet, standing.feet);
  assert.ok(squat.hips[1] < standing.hips[1] && squat.hips[2] < standing.hips[2]);
  assert.ok(squat.shouldersCenter[2] > squat.hips[2]);
  assert.ok(momPoseFor("knee-drive", .5).feet[1][1] > momPoseFor("knee-drive", .5).feet[0][1]);
  assert.ok(momPoseFor("knee-drive", 1.5).feet[0][1] > momPoseFor("knee-drive", 1.5).feet[1][1]);
  assert.ok(momPoseFor("reach", .5).hands[1][1] > momPoseFor("reach", .5).head[1]);
  assert.ok(momPoseFor("reach", .5).hands[0][1] < momPoseFor("reach", .5).shoulders[0][1]);
  assert.ok(momPoseFor("reach", 1.5).hands[0][1] > momPoseFor("reach", 1.5).head[1]);
  assert.ok(momPoseFor("punch", .5).hands[1][2] > .8);
  assert.ok(momPoseFor("hamstring-curl", .5).feet[1][2] < -.3);
});

test("the resting stance has relaxed arms and aligned feet in a true side view", () => {
  const pose = momPoseFor("breathe", 0);
  assert.ok(pose.hands.every(hand => hand[1] < pose.hips[1] && hand[2] < .1));
  assert.equal(pose.feet[0][1], pose.feet[1][1]);
  assert.equal(pose.feet[0][2], pose.feet[1][2]);
  assert.ok(distance(pose.shoulders[0], pose.shoulders[1]) <= .61);
});
