import { HouseSimulation } from "./engine";
import test from "node:test";
import assert from "node:assert/strict";
import {
  makePart,
  snapPart,
  placeNear,
  emptyDesign,
  parseHouseDesign,
  overlaps,
  placeAbove,
  placeCopy,
  bounds,
  validPlacement,
} from "./model";

test("adding above an older selected block climbs an occupied vertical stack", () => {
  const blocks = Array.from({ length: 12 }, (_, i) =>
    makePart("b" + i, "block", "wood_t3", 3, 0.4 + i * 0.8),
  );
  const added = placeAbove(
    makePart("new", "block", "stone_t3"),
    blocks[0],
    blocks,
  );
  assert.ok(added);
  assert.equal(added.x, 3);
  assert.ok(Math.abs(bounds(added).bottom - bounds(blocks.at(-1)!).top) < 1e-7);
  assert.ok(validPlacement(added, blocks));
});
test("a wider new piece rises above a neighboring overhang too", () => {
  const base = makePart("base", "block", "wood_t3", 0, 0.4);
  const shelf = {
    ...makePart("shelf", "bar", "wood_t3", 1, 1.1),
    width: 3,
    height: 0.2,
  };
  const added = placeAbove(
    { ...makePart("new", "rectangle", "wood_t3"), width: 2, height: 0.8 },
    base,
    [base, shelf],
  );
  assert.ok(added);
  assert.equal(added.x, base.x);
  assert.ok(bounds(added).bottom >= bounds(shelf).top - 1e-7);
  assert.ok(validPlacement(added, [base, shelf]));
});
test("copy prioritizes above and preserves every construction property", () => {
  const source = {
    ...makePart("source", "bar", "metal_t5", 0, 3),
    width: 4,
    height: 0.3,
    angle: 0.2,
    strength: 2,
    stiffness: 3,
    loadMass: 310,
  };
  const copied = placeCopy({ ...source, id: "copy" }, source, [source]);
  assert.ok(copied);
  assert.equal(copied.x, source.x);
  assert.ok(copied.y > source.y);
  const { x, y, id, ...props } = copied;
  const { x: sx, y: sy, id: si, ...original } = source;
  assert.deepEqual(props, original);
  assert.ok(validPlacement(copied, [source]));
});
test("ceiling blocked copies go right, then elsewhere when the right wall blocks", () => {
  const source = makePart("source", "block", "wood_t3", 0, 39.6);
  const right = placeCopy({ ...source, id: "copy" }, source, [source]);
  assert.ok(right);
  assert.equal(right.y, source.y);
  assert.ok(right.x > source.x);
  const corner = { ...source, x: 39.6 };
  const elsewhere = placeCopy({ ...corner, id: "copy" }, corner, [corner]);
  assert.ok(elsewhere);
  assert.ok(elsewhere.x < corner.x);
  assert.ok(validPlacement(elsewhere, [corner]));
  assert.equal(
    placeAbove({ ...corner, id: "copy" }, corner, [corner]),
    undefined,
  );
});
test("copy skips disallowed foundation areas and reports no legal space cleanly", () => {
  const source = makePart("source", "block", "wood_t3", 0, 0.4);
  const allowed = (p: typeof source) =>
    bounds(p).bottom < 0.01 && bounds(p).right < 0;
  const copy = placeCopy({ ...source, id: "copy" }, source, [source], allowed);
  assert.ok(copy);
  assert.ok(allowed(copy));
  assert.ok(validPlacement(copy, [source]));
  assert.equal(
    placeCopy({ ...source, id: "none" }, source, [source], () => false),
    undefined,
  );
});

test("planks snapped to a foundation do not fall through an editing gap at startup", () => {
  const p = snapPart(
    { ...makePart("plank", "bar", "wood_t3", 0, 0.3), height: 0.2 },
    [],
  );
  assert.ok(Math.abs(bounds(p).bottom) < 1e-8);
  const d = emptyDesign();
  d.parts = [p];
  const sim = new HouseSimulation(d, { regions: [{ left: -5, right: 5 }] });
  sim.step(240);
  const pieces = sim.snapshot().pieces;
  assert.ok(pieces.every((piece) => Math.abs(piece.y - p.y) < 0.025));
  assert.equal(sim.events.length, 0);
});
test("near placement uses triangle geometry instead of assuming symmetric half height", () => {
  const p = makePart("triangle", "triangle", "wood_t3", 0, -2);
  const placed = placeNear(p, []);
  assert.ok(placed);
  assert.ok(Math.abs(bounds(placed).bottom) < 1e-8);
});

test("touching is legal but sub-millimetre penetration is rejected for all shapes", () => {
  for (const shape of ["block", "circle", "triangle"] as const) {
    const a = makePart("a", shape, "wood_t3", 0, 2);
    const b = placeAbove({ ...a, id: "b" }, a, [a])!;
    assert.ok(b);
    assert.ok(validPlacement(b, [a]));
    for (const depth of [0.0000001, 0.0001, 0.001, 0.011]) {
      const bad = { ...b, y: b.y - depth };
      assert.equal(validPlacement(bad, [a]), false, shape + " " + depth);
      const d = emptyDesign();
      d.parts = [a, bad];
      assert.equal(parseHouseDesign(d), undefined);
      assert.throws(() => new HouseSimulation(d));
    }
  }
});
test("a dragged brick fits a flush wall gap independently of neighbor array order", () => {
  const parts = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < (row % 2 ? 6 : 7); col++) {
      if (row === 2 && col === 4) continue;
      parts.push(
        makePart(
          "b" + row + "_" + col,
          "rectangle",
          "wood_t3",
          col * 1.6 + (row % 2) * 0.8,
          0.4 + row * 0.8,
        ),
      );
    }
  const drag = makePart("drag", "rectangle", "wood_t3", 6.36, 2.06);
  const a = snapPart(drag, parts),
    b = snapPart(drag, [...parts].reverse());
  assert.deepEqual(a, b);
  assert.ok(validPlacement(a, parts));
  assert.ok(Math.abs(a.x - 6.4) < 1e-8);
  assert.ok(Math.abs(a.y - 2) < 1e-8);
  assert.ok(parts.every((p) => !overlaps(a, p)));
});
test("dense staggered masonry starts without explosive motion and keeps its layout", () => {
  const d = emptyDesign();
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < (row % 2 ? 6 : 7); col++)
      d.parts.push(
        makePart(
          "b" + row + "_" + col,
          "rectangle",
          "wood_t3",
          col * 1.6 + (row % 2) * 0.8,
          0.4 + row * 0.8,
        ),
      );
  const sim = new HouseSimulation(d),
    initial = sim.snapshot();
  let peak = 0;
  for (let i = 0; i < 480; i++) {
    sim.step();
    peak = Math.max(peak, sim.snapshot().maxSpeed);
  }
  assert.ok(peak < 0.2, "unexpected startup speed " + peak);
  assert.equal(sim.events.length, 0);
  for (const p of sim.snapshot().pieces) {
    const start = initial.pieces.find((v) => v.key === p.key)!;
    assert.ok(Math.hypot(p.x - start.x, p.y - start.y) < 0.02);
  }
});
