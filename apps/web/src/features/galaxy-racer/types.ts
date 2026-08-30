export type RacerLane = -1 | 0 | 1;
export type RacerThemeId = "neon" | "crystal" | "solar";

export type FaceFrame = {
  centerX: number;
  x: number;
  y: number;
  width: number;
  height: number;
  seenAt: number;
};

export type RacerStageAttempt = {
  level: number;
  elapsedMs: number;
  collisions: number;
  completed: true;
};

export type RacerHudSnapshot = {
  distance: number;
  elapsedMs: number;
  speed: number;
  collisions: number;
  lane: RacerLane;
};

export type RacerStageConfig = {
  level: number;
  targetMs: number;
  theme: RacerThemeId;
  themeName: string;
  spawnGap: number;
  doubleChance: number;
  obstacleSpeedMin: number;
  obstacleSpeedMax: number;
  farApproachBoost: number;
  reactionDistance: number;
  maxVisibleVehicles: number;
};
