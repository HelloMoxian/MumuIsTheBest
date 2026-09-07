import type { MoveId } from "./plan";

export type Point = [number, number, number];
type Pair = [Point, Point];
export interface MomPose {
  hips: Point;
  shouldersCenter: Point;
  neck: Point;
  head: Point;
  hipsPair: Pair;
  shoulders: Pair;
  elbows: Pair;
  hands: Pair;
  knees: Pair;
  feet: Pair;
  footPitch: [number, number];
}
export const MOM_LIMBS = { upperArm: .50, forearm: .46, thigh: .70, shin: .68 } as const;
export const FLOOR_HEIGHT = .12;
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (p: Point, s: number): Point => [p[0] * s, p[1] * s, p[2] * s];
const sub = (a: Point, b: Point): Point => add(a, scale(b, -1));
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (p: Point) => Math.hypot(...p);
const unit = (p: Point): Point => scale(p, 1 / (length(p) || 1));

/** Two fixed-length bones meet at a joint; the pole keeps knees facing forward. */
function joint(root: Point, endpoint: Point, upper: number, lower: number, pole: Point): Point {
  const delta = sub(endpoint, root), distance = length(delta);
  const direction = unit(delta);
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const plane = unit(sub(pole, scale(direction, dot(pole, direction))));
  return add(root, add(scale(direction, along), scale(plane, Math.sqrt(Math.max(0, upper * upper - along * along)))));
}

function reachable(root: Point, endpoint: Point, upper: number, lower: number): Point {
  const delta = sub(endpoint, root), distance = length(delta);
  const bounded = Math.max(Math.abs(upper - lower) + .001, Math.min(upper + lower - .002, distance));
  return add(root, scale(delta, bounded / (distance || 1)));
}

/** Anatomical left is screen-right in the front view. All stretches are held, never bounced. */
export function momPoseFor(move: MoveId, phase: number, lowImpact = false, side: "left" | "right" = "left"): MomPose {
  const time = Number.isFinite(phase) ? Math.max(0, phase) : 0;
  const fraction = time % 1;
  const wave = (1 - Math.cos(fraction * Math.PI * 2)) / 2;
  const active = Math.floor(time) % 2 === 0 ? 1 : 0;
  const sign = active ? 1 : -1;
  const stretch = side === "left" ? 1 : 0;
  const stretchSign = stretch ? 1 : -1;
  let hips: Point = [0, 1.47, 0];
  let lean: Point = [0, .78, 0];
  const feet: Pair = [[-.24, FLOOR_HEIGHT, .035], [.24, FLOOR_HEIGHT, .035]];
  let hands: Pair = [[-.48, 1.47, .13], [.48, 1.47, .13]];
  const footPitch: [number, number] = [0, 0];

  if (move === "march" || move === "knee-drive") {
    const lift = move === "march" ? .22 : lowImpact ? .39 : .58;
    feet[active][1] += lift * wave;
    feet[active][2] += (move === "march" ? .12 : .28) * wave;
    hands[1 - active] = [-sign * (.46 - .07 * wave), 1.61 + .44 * wave, .13 + .44 * wave];
    hands[active] = [sign * .46, 1.61, .13 - .27 * wave];
  } else if (move === "step") {
    hips[0] = sign * .16 * wave;
    feet[active][0] += sign * .42 * wave;
    hands = [[-.49 - .16 * wave, 1.53 + .24 * wave, .12], [.49 + .16 * wave, 1.53 + .24 * wave, .12]];
  } else if (move === "heel-dig") {
    feet[active][2] += .40 * wave;
    hips[1] -= .07 * wave;
    footPitch[active] = -.28 * wave;
    hands[1 - active] = [-sign * (.48 - .06 * wave), 1.47 + .28 * wave, .13 + .26 * wave];
  } else if (move === "reach") {
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1, angle = .18 + 2.73 * (i === active ? wave : 0);
      hands[i] = [s * (.35 + .85 * Math.sin(angle)), 2.25 - .85 * Math.cos(angle), .08];
    }
  } else if (move === "punch") {
    hands = [[-.31, 2.04, .29], [.31, 2.04, .29]];
    hands[active] = [sign * (.31 - .10 * wave), 2.04 + .17 * wave, .29 + .60 * wave];
    hips[1] -= .055 * wave;
    lean[2] = .06 * wave;
  } else if (move === "squat") {
    hips = [0, 1.43 - (lowImpact ? .24 : .39) * wave, -.25 * wave];
    lean = [0, .78, .24 * wave];
    feet[0][0] = -.39; feet[1][0] = .39;
    hands = [[-.31, 1.67 - .15 * wave, .13 + .62 * wave], [.31, 1.67 - .15 * wave, .13 + .62 * wave]];
  } else if (move === "skater") {
    hips = [sign * .23 * wave, 1.47 - .15 * wave, 0];
    lean = [sign * .13 * wave, .78, .13 * wave];
    feet[active][0] += sign * .35 * wave;
    feet[1 - active][0] += sign * .32 * wave;
    feet[1 - active][2] -= (lowImpact ? .30 : .42) * wave;
    feet[1 - active][1] += lowImpact ? 0 : .14 * wave;
    hands = [[-.46 + sign * .47 * wave, 1.58 + .32 * wave, .13 + .25 * wave], [.46 + sign * .47 * wave, 1.58 + .32 * wave, .13 + .25 * wave]];
  } else if (move === "jack") {
    const hop = lowImpact ? 0 : .12 * Math.sin(fraction * Math.PI * 2) ** 2;
    hips[1] = 1.47 - .10 * wave + hop;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      if (!lowImpact || i === active) feet[i][0] += s * .36 * wave;
      feet[i][1] += hop;
      const angle = .14 + 2.72 * wave;
      hands[i] = [s * (.35 + .85 * Math.sin(angle)), 2.25 - .85 * Math.cos(angle) - .10 * wave + hop, .04];
    }
  } else if (move === "hamstring-curl") {
    feet[active][1] += (lowImpact ? .39 : .55) * wave;
    feet[active][2] -= .44 * wave;
    footPitch[active] = .35 * wave;
    hands = [[-.48, 1.89 - .25 * wave, .45 - .27 * wave], [.48, 1.89 - .25 * wave, .45 - .27 * wave]];
  } else if (move === "side-stretch") {
    feet[0][0] = -.32; feet[1][0] = .32;
    hips[1] = 1.44;
    lean = [stretchSign * .19, .78, 0];
    hands[1 - stretch] = [stretchSign * .30, 3.05, .035];
    hands[stretch] = [stretchSign * .43, 1.58, .13];
  } else if (move === "calf-stretch") {
    hips = [0, 1.29, .06];
    lean = [0, .78, .13];
    feet[stretch][2] = -.47; feet[1 - stretch][2] = .38;
    hands = [[-.35, 1.60, .49], [.35, 1.60, .49]];
  } else if (move === "quad-stretch") {
    hips[1] = 1.45;
    feet[stretch] = [stretchSign * .22, 1.30, -.35];
    footPitch[stretch] = .90;
    hands[stretch] = [stretchSign * .24, 1.42, -.33];
    hands[1 - stretch] = [-stretchSign * .97, 2.02, .12];
  } else if (move === "chest-open") {
    hands = [[-.44, 1.53, -.43], [.44, 1.53, -.43]];
    lean[2] = -.03;
  } else if (move === "breathe") {
    // Rest in an easy, upright stance; the hands open gently with each breath.
    hands = [[-.40 - .14 * wave, 1.32 + .12 * wave, .08], [.40 + .14 * wave, 1.32 + .12 * wave, .08]];
  }

  // Settle the pelvis when the stance widens, preserving foot contact and exact leg length.
  for (let i = 0; i < 2; i++) {
    const dx = hips[0] + (i ? .19 : -.19) - feet[i][0], dz = hips[2] - feet[i][2];
    const leg = MOM_LIMBS.thigh + MOM_LIMBS.shin - .008;
    hips[1] = Math.min(hips[1], feet[i][1] + Math.sqrt(Math.max(.01, leg * leg - dx * dx - dz * dz)));
  }
  const spine = unit(lean);
  const shouldersCenter = add(hips, scale(spine, .78));
  const hipsPair: Pair = [add(hips, [-.19, 0, 0]), add(hips, [.19, 0, 0])];
  const across: Point = unit([spine[1], -spine[0], 0]);
  const shoulders: Pair = [add(shouldersCenter, scale(across, -.30)), add(shouldersCenter, scale(across, .30))];
  const knees: Pair = [[0, 0, 0], [0, 0, 0]], elbows: Pair = [[0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 2; i++) {
    hands[i] = reachable(shoulders[i], hands[i], MOM_LIMBS.upperArm, MOM_LIMBS.forearm);
    elbows[i] = joint(shoulders[i], hands[i], MOM_LIMBS.upperArm, MOM_LIMBS.forearm, [i ? .7 : -.7, -.3, -.3]);
    // Root/foot targets are bounded by the authoring tests; foot contacts are never moved by IK.
    knees[i] = joint(hipsPair[i], feet[i], MOM_LIMBS.thigh, MOM_LIMBS.shin, [0, 0, 1]);
  }
  return { hips, shouldersCenter, neck: add(hips, scale(spine, .86)), head: add(hips, scale(spine, 1.21)), hipsPair, shoulders, elbows, hands, knees, feet, footPitch };
}
