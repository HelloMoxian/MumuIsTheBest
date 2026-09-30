import type { Collection } from "./model";

export const CLIMATE_VIEWS = ["常见类型", "冷暖", "干湿季节"] as const;
export type ClimateView = typeof CLIMATE_VIEWS[number];
export const CLIMATE_GROUPS: Record<ClimateView, { name: string; codes: string[] }[]> = {
  "常见类型": [
    { name: "沙漠", codes: ["BWh", "BWk"] },
    { name: "半干旱草原", codes: ["BSh", "BSk"] },
    { name: "热带雨林", codes: ["Af"] },
    { name: "热带季风", codes: ["Am"] },
    { name: "热带草原", codes: ["Aw"] },
    { name: "地中海", codes: ["Csa", "Csb", "Csc"] },
    { name: "冬干温带", codes: ["Cwa", "Cwb", "Cwc"] },
    { name: "湿润亚热带", codes: ["Cfa"] },
    { name: "海洋性", codes: ["Cfb", "Cfc"] },
    { name: "大陆性", codes: ["Dsa","Dsb","Dsc","Dsd","Dwa","Dwb","Dwc","Dwd","Dfa","Dfb","Dfc","Dfd"] },
    { name: "苔原与冰原", codes: ["ET", "EF"] },
  ],
  "冷暖": [
    { name: "热带", codes: ["Af", "Am", "Aw"] },
    { name: "炎热干旱", codes: ["BWh", "BSh"] },
    { name: "寒冷干旱", codes: ["BWk", "BSk"] },
    { name: "温带", codes: ["Csa","Csb","Csc","Cwa","Cwb","Cwc","Cfa","Cfb","Cfc"] },
    { name: "寒冷大陆", codes: ["Dsa","Dsb","Dsc","Dsd","Dwa","Dwb","Dwc","Dwd","Dfa","Dfb","Dfc","Dfd"] },
    { name: "极地", codes: ["ET", "EF"] },
  ],
  "干湿季节": [
    { name: "沙漠与半干旱", codes: ["BWh","BWk","BSh","BSk"] },
    { name: "全年湿润", codes: ["Af","Cfa","Cfb","Cfc","Dfa","Dfb","Dfc","Dfd"] },
    { name: "夏季干燥", codes: ["Csa","Csb","Csc","Dsa","Dsb","Dsc","Dsd"] },
    { name: "冬季干燥", codes: ["Aw","Cwa","Cwb","Cwc","Dwa","Dwb","Dwc","Dwd"] },
    { name: "热带季风", codes: ["Am"] },
    { name: "极地", codes: ["ET","EF"] },
  ],
};
export function climateGroupState(selected: readonly string[], codes: readonly string[]) {
  const count = codes.filter(code => selected.includes(code)).length;
  return { checked: !!codes.length && count === codes.length, mixed: count > 0 && count < codes.length };
}
export function toggleClimateGroup(selected: readonly string[], codes: readonly string[]): string[] {
  return climateGroupState(selected, codes).checked ? selected.filter(code => !codes.includes(code)) : [...new Set([...selected, ...codes])];
}
export function availableClimateGroups(data: Collection, view: ClimateView) {
  const available = new Set(data.features.map(f => String(f.properties.id)));
  return CLIMATE_GROUPS[view].map(group => ({ ...group, codes: group.codes.filter(code => available.has(code)) })).filter(group => group.codes.length);
}
