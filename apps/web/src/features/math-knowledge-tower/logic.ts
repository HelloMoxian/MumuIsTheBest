import type { EquivalentAge, MasteryId } from "./types";

export const KNOWLEDGE_POINT_COUNT = 517;
export const MASTERY_LEVEL_COUNT = 4;
export const KNOWLEDGE_TOWER_TOTAL_LIGHTS = KNOWLEDGE_POINT_COUNT * MASTERY_LEVEL_COUNT;

export function knowledgeLightId(topicId: string, masteryId: MasteryId) {
  return `${topicId}:${masteryId}`;
}

export function equivalentKnowledgeAge(
  litCount: number,
  totalLights = KNOWLEDGE_TOWER_TOTAL_LIGHTS,
): EquivalentAge {
  const safeLitCount = Math.min(Math.max(Math.trunc(litCount), 0), totalLights);
  const progressDays = Math.floor((safeLitCount / totalLights) * 9 * 365);
  const addedYears = Math.floor(progressDays / 365);
  const remainingDays = progressDays - addedYears * 365;
  const averageMonthDays = 365 / 12;
  const months = Math.min(11, Math.floor(remainingDays / averageMonthDays));
  const days = Math.floor(remainingDays - months * averageMonthDays);
  const years = 6 + addedYears;
  return {
    years,
    months,
    days,
    progressDays,
    label: `${years}岁${months}月${days}天`,
  };
}

export type GradeViewportBand = {
  id: string;
  top: number;
  bottom: number;
};

export function activeGradeAtReadingLine(
  bands: GradeViewportBand[],
  readingLine: number,
) {
  const containing = bands.find((band) => band.top <= readingLine && band.bottom >= readingLine);
  if (containing) return containing.id;
  return [...bands].sort((left, right) => {
    const leftDistance = Math.min(
      Math.abs(left.top - readingLine),
      Math.abs(left.bottom - readingLine),
    );
    const rightDistance = Math.min(
      Math.abs(right.top - readingLine),
      Math.abs(right.bottom - readingLine),
    );
    return leftDistance - rightDistance;
  })[0]?.id ?? null;
}

export function formatProgressPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  if (value >= 100) return "100%";
  return `${value.toFixed(value < 1 ? 2 : 1)}%`;
}
