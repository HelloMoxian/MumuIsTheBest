import { useEffect, useRef } from "react";
import {
  formatInteger,
  rangeSize,
  type CandidateRange,
  type EliminatedSegment,
  type NumberRangeMaximum,
} from "./logic";

type NumberLineCanvasProps = {
  maximum: NumberRangeMaximum;
  candidates: CandidateRange;
  lastEliminated: EliminatedSegment | null;
  pulseKey: number;
  revealedSecret: number | null;
};

function pseudoRandom(seed: number) {
  const value = Math.sin(seed * 91.713) * 43_758.5453;
  return value - Math.floor(value);
}

export function NumberLineCanvas({
  maximum,
  candidates,
  lastEliminated,
  pulseKey,
  revealedSecret,
}: NumberLineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationFrame = 0;
    const startedAt = performance.now();

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
      const margin = width < 540 ? 28 : 52;
      const axisLeft = margin;
      const axisRight = width - margin;
      const axisWidth = axisRight - axisLeft;
      const axisY = height * 0.5;
      const toX = (value: number) => axisLeft + (Math.min(maximum, Math.max(0, value)) / maximum) * axisWidth;

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
      if (candidates.minimum > 0) frozenZones.push({ left: axisLeft, right: toX(candidates.minimum - 1) });
      if (candidates.maximum < maximum) frozenZones.push({ left: toX(candidates.maximum + 1), right: axisRight });

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
        const eliminatedLeft = toX(lastEliminated.minimum);
        const eliminatedRight = toX(lastEliminated.maximum);
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

      const tickCount = 10;
      context.textAlign = "center";
      context.textBaseline = "top";
      context.font = `800 ${width < 540 ? 9 : 11}px ui-rounded, system-ui`;
      for (let index = 0; index <= tickCount; index += 1) {
        const value = Math.round((maximum * index) / tickCount);
        const x = toX(value);
        context.strokeStyle = "rgba(225, 225, 245, .32)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, axisY + 22);
        context.lineTo(x, axisY + (index % 5 === 0 ? 36 : 30));
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
      }

      if (progress < 1 && !reducedMotion) animationFrame = requestAnimationFrame(draw);
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
  }, [candidates, lastEliminated, maximum, pulseKey, revealedSecret]);

  return (
    <canvas
      ref={canvasRef}
      className="find-number-canvas"
      role="img"
      aria-label={`完整数轴从 0 到 ${maximum}，神秘数字当前位于 ${candidates.minimum} 到 ${candidates.maximum} 之间，还剩 ${rangeSize(candidates)} 个候选数字`}
    />
  );
}
