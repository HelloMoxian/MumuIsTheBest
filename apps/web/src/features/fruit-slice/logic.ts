import type { Density, Point, SwipeSensitivity } from "./types";

export const SWIPE_PROFILES: Readonly<Record<SwipeSensitivity, {
  minimumSpeed: number;
  minimumDistance: number;
}>> = {
  gentle: { minimumSpeed: 0.38, minimumDistance: 0.022 },
  standard: { minimumSpeed: 0.58, minimumDistance: 0.034 },
  strong: { minimumSpeed: 0.82, minimumDistance: 0.048 },
};

export type SwipeSegment = {
  from: Point;
  to: Point;
  speed: number;
  distance: number;
  active: boolean;
};

export type ComboState = {
  combo: number;
  lastHitAt: number;
  recentHits: number[];
  superUntil: number;
};

export function smoothPoint(previous: Point | undefined, next: Point, alpha = 0.46): Point {
  if (!previous) return next;
  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha,
  };
}

export function evaluateSwipe(
  from: Point,
  to: Point,
  elapsedMs: number,
  sensitivity: SwipeSensitivity,
): SwipeSegment {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const speed = elapsedMs > 0 ? distance / (elapsedMs / 1_000) : 0;
  const profile = SWIPE_PROFILES[sensitivity];
  return {
    from,
    to,
    speed,
    distance,
    active: distance >= profile.minimumDistance && speed >= profile.minimumSpeed,
  };
}

export function pointToSegmentDistance(point: Point, from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const projection = Math.max(0, Math.min(1, (
    (point.x - from.x) * dx + (point.y - from.y) * dy
  ) / lengthSquared));
  return Math.hypot(
    point.x - (from.x + projection * dx),
    point.y - (from.y + projection * dy),
  );
}

export function swipeHitsCircle(segment: SwipeSegment, center: Point, radius: number) {
  return segment.active && pointToSegmentDistance(center, segment.from, segment.to) <= radius;
}

export function scoreForSlice(speed: number, multiplier: 1 | 3) {
  const speedScore = Math.max(12, Math.min(80, Math.round(12 + speed * 24)));
  return speedScore * multiplier;
}

export function bombPenalty() {
  return 30;
}

export function collisionRadiusForSize(size: number) {
  return size * 0.42;
}

export function recordSuccessfulSlice(state: ComboState, now: number) {
  const recentHits = [...state.recentHits.filter((time) => now - time <= 2_500), now];
  const combo = now - state.lastHitAt <= 1_200 ? state.combo + 1 : 1;
  const activated = recentHits.length >= 6 && now >= state.superUntil;
  const superUntil = activated ? now + 6_000 : state.superUntil;
  return {
    state: { combo, lastHitAt: now, recentHits, superUntil },
    multiplier: (now < superUntil ? 3 : 1) as 1 | 3,
    activated,
  };
}

export function resetCombo(state: ComboState): ComboState {
  return { ...state, combo: 0, lastHitAt: 0, recentHits: [] };
}

export function pairedLaneSpawn(random: () => number = Math.random) {
  const x = 0.12 + random() * 0.28;
  const velocityX = (random() - 0.5) * 0.24;
  const velocityY = -(1.08 + random() * 0.32);
  return [
    { side: "left" as const, x, velocityX, velocityY },
    { side: "right" as const, x: 1 - x, velocityX: -velocityX, velocityY },
  ];
}

export function densityInterval(density: "relaxed" | "standard" | "busy" | "storm") {
  return { relaxed: 1_350, standard: 1_000, busy: 720, storm: 520 }[density];
}

export function randomizedWaveDelay(density: Density, random: () => number = Math.random) {
  return Math.round(densityInterval(density) * (0.55 + random() * 1.1));
}

export function waveObjectCount(density: Density, random: () => number = Math.random) {
  const [minimum, maximum] = {
    relaxed: [1, 2],
    standard: [2, 4],
    busy: [3, 5],
    storm: [4, 6],
  }[density];
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

export type FruitWaveSpawn = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
};

export function fruitWaveFormation(
  count: number,
  lane: "full" | "left",
  random: () => number = Math.random,
): FruitWaveSpawn[] {
  const safeCount = Math.max(1, Math.min(lane === "left" ? 3 : 6, Math.round(count)));
  const [minimumX, maximumX] = lane === "full" ? [0.13, 0.87] : [0.08, 0.42];
  const center = (minimumX + maximumX) / 2
    + (random() - 0.5) * (maximumX - minimumX) * 0.18;
  const pattern = Math.min(2, Math.floor(random() * 3));
  const baseVelocityY = -(0.88 + random() * 0.5);
  const direction = random() < 0.5 ? -1 : 1;
  const spacing = Math.min(
    (maximumX - minimumX) / (safeCount + 0.5),
    lane === "full" ? 0.16 : 0.105,
  );

  return Array.from({ length: safeCount }, (_, index) => {
    const offset = index - (safeCount - 1) / 2;
    const x = Math.max(minimumX, Math.min(maximumX, center + offset * spacing));
    if (pattern === 0) {
      return {
        x,
        y: 1.12 + Math.abs(offset) * 0.012,
        velocityX: direction * 0.045 - offset * 0.012,
        velocityY: baseVelocityY - Math.abs(offset) * 0.035,
      };
    }
    if (pattern === 1) {
      return {
        x,
        y: 1.12 + offset * direction * 0.025,
        velocityX: direction * 0.035,
        velocityY: baseVelocityY + offset * direction * 0.055,
      };
    }
    return {
      x,
      y: 1.12 + Math.abs(offset) * 0.018,
      velocityX: -offset * 0.055,
      velocityY: baseVelocityY + Math.abs(offset) * 0.045,
    };
  });
}
