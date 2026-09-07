import { useEffect, useRef, useState, type RefObject } from "react";
import { clampReferencePosition, type PaintingReference } from "./painting-references";
import "./painting-reference.css";

export function PaintingReferenceWindow({ reference, onClose, stage }: {
  reference: PaintingReference; onClose: () => void; stage: RefObject<HTMLDivElement | null>;
}) {
  const panel = useRef<HTMLElement>(null);
  const imageArea = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number } | null>(null);
  const [position, setPosition] = useState(() => ({ x: (stage.current?.getBoundingClientRect().left ?? 0) + 16, y: (stage.current?.getBoundingClientRect().top ?? 80) + 16 }));
  const [zoom, setZoom] = useState(1);
  const [ratio, setRatio] = useState(1);
  const [imageSize, setImageSize] = useState({ width: 280, height: 230 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const constrain = (p: { x: number; y: number }) => clampReferencePosition(p, {
    width: panel.current?.offsetWidth ?? 320, height: panel.current?.offsetHeight ?? 420,
  }, { width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const resize = () => {
      setPosition((current) => constrain(current));
      if (imageArea.current) setImageSize({ width: imageArea.current.clientWidth, height: imageArea.current.clientHeight });
    };
    const observer = new ResizeObserver(resize);
    if (panel.current) observer.observe(panel.current);
    if (imageArea.current) observer.observe(imageArea.current);
    window.addEventListener("resize", resize); resize();
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); };
  }, []);
  const fit = () => { setZoom(1); imageArea.current?.scrollTo(0, 0); };
  const imageWidth = Math.min(imageSize.width, imageSize.height * ratio) * zoom;

  return <aside ref={panel} className="painting-reference" aria-label="名画参考窗"
    style={{ left: position.x, top: position.y }}
    onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); onClose(); } }}
    onKeyUp={(event) => event.stopPropagation()}>
    <div className="painting-reference-heading">
      <button type="button" className="painting-reference-drag" aria-label="移动参考图，拖动或用方向键移动"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault(); event.currentTarget.focus();
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: position.x, startY: position.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current; if (!start || event.pointerId !== start.id) return;
          setPosition(constrain({ x: start.startX + event.clientX - start.x, y: start.startY + event.clientY - start.y }));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={(event) => {
          const directions: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
          const step = directions[event.key];
          if (step) { event.preventDefault(); setPosition((p) => constrain({ x: p.x + step[0], y: p.y + step[1] })); }
        }}>⠿ 参考原画</button>
      <button type="button" onClick={onClose} aria-label="关闭参考图">关闭</button>
    </div>
    <strong>{reference.title}</strong>
    <span className="painting-reference-artist">{reference.artist}</span>
    <div className="painting-reference-image" ref={imageArea}>
      {status === "loading" && <p role="status">正在打开原画…</p>}
      {status === "error" ? <div role="alert"><p>原画暂时没有打开。</p><button type="button" onClick={() => { setStatus("loading"); setAttempt((n) => n + 1); }}>重试参考图</button></div>
        : <img key={attempt} src={reference.image} alt={reference.title + "原画参考"} draggable={false}
          style={{ width: imageWidth, visibility: status === "loading" ? "hidden" : "visible" }}
          onLoad={(event) => { setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight); setStatus("ready"); }}
          onError={() => setStatus("error")} />}
    </div>
    <div className="painting-reference-controls">
      <button type="button" aria-label="缩小参考图" disabled={status !== "ready" || zoom <= .5} onClick={() => setZoom((n) => Math.max(.5, n - .25))}>−</button>
      <output aria-label="参考图缩放比例">{Math.round(zoom * 100)}%</output>
      <button type="button" aria-label="放大参考图" disabled={status !== "ready" || zoom >= 3} onClick={() => setZoom((n) => Math.min(3, n + .25))}>＋</button>
      <button type="button" disabled={status !== "ready"} onClick={fit}>适合</button>
    </div>
    <a href={reference.sourceUrl} target="_blank" rel="noreferrer">作品来源 ↗</a>
  </aside>;
}
