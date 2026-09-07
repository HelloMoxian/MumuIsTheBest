import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Star } from "./types";
import "./stellar-globe.css";

interface StellarGlobeProps {
  star: Star;
  reducedMotion: boolean;
  paused: boolean;
}

// A bounded blackbody colour approximation, with enhanced warm saturation so
// a cool star remains recognisably orange against its own bright photosphere.
// Surface, corona and rotation are illustrations, not resolved measurements.
function stellarColor(kelvin: number): [number, number, number] {
  const temperature = Math.min(40000, Math.max(1800, kelvin)) / 100;
  const red = temperature <= 66 ? 255 : 329.6987 * (temperature - 60) ** -0.1332;
  const green = temperature <= 66
    ? 99.4708 * Math.log(temperature) - 161.1196
    : 288.1222 * (temperature - 60) ** -0.0755;
  const blue = temperature >= 66 ? 255
    : temperature <= 19 ? 0 : 138.5177 * Math.log(temperature - 10) - 305.0448;
  const saturation = 1 + Math.max(0, Math.min(1, (6500 - kelvin) / 3500)) * 2.6;
  return [red, green, blue].map((value) => Math.min(1, Math.max(0, value / 255)) ** saturation) as [number, number, number];
}

function visualTemperature(star: Star): number {
  if (star.temperatureK && Number.isFinite(star.temperatureK) && star.temperatureK > 0) return star.temperatureK;
  if (star.colorIndex !== null && Number.isFinite(star.colorIndex)) {
    // Only drives this illustration: never replace an unknown measured
    // temperature in the data. Carbon stars especially are not blackbodies.
    const colorIndex = Math.min(2.5, Math.max(-0.4, star.colorIndex));
    return 4600 * (1 / (0.92 * colorIndex + 1.7) + 1 / (0.92 * colorIndex + 0.62));
  }
  const spectralTemperatures: Record<string, number> = {
    O: 33000, B: 16000, A: 8500, F: 6500, G: 5500, K: 4300, M: 3200,
    C: 2900, N: 2800, R: 3400,
  };
  return spectralTemperatures[star.spectralType.trim()[0] ?? ""] ?? 5800;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uAspect;
  uniform vec3 uColor;
  uniform vec2 uRotation;
  uniform float uTime;
  uniform float uScale;
  uniform float uCellScale;
  uniform float uSpots;
  uniform float uSeed;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.11, 0.27, 0.39));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }

  float fbm(vec3 p) {
    return 0.57 * noise(p) + 0.27 * noise(p * 2.03 + 5.7)
      + 0.11 * noise(p * 4.17 + 17.3) + 0.05 * noise(p * 8.1 + 4.1);
  }

  vec3 rotate(vec3 p) {
    float x = uRotation.x;
    float y = uRotation.y;
    p = vec3(p.x, cos(x) * p.y - sin(x) * p.z, sin(x) * p.y + cos(x) * p.z);
    return vec3(cos(y) * p.x + sin(y) * p.z, p.y, -sin(y) * p.x + cos(y) * p.z);
  }

  void main() {
    vec2 point = (vUv - 0.5) * 2.0 * uAspect / uScale;
    float radius = length(point);
    float angle = atan(point.y, point.x);

    if (radius > 1.0) {
      float height = radius - 1.0;
      float filaments = 0.6 + 0.4 * fbm(vec3(cos(angle) * 9.0, sin(angle) * 9.0, uTime * 0.028 + uSeed));
      float rays = pow(0.5 + 0.5 * sin(angle * 43.0 + 7.0 * sin(angle * 5.0)), 3.0);
      float corona = exp(-height * 25.0) * 0.42 + exp(-height * 7.0) * 0.10 * filaments;
      corona += exp(-height * 14.0) * 0.035 * rays;
      float alpha = corona * (1.0 - smoothstep(0.35, 0.65, height));
      gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.035), alpha);
      return;
    }

    float z = sqrt(max(0.0, 1.0 - radius * radius));
    vec3 p = rotate(vec3(point, z));
    vec3 seed = vec3(uSeed * 0.013, uSeed * 0.037, uSeed * 0.017);
    vec3 drift = vec3(uTime * 0.008, uTime * 0.006, 0.0);
    float convection = fbm(p * 6.0 + seed + drift);
    vec3 warp = vec3(convection, noise(p * 8.0 + seed), noise(p * 7.0 - seed));
    float cells = noise(p * uCellScale + warp * 1.9 + drift);
    float granules = smoothstep(0.22, 0.69, cells);
    float grain = noise(p * uCellScale * 3.7 + seed + drift * 0.3);
    float lanes = smoothstep(0.35, 0.58, cells);
    float surface = 0.95 + 0.10 * granules + 0.025 * grain + 0.015 * convection;
    surface *= 0.96 + 0.04 * lanes;

    float spots = smoothstep(0.71, 0.87, noise(p * 7.0 + seed + 30.1));
    spots *= smoothstep(0.39, 0.68, noise(p * 13.0 + seed + drift * 0.2));
    // A photosphere emits across the whole visible disk. Keep convection and
    // magnetic regions subtle: broad black patches resemble a rocky planet.
    surface *= 1.0 - spots * uSpots * 0.045;
    float limb = 0.76 + 0.24 * pow(z, 0.40);
    vec3 hot = mix(uColor, vec3(1.0), 0.09);
    vec3 base = mix(uColor, hot, granules * 0.4 + grain * 0.05);
    vec3 color = base * surface * limb;
    color += uColor * pow(1.0 - z, 10.0) * 0.07;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function paintFallback(canvas: HTMLCanvasElement, star: Star, width: number, height: number, scale: number) {
  const context = canvas.getContext("2d");
  if (!context) return false;
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const radius = Math.min(width, height) * scale / 2;
  const centerX = width / 2;
  const centerY = height / 2;
  const color = stellarColor(visualTemperature(star));
  const rgb = color.map((channel) => Math.round(channel * 255));
  const rgba = (alpha: number) => `rgba(${rgb.join(",")},${alpha})`;
  const halo = context.createRadialGradient(centerX, centerY, radius * 0.92, centerX, centerY, radius * 1.45);
  halo.addColorStop(0, rgba(0.35));
  halo.addColorStop(0.25, rgba(0.08));
  halo.addColorStop(1, rgba(0));
  context.fillStyle = halo;
  context.fillRect(0, 0, width, height);
  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();
  const surface = context.createRadialGradient(centerX, centerY, radius * 0.05, centerX, centerY, radius);
  surface.addColorStop(0, `rgb(${rgb.map((value) => Math.round(value + (255 - value) * 0.025)).join(",")})`);
  surface.addColorStop(0.62, `rgb(${rgb.map((value) => Math.round(value * 0.98)).join(",")})`);
  surface.addColorStop(0.92, `rgb(${rgb.map((value) => Math.round(value * 0.91)).join(",")})`);
  surface.addColorStop(1, `rgb(${rgb.map((value) => Math.round(value * 0.81)).join(",")})`);
  context.fillStyle = surface;
  context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  let randomState = star.id + 1747;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  for (let index = 0; index < 5800; index += 1) {
    const x = (random() * 2 - 1) * radius;
    const y = (random() * 2 - 1) * radius;
    const depth = Math.sqrt(Math.max(0, 1 - (x * x + y * y) / (radius * radius)));
    if (depth < 0.04) continue;
    const size = radius * (0.001 + random() * 0.003) * depth;
    context.fillStyle = index % 4 === 0 ? "rgba(60,10,0,0.025)" : `rgba(255,245,220,${0.01 + random() * 0.06})`;
    context.beginPath();
    context.ellipse(centerX + x, centerY + y, size, size * (0.6 + depth * 0.4), 0, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
  return true;
}

export function StellarGlobe({ star, reducedMotion, paused }: StellarGlobeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const webglRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLCanvasElement>(null);
  const controls = useRef({ reducedMotion, paused });
  const redraw = useRef<(() => void) | null>(null);
  const [mode, setMode] = useState<"loading" | "webgl" | "fallback" | "unavailable">("loading");

  useEffect(() => {
    controls.current = { reducedMotion, paused };
    redraw.current?.();
  }, [paused, reducedMotion]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = webglRef.current;
    const fallback = fallbackRef.current;
    if (!host || !canvas || !fallback) return;
    let disposed = false;
    let useFallback = false;
    let visible = true;
    let renderer: THREE.WebGLRenderer | undefined;
    let geometry: THREE.PlaneGeometry | undefined;
    let material: THREE.ShaderMaterial | undefined;
    let frame = 0;
    let lastTime = 0;
    let elapsed = 0;
    let width = 1;
    let height = 1;
    let drag: { x: number; y: number; pointer: number } | null = null;
    let rotationX = 0.16;
    let rotationY = 0.3;
    const temperature = visualTemperature(star);
    const radiusSolar = Math.max(0.1, star.radiusSolar ?? 1);
    const scale = Math.min(0.94, Math.max(0.70, 0.78 + Math.log10(radiusSolar) * 0.053));
    const giant = Math.min(1, Math.max(0, Math.log10(radiusSolar) / 3));
    const cellScale = temperature > 10000 ? 210 : 145 - giant * 55;
    const rotationSpeed = star.rotationKmS && star.rotationKmS > 0
      ? Math.min(0.052, Math.max(0.006, 0.016 * Math.sqrt(star.rotationKmS / 5) / radiusSolar ** 0.18))
      : 0.015 / (1 + Math.log10(1 + radiusSolar) * 0.4);
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    };
    const showFallback = () => {
      if (disposed) return;
      useFallback = true;
      stop();
      setMode(paintFallback(fallback, star, width, height, scale) ? "fallback" : "unavailable");
    };
    const canAnimate = () => !controls.current.paused && !controls.current.reducedMotion
      && !document.hidden && visible && !useFallback && !disposed;
    const draw = () => {
      if (disposed || !renderer || !material || useFallback) return;
      material.uniforms.uTime!.value = elapsed;
      material.uniforms.uRotation!.value.set(rotationX, rotationY + elapsed * rotationSpeed);
      try {
        renderer.render(scene, camera);
      } catch {
        showFallback();
      }
    };
    const tick = (time: number) => {
      frame = 0;
      if (!canAnimate()) { lastTime = 0; return; }
      if (lastTime > 0) elapsed += Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      draw();
      if (canAnimate()) frame = requestAnimationFrame(tick);
    };
    const refresh = () => {
      stop();
      if (!document.hidden && visible) draw();
      if (canAnimate()) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      // The arrival animation scales an ancestor; the drawing buffer must use the full layout size.
      width = Math.max(1, host.clientWidth);
      height = Math.max(1, host.clientHeight);
      if (useFallback) {
        paintFallback(fallback, star, width, height, scale);
        return;
      }
      renderer?.setSize(width, height, false);
      material?.uniforms.uAspect!.value.set(width / Math.min(width, height), height / Math.min(width, height));
      refresh();
    };
    const contextLost = (event: Event) => { event.preventDefault(); showFallback(); };
    canvas.addEventListener("webglcontextlost", contextLost);
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms: {
          uAspect: { value: new THREE.Vector2(1, 1) },
          uColor: { value: new THREE.Vector3(...stellarColor(temperature)) },
          uRotation: { value: new THREE.Vector2(rotationX, rotationY) },
          uTime: { value: 0 },
          uScale: { value: scale },
          uCellScale: { value: cellScale },
          uSpots: { value: temperature < 6500 ? 0.8 : 0.12 },
          uSeed: { value: star.id % 999 },
        },
      });
      geometry = new THREE.PlaneGeometry(2, 2);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      // Shader failures do not necessarily throw from render(). Detect them
      // explicitly so an unsupported driver also gets the readable fallback.
      renderer.debug.onShaderError = showFallback;
      resize();
      if (!useFallback) setMode("webgl");
    } catch {
      width = Math.max(1, host.clientWidth);
      height = Math.max(1, host.clientHeight);
      showFallback();
    }

    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || useFallback) return;
      drag = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      rotationY += (event.clientX - drag.x) / Math.max(200, width) * 3;
      rotationX += (event.clientY - drag.y) / Math.max(200, height) * 2;
      drag.x = event.clientX;
      drag.y = event.clientY;
      draw();
    };
    const pointerUp = (event: PointerEvent) => {
      if (drag?.pointer !== event.pointerId) return;
      drag = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (useFallback || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "ArrowLeft") rotationY -= 0.13;
      if (event.key === "ArrowRight") rotationY += 0.13;
      if (event.key === "ArrowUp") rotationX -= 0.13;
      if (event.key === "ArrowDown") rotationX += 0.13;
      if (event.key === "Home") { rotationX = 0.16; rotationY = 0.3; }
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    const intersection = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      refresh();
    });
    intersection?.observe(host);
    redraw.current = refresh;
    document.addEventListener("visibilitychange", refresh);
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("lostpointercapture", pointerUp);
    canvas.addEventListener("keydown", keyDown);

    return () => {
      disposed = true;
      stop();
      redraw.current = null;
      observer.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", refresh);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("lostpointercapture", pointerUp);
      canvas.removeEventListener("keydown", keyDown);
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
    };
  }, [star]);

  const label = `${star.name}恒星球体示意；颜色依据温度、色指数或光谱类型并增强显示，纹理与转动为示意`;
  return (
    <div ref={hostRef} className="sg-stellar-globe" data-renderer={mode}>
      <canvas ref={webglRef} className="sg-stellar-globe__canvas" hidden={mode === "fallback" || mode === "unavailable"} role="img" tabIndex={mode === "webgl" ? 0 : -1} aria-label={`${label}。拖动或按方向键转动，Home 键复位`} />
      <canvas ref={fallbackRef} className="sg-stellar-globe__canvas" hidden={mode !== "fallback"} role="img" aria-label={`${label}，静态图像`} />
      {mode === "fallback" && <span className="sg-stellar-globe__status" role="status">当前显示静态恒星示意</span>}
      {mode === "unavailable" && <span className="sg-stellar-globe__status" role="status">恒星画面暂不可用，仍可阅读恒星资料</span>}
    </div>
  );
}
