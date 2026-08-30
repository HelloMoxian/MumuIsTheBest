import type { RacerLane, RacerStageAttempt, RacerStageConfig, RacerThemeId } from "./types";

export const RACER_STAGE_TARGETS_MS = [80_000, 70_000, 60_000, 55_000, 50_000, 45_000] as const;
export const RACER_ROAD_LENGTH = 1_000;
export const RACER_INITIAL_SPEED = 15;
export const RACER_ACCELERATION = 0.35;
export const RACER_MAX_DURATION_MS = 180_000;
export const RACER_CENTER_ZONE = { left: 0.425, right: 0.575 } as const;

const themes: Array<{ id: RacerThemeId; name: string }> = [
  { id: "neon", name: "霓虹星际城" },
  { id: "crystal", name: "晶体彗星峡谷" },
  { id: "solar", name: "太阳环花园" },
];

export const RACER_STAGES: RacerStageConfig[] = RACER_STAGE_TARGETS_MS.map((targetMs, index) => {
  const theme = themes[index % themes.length];
  return {
    level: index + 1,
    targetMs,
    theme: theme.id,
    themeName: theme.name,
    spawnGap: [190, 180, 170, 160, 150, 140][index],
    doubleChance: [0.04, 0.06, 0.1, 0.14, 0.18, 0.24][index],
    obstacleSpeedMin: [10.5, 10.8, 11, 11.2, 11.5, 11.8][index],
    obstacleSpeedMax: [13, 13.3, 13.6, 14, 14.4, 14.8][index],
    farApproachBoost: [18, 20, 22, 24, 26, 28][index],
    reactionDistance: [230, 225, 220, 215, 210, 205][index],
    maxVisibleVehicles: [2, 2, 3, 3, 3, 4][index],
  };
});

export function stageConfig(level: number) {
  return RACER_STAGES[Math.max(0, Math.min(RACER_STAGES.length - 1, level - 1))];
}

export function laneFromHeadPosition(current: RacerLane, x: number): RacerLane {
  const clamped = Math.max(0, Math.min(1, x));
  if (current === -1) return clamped >= 0.45 ? 0 : -1;
  if (current === 1) return clamped <= 0.55 ? 0 : 1;
  if (clamped <= 0.4) return -1;
  if (clamped >= 0.6) return 1;
  return 0;
}

export function smoothHeadPosition(previous: number, current: number, alpha = 0.28) {
  return previous + (current - previous) * Math.max(0, Math.min(1, alpha));
}

export function cubicBezierValue(t: number, p1: number, p2: number) {
  const x = Math.max(0, Math.min(1, t));
  const inverse = 1 - x;
  return 3 * inverse * inverse * x * p1 + 3 * inverse * x * x * p2 + x * x * x;
}

export function collisionSpeed(speed: number) {
  return Math.max(speed * 0.58, 10);
}

export function stageReachedTarget(attempt: RacerStageAttempt) {
  const target = RACER_STAGE_TARGETS_MS[attempt.level - 1];
  return target !== undefined && attempt.completed && attempt.elapsedMs <= target;
}

export function sequentialPassedLevels(attempts: RacerStageAttempt[]) {
  let passed = 0;
  for (let index = 0; index < Math.min(attempts.length, RACER_STAGE_TARGETS_MS.length); index += 1) {
    const attempt = attempts[index];
    if (attempt.level !== index + 1 || !stageReachedTarget(attempt)) break;
    passed += 1;
  }
  return passed;
}

export function energyRewardForAttempts(attempts: RacerStageAttempt[]) {
  return sequentialPassedLevels(attempts) * 10;
}

export function formatRaceTime(milliseconds: number) {
  return `${(milliseconds / 1_000).toFixed(1)} 秒`;
}
