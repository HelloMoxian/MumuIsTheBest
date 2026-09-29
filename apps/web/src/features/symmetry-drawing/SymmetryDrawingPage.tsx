import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { GameTopBar } from "../../shared/GameTopBar";
import { useGameFullscreen } from "../../shared/useGameFullscreen";
import "./symmetry-drawing.css";

type Point = { x: number; y: number };
type Viewport = { x: number; y: number; zoom: number };
type SymmetryKind = "none" | "mirror-horizontal" | "mirror-vertical" | "cyclic" | "dihedral";
type BrushKind = "round" | "marker" | "glow";
type ColorKind = "solid" | "stroke-gradient" | "canvas-spectrum" | "layer-spectrum";

type Stroke = {
  id: string;
  points: Point[];
  width: number;
  brush: BrushKind;
  colorKind: ColorKind;
  colorA: string;
  colorB: string;
  opacity: number;
};

type DrawingLayer = {
  id: string;
  name: string;
  opacity: number;
  symmetry: SymmetryKind;
  order: number;
  anchor: Point;
  baseHue: number;
  colorA: string;
  colorB: string;
  locked: boolean;
  strokes: Stroke[];
};

const ROTATION_ORDERS = [3, 4, 5, 6, 8, 10, 12, 24] as const;
const MIRROR_ORDERS = [4, 6, 8, 10, 12, 24] as const;
const COLOR_PRESETS = [
  { value: "#ef4444", label: "红色" }, { value: "#f97316", label: "橙色" }, { value: "#facc15", label: "黄色" },
  { value: "#22c55e", label: "绿色" }, { value: "#06b6d4", label: "青色" }, { value: "#3b82f6", label: "蓝色" },
  { value: "#8b5cf6", label: "紫色" }, { value: "#111827", label: "黑色" }, { value: "#ffffff", label: "白色" },
  { value: "#94a3b8", label: "灰色" },
] as const;
const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function createLayer(index: number, width = 900, height = 620): DrawingLayer {
  const hue = Math.floor(Math.random() * 360);
  const colorIndex = Math.floor(Math.random() * COLOR_PRESETS.length);
  return {
    id: makeId(), name: `图层 ${index}`, opacity: 1, symmetry: "cyclic", order: 8,
    anchor: { x: width / 2, y: height / 2 }, baseHue: hue,
    colorA: COLOR_PRESETS[colorIndex].value,
    colorB: COLOR_PRESETS[(colorIndex + 3) % COLOR_PRESETS.length].value,
    locked: false, strokes: [],
  };
}

function rotate(point: Point, center: Point, angle: number): Point {
  const cos = Math.cos(angle), sin = Math.sin(angle), dx = point.x - center.x, dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

function transformedPoints(points: Point[], layer: DrawingLayer): Point[][] {
  if (layer.symmetry === "none") return [points];
  if (layer.symmetry === "mirror-horizontal") {
    return [points, points.map(point => ({ x: point.x, y: layer.anchor.y * 2 - point.y }))];
  }
  if (layer.symmetry === "mirror-vertical") {
    return [points, points.map(point => ({ x: layer.anchor.x * 2 - point.x, y: point.y }))];
  }
  if (layer.symmetry === "cyclic") {
    return Array.from({ length: layer.order }, (_, index) => points.map(point => rotate(point, layer.anchor, index * Math.PI * 2 / layer.order)));
  }
  const rotations = Math.max(2, layer.order / 2);
  const mirrored = points.map(point => ({ x: point.x, y: layer.anchor.y * 2 - point.y }));
  return Array.from({ length: rotations }, (_, index) => {
    const angle = index * Math.PI * 2 / rotations;
    return [points.map(point => rotate(point, layer.anchor, angle)), mirrored.map(point => rotate(point, layer.anchor, angle))];
  }).flat();
}

function lineColor(stroke: Stroke, points: Point[], width: number, height: number) {
  if (stroke.colorKind === "solid") return stroke.colorA;
  if (stroke.colorKind === "canvas-spectrum") {
    const center = points[Math.floor(points.length / 2)] ?? points[0] ?? { x: 0, y: 0 };
    return `hsl(${Math.round((center.x / Math.max(1, width)) * 330 + (center.y / Math.max(1, height)) * 55)} 88% 58%)`;
  }
  return stroke.colorA;
}

function mixHex(a: string, b: string, amount: number) {
  const channel = (value: string, offset: number) => Number.parseInt(value.slice(offset, offset + 2), 16);
  const values = [1, 3, 5].map(offset => Math.round(channel(a, offset) + (channel(b, offset) - channel(a, offset)) * amount));
  return `#${values.map(value => value.toString(16).padStart(2, "0")).join("")}`;
}

function drawSmoothPath(context: CanvasRenderingContext2D, points: Point[], stroke: Stroke, layer: DrawingLayer, width: number, height: number) {
  if (!points.length) return;
  context.save();
  context.lineCap = "round"; context.lineJoin = "round";
  context.lineWidth = stroke.brush === "marker" ? stroke.width * 1.65 : stroke.width;
  context.globalAlpha *= stroke.opacity * (stroke.brush === "marker" ? .68 : 1);
  context.strokeStyle = lineColor(stroke, points, width, height);
  if (stroke.brush === "glow") {
    context.shadowColor = typeof context.strokeStyle === "string" ? context.strokeStyle : stroke.colorA;
    context.shadowBlur = stroke.width * 1.7;
  }
  if (stroke.colorKind === "stroke-gradient" || stroke.colorKind === "layer-spectrum") {
    let distance = 0;
    for (let index = 0; index < Math.max(1, points.length - 1); index += 1) {
      const start = points[index] ?? points[0], end = points[index + 1] ?? { x: start.x + .01, y: start.y + .01 };
      const segment = Math.hypot(end.x - start.x, end.y - start.y), middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      if (stroke.colorKind === "stroke-gradient") {
        const phase = (distance % 480) / 240;
        context.strokeStyle = mixHex(stroke.colorA, stroke.colorB, phase <= 1 ? phase : 2 - phase);
      } else {
        context.strokeStyle = `hsl(${(layer.baseHue + middle.x * .115 + middle.y * .075 + 720) % 360} 88% 57%)`;
      }
      context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke(); distance += segment;
    }
    context.restore(); return;
  }
  context.beginPath(); context.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    context.lineTo(points[0].x + .01, points[0].y + .01);
  } else {
    for (let index = 1; index < points.length - 1; index += 1) {
      const point = points[index], next = points[index + 1];
      context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    const last = points.at(-1)!;
    context.quadraticCurveTo(last.x, last.y, last.x, last.y);
  }
  context.stroke(); context.restore();
}

function drawLayer(context: CanvasRenderingContext2D, layer: DrawingLayer, width: number, height: number, draft?: Stroke) {
  context.save();
  for (const stroke of draft ? [...layer.strokes, draft] : layer.strokes) {
    for (const points of transformedPoints(stroke.points, layer)) drawSmoothPath(context, points, stroke, layer, width, height);
  }
  context.restore();
}

function compositeLayer(context: CanvasRenderingContext2D, layer: DrawingLayer, width: number, height: number, ratio: number, viewport: Viewport, draft?: Stroke) {
  const surface = document.createElement("canvas"); surface.width = Math.round(width * ratio); surface.height = Math.round(height * ratio);
  const layerContext = surface.getContext("2d"); if (!layerContext) return;
  layerContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  layerContext.translate(viewport.x, viewport.y); layerContext.scale(viewport.zoom, viewport.zoom);
  drawLayer(layerContext, layer, width, height, draft);
  context.save(); context.globalAlpha = layer.opacity; context.drawImage(surface, 0, 0, width, height); context.restore();
}

function symmetryLabel(layer: DrawingLayer) {
  if (layer.symmetry === "none") return "无对称";
  if (layer.symmetry === "mirror-horizontal") return "水平镜像";
  if (layer.symmetry === "mirror-vertical") return "垂直镜像";
  if (layer.symmetry === "cyclic") return `${layer.order} 向旋转 C${layer.order}`;
  return `${layer.order} 向镜像 D${layer.order / 2}`;
}

export function SymmetryDrawingPage() {
  const rootRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 900, height: 620, ratio: 1 });
  const layersRef = useRef<DrawingLayer[]>([]);
  const drawingRef = useRef<{ pointerId: number; stroke: Stroke } | null>(null);
  const anchorDragRef = useRef<number | null>(null);
  const panRef = useRef<{ pointerId: number; start: Point; viewport: Viewport } | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [layers, setLayers] = useState<DrawingLayer[]>(() => [createLayer(1)]);
  const [activeLayerId, setActiveLayerId] = useState(() => layers[0]?.id ?? "");
  const [brush, setBrush] = useState<BrushKind>("round");
  const [brushWidth, setBrushWidth] = useState(3);
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [colorKind, setColorKind] = useState<ColorKind>("solid");
  const [colorSlot, setColorSlot] = useState<"colorA" | "colorB">("colorA");
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [panMode, setPanMode] = useState(false);
  const [notice, setNotice] = useState("滚轮缩放；使用移动工具或按住 Shift 拖动画布。");
  const [revision, setRevision] = useState(0);
  const fullscreen = useGameFullscreen(rootRef);
  layersRef.current = layers;
  viewportRef.current = viewport;

  const activeLayer = useMemo(() => layers.find(layer => layer.id === activeLayerId) ?? layers.at(-1)!, [activeLayerId, layers]);
  const isLocked = activeLayer.locked;

  const updateActive = useCallback((change: (layer: DrawingLayer) => DrawingLayer) => {
    setLayers(current => current.map(layer => layer.id === activeLayerId ? change(layer) : layer));
  }, [activeLayerId]);

  const paint = useCallback((draft?: Stroke) => {
    const canvas = canvasRef.current, { width, height, ratio } = sizeRef.current;
    const context = canvas?.getContext("2d"); if (!canvas || !context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#f8f8ff"; context.fillRect(0, 0, width, height);
    context.save(); context.translate(viewportRef.current.x, viewportRef.current.y); context.scale(viewportRef.current.zoom, viewportRef.current.zoom);
    const left = -viewportRef.current.x / viewportRef.current.zoom, top = -viewportRef.current.y / viewportRef.current.zoom;
    const right = left + width / viewportRef.current.zoom, bottom = top + height / viewportRef.current.zoom;
    context.strokeStyle = "rgba(105,80,220,.07)"; context.lineWidth = 1 / viewportRef.current.zoom;
    context.beginPath();
    for (let x = Math.floor(left / 80) * 80; x < right; x += 80) { context.moveTo(x, top); context.lineTo(x, bottom); }
    for (let y = Math.floor(top / 80) * 80; y < bottom; y += 80) { context.moveTo(left, y); context.lineTo(right, y); }
    context.stroke();
    context.restore();
    for (const layer of layersRef.current) compositeLayer(context, layer, width, height, ratio, viewportRef.current, layer.id === activeLayerId ? draft : undefined);
    context.save(); context.translate(viewportRef.current.x, viewportRef.current.y); context.scale(viewportRef.current.zoom, viewportRef.current.zoom);
    const selected = layersRef.current.find(layer => layer.id === activeLayerId);
    if (!selected) return;
    context.save(); context.globalAlpha = .72; context.strokeStyle = "#6551d7"; context.fillStyle = "#ffffff";
    context.lineWidth = 1.5; context.setLineDash([7, 8]);
    if (selected.symmetry === "mirror-horizontal") { context.beginPath(); context.moveTo(left, selected.anchor.y); context.lineTo(right, selected.anchor.y); context.stroke(); }
    if (selected.symmetry === "mirror-vertical") { context.beginPath(); context.moveTo(selected.anchor.x, top); context.lineTo(selected.anchor.x, bottom); context.stroke(); }
    if (selected.symmetry === "cyclic" || selected.symmetry === "dihedral") {
      const lines = selected.symmetry === "cyclic" ? selected.order : selected.order / 2;
      for (let index = 0; index < lines; index += 1) {
        const angle = index * Math.PI / lines;
        context.beginPath(); context.moveTo(selected.anchor.x - Math.cos(angle) * 1400, selected.anchor.y - Math.sin(angle) * 1400);
        context.lineTo(selected.anchor.x + Math.cos(angle) * 1400, selected.anchor.y + Math.sin(angle) * 1400); context.stroke();
      }
    }
    context.setLineDash([]); context.beginPath(); context.arc(selected.anchor.x, selected.anchor.y, 8, 0, Math.PI * 2);
    context.fill(); context.strokeStyle = "#6950dc"; context.lineWidth = 3 / viewportRef.current.zoom; context.stroke(); context.restore(); context.restore();
  }, [activeLayerId]);

  useEffect(() => { paint(); }, [layers, paint, revision, viewport]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect(), point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setViewport(current => {
        const zoom = Math.min(6, Math.max(.18, current.zoom * Math.exp(-event.deltaY * .0015)));
        const worldX = (point.x - current.x) / current.zoom, worldY = (point.y - current.y) / current.zoom;
        return { zoom, x: point.x - worldX * zoom, y: point.y - worldY * zoom };
      });
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const shell = shellRef.current, canvas = canvasRef.current; if (!shell || !canvas) return;
    const resize = () => {
      const rect = shell.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(320, Math.round(rect.width)), height = Math.max(320, Math.round(rect.height));
      const previous = sizeRef.current;
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      sizeRef.current = { width, height, ratio };
      if (previous.width === 900 && previous.height === 620) {
        setLayers(current => current.map(layer => layer.strokes.length ? layer : { ...layer, anchor: { x: width / 2, y: height / 2 } }));
      } else setRevision(value => value + 1);
    };
    const observer = new ResizeObserver(resize); observer.observe(shell); resize();
    return () => observer.disconnect();
  }, []);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top }, current = viewportRef.current;
    return { x: (screen.x - current.x) / current.zoom, y: (screen.y - current.y) / current.zoom };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const rect = event.currentTarget.getBoundingClientRect(), screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (panMode || event.button === 1 || event.shiftKey) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); panRef.current = { pointerId: event.pointerId, start: screen, viewport: viewportRef.current }; return; }
    const point = pointFromEvent(event), distance = Math.hypot(point.x - activeLayer.anchor.x, point.y - activeLayer.anchor.y) * viewportRef.current.zoom;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!isLocked && distance <= 22) { anchorDragRef.current = event.pointerId; setNotice("正在移动这个图层的对称中心"); return; }
    const stroke: Stroke = { id: makeId(), points: [point], width: brushWidth, brush, colorKind, colorA: activeLayer.colorA, colorB: activeLayer.colorB, opacity: brushOpacity };
    drawingRef.current = { pointerId: event.pointerId, stroke }; paint(stroke);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pan = panRef.current;
    if (pan?.pointerId === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      setViewport({ ...pan.viewport, x: pan.viewport.x + event.clientX - rect.left - pan.start.x, y: pan.viewport.y + event.clientY - rect.top - pan.start.y }); return;
    }
    const point = pointFromEvent(event);
    if (anchorDragRef.current === event.pointerId) { updateActive(layer => ({ ...layer, anchor: point })); return; }
    const drawing = drawingRef.current; if (!drawing || drawing.pointerId !== event.pointerId) return;
    const last = drawing.stroke.points.at(-1)!;
    if (Math.hypot(point.x - last.x, point.y - last.y) < 2.5) return;
    drawing.stroke.points.push(point); paint(drawing.stroke);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (panRef.current?.pointerId === event.pointerId) { panRef.current = null; return; }
    if (anchorDragRef.current === event.pointerId) { anchorDragRef.current = null; setNotice("中心已放好，落下第一笔后规则会锁定。 "); return; }
    const drawing = drawingRef.current; if (!drawing || drawing.pointerId !== event.pointerId) return;
    drawingRef.current = null;
    updateActive(layer => ({ ...layer, locked: true, strokes: [...layer.strokes, drawing.stroke] }));
    setNotice("这一层的对称规则已经锁定。可以继续画，或新建图层换一种规则。");
  };

  const addLayer = () => {
    const { width, height } = sizeRef.current, view = viewportRef.current;
    const next = createLayer(layers.length + 1, (width / 2 - view.x) * 2 / view.zoom, (height / 2 - view.y) * 2 / view.zoom);
    setLayers(current => [...current, next]); setActiveLayerId(next.id); setNotice("新图层已建立：先选规则并拖动中心。");
  };

  const removeLayer = (id: string) => {
    if (layers.length === 1) {
      const { width, height } = sizeRef.current, view = viewportRef.current;
      const next = createLayer(1, (width / 2 - view.x) * 2 / view.zoom, (height / 2 - view.y) * 2 / view.zoom);
      setLayers([next]); setActiveLayerId(next.id); setNotice("已删除最后一层，并建立新的空图层。"); return;
    }
    const index = layers.findIndex(layer => layer.id === id), next = layers.filter(layer => layer.id !== id);
    setLayers(next); if (activeLayerId === id) setActiveLayerId(next[Math.max(0, index - 1)]!.id);
  };

  const moveLayer = (id: string, direction: -1 | 1) => {
    setLayers(current => {
      const index = current.findIndex(layer => layer.id === id), target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current], [item] = next.splice(index, 1); next.splice(target, 0, item); return next;
    });
  };

  const savePng = () => {
    const { width, height, ratio } = sizeRef.current;
    const canvas = document.createElement("canvas"); canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d"); if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.fillStyle = "#f8f8ff"; context.fillRect(0, 0, width, height);
    for (const layer of layersRef.current) compositeLayer(context, layer, width, height, ratio, viewportRef.current);
    const anchor = document.createElement("a"); anchor.download = `木木对称画-${new Date().toISOString().slice(0, 10)}.png`;
    anchor.href = canvas.toDataURL("image/png"); anchor.click(); setNotice("作品已保存为 PNG 图片。");
  };

  const zoomBy = (factor: number) => {
    const { width, height } = sizeRef.current;
    setViewport(current => {
      const zoom = Math.min(6, Math.max(.18, current.zoom * factor)), worldX = (width / 2 - current.x) / current.zoom, worldY = (height / 2 - current.y) / current.zoom;
      return { zoom, x: width / 2 - worldX * zoom, y: height / 2 - worldY * zoom };
    });
  };

  return (
    <main className={`symmetry-page${fullscreen.focused ? " is-focused" : ""}`} ref={rootRef}>
      {!fullscreen.focused && <GameTopBar title="对称画" backHref="/?tab=art" backLabel="艺术" wallets={false} controls={<>
        <button type="button" onClick={() => void fullscreen.enter()} disabled={fullscreen.switching}>⛶ 全屏绘画</button>
        <button type="button" onClick={savePng}>保存 PNG</button>
      </>} />}
      <section className="symmetry-workspace" aria-label="对称画创作区">
        <div className="symmetry-canvas-shell" ref={shellRef}>
          <canvas className={panMode ? "is-panning" : ""} ref={canvasRef} aria-label="对称绘画画板。拖动绘画；第一笔前可以拖动中心点。" tabIndex={0}
            onContextMenu={event => event.preventDefault()} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishPointer} onPointerCancel={finishPointer} />
          <div className="symmetry-hint" aria-live="polite">{notice}</div>
          {fullscreen.focused && <button className="symmetry-exit" data-fullscreen-exit type="button" onClick={() => void fullscreen.leave()}>退出全屏</button>}
          <div className="symmetry-zoom" aria-label="画布缩放控制"><button className={panMode ? "is-active" : ""} type="button" onClick={() => setPanMode(value => !value)}>{panMode ? "画笔" : "移动"}</button><button type="button" aria-label="缩小画布" onClick={() => zoomBy(1 / 1.25)}>−</button><output>{Math.round(viewport.zoom * 100)}%</output><button type="button" aria-label="放大画布" onClick={() => zoomBy(1.25)}>＋</button><button type="button" onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}>复位</button></div>
        </div>

        <aside className="symmetry-controls" aria-label="画笔与图层控制">
          <div className="symmetry-panel-heading"><div><small>创作控制台</small><strong>{symmetryLabel(activeLayer)}</strong></div><button type="button" onClick={savePng}>保存</button></div>

          <section><h2>画笔</h2><div className="symmetry-segments" role="group" aria-label="画笔样式">
            {([['round','圆润'],['marker','马克笔'],['glow','星光']] as const).map(([value, label]) => <button className={brush === value ? "is-active" : ""} type="button" onClick={() => setBrush(value)} key={value}>{label}</button>)}
          </div><label className="symmetry-range">粗细 <output>{brushWidth}</output><input type="range" min="2" max="38" value={brushWidth} onChange={event => setBrushWidth(Number(event.target.value))} /></label>
          <label className="symmetry-range">画笔透明度 <output>{Math.round(brushOpacity * 100)}%</output><input type="range" min="5" max="100" value={Math.round(brushOpacity * 100)} onChange={event => setBrushOpacity(Number(event.target.value) / 100)} /></label></section>

          <section><h2>颜色</h2><div className="symmetry-segments is-color-grid" role="group" aria-label="颜色方式">
            {([['solid','纯色'],['stroke-gradient','沿笔渐变'],['canvas-spectrum','流光彩虹'],['layer-spectrum','图层底色场']] as const).map(([value, label]) => <button className={colorKind === value ? "is-active" : ""} type="button" onClick={() => { setColorKind(value); if (value === "solid") setColorSlot("colorA"); }} key={value}>{label}</button>)}
          </div>{colorKind !== "canvas-spectrum" && colorKind !== "layer-spectrum" && <div className="symmetry-palette-wrap">
            {colorKind === "stroke-gradient" && <div className="symmetry-color-slots"><button className={colorSlot === "colorA" ? "is-active" : ""} type="button" onClick={() => setColorSlot("colorA")}><i style={{ background: activeLayer.colorA }} />①</button><button className={colorSlot === "colorB" ? "is-active" : ""} type="button" onClick={() => setColorSlot("colorB")}><i style={{ background: activeLayer.colorB }} />②</button></div>}
            <div className="symmetry-palette" role="group" aria-label="常用颜色">{COLOR_PRESETS.map(color => <button type="button" key={color.value} title={color.label} aria-label={`选择${color.label}`} className={(colorSlot === "colorA" ? activeLayer.colorA : activeLayer.colorB) === color.value ? "is-active" : ""} style={{ "--swatch": color.value } as CSSProperties} onClick={() => updateActive(layer => ({ ...layer, [colorSlot]: color.value }))}><span /></button>)}</div>
          </div>}
            <p>{colorKind === "stroke-gradient" ? "颜色按划过的距离均匀变化，落笔后保持不变。" : colorKind === "layer-spectrum" ? "颜色固定在这一层的空间里，画到哪里就显出哪里的底色。" : colorKind === "canvas-spectrum" ? "保留原有的整笔彩虹效果。" : "每个新图层会随机生成初始颜色。"}</p>
          </section>

          <section><div className="symmetry-title-row"><h2>对称规则</h2>{isLocked && <span>🔒 已锁定</span>}</div>
            <div className="symmetry-rule-grid" role="group" aria-label="对称规则">
              {([['none','•','无对称'],['mirror-horizontal','↕','水平镜像'],['mirror-vertical','↔','垂直镜像'],['cyclic','⟳','旋转 Cₙ'],['dihedral','✣','镜像 Dₙ']] as const).map(([value, icon, label]) => <button type="button" disabled={isLocked} className={activeLayer.symmetry === value ? "is-active" : ""} onClick={() => updateActive(layer => ({ ...layer, symmetry: value }))} key={value}><span data-rule={value}>{icon}</span><small>{label}</small></button>)}
            </div>
            {(activeLayer.symmetry === "cyclic" || activeLayer.symmetry === "dihedral") && <div className="symmetry-order" role="group" aria-label="对称方向数">{(activeLayer.symmetry === "cyclic" ? ROTATION_ORDERS : MIRROR_ORDERS).map(order => <button type="button" disabled={isLocked} className={activeLayer.order === order ? "is-active" : ""} onClick={() => updateActive(layer => ({ ...layer, order }))} key={order}>{order}</button>)}</div>}
            <p>{isLocked ? "已有笔触。要换规则，请新建图层。" : "拖动画板中心的小圆点，决定这一层的对称中心。"}</p>
          </section>

          <section className="symmetry-layer-section"><div className="symmetry-title-row"><h2>图层</h2><button type="button" onClick={addLayer}>＋ 新建</button></div>
            <div className="symmetry-layer-list">{[...layers].reverse().map((layer, reverseIndex) => {
              const index = layers.length - 1 - reverseIndex;
              return <article className={layer.id === activeLayerId ? "is-active" : ""} key={layer.id} onClick={() => setActiveLayerId(layer.id)}>
                <button className="symmetry-layer-name" type="button" onClick={() => setActiveLayerId(layer.id)}><strong>{symmetryLabel(layer)}</strong><small>{layer.strokes.length} 笔 · {Math.round(layer.opacity * 100)}%</small></button>
                <div className="symmetry-layer-actions"><button type="button" aria-label="上移一层" disabled={index === layers.length - 1} onClick={event => { event.stopPropagation(); moveLayer(layer.id, 1); }}>↑</button><button type="button" aria-label="下移一层" disabled={index === 0} onClick={event => { event.stopPropagation(); moveLayer(layer.id, -1); }}>↓</button><button type="button" aria-label="删除图层" onClick={event => { event.stopPropagation(); removeLayer(layer.id); }}>×</button></div>
              </article>;
            })}</div>
            <label className="symmetry-range">图层透明度 <output>{Math.round(activeLayer.opacity * 100)}%</output><input type="range" min="10" max="100" value={Math.round(activeLayer.opacity * 100)} onChange={event => updateActive(layer => ({ ...layer, opacity: Number(event.target.value) / 100 }))} /></label>
            <div className="symmetry-bottom-actions"><button type="button" disabled={!activeLayer.strokes.length} onClick={() => updateActive(layer => ({ ...layer, strokes: layer.strokes.slice(0, -1) }))}>撤销一笔</button><button type="button" disabled={!activeLayer.strokes.length} onClick={() => updateActive(layer => ({ ...layer, strokes: [] }))}>清空本层</button></div>
          </section>
        </aside>
      </section>
    </main>
  );
}
