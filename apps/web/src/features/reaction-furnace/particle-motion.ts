export type FreeAtomMotion = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  spawnedAt: number;
  driftTargetX: number;
  driftTargetY: number;
  diffusionSeed: number;
};

type CreateInjectedMotionOptions = {
  particleId: number;
  index: number;
  count: number;
  width: number;
  height: number;
  now: number;
  radius?: number;
  reducedMotion?: boolean;
  random?: () => number;
};

type MotionBounds = {
  width: number;
  height: number;
};

export type StableStructureSlot = {
  index: number;
  row: number;
  column: number;
  columns: number;
  rows: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  structureWidth: number;
  structureHeight: number;
};

export type StableStructureMotion = {
  centerX: number;
  centerY: number;
  vx: number;
  vy: number;
  diffusionSeed: number;
};

const GOLDEN_RATIO_FRACTION = 0.61803398875;
const SECONDARY_SPREAD_FRACTION = 0.754877666;
const TRANSPORT_DURATION_MS = 5_200;
const STABLE_STRUCTURE_MAX_SPEED = 0.72;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function fraction(value: number) {
  return value - Math.floor(value);
}

function getSafeBounds(width: number, height: number, radius: number) {
  return {
    left: radius + 18,
    right: width - radius - 18,
    top: radius + 20,
    bottom: height - radius - 40,
  };
}

export function createInjectedAtomMotion({
  particleId,
  index,
  count,
  width,
  height,
  now,
  radius = 15,
  reducedMotion = false,
  random = Math.random,
}: CreateInjectedMotionOptions): FreeAtomMotion {
  const bounds = getSafeBounds(width, height, radius);
  const usableWidth = Math.max(1, bounds.right - bounds.left);
  const usableHeight = Math.max(1, bounds.bottom - bounds.top);
  const spreadX = fraction((particleId + 0.5) * GOLDEN_RATIO_FRACTION);
  const spreadY = fraction((particleId + 0.5) * SECONDARY_SPREAD_FRACTION);
  const driftTargetX = bounds.left + usableWidth * (0.08 + spreadX * 0.74);
  const driftTargetY = bounds.top + usableHeight * (0.06 + spreadY * 0.88);

  if (reducedMotion) {
    return {
      x: driftTargetX,
      y: driftTargetY,
      vx: 0,
      vy: 0,
      radius,
      spawnedAt: now,
      driftTargetX,
      driftTargetY,
      diffusionSeed: particleId * 1.137,
    };
  }

  const entryWidth = Math.min(96, Math.max(42, width * 0.065));
  const x = bounds.right - 8 - random() * entryWidth;
  const laneRatio = count > 1
    ? (index + 0.5) / count
    : fraction((particleId + now * 0.001) * SECONDARY_SPREAD_FRACTION);
  const y = clamp(
    bounds.top + laneRatio * usableHeight + (random() - 0.5) * 28,
    bounds.top,
    bounds.bottom,
  );
  const targetDistance = Math.hypot(driftTargetX - x, driftTargetY - y) || 1;
  const injectionSpeed = 5.6 + random() * 1.5;

  return {
    x,
    y,
    vx: ((driftTargetX - x) / targetDistance) * injectionSpeed,
    vy: ((driftTargetY - y) / targetDistance) * injectionSpeed + (random() - 0.5) * 0.8,
    radius,
    spawnedAt: now,
    driftTargetX,
    driftTargetY,
    diffusionSeed: particleId * 1.137 + random() * Math.PI,
  };
}

export function advanceFreeAtomMotion(
  particle: FreeAtomMotion,
  { width, height }: MotionBounds,
  now: number,
  delta: number,
  random: () => number = Math.random,
) {
  const safeDelta = clamp(delta, 0.35, 2);
  const age = Math.max(0, now - particle.spawnedAt);
  const targetDx = particle.driftTargetX - particle.x;
  const targetDy = particle.driftTargetY - particle.y;
  const targetDistance = Math.hypot(targetDx, targetDy);
  const transporting = age < TRANSPORT_DURATION_MS && targetDistance > 54;

  if (transporting) {
    const desiredSpeed = clamp(targetDistance / 105, 4.8, 7.1);
    const steer = Math.min(0.13, 0.045 * safeDelta);
    particle.vx += ((targetDx / targetDistance) * desiredSpeed - particle.vx) * steer;
    particle.vy += ((targetDy / targetDistance) * desiredSpeed - particle.vy) * steer;
  }

  const noiseStrength = transporting ? 0.075 : 0.18;
  particle.vx += (random() - 0.5) * noiseStrength * safeDelta;
  particle.vy += (random() - 0.5) * noiseStrength * safeDelta;

  const phase = now * 0.00115 + particle.diffusionSeed;
  particle.vx += Math.cos(phase * 1.17) * 0.026 * safeDelta;
  particle.vy += Math.sin(phase * 0.93) * 0.03 * safeDelta;

  if (particle.x > width * 0.78) {
    particle.vx -= 0.085 * safeDelta;
  }

  const drag = Math.pow(transporting ? 0.9995 : 0.997, safeDelta);
  particle.vx *= drag;
  particle.vy *= drag;

  let speed = Math.hypot(particle.vx, particle.vy);
  const maximumSpeed = transporting ? 7.4 : 4.6;
  if (speed > maximumSpeed) {
    particle.vx = (particle.vx / speed) * maximumSpeed;
    particle.vy = (particle.vy / speed) * maximumSpeed;
    speed = maximumSpeed;
  }
  if (!transporting && speed < 1.75) {
    const boost = Math.min(0.12, (1.75 - speed) * 0.075) * safeDelta;
    particle.vx += Math.cos(phase) * boost;
    particle.vy += Math.sin(phase) * boost;
  }

  particle.x += particle.vx * safeDelta;
  particle.y += particle.vy * safeDelta;

  const bounds = getSafeBounds(width, height, particle.radius);
  if (particle.x < bounds.left) {
    particle.x = bounds.left;
    particle.vx = Math.abs(particle.vx);
  } else if (particle.x > bounds.right) {
    particle.x = bounds.right;
    particle.vx = -Math.abs(particle.vx);
  }
  if (particle.y < bounds.top) {
    particle.y = bounds.top;
    particle.vy = Math.abs(particle.vy);
  } else if (particle.y > bounds.bottom) {
    particle.y = bounds.bottom;
    particle.vy = -Math.abs(particle.vy);
  }
}

export function getStableStructureSlot(
  index: number,
  count: number,
  { width, height }: MotionBounds,
): StableStructureSlot {
  const safeCount = Math.max(1, Math.floor(count));
  const safeIndex = clamp(Math.floor(index), 0, safeCount - 1);
  const wideLayout = width >= 720;
  const columns = Math.min(wideLayout ? 5 : 2, safeCount);
  const rows = Math.ceil(safeCount / columns);
  const horizontalPadding = wideLayout ? 28 : 20;
  const topPadding = 34;
  const bottomPadding = 54;
  const columnGap = wideLayout ? 12 : 10;
  const rowGap = 14;
  const usableWidth = Math.max(
    1,
    width - horizontalPadding * 2 - columnGap * (columns - 1),
  );
  const usableHeight = Math.max(
    1,
    height - topPadding - bottomPadding - rowGap * (rows - 1),
  );
  const cellWidth = usableWidth / columns;
  const cellHeight = usableHeight / rows;
  const row = Math.floor(safeIndex / columns);
  const column = safeIndex % columns;
  const cellLeft = horizontalPadding + column * (cellWidth + columnGap);
  const cellTop = topPadding + row * (cellHeight + rowGap);

  return {
    index: safeIndex,
    row,
    column,
    columns,
    rows,
    centerX: cellLeft + cellWidth / 2,
    centerY: cellTop + cellHeight * 0.46,
    width: cellWidth,
    height: cellHeight,
    structureWidth: Math.max(46, cellWidth - (wideLayout ? 28 : 22)),
    structureHeight: Math.max(40, cellHeight - 50),
  };
}

export function advanceStableStructureMotion(
  motion: StableStructureMotion,
  slot: StableStructureSlot,
  now: number,
  delta: number,
  reducedMotion = false,
) {
  if (reducedMotion) {
    motion.centerX = slot.centerX;
    motion.centerY = slot.centerY;
    motion.vx = 0;
    motion.vy = 0;
    return;
  }

  const safeDelta = clamp(delta, 0.35, 2);
  const driftX = Math.min(4.5, slot.width * 0.022);
  const driftY = Math.min(3.5, slot.height * 0.022);
  const slowPhase = now * 0.00011 + motion.diffusionSeed;
  const targetX = slot.centerX + Math.sin(slowPhase * 1.07) * driftX;
  const targetY = slot.centerY + Math.cos(slowPhase * 0.83) * driftY;
  const desiredVx = clamp(
    (targetX - motion.centerX) * 0.012,
    -STABLE_STRUCTURE_MAX_SPEED,
    STABLE_STRUCTURE_MAX_SPEED,
  );
  const desiredVy = clamp(
    (targetY - motion.centerY) * 0.012,
    -STABLE_STRUCTURE_MAX_SPEED,
    STABLE_STRUCTURE_MAX_SPEED,
  );
  const steering = 1 - Math.pow(0.945, safeDelta);
  motion.vx += (desiredVx - motion.vx) * steering;
  motion.vy += (desiredVy - motion.vy) * steering;
  motion.centerX += motion.vx * safeDelta;
  motion.centerY += motion.vy * safeDelta;
}
