import { audioFocus } from "../../shared/audio/audio-focus";

export const QUIET_TRACKS = [
  { id: "moon", title: "月下琴声" }, { id: "bamboo", title: "竹影轻弦" }, { id: "cloud", title: "云海长音" },
] as const;
export type QuietTrack = typeof QUIET_TRACKS[number]["id"] | "off";
type Source = OscillatorNode | AudioBufferSourceNode;
// Original sparse phrases, several seconds between notes, without percussion.
const SCORES = {
  moon: { step: 2.8, notes: [60, 67, 72, 71, 64, 67, 69, 67, 57, 64, 69, 67, 53, 60, 65, 64], bass: [48, 52, 45, 41] },
  bamboo: { step: 3.2, notes: [62, 69, 74, 69, 66, 69, 73, 69, 59, 66, 71, 66, 57, 64, 69, 64], bass: [50, 54, 47, 45] },
  cloud: { step: 5.5, notes: [60, 64, 67, 71, 57, 60, 64, 67, 53, 57, 60, 64, 55, 59, 62, 67], bass: [48, 45, 41, 43] },
};
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Quiet local music and dry stone-on-board impacts; no network or audio files. */
export class GomokuAudio {
  private context: AudioContext | null = null;
  private effects = new Set<Source>();
  private music = new Set<Source>();
  private generation = 0;
  private track: QuietTrack = "off";
  private blocked = false;
  private unlocked = false;
  private disposed = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextNote = 0;
  private noteIndex = 0;
  constructor(private unavailable: () => void) {}
  unlock() {
    if (this.disposed || this.blocked) return;
    try {
      this.context ??= new AudioContext();
      const context = this.context;
      if (context.state === "running") { this.unlocked = true; this.startMusic(); return; }
      void context.resume().then(() => {
        if (this.disposed || this.blocked) return;
        this.unlocked = true; this.startMusic();
      }).catch(this.unavailable);
    } catch { this.unavailable(); }
  }
  configureMusic(track: QuietTrack) {
    if (track === this.track) return;
    this.stopMusic(); this.track = track; this.noteIndex = 0;
    this.startMusic();
  }
  setBlocked(blocked: boolean) {
    if (blocked === this.blocked) return;
    this.blocked = blocked;
    if (blocked) { this.stopEffects(); this.stopMusic(); }
    else this.startMusic();
  }
  private attach(source: Source, nodes: AudioNode[], pool: Set<Source>, start: number, duration: number) {
    pool.add(source);
    source.onended = () => { pool.delete(source); source.disconnect(); nodes.forEach(node => node.disconnect()); };
    source.start(start); source.stop(start + duration);
  }
  private stopPool(pool: Set<Source>) {
    for (const source of pool) { try { source.stop(); } catch { /* Already ended. */ } }
    pool.clear();
  }
  playStone(black: boolean) {
    if (this.disposed || this.blocked || document.hidden || audioFocus.isMicrophoneActive()) return;
    this.unlock();
    const context = this.context, generation = this.generation, requested = performance.now();
    if (!context) return;
    const play = () => {
      if (this.disposed || this.blocked || generation !== this.generation || context.state !== "running" || performance.now() - requested > 250) return;
      const start = context.currentTime, tone = black ? .98 : 1.02;
      // Broadband contact, followed by damped, inharmonic wooden board modes.
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .035), context.sampleRate);
      const data = buffer.getChannelData(0);
      let seed = black ? 71 : 137;
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 16807) % 2147483647;
        const t = i / context.sampleRate;
        data[i] = (seed / 1073741823.5 - 1) * Math.min(1, t / .0008) * Math.exp(-t / .005);
      }
      const noise = context.createBufferSource(), filter = context.createBiquadFilter(), contact = context.createGain();
      noise.buffer = buffer; filter.type = "lowpass"; filter.frequency.value = 4200; contact.gain.value = .25;
      noise.connect(filter); filter.connect(contact); contact.connect(context.destination);
      this.attach(noise, [filter, contact], this.effects, start, .04);
      [[680, .11, .045], [1170, .07, .032], [2130, .035, .019], [3460, .012, .012]].forEach(([frequency, volume, decay]) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.frequency.value = frequency * tone;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + .001);
        gain.gain.exponentialRampToValueAtTime(.0001, start + decay * 3);
        oscillator.connect(gain); gain.connect(context.destination);
        this.attach(oscillator, [gain], this.effects, start, decay * 3 + .01);
      });
    };
    if (context.state === "running") play();
    else void context.resume().then(play).catch(this.unavailable);
  }
  private musicNote(midi: number, start: number, bass = false) {
    const context = this.context!;
    const cloud = this.track === "cloud", bamboo = this.track === "bamboo";
    const duration = cloud ? 11 : bamboo ? 5.5 : 7, attack = cloud ? 2.2 : bamboo ? .025 : .065;
    const partials = cloud ? [1, 2] : bamboo ? [1, 2, 3, 4] : [1, 2, 3];
    partials.forEach((partial, i) => {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.frequency.value = hz(midi) * partial;
      const volume = (bass ? .018 : .027) / (partial * partial);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + attack);
      gain.gain.exponentialRampToValueAtTime(.00005, start + duration / (1 + i * .18));
      gain.gain.linearRampToValueAtTime(0, start + duration);
      oscillator.connect(gain); gain.connect(context.destination);
      this.attach(oscillator, [gain], this.music, start, duration + .02);
    });
  }
  private startMusic() {
    if (this.disposed || this.blocked || !this.unlocked || this.track === "off" || this.timer || this.context?.state !== "running") return;
    this.nextNote = this.context.currentTime + .08;
    const tick = () => {
      if (this.track === "off" || !this.context || this.blocked) return;
      if (document.hidden || audioFocus.isMicrophoneActive()) { this.stopMusic(); return; }
      const score = SCORES[this.track], now = this.context.currentTime;
      if (this.nextNote < now - .5) this.nextNote = now + .08;
      if (this.nextNote > now + .3) return;
      const n = this.noteIndex % score.notes.length;
      this.musicNote(score.notes[n], this.nextNote);
      if (n % 4 === 0) this.musicNote(score.bass[Math.floor(n / 4)], this.nextNote, true);
      this.noteIndex++; this.nextNote += score.step;
    };
    try { tick(); this.timer = setInterval(() => { try { tick(); } catch { this.stopMusic(); this.unavailable(); } }, 200); }
    catch { this.stopMusic(); this.unavailable(); }
  }
  stopEffects() { this.generation++; this.stopPool(this.effects); }
  private stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined; this.stopPool(this.music);
  }
  dispose() {
    this.disposed = true; this.stopEffects(); this.stopMusic();
    void this.context?.close().catch(() => {}); this.context = null;
  }
}
