import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { angularDistance } from "./astronomy";
import { CAMERA_FLIGHT_DURATION_MS, interpolateCameraFlight } from "./camera-flight";

function near(actual: number, expected: number, epsilon = 0.00001) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} near ${expected}`);
}

describe("stargazing camera flight", () => {
  it("starts at the current view, reaches the requested star in 520ms, and leaves saved views unchanged", () => {
    const from = { ra: 83, dec: 12, fov: 110 }, original = { ...from };
    const target = { ra: 88.7929, dec: 7.4071 };
    assert.equal(CAMERA_FLIGHT_DURATION_MS, 520);
    assert.deepEqual(interpolateCameraFlight(from, target, 0), from);
    for (const progress of [1, 1.8]) {
      const reached = interpolateCameraFlight(from, target, progress);
      near(reached.ra, target.ra); near(reached.dec, target.dec);
      assert.equal(reached.fov, 15);
    }
    assert.deepEqual(from, original);
  });

  it("takes the short spherical route across the right-ascension seam in either direction", () => {
    for (const [startRa, targetRa] of [[350, 10], [10, 350]]) {
      const from = { ra: startRa, dec: 0, fov: 100 }, target = { ra: targetRa, dec: 0 };
      const middle = interpolateCameraFlight(from, target, .5);
      near(Math.min(middle.ra, 360 - middle.ra), 0);
      near(middle.dec, 0);
      near(angularDistance(from.ra, from.dec, middle.ra, middle.dec), 10);
      near(angularDistance(middle.ra, middle.dec, target.ra, target.dec), 10);
    }
  });

  it("progresses monotonically along the great circle while smoothly tightening the field of view", () => {
    const from = { ra: 80, dec: -20, fov: 130 }, target = { ra: 110, dec: 45 };
    const totalAngle = angularDistance(from.ra, from.dec, target.ra, target.dec);
    let previousAngle = -1, previousFov = 131;
    for (let frame = 0; frame <= 60; frame += 1) {
      const view = interpolateCameraFlight(from, target, frame / 60);
      const travelled = angularDistance(from.ra, from.dec, view.ra, view.dec);
      const remaining = angularDistance(view.ra, view.dec, target.ra, target.dec);
      near(travelled + remaining, totalAngle);
      assert.ok(travelled >= previousAngle - 0.00001);
      assert.ok(view.fov <= previousFov && view.fov >= 15);
      previousAngle = travelled; previousFov = view.fov;
    }
    const early = interpolateCameraFlight(from, target, .01);
    assert.ok(angularDistance(from.ra, from.dec, early.ra, early.dec) < totalAngle * .001);
    const late = interpolateCameraFlight(from, target, .99);
    assert.ok(angularDistance(late.ra, late.dec, target.ra, target.dec) < totalAngle * .001);
  });

  it("keeps a centred star stable and supports polar or exactly opposite targets without singularities", () => {
    const from = { ra: 120, dec: -10, fov: 90 };
    const middle = interpolateCameraFlight(from, from, .5);
    near(middle.ra, from.ra); near(middle.dec, from.dec);
    near(middle.fov, Math.sqrt(90 * 15));
    for (const [start, target] of [
      [{ ra: 10, dec: 89.9, fov: 60 }, { ra: 190, dec: 89.9 }],
      [{ ra: 0, dec: 0, fov: 110 }, { ra: 180, dec: 0 }],
      [{ ra: 0, dec: 90, fov: 110 }, { ra: 0, dec: -90 }],
    ] as const) {
      for (const progress of [.001, .25, .5, .75, .999]) {
        const view = interpolateCameraFlight(start, target, progress);
        assert.ok(Object.values(view).every(Number.isFinite));
        assert.ok(view.ra >= 0 && view.ra < 360 && Math.abs(view.dec) <= 90);
      }
      assert.deepEqual(interpolateCameraFlight(start, target, 1), { ...target, fov: 15 });
    }
  });

  it("bounds progress and view inputs without turning invalid target coordinates into a flight", () => {
    const from = { ra: -10, dec: 100, fov: 500 }, normalized = { ra: 350, dec: 90, fov: 160 };
    const target = { ra: 10, dec: 20 };
    assert.deepEqual(interpolateCameraFlight(from, target, -1), normalized);
    assert.deepEqual(interpolateCameraFlight(from, target, NaN), normalized);
    assert.deepEqual(interpolateCameraFlight(from, { ra: NaN, dec: 0 }, .5), normalized);
    assert.deepEqual(interpolateCameraFlight(from, { ra: 0, dec: 91 }, .5), normalized);
  });
});
