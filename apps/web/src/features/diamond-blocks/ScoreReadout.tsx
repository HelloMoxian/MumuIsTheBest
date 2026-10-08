import { useEffect, useState, type CSSProperties } from "react";

export type ScoreAward = { id: number; from: number; to: number };
const FLIGHT_MS = 580, COUNT_MS = 180;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Visual-only receipt: the engine has already committed and saved this award. */
export function ScoreReadout({ score, award, running }: { score: number; award: ScoreAward | null; running: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReduced(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (reduced) { setElapsed(FLIGHT_MS + COUNT_MS); return; }
    if (!award || !running) return;
    let frame = 0, previous = performance.now();
    let remaining = FLIGHT_MS + COUNT_MS - elapsed;
    if (remaining <= 0) return;
    const advance = (now: number) => {
      const delta = document.hidden ? 0 : Math.min(100, now - previous);
      previous = now; remaining -= delta;
      setElapsed(time => Math.min(FLIGHT_MS + COUNT_MS, time + delta));
      if (remaining > 0) frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
    // elapsed is intentionally captured only when playback starts/resumes.
  }, [award, running, reduced]);
  const current = award?.to === score && !reduced ? award : null;
  const flying = !!current && elapsed < FLIGHT_MS;
  const counting = !!current && elapsed >= FLIGHT_MS && elapsed < FLIGHT_MS + COUNT_MS;
  const progress = Math.min(1, elapsed / FLIGHT_MS);
  const count = easeOut(Math.min(1, Math.max(0, (elapsed - FLIGHT_MS) / COUNT_MS)));
  const displayed = current ? Math.round(current.from + (current.to - current.from) * count) : score;
  const receiptStyle = {
    transform: `translateY(${-68 * (1 - easeOut(progress))}px) scale(${1.08 - progress * .35})`,
    opacity: Math.min(1, progress * 7) * Math.min(1, (1 - progress) * 6),
  } as CSSProperties;
  return <span className={`db-score-readout ${counting ? "is-crediting" : ""}`} aria-label={`得分 ${score}`}>
    <strong aria-hidden="true">{displayed.toLocaleString()}</strong>
    {flying && <span className="db-score-receipt" style={receiptStyle} aria-hidden="true">+{(current.to - current.from).toLocaleString()}</span>}
  </span>;
}
