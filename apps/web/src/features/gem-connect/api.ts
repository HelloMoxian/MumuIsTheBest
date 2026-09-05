import { LEGACY_PAIRS, LEVELS, type Completion, type RecordEntry } from "./logic";

export function parseHistory(value: unknown): RecordEntry[] {
  if (!value || typeof value !== "object") throw new Error("记录格式不正确");
  const history = value as { schemaVersion?: unknown; records?: unknown };
  if (history.schemaVersion !== 2 || !Array.isArray(history.records)) throw new Error("记录版本暂不支持");
  const ids = new Set<string>();
  return history.records.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("记录格式不正确");
    const record = item as RecordEntry;
    const config = LEVELS[record.level - 1];
    if (typeof record.id !== "string" || !/^[0-9a-f-]{36}$/i.test(record.id) || ids.has(record.id)
      || !Number.isInteger(record.level) || !config
      || !Number.isSafeInteger(record.durationMs) || record.durationMs <= 0
      || !Number.isSafeInteger(record.hints) || record.hints < 0
      || !Number.isSafeInteger(record.shuffles) || record.shuffles < 0
      || ![1, 2].includes(record.rulesVersion)
      || !["legacy", "pending", "granted"].includes(record.rewardStatus)
      || (record.rulesVersion === 1 ? record.rewardStatus !== "legacy" : record.rewardStatus === "legacy")
      || record.pairCount !== (record.rulesVersion === 1 ? LEGACY_PAIRS[record.level - 1] : config.rows * config.cols / 2)
      || typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))
      || typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error("记录格式不正确");
    ids.add(record.id);
    return record;
  });
}
export type Settlement = { eventId: string; level: number; amount: number; knowledgeBalance: number; energyBalance: number; updatedAt: string };
export async function fetchHistory(completion?: Completion): Promise<{ records: RecordEntry[]; settlement?: Settlement }> {
  const response = await fetch("/api/games/gem-connect/history", {
    method: completion ? "POST" : "GET",
    headers: completion ? { "Content-Type": "application/json" } : undefined,
    body: completion ? JSON.stringify(completion) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("暂时无法保存或读取记录");
  const body = await response.json();
  const records = parseHistory(body);
  const settlement = body.settlement as Settlement | undefined;
  if (completion && (!settlement || settlement.eventId !== completion.id || settlement.level !== completion.level
    || settlement.amount !== completion.level * 10 || !Number.isSafeInteger(settlement.knowledgeBalance)
    || settlement.knowledgeBalance < 0 || !Number.isSafeInteger(settlement.energyBalance) || settlement.energyBalance < 0
    || !Number.isFinite(Date.parse(settlement.updatedAt)))) throw new Error("奖励回执不完整");
  return { records, settlement };
}
