import { racerSounds, type RacerThemeAssets } from "./assets";
import { audioFocus } from "../../shared/audio/audio-focus";

function makeAudio(url: string, loop = false) {
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.loop = loop;
  return audio;
}

export class RacerAudio {
  private enabled = false;
  private music?: HTMLAudioElement;
  private climaxMusic?: HTMLAudioElement;
  private readonly engine = makeAudio(racerSounds.engine, true);
  private readonly countdown = makeAudio(racerSounds.countdown);
  private checkpointIndex = 0;
  private finalLapPlayed = false;
  private crossfadeFrame = 0;
  private readonly releaseFocus = audioFocus.subscribe(() => this.syncMusicFocus());
  private syncMusicFocus() {
    const muted = audioFocus.isMusicActive() || audioFocus.isMicrophoneActive();
    if (this.music) this.music.muted = muted;
    if (this.climaxMusic) this.climaxMusic.muted = muted;
  }

  constructor() {
    this.engine.volume = 0.12;
    this.countdown.volume = 0.28;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stopLoops();
  }

  setTheme(theme: RacerThemeAssets) {
    const wasPlaying = Boolean(this.music && !this.music.paused);
    cancelAnimationFrame(this.crossfadeFrame);
    this.music?.pause();
    this.climaxMusic?.pause();
    this.music = makeAudio(theme.music, true);
    this.climaxMusic = makeAudio(theme.climaxMusic, true);
    this.music.volume = 0.2;
    this.climaxMusic.volume = 0.18;
    this.syncMusicFocus();
    this.checkpointIndex = 0;
    this.finalLapPlayed = false;
    if (this.enabled && wasPlaying) void this.music.play().catch(() => undefined);
  }

  startLoops() {
    if (!this.enabled) return;
    const activeMusic = this.finalLapPlayed ? this.climaxMusic : this.music;
    void activeMusic?.play().catch(() => undefined);
    void this.engine.play().catch(() => undefined);
  }

  updateSpeed(speed: number) {
    this.engine.playbackRate = Math.max(0.78, Math.min(1.48, 0.7 + speed / 85));
    this.engine.volume = Math.max(0.08, Math.min(0.2, 0.07 + speed / 500));
  }

  updateProgress(progress: number) {
    const nextCheckpoint = Math.min(3, Math.floor(progress * 4));
    if (nextCheckpoint > this.checkpointIndex && progress < 0.85) {
      this.checkpointIndex = nextCheckpoint;
      this.playOne(racerSounds.checkpoint, 0.18, 0.96 + nextCheckpoint * 0.04);
    }
    if (progress >= 0.85 && !this.finalLapPlayed) {
      this.finalLapPlayed = true;
      this.playOne(racerSounds.finalLap, 0.22);
      if (this.enabled && this.climaxMusic) {
        this.crossfadeToClimax();
      }
    }
  }

  playCountdown() {
    if (!this.enabled) return;
    this.countdown.currentTime = 0;
    void this.countdown.play().catch(() => undefined);
  }

  playStartGrid() {
    this.playOne(racerSounds.startGrid, 0.22);
  }

  lane(direction: -1 | 1) {
    this.playOne(direction < 0 ? racerSounds.lane : racerSounds.laneAlt, 0.22, direction < 0 ? 0.96 : 1.04);
  }

  collision(index: number) {
    this.playOne(racerSounds.collision, 0.32, [0.92, 1, 1.08][index % 3]);
  }

  finish(reachedTarget: boolean) {
    this.stopLoops();
    this.playOne(reachedTarget ? racerSounds.finish : racerSounds.finishGentle, 0.32);
  }

  reward() {
    this.playOne(racerSounds.reward, 0.28);
  }

  stopLoops() {
    cancelAnimationFrame(this.crossfadeFrame);
    this.music?.pause();
    this.climaxMusic?.pause();
    if (this.music) this.music.volume = 0.2;
    if (this.climaxMusic) this.climaxMusic.volume = 0.18;
    this.engine.pause();
  }

  dispose() {
    this.releaseFocus();
    this.stopLoops();
    this.countdown.pause();
  }

  private playOne(url: string, volume: number, playbackRate = 1) {
    if (!this.enabled) return;
    const sound = makeAudio(url);
    sound.volume = volume;
    sound.playbackRate = playbackRate;
    void sound.play().catch(() => undefined);
  }

  private crossfadeToClimax() {
    const normal = this.music;
    const climax = this.climaxMusic;
    if (!normal || !climax) return;
    const startedAt = performance.now();
    climax.volume = 0;
    void climax.play().catch(() => undefined);
    const fade = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 900);
      const eased = progress * progress * (3 - 2 * progress);
      normal.volume = 0.2 * (1 - eased);
      climax.volume = 0.18 * eased;
      if (progress < 1) {
        this.crossfadeFrame = requestAnimationFrame(fade);
      } else {
        normal.pause();
        normal.volume = 0.2;
      }
    };
    cancelAnimationFrame(this.crossfadeFrame);
    this.crossfadeFrame = requestAnimationFrame(fade);
  }
}
