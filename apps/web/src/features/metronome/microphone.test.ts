import assert from "node:assert/strict";
import { test } from "node:test";
import { HumMicrophone } from "./microphone";

test("denied microphone is actionable; permission granted after cancellation immediately releases the device", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const context = { audioWorklet: {} } as AudioContext;
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => { throw new DOMException("private browser detail", "NotAllowedError"); } } } });
    const denied = new HumMicrophone(() => assert.fail(), () => assert.fail(), () => assert.fail());
    await assert.rejects(denied.start(context), /麦克风还未授权/);
    let resolve!: (stream: MediaStream) => void, stopped = 0;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise<MediaStream>(r => { resolve = r; }) } } });
    const cancelled = new HumMicrophone(() => assert.fail(), () => assert.fail(), () => assert.fail());
    const pending = cancelled.start(context); cancelled.stop(); cancelled.stop();
    resolve({ getTracks: () => [{ stop: () => stopped++ }] } as unknown as MediaStream);
    assert.equal(await pending, false); assert.equal(stopped, 1);
  } finally { if (previous) Object.defineProperty(globalThis, "navigator", previous); else Reflect.deleteProperty(globalThis, "navigator"); }
});
test("failed worklet startup releases the stream and worker without leaking a microphone", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator"), previousWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  let stopped = 0, terminated = 0;
  const track = { readyState: "live", onended: null, stop: () => stopped++ };
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } } });
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: class { terminate() { terminated++; } } });
    const mic = new HumMicrophone(() => assert.fail(), () => assert.fail(), () => assert.fail());
    await assert.rejects(mic.start({ audioWorklet: { addModule: async () => { throw new Error("test module failure"); } } } as unknown as AudioContext), /录音暂时无法启动/);
    mic.stop(); assert.equal(stopped, 1); assert.equal(terminated, 1); assert.equal(track.onended, null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous); else Reflect.deleteProperty(globalThis, "navigator");
    if (previousWorker) Object.defineProperty(globalThis, "Worker", previousWorker); else Reflect.deleteProperty(globalThis, "Worker");
  }
});
