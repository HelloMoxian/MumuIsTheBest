/** Explicit attachment points in the original full atlas cells; never inferred at runtime. */
export type MomPartName = "head" | "torso" | "upper-arm" | "forearm" | "hand" | "thigh" | "shin" | "shoe";
/** Index 0 is the coach's right hand; index 1 is her left. Hand artwork has
 * its own handedness: front thumbs point inward, side thumbs point forward. */
export const MOM_HAND_MIRROR = { front: [false, true], side: [true, true] } as const;
export interface MomPartArt {
  src: string;
  bounds: [number, number, number, number];
  start: [number, number];
  end?: [number, number];
}
function part(view: "front" | "side", name: MomPartName, bounds: MomPartArt["bounds"], start: MomPartArt["start"], end?: MomPartArt["end"]): MomPartArt {
  return { src: `/images/fat-burn/mom-v3/${view}-${name}.png`, bounds, start, end };
}
export const MOM_ART: Record<"front" | "side", Record<MomPartName, MomPartArt>> = {
  front: {
    head: part("front", "head", [95, 46, 160, 222], [157, 258]),
    torso: part("front", "torso", [63, 46, 185, 236], [154, 76], [156, 267]),
    "upper-arm": part("front", "upper-arm", [105, 46, 69, 226], [139, 77], [153, 260]),
    forearm: part("front", "forearm", [116, 50, 57, 221], [139, 60], [155, 262]),
    hand: part("front", "hand", [122, 62, 74, 174], [148, 71]),
    thigh: part("front", "thigh", [97, 25, 96, 228], [145, 45], [153, 237]),
    shin: part("front", "shin", [111, 31, 59, 222], [141, 42], [144, 240]),
    shoe: part("front", "shoe", [99, 63, 92, 179], [149, 119]),
  },
  side: {
    head: part("side", "head", [60, 40, 194, 212], [178, 232]),
    torso: part("side", "torso", [107, 35, 111, 227], [135, 68], [159, 244]),
    "upper-arm": part("side", "upper-arm", [108, 45, 68, 211], [140, 72], [147, 245]),
    forearm: part("side", "forearm", [113, 49, 67, 206], [137, 60], [159, 247]),
    hand: part("side", "hand", [134, 38, 66, 185], [159, 48]),
    thigh: part("side", "thigh", [101, 17, 93, 222], [148, 37], [161, 225]),
    shin: part("side", "shin", [109, 17, 58, 221], [138, 28], [141, 225]),
    shoe: part("side", "shoe", [42, 85, 188, 127], [93, 139]),
  },
};
