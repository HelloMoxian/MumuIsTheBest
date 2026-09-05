import type { MoveResult } from "./bejeweled-engine.js";

export type GemReward = { knowledge: number; energy: number };
export type GemWalletResult = { balance: number; updatedAt: string };
export type BejeweledWallets = {
  knowledge: (total: number) => Promise<GemWalletResult>;
  energy: (total: number) => Promise<GemWalletResult>;
};

// One entitlement per connected match, plus one per blast-only cleared gem.
// Random draws happen only on the server, before the durable entitlement is saved.
export function calculateGemRewards(move: MoveResult, random: () => number = Math.random): GemReward {
  const reward = { knowledge: 0, energy: 0 };
  const single = () => { reward[random() < 0.5 ? "knowledge" : "energy"]++; };
  for (const frame of move.frames) {
    if (frame.phase !== "clear") continue;
    const matched = new Set<number>();
    for (const group of frame.groups ?? []) {
      const unique = [...new Set(group)];
      unique.forEach(index => matched.add(index));
      if (unique.length >= 5) { reward.knowledge += 5; reward.energy += 5; }
      else if (unique.length === 4) { reward.knowledge += 2; reward.energy += 2; }
      else if (unique.length === 3) single();
    }
    for (const index of frame.cleared) if (!matched.has(index)) single();
  }
  return reward;
}
