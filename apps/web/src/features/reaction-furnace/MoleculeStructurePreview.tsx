import { useEffect, useRef } from "react";
import { getReactionElementTheme } from "./element-colors";
import type { MolecularBond, ReactionCompound } from "./logic";

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
  const atoms = compound.structure.atoms;
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
  }));

  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  for (const bond of compound.structure.bonds) {
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
    context.strokeStyle = "rgba(108, 230, 255, 0.82)";
    context.lineWidth = Math.max(1.2, radius * 0.3);
    context.shadowColor = "#5ae9ff";
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
  context.shadowBlur = 0;

  atoms.forEach((atom, index) => {
    const point = points[index]!;
    const color = getReactionElementTheme(atom.symbol).color;
    const gradient = context.createRadialGradient(
      point.x - radius * 0.34,
      point.y - radius * 0.38,
      radius * 0.08,
      point.x,
      point.y,
      radius,
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.2, color);
    gradient.addColorStop(1, "#151742");
    context.fillStyle = gradient;
    context.strokeStyle = "rgba(255,255,255,.68)";
    context.lineWidth = Math.max(0.8, radius * 0.13);
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (radius >= 5.2) {
      context.fillStyle = "#ffffff";
      context.font = `900 ${Math.max(7, radius * 0.88)}px ui-rounded, sans-serif`;
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
      aria-label={`${compound.name}（${compound.formula}）的球棍结构`}
    >
      {compound.name}的球棍结构
    </canvas>
  );
}
