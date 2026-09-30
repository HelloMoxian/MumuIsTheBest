import { bankName, getInstrument, pitchesForKey, type Instrument } from "./catalog";
import { eventsBetween, projectTicks, TICKS, type ClickLevel, type MusicProject, type MusicTrack, type ScheduledEvent } from "./logic";
type ZoneData = { keyRangeLow: number; keyRangeHigh: number; originalPitch: number; coarseTune: number; fineTune: number; sampleRate: number; loopStart: number; loopEnd: number; file: string };
type Zone = Omit<ZoneData, "file"> & { buffer: AudioBuffer };
export type Voice = { release: (when?: number) => void; stop: (when?: number) => void };
type SampleOptions = { sustained?: boolean; duration?: number; releaseSeconds?: number; decaySeconds?: number; owner?: string };
const silent: Voice = { release() {}, stop() {} };
const MAX_TAIL_SECONDS = 6;
// Preserve the old low setting. High has roughly the default piano's attack energy
// over 50 ms; the short click needs a larger peak than a sustained piano sample.
const CLICK_PEAKS = { off: [0, 0], low: [.11, .18], medium: [.33, .45], high: [.72, .95] } as const;
function decaySeconds(instrument: Instrument, pitch: number) {
  const base = ["piano", "electric-piano"].includes(instrument.id) ? 4
    : ["harp", "vibraphone", "glockenspiel", "music-box"].includes(instrument.id) ? 4.5
      : instrument.family === "拨弦" ? 2.8 : instrument.family === "低音" ? 2 : 2.5;
  return Math.min(MAX_TAIL_SECONDS, Math.max(.8, base * 2 ** ((60 - pitch) / 48)));
}
export function selectSampleZone<T extends { keyRangeLow: number; keyRangeHigh: number }>(zones: T[], pitch: number, drums = false): T | undefined {
  const exact = zones.find(z => pitch >= z.keyRangeLow && pitch <= z.keyRangeHigh);
  if (exact || drums) return exact;
  // Some source banks leave isolated keys or their top octave unmapped.
  // Transpose the nearest recorded sample; never silently drop a playable key.
  return [...zones].sort((a, b) =>
    Math.max(a.keyRangeLow - pitch, pitch - a.keyRangeHigh, 0) - Math.max(b.keyRangeLow - pitch, pitch - b.keyRangeHigh, 0))[0];
}
export function parseBank(value: unknown): ZoneData[] {
  const bank = value as { schemaVersion?: unknown; zones?: unknown } | null;
  if (bank?.schemaVersion !== 1 || !Array.isArray(bank.zones) || !bank.zones.length || bank.zones.length > 256) throw new Error("音色文件不完整，请重试。");
  return bank.zones.map(raw => {
    const z = raw as ZoneData;
    if (!z || typeof z.file !== "string" || z.file.length < 100 || z.file.length > 8_000_000 || !/^[A-Za-z0-9+/=]+$/.test(z.file)
      || !["keyRangeLow", "keyRangeHigh", "originalPitch", "coarseTune", "fineTune", "sampleRate", "loopStart", "loopEnd"]
        .every(k => typeof z[k as keyof ZoneData] === "number" && Number.isFinite(z[k as keyof ZoneData]))
      || z.keyRangeLow < 0 || z.keyRangeHigh > 127 || z.keyRangeHigh < z.keyRangeLow
      || z.sampleRate < 8000 || z.sampleRate > 96000 || Math.abs(z.coarseTune) > 120 || Math.abs(z.fineTune) > 1200
      || z.originalPitch < 0 || z.originalPitch > 12700
      || ((z.loopStart < 0 || z.loopEnd < 0) && !(z.loopStart === -1 && z.loopEnd === -2))) throw new Error("音色文件不完整，请重试。");
    // FluidR3 marks a sample without a sustain loop with this exact sentinel.
    return z.loopStart === -1 ? { ...z, loopStart: 0, loopEnd: 0 } : z;
  });
}
export class MusicAudio {
  private context: BaseAudioContext | null;
  private master: GainNode | null = null;
  private banks = new Map<string, Zone[]>();
  private loading = new Map<string, Promise<void>>();
  private voices = new Set<Voice>();
  private pitchedVoices = new Map<string, Set<{ start: number; voice: Voice }>>();
  private disposed = false;
  constructor(context?: BaseAudioContext, banks?: Map<string, Zone[]>) {
    this.context = context ?? null;
    if (banks) this.banks = banks;
    if (context) this.connect();
  }
  get now() { return this.context?.currentTime ?? 0; }
  private connect() {
    const context = this.context!;
    this.master = context.createGain(); this.master.gain.value = .75;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -9; limiter.knee.value = 12; limiter.ratio.value = 12;
    limiter.attack.value = .003; limiter.release.value = .12;
    this.master.connect(limiter); limiter.connect(context.destination);
  }
  async unlock() {
    if (this.disposed) throw new Error("请重新打开节拍器。");
    if (!this.context) { this.context = new AudioContext({ latencyHint: "interactive" }); this.connect(); }
    if (this.context instanceof AudioContext && this.context.state === "suspended") await this.context.resume();
    if (this.disposed || this.context.state === "closed") throw new Error("声音已停止，请重试。");
  }
  setVolume(volume: number) { this.master?.gain.setTargetAtTime(volume, this.now, .02); }
  private load(name: string): Promise<void> {
    if (this.banks.has(name)) return Promise.resolve();
    const current = this.loading.get(name); if (current) return current;
    const operation = (async () => {
      const response = await fetch("/audio/metronome/" + name + ".json");
      if (!response.ok) throw new Error("音色暂时无法加载，请重试。");
      const zones = parseBank(await response.json());
      const decoded = await Promise.all(zones.map(async ({ file, ...zone }) => {
        const bytes = Uint8Array.from(atob(file), character => character.charCodeAt(0));
        const buffer = await this.context!.decodeAudioData(bytes.buffer);
        return { ...zone, buffer };
      }));
      if (!this.disposed) this.banks.set(name, decoded);
    })().finally(() => this.loading.delete(name));
    this.loading.set(name, operation);
    return operation;
  }
  async prepare(project: MusicProject, extra?: Instrument) {
    await this.unlock();
    const names = new Set(project.tracks.map(t => bankName(getInstrument(t.instrument))));
    if (project.backing) names.add("drums");
    if (extra) names.add(bankName(extra));
    await Promise.all([...names].map(name => this.load(name)));
  }
  async prepareInstrument(instrument: Instrument) { await this.unlock(); await this.load(bankName(instrument)); }
  ready(instrument: Instrument) { return this.banks.has(bankName(instrument)); }
  private sample(name: string, pitch: number, when: number, velocity: number, options: SampleOptions = {}): Voice {
    if (!this.context || !this.master || this.disposed) return silent;
    const zone = selectSampleZone(this.banks.get(name) ?? [], pitch, name === "drums");
    if (!zone) return silent;
    const { sustained = false, duration, releaseSeconds = .35, owner } = options;
    const context = this.context, source = context.createBufferSource(), gain = context.createGain(), cutoff = context.createGain();
    const start = Math.max(when, context.currentTime);
    const rate = 2 ** ((pitch * 100 - zone.originalPitch + zone.coarseTune * 100 + zone.fineTune) / 1200);
    source.buffer = zone.buffer; source.playbackRate.value = rate;
    const loopStart = zone.loopStart / zone.sampleRate, loopEnd = zone.loopEnd / zone.sampleRate;
    if ((sustained || options.decaySeconds !== undefined) && loopEnd > loopStart && loopEnd <= zone.buffer.duration) {
      source.loop = true; source.loopStart = loopStart; source.loopEnd = loopEnd;
    }
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(Math.max(.001, velocity) * .58, start + .004);
    source.connect(gain); gain.connect(cutoff); cutoff.connect(this.master);
    // Many SoundFont struck tones store only attack + loop, not a complete ringing tail.
    // Reconstruct a finite decay using that loop rather than cutting at the sample boundary.
    const decay = source.loop && !sustained ? options.decaySeconds : undefined;
    if (decay !== undefined) {
      gain.gain.setTargetAtTime(0, start + .02, (decay - .02) / 6);
      gain.gain.setValueAtTime(0, start + decay);
    }
    const natural = decay ?? (source.loop ? 60 : zone.buffer.duration / rate);
    let end = start + Math.min(60, natural) + .01, releasedAt = Infinity, cutoffAt = Infinity;
    const endBy = (time: number) => {
      end = Math.min(end, time);
      try { source.stop(end); } catch { /* Already ended naturally. */ }
    };
    const voice: Voice = {
      release: (time = context.currentTime) => {
        // Struck/plucked tones decay independently of key-up.
        if (!sustained) return;
        const at = Math.max(time, context.currentTime, start + .004);
        if (at >= releasedAt) return;
        releasedAt = at;
        gain.gain.cancelAndHoldAtTime(at);
        gain.gain.setTargetAtTime(0, at, releaseSeconds / 6);
        gain.gain.setValueAtTime(0, at + releaseSeconds);
        endBy(at + releaseSeconds + .005);
      },
      stop: (time = context.currentTime) => {
        const at = Math.max(time, context.currentTime);
        if (at >= cutoffAt) return;
        cutoffAt = at;
        // Independent cutoff also stops an already-released or future-scheduled voice.
        cutoff.gain.cancelAndHoldAtTime(at);
        cutoff.gain.linearRampToValueAtTime(0, at + .025);
        endBy(at + .03);
      },
    };
    const entry = { start, voice };
    const siblings = owner ? this.pitchedVoices.get(owner) ?? new Set<typeof entry>() : undefined;
    source.onended = () => {
      this.voices.delete(voice); source.disconnect(); gain.disconnect(); cutoff.disconnect();
      siblings?.delete(entry);
      if (owner && !siblings?.size && this.pitchedVoices.get(owner) === siblings) this.pitchedVoices.delete(owner);
    };
    source.start(start); endBy(end);
    if (duration !== undefined) voice.release(start + Math.max(.04, duration));
    if (siblings && owner) {
      let next = Infinity;
      for (const previous of siblings) {
        if (previous.start <= start) previous.voice.stop(start);
        else next = Math.min(next, previous.start);
      }
      if (Number.isFinite(next)) voice.stop(next);
      siblings.add(entry); this.pitchedVoices.set(owner, siblings);
    }
    this.voices.add(voice);
    if (typeof AudioContext !== "undefined" && this.context instanceof AudioContext && this.voices.size > 192) { const oldest = this.voices.values().next().value; oldest?.stop(); this.voices.delete(oldest!); }
    return voice;
  }
  playKey(track: MusicTrack, project: MusicProject, key: number, when = this.now, duration?: number, velocity = .8): Voice {
    const instrument = getInstrument(track.instrument), pitches = pitchesForKey(track, project, key);
    const voices = pitches.map((pitch, index) =>
      this.sample(bankName(instrument), pitch, when + (instrument.family === "拨弦" ? index * .018 : 0),
        velocity * track.volume / Math.sqrt(pitches.length), {
          sustained: instrument.sustain, duration,
          decaySeconds: instrument.sustain || instrument.drums ? undefined : decaySeconds(instrument, pitch),
          releaseSeconds: instrument.family === "拉弦" ? .5 : instrument.family === "管乐" ? .4 : .3,
          owner: track.id + ":" + instrument.id + ":" + pitch,
        }));
    return { release: time => voices.forEach(v => v.release(time)), stop: time => voices.forEach(v => v.stop(time)) };
  }
  click(when: number, accent: boolean, level: ClickLevel) {
    if (!this.context || !this.master || this.disposed || level === "off") return;
    const context = this.context, source = context.createOscillator(), gain = context.createGain(), start = Math.max(when, context.currentTime);
    source.frequency.value = accent ? 1500 : 1000; source.type = "sine";
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(CLICK_PEAKS[level][accent ? 1 : 0], start + .001);
    gain.gain.exponentialRampToValueAtTime(.0001, start + .025);
    source.connect(gain); gain.connect(this.master);
    const voice: Voice = { release() {}, stop: () => { try { source.stop(); } catch { /* ended */ } } };
    this.voices.add(voice);
    source.onended = () => { this.voices.delete(voice); source.disconnect(); gain.disconnect(); };
    source.start(start); source.stop(start + .03);
  }
  schedule(event: ScheduledEvent, when: number, secondsPerTick: number, project: MusicProject) {
    if (event.kind === "click") this.click(when, event.accent, project.click);
    else if (event.kind === "drum") this.sample("drums", event.pitch, when, event.velocity * .5);
    else this.playKey(event.track, project, event.note.key, when, event.note.duration * secondsPerTick, event.note.velocity);
  }
  stopAll() { [...this.voices].forEach(v => v.stop()); this.voices.clear(); this.pitchedVoices.clear(); }
  async exportWav(project: MusicProject, repeats: number): Promise<Blob> {
    await this.prepare(project);
    const secondsPerTick = 60 / project.bpm / TICKS, end = projectTicks(project) * repeats;
    const duration = end * secondsPerTick + MAX_TAIL_SECONDS;
    if (duration > 180) throw new Error("这首已经很长了，请少重复几遍再导出。");
    const offline = new OfflineAudioContext(2, Math.ceil(duration * 44100), 44100);
    const renderer = new MusicAudio(offline, this.banks);
    renderer.setVolume(project.volume);
    for (const event of eventsBetween(project, 0, end, { export: true })) renderer.schedule(event, event.tick * secondsPerTick, secondsPerTick, project);
    const buffer = await offline.startRendering();
    return encodeWav(buffer);
  }
  dispose() {
    this.disposed = true; this.stopAll(); this.banks.clear();
    if (this.context instanceof AudioContext && this.context.state !== "closed") void this.context.close();
  }
}
export function encodeWav(buffer: Pick<AudioBuffer, "numberOfChannels" | "length" | "sampleRate" | "getChannelData">): Blob {
  const channels = buffer.numberOfChannels, size = buffer.length * channels * 2;
  const bytes = new ArrayBuffer(44 + size), view = new DataView(bytes);
  const text = (at: number, value: string) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + size, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, size, true);
  const data = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  for (let frame = 0; frame < buffer.length; frame++) for (let channel = 0; channel < channels; channel++) {
    const sample = Math.max(-1, Math.min(1, data[channel][frame]));
    view.setInt16(44 + (frame * channels + channel) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}
