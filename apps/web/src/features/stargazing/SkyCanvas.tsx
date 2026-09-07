import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  angularDistance, clamp, colorForStar, dot, equatorialVector, horizontalToEquatorial,
  localSiderealTime, makeSkyProjection, normalizedSkyView, projectEquatorial, projectVector,
  unprojectEquatorial, unprojectVector, type SkyProjection, type Vector3,
} from "./astronomy";
import type { Constellation, SkyLayers, SkyObserver, SkyView, Star } from "./types";
import { CAMERA_FLIGHT_DURATION_MS, interpolateCameraFlight } from "./camera-flight";

interface SkyCanvasProps {
  stars: Star[];
  constellations: Constellation[];
  view: SkyView;
  onViewChange: (view: SkyView) => void;
  layers: SkyLayers;
  selectedConstellationIds: string[];
  onSelectStar: (star: Star) => void;
  onSelectConstellation: (id: string) => void;
  observer: SkyObserver;
  reducedMotion: boolean;
  touring: boolean;
  /** Temporary close-up transition. The exploration view remains owned by the parent. */
  flightTarget?: Star | null;
}

interface StarPoint { star: Star; vector: Vector3; color: string }
interface HitStar { star: Star; x: number; y: number; radius: number }
interface LabelBox { x: number; y: number; width: number; height: number; id?: string }
interface Point { x: number; y: number }
interface SkyPalette { background: string; primary: string; secondary: string; cyan: string; violet: string }

const GALACTIC_X: Vector3 = [-0.0548755604, -0.8734370902, -0.4838350155];
const GALACTIC_Y: Vector3 = [0.4941094279, -0.44482963, 0.7469822445];
const GALACTIC_Z: Vector3 = [-0.867666149, -0.1980763734, 0.4559837762];

function within(point: Point, width: number, height: number, padding = 0) {
  return point.x >= -padding && point.x <= width + padding && point.y >= -padding && point.y <= height + padding;
}

function overlaps(a: LabelBox, b: LabelBox) {
  return a.x < b.x + b.width + 12 && a.x + a.width + 12 > b.x && a.y < b.y + b.height + 8 && a.y + a.height + 8 > b.y;
}

function closestStar(points: HitStar[], x: number, y: number) {
  let result: HitStar | null = null;
  let score = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const distance = Math.hypot(point.x - x, point.y - y);
    // Every star has a 48px touch target; brighter stars receive a small preference in crowded regions.
    const target = 24 + Math.max(0, point.radius - 2);
    const candidateScore = distance / target;
    if (candidateScore <= 1 && candidateScore < score) { result = point; score = candidateScore; }
  }
  return result;
}

/** Sample short great-circle arcs so RA=0 and polar constellations never acquire false screen-spanning segments. */
function strokeCelestialPath(context: CanvasRenderingContext2D, coordinates: [number, number][], projection: SkyProjection, zenith: Vector3 | null) {
  let previousScreen: Point | null = null;
  context.beginPath();
  for (let index = 1; index < coordinates.length; index += 1) {
    const [ra1, dec1] = coordinates[index - 1];
    const [ra2, dec2] = coordinates[index];
    const a = equatorialVector(ra1, dec1);
    const b = equatorialVector(ra2, dec2);
    const angle = angularDistance(ra1, dec1, ra2, dec2);
    const steps = Math.max(1, Math.ceil(angle / 2.5));
    const sine = Math.sin(angle * Math.PI / 180);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const p = Math.abs(sine) > 0.00001 ? Math.sin((1 - t) * angle * Math.PI / 180) / sine : 1 - t;
      const q = Math.abs(sine) > 0.00001 ? Math.sin(t * angle * Math.PI / 180) / sine : t;
      const vector: Vector3 = [a[0] * p + b[0] * q, a[1] * p + b[1] * q, a[2] * p + b[2] * q];
      const point = zenith && dot(vector, zenith) < -0.001 ? null : projectVector(vector, projection);
      if (!point || !within(point, projection.width, projection.height, 250)) { previousScreen = null; continue; }
      if (!previousScreen || Math.hypot(previousScreen.x - point.x, previousScreen.y - point.y) > Math.max(projection.width, projection.height) * 0.3) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
      previousScreen = point;
    }
  }
  context.stroke();
}

/** The galactic plane is astronomical; its soft cloud texture is an artistic density illustration, not survey imagery. */
function paintAtmosphere(context: CanvasRenderingContext2D, buffer: HTMLCanvasElement, projection: SkyProjection, layers: SkyLayers, zenith: Vector3 | null, palette: SkyPalette) {
  const { width, height } = projection;
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  if (!layers.milkyWay && !zenith) return;
  const bufferWidth = Math.max(1, Math.ceil(width / 7));
  const bufferHeight = Math.max(1, Math.ceil(height / 7));
  if (buffer.width !== bufferWidth || buffer.height !== bufferHeight) { buffer.width = bufferWidth; buffer.height = bufferHeight; }
  const temporary = buffer.getContext("2d");
  if (!temporary) return;
  const pixels = temporary.createImageData(bufferWidth, bufferHeight);
  for (let y = 0; y < bufferHeight; y += 1) {
    for (let x = 0; x < bufferWidth; x += 1) {
      const vector = unprojectVector((x + 0.5) * width / bufferWidth, (y + 0.5) * height / bufferHeight, projection);
      const horizon = zenith ? dot(vector, zenith) : 1;
      let brightness = 0;
      if (layers.milkyWay) {
        const sineLatitude = dot(vector, GALACTIC_Z);
        const longitude = Math.atan2(dot(vector, GALACTIC_Y), dot(vector, GALACTIC_X));
        const cloud = 0.7 + 0.16 * Math.sin(longitude * 5 + sineLatitude * 17) + 0.09 * Math.sin(longitude * 13 - sineLatitude * 45) + 0.05 * Math.sin(longitude * 37 + sineLatitude * 80);
        const plane = Math.exp(-(sineLatitude * sineLatitude) / 0.018);
        const core = 0.8 + 0.7 * Math.exp(-(longitude * longitude) / 0.9);
        const rift = 1 - 0.64 * Math.exp(-((sineLatitude - 0.022 * Math.sin(longitude * 4)) ** 2) / 0.0009) * (0.6 + 0.4 * Math.cos(longitude));
        brightness = plane * cloud * core * rift;
      }
      const below = horizon < 0;
      const offset = (y * bufferWidth + x) * 4;
      pixels.data[offset] = below ? 8 : 143;
      pixels.data[offset + 1] = below ? 12 : 158;
      pixels.data[offset + 2] = below ? 25 : 193;
      pixels.data[offset + 3] = below ? clamp(158 + Math.abs(horizon) * 80, 0, 238) : clamp(brightness * 54, 0, 90);
    }
  }
  temporary.putImageData(pixels, 0, 0);
  context.imageSmoothingEnabled = true;
  context.drawImage(buffer, 0, 0, width, height);
}

export function SkyCanvas(props: SkyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const cameraRef = useRef(normalizedSkyView(props.view));
  const flightRef = useRef<{ from: SkyView; target: Star; startedAt: number } | null>(null);
  const flightOriginRef = useRef<SkyView | null>(null);
  const requestDrawRef = useRef<() => void>(() => {});
  const hitStarsRef = useRef<HitStar[]>([]);
  const labelBoxesRef = useRef<LabelBox[]>([]);
  const hoverRef = useRef<HitStar | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const interactionRef = useRef({ start: { x: 0, y: 0 }, moved: false, lastAt: 0 });
  const [unavailable, setUnavailable] = useState(false);
  const preparedStars = useMemo<StarPoint[]>(() => props.stars
    .filter((star) => Number.isFinite(star.ra) && Number.isFinite(star.dec) && Math.abs(star.dec) <= 90 && Number.isFinite(star.magnitude))
    .map((star) => ({ star, vector: equatorialVector(star.ra, star.dec), color: colorForStar(star) }))
    .sort((a, b) => b.star.magnitude - a.star.magnitude), [props.stars]);
  const starsRef = useRef(preparedStars);
  starsRef.current = preparedStars;

  useEffect(() => {
    if (propsRef.current.flightTarget) return;
    cameraRef.current = normalizedSkyView(props.view);
    hoverRef.current = null;
    requestDrawRef.current();
  }, [props.view]);

  useEffect(() => {
    const target = props.flightTarget;
    if (!target) {
      flightRef.current = null;
      if (flightOriginRef.current) cameraRef.current = { ...flightOriginRef.current };
      flightOriginRef.current = null;
      requestDrawRef.current();
      return;
    }
    if (!flightOriginRef.current) flightOriginRef.current = { ...cameraRef.current };
    const from = { ...cameraRef.current };
    hoverRef.current = null;
    // Cancel any held pointer without publishing an intermediate or flight-end camera.
    const pointerIds = [...pointersRef.current.keys()];
    pointersRef.current.clear();
    for (const id of pointerIds) {
      if (canvasRef.current?.hasPointerCapture(id)) canvasRef.current.releasePointerCapture(id);
    }
    if (props.reducedMotion) {
      cameraRef.current = interpolateCameraFlight(from, target, 1);
      flightRef.current = null;
    } else {
      flightRef.current = { from, target, startedAt: performance.now() };
    }
    requestDrawRef.current();
    return () => { flightRef.current = null; };
  }, [props.flightTarget?.id, props.flightTarget?.ra, props.flightTarget?.dec, props.reducedMotion]);

  useEffect(() => { requestDrawRef.current(); }, [preparedStars, props.constellations, props.layers, props.selectedConstellationIds, props.observer, props.touring, props.reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = (() => {
      try { return canvas.getContext("2d", { alpha: false }); }
      catch { return null; }
    })();
    if (!context) { setUnavailable(true); return; }
    const atmosphere = document.createElement("canvas");
    const style = getComputedStyle(canvas);
    const palette: SkyPalette = {
      background: style.getPropertyValue("--space-950").trim() || "#0E0D2B",
      primary: style.getPropertyValue("--ink-primary").trim() || "#F5F5FF",
      secondary: style.getPropertyValue("--ink-secondary").trim() || "#B8B7D7",
      cyan: style.getPropertyValue("--cyan-300").trim() || "#59E7FF",
      violet: style.getPropertyValue("--violet-400").trim() || "#8D73FF",
    };
    let frame = 0;
    let disposed = false;
    let contextLost = false;
    let lastDraw = 0;
    let lastPublish = 0;
    let dirty = true;
    const draw = (now: number) => {
      frame = 0;
      if (disposed || contextLost || document.hidden) return;
      const current = propsRef.current;
      const flight = flightRef.current;
      const animate = current.touring && !current.reducedMotion && !current.flightTarget;
      const dt = lastDraw ? Math.min((now - lastDraw) / 1_000, 0.15) : 0;
      if (!dirty && !flight && (!animate || now - lastDraw < 80)) {
        if (animate) frame = requestAnimationFrame(draw);
        return;
      }
      if (flight) {
        const progress = (now - flight.startedAt) / CAMERA_FLIGHT_DURATION_MS;
        cameraRef.current = interpolateCameraFlight(flight.from, flight.target, progress);
        if (progress >= 1) flightRef.current = null;
      }
      if (animate && pointersRef.current.size === 0 && now - interactionRef.current.lastAt > 4_000) {
        cameraRef.current = normalizedSkyView({ ...cameraRef.current, ra: cameraRef.current.ra + dt * 1.3 });
        if (now - lastPublish > 1_000) { current.onViewChange({ ...cameraRef.current }); lastPublish = now; }
      }
      lastDraw = now;
      dirty = false;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.globalAlpha = 1;
      const projection = makeSkyProjection(cameraRef.current, width, height);
      const sidereal = localSiderealTime(current.observer);
      const zenith = current.layers.horizon && Number.isFinite(sidereal) && Number.isFinite(current.observer.latitude) && Math.abs(current.observer.latitude) <= 90
        ? equatorialVector(sidereal, current.observer.latitude) : null;
      paintAtmosphere(context, atmosphere, projection, current.layers, zenith, palette);

      if (current.layers.grid) {
        context.strokeStyle = palette.secondary;
        context.lineWidth = 0.7;
        context.globalAlpha = 0.14;
        for (let ra = 0; ra < 360; ra += 30) {
          strokeCelestialPath(context, Array.from({ length: 61 }, (_, i) => [ra, -90 + i * 3]), projection, zenith);
        }
        for (let dec = -60; dec <= 60; dec += 30) {
          strokeCelestialPath(context, Array.from({ length: 121 }, (_, i) => [i * 3, dec]), projection, zenith);
        }
        context.globalAlpha = 0.7;
        context.fillStyle = palette.secondary;
        context.font = "18px sans-serif";
        for (let ra = 0; ra < 360; ra += 30) {
          const point = projectEquatorial(ra, 0, projection);
          if (point && within(point, width, height) && (!zenith || dot(equatorialVector(ra, 0), zenith) > 0)) context.fillText(`${ra / 15}h`, point.x + 6, point.y - 6);
        }
        context.globalAlpha = 1;
      }

      const selectedIds = new Set(current.selectedConstellationIds);
      const shownConstellations = current.constellations.filter((constellation) => selectedIds.size === 0 || selectedIds.has(constellation.id));
      if (current.layers.lines) {
        context.strokeStyle = palette.cyan;
        context.lineWidth = selectedIds.size ? 1.35 : 0.85;
        context.globalAlpha = selectedIds.size ? 0.54 : 0.26;
        for (const constellation of shownConstellations) {
          for (const path of constellation.lines) strokeCelestialPath(context, path, projection, zenith);
        }
        context.globalAlpha = 1;
      }

      const hits: HitStar[] = [];
      const bright: HitStar[] = [];
      const zoom = clamp((100 / cameraRef.current.fov) ** 0.16, 0.88, 1.4);
      for (const { star, vector, color } of starsRef.current) {
        if (zenith && dot(vector, zenith) < 0) continue;
        const point = projectVector(vector, projection);
        if (!point || !within(point, width, height, 20)) continue;
        const radius = clamp(3.5 - star.magnitude * 0.47, 0.5, 4.9) * zoom;
        const alpha = clamp(1.06 - Math.max(0, star.magnitude - 1.5) * 0.115, 0.24, 1);
        if (star.magnitude < 2.4) {
          const glowRadius = radius * 5.5;
          const glow = context.createRadialGradient(point.x, point.y, radius * 0.25, point.x, point.y, glowRadius);
          glow.addColorStop(0, `${color}70`);
          glow.addColorStop(0.18, `${color}35`);
          glow.addColorStop(1, `${color}00`);
          context.fillStyle = glow;
          context.fillRect(point.x - glowRadius, point.y - glowRadius, glowRadius * 2, glowRadius * 2);
        }
        context.globalAlpha = alpha;
        context.fillStyle = color;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        if (star.magnitude < 1.8) {
          context.globalAlpha = 0.78;
          context.fillStyle = palette.primary;
          context.beginPath();
          context.arc(point.x, point.y, radius * 0.36, 0, Math.PI * 2);
          context.fill();
        }
        const hit = { star, ...point, radius };
        if (within(point, width, height)) hits.push(hit);
        if (star.magnitude < 2.8 && star.name && !/^(HIP|HD|HR|Gaia)\s?\d/i.test(star.name)) bright.push(hit);
      }
      hitStarsRef.current = hits;
      context.globalAlpha = 1;

      const occupied: LabelBox[] = [];
      const constellationLabels: LabelBox[] = [];
      if (current.layers.labels) {
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = `${selectedIds.size ? "600" : "500"} 18px ui-rounded, 'PingFang SC', sans-serif`;
        for (const constellation of [...shownConstellations].sort((a, b) => a.rank - b.rank)) {
          const vector = equatorialVector(constellation.ra, constellation.dec);
          if (zenith && dot(vector, zenith) < 0) continue;
          const point = projectVector(vector, projection);
          if (!point || point.y < 90 || point.y > height - 100) continue;
          const labelWidth = context.measureText(constellation.name).width;
          const box = { x: point.x - labelWidth / 2 - 9, y: point.y + 10, width: labelWidth + 18, height: 48, id: constellation.id };
          if (box.x < 20 || box.x + box.width > width - 20 || occupied.some((other) => overlaps(box, other))) continue;
          occupied.push(box);
          constellationLabels.push(box);
          context.shadowColor = palette.background;
          context.shadowBlur = 7;
          context.fillStyle = selectedIds.size ? palette.cyan : palette.secondary;
          context.globalAlpha = selectedIds.size ? 0.96 : 0.75;
          context.fillText(constellation.name, point.x, box.y + box.height / 2);
        }
        context.globalAlpha = 0.86;
        context.fillStyle = palette.primary;
        context.font = "18px ui-rounded, 'PingFang SC', sans-serif";
        context.textAlign = "left";
        for (const point of bright.sort((a, b) => a.star.magnitude - b.star.magnitude)) {
          const labelWidth = context.measureText(point.star.name).width;
          const box = { x: point.x + 13, y: point.y - 12, width: labelWidth, height: 25 };
          if (box.x + box.width > width - 20 || box.y < 90 || box.y > height - 115 || occupied.some((other) => overlaps(box, other))) continue;
          occupied.push(box);
          context.fillText(point.star.name, box.x, point.y);
        }
        context.shadowBlur = 0;
        context.globalAlpha = 1;
      }
      labelBoxesRef.current = constellationLabels;

      if (zenith) {
        context.strokeStyle = palette.secondary;
        context.lineWidth = 1;
        context.globalAlpha = 0.5;
        const horizon: [number, number][] = Array.from({ length: 121 }, (_, index) => {
          const coordinate = horizontalToEquatorial(0, index * 3, current.observer);
          return [coordinate.ra, coordinate.dec];
        });
        strokeCelestialPath(context, horizon, projection, null);
        context.fillStyle = palette.primary;
        context.font = "600 18px ui-rounded, 'PingFang SC', sans-serif";
        context.textAlign = "center";
        context.textBaseline = "bottom";
        for (const [index, label] of ["北 N", "东 E", "南 S", "西 W"].entries()) {
          const coordinate = horizontalToEquatorial(0, index * 90, current.observer);
          const point = projectEquatorial(coordinate.ra, coordinate.dec, projection);
          if (point && within(point, width, height, -25)) context.fillText(label, point.x, point.y - 12);
        }
        context.globalAlpha = 1;
      }
      const hovered = hoverRef.current;
      if (hovered) {
        const live = hits.find((hit) => hit.star.id === hovered.star.id);
        if (live) {
          context.strokeStyle = palette.cyan;
          context.lineWidth = 1.2;
          context.beginPath();
          context.arc(live.x, live.y, Math.max(live.radius + 8, 13), 0, Math.PI * 2);
          context.stroke();
          context.font = "18px ui-rounded, 'PingFang SC', sans-serif";
          context.textAlign = "center";
          context.textBaseline = "bottom";
          context.fillStyle = palette.primary;
          const name = hovered.star.name || hovered.star.latinName;
          const textWidth = context.measureText(name).width;
          const labelX = clamp(live.x, textWidth / 2 + 10, width - textWidth / 2 - 10);
          context.shadowColor = palette.background;
          context.shadowBlur = 8;
          context.fillText(name, labelX, Math.max(24, live.y - 24));
          context.shadowBlur = 0;
        }
      }
      if (animate || flightRef.current) frame = requestAnimationFrame(draw);
    };
    const schedule = () => {
      dirty = true;
      if (!disposed && !contextLost && !document.hidden && !frame) frame = requestAnimationFrame(draw);
    };
    requestDrawRef.current = schedule;
    const resize = new ResizeObserver(schedule);
    resize.observe(canvas);
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; lastDraw = 0; }
      else schedule();
    };
    const lost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(frame);
      frame = 0;
      setUnavailable(true);
    };
    const restored = () => {
      contextLost = false;
      lastDraw = 0;
      setUnavailable(false);
      schedule();
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (propsRef.current.flightTarget) return;
      interactionRef.current.lastAt = performance.now();
      hoverRef.current = null;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
      cameraRef.current = normalizedSkyView({ ...cameraRef.current, fov: cameraRef.current.fov * Math.exp(clamp(delta * 0.001, -0.25, 0.25)) });
      propsRef.current.onViewChange({ ...cameraRef.current });
      schedule();
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("contextlost", lost);
    canvas.addEventListener("contextrestored", restored);
    document.addEventListener("visibilitychange", visibility);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextlost", lost);
      canvas.removeEventListener("contextrestored", restored);
      document.removeEventListener("visibilitychange", visibility);
      requestDrawRef.current = () => {};
    };
  }, []);

  const pointFor = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const pan = (dx: number, dy: number) => {
    if (propsRef.current.flightTarget) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const projection = makeSkyProjection(cameraRef.current, rect.width, rect.height);
    const next = unprojectEquatorial(rect.width / 2 - dx, rect.height / 2 - dy, projection);
    cameraRef.current = normalizedSkyView({ ...next, fov: cameraRef.current.fov });
    requestDrawRef.current();
  };
  const pointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (propsRef.current.flightTarget) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.focus({ preventScroll: true });
    const point = pointFor(event);
    pointersRef.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = { start: point, moved: pointersRef.current.size > 1, lastAt: performance.now() };
    hoverRef.current = null;
    event.currentTarget.style.cursor = "grabbing";
    requestDrawRef.current();
  };
  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (propsRef.current.flightTarget) return;
    const point = pointFor(event);
    const old = pointersRef.current.get(event.pointerId);
    if (!old) {
      if (event.pointerType === "touch") return;
      const hovered = closestStar(hitStarsRef.current, point.x, point.y);
      const label = labelBoxesRef.current.find((box) => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height);
      event.currentTarget.style.cursor = hovered || label ? "pointer" : "grab";
      if (hovered?.star.id !== hoverRef.current?.star.id) { hoverRef.current = hovered; requestDrawRef.current(); }
      return;
    }
    const before = [...pointersRef.current.values()];
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size > 1) {
      const after = [...pointersRef.current.values()];
      const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
      const distance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
      if (distance > 10 && oldDistance > 10) cameraRef.current = normalizedSkyView({ ...cameraRef.current, fov: cameraRef.current.fov * oldDistance / distance });
      pan((point.x - old.x) / 2, (point.y - old.y) / 2);
      interactionRef.current.moved = true;
    } else {
      if (Math.hypot(point.x - interactionRef.current.start.x, point.y - interactionRef.current.start.y) > 5) interactionRef.current.moved = true;
      if (interactionRef.current.moved) pan(point.x - old.x, point.y - old.y);
    }
    interactionRef.current.lastAt = performance.now();
  };
  const pointerEnd = (event: PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    if (propsRef.current.flightTarget) return;
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && !interactionRef.current.moved && pointersRef.current.size === 0) {
      const point = pointFor(event);
      const label = labelBoxesRef.current.find((box) => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height);
      if (label?.id) propsRef.current.onSelectConstellation(label.id);
      else {
        const hit = closestStar(hitStarsRef.current, point.x, point.y);
        if (hit) propsRef.current.onSelectStar(hit.star);
      }
    }
    if (interactionRef.current.moved) propsRef.current.onViewChange({ ...cameraRef.current });
    event.currentTarget.style.cursor = pointersRef.current.size ? "grabbing" : "grab";
    interactionRef.current.lastAt = performance.now();
    requestDrawRef.current();
  };
  const keyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (propsRef.current.flightTarget) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "=", "-", "_", "Enter"].includes(event.key)) event.preventDefault();
      return;
    }
    const amount = event.shiftKey ? 65 : 28;
    const deltas: Record<string, [number, number]> = { ArrowLeft: [amount, 0], ArrowRight: [-amount, 0], ArrowUp: [0, amount], ArrowDown: [0, -amount] };
    if (deltas[event.key]) pan(...deltas[event.key]);
    else if (["+", "=", "-", "_"].includes(event.key)) {
      cameraRef.current = normalizedSkyView({ ...cameraRef.current, fov: cameraRef.current.fov * (["+", "="].includes(event.key) ? 0.84 : 1.19) });
    } else if (event.key === "Enter") {
      const rect = event.currentTarget.getBoundingClientRect();
      const closest = hitStarsRef.current.reduce<HitStar | null>((best, point) => !best || Math.hypot(point.x - rect.width / 2, point.y - rect.height / 2) < Math.hypot(best.x - rect.width / 2, best.y - rect.height / 2) ? point : best, null);
      if (closest) propsRef.current.onSelectStar(closest.star);
    } else return;
    event.preventDefault();
    hoverRef.current = null;
    interactionRef.current.lastAt = performance.now();
    propsRef.current.onViewChange({ ...cameraRef.current });
    requestDrawRef.current();
  };

  return (
    <div className="sg-sky" style={{ position: "absolute", inset: 0 }}>
      <canvas
        ref={canvasRef}
        tabIndex={props.flightTarget ? -1 : 0}
        data-visible-star-count={props.stars.length}
        data-flight-active={Boolean(props.flightTarget)}
        aria-label="可探索的全天星图。拖动转向，滚轮或双指缩放，点星星查看资料。键盘方向键转向，加减键缩放，回车查看最靠近画面中央的恒星；星座和恒星也可从目录选择。"
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - Enter"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={(event) => pointerEnd(event)}
        onPointerCancel={(event) => pointerEnd(event, true)}
        onLostPointerCapture={(event) => pointerEnd(event, true)}
        onPointerLeave={() => { hoverRef.current = null; requestDrawRef.current(); }}
        onKeyDown={keyDown}
        style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: props.flightTarget ? "default" : "grab" }}
      >星图文字目录可通过星座与恒星搜索访问。</canvas>
      {unavailable && <p role="status" style={{ position: "absolute", top: "40%", left: "10%", right: "10%", textAlign: "center" }}>这台设备暂时无法绘制星图，可以通过星座目录与恒星搜索查看资料。</p>}
    </div>
  );
}
