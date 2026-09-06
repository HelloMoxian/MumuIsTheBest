import type { AudioPreferences } from "../../../../server/src/audio-preferences";
export const MUSIC_TRACKS = [
  { id: "puzzling", title: "晶光漫步", detail: "轻盈的解谜旋律", src: "/audio/global/puzzling.mp3" },
  { id: "scifi", title: "星云漫游", detail: "柔和的太空节拍", src: "/audio/global/scifi.mp3" },
  { id: "solar", title: "阳光航线", detail: "明亮的探索节奏", src: "/audio/tetris/music.cc0.mp3" },
] as const;
export type MusicStatus = "off" | "paused" | "loading" | "playing" | "blocked" | "error";
export interface MusicClip {
  loop: boolean; volume: number; preload: string;
  onerror: HTMLAudioElement["onerror"];
  play(): Promise<void>; pause(): void;
}
export class MusicPlayer {
  private clip?: MusicClip;
  private track = "";
  private preferences?: AudioPreferences;
  private hidden = false;
  private microphone = false;
  private ducked = false;
  private disposed = false;
  private status: MusicStatus = "off";
  private pending = false;
  private generation = 0;
  constructor(
    private create: (src: string) => MusicClip,
    private changed: (status: MusicStatus) => void,
  ) {}
  configure(preferences: AudioPreferences) {
    this.preferences = preferences;
    if (this.track !== preferences.track) {
      this.stop(); this.clip = undefined; this.track = preferences.track;
      this.emit("off");
    }
    this.sync();
  }
  setEnvironment(hidden: boolean, microphone: boolean, ducked: boolean) {
    this.hidden = hidden; this.microphone = microphone; this.ducked = ducked; this.sync();
  }
  private emit(status: MusicStatus) {
    if (this.status === status) return;
    this.status = status; this.changed(status);
  }
  private wanted() {
    return !this.disposed && this.preferences?.musicEnabled && this.preferences.musicVolume > 0 && !this.hidden && !this.microphone;
  }
  private stop() {
    this.generation++;
    if (this.clip) { this.clip.onerror = null; this.clip.pause(); }
    if (this.pending) this.clip = undefined;
    this.pending = false;
  }
  private sync() {
    if (!this.wanted()) {
      this.stop();
      this.emit(!this.preferences?.musicEnabled || this.preferences.musicVolume === 0 ? "off" : "paused"); return;
    }
    if (this.clip) this.clip.volume = this.preferences!.musicVolume * (this.ducked ? .18 : 1);
    if ((this.status === "playing" && this.clip) || this.pending) return;
    // Failed playback is retried only on an explicit gesture or a settings change.
    if (this.status === "blocked" || this.status === "error") return;
    this.start();
  }
  retry() {
    if (!this.wanted() || this.status === "playing" || this.pending) return;
    this.start();
  }
  private start() {
    if (!this.wanted()) return;
    try {
      this.clip ??= this.create(MUSIC_TRACKS.find(t => t.id === this.track)!.src);
      const clip = this.clip;
      clip.preload = "auto"; clip.loop = true;
      clip.volume = this.preferences!.musicVolume * (this.ducked ? .18 : 1);
      const generation = ++this.generation;
      const current = () => generation === this.generation && clip === this.clip && this.wanted();
      clip.onerror = () => {
        if (!current()) return;
        this.stop(); this.emit("error");
      };
      this.pending = true; this.emit("loading");
      Promise.resolve(clip.play()).then(() => {
        if (!current()) { clip.pause(); return; }
        this.pending = false; this.emit("playing");
      }, error => {
        if (!current()) return;
        this.pending = false; this.emit(error?.name === "NotAllowedError" ? "blocked" : "error");
      });
    } catch { this.pending = false; this.emit("error"); }
  }
  dispose() { this.disposed = true; this.stop(); this.emit("off"); }
}
