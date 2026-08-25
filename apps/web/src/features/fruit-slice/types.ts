export const FRUIT_SLICE_ROLES = ["爸爸", "妈妈", "木木", "姥姥", "奶奶", "小姨"] as const;
export const FRUIT_KINDS = ["carrot", "cucumber", "eggplant", "chicken", "fish"] as const;

export type FruitSliceRole = typeof FRUIT_SLICE_ROLES[number];
export type FruitKind = typeof FRUIT_KINDS[number];
export type GameItemKind = FruitKind | "bomb" | "lobster";
export type PlayerSide = "full" | "left" | "right";
export type GameMode = "single" | "versus";
export type Density = "relaxed" | "standard" | "busy" | "storm";
export type SwipeSensitivity = "gentle" | "standard" | "strong";

export type Point = { x: number; y: number };

export type FruitSliceSettings = {
  durationSeconds: number;
  density: Density;
  speedMultiplier: number;
  fruitSize: number;
  includeBombs: boolean;
  includeLobster: boolean;
  swipeSensitivity: SwipeSensitivity;
};

export type PlayerSelection = {
  role: FruitSliceRole;
  side: PlayerSide;
};

export type PlayerResult = PlayerSelection & {
  score: number;
  fruitSlices: number;
  lobsterSlices: number;
  bombsHit: number;
  maxCombo: number;
  fastestSwipe: number;
  superActivations: number;
};

export type TrackingHand = {
  id: string;
  side: PlayerSide;
  point: Point;
};

export type TrackingFrame = {
  hands: TrackingHand[];
  bodyCount: number;
  bodySides: { left: boolean; right: boolean };
};

export type GameHud = {
  remainingMs: number;
  paused: boolean;
  players: Array<PlayerResult & { combo: number; superRemainingMs: number }>;
};
