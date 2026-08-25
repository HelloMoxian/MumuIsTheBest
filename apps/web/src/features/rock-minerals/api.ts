import {
  loadPersistentData,
  queuePersistentDataWrite,
  savePersistentData,
} from "../../shared/persistent-data";
import { spendLearningCoins } from "../../shared/learning-coins";
import { parseRockMineralProgress } from "./logic";
import type { RockMineralCatalog, RockMineralProgress } from "./types";

const STABLE_ID = "nature-rock-minerals";

function parser(catalog: RockMineralCatalog) {
  return (value: unknown) => parseRockMineralProgress(value, catalog);
}

export function loadRockMineralProgress(
  catalog: RockMineralCatalog,
  signal?: AbortSignal,
) {
  return loadPersistentData({
    stableId: STABLE_ID,
    parsePayload: parser(catalog),
  }, (input, init) => fetch(input, { ...init, signal }));
}

export function createRockMineralProgress(
  progress: RockMineralProgress,
  catalog: RockMineralCatalog,
) {
  return savePersistentData(STABLE_ID, progress, parser(catalog));
}

export function saveRockMineralProgress(
  progress: RockMineralProgress,
  catalog: RockMineralCatalog,
) {
  return queuePersistentDataWrite(STABLE_ID, progress, parser(catalog));
}

export function spendResearchKnowledgeCoins(eventId: string, amount: number) {
  return spendLearningCoins(eventId, "nature:rock-mineral-research", amount);
}

export type EnergyCoinBalance = {
  schemaVersion: 1;
  balance: number;
  updatedAt: string;
};

export type HammerPurchase = {
  alreadySpent: boolean;
  eventId: string;
  quantity: 1;
  coinDelta: number;
  balance: number;
  updatedAt: string;
};

export class RockMineralApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function responseJson<T>(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as (
    T & { code?: string; message?: string }
  ) | null;
  if (!response.ok || !body) {
    throw new RockMineralApiError(body?.code ?? "REQUEST_FAILED", body?.message ?? fallback);
  }
  return body;
}

export async function loadEnergyCoinBalance(signal?: AbortSignal) {
  const response = await fetch("/api/games/fruit-slice/energy-coins", { signal });
  return responseJson<EnergyCoinBalance>(response, "能量币余额暂时无法读取。");
}

export async function purchaseGeologyHammer(
  endpoint: string,
  eventId: string,
  amount: number,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId,
      kind: "nature:geology-hammer",
      amount,
      quantity: 1,
    }),
  });
  return responseJson<HammerPurchase>(response, "地质锤暂时无法购买。");
}
