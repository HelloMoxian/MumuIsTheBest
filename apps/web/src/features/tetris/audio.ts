import type { TetrisSound } from "./logic";
import { audioFocus } from "../../shared/audio/audio-focus";
export type { TetrisSound } from "./logic";
export type AudioOptions = { music: boolean; effects: boolean };
export interface AudioClip {
  loop: boolean; volume: number; currentTime: number; preload: string;
  onerror: HTMLAudioElement["onerror"]; onended: HTMLAudioElement["onended"];
  play(): Promise<void>;
  pause(): void;
}
type AudioFactory = (source: string) => AudioClip;
const SOUND_VOLUME: Record<TetrisSound, number> = { move: .18, rotate: .25, lock: .4, clear: .4, level: .45 };

/** Local music/effects only. Speech remains owned by the shared bilingual service. */
export class TetrisAudio {
  private options: AudioOptions = { music: false, effects: false };
  private playing = false;
  private ducked = false;
  private disposed = false;
  private readonly music: AudioClip;
  private readonly effects = new Map<TetrisSound, AudioClip[]>();
  private readonly lastPlayed = new Map<TetrisSound, number>();
  private readonly active = new Set<AudioClip>();
  private musicGeneration = 0;
  private musicActive = false;
  private releaseFocus: () => void;

  constructor(
    create: AudioFactory = source => new Audio(source),
    private readonly unavailable: () => void = () => {},
    sources: Partial<Record<TetrisSound | "music", string>> = {},
  ) {
    const make = (name: TetrisSound | "music") => {
      const clip = create(sources[name] ?? `/audio/tetris/${name}.cc0.${name === "music" ? "mp3" : "wav"}`);
      clip.preload = "auto";
      clip.onerror = () => this.unavailable();
      return clip;
    };
    this.music = make("music");
    this.music.loop = true;
    this.releaseFocus = audioFocus.subscribe(() => this.setDucked(this.ducked));
    for (const name of Object.keys(SOUND_VOLUME) as TetrisSound[]) {
      this.effects.set(name, Array.from({ length: 3 }, () => {
        const clip = make(name);
        clip.onended = () => this.active.delete(clip);
        return clip;
      }));
    }
  }
  configure(options: AudioOptions) {
    this.options = { ...options };
    if (!options.effects) this.stopEffects();
    this.syncMusic();
  }
  setPlaying(playing: boolean) {
    this.playing = playing;
    if (!playing) this.stopEffects();
    this.syncMusic();
  }
  setDucked(ducked: boolean) {
    this.ducked = ducked;
    this.music.volume = audioFocus.isMusicActive() || audioFocus.isMicrophoneActive() ? 0 : ducked ? .06 : .24;
    for (const [name, clips] of this.effects) for (const clip of clips) clip.volume = SOUND_VOLUME[name] * (ducked ? .4 : 1);
  }
  private syncMusic() {
    this.setDucked(this.ducked);
    if (this.disposed || !this.playing || !this.options.music) {
      this.musicGeneration++;
      this.musicActive = false;
      this.music.pause();
      return;
    }
    if (this.musicActive) return;
    this.musicActive = true;
    const generation = ++this.musicGeneration;
    void this.startClip(this.music).then(() => {
      if (this.disposed || !this.playing || !this.options.music) this.music.pause();
    }).catch(() => {
      if (generation === this.musicGeneration) { this.musicActive = false; this.unavailable(); }
    });
  }
  play(name: TetrisSound, now = performance.now()) {
    if (this.disposed || !this.playing || !this.options.effects) return;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < (name === "move" ? 65 : 45)) return;
    this.lastPlayed.set(name, now);
    const clips = this.effects.get(name)!;
    const clip = clips.find(candidate => !this.active.has(candidate)) ?? clips[0];
    clip.pause();
    this.rewind(clip);
    clip.volume = SOUND_VOLUME[name] * (this.ducked ? .4 : 1);
    this.active.add(clip);
    void this.startClip(clip).then(() => {
      if (this.disposed || !this.playing || !this.options.effects) { clip.pause(); this.active.delete(clip); }
    }).catch(() => { this.active.delete(clip); if (!this.disposed && this.playing && this.options.effects) this.unavailable(); });
  }
  private stopEffects() {
    for (const clips of this.effects.values()) for (const clip of clips) { clip.pause(); this.rewind(clip); }
    this.active.clear();
    this.lastPlayed.clear();
  }
  private startClip(clip: AudioClip): Promise<void> {
    try { return Promise.resolve(clip.play()); }
    catch (error) { return Promise.reject(error); }
  }
  private rewind(clip: AudioClip) {
    try { clip.currentTime = 0; } catch { /* Some engines reject seeking before metadata loads. */ }
  }
  restart() { this.rewind(this.music); this.stopEffects(); }
  dispose() {
    this.releaseFocus();
    this.disposed = true;
    this.setPlaying(false);
    this.music.onerror = null;
    for (const clips of this.effects.values()) for (const clip of clips) { clip.onerror = null; clip.onended = null; }
  }
}
