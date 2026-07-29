import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react";
import type { ChemicalReaction, ReactionSpecies } from "./logic";

export type ConservationCanvasHandle = {
  play: () => void;
  reset: () => void;
};

type AnimationState = {
  startedAt: number;
  notified: boolean;
};

type Orb = {
  formula: string;
  count: number;
  color: string;
  offsetX: number;
  offsetY: number;
  seed: number;
};

const COLORS = ["#59e7ff", "#8d73ff", "#ff67c7", "#4ce0a3", "#ffd166"];

function easeInOut(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped < 0.5
    ? 2 * clamped * clamped
    : 1 - ((-2 * clamped + 2) ** 2) / 2;
}

function drawGlow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`);
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function speciesOrbs(species: readonly ReactionSpecies[], side: "left" | "right"): Orb[] {
  const result: Orb[] = [];
  species.forEach((item, speciesIndex) => {
    const visibleCount = Math.min(6, item.coefficient);
    for (let index = 0; index < visibleCount; index += 1) {
      const column = index % 3;
      const row = Math.floor(index / 3);
      result.push({
        formula: item.formula,
        count: item.coefficient > visibleCount && index === visibleCount - 1
          ? item.coefficient - visibleCount + 1
          : 1,
        color: COLORS[(speciesIndex + (side === "right" ? 2 : 0)) % COLORS.length]!,
        offsetX: (column - 1) * 72 + speciesIndex * 18,
        offsetY: (row - 0.5) * 82 + speciesIndex * 46,
        seed: speciesIndex * 17 + index * 3.7 + (side === "right" ? 41 : 0),
      });
    }
  });
  return result;
}

function drawOrb(
  context: CanvasRenderingContext2D,
  orb: Orb,
  x: number,
  y: number,
  alpha: number,
  scale: number,
) {
  const radius = 25 * scale;
  context.save();
  context.globalAlpha = alpha;
  drawGlow(context, x, y, radius * 2.6, orb.color, 0.28);
  const gradient = context.createRadialGradient(
    x - radius * 0.35,
    y - radius * 0.42,
    radius * 0.08,
    x,
    y,
    radius,
  );
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.18, orb.color);
  gradient.addColorStop(1, "#171536");
  context.fillStyle = gradient;
  context.strokeStyle = "rgba(255,255,255,.62)";
  context.lineWidth = 1.3;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = `900 ${Math.max(11, 14 * scale)}px ui-rounded, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "#090a28";
  context.shadowBlur = 5;
  context.fillText(orb.formula, x, y);
  if (orb.count > 1) {
    context.shadowBlur = 0;
    context.fillStyle = "#ffd166";
    context.font = "900 11px ui-rounded, sans-serif";
    context.fillText(`×${orb.count}`, x + radius * 0.72, y - radius * 0.72);
  }
  context.restore();
}

function ConservationCanvasInner(
  {
    reaction,
    onComplete,
  }: {
    reaction: ChemicalReaction;
    onComplete: () => void;
  },
  ref: Ref<ConservationCanvasHandle>,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<AnimationState | null>(null);
  const reactionRef = useRef(reaction);
  const completeRef = useRef(onComplete);
  const sizeRef = useRef({ width: 900, height: 340, dpr: 1 });
  const reducedMotionRef = useRef(false);
  reactionRef.current = reaction;
  completeRef.current = onComplete;

  useImperativeHandle(ref, () => ({
    play() {
      animationRef.current = { startedAt: performance.now(), notified: false };
    },
    reset() {
      animationRef.current = null;
    },
  }), []);

  useEffect(() => {
    animationRef.current = null;
  }, [reaction.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => {
      reducedMotionRef.current = motionQuery.matches;
    };
    updateMotion();
    motionQuery.addEventListener("change", updateMotion);

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = {
        width: Math.max(360, bounds.width),
        height: Math.max(260, bounds.height),
        dpr,
      };
      canvas.width = Math.floor(sizeRef.current.width * dpr);
      canvas.height = Math.floor(sizeRef.current.height * dpr);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let frame = 0;
    const render = (now: number) => {
      const { width, height, dpr } = sizeRef.current;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#080a31");
      gradient.addColorStop(0.5, "#111046");
      gradient.addColorStop(1, "#09092e");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      drawGlow(context, width * 0.23, height * 0.48, width * 0.27, "#3978dd", 0.1);
      drawGlow(context, width * 0.77, height * 0.5, width * 0.25, "#d747a8", 0.08);
      drawGlow(context, width * 0.5, height * 0.5, width * 0.16, "#8d73ff", 0.13);

      context.fillStyle = "rgba(205,214,255,.28)";
      for (let index = 0; index < 46; index += 1) {
        const x = (index * 127.4 + now * 0.005 * (index % 3)) % width;
        const y = (index * 71.8 + Math.sin(now * 0.0008 + index) * 8 + height) % height;
        context.beginPath();
        context.arc(x, y, index % 9 === 0 ? 1.4 : 0.75, 0, Math.PI * 2);
        context.fill();
      }

      const active = animationRef.current;
      const duration = reducedMotionRef.current ? 620 : 2700;
      const rawProgress = active ? Math.min(1, (now - active.startedAt) / duration) : 0;
      const leftOrbs = speciesOrbs(reactionRef.current.reactants, "left");
      const rightOrbs = speciesOrbs(reactionRef.current.products, "right");
      const centerX = width * 0.5;
      const centerY = height * 0.48;

      context.save();
      context.strokeStyle = "rgba(134,150,255,.2)";
      context.lineWidth = 2;
      context.setLineDash([7, 12]);
      context.beginPath();
      context.moveTo(width * 0.08, height - 37);
      context.lineTo(width * 0.92, height - 37);
      context.stroke();
      context.restore();

      const leftProgress = active ? easeInOut(Math.min(1, rawProgress / 0.38)) : 0;
      const productProgress = active
        ? easeInOut(Math.max(0, Math.min(1, (rawProgress - 0.47) / 0.4)))
        : 1;
      const reactantAlpha = active ? Math.max(0, 1 - Math.max(0, rawProgress - 0.31) / 0.2) : 1;
      const productAlpha = active ? Math.max(0, Math.min(1, (rawProgress - 0.43) / 0.18)) : 0.22;

      leftOrbs.forEach((orb, index) => {
        const originX = width * 0.19 + orb.offsetX * 0.58;
        const originY = centerY + orb.offsetY * 0.7;
        const wobble = reducedMotionRef.current ? 0 : Math.sin(now * 0.002 + orb.seed) * 6;
        const x = originX + (centerX - originX) * leftProgress;
        const y = originY + (centerY - originY) * leftProgress + wobble * (1 - leftProgress);
        drawOrb(context, orb, x, y, reactantAlpha, 1 - leftProgress * 0.24);
      });

      rightOrbs.forEach((orb) => {
        const targetX = width * 0.81 + orb.offsetX * 0.58;
        const targetY = centerY + orb.offsetY * 0.7;
        const wobble = reducedMotionRef.current ? 0 : Math.cos(now * 0.0018 + orb.seed) * 5;
        const x = centerX + (targetX - centerX) * productProgress;
        const y = centerY + (targetY - centerY) * productProgress + wobble * productProgress;
        drawOrb(context, orb, x, y, productAlpha, 0.76 + productProgress * 0.24);
      });

      const ringPulse = 1 + Math.sin(now * 0.004) * 0.05;
      context.save();
      context.translate(centerX, centerY);
      context.rotate(reducedMotionRef.current ? 0 : now * 0.0002);
      context.strokeStyle = active ? "rgba(89,231,255,.62)" : "rgba(141,115,255,.34)";
      context.lineWidth = active ? 3 : 2;
      context.setLineDash([11, 9]);
      context.beginPath();
      context.ellipse(0, 0, 58 * ringPulse, 86 * ringPulse, 0.45, 0, Math.PI * 2);
      context.stroke();
      context.rotate(-0.9);
      context.strokeStyle = active ? "rgba(255,103,199,.52)" : "rgba(89,231,255,.22)";
      context.beginPath();
      context.ellipse(0, 0, 48 * ringPulse, 78 * ringPulse, -0.35, 0, Math.PI * 2);
      context.stroke();
      context.restore();

      if (active && rawProgress > 0.3 && rawProgress < 0.62) {
        const flash = Math.sin(((rawProgress - 0.3) / 0.32) * Math.PI);
        drawGlow(context, centerX, centerY, 150, "#ffffff", flash * 0.32);
        context.strokeStyle = `rgba(255,255,255,${flash * 0.72})`;
        context.lineWidth = 2;
        for (let ray = 0; ray < 12; ray += 1) {
          const angle = ray * Math.PI / 6 + now * 0.0005;
          context.beginPath();
          context.moveTo(
            centerX + Math.cos(angle) * 58,
            centerY + Math.sin(angle) * 58,
          );
          context.lineTo(
            centerX + Math.cos(angle) * (80 + flash * 38),
            centerY + Math.sin(angle) * (80 + flash * 38),
          );
          context.stroke();
        }
      }

      const locked = active && rawProgress >= 0.86;
      context.fillStyle = locked ? "#4ce0a3" : "#b8b7d7";
      context.font = "900 14px ui-rounded, sans-serif";
      context.textAlign = "center";
      context.fillText(
        locked ? "✓ 每一种原子都守恒" : active ? "原子正在重新排列" : "等待配平，原子一个也不会消失",
        centerX,
        height - 16,
      );

      if (active && rawProgress >= 1 && !active.notified) {
        active.notified = true;
        completeRef.current();
      }

      frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      motionQuery.removeEventListener("change", updateMotion);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="conservation-canvas"
      aria-label="物质守恒动画：配平后，反应物进入能量核心并重新排列为生成物"
    >
      当前浏览器不支持实时物质守恒动画。
    </canvas>
  );
}

export const ConservationCanvas = forwardRef(ConservationCanvasInner);
