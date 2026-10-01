// Beaufort thresholds (m/s); beyond the extended 17-force table we
// extrapolate the conventional v = 0.836 B^(3/2), explicitly labelled.
const thresholds = [
  0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7, 37, 41.5,
  46.2, 51, 56.1, 61.3,
];
export function windLevel(speed: number) {
  const index = thresholds.findIndex((v) => speed < v);
  return index >= 0 ? index : Math.round((speed / 0.836) ** (2 / 3));
}
export function windLabel(speed: number) {
  const level = windLevel(speed);
  return `${level} 级${level > 17 ? "（外推）" : ""} · ${Number(speed.toFixed(1))} m/s`;
}
export const QUAKE_LEVELS = [
  0, 1, 2, 3, 4, 5, 6, 6.5, 7, 7.5, 8, 8.2, 8.4, 8.6, 8.8, 9, 9.2, 9.5, 9.8, 10,
];
export const quakeLevelAmplitude = (level: number) =>
  (10 ** (level / 3) - 1) / (10 ** (10 / 3) - 1);
export const amplitudeLevel = (amplitude: number) =>
  3 * Math.log10(1 + amplitude * (10 ** (10 / 3) - 1));
export function quakeStep(amplitude: number) {
  return QUAKE_LEVELS.reduce(
    (best, level, index) =>
      Math.abs(level - amplitudeLevel(amplitude)) <
      Math.abs(QUAKE_LEVELS[best] - amplitudeLevel(amplitude))
        ? index
        : best,
    0,
  );
}
