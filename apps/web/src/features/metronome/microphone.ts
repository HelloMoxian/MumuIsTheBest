import type { PitchFrame } from "./humming";

/** Owns one microphone lease, worklet and worker. Late permissions never resurrect a stopped take. */
export class HumMicrophone {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private silent: GainNode | null = null;
  private worker: Worker | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stopped = false;
  private submitted = false;
  private lastFrame = 0;
  private watchdog: ReturnType<typeof setInterval> | undefined;
  constructor(private onFrame: (frame: PitchFrame) => void, private onError: (message: string) => void, private onOriginal: (blob: Blob) => void) {}
  async start(context: AudioContext) {
    if (!navigator.mediaDevices?.getUserMedia || !context.audioWorklet) throw new Error("哼唱需要支持麦克风的浏览器，请用本机 localhost 或 HTTPS 打开。");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (this.stopped) { stream.getTracks().forEach(t => t.stop()); return false; }
      this.stream = stream;
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== "live") throw new Error("麦克风没有声音，请检查设备后重试。");
      track.onended = () => this.fail("麦克风已断开，已识别的音符已保留。");
      this.worker = new Worker(new URL("./pitch-worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }: MessageEvent<PitchFrame>) => {
        this.submitted = false; this.lastFrame = performance.now();
        if (!this.stopped) this.onFrame(data);
      };
      this.worker.onerror = event => { event.preventDefault(); this.fail("音高识别暂时停止，已识别的音符已保留。请重试。"); };
      await context.audioWorklet.addModule(new URL("./capture-worklet.js", import.meta.url).href);
      if (this.stopped) return false;
      this.node = new AudioWorkletNode(context, "metronome-hum-capture");
      this.node.onprocessorerror = () => this.fail("录音暂时停止，已识别的音符已保留。请重试。");
      this.node.port.onmessage = ({ data }) => {
        // Backpressure: do not accumulate delayed audio after a stalled worker.
        if (this.stopped || this.submitted) return;
        this.submitted = true;
        this.worker!.postMessage(data, [data.samples.buffer]);
      };
      this.source = context.createMediaStreamSource(stream);
      this.silent = context.createGain(); this.silent.gain.value = 0;
      this.source.connect(this.node); this.node.connect(this.silent); this.silent.connect(context.destination);
      if (typeof MediaRecorder !== "undefined") {
        try {
          const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(t => MediaRecorder.isTypeSupported(t));
          this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
          this.recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
          this.recorder.onstop = () => {
            if (this.chunks.length) this.onOriginal(new Blob(this.chunks, { type: this.recorder?.mimeType || this.chunks[0].type }));
            this.chunks = [];
          };
          this.recorder.start();
        } catch { /* Original preview is optional; PCM transcription remains available. */ }
      }
      this.lastFrame = performance.now();
      this.watchdog = setInterval(() => {
        if (context.state !== "running" || performance.now() - this.lastFrame > 2500) this.fail("录音已暂停，已识别的音符已保留。请重试。");
      }, 500);
      return true;
    } catch (error) {
      this.stop();
      if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) throw new Error("麦克风还未授权。允许此网站使用麦克风后，可以再次哼唱。");
      if (error instanceof DOMException && ["NotFoundError", "NotReadableError"].includes(error.name)) throw new Error("暂时无法使用麦克风，请检查设备或关闭占用它的应用。");
      throw new Error("录音暂时无法启动，原作品已保留。请重试或换用支持麦克风的浏览器。");
    }
  }
  private fail(message: string) { if (!this.stopped) { this.stop(); this.onError(message); } }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.watchdog);
    if (this.recorder?.state === "recording") this.recorder.stop();
    if (this.stream) for (const track of this.stream.getTracks()) { track.onended = null; track.stop(); }
    this.node?.port.close(); this.source?.disconnect(); this.node?.disconnect(); this.silent?.disconnect(); this.worker?.terminate();
    this.stream = null; this.source = null; this.node = null; this.silent = null; this.worker = null;
  }
}
