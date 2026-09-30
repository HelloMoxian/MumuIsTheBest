import {
  TICKS, MAX_TRACKS, MAX_NOTES, MAX_PROJECT_NOTES, MAX_LIBRARY_NOTES, CLICK_LEVELS,
  projectTicks, pulseCount,
  type ClickLevel, type InstrumentId, type MusicLibrary, type MusicNote, type MusicProject, type MusicTrack, type PresetId,
} from "../../../../server/src/metronome-contract";
import { getRhythm } from "./catalog";
export * from "../../../../server/src/metronome-contract";
export const newId = () => crypto.randomUUID();
export const CLICK_LABELS: Record<ClickLevel, string> = { off: "无", low: "低", medium: "中", high: "高" };
export const nextClickLevel = (level: ClickLevel): ClickLevel => CLICK_LEVELS[(CLICK_LEVELS.indexOf(level) + 1) % CLICK_LEVELS.length];
export function createTrack(instrument: InstrumentId = "piano"): MusicTrack {
  return { id: newId(), instrument, volume: .8, muted: false, solo: false, octave: 0, mode: "notes", notes: [] };
}
export function createProject(): MusicProject {
  const track = createTrack(), now = new Date().toISOString();
  return { id: newId(), title: "我的小乐队", createdAt: now, updatedAt: now, preset: "pop", bpm: 90,
    bars: 2, backing: true, click: "low", volume: .75, snap: "auto", scale: "major", activeTrackId: track.id, tracks: [track] };
}
export function createLibrary(): MusicLibrary {
  const project = createProject();
  return { schemaVersion: 2, activeId: project.id, projects: [project] };
}
export function gridStep(project: MusicProject): number {
  const divisions = { auto: getRhythm(project.preset).division, off: getRhythm(project.preset).division, beat: 1, half: 2, third: 3, quarter: 4 };
  return TICKS / divisions[project.snap];
}
/** Manual entry selects a cell without wrapping the final cell to the beginning. */
export function stepTick(project: MusicProject, tick: number): number {
  const step = gridStep(project), length = projectTicks(project);
  return Math.min(length - step, Math.max(0, Math.floor((Number.isFinite(tick) ? tick : 0) / step) * step));
}
export function placeStepNote(project: MusicProject, track: MusicTrack, tick: number, key: number) {
  if (!Number.isInteger(key) || key < 0 || key > 9) throw new RangeError("请选择一个琴键。");
  const at = stepTick(project, tick), step = gridStep(project);
  const existing = track.notes.find(n => n.key === key && Math.floor(n.tick / step) * step === at);
  if (existing) return { note: existing, notes: track.notes };
  const note: MusicNote = { id: newId(), key, tick: at, duration: Math.min(step, projectTicks(project) - at), velocity: .8 };
  return { note, notes: [...track.notes, note] };
}
export function updateStepNote(project: MusicProject, note: MusicNote, patch: Partial<Pick<MusicNote, "tick" | "duration">>): MusicNote {
  const tick = patch.tick === undefined ? note.tick : stepTick(project, patch.tick);
  const duration = Number.isFinite(patch.duration) ? Math.round(patch.duration!) : note.duration;
  return { ...note, tick, duration: Math.min(projectTicks(project) - tick, Math.max(1, duration)) };
}
export function quantizedNote(project: MusicProject, key: number, start: number, end: number, id: string = newId()): MusicNote {
  const length = projectTicks(project), step = project.snap === "off" ? 1 : gridStep(project);
  // Circular nearest-grid placement; a late last hit belongs to the next downbeat.
  const tick = ((Math.round(start / step) * step) % length + length) % length;
  const duration = Math.min(length - tick, Math.max(step, Math.round(Math.max(1, end - start) / step) * step));
  return { id, key, tick, duration, velocity: .8 };
}
export function noteCount(project: MusicProject) { return project.tracks.reduce((n, t) => n + t.notes.length, 0); }
export function canAddNotes(library: MusicLibrary, project: MusicProject, track: MusicTrack, count: number) {
  return track.notes.length + count <= MAX_NOTES && noteCount(project) + count <= MAX_PROJECT_NOTES
    && library.projects.reduce((n, p) => n + noteCount(p), 0) + count <= MAX_LIBRARY_NOTES;
}
export function addTrack(project: MusicProject, instrument: InstrumentId): MusicProject {
  if (project.tracks.length >= MAX_TRACKS) return project;
  const track = createTrack(instrument);
  return { ...project, activeTrackId: track.id, tracks: [...project.tracks, track] };
}
export function changePreset(project: MusicProject, preset: PresetId): MusicProject {
  const ratio = pulseCount(preset) / pulseCount(project.preset), length = pulseCount(preset) * TICKS * project.bars;
  return { ...project, preset, bpm: getRhythm(preset).bpm, tracks: project.tracks.map(track => ({ ...track, notes: track.notes.map(note => {
    const tick = Math.min(length - 1, Math.round(note.tick * ratio));
    return { ...note, tick, duration: Math.min(length - tick, Math.max(1, Math.round(note.duration * ratio))) };
  }) })) };
}
/** Extending repeats existing notes into the new bars with independent IDs. Shrinking is explicit and undoable. */
export function resizeLoop(project: MusicProject, bars: MusicProject["bars"]): MusicProject {
  const oldLength = projectTicks(project), length = pulseCount(project.preset) * TICKS * bars;
  const tracks = project.tracks.map(track => ({ ...track, notes: Array.from({ length: Math.ceil(length / oldLength) }, (_, repeat) =>
    track.notes.flatMap(note => {
      const tick = note.tick + repeat * oldLength;
      return tick >= length ? [] : [{ ...note, id: repeat ? newId() : note.id, tick, duration: Math.min(note.duration, length - tick) }];
    })).flat() }));
  if (tracks.some(t => t.notes.length > MAX_NOTES) || tracks.reduce((n, t) => n + t.notes.length, 0) > MAX_PROJECT_NOTES) throw new Error("这段音符已经很多了，可以先另存一份。");
  return { ...project, bars, tracks };
}
export function cloneProject(project: MusicProject): MusicProject {
  const tracks = project.tracks.map(t => ({ ...t, id: newId(), notes: t.notes.map(n => ({ ...n, id: newId() })) }));
  const now = new Date().toISOString();
  return { ...project, id: newId(), title: (project.title + " · 副本").slice(0, 48), createdAt: now, updatedAt: now, activeTrackId: tracks[0]?.id ?? null, tracks };
}
export function deleteProject(library: MusicLibrary, id: string): MusicLibrary {
  if (!library.projects.some(project => project.id === id)) return library;
  const projects = library.projects.filter(project => project.id !== id);
  if (!projects.length) projects.push(createProject());
  return { ...library, projects, activeId: library.activeId === id ? projects[0].id : library.activeId };
}
export function audibleTracks(project: MusicProject): MusicTrack[] {
  const solo = project.tracks.some(t => t.solo);
  return project.tracks.filter(t => !t.muted && (!solo || t.solo));
}
export type ScheduledEvent =
  | { tick: number; kind: "click"; accent: boolean }
  | { tick: number; kind: "drum"; pitch: number; velocity: number }
  | { tick: number; kind: "note"; track: MusicTrack; note: MusicNote };
/** Half-open absolute tick interval. All tracks, drums and metronome share one musical clock. */
export function eventsBetween(project: MusicProject, from: number, to: number, options: { export?: boolean; suppress?: ReadonlySet<string>; suppressBefore?: number } = {}): ScheduledEvent[] {
  if (to <= from) return [];
  const rhythm = getRhythm(project.preset), length = projectTicks(project), bar = rhythm.pulses * TICKS;
  const result: ScheduledEvent[] = [];
  if (!options.export && project.click !== "off") {
    for (let tick = Math.ceil(from / TICKS) * TICKS; tick < to; tick += TICKS) {
      result.push({ kind: "click", tick, accent: ((tick % bar) + bar) % bar === 0 });
    }
  }
  const tracks = audibleTracks(project), hasSolo = project.tracks.some(t => t.solo);
  for (let cycle = Math.max(0, Math.floor(from / length)); cycle * length < to; cycle++) {
    const offset = cycle * length;
    for (const track of tracks) for (const note of track.notes) {
      const tick = offset + note.tick;
      if (tick >= from && tick < to && !(tick < (options.suppressBefore ?? 0) && options.suppress?.has(note.id))) result.push({ kind: "note", tick, track, note });
    }
    if (project.backing && !hasSolo) for (let b = 0; b < project.bars; b++) for (const [relative, pitch, velocity] of rhythm.hits) {
      const tick = offset + b * bar + relative;
      if (tick >= from && tick < to) result.push({ kind: "drum", tick, pitch, velocity });
    }
  }
  return result.sort((a, b) => a.tick - b.tick);
}
export class RecordingTake {
  readonly notes: MusicNote[] = [];
  readonly held = new Map<string, { key: number; start: number; id: string }>();
  constructor(readonly project: MusicProject, readonly trackId: string, readonly replace: boolean) {}
  press(token: string, key: number, tick: number) {
    if (tick < 0 || tick >= projectTicks(this.project) || this.held.has(token)) return;
    this.held.set(token, { key, start: tick, id: newId() });
  }
  release(token: string, tick: number) {
    const held = this.held.get(token); if (!held) return;
    this.held.delete(token);
    this.notes.push(quantizedNote(this.project, held.key, held.start, Math.min(tick, projectTicks(this.project)), held.id));
  }
  snapshot(tick: number) {
    return [...this.notes, ...[...this.held.values()].map(h => quantizedNote(this.project, h.key, h.start, Math.min(tick, projectTicks(this.project)), h.id))];
  }
  merge(current: MusicProject, tick: number): MusicProject {
    const notes = this.snapshot(tick);
    if (!notes.length) return current;
    return { ...current, tracks: current.tracks.map(track => track.id !== this.trackId ? track : {
      ...track, notes: [...(this.replace ? [] : this.project.tracks.find(t => t.id === this.trackId)!.notes), ...notes],
    }) };
  }
}
