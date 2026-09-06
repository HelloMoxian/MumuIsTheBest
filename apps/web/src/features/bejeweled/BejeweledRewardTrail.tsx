import { useLayoutEffect, useRef } from "react";
import type { GemReward } from "../../../../server/src/bejeweled-rewards";
import { coinArrivals } from "./reward-counter";

export function BejeweledRewardTrail({ reward, stopped, onArrive, onComplete }: {
  reward: (GemReward & { id: string }) | null; stopped: boolean;
  onArrive: (id: string, currency: keyof GemReward, cumulative: number) => void;
  onComplete: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const started = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!reward || started.current === reward.id) return;
    started.current = reward.id;
    if (stopped || !root.current || matchMedia("(prefers-reduced-motion: reduce)").matches) { onComplete(reward.id); return; }
    const board = document.querySelector(".bj-board")?.getBoundingClientRect();
    if (!board) { onComplete(reward.id); return; }
    let cancelled = false;
    const animations: Animation[] = [];
    for (const currency of ["knowledge", "energy"] as const) {
      const target = document.querySelector('[data-bj-currency="' + currency + '"]')?.getBoundingClientRect();
      if (!target) { onArrive(reward.id, currency, reward[currency]); continue; }
      const arrivals = coinArrivals(reward[currency]);
      const ex = target.left + target.width / 2, ey = target.top + target.height / 2;
      root.current.querySelectorAll<HTMLElement>('[data-currency="' + currency + '"]').forEach((coin, index) => {
        const sx = board.left + board.width * (.25 + ((index * .618) % .5));
        const sy = Math.min(window.innerHeight - 40, board.top + board.height * (.35 + ((index * .382) % .3)));
        const frames = Array.from({ length: 25 }, (_, step) => {
          const t = step / 24, u = 1 - t;
          const x = u * u * u * sx + 3 * u * u * t * (sx + (index % 2 ? 70 : -70)) + 3 * u * t * t * (ex - 70) + t * t * t * ex;
          const y = u * u * u * sy + 3 * u * u * t * (sy - 90) + 3 * u * t * t * (ey + 100) + t * t * t * ey;
          return { offset: t, transform: "translate(" + x + "px," + y + "px) scale(" + (t > .8 ? 1 - (t - .8) * 3 : 1) + ") rotate(" + (Math.sin(t * Math.PI * 2) * 18) + "deg)", opacity: t < .1 ? t * 10 : t > .9 ? (1 - t) * 10 : 1 };
        });
        const arrival = arrivals[index]!;
        try {
          const animation = coin.animate(frames, { duration: arrival.duration, delay: arrival.delay, fill: "both", easing: "linear" });
          animations.push(animation);
          void animation.finished.then(() => { if (!cancelled) onArrive(reward.id, currency, arrival.cumulative); }, () => { if (!cancelled) onComplete(reward.id); });
        } catch { onArrive(reward.id, currency, arrival.cumulative); }
      });
    }
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => { if (!cancelled) onComplete(reward.id); });
    return () => { cancelled = true; animations.forEach(animation => animation.cancel()); onComplete(reward.id); };
  }, [reward, stopped, onArrive, onComplete]);
  if (!reward || stopped) return null;
  return <div ref={root} className="bj-reward-trail" aria-hidden="true">
    {(["knowledge", "energy"] as const).flatMap(currency => Array.from({ length: Math.min(32, reward[currency]) }, (_, index) =>
      <span key={currency + index} className={"bj-flying-coin bj-flying-coin--" + currency} data-currency={currency}>{currency === "knowledge" ? "✦" : "ϟ"}</span>))}
  </div>;
}
