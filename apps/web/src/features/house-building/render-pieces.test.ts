import test from "node:test";
import assert from "node:assert/strict";
import { HouseSimulation } from "./engine";
import { emptyDesign, makePart } from "./model";
import { renderPieces } from "./render-pieces";

test("stacked rectangles remain ten continuous objects when simulation starts", () => {
  const d = emptyDesign();
  d.parts = Array.from({ length: 10 }, (_, i) =>
    makePart("block-" + i, "rectangle", "wood_t1", 0, 0.4 + i * 0.8),
  );
  const s = new HouseSimulation(d);
  assert.equal(s.pieces.length, 40);
  const shown = renderPieces(s.snapshot().pieces);
  assert.equal(shown.length, 10);
  assert.ok(shown.every((p) => p.vertices?.length === 10 && !p.damaged));
  s.step(240);
  assert.equal(s.events.length, 0);
  assert.equal(renderPieces(s.snapshot().pieces).length, 10);
});
test("beam contour follows actual bend and separates only at a broken connection", () => {
  const d = emptyDesign();
  d.parts = [makePart("beam", "bar", "wood_t3", 0, 4)];
  const s = new HouseSimulation(d),
    snap = s.snapshot();
  snap.pieces[2].angle = 0.15;
  const bend = renderPieces(snap.pieces)[0];
  assert.ok(bend.vertices!.some((v) => Math.abs(Math.abs(v.y) - 0.1) > 0.001));
  snap.pieces[3].beamPrevious = undefined;
  const broken = renderPieces(snap.pieces);
  assert.equal(broken.length, 2);
  assert.ok(
    Math.abs(broken.reduce((sum, p) => sum + p.mass, 0) - snap.mass) < 1e-8,
  );
});
test("independent blocks and crushed fragments are not merged", () => {
  const d = emptyDesign();
  d.parts = [
    makePart("a", "block", "wood_t3", -2, 1),
    makePart("b", "triangle", "stone_t1", 2, 1),
  ];
  const pieces = new HouseSimulation(d).snapshot().pieces;
  assert.deepEqual(renderPieces(pieces), pieces);
});
