import {
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import visionWasmLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import visionWasmBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import { handLandmarkerModelUrl } from "./assets";
import type { GameMode, PlayerSide, Point, TrackingFrame, TrackingHand } from "./types";

type TrackedHand = TrackingHand & { lastSeenAt: number };

const wasmFileset = {
  wasmLoaderPath: visionWasmLoaderUrl,
  wasmBinaryPath: visionWasmBinaryUrl,
};

const runtimeAssetUrls = [
  visionWasmLoaderUrl,
  visionWasmBinaryUrl,
  handLandmarkerModelUrl,
] as const;

let runtimePreloadPromise: Promise<void> | undefined;

export function preloadMediaPipeRuntimeAssets() {
  if (!runtimePreloadPromise) {
    runtimePreloadPromise = Promise.all(runtimeAssetUrls.map(async (url) => {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`动作识别本地资源读取失败：${response.status}`);
      await response.arrayBuffer();
    })).then(() => undefined).catch((error: unknown) => {
      runtimePreloadPromise = undefined;
      throw error;
    });
  }
  return runtimePreloadPromise;
}

function mirroredPoint(landmarks: NormalizedLandmark[]): Point {
  const palmIndexes = [0, 5, 9, 13, 17];
  const palm = palmIndexes.map((index) => landmarks[index]).filter(Boolean);
  return {
    x: 1 - palm.reduce((total, point) => total + point.x, 0) / palm.length,
    y: palm.reduce((total, point) => total + point.y, 0) / palm.length,
  };
}

export class MediaPipeBodyHandTracker {
  private handLandmarker?: HandLandmarker;
  private trackedHands = new Map<string, TrackedHand>();
  private nextHandId = 1;

  constructor(private readonly mode: GameMode) {}

  async initialize() {
    // 设置页会提前预热这些同源文件；直接进入时也会在这里与初始化共用同一份请求。
    await preloadMediaPipeRuntimeAssets().catch(() => undefined);
    const create = (delegate: "GPU" | "CPU") => HandLandmarker.createFromOptions(wasmFileset, {
      baseOptions: { modelAssetPath: handLandmarkerModelUrl, delegate },
      runningMode: "VIDEO",
      numHands: this.mode === "versus" ? 4 : 2,
      minHandDetectionConfidence: 0.35,
      minHandPresenceConfidence: 0.35,
      minTrackingConfidence: 0.35,
    });

    try {
      this.handLandmarker = await create("GPU");
    } catch {
      this.handLandmarker = await create("CPU");
    }
  }

  detect(video: HTMLVideoElement, now: number): TrackingFrame {
    if (!this.handLandmarker) {
      return { hands: [], bodyCount: 0, bodySides: { left: false, right: false } };
    }

    const points = this.handLandmarker.detectForVideo(video, now).landmarks.map(mirroredPoint);
    const hands = this.assignStableHands(points, now);
    const bodySides = {
      left: hands.some((hand) => hand.side === "left"),
      right: hands.some((hand) => hand.side === "right"),
    };
    return { hands, bodyCount: 0, bodySides };
  }

  private assignStableHands(points: Point[], now: number) {
    const unmatched = new Set(this.trackedHands.keys());
    const nextHands: TrackingHand[] = [];
    for (const point of points) {
      const side: PlayerSide = this.mode === "single" ? "full" : point.x < 0.5 ? "left" : "right";
      let bestId: string | undefined;
      let bestDistance = 0.24;
      for (const id of unmatched) {
        const candidate = this.trackedHands.get(id)!;
        if (candidate.side !== side) continue;
        const distance = Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = id;
        }
      }
      const id = bestId ?? `hand-${this.nextHandId++}`;
      unmatched.delete(id);
      const tracked = { id, side, point, lastSeenAt: now };
      this.trackedHands.set(id, tracked);
      nextHands.push(tracked);
    }
    for (const [id, hand] of this.trackedHands) {
      if (now - hand.lastSeenAt > 260) this.trackedHands.delete(id);
    }
    return nextHands;
  }

  close() {
    this.handLandmarker?.close();
    this.handLandmarker = undefined;
    this.trackedHands.clear();
  }
}
