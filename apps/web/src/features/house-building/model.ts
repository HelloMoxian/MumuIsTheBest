import catalog from "../../../../../content/physics-house/materials.v1.json";
import examples from "../../../../../content/physics-house/examples.v1.json";
import {
  DEFAULT_SETTINGS,
  bounds,
  corners,
  surfaceDistance,
  worldPoint,
  validPlacement,
  overlaps,
  parseHouseDesign,
  type HouseDesign,
  type HousePart,
  type Point,
  type ShapeId,
  type MaterialId,
} from "../../../../server/src/house-building-contract";
export * from "../../../../server/src/house-building-contract";
export const MATERIALS = catalog.materials;
export const DEPTH = catalog.depth;
export function partMass(p: HousePart) {
  if (p.shape === "weight") return p.loadMass;
  const area =
    p.shape === "circle"
      ? Math.PI * (p.width / 2) ** 2
      : p.width * p.height * (p.shape === "triangle" ? 0.5 : 1);
  return area * DEPTH * MATERIALS[p.material].density;
}
export function partCost(p: HousePart) {
  return partMass(p) * MATERIALS[p.material].pricePerKg;
}
export function isBeam(p: HousePart) {
  return p.shape === "bar" || p.shape === "rectangle";
}
export function makePart(
  id: string,
  shape: ShapeId,
  material: MaterialId,
  x = 0,
  y = 4,
): HousePart {
  return {
    id,
    shape,
    material,
    x,
    y,
    width:
      shape === "bar"
        ? 3
        : shape === "rectangle"
          ? 1.6
          : shape === "triangle"
            ? 1.2
            : 0.8,
    height: shape === "bar" ? 0.2 : shape === "triangle" ? 1 : 0.8,
    angle: 0,
    strength: 1,
    stiffness: 1,
    loadMass: 200,
  };
}
export function emptyDesign(): HouseDesign {
  return {
    schemaVersion: 1,
    parts: [],
    connections: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
export type ExampleId = "house" | "wide" | "narrow" | "bridge" | "chain";
export const EXAMPLES: { id: ExampleId; name: string }[] = [
  { id: "house", name: "小房子" },
  { id: "wide", name: "宽底塔" },
  { id: "narrow", name: "窄底塔" },
  { id: "bridge", name: "一座桥" },
  { id: "chain", name: "悬链" },
];
export function exampleDesign(id: ExampleId): HouseDesign {
  const design = parseHouseDesign(examples.examples[id]);
  if (!design) throw new Error("预制方案不符合物理搭建规则。");
  return design;
}
export function connectionAnchor(
  a: HousePart,
  b: HousePart,
): Point | undefined {
  const samples = (p: HousePart) =>
    p.shape === "circle"
      ? Array.from({ length: 32 }, (_, i) =>
          worldPoint(p, {
            x: (Math.cos((i * Math.PI) / 16) * p.width) / 2,
            y: (Math.sin((i * Math.PI) / 16) * p.width) / 2,
          }),
        )
      : corners(p).flatMap((v, i, all) =>
          Array.from({ length: 17 }, (_, j) => ({
            x: v.x + ((all[(i + 1) % all.length].x - v.x) * j) / 16,
            y: v.y + ((all[(i + 1) % all.length].y - v.y) * j) / 16,
          })),
        );
  const candidates = [...samples(a), ...samples(b)].filter(
    (p) => surfaceDistance(a, p) < 0.13 && surfaceDistance(b, p) < 0.13,
  );
  if (!candidates.length) return;
  return candidates.reduce((best, p) =>
    Math.hypot(p.x - (a.x + b.x) / 2, p.y - (a.y + b.y) / 2) <
    Math.hypot(best.x - (a.x + b.x) / 2, best.y - (a.y + b.y) / 2)
      ? p
      : best,
  );
}
/** Center directly above the reference and lower to the first surface contact. */
export function placeAbove(
  part: HousePart,
  reference: HousePart,
  parts: HousePart[],
): HousePart | undefined {
  const candidate = { ...part, x: reference.x };
  let bottom = reference.y;
  let top = bounds(reference).top + (part.y - bounds(part).bottom) + 1e-9;
  // Convex shapes overlap in one continuous vertical interval. Exact contact,
  // rather than bounding-box contact, also handles tilted planks and circles.
  for (let i = 0; i < 48; i++) {
    const y = (bottom + top) / 2;
    if (overlaps({ ...candidate, y }, reference, 0)) bottom = y;
    else top = y;
  }
  candidate.y = top;
  return validPlacement(candidate, parts) ? candidate : undefined;
}
export function placeNear(
  part: HousePart,
  parts: HousePart[],
): HousePart | undefined {
  for (let radius = 0; radius < 10; radius += 0.5)
    for (const [dx, dy] of [
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [radius, radius],
      [-radius, radius],
    ]) {
      const candidate = {
        ...part,
        x: part.x + dx,
        y: Math.max(part.height / 2, part.y + dy),
      };
      if (validPlacement(candidate, parts)) return candidate;
    }
  for (let y = 0.5; y <= 7.5; y += 0.5)
    for (let x = -6.5; x <= 6.5; x += 0.5) {
      const candidate = { ...part, x, y };
      if (validPlacement(candidate, parts)) return candidate;
    }
}
export function snapPart(p: HousePart, parts: HousePart[]): HousePart {
  let next = {
    ...p,
    x: Math.round(p.x * 10) / 10,
    y: Math.round(p.y * 10) / 10,
  };
  const b = bounds(next);
  if (Math.abs(b.bottom) < 0.2) next.y -= b.bottom;
  for (const other of parts) {
    if (other.id === p.id) continue;
    const o = bounds(other),
      current = bounds(next);
    if (
      current.left < o.right &&
      current.right > o.left &&
      Math.abs(current.bottom - o.top) < 0.15
    )
      next.y += o.top - current.bottom;
    if (current.bottom < o.top && current.top > o.bottom) {
      if (Math.abs(current.left - o.right) < 0.15)
        next.x += o.right - current.left;
      else if (Math.abs(current.right - o.left) < 0.15)
        next.x += o.left - current.right;
    }
  }
  return next;
}
