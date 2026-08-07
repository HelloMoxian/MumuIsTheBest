export type LearningCoinSource =
  | "math:add-subtract"
  | "math:arithmetic-battle"
  | "math:multiplication"
  | "math:cat-mouse-game";

export const LEARNING_COIN_REWARDS: Readonly<Record<LearningCoinSource, number>> = {
  "math:add-subtract": 1,
  "math:arithmetic-battle": 5,
  "math:multiplication": 5,
  "math:cat-mouse-game": 20,
};

export type LearningCoinBalance = {
  schemaVersion: 1;
  coinBalance: number;
  updatedAt: string;
};

export type LearningCoinAward = {
  alreadyAwarded: boolean;
  rewardCoins: number;
  source: LearningCoinSource;
  progress: {
    coinBalance: number;
    updatedAt: string;
  };
};

type CoinResetResult = {
  coinDelta: number;
  progress: {
    coinBalance: number;
    updatedAt: string;
  };
};

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) {
    throw new Error(body?.message ?? "知识币服务暂时没有回应，请稍后再试。");
  }
  return body as T;
}

export function loadLearningCoinBalance(signal?: AbortSignal) {
  return requestJson<LearningCoinBalance>("/api/world-tower/coins", { signal });
}

export function awardLearningCoins(source: LearningCoinSource, eventId = crypto.randomUUID()) {
  return requestJson<LearningCoinAward>("/api/world-tower/coins/earn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, source }),
  });
}

export function resetLearningCoins(password: string) {
  return requestJson<CoinResetResult>("/api/world-tower/coins/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}
