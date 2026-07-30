import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { evaluateCurve, formatNumber, sampleCurve, type FunctionCurve } from "./logic";

type FunctionGraphCanvasProps = {
  curves: readonly FunctionCurve[];
  selectedId: string | null;
  span: number;
  animationKey: number;
  probeX: number | null;
  onProbeX: (x: number | null) => void;
};

const CURVE_COLORS = ["#59e7ff", "#ff67c7", "#ffd166", "#4ce0a3"] as const;
const DRAW_ANIMATION_MS = 280;

function gridStep(span: number) {
  const roughStep = span / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceStep * magnitude;
}

function crispLine(value: number) {
  return Math.round(value) + 0.5;
}

export function FunctionGraphCanvas({
  curves,
  selectedId,
  span,
  animationKey,
  probeX,
  onProbeX,
}: FunctionGraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastAnimationKeyRef = useRef(-1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shouldAnimate = lastAnimationKeyRef.current !== animationKey;
    lastAnimationKeyRef.current = animationKey;
    let frame = 0;
    let startedAt = performance.now() - (reducedMotion || !shouldAnimate ? DRAW_ANIMATION_MS : 0);
    let settled = reducedMotion || !shouldAnimate;
    let cachedPlotWidth = -1;
    let cachedSegments = new Map<string, ReturnType<typeof sampleCurve>>();

    const draw = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(320, rect.width);
      const height = Math.max(300, rect.height);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const plot = {
        left: width < 560 ? 41 : 56,
        right: 22,
        top: 22,
        bottom: width < 560 ? 38 : 44,
      };
      const plotWidth = width - plot.left - plot.right;
      const plotHeight = height - plot.top - plot.bottom;
      const xToPixel = (x: number) => plot.left + ((x + span) / (span * 2)) * plotWidth;
      const yToPixel = (y: number) => plot.top + ((span - y) / (span * 2)) * plotHeight;
      const roundedPlotWidth = Math.round(plotWidth);

      if (cachedPlotWidth !== roundedPlotWidth) {
        const sampleCount = Math.min(900, Math.max(280, Math.round(plotWidth / 1.4)));
        cachedSegments = new Map(curves.map((curve) => [
          curve.id,
          sampleCurve(curve, -span, span, sampleCount, span),
        ]));
        cachedPlotWidth = roundedPlotWidth;
      }

      const background = context.createRadialGradient(
        width * 0.52,
        height * 0.46,
        5,
        width * 0.52,
        height * 0.46,
        Math.max(width, height) * 0.68,
      );
      background.addColorStop(0, "rgba(39, 40, 103, 0.54)");
      background.addColorStop(0.52, "rgba(16, 18, 62, 0.72)");
      background.addColorStop(1, "rgba(7, 8, 35, 0.96)");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      for (let index = 0; index < 70; index += 1) {
        const x = ((Math.sin(index * 91.73) + 1) / 2) * width;
        const y = ((Math.cos(index * 47.11) + 1) / 2) * height;
        const radius = index % 9 === 0 ? 1.2 : 0.65;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = index % 7 === 0 ? "rgba(89, 231, 255, .28)" : "rgba(240, 240, 255, .18)";
        context.fill();
      }

      context.save();
      context.beginPath();
      context.rect(plot.left, plot.top, plotWidth, plotHeight);
      context.clip();

      const step = gridStep(span);
      context.font = `700 ${width < 560 ? 10 : 11}px ui-rounded, system-ui`;
      context.textAlign = "center";
      context.textBaseline = "top";
      for (let value = -span; value <= span + 0.001; value += step) {
        const x = crispLine(xToPixel(value));
        const y = crispLine(yToPixel(value));
        const isOrigin = Math.abs(value) < 0.001;

        context.beginPath();
        context.moveTo(x, plot.top);
        context.lineTo(x, plot.top + plotHeight);
        context.strokeStyle = isOrigin ? "rgba(230, 232, 255, .52)" : "rgba(184, 183, 215, .12)";
        context.lineWidth = isOrigin ? 1.6 : 1;
        context.stroke();

        context.beginPath();
        context.moveTo(plot.left, y);
        context.lineTo(plot.left + plotWidth, y);
        context.strokeStyle = isOrigin ? "rgba(230, 232, 255, .52)" : "rgba(184, 183, 215, .12)";
        context.lineWidth = isOrigin ? 1.6 : 1;
        context.stroke();
      }

      const progress = reducedMotion ? 1 : Math.min(1, Math.max(0, (now - startedAt) / DRAW_ANIMATION_MS));
      const orderedCurves = [...curves].sort((left, right) => (
        left.id === selectedId ? 1 : right.id === selectedId ? -1 : 0
      ));

      for (const curve of orderedCurves) {
        if (!curve.visible) continue;
        const color = CURVE_COLORS[curve.colorIndex % CURVE_COLORS.length];
        const selected = curve.id === selectedId;
        const reveal = selected ? progress : 1;
        const revealX = -span + span * 2 * reveal;
        const segments = cachedSegments.get(curve.id) ?? [];

        context.save();
        context.lineCap = "round";
        context.lineJoin = "round";
        context.strokeStyle = color;
        context.globalAlpha = selected ? 1 : 0.62;
        context.lineWidth = selected ? 4.2 : 2.5;
        context.shadowColor = color;
        context.shadowBlur = selected ? 18 : 8;

        for (const segment of segments) {
          let drawing = false;
          context.beginPath();
          for (const point of segment) {
            if (point.x > revealX) break;
            const x = xToPixel(point.x);
            const y = yToPixel(point.y);
            if (!drawing) {
              context.moveTo(x, y);
              drawing = true;
            } else {
              context.lineTo(x, y);
            }
          }
          if (drawing) context.stroke();
        }
        context.restore();

        if (selected && progress < 1 && !reducedMotion) {
          for (let particle = 0; particle < 9; particle += 1) {
            const particleProgress = progress - particle * 0.022;
            if (particleProgress <= 0) continue;
            const x = -span + span * 2 * particleProgress;
            const y = evaluateCurve(curve, x);
            if (y === null || Math.abs(y) > span * 1.25) continue;
            const radius = particle === 0 ? 4.5 : Math.max(1.6, 3.8 - particle * 0.24);
            context.beginPath();
            context.arc(xToPixel(x), yToPixel(y), radius, 0, Math.PI * 2);
            context.fillStyle = particle === 0 ? "#ffffff" : color;
            context.shadowColor = color;
            context.shadowBlur = 18;
            context.globalAlpha = 1 - particle * 0.075;
            context.fill();
          }
          context.globalAlpha = 1;
          context.shadowBlur = 0;
        }
      }

      if (probeX !== null) {
        const probePixel = xToPixel(probeX);
        context.save();
        context.setLineDash([5, 7]);
        context.beginPath();
        context.moveTo(probePixel, plot.top);
        context.lineTo(probePixel, plot.top + plotHeight);
        context.strokeStyle = "rgba(245, 245, 255, .58)";
        context.lineWidth = 1.4;
        context.stroke();
        context.setLineDash([]);

        for (const curve of curves) {
          if (!curve.visible) continue;
          const y = evaluateCurve(curve, probeX);
          if (y === null || Math.abs(y) > span) continue;
          const color = CURVE_COLORS[curve.colorIndex % CURVE_COLORS.length];
          context.beginPath();
          context.arc(probePixel, yToPixel(y), curve.id === selectedId ? 6 : 4.5, 0, Math.PI * 2);
          context.fillStyle = "#0e0d2b";
          context.strokeStyle = color;
          context.lineWidth = 3;
          context.shadowColor = color;
          context.shadowBlur = 13;
          context.fill();
          context.stroke();
        }
        context.restore();
      }
      context.restore();

      context.fillStyle = "rgba(205, 205, 231, .72)";
      context.font = `750 ${width < 560 ? 10 : 11}px ui-rounded, system-ui`;
      context.textAlign = "center";
      context.textBaseline = "top";
      for (let value = -span; value <= span + 0.001; value += step) {
        if (Math.abs(value) < 0.001) continue;
        context.fillText(formatNumber(value), xToPixel(value), yToPixel(0) + 7);
      }
      context.textAlign = "right";
      context.textBaseline = "middle";
      for (let value = -span; value <= span + 0.001; value += step) {
        if (Math.abs(value) < 0.001) continue;
        context.fillText(formatNumber(value), xToPixel(0) - 8, yToPixel(value));
      }
      context.fillStyle = "rgba(89, 231, 255, .88)";
      context.font = "900 15px ui-rounded, system-ui";
      context.textAlign = "right";
      context.textBaseline = "bottom";
      context.fillText("x", plot.left + plotWidth - 6, yToPixel(0) - 7);
      context.textAlign = "left";
      context.textBaseline = "top";
      context.fillText("y", xToPixel(0) + 8, plot.top + 4);
      context.fillStyle = "rgba(205, 205, 231, .72)";
      context.font = "750 11px ui-rounded, system-ui";
      context.fillText("0", xToPixel(0) + 7, yToPixel(0) + 7);

      if (progress < 1 && !reducedMotion) {
        frame = requestAnimationFrame(draw);
      } else {
        settled = true;
      }
    };

    frame = requestAnimationFrame(draw);
    const resizeObserver = new ResizeObserver(() => {
      if (settled) {
        startedAt = performance.now() - DRAW_ANIMATION_MS;
        frame = requestAnimationFrame(draw);
      }
    });
    resizeObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [animationKey, curves, probeX, selectedId, span]);

  const updateProbe = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotLeft = bounds.width < 560 ? 41 : 56;
    const plotRight = 22;
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left - plotLeft) / (bounds.width - plotLeft - plotRight)));
    const x = -span + ratio * span * 2;
    onProbeX(Number(x.toFixed(1)));
  };

  return (
    <canvas
      ref={canvasRef}
      className="mystery-canvas"
      role="img"
      aria-label={`函数坐标图，当前显示 ${curves.filter((curve) => curve.visible).length} 条曲线`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        updateProbe(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) updateProbe(event);
      }}
      onDoubleClick={() => onProbeX(null)}
    />
  );
}

export { CURVE_COLORS };
