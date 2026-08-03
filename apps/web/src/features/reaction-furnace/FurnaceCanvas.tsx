import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react";
import { getReactionElementTheme } from "./element-colors";
import { getMolecularDisplayStructure, type AtomCounts, type ReactionCompound } from "./logic";
import {
  advanceStableStructureMotion,
  advanceFreeAtomMotion,
  createInjectedAtomMotion,
  getStableStructureSlot,
  type FreeAtomMotion,
} from "./particle-motion";

type ParticleState = "free" | "forming-ion" | "assembling" | "bound";

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
  ionFormationId?: number;
  sourceIonId?: string;
  localX: number;
  localY: number;
};

type MoleculeSourceIon = {
  ion: CanvasPolyatomicIon;
  startX: number;
  startY: number;
  radius: number;
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
  sourceIons: readonly MoleculeSourceIon[];
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

export type CanvasPolyatomicIon = {
  id: string;
  formula: string;
  name: string;
  charge: number;
  chargeLabel: string;
  atomCounts: AtomCounts;
};

type FloatingPolyatomicIon = FreeAtomMotion & {
  ion: CanvasPolyatomicIon;
};

type PolyatomicIonFormation = {
  id: number;
  ion: CanvasPolyatomicIon;
  particleIds: readonly number[];
  centerX: number;
  centerY: number;
  startedAt: number;
};

export type FurnaceCanvasHandle = {
  addAtoms: (symbol: string, count: number) => void;
  addPolyatomicIon: (ion: CanvasPolyatomicIon) => void;
  formPolyatomicIon: (ion: CanvasPolyatomicIon) => boolean;
  assemble: (compound: ReactionCompound, slotIndex: number, ionIds?: readonly string[]) => boolean;
  restoreStableCompound: (compound: ReactionCompound, slotIndex: number) => void;
  reset: () => void;
};

function layoutMolecularStructure(
  compound: ReactionCompound,
  maximumWidth: number,
  maximumHeight: number,
) {
  const structure = getMolecularDisplayStructure(compound);
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
  const minimumX = Math.min(...structure.atoms.map((atom) => atom.x));
  const maximumX = Math.max(...structure.atoms.map((atom) => atom.x));
  const minimumY = Math.min(...structure.atoms.map((atom) => atom.y));
  const maximumY = Math.max(...structure.atoms.map((atom) => atom.y));
  const sourceWidth = Math.max(0.1, maximumX - minimumX);
  const sourceHeight = Math.max(0.1, maximumY - minimumY);
  const sourceCenterX = (minimumX + maximumX) / 2;
  const sourceCenterY = (minimumY + maximumY) / 2;
  const scale = Math.min(
    atomRadius * 2.72,
    Math.max(0.1, (maximumWidth - atomRadius * 3) / sourceWidth),
    Math.max(0.1, (maximumHeight - atomRadius * 3) / sourceHeight),
  );
  const points = structure.atoms.map((atom) => ({
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

function drawPolyatomicIon(
  context: CanvasRenderingContext2D,
  particle: Pick<FloatingPolyatomicIon, "x" | "y" | "radius" | "ion">,
) {
  const { x, y, radius, ion } = particle;
  drawGlow(context, x, y, radius * 2.25, "#b878ff", 0.34);
  const shell = context.createRadialGradient(
    x - radius * 0.28,
    y - radius * 0.36,
    radius * 0.08,
    x,
    y,
    radius,
  );
  shell.addColorStop(0, "rgba(255,255,255,.96)");
  shell.addColorStop(0.17, "rgba(89,231,255,.88)");
  shell.addColorStop(0.46, "rgba(105,80,220,.9)");
  shell.addColorStop(1, "rgba(21,18,72,.96)");
  context.fillStyle = shell;
  context.strokeStyle = "rgba(255,255,255,.78)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  const memberSymbols = Object.entries(ion.atomCounts)
    .flatMap(([symbol, count]) => Array.from({ length: count }, () => symbol))
    .slice(0, 7);
  const memberRadius = Math.max(3.6, Math.min(5.2, radius * 0.13));
  memberSymbols.forEach((symbol, index) => {
    const angle = -Math.PI + ((index + 0.5) / memberSymbols.length) * Math.PI;
    const orbitRadius = radius * 0.56;
    const theme = getReactionElementTheme(symbol);
    drawAtom(context, {
      color: theme.color,
      radius: memberRadius,
      symbol,
    }, x + Math.cos(angle) * orbitRadius, y + Math.sin(angle) * orbitRadius - radius * 0.08, 0.12);
  });

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.shadowColor = "#090a28";
  context.shadowBlur = 5;
  context.font = `900 ${Math.max(13, radius * 0.43)}px ui-rounded, sans-serif`;
  context.fillText(ion.formula, x, y + radius * 0.05);
  context.fillStyle = "#83efff";
  context.font = `850 ${Math.max(8, radius * 0.22)}px ui-rounded, sans-serif`;
  context.fillText(`电荷 ${ion.chargeLabel}`, x, y + radius * 0.47);
  context.shadowBlur = 0;
}

function drawPolyatomicIonFormationField(
  context: CanvasRenderingContext2D,
  formation: PolyatomicIonFormation,
  now: number,
  reducedMotion: boolean,
) {
  const elapsed = now - formation.startedAt;
  const progress = Math.min(1, elapsed / (reducedMotion ? 320 : 1_350));
  const pulse = reducedMotion ? 0.5 : 0.5 + Math.sin(now * 0.014) * 0.5;
  const radius = 46 + progress * 24;
  context.save();
  context.globalCompositeOperation = "lighter";
  drawGlow(context, formation.centerX, formation.centerY, radius * 2.2, "#b878ff", 0.16 + pulse * 0.12);
  context.strokeStyle = `rgba(133,238,255,${0.28 + pulse * 0.34})`;
  context.lineWidth = 2;
  context.setLineDash([7, 8]);
  context.beginPath();
  context.arc(formation.centerX, formation.centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  context.stroke();
  context.setLineDash([]);
  for (let index = 0; index < 6; index += 1) {
    const angle = now * 0.0018 + index * Math.PI / 3;
    const starRadius = radius + 10 + (index % 2) * 8;
    context.fillStyle = index % 2 ? "#ff8ed4" : "#82efff";
    context.beginPath();
    context.arc(
      formation.centerX + Math.cos(angle) * starRadius,
      formation.centerY + Math.sin(angle) * starRadius,
      1.8 + pulse * 1.5,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.restore();
  context.fillStyle = "rgba(8,9,41,.82)";
  context.beginPath();
  context.roundRect(formation.centerX - 48, formation.centerY + radius + 9, 96, 27, 12);
  context.fill();
  context.fillStyle = "#f8f7ff";
  context.font = "900 15px ui-rounded, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`${formation.ion.formula} 构建中`, formation.centerX, formation.centerY + radius + 22);
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
  for (const bond of getMolecularDisplayStructure(molecule.compound).bonds) {
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
    freeParticleSpeed = 1,
    onPolyatomicIonComplete,
  }: {
    onAssemblyComplete: (compound: ReactionCompound) => void;
    targetCount: number;
    mode?: FurnaceCanvasMode;
    freeParticleSpeed?: number;
    onPolyatomicIonComplete?: (ion: CanvasPolyatomicIon) => void;
  },
  ref: Ref<FurnaceCanvasHandle>,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<AtomParticle[]>([]);
  const floatingIonsRef = useRef<FloatingPolyatomicIon[]>([]);
  const ionFormationsRef = useRef<PolyatomicIonFormation[]>([]);
  const moleculesRef = useRef<Molecule[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const nextParticleIdRef = useRef(1);
  const nextMoleculeIdRef = useRef(1);
  const nextIonFormationIdRef = useRef(1);
  const sizeRef = useRef({ width: 900, height: 650, dpr: 1 });
  const reducedMotionRef = useRef(false);
  const targetCountRef = useRef(targetCount);
  const modeRef = useRef(mode);
  const freeParticleSpeedRef = useRef(freeParticleSpeed);
  const onCompleteRef = useRef(onAssemblyComplete);
  const onIonCompleteRef = useRef(onPolyatomicIonComplete);
  onCompleteRef.current = onAssemblyComplete;
  onIonCompleteRef.current = onPolyatomicIonComplete;
  targetCountRef.current = targetCount;
  modeRef.current = mode;
  freeParticleSpeedRef.current = freeParticleSpeed;

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
    addPolyatomicIon(ion) {
      if (floatingIonsRef.current.some((particle) => particle.ion.id === ion.id)) return;
      const { width, height } = sizeRef.current;
      const particleId = nextParticleIdRef.current;
      nextParticleIdRef.current += 1;
      floatingIonsRef.current.push({
        ion,
        ...createInjectedAtomMotion({
          particleId,
          index: floatingIonsRef.current.length,
          count: floatingIonsRef.current.length + 1,
          width,
          height,
          now: performance.now(),
          radius: 38,
          reducedMotion: reducedMotionRef.current,
        }),
      });
      ripplesRef.current.push({
        x: width - 42,
        y: height * 0.5,
        startedAt: performance.now(),
        color: "#b878ff",
        strength: 1,
      });
    },
    formPolyatomicIon(ion) {
      if (
        floatingIonsRef.current.some((particle) => particle.ion.id === ion.id)
        || ionFormationsRef.current.some((formation) => formation.ion.id === ion.id)
      ) return false;
      const availableBySymbol = new Map<string, AtomParticle[]>();
      for (const particle of particlesRef.current) {
        if (particle.state !== "free") continue;
        availableBySymbol.set(
          particle.symbol,
          [...(availableBySymbol.get(particle.symbol) ?? []), particle],
        );
      }
      const selected: AtomParticle[] = [];
      for (const [symbol, count] of Object.entries(ion.atomCounts)) {
        const available = availableBySymbol.get(symbol) ?? [];
        if (available.length < count) return false;
        selected.push(...available.slice(0, count));
      }
      const { width, height } = sizeRef.current;
      const id = nextIonFormationIdRef.current;
      nextIonFormationIdRef.current += 1;
      const centerX = width * (0.42 + Math.random() * 0.16);
      const centerY = height * (0.38 + Math.random() * 0.18);
      selected.forEach((particle, index) => {
        const angle = -Math.PI / 2 + (index / Math.max(1, selected.length)) * Math.PI * 2;
        particle.state = "forming-ion";
        particle.ionFormationId = id;
        particle.localX = Math.cos(angle) * 25;
        particle.localY = Math.sin(angle) * 20;
        particle.targetRadius = 10;
      });
      ionFormationsRef.current.push({
        id,
        ion,
        particleIds: selected.map((particle) => particle.id),
        centerX,
        centerY,
        startedAt: performance.now(),
      });
      ripplesRef.current.push({
        x: centerX,
        y: centerY,
        startedAt: performance.now(),
        color: "#b878ff",
        strength: 1.45,
      });
      return true;
    },
    assemble(compound, slotIndex, ionIds = []) {
      const structure = getMolecularDisplayStructure(compound);
      const selectedIons = ionIds.map((ionId) => (
        floatingIonsRef.current.find((particle) => particle.ion.id === ionId)
      ));
      if (selectedIons.some((ion) => !ion)) return false;
      const presentIons = selectedIons as FloatingPolyatomicIon[];
      const unassignedAtomIndices = new Map<string, number[]>();
      structure.atoms.forEach((atom, index) => {
        unassignedAtomIndices.set(
          atom.symbol,
          [...(unassignedAtomIndices.get(atom.symbol) ?? []), index],
        );
      });
      const sourceIonByAtomIndex = new Map<number, FloatingPolyatomicIon>();
      for (const floatingIon of presentIons) {
        for (const [symbol, count] of Object.entries(floatingIon.ion.atomCounts)) {
          const availableIndices = unassignedAtomIndices.get(symbol) ?? [];
          if (availableIndices.length < count) return false;
          for (let index = 0; index < count; index += 1) {
            sourceIonByAtomIndex.set(availableIndices.shift()!, floatingIon);
          }
        }
      }
      const availableBySymbol = new Map<string, AtomParticle[]>();
      for (const particle of particlesRef.current) {
        if (particle.state !== "free") continue;
        availableBySymbol.set(
          particle.symbol,
          [...(availableBySymbol.get(particle.symbol) ?? []), particle],
        );
      }
      const selectedFreeByIndex = new Map<number, AtomParticle>();
      for (const [symbol, indices] of unassignedAtomIndices) {
        const available = availableBySymbol.get(symbol) ?? [];
        if (available.length < indices.length) return false;
        indices.forEach((atomIndex) => selectedFreeByIndex.set(atomIndex, available.shift()!));
      }

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
      const selectedParticles = structure.atoms.map((atom, index) => {
        const sourceIon = sourceIonByAtomIndex.get(index);
        if (!sourceIon) return selectedFreeByIndex.get(index)!;
        const particleId = nextParticleIdRef.current;
        nextParticleIdRef.current += 1;
        const angle = (index / Math.max(1, structure.atoms.length)) * Math.PI * 2;
        const particle: AtomParticle = {
          id: particleId,
          symbol: atom.symbol,
          color: getReactionElementTheme(atom.symbol).color,
          x: sourceIon.x + Math.cos(angle) * 8,
          y: sourceIon.y + Math.sin(angle) * 8,
          vx: 0,
          vy: 0,
          radius: 5,
          targetRadius: layout.atomRadius,
          spawnedAt: performance.now(),
          driftTargetX: centerX,
          driftTargetY: centerY,
          diffusionSeed: particleId * 0.773,
          state: "assembling",
          moleculeId,
          sourceIonId: sourceIon.ion.id,
          localX: layout.points[index]?.x ?? 0,
          localY: layout.points[index]?.y ?? 0,
        };
        particlesRef.current.push(particle);
        return particle;
      });
      selectedParticles.forEach((particle, index) => {
        particle.state = "assembling";
        particle.moleculeId = moleculeId;
        particle.localX = layout.points[index]?.x ?? 0;
        particle.localY = layout.points[index]?.y ?? 0;
        particle.targetRadius = layout.atomRadius;
      });
      const selectedIonIds = new Set(presentIons.map((particle) => particle.ion.id));
      floatingIonsRef.current = floatingIonsRef.current.filter(
        (particle) => !selectedIonIds.has(particle.ion.id),
      );
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
        sourceIons: presentIons.map((particle) => ({
          ion: particle.ion,
          startX: particle.x,
          startY: particle.y,
          radius: particle.radius,
        })),
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
    restoreStableCompound(compound, slotIndex) {
      if (moleculesRef.current.some((molecule) => molecule.compound.id === compound.id)) return;
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
      const startedAt = performance.now();
      const structure = getMolecularDisplayStructure(compound);
      const particleIds = structure.atoms.map((atom, index) => {
        const particleId = nextParticleIdRef.current;
        nextParticleIdRef.current += 1;
        const point = layout.points[index] ?? { x: 0, y: 0 };
        particlesRef.current.push({
          id: particleId,
          symbol: atom.symbol,
          color: getReactionElementTheme(atom.symbol).color,
          x: slot.centerX + point.x,
          y: slot.centerY + point.y,
          vx: 0,
          vy: 0,
          radius: layout.atomRadius,
          targetRadius: layout.atomRadius,
          spawnedAt: startedAt,
          driftTargetX: slot.centerX,
          driftTargetY: slot.centerY,
          diffusionSeed: particleId * 0.773,
          state: "bound",
          moleculeId,
          localX: point.x,
          localY: point.y,
        });
        return particleId;
      });
      moleculesRef.current.push({
        id: moleculeId,
        compound,
        particleIds,
        slotIndex,
        centerX: slot.centerX,
        centerY: slot.centerY,
        vx: 0,
        vy: 0,
        diffusionSeed: moleculeId * 1.731 + slotIndex * 0.619,
        radius: layout.radius,
        startedAt,
        stableAt: startedAt,
        notified: true,
        sourceIons: [],
      });
    },
    reset() {
      particlesRef.current = [];
      floatingIonsRef.current = [];
      ionFormationsRef.current = [];
      moleculesRef.current = [];
      ripplesRef.current = [];
      nextParticleIdRef.current = 1;
      nextMoleculeIdRef.current = 1;
      nextIonFormationIdRef.current = 1;
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

      const completedIonFormationIds = new Set<number>();
      for (const formation of ionFormationsRef.current) {
        const duration = reducedMotionRef.current ? 320 : 1_350;
        if (now - formation.startedAt < duration) continue;
        completedIonFormationIds.add(formation.id);
        const motion = createInjectedAtomMotion({
          particleId: nextParticleIdRef.current,
          index: floatingIonsRef.current.length,
          count: floatingIonsRef.current.length + 1,
          width,
          height,
          now,
          radius: 38,
          reducedMotion: reducedMotionRef.current,
        });
        nextParticleIdRef.current += 1;
        floatingIonsRef.current.push({
          ion: formation.ion,
          ...motion,
          x: formation.centerX,
          y: formation.centerY,
          driftTargetX: formation.centerX,
          driftTargetY: formation.centerY,
        });
        ripplesRef.current.push({
          x: formation.centerX,
          y: formation.centerY,
          startedAt: now,
          color: "#ffffff",
          strength: 1.65,
        });
        onIonCompleteRef.current?.(formation.ion);
      }
      if (completedIonFormationIds.size > 0) {
        ionFormationsRef.current = ionFormationsRef.current.filter(
          (formation) => !completedIonFormationIds.has(formation.id),
        );
        particlesRef.current = particlesRef.current.filter(
          (particle) => !particle.ionFormationId || !completedIonFormationIds.has(particle.ionFormationId),
        );
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

      for (const formation of ionFormationsRef.current) {
        drawPolyatomicIonFormationField(context, formation, now, reducedMotionRef.current);
      }

      for (const particle of particlesRef.current) {
        if (particle.state === "free") {
          if (!reducedMotionRef.current) {
            advanceFreeAtomMotion(
              particle,
              { width, height },
              now,
              delta,
              Math.random,
              freeParticleSpeedRef.current,
            );
          }
          drawAtom(context, particle, particle.x, particle.y);
          continue;
        }

        if (particle.state === "forming-ion") {
          const formation = ionFormationsRef.current.find(
            (candidate) => candidate.id === particle.ionFormationId,
          );
          if (!formation) continue;
          const elapsed = now - formation.startedAt;
          const progress = reducedMotionRef.current
            ? Math.min(1, elapsed / 260)
            : Math.min(1, elapsed / 1_050);
          const targetX = formation.centerX + particle.localX * (1 - progress * 0.4);
          const targetY = formation.centerY + particle.localY * (1 - progress * 0.4);
          particle.x += (targetX - particle.x) * (0.045 + progress * 0.12) * delta;
          particle.y += (targetY - particle.y) * (0.045 + progress * 0.12) * delta;
          particle.radius += (particle.targetRadius - particle.radius) * 0.08 * delta;
          const sparkle = !reducedMotionRef.current && elapsed > 760
            ? Math.sin(now * 0.052 + particle.id) * 2.2
            : 0;
          drawAtom(context, particle, particle.x + sparkle, particle.y - sparkle, 0.75);
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
        for (const sourceIon of molecule.sourceIons) {
          const travel = Math.min(1, elapsed / (reducedMotionRef.current ? 240 : 820));
          const fade = Math.max(0, 1 - Math.max(0, elapsed - 430) / 520);
          context.save();
          context.globalAlpha = fade;
          drawPolyatomicIon(context, {
            ion: sourceIon.ion,
            x: sourceIon.startX + (molecule.centerX - sourceIon.startX) * travel,
            y: sourceIon.startY + (molecule.centerY - sourceIon.startY) * travel,
            radius: sourceIon.radius * (1 - travel * 0.18),
          });
          context.restore();
        }
        if (bondAlpha > 0 && moleculeParticles.length > 1) {
          const energetic = elapsed > 1250 && elapsed < 1750;
          for (const bond of getMolecularDisplayStructure(molecule.compound).bonds) {
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
          const sourceIonAlpha = rendered.particle.sourceIonId
            ? Math.min(1, Math.max(0.06, (elapsed - 430) / 540))
            : 1;
          context.save();
          context.globalAlpha = sourceIonAlpha;
          drawAtom(
            context,
            rendered.particle,
            rendered.x,
            rendered.y,
            rendered.particle.state === "assembling" ? 0.72 : 0.34,
          );
          context.restore();
        }
      }

      for (const floatingIon of floatingIonsRef.current) {
        if (!reducedMotionRef.current) {
          advanceFreeAtomMotion(
            floatingIon,
            { width, height },
            now,
            delta,
            Math.random,
            freeParticleSpeedRef.current,
          );
        }
        drawPolyatomicIon(context, floatingIon);
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
        ? "分子工厂反应区：投放的原子和已形成的原子团会在这里运动，组成物质后从底部离开"
        : `实时反应炉：投放的原子会在这里运动，并在配方齐全后聚合到 ${targetCount} 个结构停泊位`}
    >
      当前浏览器不支持实时反应炉画面。
    </canvas>
  );
}

export const FurnaceCanvas = forwardRef(FurnaceCanvasInner);
