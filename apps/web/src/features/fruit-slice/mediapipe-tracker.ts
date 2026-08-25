import {
  HandLandmarker,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import visionWasmLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import visionWasmBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import { handLandmarkerModelUrl, poseLandmarkerModelUrl } from "./assets";
import type { GameMode, PlayerSide, Point, TrackingFrame, TrackingHand } from "./types";

type TrackedHand = TrackingHand & { lastSeenAt: number };

function mirroredPoint(landmarks: NormalizedLandmark[]): Point {
  const palmIndexes = [0, 5, 9, 13, 17];
  const palm = palmIndexes.map((index) => landmarks[index]).filter(Boolean);
  return {
    x: 1 - palm.reduce((total, point) => total + point.x, 0) / palm.length,
    y: palm.reduce((total, point) => total + point.y, 0) / palm.length,
  };
}

function poseCenter(landmarks: NormalizedLandmark[]) {
  const torso = [11, 12, 23, 24]
    .map((index) => landmarks[index])
    .filter((point) => point && (point.visibility ?? 1) >= 0.3);
  if (torso.length < 2) return null;
  return 1 - torso.reduce((total, point) => total + point.x, 0) / torso.length;
}

export class MediaPipeBodyHandTracker {
  private handLandmarker?: HandLandmarker;
  private poseLandmarker?: PoseLandmarker;
  private lastPoseAt = -Infinity;
  private bodyCenters: number[] = [];
  private trackedHands = new Map<string, TrackedHand>();
  private nextHandId = 1;

  constructor(private readonly mode: GameMode) {}

  async initialize() {
    const wasmFileset = {
      wasmLoaderPath: visionWasmLoaderUrl,
      wasmBinaryPath: visionWasmBinaryUrl,
    };
    const create = async (delegate: "GPU" | "CPU") => {
      const handLandmarker = await HandLandmarker.createFromOptions(wasmFileset, {
        baseOptions: { modelAssetPath: handLandmarkerModelUrl, delegate },
        runningMode: "VIDEO",
        numHands: this.mode === "versus" ? 4 : 2,
        minHandDetectionConfidence: 0.35,
        minHandPresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      });
      try {
        const poseLandmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
          baseOptions: { modelAssetPath: poseLandmarkerModelUrl, delegate },
          runningMode: "VIDEO",
          numPoses: this.mode === "versus" ? 2 : 1,
          minPoseDetectionConfidence: 0.35,
          minPosePresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
          outputSegmentationMasks: false,
        });
        return { handLandmarker, poseLandmarker };
      } catch (error) {
        handLandmarker.close();
        throw error;
      }
    };

    try {
      ({ handLandmarker: this.handLandmarker, poseLandmarker: this.poseLandmarker } = await create("GPU"));
    } catch {
      ({ handLandmarker: this.handLandmarker, poseLandmarker: this.poseLandmarker } = await create("CPU"));
    }
  }

  detect(video: HTMLVideoElement, now: number): TrackingFrame {
    if (!this.handLandmarker || !this.poseLandmarker) {
      return { hands: [], bodyCount: 0, bodySides: { left: false, right: false } };
    }

    if (now - this.lastPoseAt >= 120) {
      this.lastPoseAt = now;
      this.bodyCenters = this.poseLandmarker.detectForVideo(video, now).landmarks
        .map(poseCenter)
        .filter((center): center is number => center !== null)
        .sort((left, right) => left - right);
    }

    const points = this.handLandmarker.detectForVideo(video, now).landmarks.map(mirroredPoint);
    const hands = this.assignStableHands(points, now);
    const bodySides = {
      left: this.mode === "single" ? this.bodyCenters.length > 0 : this.bodyCenters.some((x) => x < 0.5),
      right: this.mode === "single" ? this.bodyCenters.length > 0 : this.bodyCenters.some((x) => x >= 0.5),
    };
    return { hands, bodyCount: this.bodyCenters.length, bodySides };
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
    this.poseLandmarker?.close();
    this.handLandmarker = undefined;
    this.poseLandmarker = undefined;
    this.trackedHands.clear();
  }
}
