import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FUNCTION_DEFINITIONS,
  canAddCurve,
  createFunctionCurve,
  curveEquation,
  describeCurve,
  evaluateCurve,
  sampleCurve,
  setCurveParameter,
} from "./logic";

describe("mystery function definitions", () => {
  it("contains the nine promised common function families", () => {
    assert.deepEqual(
      FUNCTION_DEFINITIONS.map((definition) => definition.id),
      [
        "linear",
        "quadratic",
        "cubic",
        "sine",
        "cosine",
        "absolute",
        "square-root",
        "reciprocal",
        "exponential",
      ],
    );
    for (const definition of FUNCTION_DEFINITIONS) {
      assert.ok(definition.parameters.length >= 2);
      assert.ok(definition.shape.length >= 10);
    }
  });

  it("evaluates representative defaults correctly", () => {
    assert.equal(evaluateCurve(createFunctionCurve("linear", "a", 0), 2), 3);
    assert.equal(evaluateCurve(createFunctionCurve("quadratic", "b", 1), 2), 1);
    assert.equal(evaluateCurve(createFunctionCurve("sine", "c", 2), 0), 0);
    assert.equal(evaluateCurve(createFunctionCurve("cosine", "d", 3), 0), 2);
    assert.equal(evaluateCurve(createFunctionCurve("absolute", "e", 0), -3), 3);
    assert.equal(evaluateCurve(createFunctionCurve("exponential", "f", 0), 0), 1);
  });

  it("keeps functions with restricted domains safe", () => {
    const squareRoot = createFunctionCurve("square-root", "root", 0);
    const reciprocal = createFunctionCurve("reciprocal", "inverse", 1);
    assert.equal(evaluateCurve(squareRoot, -0.1), null);
    assert.equal(evaluateCurve(squareRoot, 4), 3);
    assert.equal(evaluateCurve(reciprocal, 0), null);
    assert.equal(evaluateCurve(reciprocal, 2), 2);
  });
});

describe("curve editing and sampling", () => {
  it("clamps and snaps parameter edits to the template rules", () => {
    const curve = createFunctionCurve("linear", "line", 0);
    const aboveMaximum = setCurveParameter(curve, "a", 99);
    const snapped = setCurveParameter(curve, "a", 1.13);
    assert.equal(aboveMaximum.parameters.a, 4);
    assert.equal(snapped.parameters.a, 1.25);
    assert.deepEqual(setCurveParameter(curve, "missing", 3), curve);
  });

  it("splits reciprocal branches rather than connecting across the asymptote", () => {
    const curve = createFunctionCurve("reciprocal", "inverse", 0);
    const segments = sampleCurve(curve, -5, 5, 500, 10);
    assert.ok(segments.length >= 2);
    assert.ok(segments.every((segment) => segment.length > 1));
    assert.ok(segments.every((segment) => (
      segment.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    )));
  });

  it("never produces NaN text in equations or observations", () => {
    for (const definition of FUNCTION_DEFINITIONS) {
      const curve = createFunctionCurve(definition.id, definition.id, 0);
      assert.match(curveEquation(curve), /^y = /);
      assert.doesNotMatch(curveEquation(curve), /NaN|Infinity/);
      assert.ok(describeCurve(curve).length >= 10);
    }
  });

  it("keeps every parameter extreme and sampled point finite or intentionally absent", () => {
    for (const definition of FUNCTION_DEFINITIONS) {
      let minimumCurve = createFunctionCurve(definition.id, `${definition.id}-min`, 0);
      let maximumCurve = createFunctionCurve(definition.id, `${definition.id}-max`, 1);
      for (const parameter of definition.parameters) {
        minimumCurve = setCurveParameter(minimumCurve, parameter.key, parameter.min);
        maximumCurve = setCurveParameter(maximumCurve, parameter.key, parameter.max);
      }
      for (const curve of [minimumCurve, maximumCurve]) {
        for (let x = -20; x <= 20; x += 0.25) {
          const y = evaluateCurve(curve, x);
          assert.ok(y === null || Number.isFinite(y));
        }
        for (const segment of sampleCurve(curve, -20, 20, 800, 20)) {
          assert.ok(segment.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
        }
      }
    }
  });

  it("enforces the four-curve observation limit", () => {
    const curves = [0, 1, 2, 3].map((index) => (
      createFunctionCurve("linear", `line-${index}`, index)
    ));
    assert.equal(canAddCurve(curves.slice(0, 3)), true);
    assert.equal(canAddCurve(curves), false);
  });
});
