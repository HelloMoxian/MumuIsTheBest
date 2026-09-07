import type { Constellation, SkyObserver, SkyView, Star } from "./types";

const DEG = Math.PI / 180;
export type Vector3 = readonly [number, number, number];
export interface SkyProjection {
  width: number;
  height: number;
  scale: number;
  front: Vector3;
  east: Vector3;
  north: Vector3;
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function wrapDegrees(degrees: number) {
  return Number.isFinite(degrees) ? ((degrees % 360) + 360) % 360 : 0;
}

export function normalizedSkyView(view: SkyView): SkyView {
  return {
    ra: wrapDegrees(view.ra),
    dec: Number.isFinite(view.dec) ? clamp(view.dec, -90, 90) : 0,
    fov: Number.isFinite(view.fov) ? clamp(view.fov, 15, 160) : 110,
  };
}

export function equatorialVector(ra: number, dec: number): Vector3 {
  const longitude = wrapDegrees(ra) * DEG;
  const latitude = clamp(Number.isFinite(dec) ? dec : 0, -90, 90) * DEG;
  return [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)];
}

export function vectorEquatorial(vector: Vector3) {
  const length = Math.hypot(...vector);
  if (!length || !Number.isFinite(length)) return { ra: 0, dec: 0 };
  return { ra: wrapDegrees(Math.atan2(vector[1], vector[0]) / DEG), dec: Math.asin(clamp(vector[2] / length, -1, 1)) / DEG };
}

export function dot(a: Vector3, b: Vector3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Stereographic projection from inside the celestial sphere; celestial east is left. */
export function makeSkyProjection(view: SkyView, width: number, height: number): SkyProjection {
  const safe = normalizedSkyView(view);
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const ra = safe.ra * DEG;
  const dec = safe.dec * DEG;
  return {
    width: w,
    height: h,
    scale: Math.min(w, h) / (4 * Math.tan(safe.fov * DEG / 4)),
    front: equatorialVector(safe.ra, safe.dec),
    east: [-Math.sin(ra), Math.cos(ra), 0],
    north: [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)],
  };
}

export function projectVector(vector: Vector3, projection: SkyProjection) {
  const denominator = 1 + dot(vector, projection.front);
  // The antipode is at infinity, so never draw across this singularity.
  if (denominator < 0.025) return null;
  const factor = 2 * projection.scale / denominator;
  const x = projection.width / 2 - dot(vector, projection.east) * factor;
  const y = projection.height / 2 - dot(vector, projection.north) * factor;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function projectEquatorial(ra: number, dec: number, projection: SkyProjection) {
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90) return null;
  return projectVector(equatorialVector(ra, dec), projection);
}

export function unprojectVector(x: number, y: number, projection: SkyProjection): Vector3 {
  const east = -(x - projection.width / 2) / projection.scale;
  const north = -(y - projection.height / 2) / projection.scale;
  const r2 = east * east + north * north;
  const divisor = 4 + r2;
  const f = (4 - r2) / divisor;
  const e = 4 * east / divisor;
  const n = 4 * north / divisor;
  return [
    f * projection.front[0] + e * projection.east[0] + n * projection.north[0],
    f * projection.front[1] + e * projection.east[1] + n * projection.north[1],
    f * projection.front[2] + e * projection.east[2] + n * projection.north[2],
  ];
}

export function unprojectEquatorial(x: number, y: number, projection: SkyProjection) {
  return vectorEquatorial(unprojectVector(x, y, projection));
}

export function angularDistance(ra1: number, dec1: number, ra2: number, dec2: number) {
  return Math.acos(clamp(dot(equatorialVector(ra1, dec1), equatorialVector(ra2, dec2)), -1, 1)) / DEG;
}

/** Approximate mean sidereal time (UTC used as UT1), in degrees. USNO: https://aa.usno.navy.mil/faq/GAST */
export function localSiderealTime(observer: SkyObserver) {
  const milliseconds = Date.parse(observer.date);
  if (!Number.isFinite(milliseconds) || !Number.isFinite(observer.longitude)) return Number.NaN;
  const julianDate = milliseconds / 86_400_000 + 2_440_587.5;
  const midnight = Math.floor(julianDate - 0.5) + 0.5;
  const days = midnight - 2_451_545;
  const hours = (julianDate - midnight) * 24;
  const centuries = (julianDate - 2_451_545) / 36_525;
  const gmst = 6.697375 + 0.065709824279 * days + 1.0027379 * hours + 0.0000258 * centuries * centuries;
  return wrapDegrees(gmst * 15 + observer.longitude);
}

/** Educational geometric coordinates: no refraction, proper motion, precession, or nutation. Azimuth: north=0°, east=90°. */
export function equatorialToHorizontal(ra: number, dec: number, observer: SkyObserver) {
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90 ||
      !Number.isFinite(observer.latitude) || Math.abs(observer.latitude) > 90) {
    return { altitude: Number.NaN, azimuth: Number.NaN };
  }
  const sidereal = localSiderealTime(observer);
  if (!Number.isFinite(sidereal)) return { altitude: Number.NaN, azimuth: Number.NaN };
  const hourAngle = (sidereal - ra) * DEG;
  const latitude = observer.latitude * DEG;
  const declination = dec * DEG;
  const up = Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const north = Math.cos(latitude) * Math.sin(declination) - Math.sin(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  return { altitude: Math.asin(clamp(up, -1, 1)) / DEG, azimuth: wrapDegrees(Math.atan2(east, north) / DEG) };
}

export function horizontalToEquatorial(altitude: number, azimuth: number, observer: SkyObserver) {
  const sidereal = localSiderealTime(observer);
  if (![altitude, azimuth, observer.latitude, sidereal].every(Number.isFinite) || Math.abs(observer.latitude) > 90) {
    return { ra: Number.NaN, dec: Number.NaN };
  }
  const lat = observer.latitude * DEG;
  const alt = altitude * DEG;
  const az = azimuth * DEG;
  const north = Math.cos(alt) * Math.cos(az);
  const east = Math.cos(alt) * Math.sin(az);
  const up = Math.sin(alt);
  const dec = Math.asin(clamp(north * Math.cos(lat) + up * Math.sin(lat), -1, 1));
  const hourAngle = Math.atan2(-east, up * Math.cos(lat) - north * Math.sin(lat));
  return { ra: wrapDegrees(sidereal - hourAngle / DEG), dec: dec / DEG };
}

/** Display approximation of blackbody colour, deliberately less saturated than false-colour astronomy images. */
export function temperatureToColor(kelvin: number): string {
  if (!Number.isFinite(kelvin) || kelvin <= 0) return "#e6edff";
  const temperature = clamp(kelvin, 1_000, 40_000) / 100;
  const red = temperature <= 66 ? 255 : 329.698727446 * (temperature - 60) ** -0.1332047592;
  const green = temperature <= 66 ? 99.4708025861 * Math.log(temperature) - 161.1195681661 : 288.1221695283 * (temperature - 60) ** -0.0755148492;
  const blue = temperature >= 66 ? 255 : temperature <= 19 ? 0 : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;
  return `#${[red, green, blue].map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

export function colorForStar(star: Pick<Star, "temperatureK" | "colorIndex">): string {
  if (star.temperatureK !== null && Number.isFinite(star.temperatureK) && star.temperatureK > 0) return temperatureToColor(star.temperatureK);
  if (star.colorIndex !== null && Number.isFinite(star.colorIndex)) {
    // Ballesteros B−V relation is approximate and affected by reddening; it only drives the illustration.
    const bv = clamp(star.colorIndex, -0.4, 2.5);
    return temperatureToColor(4_600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)));
  }
  return "#e6edff";
}

export function constellationView(constellation: Constellation): SkyView {
  const points = constellation.lines.flat().filter(([ra, dec]) => Number.isFinite(ra) && Number.isFinite(dec) && Math.abs(dec) <= 90);
  if (!points.length) return normalizedSkyView({ ra: constellation.ra, dec: constellation.dec, fov: 45 });
  const vectors = points.map(([ra, dec]) => equatorialVector(ra, dec));
  const center = vectorEquatorial(vectors.reduce<[number, number, number]>((sum, vector) => [sum[0] + vector[0], sum[1] + vector[1], sum[2] + vector[2]], [0, 0, 0]));
  const radius = Math.max(...points.map(([ra, dec]) => angularDistance(center.ra, center.dec, ra, dec)));
  return normalizedSkyView({ ...center, fov: Math.max(22, radius * 2.65 + 8) });
}

export function formatRa(degrees: number) {
  const totalMinutes = Math.round(wrapDegrees(degrees) * 4) % 1_440;
  return `${Math.floor(totalMinutes / 60).toString().padStart(2, "0")}时${(totalMinutes % 60).toString().padStart(2, "0")}分`;
}
