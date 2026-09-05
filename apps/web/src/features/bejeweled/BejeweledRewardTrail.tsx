import { useLayoutEffect, useRef } from "react";
import type { GemReward } from "../../../../server/src/bejeweled-rewards";

export function BejeweledRewardTrail({ reward, stopped }: { reward: (GemReward & { id: string }) | null; stopped: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!reward || stopped || !root.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const board = document.querySelector(".bj-board")?.getBoundingClientRect();
    if (!board) return;
    const animations: Animation[] = [];
    for (const currency of ["knowledge", "energy"] as const) {
      const target = document.querySelector('[data-bj-currency="' + currency + '"]')?.getBoundingClientRect();
      if (!target) continue;
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
        animations.push(coin.animate(frames, { duration: 1050, delay: index * 36, fill: "both", easing: "linear" }));
      });
    }
    return () => animations.forEach(animation => animation.cancel());
  }, [reward, stopped]);
  if (!reward || stopped) return null;
  return <div ref={root} className="bj-reward-trail" aria-hidden="true">
    {(["knowledge", "energy"] as const).flatMap(currency => Array.from({ length: Math.min(32, reward[currency]) }, (_, index) =>
      <span key={currency + index} className={"bj-flying-coin bj-flying-coin--" + currency} data-currency={currency}>{currency === "knowledge" ? "✦" : "ϟ"}</span>))}
  </div>;
}
