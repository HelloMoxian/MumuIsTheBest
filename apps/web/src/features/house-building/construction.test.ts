import test from "node:test";
import assert from "node:assert/strict";
import { HouseSimulation, STEP } from "./engine";
import {
  MATERIALS,
  PRESET_MATERIAL_IDS,
  DEPTH,
  makePart,
  partMass,
  partCost,
  emptyDesign,
  parseHouseDesign,
  type MaterialId,
  surfaceDistance,
  overlaps,
  bounds,
  placeAbove,
  localVertices,
  type ShapeId,
} from "./model";
import {
  migrateHouseWorkspace,
  parseHouseRecord,
  generateChallenge,
} from "./challenge";
function cantilever(
  length: number,
  height: number,
  material: MaterialId = "wood_t3",
  force = 100,
) {
  const d = emptyDesign();
  d.parts = [
    { ...makePart("beam", "bar", material, 0, 5), width: length, height },
  ];
  const s = new HouseSimulation(d);
  s.world.setGravity({ x: 0, y: 0 });
  s.pieces[0].body.setType("static");
  const tip = s.pieces.at(-1)!;
  for (let i = 0; i < 10 / STEP; i++) {
    tip.body.applyForce(
      { x: 0, y: -force },
      tip.body.getWorldPoint({ x: tip.width / 2, y: 0 }),
      true,
    );
    s.step();
  }
  const span = length - s.pieces[0].width / 2;
  return {
    deflection: 5 - tip.body.getWorldPoint({ x: tip.width / 2, y: 0 }).y,
    theoretical:
      (force * span ** 3) /
      ((3 * MATERIALS[material].youngModulus * DEPTH * height ** 3) / 12),
    broken: s.links.some((link) => link.broken),
  };
}
test("measured beam bending follows cantilever theory across length, thickness and material stiffness", () => {
  const results = [2, 4, 6].map((length) => cantilever(length, 0.1));
  for (const r of results) {
    assert.equal(r.broken, false);
    assert.ok(Math.abs(r.deflection / r.theoretical - 1) < 0.1);
  }
  assert.ok(
    results[2].deflection > results[1].deflection &&
      results[1].deflection > results[0].deflection,
  );
  const thicker = cantilever(4, 0.2);
  assert.ok(
    Math.abs(thicker.deflection / results[1].deflection - 1 / 8) < 0.01,
  );
  const softer = cantilever(4, 0.1, "wood_t1"),
    stronger = cantilever(4, 0.1, "wood_t5");
  assert.ok(Math.abs(softer.deflection / stronger.deflection - 2) < 0.1);
});
test("the same tip load breaks a long thin board while a shorter board survives", () => {
  assert.equal(cantilever(2, 0.05, "wood_t1", 300).broken, false);
  assert.equal(cantilever(6, 0.05, "wood_t1", 300).broken, true);
});
test("a tall rectangle segments along its long axis with its original outline and mass", () => {
  const d = emptyDesign(),
    p = {
      ...makePart("tall", "rectangle", "wood_t3", 0, 3),
      width: 0.4,
      height: 4,
    };
  d.parts = [p];
  const s = new HouseSimulation(d);
  assert.equal(s.pieces.length, 8);
  assert.ok(
    s.pieces.every(
      (piece) => Math.abs(piece.body.getAngle() - Math.PI / 2) < 1e-8,
    ),
  );
  assert.ok(Math.abs(s.snapshot().mass - partMass(p)) < 1e-7);
});
test("five visible families each have five increasingly strong and costly tiers; legacy properties stay unchanged", () => {
  assert.equal(PRESET_MATERIAL_IDS.length, 25);
  for (const family of ["wood", "stone", "metal", "elastic", "cushion"]) {
    const materials = PRESET_MATERIAL_IDS.filter(
      (id) => MATERIALS[id].presetGroup === family,
    ).map((id) => MATERIALS[id]);
    assert.equal(materials.length, 5);
    for (let i = 1; i < 5; i++) {
      assert.ok(
        materials[i].bendingStrength > materials[i - 1].bendingStrength,
      );
      assert.ok(
        materials[i].compressiveStrength > materials[i - 1].compressiveStrength,
      );
      assert.ok(materials[i].youngModulus >= materials[i - 1].youngModulus);
      assert.ok(materials[i].pricePerKg > materials[i - 1].pricePerKg);
      assert.equal(materials[i].density, materials[0].density);
    }
  }
  assert.equal(MATERIALS.wood.bendingStrength, 24e6);
  assert.equal(MATERIALS.steel_235.youngModulus, 200e9);
  assert.equal(MATERIALS.metal.density, 2700);
});
test("dimensions and triangle area determine mass, actual collider and construction cost", () => {
  for (const shape of [
    "block",
    "rectangle",
    "triangle",
    "bar",
    "circle",
    "weight",
  ] as ShapeId[]) {
    const p = makePart("part", shape, "wood_t3", 0, 3),
      d = emptyDesign();
    d.parts = [p];
    assert.ok(parseHouseDesign(d));
    const s = new HouseSimulation(d);
    assert.ok(Math.abs(s.snapshot().mass - partMass(p)) < 1e-7);
    assert.ok(
      Math.abs(partCost(p) - partMass(p) * MATERIALS.wood_t3.pricePerKg) < 1e-7,
    );
  }
  const rectangle = {
    ...makePart("r", "rectangle", "wood_t3"),
    width: 2,
    height: 1,
  };
  const triangle = { ...rectangle, shape: "triangle" as const };
  assert.equal(partMass(triangle), partMass(rectangle) / 2);
  assert.equal(partCost({ ...rectangle, width: 4 }), partCost(rectangle) * 2);
  assert.equal(
    partCost({ ...rectangle, material: "wood_t5" }) / partCost(rectangle),
    MATERIALS.wood_t5.pricePerKg / MATERIALS.wood_t3.pricePerKg,
  );
});
test("triangle geometry, contact and stacking do not use its bounding rectangle", () => {
  const triangle = {
    ...makePart("tri", "triangle", "wood_t3", 0, 2),
    width: 2,
    height: 2,
  };
  assert.equal(surfaceDistance(triangle, { x: 0, y: 2 }), 0);
  assert.ok(surfaceDistance(triangle, { x: 0.9, y: 3 }) > 0.3);
  assert.equal(
    overlaps(triangle, {
      ...makePart("ball", "circle", "wood_t3", 0.9, 3),
      width: 0.4,
      height: 0.4,
    }),
    false,
  );
  for (const shape of [
    "block",
    "rectangle",
    "triangle",
    "bar",
    "circle",
  ] as ShapeId[]) {
    const p = placeAbove(makePart("new", shape, "wood_t3"), triangle, [
      triangle,
    ]);
    assert.ok(p);
    assert.equal(overlaps(p, triangle, 1e-8), false);
    assert.equal(overlaps({ ...p, y: p.y - 0.001 }, triangle, 0), true);
  }
  assert.ok(
    Math.abs(localVertices(triangle).reduce((n, p) => n + p.y, 0)) < 1e-8,
  );
});
test("triangular fracture retains triangles, geometry and mass", () => {
  const d = emptyDesign();
  const part = {
    ...makePart("tri", "triangle", "aac", 0, 1 / 3),
    width: 1,
    height: 1,
    strength: 0.1,
  };
  d.parts = [part];
  const s = new HouseSimulation(d),
    mass = s.snapshot().mass;
  for (let i = 0; i < 150 && s.pieces.length === 1; i++) {
    s.pieces[0].body.applyForceToCenter({ x: 0, y: -1e6 }, true);
    s.step();
  }
  assert.equal(s.pieces.length, 4);
  assert.ok(
    s.snapshot().pieces.every((p) => p.damaged && p.vertices?.length === 3),
  );
  assert.ok(Math.abs(s.snapshot().mass - mass) < 1e-7);
});
test("new grades and shapes round-trip in cached workspaces and versioned reports with cost", () => {
  const d = emptyDesign(),
    c = generateChallenge(
      { height: false, target: false, foundation: true },
      33,
    ),
    r = c.regions[0];
  d.parts = [
    makePart("tri", "triangle", "stone_t4", (r.left + r.right) / 2, 1 / 3),
  ];
  const w = migrateHouseWorkspace(d)!;
  w.challenge = c;
  assert.ok(w);
  const record = {
    id: "new-material-report",
    createdAt: "2026-09-28T00:00:00.000Z",
    modelVersion: 3,
    workspace: w,
    result: {
      duration: 10,
      maxHeight: 1,
      finalHeight: 1,
      mass: partMass(d.parts[0]),
      componentCount: 1,
      cost: partCost(d.parts[0]),
      windForcePeak: 0,
      quakeAccelerationPeak: 0,
    },
  };
  assert.deepEqual(parseHouseRecord(record), record);
  assert.equal(
    parseHouseRecord({ ...record, result: { ...record.result, cost: -1 } }),
    undefined,
  );
  const old = { ...record, modelVersion: 2, result: { ...record.result } };
  delete (old.result as { cost?: number }).cost;
  assert.deepEqual(parseHouseRecord(old), old);
});
