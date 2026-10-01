import {
  parseHouseDesign,
  type HouseDesign,
} from "./house-building-contract.js";
export type HousePrefab = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  design: HouseDesign;
};
export type HousePrefabs = { schemaVersion: 1; prefabs: HousePrefab[] };
export function parseHousePrefabs(v: unknown): HousePrefabs | undefined {
  if (typeof v !== "object" || v === null) return;
  const value = v as HousePrefabs;
  if (
    value.schemaVersion !== 1 ||
    !Array.isArray(value.prefabs) ||
    value.prefabs.length > 100
  )
    return;
  const prefabs: HousePrefab[] = [];
  for (const p of value.prefabs) {
    if (
      !p ||
      typeof p.id !== "string" ||
      !p.id ||
      p.id.length > 80 ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 60 ||
      typeof p.createdAt !== "string" ||
      !Number.isFinite(Date.parse(p.createdAt)) ||
      typeof p.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(p.updatedAt)) ||
      Date.parse(p.updatedAt) < Date.parse(p.createdAt)
    )
      return;
    const design = parseHouseDesign(p.design);
    if (!design || !design.parts.length) return;
    prefabs.push({
      id: p.id,
      name: p.name.trim(),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      design,
    });
  }
  if (new Set(prefabs.map((p) => p.id)).size !== prefabs.length) return;
  return { schemaVersion: 1, prefabs };
}
export function mergeHousePrefabs(
  current: HousePrefabs | undefined,
  next: HousePrefabs,
): HousePrefabs {
  const prefabs = [...(current?.prefabs ?? [])];
  for (const p of next.prefabs) {
    const old = prefabs.find((x) => x.id === p.id);
    if (old) {
      if (JSON.stringify(old) !== JSON.stringify(p))
        throw new Error("预制件冲突");
    } else prefabs.push(p);
  }
  if (prefabs.length > 100) throw new Error("预制件已满");
  return { schemaVersion: 1, prefabs };
}
