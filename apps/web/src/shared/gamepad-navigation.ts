export type GamepadDirection = "up" | "down" | "left" | "right";

export type GlobalGamepadBindings = {
  schemaVersion: 1;
  accept: number;
  back: number;
  fullscreenEnter: number;
  fullscreenExit: number;
};

export const DEFAULT_GLOBAL_GAMEPAD_BINDINGS: GlobalGamepadBindings = {
  schemaVersion: 1,
  accept: 0,
  back: 1,
  fullscreenEnter: 10,
  fullscreenExit: 10,
};

export function parseGlobalGamepadBindings(value: unknown): GlobalGamepadBindings | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GlobalGamepadBindings>;
  if (candidate.schemaVersion !== 1) return null;
  const bindings = [candidate.accept, candidate.back, candidate.fullscreenEnter, candidate.fullscreenExit];
  if (!bindings.every(binding => Number.isInteger(binding) && Number(binding) >= 0 && Number(binding) <= 31)) return null;
  return candidate as GlobalGamepadBindings;
}

export type NavigationRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const center = (rect: NavigationRect) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

export function spatialNavigationScore(
  origin: NavigationRect,
  candidate: NavigationRect,
  direction: GamepadDirection,
) {
  const from = center(origin);
  const to = center(candidate);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const primary = direction === "left" ? -dx
    : direction === "right" ? dx
      : direction === "up" ? -dy
        : dy;
  if (primary <= 2) return Number.POSITIVE_INFINITY;
  const secondary = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
  const overlap = direction === "left" || direction === "right"
    ? Math.min(origin.bottom, candidate.bottom) - Math.max(origin.top, candidate.top)
    : Math.min(origin.right, candidate.right) - Math.max(origin.left, candidate.left);
  const anglePenalty = secondary / primary;
  return primary + secondary * (overlap > 0 ? 0.18 : 0.72) + anglePenalty * 180;
}

export function chooseSpatialIndex(
  originIndex: number,
  rects: readonly NavigationRect[],
  direction: GamepadDirection,
) {
  const origin = rects[originIndex];
  if (!origin) return -1;
  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  rects.forEach((candidate, index) => {
    if (index === originIndex) return;
    const score = spatialNavigationScore(origin, candidate, direction);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function moveGridIndex(index: number, direction: GamepadDirection, columns: number, count: number) {
  if (count <= 0 || columns <= 0) return -1;
  const safe = Math.max(0, Math.min(count - 1, index));
  const row = Math.floor(safe / columns);
  const column = safe % columns;
  if (direction === "left") return column > 0 ? safe - 1 : safe;
  if (direction === "right") return column < columns - 1 && safe + 1 < count ? safe + 1 : safe;
  if (direction === "up") return row > 0 ? safe - columns : safe;
  return safe + columns < count ? safe + columns : safe;
}

export function nextSteppedValue(
  value: number,
  direction: GamepadDirection,
  options: { min?: number; max?: number; step?: number },
) {
  const step = Number.isFinite(options.step) && options.step! > 0 ? options.step! : 1;
  const delta = direction === "left" || direction === "down" ? -step : step;
  const precision = Math.max(0, (String(step).split(".")[1] ?? "").length);
  const next = Number((value + delta).toFixed(precision));
  return Math.max(options.min ?? Number.NEGATIVE_INFINITY, Math.min(options.max ?? Number.POSITIVE_INFINITY, next));
}

export function isNumericDraft(value: string) {
  return /^-?(?:\d+\.?\d*|\.\d*|)$/.test(value);
}
