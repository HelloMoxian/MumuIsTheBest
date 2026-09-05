import type { Board, Frame } from "../../../../server/src/bejeweled-engine";

export const SWAP_MS = 320;
export const REJECT_SHAKE_MS = 340;
export type GemMotion = { id: number; from: number; to: number; fresh: boolean; delay: number; duration: number };
export function planGemMotion(before: Board, after: Board, phase?: Frame["phase"]): GemMotion[] {
  const positions = new Map(before.flatMap((gem, index) => gem ? [[gem.id, index] as const] : []));
  const newCounts = Array.from({ length: 8 }, (_, col) => after.filter((gem, index) => index % 8 === col && gem && !positions.has(gem.id)).length);
  return after.flatMap((gem, to) => {
    if (!gem) return [];
    const old = positions.get(gem.id);
    if (old === to) return [];
    const fresh = old === undefined;
    // New gems start stacked above their own column, preserving their order.
    const from = old ?? (to - newCounts[to % 8] * 8);
    const rows = Math.abs(Math.floor(to / 8) - Math.floor(from / 8));
    return [{ id: gem.id, from, to, fresh,
      delay: phase === "swap" ? 0 : (to % 8) * 9,
      duration: phase === "swap" ? SWAP_MS : Math.min(620, 300 + Math.sqrt(rows) * 105),
    }];
  });
}
export function motionKeyframes(motion: GemMotion, size: number, swapping: boolean): Keyframe[] {
  const col = (index: number) => ((index % 8) + 8) % 8;
  const dx = (col(motion.from) - col(motion.to)) * size;
  const dy = (Math.floor(motion.from / 8) - Math.floor(motion.to / 8)) * size;
  if (swapping) {
    return Array.from({ length: 13 }, (_, i) => {
      const t = i / 12, ease = t * t * (3 - 2 * t);
      const distance = Math.hypot(dx, dy) || 1;
      const arc = i === 0 || i === 12 ? 0 : Math.sin(Math.PI * t) * size * 0.14;
      return { offset: t, transform: "translate(" + (dx * (1 - ease) - dy / distance * arc) + "px," + (dy * (1 - ease) + dx / distance * arc) + "px) scale(" + (1 + Math.sin(Math.PI * t) * 0.08) + ")" };
    });
  }
  // Gravity accelerates into a squash, followed by a short damped rebound.
  return [
    { offset: 0, transform: "translate(" + dx + "px," + dy + "px) scale(.98,1.04)", opacity: motion.fresh ? 0 : 1, easing: "cubic-bezier(.55,0,.95,.55)" },
    { offset: .10, opacity: 1 },
    { offset: .70, transform: "translate(0,2px) scale(1.13,.85)", opacity: 1, easing: "cubic-bezier(.15,.6,.3,1)" },
    { offset: .84, transform: "translate(0,-5px) scale(.96,1.07)", easing: "ease-in" },
    { offset: .94, transform: "translate(0,1px) scale(1.025,.97)" },
    { offset: 1, transform: "translate(0,0) scale(1)", opacity: 1 },
  ];
}
export function frameDuration(frame: Frame, previous: Board) {
  if (frame.phase === "swap") return SWAP_MS + 20;
  if (frame.phase === "clear") return frame.blasts?.length ? 820 : 480;
  if (frame.phase === "vacate") return 70;
  return Math.max(340, ...planGemMotion(previous, frame.board, frame.phase).map(motion => motion.delay + motion.duration)) + 30;
}
