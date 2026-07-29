import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react";
import { ELEMENTS } from "../periodic-table/elements.generated";
import type { ReactionCompound } from "./logic";

type ParticleState = "free" | "assembling" | "bound";

type AtomParticle = {
  id: number;
  symbol: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  targetRadius: number;
  state: ParticleState;
  moleculeId?: number;
  localX: number;
  localY: number;
};

type Molecule = {
  id: number;
  compound: ReactionCompound;
  particleIds: number[];
  centerX: number;
  centerY: number;
  vx: number;
  vy: number;
  radius: number;
  startedAt: number;
  stableAt?: number;
  notified: boolean;
};

type Ripple = {
  x: number;
  y: number;
  startedAt: number;
  color: string;
  strength: number;
};

export type FurnaceCanvasHandle = {
  addAtoms: (symbol: string, count: number) => void;
  assemble: (compound: ReactionCompound) => boolean;
  reset: () => void;
};

const CATEGORY_COLORS: Readonly<Record<string, string>> = {
  "alkali-metal": "#ff749d",
  "alkaline-earth": "#ffb266",
  "transition-metal": "#7a9dff",
  "post-transition-metal": "#64d6d0",
  metalloid: "#73e29a",
  nonmetal: "#54e6ff",
  halogen: "#d57cff",
  "noble-gas": "#ff75d8",
  lanthanide: "#f3d463",
  actinide: "#ef8cf4",
};

const ELEMENT_COLOR = new Map(
  ELEMENTS.map((element) => [
    element.symbol,
    CATEGORY_COLORS[element.category] ?? "#8da1ff",
  ]),
);

function layoutAtoms(count: number) {
  if (count === 1) return [{ x: 0, y: 0 }];
  const points: Array<{ x: number; y: number }> = [];
  const maxRadius = count > 40 ? 92 : count > 18 ? 78 : count > 8 ? 58 : 38;
  for (let index = 0; index < count; index += 1) {
    if (count <= 8 && index === 0) {
      points.push({ x: 0, y: 0 });
      continue;
    }
    const adjustedIndex = count <= 8 ? index - 1 : index;
    const adjustedCount = count <= 8 ? count - 1 : count;
    const angle = adjustedIndex * 2.399963;
    const radius = count <= 8
      ? maxRadius
      : maxRadius * Math.sqrt((adjustedIndex + 0.6) / adjustedCount);
    points.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.82,
    });
  }
  return points;
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

function drawAtom(
  context: CanvasRenderingContext2D,
  particle: AtomParticle,
  x: number,
  y: number,
  glow = 0.4,
) {
  drawGlow(context, x, y, particle.radius * 2.8, particle.color, glow);
  const gradient = context.createRadialGradient(
    x - particle.radius * 0.34,
    y - particle.radius * 0.4,
    particle.radius * 0.08,
    x,
    y,
    particle.radius,
  );
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.18, particle.color);
  gradient.addColorStop(1, "#151742");
  context.fillStyle = gradient;
  context.strokeStyle = "rgba(255,255,255,.64)";
  context.lineWidth = 1.2;
  context.beginPath();
  context.arc(x, y, particle.radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = `900 ${Math.max(9, particle.radius * 0.8)}px ui-rounded, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "#090a28";
  context.shadowBlur = 4;
  context.fillText(particle.symbol, x, y + 0.5);
  context.shadowBlur = 0;
}

function FurnaceCanvasInner(
  {
    onAssemblyComplete,
  }: {
    onAssemblyComplete: (compound: ReactionCompound) => void;
  },
  ref: Ref<FurnaceCanvasHandle>,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<AtomParticle[]>([]);
  const moleculesRef = useRef<Molecule[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const nextParticleIdRef = useRef(1);
  const nextMoleculeIdRef = useRef(1);
  const sizeRef = useRef({ width: 900, height: 650, dpr: 1 });
  const reducedMotionRef = useRef(false);
  const onCompleteRef = useRef(onAssemblyComplete);
  onCompleteRef.current = onAssemblyComplete;

  useImperativeHandle(ref, () => ({
    addAtoms(symbol, count) {
      const { width, height } = sizeRef.current;
      const color = ELEMENT_COLOR.get(symbol) ?? "#8da1ff";
      const now = performance.now();
      for (let index = 0; index < count; index += 1) {
        const lane = (index + now * 0.01) % Math.max(1, count);
        particlesRef.current.push({
          id: nextParticleIdRef.current,
          symbol,
          color,
          x: width - 32 - Math.random() * 42,
          y: 80 + (lane / Math.max(1, count)) * Math.max(80, height - 160) + (Math.random() - 0.5) * 30,
          vx: -1.2 - Math.random() * 1.8,
          vy: (Math.random() - 0.5) * 2.2,
          radius: 15,
          targetRadius: 15,
          state: "free",
          localX: 0,
          localY: 0,
        });
        nextParticleIdRef.current += 1;
      }
      ripplesRef.current.push({
        x: width - 42,
        y: height * 0.5,
        startedAt: now,
        color,
        strength: Math.min(1.4, 0.5 + count * 0.08),
      });
    },
    assemble(compound) {
      const selected: AtomParticle[] = [];
      for (const [symbol, requiredCount] of Object.entries(compound.atomCounts)) {
        const available = particlesRef.current
          .filter((particle) => particle.state === "free" && particle.symbol === symbol)
          .slice(0, requiredCount);
        if (available.length !== requiredCount) return false;
        selected.push(...available);
      }

      const { width, height } = sizeRef.current;
      const moleculeId = nextMoleculeIdRef.current;
      nextMoleculeIdRef.current += 1;
      const points = layoutAtoms(selected.length);
      const radius = compound.totalAtoms > 40 ? 110 : compound.totalAtoms > 18 ? 94 : compound.totalAtoms > 8 ? 75 : 58;
      const centerX = radius + 48 + Math.random() * Math.max(40, width - radius * 2 - 96);
      const centerY = radius + 60 + Math.random() * Math.max(40, height - radius * 2 - 130);
      selected.forEach((particle, index) => {
        particle.state = "assembling";
        particle.moleculeId = moleculeId;
        particle.localX = points[index]?.x ?? 0;
        particle.localY = points[index]?.y ?? 0;
        particle.targetRadius = compound.totalAtoms > 40 ? 7 : compound.totalAtoms > 18 ? 9 : compound.totalAtoms > 8 ? 12 : 16;
      });
      moleculesRef.current.push({
        id: moleculeId,
        compound,
        particleIds: selected.map((particle) => particle.id),
        centerX,
        centerY,
        vx: (Math.random() - 0.5) * 0.34,
        vy: (Math.random() - 0.5) * 0.28,
        radius,
        startedAt: performance.now(),
        notified: false,
      });
      ripplesRef.current.push({
        x: centerX,
        y: centerY,
        startedAt: performance.now(),
        color: "#b89cff",
        strength: 1.2,
      });
      return true;
    },
    reset() {
      particlesRef.current = [];
      moleculesRef.current = [];
      ripplesRef.current = [];
      nextParticleIdRef.current = 1;
      nextMoleculeIdRef.current = 1;
    },
  }), []);

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
        width: Math.max(320, bounds.width),
        height: Math.max(420, bounds.height),
        dpr,
      };
      canvas.width = Math.floor(sizeRef.current.width * dpr);
      canvas.height = Math.floor(sizeRef.current.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    let frame = 0;
    let previousTime = performance.now();
    const render = (now: number) => {
      const { width, height, dpr } = sizeRef.current;
      const delta = Math.min(2, Math.max(0.35, (now - previousTime) / 16.67));
      previousTime = now;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const backdrop = context.createLinearGradient(0, 0, width, height);
      backdrop.addColorStop(0, "#090a35");
      backdrop.addColorStop(0.48, "#101044");
      backdrop.addColorStop(1, "#07082b");
      context.fillStyle = backdrop;
      context.fillRect(0, 0, width, height);

      const drift = now * 0.00016;
      drawGlow(context, width * (0.24 + Math.sin(drift) * 0.05), height * 0.36, width * 0.34, "#543ed2", 0.14);
      drawGlow(context, width * 0.72, height * (0.54 + Math.cos(drift * 1.4) * 0.05), width * 0.28, "#10bed5", 0.1);
      drawGlow(context, width * 0.5, height * 0.82, width * 0.22, "#e747a8", 0.07);

      context.fillStyle = "rgba(193,205,255,.24)";
      for (let index = 0; index < 58; index += 1) {
        const x = (index * 137.31 + now * 0.006 * (index % 3)) % width;
        const y = (index * 83.17 + Math.sin(now * 0.0006 + index) * 12 + height) % height;
        context.beginPath();
        context.arc(x, y, index % 7 === 0 ? 1.4 : 0.8, 0, Math.PI * 2);
        context.fill();
      }

      const particleById = new Map(particlesRef.current.map((particle) => [particle.id, particle]));
      const moleculeById = new Map(moleculesRef.current.map((molecule) => [molecule.id, molecule]));
      for (const molecule of moleculesRef.current) {
        const elapsed = now - molecule.startedAt;
        const assemblyDuration = reducedMotionRef.current ? 360 : 2050;
        if (!molecule.stableAt && elapsed >= assemblyDuration) {
          molecule.stableAt = now;
          for (const particleId of molecule.particleIds) {
            const particle = particleById.get(particleId);
            if (particle) particle.state = "bound";
          }
          if (!molecule.notified) {
            molecule.notified = true;
            onCompleteRef.current(molecule.compound);
          }
        }
        if (molecule.stableAt && !reducedMotionRef.current) {
          molecule.centerX += molecule.vx * delta;
          molecule.centerY += molecule.vy * delta;
          if (molecule.centerX < molecule.radius + 18 || molecule.centerX > width - molecule.radius - 18) molecule.vx *= -1;
          if (molecule.centerY < molecule.radius + 30 || molecule.centerY > height - molecule.radius - 58) molecule.vy *= -1;
        }
      }

      for (const particle of particlesRef.current) {
        if (particle.state === "free") {
          if (!reducedMotionRef.current) {
            particle.vx += (Math.random() - 0.5) * 0.16 * delta;
            particle.vy += (Math.random() - 0.5) * 0.16 * delta;
            particle.vx *= 0.986;
            particle.vy *= 0.986;
            const speed = Math.hypot(particle.vx, particle.vy);
            if (speed > 2.7) {
              particle.vx = (particle.vx / speed) * 2.7;
              particle.vy = (particle.vy / speed) * 2.7;
            }
            particle.x += particle.vx * delta;
            particle.y += particle.vy * delta;
          }
          if (particle.x < particle.radius + 18 || particle.x > width - particle.radius - 18) particle.vx *= -1;
          if (particle.y < particle.radius + 20 || particle.y > height - particle.radius - 40) particle.vy *= -1;
          particle.x = Math.max(particle.radius + 18, Math.min(width - particle.radius - 18, particle.x));
          particle.y = Math.max(particle.radius + 20, Math.min(height - particle.radius - 40, particle.y));
          drawAtom(context, particle, particle.x, particle.y);
          continue;
        }

        const molecule = moleculeById.get(particle.moleculeId ?? -1);
        if (!molecule) continue;
        const elapsed = now - molecule.startedAt;
        const progress = reducedMotionRef.current
          ? Math.min(1, elapsed / 300)
          : Math.min(1, elapsed / 1450);
        const shakeStrength = !reducedMotionRef.current && elapsed > 800 && elapsed < 1620
          ? Math.min(5, (elapsed - 800) / 130)
          : 0;
        const targetX = molecule.centerX + particle.localX;
        const targetY = molecule.centerY + particle.localY;
        if (particle.state === "assembling") {
          particle.x += (targetX - particle.x) * (0.035 + progress * 0.09) * delta;
          particle.y += (targetY - particle.y) * (0.035 + progress * 0.09) * delta;
        } else {
          particle.x = targetX;
          particle.y = targetY;
        }
        particle.radius += (particle.targetRadius - particle.radius) * 0.08 * delta;
        const renderX = particle.x + Math.sin(now * 0.055 + particle.id) * shakeStrength;
        const renderY = particle.y + Math.cos(now * 0.061 + particle.id) * shakeStrength;
        drawAtom(context, particle, renderX, renderY, particle.state === "assembling" ? 0.72 : 0.34);
      }

      for (const molecule of moleculesRef.current) {
        const moleculeParticles = molecule.particleIds
          .map((id) => particleById.get(id))
          .filter((particle): particle is AtomParticle => Boolean(particle));
        const elapsed = now - molecule.startedAt;
        const bondAlpha = Math.max(0, Math.min(0.75, (elapsed - 500) / 700));
        if (bondAlpha > 0 && moleculeParticles.length > 1) {
          context.save();
          context.globalCompositeOperation = "lighter";
          context.strokeStyle = `rgba(119,235,255,${bondAlpha})`;
          context.lineWidth = elapsed > 1250 && elapsed < 1750 ? 4.5 : 2;
          context.shadowColor = elapsed > 1250 && elapsed < 1750 ? "#ffffff" : "#5ae9ff";
          context.shadowBlur = elapsed > 1250 && elapsed < 1750 ? 22 : 10;
          const anchor = moleculeParticles[0]!;
          for (let index = 1; index < moleculeParticles.length; index += 1) {
            const particle = moleculeParticles[index]!;
            const previous = moleculeParticles[Math.max(0, index - 1)]!;
            const target = index < 9 ? anchor : previous;
            context.beginPath();
            context.moveTo(target.x, target.y);
            context.lineTo(particle.x, particle.y);
            context.stroke();
          }
          context.restore();
        }
        if (elapsed > 1220 && elapsed < 1780 && !reducedMotionRef.current) {
          const flash = Math.sin(((elapsed - 1220) / 560) * Math.PI);
          drawGlow(context, molecule.centerX, molecule.centerY, molecule.radius * 1.5, "#ffffff", flash * 0.34);
        }
        if (molecule.stableAt) {
          const labelY = molecule.centerY + molecule.radius + 13;
          context.font = "900 18px ui-rounded, sans-serif";
          const formulaWidth = context.measureText(molecule.compound.formula).width;
          context.fillStyle = "rgba(8,9,41,.84)";
          context.beginPath();
          context.roundRect(molecule.centerX - formulaWidth / 2 - 12, labelY - 15, formulaWidth + 24, 29, 12);
          context.fill();
          context.strokeStyle = "rgba(133,224,255,.42)";
          context.stroke();
          context.fillStyle = "#f8f7ff";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(molecule.compound.formula, molecule.centerX, labelY);
        }
      }

      ripplesRef.current = ripplesRef.current.filter((ripple) => now - ripple.startedAt < 1300);
      for (const ripple of ripplesRef.current) {
        const progress = (now - ripple.startedAt) / 1300;
        context.strokeStyle = `${ripple.color}${Math.round((1 - progress) * 100).toString(16).padStart(2, "0")}`;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(ripple.x, ripple.y, 20 + progress * 120 * ripple.strength, 0, Math.PI * 2);
        context.stroke();
      }

      const edge = context.createLinearGradient(0, 0, width, height);
      edge.addColorStop(0, "rgba(90,233,255,.5)");
      edge.addColorStop(0.5, "rgba(158,124,255,.28)");
      edge.addColorStop(1, "rgba(255,112,200,.45)");
      context.strokeStyle = edge;
      context.lineWidth = 2;
      context.strokeRect(9, 9, width - 18, height - 18);
      frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      motionQuery.removeEventListener("change", updateMotion);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="furnace-canvas"
      aria-label="实时反应炉：投放的原子会在这里运动，并在配方齐全后聚合成稳定结构"
    >
      当前浏览器不支持实时反应炉画面。
    </canvas>
  );
}

export const FurnaceCanvas = forwardRef(FurnaceCanvasInner);
