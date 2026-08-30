export const DRAWING_SCHEMA_VERSION = 2 as const;
export const MAX_DRAWING_ELEMENTS = 1_000;
export const MAX_DRAWING_PRESETS = 60;
export const MAX_DRAWING_PRESET_ELEMENTS = 100;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

export type Point = { x: number; y: number };
export type Viewport = { x: number; y: number; zoom: number };
export type LineStyle = "smooth" | "sharp" | "dashed";
export type ShapeKind =
  | "circle"
  | "ellipse"
  | "semicircle"
  | "triangle"
  | "square"
  | "rectangle"
  | "rounded-rectangle"
  | "trapezoid"
  | "parallelogram"
  | "star"
  | "heart";
export type SolidKind = "cube" | "cuboid" | "sphere" | "cylinder" | "cone" | "triangular-pyramid";
export const STICKER_BASE_KINDS = [
  "digit-0",
  "digit-1",
  "digit-2",
  "digit-3",
  "digit-4",
  "digit-5",
  "digit-6",
  "digit-7",
  "digit-8",
  "digit-9",
  "leaf-oval",
  "leaf-maple",
  "leaf-tropical",
  "butterfly-simple",
  "butterfly-medium",
  "butterfly-rich",
  "cloud-simple",
  "cloud-rain",
  "cloud-rainbow",
  "flower-daisy",
  "flower-tulip",
  "flower-sunflower",
  "sky-sun",
  "sky-moon",
  "sky-star",
  "weather-rainbow",
  "weather-lightning",
  "weather-snowflake",
  "insect-ladybug",
  "insect-dragonfly",
  "insect-beetle",
  "ocean-shell",
  "ocean-starfish",
  "ocean-coral",
  "fruit-apple",
  "fruit-strawberry",
  "fruit-acorn",
  "tree-round",
  "tree-pine",
  "tree-palm",
  "garden-mushroom",
  "garden-watering-can",
  "garden-flowerpot",
  "transport-rocket",
  "transport-sailboat",
  "transport-balloon",
  "home-house",
  "home-castle",
  "home-tent",
  "home-little",
  "home-wood",
  "home-camp",
  "toy-kite",
  "toy-pinwheel",
  "toy-blocks",
  "nature-mountain",
  "nature-wave",
  "nature-raindrops",
  "person-child-school",
  "person-child-play",
  "person-child-outdoor",
  "person-adult-daily",
  "person-adult-work",
  "person-adult-active",
  "animal-pet",
  "animal-forest",
  "animal-farm",
] as const;

export const STICKER_VARIANTS = ["plain", "airy", "patterned", "detailed"] as const;

export type StickerBaseKind = (typeof STICKER_BASE_KINDS)[number];
export type StickerVariant = (typeof STICKER_VARIANTS)[number];
export type StickerKind = StickerBaseKind | `${StickerBaseKind}-${Exclude<StickerVariant, "plain">}`;

export const STICKER_KINDS: StickerKind[] = STICKER_BASE_KINDS.flatMap((baseKind) =>
  STICKER_VARIANTS.map((variant) => (
    variant === "plain" ? baseKind : `${baseKind}-${variant}`
  ) as StickerKind),
);

export function splitStickerKind(kind: StickerKind): { baseKind: StickerBaseKind; variant: StickerVariant } {
  for (const variant of STICKER_VARIANTS) {
    if (variant !== "plain" && kind.endsWith(`-${variant}`)) {
      return {
        baseKind: kind.slice(0, -variant.length - 1) as StickerBaseKind,
        variant,
      };
    }
  }
  return { baseKind: kind as StickerBaseKind, variant: "plain" };
}

type BaseElement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  stroke: string;
  strokeWidth: number;
  groupId?: string;
};

export type ShapeElement = BaseElement & {
  type: "shape";
  shape: ShapeKind;
  fill: string;
};

export type SolidElement = BaseElement & {
  type: "solid";
  solid: SolidKind;
  yaw: number;
  pitch: number;
  depth: number;
  faceFills: Record<string, string>;
};

export type StickerElement = BaseElement & {
  type: "sticker";
  sticker: StickerKind;
  mirrored: boolean;
  regionFills: Record<string, string>;
};

export type StrokeElement = BaseElement & {
  type: "stroke";
  points: Point[];
  lineStyle: LineStyle;
  smoothing: boolean;
};

export type DrawingElement = ShapeElement | SolidElement | StickerElement | StrokeElement;

export type DrawingPreset = {
  id: string;
  name: string;
  createdAt: string;
  width: number;
  height: number;
  elements: DrawingElement[];
};

export type DrawingDocument = {
  schemaVersion: typeof DRAWING_SCHEMA_VERSION;
  id: string;
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  viewport: Viewport;
  elements: DrawingElement[];
  presets: DrawingPreset[];
};

export type HistoryNode = {
  id: string;
  label: string;
  createdAt: string;
  elements: DrawingElement[];
  presets: DrawingPreset[];
};

export type Bounds = { x: number; y: number; width: number; height: number };

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function screenPointToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function zoomViewportAt(viewport: Viewport, anchor: Point, requestedZoom: number): Viewport {
  const zoom = clampZoom(requestedZoom);
  const worldAnchor = screenPointToWorld(anchor, viewport);
  return {
    x: anchor.x - worldAnchor.x * zoom,
    y: anchor.y - worldAnchor.y * zoom,
    zoom,
  };
}

export function cloneElements(elements: DrawingElement[]): DrawingElement[] {
  return structuredClone(elements);
}

export function getElementBounds(element: DrawingElement): Bounds {
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

export function getElementsBounds(elements: DrawingElement[]): Bounds | null {
  if (elements.length === 0) return null;
  const left = Math.min(...elements.map((element) => getElementBounds(element).x));
  const top = Math.min(...elements.map((element) => getElementBounds(element).y));
  const right = Math.max(...elements.map((element) => element.x + element.width));
  const bottom = Math.max(...elements.map((element) => element.y + element.height));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function selectionBounds(start: Point, end: Point): Bounds {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function elementIdsInSelection(elements: DrawingElement[], start: Point, end: Point): string[] {
  const selection = selectionBounds(start, end);
  if (selection.width < 2 || selection.height < 2) return [];
  const selectionRight = selection.x + selection.width;
  const selectionBottom = selection.y + selection.height;
  return elements.filter((element) => {
    const bounds = getElementBounds(element);
    return bounds.x <= selectionRight
      && bounds.x + bounds.width >= selection.x
      && bounds.y <= selectionBottom
      && bounds.y + bounds.height >= selection.y;
  }).map((element) => element.id);
}

export function createDrawingPreset(name: string, elements: DrawingElement[]): DrawingPreset {
  const bounds = getElementsBounds(elements);
  if (!bounds || elements.length < 2) throw new Error("至少选择两个图元才能制作预制件。");
  const normalized = cloneElements(elements).map((element) => {
    const next = { ...element, x: element.x - bounds.x, y: element.y - bounds.y };
    delete next.groupId;
    return next;
  });
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 40) || "我的预制件",
    createdAt: new Date().toISOString(),
    width: bounds.width,
    height: bounds.height,
    elements: normalized,
  };
}

export function instantiateDrawingPreset(preset: DrawingPreset, center: Point): DrawingElement[] {
  const groupId = crypto.randomUUID();
  const offsetX = center.x - preset.width / 2;
  const offsetY = center.y - preset.height / 2;
  return cloneElements(preset.elements).map((element) => ({
    ...element,
    id: crypto.randomUUID(),
    groupId,
    x: offsetX + element.x,
    y: offsetY + element.y,
  }));
}

export function renameDrawingPreset(presets: DrawingPreset[], presetId: string, name: string): DrawingPreset[] {
  const nextName = name.trim().slice(0, 40);
  if (!nextName) throw new Error("预制件名称不能为空。");

  let found = false;
  const renamed = presets.map((preset) => {
    const copy = structuredClone(preset);
    if (preset.id !== presetId) return copy;
    found = true;
    return { ...copy, name: nextName };
  });
  if (!found) throw new Error("没有找到这个预制件，请重新打开目录后再试。");
  return renamed;
}

export function mergeDrawingPresets(...libraries: readonly DrawingPreset[][]): DrawingPreset[] {
  const merged: DrawingPreset[] = [];
  const ids = new Set<string>();
  let elementCount = 0;
  for (const library of libraries) {
    for (const preset of library) {
      if (
        ids.has(preset.id)
        || merged.length >= MAX_DRAWING_PRESETS
        || elementCount + preset.elements.length > MAX_DRAWING_ELEMENTS
      ) continue;
      merged.push(structuredClone(preset));
      ids.add(preset.id);
      elementCount += preset.elements.length;
    }
  }
  return merged;
}

export function createEmptyDrawing(presets: DrawingPreset[] = []): DrawingDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: DRAWING_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    title: "我的星空画",
    author: "",
    createdAt: now,
    updatedAt: now,
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [],
    presets: mergeDrawingPresets(presets),
  };
}

export function makeHistoryNode(label: string, elements: DrawingElement[], presets: DrawingPreset[] = []): HistoryNode {
  return {
    id: crypto.randomUUID(),
    label,
    createdAt: new Date().toISOString(),
    elements: cloneElements(elements),
    presets: structuredClone(presets),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isShortString(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= max && (allowEmpty || value.trim().length > 0);
}

function isDateTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function parseColorMap(value: unknown): Record<string, string> | undefined {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > 64) return undefined;
  const parsed: Record<string, string> = {};
  for (const [key, color] of entries) {
    if (!isShortString(key, 80) || !isColor(color)) return undefined;
    parsed[key] = color;
  }
  return parsed;
}

const SHAPES = new Set<ShapeKind>([
  "circle",
  "ellipse",
  "semicircle",
  "triangle",
  "square",
  "rectangle",
  "rounded-rectangle",
  "trapezoid",
  "parallelogram",
  "star",
  "heart",
]);
const SOLIDS = new Set<SolidKind>(["cube", "cuboid", "sphere", "cylinder", "cone", "triangular-pyramid"]);
const STICKERS = new Set<StickerKind>(STICKER_KINDS);
const LINE_STYLES = new Set<LineStyle>(["smooth", "sharp", "dashed"]);

function parseBaseElement(value: Record<string, unknown>): BaseElement | undefined {
  if (
    !isShortString(value.id, 80)
    || !isFiniteInRange(value.x, -1_000_000, 1_000_000)
    || !isFiniteInRange(value.y, -1_000_000, 1_000_000)
    || !isFiniteInRange(value.width, 1, 10_000)
    || !isFiniteInRange(value.height, 1, 10_000)
    || !isFiniteInRange(value.rotation, -3_600, 3_600)
    || !isColor(value.stroke)
    || !isFiniteInRange(value.strokeWidth, 1, 80)
    || (value.groupId !== undefined && !isShortString(value.groupId, 80))
  ) return undefined;

  return {
    id: value.id,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    rotation: value.rotation,
    stroke: value.stroke,
    strokeWidth: value.strokeWidth,
    ...(typeof value.groupId === "string" ? { groupId: value.groupId } : {}),
  };
}

function parseElement(value: unknown): DrawingElement | undefined {
  if (!isObject(value)) return undefined;
  const base = parseBaseElement(value);
  if (!base) return undefined;

  if (value.type === "shape" && typeof value.shape === "string" && SHAPES.has(value.shape as ShapeKind) && isColor(value.fill)) {
    return { ...base, type: "shape", shape: value.shape as ShapeKind, fill: value.fill };
  }

  if (
    value.type === "solid"
    && typeof value.solid === "string"
    && SOLIDS.has(value.solid as SolidKind)
    && isFiniteInRange(value.yaw, -75, 75)
    && isFiniteInRange(value.pitch, -60, 60)
    && isFiniteInRange(value.depth, 10, 180)
  ) {
    const faceFills = parseColorMap(value.faceFills);
    if (!faceFills) return undefined;
    return {
      ...base,
      type: "solid",
      solid: value.solid as SolidKind,
      yaw: value.yaw,
      pitch: value.pitch,
      depth: value.depth,
      faceFills,
    };
  }

  if (value.type === "sticker" && typeof value.sticker === "string" && STICKERS.has(value.sticker as StickerKind)) {
    const regionFills = parseColorMap(value.regionFills);
    if (!regionFills || (value.mirrored !== undefined && typeof value.mirrored !== "boolean")) return undefined;
    return {
      ...base,
      type: "sticker",
      sticker: value.sticker as StickerKind,
      mirrored: value.mirrored ?? false,
      regionFills,
    };
  }

  if (
    value.type === "stroke"
    && Array.isArray(value.points)
    && value.points.length >= 2
    && value.points.length <= 2_000
    && typeof value.lineStyle === "string"
    && LINE_STYLES.has(value.lineStyle as LineStyle)
    && typeof value.smoothing === "boolean"
  ) {
    const points: Point[] = [];
    for (const point of value.points) {
      if (!isObject(point) || !isFiniteInRange(point.x, -1_000_000, 1_000_000) || !isFiniteInRange(point.y, -1_000_000, 1_000_000)) {
        return undefined;
      }
      points.push({ x: point.x, y: point.y });
    }
    return {
      ...base,
      type: "stroke",
      points,
      lineStyle: value.lineStyle as LineStyle,
      smoothing: value.smoothing,
    };
  }

  return undefined;
}

function parsePreset(value: unknown): DrawingPreset | undefined {
  if (
    !isObject(value)
    || !isShortString(value.id, 80)
    || !isShortString(value.name, 40)
    || !isDateTime(value.createdAt)
    || !isFiniteInRange(value.width, 1, 10_000)
    || !isFiniteInRange(value.height, 1, 10_000)
    || !Array.isArray(value.elements)
    || value.elements.length < 2
    || value.elements.length > MAX_DRAWING_PRESET_ELEMENTS
  ) return undefined;
  const elements: DrawingElement[] = [];
  const ids = new Set<string>();
  for (const candidate of value.elements) {
    const element = parseElement(candidate);
    if (!element || ids.has(element.id)) return undefined;
    ids.add(element.id);
    elements.push(element);
  }
  return {
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    width: value.width,
    height: value.height,
    elements,
  };
}

export function parseDrawingDocument(value: unknown): DrawingDocument {
  if (!isObject(value) || (value.schemaVersion !== 1 && value.schemaVersion !== DRAWING_SCHEMA_VERSION)) {
    throw new Error("这份作品的版本暂时不能打开。");
  }
  if (
    !isShortString(value.id, 80)
    || !isShortString(value.title, 80)
    || !isShortString(value.author, 80, true)
    || !isDateTime(value.createdAt)
    || !isDateTime(value.updatedAt)
    || !isObject(value.viewport)
    || !isFiniteInRange(value.viewport.x, -10_000_000, 10_000_000)
    || !isFiniteInRange(value.viewport.y, -10_000_000, 10_000_000)
    || !isFiniteInRange(value.viewport.zoom, MIN_ZOOM, MAX_ZOOM)
    || !Array.isArray(value.elements)
    || value.elements.length > MAX_DRAWING_ELEMENTS
  ) {
    throw new Error("这份作品的数据不完整，暂时不能打开。");
  }

  const elements: DrawingElement[] = [];
  const ids = new Set<string>();
  for (const candidate of value.elements) {
    const element = parseElement(candidate);
    if (!element || ids.has(element.id)) {
    throw new Error("这份作品里有无法识别或重复的图元。");
    }
    ids.add(element.id);
    elements.push(element);
  }

  const presetCandidates = value.schemaVersion === 1 ? [] : value.presets;
  if (!Array.isArray(presetCandidates) || presetCandidates.length > MAX_DRAWING_PRESETS) {
    throw new Error("这份作品的预制件数据不完整，暂时不能打开。");
  }
  const presets: DrawingPreset[] = [];
  const presetIds = new Set<string>();
  let presetElementCount = 0;
  for (const candidate of presetCandidates) {
    const preset = parsePreset(candidate);
    if (!preset || presetIds.has(preset.id)) {
      throw new Error("这份作品里有无法识别或重复的预制件。");
    }
    presetElementCount += preset.elements.length;
    if (presetElementCount > MAX_DRAWING_ELEMENTS) {
      throw new Error("这份作品保存的预制件太多，暂时不能打开。");
    }
    presetIds.add(preset.id);
    presets.push(preset);
  }

  return {
    schemaVersion: DRAWING_SCHEMA_VERSION,
    id: value.id,
    title: value.title,
    author: value.author,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    viewport: { x: value.viewport.x, y: value.viewport.y, zoom: value.viewport.zoom },
    elements,
    presets,
  };
}
