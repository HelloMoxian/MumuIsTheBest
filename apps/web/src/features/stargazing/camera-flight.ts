import { clamp, dot, equatorialVector, normalizedSkyView, vectorEquatorial, type Vector3 } from "./astronomy";
import type { SkyView } from "./types";

export const CAMERA_FLIGHT_DURATION_MS = 520;

/** Great-circle pointing plus smooth logarithmic zoom; this never mutates the saved exploration view. */
export function interpolateCameraFlight(from: SkyView, target: { ra: number; dec: number }, progress: number): SkyView {
  const start = normalizedSkyView(from);
  if (!Number.isFinite(target.ra) || !Number.isFinite(target.dec) || Math.abs(target.dec) > 90) return start;
  const end = normalizedSkyView({ ...target, fov: 15 });
  const t = Number.isFinite(progress) ? clamp(progress, 0, 1) : 0;
  if (t === 0) return start;
  if (t === 1) return end;
  const eased = t * t * (3 - 2 * t);
  const a = equatorialVector(start.ra, start.dec), b = equatorialVector(end.ra, end.dec);
  const cosine = clamp(dot(a, b), -1, 1);
  let vector: Vector3;
  if (cosine > 0.999999) {
    vector = [a[0] * (1 - eased) + b[0] * eased, a[1] * (1 - eased) + b[1] * eased, a[2] * (1 - eased) + b[2] * eased];
  } else {
    const angle = Math.acos(cosine);
    const tangent: [number, number, number] = [b[0] - a[0] * cosine, b[1] - a[1] * cosine, b[2] - a[2] * cosine];
    let length = Math.hypot(...tangent);
    if (length < 1e-8) {
      // An exact antipode has no unique shortest arc. Choose a stable perpendicular great circle.
      const axis: Vector3 = Math.abs(a[2]) < 0.8 ? [0, 0, 1] : [1, 0, 0];
      const component = dot(a, axis);
      tangent[0] = axis[0] - a[0] * component;
      tangent[1] = axis[1] - a[1] * component;
      tangent[2] = axis[2] - a[2] * component;
      length = Math.hypot(...tangent);
    }
    const forward = Math.cos(angle * eased), side = Math.sin(angle * eased) / length;
    vector = [a[0] * forward + tangent[0] * side, a[1] * forward + tangent[1] * side, a[2] * forward + tangent[2] * side];
  }
  return normalizedSkyView({ ...vectorEquatorial(vector), fov: start.fov * (end.fov / start.fov) ** eased });
}
