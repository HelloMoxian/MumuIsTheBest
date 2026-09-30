/** Browser-safe v2 library contract; v1 click switches migrate without changing notes. */
export const TICKS = 96;
export const MAX_TRACKS = 32;
export const MAX_NOTES = 1024;
export const MAX_PROJECT_NOTES = 4096;
export const MAX_LIBRARY_NOTES = 12000;
export const MAX_PROJECTS = 24;
export const INSTRUMENT_IDS = ["piano","electric-piano","organ","accordion","guitar","steel-guitar","electric-guitar","harp","banjo","violin","viola","cello","pizzicato","flute","recorder","clarinet","oboe","bassoon","sax","trumpet","trombone","horn","bass","acoustic-bass","xylophone","marimba","vibraphone","glockenspiel","steel-drums","music-box","taiko","timpani","drum-kit","hand-drums","shakers","cymbals","wood","woodblock"] as const;
export type InstrumentId = typeof INSTRUMENT_IDS[number];
export const PRESET_IDS = ["march", "waltz", "pop", "rock", "disco", "six-eight"] as const;
export type PresetId = typeof PRESET_IDS[number];
export type Snap = "auto" | "off" | "beat" | "half" | "third" | "quarter";
export const CLICK_LEVELS = ["off", "low", "medium", "high"] as const;
export type ClickLevel = typeof CLICK_LEVELS[number];
export type MusicNote = { id: string; key: number; tick: number; duration: number; velocity: number };
export type MusicTrack = {
  id: string; instrument: InstrumentId; volume: number; muted: boolean; solo: boolean;
  octave: -1 | 0 | 1; mode: "notes" | "chords"; notes: MusicNote[];
};
export type MusicProject = {
  id: string; title: string; createdAt: string; updatedAt: string;
  preset: PresetId; bpm: number; bars: 1 | 2 | 4 | 8;
  backing: boolean; click: ClickLevel; volume: number; snap: Snap;
  scale: "major" | "pentatonic"; activeTrackId: string | null; tracks: MusicTrack[];
};
export type MusicLibrary = { schemaVersion: 2; activeId: string; projects: MusicProject[] };
export type MusicState = {
  schemaVersion: 1; id: "metronome-library"; createdAt: string; updatedAt: string;
  revision: number; library: MusicLibrary;
};
export const pulseCount = (preset: PresetId) => preset === "waltz" ? 3 : preset === "march" || preset === "six-eight" ? 2 : 4;
export const projectTicks = (project: Pick<MusicProject, "preset" | "bars">) => pulseCount(project.preset) * TICKS * project.bars;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const number = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number): v is number => number(v, min, max) && Number.isInteger(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(v);
const timestamp = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
const exactKeys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && names.every(n => Object.hasOwn(v, n));
const oneOf = <T>(v: unknown, values: readonly T[]): v is T => values.includes(v as T);

export function parseMusicLibrary(value: unknown): MusicLibrary | undefined {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "activeId", "projects"]) || !oneOf(value.schemaVersion, [1, 2])
    || !id(value.activeId) || !Array.isArray(value.projects) || !value.projects.length || value.projects.length > MAX_PROJECTS) return;
  const projectIds = new Set<string>();
  let total = 0;
  for (const project of value.projects) {
    if (!record(project) || !exactKeys(project, ["id", "title", "createdAt", "updatedAt", "preset", "bpm", "bars", "backing", "click", "volume", "snap", "scale", "activeTrackId", "tracks"])
      || !id(project.id) || projectIds.has(project.id) || typeof project.title !== "string" || !project.title.trim() || project.title.length > 48
      || !timestamp(project.createdAt) || !timestamp(project.updatedAt) || project.updatedAt < project.createdAt
      || !oneOf(project.preset, PRESET_IDS) || !integer(project.bpm, 40, 200) || !oneOf(project.bars, [1, 2, 4, 8])
      || typeof project.backing !== "boolean" || (value.schemaVersion === 1 ? typeof project.click !== "boolean" : !oneOf(project.click, CLICK_LEVELS)) || !number(project.volume, 0, 1)
      || !oneOf(project.snap, ["auto", "off", "beat", "half", "third", "quarter"])
      || !oneOf(project.scale, ["major", "pentatonic"]) || !Array.isArray(project.tracks) || project.tracks.length > MAX_TRACKS) return;
    projectIds.add(project.id);
    const end = pulseCount(project.preset) * TICKS * project.bars;
    const trackIds = new Set<string>(), noteIds = new Set<string>();
    let projectTotal = 0;
    for (const track of project.tracks) {
      if (!record(track) || !exactKeys(track, ["id", "instrument", "volume", "muted", "solo", "octave", "mode", "notes"])
        || !id(track.id) || trackIds.has(track.id) || !oneOf(track.instrument, INSTRUMENT_IDS)
        || !number(track.volume, 0, 1) || typeof track.muted !== "boolean" || typeof track.solo !== "boolean"
        || !oneOf(track.octave, [-1, 0, 1]) || !oneOf(track.mode, ["notes", "chords"]) || !Array.isArray(track.notes) || track.notes.length > MAX_NOTES) return;
      trackIds.add(track.id);
      for (const note of track.notes) {
        if (!record(note) || !exactKeys(note, ["id", "key", "tick", "duration", "velocity"])
          || !id(note.id) || noteIds.has(note.id) || !integer(note.key, 0, 9)
          || !integer(note.tick, 0, end - 1) || !integer(note.duration, 1, end - note.tick) || !number(note.velocity, .05, 1)) return;
        noteIds.add(note.id);
      }
      projectTotal += track.notes.length;
    }
    if (projectTotal > MAX_PROJECT_NOTES || (project.activeTrackId !== null && !trackIds.has(project.activeTrackId as string))
      || (project.tracks.length > 0 && project.activeTrackId === null)) return;
    total += projectTotal;
  }
  if (total > MAX_LIBRARY_NOTES || !projectIds.has(value.activeId)) return;
  // Rebuild through JSON so callers never retain attacker-controlled prototypes or references.
  const library = JSON.parse(JSON.stringify(value));
  if (library.schemaVersion === 1) {
    for (const project of library.projects) project.click = project.click ? "low" : "off";
    library.schemaVersion = 2;
  }
  return library as MusicLibrary;
}

export function parseMusicState(value: unknown): MusicState | undefined {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "id", "createdAt", "updatedAt", "revision", "library"])
    || value.schemaVersion !== 1 || value.id !== "metronome-library" || !timestamp(value.createdAt)
    || !timestamp(value.updatedAt) || value.updatedAt < value.createdAt || !integer(value.revision, 1, Number.MAX_SAFE_INTEGER)) return;
  const library = parseMusicLibrary(value.library);
  return library ? { schemaVersion: 1, id: "metronome-library", createdAt: value.createdAt, updatedAt: value.updatedAt, revision: value.revision, library } : undefined;
}
