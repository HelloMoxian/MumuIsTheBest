export type DrawingShortcutTool =
  | "select"
  | "pan"
  | "shape"
  | "solid"
  | "sticker"
  | "preset"
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
  } = {},
): DrawingShortcutTool | undefined {
  if (
    options.blocked
    || options.metaKey
    || options.ctrlKey
    || options.altKey
    || options.repeat
    || key.length !== 1
  ) return undefined;
  return DRAWING_TOOL_BY_SHORTCUT.get(key.toUpperCase());
}
