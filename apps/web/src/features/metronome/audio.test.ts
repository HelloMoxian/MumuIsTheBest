import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MusicAudio, parseBank, encodeWav, selectSampleZone } from "./audio";
import { INSTRUMENTS, bankName, pitchesForKey } from "./catalog";
import { CLICK_LEVELS, createProject, createTrack } from "./logic";
test("every shipped instrument has validated samples for every playable key and octave", () => {
  const banks = new Map<string, ReturnType<typeof parseBank>>();
  for (const instrument of INSTRUMENTS) {
    const name = bankName(instrument);
    if (!banks.has(name)) banks.set(name, parseBank(JSON.parse(readFileSync(new URL("../../../public/audio/metronome/" + name + ".json", import.meta.url), "utf8"))));
    const zones = banks.get(name)!;
    for (const octave of [-1, 0, 1] as const) for (const scale of ["major", "pentatonic"] as const) for (const mode of ["notes", "chords"] as const) for (let key = 0; key < 10; key++) {
      for (const pitch of pitchesForKey({ ...createTrack(instrument.id), octave, mode }, { scale }, key)) {
        const zone = selectSampleZone(zones, pitch, Boolean(instrument.drums));
        assert.ok(zone, instrument.id + " lacks " + pitch);
        assert.ok(Math.max(zone.keyRangeLow - pitch, pitch - zone.keyRangeHigh, 0) <= 12, instrument.id + " needs excessive transposition");
      }
    }
  }
});
test("sample loader rejects empty and malformed banks", () => {
  for (const value of [null, {}, { schemaVersion: 2, zones: [] }, { schemaVersion: 1, zones: [] }, { schemaVersion: 1, zones: [{}] }]) assert.throws(() => parseBank(value));
});
test("FluidR3 non-looping samples normalize the upstream sentinel without allowing other negative loops", () => {
  const bank = JSON.parse(readFileSync(new URL("../../../public/audio/metronome/p047.json", import.meta.url), "utf8"));
  const zones = parseBank(bank);
  assert.equal(zones[0].loopStart, 0); assert.equal(zones[0].loopEnd, 0);
  bank.zones[0].loopStart = -4;
  assert.throws(() => parseBank(bank));
});
test("WAV export interleaves stereo channels and clamps samples to valid PCM", async () => {
  const blob = encodeWav({ numberOfChannels: 2, length: 3, sampleRate: 44100, getChannelData: channel => Float32Array.from(channel ? [0, -.5, -2] : [.5, 0, 2]) });
  const buffer = await blob.arrayBuffer(), view = new DataView(buffer);
  assert.equal(new TextDecoder().decode(buffer.slice(0, 4)), "RIFF");
  assert.equal(view.getUint16(22, true), 2); assert.equal(view.getUint32(40, true), 12);
  assert.equal(view.getInt16(44, true), 16384); assert.equal(view.getInt16(46, true), 0);
  assert.equal(view.getInt16(52, true), 32767); assert.equal(view.getInt16(54, true), -32768);
});

class TestParam {
  value = 1;
  events: { method: string; value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) { this.events.push({ method: "set", value, time }); }
  linearRampToValueAtTime(value: number, time: number) { this.events.push({ method: "ramp", value, time }); }
  exponentialRampToValueAtTime(value: number, time: number) { this.events.push({ method: "exponential", value, time }); }
  setTargetAtTime(value: number, time: number, _constant: number) { this.events.push({ method: "target", value, time }); }
  cancelAndHoldAtTime(time: number) { this.events = this.events.filter(e => e.time < time); }
}
class TestGain {
  gain = new TestParam(); next: unknown;
  connect(next: unknown) { this.next = next; }
  disconnect() {}
}
class TestSource {
  buffer: unknown; playbackRate = new TestParam(); loop = false; loopStart = 0; loopEnd = 0;
  output!: TestGain; stops: number[] = []; started = 0; onended = () => {};
  connect(output: TestGain) { this.output = output; }
  disconnect() {}
  start(time: number) { this.started = time; }
  stop(time: number) { this.stops.push(time); }
}
class TestOscillator extends TestSource {
  frequency = new TestParam(); type = "sine";
}
function audioHarness(sampleDuration = 12, loopStart = .1, loopEnd = 1) {
  const sources: TestSource[] = [];
  const oscillators: TestOscillator[] = [];
  const context = {
    currentTime: 0, destination: {},
    createGain: () => new TestGain(),
    createOscillator: () => { const oscillator = new TestOscillator(); oscillators.push(oscillator); return oscillator; },
    createBufferSource: () => { const source = new TestSource(); sources.push(source); return source; },
    createDynamicsCompressor: () => ({ threshold: new TestParam(), knee: new TestParam(), ratio: new TestParam(), attack: new TestParam(), release: new TestParam(), connect() {} }),
  };
  const zone = { keyRangeLow: 0, keyRangeHigh: 127, originalPitch: 6000, coarseTune: 0, fineTune: 0, sampleRate: 44100,
    loopStart: loopStart * 44100, loopEnd: loopEnd * 44100, buffer: { duration: sampleDuration } as AudioBuffer };
  const banks = new Map(INSTRUMENTS.map(i => [bankName(i), [zone]]));
  return { audio: new MusicAudio(context as unknown as BaseAudioContext, banks), context, sources, oscillators };
}
test("scheduled click levels retain the old low envelope, grow louder, and share the piano master output", () => {
  const { audio, sources, oscillators } = audioHarness(), p = createProject();
  audio.playKey(p.tracks[0], p, 0);
  const pianoMaster = (sources[0].output.next as TestGain).next;
  for (const level of CLICK_LEVELS) for (const accent of [false, true]) {
    p.click = level;
    audio.schedule({ kind: "click", tick: 0, accent }, 1, 1 / 192, p);
  }
  assert.equal(oscillators.length, 6, "off creates no oscillator even if a stale click reaches the renderer");
  const peaks = oscillators.map(s => s.output.gain.events.find(e => e.method === "ramp")!.value);
  assert.deepEqual(peaks.slice(0, 2), [.11, .18], "low is unchanged");
  assert.deepEqual(peaks.slice(-2), [.72, .95]);
  assert.ok(peaks[0] < peaks[2] && peaks[2] < peaks[4]);
  assert.ok(peaks[1] < peaks[3] && peaks[3] < peaks[5]);
  oscillators.forEach((s, i) => {
    assert.equal(s.output.next, pianoMaster);
    assert.equal(s.frequency.value, i % 2 ? 1500 : 1000);
    assert.equal(s.started, 1); assert.equal(s.stops.at(-1), 1.03);
    assert.deepEqual(s.output.gain.events.at(-1), { method: "exponential", value: .0001, time: 1.025 });
  });
  audio.stopAll(); assert.ok(oscillators.every(s => s.stops.length === 2));
});

for (const instrument of INSTRUMENTS) test(instrument.name + " retains its tail and retriggers only matching pitches in the same track", () => {
  const { audio, context, sources } = audioHarness(), p = createProject(), track = createTrack(instrument.id);
  const first = audio.playKey(track, p, 0), naturalEnd = sources[0].stops.at(-1)!;
  context.currentTime = .1; first.release();
  const releasedEnd = sources[0].stops.at(-1)!;
  if (instrument.sustain) {
    assert.ok(releasedEnd >= .4 && releasedEnd < naturalEnd, "sustained notes fade out after key-up");
    assert.ok(sources[0].output.gain.events.some(e => e.method === "target" && e.time === .1));
  } else assert.equal(releasedEnd, naturalEnd, "struck/plucked notes keep their recorded decay");
  context.currentTime = .2; audio.playKey(track, p, 2);
  assert.equal(sources[0].stops.at(-1), releasedEnd, "mi leaves do ringing");
  const otherPitchEnd = sources[1].stops.at(-1);
  context.currentTime = .3; audio.playKey(track, p, 0);
  assert.ok(sources[0].stops.at(-1)! <= .331, "a new do fades out the previous do");
  assert.equal(sources[1].stops.at(-1), otherPitchEnd, "repeating do leaves mi alone");
  const currentEnd = sources[2].stops.at(-1);
  audio.playKey({ ...track, id: "another-track" }, p, 0);
  assert.equal(sources[2].stops.at(-1), currentEnd, "another track has independent voices");
  context.currentTime = .4; audio.stopAll();
  assert.ok(sources.every(s => s.stops.at(-1)! <= .431), "stop also silences release tails");
});
test("playback/export durations preserve piano and percussion tails and softly release sustained instruments", () => {
  for (const instrument of INSTRUMENTS) {
    const { audio, sources } = audioHarness();
    audio.playKey(createTrack(instrument.id), createProject(), 0, 1, .2);
    const end = sources[0].stops.at(-1)!;
    assert.ok(instrument.sustain ? end >= 1.5 && end < 1.8 : end > 2, instrument.id);
  }
});
test("future scheduling never stops the current note early and stopAll cancels future notes", () => {
  const { audio, context, sources } = audioHarness(), p = createProject(), track = createTrack("flute");
  const first = audio.playKey(track, p, 0, 0, 4);
  audio.playKey(track, p, 0, 1, 4);
  assert.equal(sources[0].stops.at(-1), 1.03);
  context.currentTime = .2; first.release();
  assert.ok(sources[0].stops.at(-1)! < .61, "early key-up may shorten a scheduled note");
  audio.playKey(track, p, 0);
  assert.equal(sources[2].stops.at(-1), 1.03, "live input yields to the next scheduled same pitch");
  assert.ok(sources[1].stops.at(-1)! > 5, "live input does not kill the future note");
  audio.stopAll();
  assert.ok(sources.every(s => s.stops.at(-1)! <= .231));
});
test("overlapping chords cut only their shared pitches", () => {
  const { audio, context, sources } = audioHarness(), p = createProject(), track = { ...createTrack(), mode: "chords" as const };
  const firstPitches = pitchesForKey(track, p, 1), nextPitches = pitchesForKey(track, p, 3);
  audio.playKey(track, p, 1); const ends = sources.map(s => s.stops.at(-1));
  context.currentTime = .3; audio.playKey(track, p, 3);
  firstPitches.forEach((pitch, i) => {
    if (nextPitches.includes(pitch)) assert.ok(sources[i].stops.at(-1)! <= .331);
    else assert.equal(sources[i].stops.at(-1), ends[i]);
  });
});
test("short looped struck samples decay beyond the source boundary instead of abruptly running out", () => {
  for (const id of ["piano", "harp", "vibraphone", "music-box"] as const) {
    const { audio, sources } = audioHarness(.24, .1, .2);
    audio.playKey(createTrack(id), createProject(), 0, 0, .04);
    assert.equal(sources[0].loop, true);
    assert.ok(sources[0].stops.at(-1)! > 3, id + " needs a ringing tail");
    assert.ok(sources[0].stops.at(-1)! <= 6.01, "decay is always finite");
    assert.ok(sources[0].output.gain.events.some(e => e.method === "target" && e.value === 0));
  }
  const { audio, sources } = audioHarness(1.2, 0, 0);
  audio.playKey(createTrack("marimba"), createProject(), 0, 0, .04);
  assert.equal(sources[0].loop, false);
  assert.equal(sources[0].stops.at(-1), 1.21, "complete one-shot samples retain their original tail");
});
