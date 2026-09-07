import bundledCatalog from "./catalog.json";
import type { Constellation, Star } from "./types";

/** The bundled data is validated by scripts/build-stargazing-catalog.py. */
export const STARS: Star[] = bundledCatalog.stars;

export const CONSTELLATIONS: Constellation[] = bundledCatalog.constellations.map(
  (constellation) => ({
    ...constellation,
    season: constellation.season as Constellation["season"],
    lines: constellation.lines.map((line) =>
      line.map(([ra, dec]): [number, number] => [ra, dec]),
    ),
  }),
);

export const SOURCES: { title: string; url: string; note: string }[] =
  bundledCatalog.sources;

export const CATALOG_INFO = {
  epoch: bundledCatalog.epoch,
  limitingMagnitude: bundledCatalog.limitingMagnitude,
  starCount: STARS.length,
  constellationCount: CONSTELLATIONS.length,
  rankingNote: "按中文家庭观星中的常见程度与辨识难度编辑推荐，非官方热度统计。",
  seasonNote: "季节为北半球中纬度晚间观星的粗略分组；不代表当前位置此刻可见。",
  modelNote: "颜色参考恒星色指数；温度、大小与自转资料均为近似，表面纹理与动态为教学示意。",
} as const;

export function getStarName(star: Star): string {
  return star.name || star.latinName || `HYG ${star.id}`;
}
