import type { Color, Frame } from "../../../../server/src/bejeweled-engine";

export const GEM_LIGHT: Record<Color, string> = {
  red: "#ff5777", orange: "#ffad46", yellow: "#ffe985", green: "#68ffc0",
  blue: "#69bcff", purple: "#c38aff", white: "#e5f7ff",
};
export type Shard = { x: number; y: number; vx: number; vy: number; radius: number; spin: number; phase: number; life: number; color: string };
export function createShards(frame: Frame): Shard[] {
  const explosive = !!frame.blasts?.length;
  const particles: Shard[] = [];
  for (const index of frame.cleared) {
    const color = GEM_LIGHT[frame.board[index]?.color ?? "white"];
    const count = explosive ? 12 : 8;
    for (let i = 0; i < count; i++) {
      const seed = ((index + 1) * 0.6180339887 + i * 0.3819660113 + frame.cascade * 0.17) % 1;
      const angle = i / count * Math.PI * 2 + seed;
      const speed = (explosive ? 2.5 : 1.3) + seed * 3.2;
      particles.push({
        x: index % 8 + .5, y: Math.floor(index / 8) + .5,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.5,
        radius: .035 + seed * .06, spin: (seed - .5) * 12, phase: angle,
        life: explosive ? .42 + seed * .35 : .24 + seed * .20, color,
      });
    }
  }
  return particles.slice(0, 768);
}
export function shardAt(shard: Shard, seconds: number) {
  const t = Math.max(0, seconds), life = Math.min(1, t / shard.life);
  return { x: shard.x + shard.vx * t, y: shard.y + shard.vy * t + 4.7 * t * t,
    alpha: Math.pow(1 - life, 1.6), radius: shard.radius * (1 - .65 * life), angle: shard.phase + shard.spin * t };
}
