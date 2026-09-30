import test from "node:test";
import assert from "node:assert/strict";
import { moveTaskGoal, taskCamera, addTaskArea } from "./task-layout";
import {
  generateChallenge,
  parseChallenge,
  parseWorkspace,
  migrateHouseWorkspace,
} from "./challenge";
import { emptyDesign } from "./model";

test("custom height, target and foundation positions persist while legacy seeded tasks stay strict", () => {
  const original = generateChallenge(
    { height: true, target: true, foundation: true },
    42,
  );
  assert.equal(parseChallenge({ ...original, height: 30 }), undefined);
  let c = moveTaskGoal(original, "height", { x: 0, y: 18.3 });
  c = moveTaskGoal(c, "target", { x: 12.2, y: 8.5 });
  c = moveTaskGoal(c, "foundation:0", { x: -20, y: 0 });
  assert.deepEqual(parseChallenge(c), c);
  const workspace = migrateHouseWorkspace(emptyDesign())!;
  workspace.challenge = c;
  workspace.view.wind = true;
  workspace.view.quake = true;
  workspace.design.settings.windSpeed = 32;
  workspace.design.settings.quakeAcceleration = 4.2;
  assert.deepEqual(parseWorkspace(workspace), workspace);
  assert.deepEqual(parseChallenge(original), original);
  assert.equal(parseChallenge({ ...c, layoutVersion: 99 }), undefined);
  assert.equal(parseChallenge({ ...c, height: NaN }), undefined);
  assert.equal(parseChallenge({ ...c, target: { x: 41, y: 2 } }), undefined);
  assert.equal(
    parseChallenge({
      ...c,
      regions: [
        { left: 0, right: 3 },
        { left: 2, right: 5 },
      ],
    }),
    undefined,
  );
});
test("dragging clamps world edges and cannot overlap or cross foundations", () => {
  for (let seed = 0; seed < 30; seed++) {
    let c = generateChallenge(
      { height: true, target: true, foundation: true },
      seed,
    );
    for (const x of [-100, 0, 100])
      for (let i = 0; i < c.regions.length; i++) {
        c = moveTaskGoal(c, "foundation:" + i, { x, y: 0 });
        assert.ok(parseChallenge(c));
      }
    assert.equal(moveTaskGoal(c, "height", { x: 0, y: 100 }).height, 40);
    assert.deepEqual(moveTaskGoal(c, "target", { x: -100, y: -100 }).target, {
      x: -40,
      y: 0.1,
    });
  }
});

test("task camera includes both the ground and the height marker", () => {
  const c = {
    ...generateChallenge({ height: true, target: true, foundation: true }, 12),
    height: 40,
  };
  const view = taskCamera(c);
  assert.ok(view.y - view.span * 0.3 <= 0);
  assert.ok(view.y + view.span * 0.3 >= 40);
});

test("manual regions add independently, reject overlapping foundations, and survive editing", () => {
  let c = generateChallenge(
    { height: false, target: false, foundation: false },
    1,
  );
  c = addTaskArea(c, "required", { x: 0, y: 2 }, { x: 3, y: 4 }, "required");
  c = addTaskArea(
    c,
    "forbidden",
    { x: -8, y: 0 },
    { x: -4, y: 3 },
    "forbidden",
  );
  c = addTaskArea(
    c,
    "foundation",
    { x: -2, y: 9 },
    { x: 4, y: 12 },
    "foundation",
  );
  assert.equal(c.regions.length, 1);
  assert.deepEqual(c.regions[0], { left: -2, right: 4 });
  assert.equal(c.zones?.length, 2);
  assert.deepEqual(parseChallenge(c), c);
  assert.equal(
    addTaskArea(c, "foundation", { x: 1, y: 0 }, { x: 2, y: 0 }, "overlap"),
    c,
  );
  c = moveTaskGoal(c, "zone:required", { x: 10, y: 8 });
  c = moveTaskGoal(c, "height", { x: 0, y: 12 });
  assert.equal(c.layoutVersion, 3);
  assert.equal(c.zones?.[0].left, 8.5);
  assert.deepEqual(parseChallenge(c), c);
  assert.equal(
    parseChallenge({ ...c, zones: [{ ...c.zones![0], left: 41 }] }),
    undefined,
  );
  const cleared = {
    ...c,
    regions: [],
    flags: { ...c.flags, foundation: false },
    zones: [],
  };
  assert.deepEqual(parseChallenge(cleared), cleared);
});
