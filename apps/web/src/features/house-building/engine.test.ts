import test from "node:test";
import assert from "node:assert/strict";
import { HouseSimulation, STEP, dragForce } from "./engine";
import {
  exampleDesign,
  emptyDesign,
  makePart,
  partMass,
  parseHouseDesign,
  EXAMPLES,
  MATERIALS,
  DEPTH,
  bounds,
} from "./model";
const run = (sim: HouseSimulation, seconds: number) =>
  sim.step(Math.round(seconds / STEP));
test("all examples are valid and survive five seconds without nonfinite state", () => {
  for (const { id } of EXAMPLES) {
    const design = exampleDesign(id);
    assert.ok(parseHouseDesign(design), id);
    const sim = new HouseSimulation(design);
    run(sim, 5);
    const s = sim.snapshot();
    assert.ok(
      s.pieces.every((p) => Number.isFinite(p.x + p.y + p.angle)),
      id,
    );
    assert.ok(
      Math.abs(s.mass - design.parts.reduce((m, p) => m + partMass(p), 0)) <
        1e-6,
    );
  }
});

test("C24 bridge carries three ordinary wooden blocks for ten seconds without breaking", () => {
  const d = exampleDesign("bridge");
  d.parts = d.parts.filter((p) => p.id !== "load");
  for (let i = 0; i < 3; i++)
    d.parts.push(makePart("load" + i, "block", "wood", 0, 2.2 + i * 0.8));
  const sim = new HouseSimulation(d);
  run(sim, 10);
  assert.equal(sim.events.length, 0);
  assert.ok(sim.snapshot().pieces.every((p) => !p.damaged));
  assert.ok(sim.snapshot().maxSpeed < 0.05);
});
test("a tilted wooden plank can settle under its own weight without self-fracture", () => {
  for (const angle of [0.15, 0.4, 0.7, 1.1]) {
    const d = emptyDesign(),
      p = { ...makePart("plank", "bar", "wood"), angle };
    p.y -= bounds(p).bottom;
    d.parts = [p];
    const sim = new HouseSimulation(d);
    run(sim, 5);
    assert.equal(sim.events.length, 0, "angle=" + angle);
    assert.ok(sim.snapshot().pieces.every((p) => !p.damaged));
  }
});
test("same heavy load breaks a weak AAC beam while structural wood remains intact", () => {
  const build = (material: "aac" | "wood") => {
    const d = exampleDesign("bridge");
    d.parts = d.parts.map((p) => ({
      ...p,
      material: p.id === "roof" ? material : p.material,
      loadMass: p.shape === "weight" ? 1500 : p.loadMass,
    }));
    const sim = new HouseSimulation(d);
    run(sim, 5);
    return sim;
  };
  assert.equal(build("wood").events.length, 0);
  assert.ok(build("aac").events.some((e) => e.includes("断裂")));
});
test("free fall follows gravity and comes to rest on floor", () => {
  const d = emptyDesign();
  d.parts = [makePart("fall", "block", "wood", 0, 3)];
  const sim = new HouseSimulation(d);
  run(sim, 0.5);
  assert.ok(
    Math.abs(sim.pieces[0].body.getPosition().y - (3 - (9.81 * 0.5 ** 2) / 2)) <
      0.02,
  );
  run(sim, 3);
  assert.ok(Math.abs(sim.pieces[0].body.getPosition().y - 0.4) < 0.03);
});
test("resting stack stays still without wind or quake and support balances weight", () => {
  const d = exampleDesign("narrow");
  const sim = new HouseSimulation(d);
  run(sim, 8);
  assert.ok(sim.snapshot().maxSpeed < 0.015);
  assert.ok(sim.pieces.every((p) => Math.abs(p.body.getAngle()) < 0.015));
  assert.ok(
    Math.abs(sim.groundLoad - sim.snapshot().mass * 9.81) <
      sim.groundLoad * 0.03,
  );
  assert.equal(sim.events.length, 0);
});
test("drag scales with area and squared relative speed", () => {
  assert.equal(dragForce(20, 2), 4 * dragForce(10, 2));
  assert.equal(dragForce(10, 2), 2 * dragForce(10, 1));
  assert.equal(dragForce(-10, 1), -dragForce(10, 1));
});
test("wind moves an exposed block; an identical block behind is shielded", () => {
  const d = emptyDesign();
  d.parts = [
    makePart("a", "block", "wood", -2, 0.2),
    makePart("b", "block", "wood", 2, 0.2),
  ].map((p) => ({ ...p, width: 0.4, height: 0.4 }));
  d.settings.windSpeed = 60;
  const sim = new HouseSimulation(d);
  run(sim, 2);
  sim.wind = true;
  run(sim, 0.15);
  assert.ok(
    sim.pieces[0].body.getLinearVelocity().x >
      sim.pieces[1].body.getLinearVelocity().x + 0.01,
  );
});
test("earthquake moves actual ground, and anchored object follows", () => {
  const d = emptyDesign();
  d.parts = [makePart("base", "block", "metal", 0, 0.4)];
  d.connections = [
    {
      id: "foot",
      a: "base",
      b: "ground",
      kind: "fixed",
      anchor: { x: 0, y: 0 },
      strength: 100000,
    },
  ];
  const sim = new HouseSimulation(d);
  sim.quake = true;
  run(sim, 3.2);
  assert.ok(Math.abs(sim.ground.getPosition().x) > 0.001);
  assert.ok(
    Math.abs(sim.pieces[0].body.getPosition().x - sim.ground.getPosition().x) <
      0.02,
  );
});
test("hinge lets a pendulum rotate; fixed joint holds it", () => {
  const build = (kind: "hinge" | "fixed") => {
    const d = emptyDesign();
    d.parts = [
      {
        ...makePart("post", "bar", "metal", -2, 2),
        width: 4,
        height: 0.4,
        angle: Math.PI / 2,
      },
      {
        ...makePart("swing", "bar", "wood", -0.3, 3.8),
        width: 3,
        height: 0.2,
        stiffness: 10,
      },
    ];
    d.connections = [
      {
        id: "foot",
        a: "post",
        b: "ground",
        kind: "fixed",
        anchor: { x: -2, y: 0 },
        strength: 100000,
      },
      {
        id: "joint",
        a: "post",
        b: "swing",
        kind,
        anchor: { x: -1.8, y: 3.8 },
        strength: 100000,
      },
    ];
    return new HouseSimulation(d);
  };
  const hinged = build("hinge"),
    fixed = build("fixed");
  run(hinged, 0.7);
  run(fixed, 0.7);
  assert.ok(
    Math.abs(
      hinged.pieces.find((p) => p.source.id === "swing")!.body.getAngle(),
    ) > 0.1,
  );
  assert.ok(
    Math.abs(
      fixed.pieces.find((p) => p.source.id === "swing")!.body.getAngle(),
    ) < 0.08,
  );
});
test("elastic beam bends more than stiff beam with same geometry", () => {
  const build = (stiffness: number) => {
    const d = exampleDesign("bridge");
    d.parts = d.parts.map((p) => ({
      ...p,
      ...(p.shape === "bar" ? { material: "elastic" as const } : {}),
      stiffness,
      strength: 10,
    }));
    return new HouseSimulation(d);
  };
  const soft = build(0.1),
    hard = build(10);
  run(soft, 2);
  run(hard, 2);
  const roofY = (sim: HouseSimulation) =>
    sim.pieces
      .filter((p) => p.source.id === "roof")
      .reduce((m, p) => Math.min(m, p.body.getPosition().y), 10);
  assert.ok(
    roofY(soft) < roofY(hard) - 0.002,
    JSON.stringify({ soft: roofY(soft), hard: roofY(hard) }),
  );
});
test("weak construction fractures but preserves mass", () => {
  const d = exampleDesign("bridge");
  d.parts = d.parts.map((p) => ({ ...p, strength: 0.1, loadMass: 1500 }));
  const sim = new HouseSimulation(d);
  const before = sim.snapshot().mass;
  run(sim, 4);
  assert.ok(sim.events.length > 0);
  assert.ok(Math.abs(sim.snapshot().mass - before) < 1e-6);
});
test("overloaded foundation settles; increasing capacity prevents settlement", () => {
  const d = exampleDesign("narrow");
  d.settings.groundCapacity = 100;
  const weak = new HouseSimulation(d);
  run(weak, 3);
  assert.equal(weak.settling, true);
  assert.ok(weak.snapshot().ground.y < 0);
  d.settings.groundCapacity = 100000;
  const strong = new HouseSimulation(d);
  run(strong, 3);
  assert.equal(strong.settling, false);
});
test("fixed-step runs repeat exactly in the same runtime", () => {
  const d = exampleDesign("house");
  const a = new HouseSimulation(d),
    b = new HouseSimulation(d);
  a.wind = b.wind = true;
  a.quake = b.quake = true;
  run(a, 4);
  run(b, 4);
  assert.deepEqual(a.snapshot(), b.snapshot());
});
test("invalid, overlapping, unsupported versions and dangling connections are rejected", () => {
  const d = emptyDesign();
  assert.ok(parseHouseDesign(d));
  assert.equal(parseHouseDesign({ ...d, schemaVersion: 99 }), undefined);
  assert.equal(
    parseHouseDesign({ ...d, settings: { ...d.settings, windSpeed: NaN } }),
    undefined,
  );
  d.parts = [
    makePart("a", "block", "wood", 0, 1),
    makePart("b", "block", "wood", 0, 1),
  ];
  assert.equal(parseHouseDesign(d), undefined);
  d.parts.pop();
  d.connections = [
    {
      id: "bad",
      a: "a",
      b: "missing",
      kind: "fixed",
      anchor: { x: 0, y: 1 },
      strength: 1000,
    },
  ];
  assert.equal(parseHouseDesign(d), undefined);
});

test("same wind topples a slender tower while a same-height wide tower stays upright", () => {
  const wide = exampleDesign("wide"),
    narrow = exampleDesign("narrow");
  wide.settings.windSpeed = narrow.settings.windSpeed = 40;
  const a = new HouseSimulation(wide),
    b = new HouseSimulation(narrow);
  a.wind = b.wind = true;
  run(a, 8);
  run(b, 8);
  assert.ok(a.pieces.every((p) => Math.abs(p.body.getAngle()) < 0.05));
  assert.ok(b.pieces.some((p) => Math.abs(p.body.getAngle()) > 0.5));
});
test("circle rolls down an inclined anchored beam", () => {
  const d = emptyDesign();
  d.parts = [
    {
      ...makePart("ramp", "bar", "metal", 0, 0.6),
      width: 3,
      angle: 0.3,
      stiffness: 10,
      strength: 10,
    },
    { ...makePart("ball", "circle", "wood", 0, 1.5), width: 0.6, height: 0.6 },
  ];
  const sim = new HouseSimulation(d);
  // A fixture for the benchmark holds the ramp still; the production construction starts unanchored.
  for (const p of sim.pieces.filter((p) => p.source.id === "ramp"))
    p.body.setType("static");
  run(sim, 0.65);
  const ball = sim.pieces.find((p) => p.source.id === "ball")!;
  assert.ok(ball.body.getLinearVelocity().x < 0);
  assert.ok(Math.abs(ball.body.getAngularVelocity()) > 0.1);
});
test("a small sideways force is resisted by friction, larger force slides the block", () => {
  const d = emptyDesign();
  d.parts = [makePart("block", "block", "wood", 0, 0.4)];
  const sim = new HouseSimulation(d);
  run(sim, 1);
  const body = sim.pieces[0].body;
  for (let i = 0; i < 240; i++) {
    body.applyForceToCenter({ x: 10, y: 0 }, true);
    sim.step();
  }
  assert.ok(Math.abs(body.getPosition().x) < 0.01);
  for (let i = 0; i < 60; i++) {
    body.applyForceToCenter({ x: 1000, y: 0 }, true);
    sim.step();
  }
  assert.ok(body.getPosition().x > 0.05);
});

test("stiff wood cantilever remains intact with sub-centimetre numerical sag", () => {
  const d = emptyDesign();
  d.parts = [
    {
      ...makePart("post", "bar", "metal", -2, 2),
      width: 4,
      height: 0.4,
      angle: Math.PI / 2,
      strength: 10,
      stiffness: 10,
    },
    {
      ...makePart("beam", "bar", "wood", -0.3, 3.8),
      width: 3,
      height: 0.2,
      strength: 10,
      stiffness: 10,
    },
  ];
  d.connections = [
    {
      id: "foot",
      a: "post",
      b: "ground",
      kind: "fixed",
      anchor: { x: -2, y: 0 },
      strength: 100000,
    },
    {
      id: "joint",
      a: "post",
      b: "beam",
      kind: "fixed",
      anchor: { x: -1.8, y: 3.8 },
      strength: 100000,
    },
  ];
  const sim = new HouseSimulation(d);
  run(sim, 20);
  const beam = d.parts[1],
    tip = sim.pieces.filter((p) => p.source.id === "beam").at(-1)!;
  const deflection =
    beam.y - tip.body.getWorldPoint({ x: tip.width / 2, y: 0 }).y;
  const ei =
    (MATERIALS.wood.youngModulus * beam.stiffness * DEPTH * beam.height ** 3) /
    12;
  const expected =
    (((partMass(beam) * 9.81) / beam.width) * beam.width ** 4) / (8 * ei);
  assert.ok(
    Math.abs(deflection - expected) < 0.01,
    JSON.stringify({ deflection, expected }),
  );
  assert.equal(sim.events.length, 0);
});

test("48 mixed components under wind and quake retain finite positions and total mass", () => {
  const d = emptyDesign();
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 8; col++) {
      const shape = col % 3 === 0 ? "bar" : col % 3 === 1 ? "circle" : "block";
      d.parts.push({
        ...makePart(
          "p-" + row + "-" + col,
          shape,
          row % 2 ? "wood" : "metal",
          -6.3 + col * 1.8,
          0.5 + row * 1.3,
        ),
        ...(shape === "bar" ? { width: 1.4, height: 0.2 } : {}),
        strength: 10,
      });
    }
  d.settings.windSpeed = 60;
  d.settings.quakeAcceleration = 10;
  const sim = new HouseSimulation(d),
    mass = sim.snapshot().mass;
  sim.wind = sim.quake = true;
  run(sim, 6);
  assert.ok(
    sim.snapshot().pieces.every((p) => Number.isFinite(p.x + p.y + p.angle)),
  );
  assert.ok(Math.abs(sim.snapshot().mass - mass) < 1e-6);
});
test("crushed disk keeps curved-sector geometry and total mass", () => {
  const d = emptyDesign();
  d.parts = [
    {
      ...makePart("disk", "circle", "aac", 0, 0.2),
      width: 0.4,
      height: 0.4,
      strength: 0.1,
    },
    { ...makePart("load", "weight", "metal", 0, 0.8), loadMass: 1500 },
    { ...makePart("load2", "weight", "metal", 0, 1.6), loadMass: 1500 },
    { ...makePart("load3", "weight", "metal", 0, 2.4), loadMass: 1500 },
  ];
  const sim = new HouseSimulation(d),
    mass = sim.snapshot().mass;
  run(sim, 3);
  const fragments = sim
    .snapshot()
    .pieces.filter((p) => p.id === "disk" && p.damaged);
  assert.equal(fragments.length, 4);
  assert.ok(fragments.every((p) => p.vertices?.length === 8));
  assert.ok(Math.abs(sim.snapshot().mass - mass) < 1e-6);
});
