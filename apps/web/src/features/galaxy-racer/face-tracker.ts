import { FaceDetector } from "@mediapipe/tasks-vision";
import visionWasmLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import visionWasmBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import { faceDetectorModelUrl } from "./assets";
import type { FaceFrame } from "./types";

const wasmFileset = {
  wasmLoaderPath: visionWasmLoaderUrl,
  wasmBinaryPath: visionWasmBinaryUrl,
};

let preloadPromise: Promise<void> | undefined;

export function preloadFaceRuntime() {
  if (!preloadPromise) {
    preloadPromise = Promise.all([
      visionWasmLoaderUrl,
      visionWasmBinaryUrl,
      faceDetectorModelUrl,
    ].map(async (url) => {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`人脸识别资源还没有准备好：${response.status}`);
      await response.arrayBuffer();
    })).then(() => undefined).catch((error: unknown) => {
      preloadPromise = undefined;
      throw error;
    });
  }
  return preloadPromise;
}

export class RacerFaceTracker {
  private detector?: FaceDetector;

  async initialize() {
    await preloadFaceRuntime().catch(() => undefined);
    const create = (delegate: "GPU" | "CPU") => FaceDetector.createFromOptions(wasmFileset, {
      baseOptions: { modelAssetPath: faceDetectorModelUrl, delegate },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.45,
      minSuppressionThreshold: 0.3,
    });
    try {
      this.detector = await create("GPU");
    } catch {
      this.detector = await create("CPU");
    }
  }

  detect(video: HTMLVideoElement, now: number): FaceFrame | null {
    const detections = this.detector?.detectForVideo(video, now).detections ?? [];
    const face = detections
      .filter((detection) => detection.boundingBox)
      .sort((left, right) => {
        const a = left.boundingBox!;
        const b = right.boundingBox!;
        return b.width * b.height - a.width * a.height;
      })[0]?.boundingBox;
    if (!face || video.videoWidth <= 0 || video.videoHeight <= 0) return null;
    const width = face.width / video.videoWidth;
    const height = face.height / video.videoHeight;
    const mirroredX = 1 - (face.originX + face.width) / video.videoWidth;
    return {
      x: mirroredX,
      y: face.originY / video.videoHeight,
      width,
      height,
      centerX: mirroredX + width / 2,
      seenAt: now,
    };
  }

  close() {
    this.detector?.close();
    this.detector = undefined;
  }
}
