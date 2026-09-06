import assert from "node:assert/strict";
import test from "node:test";
import { LatestMomentQueue } from "../speech/latest-moment-queue";
import { speakLearningMoment, stopLearningSpeech, pauseLearningSpeech, resumeLearningSpeech } from "./learning-speech";
import { getExperienceSnapshot } from "./experience-store";

test("real shared recording player preserves position and drains bilingual files only after ended", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const instances: FakeAudio[] = [];
  class FakeAudio {
    currentTime = 0; preload = ""; playCount = 0; paused = true;
    onended: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor(readonly src: string) { instances.push(this); }
    play() { this.playCount++; this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
  const queue = new LatestMomentQueue<string>({
    play: id => speakLearningMoment({ en: "Nice match!", zh: "连起来啦！", bilingualAudioSrc: "/" + id + ".mp3" }, "bilingual"),
    stop: stopLearningSpeech, pause: pauseLearningSpeech, resume: resumeLearningSpeech,
    busy: () => getExperienceSnapshot().speechStatus.startsWith("speaking"), show: () => {},
  });
  try {
    queue.enqueue("A"); queue.enqueue("B"); queue.enqueue("C");
    assert.equal(instances.length, 1); assert.equal(instances[0].src, "/A.mp3");
    instances[0].currentTime = 1.75;
    queue.setPaused(true);
    assert.equal(instances[0].paused, true); assert.equal(instances[0].currentTime, 1.75);
    queue.setPaused(false);
    assert.equal(instances[0].playCount, 2); assert.equal(instances[0].currentTime, 1.75);
    assert.equal(instances.length, 1);
    instances[0].onended?.();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(instances.length, 2); assert.equal(instances[1].src, "/C.mp3");
    queue.enqueue("D"); queue.setEnabled(false);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(instances[1].paused, true); assert.equal(instances.length, 2);
    assert.equal(getExperienceSnapshot().speechStatus, "idle");
  } finally {
    queue.dispose(); stopLearningSpeech();
    if (original) Object.defineProperty(globalThis, "Audio", original); else Reflect.deleteProperty(globalThis, "Audio");
  }
});
