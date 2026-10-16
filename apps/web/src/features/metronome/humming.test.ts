import assert from "node:assert/strict";
import { test } from "node:test";
import { PitchDetector } from "pitchy";
import { HumTranscriber, HummingTake, humNote, frequencyToMidi } from "./humming";
import { createProject, createLibrary, parseMusicLibrary, cloneProject, resizeLoop, projectTicks, TICKS } from "./logic";
import { pitchesForNote, noteLabel } from "./catalog";
const hz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);
function sing(detector: HumTranscriber, start: number, end: number, pitch: number, rms = .08, vibrato = 0) {
  for (let time = start; time < end - .001; time += .02) detector.feed({ time, frequency: hz(pitch + Math.sin(time * 35) * vibrato), clarity: .98, rms });
}
function silence(detector: HumTranscriber, start: number, end: number) {
  for (let time = start; time < end - .001; time += .02) detector.feed({ time, frequency: 0, clarity: 0, rms: .0001 });
}
test("real MPM detects child-range harmonic signals at 44.1 and 48 kHz without octave jumps", () => {
  for (const sampleRate of [44100, 48000]) for (const pitch of [48, 60, 61, 69, 81, 88]) {
    const samples = Float32Array.from({ length: 2048 }, (_, i) => .2 * Math.sin(2 * Math.PI * hz(pitch) * i / sampleRate) + .08 * Math.sin(4 * Math.PI * hz(pitch) * i / sampleRate));
    const [frequency, clarity] = PitchDetector.forFloat32Array(samples.length).findPitch(samples, sampleRate);
    assert.ok(Math.abs(frequencyToMidi(frequency) - pitch) < .1, String(pitch)); assert.ok(clarity > .95);
  }
});
test("vibrato and a brief octave glitch produce one stable long note; short dropouts bridge", () => {
  const detector = new HumTranscriber();
  sing(detector, 0, .6, 69, .08, .35); sing(detector, .6, .66, 81); sing(detector, .66, 1, 69, .08, .3);
  silence(detector, 1, 1.06); sing(detector, 1.06, 1.6, 69); silence(detector, 1.6, 1.8);
  assert.equal(detector.segments.length, 1); assert.equal(detector.segments[0].pitch, 69);
  assert.ok(detector.segments[0].end - detector.segments[0].start > 1.5);
});
test("clear changes and separately sung same-pitch notes retain onsets, durations and energy", () => {
  const detector = new HumTranscriber();
  sing(detector, 0, .5, 60, .025); silence(detector, .5, .7);
  sing(detector, .7, 1.2, 60, .2); sing(detector, 1.2, 1.8, 64, .08); detector.finish(1.8);
  assert.deepEqual(detector.segments.map(n => n.pitch), [60, 60, 64]);
  const project = { ...createProject(), snap: "off" as const }, track = project.tracks[0];
  const notes = detector.segments.map(n => humNote(project, track, n, detector.gate)!);
  assert.ok(notes[1].velocity > notes[0].velocity); assert.ok(notes[2].tick > notes[1].tick);
  assert.ok(notes.every(n => n.duration > 40));
});
test("count-in held notes, tiny blips, silence, noise and invalid/out-of-order frames do not become notes", () => {
  const detector = new HumTranscriber();
  sing(detector, -.5, .5, 69); silence(detector, .5, .7); sing(detector, .7, .74, 60);
  silence(detector, .74, 1); detector.feed({ time: 1, frequency: hz(69), clarity: .2, rms: .2 });
  detector.feed({ time: NaN, frequency: hz(69), clarity: 1, rms: .2 });
  detector.feed({ time: 0, frequency: hz(69), clarity: 1, rms: .2 }); detector.finish(1.1);
  assert.equal(detector.segments.length, 0);
  sing(detector, 1.2, 1.8, 73); detector.finish(1.8); assert.equal(detector.segments.length, 1);
});
test("absolute chromatic pitches round-trip and survive copies, loop extension, scale/octave/chord changes", () => {
  const library = createLibrary(), p = library.projects[0], track = p.tracks[0]; p.snap = "off";
  const take = new HummingTake(p, track.id, 3);
  sing(take.detector, 0, .5, 61); silence(take.detector, .5, .7); take.detector.finish(.7);
  const merged = take.merge(p, .7); library.projects[0] = merged;
  assert.equal(track.notes.length, 0); assert.ok(parseMusicLibrary(JSON.parse(JSON.stringify(library))));
  const note = merged.tracks[0].notes[0];
  assert.equal(note.pitch, 61); assert.equal(noteLabel(track, p, note), "C♯4");
  assert.deepEqual(pitchesForNote({ ...track, mode: "chords", octave: 1 }, { scale: "pentatonic" }, note), [61]);
  assert.equal(cloneProject(merged).tracks[0].notes[0].pitch, 61);
  assert.equal(resizeLoop(merged, 4).tracks[0].notes[1].pitch, 61);
});
test("free/snap timing respects six-eight big beats, phrase boundaries and capacity without wrapping", () => {
  const p = createProject(), track = p.tracks[0]; p.bpm = 60; p.bars = 1;
  const segment = { id: "late", pitch: 69, start: 3.99, end: 4.2, energy: .1, frames: 1 };
  const late = humNote(p, track, segment, .006)!;
  assert.equal(late.tick, projectTicks(p) - 1); assert.equal(late.duration, 1);
  assert.equal(humNote(p, track, { ...segment, start: 4.1 }, .006), null);
  const six = { ...p, preset: "six-eight" as const, snap: "third" as const };
  const note = humNote(six, track, { ...segment, start: .32, end: .66 }, .006)!;
  assert.equal(note.tick, TICKS / 3); assert.equal(note.duration, TICKS / 3);
  const take = new HummingTake(p, track.id, 1);
  sing(take.detector, 0, .5, 60); silence(take.detector, .5, .7); sing(take.detector, .7, 1.2, 64); take.detector.finish(1.2);
  assert.equal(take.notes(1.2).length, 1);
});
