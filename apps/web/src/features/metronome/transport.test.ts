import assert from "node:assert/strict";
import { test } from "node:test";
import { COUNT_IN_BARS, LoopTransport, type TransportFrame } from "./transport";
import { createProject, projectTicks, PRESET_IDS, pulseCount, TICKS, type ScheduledEvent } from "./logic";
test("audio timestamps stay on-grid through many loops and interval windows never duplicate notes", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const p = createProject(); p.backing = false; p.click = "off"; p.bpm = 120;
  p.tracks[0].notes = [{ id: "a", key: 0, tick: 0, duration: 48, velocity: .8 }];
  let now = 0; const played: number[] = [];
  const transport = new LoopTransport({ now: () => now, project: () => p, schedule: (_, when) => played.push(when), frame: () => {}, finishRecording: () => {}, suppress: () => new Set() });
  transport.start();
  for (let i = 0; i < 1600; i++) { now += .025; t.mock.timers.tick(25); }
  transport.stop();
  assert.ok(played.length >= 10);
  assert.equal(new Set(played).size, played.length);
  played.forEach((when, i) => assert.ok(Math.abs(when - (.06 + i * 4)) < .000001));
});
test("recording counts in two bars, completes once and continues playing", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const p = createProject(); p.bpm = 120; let now = 0, finished = 0; const phases: string[] = [];
  const transport = new LoopTransport({ now: () => now, project: () => p, schedule: () => {}, frame: frame => phases.push(frame.phase), finishRecording: () => finished++, suppress: () => new Set() });
  transport.start(true);
  assert.ok(transport.position() < 0);
  for (let i = 0; i < 400; i++) { now += .025; t.mock.timers.tick(25); }
  assert.equal(finished, 1); assert.equal(transport.running, true);
  assert.ok(phases.includes("countin")); assert.ok(phases.includes("recording")); assert.equal(phases.at(-1), "playing");
  assert.ok(transport.position() > projectTicks(p)); transport.stop();
});
test("a suspended clock stops without bursting queued notes", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const p = createProject(); let now = 0, count = 0;
  const transport = new LoopTransport({ now: () => now, project: () => p, schedule: () => count++, frame: () => {}, finishRecording: () => {}, suppress: () => new Set() });
  transport.start(); const before = count; now = 5; t.mock.timers.tick(25);
  assert.equal(transport.running, false); assert.equal(count, before);
});
test("interrupted recording exposes its last audio position before cleanup", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const p = createProject(); let now = 0, interruptedAt = 0, stopped = 0;
  const transport = new LoopTransport({
    now: () => now, project: () => p, schedule: () => {}, frame: () => {}, finishRecording: () => {}, suppress: () => new Set(),
    interrupted: () => { interruptedAt = transport.position(); stopped++; },
  });
  transport.start(true);
  now = 6; t.mock.timers.tick(25);
  assert.ok(interruptedAt > 0); assert.equal(stopped, 1); assert.equal(transport.running, false);
  t.mock.timers.tick(1000); assert.equal(stopped, 1);
});

for (const preset of PRESET_IDS) test(preset + " shows two complete count-in bars on the audio clock", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const p = createProject(); p.preset = preset; p.bpm = 120; p.click = "low";
  const pulses = pulseCount(preset), total = COUNT_IN_BARS * pulses * TICKS;
  let now = 0;
  const frames: TransportFrame[] = [], events: ScheduledEvent[] = [];
  const transport = new LoopTransport({ now: () => now, project: () => p, schedule: e => events.push(e), frame: f => frames.push(f), finishRecording() {}, suppress: () => new Set() });
  transport.start(true);
  assert.equal(frames.at(-1)!.phase, "countin");
  assert.equal(frames.at(-1)!.bar, 0); assert.equal(frames.at(-1)!.beat, 0);
  const startsAt = .06 + total * 60 / p.bpm / TICKS;
  while (now + .025 < startsAt) { now += .025; t.mock.timers.tick(25); }
  assert.equal(frames.at(-1)!.phase, "countin");
  assert.equal(frames.at(-1)!.bar, 1); assert.equal(frames.at(-1)!.beat, pulses - 1);
  const countIn = events.filter(e => e.tick < 0);
  assert.equal(countIn.length, pulses * 2);
  assert.ok(countIn.every(e => e.kind === "click"));
  assert.deepEqual(countIn.filter(e => e.kind === "click" && e.accent).map(e => e.tick), [-total, -total / 2]);
  assert.equal(new Set(frames.filter(f => f.phase === "countin").map(f => f.bar + ":" + f.beat)).size, pulses * 2);
  now += .025; t.mock.timers.tick(25);
  assert.equal(frames.at(-1)!.phase, "recording"); assert.equal(frames.at(-1)!.bar, 0);
  transport.stop();
});
test("canceling preparation never starts or finishes a take", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const p = createProject(); let now = 0, finished = 0;
  const phases: string[] = [];
  const transport = new LoopTransport({ now: () => now, project: () => p, schedule() {}, frame: f => phases.push(f.phase), finishRecording: () => finished++, suppress: () => new Set() });
  transport.start(true);
  for (let i = 0; i < 20; i++) { now += .025; t.mock.timers.tick(25); }
  transport.stop(); now += 10; t.mock.timers.tick(10000);
  assert.equal(finished, 0); assert.ok(!phases.includes("recording")); assert.equal(phases.at(-1), "stopped");
});
test("changing click volume during count-in/recording preserves the clock and completes once", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const p = createProject(); p.bpm = 120; p.click = "off"; p.backing = false;
  let now = 0, finished = 0;
  const frames: TransportFrame[] = [], played: { tick: number; when: number; level: string }[] = [];
  const transport = new LoopTransport({
    now: () => now, project: () => p, frame: f => frames.push(f), finishRecording: () => finished++, suppress: () => new Set(),
    schedule: (event, when) => { if (event.kind === "click") played.push({ tick: event.tick, when, level: p.click }); },
  });
  transport.start(true);
  for (let i = 1; i <= 360; i++) {
    now = i * .025;
    if (i === 40) p.click = "low";
    if (i === 80) p.click = "medium";
    if (i === 200) p.click = "high";
    if (i === 280) p.click = "off";
    t.mock.timers.tick(25);
    assert.ok(transport.running);
    assert.ok(Math.abs(transport.position() - (now - 4.06) * 192) < .000001);
  }
  assert.ok(frames.some(f => f.phase === "countin" && f.bar === 0 && f.beat === 1), "visual count-in continues silently");
  assert.deepEqual([...new Set(played.map(e => e.level))], ["low", "medium", "high"]);
  assert.ok(played.every(e => e.when >= 1 && e.when < 7.1));
  assert.ok(played.some(e => e.tick >= 0 && e.level === "high"));
  assert.ok(played.every(e => Math.abs(e.when - (4.06 + e.tick / 192)) < .000001));
  assert.equal(finished, 1); assert.equal(frames.at(-1)!.phase, "playing");
  transport.stop();
});
