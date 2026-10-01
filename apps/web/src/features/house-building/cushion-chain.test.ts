import test from "node:test";
import assert from "node:assert/strict";
import { HouseSimulation, STEP } from "./engine";
import { emptyDesign, makePart, partMass, parseHouseDesign } from "./model";
import { renderPieces } from "./render-pieces";
import { selectionDesign } from "./prefabs";
import { zoomView } from "./viewport";
import {
  windLevel,
  QUAKE_LEVELS,
  quakeLevelAmplitude,
  amplitudeLevel,
} from "./force-scale";
test("buffer compresses under load, dissipates motion and retains mass", () => {
  const d = emptyDesign();
  d.parts = [
    {
      ...makePart("pad", "rectangle", "cushion_t1", 0, 0.5),
      width: 2,
      height: 1,
    },
    { ...makePart("load", "weight", "metal_t1", 0, 1.4), loadMass: 150 },
  ];
  const sim = new HouseSimulation(d);
  sim.step(6 / STEP);
  const pieces = sim.snapshot().pieces.filter((p) => p.id === "pad");
  const separation = Math.hypot(
    pieces[0].x - pieces[1].x,
    pieces[0].y - pieces[1].y,
  );
  assert.ok(separation < 0.49 && separation >= 0.15 - 0.01, String(separation));
  const rendered = renderPieces(pieces);
  assert.equal(rendered.length, 1);
  assert.ok(sim.snapshot().maxSpeed < 0.05);
  assert.ok(
    Math.abs(
      sim.snapshot().mass - d.parts.reduce((n, p) => n + partMass(p), 0),
    ) < 1e-6,
  );
  assert.deepEqual(sim.snapshot().events, []);
});
test("damper spring returns after unloading and converges without persistent bouncing", () => {
  const d = emptyDesign();
  d.parts = [
    {
      ...makePart("pad", "rectangle", "cushion_t1", 0, 3),
      width: 2,
      height: 1,
    },
  ];
  const sim = new HouseSimulation(d);
  sim.world.setGravity({ x: 0, y: 0 });
  sim.pieces[0].body.setType("static");
  const top = sim.pieces[1].body;
  for (let i = 0; i < 2 / STEP; i++) {
    top.applyForceToCenter({ x: 0, y: -1000 });
    sim.step();
  }
  const compressed = top.getPosition().y;
  sim.step(3 / STEP);
  assert.ok(top.getPosition().y > compressed + 0.02);
  assert.ok(top.getLinearVelocity().length() < 0.001);
});
function hanging(strength: number) {
  const d = emptyDesign();
  d.parts = [
    makePart("a", "block", "metal_t5", 0, 5),
    makePart("b", "block", "wood_t3", 2, 5),
  ];
  d.connections = [
    {
      id: "chain",
      a: "a",
      b: "b",
      kind: "chain",
      anchor: { x: 0, y: 5 },
      strength,
    },
  ];
  assert.ok(parseHouseDesign(d));
  const s = new HouseSimulation(d);
  s.pieces[0].body.setType("static");
  return { d, s };
}
test("chain spans a gap, swivels and holds below its force limit", () => {
  const { d, s } = hanging(1e7);
  s.step(4 / STEP);
  assert.equal(s.links[0].broken, false);
  assert.ok(
    Math.hypot(
      s.pieces[0].body.getPosition().x - s.pieces[1].body.getPosition().x,
      s.pieces[0].body.getPosition().y - s.pieces[1].body.getPosition().y,
    ) < 2.02,
  );
  assert.ok(s.pieces[1].body.getPosition().y < 4);
  const prefab = selectionDesign(d, ["a", "b"])!;
  assert.ok(parseHouseDesign(prefab));
  // New connection types survive the same JSON contract as saved levels.
  assert.equal(
    parseHouseDesign(JSON.parse(JSON.stringify(prefab)))?.connections[0].kind,
    "chain",
  );
});
test("chain ruptures when measured tension exceeds its limit", () => {
  const { s } = hanging(100);
  s.step(2 / STEP);
  assert.equal(s.links[0].broken, true);
});
test("wheel zoom preserves pointer location and respects limits", () => {
  const v = { x: 0, y: 5, span: 16 },
    a = { x: 3, y: 7 },
    z = zoomView(v, a, -100);
  assert.ok(z.span < v.span);
  assert.ok(Math.abs((a.x - z.x) / z.span - (a.x - v.x) / v.span) < 1e-12);
  assert.equal(zoomView({ ...v, span: 6 }, a, -100).span, 6);
  assert.equal(zoomView({ ...v, span: 84 }, a, 100).span, 84);
});
test("new force ranges serialize and earthquake grades are nonlinear and ordered", () => {
  const d = emptyDesign();
  d.settings.windSpeed = 100;
  d.settings.quakeAmplitude = 1;
  assert.ok(parseHouseDesign(d));
  d.settings.windSpeed = 101;
  assert.equal(parseHouseDesign(d), undefined);
  assert.equal(windLevel(0), 0);
  assert.equal(windLevel(32.7), 12);
  assert.equal(windLevel(100), 24);
  assert.equal(QUAKE_LEVELS.length, 20);
  for (let i = 1; i < 20; i++)
    assert.ok(
      quakeLevelAmplitude(QUAKE_LEVELS[i]) >
        quakeLevelAmplitude(QUAKE_LEVELS[i - 1]),
    );
  assert.equal(quakeLevelAmplitude(10), 1);
  assert.ok(Math.abs(amplitudeLevel(quakeLevelAmplitude(8.2)) - 8.2) < 1e-10);
});

test("buffer contact overrides the other material rebound and extreme forces remain finite", () => {
  const d = emptyDesign();
  d.parts = [
    {
      ...makePart("pad", "rectangle", "cushion_t3", 0, 0.5),
      width: 3,
      height: 1,
    },
    makePart("ball", "circle", "elastic", 0, 3),
  ];
  d.settings.windSpeed = 100;
  d.settings.quakeAmplitude = 1;
  d.settings.quakeFrequency = 4;
  const sim = new HouseSimulation(d);
  let bufferContact = false;
  sim.world.on("post-solve", (contact) => {
    const a = contact.getFixtureA().getBody(),
      b = contact.getFixtureB().getBody();
    const ball = sim.pieces.find((p) => p.source.id === "ball")?.body;
    if (
      (a === ball || b === ball) &&
      sim.pieces.some(
        (p) => p.source.id === "pad" && (p.body === a || p.body === b),
      )
    ) {
      bufferContact = true;
      assert.equal(contact.getRestitution(), 0);
    }
  });
  sim.step(2 / STEP);
  assert.ok(bufferContact);
  sim.wind = true;
  sim.quake = true;
  sim.step(3 / STEP);
  assert.ok(
    sim.snapshot().pieces.every((p) => Number.isFinite(p.x + p.y + p.angle)),
  );
});
