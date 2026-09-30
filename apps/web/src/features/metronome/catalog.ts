import instrumentData from "../../../../../content/metronome/instruments.v1.json";
import rhythmData from "../../../../../content/metronome/rhythms.v1.json";
import type { InstrumentId, PresetId, MusicProject, MusicTrack } from "../../../../server/src/metronome-contract";
export type Instrument = {
  id: InstrumentId; name: string; family: string; program: number | null;
  base: number; sustain: boolean; drums?: number[];
};
export type Rhythm = { id: PresetId; name: string; meter: string; pulses: number; bpm: number; division: number; hits: number[][] };
export const INSTRUMENTS = instrumentData.instruments as Instrument[];
export const RHYTHMS = rhythmData.patterns as Rhythm[];
export const getInstrument = (id: InstrumentId) => INSTRUMENTS.find(i => i.id === id)!;
export const getRhythm = (id: PresetId) => RHYTHMS.find(r => r.id === id)!;
export const bankName = (instrument: Instrument) => instrument.program === null ? "drums" : "p" + String(instrument.program).padStart(3, "0");
export const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
export const DRUM_NAMES: Record<number, string> = {
  35: "大鼓", 36: "底鼓", 38: "军鼓", 39: "拍手", 42: "闭镲", 45: "低通鼓",
  46: "开镲", 47: "中通鼓", 49: "强音镲", 50: "高通鼓", 51: "叮叮镲",
  52: "中国镲", 53: "镲钟", 54: "铃鼓", 55: "水镲", 56: "牛铃", 57: "强音镲",
  58: "颤音叉", 59: "叮叮镲", 60: "高邦戈", 61: "低邦戈", 62: "闷康加",
  63: "高康加", 64: "低康加", 65: "高天巴", 66: "低天巴", 67: "高阿哥哥",
  68: "低阿哥哥", 69: "卡巴萨", 70: "沙锤", 73: "短刮瓜", 74: "长刮瓜",
  75: "响棒", 76: "高木块", 77: "低木块", 80: "闷三角铁", 81: "三角铁",
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const SOLFEGE: Record<number, string> = { 0: "do", 2: "re", 4: "mi", 5: "fa", 7: "sol", 9: "la", 11: "si" };
const CHORDS = [[0, 4, 7], [2, 5, 9], [4, 7, 11], [5, 9, 12], [7, 11, 14], [9, 12, 16], [7, 11, 14], [12, 16, 19], [17, 21, 24], [19, 23, 26]];
const CHORD_LABELS = ["C", "Dm", "Em", "F", "G", "Am", "G", "高 C", "高 F", "高 G"];
export const canChord = (track: MusicTrack) => ["拨弦", "键盘"].includes(getInstrument(track.instrument).family);
export function pitchesForKey(track: MusicTrack, project: Pick<MusicProject, "scale">, key: number): number[] {
  const instrument = getInstrument(track.instrument);
  if (instrument.drums) return [instrument.drums[key]];
  const root = instrument.base + track.octave * 12;
  const offsets = track.mode === "chords" && canChord(track) ? CHORDS[key]
    : [(project.scale === "pentatonic" ? PENTATONIC : MAJOR)[key]];
  return offsets.map(n => Math.max(0, Math.min(127, root + n)));
}
export function keyLabel(track: MusicTrack, project: Pick<MusicProject, "scale">, key: number): string {
  const instrument = getInstrument(track.instrument);
  if (instrument.drums) return DRUM_NAMES[instrument.drums[key]];
  if (track.mode === "chords" && canChord(track)) return CHORD_LABELS[key];
  const semitone = (project.scale === "pentatonic" ? PENTATONIC : MAJOR)[key];
  return (semitone >= 12 ? "高 " : "") + SOLFEGE[semitone % 12];
}
