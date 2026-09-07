import assert from "node:assert/strict";
import test from "node:test";
import type { MoveId } from "./plan";
import { FLOOR_HEIGHT, FLOOR_MOVES, KNEELING_SHOE, MOM_LIMBS, MOM_SUPPORTS, SUPINE_HIP_HEIGHT, momPoseFor, type Point } from "./pose";

const moves: MoveId[] = ["march", "step", "heel-dig", "reach", "knee-drive", "punch", "squat", "skater", "jack", "hamstring-curl", "side-stretch", "calf-stretch", "quad-stretch", "chest-open", "breathe"];
const newMoves: MoveId[] = ["chair-stand", "wall-push", "bottle-row", "hip-hinge", "calf-raise", "wall-plank", "glute-bridge", "heel-slide", "bird-dog", "shoulder-roll", "hamstring-stretch", "floor-rest", "quadruped-rest"];
const distance = (a: Point, b: Point) => Math.hypot(...a.map((v, i) => v - b[i]));

test("every demonstration retains adult bone lengths and finite joints throughout both sides and impact settings", () => {
  for (const move of [...moves, ...newMoves]) for (const low of [false, true]) for (const side of ["left", "right"] as const) {
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

test("strength demonstrations use their support surfaces and move from the intended joints", () => {
  const standing = momPoseFor("chair-stand", 0), seated = momPoseFor("chair-stand", .5);
  assert.deepEqual(seated.feet, standing.feet);
  assert.ok(Math.abs(seated.hips[1] - MOM_SUPPORTS.chairSeatY - .13) < .000001, "pelvis rests just above the seat, with thigh thickness on the seat");
  assert.ok(seated.hips[2] > MOM_SUPPORTS.chairBackZ && seated.hips[2] < 0);
  const straight = momPoseFor("hip-hinge", 0), hinged = momPoseFor("hip-hinge", .5);
  assert.deepEqual(straight.feet, hinged.feet);
  assert.ok(hinged.hips[2] < straight.hips[2] - .3);
  assert.ok(hinged.shouldersCenter[2] > hinged.hips[2] + .4);
  const rowStart = momPoseFor("bottle-row", 0), rowEnd = momPoseFor("bottle-row", .5);
  assert.deepEqual(rowStart.hips, rowEnd.hips); assert.deepEqual(rowStart.shouldersCenter, rowEnd.shouldersCenter);
  for (let i = 0; i < 2; i++) {
    assert.ok(rowEnd.hands[i][1] > rowStart.hands[i][1] + .6);
    assert.ok(rowEnd.elbows[i][2] < rowEnd.shoulders[i][2], "rowing elbows travel behind the ribs");
  }
  for (let frame = 0; frame < 100; frame++) {
    const p = momPoseFor("wall-push", frame / 50);
    for (const hand of p.hands) { assert.equal(hand[2], MOM_SUPPORTS.wallZ - .025); assert.equal(hand[1], 2.24); }
    assert.deepEqual(p.handDirection, [[0, 1, 0], [0, 1, 0]], "palms turn upright against the wall");
    const calf = momPoseFor("calf-raise", frame / 50);
    for (let i = 0; i < 2; i++) {
      const angle = calf.footPitch[i];
      const toeY = calf.feet[i][1] - MOM_SUPPORTS.toeForward * Math.sin(angle) - FLOOR_HEIGHT * Math.cos(angle);
      const toeZ = calf.feet[i][2] + MOM_SUPPORTS.toeForward * Math.cos(angle) - FLOOR_HEIGHT * Math.sin(angle);
      assert.ok(Math.abs(toeY) < .000001, "toes remain on the floor while the heel rises");
      assert.ok(Math.abs(toeZ - .035 - MOM_SUPPORTS.toeForward) < .000001, "forefoot stays at one fixed pivot");
      assert.equal(calf.hands[i][2], MOM_SUPPORTS.supportChairZ);
    }
  }
});

test("floor exercises use lying or quadruped poses with stable contacts and controlled bilateral movement", () => {
  for (const move of FLOOR_MOVES) for (let frame = 0; frame < 100; frame++) {
    const p = momPoseFor(move, frame / 50, true);
    assert.ok(Math.abs(p.shouldersCenter[2] - p.hips[2]) > .65, `${move}: torso is horizontal, not a standing animation`);
    assert.ok(p.hands.every(hand => hand[1] === .085), "both support palms remain beside the mat");
    if (move === "bird-dog" || move === "quadruped-rest") {
      for (const foot of p.feet) {
        const toeY = foot[1] - KNEELING_SHOE.toeForward * Math.sin(KNEELING_SHOE.pitch) - KNEELING_SHOE.toeBelow * Math.cos(KNEELING_SHOE.pitch);
        assert.ok(Math.abs(toeY) < .000001, "kneeling feet rest on their toe caps, not their ankles");
        assert.ok(foot[1] > FLOOR_HEIGHT + .07, "ankles sit above the supported toes");
      }
    } else assert.ok(p.feet.every(foot => foot[1] === FLOOR_HEIGHT), "supine heels stay at mat height");
  }
  const bridgeDown = momPoseFor("glute-bridge", 0), bridgeUp = momPoseFor("glute-bridge", .5);
  assert.ok(bridgeUp.hips[1] > bridgeDown.hips[1] + .15);
  assert.deepEqual(bridgeDown.feet, bridgeUp.feet);
  assert.deepEqual(bridgeDown.head, bridgeUp.head, "head stays resting rather than following the rising hips");
  assert.equal(bridgeDown.hips[1], SUPINE_HIP_HEIGHT, "bridge starts with the lower buttock contour on the mat");
  assert.deepEqual(momPoseFor("glute-bridge", 1).hips, bridgeDown.hips, "each bridge returns all the way to the resting pelvis position");
  const floorRest = momPoseFor("floor-rest", 0);
  for (let frame = 0; frame <= 100; frame++) {
    const slide = momPoseFor("heel-slide", frame / 50);
    assert.deepEqual(slide.hips, floorRest.hips, "heel sliding never lifts or tips the resting pelvis");
    assert.ok(Math.abs(distance(slide.hips, slide.shouldersCenter) - .78) < .000001, "lowering the resting pelvis preserves torso length");
  }
  const spine = bridgeUp.hips.map((v, i) => v - bridgeUp.shouldersCenter[i]);
  const thigh = bridgeUp.knees[0].map((v, i) => v - bridgeUp.hipsPair[0][i]);
  assert.ok(Math.abs(spine[1] * thigh[2] - spine[2] * thigh[1]) < .000001, "shoulder, hip and knee align at the top");
  for (const [phase, active] of [[.5, 1], [1.5, 0]]) {
    const slide = momPoseFor("heel-slide", phase), bird = momPoseFor("bird-dog", phase, true);
    assert.ok(slide.feet[active][2] > slide.feet[1 - active][2] + .6);
    assert.ok(bird.feet[active][2] < bird.feet[1 - active][2] - .45);
    assert.ok(Math.abs(bird.knees[1 - active][1] - FLOOR_HEIGHT) < .000001, "opposite knee remains planted");
    assert.deepEqual(bird.hands, momPoseFor("quadruped-rest", 0).hands, "beginner version never lifts a supporting arm");
  }
  for (const move of ["wall-plank", "hamstring-stretch", "floor-rest", "quadruped-rest"] as const) assert.deepEqual(momPoseFor(move, 0), momPoseFor(move, 3.39), `${move} is held, never bounced`);
  assert.notDeepEqual(momPoseFor("hamstring-stretch", 0, true, "left"), momPoseFor("hamstring-stretch", 0, true, "right"));
});

test("hip hinges and rows keep only a shallow knee bend instead of substituting a squat", () => {
  const kneeFlexionDegrees = (pose: ReturnType<typeof momPoseFor>, i: number) => {
    const reach = distance(pose.hipsPair[i], pose.feet[i]);
    const cosine = (reach ** 2 - MOM_LIMBS.thigh ** 2 - MOM_LIMBS.shin ** 2) / (2 * MOM_LIMBS.thigh * MOM_LIMBS.shin);
    return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
  };
  const rest = momPoseFor("hip-hinge", 0), hinged = momPoseFor("hip-hinge", .5);
  assert.ok(rest.hips[1] - hinged.hips[1] < .08, "hip hinge is mainly backward travel, not sitting down");
  for (const move of ["hip-hinge", "bottle-row"] as const) for (let frame = 0; frame <= 160; frame++) {
    const pose = momPoseFor(move, frame / 80, true);
    assert.deepEqual(pose.feet, rest.feet, "whole feet remain planted throughout the hinge and row");
    assert.deepEqual(pose.footPitch, [0, 0], "neither heel nor toe tilts off the floor");
    for (let i = 0; i < 2; i++) {
      const flexion = kneeFlexionDegrees(pose, i);
      assert.ok(flexion >= 15 && flexion <= 30, `${move}: knee bends softly (${flexion} degrees)`);
    }
  }
  for (const move of ["chair-stand", "squat"] as const) {
    assert.ok(kneeFlexionDegrees(momPoseFor(move, .5, true), 0) > kneeFlexionDegrees(hinged, 0) + 25, "sitting and squatting remain visibly distinct from hinging at the hip");
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
