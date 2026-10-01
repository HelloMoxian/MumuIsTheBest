import test from "node:test";
import assert from "node:assert/strict";
import {
  selectionDesign,
  insertAssembly,
  SYSTEM_PREFABS,
  systemPrefab,
} from "./prefabs";
import { makePart, emptyDesign, parseHouseDesign, bounds } from "./model";
import { emptyChallenge } from "./challenge";
test("all system assemblies contain independently editable non-overlapping parts", () => {
  for (const item of SYSTEM_PREFABS) {
    const d = systemPrefab(item.id, "wood_t3");
    assert.ok(d.parts.length > 1);
    assert.ok(parseHouseDesign(d), item.id);
    const inserted = insertAssembly(d, emptyDesign(), emptyChallenge());
    assert.ok(inserted);
    assert.ok(parseHouseDesign(inserted.design));
    assert.equal(inserted.ids.length, d.parts.length);
  }
});
test("selection packs internal connections only and copies relative positions with fresh IDs", () => {
  const d = emptyDesign();
  d.parts = [
    makePart("a", "block", "wood_t3", 0, 0.4),
    makePart("b", "block", "wood_t3", 0.8, 0.4),
    makePart("c", "block", "wood_t3", 1.6, 0.4),
  ];
  d.connections = [
    {
      id: "ab",
      a: "a",
      b: "b",
      kind: "fixed",
      anchor: { x: 0.4, y: 0.4 },
      strength: 100000,
    },
    {
      id: "bc",
      a: "b",
      b: "c",
      kind: "fixed",
      anchor: { x: 1.2, y: 0.4 },
      strength: 100000,
    },
  ];
  const selected = selectionDesign(d, ["a", "b"])!;
  assert.equal(selected.connections.length, 1);
  const inserted = insertAssembly(selected, d, emptyChallenge(), d.parts[0])!;
  assert.ok(inserted);
  assert.ok(parseHouseDesign(inserted.design));
  const copies = inserted.design.parts.slice(3);
  assert.equal(copies.length, 2);
  assert.ok(Math.abs(copies[1].x - copies[0].x - 0.8) < 1e-8);
  assert.equal(copies[0].y, copies[1].y);
  assert.ok(copies.every((p) => !["a", "b", "c"].includes(p.id)));
  assert.equal(inserted.design.connections.length, 3);
});
test("assemblies find legal foundation space without replacing the existing design", () => {
  const source = selectionDesign(
    { ...emptyDesign(), parts: [makePart("a", "block", "wood_t3", 0, 0.4)] },
    ["a"],
  )!;
  const c = {
    ...emptyChallenge(),
    layoutVersion: 3 as const,
    zones: [],
    flags: { height: false, target: false, foundation: true },
    regions: [{ left: 12, right: 14 }],
  };
  const result = insertAssembly(source, emptyDesign(), c)!;
  assert.ok(result);
  assert.ok(bounds(result.design.parts[0]).left >= 12);
  assert.ok(bounds(result.design.parts[0]).right <= 14);
  const tooLarge = systemPrefab("tower", "wood_t3");
  assert.equal(insertAssembly(tooLarge, emptyDesign(), c), undefined);
});
