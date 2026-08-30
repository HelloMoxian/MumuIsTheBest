import type { RacerStageAttempt } from "./types";

export type RacerSettlement = {
  alreadySaved: boolean;
  eventId: string;
  passedLevels: number;
  energyCoinsEarned: number;
  energyCoinBalance: number;
  updatedAt: string;
};

export async function settleRacerRun(input: {
  eventId: string;
  startedAt: string;
  attempts: RacerStageAttempt[];
}) {
  const response = await fetch("/api/games/galaxy-racer/settlements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null) as (
    RacerSettlement & { message?: string }
  ) | null;
  if (!response.ok || !body) {
    throw new Error(body?.message ?? "奖励暂时还在星际途中，请再试一次。");
  }
  return body;
}
