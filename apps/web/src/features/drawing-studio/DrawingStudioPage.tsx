import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
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
  MAX_DRAWING_PRESET_ELEMENTS,
  MAX_DRAWING_PRESETS,
  cloneElements,
  createDrawingPreset,
  createEmptyDrawing,
  elementIdsInSelection,
  getElementsBounds,
  instantiateDrawingPreset,
  makeHistoryNode,
  parseDrawingDocument,
  screenPointToWorld,
  selectionBounds,
  zoomViewportAt,
  type Bounds,
  type DrawingDocument,
  type DrawingElement,
  type DrawingPreset,
  type HistoryNode,
  type LineStyle,
  type Point,
  type ShapeKind,
  type SolidElement,
  type SolidKind,
  type StickerKind,
  type StrokeElement,
  type Viewport,
} from "./logic";
import "./drawing-studio.css";

type ToolId = "select" | "pan" | "shape" | "solid" | "sticker" | "preset" | "brush" | "eraser" | "fill";
type DrawerId = "history" | "works" | "author" | null;
type Gesture =
  | { type: "pan"; pointerId: number; start: Point; viewport: Viewport }
  | { type: "move"; pointerId: number; startWorld: Point; elements: DrawingElement[]; moved: boolean }
  | { type: "marquee"; pointerId: number; startWorld: Point; currentWorld: Point }
  | { type: "draw"; pointerId: number; points: Point[] }
  | null;

const TOOL_OPTIONS: Array<{ id: ToolId; label: string; mark: string }> = [
  { id: "select", label: "选择", mark: "↖" },
  { id: "pan", label: "画布", mark: "✥" },
  { id: "shape", label: "形状", mark: "△" },
  { id: "solid", label: "立体", mark: "◇" },
  { id: "sticker", label: "贴纸", mark: "✦" },
  { id: "preset", label: "预制件", mark: "▦" },
  { id: "brush", label: "画笔", mark: "╱" },
  { id: "eraser", label: "橡皮擦", mark: "⌫" },
  { id: "fill", label: "填色", mark: "●" },
];

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

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
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
  const [activeGroups, setActiveGroups] = useState(INITIAL_GROUPS);
  const [panelOpen, setPanelOpen] = useState(true);
  const [drawer, setDrawer] = useState<DrawerId>(null);
  const [fillColor, setFillColor] = useState("#ffd166");
  const [brushColor, setBrushColor] = useState("#171536");
  const [brushWidth, setBrushWidth] = useState(7);
  const [lineStyle, setLineStyle] = useState<LineStyle>("smooth");
  const [smoothing, setSmoothing] = useState(true);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [message, setMessage] = useState("从右边选一个图元，开始第一笔创作吧。");
  const [savedWorks, setSavedWorks] = useState<DrawingDocument[]>([]);
  const [titleDraft, setTitleDraft] = useState(document.title);
  const [authorDraft, setAuthorDraft] = useState(document.author);

  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<Gesture>(null);
  const documentRef = useRef(document);
  const viewportRef = useRef(viewport);
  const spacePressedRef = useRef(false);

  documentRef.current = document;
  viewportRef.current = viewport;

  const selectedElements = useMemo(() => {
    const ids = new Set(selectedIds);
    return document.elements.filter((element) => ids.has(element.id));
  }, [document.elements, selectedIds]);
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] ?? null : null;
  const selectedBounds = useMemo(() => getElementsBounds(selectedElements), [selectedElements]);

  const commitElements = useCallback((label: string, elements: DrawingElement[], presets = documentRef.current.presets) => {
    const nextElements = cloneElements(elements);
    const nextPresets = structuredClone(presets) as DrawingPreset[];
    setDocument((current) => ({ ...current, elements: nextElements, presets: nextPresets, updatedAt: new Date().toISOString() }));
    const node = makeHistoryNode(label, nextElements, nextPresets);
    setHistory((current) => {
      const next = [...current.slice(0, historyIndex + 1), node].slice(-80);
      setHistoryIndex(next.length - 1);
      return next;
    });
    setMessage(label);
  }, [historyIndex]);

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

  const chooseTool = (nextTool: ToolId) => {
    setTool(nextTool);
    if (nextTool !== "select") setSelectedIds([]);
    setMessage(TOOL_OPTIONS.find((option) => option.id === nextTool)?.label ?? "工具已切换");
  };

  const viewCenterWorld = () => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenPointToWorld({ x: rect.width / 2, y: rect.height / 2 }, viewportRef.current);
  };

  const addElement = (type: "shape" | "solid" | "sticker", id: ShapeKind | SolidKind | StickerKind) => {
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
    const bounds = getElementsBounds(selectedElements);
    if (!bounds) return;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const radians = rotationDelta * Math.PI / 180;
    updateSelection(label, (element) => {
      const elementCenter = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
      const scaledX = (elementCenter.x - center.x) * scale;
      const scaledY = (elementCenter.y - center.y) * scale;
      const rotatedX = scaledX * Math.cos(radians) - scaledY * Math.sin(radians);
      const rotatedY = scaledX * Math.sin(radians) + scaledY * Math.cos(radians);
      const width = Math.min(2_400, Math.max(24, element.width * scale));
      const height = Math.min(2_400, Math.max(24, element.height * scale));
      return {
        ...element,
        width,
        height,
        x: center.x + rotatedX - width / 2,
        y: center.y + rotatedY - height / 2,
        rotation: element.rotation + rotationDelta,
      };
    });
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
    const duplicates = sources.map((source) => ({
      ...structuredClone(source),
      id: crypto.randomUUID(),
      x: source.x + 24,
      y: source.y + 24,
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
    const groupId = crypto.randomUUID();
    const ids = new Set(selectedIds);
    const grouped = documentRef.current.elements.map((element) => ids.has(element.id) ? { ...element, groupId } : element);
    commitElements(`打包“${preset.name}”`, grouped, [...documentRef.current.presets, preset]);
    setMessage(`“${preset.name}”已经放进预制件，画布中的这组图元也会整体移动。`);
  };

  const addPreset = (preset: DrawingPreset) => {
    if (documentRef.current.elements.length + preset.elements.length > MAX_DRAWING_ELEMENTS) {
      setMessage("放入这个预制件会超过 1000 个图元，可以先删掉一些内容。");
      return;
    }
    const instances = instantiateDrawingPreset(preset, viewCenterWorld());
    commitElements(`放入“${preset.name}”`, [...documentRef.current.elements, ...instances]);
    setSelectedIds(instances.map((element) => element.id));
  };

  const deletePreset = (presetId: string) => {
    const preset = documentRef.current.presets.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    commitElements(`删除预制件“${preset.name}”`, documentRef.current.elements, documentRef.current.presets.filter((candidate) => candidate.id !== presetId));
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
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
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

    if (tool === "select") {
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
        };
        commitElements("画下一笔", [...documentRef.current.elements, stroke]);
      }
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = target?.matches("input, textarea, [contenteditable='true']");
      if (event.code === "Space" && !editingText) {
        spacePressedRef.current = true;
        event.preventDefault();
      }
      if (editingText) return;
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
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [copySelected, deleteSelected, redo, undo]);

  const downloadWork = () => {
    const work = { ...cloneDocument(documentRef.current), viewport: viewportRef.current, updatedAt: new Date().toISOString() };
    const blob = new Blob([`${JSON.stringify(work, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${work.title.replace(/[\\/:*?"<>|]/g, "-") || "木木画作"}.mumu-drawing.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSavedWorks((current) => [work, ...current.filter((candidate) => candidate.id !== work.id)].slice(0, 12));
    setMessage("作品文件已经保存，可以从下载文件夹找到它。");
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
      setDocument(parsed);
      setViewport(parsed.viewport);
      const node = makeHistoryNode("加载作品", parsed.elements, parsed.presets);
      setHistory([node]);
      setHistoryIndex(0);
      setSelectedIds([]);
      setTitleDraft(parsed.title);
      setAuthorDraft(parsed.author);
      setMessage(`已经打开“${parsed.title}”`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "这份作品暂时不能打开。");
    }
  };

  const newDrawing = () => {
    if ((documentRef.current.elements.length > 0 || documentRef.current.presets.length > 0) && !window.confirm("确定打开新画布吗？没有保存的内容和预制件不会带到新画布。")) return;
    const next = createEmptyDrawing();
    setDocument(next);
    setHistory([makeHistoryNode("打开空白画布", [], [])]);
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
    return (
      <g
        key={element.id}
        data-element-id={interactive ? element.id : undefined}
        transform={`translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${element.height / 2}) scale(${element.width / 100} ${element.height / 100})`}
      >
        {element.type === "shape" && <ShapeArt kind={element.shape} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth} />}
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
    }
  };
  const gridSize = Math.max(10, 26 * viewport.zoom);
  const drawerTitle = drawer === "history" ? "历史编辑记录" : drawer === "works" ? "本次作品清单" : "作品信息";

  return (
    <div className="drawing-page">
      <div className="drawing-stars" aria-hidden="true" />
      <header className="drawing-topbar">
        <a className="drawing-home" href="/" aria-label="返回学习岛首页"><span aria-hidden="true">←</span><strong>画图</strong></a>
        <div className="drawing-document-name">
          <span>正在创作</span>
          <strong>{document.title}</strong>
        </div>
        <nav className="drawing-top-actions" aria-label="作品功能">
          <button className="drawing-top-action" type="button" onClick={newDrawing}><span aria-hidden="true">＋</span>新画布</button>
          <button className="drawing-top-action" type="button" onClick={() => fileInputRef.current?.click()}><span aria-hidden="true">⇧</span>加载</button>
          <button className={topActionClass(tool === "select")} type="button" onClick={() => chooseTool("select")}><span aria-hidden="true">↖</span>编辑</button>
          <button className="drawing-top-action" type="button" disabled={selectedElements.length === 0} onClick={copySelected}><span aria-hidden="true">⧉</span>复制</button>
          <button className="drawing-top-action is-primary" type="button" onClick={downloadWork}><span aria-hidden="true">↓</span>保存</button>
          <button className="drawing-top-action" type="button" disabled={historyIndex <= 0} onClick={undo}><span aria-hidden="true">↶</span>撤销</button>
          <button className="drawing-top-action" type="button" disabled={historyIndex >= history.length - 1} onClick={redo}><span aria-hidden="true">↷</span>重做</button>
          <button className={topActionClass(drawer === "history")} type="button" onClick={() => setDrawer(drawer === "history" ? null : "history")}><span aria-hidden="true">≡</span>历史</button>
          <button className={topActionClass(drawer === "works")} type="button" onClick={() => setDrawer(drawer === "works" ? null : "works")}><span aria-hidden="true">▦</span>作品</button>
          <button className={topActionClass(drawer === "author")} type="button" onClick={() => setDrawer(drawer === "author" ? null : "author")}><span aria-hidden="true">○</span>作者</button>
        </nav>
        <input ref={fileInputRef} className="drawing-file-input" type="file" accept=".json,.mumu-drawing.json,application/json" onChange={loadWork} />
      </header>

      <main className="drawing-workspace">
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
            className="drawing-canvas"
            aria-label={`画布中有 ${document.elements.length} 个图元`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishGesture}
            onPointerCancel={finishGesture}
          >
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
              {document.elements.map((element) => renderElement(element))}
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

        <aside className={`drawing-toolbox ${panelOpen ? "is-open" : "is-closed"}`} aria-label="绘图工具区">
          <button className="drawing-toolbox-toggle" type="button" onClick={() => setPanelOpen((current) => !current)} aria-expanded={panelOpen}>
            <span aria-hidden="true">{panelOpen ? "→" : "←"}</span>{panelOpen ? "收起工具" : "打开工具"}
          </button>
          {panelOpen && (
            <>
              <div className="drawing-toolbox-heading"><span>创作工具</span><strong>{TOOL_OPTIONS.find((option) => option.id === tool)?.label}</strong></div>
              <div className="drawing-tool-level-one" aria-label="一级工具">
                {TOOL_OPTIONS.map((option) => (
                  <button
                    className={tool === option.id ? "is-active" : ""}
                    type="button"
                    key={option.id}
                    onClick={() => chooseTool(option.id)}
                    aria-pressed={tool === option.id}
                  >
                    <span aria-hidden="true">{option.mark}</span>{option.label}{tool === option.id && <i aria-hidden="true">✓</i>}
                  </button>
                ))}
              </div>

              {catalog.length > 0 && (
                <div className="drawing-catalog">
                  <div className="drawing-level-label"><span>二级</span><strong>选择类别</strong></div>
                  <div className="drawing-group-tabs">
                    {groups.map((group) => (
                      <button type="button" className={activeGroup === group ? "is-active" : ""} onClick={() => chooseGroup(group)} key={group} aria-pressed={activeGroup === group}>{group}</button>
                    ))}
                  </div>
                  <div className="drawing-level-label"><span>三级</span><strong>放到画布</strong></div>
                  <div className="drawing-catalog-grid">
                    {filteredCatalog.map((option) => (
                      <button type="button" key={option.id} onClick={() => addElement(tool as "shape" | "solid" | "sticker", option.id)}>
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
                    <div className="drawing-preset-grid">
                      {document.presets.map((preset) => (
                        <article key={preset.id}>
                          <button className="drawing-preset-insert" type="button" onClick={() => addPreset(preset)} aria-label={`放入${preset.name}`}>
                            <svg viewBox={`0 0 ${preset.width} ${preset.height}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
                              {preset.elements.map((element) => renderElement(element, false))}
                            </svg>
                            <span><strong>{preset.name}</strong><small>{preset.elements.length} 个图元</small></span>
                          </button>
                          <button className="drawing-preset-delete" type="button" onClick={() => deletePreset(preset.id)} aria-label={`删除${preset.name}`}>删除</button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="drawing-tool-tip">还没有预制件。进入“选择”，在白板空白处拖出选择框，选中多个图元后点击“打包为预制件”。</p>
                  )}
                </div>
              )}

              {tool === "brush" && (
                <div className="drawing-tool-settings">
                  <div className="drawing-level-label"><span>二级</span><strong>线条形式</strong></div>
                  <div className="drawing-segmented">
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
                      <button className="drawing-make-preset" type="button" disabled={selectedElements.length < 2} onClick={saveSelectionAsPreset}>打包为预制件</button>
                      {selectedElement?.type === "solid" && (
                        <SolidControls
                          element={selectedElement}
                          onLiveChange={replaceElementLive}
                          onCommit={() => commitElements("调整立体观察角度", documentRef.current.elements)}
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
              savedWorks.length > 0 ? (
                <div className="drawing-works-list">
                  {savedWorks.map((work) => (
                    <article key={`${work.id}-${work.updatedAt}`}><div><strong>{work.title}</strong><small>{work.elements.length} 个图元 · {formatTime(work.updatedAt)}</small></div><button type="button" onClick={() => { setDocument(cloneDocument(work)); setViewport(work.viewport); setHistory([makeHistoryNode("打开本次快照", work.elements, work.presets)]); setHistoryIndex(0); setSelectedIds([]); setDrawer(null); }}>打开</button></article>
                  ))}
                </div>
              ) : <div className="drawing-drawer-empty"><span aria-hidden="true">▦</span><strong>还没有保存过作品</strong><p>点击顶部“保存”，这里会出现本次打开页面期间的作品快照。</p></div>
            )}
            {drawer === "author" && (
              <form className="drawing-author-form" onSubmit={(event) => { event.preventDefault(); saveAuthor(); }}>
                <label><span>作品名称</span><input value={titleDraft} maxLength={80} onChange={(event) => setTitleDraft(event.target.value)} /></label>
                <label><span>作者（可以不填）</span><input value={authorDraft} maxLength={80} onChange={(event) => setAuthorDraft(event.target.value)} /></label>
                <p>这些信息只写进你主动保存的作品文件，不会偷偷保存在浏览器里。</p>
                <button className="drawing-author-save" type="submit">保存作品信息</button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
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
      <div className={`drawing-colors ${colors.length > BASIC_PALETTE.length ? "is-extended" : ""}`} aria-label="颜色选择">
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
