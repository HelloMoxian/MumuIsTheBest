import assert from "node:assert/strict";
import test from "node:test";
import { createGame, type Frame } from "../../../../server/src/bejeweled-engine";
import { frameDuration, motionKeyframes, planGemMotion, SWAP_MS } from "./motion";
import { createShards, shardAt } from "./particles";

test("new gems remain vertically ordered; survivors start at their real old positions", () => {
  const game = createGame(18);
  const previous = [...game.board];
  previous[8] = null; previous[16] = null;
  const next = [...previous];
  next[16] = previous[0]; next[0] = { id: 100000, color: "red", special: "normal" };
  next[8] = { id: 100001, color: "blue", special: "normal" };
  const motions = planGemMotion(previous, next, "fall");
  const fresh = motions.filter(value => value.fresh);
  assert.deepEqual(fresh.map(value => value.from), [-16, -8]);
  assert.equal(motions.find(value => value.to === 16)?.from, 0);
  assert.ok(motions.every(value => value.duration <= 620 && value.delay <= 63));
  const frame: Frame = { board: next, cleared: [], created: [], points: 0, cascade: 1, phase: "fall" };
  assert.ok(frameDuration(frame, previous) >= Math.max(...motions.map(value => value.duration + value.delay)));
});
test("both swap arcs begin at the old positions and end exactly in the new cells", () => {
  const game = createGame(1);
  const next = [...game.board]; [next[0], next[1]] = [next[1], next[0]];
  const motions = planGemMotion(game.board, next, "swap");
  assert.equal(motions.length, 2);
  for (const motion of motions) {
    assert.equal(motion.duration, SWAP_MS);
    const frames = motionKeyframes(motion, 64, true);
    assert.equal(frames.at(-1)?.offset, 1);
    assert.ok(String(frames.at(-1)?.transform).includes("translate(0px,0px)"));
    assert.notEqual(frames[6].transform, frames[0].transform);
  }
});
test("all-board explosion has bounded particles that follow gravity and expire", () => {
  const frame: Frame = { board: createGame(1).board, cleared: Array.from({ length: 64 }, (_, i) => i),
    created: [], points: 3200, cascade: 1, phase: "clear", blasts: [{ source: 27, kind: "nova", targets: [27] }] };
  const particles = createShards(frame);
  assert.equal(particles.length, 768);
  assert.deepEqual(particles, createShards(frame));
  for (const particle of particles) {
    assert.equal(shardAt(particle, 0).x, particle.x);
    assert.equal(shardAt(particle, 1).alpha, 0);
    assert.ok(shardAt(particle, .5).y > particle.y + particle.vy * .5);
  }
});
