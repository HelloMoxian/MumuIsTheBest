import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SHAPE_OPTIONS, STICKER_OPTIONS, ShapeArt } from "./art";
import {
  DRAWING_SCHEMA_VERSION,
  MAX_DRAWING_ELEMENTS,
  STICKER_BASE_KINDS,
  STICKER_KINDS,
  STICKER_VARIANTS,
  clampZoom,
  createDrawingPreset,
  createEmptyDrawing,
  createFreeShape,
  elementIdsInSelection,
  instantiateDrawingPreset,
  mergeDrawingPresets,
  parseDrawingDocument,
  presetContentSignature,
  renameDrawingPreset,
  screenPointToWorld,
  sortDrawingElements,
  transformDrawingElements,
  updateTextElement,
  zoomViewportAt,
  type DrawingElement,
  type DrawingDocument,
  type ShapeElement,
  type StrokeElement,
  type TextElement,
} from "./logic";

test("free shapes normalize drag directions and preserve fill, proportions and border through preset transforms", () => {
  for (const kind of ["free-rectangle", "free-ellipse", "free-triangle"] as const) {
    const shape = createFreeShape(kind, { x: 300, y: 160 }, { x: 20, y: 100 }, 3)!;
    assert.deepEqual([shape.x, shape.y, shape.width, shape.height], [20, 100, 280, 60]);
    const colored = { ...shape, fill: "#ff00ff", rotation: 30 };
    const preset = createDrawingPreset("自由图形", [colored, { ...colored, id: "second", x: 400 }]);
    const instances = instantiateDrawingPreset(preset, { x: 100, y: 200 }, 10);
    const transformed = transformDrawingElements(instances, 2, 15);
    const restored = parseDrawingDocument({ ...createEmptyDrawing(), elements: transformed, presets: [preset] });
    for (const element of restored.elements) {
      assert.equal(element.type, "shape");
      if (element.type !== "shape") continue;
      assert.equal(element.shape, kind);
      assert.equal(element.fill, "#ff00ff");
      assert.equal(element.width / element.height, 280 / 60);
      assert.equal(element.rotation, 45);
      assert.equal(element.strokeWidth, shape.strokeWidth);
    }
    const svg = renderToStaticMarkup(ShapeArt({ kind, fixedStroke: true, fill: "#ff00ff", strokeWidth: 3.5 }));
    assert.match(svg, /vector-effect="non-scaling-stroke"/);
    assert.match(svg, /data-region-id="fill"/);
    assert.match(svg, /stroke-width="3.5"/);
  }
  assert.equal(createFreeShape("free-rectangle", { x: 0, y: 0 }, { x: 0, y: 100 }, 0), null);
});

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
    layer: 0,
    createdOrder: 0,
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

test("provides a varied set of child-friendly decorative structures", () => {
  const decorative = SHAPE_OPTIONS.filter((option) => option.group === "装饰形状");
  assert.equal(SHAPE_OPTIONS.length, 40);
  assert.equal(new Set(SHAPE_OPTIONS.map((option) => option.id)).size, 40);
  assert.deepEqual(decorative.map((option) => option.label), [
    "右箭头",
    "左箭头",
    "双向箭头",
    "折角形",
    "五角星",
    "爱心",
    "田字格",
    "圆形田字格",
    "米字格",
    "圆形米字格",
    "九宫格",
    "小爪印",
    "小脚印",
    "花边圆框",
    "云朵边框",
    "对话框",
    "小横幅",
    "小皇冠",
    "四叶草",
    "蝴蝶结",
  ]);

  const shapeElements = SHAPE_OPTIONS.map((option, index) => ({
    ...makeShape(`shape-${index}`),
    shape: option.id,
    createdOrder: index,
  }));
  assert.equal(parseDrawingDocument(makeDocument(shapeElements)).elements.length, 40);

  for (const option of decorative) {
    const markup = renderToStaticMarkup(ShapeArt({ kind: option.id, fill: "#ffd166" }));
    assert.match(markup, /data-region-id="fill"/);
    assert.doesNotMatch(markup, /undefined|NaN/);
  }
});

test("provides number styles, twenty-four houses and twelve stickers in every other illustrated theme", () => {
  const themes = new Map<string, number>();
  for (const option of STICKER_OPTIONS) {
    themes.set(option.group, (themes.get(option.group) ?? 0) + 1);
  }

  assert.equal(themes.size, 19);
  assert.equal(themes.get("数字"), 40);
  assert.equal(themes.get("小屋"), 24);
  assert.deepEqual(
    [...themes.entries()].filter(([group]) => group !== "数字" && group !== "小屋").map(([, count]) => count),
    Array.from({ length: 17 }, () => 12),
  );
  assert.deepEqual(
    STICKER_OPTIONS.filter((option) => option.group === "小屋").slice(-12).map((option) => option.label),
    ["一层平房", "二层小楼", "尖顶小屋", "原木木屋", "湖边木屋", "森林木屋", "三角帐篷", "圆顶帐篷", "露营帐篷", "草顶小屋", "雪地木屋", "树梢小屋"],
  );
  assert.equal(STICKER_BASE_KINDS.length, 67);
  assert.equal(STICKER_VARIANTS.length, 4);
  assert.equal(STICKER_KINDS.length, 268);
  assert.equal(new Set(STICKER_KINDS).size, 268);
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
  assert.equal(parseDrawingDocument(makeDocument(stickerElements)).elements.length, 268);
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

test("migrates version 2 elements by assigning layer and stable creation order", () => {
  const first = makeShape("first") as unknown as Record<string, unknown>;
  const second = { ...makeShape("second"), x: 180 } as unknown as Record<string, unknown>;
  delete first.layer;
  delete first.createdOrder;
  delete second.layer;
  delete second.createdOrder;
  const migrated = parseDrawingDocument({ ...makeDocument(), schemaVersion: 2, elements: [first, second] });

  assert.deepEqual(migrated.elements.map((element) => element.layer), [0, 0]);
  assert.deepEqual(migrated.elements.map((element) => element.createdOrder), [0, 1]);
});

test("scales brush points and width together with the rest of a preset", () => {
  const stroke: StrokeElement = {
    id: "stroke",
    type: "stroke",
    x: 200,
    y: 40,
    width: 100,
    height: 40,
    rotation: 0,
    stroke: "#171536",
    strokeWidth: 10,
    layer: 0,
    createdOrder: 1,
    points: [{ x: 0, y: 0 }, { x: 100, y: 40 }],
    lineStyle: "smooth",
    smoothing: true,
  };
  const transformed = transformDrawingElements([{ ...makeShape("shape"), width: 100, height: 100 }, stroke], 0.5, 0);
  const transformedStroke = transformed.find((element) => element.type === "stroke");

  assert.equal(transformedStroke?.type, "stroke");
  if (transformedStroke?.type === "stroke") {
    assert.deepEqual(transformedStroke.points, [{ x: 0, y: 0 }, { x: 50, y: 20 }]);
    assert.equal(transformedStroke.strokeWidth, 5);
    assert.equal(transformedStroke.width, 50);
    assert.equal(transformedStroke.height, 20);
  }
});

test("sorts rendering by layer and then original creation order", () => {
  const newestBottom = { ...makeShape("newest-bottom"), layer: -1, createdOrder: 9 };
  const olderTop = { ...makeShape("older-top"), layer: 2, createdOrder: 1 };
  const newerTop = { ...makeShape("newer-top"), layer: 2, createdOrder: 5 };

  assert.deepEqual(
    sortDrawingElements([newerTop, newestBottom, olderTop]).map((element) => element.id),
    ["newest-bottom", "older-top", "newer-top"],
  );
});

test("parses and updates editable horizontal or vertical text elements", () => {
  const text: TextElement = {
    id: "text-1",
    type: "text",
    text: "木木",
    fontSize: 48,
    color: "#171536",
    layout: "horizontal",
    x: 100,
    y: 100,
    width: 92,
    height: 62,
    rotation: 15,
    stroke: "#171536",
    strokeWidth: 1,
    layer: 3,
    createdOrder: 7,
  };
  const parsed = parseDrawingDocument(makeDocument([text]));
  assert.equal(parsed.elements[0]?.type, "text");
  const updated = updateTextElement(text, { text: "星球", fontSize: 64, color: "#6950dc", layout: "vertical" });
  assert.equal(updated.layout, "vertical");
  assert.equal(updated.color, "#6950dc");
  assert.ok(updated.height > updated.width);
  assert.equal(updated.rotation, 15);
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

test("keeps the permanent preset library when a new canvas is created or libraries are merged", () => {
  const preset = createDrawingPreset("花园", [makeShape("left"), { ...makeShape("right"), x: 180 }]);
  const newCanvas = createEmptyDrawing([preset]);
  const importedPreset = { ...preset, id: "imported-preset", name: "小屋" };
  const merged = mergeDrawingPresets(newCanvas.presets, [preset, importedPreset]);

  assert.equal(newCanvas.elements.length, 0);
  assert.equal(newCanvas.presets.length, 1);
  assert.notEqual(newCanvas.presets[0], preset);
  assert.deepEqual(merged.map((candidate) => candidate.name), ["花园", "小屋"]);
});

test("detects duplicate presets after grouping, moving, copying and persistence, but permits actual edits", () => {
  const source = [makeShape("first"), { ...makeShape("second"), x: 180 }];
  const preset = createDrawingPreset("原作", source);
  const signature = presetContentSignature(source);
  assert.equal(presetContentSignature(preset.elements), signature);
  const instances = instantiateDrawingPreset(preset, { x: 567, y: 345 }, 40);
  assert.equal(presetContentSignature(instances), signature);
  assert.equal(presetContentSignature(source.map((element) => ({ ...element, groupId: "group" }))), signature);
  const restored = parseDrawingDocument({ ...createEmptyDrawing(), elements: instances, presets: [preset] });
  assert.equal(presetContentSignature(restored.elements), presetContentSignature(restored.presets[0].elements));
  assert.notEqual(presetContentSignature([{ ...source[0], fill: "#ff0000" }, source[1]]), signature);
  assert.notEqual(presetContentSignature([{ ...source[0], x: 15 }, source[1]]), signature);
  assert.notEqual(presetContentSignature(transformDrawingElements(source, 1.2, 0)), signature);
});

test("renames one preset without changing the saved source library", () => {
  const preset = createDrawingPreset("花园", [makeShape("left"), { ...makeShape("right"), x: 180 }]);
  const renamed = renameDrawingPreset([preset], preset.id, `  ${"星".repeat(45)}  `);

  assert.equal(renamed[0]?.name, "星".repeat(40));
  assert.equal(preset.name, "花园");
  assert.notEqual(renamed[0], preset);
  assert.throws(() => renameDrawingPreset([preset], preset.id, "   "), /不能为空/);
  assert.throws(() => renameDrawingPreset([preset], "missing-preset", "新名字"), /没有找到/);
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
