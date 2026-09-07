import assert from "node:assert/strict";
import test from "node:test";
import { audioFocus } from "../../shared/audio/audio-focus";
import { browserTts, type TtsResult } from "../../shared/speech";
import { FAT_BURN_BPM, FatBurnAudio, fatBurnMusicStep } from "./audio";

class FakeParam {
  value = 0;
  targets: number[] = [];
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
  setTargetAtTime(value: number) { this.value = value; this.targets.push(value); }
  cancelScheduledValues() {}
}
class FakeNode {
  disconnected = false;
  connect<T extends FakeNode>(node: T): T { return node; }
  disconnect() { this.disconnected = true; }
}
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeSource extends FakeNode {
  frequency = new FakeParam();
  type = "sine";
  buffer: unknown;
  onended: (() => void) | null = null;
  starts: number[] = [];
  stops: number[] = [];
  start(at: number) { this.starts.push(at); }
  stop(at: number) { this.stops.push(at); }
}
class FakeFilter extends FakeNode {
  type = "lowpass";
  frequency = new FakeParam();
  Q = new FakeParam();
}
class FakeContext {
  currentTime = 0;
  sampleRate = 8000;
  state: AudioContextState = "suspended";
  destination = new FakeNode();
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  closeCalls = 0;
  resumeCalls = 0;
  pendingResume: Promise<void> | null = null;
  resumeFailure = false;
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createBiquadFilter() { return new FakeFilter(); }
  createOscillator() { return this.createBufferSource(); }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
  createBuffer(_channels: number, size: number) { return { getChannelData: () => new Float32Array(size) }; }
  async resume() {
    this.resumeCalls++;
    if (this.resumeFailure) throw new Error("device unavailable");
    if (this.pendingResume) await this.pendingResume;
    this.state = "running";
  }
  async close() { this.closeCalls++; this.state = "closed"; }
  asContext() { return this as unknown as AudioContext; }
}

test("the arrangement has phase-specific tempo, real harmony, and a 32-bar variation", () => {
  assert.deepEqual(FAT_BURN_BPM, { warmup: 110, workout: 132, cooldown: 86 });
  const notes = Array.from({ length: 512 }, (_, step) => fatBurnMusicStep(step, "workout")).flat();
  assert.deepEqual(new Set(notes.map(note => note.instrument)), new Set(["kick", "snare", "hat", "bass", "chord", "arp"]));
  assert.notDeepEqual(fatBurnMusicStep(2, "workout"), fatBurnMusicStep(4 * 16 + 2, "workout"));
  assert.notDeepEqual(fatBurnMusicStep(16 * 4, "workout"), fatBurnMusicStep(16 * 12, "workout"));
  assert.deepEqual(fatBurnMusicStep(7, "workout"), fatBurnMusicStep(519, "workout"));
  const activeKicks = notes.filter(note => note.instrument === "kick").length;
  const gentleKicks = Array.from({ length: 512 }, (_, step) => fatBurnMusicStep(step, "cooldown"))
    .flat().filter(note => note.instrument === "kick").length;
  assert.ok(activeKicks > gentleKicks);
  assert.ok(notes.every(note => note.accent > 0 && note.accent <= 1));
  for (const invalid of [-1, NaN, Infinity, 0.5]) assert.deepEqual(fatBurnMusicStep(invalid, "warmup"), []);
});

test("music needs an explicit opt-in and running workout; pause cancels every scheduled source", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const context = new FakeContext();
  let creations = 0;
  const audio = new FatBurnAudio(() => assert.fail("unexpected audio failure"), () => { creations++; return context.asContext(); });
  t.after(() => audio.dispose());
  audio.setRunning(true);
  assert.equal(creations, 0);
  audio.setRunning(false);
  await audio.setMusic(true);
  assert.equal(creations, 1);
  assert.equal(context.sources.length, 0);
  audio.setRunning(true);
  await Promise.resolve();
  assert.ok(context.sources.length > 0);
  assert.ok(context.gains[0]!.gain.value > 0 && context.gains[0]!.gain.value < 0.2);
  audio.setRunning(false);
  assert.ok(context.sources.every(source => source.stops.at(-1) === 0.035));
  assert.equal(context.gains[0]!.gain.value, 0);
  const count = context.sources.length;
  context.currentTime = 5;
  t.mock.timers.tick(5000);
  assert.equal(context.sources.length, count);
  audio.dispose();
  assert.equal(context.closeCalls, 1);
  assert.ok(context.sources.every(source => source.disconnected));
});

test("late device resumes cannot restart disabled or disposed music", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  for (const stop of ["disable", "pause", "dispose"] as const) {
    const context = new FakeContext();
    let release!: () => void;
    context.pendingResume = new Promise<void>(resolve => { release = resolve; });
    const audio = new FatBurnAudio(() => assert.fail("unexpected audio failure"), () => context.asContext());
    audio.setRunning(true);
    const pending = audio.setMusic(true);
    if (stop === "disable") await audio.setMusic(false);
    if (stop === "pause") audio.setRunning(false);
    if (stop === "dispose") audio.dispose();
    release();
    await pending;
    t.mock.timers.tick(1000);
    assert.equal(context.sources.length, 0, stop);
    audio.dispose();
  }
});

test("music yields to microphone and other music, and resumes only the still-running session", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const context = new FakeContext();
  const audio = new FatBurnAudio(() => assert.fail("unexpected audio failure"), () => context.asContext());
  t.after(() => { audio.dispose(); audioFocus.setMusicActive(false); });
  audio.setRunning(true);
  await audio.setMusic(true);
  const original = context.sources.length;
  const releaseMic = audioFocus.acquireMicrophone();
  assert.equal(context.gains[0]!.gain.value, 0);
  context.currentTime = 1;
  t.mock.timers.tick(1000);
  assert.equal(context.sources.length, original);
  releaseMic();
  await Promise.resolve();
  assert.ok(context.gains[0]!.gain.value > 0);
  context.currentTime = 1.1;
  t.mock.timers.tick(25);
  assert.ok(context.sources.length > original);
  audioFocus.setMusicActive(true);
  assert.equal(context.gains[0]!.gain.value, 0);
  const pausedCount = context.sources.length;
  audio.setRunning(false);
  audioFocus.setMusicActive(false);
  await Promise.resolve();
  assert.equal(context.sources.length, pausedCount);
});

test("narration uses shared TTS, keeps only the newest pending cue, and clears on pause", async t => {
  const spoken: string[] = [];
  const completions: ((result: TtsResult) => void)[] = [];
  let stops = 0;
  t.mock.method(browserTts, "speak", ({ text, lang }: { text: string; lang: string }) => {
    assert.equal(lang, "zh-CN"); spoken.push(text);
    return new Promise<TtsResult>(resolve => { completions.push(resolve); });
  });
  t.mock.method(browserTts, "stop", () => { stops++; });
  const audio = new FatBurnAudio(() => assert.fail("unexpected speech failure"));
  t.after(() => audio.dispose());
  audio.setRunning(true);
  audio.speak("默认静音");
  assert.deepEqual(spoken, []);
  audio.setVoice(true);
  audio.speak("今天给自己留了时间，真好。");
  audio.speak("旧的等待句");
  audio.speak("跟着自己的节奏，你做得很好。");
  assert.equal(spoken.length, 1);
  completions[0]!({ status: "completed" });
  await Promise.resolve();
  assert.deepEqual(spoken, ["今天给自己留了时间，真好。", "跟着自己的节奏，你做得很好。"]);
  audio.speak("不应在暂停后补播");
  audio.setRunning(false);
  completions[1]!({ status: "completed" });
  await Promise.resolve();
  assert.equal(stops, 1);
  assert.equal(spoken.length, 2);
  audio.setRunning(true);
  const release = audioFocus.acquireMicrophone();
  audio.speak("麦克风使用中");
  release();
  assert.equal(spoken.length, 2);
  audio.setVoice(false);
  audio.speak("关闭语音后");
  assert.equal(spoken.length, 2);
});

test("speech ducks music, volume is bounded, and failed devices do not block commands", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let status = browserTts.getSnapshot().status;
  let changed = () => {};
  const snapshot = browserTts.getSnapshot();
  t.mock.method(browserTts, "subscribe", (listener: () => void) => { changed = listener; return () => {}; });
  t.mock.method(browserTts, "getSnapshot", () => ({ ...snapshot, status }));
  const context = new FakeContext();
  const errors: string[] = [];
  const audio = new FatBurnAudio(message => errors.push(message), () => context.asContext());
  t.after(() => audio.dispose());
  audio.setRunning(true);
  context.resumeFailure = true;
  await audio.setMusic(true);
  assert.equal(errors.length, 1);
  assert.equal(context.sources.length, 0);
  context.resumeFailure = false;
  await audio.setMusic(true);
  const baseVolume = context.gains[0]!.gain.value;
  status = "speaking";
  changed();
  assert.ok(Math.abs(context.gains[0]!.gain.value - baseVolume * 0.18) < 0.00001);
  status = "idle";
  changed();
  assert.equal(context.gains[0]!.gain.value, baseVolume);
  audio.setVolume(5);
  assert.equal(context.gains[0]!.gain.value, 0.45);
  audio.setVolume(NaN);
  assert.equal(context.gains[0]!.gain.value, 0.45);
  audio.setVolume(-1);
  assert.equal(context.gains[0]!.gain.value, 0);
});

test("closed devices are recreated and long scheduler gaps never produce an audio backlog", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const contexts: FakeContext[] = [];
  const audio = new FatBurnAudio(() => assert.fail("unexpected audio failure"), () => {
    const context = new FakeContext(); contexts.push(context); return context.asContext();
  });
  t.after(() => audio.dispose());
  audio.setRunning(true);
  await audio.setMusic(true);
  const first = contexts[0]!;
  const oldSources = first.sources.length;
  first.currentTime = 3600;
  t.mock.timers.tick(25);
  assert.ok(first.sources.length - oldSources < 20);
  assert.ok(first.sources.slice(0, oldSources).every(source => source.disconnected));
  first.state = "closed";
  t.mock.timers.tick(25);
  audio.setRunning(true);
  await Promise.resolve();
  assert.equal(contexts.length, 2);
  assert.ok(contexts[1]!.sources.length > 0);
});

test("hidden pages stop all sound and wait for an explicit resume after returning", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const visiblePage = Object.assign(new EventTarget(), { hidden: false });
  Object.defineProperty(globalThis, "document", { configurable: true, value: visiblePage });
  const context = new FakeContext();
  const audio = new FatBurnAudio(() => assert.fail("unexpected audio failure"), () => context.asContext());
  t.after(() => {
    audio.dispose();
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  audio.setRunning(true);
  await audio.setMusic(true);
  const sources = context.sources.length;
  visiblePage.hidden = true;
  visiblePage.dispatchEvent(new Event("visibilitychange"));
  assert.equal(context.gains[0]!.gain.value, 0);
  assert.ok(context.sources.every(source => source.stops.at(-1) === 0.035));
  context.currentTime = 10;
  t.mock.timers.tick(1000);
  visiblePage.hidden = false;
  visiblePage.dispatchEvent(new Event("visibilitychange"));
  await Promise.resolve();
  assert.equal(context.sources.length, sources);
  audio.setRunning(true);
  await Promise.resolve();
  assert.ok(context.gains[0]!.gain.value > 0);
});
