import type { Frame } from "../../../../server/src/bejeweled-engine";
export type GemSound = "select" | "swap" | "return" | "clear" | "cascade" | "flame" | "star" | "cube" | "land";
const NAMES: GemSound[] = ["select", "swap", "return", "clear", "cascade", "flame", "star", "cube", "land"];
export function frameSound(frame: Frame): GemSound | null {
  if (frame.phase === "swap") return "swap";
  if (frame.phase !== "clear") return null;
  if (frame.blasts?.some(blast => blast.kind === "cube")) return "cube";
  if (frame.blasts?.some(blast => blast.kind === "star" || blast.kind === "nova")) return "star";
  if (frame.blasts?.some(blast => blast.kind === "flame")) return "flame";
  return frame.cascade > 1 ? "cascade" : "clear";
}
/** Decoded local samples, bounded polyphony; late loads never play stale actions. */
export class GemAudio {
  private context: AudioContext | null = null;
  private buffers = new Map<GemSound, AudioBuffer>();
  private active = new Set<AudioBufferSourceNode>();
  private enabled = false;
  private stopped = false;
  private volume = .55;
  private disposed = false;
  private loading?: Promise<void>;
  private requests = new AbortController();
  private last = new Map<GemSound, number>();
  constructor(
    private unavailable: () => void = () => {},
    private createContext: () => AudioContext = () => new AudioContext(),
    private fetchSample: typeof fetch = (...args) => fetch(...args),
  ) {}
  prepare() {
    if (this.disposed) return;
    try { this.context ??= this.createContext(); this.loading ??= this.load(); }
    catch { this.unavailable(); }
  }
  configure(enabled: boolean, volume: number) {
    this.enabled = enabled; this.volume = Math.max(0, Math.min(1, volume));
    if (!enabled || !volume) this.stop();
  }
  setStopped(stopped: boolean) { this.stopped = stopped; if (stopped) this.stop(); }
  unlock() {
    if (this.disposed || !this.enabled || this.stopped) return;
    try {
      this.prepare();
      if (!this.context) return;
      void this.context.resume().catch(() => this.unavailable());
    } catch { this.unavailable(); }
  }
  private async load() {
    const context = this.context!;
    const results = await Promise.allSettled(NAMES.map(async name => {
      const response = await this.fetchSample("/audio/bejeweled/" + name + ".wav", { signal: this.requests.signal });
      if (!response.ok) throw new Error("Audio unavailable");
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (!this.disposed) this.buffers.set(name, buffer);
    }));
    if (!this.disposed && results.some(result => result.status === "rejected")) {
      this.loading = undefined; this.unavailable();
    }
  }
  play(name: GemSound, cascade = 1) {
    if (!this.enabled || !this.volume || this.stopped || this.disposed) return;
    this.unlock();
    const context = this.context, buffer = this.buffers.get(name);
    if (!context || context.state !== "running" || !buffer) return;
    const now = context.currentTime;
    if (now - (this.last.get(name) ?? -Infinity) < .055) return;
    this.last.set(name, now);
    if (this.active.size >= 8) {
      const oldest = this.active.values().next().value!;
      this.active.delete(oldest); oldest.stop();
    }
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = ["clear", "cascade", "star", "cube"].includes(name) ? Math.min(1.5, 1 + (cascade - 1) * .045) : 1;
    gain.gain.value = this.volume * (["select", "swap", "return", "land"].includes(name) ? .55 : .8);
    source.connect(gain); gain.connect(context.destination);
    this.active.add(source);
    source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect(); };
    try { source.start(); } catch { this.active.delete(source); source.disconnect(); gain.disconnect(); }
  }
  stop() {
    for (const source of this.active) { try { source.stop(); } catch { /* Already ended. */ } }
    this.active.clear(); this.last.clear();
  }
  dispose() {
    this.disposed = true; this.stop(); this.requests.abort();
    void this.context?.close().catch(() => undefined); this.context = null; this.buffers.clear();
  }
}
