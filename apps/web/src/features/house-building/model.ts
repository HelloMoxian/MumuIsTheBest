import catalog from "../../../../../content/physics-house/materials.v1.json";
import examples from "../../../../../content/physics-house/examples.v1.json";
import {
  DEFAULT_SETTINGS,
  WORLD,
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
  // Rise above occupied intervals without changing the vertical stacking line.
  for (let pass = 0; pass <= parts.length; pass++) {
    if (bounds(candidate).top > WORLD.top + 1e-8) return;
    const blockers = parts.filter(
      (p) => p.id !== candidate.id && overlaps(candidate, p, 0),
    );
    if (!blockers.length)
      return validPlacement(candidate, parts) ? candidate : undefined;
    for (const blocker of blockers) {
      if (!overlaps(candidate, blocker, 0)) continue;
      let low = candidate.y,
        high =
          bounds(blocker).top + candidate.y - bounds(candidate).bottom + 1e-9;
      for (let i = 0; i < 48; i++) {
        const y = (low + high) / 2;
        if (overlaps({ ...candidate, y }, blocker, 0)) low = y;
        else high = y;
      }
      candidate.y = high;
    }
  }
}

/** Copy all properties; search above, right, then free edge-aligned positions. */
export function placeCopy(
  part: HousePart,
  reference: HousePart,
  parts: HousePart[],
  accepts: (candidate: HousePart) => boolean = () => true,
): HousePart | undefined {
  const allowed = (p: HousePart) => accepts(p) && validPlacement(p, parts);
  const above = placeAbove(part, reference, parts);
  if (above && allowed(above)) return above;
  const b = bounds(part),
    left = part.x - b.left,
    right = b.right - part.x,
    bottom = part.y - b.bottom,
    top = b.top - part.y;
  let candidate = {
    ...part,
    x: bounds(reference).right + left + 1e-9,
    y: reference.y,
  };
  for (let i = 0; i <= parts.length; i++) {
    if (bounds(candidate).right > WORLD.right) break;
    const blockers = parts.filter(
      (p) => p.id !== candidate.id && overlaps(candidate, p, 0),
    );
    if (!blockers.length) {
      if (allowed(candidate)) return candidate;
      break;
    }
    candidate = {
      ...candidate,
      x: Math.max(...blockers.map((p) => bounds(p).right)) + left + 1e-9,
    };
  }
  const boxes = parts.map(bounds);
  const xs = [
    WORLD.left + left,
    WORLD.right - right,
    reference.x,
    ...boxes.flatMap((b) => [b.left - right - 1e-9, b.right + left + 1e-9]),
  ];
  const ys = [
    bottom,
    WORLD.top - top,
    reference.y,
    ...boxes.flatMap((b) => [b.top + bottom + 1e-9, b.bottom - top - 1e-9]),
  ];
  const unique = (values: number[], near: number) =>
    [...new Set(values)].sort(
      (a, b) => Math.abs(a - near) - Math.abs(b - near),
    );
  for (const y of unique(ys, reference.y))
    for (const x of unique(xs, reference.x)) {
      candidate = { ...part, x, y };
      if (allowed(candidate)) return candidate;
    }
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
        y: Math.max(part.y - bounds(part).bottom, part.y + dy),
      };
      if (validPlacement(candidate, parts)) return candidate;
    }
  for (let y = 0.5; y <= 7.5; y += 0.5)
    for (let x = -6.5; x <= 6.5; x += 0.5) {
      const candidate = { ...part, x, y };
      if (validPlacement(candidate, parts)) return candidate;
    }
}
/** Pick a nearby non-overlapping contact, never sequentially push into a neighbor. */
export function snapPart(p: HousePart, parts: HousePart[]): HousePart {
  const grid = {
    ...p,
    x: Math.round(p.x * 10) / 10,
    y: Math.round(p.y * 10) / 10,
  };
  const b = bounds(grid),
    xs = [grid.x],
    ys = [grid.y];
  if (Math.abs(b.bottom) <= 0.3) ys.push(grid.y - b.bottom);
  for (const other of parts) {
    if (other.id === p.id) continue;
    const o = bounds(other);
    for (const x of [grid.x + o.right - b.left, grid.x + o.left - b.right])
      if (Math.abs(x - p.x) <= 0.16) xs.push(x);
    for (const y of [grid.y + o.top - b.bottom, grid.y + o.bottom - b.top])
      if (Math.abs(y - p.y) <= 0.16) ys.push(y);
  }
  const candidates = xs.flatMap((x) => ys.map((y) => ({ ...p, x, y })));
  // Prefer actual contacts over a grid-rounded gap; retain an exact legal pointer
  // position when rounding would make a narrow opening impossible to enter.
  const contacts = candidates.filter((c) => c.x !== grid.x || c.y !== grid.y);
  const onSurface = (c: HousePart) => {
    const b = bounds(c);
    return (
      Math.abs(b.bottom) < 1e-8 ||
      parts.some((other) => {
        if (other.id === c.id) return false;
        const o = bounds(other);
        return (
          Math.abs(b.bottom - o.top) < 1e-8 &&
          b.right > o.left + 1e-8 &&
          b.left < o.right - 1e-8
        );
      })
    );
  };
  contacts.sort(
    (a, b) =>
      Number(onSurface(b)) - Number(onSurface(a)) ||
      Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y) ||
      a.x - b.x ||
      a.y - b.y,
  );
  return [...contacts, grid, p].find((c) => validPlacement(c, parts)) ?? grid;
}
