/** Shared, dependency-free contract. All distances are metres, angles radians. */
export const HOUSE_SCHEMA_VERSION = 1;
export const MAX_PARTS = 160;
export const WORLD = { left: -40, right: 40, top: 40 } as const;
export const PRESET_MATERIAL_IDS = [
  "wood_t1",
  "wood_t2",
  "wood_t3",
  "wood_t4",
  "wood_t5",
  "stone_t1",
  "stone_t2",
  "stone_t3",
  "stone_t4",
  "stone_t5",
  "metal_t1",
  "metal_t2",
  "metal_t3",
  "metal_t4",
  "metal_t5",
  "elastic_t1",
  "elastic_t2",
  "elastic_t3",
  "elastic_t4",
  "elastic_t5",
] as const;
export const MATERIAL_IDS = [
  ...PRESET_MATERIAL_IDS,
  "wood",
  "wood_c16",
  "wood_gl28",
  "hardwood",
  "steel_235",
  "steel_355",
  "metal",
  "stone",
  "limestone",
  "brick",
  "hollow_brick",
  "aac",
  "mortar",
  "concrete20",
  "concrete40",
  "elastic",
] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];
export type ShapeId =
  "block" | "rectangle" | "triangle" | "bar" | "circle" | "weight";
export type Point = { x: number; y: number };
export type HousePart = Point & {
  id: string;
  shape: ShapeId;
  material: MaterialId;
  width: number;
  height: number;
  angle: number;
  strength: number;
  stiffness: number;
  loadMass: number;
};
export type HouseConnection = {
  id: string;
  a: string;
  b: string | "ground";
  kind: "fixed" | "hinge";
  anchor: Point;
  strength: number;
};
export type ExperimentSettings = {
  windSpeed: number;
  windDirection: -1 | 1;
  gusts: boolean;
  quakeAcceleration: number;
  quakeFrequency: number;
  groundCapacity: number;
  connectionStrength: number;
};
export type HouseDesign = {
  schemaVersion: 1;
  parts: HousePart[];
  connections: HouseConnection[];
  settings: ExperimentSettings;
};
export const DEFAULT_SETTINGS: ExperimentSettings = {
  windSpeed: 20,
  windDirection: 1,
  gusts: false,
  quakeAcceleration: 2,
  quakeFrequency: 1.5,
  groundCapacity: 1000000,
  connectionStrength: 100000,
};
export const SHAPE_NAMES: Record<ShapeId, string> = {
  block: "正方形",
  rectangle: "长方形",
  triangle: "三角形",
  bar: "木板 / 板条",
  circle: "圆块",
  weight: "配重",
};
export function localPoint(part: HousePart, point: Point): Point {
  const x = point.x - part.x,
    y = point.y - part.y;
  return {
    x: x * Math.cos(part.angle) + y * Math.sin(part.angle),
    y: -x * Math.sin(part.angle) + y * Math.cos(part.angle),
  };
}
export function worldPoint(part: HousePart, point: Point): Point {
  return {
    x: part.x + point.x * Math.cos(part.angle) - point.y * Math.sin(part.angle),
    y: part.y + point.x * Math.sin(part.angle) + point.y * Math.cos(part.angle),
  };
}
export function corners(part: HousePart): Point[] {
  if (part.shape === "triangle")
    return localVertices(part).map((p) => worldPoint(part, p));
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) =>
    worldPoint(part, { x: (x * part.width) / 2, y: (y * part.height) / 2 }),
  );
}
/** Triangles use their centroid as the placement/body origin. */
export function localVertices(
  part: Pick<HousePart, "width" | "height">,
): Point[] {
  return [
    { x: -part.width / 2, y: -part.height / 3 },
    { x: part.width / 2, y: -part.height / 3 },
    { x: 0, y: (2 * part.height) / 3 },
  ];
}
function polygonDistance(vertices: Point[], p: Point) {
  let sign = 0,
    inside = true,
    distance = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length],
      dx = b.x - a.x,
      dy = b.y - a.y;
    const cross = dx * (p.y - a.y) - dy * (p.x - a.x);
    if (Math.abs(cross) > 1e-10) {
      if (sign && Math.sign(cross) !== sign) inside = false;
      sign = Math.sign(cross);
    }
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)),
    );
    distance = Math.min(
      distance,
      Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy),
    );
  }
  return inside ? 0 : distance;
}
export function bounds(part: HousePart) {
  if (part.shape === "circle")
    return {
      left: part.x - part.width / 2,
      right: part.x + part.width / 2,
      bottom: part.y - part.width / 2,
      top: part.y + part.width / 2,
    };
  const c = corners(part);
  return {
    left: Math.min(...c.map((p) => p.x)),
    right: Math.max(...c.map((p) => p.x)),
    bottom: Math.min(...c.map((p) => p.y)),
    top: Math.max(...c.map((p) => p.y)),
  };
}
export function surfaceDistance(part: HousePart, point: Point) {
  const p = localPoint(part, point);
  if (part.shape === "circle")
    return Math.max(0, Math.hypot(p.x, p.y) - part.width / 2);
  if (part.shape === "triangle") return polygonDistance(localVertices(part), p);
  return Math.hypot(
    Math.max(0, Math.abs(p.x) - part.width / 2),
    Math.max(0, Math.abs(p.y) - part.height / 2),
  );
}
export function overlaps(
  a: HousePart,
  b: HousePart,
  tolerance = 0.012,
): boolean {
  if (a.shape === "circle" && b.shape === "circle")
    return (
      Math.hypot(a.x - b.x, a.y - b.y) < (a.width + b.width) / 2 - tolerance
    );
  if (a.shape === "circle" || b.shape === "circle") {
    const circle = a.shape === "circle" ? a : b;
    const box = a.shape === "circle" ? b : a;
    if (box.shape === "triangle")
      return surfaceDistance(box, circle) < circle.width / 2 - tolerance;
    const p = localPoint(box, circle);
    return (
      Math.hypot(
        Math.max(0, Math.abs(p.x) - box.width / 2),
        Math.max(0, Math.abs(p.y) - box.height / 2),
      ) <
      circle.width / 2 - tolerance
    );
  }
  const ac = corners(a),
    bc = corners(b);
  for (const [vertices, i] of [ac, bc].flatMap((v) =>
    v.map((_, i) => [v, i] as const),
  )) {
    const p = vertices[i],
      q = vertices[(i + 1) % vertices.length],
      length = Math.hypot(q.x - p.x, q.y - p.y);
    const axis = { x: -(q.y - p.y) / length, y: (q.x - p.x) / length };
    const ap = ac.map((p) => p.x * axis.x + p.y * axis.y),
      bp = bc.map((p) => p.x * axis.x + p.y * axis.y);
    if (
      Math.min(Math.max(...ap), Math.max(...bp)) -
        Math.max(Math.min(...ap), Math.min(...bp)) <=
      tolerance
    )
      return false;
  }
  return true;
}
export function validPlacement(part: HousePart, parts: HousePart[]) {
  const b = bounds(part);
  return (
    b.left >= WORLD.left &&
    b.right <= WORLD.right &&
    b.bottom >= -0.001 &&
    b.top <= WORLD.top &&
    !parts.some((other) => other.id !== part.id && overlaps(part, other))
  );
}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function num(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}
function id(v: unknown): v is string {
  return (
    typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v) && v !== "ground"
  );
}
export function parseHouseDesign(value: unknown): HouseDesign | undefined {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.parts) ||
    !Array.isArray(value.connections) ||
    value.parts.length > MAX_PARTS ||
    value.connections.length > 400 ||
    !record(value.settings)
  )
    return;
  const s = value.settings;
  if (
    !num(s.windSpeed, 0, 60) ||
    ![-1, 1].includes(s.windDirection as number) ||
    typeof s.gusts !== "boolean" ||
    !num(s.quakeAcceleration, 0, 10) ||
    !num(s.quakeFrequency, 0.5, 4) ||
    !num(s.groundCapacity, 100, 100000000) ||
    !num(s.connectionStrength, 100, 10000000)
  )
    return;
  const parts: HousePart[] = [];
  for (const p of value.parts) {
    if (
      !record(p) ||
      !id(p.id) ||
      !["block", "rectangle", "triangle", "bar", "circle", "weight"].includes(
        p.shape as string,
      ) ||
      !(MATERIAL_IDS as readonly unknown[]).includes(p.material) ||
      !num(p.x, WORLD.left, WORLD.right) ||
      !num(p.y, 0, WORLD.top) ||
      !num(p.width, 0.4, 10) ||
      !num(p.height, 0.05, 6) ||
      !num(p.angle, -Math.PI * 2, Math.PI * 2) ||
      !num(p.strength, 0.1, 10) ||
      !num(p.stiffness, 0.1, 10) ||
      !num(p.loadMass, 10, 1500) ||
      parts.some((other) => other.id === p.id)
    )
      return;
    if ((p.shape === "circle" || p.shape === "block") && p.width !== p.height)
      return;
    if (p.shape === "bar" && (p.width as number) < (p.height as number) * 2)
      return;
    const part = {
      id: p.id,
      shape: p.shape,
      material: p.material,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      angle: p.angle,
      strength: p.strength,
      stiffness: p.stiffness,
      loadMass: p.loadMass,
    } as HousePart;
    if (!validPlacement(part, parts)) return;
    parts.push(part);
  }
  const connections: HouseConnection[] = [];
  const pairs = new Set<string>();
  for (const c of value.connections) {
    if (
      !record(c) ||
      !id(c.id) ||
      !id(c.a) ||
      !(id(c.b) || c.b === "ground") ||
      !["fixed", "hinge"].includes(c.kind as string) ||
      !record(c.anchor) ||
      !num(c.anchor.x, WORLD.left, WORLD.right) ||
      !num(c.anchor.y, -0.1, WORLD.top) ||
      !num(c.strength, 100, 10000000) ||
      c.a === c.b ||
      connections.some((j) => j.id === c.id)
    )
      return;
    const a = parts.find((p) => p.id === c.a),
      b = parts.find((p) => p.id === c.b);
    const anchor = { x: c.anchor.x, y: c.anchor.y };
    const pair = [c.a, c.b].sort().join(":");
    if (!a || surfaceDistance(a, anchor) > 0.13 || pairs.has(pair)) return;
    if (c.b === "ground") {
      if (Math.abs(anchor.y) > 0.03 || bounds(a).bottom > 0.13) return;
    } else if (!b || surfaceDistance(b, anchor) > 0.13) return;
    pairs.add(pair);
    connections.push({
      id: c.id,
      a: c.a,
      b: c.b,
      kind: c.kind,
      anchor,
      strength: c.strength,
    } as HouseConnection);
  }
  return {
    schemaVersion: 1,
    parts,
    connections,
    settings: {
      windSpeed: s.windSpeed,
      windDirection: s.windDirection as -1 | 1,
      gusts: s.gusts,
      quakeAcceleration: s.quakeAcceleration,
      quakeFrequency: s.quakeFrequency,
      groundCapacity: s.groundCapacity,
      connectionStrength: s.connectionStrength,
    },
  };
}
