import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StepEditor, ToolButton, TrackStrip } from "./components";
import { createLibrary, createProject, gridStep, parseMusicLibrary, placeStepNote, PRESET_IDS, projectTicks, pulseCount, stepTick, TICKS, updateStepNote } from "./logic";

test("manual entry places notes at the selected position, stacks different keys, and does not duplicate the same key", () => {
  const library = createLibrary(), p = library.projects[0], track = p.tracks[0];
  const first = placeStepNote(p, track, 103, 0);
  assert.equal(first.note.tick, 96); assert.equal(first.note.duration, 48);
  assert.equal(track.notes.length, 0, "the original take stays immutable");
  track.notes = first.notes;
  const duplicate = placeStepNote(p, track, 119, 0);
  assert.equal(duplicate.notes, track.notes); assert.equal(duplicate.note.id, first.note.id);
  const harmony = placeStepNote(p, track, 103, 2);
  assert.equal(harmony.notes.length, 2); assert.equal(harmony.note.tick, first.note.tick);
  assert.notEqual(harmony.note.id, first.note.id); track.notes = harmony.notes;
  assert.ok(parseMusicLibrary(library), "manual notes use the existing persisted contract");
  const last = placeStepNote(p, track, projectTicks(p), 9);
  assert.equal(last.note.tick, projectTicks(p) - gridStep(p));
  assert.equal(last.note.tick + last.note.duration, projectTicks(p));
  for (const key of [-1, 10, 1.5, NaN]) assert.throws(() => placeStepNote(p, track, 0, key));
});
test("manual selection can choose a recorded off-grid note without adding a duplicate", () => {
  const p = createProject(), track = p.tracks[0];
  track.notes = [{ id: "old", tick: 51, key: 2, duration: 12, velocity: .7 }];
  const result = placeStepNote(p, track, 72, 2);
  assert.equal(result.notes, track.notes); assert.equal(result.note.tick, 51);
});
test("step editing clamps movement and durations at the loop ends while preserving note identity", () => {
  const p = createProject(), note = placeStepNote(p, p.tracks[0], 0, 0).note;
  const longer = updateStepNote(p, note, { duration: 192 });
  assert.equal(longer.duration, 192); assert.equal(note.duration, 48);
  const moved = updateStepNote(p, longer, { tick: 100000 });
  assert.equal(moved.tick, projectTicks(p) - 48); assert.equal(moved.duration, 48);
  assert.equal(moved.id, note.id); assert.equal(moved.key, note.key);
  assert.equal(updateStepNote(p, moved, { tick: -20 }).tick, 0);
  assert.equal(updateStepNote(p, note, { duration: -20 }).duration, 1);
  assert.equal(updateStepNote(p, note, { duration: NaN }).duration, 48);
  assert.equal(stepTick(p, NaN), 0);
});
for (const preset of PRESET_IDS) test(preset + " supports manual subdivisions and seamless lead-in cursor positions", () => {
  const p = createProject(); p.preset = preset;
  for (const snap of ["beat", "half", "third", "quarter"] as const) {
    p.snap = snap;
    const note = placeStepNote(p, p.tracks[0], projectTicks(p) - 1, 0).note;
    assert.equal(note.tick % gridStep(p), 0); assert.equal(note.tick + note.duration, projectTicks(p));
  }
  const lead = 2 * pulseCount(preset) * TICKS;
  const render = (tick: number, reduced = false) => renderToStaticMarkup(createElement(TrackStrip, { project: p, track: p.tracks[0], playhead: tick, leadInBars: 2, reduced }));
  const position = (tick: number) => Number(/<line x1="([^"]+)"[^>]*class="metro-playhead"/.exec(render(tick))?.[1]);
  assert.equal(position(-lead), 0); assert.equal(position(-lead / 2), 250); assert.equal(position(0), 500);
  assert.ok(position(1) > position(0), "the cursor crosses the recording boundary continuously");
  assert.match(render(-lead), /metro-countin-region/);
  assert.match(render(-lead + 24, true), /metro-playhead/, "reduced motion retains a visible discrete cursor");
});
test("inline editor exposes one bar, existing notes, and named tools without opening a dialog", () => {
  const p = createProject(); p.bars = 8;
  const track = p.tracks[0], note = placeStepNote(p, track, 384, 0).note; track.notes = [note];
  const props = { project: p, track, cursor: 384, selectedId: note.id, disabled: false,
    onPosition() {}, onUpdate() {}, onDelete() {}, onDivision() {}, onAudition() {}, onClose() {} };
  const html = renderToStaticMarkup(createElement(StepEditor, props));
  assert.doesNotMatch(html, /<dialog/);
  assert.equal((html.match(/class="metro-step-cell(?: |")/g) ?? []).length, 8, "only the current bar is expanded");
  assert.match(html, /第 2 小节，第 1 拍，do/); assert.match(html, /aria-label="删除所选音符"/);
  assert.match(html, /aria-label="每拍格数"/);
  const disabled = renderToStaticMarkup(createElement(StepEditor, { ...props, disabled: true }));
  assert.ok([...disabled.matchAll(/<button\b[^>]*>/g)].every(([button]) => button.includes('disabled=""')));
  const tool = renderToStaticMarkup(createElement(ToolButton, { icon: "volume", label: "静音钢琴" }));
  assert.match(tool, /title="静音钢琴"/); assert.match(tool, /aria-label="静音钢琴"/);
});
