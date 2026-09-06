import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Board, Gem, Frame } from "../../../server/src/bejeweled-engine";
import { motionKeyframes, planGemMotion } from "../features/bejeweled/motion";
import { BejeweledEffects } from "../features/bejeweled/BejeweledEffects";

export const GEM_NAMES = {
  red: "红色方形", orange: "橙色六角", yellow: "黄色菱形", green: "绿色八角",
  blue: "蓝色三角", purple: "紫色圆形", white: "白色水滴",
};
export const SPECIAL_NAMES = { normal: "", flame: "火焰", star: "星形", cube: "超能", nova: "新星" };
export function GemIcon({ gem, small = false }: { gem: Pick<Gem, "color" | "special">; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const asset = gem.special === "cube" ? "cube" : gem.color;
  return <span className={"bj-gem bj-gem--" + gem.special + (small ? " bj-gem--small" : "")} data-color={gem.color}>
    {failed ? <span className="bj-fallback">{({ red: "■", orange: "⬡", yellow: "◆", green: "▣", blue: "▲", purple: "●", white: "♦" })[gem.color]}</span>
      : <img src={"/images/bejeweled/" + asset + ".png"} alt="" draggable={false} onError={() => setFailed(true)} />}
    {gem.special !== "normal" && <span className="bj-special">{({ flame: "火", star: "✦", cube: "虹", nova: "新星" })[gem.special]}</span>}
  </span>;
}
export function GemSwapBoard({ board, selected, hint, cleared, created, disabled, onSelect, onSwap, onInteract, frame = null, stopped = false, rejected = 0 }: {
  board: Board; selected: number | null; hint: number[]; cleared: number[]; created: number[];
  disabled: boolean; onSelect: (index: number) => void; onSwap: (a: number, b: number) => void;
  frame?: Frame | null; stopped?: boolean; rejected?: number;
  onInteract?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef<Board>([]);
  const gesture = useRef<{ index: number; x: number; y: number; id: number } | null>(null);
  const suppressClick = useRef(false);
  const [focus, setFocus] = useState(0);
  useLayoutEffect(() => {
    const motions = planGemMotion(previous.current, board, frame?.phase);
    previous.current = board;
    if (!root.current || stopped || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const size = root.current.clientWidth / 8;
    const animations: Animation[] = [];
    motions.forEach(motion => {
      const node = root.current?.querySelector<HTMLElement>('[data-index="' + motion.to + '"] .bj-gem');
      if (!node) return;
      const cell = node.parentElement;
      if (cell) cell.style.zIndex = "8";
      animations.push(node.animate(motionKeyframes(motion, size, frame?.phase === "swap"), {
        duration: motion.duration, delay: motion.delay, fill: "backwards", easing: "linear",
      }));
      void animations.at(-1)!.finished.then(() => { cell?.style.removeProperty("z-index"); }, () => { cell?.style.removeProperty("z-index"); });
    });
    return () => animations.forEach(animation => animation.cancel());
  }, [board, stopped]);
  useLayoutEffect(() => {
    if (!rejected || !root.current || stopped || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = root.current.animate([
      { transform: "translateX(0)" }, { transform: "translateX(-3px)" },
      { transform: "translateX(3px)" }, { transform: "translateX(-1.5px)" }, { transform: "translateX(0)" },
    ], { duration: 280, easing: "ease-out" });
    return () => animation.cancel();
  }, [rejected, stopped]);
  return <div className="bj-board-scroll" aria-label="宝石棋盘，窄屏可在此横向滚动">
    <div ref={root} className="bj-board" role="group" aria-label="8 行 8 列宝石棋盘，方向键移动，回车选中">
      {board.map((gem, index) => <button
        type="button" key={index} data-index={index} data-selected={selected === index}
        data-hint={hint.includes(index)} data-clear={cleared.includes(index)} data-created={created.includes(index)}
        style={{ "--burst-angle": (index * 137) % 360 + "deg" } as CSSProperties}
        className="bj-cell" aria-label={"第 " + (Math.floor(index / 8) + 1) + " 行第 " + (index % 8 + 1) + " 列，" + (gem ? GEM_NAMES[gem.color] + SPECIAL_NAMES[gem.special] + "宝石" : "下落补位中")}
        aria-pressed={selected === index} aria-disabled={disabled} tabIndex={focus === index ? 0 : -1}
        onFocus={() => setFocus(index)}
        onKeyDown={event => {
          if (!disabled && ["Enter", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) onInteract?.();
          const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
          const offset = offsets[event.key];
          if (offset !== undefined) {
            event.preventDefault();
            const next = index + offset;
            if (next < 0 || next > 63 || (Math.abs(offset) === 1 && Math.floor(next / 8) !== Math.floor(index / 8))) return;
            setFocus(next);
            root.current?.querySelector<HTMLButtonElement>('[data-index="' + next + '"]')?.focus();
          }
        }}
        onPointerDown={event => {
          if (disabled || event.button !== 0) return;
          onInteract?.();
          gesture.current = { index, x: event.clientX, y: event.clientY, id: event.pointerId };
          suppressClick.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { gesture.current = null; }}
        onPointerUp={event => {
          const start = gesture.current;
          gesture.current = null;
          if (!start || start.id !== event.pointerId || disabled) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
          suppressClick.current = true;
          const horizontal = Math.abs(dx) > Math.abs(dy);
          const target = start.index + (horizontal ? Math.sign(dx) : Math.sign(dy) * 8);
          if (target >= 0 && target < 64 && (!horizontal || Math.floor(target / 8) === Math.floor(start.index / 8))) onSwap(start.index, target);
        }}
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          if (!disabled) onSelect(index);
        }}>
        {gem && <GemIcon gem={gem} />}
        {selected === index && <span className="bj-selected-mark" aria-hidden="true">⌜ ⌝<br />⌞ ⌟</span>}
      </button>)}
      <BejeweledEffects frame={frame} stopped={stopped} />
    </div>
  </div>;
}
