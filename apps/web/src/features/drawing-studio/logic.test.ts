import assert from "node:assert/strict";
import test from "node:test";
import { STICKER_OPTIONS } from "./art";
import {
  DRAWING_SCHEMA_VERSION,
  MAX_DRAWING_ELEMENTS,
  STICKER_BASE_KINDS,
  STICKER_KINDS,
  STICKER_VARIANTS,
  clampZoom,
  createDrawingPreset,
  elementIdsInSelection,
  instantiateDrawingPreset,
  parseDrawingDocument,
  screenPointToWorld,
  zoomViewportAt,
  type DrawingElement,
  type DrawingDocument,
  type ShapeElement,
} from "./logic";

function makeShape(id: string): ShapeElement {
  return {
    id,
    type: "shape",
    shape: "circle",
    x: 0,
    y: 0,
    width: 120,
    height: 120,
    rotation: 0,
    fill: "#ffffff",
    stroke: "#16142f",
    strokeWidth: 4,
  };
}

function makeDocument(elements: DrawingElement[] = []): DrawingDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: DRAWING_SCHEMA_VERSION,
    id: "drawing-test",
    title: "测试作品",
    author: "",
    createdAt: now,
    updatedAt: now,
    viewport: { x: 100, y: 80, zoom: 1 },
    elements,
    presets: [],
  };
}

test("clamps drawing zoom to the supported range", () => {
  assert.equal(clampZoom(0.01), 0.25);
  assert.equal(clampZoom(2.5), 2.5);
  assert.equal(clampZoom(8), 4);
});

test("keeps the world point under the pointer fixed while zooming", () => {
  const before = { x: 80, y: 50, zoom: 1 };
  const anchor = { x: 420, y: 260 };
  const worldBefore = screenPointToWorld(anchor, before);
  const after = zoomViewportAt(before, anchor, 2.4);
  const worldAfter = screenPointToWorld(anchor, after);

  assert.ok(Math.abs(worldBefore.x - worldAfter.x) < 0.000001);
  assert.ok(Math.abs(worldBefore.y - worldAfter.y) < 0.000001);
});

test("accepts a valid empty or populated drawing document", () => {
  const empty = parseDrawingDocument(makeDocument());
  const populated = parseDrawingDocument(makeDocument([makeShape("shape-1")]));

  assert.equal(empty.elements.length, 0);
  assert.equal(populated.elements[0]?.type, "shape");
});

test("provides twelve stickers in every theme and accepts every generated sticker kind", () => {
  const themes = new Map<string, number>();
  for (const option of STICKER_OPTIONS) {
    themes.set(option.group, (themes.get(option.group) ?? 0) + 1);
  }

  assert.equal(themes.size, 15);
  assert.deepEqual([...themes.values()], Array.from({ length: 15 }, () => 12));
  assert.equal(STICKER_BASE_KINDS.length, 45);
  assert.equal(STICKER_VARIANTS.length, 4);
  assert.equal(STICKER_KINDS.length, 180);
  assert.equal(new Set(STICKER_KINDS).size, 180);
  assert.deepEqual(
    STICKER_OPTIONS.map((option) => option.id).sort(),
    [...STICKER_KINDS].sort(),
  );

  const stickerElements = STICKER_KINDS.map((sticker, index) => ({
    ...makeShape(`sticker-${index}`),
    type: "sticker" as const,
    sticker,
    mirrored: false,
    regionFills: {},
  }));
  assert.equal(parseDrawingDocument(makeDocument(stickerElements)).elements.length, 180);
});

test("preserves sticker mirroring and defaults older stickers to their original direction", () => {
  const mirroredSticker = {
    ...makeShape("mirrored-sticker"),
    type: "sticker" as const,
    sticker: STICKER_KINDS[0]!,
    mirrored: true,
    regionFills: {},
  };
  const parsed = parseDrawingDocument(makeDocument([mirroredSticker]));
  const parsedSticker = parsed.elements[0];
  assert.equal(parsedSticker?.type, "sticker");
  if (parsedSticker?.type === "sticker") assert.equal(parsedSticker.mirrored, true);

  const { mirrored: _mirrored, ...olderSticker } = mirroredSticker;
  const olderParsed = parseDrawingDocument({ ...makeDocument(), elements: [olderSticker] });
  const olderParsedSticker = olderParsed.elements[0];
  assert.equal(olderParsedSticker?.type, "sticker");
  if (olderParsedSticker?.type === "sticker") assert.equal(olderParsedSticker.mirrored, false);
});

test("migrates a version 1 drawing by adding an empty preset library", () => {
  const legacy = { ...makeDocument([makeShape("shape-1")]), schemaVersion: 1 } as Record<string, unknown>;
  delete legacy.presets;
  const migrated = parseDrawingDocument(legacy);

  assert.equal(migrated.schemaVersion, DRAWING_SCHEMA_VERSION);
  assert.deepEqual(migrated.presets, []);
});

test("finds every element touched by a drag-selection rectangle", () => {
  const first = makeShape("first");
  const second = { ...makeShape("second"), x: 170, y: 30 };
  const farAway = { ...makeShape("far-away"), x: 500, y: 500 };

  assert.deepEqual(
    elementIdsInSelection([first, second, farAway], { x: -10, y: -10 }, { x: 260, y: 180 }),
    ["first", "second"],
  );
});

test("normalizes a multi-element preset and instantiates it as one movable group", () => {
  const preset = createDrawingPreset("花园", [
    { ...makeShape("left"), x: 100, y: 200 },
    { ...makeShape("right"), x: 260, y: 240 },
  ]);
  const instances = instantiateDrawingPreset(preset, { x: 500, y: 400 });

  assert.equal(preset.elements[0]?.x, 0);
  assert.equal(preset.elements[0]?.y, 0);
  assert.equal(instances.length, 2);
  assert.ok(instances[0]?.groupId);
  assert.equal(instances[0]?.groupId, instances[1]?.groupId);
  assert.notEqual(instances[0]?.id, preset.elements[0]?.id);
});

test("rejects unsupported versions, duplicate ids, invalid colors and too many elements", () => {
  assert.throws(
    () => parseDrawingDocument({ ...makeDocument(), schemaVersion: 99 }),
    /版本/,
  );
  assert.throws(
    () => parseDrawingDocument(makeDocument([makeShape("same"), makeShape("same")])),
    /重复/,
  );
  assert.throws(
    () => parseDrawingDocument(makeDocument([{ ...makeShape("bad-color"), fill: "red" }])),
    /无法识别/,
  );
  assert.throws(
    () => parseDrawingDocument(makeDocument(Array.from({ length: MAX_DRAWING_ELEMENTS + 1 }, (_, index) => makeShape(`shape-${index}`)))),
    /数据不完整/,
  );
});
