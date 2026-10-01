import test from "node:test";
import assert from "node:assert/strict";
import { HouseSimulation, STEP } from "./engine";
import {
  emptyDesign,
  makePart,
  partMass,
  parseHouseDesign,
  MATERIALS,
  MATERIAL_IDS,
  MAX_PARTS,
} from "./model";
import {
  generateChallenge,
  parseChallenge,
  challengeActive,
  groundPlacementAllowed,
  parseWorkspace,
  migrateHouseWorkspace,
  DEFAULT_VIEW,
  evaluateChallenge,
  initialProgress,
  advanceChallenge,
  parseHouseHistory,
  parseHouseRecord,
  mergeHouseHistory,
  type HouseWorkspace,
  type HouseRecord,
} from "./challenge";

test("all eight combinations of optional goals round-trip and are deterministic", () => {
  for (let bits = 0; bits < 8; bits++)
    for (let seed = 0; seed < 100; seed++) {
      const flags = {
        height: !!(bits & 1),
        target: !!(bits & 2),
        foundation: !!(bits & 4),
      };
      const c = generateChallenge(flags, seed);
      assert.deepEqual(c, generateChallenge(flags, seed));
      assert.deepEqual(parseChallenge(c), c);
      assert.equal(challengeActive(c), bits !== 0);
      assert.ok(c.height >= 4 && c.height <= 12);
      assert.ok(c.target.y >= 2 && c.target.y < c.height);
      assert.ok([1, 2].includes(c.regions.length));
      assert.equal(parseChallenge({ ...c, height: c.height + 1 }), undefined);
    }
});
test("legacy design migrates with all positions, settings and material IDs preserved", () => {
  const d = emptyDesign();
  d.parts = [makePart("wood", "block", "wood", 0, 0.4)];
  const before = structuredClone(d),
    w = migrateHouseWorkspace(d)!;
  assert.ok(w);
  assert.equal(w.schemaVersion, 2);
  assert.deepEqual(w.design, before);
  assert.deepEqual(d, before);
  w.view.showMass = true;
  w.view.span = 70;
  w.challenge = generateChallenge(
    { height: true, target: true, foundation: true },
    40,
  );
  assert.deepEqual(parseWorkspace(w), w);
  assert.equal(migrateHouseWorkspace({ ...w, schemaVersion: 99 }), undefined);
  assert.equal(
    parseWorkspace({ ...w, view: { ...w.view, span: 100 } }),
    undefined,
  );
});
test("real material grades preserve separate density, compression, bending and stiffness", () => {
  assert.equal(MATERIAL_IDS.length, 41); // 25 presets plus 16 immutable legacy materials.
  assert.equal(MATERIALS.wood.bendingStrength, 24e6);
  assert.equal(MATERIALS.wood.youngModulus, 11e9);
  assert.ok(
    MATERIALS.wood_c16.bendingStrength < MATERIALS.wood.bendingStrength,
  );
  assert.ok(
    MATERIALS.steel_235.bendingStrength < MATERIALS.steel_355.bendingStrength,
  );
  assert.ok(
    MATERIALS.stone.compressiveStrength > MATERIALS.stone.bendingStrength,
  );
  assert.ok(
    partMass(makePart("s", "block", "steel_235")) >
      partMass(makePart("w", "block", "wood")) * 10,
  );
  for (const material of MATERIAL_IDS) {
    const d = emptyDesign();
    d.parts = [makePart("m", "block", material, 0, 0.4)];
    assert.ok(parseHouseDesign(d));
    assert.ok(partMass(d.parts[0]) > 0);
  }
});
test("expanded board accepts 160 separated pieces up to 40m but rejects overflow", () => {
  const d = emptyDesign();
  for (let i = 0; i < MAX_PARTS; i++)
    d.parts.push(
      makePart(
        "p" + i,
        "block",
        "wood",
        -36 + (i % 20) * 3.5,
        0.4 + Math.floor(i / 20) * 4.5,
      ),
    );
  assert.ok(parseHouseDesign(d));
  d.parts.push(makePart("extra", "block", "wood", 38, 38));
  assert.equal(parseHouseDesign(d), undefined);
});
test("foundation restriction requires the whole foot inside a region and creates real gaps", () => {
  const c = generateChallenge(
      { height: false, target: false, foundation: true },
      12,
    ),
    r = c.regions[0],
    x = (r.left + r.right) / 2;
  const d = emptyDesign();
  d.parts = [makePart("foot", "block", "wood", x, 0.4)];
  assert.equal(groundPlacementAllowed(d, c), true);
  d.parts[0].x = r.left;
  assert.equal(groundPlacementAllowed(d, c), false);
  d.parts[0].x = 30;
  d.parts[0].y = 2;
  assert.equal(groundPlacementAllowed(d, c), true);
  const s = new HouseSimulation(d, { regions: c.regions });
  s.step(240);
  assert.ok(s.snapshot().pieces[0].y < 0);
  assert.equal(s.snapshot().pieces[0].supported, false);
  assert.equal(evaluateChallenge(s.snapshot(), c).ok, false);
});
test("a target requires actual supported material, not a falling object or its bounding box", () => {
  const c = generateChallenge(
    { height: false, target: true, foundation: false },
    9,
  );
  const d = emptyDesign();
  d.parts = [makePart("fall", "block", "wood", c.target.x, c.target.y)];
  const s = new HouseSimulation(d);
  s.step();
  const snap = s.snapshot();
  assert.equal(evaluateChallenge(snap, c).ok, false);
  snap.pieces[0].supported = true;
  assert.equal(evaluateChallenge(snap, c).ok, true);
  snap.pieces[0].shape = "circle";
  snap.pieces[0].x = c.target.x + 0.35;
  snap.pieces[0].y = c.target.y + 0.35;
  assert.equal(evaluateChallenge(snap, c).ok, false);
  snap.pieces[0].shape = "bar";
  snap.pieces[0].width = 3;
  snap.pieces[0].height = 0.2;
  snap.pieces[0].angle = Math.PI / 4;
  snap.pieces[0].x = c.target.x + 0.8;
  snap.pieces[0].y = c.target.y - 0.8;
  assert.equal(evaluateChallenge(snap, c).ok, false);
});
test("height is measured from the moving ground and ignores airborne pieces", () => {
  const c = generateChallenge(
    { height: true, target: false, foundation: false },
    3,
  );
  const d = emptyDesign();
  d.parts = [makePart("a", "block", "wood", 0, c.height)];
  const s = new HouseSimulation(d),
    snap = s.snapshot();
  assert.equal(evaluateChallenge(snap, c).height, 0);
  snap.pieces[0].supported = true;
  assert.equal(evaluateChallenge(snap, c).ok, true);
  snap.ground.y = -0.7;
  snap.pieces[0].y -= 0.7;
  assert.ok(
    Math.abs(evaluateChallenge(snap, c).height - (c.height + 0.4)) < 1e-8,
  );
});
test("fractured polygon cannot cover a target merely inside its bounding rectangle", () => {
  const c = generateChallenge(
      { height: false, target: true, foundation: false },
      9,
    ),
    d = emptyDesign();
  d.parts = [makePart("fragment", "block", "wood", c.target.x, c.target.y)];
  const snap = new HouseSimulation(d).snapshot(),
    p = snap.pieces[0];
  p.supported = true;
  p.damaged = true;
  p.vertices = [
    { x: -0.4, y: -0.4 },
    { x: 0.4, y: -0.4 },
    { x: -0.4, y: 0.4 },
  ];
  p.x = c.target.x - 0.3;
  p.y = c.target.y - 0.3;
  assert.equal(evaluateChallenge(snap, c).ok, false);
  p.x = c.target.x + 0.2;
  p.y = c.target.y + 0.2;
  assert.equal(evaluateChallenge(snap, c).ok, true);
});
test("ten-second continuous hold resets on loss, uses simulation time and completes once", () => {
  let p = initialProgress();
  const good = { ok: true, height: 6, reasons: [] },
    bad = { ok: false, height: 2, reasons: ["高度不足"] };
  for (let i = 0; i < 540; i++) p = advanceChallenge(p, good, 1 / 60, 20, 2);
  assert.equal(p.done, false);
  assert.ok(p.held > 8.9);
  p = advanceChallenge(p, bad, 1 / 60, 10, -3);
  assert.equal(p.held, 0);
  assert.equal(p.maxHeight, 6);
  const paused = structuredClone(p);
  assert.deepEqual(p, paused);
  for (let i = 0; i < 600; i++) p = advanceChallenge(p, good, 1 / 60, 15, 1);
  assert.equal(p.done, true);
  assert.equal(p.windForcePeak, 20);
  assert.equal(p.quakeAccelerationPeak, 3);
  assert.strictEqual(advanceChallenge(p, bad, STEP, 0, 0), p);
});
function successfulRecord(id = "record-one"): HouseRecord {
  const challenge = generateChallenge(
      { height: false, target: false, foundation: true },
      33,
    ),
    r = challenge.regions[0];
  const design = emptyDesign();
  design.parts = [
    makePart("block", "block", "wood", (r.left + r.right) / 2, 0.4),
  ];
  const workspace: HouseWorkspace = {
    schemaVersion: 2,
    design,
    challenge,
    view: { ...DEFAULT_VIEW, showMass: true },
  };
  return {
    id,
    createdAt: "2026-09-28T00:00:00.000Z",
    modelVersion: 2,
    workspace,
    result: {
      duration: 10,
      maxHeight: 0.82,
      finalHeight: 0.82,
      mass: partMass(design.parts[0]),
      componentCount: 1,
      windForcePeak: 0,
      quakeAccelerationPeak: 0,
    },
  };
}
test("ten-second physics completion yields a reloadable validated record", () => {
  const record = successfulRecord(),
    w = record.workspace,
    s = new HouseSimulation(w.design, {
      regions: w.challenge.regions,
      warmup: 0,
    });
  let p = initialProgress();
  for (let i = 0; i < 2500 && !p.done; i++) {
    s.step();
    if (i % 4 === 3)
      p = advanceChallenge(
        p,
        evaluateChallenge(s.snapshot(), w.challenge),
        4 * STEP,
        s.windForce,
        s.groundAcceleration,
      );
  }
  assert.equal(p.done, true);
  const done = {
    ...record,
    result: {
      ...record.result,
      maxHeight: p.maxHeight,
      finalHeight: evaluateChallenge(s.snapshot(), w.challenge).height,
    },
  };
  assert.deepEqual(parseHouseRecord(done), done);
  assert.deepEqual(parseWorkspace(done.workspace), w);
});
test("history validates input and merges concurrent records without duplicate completion", () => {
  const a = successfulRecord(),
    b = successfulRecord("record-two");
  assert.ok(parseHouseHistory({ schemaVersion: 1, records: [] }));
  const history = mergeHouseHistory(undefined, {
    schemaVersion: 1,
    records: [a],
  });
  assert.deepEqual(
    mergeHouseHistory(history, { schemaVersion: 1, records: [a] }),
    history,
  );
  assert.equal(
    mergeHouseHistory(history, { schemaVersion: 1, records: [b] }).records
      .length,
    2,
  );
  assert.throws(() =>
    mergeHouseHistory(history, {
      schemaVersion: 1,
      records: [{ ...a, result: { ...a.result, maxHeight: 1 } }],
    }),
  );
  for (const invalid of [
    { ...a, modelVersion: 99 },
    { ...a, result: { ...a.result, duration: 9 } },
    { ...a, result: { ...a.result, mass: NaN } },
    { ...a, result: { ...a.result, componentCount: 2 } },
  ])
    assert.equal(parseHouseRecord(invalid), undefined);
  assert.equal(
    parseHouseHistory({ schemaVersion: 1, records: [a, a] }),
    undefined,
  );
});

test("independent required and forbidden areas evaluate occupied material and survive ground motion", () => {
  const d = emptyDesign();
  d.parts = [makePart("block", "block", "wood", 0, 0.4)];
  const sim = new HouseSimulation(d);
  sim.step(120);
  const snapshot = sim.snapshot();
  const c = {
    ...generateChallenge(
      { height: false, target: false, foundation: false },
      1,
    ),
    layoutVersion: 3 as const,
    zones: [
      {
        id: "required",
        kind: "required" as const,
        enabled: true,
        left: -0.3,
        right: 0.3,
        bottom: 0.1,
        top: 0.6,
      },
      {
        id: "forbidden",
        kind: "forbidden" as const,
        enabled: true,
        left: 2,
        right: 3,
        bottom: 0,
        top: 1,
      },
    ],
  };
  assert.equal(evaluateChallenge(snapshot, c).ok, true);
  const forbidden = {
    ...c,
    zones: [{ ...c.zones[1], left: -0.2, right: 0.2 }],
  };
  assert.equal(evaluateChallenge(snapshot, forbidden).ok, false);
  assert.ok(
    evaluateChallenge(snapshot, forbidden).reasons.some((s) =>
      s.includes("禁入"),
    ),
  );
  assert.equal(
    evaluateChallenge(snapshot, {
      ...c,
      zones: [{ ...c.zones[0], left: 5, right: 6 }],
    }).ok,
    false,
  );
  const moved = {
    ...snapshot,
    ground: { x: 3, y: 0 },
    pieces: snapshot.pieces.map((p) => ({ ...p, x: p.x + 3 })),
  };
  assert.equal(evaluateChallenge(moved, c).ok, true);
  const switchedOff = {
    ...c,
    zones: c.zones.map((z) => ({ ...z, enabled: false })),
  };
  assert.equal(challengeActive(switchedOff), false);
});
test("a plank wider than its foundation remains forbidden even when visually supported", () => {
  const d = emptyDesign();
  d.parts = [
    { ...makePart("wide", "bar", "wood", 0, 0.1), width: 4, height: 0.2 },
  ];
  const c = {
    ...generateChallenge({ height: false, target: false, foundation: true }, 1),
    layoutVersion: 2 as const,
    regions: [{ left: -1, right: 1 }],
  };
  assert.equal(groundPlacementAllowed(d, c), false);
  const sim = new HouseSimulation(d, { regions: c.regions });
  sim.step(120);
  const result = evaluateChallenge(sim.snapshot(), c);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((s) => s.includes("贴地积木")));
});
