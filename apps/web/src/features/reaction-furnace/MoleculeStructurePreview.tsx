import { useEffect, useRef } from "react";
import { getReactionElementTheme } from "./element-colors";
import { getMolecularDisplayStructure, type MolecularBond, type ReactionCompound } from "./logic";

function bondOffsets(order: MolecularBond["order"], spacing: number) {
  if (order === 1) return [0];
  if (order === 2) return [-spacing * 0.5, spacing * 0.5];
  return [-spacing, 0, spacing];
}

function drawStructure(
  context: CanvasRenderingContext2D,
  compound: ReactionCompound,
  width: number,
  height: number,
) {
  const structure = getMolecularDisplayStructure(compound);
  const atoms = structure.atoms;
  if (atoms.length === 0) return;

  const minimumX = Math.min(...atoms.map((atom) => atom.x));
  const maximumX = Math.max(...atoms.map((atom) => atom.x));
  const minimumY = Math.min(...atoms.map((atom) => atom.y));
  const maximumY = Math.max(...atoms.map((atom) => atom.y));
  const sourceWidth = Math.max(0.1, maximumX - minimumX);
  const sourceHeight = Math.max(0.1, maximumY - minimumY);
  const sourceCenterX = (minimumX + maximumX) / 2;
  const sourceCenterY = (minimumY + maximumY) / 2;
  const baseRadius = compound.totalAtoms > 40
    ? 3.2
    : compound.totalAtoms > 24
      ? 4
      : compound.totalAtoms > 12
        ? 5.2
        : 7;
  const radius = Math.min(baseRadius, Math.max(2.8, Math.min(width, height) * 0.065));
  const scale = Math.min(
    radius * 2.55,
    Math.max(0.1, (width - radius * 3.5) / sourceWidth),
    Math.max(0.1, (height - radius * 3.5) / sourceHeight),
  );
  const points = atoms.map((atom) => ({
    x: width / 2 + (atom.x - sourceCenterX) * scale,
    y: height / 2 + (atom.y - sourceCenterY) * scale,
    z: atom.z ?? 0,
  }));
  const minimumZ = Math.min(...points.map((point) => point.z));
  const maximumZ = Math.max(...points.map((point) => point.z));
  const depthRange = Math.max(0.1, maximumZ - minimumZ);
  const depthRatio = (z: number) => (z - minimumZ) / depthRange;

  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  const bondsByDepth = [...structure.bonds].sort((first, second) => {
    const firstDepth = ((points[first.from]?.z ?? 0) + (points[first.to]?.z ?? 0)) / 2;
    const secondDepth = ((points[second.from]?.z ?? 0) + (points[second.to]?.z ?? 0)) / 2;
    return firstDepth - secondDepth;
  });
  for (const bond of bondsByDepth) {
    const first = points[bond.from];
    const second = points[bond.to];
    if (!first || !second) continue;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) continue;
    const perpendicularX = -dy / distance;
    const perpendicularY = dx / distance;
    const spacing = Math.max(1.3, radius * 0.34);
    const bondDepth = depthRatio((first.z + second.z) / 2);
    const isSchematic = bond.style === "dashed";
    context.setLineDash(isSchematic ? [Math.max(2.5, radius * 0.72), Math.max(2, radius * 0.55)] : []);
    context.strokeStyle = isSchematic
      ? `rgba(255, 217, 144, ${0.48 + bondDepth * 0.28})`
      : `rgba(108, 230, 255, ${0.52 + bondDepth * 0.34})`;
    context.lineWidth = Math.max(1.2, radius * 0.3);
    context.shadowColor = isSchematic ? "#ffd990" : "#5ae9ff";
    context.shadowBlur = 5;
    for (const offset of bondOffsets(bond.order, spacing)) {
      context.beginPath();
      context.moveTo(
        first.x + perpendicularX * offset,
        first.y + perpendicularY * offset,
      );
      context.lineTo(
        second.x + perpendicularX * offset,
        second.y + perpendicularY * offset,
      );
      context.stroke();
    }
  }
  context.setLineDash([]);
  context.shadowBlur = 0;

  const atomEntries = atoms
    .map((atom, index) => ({ atom, index, z: points[index]!.z }))
    .sort((first, second) => first.z - second.z);
  atomEntries.forEach(({ atom, index }) => {
    const point = points[index]!;
    const atomRadius = radius * (0.8 + depthRatio(point.z) * 0.24);
    const color = getReactionElementTheme(atom.symbol).color;
    const gradient = context.createRadialGradient(
      point.x - atomRadius * 0.34,
      point.y - atomRadius * 0.38,
      atomRadius * 0.08,
      point.x,
      point.y,
      atomRadius,
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.2, color);
    gradient.addColorStop(1, "#151742");
    context.fillStyle = gradient;
    context.strokeStyle = "rgba(255,255,255,.68)";
    context.lineWidth = Math.max(0.8, atomRadius * 0.13);
    context.beginPath();
    context.arc(point.x, point.y, atomRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (atomRadius >= 5.2) {
      context.fillStyle = "#ffffff";
      context.font = `900 ${Math.max(7, atomRadius * 0.88)}px ui-rounded, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(atom.symbol, point.x, point.y + 0.3);
    }
  });
}

export function MoleculeStructurePreview({
  compound,
}: {
  compound: ReactionCompound;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const structureLabel = compound.structure.representation === "composition-schematic"
    ? "虚线组成示意"
    : compound.structure.representation === "representative-lattice"
      ? "典型结构片段"
      : "球棍结构";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const redraw = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(80, bounds.width);
      const height = Math.max(64, bounds.height);
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStructure(context, compound, width, height);
    };
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    redraw();
    return () => observer.disconnect();
  }, [compound]);

  return (
    <canvas
      ref={canvasRef}
      className="molecule-structure-preview"
      role="img"
      aria-label={`${compound.name}（${compound.formula}）的${structureLabel}`}
    >
      {compound.name}的{structureLabel}
    </canvas>
  );
}
