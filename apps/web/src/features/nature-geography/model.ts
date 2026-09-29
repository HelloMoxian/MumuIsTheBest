import languageData from "../../../../../content/nature/maps/core-languages.v1.json";
import mapLabels from "../../../../../content/nature/maps/labels.zh-CN.v1.json";

type Position = [number, number];
type Geometry = { type: "Point"; coordinates: Position } | { type: "MultiPoint" | "LineString"; coordinates: Position[] } | { type: "Polygon" | "MultiLineString"; coordinates: Position[][] } | { type: "MultiPolygon"; coordinates: Position[][][] };
export interface MapFeature { type: "Feature"; geometry: Geometry; properties: Record<string, string | number | boolean | null> }
export interface Collection { type: "FeatureCollection"; features: MapFeature[] }
export interface Photo { id: string; width: number; height: number; createdAt: string }
export interface Footprint { id: string; title: string; date: string; note: string; longitude: number; latitude: number; photos: Photo[]; createdAt: string; updatedAt: string }
export interface GeographyState { schemaVersion: 1; id: string; revision: number; lights: string[]; footprints: Footprint[] }
export interface MapInfo { schemaVersion: 1; updatedAt: string; coordinateSystem: string; attribution: string; description: string; layers: string[]; missing: string[] }
export const EMPTY: Collection = { type: "FeatureCollection", features: [] };
export const WORLD_LAYERS = [
  { id: "elevation", name: "海拔图", hint: "看看地形的高低起伏。点山峰可读海拔；底色是地形晕渲，不能当作测量值。" },
  { id: "countries", name: "国家图", hint: "选择国家，查看国旗、人口与面积。★ 是首都，● 是主要城市；放大后会显示更多城市名称。" },
  { id: "continents", name: "大洲图", hint: "地球有七大洲。色块表示地理分区概览，沿岸细节请看底图。" },
  { id: "oceans", name: "海洋图", hint: "看看五大洋，也找找海、海湾与海峡；陆地底色展示地形起伏。" },
  { id: "climate", name: "气候图", hint: "颜色表示长期气候：热带、干旱、温带、大陆性与极地。1980—2016 年平均，0.5° 网格，不是今天的天气。" },
  { id: "languages", name: "语种分布", hint: "认识 18 种主要语言。每个国家或地区最多展示两种：底色是一种，斜纹是另一种。灰色是其他语言；这是概览，不表示实际语言边界或人口比例。" },
  { id: "mountains", name: "山脉图", hint: "寻找连绵的山脉与高原。色块是地理范围概览。" },
  { id: "minerals", name: "矿藏图", hint: "探索 USGS 收录的历史矿点（资料等级 A / B）；这些点不代表今天仍在开采，也不表示现有储量。" },
] as const;
export type WorldLayer = typeof WORLD_LAYERS[number]["id"];

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/nature${path}`, init); }
  catch (error) { if ((error as Error).name === "AbortError") throw error; throw new Error("暂时连接不上本机服务，请重试。"); }
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "暂时无法完成，请重试。");
  return data as T;
}
export const jsonRequest = (method: string, data?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
export const photoUrl = (id: string, size: "thumb" | "full" = "thumb") => `/api/nature/photos/${encodeURIComponent(id)}/${size}`;

export function featureBounds(feature: MapFeature): [[number, number], [number, number]] | null {
  if (!feature.geometry || !("coordinates" in feature.geometry)) return null;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  function visit(value: unknown) {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      west = Math.min(west, value[0]); east = Math.max(east, value[0]); south = Math.min(south, value[1]); north = Math.max(north, value[1]);
    } else value.forEach(visit);
  }
  visit(feature.geometry.coordinates);
  return Number.isFinite(west) ? [[west, Math.max(-85, south)], [east, Math.min(85, north)]] : null;
}
const centers = new WeakMap<MapFeature, [number, number] | null>();
const weights = new WeakMap<MapFeature, number>();
const mainRings = new WeakMap<MapFeature, Position[]>();
export function featureCenter(feature: MapFeature): [number, number] | null {
  if (centers.has(feature)) return centers.get(feature)!;
  if (feature.geometry.type === "Point") return feature.geometry.coordinates;
  const rings = feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates.map(p => p[0])
    : feature.geometry.type === "Polygon" ? [feature.geometry.coordinates[0]] : [];
  let largest: Position[] | undefined; let weight = 0;
  for (const ring of rings) {
    if (!ring?.length) continue;
    let area = 0;
    for (let i = 1; i < ring.length; i++) area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
    const latitude = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
    const size = Math.abs(area) * Math.cos(latitude * Math.PI / 180);
    if (size > weight) { weight = size; largest = ring; }
  }
  weights.set(feature, weight);
  if (largest) mainRings.set(feature, largest);
  const bounds = featureBounds(largest ? { ...feature, geometry: { type: "Polygon", coordinates: [largest] } } : feature);
  if (!bounds) { centers.set(feature, null); return null; }
  const y = (bounds[0][1] + bounds[1][1]) / 2;
  let x = (bounds[0][0] + bounds[1][0]) / 2;
  // Place the label inside the largest land component. Overall bounding-box centers
  // put France in Africa and Hainan in the sea because of their distant islands.
  if (largest) {
    const crossings: number[] = [];
    for (let i = 1; i < largest.length; i++) {
      const a = largest[i - 1], b = largest[i];
      if ((a[1] > y) !== (b[1] > y)) crossings.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    crossings.sort((a, b) => a - b);
    let span = 0;
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      if (crossings[i + 1] - crossings[i] > span) { span = crossings[i + 1] - crossings[i]; x = (crossings[i + 1] + crossings[i]) / 2; }
    }
  }
  const point: [number, number] = [x, y]; centers.set(feature, point); return point;
}
export function featureWeight(feature: MapFeature) { featureCenter(feature); return weights.get(feature) ?? 0; }
export function featureFocusBounds(feature: MapFeature) {
  featureCenter(feature);
  const ring = mainRings.get(feature);
  return ring && ["countries", "languageareas", "province", "city", "district"].includes(String(feature.properties.kind))
    ? featureBounds({ ...feature, geometry: { type: "Polygon", coordinates: [ring] } })
    : featureBounds(feature);
}
export function visibleFeatures(collection: Collection, search: string): MapFeature[] {
  const query = search.trim().toLocaleLowerCase();
  return collection.features.filter(f => f.properties?.name && (!query || `${f.properties.name} ${f.properties.detail ?? ""} ${f.properties.group ?? ""}`.toLocaleLowerCase().includes(query)));
}
export function canShowPhoto(zoom: number) { return zoom >= 8; }
export function shouldDrill(zoom: number, depth: number) { return depth === 1 ? zoom >= 6 : depth === 2 ? zoom >= 8.5 : false; }

// Normalize display labels even when the browser still has an older offline map pack cached.
export function normalizeWorldLabels(collection: Collection): Collection {
  const names: Record<string, string> = mapLabels.names;
  const china = collection.features.find(f => f.properties.kind === "countries" && ["中华人民共和国", "中国"].includes(String(f.properties.name)));
  return { ...collection, features: collection.features.map(feature => {
    const p = feature.properties;
    if (["languages", "minerals"].includes(String(p.kind))) return feature;
    const name = names[String(p.name)] ?? p.name;
    const chineseRegion = p.kind === "countries" && ["中国台湾", "中国香港", "中国澳门"].includes(String(name));
    return { ...feature, properties: { ...p, name,
      ...(chineseRegion ? { group: "中国", detail: String(name), color: china?.properties.color ?? 2 } : {}) } };
  }) };
}
export function pointKindName(kind: unknown): string {
  return kind === "languages" ? "语种" : kind === "minerals" ? "矿点" : kind === "elevation" ? "高程点" : "地点";
}
export function pointTitle(feature: MapFeature): string {
  return String(feature.properties.name || `未命名${pointKindName(feature.properties.kind)}`);
}
export function clusterSummary(kind: unknown, count: number): string {
  return `这里有 ${count} 个${pointKindName(kind)}，圆内数字表示数量。`;
}
export function usesTerrain(layer: WorldLayer) { return layer === "elevation" || layer === "oceans"; }

// Natural Earth stores these regions as separate features; selecting China must
// highlight them together without rewriting geometry or saved lighting progress.
export function selectedRegionIds(collection: Collection, selected: string): string[] {
  const feature = collection.features.find(f => String(f.properties.id) === selected);
  if (!feature) return [];
  if (!["countries", "languageareas"].includes(String(feature.properties.kind)) || !["中华人民共和国", "中国"].includes(String(feature.properties.name))) return [selected];
  const linkedNames = ["中华人民共和国", "中国", "中国香港", "中国台湾", "中国澳门"];
  return collection.features.filter(f => ["countries", "languageareas"].includes(String(f.properties.kind)) && linkedNames.includes(String(f.properties.name)))
    .map(f => String(f.properties.id));
}

export const CORE_LANGUAGES = languageData.languages;
export function coreLanguageRegions(countries: Collection): Collection {
  const regions: Record<string, { name: string; languages: string[] }> = languageData.regions;
  const languages = new Map(CORE_LANGUAGES.map(language => [language.id, language]));
  return { ...countries, features: countries.features.filter(f => ["Polygon", "MultiPolygon"].includes(f.geometry.type)).map(feature => {
    const record = regions[String(feature.properties.id)];
    // Guard fixed-version IDs against accidentally applying data to a newer, reordered pack.
    const ids = record?.name === feature.properties.name ? record.languages : [];
    const selected = ids.map(id => languages.get(id)).filter((language): language is typeof CORE_LANGUAGES[number] => !!language).slice(0, 2);
    return { ...feature, properties: { ...feature.properties, kind: "languageareas",
      languageColor: selected[0]?.color ?? "#617182", primaryLanguage: selected[0]?.id ?? "other",
      secondaryLanguage: selected[1]?.id ?? "", secondaryColor: selected[1]?.color ?? "",
      languagePattern: selected[1] ? `language-stripe-${selected[1].id}` : "",
      group: selected.map(language => language.name).join("、") || "其他主要语言",
      detail: selected.length ? `本图展示：${selected.map(language => language.name).join("、")}。当地还可能使用其他语言。按国家或地区概括，颜色和斜纹不表示人口比例，也不是境内语言分界。`
        : "这里的主要语言未纳入本图精选的 18 种语言，暂用灰色表示；并非没有语言。",
    } };
  }) };
}
export function languageStripe(color: string) {
  const width = 16, height = 16, data = new Uint8Array(width * height * 4);
  const rgb = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if ((x + y) % 16 < 5) data.set([...rgb, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}
