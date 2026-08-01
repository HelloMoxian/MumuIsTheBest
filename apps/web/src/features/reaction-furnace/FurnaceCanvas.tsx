import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react";
import { getReactionElementTheme } from "./element-colors";
import type { ReactionCompound } from "./logic";
import {
  advanceStableStructureMotion,
  advanceFreeAtomMotion,
  createInjectedAtomMotion,
  getStableStructureSlot,
} from "./particle-motion";

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
  spawnedAt: number;
  driftTargetX: number;
  driftTargetY: number;
  diffusionSeed: number;
  state: ParticleState;
  moleculeId?: number;
  localX: number;
  localY: number;
};

type Molecule = {
  id: number;
  compound: ReactionCompound;
  particleIds: number[];
  slotIndex: number;
  centerX: number;
  centerY: number;
  vx: number;
  vy: number;
  diffusionSeed: number;
  radius: number;
  startedAt: number;
  stableAt?: number;
  notified: boolean;
  sprite?: MoleculeSprite;
};

export type FurnaceCanvasMode = "dock" | "eject";

type MoleculeSprite = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  centerY: number;
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
  assemble: (compound: ReactionCompound, slotIndex: number) => boolean;
  reset: () => void;
};

function layoutMolecularStructure(
  compound: ReactionCompound,
  maximumWidth: number,
  maximumHeight: number,
) {
  const preferredAtomRadius = compound.totalAtoms > 50
    ? 6.2
    : compound.totalAtoms > 30
      ? 8.5
      : compound.totalAtoms > 20
        ? 10
        : compound.totalAtoms > 10
          ? 12.5
          : 16;
  const atomRadius = Math.min(
    preferredAtomRadius,
    Math.max(3.2, Math.min(maximumWidth, maximumHeight) * 0.09),
  );
  const minimumX = Math.min(...compound.structure.atoms.map((atom) => atom.x));
  const maximumX = Math.max(...compound.structure.atoms.map((atom) => atom.x));
  const minimumY = Math.min(...compound.structure.atoms.map((atom) => atom.y));
  const maximumY = Math.max(...compound.structure.atoms.map((atom) => atom.y));
  const sourceWidth = Math.max(0.1, maximumX - minimumX);
  const sourceHeight = Math.max(0.1, maximumY - minimumY);
  const sourceCenterX = (minimumX + maximumX) / 2;
  const sourceCenterY = (minimumY + maximumY) / 2;
  const scale = Math.min(
    atomRadius * 2.72,
    Math.max(0.1, (maximumWidth - atomRadius * 3) / sourceWidth),
    Math.max(0.1, (maximumHeight - atomRadius * 3) / sourceHeight),
  );
  const points = compound.structure.atoms.map((atom) => ({
    x: (atom.x - sourceCenterX) * scale,
    y: (atom.y - sourceCenterY) * scale,
  }));
  const coordinateExtent = Math.max(
    0,
    ...points.map((point) => Math.max(Math.abs(point.x), Math.abs(point.y))),
  );
  return {
    atomRadius,
    points,
    radius: Math.max(atomRadius * 1.5, coordinateExtent + atomRadius + 5),
  };
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
  particle: Pick<AtomParticle, "color" | "radius" | "symbol">,
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

function drawMolecularBond(
  context: CanvasRenderingContext2D,
  first: { x: number; y: number; radius: number },
  second: { x: number; y: number; radius: number },
  order: 1 | 2 | 3,
  alpha: number,
  energetic: boolean,
) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;
  const unitX = dx / distance;
  const unitY = dy / distance;
  const perpendicularX = -unitY;
  const perpendicularY = unitX;
  const startTrim = Math.min(first.radius * 0.72, distance * 0.24);
  const endTrim = Math.min(second.radius * 0.72, distance * 0.24);
  const startX = first.x + unitX * startTrim;
  const startY = first.y + unitY * startTrim;
  const endX = second.x - unitX * endTrim;
  const endY = second.y - unitY * endTrim;
  const spacing = Math.min(5, Math.max(2.4, Math.min(first.radius, second.radius) * 0.34));
  const offsets = order === 1
    ? [0]
    : order === 2
      ? [-spacing * 0.52, spacing * 0.52]
      : [-spacing, 0, spacing];

  context.save();
  context.globalCompositeOperation = "lighter";
  context.strokeStyle = `rgba(119,235,255,${alpha})`;
  context.lineWidth = energetic ? (order === 1 ? 3.4 : 2.7) : (order === 1 ? 2.6 : 2);
  context.lineCap = "round";
  context.shadowColor = energetic ? "#ffffff" : "#5ae9ff";
  context.shadowBlur = energetic ? 22 : 10;
  for (const offset of offsets) {
    context.beginPath();
    context.moveTo(
      startX + perpendicularX * offset,
      startY + perpendicularY * offset,
    );
    context.lineTo(
      endX + perpendicularX * offset,
      endY + perpendicularY * offset,
    );
    context.stroke();
  }
  context.restore();
}

function createMoleculeSprite(
  molecule: Molecule,
  particleById: ReadonlyMap<number, AtomParticle>,
  dpr: number,
) {
  const particles = molecule.particleIds
    .map((particleId) => particleById.get(particleId))
    .filter((particle): particle is AtomParticle => Boolean(particle));
  if (particles.length !== molecule.particleIds.length) return undefined;

  const padding = Math.max(22, particles[0]!.targetRadius * 2.4);
  const formulaHeight = 38;
  const width = Math.ceil(molecule.radius * 2 + padding * 2);
  const height = Math.ceil(molecule.radius * 2 + padding * 2 + formulaHeight);
  const centerX = width / 2;
  const centerY = padding + molecule.radius;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const renderedParticles = particles.map((particle) => ({
    particle: {
      color: particle.color,
      radius: particle.targetRadius,
      symbol: particle.symbol,
    },
    x: centerX + particle.localX,
    y: centerY + particle.localY,
    radius: particle.targetRadius,
  }));
  for (const bond of molecule.compound.structure.bonds) {
    const first = renderedParticles[bond.from];
    const second = renderedParticles[bond.to];
    if (first && second) {
      drawMolecularBond(context, first, second, bond.order, 0.75, false);
    }
  }
  for (const rendered of renderedParticles) {
    drawAtom(context, rendered.particle, rendered.x, rendered.y, 0.3);
  }

  const labelY = centerY + molecule.radius + 13;
  context.font = "900 16px ui-rounded, sans-serif";
  const formulaWidth = context.measureText(molecule.compound.formula).width;
  context.fillStyle = "rgba(8,9,41,.88)";
  context.beginPath();
  context.roundRect(
    centerX - formulaWidth / 2 - 11,
    labelY - 14,
    formulaWidth + 22,
    27,
    11,
  );
  context.fill();
  context.strokeStyle = "rgba(133,224,255,.42)";
  context.stroke();
  context.fillStyle = "#f8f7ff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(molecule.compound.formula, centerX, labelY);
  return { canvas, width, height, centerY };
}

function drawStructureSlots(
  context: CanvasRenderingContext2D,
  count: number,
  width: number,
  height: number,
  occupiedSlots: ReadonlySet<number>,
) {
  for (let index = 0; index < count; index += 1) {
    const slot = getStableStructureSlot(index, count, { width, height });
    const left = slot.centerX - slot.width / 2;
    const top = slot.centerY - slot.height * 0.46;
    const occupied = occupiedSlots.has(index);
    context.fillStyle = occupied
      ? "rgba(88,242,186,.045)"
      : "rgba(90,233,255,.018)";
    context.strokeStyle = occupied
      ? "rgba(88,242,186,.2)"
      : "rgba(151,148,232,.09)";
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(left, top, slot.width, slot.height, 16);
    context.fill();
    context.stroke();
    context.fillStyle = occupied
      ? "rgba(88,242,186,.56)"
      : "rgba(193,205,255,.18)";
    context.font = "800 10px ui-rounded, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillText(`停泊位 ${String(index + 1).padStart(2, "0")}`, left + 10, top + 8);
  }
}

function FurnaceCanvasInner(
  {
    onAssemblyComplete,
    targetCount,
    mode = "dock",
  }: {
    onAssemblyComplete: (compound: ReactionCompound) => void;
    targetCount: number;
    mode?: FurnaceCanvasMode;
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
  const targetCountRef = useRef(targetCount);
  const modeRef = useRef(mode);
  const onCompleteRef = useRef(onAssemblyComplete);
  onCompleteRef.current = onAssemblyComplete;
  targetCountRef.current = targetCount;
  modeRef.current = mode;

  useImperativeHandle(ref, () => ({
    addAtoms(symbol, count) {
      const { width, height } = sizeRef.current;
      const color = getReactionElementTheme(symbol).color;
      const now = performance.now();
      for (let index = 0; index < count; index += 1) {
        const id = nextParticleIdRef.current;
        const motion = createInjectedAtomMotion({
          particleId: id,
          index,
          count,
          width,
          height,
          now,
          reducedMotion: reducedMotionRef.current,
        });
        particlesRef.current.push({
          id,
          symbol,
          color,
          ...motion,
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
    assemble(compound, slotIndex) {
      const availableBySymbol = new Map<string, AtomParticle[]>();
      for (const particle of particlesRef.current) {
        if (particle.state !== "free") continue;
        availableBySymbol.set(
          particle.symbol,
          [...(availableBySymbol.get(particle.symbol) ?? []), particle],
        );
      }
      const selected = compound.structure.atoms.map((atom) => (
        availableBySymbol.get(atom.symbol)?.shift()
      ));
      if (selected.some((particle) => !particle)) return false;
      const selectedParticles = selected as AtomParticle[];

      const { width, height } = sizeRef.current;
      const moleculeId = nextMoleculeIdRef.current;
      nextMoleculeIdRef.current += 1;
      const slot = getStableStructureSlot(
        slotIndex,
        targetCountRef.current,
        { width, height },
      );
      const layout = layoutMolecularStructure(
        compound,
        slot.structureWidth,
        slot.structureHeight,
      );
      const radius = layout.radius;
      const centerX = Math.max(
        radius + 30,
        Math.min(width - radius - 30, width * (0.42 + Math.random() * 0.16)),
      );
      const centerY = Math.max(
        radius + 34,
        Math.min(height - radius - 62, height * (0.4 + Math.random() * 0.2)),
      );
      selectedParticles.forEach((particle, index) => {
        particle.state = "assembling";
        particle.moleculeId = moleculeId;
        particle.localX = layout.points[index]?.x ?? 0;
        particle.localY = layout.points[index]?.y ?? 0;
        particle.targetRadius = layout.atomRadius;
      });
      moleculesRef.current.push({
        id: moleculeId,
        compound,
        particleIds: selectedParticles.map((particle) => particle.id),
        slotIndex,
        centerX,
        centerY,
        vx: 0,
        vy: 0,
        diffusionSeed: moleculeId * 1.731 + slotIndex * 0.619,
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
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      sizeRef.current = {
        width: Math.max(320, bounds.width),
        height: Math.max(420, bounds.height),
        dpr,
      };
      canvas.width = Math.floor(sizeRef.current.width * dpr);
      canvas.height = Math.floor(sizeRef.current.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const particleById = new Map(
        particlesRef.current.map((particle) => [particle.id, particle]),
      );
      for (const molecule of moleculesRef.current) {
        const slot = getStableStructureSlot(
          molecule.slotIndex,
          targetCountRef.current,
          sizeRef.current,
        );
        const layout = layoutMolecularStructure(
          molecule.compound,
          slot.structureWidth,
          slot.structureHeight,
        );
        molecule.radius = layout.radius;
        molecule.sprite = undefined;
        molecule.particleIds.forEach((particleId, index) => {
          const particle = particleById.get(particleId);
          if (!particle) return;
          particle.localX = layout.points[index]?.x ?? 0;
          particle.localY = layout.points[index]?.y ?? 0;
          particle.targetRadius = layout.atomRadius;
          if (particle.state === "bound") particle.radius = layout.atomRadius;
        });
      }
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    let frame = 0;
    let previousTime = performance.now();
    const render = (now: number) => {
      frame = window.requestAnimationFrame(render);
      const frameDuration = reducedMotionRef.current ? 66 : 33;
      if (now - previousTime < frameDuration) return;
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
      for (let index = 0; index < 36; index += 1) {
        const x = (index * 137.31 + now * 0.006 * (index % 3)) % width;
        const y = (index * 83.17 + Math.sin(now * 0.0006 + index) * 12 + height) % height;
        context.beginPath();
        context.arc(x, y, index % 7 === 0 ? 1.4 : 0.8, 0, Math.PI * 2);
        context.fill();
      }

      const particleById = new Map(particlesRef.current.map((particle) => [particle.id, particle]));
      const moleculeById = new Map(moleculesRef.current.map((molecule) => [molecule.id, molecule]));
      const occupiedSlots = new Set(
        moleculesRef.current
          .filter((molecule) => Boolean(molecule.stableAt))
          .map((molecule) => molecule.slotIndex),
      );
      if (modeRef.current === "dock") {
        drawStructureSlots(
          context,
          targetCountRef.current,
          width,
          height,
          occupiedSlots,
        );
      }
      const deliveredMoleculeIds = new Set<number>();
      for (const molecule of moleculesRef.current) {
        const elapsed = now - molecule.startedAt;
        const assemblyDuration = reducedMotionRef.current
          ? 360
          : modeRef.current === "eject"
            ? 1350
            : 2050;
        if (!molecule.stableAt && elapsed >= assemblyDuration) {
          molecule.stableAt = now;
          for (const particleId of molecule.particleIds) {
            const particle = particleById.get(particleId);
            if (particle) particle.state = "bound";
          }
          if (modeRef.current === "dock" && !molecule.notified) {
            molecule.notified = true;
            onCompleteRef.current(molecule.compound);
          }
        }
        if (molecule.stableAt) {
          if (modeRef.current === "eject") {
            const deliveryProgress = Math.min(1, (now - molecule.stableAt) / 920);
            molecule.centerX += Math.sin(now * 0.006 + molecule.diffusionSeed) * 0.34 * delta;
            molecule.centerY += Math.max(
              reducedMotionRef.current ? 5 : 2.8,
              (height + molecule.radius - molecule.centerY) * 0.038,
            ) * delta;
            if (deliveryProgress >= 1 && !molecule.notified) {
              molecule.notified = true;
              deliveredMoleculeIds.add(molecule.id);
              onCompleteRef.current(molecule.compound);
            }
          } else {
            const slot = getStableStructureSlot(
              molecule.slotIndex,
              targetCountRef.current,
              { width, height },
            );
            advanceStableStructureMotion(
              molecule,
              slot,
              now,
              delta,
              reducedMotionRef.current,
            );
          }
          molecule.sprite ??= createMoleculeSprite(molecule, particleById, dpr);
        }
      }

      for (const particle of particlesRef.current) {
        if (particle.state === "free") {
          if (!reducedMotionRef.current) {
            advanceFreeAtomMotion(particle, { width, height }, now, delta);
          }
          drawAtom(context, particle, particle.x, particle.y);
          continue;
        }

        const molecule = moleculeById.get(particle.moleculeId ?? -1);
        if (!molecule) continue;
        if (particle.state === "bound") continue;
        const elapsed = now - molecule.startedAt;
        const progress = reducedMotionRef.current
          ? Math.min(1, elapsed / 300)
          : Math.min(1, elapsed / 1450);
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
      }

      for (const molecule of moleculesRef.current) {
        if (molecule.stableAt && molecule.sprite) {
          const deliveryAlpha = modeRef.current === "eject"
            ? Math.max(0.2, 1 - (now - molecule.stableAt) / 1150)
            : 1;
          context.save();
          context.globalAlpha = deliveryAlpha;
          context.drawImage(
            molecule.sprite.canvas,
            molecule.centerX - molecule.sprite.width / 2,
            molecule.centerY - molecule.sprite.centerY,
            molecule.sprite.width,
            molecule.sprite.height,
          );
          context.restore();
          continue;
        }
        const moleculeParticles = molecule.particleIds
          .map((id) => particleById.get(id))
          .filter((particle): particle is AtomParticle => Boolean(particle));
        const elapsed = now - molecule.startedAt;
        const bondAlpha = Math.max(0, Math.min(0.75, (elapsed - 500) / 700));
        const shakeStrength = !reducedMotionRef.current && elapsed > 800 && elapsed < 1620
          ? Math.min(5, (elapsed - 800) / 130)
          : 0;
        const renderedParticles = moleculeParticles.map((particle) => ({
          particle,
          x: particle.x + Math.sin(now * 0.055 + particle.id) * shakeStrength,
          y: particle.y + Math.cos(now * 0.061 + particle.id) * shakeStrength,
          radius: particle.radius,
        }));
        if (bondAlpha > 0 && moleculeParticles.length > 1) {
          const energetic = elapsed > 1250 && elapsed < 1750;
          for (const bond of molecule.compound.structure.bonds) {
            const first = renderedParticles[bond.from];
            const second = renderedParticles[bond.to];
            if (first && second) {
              drawMolecularBond(context, first, second, bond.order, bondAlpha, energetic);
            }
          }
        }
        if (elapsed > 1220 && elapsed < 1780 && !reducedMotionRef.current) {
          const flash = Math.sin(((elapsed - 1220) / 560) * Math.PI);
          drawGlow(context, molecule.centerX, molecule.centerY, molecule.radius * 1.5, "#ffffff", flash * 0.34);
        }
        for (const rendered of renderedParticles) {
          drawAtom(
            context,
            rendered.particle,
            rendered.x,
            rendered.y,
            rendered.particle.state === "assembling" ? 0.72 : 0.34,
          );
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

      if (deliveredMoleculeIds.size > 0) {
        moleculesRef.current = moleculesRef.current.filter(
          (molecule) => !deliveredMoleculeIds.has(molecule.id),
        );
        particlesRef.current = particlesRef.current.filter(
          (particle) => !particle.moleculeId || !deliveredMoleculeIds.has(particle.moleculeId),
        );
      }

      const edge = context.createLinearGradient(0, 0, width, height);
      edge.addColorStop(0, "rgba(90,233,255,.5)");
      edge.addColorStop(0.5, "rgba(158,124,255,.28)");
      edge.addColorStop(1, "rgba(255,112,200,.45)");
      context.strokeStyle = edge;
      context.lineWidth = 2;
      context.strokeRect(9, 9, width - 18, height - 18);
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
      aria-label={mode === "eject"
        ? "化学百宝箱反应区：投放的原子会在这里运动，组成物质后从底部离开"
        : `实时反应炉：投放的原子会在这里运动，并在配方齐全后聚合到 ${targetCount} 个结构停泊位`}
    >
      当前浏览器不支持实时反应炉画面。
    </canvas>
  );
}

export const FurnaceCanvas = forwardRef(FurnaceCanvasInner);
