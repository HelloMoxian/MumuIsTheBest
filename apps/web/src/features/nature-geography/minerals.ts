import rawAtlas from "../../../../../content/nature/maps/mineral-atlas.v1.json";
import { countryProfile } from "./countries";
import { EMPTY, type Collection, type MapFeature } from "./model";

export type MineralMode = "production" | "reserves";
export interface MineralMetric {
  year: string; basis: string; unit: string; source: string; note: string;
  entries: { code: string; value: number }[];
}
export interface MineralResource {
  id: string; name: string; group: string; color: string; codes: string[]; use: string;
  production: MineralMetric; reserves: MineralMetric | null;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
function validMetric(v: unknown): boolean {
  if (!object(v) || ![v.year, v.basis, v.unit, v.source, v.note].every(text)
    || !/^20\d{2}$/.test(String(v.year)) || !/^https:\/\//.test(String(v.source))
    || !Array.isArray(v.entries) || !v.entries.length) return false;
  const codes = new Set<string>();
  return v.entries.every(e => {
    if (!object(e) || !text(e.code) || !/^[A-Z]{2}$/.test(e.code) || codes.has(e.code)
      || typeof e.value !== "number" || !Number.isFinite(e.value) || e.value <= 0) return false;
    codes.add(e.code); return true;
  });
}
export function parseMineralAtlas(raw: unknown): MineralResource[] {
  if (!object(raw) || raw.schemaVersion !== 1 || raw.id !== "mineral-atlas" || !Array.isArray(raw.resources)) return [];
  const ids = new Set<string>();
  for (const r of raw.resources) {
    if (!object(r) || ![r.id, r.name, r.group, r.color, r.use].every(text) || !/^[a-z]+$/.test(String(r.id))
      || ids.has(String(r.id)) || !/^#[0-9a-f]{6}$/i.test(String(r.color))
      || !Array.isArray(r.codes) || !r.codes.every(code => text(code) && /^[A-Z0-9_]+$/.test(code))
      || !validMetric(r.production) || (r.reserves !== null && !validMetric(r.reserves))) return [];
    ids.add(String(r.id));
  }
  return raw.resources as MineralResource[];
}
export const MINERAL_RESOURCES = parseMineralAtlas(rawAtlas);
export const MINERAL_GROUPS = ["能源", "肥料原料", "金属", "宝石与其他"];
export const mineralMetricName = (mode: MineralMode) => mode === "production" ? "主要产国" : "储量集中地";
export function mineralValue(value: number, unit: string): string {
  const scale: Record<string, number> = { "吨": 1, "千吨": 1000, "百万吨": 1000000 };
  if (scale[unit]) {
    const tonnes = value * scale[unit];
    unit = tonnes >= 100000000 ? "亿吨" : tonnes >= 10000 ? "万吨" : "吨";
    value = tonnes / (unit === "亿吨" ? 100000000 : unit === "万吨" ? 10000 : 1);
  }
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 3 }).format(value) + (unit === "%" ? "%" : " " + unit);
}
export function mineralRegions(countries: Collection, selected: readonly string[], mode: MineralMode): Collection {
  const resources = MINERAL_RESOURCES.filter(r => selected.includes(r.id));
  return { type: "FeatureCollection", features: countries.features.flatMap(feature => {
    const profile = countryProfile(feature);
    if (!profile) return [];
    const matches = resources.filter(r => r[mode]?.entries.some(e => e.code === profile.code));
    if (!matches.length) return [];
    return [{ ...feature, properties: { ...feature.properties, kind: "resourceareas",
      resourceCode: profile.code, resourceMode: mode, resourceIds: matches.map(r => r.id).join("|"),
      resourceColor: matches[0].color, resourceColors: matches.map(r => r.color).join(","),
      resourcePattern: "resources-" + matches.map(r => r.id).join("-"),
      group: matches.map(r => r.name).join("、"),
      detail: matches.map(r => {
        const metric = r[mode]!; const e = metric.entries.find(e => e.code === profile.code)!;
        return r.name + "：" + mineralValue(e.value, metric.unit) + "（" + metric.year + "，" + metric.basis + "）";
      }).join("；") + "。国家着色是统计范围，不表示整个国家地下都有矿藏。"
    } }];
  }) };
}
export function historicalMinerals(collection: Collection, selected: readonly string[]): Collection {
  const chosen = MINERAL_RESOURCES.filter(r => selected.includes(r.id));
  return { type: "FeatureCollection", features: collection.features.flatMap(feature => {
    if (feature.geometry.type !== "Point") return [];
    const tokens = String(feature.properties.group ?? "").trim().toUpperCase().split(/\s+/);
    const matches = chosen.filter(r => r.codes.some(code => tokens.includes(code)));
    if (!matches.length) return [];
    return [{ ...feature, properties: { ...feature.properties,
      resourceColor: matches[0].color,
      detail: "历史矿点 · " + matches.map(r => r.name).join("、") + "。覆盖不均，不代表现有储量或仍在开采。原始记录：" + feature.properties.detail } }];
  }) };
}
export function mineralMapData(regions: Collection, points: Collection, showPoints: boolean): Collection {
  return showPoints ? { type: "FeatureCollection", features: [...regions.features, ...points.features] } : regions;
}
export function mineralSelection(feature: MapFeature | null) {
  if (feature?.properties.kind !== "resourceareas") return [];
  const mode = feature.properties.resourceMode === "reserves" ? "reserves" : "production";
  return MINERAL_RESOURCES.filter(r => String(feature.properties.resourceIds).split("|").includes(r.id)).flatMap(resource => {
    const metric = resource[mode], entry = metric?.entries.find(e => e.code === feature.properties.resourceCode);
    return metric && entry ? [{ resource, metric, entry }] : [];
  });
}
// Equal-width stripes encode presence only, never percentages or estimated ore boundaries.
export function mineralPattern(colors: string[]) {
  const safe = colors.length ? colors : ["#617182"];
  const width = safe.length * 8, height = width;
  const bytes = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const hex = safe[Math.floor(((x + y) % width) / 8)].slice(1);
    const i = (y * width + x) * 4;
    bytes[i] = parseInt(hex.slice(0, 2), 16); bytes[i + 1] = parseInt(hex.slice(2, 4), 16); bytes[i + 2] = parseInt(hex.slice(4, 6), 16); bytes[i + 3] = 255;
  }
  return { width, height, data: bytes };
}
export const NO_MINERAL_POINTS = EMPTY;
