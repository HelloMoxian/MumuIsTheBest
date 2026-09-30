import type { MapFeature } from "./model";

export interface TerrainPass { id: string; name: string; longitude: number; latitude: number; elevation: number; source: string }
export interface TerrainInfo {
  available: boolean; message?: string; nationalZoom?: number; updatedAt?: string;
  bounds?: [number, number, number, number]; minZoom?: number; maxZoom?: number;
  passes?: TerrainPass[]; attribution?: string;
}
export const ELEVATION_STOPS = [
  { meters: 0, color: "#238348", name: "绿色" },
  { meters: 1000, color: "#1269cc", name: "蓝色" },
  { meters: 2000, color: "#e6c52c", name: "黄色" },
  { meters: 3000, color: "#e58022", name: "橙色" },
  { meters: 5000, color: "#943e32", name: "棕红色" },
  { meters: 7000, color: "#783fa0", name: "紫色" },
  { meters: 8900, color: "#101114", name: "黑色" },
] as const;
export const ELEVATION_COLORS = ELEVATION_STOPS.map(stop => stop.color);
export const ELEVATION_GRADIENT = `linear-gradient(to right, ${ELEVATION_STOPS.map(stop => `${stop.color} ${stop.meters / 8900 * 100}%`).join(",")})`;
export const ELEVATION_LEGEND = ELEVATION_STOPS.map(stop => `${stop.meters} 米${stop.name}`).join("，");
// Keep sea depths blue and transition to green at zero; positive heights share
// exactly the same stops as the labels and legend.
export const ELEVATION_RELIEF_STOPS: (number | string)[] = [-8000, "#11345b", -1, "#337fba",
  ...ELEVATION_STOPS.flatMap(stop => [stop.meters, stop.color])];
export function elevationColor(value: number): string {
  const height = Math.max(0, Math.min(8900, value));
  const i = Math.max(0, ELEVATION_STOPS.findIndex((stop, index) => index < ELEVATION_STOPS.length - 1 && height <= ELEVATION_STOPS[index + 1].meters));
  if (height === 8900) return ELEVATION_COLORS[ELEVATION_COLORS.length - 1];
  const t = (height - ELEVATION_STOPS[i].meters) / (ELEVATION_STOPS[i + 1].meters - ELEVATION_STOPS[i].meters);
  const rgb = (hex: string) => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
  const a = rgb(ELEVATION_COLORS[i]), b = rgb(ELEVATION_COLORS[i + 1]);
  return "#" + a.map((v, j) => Math.round(v + (b[j] - v) * t).toString(16).padStart(2, "0")).join("");
}
export function featureElevation(feature: MapFeature): number | null {
  const value = feature.properties.elevation;
  if (feature.properties.kind !== "elevation" || typeof value !== "number" || !Number.isFinite(value)) return null;
  // Old packs used zero for missing values. Only an explicit source label can establish a real zero.
  if (value === 0 && !String(feature.properties.detail).includes("海拔 0 米") && !feature.properties.approximate) return null;
  return value;
}
export function elevationLabel(feature: MapFeature): string {
  const value = featureElevation(feature);
  return value === null ? "海拔未收录" : `${feature.properties.approximate ? "约 " : ""}${value.toLocaleString("zh-CN")} 米`;
}
export function passFeature(pass: TerrainPass): MapFeature {
  return { type: "Feature", geometry: { type: "Point", coordinates: [pass.longitude, pass.latitude] },
    properties: { id: "pass-" + pass.id, name: pass.name, kind: "elevation", elevation: pass.elevation, approximate: true, focusZoom: 12,
      detail: `关口附近地面约 ${pass.elevation.toLocaleString("zh-CN")} 米。来自高程网格，取整到 10 米；不是关楼高度或道路最高点。放大观察周围山脊与谷地。` } };
}
