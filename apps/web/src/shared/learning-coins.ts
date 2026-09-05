export type LearningCoinSource =
  | "math:add-subtract"
  | "math:arithmetic-battle"
  | "math:multiplication"
  | "math:find-number"
  | "math:cat-mouse-game"
  | "english:echo-island";

export type FindNumberRewardKey = "100" | "1000" | "10000" | "100000";
export type ArithmeticBattleRewardKey = "easy" | "medium" | "hard";
export type MultiplicationRewardKey = "facts" | "reverse" | "advanced";
export type LearningRewardKey =
  | FindNumberRewardKey
  | ArithmeticBattleRewardKey
  | MultiplicationRewardKey;

export const LEARNING_COIN_REWARDS = {
  "math:add-subtract": 2,
  "math:arithmetic-battle": null,
  "math:multiplication": null,
  "math:find-number": null,
  "math:cat-mouse-game": 20,
  "english:echo-island": 1,
} as const;

export const ARITHMETIC_BATTLE_COIN_REWARDS: Readonly<
  Record<ArithmeticBattleRewardKey, number>
> = {
  easy: 4,
  medium: 6,
  hard: 8,
};

export const MULTIPLICATION_COIN_REWARDS: Readonly<Record<MultiplicationRewardKey, number>> = {
  facts: 2,
  reverse: 3,
  advanced: 5,
};

export const FIND_NUMBER_COIN_REWARDS: Readonly<Record<FindNumberRewardKey, number>> = {
  "100": 10,
  "1000": 30,
  "10000": 60,
  "100000": 150,
};

export type LearningPromotion = {
  id: string;
  source: LearningCoinSource;
  multiplier: 3;
  startsAt: string;
  endsAt: string;
};

export type LearningCoinBalance = {
  schemaVersion: 1;
  coinBalance: number;
  updatedAt: string;
  promotion: LearningPromotion;
};

export type LearningRewardSession = {
  id: string;
  source: LearningCoinSource;
  multiplier: 1 | 3;
  promotionId: string | null;
  createdAt: string;
};

export type LearningCoinAward = {
  alreadyAwarded: boolean;
  baseRewardCoins: number;
  multiplier: 1 | 3 | 5;
  criticalHit: boolean;
  rewardCoins: number;
  source: LearningCoinSource | "games:gem-connect";
  autoPlayQuota?: {
    batchId: string;
    limit: 20;
    awardedCoins: number;
    remainingCoins: number;
    exhausted: boolean;
  };
  progress: {
    coinBalance: number;
    updatedAt: string;
  };
};

export type LearningCoinAwardOptions = {
  sessionId?: string;
  rewardKey?: LearningRewardKey;
  autoPlayBatchId?: string;
};

export const LEARNING_COINS_CHANGED_EVENT = "mumu:learning-coins-changed";
export const LEARNING_COINS_AWARDED_EVENT = "mumu:learning-coins-awarded";
export const LEARNING_REWARD_SESSION_EVENT = "mumu:learning-reward-session";

type CoinBalanceChangeResult = {
  coinDelta: number;
  progress: {
    coinBalance: number;
    updatedAt: string;
  };
};

export type LearningCoinSpendResult = CoinBalanceChangeResult & {
  alreadySpent: boolean;
  eventId: string;
  purpose: "nature:rock-mineral-research";
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

export function startLearningRewardSession(source: LearningCoinSource, promotionId?: string) {
  return requestJson<LearningRewardSession>("/api/world-tower/reward-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, promotionId }),
  }).then((session) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LEARNING_REWARD_SESSION_EVENT, { detail: session }));
    }
    return session;
  });
}

export function awardLearningCoins(
  source: LearningCoinSource,
  eventId: string = crypto.randomUUID(),
  options: LearningCoinAwardOptions = {},
) {
  return requestJson<LearningCoinAward>("/api/world-tower/coins/earn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, source, ...options }),
  }).then((award) => {
    if (typeof window !== "undefined" && !award.alreadyAwarded && award.rewardCoins > 0) {
      window.dispatchEvent(new CustomEvent(LEARNING_COINS_AWARDED_EVENT, { detail: award }));
    }
    return award;
  });
}

function reportBalanceChange<T extends CoinBalanceChangeResult>(result: T): T {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LEARNING_COINS_CHANGED_EVENT, {
      detail: { coinBalance: result.progress.coinBalance, updatedAt: result.progress.updatedAt },
    }));
  }
  return result;
}

export function resetLearningCoins(password: string) {
  return requestJson<CoinBalanceChangeResult>("/api/world-tower/coins/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  }).then(reportBalanceChange);
}

export function setLearningCoinBalance(password: string, balance: number) {
  return requestJson<CoinBalanceChangeResult>("/api/world-tower/coins/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, balance }),
  }).then(reportBalanceChange);
}

export function spendLearningCoins(
  eventId: string,
  purpose: LearningCoinSpendResult["purpose"],
  amount: number,
) {
  return requestJson<LearningCoinSpendResult>("/api/world-tower/coins/spend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, purpose, amount }),
  }).then(reportBalanceChange);
}
