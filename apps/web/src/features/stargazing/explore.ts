import type { Constellation, SkyView, Star } from "./types";
import { angularDistance } from "./astronomy";

export interface SkyCollection {
  id: string;
  name: string;
  subtitle: string;
  ids: string[];
  view: SkyView;
  category?: "featured" | "seasons" | "hemispheres";
  /** Widely separated figures should open in the all-sky atlas instead of a partial perspective. */
  atlas?: boolean;
}

// "Famous" is our introductory editorial selection, not an official popularity statistic.
// IAU defines constellation regions, independently of familiar line figures:
// https://iauarchive.eso.org/public/themes/constellations/
// Traditional twelve versus the astronomical ecliptic's thirteen (including Ophiuchus):
// https://www.rmg.co.uk/stories/space-astronomy/astronomy/night-sky-highlights-july-2026
// Winter Triangle: Sirius, Betelgeuse, Procyon; Summer Triangle: Vega, Altair, Deneb.
// https://science.nasa.gov/solar-system/what-are-asterisms/
export const SKY_COLLECTIONS: SkyCollection[] = [
  { id: "famous", name: "最出名的星座", subtitle: "先认识这 8 位星空老朋友", ids: ["Ori", "UMa", "Cas", "Sco", "Leo", "UMi", "Gem", "Cru"], view: { ra: 180, dec: 10, fov: 150 }, category: "featured", atlas: true },
  { id: "zodiac-twelve", name: "十二星座", subtitle: "从白羊到双鱼，熟悉的十二座", ids: ["Ari", "Tau", "Gem", "Cnc", "Leo", "Vir", "Lib", "Sco", "Sgr", "Cap", "Aqr", "Psc"], view: { ra: 90, dec: 16, fov: 150 }, category: "featured", atlas: true },
  { id: "bright-triangles", name: "亮星三角", subtitle: "冬、夏大三角所在的 6 个星座", ids: ["Ori", "CMa", "CMi", "Lyr", "Aql", "Cyg"], view: { ra: 180, dec: 15, fov: 150 }, category: "featured", atlas: true },
  { id: "zodiac", name: "黄道上的十三站", subtitle: "天文学的黄道也经过蛇夫座", ids: ["Ari", "Tau", "Gem", "Cnc", "Leo", "Vir", "Lib", "Sco", "Oph", "Sgr", "Cap", "Aqr", "Psc"], view: { ra: 90, dec: 16, fov: 150 }, category: "featured", atlas: true },
  { id: "winter", name: "冬夜的钻石", subtitle: "猎户座出发，寻找六颗亮星", ids: ["Ori", "Tau", "Aur", "Gem", "CMi", "CMa"], view: { ra: 86, dec: 12, fov: 104 }, category: "seasons" },
  { id: "summer", name: "夏夜的银河", subtitle: "沿着夏季大三角走向银河", ids: ["Cyg", "Lyr", "Aql", "Sgr", "Sco", "Her"], view: { ra: 282, dec: 13, fov: 117 }, category: "seasons" },
  { id: "spring", name: "春天的星空", subtitle: "从狮子走到牧夫与室女", ids: ["Leo", "Vir", "Boo", "Com", "UMa", "Cnc"], view: { ra: 184, dec: 30, fov: 111 }, category: "seasons" },
  { id: "autumn", name: "秋夜的四边形", subtitle: "飞马、仙女与英仙的故事", ids: ["Peg", "And", "Per", "Cas", "Cet", "Psc"], view: { ra: 8, dec: 25, fov: 117 }, category: "seasons" },
  { id: "north", name: "寻找北极星", subtitle: "北斗七星在大熊座里", ids: ["UMa", "UMi", "Cas", "Cep", "Dra", "Cam"], view: { ra: 200, dec: 74, fov: 104 }, category: "hemispheres" },
  { id: "south", name: "南方的星海", subtitle: "南十字与南天的航海星座", ids: ["Cru", "Cen", "Car", "Vel", "Pup", "Mus"], view: { ra: 165, dec: -56, fov: 100 }, category: "hemispheres" },
];

const CONSTELLATION_ALIASES: Record<string, string[]> = {
  Sgr: ["射手", "射手座"], Vir: ["处女", "处女座"], Aqr: ["水瓶", "水瓶座"],
  UMa: ["北斗", "北斗七星"], UMi: ["小北斗", "北极星"],
};

export function matchesQuery(item: { name: string; latinName: string; id: string | number; description?: string; hip?: number | null }, query: string) {
  const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "");
  const q = normalize(query);
  if (!q) return true;
  const aliases = typeof item.id === "string" ? CONSTELLATION_ALIASES[item.id] || [] : [];
  const identifiers = typeof item.id === "number" ? [`HYG ${item.id}`] : [];
  if (item.hip !== null && item.hip !== undefined && Number.isInteger(item.hip) && item.hip > 0) identifiers.push(`HIP ${item.hip}`);
  return [item.name, item.latinName, String(item.id), item.description || "", ...aliases, ...identifiers]
    .some(value => normalize(value).includes(q));
}

export function constellationStars(constellation: Constellation, stars: Star[]) {
  const points = constellation.lines.flat();
  return stars.filter(star => {
    if (!Number.isFinite(star.ra) || !Number.isFinite(star.dec) || Math.abs(star.dec) > 90) return false;
    // A drawing can borrow a neighbouring constellation's star (e.g. Alpheratz in the Great Square).
    // Explicit catalog membership wins; proximity only supports legacy data without that field.
    if (star.constellation) return star.constellation === constellation.id;
    return points.some(([ra, dec]) => angularDistance(star.ra, star.dec, ra, dec) < .13);
  }).sort((a, b) => a.magnitude - b.magnitude);
}

/** Figure vertices only; borrowed stars keep their true catalog constellation membership. */
export function constellationFigureStars(constellation: Constellation, stars: Star[]): Star[] {
  const candidates = stars.filter(star => Number.isFinite(star.ra) && Number.isFinite(star.dec) && Math.abs(star.dec) <= 90);
  const vertices = new Map<string, [number, number]>();
  for (const [ra, dec] of constellation.lines.flat()) {
    if (Number.isFinite(ra) && Number.isFinite(dec) && Math.abs(dec) <= 90) vertices.set(`${ra},${dec}`, [ra, dec]);
  }
  const matches = new Map<number, Star>();
  for (const [ra, dec] of vertices.values()) {
    let nearest: Star | undefined;
    // Bundled HYG / d3-celestial positions differ by at most 0.009 degrees.
    // A small tolerance accommodates rounding without inventing a match for a missing star.
    let nearestDistance = 0.05;
    for (const star of candidates) {
      const distance = angularDistance(star.ra, star.dec, ra, dec);
      if (distance > nearestDistance) continue;
      if (!nearest || distance < nearestDistance || star.magnitude < nearest.magnitude
        || star.magnitude === nearest.magnitude && star.id < nearest.id) {
        nearest = star;
        nearestDistance = distance;
      }
    }
    if (nearest) matches.set(nearest.id, nearest);
  }
  return [...matches.values()].sort((a, b) => a.magnitude - b.magnitude || a.id - b.id);
}

export function parseObserverInputs(latitude: string, longitude: string, date: string) {
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (!decimal.test(latitude.trim()) || !decimal.test(longitude.trim())) return null;
  const components = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(date);
  if (!components) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = components;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText || 0);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return null;
  const lat = Number(latitude), lon = Number(longitude), timestamp = new Date(date).getTime();
  if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon)
    || lat < -90 || lat > 90 || lon < -180 || lon > 180 || !Number.isFinite(timestamp)) return null;
  if (!zone) {
    const local = new Date(timestamp);
    // Do not silently roll a nonexistent local time (e.g. a daylight-saving gap) forward.
    if (local.getFullYear() !== year || local.getMonth() + 1 !== month || local.getDate() !== day || local.getHours() !== hour || local.getMinutes() !== minute) return null;
  }
  return { latitude: lat, longitude: lon, date: new Date(timestamp).toISOString() };
}

export function quantity(value: number | null, maximumFractionDigits = 1): string {
  if (value === null || !Number.isFinite(value)) return "未收录";
  return value.toLocaleString("zh-CN", { maximumFractionDigits });
}

export function stellarColorLabel(star: Star) {
  const t = star.temperatureK;
  if (t === null || !Number.isFinite(t) || t <= 0) {
    const index = star.colorIndex;
    if (index === null || !Number.isFinite(index)) return "颜色资料未收录";
    if (index >= 1.2) return "偏橙红（色指数示意）";
    if (index >= .5) return "偏暖白（色指数示意）";
    if (index >= .2) return "偏白（色指数示意）";
    return "偏蓝白（色指数示意）";
  }
  if (t >= 10000) return "蓝白色";
  if (t >= 7500) return "白色";
  if (t >= 5500) return "暖白色";
  if (t >= 4000) return "浅橙色";
  return "橙红色";
}
