import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

type ScoreSource = { x: number; y: number; amount: number };
export type ScoreAward = { id: number; from: number; to: number; sources: ScoreSource[] };
type Receipt = { award: ScoreAward; elapsed: number };
const POP_MS = 620, FLIGHT_MS = 520, COUNT_MS = 160;
const ARRIVE_MS = POP_MS + FLIGHT_MS, TOTAL_MS = ARRIVE_MS + COUNT_MS;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const credited = (elapsed: number) => easeOut(Math.min(1, Math.max(0, (elapsed - ARRIVE_MS) / COUNT_MS)));

/** Group nearby cleared cells; every removed gem contributes to exactly one receipt. */
export function scoreSources(matches: number[], width: number, height: number, chain: number): ScoreSource[] {
  const remaining = new Set(matches), groups: number[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value!;
    const group = [first]; remaining.delete(first);
    for (let i = 0; i < group.length; i++) {
      const cell = group[i], x = cell % width, y = Math.floor(cell / width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * width + nx;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && remaining.delete(next)) group.push(next);
      }
    }
    groups.push(group);
  }
  const center = (group: number[]) => ({ x: group.reduce((sum, i) => sum + i % width, 0) / group.length, y: group.reduce((sum, i) => sum + Math.floor(i / width), 0) / group.length });
  groups.sort((a, b) => b.length - a.length);
  // A whole-color clear can be scattered: cap overlapping numbers without losing points.
  while (groups.length > 6) {
    const group = groups.pop()!, point = center(group);
    const nearest = groups.reduce((best, candidate) => {
      const a = center(best), b = center(candidate);
      return Math.hypot(b.x - point.x, b.y - point.y) < Math.hypot(a.x - point.x, a.y - point.y) ? candidate : best;
    });
    nearest.push(...group);
  }
  return groups.map(group => {
    const point = center(group);
    const cell = group.reduce((best, i) => Math.hypot(i % width - point.x, Math.floor(i / width) - point.y) < Math.hypot(best % width - point.x, Math.floor(best / width) - point.y) ? i : best);
    return { x: (cell % width + .5) / width, y: (Math.floor(cell / width) + .5) / height, amount: group.length * 10 * chain };
  });
}

type Surface = RefObject<HTMLDivElement | null>;
function FlyingScore({ source, elapsed, board, target, layer }: {
  source: ScoreSource; elapsed: number; board: Surface; target: RefObject<HTMLSpanElement | null>; layer: Surface;
}) {
  const node = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!node.current || !board.current || !target.current || !layer.current) return;
    const boardRect = board.current.getBoundingClientRect(), goal = target.current.getBoundingClientRect(), bounds = layer.current.getBoundingClientRect();
    const half = node.current.offsetWidth / 2 + 8;
    const sx = Math.max(half, Math.min(bounds.width - half, boardRect.left - bounds.left + source.x * boardRect.width));
    const sy = boardRect.top - bounds.top + source.y * boardRect.height;
    const tx = goal.left - bounds.left + goal.width / 2, ty = goal.top - bounds.top + goal.height / 2;
    let x = sx, y = sy, scale = 1, rotate = 0, opacity = 1;
    if (elapsed < POP_MS) {
      const t = elapsed / POP_MS;
      y -= 22 * Math.min(1, t * 4) + Math.abs(Math.sin(t * Math.PI * 2)) * 36 * (1 - t);
      scale = .45 + .55 * Math.min(1, t * 6) + .38 * Math.sin(Math.PI * Math.min(1, t * 3));
      rotate = Math.sin(t * Math.PI * 3) * 7 * (1 - t);
    } else {
      const t = Math.min(1, (elapsed - POP_MS) / FLIGHT_MS), u = t * t, rest = 1 - u;
      const top = Math.max(20, Math.min(sy - 22, ty) - 90);
      x = rest * rest * sx + 2 * rest * u * ((sx + tx) / 2) + u * u * tx;
      y = rest * rest * (sy - 22) + 2 * rest * u * top + u * u * ty;
      scale = 1 - t * .65; opacity = Math.min(1, (1 - t) * 7);
    }
    node.current.style.transform = `translate(${x}px, ${Math.max(24, y)}px) translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`;
    node.current.style.opacity = String(opacity);
  }, [source, elapsed, board, target, layer]);
  return <span ref={node} className="db-score-receipt" aria-hidden="true"><span>+{source.amount.toLocaleString()}</span></span>;
}

/** Independent visual receipts; score and storage are committed before these appear. */
export function ScoreReadout({ score, award, running, board, root }: {
  score: number; award: ScoreAward | null; running: boolean; board: Surface; root: Surface;
}) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const seen = useRef<number | null>(null), target = useRef<HTMLSpanElement>(null), layer = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReduced(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useLayoutEffect(() => {
    if (!award || reduced) { seen.current = award?.id ?? null; setReceipts([]); return; }
    if (seen.current === award.id) return;
    seen.current = award.id;
    setReceipts(current => [...current, { award, elapsed: 0 }]);
  }, [award, reduced]);
  const active = receipts.length > 0;
  useEffect(() => {
    if (!active || !running || reduced) return;
    let frame = 0, previous = performance.now();
    const advance = (now: number) => {
      const delta = document.hidden ? 0 : Math.min(100, now - previous); previous = now;
      setReceipts(current => current.map(item => ({ ...item, elapsed: item.elapsed + delta })).filter(item => item.elapsed < TOTAL_MS));
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [active, running, reduced]);
  const pending = reduced ? 0 : receipts.reduce((sum, item) => sum + (item.award.to - item.award.from) * (1 - credited(item.elapsed)), 0);
  const counting = receipts.some(item => item.elapsed >= ARRIVE_MS);
  return <>
    <span ref={target} className={`db-score-readout ${counting ? "is-crediting" : ""}`} aria-label={`得分 ${score}`}>
      <strong aria-hidden="true">{Math.max(0, Math.round(score - pending)).toLocaleString()}</strong>
    </span>
    {root.current && createPortal(<div ref={layer} className="db-score-flight-layer" aria-hidden="true">
      {!reduced && receipts.flatMap(item => item.elapsed < ARRIVE_MS ? item.award.sources.map((source, index) => <FlyingScore key={`${item.award.id}:${index}`} source={source} elapsed={item.elapsed} board={board} target={target} layer={layer} />) : [])}
    </div>, root.current)}
  </>;
}
