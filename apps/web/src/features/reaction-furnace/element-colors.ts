import { ELEMENTS } from "../periodic-table/elements.generated";

export type ReactionElementTheme = {
  color: string;
  rgb: string;
};

const CATEGORY_COLORS: Readonly<Record<string, string>> = {
  "alkali-metal": "#ff749d",
  "alkaline-earth": "#ffb266",
  "transition-metal": "#7a9dff",
  "post-transition-metal": "#64d6d0",
  metalloid: "#73e29a",
  nonmetal: "#54e6ff",
  halogen: "#d57cff",
  "noble-gas": "#ff75d8",
  lanthanide: "#f3d463",
  actinide: "#ef8cf4",
};

export const COMMON_ELEMENT_COLORS = {
  H: "#b8e8ff",
  C: "#4f5565",
  N: "#3657c8",
  O: "#168f5f",
  Na: "#a93a4e",
  Ca: "#ff9aae",
  F: "#c7a7ff",
  Cl: "#6e3baa",
  S: "#f3d44e",
  K: "#f39a38",
} as const;

function hexToRgb(color: string) {
  const normalized = color.replace("#", "");
  const channels = normalized.match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16));
  return channels?.length === 3 ? channels.join(", ") : "141, 161, 255";
}

const ELEMENT_THEME = new Map(
  ELEMENTS.map((element) => {
    const commonColor = COMMON_ELEMENT_COLORS[
      element.symbol as keyof typeof COMMON_ELEMENT_COLORS
    ];
    const color = commonColor
      ?? CATEGORY_COLORS[element.category]
      ?? "#8da1ff";
    return [element.symbol, { color, rgb: hexToRgb(color) }] as const;
  }),
);

const FALLBACK_THEME: ReactionElementTheme = {
  color: "#8da1ff",
  rgb: "141, 161, 255",
};

export function getReactionElementTheme(symbol: string): ReactionElementTheme {
  return ELEMENT_THEME.get(symbol) ?? FALLBACK_THEME;
}
