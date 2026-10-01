import prefabCatalog from "../../../../../content/physics-house/system-prefabs.v1.json";
import {
  bounds,
  validPlacement,
  parseHouseDesign,
  WORLD,
  MAX_PARTS,
  emptyDesign,
  makePart,
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
export const SYSTEM_PREFABS = prefabCatalog.prefabs;
export function systemPrefab(id: string, material: MaterialId): HouseDesign {
  if (!SYSTEM_PREFABS.some((p) => p.id === id))
    throw new Error("未知的系统预制件");
  const d = emptyDesign();
  const part = (
    shape: HousePart["shape"],
    x: number,
    bottom: number,
    width: number,
    height: number,
  ) => {
    const p = {
      ...makePart(
        "part" + d.parts.length,
        shape,
        material,
        x,
        bottom + (shape === "triangle" ? height / 3 : height / 2),
      ),
      width,
      height,
    };
    d.parts.push(p);
    return p;
  };
  const join = (
    a: HousePart,
    b: HousePart,
    x: number,
    y: number,
    kind: "fixed" | "hinge" = "fixed",
  ) => {
    d.connections.push({
      id: "joint" + d.connections.length,
      a: a.id,
      b: b.id,
      kind,
      anchor: { x, y },
      strength: 2000000,
    });
  };
  const post = (x: number, height: number, bottom = 0, width = 0.8) => {
    let previous: HousePart | undefined;
    const count = Math.ceil(height / 4),
      h = height / count;
    for (let i = 0; i < count; i++) {
      const p = part("rectangle", x, bottom + i * h, width, h);
      if (previous) join(previous, p, x, bottom + i * h);
      previous = p;
    }
    return previous!;
  };
  const frame = (x: number, width: number, levels: number, h = 3) => {
    let beam: HousePart | undefined;
    for (let level = 0; level < levels; level++) {
      const bottom = level * (h + 0.4);
      const a = post(x - width / 2 + 0.4, h, bottom),
        b = post(x + width / 2 - 0.4, h, bottom);
      if (beam) {
        join(beam, a, a.x, bottom);
        join(beam, b, b.x, bottom);
      }
      beam = part("bar", x, bottom + h, width, 0.4);
      join(a, beam, a.x, bottom + h);
      join(b, beam, b.x, bottom + h);
    }
    return beam!;
  };
  const portal = (width = 8, height = 10) => {
    const leftX = -width / 2 + 0.4,
      rightX = width / 2 - 0.4;
    const footA = part("rectangle", leftX, 0, 2, 0.4),
      footB = part("rectangle", rightX, 0, 2, 0.4);
    const before = d.parts.length,
      a = post(leftX, height - 0.4, 0.4),
      b = post(rightX, height - 0.4, 0.4);
    join(footA, d.parts[before], leftX, 0.4);
    join(footB, d.parts[before + Math.ceil((height - 0.4) / 4)], rightX, 0.4);
    const roof = part("bar", 0, height, width, 0.4);
    join(a, roof, leftX, height);
    join(b, roof, rightX, height);
    return { roof, a, b, height };
  };
  const chainDown = (
    roof: HousePart,
    x: number,
    top: number,
    count: number,
    length = 1.2,
  ) => {
    let previous = roof;
    for (let i = 0; i < count; i++) {
      const p = part("rectangle", x, top - (i + 1) * length, 0.4, length);
      join(previous, p, x, top - i * length, "hinge");
      previous = p;
    }
    return previous;
  };
  if (id === "house") {
    const roof = frame(0, 6, 2, 2.4);
    const triangle = part("triangle", 0, bounds(roof).top, 6, 2);
    join(roof, triangle, 0, bounds(roof).top);
  } else if (id === "tower" || id === "lighthouse") {
    const roof = frame(0, id === "tower" ? 6 : 4, id === "tower" ? 6 : 5, 3.2);
    if (id === "lighthouse") {
      const platform = part("bar", 0, bounds(roof).top, 7, 0.4);
      join(roof, platform, 0, bounds(roof).top);
      const cap = part("triangle", 0, bounds(platform).top, 3, 2);
      join(platform, cap, 0, bounds(platform).top);
    }
  } else if (id === "twins") {
    frame(-5, 4, 5);
    frame(5, 4, 5);
    const deck = part("bar", 0, 13.2, 6, 0.4);
    for (const x of [-5, 5]) {
      const support = d.parts.find(
        (p) =>
          p.shape === "bar" &&
          p.x === x &&
          Math.abs(bounds(p).bottom - 13.2) < 0.01,
      )!;
      join(support, deck, x < 0 ? -3 : 3, 13.4);
    }
  } else if (id === "terrace") {
    frame(-6, 4, 3);
    frame(0, 6, 5);
    frame(6, 4, 3);
  } else if (id === "gate") {
    const { roof } = portal(10, 8);
    for (let i = 0; i < 6; i++) {
      const p = part("block", (i - 2.5) * 1.6, bounds(roof).top, 0.8, 0.8);
      join(roof, p, p.x, bounds(roof).top);
    }
  } else if (id === "bridge" || id === "viaduct" || id === "skybridge") {
    const h = id === "skybridge" ? 10 : 4;
    for (let section = 0; section < 3; section++)
      frame((section - 1) * 7.2, 7.2, id === "viaduct" ? 2 : 1, h);
  } else if (id === "cantilever") {
    const roof = frame(-2, 4, 3);
    const deck = part("bar", 0, bounds(roof).top, 8, 0.5);
    join(roof, deck, -2, bounds(roof).top);
    for (let i = 0; i < 3; i++)
      part("block", -2 + i * 2, bounds(deck).top, 0.8, 0.8);
  } else if (id === "chain") {
    const { a, b, height } = portal(8, 10),
      y = height - 1.3;
    let previous = a;
    for (let i = 0; i < 8; i++) {
      const p = part("bar", -2.8 + i * 0.8, y - 0.15, 0.8, 0.3);
      join(previous, p, -3.2 + i * 0.8, y, "hinge");
      previous = p;
    }
    join(previous, b, 3.2, y, "hinge");
  } else if (id === "curtain") {
    const { roof, height } = portal(8, 10);
    for (let i = 0; i < 5; i++) chainDown(roof, (i - 2) * 1.2, height, 5);
  } else if (id === "pendulum" || id === "double-pendulum") {
    const { roof, height } = portal(8, 12);
    for (const [x, count] of id === "pendulum"
      ? [[0, 6]]
      : [
          [-1.6, 6],
          [1.6, 4],
        ]) {
      const last = chainDown(roof, x, height, count);
      const bob = part("circle", x, bounds(last).bottom - 1.2, 1.2, 1.2);
      join(last, bob, x, bounds(last).bottom, "hinge");
    }
  } else if (id === "swing") {
    const { roof, height } = portal(8, 10);
    const a = chainDown(roof, -1.6, height, 5),
      b = chainDown(roof, 1.6, height, 5);
    const seat = part("bar", 0, bounds(a).bottom - 0.4, 4, 0.4);
    join(a, seat, -1.6, bounds(a).bottom, "hinge");
    join(b, seat, 1.6, bounds(b).bottom, "hinge");
  } else if (id === "seesaw") {
    const base = part("rectangle", 0, 0, 3, 0.5),
      stand = part("rectangle", 0, 0.5, 0.8, 3);
    join(base, stand, 0, 0.5);
    const beam = part("bar", 0, 3.5, 8, 0.4);
    join(stand, beam, 0, 3.5, "hinge");
    part("block", -2.8, 3.9, 0.8, 0.8);
    part("block", 2.8, 3.9, 0.8, 0.8);
  } else if (id === "triangles") {
    frame(0, 8, 3, 3);
    const shelves = d.parts.filter((p) => p.shape === "bar");
    for (const roof of shelves)
      for (let col = 0; col < 4; col++)
        part("triangle", (col - 1.5) * 1.6, bounds(roof).top, 1.6, 1.2);
  } else if (id === "pyramid") {
    for (let row = 0; row < 9; row++)
      for (let col = 0; col < 9 - row; col++)
        part("block", (col - (8 - row) / 2) * 1.2, row * 1.2, 1.2, 1.2);
  } else if (id === "stairs" || id === "amphitheater") {
    for (let side = 0; side < (id === "stairs" ? 1 : 2); side++)
      for (let col = 0; col < (id === "stairs" ? 10 : 6); col++)
        for (let row = 0; row <= col; row++)
          part(
            "rectangle",
            id === "stairs"
              ? (col - 4.5) * 1.2
              : (side ? 1 : -1) * (1.2 + col * 1.2),
            row * 0.8,
            1.2,
            0.8,
          );
    if (id === "amphitheater") part("bar", 0, 0, 1.2, 0.4);
  }
  return d;
}
