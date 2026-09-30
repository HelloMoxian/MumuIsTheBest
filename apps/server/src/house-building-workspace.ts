import {
  parseHouseDesign,
  bounds,
  WORLD,
  type HouseDesign,
} from "./house-building-contract.js";
export type ChallengeFlags = {
  height: boolean;
  target: boolean;
  foundation: boolean;
};
export type TaskZone = {
  id: string;
  kind: "required" | "forbidden";
  left: number;
  right: number;
  bottom: number;
  top: number;
  enabled: boolean;
};
export type GroundRegion = { left: number; right: number };
export type HouseChallenge = {
  layoutVersion?: 2 | 3;
  zones?: TaskZone[];
  seed: number;
  flags: ChallengeFlags;
  height: number;
  target: { x: number; y: number };
  regions: GroundRegion[];
};
export type HouseView = {
  x: number;
  y: number;
  span: number;
  showMass: boolean;
  showCenter: boolean;
  wind: boolean;
  quake: boolean;
};
export type HouseWorkspace = {
  schemaVersion: 2;
  design: HouseDesign;
  challenge: HouseChallenge;
  view: HouseView;
};
export type HouseRecord = {
  id: string;
  createdAt: string;
  modelVersion: 2 | 3;
  workspace: HouseWorkspace;
  result: {
    duration: 10;
    maxHeight: number;
    finalHeight: number;
    mass: number;
    componentCount: number;
    cost?: number;
    windForcePeak: number;
    quakeAccelerationPeak: number;
  };
};
export type HouseHistory = { schemaVersion: 1; records: HouseRecord[] };
export const DEFAULT_VIEW: HouseView = {
  x: 0,
  y: 5,
  span: 20,
  showMass: false,
  showCenter: false,
  wind: false,
  quake: false,
};
export const challengeActive = (c: HouseChallenge) =>
  Object.values(c.flags).some(Boolean) || !!c.zones?.some((z) => z.enabled);
export function generateChallenge(
  flags: ChallengeFlags,
  seed: number,
): HouseChallenge {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const height = 4 + Math.floor(random() * 9);
  const target = {
    x: Math.floor(random() * 13) - 6,
    y: 2 + Math.floor(random() * Math.min(5, height - 2)),
  };
  const cx = flags.target ? target.x : Math.floor(random() * 9) - 4;
  const regions =
    random() < 0.5
      ? [{ left: cx - 2.5, right: cx + 2.5 }]
      : [
          { left: cx - 5, right: cx - 1 },
          { left: cx + 1, right: cx + 5 },
        ];
  return { seed, flags: { ...flags }, height, target, regions };
}
export function emptyChallenge() {
  return generateChallenge(
    { height: false, target: false, foundation: false },
    1,
  );
}
export function groundPlacementAllowed(
  design: HouseDesign,
  challenge: HouseChallenge,
) {
  if (!challenge.flags.foundation) return true;
  return design.parts.every((p) => {
    const b = bounds(p);
    return (
      b.bottom > 0.14 ||
      challenge.regions.some(
        (r) => b.left >= r.left - 0.02 && b.right <= r.right + 0.02,
      )
    );
  });
}
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const number = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function parseChallenge(v: unknown): HouseChallenge | undefined {
  if (
    !object(v) ||
    !object(v.flags) ||
    !number(v.seed, 0, 4294967295) ||
    !Number.isInteger(v.seed)
  )
    return;
  if (
    typeof v.flags.height !== "boolean" ||
    typeof v.flags.target !== "boolean" ||
    typeof v.flags.foundation !== "boolean"
  )
    return;
  if (
    v.layoutVersion !== undefined &&
    v.layoutVersion !== 2 &&
    v.layoutVersion !== 3
  )
    return;
  if (v.layoutVersion === 2 || v.layoutVersion === 3) {
    const zones: TaskZone[] = [];
    if (v.layoutVersion === 3) {
      if (!Array.isArray(v.zones) || v.zones.length > 24) return;
      for (const z of v.zones) {
        if (
          !object(z) ||
          typeof z.id !== "string" ||
          !z.id ||
          z.id.length > 180 ||
          (z.kind !== "required" && z.kind !== "forbidden") ||
          typeof z.enabled !== "boolean" ||
          !number(z.left, -40, 40) ||
          !number(z.right, -40, 40) ||
          z.right - z.left < 0.1 ||
          !number(z.bottom, 0, 40) ||
          !number(z.top, 0, 40) ||
          z.top - z.bottom < 0.1
        )
          return;
        zones.push({
          id: z.id,
          kind: z.kind,
          left: z.left,
          right: z.right,
          bottom: z.bottom,
          top: z.top,
          enabled: z.enabled,
        });
      }
      if (new Set(zones.map((z) => z.id)).size !== zones.length) return;
    }
    if (
      !number(v.height, 0.5, WORLD.top) ||
      !object(v.target) ||
      !number(v.target.x, WORLD.left, WORLD.right) ||
      !number(v.target.y, 0.1, WORLD.top) ||
      !Array.isArray(v.regions) ||
      (v.regions.length < 1 && (v.layoutVersion !== 3 || v.flags.foundation)) ||
      v.regions.length > (v.layoutVersion === 3 ? 12 : 2) ||
      v.regions.some(
        (r, i) =>
          !object(r) ||
          !number(r.left, WORLD.left, WORLD.right) ||
          !number(r.right, WORLD.left, WORLD.right) ||
          r.right - r.left < 0.5 ||
          (i > 0 &&
            r.left < (v.regions as { right: number }[])[i - 1].right + 0.1),
      )
    )
      return;
    return {
      layoutVersion: v.layoutVersion,
      ...(v.layoutVersion === 3 ? { zones } : {}),
      seed: v.seed,
      flags: {
        height: v.flags.height,
        target: v.flags.target,
        foundation: v.flags.foundation,
      },
      height: v.height,
      target: { x: v.target.x, y: v.target.y },
      regions: v.regions.map((r) => ({ left: r.left, right: r.right })),
    };
  }
  const expected = generateChallenge(v.flags as ChallengeFlags, v.seed);
  // Seed is the single source of truth: goals cannot drift while switching UI panels.
  if (
    v.height !== expected.height ||
    !object(v.target) ||
    v.target.x !== expected.target.x ||
    v.target.y !== expected.target.y ||
    !Array.isArray(v.regions) ||
    v.regions.length !== expected.regions.length ||
    v.regions.some(
      (r, i) =>
        !object(r) ||
        r.left !== expected.regions[i].left ||
        r.right !== expected.regions[i].right,
    )
  )
    return;
  return expected;
}
export function parseWorkspace(v: unknown): HouseWorkspace | undefined {
  if (!object(v) || v.schemaVersion !== 2 || !object(v.view)) return;
  const design = parseHouseDesign(v.design, { legacyOverlap: true }),
    challenge = parseChallenge(v.challenge),
    view = v.view;
  if (
    !design ||
    !challenge ||
    !number(view.x, WORLD.left, WORLD.right) ||
    !number(view.y, -2, WORLD.top) ||
    !number(view.span, 6, 84) ||
    ["showMass", "showCenter", "wind", "quake"].some(
      (k) => typeof view[k] !== "boolean",
    )
  )
    return;
  return {
    schemaVersion: 2,
    design,
    challenge,
    view: {
      x: view.x,
      y: view.y,
      span: view.span,
      showMass: view.showMass,
      showCenter: view.showCenter,
      wind: view.wind,
      quake: view.quake,
    } as HouseView,
  };
}
export function migrateHouseWorkspace(v: unknown): HouseWorkspace | undefined {
  return (
    parseWorkspace(v) ??
    (() => {
      const design = parseHouseDesign(v, { legacyOverlap: true });
      return design
        ? {
            schemaVersion: 2 as const,
            design,
            challenge: emptyChallenge(),
            view: { ...DEFAULT_VIEW },
          }
        : undefined;
    })()
  );
}
export function parseHouseRecord(v: unknown): HouseRecord | undefined {
  if (
    !object(v) ||
    (v.modelVersion !== 2 && v.modelVersion !== 3) ||
    typeof v.id !== "string" ||
    !/^[-a-zA-Z0-9]{1,80}$/.test(v.id) ||
    typeof v.createdAt !== "string" ||
    !/^\d{4}-\d\d-\d\dT/.test(v.createdAt) ||
    !Number.isFinite(Date.parse(v.createdAt)) ||
    !object(v.result)
  )
    return;
  const workspace = parseWorkspace(v.workspace),
    r = v.result;
  if (
    !workspace ||
    !challengeActive(workspace.challenge) ||
    !workspace.design.parts.length ||
    !groundPlacementAllowed(workspace.design, workspace.challenge) ||
    r.duration !== 10 ||
    !number(r.maxHeight, 0, 100) ||
    !number(r.finalHeight, 0, 100) ||
    r.maxHeight < r.finalHeight ||
    !number(r.mass, 0.01, 1e9) ||
    r.componentCount !== workspace.design.parts.length ||
    (v.modelVersion === 3 && !number(r.cost, 0, 1e9)) ||
    !number(r.windForcePeak, 0, 1e9) ||
    !number(r.quakeAccelerationPeak, 0, 1e6) ||
    (workspace.challenge.flags.height &&
      r.finalHeight < workspace.challenge.height - 0.05)
  )
    return;
  return {
    id: v.id,
    createdAt: v.createdAt,
    modelVersion: v.modelVersion,
    workspace,
    result: {
      duration: 10,
      maxHeight: r.maxHeight,
      finalHeight: r.finalHeight,
      mass: r.mass,
      componentCount: r.componentCount,
      ...(v.modelVersion === 3 ? { cost: r.cost as number } : {}),
      windForcePeak: r.windForcePeak,
      quakeAccelerationPeak: r.quakeAccelerationPeak,
    },
  };
}
export function parseHouseHistory(v: unknown): HouseHistory | undefined {
  if (
    !object(v) ||
    v.schemaVersion !== 1 ||
    !Array.isArray(v.records) ||
    v.records.length > 1000
  )
    return;
  const records: HouseRecord[] = [];
  const ids = new Set<string>();
  for (const raw of v.records) {
    const r = parseHouseRecord(raw);
    if (!r || ids.has(r.id)) return;
    ids.add(r.id);
    records.push(r);
  }
  return { schemaVersion: 1, records };
}
export function mergeHouseHistory(
  current: HouseHistory | undefined,
  incoming: HouseHistory,
): HouseHistory {
  const records = [...(current?.records ?? [])];
  for (const record of incoming.records) {
    const prior = records.find((r) => r.id === record.id);
    if (prior) {
      if (JSON.stringify(prior) !== JSON.stringify(record))
        throw new Error("HOUSE_RECORD_ID_CONFLICT");
    } else records.push(record);
  }
  if (records.length > 1000) throw new Error("HOUSE_HISTORY_FULL");
  return { schemaVersion: 1, records };
}
