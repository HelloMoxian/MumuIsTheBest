import { useEffect, useRef } from "react";
import {
  formatInteger,
  getNumberLineViewport,
  rangeSize,
  type CandidateRange,
  type EliminatedSegment,
  type NumberLineViewport,
  type NumberRangeMaximum,
} from "./logic";

type NumberLineCanvasProps = {
  maximum: NumberRangeMaximum;
  candidates: CandidateRange;
  lastEliminated: EliminatedSegment | null;
  pulseKey: number;
  revealedSecret: number | null;
  celebrating?: boolean;
};

function pseudoRandom(seed: number) {
  const value = Math.sin(seed * 91.713) * 43_758.5453;
  return value - Math.floor(value);
}

function niceTickStep(viewportSpan: number) {
  const roughStep = Math.max(1, viewportSpan / 10);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return Math.max(1, step * magnitude);
}

export function NumberLineCanvas({
  maximum,
  candidates,
  lastEliminated,
  pulseKey,
  revealedSecret,
  celebrating = false,
}: NumberLineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<NumberLineViewport>(
    getNumberLineViewport(maximum, candidates),
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationFrame = 0;
    const startedAt = performance.now();
    const targetViewport = getNumberLineViewport(maximum, candidates);
    const previousViewport = viewportRef.current.maximum > maximum
      ? { minimum: 0, maximum, zoomed: false }
      : viewportRef.current;
    viewportRef.current = targetViewport;

    const draw = (now: number) => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(320, bounds.width);
      const height = Math.max(230, bounds.height);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const progress = reducedMotion ? 1 : Math.min(1, (now - startedAt) / 850);
      const viewportProgress = reducedMotion ? 1 : Math.min(1, (now - startedAt) / 620);
      const viewportEase = 1 - (1 - viewportProgress) ** 3;
      const viewportMinimum = previousViewport.minimum
        + (targetViewport.minimum - previousViewport.minimum) * viewportEase;
      const viewportMaximum = previousViewport.maximum
        + (targetViewport.maximum - previousViewport.maximum) * viewportEase;
      const viewportSpan = Math.max(1, viewportMaximum - viewportMinimum);
      const margin = width < 540 ? 28 : 52;
      const axisLeft = margin;
      const axisRight = width - margin;
      const axisWidth = axisRight - axisLeft;
      const axisY = height * 0.5;
      const toX = (value: number) => (
        axisLeft
        + ((Math.min(viewportMaximum, Math.max(viewportMinimum, value)) - viewportMinimum) / viewportSpan)
        * axisWidth
      );

      const background = context.createRadialGradient(
        width * 0.5,
        axisY,
        20,
        width * 0.5,
        axisY,
        width * 0.7,
      );
      background.addColorStop(0, "rgba(45, 43, 111, .55)");
      background.addColorStop(0.55, "rgba(15, 16, 56, .72)");
      background.addColorStop(1, "rgba(7, 8, 33, .94)");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      for (let index = 0; index < 46; index += 1) {
        const x = pseudoRandom(index + 3) * width;
        const y = pseudoRandom(index + 57) * height;
        context.beginPath();
        context.arc(x, y, index % 8 === 0 ? 1.15 : 0.65, 0, Math.PI * 2);
        context.fillStyle = index % 6 === 0
          ? "rgba(89, 231, 255, .24)"
          : "rgba(255, 255, 255, .15)";
        context.fill();
      }

      context.lineCap = "round";
      context.strokeStyle = "rgba(151, 153, 190, .28)";
      context.lineWidth = 26;
      context.beginPath();
      context.moveTo(axisLeft, axisY);
      context.lineTo(axisRight, axisY);
      context.stroke();

      const activeLeft = toX(candidates.minimum);
      const activeRight = toX(candidates.maximum);
      const activeGradient = context.createLinearGradient(activeLeft, 0, Math.max(activeLeft + 1, activeRight), 0);
      activeGradient.addColorStop(0, "#59e7ff");
      activeGradient.addColorStop(0.52, "#8d73ff");
      activeGradient.addColorStop(1, "#ff67c7");
      context.strokeStyle = activeGradient;
      context.lineWidth = 18;
      context.shadowColor = "#8d73ff";
      context.shadowBlur = revealedSecret === null ? 18 : 28;
      context.beginPath();
      context.moveTo(activeLeft, axisY);
      context.lineTo(Math.max(activeLeft + 1, activeRight), axisY);
      context.stroke();
      context.shadowBlur = 0;

      const frozenZones: Array<{ left: number; right: number }> = [];
      if (candidates.minimum > viewportMinimum) {
        frozenZones.push({ left: axisLeft, right: toX(candidates.minimum - 1) });
      }
      if (candidates.maximum < viewportMaximum) {
        frozenZones.push({ left: toX(candidates.maximum + 1), right: axisRight });
      }

      for (const zone of frozenZones) {
        if (zone.right <= zone.left) continue;
        context.save();
        context.beginPath();
        context.rect(zone.left, axisY - 19, zone.right - zone.left, 38);
        context.clip();
        context.fillStyle = "rgba(92, 93, 123, .34)";
        context.fillRect(zone.left, axisY - 19, zone.right - zone.left, 38);
        context.strokeStyle = "rgba(195, 197, 221, .14)";
        context.lineWidth = 2;
        for (let x = zone.left - 40; x < zone.right + 40; x += 17) {
          context.beginPath();
          context.moveTo(x, axisY + 20);
          context.lineTo(x + 31, axisY - 20);
          context.stroke();
        }
        context.restore();

        const crackCount = Math.max(2, Math.floor((zone.right - zone.left) / 85));
        context.strokeStyle = "rgba(224, 225, 239, .34)";
        context.lineWidth = 1.1;
        for (let index = 0; index < crackCount; index += 1) {
          const center = zone.left + (index + 0.5) * ((zone.right - zone.left) / crackCount);
          const offset = (pseudoRandom(index + Math.round(zone.left)) - 0.5) * 23;
          context.beginPath();
          context.moveTo(center + offset, axisY - 15);
          context.lineTo(center + offset - 5, axisY - 4);
          context.lineTo(center + offset + 4, axisY + 2);
          context.lineTo(center + offset - 3, axisY + 15);
          context.stroke();
        }
      }

      if (lastEliminated && progress < 1 && !reducedMotion) {
        const visibleEliminatedMinimum = Math.max(lastEliminated.minimum, viewportMinimum);
        const visibleEliminatedMaximum = Math.min(lastEliminated.maximum, viewportMaximum);
        if (visibleEliminatedMinimum <= visibleEliminatedMaximum) {
          const eliminatedLeft = toX(visibleEliminatedMinimum);
          const eliminatedRight = toX(visibleEliminatedMaximum);
          const sweepX = lastEliminated.side === "left"
            ? eliminatedRight - (eliminatedRight - eliminatedLeft) * progress
            : eliminatedLeft + (eliminatedRight - eliminatedLeft) * progress;
          context.save();
          context.globalAlpha = 1 - progress * 0.7;
          context.shadowColor = "#b8b7d7";
          context.shadowBlur = 17;
          context.strokeStyle = "rgba(230, 232, 255, .82)";
          context.lineWidth = 4;
          context.beginPath();
          context.moveTo(sweepX, axisY - 24);
          context.lineTo(sweepX, axisY + 24);
          context.stroke();
          context.restore();

          for (let index = 0; index < 24; index += 1) {
            const originX = eliminatedLeft + pseudoRandom(index + 400) * Math.max(1, eliminatedRight - eliminatedLeft);
            const direction = pseudoRandom(index + 900) > 0.5 ? 1 : -1;
            const x = originX + direction * progress * (8 + pseudoRandom(index + 1200) * 24);
            const y = axisY + (pseudoRandom(index + 1500) - 0.5) * 22 - progress * (16 + pseudoRandom(index + 1800) * 34);
            const radius = 1 + pseudoRandom(index + 2100) * 2.4;
            context.beginPath();
            context.arc(x, y, radius, 0, Math.PI * 2);
            context.fillStyle = index % 4 === 0 ? "#59e7ff" : "rgba(218, 219, 235, .78)";
            context.globalAlpha = 1 - progress;
            context.fill();
          }
          context.globalAlpha = 1;
        }
      }

      const tickStep = niceTickStep(viewportSpan);
      const firstTick = Math.ceil(viewportMinimum / tickStep) * tickStep;
      context.textAlign = "center";
      context.textBaseline = "top";
      context.font = `800 ${width < 540 ? 9 : 11}px ui-rounded, system-ui`;
      for (let value = firstTick; value <= viewportMaximum + 0.001; value += tickStep) {
        const x = toX(value);
        context.strokeStyle = "rgba(225, 225, 245, .32)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, axisY + 22);
        context.lineTo(x, axisY + 32);
        context.stroke();
        context.fillStyle = "rgba(205, 205, 229, .72)";
        context.fillText(formatInteger(value), x, axisY + 40);
      }

      const drawEndpoint = (x: number, value: number, align: "left" | "right") => {
        context.beginPath();
        context.arc(x, axisY, 8, 0, Math.PI * 2);
        context.fillStyle = align === "left" ? "#59e7ff" : "#ff67c7";
        context.shadowColor = context.fillStyle;
        context.shadowBlur = 17;
        context.fill();
        context.shadowBlur = 0;
        context.font = `950 ${width < 540 ? 13 : 15}px ui-rounded, system-ui`;
        context.textBaseline = "bottom";
        context.textAlign = align;
        context.fillStyle = "#f5f5ff";
        context.fillText(formatInteger(value), x + (align === "left" ? -7 : 7), axisY - 25);
      };

      if (candidates.minimum === candidates.maximum) {
        drawEndpoint(activeLeft, candidates.minimum, activeLeft < width * 0.5 ? "left" : "right");
      } else {
        drawEndpoint(activeLeft, candidates.minimum, "left");
        drawEndpoint(activeRight, candidates.maximum, "right");
      }

      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.font = `900 ${width < 540 ? 12 : 14}px ui-rounded, system-ui`;
      context.fillStyle = "rgba(204, 202, 232, .86)";
      context.fillText(`还可能有 ${formatInteger(rangeSize(candidates))} 个数字`, width / 2, axisY - 55);

      if (targetViewport.zoomed) {
        context.textAlign = "right";
        context.textBaseline = "top";
        context.font = `900 ${width < 540 ? 9 : 11}px ui-rounded, system-ui`;
        context.fillStyle = "rgba(89, 231, 255, .84)";
        context.fillText("局部放大", axisRight, axisY - 88);
      }

      if (revealedSecret !== null) {
        const secretX = toX(revealedSecret);
        const glow = context.createRadialGradient(secretX, axisY, 2, secretX, axisY, 42);
        glow.addColorStop(0, "rgba(255, 255, 255, .98)");
        glow.addColorStop(0.2, "rgba(255, 209, 102, .9)");
        glow.addColorStop(0.52, "rgba(255, 103, 199, .32)");
        glow.addColorStop(1, "rgba(255, 103, 199, 0)");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(secretX, axisY, 42, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.arc(secretX, axisY, 12, 0, Math.PI * 2);
        context.fillStyle = "#ffd166";
        context.strokeStyle = "white";
        context.lineWidth = 3;
        context.shadowColor = "#ffd166";
        context.shadowBlur = 24;
        context.fill();
        context.stroke();
        context.shadowBlur = 0;
        context.fillStyle = "#ffd166";
        context.font = "950 13px ui-rounded, system-ui";
        context.textBaseline = "top";
        context.fillText("目标在这里", secretX, axisY + 68);

        if (celebrating && !reducedMotion) {
          const celebrationProgress = Math.min(1, (now - startedAt) / 1_180);
          const burstEase = 1 - (1 - celebrationProgress) ** 3;
          for (let index = 0; index < 20; index += 1) {
            const angle = pseudoRandom(index + 2_800) * Math.PI * 2;
            const distance = 12 + burstEase * (28 + pseudoRandom(index + 3_100) * 54);
            const x = secretX + Math.cos(angle) * distance;
            const y = axisY + Math.sin(angle) * distance;
            context.beginPath();
            context.arc(x, y, 1.5 + pseudoRandom(index + 3_500) * 2.5, 0, Math.PI * 2);
            context.fillStyle = index % 3 === 0
              ? "#ffd166"
              : index % 3 === 1 ? "#59e7ff" : "#ff67c7";
            context.globalAlpha = Math.max(0, 1 - celebrationProgress * 0.82);
            context.fill();
          }
          context.globalAlpha = 1;
        }
      }

      const celebrationRunning = celebrating && (now - startedAt) < 1_180;
      if (
        !reducedMotion
        && (progress < 1 || viewportProgress < 1 || celebrationRunning)
      ) {
        animationFrame = requestAnimationFrame(draw);
      }
    };

    animationFrame = requestAnimationFrame(draw);
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(draw);
    });
    resizeObserver.observe(canvas);
    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [candidates, celebrating, lastEliminated, maximum, pulseKey, revealedSecret]);

  const viewport = getNumberLineViewport(maximum, candidates);
  const viewportDescription = viewport.zoomed
    ? `当前局部放大显示 ${viewport.minimum} 到 ${viewport.maximum}`
    : `当前显示完整范围 0 到 ${maximum}`;

  return (
    <canvas
      ref={canvasRef}
      className="find-number-canvas"
      role="img"
      aria-label={`${viewportDescription}，神秘数字当前位于 ${candidates.minimum} 到 ${candidates.maximum} 之间，还剩 ${rangeSize(candidates)} 个候选数字`}
    />
  );
}
