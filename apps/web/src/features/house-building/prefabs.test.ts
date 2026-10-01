import { HouseSimulation } from "./engine";
import test from "node:test";
import assert from "node:assert/strict";
import {
  selectionDesign,
  insertAssembly,
  SYSTEM_PREFABS,
  systemPrefab,
} from "./prefabs";
import {
  makePart,
  emptyDesign,
  parseHouseDesign,
  bounds,
  PRESET_MATERIAL_IDS,
  partMass,
} from "./model";
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

test("catalogue has twenty distinct assemblies and every material tier preserves legal geometry", () => {
  assert.equal(SYSTEM_PREFABS.length, 20);
  assert.equal(new Set(SYSTEM_PREFABS.map((p) => p.id)).size, 20);
  for (const material of PRESET_MATERIAL_IDS)
    for (const item of SYSTEM_PREFABS)
      assert.ok(
        parseHouseDesign(systemPrefab(item.id, material)),
        item.id + " " + material,
      );
  const heights = SYSTEM_PREFABS.map((p) =>
    Math.max(...systemPrefab(p.id, "wood_t3").parts.map((b) => bounds(b).top)),
  );
  assert.ok(heights.filter((h) => h >= 10).length >= 10);
  assert.ok(heights.some((h) => h > 20));
  assert.throws(() => systemPrefab("unknown", "wood_t3"));
});
test("hinged mechanisms retain working joints after insertion with no hidden ground attachment", () => {
  for (const id of [
    "chain",
    "curtain",
    "pendulum",
    "double-pendulum",
    "swing",
    "seesaw",
  ]) {
    const original = systemPrefab(id, "wood_t3"),
      placed = insertAssembly(original, emptyDesign(), emptyChallenge())!;
    assert.ok(
      original.connections.some((c) => c.kind === "hinge"),
      id,
    );
    assert.equal(placed.design.connections.length, original.connections.length);
    assert.ok(placed.design.connections.every((c) => c.b !== "ground"));
    const sim = new HouseSimulation(placed.design);
    assert.ok(
      sim.links.some((l) => l.kind === "hinge"),
      id,
    );
  }
});
test("all twenty default wooden assemblies remain finite and conserve mass during a five-second run", () => {
  for (const item of SYSTEM_PREFABS) {
    const d = systemPrefab(item.id, "wood_t3"),
      sim = new HouseSimulation(d);
    sim.step(1200);
    const s = sim.snapshot(),
      mass = d.parts.reduce((n, p) => n + partMass(p), 0);
    assert.ok(
      s.pieces.every((p) => Number.isFinite(p.x + p.y + p.angle)),
      item.id,
    );
    assert.ok(Math.abs(s.mass - mass) < 1e-6 * mass, item.id);
    assert.equal(s.events.length, 0, item.id + ": " + s.events.join(","));
  }
});
