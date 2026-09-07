import type { MoveId } from "./plan";
import { FLOOR_MOVES, MOM_SUPPORTS, type MomPose, type Point } from "./pose";

export interface MomPropShape {
  points: Point[];
  fill: "--glass-700" | "--violet-600" | "--cyan-300" | "--ink-primary" | null;
  stroke: "--cyan-300" | "--violet-400";
  width: number;
  closed: boolean;
}

/** Props share the model's coordinates, so moving joints cannot drift away from a support. */
export function momPropShapes(move: MoveId, pose: MomPose, foreground = false): MomPropShape[] {
  const shapes: MomPropShape[] = [];
  const add = (points: Point[], fill: MomPropShape["fill"], width = .012, closed = true) => shapes.push({ points, fill, stroke: "--cyan-300", width, closed });
  if (foreground) {
    if (move === "bottle-row") for (const hand of pose.hands) {
      const [x, y, z] = hand;
      add([[x, y + .015, z - .045], [x, y + .015, z + .065], [x, y - .29, z + .065], [x, y - .29, z - .045]], "--glass-700");
      add([[x, y - .14, z - .038], [x, y - .14, z + .058], [x, y - .28, z + .058], [x, y - .28, z - .038]], "--cyan-300", .005);
      add([[x, y + .045, z - .027], [x, y + .045, z + .047], [x, y + .015, z + .047], [x, y + .015, z - .027]], "--ink-primary", .006);
    }
    return shapes;
  }
  if (FLOOR_MOVES.includes(move)) {
    add([[-.62, 0, -1.82], [.62, 0, -1.82], [.62, 0, 1.62], [-.62, 0, 1.62]], "--violet-600", .018);
  }
  if (move === "wall-push" || move === "wall-plank") {
    const z = MOM_SUPPORTS.wallZ;
    add([[-.63, 0, z], [.63, 0, z], [.63, 2.9, z], [-.63, 2.9, z]], "--glass-700", .024);
    for (const hand of pose.hands) add([[hand[0] - .09, hand[1] - .04, z], [hand[0] + .09, hand[1] - .04, z], [hand[0] + .09, hand[1] + .25, z], [hand[0] - .09, hand[1] + .25, z]], null, .006);
  }
  if (move === "chair-stand" || move === "calf-raise") {
    const support = move === "calf-raise";
    const back = support ? MOM_SUPPORTS.supportChairZ : MOM_SUPPORTS.chairBackZ;
    const front = support ? 1.08 : .04;
    const top = support ? MOM_SUPPORTS.supportChairY : 1.57;
    const seat = MOM_SUPPORTS.chairSeatY;
    for (const x of [-.43, .43]) {
      add([[x, 0, back], [x, top, back]], null, .035, false);
      add([[x, 0, front], [x, seat, front]], null, .035, false);
    }
    add([[-.43, seat, back], [.43, seat, back], [.43, seat, front], [-.43, seat, front]], "--violet-600", .035);
    add([[-.43, top - .34, back], [.43, top - .34, back], [.43, top, back], [-.43, top, back]], "--glass-700", .03);
  }
  return shapes;
}
