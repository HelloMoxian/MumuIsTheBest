import test from "node:test";
import assert from "node:assert/strict";
import { windStreaks } from "./wind-visual";
import { HouseSimulation } from "./engine";
import { emptyDesign, makePart } from "./model";
test("wind coverage grows with speed, freezes at equal travel and reverses direction", () => {
  assert.equal(windStreaks(0, 10, 20).length, 0);
  assert.ok(windStreaks(60, 0, 20).length > windStreaks(10, 0, 20).length);
  const a = windStreaks(30, 0, 20),
    b = windStreaks(30, 1, 20),
    c = windStreaks(30, -1, 20);
  assert.ok(b[1].x > a[1].x);
  assert.ok(c[1].x < a[1].x);
  assert.deepEqual(b, windStreaks(30, 1, 20));
  assert.ok(a.some((p) => p.y < 0.1) && a.some((p) => p.y > 0.9));
});
test("visual wind follows engine warmup, switches, gust speed and simulated travel", () => {
  const d = emptyDesign();
  d.parts = [makePart("block", "block", "wood_t3", 0, 0.4)];
  d.settings.windSpeed = 30;
  d.settings.gusts = false;
  const sim = new HouseSimulation(d, { warmup: 0.1 });
  sim.wind = true;
  sim.step(12);
  assert.equal(sim.snapshot().ambientWindSpeed, 0);
  sim.step(30);
  assert.equal(sim.snapshot().ambientWindSpeed, 30);
  const travel = sim.snapshot().windTravel!;
  assert.ok(travel > 0);
  sim.wind = false;
  sim.step();
  assert.equal(sim.snapshot().ambientWindSpeed, 0);
  assert.equal(sim.snapshot().windTravel, travel);
  sim.wind = true;
  sim.settings.windDirection = -1;
  sim.step();
  assert.ok(sim.snapshot().windTravel! < travel);
});
