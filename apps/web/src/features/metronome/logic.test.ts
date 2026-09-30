import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLibrary, createTrack, createProject, gridStep, quantizedNote, changePreset, resizeLoop, cloneProject, deleteProject,
  eventsBetween, audibleTracks, RecordingTake, projectTicks, pulseCount, TICKS, INSTRUMENT_IDS, PRESET_IDS, parseMusicLibrary,
  CLICK_LEVELS, CLICK_LABELS, nextClickLevel,
} from "./logic";
import { INSTRUMENTS, RHYTHMS, pitchesForKey, keyLabel } from "./catalog";
test("content catalogs and shared persisted identifiers agree", () => {
  assert.deepEqual(INSTRUMENTS.map(i => i.id).sort(), [...INSTRUMENT_IDS].sort());
  assert.deepEqual(RHYTHMS.map(i => i.id).sort(), [...PRESET_IDS].sort());
  for (const r of RHYTHMS) {
    assert.equal(r.pulses, pulseCount(r.id));
    assert.ok(r.hits.every(([tick, pitch, velocity]) => tick >= 0 && tick < r.pulses * TICKS && pitch >= 35 && pitch <= 81 && velocity > 0 && velocity <= 1));
  }
});
test("work copies are independent, deletion preserves other works, and deleting the last work opens a blank", () => {
  const library = createLibrary(), original = library.projects[0];
  original.tracks[0].notes = [{ id: "original", key: 2, tick: 0, duration: 48, velocity: .8 }];
  const copy = cloneProject(original);
  assert.notEqual(copy.id, original.id); assert.notEqual(copy.tracks[0].id, original.tracks[0].id);
  assert.notEqual(copy.tracks[0].notes[0].id, original.tracks[0].notes[0].id);
  copy.tracks[0].notes[0].key = 5; assert.equal(original.tracks[0].notes[0].key, 2);
  library.projects.push(copy); library.activeId = copy.id;
  const deleted = deleteProject(library, copy.id);
  assert.equal(deleted.activeId, original.id); assert.equal(deleted.projects.length, 1);
  assert.deepEqual(deleted.projects[0], original); assert.ok(parseMusicLibrary(deleted));
  const blank = deleteProject(deleted, original.id);
  assert.equal(blank.projects.length, 1); assert.notEqual(blank.activeId, original.id);
  assert.equal(blank.projects[0].tracks[0].notes.length, 0); assert.ok(parseMusicLibrary(blank));
  assert.equal(deleteProject(library, "missing"), library); assert.equal(library.projects.length, 2);
});
test("every melodic keyboard keeps ten ascending pitches, including the highest pentatonic octave", () => {
  for (const instrument of INSTRUMENTS.filter(i => !i.drums)) for (const octave of [-1, 0, 1] as const) for (const scale of ["major", "pentatonic"] as const) {
    const track = { ...createTrack(instrument.id), octave };
    const pitches = Array.from({ length: 10 }, (_, key) => pitchesForKey(track, { scale }, key)[0]);
    assert.ok(pitches.every((pitch, key) => key === 0 || pitch > pitches[key - 1]), instrument.id);
  }
});
test("quantization uses nearest half beats, thirds and a circular seam; preserves valid long notes", () => {
  const p = createProject();
  assert.equal(quantizedNote(p, 2, 61, 142).tick, 48);
  assert.equal(quantizedNote(p, 2, 61, 142).duration, 96);
  assert.equal(quantizedNote(p, 2, 760, 767).tick, 0);
  assert.equal(quantizedNote(p, 2, 730, 999).duration, 48);
  assert.equal(gridStep(changePreset(p, "six-eight")), 32);
  const triplet = { ...p, snap: "third" as const };
  assert.equal(quantizedNote(triplet, 0, 60, 98).tick, 64);
  const free = quantizedNote({ ...p, snap: "off" }, 0, 17.3, 45.7);
  assert.equal(free.tick, 17); assert.equal(free.duration, 28);
});
test("preset changes preserve relative bar positions and six-eight has two dotted-quarter pulses", () => {
  const p = createProject(); p.tracks[0].notes = [{ id: "n", key: 4, tick: 288, duration: 192, velocity: .8 }];
  const compound = changePreset(p, "six-eight");
  assert.equal(pulseCount(compound.preset), 2); assert.equal(projectTicks(compound), 384);
  assert.equal(compound.tracks[0].notes[0].tick, 144);
  assert.equal(compound.tracks[0].notes[0].duration, 96);
  assert.deepEqual(changePreset(compound, "pop").tracks, p.tracks);
});
test("extending repeats full phrases with unique note IDs; shrinking is explicit and does not mutate source", () => {
  const p = createProject(); p.tracks[0].notes = [{ id: "original", key: 0, tick: 48, duration: 144, velocity: .8 }];
  const expanded = resizeLoop(p, 8);
  assert.deepEqual(expanded.tracks[0].notes.map(n => n.tick), [48, 816, 1584, 2352]);
  assert.equal(new Set(expanded.tracks[0].notes.map(n => n.id)).size, 4);
  assert.equal(p.tracks[0].notes.length, 1);
  assert.equal(resizeLoop(expanded, 1).tracks[0].notes.length, 1);
  const library = createLibrary(); library.activeId = p.id; library.projects = [expanded]; assert.ok(parseMusicLibrary(library));
});
test("instrument swaps preserve the musical keys; drums use individual GM percussion notes", () => {
  const p = createProject(), t = createTrack("piano");
  assert.deepEqual(pitchesForKey(t, p, 0), [60]); assert.deepEqual(pitchesForKey(t, p, 7), [72]);
  assert.equal(keyLabel(t, p, 7), "高 do");
  t.instrument = "flute"; assert.deepEqual(pitchesForKey(t, p, 0), [72]);
  t.instrument = "drum-kit"; assert.deepEqual(pitchesForKey(t, p, 0), [36]); assert.equal(keyLabel(t, p, 1), "军鼓");
  const guitar = createTrack("guitar"); guitar.mode = "chords";
  assert.deepEqual(pitchesForKey(guitar, p, 1), [62, 65, 69]);
  for (const instrument of INSTRUMENTS) for (const octave of [-1, 0, 1] as const) {
    const track = { ...createTrack(instrument.id), octave };
    for (let key = 0; key < 10; key++) assert.ok(pitchesForKey(track, { scale: "pentatonic" }, key).every(n => n >= 24 && n <= 105));
  }
});
test("event windows are half-open, seamless, and honor solo/mute without including backing in solo", () => {
  const p = createProject(); p.tracks[0].notes = [{ id: "note", key: 0, tick: 0, duration: 48, velocity: .8 }];
  const a = eventsBetween(p, 0, 768), b = eventsBetween(p, 768, 1536);
  assert.equal(a.filter(e => e.kind === "note").length, 1);
  assert.equal(b.filter(e => e.kind === "note")[0].tick, 768);
  p.tracks[0].solo = true; assert.equal(eventsBetween(p, 0, 768).filter(e => e.kind === "drum").length, 0);
  p.tracks[0].muted = true; assert.equal(audibleTracks(p).length, 0);
  assert.equal(eventsBetween(p, 0, 768, { export: true }).length, 0);
});
test("count-in contains only click sounds and first-pass captured notes do not echo", () => {
  const p = createProject(); p.click = "low"; p.tracks[0].notes = [{ id: "note", key: 0, tick: 48, duration: 48, velocity: .8 }];
  assert.ok(eventsBetween(p, -384, 0).every(e => e.kind === "click"));
  assert.equal(eventsBetween(p, -384, 0).length, 4);
  const events = eventsBetween(p, 0, 1536, { suppress: new Set(["note"]), suppressBefore: 768 });
  assert.deepEqual(events.filter(e => e.kind === "note").map(e => e.tick), [816]);
});
test("recording ignores count-in/repeats, retains held durations and overdubs or replaces only the chosen track", () => {
  const p = createProject(); p.tracks[0].notes = [{ id: "old", key: 1, tick: 0, duration: 48, velocity: .8 }];
  const recorder = new RecordingTake(p, p.activeTrackId!, false);
  recorder.press("early", 1, -10); recorder.release("early", 2);
  assert.equal(recorder.notes.length, 0);
  recorder.press("one", 2, 96); recorder.press("one", 2, 100);
  assert.equal(recorder.snapshot(288)[0].duration, 192);
  recorder.release("one", 288); assert.equal(recorder.notes.length, 1);
  assert.equal(recorder.merge(p, 768).tracks[0].notes.length, 2);
  const replacement = new RecordingTake(p, p.activeTrackId!, true);
  assert.deepEqual(replacement.merge(p, 500), p);
  replacement.press("two", 3, 720); replacement.release("two", 900);
  assert.equal(replacement.merge(p, 768).tracks[0].notes.length, 1);
  assert.equal(replacement.notes[0].duration, 48);
  const copy = cloneProject(p); assert.notEqual(copy.id, p.id); assert.notEqual(copy.tracks[0].notes[0].id, "old");
});
test("click volume cycles off/low/medium/high and silence/export omit count-in and playback clicks", () => {
  assert.equal(createProject().click, "low");
  let level: typeof CLICK_LEVELS[number] = CLICK_LEVELS[0];
  const labels: string[] = [];
  for (let i = 0; i < 8; i++) { labels.push(CLICK_LABELS[level]); level = nextClickLevel(level); }
  assert.deepEqual(labels, ["无", "低", "中", "高", "无", "低", "中", "高"]);
  const p = createProject(); p.backing = false;
  for (const click of CLICK_LEVELS) {
    p.click = click;
    const events = eventsBetween(p, -768, 768);
    assert.equal(events.length, click === "off" ? 0 : 16);
    assert.ok(events.every(e => e.kind === "click"));
    assert.deepEqual(eventsBetween(p, -768, 768, { export: true }), []);
    assert.equal(cloneProject(p).click, click);
    const library = { ...createLibrary(), activeId: p.id, projects: [p] };
    assert.equal(parseMusicLibrary(JSON.parse(JSON.stringify(library)))?.projects[0].click, click);
  }
});
