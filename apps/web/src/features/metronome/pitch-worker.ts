import { PitchDetector } from "pitchy";
const detector = PitchDetector.forFloat32Array(2048);
self.onmessage = ({ data }: MessageEvent<{ samples: Float32Array; sampleRate: number; time: number }>) => {
  const { samples, sampleRate, time } = data;
  let energy = 0;
  for (const value of samples) energy += value * value;
  const rms = Math.sqrt(energy / samples.length);
  const [frequency, clarity] = rms >= .001 ? detector.findPitch(samples, sampleRate) : [0, 0];
  self.postMessage({ time, frequency, clarity, rms });
};
