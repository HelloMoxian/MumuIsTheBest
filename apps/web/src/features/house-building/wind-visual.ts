/** Deterministic normalized streaks: density follows wind, travel follows simulated time. */
export function windStreaks(speed: number, travel: number, span: number) {
  if (speed <= 0) return [];
  const strength = Math.min(1, speed / 60);
  const count = Math.round(24 + strength * 216);
  const phase = (travel * 0.18) / span;
  const fraction = (n: number) => ((n % 1) + 1) % 1;
  return Array.from({ length: count }, (_, i) => ({
    x: fraction(i * 0.61803398875 + phase * (0.8 + fraction(i * 0.317) * 0.4)),
    y: fraction(i * 0.754877666 + 0.13),
    length: 0.006 + strength * 0.012 + fraction(i * 0.419) * 0.008,
    opacity: 0.18 + strength * 0.2 + fraction(i * 0.271) * 0.12,
  }));
}
