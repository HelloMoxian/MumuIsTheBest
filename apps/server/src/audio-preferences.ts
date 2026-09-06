export const MUSIC_IDS = ["puzzling", "scifi", "solar"] as const;
export type MusicId = typeof MUSIC_IDS[number];
export type AudioPreferences = {
  schemaVersion: 1;
  musicEnabled: boolean;
  track: MusicId;
  musicVolume: number;
  effectsEnabled: boolean;
  effectsVolume: number;
};
export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  schemaVersion: 1, musicEnabled: true, track: "puzzling", musicVolume: 0.18,
  effectsEnabled: true, effectsVolume: 0.55,
};
export function parseAudioPreferences(value: unknown): AudioPreferences | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const p = value as AudioPreferences;
  if (Object.keys(p).length !== 6 || p.schemaVersion !== 1
    || typeof p.musicEnabled !== "boolean" || typeof p.effectsEnabled !== "boolean"
    || !MUSIC_IDS.includes(p.track)
    || ![p.musicVolume, p.effectsVolume].every(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1)) return;
  return { schemaVersion: 1, musicEnabled: p.musicEnabled, track: p.track,
    musicVolume: p.musicVolume, effectsEnabled: p.effectsEnabled, effectsVolume: p.effectsVolume };
}
