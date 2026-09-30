import {
  parseWorkspace,
  type HouseWorkspace,
} from "./house-building-workspace.js";
export type HouseLevel = {
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  workspace: HouseWorkspace;
};
export type HouseLevels = { schemaVersion: 1; levels: HouseLevel[] };
const obj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const timestamp = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
export function parseHouseLevels(v: unknown): HouseLevels | undefined {
  if (
    !obj(v) ||
    v.schemaVersion !== 1 ||
    !Array.isArray(v.levels) ||
    v.levels.length > 500
  )
    return;
  const levels: HouseLevel[] = [];
  for (const x of v.levels) {
    if (
      !obj(x) ||
      typeof x.id !== "string" ||
      !x.id.length ||
      x.id.length > 180 ||
      typeof x.name !== "string" ||
      !x.name.trim() ||
      x.name.length > 60 ||
      !Number.isSafeInteger(x.revision) ||
      (x.revision as number) < 1 ||
      !timestamp(x.createdAt) ||
      !timestamp(x.updatedAt) ||
      Date.parse(x.updatedAt) < Date.parse(x.createdAt)
    )
      return;
    const workspace = parseWorkspace(x.workspace);
    if (!workspace) return;
    levels.push({
      id: x.id,
      name: x.name.trim(),
      revision: x.revision as number,
      createdAt: x.createdAt,
      updatedAt: x.updatedAt,
      workspace,
    });
  }
  if (new Set(levels.map((x) => x.id)).size !== levels.length) return;
  return { schemaVersion: 1, levels };
}
export function levelName(n: number): string {
  const digit = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const number =
    n < 10
      ? digit[n]
      : n < 100
        ? (n >= 20 ? digit[Math.floor(n / 10)] : "") + "十" + digit[n % 10]
        : String(n);
  return "关卡" + number;
}
export function mergeHouseLevels(
  current: HouseLevels | undefined,
  incoming: HouseLevels,
): HouseLevels {
  const levels = [...(current?.levels ?? [])];
  for (const next of incoming.levels) {
    const index = levels.findIndex((x) => x.id === next.id);
    if (index < 0) {
      if (next.revision !== 1) throw new Error("关卡不存在，请重新读取。");
      let name = next.name;
      if (
        levels.some((x) => x.name === name) &&
        /^关卡[一二三四五六七八九十0-9]+$/.test(name)
      ) {
        let n = levels.length + 1;
        while (levels.some((x) => x.name === levelName(n))) n++;
        name = levelName(n);
      }
      levels.push({ ...next, name });
    } else {
      const prior = levels[index];
      if (JSON.stringify(prior) === JSON.stringify(next)) continue;
      // A retried creation may have received a different default name in the queue.
      if (
        next.revision === 1 &&
        prior.revision === 1 &&
        /^关卡[一二三四五六七八九十0-9]+$/.test(next.name) &&
        JSON.stringify({ ...next, name: prior.name }) === JSON.stringify(prior)
      )
        continue;
      if (
        next.revision !== prior.revision + 1 ||
        next.createdAt !== prior.createdAt ||
        Date.parse(next.updatedAt) < Date.parse(prior.updatedAt)
      )
        throw new Error("关卡已在其他页面更新，请重新读取后再修改。");
      levels[index] = next;
    }
  }
  if (levels.length > 500) throw new Error("最多保存 500 个关卡。");
  return { schemaVersion: 1, levels };
}
