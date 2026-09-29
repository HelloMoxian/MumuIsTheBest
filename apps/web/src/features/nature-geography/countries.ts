import atlas from "../../../../../content/nature/maps/country-atlas.v1.json";
import notes from "../../../../../content/nature/maps/country-notes.v1.json";
import type { Collection, MapFeature } from "./model";

export interface CountryMetric { value: number; year: string; source: string; note?: string }
export interface CountryCity { id: string; name: string; english: string; coordinates: number[]; capital: boolean; role: string; rank: number }
export interface CountryProfile {
  name: string; code: string; independent: boolean; flag: string;
  population: CountryMetric | null; area: CountryMetric | null;
  capitals: string[]; cities: CountryCity[]; overview: string; languages: string[]; currencies: string[];
  heritage: { name: string; url: string }[]; heritageCount: number;
  services: CountryMetric | null; gdpPerCapita: CountryMetric | null; populationNote: string;
}
export interface CountryNote { culture?: string; economy?: string; sources: string[] }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const metric = (value: unknown) => value === null || (object(value) && typeof value.value === "number" && Number.isFinite(value.value) && value.value >= 0
  && typeof value.source === "string" && typeof value.year === "string" && /^(\d{4})?$/.test(value.year));
// Public authored snapshots are versioned too. A mismatched/corrupt atlas must
// degrade to the existing country list instead of attaching incorrect facts.
export function parseCountryAtlas(raw: unknown): Record<string, CountryProfile> {
  if (!object(raw) || raw.schemaVersion !== 1 || raw.id !== "country-atlas" || !object(raw.regions)) return {};
  const cityIds = new Set<string>();
  for (const [id, p] of Object.entries(raw.regions)) {
    if (!/^countries-\d+$/.test(id) || !object(p) || ![p.name, p.code, p.overview, p.populationNote].every(value => typeof value === "string")
      || typeof p.independent !== "boolean" || typeof p.flag !== "string" || !/^([a-z]{2})?$/.test(p.flag)
      || ![p.population, p.area, p.services, p.gdpPerCapita].every(metric)
      || ![p.capitals, p.languages, p.currencies].every(strings) || !Array.isArray(p.cities) || !Array.isArray(p.heritage)
      || typeof p.heritageCount !== "number" || !Number.isInteger(p.heritageCount) || p.heritageCount < 0) return {};
    for (const city of p.cities) {
      if (!object(city) || ![city.id, city.name, city.english, city.role].every(value => typeof value === "string" && !!value)
        || typeof city.capital !== "boolean" || typeof city.rank !== "number" || !Number.isFinite(city.rank)
        || !Array.isArray(city.coordinates) || city.coordinates.length !== 2
        || !city.coordinates.every(value => typeof value === "number" && Number.isFinite(value))
        || Math.abs(city.coordinates[0]) > 180 || Math.abs(city.coordinates[1]) > 90 || cityIds.has(String(city.id))) return {};
      cityIds.add(String(city.id));
    }
    if (!p.heritage.every(site => object(site) && typeof site.name === "string" && typeof site.url === "string" && /^https:\/\/whc\.unesco\.org\/en\/list\/\d+\/$/.test(site.url))) return {};
  }
  return raw.regions as unknown as Record<string, CountryProfile>;
}
export const COUNTRY_PROFILES = parseCountryAtlas(atlas);
export const COUNTRY_NOTES: Record<string, CountryNote> = notes.records;
export const COUNTRY_SNAPSHOT = atlas.updatedAt.slice(0, 10);

export function countryProfile(feature: MapFeature | null): CountryProfile | null {
  if (!feature || feature.properties.kind !== "countries") return null;
  const profile = COUNTRY_PROFILES[String(feature.properties.id)];
  return profile?.name === feature.properties.name ? profile : null;
}
export function countryRegions(collection: Collection): Collection {
  return { ...collection, features: collection.features.map(feature => {
    const profile = countryProfile(feature);
    return profile ? { ...feature, properties: { ...feature.properties, detail: profile.overview,
      group: [...profile.capitals, ...profile.cities.map(city => city.name), ...profile.languages].join("、") } } : feature;
  }) };
}
export function countryCities(collection: Collection): Collection {
  return { type: "FeatureCollection", features: collection.features.flatMap(feature => {
    const profile = countryProfile(feature);
    return profile ? profile.cities.map(city => cityFeature(city, String(feature.properties.id))) : [];
  }) };
}
export function cityFeature(city: CountryCity, countryId: string): MapFeature {
  return { type: "Feature", geometry: { type: "Point", coordinates: [city.coordinates[0], city.coordinates[1]] },
    properties: { id: city.id, name: city.name, kind: "country-city", countryId, capital: city.capital, role: city.role, rank: city.rank } };
}
export function cityVisible(city: MapFeature, zoom: number, selectedIds: string[]): boolean {
  const selected = selectedIds.includes(String(city.properties.countryId));
  return !!city.properties.capital ? zoom >= 1.7 || selected : zoom >= 4 || (selected && zoom >= 2);
}
export function formatCountryNumber(value: number, unit: string): string {
  if (!Number.isFinite(value) || value < 0) return "资料暂缺";
  const scale = value >= 100000000 ? 100000000 : value >= 10000 ? 10000 : 1;
  return value / scale === 0 ? "0" + unit : "约 " + new Intl.NumberFormat("zh-CN", { maximumFractionDigits: scale === 1 ? 0 : 2 }).format(value / scale) + (scale === 100000000 ? "亿" : scale === 10000 ? "万" : "") + unit;
}
export function countryEconomy(profile: CountryProfile): string {
  const note = COUNTRY_NOTES[profile.code]?.economy;
  const money = profile.currencies.length ? "通用货币：" + profile.currencies.slice(0, 2).join("、") + "。" : "";
  if (note) return note + money;
  if (profile.services) return "服务业约占经济产出的 " + Math.round(profile.services.value) + "%（" + profile.services.year + "）。" + money;
  if (profile.gdpPerCapita) return "人均国内生产总值约 " + Math.round(profile.gdpPerCapita.value).toLocaleString("zh-CN") + " 美元（" + profile.gdpPerCapita.year + "），不等于个人收入。" + money;
  return money || "经济资料暂缺。";
}
