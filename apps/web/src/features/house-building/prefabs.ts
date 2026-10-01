import {
  bounds,
  validPlacement,
  parseHouseDesign,
  WORLD,
  MAX_PARTS,
  emptyDesign,
  makePart,
  exampleDesign,
  type HouseDesign,
  type HousePart,
  type MaterialId,
} from "./model";
import { groundPlacementAllowed, type HouseChallenge } from "./challenge";
export function selectionDesign(
  design: HouseDesign,
  ids: string[],
): HouseDesign | undefined {
  const parts = design.parts.filter((p) => ids.includes(p.id));
  if (!parts.length) return;
  const left = Math.min(...parts.map((p) => bounds(p).left)),
    right = Math.max(...parts.map((p) => bounds(p).right));
  const dx = -(left + right) / 2,
    dy = -Math.min(...parts.map((p) => bounds(p).bottom));
  return {
    ...emptyDesign(),
    parts: parts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    connections: design.connections
      .filter((c) => ids.includes(c.a) && ids.includes(c.b))
      .map((c) => ({
        ...c,
        anchor: { x: c.anchor.x + dx, y: c.anchor.y + dy },
      })),
  };
}
export function insertAssembly(
  source: HouseDesign,
  design: HouseDesign,
  challenge: HouseChallenge,
  anchor?: HousePart,
  preferredX = 0,
) {
  if (
    !parseHouseDesign(source) ||
    !source.parts.length ||
    source.parts.length + design.parts.length > MAX_PARTS
  )
    return;
  const bs = source.parts.map(bounds),
    left = Math.min(...bs.map((b) => b.left)),
    right = Math.max(...bs.map((b) => b.right)),
    bottom = Math.min(...bs.map((b) => b.bottom)),
    top = Math.max(...bs.map((b) => b.top));
  const width = right - left,
    height = top - bottom;
  const occupied = design.parts.map(bounds);
  const targetX = anchor?.x ?? preferredX;
  const candidates = [
    {
      x: targetX - (left + right) / 2,
      y: (anchor ? bounds(anchor).top : 0) - bottom,
    },
  ];
  if (anchor)
    candidates.push({
      x: bounds(anchor).right - left,
      y: anchor.y - (bottom + top) / 2,
    });
  const xs = [
    ...(challenge.flags.foundation
      ? challenge.regions.flatMap((r) => [
          r.left - left,
          r.right - right,
          (r.left + r.right - left - right) / 2,
        ])
      : []),
    targetX - (left + right) / 2,
    WORLD.left - left,
    WORLD.right - right,
    ...occupied.flatMap((b) => [b.right - left, b.left - right]),
  ];
  const ys = [-bottom, ...occupied.map((b) => b.top - bottom)];
  for (const y of [...new Set(ys)].sort((a, b) => a - b))
    for (const x of [...new Set(xs)].sort(
      (a, b) => Math.abs(a - targetX) - Math.abs(b - targetX),
    ))
      candidates.push({ x, y });
  for (const offset of candidates) {
    if (
      left + offset.x < WORLD.left - 1e-9 ||
      right + offset.x > WORLD.right + 1e-9 ||
      top + offset.y > WORLD.top + 1e-9
    )
      continue;
    const parts = source.parts.map((p) => ({
      ...p,
      x: p.x + offset.x,
      y: p.y + offset.y,
    }));
    // Temporary source IDs must not accidentally bypass collision with an existing part.
    if (
      !parts.every((p) => validPlacement({ ...p, id: "" }, design.parts)) ||
      !groundPlacementAllowed({ ...design, parts }, challenge)
    )
      continue;
    const ids = new Map(source.parts.map((p) => [p.id, crypto.randomUUID()]));
    const placed = parts.map((p) => ({ ...p, id: ids.get(p.id)! }));
    const connections = source.connections
      .map((c) => ({
        ...c,
        id: crypto.randomUUID(),
        a: ids.get(c.a)!,
        b: ids.get(c.b)!,
        anchor: { x: c.anchor.x + offset.x, y: c.anchor.y + offset.y },
      }))
      .filter((c) => c.a && c.b);
    return {
      design: {
        ...design,
        parts: [...design.parts, ...placed],
        connections: [...design.connections, ...connections],
      },
      ids: placed.map((p) => p.id),
      center: {
        x: (left + right) / 2 + offset.x,
        y: (bottom + top) / 2 + offset.y,
      },
      width,
      height,
    };
  }
}
export const SYSTEM_PREFABS = [
  { id: "house", name: "小房子" },
  { id: "tower", name: "大高楼" },
  { id: "triangles", name: "三角阵列" },
  { id: "pyramid", name: "锥形" },
] as const;
export function systemPrefab(id: string, material: MaterialId): HouseDesign {
  const d = emptyDesign();
  if (id === "house") {
    const house = exampleDesign("house");
    return selectionDesign(
      house,
      house.parts.map((p) => p.id),
    )!;
  }
  if (id === "tower") {
    for (let row = 0; row < 10; row++)
      for (let col = 0; col < 3; col++)
        d.parts.push(
          makePart(
            "t" + row + "_" + col,
            "rectangle",
            material,
            (col - 1) * 1.6,
            0.4 + row * 0.8,
          ),
        );
  } else if (id === "triangles") {
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 4; col++)
        d.parts.push(
          makePart(
            "a" + row + "_" + col,
            "triangle",
            material,
            (col - 1.5) * 1.2,
            row + 1 / 3,
          ),
        );
  } else {
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 5 - row; col++)
        d.parts.push(
          makePart(
            "p" + row + "_" + col,
            "block",
            material,
            (col - (4 - row) / 2) * 0.8,
            0.4 + row * 0.8,
          ),
        );
  }
  return d;
}
