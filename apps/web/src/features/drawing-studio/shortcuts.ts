export type DrawingShortcutTool =
  | "select"
  | "pan"
  | "shape"
  | "solid"
  | "sticker"
  | "preset"
  | "text"
  | "brush"
  | "eraser"
  | "fill";

export const DRAWING_TOOL_SHORTCUTS: Readonly<Record<DrawingShortcutTool, string>> = {
  select: "V",
  pan: "H",
  shape: "U",
  solid: "D",
  sticker: "K",
  preset: "P",
  text: "T",
  brush: "B",
  eraser: "E",
  fill: "G",
};

const DRAWING_TOOL_BY_SHORTCUT = new Map<string, DrawingShortcutTool>(
  Object.entries(DRAWING_TOOL_SHORTCUTS).map(([tool, shortcut]) => [
    shortcut,
    tool as DrawingShortcutTool,
  ]),
);

export function drawingToolForShortcut(
  key: string,
  options: {
    blocked?: boolean;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    repeat?: boolean;
    isComposing?: boolean;
    code?: string;
  } = {},
): DrawingShortcutTool | undefined {
  if (
    options.blocked
    || options.metaKey
    || options.ctrlKey
    || options.altKey
    || options.repeat
    || options.isComposing
  ) return undefined;
  const physicalKey = options.code?.match(/^Key([A-Z])$/)?.[1];
  return DRAWING_TOOL_BY_SHORTCUT.get(physicalKey ?? key.toUpperCase());
}

export function arrowMovement(key: string, repeat: boolean) {
  const step = repeat ? 10 : 1;
  switch (key) {
    case "ArrowLeft": return { x: -step, y: 0 };
    case "ArrowRight": return { x: step, y: 0 };
    case "ArrowUp": return { x: 0, y: -step };
    case "ArrowDown": return { x: 0, y: step };
    default: return null;
  }
}

type NavigationRect = { left: number; top: number; width: number; height: number };

/** Follow visible rows/columns, including wrapped menus and responsive grids. */
export function spatialNavigationIndex(rects: NavigationRect[], current: number, key: string): number {
  const direction = arrowMovement(key, false);
  const source = rects[current];
  if (!direction || !source) return current;
  const horizontal = direction.x !== 0;
  const center = (r: NavigationRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const origin = center(source);
  let best = current;
  let score = Infinity;
  rects.forEach((rect, index) => {
    if (index === current) return;
    const point = center(rect);
    const forward = (point.x - origin.x) * direction.x + (point.y - origin.y) * direction.y;
    if (forward <= 1) return;
    const perpendicular = Math.abs(horizontal ? point.y - origin.y : point.x - origin.x);
    const overlap = horizontal
      ? Math.abs(point.y - origin.y) < (rect.height + source.height) / 2
      : Math.abs(point.x - origin.x) < (rect.width + source.width) / 2;
    const distance = (overlap ? 0 : 1_000_000) + forward + perpendicular * 2;
    if (distance < score) { best = index; score = distance; }
  });
  return best;
}
