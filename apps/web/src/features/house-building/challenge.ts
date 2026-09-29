import type { SimulationSnapshot } from "./engine";
import {
  bounds,
  surfaceDistance,
  worldPoint,
  localPoint,
  type HousePart,
  type Point,
} from "./model";
import {
  challengeActive,
  type HouseChallenge,
} from "../../../../server/src/house-building-workspace";
export * from "../../../../server/src/house-building-workspace";
export type ChallengeEvaluation = {
  ok: boolean;
  height: number;
  reasons: string[];
};
const geometry = (p: SimulationSnapshot["pieces"][number]): HousePart => ({
  ...p,
  shape:
    p.shape === "circle"
      ? "circle"
      : p.shape === "triangle"
        ? "triangle"
        : "block",
  strength: 1,
  stiffness: 1,
  loadMass: 1,
});
export function pieceBounds(p: SimulationSnapshot["pieces"][number]) {
  if (!p.vertices) return bounds(geometry(p));
  const vertices = p.vertices.map((v) => worldPoint(geometry(p), v));
  return {
    left: Math.min(...vertices.map((v) => v.x)),
    right: Math.max(...vertices.map((v) => v.x)),
    bottom: Math.min(...vertices.map((v) => v.y)),
    top: Math.max(...vertices.map((v) => v.y)),
  };
}
function covers(p: SimulationSnapshot["pieces"][number], target: Point) {
  if (!p.vertices) return surfaceDistance(geometry(p), target) < 0.06;
  const point = localPoint(geometry(p), target),
    vertices = p.vertices;
  let sign = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (Math.abs(cross) < 1e-8) continue;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}
export function evaluateChallenge(
  s: SimulationSnapshot,
  c: HouseChallenge,
): ChallengeEvaluation {
  const supported = s.pieces.filter((p) => p.supported);
  const height = Math.max(
    0,
    ...supported.map((p) => pieceBounds(p).top - s.ground.y),
  );
  const reasons: string[] = [];
  if (!supported.length) reasons.push("先让建筑接触地基并站稳");
  if (c.flags.height && height < c.height - 0.05)
    reasons.push("高度还没有达到 " + c.height + " 米");
  if (
    c.flags.target &&
    !supported.some((p) =>
      covers(p, { x: c.target.x + s.ground.x, y: c.target.y + s.ground.y }),
    )
  )
    reasons.push("目标坐标还没有被建筑覆盖");
  if (
    c.flags.foundation &&
    s.pieces.some((p) => {
      const b = pieceBounds(p);
      return (
        b.bottom < s.ground.y + 0.12 &&
        !c.regions.some(
          (r) =>
            b.left - s.ground.x >= r.left - 0.04 &&
            b.right - s.ground.x <= r.right + 0.04,
        )
      );
    })
  )
    reasons.push("有积木落在了限定地基之外");
  return { ok: challengeActive(c) && reasons.length === 0, height, reasons };
}
export type ChallengeProgress = {
  held: number;
  done: boolean;
  maxHeight: number;
  windForcePeak: number;
  quakeAccelerationPeak: number;
};
export const initialProgress = (): ChallengeProgress => ({
  held: 0,
  done: false,
  maxHeight: 0,
  windForcePeak: 0,
  quakeAccelerationPeak: 0,
});
export function advanceChallenge(
  prior: ChallengeProgress,
  e: ChallengeEvaluation,
  dt: number,
  windForce: number,
  acceleration: number,
): ChallengeProgress {
  if (prior.done) return prior;
  const held = e.ok ? Math.min(10, prior.held + Math.max(0, dt)) : 0;
  return {
    held,
    done: held >= 10 - 1e-8,
    maxHeight: Math.max(prior.maxHeight, e.height),
    windForcePeak: Math.max(prior.windForcePeak, windForce),
    quakeAccelerationPeak: Math.max(
      prior.quakeAccelerationPeak,
      Math.abs(acceleration),
    ),
  };
}
