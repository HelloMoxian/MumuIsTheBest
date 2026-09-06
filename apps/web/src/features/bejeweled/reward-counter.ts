import type { GemReward } from "../../../../server/src/bejeweled-rewards";
export const COIN_FLIGHT_MS = 1050;
export const COIN_STAGGER_MS = 36;
/** Each visual coin carries part of the confirmed reward; even large bursts sum exactly. */
export function coinArrivals(total: number) {
  const count = Math.min(32, total);
  return Array.from({ length: count }, (_, index) => ({
    index, cumulative: Math.floor((index + 1) * total / count),
    duration: COIN_FLIGHT_MS, delay: index * COIN_STAGGER_MS,
  }));
}
export class RewardCounter {
  private pending: { id: string; target: GemReward; reward: GemReward; arrived: GemReward } | null = null;
  constructor(private show: (balance: GemReward, arrival?: { currency: keyof GemReward; amount: number }) => void) {}
  sync(balance: GemReward) { this.pending = null; this.show({ ...balance }); }
  prepare(id: string, target: GemReward, reward: GemReward) {
    this.finish();
    this.pending = { id, target: { ...target }, reward: { ...reward }, arrived: { knowledge: 0, energy: 0 } };
    this.show(this.display());
  }
  arrive(id: string, currency: keyof GemReward, cumulative: number) {
    const pending = this.pending;
    if (!pending || pending.id !== id) return;
    const next = Math.min(pending.reward[currency], Math.max(pending.arrived[currency], cumulative));
    const amount = next - pending.arrived[currency];
    pending.arrived[currency] = next;
    if (amount) this.show(this.display(), { currency, amount });
  }
  finish(id?: string) {
    if (!this.pending || id !== undefined && this.pending.id !== id) return;
    const target = this.pending.target; this.pending = null; this.show({ ...target });
  }
  private display(): GemReward {
    const p = this.pending!;
    return { knowledge: Math.max(0, p.target.knowledge - p.reward.knowledge + p.arrived.knowledge),
      energy: Math.max(0, p.target.energy - p.reward.energy + p.arrived.energy) };
  }
}
