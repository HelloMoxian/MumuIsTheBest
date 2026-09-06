import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { flushSync } from "react-dom";
import {
  CatalogPreview,
  SHAPE_OPTIONS,
  SOLID_OPTIONS,
  STICKER_OPTIONS,
  ShapeArt,
  SolidArt,
  StickerArt,
  type CatalogOption,
} from "./art";
import {
  MAX_DRAWING_ELEMENTS,
  MAX_DRAWING_LAYER,
  MAX_DRAWING_PRESET_ELEMENTS,
  MAX_DRAWING_PRESETS,
  MIN_DRAWING_LAYER,
  cloneElements,
  createDrawingPreset,
  createEmptyDrawing,
  createFreeShape,
  elementIdsInSelection,
  getElementsBounds,
  instantiateDrawingPreset,
  makeHistoryNode,
  measureTextElement,
  mergeDrawingPresets,
  nextCreatedOrder,
  parseDrawingDocument,
  presetContentSignature,
  renameDrawingPreset,
  screenPointToWorld,
  selectionBounds,
  sortDrawingElements,
  transformDrawingElements,
  updateTextElement,
  zoomViewportAt,
  type Bounds,
  type DrawingDocument,
  type DrawingElement,
  type DrawingPreset,
  type HistoryNode,
  type LineStyle,
  type Point,
  type ShapeKind,
  type FreeShapeKind,
  type SolidElement,
  type SolidKind,
  type StickerKind,
  type StrokeElement,
  type TextElement,
  type TextLayout,
  type Viewport,
} from "./logic";
import {
  loadPersistentData,
  queuePersistentDataWrite,
  savePersistentData,
} from "../../shared/persistent-data";
import {
  listDrawingWorks,
  loadDrawingWork,
  saveDrawingWork,
  updateDrawingWork,
  deleteDrawingWork,
  type DrawingWorkSummary,
} from "./works-api";
import {
  SpokenActionButton,
  announceSpokenAction,
  type LearningSpeechMoment,
} from "../../shared/experience";
import {
  DRAWING_TOOL_SHORTCUTS,
  drawingToolForShortcut,
  arrowMovement,
  spatialNavigationIndex,
  type DrawingShortcutTool,
} from "./shortcuts";
import drawingActionSpeechCatalog from "../../../../../content/drawing-studio/ui-action-speech.v1.json";
import "./drawing-studio.css";

type ToolId = DrawingShortcutTool | "text";
type DrawerId = "history" | "works" | "author" | null;
type AutoSaveStatus = "loading" | "saving" | "saved" | "error";
type Gesture =
  | { type: "pan"; pointerId: number; start: Point; viewport: Viewport; selectOnTap: boolean }
  | { type: "move"; pointerId: number; startWorld: Point; elements: DrawingElement[]; moved: boolean }
  | { type: "marquee"; pointerId: number; startWorld: Point; currentWorld: Point }
  | { type: "draw"; pointerId: number; points: Point[] }
  | { type: "free-shape"; pointerId: number; startWorld: Point; currentWorld: Point; kind: FreeShapeKind }
  | null;

const DRAWING_ACTION_AUDIO_BASE = "/audio/ui-actions/drawing-studio";
const DRAWING_ACTION_SPEECH = new Map(
  drawingActionSpeechCatalog.actions.map((action) => [action.id, action]),
);

function drawingActionSpeech(id: string): LearningSpeechMoment {
  const phrase = DRAWING_ACTION_SPEECH.get(id);
  if (!phrase) throw new Error(`Missing drawing action speech phrase: ${id}`);
  return { zh: phrase.zh, en: phrase.en, bilingualAudioSrc: `${DRAWING_ACTION_AUDIO_BASE}/${id}.m4a` };
}

const TOOL_OPTIONS: Array<{
  id: ToolId;
  label: string;
  mark: string;
  shortcut?: string;
  speech: LearningSpeechMoment;
}> = [
  { id: "select", label: "选择", mark: "↖", shortcut: DRAWING_TOOL_SHORTCUTS.select, speech: drawingActionSpeech("tool-select") },
  { id: "pan", label: "画布", mark: "✥", shortcut: DRAWING_TOOL_SHORTCUTS.pan, speech: drawingActionSpeech("tool-canvas") },
  { id: "shape", label: "形状", mark: "△", shortcut: DRAWING_TOOL_SHORTCUTS.shape, speech: drawingActionSpeech("tool-shape") },
  { id: "solid", label: "立体", mark: "◇", shortcut: DRAWING_TOOL_SHORTCUTS.solid, speech: drawingActionSpeech("tool-solid") },
  { id: "sticker", label: "贴纸", mark: "✦", shortcut: DRAWING_TOOL_SHORTCUTS.sticker, speech: drawingActionSpeech("tool-sticker") },
  { id: "preset", label: "预制件", mark: "▦", shortcut: DRAWING_TOOL_SHORTCUTS.preset, speech: drawingActionSpeech("tool-preset") },
  { id: "text", label: "文字", mark: "文", shortcut: DRAWING_TOOL_SHORTCUTS.text, speech: drawingActionSpeech("tool-text") },
  { id: "brush", label: "画笔", mark: "╱", shortcut: DRAWING_TOOL_SHORTCUTS.brush, speech: drawingActionSpeech("tool-brush") },
  { id: "eraser", label: "橡皮擦", mark: "⌫", shortcut: DRAWING_TOOL_SHORTCUTS.eraser, speech: drawingActionSpeech("tool-eraser") },
  { id: "fill", label: "填色", mark: "●", shortcut: DRAWING_TOOL_SHORTCUTS.fill, speech: drawingActionSpeech("tool-fill") },
];

const TOP_ACTION_SPEECH = {
  save: drawingActionSpeech("action-save"),
  edit: drawingActionSpeech("action-edit"),
  undo: drawingActionSpeech("action-undo"),
} as const;

const GROUP_SPEECH: Record<string, LearningSpeechMoment> = Object.fromEntries([
  ["自由形状", "group-free-shapes"],
  ["圆与弧", "group-circles-arcs"],
  ["基础形状", "group-basic-shapes"],
  ["四边形", "group-quadrilaterals"],
  ["装饰形状", "group-decorative-shapes"],
  ["棱柱", "group-prisms"],
  ["棱锥", "group-pyramids"],
  ["曲面立体", "group-curved-solids"],
  ["数字", "group-digits"],
  ["树叶", "group-leaves"],
  ["蝴蝶", "group-butterflies"],
  ["云彩", "group-clouds"],
  ["花朵", "group-flowers"],
  ["天空", "group-sky"],
  ["天气", "group-weather"],
  ["小虫子", "group-insects"],
  ["海洋", "group-ocean"],
  ["果实", "group-fruit"],
  ["树木", "group-trees"],
  ["庭院", "group-garden"],
  ["出行", "group-transport"],
  ["小屋", "group-houses"],
  ["玩具", "group-toys"],
  ["自然", "group-nature"],
  ["小孩", "group-children"],
  ["大人", "group-adults"],
  ["小动物", "group-animals"],
].map(([zh, id]) => [zh, drawingActionSpeech(id)]));

type PaletteColor = { value: string; label: string };

const BASIC_PALETTE: PaletteColor[] = [
  { value: "#ffffff", label: "白色" },
  { value: "#ffd166", label: "星光黄" },
  { value: "#ff8fcf", label: "花瓣粉" },
  { value: "#70e8ff", label: "天空青" },
  { value: "#67dda8", label: "树叶绿" },
  { value: "#9f8cff", label: "星云紫" },
  { value: "#ff9d66", label: "橘子橙" },
  { value: "#6ea8ff", label: "海洋蓝" },
  { value: "#171536", label: "深空黑" },
];

const FILL_PALETTE: PaletteColor[] = [
  { value: "#ffffff", label: "白色" },
  { value: "#9ba2b9", label: "月岩灰" },
  { value: "#171536", label: "深空黑" },
  { value: "#fff3a3", label: "奶油黄" },
  { value: "#ffd166", label: "星光黄" },
  { value: "#ff9d66", label: "橘子橙" },
  { value: "#ffc0b7", label: "珊瑚浅红" },
  { value: "#ff6b6b", label: "苹果红" },
  { value: "#d9435f", label: "莓果红" },
  { value: "#ffd1e7", label: "樱花浅粉" },
  { value: "#ff8fcf", label: "花瓣粉" },
  { value: "#e85baa", label: "玫瑰粉" },
  { value: "#ddd3ff", label: "薰衣草浅紫" },
  { value: "#9f8cff", label: "星云紫" },
  { value: "#6950dc", label: "宇宙深紫" },
  { value: "#c9e6ff", label: "冰川浅蓝" },
  { value: "#6ea8ff", label: "海洋蓝" },
  { value: "#355fcb", label: "深海蓝" },
  { value: "#c9f8ff", label: "云雾浅青" },
  { value: "#70e8ff", label: "天空青" },
  { value: "#39c9c6", label: "绿松石青" },
  { value: "#c8f3df", label: "薄荷浅绿" },
  { value: "#67dda8", label: "树叶绿" },
  { value: "#2f8f63", label: "森林绿" },
  { value: "#f6e2bd", label: "沙滩米色" },
  { value: "#b9825b", label: "木头棕" },
  { value: "#6f4b3e", label: "泥土深棕" },
];

const INITIAL_GROUPS = {
  shape: "基础形状",
  solid: "棱柱",
  sticker: "树叶",
};

const DRAWING_STUDIO_STATE_ID = "drawing-studio";
const AUTO_SAVE_DELAY_MS = 800;

function parsePersistentDrawing(value: unknown): DrawingDocument | undefined {
  try {
    return parseDrawingDocument(value);
  } catch {
    return undefined;
  }
}

function drawingSnapshot(document: DrawingDocument, viewport: Viewport): DrawingDocument {
  return {
    ...cloneDocument(document),
    viewport: { ...viewport },
    updatedAt: new Date().toISOString(),
  };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function formatCreationTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function createCanvasThumbnail(canvas: SVGSVGElement | null): Promise<string | null> {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const clone = canvas.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll(".drawing-selection-box, .drawing-marquee-box, .drawing-draft-stroke, .drawing-free-draft")
    .forEach((node) => node.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(rect.width));
  clone.setAttribute("height", String(rect.height));
  clone.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("THUMBNAIL_RENDER_FAILED"));
      image.src = url;
    });
    const output = window.document.createElement("canvas");
    output.width = 360;
    output.height = 220;
    const context = output.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(image, 0, 0, output.width, output.height);
    return output.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pathFromPoints(points: Point[], smoothing: boolean) {
  if (points.length === 0) return "";
  if (!smoothing || points.length < 3) {
    return `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")}`;
  }
  let path = `M ${points[0]?.x ?? 0} ${points[0]?.y ?? 0}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    if (!point || !next) continue;
    const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
    path += ` Q ${point.x} ${point.y} ${midpoint.x} ${midpoint.y}`;
  }
  const last = points.at(-1);
  if (last) path += ` L ${last.x} ${last.y}`;
  return path;
}

function optionGroups<T extends string>(options: CatalogOption<T>[]) {
  return Array.from(new Set(options.map((option) => option.group)));
}

function cloneDocument(document: DrawingDocument): DrawingDocument {
  return structuredClone(document);
}

function topActionClass(active = false) {
  return active ? "drawing-top-action is-active" : "drawing-top-action";
}

export function DrawingStudioPage() {
  const [document, setDocument] = useState<DrawingDocument>(() => createEmptyDrawing());
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [history, setHistory] = useState<HistoryNode[]>(() => [makeHistoryNode("打开空白画布", [])]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<ToolId>("shape");
  const [freeShape, setFreeShape] = useState<FreeShapeKind | null>(null);
  const [freeDraft, setFreeDraft] = useState<{ kind: FreeShapeKind; bounds: Bounds } | null>(null);
  const [workAction, setWorkAction] = useState<{ kind: "rename" | "locked" | "delete"; id: string; title: string; useCurrent?: boolean } | null>(null);
  const [workActionError, setWorkActionError] = useState("");
  const [activeGroups, setActiveGroups] = useState(INITIAL_GROUPS);
  const [panelOpen, setPanelOpen] = useState(true);
  const [drawer, setDrawer] = useState<DrawerId>(null);
  const [fillColor, setFillColor] = useState("#ffd166");
  const [brushColor, setBrushColor] = useState("#171536");
  const [brushWidth, setBrushWidth] = useState(7);
  const [lineStyle, setLineStyle] = useState<LineStyle>("smooth");
  const [smoothing, setSmoothing] = useState(true);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [textDraft, setTextDraft] = useState("木木的画");
  const [textColor, setTextColor] = useState("#171536");
  const [textSize, setTextSize] = useState(48);
  const [textLayout, setTextLayout] = useState<TextLayout>("horizontal");
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [message, setMessage] = useState("从右边选一个图元，开始第一笔创作吧。");
  const [savedWorks, setSavedWorks] = useState<DrawingWorkSummary[]>([]);
  const [worksLoading, setWorksLoading] = useState(false);
  const [workSaving, setWorkSaving] = useState(false);
  const [titleDraft, setTitleDraft] = useState(document.title);
  const [authorDraft, setAuthorDraft] = useState(document.author);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("loading");
  const [presetRename, setPresetRename] = useState<{ id: string; draft: string } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const toolboxRef = useRef<HTMLElement>(null);
  const keyboardEditRef = useRef(false);
  const lastPackedRef = useRef<{ signature: string; presetId: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<Gesture>(null);
  const documentRef = useRef(document);
  const viewportRef = useRef(viewport);
  const spacePressedRef = useRef(false);
  const persistenceReadyRef = useRef(persistenceReady);
  const persistenceEnabledRef = useRef(persistenceEnabled);
  const autoSaveRevisionRef = useRef(0);

  documentRef.current = document;
  viewportRef.current = viewport;
  persistenceReadyRef.current = persistenceReady;
  persistenceEnabledRef.current = persistenceEnabled;

  const selectedElements = useMemo(() => {
    const ids = new Set(selectedIds);
    return document.elements.filter((element) => ids.has(element.id));
  }, [document.elements, selectedIds]);
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] ?? null : null;
  const selectedBounds = useMemo(() => getElementsBounds(selectedElements), [selectedElements]);
  const selectionSignature = useMemo(() => presetContentSignature(selectedElements), [selectedElements]);
  const matchingPreset = useMemo(() => selectedElements.length >= 2
    ? document.presets.find((preset) => presetContentSignature(preset.elements) === selectionSignature)
    : undefined, [document.presets, selectedElements.length, selectionSignature]);
  const focusCanvas = () => canvasRef.current?.focus({ preventScroll: true });

  const commitElements = useCallback((label: string, elements: DrawingElement[], presets = documentRef.current.presets) => {
    const nextElements = cloneElements(elements);
    const nextPresets = structuredClone(presets) as DrawingPreset[];
    const nextDocument = { ...documentRef.current, elements: nextElements, presets: nextPresets, updatedAt: new Date().toISOString() };
    documentRef.current = nextDocument;
    setDocument(nextDocument);
    const node = makeHistoryNode(label, nextElements, nextPresets);
    setHistory((current) => {
      const next = [...current.slice(0, historyIndex + 1), node].slice(-80);
      setHistoryIndex(next.length - 1);
      return next;
    });
    setMessage(label);
  }, [historyIndex]);

  const finishKeyboardEdit = () => {
    if (!keyboardEditRef.current) return;
    keyboardEditRef.current = false;
    commitElements("键盘调整选中内容", documentRef.current.elements);
  };

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing || !persistenceReadyRef.current) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      finishKeyboardEdit();
      flushSync(() => setPanelOpen(true));
      toolboxRef.current?.querySelector<HTMLButtonElement>("[data-drawing-nav='tools'] .is-active")?.focus();
      return;
    }
    const movement = arrowMovement(event.key, event.repeat);
    const scale = ["+", "=", "Add"].includes(event.key) ? 1.05 : ["-", "_", "Subtract"].includes(event.key) ? 1 / 1.05 : null;
    if (!movement && !scale) return;
    event.preventDefault(); event.stopPropagation();
    if (gestureRef.current) return;
    const ids = new Set(selectedIds);
    const elements = documentRef.current.elements.filter((element) => ids.has(element.id));
    if (!elements.length) return;
    let next: DrawingElement[];
    if (movement) {
      const dx = Math.max(-1e6 - Math.min(...elements.map((element) => element.x)), Math.min(1e6 - Math.max(...elements.map((element) => element.x)), movement.x));
      const dy = Math.max(-1e6 - Math.min(...elements.map((element) => element.y)), Math.min(1e6 - Math.max(...elements.map((element) => element.y)), movement.y));
      next = elements.map((element) => ({ ...element, x: element.x + dx, y: element.y + dy }));
    } else {
      next = transformDrawingElements(elements, scale!, 0);
    }
    const replacements = new Map(next.map((element) => [element.id, element]));
    const updated = { ...documentRef.current, elements: documentRef.current.elements.map((element) => replacements.get(element.id) ?? element), updatedAt: new Date().toISOString() };
    documentRef.current = updated;
    keyboardEditRef.current = true;
    setDocument(updated);
  };

  const goToHistory = useCallback((index: number) => {
    const node = history[index];
    if (!node) return;
    setHistoryIndex(index);
    setDocument((current) => ({ ...current, elements: cloneElements(node.elements), presets: structuredClone(node.presets), updatedAt: new Date().toISOString() }));
    setSelectedIds([]);
    setMessage(`已经回到“${node.label}”`);
  }, [history]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    goToHistory(historyIndex - 1);
  }, [goToHistory, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    goToHistory(historyIndex + 1);
  }, [goToHistory, history.length, historyIndex]);

  const chooseTool = useCallback((nextTool: ToolId) => {
    setTool(nextTool);
    setPanelOpen(true);
    setFreeShape(null);
    setFreeDraft(null);
    setMarquee(null);
    setDraftPoints([]);
    gestureRef.current = null;
    setDrawer(null);
    if (nextTool !== "preset") setPresetRename(null);
    if (nextTool !== "select") setSelectedIds([]);
    setMessage(TOOL_OPTIONS.find((option) => option.id === nextTool)?.label ?? "工具已切换");
  }, []);

  const viewCenterWorld = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenPointToWorld({ x: rect.width / 2, y: rect.height / 2 }, viewportRef.current);
  };

  const addElement = (type: "shape" | "solid" | "sticker", id: ShapeKind | SolidKind | StickerKind) => {
    if (type === "shape" && id.startsWith("free-")) {
      setFreeShape(id as FreeShapeKind);
      setSelectedIds([]);
      setMessage("在白板上按住并拖出一个框，松开就画好了。");
      focusCanvas();
      return;
    }
    setFreeShape(null);
    if (documentRef.current.elements.length >= MAX_DRAWING_ELEMENTS) {
      setMessage("这张画已经有 1000 个图元啦，可以先擦掉一些再继续。");
      return;
    }
    const center = viewCenterWorld();
    const common = {
      id: crypto.randomUUID(),
      x: center.x - 80,
      y: center.y - 80,
      width: 160,
      height: 160,
      rotation: 0,
      stroke: "#171536",
      strokeWidth: 3.5,
      layer: 0,
      createdOrder: nextCreatedOrder(documentRef.current.elements),
    };
    let element: DrawingElement;
    if (type === "shape") {
      element = { ...common, type: "shape", shape: id as ShapeKind, fill: "#ffffff" };
    } else if (type === "solid") {
      element = {
        ...common,
        type: "solid",
        solid: id as SolidKind,
        yaw: 18,
        pitch: -14,
        depth: 70,
        faceFills: {},
      };
    } else {
      element = { ...common, type: "sticker", sticker: id as StickerKind, mirrored: false, regionFills: {} };
    }
    commitElements(`放入${type === "shape" ? "形状" : type === "solid" ? "立体" : "贴纸"}`, [...documentRef.current.elements, element]);
    setSelectedIds([element.id]);
    focusCanvas();
  };

  const addTextElement = () => {
    const text = textDraft.trim().slice(0, 200);
    if (!text) {
      setMessage("先写一点文字，再把它放进画布吧。");
      return;
    }
    if (documentRef.current.elements.length >= MAX_DRAWING_ELEMENTS) {
      setMessage("这张画已经有 1000 个图元啦，可以先擦掉一些再继续。");
      return;
    }
    const center = viewCenterWorld();
    const size = measureTextElement(text, textSize, textLayout);
    const element: TextElement = {
      id: crypto.randomUUID(),
      type: "text",
      text,
      fontSize: textSize,
      color: textColor,
      layout: textLayout,
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
      width: size.width,
      height: size.height,
      rotation: 0,
      stroke: textColor,
      strokeWidth: 1,
      layer: 0,
      createdOrder: nextCreatedOrder(documentRef.current.elements),
    };
    commitElements("放入文字", [...documentRef.current.elements, element]);
    setSelectedIds([element.id]);
    focusCanvas();
  };

  const replaceElementsLive = (nextElements: DrawingElement[]) => {
    const replacements = new Map(nextElements.map((element) => [element.id, element]));
    setDocument((current) => ({
      ...current,
      elements: current.elements.map((element) => replacements.get(element.id) ?? element),
      updatedAt: new Date().toISOString(),
    }));
  };

  const replaceElementLive = (next: DrawingElement) => replaceElementsLive([next]);

  const updateSelection = (label: string, update: (element: DrawingElement) => DrawingElement) => {
    if (selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    const next = documentRef.current.elements.map((element) => ids.has(element.id) ? update(element) : element);
    commitElements(label, next);
  };

  const transformSelection = (label: string, scale: number, rotationDelta: number) => {
    const transformed = transformDrawingElements(selectedElements, scale, rotationDelta);
    if (transformed.length === 0) return;
    const replacements = new Map(transformed.map((element) => [element.id, element]));
    commitElements(label, documentRef.current.elements.map((element) => replacements.get(element.id) ?? element));
  };

  const setSelectionLayer = (requestedLayer: number, label = "修改渲染层级") => {
    const layer = Math.min(MAX_DRAWING_LAYER, Math.max(MIN_DRAWING_LAYER, Math.round(requestedLayer)));
    updateSelection(label, (element) => ({ ...element, layer }));
  };

  const moveSelectionLayer = (direction: "top" | "bottom" | "up" | "down") => {
    if (selectedElements.length === 0) return;
    const layers = documentRef.current.elements.map((element) => element.layer);
    if (direction === "top") {
      setSelectionLayer(Math.min(MAX_DRAWING_LAYER, Math.max(...layers) + 1), "把选中内容置顶");
    } else if (direction === "bottom") {
      setSelectionLayer(Math.max(MIN_DRAWING_LAYER, Math.min(...layers) - 1), "把选中内容置底");
    } else {
      updateSelection(direction === "up" ? "把选中内容提高一层" : "把选中内容降低一层", (element) => ({
        ...element,
        layer: Math.min(MAX_DRAWING_LAYER, Math.max(MIN_DRAWING_LAYER, element.layer + (direction === "up" ? 1 : -1))),
      }));
    }
  };

  const mirrorSelectedSticker = () => {
    if (selectedElement?.type !== "sticker") return;
    const stickerId = selectedElement.id;
    const mirrored = !selectedElement.mirrored;
    const next = documentRef.current.elements.map((element) => (
      element.id === stickerId && element.type === "sticker" ? { ...element, mirrored } : element
    ));
    commitElements(mirrored ? "左右镜像贴纸" : "恢复贴纸方向", next);
  };

  const copySelected = useCallback(() => {
    const ids = new Set(selectedIds);
    const sources = documentRef.current.elements.filter((element) => ids.has(element.id));
    if (sources.length === 0 || documentRef.current.elements.length + sources.length > MAX_DRAWING_ELEMENTS) return;
    const groupId = sources.length > 1 ? crypto.randomUUID() : undefined;
    const startOrder = nextCreatedOrder(documentRef.current.elements);
    const duplicates = sources.map((source, index) => ({
      ...structuredClone(source),
      id: crypto.randomUUID(),
      x: source.x + 24,
      y: source.y + 24,
      createdOrder: startOrder + index,
      ...(groupId ? { groupId } : {}),
    })) as DrawingElement[];
    commitElements(sources.length === 1 ? "复制一个图元" : `复制 ${sources.length} 个图元`, [...documentRef.current.elements, ...duplicates]);
    setSelectedIds(duplicates.map((element) => element.id));
  }, [commitElements, selectedIds]);

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    const next = documentRef.current.elements.filter((element) => !ids.has(element.id));
    if (next.length === documentRef.current.elements.length) return;
    commitElements(selectedIds.length === 1 ? "擦掉一个图元" : `擦掉 ${selectedIds.length} 个图元`, next);
    setSelectedIds([]);
  }, [commitElements, selectedIds]);

  const saveSelectionAsPreset = () => {
    const signature = presetContentSignature(selectedElements);
    if (matchingPreset || (lastPackedRef.current?.signature === signature && documentRef.current.presets.some((preset) => preset.id === lastPackedRef.current?.presetId))) {
      setMessage("这组内容已经存为预制件，修改内容后可以再打包。");
      return;
    }
    if (selectedElements.length < 2) {
      setMessage("请先拉框选择至少两个图元，再打包成预制件。");
      return;
    }
    if (selectedElements.length > MAX_DRAWING_PRESET_ELEMENTS) {
      setMessage(`一个预制件最多包含 ${MAX_DRAWING_PRESET_ELEMENTS} 个图元，可以缩小选择范围后再试。`);
      return;
    }
    if (documentRef.current.presets.length >= MAX_DRAWING_PRESETS) {
      setMessage(`一份作品最多保存 ${MAX_DRAWING_PRESETS} 个预制件，可以先删除不再使用的模板。`);
      return;
    }
    const savedPresetElementCount = documentRef.current.presets.reduce((total, preset) => total + preset.elements.length, 0);
    if (savedPresetElementCount + selectedElements.length > MAX_DRAWING_ELEMENTS) {
      setMessage("预制件目录最多保存 1000 个模板图元，可以先删除不再使用的预制件。");
      return;
    }
    const preset = createDrawingPreset(`预制件 ${documentRef.current.presets.length + 1}`, selectedElements);
    lastPackedRef.current = { signature, presetId: preset.id };
    const groupId = crypto.randomUUID();
    const ids = new Set(selectedIds);
    const grouped = documentRef.current.elements.map((element) => ids.has(element.id) ? { ...element, groupId } : element);
    commitElements(`打包“${preset.name}”`, grouped, [...documentRef.current.presets, preset]);
    setMessage(`“${preset.name}”已经放进预制件，画布中的这组图元也会整体移动。`);
    void announceSpokenAction(drawingActionSpeech("action-preset-created"));
  };

  const addPreset = (preset: DrawingPreset) => {
    if (documentRef.current.elements.length + preset.elements.length > MAX_DRAWING_ELEMENTS) {
      setMessage("放入这个预制件会超过 1000 个图元，可以先删掉一些内容。");
      return;
    }
    const instances = instantiateDrawingPreset(preset, viewCenterWorld(), nextCreatedOrder(documentRef.current.elements));
    commitElements(`放入“${preset.name}”`, [...documentRef.current.elements, ...instances]);
    setSelectedIds(instances.map((element) => element.id));
    focusCanvas();
  };

  const deletePreset = (presetId: string) => {
    const preset = documentRef.current.presets.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    commitElements(`删除预制件“${preset.name}”`, documentRef.current.elements, documentRef.current.presets.filter((candidate) => candidate.id !== presetId));
    if (presetRename?.id === presetId) setPresetRename(null);
  };

  const savePresetRename = (presetId: string) => {
    if (presetRename?.id !== presetId) return;
    const preset = documentRef.current.presets.find((candidate) => candidate.id === presetId);
    if (!preset) {
      setPresetRename(null);
      setMessage("没有找到这个预制件，请重新打开目录后再试。");
      return;
    }
    try {
      const renamed = renameDrawingPreset(documentRef.current.presets, presetId, presetRename.draft);
      const nextName = renamed.find((candidate) => candidate.id === presetId)?.name ?? preset.name;
      setPresetRename(null);
      if (nextName === preset.name) {
        setMessage(`“${preset.name}”的名称没有变化。`);
        return;
      }
      commitElements(`把预制件“${preset.name}”重命名为“${nextName}”`, documentRef.current.elements, renamed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "这个名字暂时不能使用。");
    }
  };

  const fillRegion = (elementId: string, regionId: string | null) => {
    const next = documentRef.current.elements.map((element) => {
      if (element.id !== elementId) return element;
      if (element.type === "shape") return { ...element, fill: fillColor };
      if (element.type === "sticker" && regionId) {
        return { ...element, regionFills: { ...element.regionFills, [regionId]: fillColor } };
      }
      if (element.type === "solid" && regionId) {
        return { ...element, faceFills: { ...element.faceFills, [regionId]: fillColor } };
      }
      if (element.type === "stroke") return { ...element, stroke: fillColor };
      return element;
    });
    commitElements("给一个区域涂色", next);
  };

  const beginPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    gestureRef.current = {
      type: "pan",
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      viewport: viewportRef.current,
      selectOnTap: event.button === 0 && !spacePressedRef.current && !(event.target as Element).closest("[data-element-id]"),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!persistenceReadyRef.current) return;
    if (event.button !== 0 && event.button !== 1) return;
    finishKeyboardEdit();
    focusCanvas();
    const target = event.target as Element;
    const elementNode = target.closest("[data-element-id]");
    const regionNode = target.closest("[data-region-id]");
    const elementId = elementNode?.getAttribute("data-element-id") ?? null;
    const regionId = regionNode?.getAttribute("data-region-id") ?? null;

    if (event.button === 1 || tool === "pan" || spacePressedRef.current) {
      beginPan(event);
      return;
    }

    if (tool === "fill" && elementId) {
      fillRegion(elementId, regionId);
      return;
    }

    if (tool === "eraser" && elementId) {
      const erased = documentRef.current.elements.find((element) => element.id === elementId);
      const eraseIds = new Set(erased?.groupId
        ? documentRef.current.elements.filter((element) => element.groupId === erased.groupId).map((element) => element.id)
        : [elementId]);
      commitElements(eraseIds.size === 1 ? "擦掉一个图元" : `擦掉一组 ${eraseIds.size} 个图元`, documentRef.current.elements.filter((element) => !eraseIds.has(element.id)));
      setSelectedIds([]);
      return;
    }

    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldPoint = screenPointToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, viewportRef.current);

    if (tool === "shape" && freeShape) {
      gestureRef.current = { type: "free-shape", pointerId: event.pointerId, startWorld: worldPoint, currentWorld: worldPoint, kind: freeShape };
      setSelectedIds([]);
      setFreeDraft({ kind: freeShape, bounds: selectionBounds(worldPoint, worldPoint) });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === "brush") {
      gestureRef.current = { type: "draw", pointerId: event.pointerId, points: [worldPoint] };
      setDraftPoints([worldPoint]);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (elementId) {
      const element = documentRef.current.elements.find((candidate) => candidate.id === elementId);
      if (!element) return;
      const currentIds = new Set(selectedIds);
      const ids = currentIds.has(elementId) && currentIds.size > 1
        ? selectedIds
        : element.groupId
          ? documentRef.current.elements.filter((candidate) => candidate.groupId === element.groupId).map((candidate) => candidate.id)
          : [elementId];
      const idSet = new Set(ids);
      const elements = documentRef.current.elements.filter((candidate) => idSet.has(candidate.id));
      setSelectedIds(ids);
      setTool("select");
      setMessage(ids.length === 1 ? "已选中图元，可以直接拖动。" : `已选中一组 ${ids.length} 个图元，可以整体拖动。`);
      gestureRef.current = { type: "move", pointerId: event.pointerId, startWorld: worldPoint, elements: cloneElements(elements), moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (!elementId) {
      setTool("select");
      setSelectedIds([]);
      gestureRef.current = { type: "marquee", pointerId: event.pointerId, startWorld: worldPoint, currentWorld: worldPoint };
      setMarquee(selectionBounds(worldPoint, worldPoint));
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.type === "pan") {
      setViewport({
        ...gesture.viewport,
        x: gesture.viewport.x + event.clientX - gesture.start.x,
        y: gesture.viewport.y + event.clientY - gesture.start.y,
      });
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldPoint = screenPointToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, viewportRef.current);
    if (gesture.type === "move") {
      const dx = worldPoint.x - gesture.startWorld.x;
      const dy = worldPoint.y - gesture.startWorld.y;
      gesture.moved = gesture.moved || Math.abs(dx) + Math.abs(dy) > 0.8;
      replaceElementsLive(gesture.elements.map((element) => ({ ...element, x: element.x + dx, y: element.y + dy })));
      return;
    }
    if (gesture.type === "marquee") {
      gesture.currentWorld = worldPoint;
      setMarquee(selectionBounds(gesture.startWorld, worldPoint));
      return;
    }
    if (gesture.type === "free-shape") {
      gesture.currentWorld = worldPoint;
      const bounds = selectionBounds(gesture.startWorld, worldPoint);
      setFreeDraft({ kind: gesture.kind, bounds: { ...bounds, width: Math.min(10_000, bounds.width), height: Math.min(10_000, bounds.height) } });
      return;
    }
    const last = gesture.points.at(-1);
    if (!last || Math.hypot(worldPoint.x - last.x, worldPoint.y - last.y) >= 2 / viewportRef.current.zoom) {
      gesture.points = [...gesture.points, worldPoint];
      setDraftPoints(gesture.points);
    }
  };

  const finishGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (gesture.type === "pan" && gesture.selectOnTap && event.type !== "pointercancel"
      && Math.hypot(event.clientX - gesture.start.x, event.clientY - gesture.start.y) < 3) {
      setTool("select"); setSelectedIds([]);
    }
    if (gesture.type === "free-shape") {
      setFreeDraft(null);
      if (event.type === "pointercancel") return;
      const rect = stageRef.current?.getBoundingClientRect();
      const end = rect ? screenPointToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, viewportRef.current) : gesture.currentWorld;
      const shape = createFreeShape(gesture.kind, gesture.startWorld, end, nextCreatedOrder(documentRef.current.elements));
      if (!shape) { setFreeShape(null); setTool("select"); setSelectedIds([]); setMessage("已进入选择，可以在空白处拉框选择。"); return; }
      if (documentRef.current.elements.length >= MAX_DRAWING_ELEMENTS) { setMessage("图元已满，请先擦掉一些再画。"); return; }
      commitElements("拖框绘制形状", [...documentRef.current.elements, shape]);
      setSelectedIds([shape.id]);
      setFreeShape(null);
      setTool("select");
      focusCanvas();
      return;
    }
    if (gesture.type === "move" && gesture.moved) {
      commitElements(gesture.elements.length === 1 ? "移动一个图元" : `整体移动 ${gesture.elements.length} 个图元`, documentRef.current.elements);
    }
    if (gesture.type === "marquee") {
      const ids = elementIdsInSelection(documentRef.current.elements, gesture.startWorld, gesture.currentWorld);
      setSelectedIds(ids);
      setMarquee(null);
      setMessage(ids.length > 0 ? `已经框选 ${ids.length} 个图元，可以整体移动或打包成预制件。` : "没有框选到图元，可以再拉一个更大的选择框。");
    }
    if (gesture.type === "draw" && gesture.points.length >= 2) {
      if (documentRef.current.elements.length >= MAX_DRAWING_ELEMENTS) {
        setMessage("这张画已经有 1000 个图元啦，可以先擦掉一些再继续。");
      } else {
        const minX = Math.min(...gesture.points.map((point) => point.x));
        const minY = Math.min(...gesture.points.map((point) => point.y));
        const maxX = Math.max(...gesture.points.map((point) => point.x));
        const maxY = Math.max(...gesture.points.map((point) => point.y));
        const stroke: StrokeElement = {
          id: crypto.randomUUID(),
          type: "stroke",
          x: minX,
          y: minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
          rotation: 0,
          stroke: brushColor,
          strokeWidth: brushWidth,
          points: gesture.points.map((point) => ({ x: point.x - minX, y: point.y - minY })),
          lineStyle,
          smoothing,
          layer: 0,
          createdOrder: nextCreatedOrder(documentRef.current.elements),
        };
        commitElements("画下一笔", [...documentRef.current.elements, stroke]);
      }
    }
    if (gesture.type === "draw" && gesture.points.length < 2) {
      setTool("select"); setSelectedIds([]);
    }
    setDraftPoints([]);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const multiplier = event.deltaY > 0 ? 0.9 : 1.1;
    setViewport(zoomViewportAt(viewportRef.current, { x: event.clientX - rect.left, y: event.clientY - rect.top }, viewportRef.current.zoom * multiplier));
  };

  const changeZoom = (multiplier: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setViewport(zoomViewportAt(viewportRef.current, { x: rect.width / 2, y: rect.height / 2 }, viewportRef.current.zoom * multiplier));
  };

  const resetView = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setViewport({ x: rect.width / 2, y: rect.height / 2, zoom: 1 });
    setMessage("画布已经回到中央，缩放为 100%。");
  };

  useEffect(() => {
    resetView();
  }, []);

  const refreshWorks = useCallback(async () => {
    setWorksLoading(true);
    try {
      setSavedWorks(await listDrawingWorks());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作品清单暂时打不开。");
    } finally {
      setWorksLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshWorks();
  }, [refreshWorks]);

  useEffect(() => {
    let active = true;
    void loadPersistentData({
      stableId: DRAWING_STUDIO_STATE_ID,
      parsePayload: parsePersistentDrawing,
    }).then((stored) => {
      if (!active) return;
      if (stored) {
        const restored = stored.payload;
        setDocument(restored);
        setViewport(restored.viewport);
        setHistory([makeHistoryNode("恢复上次画布", restored.elements, restored.presets)]);
        setHistoryIndex(0);
        setSelectedIds([]);
        setTitleDraft(restored.title);
        setAuthorDraft(restored.author);
        setMessage("已经恢复上次离开时的画布和预制件。");
      }
      setAutoSaveStatus("saved");
      setPersistenceReady(true);
    }).catch(() => {
      if (!active) return;
      setPersistenceEnabled(false);
      setPersistenceReady(true);
      setAutoSaveStatus("error");
      setMessage("本机自动保存暂时不可用，但仍然可以继续画画并尝试手动保存作品。");
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!persistenceReady || !persistenceEnabled) return;
    const revision = ++autoSaveRevisionRef.current;
    const snapshot = drawingSnapshot(document, viewport);
    setAutoSaveStatus("saving");
    const timer = window.setTimeout(() => {
      void queuePersistentDataWrite(
        DRAWING_STUDIO_STATE_ID,
        snapshot,
        parsePersistentDrawing,
      ).then(() => {
        if (autoSaveRevisionRef.current === revision) setAutoSaveStatus("saved");
      }).catch(() => {
        if (autoSaveRevisionRef.current === revision) setAutoSaveStatus("error");
      });
    }, AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [document, persistenceEnabled, persistenceReady, viewport]);

  useEffect(() => {
    const flushLatestDrawing = () => {
      if (!persistenceReadyRef.current || !persistenceEnabledRef.current) return;
      const snapshot = drawingSnapshot(documentRef.current, viewportRef.current);
      const keepAliveFetch: typeof fetch = (input, init) => fetch(input, { ...init, keepalive: true });
      void savePersistentData(
        DRAWING_STUDIO_STATE_ID,
        snapshot,
        parsePersistentDrawing,
        keepAliveFetch,
      ).catch(() => undefined);
    };
    window.addEventListener("pagehide", flushLatestDrawing);
    return () => {
      window.removeEventListener("pagehide", flushLatestDrawing);
      flushLatestDrawing();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (workAction) return;
      const editingText = target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
      if (event.key === "Escape" && !editingText) {
        gestureRef.current = null;
        setFreeShape(null); setFreeDraft(null); setMarquee(null); setDraftPoints([]);
        setDrawer(null);
        return;
      }
      if (event.code === "Space" && !editingText && target === canvasRef.current) {
        spacePressedRef.current = true;
        event.preventDefault();
      }
      if (editingText) return;
      const shortcutTool = drawingToolForShortcut(event.key, {
        blocked: event.defaultPrevented,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        repeat: event.repeat,
        isComposing: event.isComposing,
        code: event.code,
      });
      if (shortcutTool) {
        event.preventDefault();
        // Commit the requested tab before speech publishes global store updates.
        flushSync(() => chooseTool(shortcutTool));
        toolboxRef.current?.querySelector<HTMLButtonElement>(`[data-tool="${shortcutTool}"]`)?.focus();
        const option = TOOL_OPTIONS.find((candidate) => candidate.id === shortcutTool);
        if (option) void announceSpokenAction(option.speech);
        return;
      }
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (modifier && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelected();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressedRef.current = false;
    };
    const handleWindowBlur = () => {
      spacePressedRef.current = false;
      finishKeyboardEdit();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [chooseTool, copySelected, deleteSelected, redo, undo, workAction]);

  const storeWork = async (source: DrawingDocument, successMessage: string, adoptWork: boolean) => {
    if (workSaving) return;
    setWorkSaving(true);
    try {
      const snapshot = drawingSnapshot(source, viewportRef.current);
      const thumbnail = await createCanvasThumbnail(canvasRef.current);
      const summary = await saveDrawingWork(snapshot, thumbnail);
      if (adoptWork) {
        setDocument(snapshot);
        setTitleDraft(snapshot.title);
        setAuthorDraft(snapshot.author);
      }
      setSavedWorks((current) => [summary, ...current.filter((work) => work.id !== summary.id)]);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作品暂时没有保存成功。");
      if (error instanceof Error && error.message.includes("保存锁定")) {
        setWorkActionError("");
        setWorkAction({ kind: "locked", id: source.id, title: source.title, useCurrent: true });
        void refreshWorks();
      }
    } finally {
      setWorkSaving(false);
    }
  };

  const saveCurrentWork = () => {
    if (savedWorks.find((work) => work.id === documentRef.current.id)?.locked) {
      setWorkActionError("");
      setWorkAction({ kind: "locked", id: documentRef.current.id, title: documentRef.current.title, useCurrent: true });
      return;
    }
    const current = cloneDocument(documentRef.current);
    if (!/^[0-9a-f-]{36}$/i.test(current.id)) {
      const now = new Date().toISOString();
      current.id = crypto.randomUUID();
      current.createdAt = now;
    }
    void storeWork(current, `“${current.title}”已经保存到本机作品清单。`, true);
  };

  const saveWorkAsCopy = () => {
    const now = new Date().toISOString();
    const copy = {
      ...cloneDocument(documentRef.current),
      id: crypto.randomUUID(),
      title: `${documentRef.current.title} 副本`.slice(0, 80),
      createdAt: now,
      updatedAt: now,
    };
    void storeWork(copy, `已经另存为“${copy.title}”，接下来的编辑会写入这个副本。`, true);
  };

  const openSavedWork = async (workId: string, asCopy = false) => {
    if (workSaving) return;
    setWorkSaving(true);
    try {
      const work = await loadDrawingWork(workId);
      if (work.locked && !asCopy) {
        setWorkActionError("");
        setWorkAction({ kind: "locked", id: work.id, title: work.document.title });
        return;
      }
      const opened = {
        ...cloneDocument(work.document),
        presets: mergeDrawingPresets(documentRef.current.presets, work.document.presets),
        updatedAt: new Date().toISOString(),
      };
      if (asCopy) {
        opened.id = crypto.randomUUID();
        opened.title = `${opened.title} 副本`.slice(0, 80);
        opened.createdAt = opened.updatedAt;
        const summary = await saveDrawingWork(opened, work.thumbnailDataUrl);
        setSavedWorks((current) => [summary, ...current]);
      }
      setDocument(opened);
      setViewport(opened.viewport);
      setHistory([makeHistoryNode("打开已保存作品", opened.elements, opened.presets)]);
      setHistoryIndex(0);
      setSelectedIds([]);
      setTitleDraft(opened.title);
      setAuthorDraft(opened.author);
      setDrawer(null);
      setWorkAction(null);
      setMessage(`已经继续编辑“${opened.title}”。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "这幅作品暂时打不开。");
      setWorkActionError(error instanceof Error ? error.message : "这幅作品暂时打不开。");
    } finally {
      setWorkSaving(false);
    }
  };

  const changeWorkMetadata = async (workId: string, changes: { title?: string; locked?: boolean }) => {
    if (workSaving) return;
    setWorkSaving(true);
    setWorkActionError("");
    try {
      const summary = await updateDrawingWork(workId, changes);
      setSavedWorks((current) => current.map((work) => work.id === workId ? summary : work));
      if (changes.title && documentRef.current.id === workId) {
        setDocument((current) => ({ ...current, title: summary.title }));
        setTitleDraft(summary.title);
      }
      setWorkAction(null);
      setMessage(changes.title ? "作品已重命名。" : summary.locked ? "作品已锁定，原作受到保护。" : "作品已解锁。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "作品暂时无法更新。";
      setMessage(message); setWorkActionError(message);
    } finally { setWorkSaving(false); }
  };

  const removeSavedWork = async (workId: string) => {
    if (workSaving) return;
    setWorkSaving(true); setWorkActionError("");
    try {
      await deleteDrawingWork(workId);
      setSavedWorks((current) => current.filter((work) => work.id !== workId));
      setWorkAction(null);
      setMessage("作品已移入本机回收目录，当前画布仍然保留。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "作品暂时无法删除。";
      setMessage(message); setWorkActionError(message);
    } finally { setWorkSaving(false); }
  };

  const copySavedWork = async (workId: string) => {
    if (workSaving) return;
    setWorkSaving(true);
    try {
      const source = await loadDrawingWork(workId);
      const now = new Date().toISOString();
      const copy = {
        ...cloneDocument(source.document),
        id: crypto.randomUUID(),
        title: `${source.document.title} 副本`.slice(0, 80),
        createdAt: now,
        updatedAt: now,
      };
      const summary = await saveDrawingWork(copy, source.thumbnailDataUrl);
      setSavedWorks((current) => [summary, ...current]);
      setMessage(`已经创建“${copy.title}”，原作品没有改变。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "作品副本暂时没有创建成功。");
    } finally {
      setWorkSaving(false);
    }
  };

  const loadWork = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setMessage("这份作品文件太大了，暂时不能打开。");
      return;
    }
    try {
      const parsed = parseDrawingDocument(JSON.parse(await file.text()));
      const loaded = {
        ...parsed,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        presets: mergeDrawingPresets(documentRef.current.presets, parsed.presets),
        updatedAt: new Date().toISOString(),
      };
      setDocument(loaded);
      setViewport(loaded.viewport);
      const node = makeHistoryNode("加载作品", loaded.elements, loaded.presets);
      setHistory([node]);
      setHistoryIndex(0);
      setSelectedIds([]);
      setTitleDraft(loaded.title);
      setAuthorDraft(loaded.author);
      setMessage(`已经打开“${loaded.title}”，原有预制件也继续保留。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "这份作品暂时不能打开。");
    }
  };

  const newDrawing = () => {
    if (documentRef.current.elements.length > 0 && !window.confirm("确定打开新画布吗？当前画布内容会被清空，预制件会继续保留。")) return;
    const next = createEmptyDrawing(documentRef.current.presets);
    setDocument(next);
    setHistory([makeHistoryNode("打开空白画布", [], next.presets)]);
    setHistoryIndex(0);
    setSelectedIds([]);
    setTitleDraft(next.title);
    setAuthorDraft("");
    resetView();
    setMessage("新的白板准备好啦。");
  };

  const saveAuthor = () => {
    const title = titleDraft.trim() || "我的星空画";
    const author = authorDraft.trim().slice(0, 80);
    setDocument((current) => ({ ...current, title, author, updatedAt: new Date().toISOString() }));
    setTitleDraft(title);
    setAuthorDraft(author);
    setDrawer(null);
    setMessage("作品名称和作者信息已经更新。");
  };

  const renderElement = (element: DrawingElement, interactive = true) => {
    if (element.type === "stroke") {
      return (
        <path
          key={element.id}
          data-element-id={interactive ? element.id : undefined}
          d={pathFromPoints(element.points, element.smoothing)}
          transform={`translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${element.height / 2})`}
          fill="none"
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          strokeLinecap={element.lineStyle === "sharp" ? "square" : "round"}
          strokeLinejoin={element.lineStyle === "sharp" ? "miter" : "round"}
          strokeDasharray={element.lineStyle === "dashed" ? `${element.strokeWidth * 2.2} ${element.strokeWidth * 1.6}` : undefined}
        />
      );
    }
    if (element.type === "text") {
      const characters = Array.from(element.text);
      return (
        <g
          key={element.id}
          data-element-id={interactive ? element.id : undefined}
          transform={`translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${element.height / 2})`}
        >
          <rect width={element.width} height={element.height} fill="transparent" pointerEvents="all" />
          {element.layout === "horizontal" ? (
            <text
              x={element.width / 2}
              y={element.height / 2}
              fill={element.color}
              fontFamily="'Nunito Sans', 'Noto Sans SC', sans-serif"
              fontSize={element.fontSize}
              fontWeight="800"
              textAnchor="middle"
              dominantBaseline="central"
            >{element.text}</text>
          ) : (
            <text
              fill={element.color}
              fontFamily="'Nunito Sans', 'Noto Sans SC', sans-serif"
              fontSize={element.fontSize}
              fontWeight="800"
              textAnchor="middle"
            >
              {characters.map((character, index) => (
                <tspan key={`${character}-${index}`} x={element.width / 2} y={(index + 0.86) * element.fontSize * 1.15}>{character}</tspan>
              ))}
            </text>
          )}
        </g>
      );
    }
    return (
      <g
        key={element.id}
        data-element-id={interactive ? element.id : undefined}
        transform={`translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${element.height / 2}) scale(${element.width / 100} ${element.height / 100})`}
      >
        {element.type === "shape" && <ShapeArt kind={element.shape} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth} fixedStroke={SHAPE_OPTIONS.find((option) => option.id === element.shape)?.group !== "装饰形状"} />}
        {element.type === "solid" && (
          <SolidArt
            kind={element.solid}
            yaw={element.yaw}
            pitch={element.pitch}
            depth={element.depth}
            faceFills={element.faceFills}
            stroke={element.stroke}
            strokeWidth={element.strokeWidth}
          />
        )}
        {element.type === "sticker" && (
          <g transform={element.mirrored ? "translate(100 0) scale(-1 1)" : undefined}>
            <StickerArt kind={element.sticker} regionFills={element.regionFills} stroke={element.stroke} strokeWidth={element.strokeWidth} />
          </g>
        )}
      </g>
    );
  };

  const catalog = tool === "shape" ? SHAPE_OPTIONS : tool === "solid" ? SOLID_OPTIONS : tool === "sticker" ? STICKER_OPTIONS : [];
  const groups = optionGroups(catalog);
  const activeGroup = tool === "shape" || tool === "solid" || tool === "sticker" ? activeGroups[tool] : "";
  const filteredCatalog = catalog.filter((option) => option.group === activeGroup);
  const chooseGroup = (group: string) => {
    if (tool === "shape" || tool === "solid" || tool === "sticker") {
      setActiveGroups((current) => ({ ...current, [tool]: group }));
      setFreeShape(null);
    }
  };
  const focusMenu = (selector: string) => {
    const menu = toolboxRef.current?.querySelector<HTMLElement>(selector);
    const active = menu?.querySelector<HTMLElement>("button.is-active:not(:disabled)");
    const first = menu?.querySelector<HTMLElement>("button:not(:disabled), textarea, input:not(:disabled), select");
    if (active || first) {
      (active ?? first)?.focus({ preventScroll: true });
      (active ?? first)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else focusCanvas();
  };
  const handleToolboxKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    const menu = target.closest<HTMLElement>("[data-drawing-nav]");
    const button = target.closest<HTMLButtonElement>("button");
    if (!menu || !button) return;
    const level = menu.dataset.drawingNav;
    const selector = level === "presets" ? ".drawing-preset-insert" : "button";
    const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>(selector)).filter((item) => !item.disabled);
    const index = buttons.indexOf(button);
    if (index < 0) return;
    if (arrowMovement(event.key, false)) {
      event.preventDefault(); event.stopPropagation();
      const next = buttons[spatialNavigationIndex(buttons.map((item) => item.getBoundingClientRect()), index, event.key)];
      if (!next || next === button) return;
      if (level === "tools" || level === "groups" || level === "controls") flushSync(() => next.click());
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else if (event.key === "Enter" && (level === "tools" || level === "groups")) {
      event.preventDefault(); event.stopPropagation();
      if (event.repeat) return;
      if (!button.classList.contains("is-active")) flushSync(() => button.click());
      if (level === "groups") focusMenu("[data-drawing-nav='assets']");
      else if (toolboxRef.current?.querySelector("[data-drawing-nav='groups']")) focusMenu("[data-drawing-nav='groups']");
      else if (toolboxRef.current?.querySelector("[data-drawing-nav='presets']")) focusMenu("[data-drawing-nav='presets']");
      else focusMenu(".drawing-tool-settings, .drawing-selection-tools");
    } else if (event.key === "Enter" && event.repeat) {
      event.preventDefault(); event.stopPropagation();
    } else if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (level === "assets") focusMenu("[data-drawing-nav='groups']");
      else if (level !== "tools") focusMenu("[data-drawing-nav='tools']");
      else focusCanvas();
    }
  };
  const gridSize = Math.max(10, 26 * viewport.zoom);
  const drawerTitle = drawer === "history" ? "历史编辑记录" : drawer === "works" ? "作品清单" : "作品信息";
  const selectedLayers = selectedElements.map((element) => element.layer);
  const selectedLayerMinimum = selectedLayers.length > 0 ? Math.min(...selectedLayers) : 0;
  const selectedLayerMaximum = selectedLayers.length > 0 ? Math.max(...selectedLayers) : 0;
  const selectionHasOneLayer = selectedLayerMinimum === selectedLayerMaximum;

  return (
    <div className="drawing-page" data-skip-startup-greeting>
      <div className="drawing-stars" aria-hidden="true" />
      <header className="drawing-topbar">
        <a className="drawing-home" href="/" aria-label="返回学习岛首页"><span aria-hidden="true">←</span><strong>画图</strong></a>
        <div className="drawing-document-name">
          <span>正在创作</span>
          <strong>{document.title}</strong>
          <small className={`is-${autoSaveStatus}`} aria-live="polite">
            {autoSaveStatus === "loading" ? "正在恢复…" : autoSaveStatus === "saving" ? "自动保存中…" : autoSaveStatus === "saved" ? "已自动保存" : "自动保存暂停"}
          </small>
        </div>
        <nav className="drawing-top-actions" aria-label="作品功能">
          <button className="drawing-top-action" type="button" onClick={newDrawing}><span aria-hidden="true">＋</span>新画布</button>
          <button className="drawing-top-action" type="button" onClick={() => fileInputRef.current?.click()}><span aria-hidden="true">⇧</span>加载</button>
          <SpokenActionButton speech={TOP_ACTION_SPEECH.edit} className={topActionClass(tool === "select")} onClick={() => chooseTool("select")}><span aria-hidden="true">↖</span>编辑</SpokenActionButton>
          <button className="drawing-top-action" type="button" disabled={selectedElements.length === 0} onClick={copySelected}><span aria-hidden="true">⧉</span>复制</button>
          <SpokenActionButton speech={TOP_ACTION_SPEECH.save} className="drawing-top-action is-primary" disabled={workSaving} onClick={saveCurrentWork}><span aria-hidden="true">↓</span>{workSaving ? "保存中" : "保存"}</SpokenActionButton>
          <button className="drawing-top-action" type="button" disabled={workSaving} onClick={saveWorkAsCopy}><span aria-hidden="true">⧉</span>另存为</button>
          <SpokenActionButton speech={TOP_ACTION_SPEECH.undo} className="drawing-top-action" disabled={historyIndex <= 0} onClick={undo}><span aria-hidden="true">↶</span>撤销</SpokenActionButton>
          <button className="drawing-top-action" type="button" disabled={historyIndex >= history.length - 1} onClick={redo}><span aria-hidden="true">↷</span>重做</button>
          <button className={topActionClass(drawer === "history")} type="button" onClick={() => setDrawer(drawer === "history" ? null : "history")}><span aria-hidden="true">≡</span>历史</button>
          <button className={topActionClass(drawer === "works")} type="button" onClick={() => { const opening = drawer !== "works"; setDrawer(opening ? "works" : null); if (opening) void refreshWorks(); }}><span aria-hidden="true">▦</span>作品</button>
          <button className={topActionClass(drawer === "author")} type="button" onClick={() => setDrawer(drawer === "author" ? null : "author")}><span aria-hidden="true">○</span>作者</button>
        </nav>
        <input ref={fileInputRef} className="drawing-file-input" type="file" accept=".json,.mumu-drawing.json,application/json" onChange={loadWork} />
      </header>

      <main className="drawing-workspace" aria-busy={!persistenceReady}>
        {!persistenceReady && (
          <div className="drawing-restore-overlay" role="status">
            <span aria-hidden="true">✦</span>
            <strong>正在打开上次画布</strong>
            <small>画布和预制件马上回来</small>
          </div>
        )}
        <section
          ref={stageRef}
          className={`drawing-stage tool-${tool}`}
          aria-label="无限白板绘制区域"
          onWheel={handleWheel}
          onContextMenu={(event) => event.preventDefault()}
          style={{
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            backgroundSize: `${gridSize}px ${gridSize}px`,
          }}
        >
          {document.elements.length === 0 && (
            <div className="drawing-empty-hint" aria-hidden="true">
              <span>✦</span>
              <strong>白板准备好啦</strong>
              <small>从右边挑一个形状、立体或贴纸</small>
            </div>
          )}
          <svg
            ref={canvasRef}
            className="drawing-canvas"
            tabIndex={0}
            onKeyDown={handleCanvasKeyDown}
            onKeyUp={(event) => { if (arrowMovement(event.key, false) || ["+", "=", "-", "_", "Add", "Subtract"].includes(event.key)) finishKeyboardEdit(); }}
            onBlur={finishKeyboardEdit}
            aria-label={`画布中有 ${document.elements.length} 个图元`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishGesture}
            onPointerCancel={finishGesture}
          >
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
              {sortDrawingElements(document.elements).map((element) => renderElement(element))}
              {freeDraft && (
                <g className="drawing-free-draft" pointerEvents="none" transform={`translate(${freeDraft.bounds.x} ${freeDraft.bounds.y}) scale(${freeDraft.bounds.width / 100} ${freeDraft.bounds.height / 100})`}>
                  <ShapeArt kind={freeDraft.kind} strokeWidth={3.5} fixedStroke />
                </g>
              )}
              {selectedBounds && (
                <rect
                  className="drawing-selection-box"
                  x={selectedBounds.x - 7}
                  y={selectedBounds.y - 7}
                  width={selectedBounds.width + 14}
                  height={selectedBounds.height + 14}
                  rx="8"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {marquee && (
                <rect
                  className="drawing-marquee-box"
                  x={marquee.x}
                  y={marquee.y}
                  width={marquee.width}
                  height={marquee.height}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {draftPoints.length > 0 && (
                <path
                  className="drawing-draft-stroke"
                  d={pathFromPoints(draftPoints, smoothing)}
                  fill="none"
                  stroke={brushColor}
                  strokeWidth={brushWidth}
                  strokeLinecap={lineStyle === "sharp" ? "square" : "round"}
                  strokeLinejoin={lineStyle === "sharp" ? "miter" : "round"}
                  strokeDasharray={lineStyle === "dashed" ? `${brushWidth * 2.2} ${brushWidth * 1.6}` : undefined}
                />
              )}
            </g>
          </svg>

          <div className="drawing-zoom-dock" aria-label="画布缩放">
            <button type="button" onClick={() => changeZoom(0.8)} aria-label="缩小画布">−</button>
            <output>{Math.round(viewport.zoom * 100)}%</output>
            <button type="button" onClick={() => changeZoom(1.25)} aria-label="放大画布">＋</button>
            <button className="drawing-reset-view" type="button" onClick={resetView}>回到中央</button>
          </div>
          <div className="drawing-count-pill"><strong>{document.elements.length}</strong> / {MAX_DRAWING_ELEMENTS} 图元</div>
          <p className="drawing-live-status" aria-live="polite">{message}</p>
        </section>

        <aside ref={toolboxRef} onKeyDown={handleToolboxKeyDown} className={`drawing-toolbox ${panelOpen ? "is-open" : "is-closed"}`} aria-label="绘图工具区">
          <button className="drawing-toolbox-toggle" type="button" onClick={() => setPanelOpen((current) => !current)} aria-expanded={panelOpen}>
            <span aria-hidden="true">{panelOpen ? "→" : "←"}</span>{panelOpen ? "收起工具" : "打开工具"}
          </button>
          {panelOpen && (
            <>
              <div className="drawing-toolbox-heading"><span>创作工具</span><strong>{TOOL_OPTIONS.find((option) => option.id === tool)?.label}</strong></div>
              <div className="drawing-tool-level-one" data-drawing-nav="tools" aria-label="一级工具">
                {TOOL_OPTIONS.map((option) => (
                  <SpokenActionButton
                    speech={option.speech}
                    className={tool === option.id ? "is-active" : ""}
                    key={option.id}
                    data-tool={option.id}
                    onClick={(event) => { chooseTool(option.id); event.currentTarget.focus({ preventScroll: true }); }}
                    aria-pressed={tool === option.id}
                    aria-keyshortcuts={option.shortcut}
                    aria-label={option.shortcut ? `${option.label}，快捷键 ${option.shortcut}` : option.label}
                  >
                    <span aria-hidden="true">{option.mark}</span>{option.label}
                    {option.shortcut && <kbd aria-hidden="true">{option.shortcut}</kbd>}
                    {tool === option.id && <i aria-hidden="true">✓</i>}
                  </SpokenActionButton>
                ))}
              </div>

              {catalog.length > 0 && (
                <div className="drawing-catalog">
                  <div className="drawing-level-label"><span>二级</span><strong>选择类别</strong></div>
                  <div className="drawing-group-tabs" data-drawing-nav="groups">
                    {groups.map((group) => (
                      <SpokenActionButton
                        speech={GROUP_SPEECH[group] ?? { zh: group, en: group === "自由形状" ? "Free shapes" : group }}
                        className={activeGroup === group ? "is-active" : ""}
                        onClick={(event) => { chooseGroup(group); event.currentTarget.focus({ preventScroll: true }); }}
                        key={group}
                        aria-pressed={activeGroup === group}
                      >{group}</SpokenActionButton>
                    ))}
                  </div>
                  <div className="drawing-level-label"><span>三级</span><strong>放到画布</strong></div>
                  {activeGroup === "自由形状" && <p className="drawing-tool-tip">先选形状，再在白板上拖一个框。圆形随框变成椭圆；按 Esc 取消。</p>}
                  <div className="drawing-catalog-grid" data-drawing-nav="assets">
                    {filteredCatalog.map((option) => (
                      <button type="button" key={option.id} aria-pressed={freeShape === option.id} className={freeShape === option.id ? "is-active" : ""} onClick={() => addElement(tool as "shape" | "solid" | "sticker", option.id)}>
                        <CatalogPreview type={tool as "shape" | "solid" | "sticker"} id={option.id} />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {tool === "preset" && (
                <div className="drawing-preset-library">
                  <div className="drawing-level-label"><span>二级</span><strong>我的预制件</strong></div>
                  {document.presets.length > 0 ? (
                    <div className="drawing-preset-grid" data-drawing-nav="presets">
                      {document.presets.map((preset) => (
                        <article className={presetRename?.id === preset.id ? "is-renaming" : ""} key={preset.id}>
                          <button className="drawing-preset-insert" type="button" onClick={() => addPreset(preset)} aria-label={`放入${preset.name}`}>
                            <svg viewBox={`0 0 ${preset.width} ${preset.height}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
                              {sortDrawingElements(preset.elements).map((element) => renderElement(element, false))}
                            </svg>
                            <span><strong>{preset.name}</strong><small>{preset.elements.length} 个图元</small></span>
                          </button>
                          <div className="drawing-preset-actions">
                            <button
                              className="drawing-preset-rename"
                              type="button"
                              onClick={() => setPresetRename({ id: preset.id, draft: preset.name })}
                              aria-expanded={presetRename?.id === preset.id}
                              aria-controls={`drawing-preset-rename-${preset.id}`}
                            >重命名</button>
                            <button className="drawing-preset-delete" type="button" onClick={() => deletePreset(preset.id)} aria-label={`删除${preset.name}`}>删除</button>
                          </div>
                          {presetRename?.id === preset.id && (
                            <form
                              className="drawing-preset-rename-form"
                              id={`drawing-preset-rename-${preset.id}`}
                              onSubmit={(event) => { event.preventDefault(); savePresetRename(preset.id); }}
                            >
                              <label htmlFor={`drawing-preset-name-${preset.id}`}>预制件名称</label>
                              <input
                                id={`drawing-preset-name-${preset.id}`}
                                type="text"
                                maxLength={40}
                                value={presetRename.draft}
                                autoFocus
                                onChange={(event) => setPresetRename({ id: preset.id, draft: event.target.value })}
                                onKeyDown={(event) => { if (event.key === "Escape") setPresetRename(null); }}
                              />
                              <div>
                                <button type="submit">保存名字</button>
                                <button type="button" onClick={() => setPresetRename(null)}>取消</button>
                              </div>
                            </form>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="drawing-tool-tip">还没有预制件。进入“选择”，在白板空白处拖出选择框，选中多个图元后点击“打包为预制件”。</p>
                  )}
                </div>
              )}

              {tool === "text" && (
                <div className="drawing-tool-settings drawing-text-tool">
                  <div className="drawing-level-label"><span>二级</span><strong>文字内容</strong></div>
                  <label className="drawing-text-field">
                    <span>写下要放进画布的文字</span>
                    <textarea maxLength={200} rows={3} value={textDraft} onChange={(event) => setTextDraft(event.target.value)} />
                  </label>
                  <div className="drawing-level-label"><span>三级</span><strong>排列方式</strong></div>
                  <div className="drawing-segmented" data-drawing-nav="controls">
                    <button type="button" className={textLayout === "horizontal" ? "is-active" : ""} aria-pressed={textLayout === "horizontal"} onClick={() => setTextLayout("horizontal")}>横排</button>
                    <button type="button" className={textLayout === "vertical" ? "is-active" : ""} aria-pressed={textLayout === "vertical"} onClick={() => setTextLayout("vertical")}>竖排</button>
                  </div>
                  <label className="drawing-range"><span>文字大小 <strong>{textSize}px</strong></span><input type="range" min="18" max="160" value={textSize} onChange={(event) => setTextSize(Number(event.target.value))} /></label>
                  <ColorPalette value={textColor} onChange={setTextColor} colors={FILL_PALETTE} allowCustom />
                  <button className="drawing-insert-text" type="button" disabled={!textDraft.trim()} onClick={addTextElement}>放入文字</button>
                </div>
              )}

              {tool === "brush" && (
                <div className="drawing-tool-settings">
                  <div className="drawing-level-label"><span>二级</span><strong>线条形式</strong></div>
                  <div className="drawing-segmented" data-drawing-nav="controls">
                    {(["smooth", "sharp", "dashed"] as LineStyle[]).map((style) => (
                      <button type="button" className={lineStyle === style ? "is-active" : ""} onClick={() => setLineStyle(style)} key={style} aria-pressed={lineStyle === style}>
                        {style === "smooth" ? "渐变" : style === "sharp" ? "锐利" : "虚线"}
                      </button>
                    ))}
                  </div>
                  <label className="drawing-range"><span>粗细 <strong>{brushWidth}px</strong></span><input type="range" min="2" max="28" value={brushWidth} onChange={(event) => setBrushWidth(Number(event.target.value))} /></label>
                  <label className="drawing-switch"><input type="checkbox" checked={smoothing} onChange={(event) => setSmoothing(event.target.checked)} /><span aria-hidden="true" /><strong>平滑过渡</strong></label>
                  <div className="drawing-level-label"><span>三级</span><strong>画笔颜色</strong></div>
                  <ColorPalette value={brushColor} onChange={setBrushColor} />
                </div>
              )}

              {tool === "fill" && (
                <div className="drawing-tool-settings">
                  <div className="drawing-level-label"><span>二级</span><strong>选择颜色</strong></div>
                  <ColorPalette value={fillColor} onChange={setFillColor} colors={FILL_PALETTE} allowCustom />
                  <p className="drawing-tool-tip">再点击画布中的形状、贴纸区域或立体表面。</p>
                </div>
              )}

              {tool === "eraser" && <p className="drawing-tool-tip is-roomy">点击一个完整图元把它擦掉。每次都可以从历史记录找回来。</p>}
              {tool === "pan" && <p className="drawing-tool-tip is-roomy">在白板空白处拖动，就能前往画布的其他位置。滚动鼠标滚轮可以缩放。</p>}

              {tool === "select" && (
                <div className="drawing-selection-tools">
                  <div className="drawing-level-label"><span>二级</span><strong>{selectedElements.length > 0 ? `已选 ${selectedElements.length} 个图元` : "拉框多选"}</strong></div>
                  {selectedElements.length > 0 ? (
                    <>
                      <div className="drawing-transform-row">
                        <button type="button" onClick={() => transformSelection("缩小选中内容", 0.86, 0)}>缩小</button>
                        <button type="button" onClick={() => transformSelection("放大选中内容", 1.16, 0)}>放大</button>
                        <button type="button" onClick={() => transformSelection("向左旋转选中内容", 1, -15)}>左转</button>
                        <button type="button" onClick={() => transformSelection("向右旋转选中内容", 1, 15)}>右转</button>
                      </div>
                      <div className={`drawing-transform-row${selectedElement?.type === "sticker" ? " has-mirror" : ""}`}>
                        {selectedElement?.type === "sticker" && (
                          <button type="button" aria-pressed={selectedElement.mirrored} onClick={mirrorSelectedSticker}>
                            {selectedElement.mirrored ? "恢复方向" : "左右镜像"}
                          </button>
                        )}
                        <button type="button" onClick={copySelected}>复制</button>
                        <button className="is-gentle-danger" type="button" onClick={deleteSelected}>擦掉</button>
                      </div>
                      <button className="drawing-make-preset" type="button" disabled={selectedElements.length < 2 || Boolean(matchingPreset)} onClick={saveSelectionAsPreset}>{matchingPreset ? "已存为预制件" : "打包为预制件"}</button>
                      {selectedElement?.type === "shape" && (
                        <div className="drawing-tool-settings">
                          {(["width", "height"] as const).map((axis) => (
                            <label className="drawing-range" key={axis}>
                              <span>{axis === "width" ? "宽度" : "高度"} <strong>{Math.round(selectedElement[axis])}</strong></span>
                              <input type="number" min="4" max="10000" aria-label={axis === "width" ? "形状宽度" : "形状高度"} key={`${selectedElement.id}-${selectedElement[axis]}`} defaultValue={Math.round(selectedElement[axis])}
                                onBlur={(event) => {
                                  const size = Number(event.currentTarget.value);
                                  if (!Number.isFinite(size) || size < 4 || size > 10000) { event.currentTarget.value = String(Math.round(selectedElement[axis])); return; }
                                  if (size === selectedElement[axis]) return;
                                  updateSelection("调整形状宽高", (element) => ({ ...element, [axis]: size, [axis === "width" ? "x" : "y"]: element[axis === "width" ? "x" : "y"] + (element[axis] - size) / 2 }));
                                }}
                                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="drawing-layer-controls">
                        <div className="drawing-level-label"><span>三级</span><strong>渲染层级</strong></div>
                        <label className="drawing-layer-input">
                          <span>{selectionHasOneLayer ? `当前层级 ${selectedLayerMinimum}` : `层级 ${selectedLayerMinimum} 至 ${selectedLayerMaximum}`}</span>
                          <input
                            key={`${selectedIds.join("-")}-${selectedLayerMinimum}-${selectedLayerMaximum}`}
                            type="number"
                            min={MIN_DRAWING_LAYER}
                            max={MAX_DRAWING_LAYER}
                            defaultValue={selectionHasOneLayer ? selectedLayerMinimum : undefined}
                            placeholder={selectionHasOneLayer ? undefined : "统一层级"}
                            aria-label="手动修改渲染层级"
                            onBlur={(event) => { if (event.currentTarget.value !== "") setSelectionLayer(Number(event.currentTarget.value)); }}
                            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                          />
                        </label>
                        <div className="drawing-layer-buttons">
                          <button type="button" onClick={() => moveSelectionLayer("top")}>置顶</button>
                          <button type="button" onClick={() => moveSelectionLayer("bottom")}>置底</button>
                          <button type="button" onClick={() => moveSelectionLayer("up")}>提高一层</button>
                          <button type="button" onClick={() => moveSelectionLayer("down")}>降低一层</button>
                        </div>
                      </div>
                      {selectedElement?.type === "stroke" && (
                        <div className="drawing-selection-color">
                          <div className="drawing-level-label"><span>三级</span><strong>画笔颜色</strong></div>
                          <ColorPalette
                            value={selectedElement.stroke}
                            colors={FILL_PALETTE}
                            allowCustom
                            onChange={(color) => updateSelection("修改画笔颜色", (element) => element.type === "stroke" ? { ...element, stroke: color } : element)}
                          />
                        </div>
                      )}
                      {selectedElement?.type === "solid" && (
                        <SolidControls
                          element={selectedElement}
                          onLiveChange={replaceElementLive}
                          onCommit={() => commitElements("调整立体观察角度", documentRef.current.elements)}
                        />
                      )}
                      {selectedElement?.type === "text" && (
                        <TextControls
                          element={selectedElement}
                          onCommit={(next) => {
                            const elements = documentRef.current.elements.map((element) => element.id === next.id ? next : element);
                            commitElements("编辑文字", elements);
                          }}
                        />
                      )}
                    </>
                  ) : <p className="drawing-tool-tip">点击单个图元进行编辑；也可以在白板空白处按住并拖动，框选多个图元。</p>}
                </div>
              )}
            </>
          )}
        </aside>
      </main>

      {drawer && (
        <div className="drawing-drawer-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}>
          <section className="drawing-drawer" role="dialog" aria-modal="true" aria-labelledby="drawing-drawer-title">
            <header><div><span>作品驾驶舱</span><h2 id="drawing-drawer-title">{drawerTitle}</h2></div><button type="button" onClick={() => setDrawer(null)} aria-label={`关闭${drawerTitle}`}>×</button></header>
            {drawer === "history" && (
              <ol className="drawing-history-list">
                {history.map((node, index) => (
                  <li key={node.id}><button type="button" className={index === historyIndex ? "is-current" : ""} onClick={() => { goToHistory(index); setDrawer(null); }}><span>{index + 1}</span><strong>{node.label}</strong><small>{formatTime(node.createdAt)}</small>{index === historyIndex && <em>当前位置</em>}</button></li>
                ))}
              </ol>
            )}
            {drawer === "works" && (
              worksLoading ? (
                <div className="drawing-drawer-empty"><span aria-hidden="true">✦</span><strong>正在打开作品清单</strong><p>保存在本机数据目录里的作品马上出现。</p></div>
              ) : savedWorks.length > 0 ? (
                <div className="drawing-works-list">
                  {savedWorks.map((work) => (
                    <article key={`${work.id}-${work.updatedAt}`}>
                      <div className="drawing-work-thumbnail">
                        {work.thumbnailDataUrl ? <img src={work.thumbnailDataUrl} alt={`${work.title}的作品缩略图`} /> : <span aria-hidden="true">✦</span>}
                      </div>
                      <div className="drawing-work-summary">
                        <strong>{work.title}</strong>
                        <small>{work.locked ? "🔒 已锁定" : "可编辑"}</small>
                        <small>作者：{work.author || "未填写"}</small>
                        <small>创作于 {formatCreationTime(work.createdAt)}</small>
                        <small>{work.elementCount} 个图元</small>
                      </div>
                      <div className="drawing-work-actions">
                        <button type="button" disabled={workSaving} onClick={() => void openSavedWork(work.id)}>继续编辑</button>
                        <button type="button" disabled={workSaving} onClick={() => void copySavedWork(work.id)}>复制作品</button>
                        <button type="button" disabled={workSaving} onClick={() => { setWorkActionError(""); setWorkAction({ kind: "rename", id: work.id, title: work.title }); }}>重命名</button>
                        <button type="button" disabled={workSaving} onClick={() => void changeWorkMetadata(work.id, { locked: !work.locked })}>{work.locked ? "解锁" : "锁定"}</button>
                        <button type="button" disabled={workSaving || work.locked} title={work.locked ? "锁定作品不可删除" : undefined} onClick={() => { setWorkActionError(""); setWorkAction({ kind: "delete", id: work.id, title: work.title }); }}>删除</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <div className="drawing-drawer-empty"><span aria-hidden="true">▦</span><strong>还没有保存过作品</strong><p>给作品取好名字，点击顶部“保存”，以后刷新页面也能从这里继续编辑。</p></div>
            )}
            {drawer === "author" && (
              <form className="drawing-author-form" onSubmit={(event) => { event.preventDefault(); saveAuthor(); }}>
                <label><span>作品名称</span><input value={titleDraft} maxLength={80} onChange={(event) => setTitleDraft(event.target.value)} /></label>
                <label><span>作者（可以不填）</span><input value={authorDraft} maxLength={80} onChange={(event) => setAuthorDraft(event.target.value)} /></label>
                <p>这些信息会和画布一起自动保存在本机；点击顶部“保存”后，也会写入独立作品文件。</p>
                <button className="drawing-author-save" type="submit">保存作品信息</button>
              </form>
            )}
          </section>
        </div>
      )}
      {workAction && <WorkActionDialog
        action={workAction} busy={workSaving} error={workActionError}
        onClose={() => setWorkAction(null)}
        onConfirm={(title) => {
          if (workAction.kind === "rename") void changeWorkMetadata(workAction.id, { title });
          else if (workAction.kind === "delete") void removeSavedWork(workAction.id);
          else if (workAction.useCurrent) { setWorkAction(null); saveWorkAsCopy(); }
          else void openSavedWork(workAction.id, true);
        }}
      />}
    </div>
  );
}

function WorkActionDialog({ action, busy, error, onClose, onConfirm }: {
  action: { kind: "rename" | "locked" | "delete"; title: string };
  busy: boolean; error: string; onClose: () => void; onConfirm: (title: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(action.title);
  useEffect(() => { ref.current?.showModal(); }, []);
  const heading = action.kind === "rename" ? "重命名作品" : action.kind === "locked" ? "此画布已经保存锁定" : "删除这幅作品？";
  return <dialog ref={ref} className="drawing-work-dialog" aria-labelledby="drawing-work-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); if (!busy) onConfirm(title.trim()); }}>
      <h2 id="drawing-work-dialog-title">{heading}</h2>
      {action.kind === "rename" ? <label>作品名称<input autoFocus maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        : <p>{action.kind === "locked" ? "可以创建副本继续编辑，原作会完整保留。" : `“${action.title}”将移入本机回收目录。`}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="drawing-work-actions">
        <button type="button" disabled={busy} onClick={onClose}>取消</button>
        <button type="submit" disabled={busy || (action.kind === "rename" && !title.trim())}>{busy ? "正在处理…" : action.kind === "rename" ? "保存名字" : action.kind === "locked" ? "创建副本编辑" : "移入回收目录"}</button>
      </div>
    </form>
  </dialog>;
}

function ColorPalette({
  value,
  onChange,
  colors = BASIC_PALETTE,
  allowCustom = false,
}: {
  value: string;
  onChange: (color: string) => void;
  colors?: PaletteColor[];
  allowCustom?: boolean;
}) {
  return (
    <div className="drawing-color-picker">
      <div className={`drawing-colors ${colors.length > BASIC_PALETTE.length ? "is-extended" : ""}`} data-drawing-nav="controls" aria-label="颜色选择">
        {colors.map((color) => (
          <button
            type="button"
            key={color.value}
            className={value === color.value ? "is-active" : ""}
            style={{ backgroundColor: color.value }}
            aria-label={color.label}
            aria-pressed={value === color.value}
            onClick={() => onChange(color.value)}
          >
            {value === color.value && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
      {allowCustom && (
        <label className="drawing-free-color">
          <span><strong>自由色盘</strong><small>点右边选任意颜色</small></span>
          <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label="打开自由色盘选择任意颜色" />
        </label>
      )}
    </div>
  );
}

function TextControls({
  element,
  onCommit,
}: {
  element: TextElement;
  onCommit: (element: TextElement) => void;
}) {
  const [draft, setDraft] = useState(element.text);
  const [fontSize, setFontSize] = useState(element.fontSize);
  const [color, setColor] = useState(element.color);
  const [layout, setLayout] = useState<TextLayout>(element.layout);

  useEffect(() => {
    setDraft(element.text);
    setFontSize(element.fontSize);
    setColor(element.color);
    setLayout(element.layout);
  }, [element.color, element.fontSize, element.id, element.layout, element.text]);

  return (
    <div className="drawing-text-controls">
      <div className="drawing-level-label"><span>三级</span><strong>编辑文字</strong></div>
      <label className="drawing-text-field">
        <span>文字内容</span>
        <textarea maxLength={200} rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <div className="drawing-segmented">
        <button type="button" className={layout === "horizontal" ? "is-active" : ""} aria-pressed={layout === "horizontal"} onClick={() => setLayout("horizontal")}>横排</button>
        <button type="button" className={layout === "vertical" ? "is-active" : ""} aria-pressed={layout === "vertical"} onClick={() => setLayout("vertical")}>竖排</button>
      </div>
      <label className="drawing-range"><span>文字大小 <strong>{Math.round(fontSize)}px</strong></span><input type="range" min="12" max="240" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label>
      <ColorPalette value={color} onChange={setColor} colors={FILL_PALETTE} allowCustom />
      <button
        className="drawing-insert-text"
        type="button"
        disabled={!draft.trim()}
        onClick={() => onCommit(updateTextElement(element, { text: draft.trim().slice(0, 200), fontSize, color, layout }))}
      >更新文字</button>
    </div>
  );
}

function SolidControls({
  element,
  onLiveChange,
  onCommit,
}: {
  element: SolidElement;
  onLiveChange: (element: SolidElement) => void;
  onCommit: () => void;
}) {
  return (
    <div className="drawing-solid-controls">
      <div className="drawing-level-label"><span>三级</span><strong>观察角度</strong></div>
      <label className="drawing-range"><span>左右角度 <strong>{element.yaw}°</strong></span><input type="range" min="-75" max="75" value={element.yaw} onChange={(event) => onLiveChange({ ...element, yaw: Number(event.target.value) })} onPointerUp={onCommit} /></label>
      <label className="drawing-range"><span>俯仰角度 <strong>{element.pitch}°</strong></span><input type="range" min="-60" max="60" value={element.pitch} onChange={(event) => onLiveChange({ ...element, pitch: Number(event.target.value) })} onPointerUp={onCommit} /></label>
      <label className="drawing-range"><span>透视深度 <strong>{element.depth}</strong></span><input type="range" min="10" max="180" value={element.depth} onChange={(event) => onLiveChange({ ...element, depth: Number(event.target.value) })} onPointerUp={onCommit} /></label>
    </div>
  );
}
