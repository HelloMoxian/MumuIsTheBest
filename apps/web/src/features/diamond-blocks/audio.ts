import { audioFocus } from "../../shared/audio/audio-focus";
import { browserTts } from "../../shared/speech";
import { getExperienceSnapshot, subscribeExperience } from "../../shared/experience/experience-store";
import { MUSIC_TRACKS } from "../../shared/audio/music-player";
import type { Config } from "./logic";

export const TRACK_NAMES = { mix: "星际电台 · 自动轮播", prism: "棱镜舞步 · 芯片律动", orbit: "环星旅行 · 太空琶音", garden: "星光花园 · 轻快钟琴", tide: "月海潮汐 · 梦幻和弦", puzzling: "晶光漫步", scifi: "星云漫游", solar: "阳光航线" } as const;
const PLAYLIST = ["prism", "orbit", "garden", "tide", "puzzling", "scifi", "solar"] as const;
export type Sound = "move" | "rotate" | "drop" | "lock" | "clear" | "chain" | "level" | "over" | "resume" | "change";
const COMPOSITIONS = [
  { bpm: 112, root: 60, lead: [0, 4, 7, 12, 7, 4, 2, 7, 4, 9, 12, 16, 14, 12, 7, 4], chords: [0, 5, 9, 7], wave: "square" as OscillatorType },
  { bpm: 98, root: 57, lead: [0, 7, 12, 14, 12, 7, 3, 7, 0, 10, 15, 19, 15, 10, 7, 3], chords: [0, 8, 5, 7], wave: "triangle" as OscillatorType },
  { bpm: 124, root: 62, lead: [0, 4, 7, 9, 12, 9, 7, 4, 2, 5, 9, 12, 14, 12, 9, 5], chords: [0, 7, 9, 5], wave: "sine" as OscillatorType },
  { bpm: 84, root: 55, lead: [0, 7, 11, 14, 19, 14, 11, 7, 2, 9, 12, 16, 21, 16, 12, 9], chords: [0, 4, 9, 5], wave: "sine" as OscillatorType },
];
export function musicNotes(track: number, step: number) {
  const c = COMPOSITIONS[track % 4], chord = c.chords[Math.floor(step / 16) % 4];
  const phrase = Math.floor(step / 64) % 4;
  return { duration: 60 / c.bpm / 4, lead: c.root + chord + c.lead[step % 16] + (phrase === 2 ? 12 : 0),
    bass: c.root + chord - 24, chord: [0, 4, 7].map(n => c.root + chord + n), wave: c.wave, phrase };
}
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Original four-voice chip compositions and short event motifs, all generated locally. */
export class DiamondAudio {
  private context: AudioContext | null = null;
  private config: Config | null = null;
  private running = true;
  private unlocked = false;
  private disposed = false;
  private duck = false;
  private sources = new Set<OscillatorNode>();
  private track = "";
  private clip: HTMLAudioElement | null = null;
  private step = 0;
  private sequence = 0;
  private scene = 0;
  private nextAt = 0;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private throttle = new Map<string, number>();
  private release: (() => void)[];
  constructor(private notice: (message: string) => void) {
    this.release = [audioFocus.acquireCreative(), audioFocus.subscribe(() => this.environment()),
      browserTts.subscribe(() => this.environment()), subscribeExperience(() => this.environment())];
  }
  private environment() {
    const status = browserTts.getSnapshot().status;
    this.duck = status === "speaking" || status === "loading" || getExperienceSnapshot().speechStatus.startsWith("speaking");
    if (audioFocus.isMicrophoneActive()) this.stop();
    else this.sync();
    if (this.clip && this.config) this.clip.volume = this.config.volume * (this.duck ? .18 : 1);
  }
  configure(config: Config, running: boolean, scene = this.scene) {
    const changed = this.config && (this.config.track !== config.track || this.config.music !== config.music || this.config.effects !== config.effects || this.scene !== scene);
    if (this.config?.track !== config.track) this.sequence = 0;
    this.config = config; this.running = running; this.scene = scene;
    if (changed) { this.stop(); this.track = ""; this.step = 0; }
    this.sync();
  }
  unlock() {
    if (this.disposed) return;
    this.unlocked = true;
    if (!this.config?.music && !this.config?.effects) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state !== "running") {
        const generation = this.generation;
        void this.context.resume().then(() => { if (generation === this.generation && !this.disposed) this.sync(); }).catch(() => this.notice("声音未能启动，可关闭声音后重新开启"));
      } else this.sync();
    } catch { this.notice("当前浏览器声音不可用，游戏可以继续"); }
  }
  private allowed() { return !this.disposed && this.running && this.unlocked && !document.hidden && !audioFocus.isMicrophoneActive(); }
  private tone(midi: number, start: number, duration: number, amplitude: number, type: OscillatorType, sweep = 1) {
    const c = this.context;
    if (!c || c.state !== "running" || this.sources.size >= 48) return;
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(hz(midi), start);
    if (sweep !== 1) osc.frequency.exponentialRampToValueAtTime(hz(midi) * sweep, start + duration);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(amplitude * (this.duck ? .18 : 1), start + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    osc.connect(gain); gain.connect(c.destination); this.sources.add(osc);
    osc.onended = () => { this.sources.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(start); osc.stop(start + duration + .01);
  }
  private sync() {
    if (!this.allowed()) { this.stop(); return; }
    if (!this.config?.music) return;
    const base = this.config.track === "mix" ? this.sequence : PLAYLIST.indexOf(this.config.track);
    const id = PLAYLIST[(base + this.scene) % PLAYLIST.length];
    if (this.track !== id) {
      this.stop(); this.track = id; this.step = 0; this.nextAt = 0;
      const file = MUSIC_TRACKS.find(t => t.id === id);
      if (file) {
        const clip = new Audio(file.src); this.clip = clip; clip.loop = this.config.track !== "mix";
        clip.onerror = () => this.notice("这首配乐暂时不可用，可以换一首");
        clip.onended = () => { if (this.config?.track === "mix") { this.sequence++; this.track = ""; this.sync(); } };
        clip.volume = this.config.volume * (this.duck ? .18 : 1);
        const generation = this.generation;
        void clip.play().catch(() => { if (generation === this.generation) this.notice("点击音乐开关重试播放"); });
      }
    }
    if (this.clip) { this.clip.volume = this.config.volume * (this.duck ? .18 : 1); return; }
    if (!this.timer && this.context?.state === "running") {
      this.timer = setInterval(() => this.schedule(), 80); this.schedule();
    }
  }
  private schedule() {
    if (!this.allowed() || !this.context || !this.config?.music) return;
    try {
      const c = this.context;
      if (this.nextAt < c.currentTime) this.nextAt = c.currentTime + .025;
      while (this.nextAt < c.currentTime + .16) {
        if (this.step >= 768 && this.config.track === "mix") { this.sequence++; this.track = ""; this.sync(); return; }
        const i = ["prism", "orbit", "garden", "tide"].indexOf(this.track);
        const n = musicNotes(Math.max(0, i), this.step), t = this.nextAt, v = this.config.volume;
        this.tone(n.lead, t, n.duration * 1.6, v * .14, n.wave);
        if (this.step % 4 === 0) this.tone(n.bass, t, n.duration * 3, v * .24, "triangle");
        if (this.step % 16 === 0) n.chord.forEach(note => this.tone(note, t, n.duration * 12, v * .045, "sine"));
        if (this.step % 4 === 0) this.tone(38, t, .09, v * .2, "sine", .3);
        if (this.step % 4 === 2) this.tone(94, t, .03, v * .045, "triangle", .3);
        if (n.phrase === 3 && this.step % 2 === 1) this.tone(n.lead + 12, t, .08, v * .04, "sine");
        this.step++; this.nextAt += n.duration;
      }
    } catch { this.stop(); this.notice("配乐暂时不可用，游戏可以继续"); }
  }
  play(sound: Sound, chain = 1) {
    if (!this.allowed() || !this.config?.effects || !this.context || this.context.state !== "running") return;
    const now = performance.now();
    if (now - (this.throttle.get(sound) ?? -Infinity) < 60) return;
    this.throttle.set(sound, now);
    const notes: Record<Sound, number[]> = {
      move: [68], rotate: [72, 79], drop: [79, 67, 55], lock: [48, 60],
      clear: [72, 76, 79], chain: [72, 76, 79, 84], level: [72, 76, 79, 84, 88, 91],
      over: [67, 64, 60, 55], resume: [67, 72, 79], change: [79, 84],
    };
    try {
      notes[sound].forEach((n, i) => this.tone(n + (sound === "chain" ? Math.min(chain - 1, 6) * 2 : 0),
        this.context!.currentTime + .005 + i * .055, sound === "move" ? .045 : .18,
        this.config!.effectVolume * .22, sound === "lock" ? "triangle" : "sine", sound === "drop" ? .8 : 1));
    } catch { this.notice("音效暂时不可用"); }
  }
  stop() {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.nextAt = 0;
    if (this.clip) { this.clip.pause(); this.clip.onended = null; this.clip.onerror = null; this.clip = null; this.track = ""; }
    for (const osc of this.sources) { try { osc.stop(); } catch { /* Already ended. */ } }
    this.sources.clear();
  }
  dispose() {
    this.disposed = true; this.stop(); this.release.forEach(fn => fn());
    void this.context?.close().catch(() => {}); this.context = null;
  }
}
