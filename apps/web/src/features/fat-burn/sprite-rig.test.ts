import assert from "node:assert/strict";
import test from "node:test";
import { momPoseFor } from "./pose";
import { MOM_ART, MOM_HAND_MIRROR } from "./mom-art";
import { angleDown, attachedSpriteMatrix, limbSpriteMatrix, momProjection, type ScreenPoint, type SpriteMatrix } from "./sprite-rig";

function apply(matrix: SpriteMatrix, point: ScreenPoint): ScreenPoint {
  return [matrix[0] * point[0] + matrix[2] * point[1] + matrix[4], matrix[1] * point[0] + matrix[3] * point[1] + matrix[5]];
}
function close(actual: ScreenPoint, expected: ScreenPoint) {
  assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < .000001, `${actual} should coincide with ${expected}`);
}

test("painted joint anchors remain attached through mirrored, bent and foreshortened limb views", () => {
  const sourceStart: ScreenPoint = [154, 30], sourceEnd: ScreenPoint = [141, 271];
  for (const profile of [false, true]) for (const mirror of [false, true]) {
    const projection = momProjection(420, 460, profile);
    for (const move of ["punch", "squat", "jack", "knee-drive", "quad-stretch", "side-stretch"] as const) {
      for (let frame = 0; frame < 100; frame++) {
        const pose = momPoseFor(move, frame / 50);
        for (let i = 0; i < 2; i++) {
          for (const [a, b] of [[pose.shoulders[i], pose.elbows[i]], [pose.elbows[i], pose.hands[i]], [pose.hipsPair[i], pose.knees[i]], [pose.knees[i], pose.feet[i]]]) {
            const start = projection.point(a), end = projection.point(b);
            const matrix = limbSpriteMatrix(sourceStart, sourceEnd, start, end, .31, mirror);
            assert.ok(matrix.every(Number.isFinite));
            close(apply(matrix, sourceStart), start);
            close(apply(matrix, sourceEnd), end);
          }
        }
      }
    }
  }
});

test("a limb pointing at the camera keeps the same width and never divides by zero", () => {
  for (const projectedLength of [100, 10, .00001, 0]) {
    const matrix = limbSpriteMatrix([10, 10], [10, 200], [60, 80], [60, 80 + projectedLength], .4);
    assert.ok(matrix.every(Number.isFinite));
    close(apply(matrix, [10, 10]), [60, 80]);
    close(apply(matrix, [10, 200]), [60, 80 + projectedLength]);
    const edgeA = apply(matrix, [0, 10]), edgeB = apply(matrix, [20, 10]);
    assert.ok(Math.abs(Math.hypot(edgeB[0] - edgeA[0], edgeB[1] - edgeA[1]) - 8) < .000001);
  }
});

test("head and hand attachments rotate rigidly around their painted attachment without distorting features", () => {
  for (const angle of [0, .4, -.8, Math.PI]) for (const mirror of [false, true]) {
    const pivot: ScreenPoint = [140, 270], target: ScreenPoint = [200, 100];
    const matrix = attachedSpriteMatrix(pivot, target, .27, .27, angle, mirror);
    close(apply(matrix, pivot), target);
    const a = apply(matrix, [120, 70]), b = apply(matrix, [160, 70]);
    assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 10.8) < .000001);
  }
});

test("side view preserves the forward direction and shows the nearer anatomical side in front", () => {
  const profile = momProjection(300, 400, true), front = momProjection(300, 400, false);
  assert.ok(profile.point([0, 1, .5])[0] > profile.point([0, 1, 0])[0]);
  assert.ok(profile.depth([-.3, 1, 0]) > profile.depth([.3, 1, 0]));
  assert.ok(front.depth([0, 1, .3]) > front.depth([0, 1, -.3]));
  assert.equal(angleDown([0, 0], [0, 1]), 0);
  assert.equal(angleDown([0, 0], [0, 0]), 0);
  close(profile.point([-.3, 1, .2]), profile.point([.3, 1, .2]));
});

test("all sixteen v3 sprites have valid full-cell crops and explicit attachment points", () => {
  const sources = new Set<string>();
  for (const [view, parts] of Object.entries(MOM_ART)) {
    assert.equal(Object.keys(parts).length, 8);
    for (const [name, part] of Object.entries(parts)) {
      const [x, y, width, height] = part.bounds;
      assert.ok(part.bounds.every(Number.isFinite));
      assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 308 && y + height <= 308, `${view}/${name}: crop remains in its atlas cell`);
      for (const point of [part.start, ...(part.end ? [part.end] : [])]) {
        assert.ok(point.every(Number.isFinite));
        assert.ok(point[0] >= x && point[0] <= x + width && point[1] >= y && point[1] <= y + height, `${view}/${name}: attachment lies within painted bounds`);
      }
      if (["torso", "upper-arm", "forearm", "thigh", "shin"].includes(name)) {
        assert.ok(part.end, `${view}/${name}: a limb has two anchors`);
        assert.ok(Math.hypot(part.end[0] - part.start[0], part.end[1] - part.start[1]) > 20);
      }
      assert.equal(part.src, `/images/fat-burn/mom-v3/${view}-${name}.png`);
      assert.ok(!sources.has(part.src)); sources.add(part.src);
    }
  }
  assert.equal(sources.size, 16);
});

test("painted thumbs point inward in front and forward in profile without moving either wrist", () => {
  // These are thumb/palm landmarks inspected on the actual v3 hand images.
  const landmarks = {
    front: { thumb: [188, 166], palm: [154, 166] },
    side: { thumb: [139, 177], palm: [177, 177] },
  } as const;
  for (const profile of [false, true]) {
    const view = profile ? "side" : "front", hand = MOM_ART[view].hand;
    const projection = momProjection(600, 700, profile);
    for (const move of ["breathe", "reach", "jack", "punch", "quad-stretch"] as const) {
      for (const phase of [0, .5, 1.5]) for (const i of [0, 1] as const) {
        const pose = momPoseFor(move, phase);
        const elbow = projection.point(pose.elbows[i]), wrist = projection.point(pose.hands[i]);
        const rotation = angleDown(elbow, wrist);
        const scale = .23 / hand.bounds[3] * projection.scale;
        const matrix = attachedSpriteMatrix(hand.start, wrist, scale, scale, rotation, MOM_HAND_MIRROR[view][i]);
        close(apply(matrix, hand.start), wrist);
        const thumb = apply(matrix, landmarks[view].thumb), palm = apply(matrix, landmarks[view].palm);
        const lateral = (thumb[0] - palm[0]) * Math.cos(rotation) + (thumb[1] - palm[1]) * Math.sin(rotation);
        const expectedDirection = profile || i === 0 ? 1 : -1;
        assert.ok(lateral * expectedDirection > 0, `${view}/${move}/${i}: thumb stays on the anatomical side of the palm`);
        const originalWidth = Math.abs(landmarks[view].thumb[0] - landmarks[view].palm[0]) * scale;
        assert.ok(Math.abs(Math.hypot(thumb[0] - palm[0], thumb[1] - palm[1]) - originalWidth) < .000001);
        if (move === "breathe" && phase === 0) {
          assert.ok((thumb[0] - palm[0]) * expectedDirection > 0, "relaxed thumbs face the body centre/front");
        }
      }
    }
  }
});
