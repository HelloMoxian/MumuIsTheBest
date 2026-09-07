import { audioFocus } from "../../shared/audio/audio-focus";
import { browserTts } from "../../shared/speech";
import { LatestMomentQueue } from "../../shared/speech/latest-moment-queue";

export type FatBurnAudioPhase = "warmup" | "workout" | "cooldown";
export const FAT_BURN_BPM: Readonly<Record<FatBurnAudioPhase, number>> = {
  warmup: 110,
  workout: 132,
  cooldown: 86,
};

type Instrument = "kick" | "snare" | "hat" | "bass" | "chord" | "arp";
export type FatBurnMusicNote = {
  instrument: Instrument;
  accent: number;
  midi?: number;
  beats?: number;
};
const CHORDS = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]] as const;

/** Original D-minor dance arrangement: sixteen steps per bar, thirty-two bars per phrase. */
export function fatBurnMusicStep(step: number, phase: FatBurnAudioPhase): FatBurnMusicNote[] {
  if (!Number.isSafeInteger(step) || step < 0) return [];
  const bar = Math.floor(step / 16) % 32;
  const tick = step % 16;
  const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length]!;
  const notes: FatBurnMusicNote[] = [];
  const gentle = phase === "cooldown";
  const energetic = phase === "workout";
  const breakdown = bar >= 12 && bar < 16 || bar >= 28 && bar < 30;
  const fill = bar % 8 === 7;

  if (tick % (gentle || breakdown ? 8 : 4) === 0) {
    notes.push({ instrument: "kick", accent: gentle ? 0.48 : energetic ? 1 : 0.76 });
  }
  if ((tick === 4 || tick === 12) && (!gentle || tick === 12)) {
    notes.push({ instrument: "snare", accent: gentle ? 0.24 : breakdown ? 0.4 : 0.75 });
  }
  if (tick % (gentle ? 8 : 2) === (gentle ? 4 : 0) || energetic && fill && tick >= 13) {
    notes.push({ instrument: "hat", accent: tick % 4 === 2 ? 0.72 : 0.4 });
  }
  const bassSteps = gentle ? [0, 8] : energetic && !breakdown ? [0, 3, 6, 8, 10, 14] : [0, 6, 8, 14];
  if (bassSteps.includes(tick)) {
    notes.push({
      instrument: "bass", midi: chord[0] - 12 + (tick === 14 && energetic ? 12 : 0),
      accent: gentle ? 0.55 : 0.85, beats: gentle ? 1.6 : 0.4,
    });
  }
  if (tick === 0 || !gentle && tick === 8) {
    chord.forEach(midi => notes.push({
      instrument: "chord", midi: midi + 12, accent: breakdown ? 0.8 : 0.56,
      beats: gentle ? 3.4 : 1.3,
    }));
  }
  if (!breakdown && (energetic && bar >= 4 ? tick % 4 === 2 : tick === 6 || tick === 14)) {
    notes.push({
      instrument: "arp", midi: chord[(Math.floor(tick / 2) + bar) % 3]! + 24,
      accent: gentle ? 0.45 : 0.68, beats: gentle ? 0.65 : 0.3,
    });
  }
  return notes;
}

type TrackedSource = {
  source: AudioScheduledSourceNode;
  chain: AudioNode[];
  endsAt: number;
};

/** Local synthesized music and shared browser narration; neither is enabled automatically. */
export class FatBurnAudio {
  private musicEnabled = false;
  private voiceEnabled = false;
  private running = false;
  private disposed = false;
  private phase: FatBurnAudioPhase = "warmup";
  private volume = 0.32;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sources = new Set<TrackedSource>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private step = 0;
  private nextStepAt = 0;
  private lastError = "";
  private queue: LatestMomentQueue<string>;
  private unsubscribers: (() => void)[];
  private readonly visibilityDocument = typeof document === "undefined" ? null : document;
  private readonly onHidden = () => {
    if (this.visibilityDocument?.hidden) this.setRunning(false);
  };
  private readonly onPageHide = () => this.setRunning(false);

  constructor(
    private readonly onError: (message: string) => void,
    private readonly createContext: () => AudioContext = () => new AudioContext(),
  ) {
    this.queue = new LatestMomentQueue({
      play: text => browserTts.speak({
        text, lang: "zh-CN", rate: 1.02, pitch: 1.04, volume: 0.9,
        preferLocalVoice: true, localOnly: true,
      }),
      stop: () => browserTts.stop(),
      pause: () => browserTts.pause(),
      resume: () => browserTts.resume(),
      busy: () => this.blocked() || !this.running || this.disposed,
      show: () => {},
      failed: () => this.report("鼓励语音暂时不可用，你可以继续看着提示运动。"),
    });
    this.queue.setEnabled(false);
    this.unsubscribers = [
      browserTts.subscribe(() => this.updateVolume()),
      audioFocus.subscribe(() => {
        if (this.blocked()) {
          this.queue.clear();
          this.stopMusic();
        } else {
          this.queue.wake();
          if (this.running && this.musicEnabled) void this.startMusic();
        }
      }),
    ];
    this.visibilityDocument?.addEventListener("visibilitychange", this.onHidden);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onPageHide);
  }

  /** Invoke directly from the music control so the browser can unlock its audio device. */
  async setMusic(enabled: boolean): Promise<void> {
    if (this.disposed) return;
    this.musicEnabled = enabled;
    if (!enabled) {
      this.stopMusic();
      return;
    }
    await this.startMusic(true);
  }

  setVoice(enabled: boolean) {
    if (this.disposed) return;
    this.voiceEnabled = enabled;
    this.queue.setEnabled(enabled);
  }

  setVolume(volume: number) {
    if (this.disposed || !Number.isFinite(volume)) return;
    this.volume = Math.min(1, Math.max(0, volume));
    this.updateVolume();
  }

  setPhase(phase: FatBurnAudioPhase) {
    if (this.disposed || this.phase === phase || !Object.hasOwn(FAT_BURN_BPM, phase)) return;
    this.phase = phase;
    this.step = 0;
    this.stopMusic();
    if (this.running && this.musicEnabled) void this.startMusic();
  }

  setRunning(running: boolean) {
    if (this.disposed) return;
    this.running = running && !this.visibilityDocument?.hidden;
    if (!this.running) {
      this.queue.clear();
      this.stopMusic();
    } else if (this.musicEnabled && this.timer === null) {
      void this.startMusic();
    }
  }

  speak(text: string) {
    if (this.disposed || !this.running || !this.voiceEnabled || this.blocked() || !text.trim()) return;
    this.queue.enqueue(text);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    this.queue.dispose();
    this.stopMusic();
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.visibilityDocument?.removeEventListener("visibilitychange", this.onHidden);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onPageHide);
    this.sources.forEach(source => this.releaseSource(source));
    this.master?.disconnect();
    const context = this.context;
    this.context = null;
    this.master = null;
    this.noise = null;
    if (context && context.state !== "closed") void context.close().catch(() => {});
  }

  private blocked() {
    return audioFocus.isMicrophoneActive() || audioFocus.isMusicActive() || Boolean(this.visibilityDocument?.hidden);
  }

  private canPlay() {
    return !this.disposed && this.running && this.musicEnabled && !this.blocked();
  }

  private async startMusic(unlockOnly = false) {
    if (this.disposed || !this.musicEnabled || this.blocked() || !this.running && !unlockOnly) return;
    if (this.timer !== null && this.context?.state === "running") return;
    const generation = ++this.generation;
    try {
      if (!this.context || this.context.state === "closed") {
        this.sources.forEach(source => this.releaseSource(source));
        this.master?.disconnect();
        this.context = this.createContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.context.destination);
        this.noise = null;
      }
      const context = this.context;
      await context.resume();
      if (generation !== this.generation || this.context !== context || !this.canPlay()) return;
      if (context.state !== "running") throw new Error("audio unavailable");
      this.lastError = "";
      this.nextStepAt = context.currentTime + 0.035;
      this.updateVolume();
      this.schedule();
      if (generation === this.generation && this.canPlay()) {
        this.timer = setInterval(() => this.schedule(), 25);
      }
    } catch {
      if (generation !== this.generation || this.disposed) return;
      this.stopMusic();
      this.report("音乐暂时没有播放成功，请再点一次音乐开关；运动可以继续。");
    }
  }

  private updateVolume() {
    const context = this.context;
    if (!context || context.state === "closed" || !this.master) return;
    const speech = browserTts.getSnapshot().status;
    const ducked = speech === "speaking" || speech === "loading";
    const target = this.canPlay() ? this.volume * 0.45 * (ducked ? 0.18 : 1) : 0;
    try {
      this.master.gain.cancelScheduledValues(context.currentTime);
      this.master.gain.setTargetAtTime(target, context.currentTime, ducked ? 0.035 : 0.12);
    } catch { /* Sound controls must never interrupt the workout. */ }
  }

  private schedule() {
    const context = this.context;
    if (!context || context.state !== "running" || !this.canPlay()) {
      this.stopMusic();
      return;
    }
    try {
      this.sources.forEach(source => {
        if (source.endsAt < context.currentTime) this.releaseSource(source);
      });
      if (this.nextStepAt < context.currentTime - 0.25) this.nextStepAt = context.currentTime + 0.035;
      const beatSeconds = 60 / FAT_BURN_BPM[this.phase];
      while (this.nextStepAt < context.currentTime + 0.16) {
        fatBurnMusicStep(this.step, this.phase).forEach(note => this.playNote(note, this.nextStepAt, beatSeconds));
        this.step = (this.step + 1) % 512;
        this.nextStepAt += beatSeconds / 4;
      }
    } catch {
      this.stopMusic();
      this.report("音乐暂时不可用，动作和计时会继续。你可以稍后重新开启音乐。");
    }
  }

  private playNote(note: FatBurnMusicNote, at: number, beatSeconds: number) {
    const context = this.context;
    if (!context || !this.master) return;
    const gain = context.createGain();
    const chain: AudioNode[] = [gain];
    let source: OscillatorNode | AudioBufferSourceNode;
    let duration: number;
    let amplitude: number;
    if (note.instrument === "hat" || note.instrument === "snare") {
      if (!this.noise) {
        this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.35), context.sampleRate);
        const data = this.noise.getChannelData(0);
        let seed = 3751;
        for (let i = 0; i < data.length; i++) {
          seed = Math.imul(seed, 1664525) + 1013904223 | 0;
          data[i] = (seed >>> 0) / 2147483648 - 1;
        }
      }
      source = context.createBufferSource();
      source.buffer = this.noise;
      const filter = context.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = note.instrument === "hat" ? 7200 : 1200;
      source.connect(filter).connect(gain);
      chain.push(filter);
      duration = note.instrument === "hat" ? 0.055 : 0.14;
      amplitude = note.instrument === "hat" ? 0.072 : 0.18;
    } else {
      source = context.createOscillator();
      source.frequency.value = 440 * 2 ** (((note.midi ?? 38) - 69) / 12);
      if (note.instrument === "kick") {
        source.type = "sine";
        source.frequency.setValueAtTime(142, at);
        source.frequency.exponentialRampToValueAtTime(46, at + 0.12);
        duration = 0.24;
        amplitude = 0.48;
      } else if (note.instrument === "bass") {
        source.type = "sawtooth";
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = this.phase === "cooldown" ? 240 : 520;
        filter.Q.value = 0.6;
        source.connect(filter).connect(gain);
        chain.push(filter);
        duration = (note.beats ?? 0.4) * beatSeconds;
        amplitude = 0.15;
      } else {
        source.type = note.instrument === "arp" ? "triangle" : "sine";
        duration = (note.beats ?? 1) * beatSeconds;
        amplitude = note.instrument === "arp" ? 0.073 : 0.058;
      }
      if (note.instrument !== "bass") source.connect(gain);
    }
    gain.connect(this.master);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(amplitude * note.accent, at + Math.min(0.012, duration * 0.12));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    const tracked: TrackedSource = { source, chain, endsAt: at + duration + 0.01 };
    this.sources.add(tracked);
    source.onended = () => this.releaseSource(tracked);
    source.start(at);
    source.stop(tracked.endsAt);
  }

  private stopMusic() {
    this.generation++;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const context = this.context;
    if (!context || context.state === "closed") {
      this.sources.forEach(source => this.releaseSource(source));
      return;
    }
    try {
      this.master?.gain.cancelScheduledValues(context.currentTime);
      this.master?.gain.setTargetAtTime(0, context.currentTime, 0.008);
    } catch { /* A detached device may no longer accept automation. */ }
    this.sources.forEach(source => {
      try { source.source.stop(context.currentTime + 0.035); } catch { this.releaseSource(source); }
      source.endsAt = context.currentTime + 0.035;
    });
  }

  private releaseSource(source: TrackedSource) {
    source.source.onended = null;
    try { source.source.disconnect(); } catch { /* Already disconnected. */ }
    source.chain.forEach(node => { try { node.disconnect(); } catch { /* Already disconnected. */ } });
    this.sources.delete(source);
  }

  private report(message: string) {
    if (this.disposed || message === this.lastError) return;
    this.lastError = message;
    try { this.onError(message); } catch { /* The page remains usable even if its error display fails. */ }
  }
}
