import { pitchesForKey } from "./catalog";
import { gridStep, newId, projectTicks, TICKS, type MusicNote, type MusicProject, type MusicTrack } from "./logic";

export type PitchFrame = { time: number; frequency: number; clarity: number; rms: number };
export type HumSegment = { id: string; pitch: number; start: number; end: number; energy: number; frames: number };
export const frequencyToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Streaming monophonic segmentation. Times are sample timestamps, never UI frames. */
export class HumTranscriber {
  readonly segments: HumSegment[] = [];
  private active: HumSegment | null = null;
  private pending: { pitch: number; start: number; energy: number; frames: number } | null = null;
  private history: number[] = [];
  private noise: number[] = [];
  private lastTime = -Infinity;
  private blockedPitch: number | null = null;
  private lastGood = 0;
  private floor = .003;
  private clipped = false;
  get gate() { return Math.max(.006, this.floor * 2.5); }
  get currentPitch() { return this.active?.pitch ?? null; }
  get isClipping() { return this.clipped; }
  feed(frame: PitchFrame) {
    const { time, frequency, clarity, rms } = frame;
    if (![time, frequency, clarity, rms].every(Number.isFinite) || time <= this.lastTime || rms < 0) return;
    this.lastTime = time; this.clipped = rms > .65;
    const voiced = frequency >= 70 && frequency <= 1600 && clarity >= .85 && rms >= this.gate;
    if (time < 0) {
      if (clarity < .6) {
        this.noise.push(rms); if (this.noise.length > 150) this.noise.shift();
        this.floor = clamp([...this.noise].sort((a, b) => a - b)[Math.floor(this.noise.length * .2)], .001, .012);
      }
      // A note held during preparation cannot spill across the recording boundary.
      this.blockedPitch = voiced ? Math.round(frequencyToMidi(frequency)) : null;
      return;
    }
    if (!voiced) {
      this.history = []; this.pending = null;
      if (this.active && time - this.lastGood >= .1) this.close(this.lastGood + .02);
      this.blockedPitch = null;
      return;
    }
    const midi = frequencyToMidi(frequency);
    if (this.blockedPitch !== null) {
      if (Math.abs(midi - this.blockedPitch) < .7) return;
      this.blockedPitch = null;
    }
    this.history.push(midi); if (this.history.length > 5) this.history.shift();
    const smooth = median(this.history);
    // Hysteresis around the current semitone prevents vibrato from creating fragments.
    const pitch = this.active && Math.abs(smooth - this.active.pitch) < .7 ? this.active.pitch : Math.round(smooth);
    if (this.active?.pitch === pitch) {
      this.pending = null; this.lastGood = time;
      this.active.end = time + .02; this.active.energy += rms; this.active.frames++;
      return;
    }
    if (this.pending?.pitch !== pitch) this.pending = { pitch, start: time, energy: rms, frames: 1 };
    else { this.pending.energy += rms; this.pending.frames++; }
    const wait = this.active && Math.abs(pitch - this.active.pitch) === 12 ? .16 : .06;
    if (time - this.pending.start < wait) return;
    const next = this.pending;
    this.close(next.start);
    this.active = { id: newId(), pitch, start: next.start, end: time + .02, energy: next.energy, frames: next.frames };
    this.pending = null; this.lastGood = time;
  }
  private close(time: number) {
    if (this.active) {
      const end = Math.min(time, this.active.end);
      if (end - this.active.start >= .08) this.segments.push({ ...this.active, end });
    }
    this.active = null;
  }
  snapshot(time: number): HumSegment[] {
    const active = this.active && { ...this.active, end: Math.min(time, this.active.end) };
    return [...this.segments, ...(active && active.end - active.start >= .08 ? [active] : [])];
  }
  finish(time: number) { this.close(time); this.pending = null; this.history = []; }
}

export function humNote(project: MusicProject, track: MusicTrack, segment: HumSegment, gate: number): MusicNote | null {
  const secondsPerTick = 60 / project.bpm / TICKS, length = projectTicks(project);
  const step = project.snap === "off" ? 1 : gridStep(project);
  // Clamp at the phrase end; unlike keyboard hits, late microphone notes never wrap to zero.
  const tick = clamp(Math.round(segment.start / secondsPerTick / step) * step, 0, length - 1);
  const end = clamp(Math.round(segment.end / secondsPerTick / step) * step, tick + 1, length);
  if (segment.start < 0 || segment.start >= length * secondsPerTick || segment.end <= segment.start) return null;
  const key = Array.from({ length: 10 }, (_, i) => i).reduce((best, i) =>
    Math.abs(pitchesForKey({ ...track, mode: "notes" }, project, i)[0] - segment.pitch) < Math.abs(pitchesForKey({ ...track, mode: "notes" }, project, best)[0] - segment.pitch) ? i : best, 0);
  const rms = segment.energy / Math.max(1, segment.frames);
  const velocity = clamp(.15 + .85 * Math.log10(1 + rms / gate) / Math.log10(35), .05, 1);
  return { id: segment.id, key, pitch: segment.pitch, tick, duration: end - tick, velocity };
}

export class HummingTake {
  readonly detector = new HumTranscriber();
  readonly track: MusicTrack;
  constructor(readonly project: MusicProject, readonly trackId: string, readonly limit: number) {
    this.track = project.tracks.find(t => t.id === trackId)!;
  }
  notes(time: number) {
    return this.detector.snapshot(time).flatMap(s => {
      const note = humNote(this.project, this.track, s, this.detector.gate); return note ? [note] : [];
    }).slice(0, this.limit);
  }
  merge(current: MusicProject, time: number): MusicProject {
    const notes = this.notes(time);
    return notes.length ? { ...current, tracks: current.tracks.map(t => t.id === this.trackId ? { ...t, notes: [...this.track.notes, ...notes] } : t) } : current;
  }
}
