import type { FruitSliceRole, FruitSliceSettings, GameMode, PlayerResult } from "./types";

export type StoredFruitSlicePlayer = PlayerResult & { energyCoinsEarned: number };
export type StoredFruitSliceSession = {
  id: string;
  eventId: string;
  startedAt: string;
  completedAt: string;
  mode: GameMode;
  durationMs: number;
  settings: FruitSliceSettings;
  winnerSide: "left" | "right" | "tie" | null;
  players: StoredFruitSlicePlayer[];
};

export type FruitSliceHistory = {
  schemaVersion: 1;
  id: string;
  stableId: "game-fruit-slice-history";
  createdAt: string;
  updatedAt: string;
  energyCoinBalance: number;
  sessions: StoredFruitSliceSession[];
  summary: {
    roles: Array<{
      role: FruitSliceRole;
      gamesPlayed: number;
      highestScore: number;
      totalScore: number;
      energyCoinsEarned: number;
    }>;
    matchups: Array<{
      roleA: FruitSliceRole;
      roleB: FruitSliceRole;
      games: number;
      winsA: number;
      winsB: number;
      ties: number;
    }>;
  };
};

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const body = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(body?.message ?? "切水果战报暂时没有回应。");
  return body as T;
}

export function loadFruitSliceHistory(signal?: AbortSignal) {
  return requestJson<FruitSliceHistory>("/api/games/fruit-slice/history", { signal });
}

export function saveFruitSliceSession(input: {
  eventId: string;
  startedAt: string;
  mode: GameMode;
  durationMs: number;
  settings: FruitSliceSettings;
  players: PlayerResult[];
}) {
  return requestJson<{
    alreadySaved: boolean;
    session: StoredFruitSliceSession;
    energyCoinsEarned: number;
    energyCoinBalance: number;
    summary: FruitSliceHistory["summary"];
  }>("/api/games/fruit-slice/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
