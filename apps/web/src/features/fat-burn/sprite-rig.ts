import { FLOOR_MOVES, type Point } from "./pose";
import type { MoveId } from "./plan";

export type ScreenPoint = readonly [number, number];
export type SpriteMatrix = [number, number, number, number, number, number];

/** Fixed proportions: only the length of a limb is shortened by the camera. */
export const MOM_SPRITE_DIMENSIONS = {
  headHeight: .64,
  handHeight: .23,
  frontShoe: [.23, .175],
  sideShoe: [.36, .21],
} as const;

export const MOM_SPRITE_WIDTHS = {
  torso: 1,
  "upper-arm": 1,
  forearm: 1,
  thigh: 1,
  shin: 1,
} as const;

const CONTACT_VIEW_MOVES: readonly MoveId[] = [...FLOOR_MOVES, "chair-stand", "wall-push", "wall-plank", "bottle-row", "hip-hinge", "calf-raise", "hamstring-stretch"];

/** Side/oblique views expose hip hinges and support surfaces that disappear from the front. */
export function momDemonstrationView(move: MoveId, requestedProfile = false): boolean {
  return requestedProfile || CONTACT_VIEW_MOVES.includes(move);
}

export function momDemonstrationViewNote(move: MoveId): string | null {
  return CONTACT_VIEW_MOVES.includes(move) ? "侧面示范 · 看清身体姿势与支撑位置" : null;
}

export function momProjection(width: number, height: number, profile: boolean, move?: MoveId) {
  const floorMove = move !== undefined && FLOOR_MOVES.includes(move);
  const contactView = move !== undefined && CONTACT_VIEW_MOVES.includes(move);
  const scale = Math.min(height / (floorMove ? 2.1 : 3.58), width / (floorMove ? 3.95 : contactView ? 3.05 : profile ? 2.45 : 3.15));
  const floor = height * (floorMove ? .69 : .935);
  return {
    scale,
    floor,
    point: (p: Point): ScreenPoint => [width / 2 + (contactView ? p[2] * .96 + p[0] * .28 : profile ? p[2] : p[0]) * scale, floor - (p[1] - (contactView ? (p[0] * .96 - p[2] * .28) * .08 : 0)) * scale],
    depth: (p: Point): number => profile ? -p[0] : p[2],
  };
}

/**
 * Maps the two painted joint anchors exactly onto their projected joints.
 * The perpendicular scale is independent of the projected bone length so an
 * arm reaching toward the viewer keeps a natural width instead of vanishing.
 */
export function limbSpriteMatrix(
  sourceStart: ScreenPoint,
  sourceEnd: ScreenPoint,
  targetStart: ScreenPoint,
  targetEnd: ScreenPoint,
  widthScale: number,
  mirror = false,
): SpriteMatrix {
  const sx = sourceEnd[0] - sourceStart[0], sy = sourceEnd[1] - sourceStart[1];
  const sourceLength = Math.hypot(sx, sy) || 1;
  const ux = sx / sourceLength, uy = sy / sourceLength;
  const dx = targetEnd[0] - targetStart[0], dy = targetEnd[1] - targetStart[1];
  const targetLength = Math.hypot(dx, dy);
  const vx = targetLength > .000001 ? dx / targetLength : 0;
  const vy = targetLength > .000001 ? dy / targetLength : 1;
  const lengthScale = targetLength / sourceLength;
  const across = widthScale * (mirror ? -1 : 1);
  const a = vx * ux * lengthScale + vy * uy * across;
  const b = vy * ux * lengthScale - vx * uy * across;
  const c = vx * uy * lengthScale - vy * ux * across;
  const d = vy * uy * lengthScale + vx * ux * across;
  return [a, b, c, d, targetStart[0] - a * sourceStart[0] - c * sourceStart[1], targetStart[1] - b * sourceStart[0] - d * sourceStart[1]];
}

/** Rigid attachments preserve the face and palms rather than stretching them. */
export function attachedSpriteMatrix(
  sourcePivot: ScreenPoint,
  targetPivot: ScreenPoint,
  xScale: number,
  yScale: number,
  rotation = 0,
  mirror = false,
): SpriteMatrix {
  const cosine = Math.cos(rotation), sine = Math.sin(rotation);
  const a = cosine * xScale * (mirror ? -1 : 1), b = sine * xScale * (mirror ? -1 : 1);
  const c = -sine * yScale, d = cosine * yScale;
  return [a, b, c, d, targetPivot[0] - a * sourcePivot[0] - c * sourcePivot[1], targetPivot[1] - b * sourcePivot[0] - d * sourcePivot[1]];
}

export function angleDown(start: ScreenPoint, end: ScreenPoint): number {
  return Math.hypot(end[0] - start[0], end[1] - start[1]) < .000001 ? 0 : Math.atan2(end[1] - start[1], end[0] - start[0]) - Math.PI / 2;
}
