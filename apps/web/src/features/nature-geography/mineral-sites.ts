import rawSites from "../../../../../content/nature/maps/mineral-sites.v1.json";
import { MINERAL_RESOURCES } from "./minerals";
import { type Collection, type MapFeature } from "./model";

export interface MineralSite {
  id: string; name: string; nativeName: string; resources: string[]; coordinates: [number, number];
  region: string; kind: string; note: string; accuracy: string; source: string;
  coordinateSource: string; asOf: string; status: string;
}
const resourceIds = new Set(MINERAL_RESOURCES.map(r => r.id));
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function parseMineralSites(raw: unknown): MineralSite[] {
  if (!object(raw) || raw.schemaVersion !== 1 || raw.id !== "mineral-sites" || !Array.isArray(raw.sites)) return [];
  const ids = new Set<string>();
  for (const s of raw.sites) {
    if (!object(s) || typeof s.id !== "string" || !/^[a-zA-Z0-9-]+$/.test(s.id) || ids.has(s.id)
      || !["name", "region", "kind", "note", "accuracy", "source", "coordinateSource", "asOf", "status"].every(k => typeof s[k] === "string" && s[k].trim().length > 0)
      || typeof s.nativeName !== "string" || !/^https:\/\//.test(String(s.source))
      || !Array.isArray(s.resources) || !s.resources.length || new Set(s.resources).size !== s.resources.length || !s.resources.every(r => resourceIds.has(r))
      || !Array.isArray(s.coordinates) || s.coordinates.length !== 2 || !s.coordinates.every(Number.isFinite)
      || Math.abs(s.coordinates[0]) > 180 || Math.abs(s.coordinates[1]) > 85) return [];
    ids.add(s.id);
  }
  return raw.sites as MineralSite[];
}
export const MINERAL_SITES = parseMineralSites(rawSites);
export function mineralSites(selected: readonly string[]): Collection {
  const wanted = new Set(selected);
  return { type: "FeatureCollection", features: MINERAL_SITES.flatMap(site => {
    const resources = MINERAL_RESOURCES.filter(r => wanted.has(r.id) && site.resources.includes(r.id));
    if (!resources.length) return [];
    return [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: site.coordinates }, properties: {
      id: site.id, name: site.name, kind: "resource-site", group: resources.map(r => r.name).join("、"),
      resourceIds: resources.map(r => r.id).join("|"), resourceIcon: "mineral-" + resources.map(r => r.id).join("-"),
      detail: `${site.region} · ${resources.map(r => r.name).join("、")}。${site.note}`,
      region: site.region, focusZoom: 6, minZoom: 4,
    } }];
  }) };
}
export const MINERAL_ZONES = [
  { id: "gulf", name: "波斯湾", bounds: [43, 21, 57, 33] },
  { id: "north-africa", name: "北非", bounds: [-10, 23, 36, 37] },
  { id: "russia", name: "俄罗斯", bounds: [42, 48, 118, 74] },
  { id: "china", name: "中国", bounds: [77, 20, 134, 51] },
  { id: "andes", name: "安第斯", bounds: [-82, -37, -63, 8] },
  { id: "central-africa", name: "中非矿带", bounds: [22, -15, 31, -7] },
  { id: "australia", name: "澳大利亚", bounds: [112, -39, 154, -10] },
] as const;
// Navigation rectangle only: never add it to the rendered geological data.
export function mineralZoneFocus(id: string): MapFeature | null {
  const zone = MINERAL_ZONES.find(z => z.id === id); if (!zone) return null;
  const [w, s, e, n] = zone.bounds;
  return { type: "Feature", properties: { id: zone.id, name: zone.name }, geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } };
}

const chars: Record<string, string> = { oil: "油", gas: "气", coal: "煤", phosphate: "磷", potash: "钾", iron: "铁", copper: "铜", lithium: "锂", rareearth: "稀", nickel: "镍", cobalt: "钴", gold: "金", silver: "银", zinc: "锌", diamond: "钻", graphite: "墨" };
const square = "M3 3H29V29H3Z";
const circle = "M16 2A14 14 0 1 1 16 30A14 14 0 1 1 16 2Z";
const shapes: Record<string, string> = {
  oil: "M8 3H24L30 29H2Z", gas: "M16 1C12 8 3 13 3 20A13 11 0 0 0 29 20C29 13 20 8 16 1Z",
  coal: square, iron: "M16 1L31 30H1Z", diamond: "M16 1L31 16L16 31L1 16Z",
  phosphate: "M8 2H24L31 16L24 30H8L1 16Z", potash: square, graphite: "M9 2H23L30 9V23L23 30H9L2 23V9Z",
};
export function mineralSymbol(id: string) {
  const resource = MINERAL_RESOURCES.find(r => r.id === id);
  return { path: shapes[id] ?? circle, char: chars[id] ?? "?", color: resource?.color ?? "#eeeeee", textY: id === "iron" || id === "gas" ? 22 : 21 };
}
/** Same shapes and characters as the HTML legend; no remote font or image requests. */
export function mineralIcon(ids: readonly string[]) {
  const canvas = document.createElement("canvas"); canvas.width = 64 * ids.length; canvas.height = 64;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("矿产符号暂时无法绘制");
  ctx.scale(2, 2);
  ids.forEach((id, i) => {
    const symbol = mineralSymbol(id); ctx.save(); ctx.translate(i * 32, 0);
    const path = new Path2D(symbol.path); ctx.fillStyle = symbol.color; ctx.fill(path);
    ctx.strokeStyle = "#f4f6ff"; ctx.lineWidth = 1.5; ctx.stroke(path);
    ctx.font = "bold 18px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.lineJoin = "round"; ctx.strokeStyle = "#10182d"; ctx.lineWidth = 3;
    ctx.strokeText(symbol.char, 16, symbol.textY); ctx.fillStyle = "#ffffff"; ctx.fillText(symbol.char, 16, symbol.textY);
    ctx.restore();
  });
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
