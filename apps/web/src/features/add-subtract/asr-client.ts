export type RecognitionState =
  | "connecting"
  | "listening"
  | "finishing"
  | "limited"
  | "stopped"
  | "error";

export const ASR_SESSION_LIMIT_MINUTES = 10;

export type RecognitionResult = {
  text: string;
  sentenceId: number;
  isFinal: boolean;
};

export type RecognitionHandlers = {
  onState: (state: RecognitionState, detail?: string) => void;
  onResult: (result: RecognitionResult) => void;
  onError: (message: string) => void;
};

class PcmCapture {
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private processor?: ScriptProcessorNode;
  private silentGain?: GainNode;
  private stream?: MediaStream;

  async start(onChunk: (chunk: ArrayBuffer) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    this.context = new AudioContext();
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.silentGain = this.context.createGain();
    this.silentGain.gain.value = 0;
    this.processor.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0);
      onChunk(toPcm16(samples, this.context?.sampleRate ?? 48_000, 16_000));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.context.destination);
    await this.context.resume();
  }

  async stop() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.silentGain?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    await this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.source = undefined;
    this.processor = undefined;
    this.silentGain = undefined;
    this.stream = undefined;
  }
}

function toPcm16(input: Float32Array, inputRate: number, targetRate: number): ArrayBuffer {
  const ratio = inputRate / targetRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Int16Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let total = 0;
    let count = 0;
    for (let sample = start; sample < end; sample += 1) {
      total += input[sample] ?? 0;
      count += 1;
    }
    const value = Math.max(-1, Math.min(1, count ? total / count : 0));
    output[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  return output.buffer;
}

function socketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/asr/stream`;
}

export class AsrRecognitionSession {
  private readonly capture = new PcmCapture();
  private readonly consumedFinals = new Set<string>();
  private socket?: WebSocket;
  private disposed = false;
  private captureStarted = false;
  private limited = false;

  constructor(private readonly handlers: RecognitionHandlers) {}

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.handlers.onError("这个浏览器无法使用麦克风，请使用现代浏览器并允许麦克风权限。");
      return;
    }

    this.handlers.onState("connecting", "正在建立安全的语音通道…");
    const socket = new WebSocket(socketUrl());
    this.socket = socket;

    socket.onopen = () => {
      if (!this.disposed) socket.send(JSON.stringify({ type: "start" }));
    };

    socket.onmessage = async (event) => {
      if (this.disposed) return;
      let message: {
        type?: string;
        label?: string;
        code?: string;
        message?: string;
        text?: string;
        sentenceId?: number;
        isFinal?: boolean;
      };
      try {
        message = JSON.parse(String(event.data)) as typeof message;
      } catch {
        this.handlers.onError("语音服务返回了无法理解的数据，请重新开始识别。");
        return;
      }

      if (message.type === "ready") {
        try {
          await this.capture.start((chunk) => {
            if (!this.disposed && socket.readyState === WebSocket.OPEN) socket.send(chunk);
          });
          this.captureStarted = true;
          this.handlers.onState("listening", "正在听你说话");
        } catch {
          this.handlers.onError("没有拿到麦克风权限，请在地址栏允许麦克风后再试。");
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop" }));
        }
        return;
      }

      if (message.type === "result") {
        const text = message.text?.trim() ?? "";
        if (!text) return;
        const sentenceId = message.sentenceId ?? -1;
        const isFinal = Boolean(message.isFinal);
        if (isFinal) {
          const fingerprint = `${sentenceId}:${text}`;
          if (this.consumedFinals.has(fingerprint)) return;
          this.consumedFinals.add(fingerprint);
        }
        this.handlers.onResult({ text, sentenceId, isFinal });
        return;
      }

      if (message.type === "limit") {
        this.limited = true;
        await this.stopCapture();
        this.handlers.onState(
          "limited",
          message.label ?? `本次识别已到 ${ASR_SESSION_LIMIT_MINUTES} 分钟上限`,
        );
        return;
      }

      if (message.type === "finished") {
        await this.stopCapture();
        if (!this.limited) this.handlers.onState("stopped", message.label ?? "识别已经结束");
        return;
      }

      if (message.type === "error") {
        await this.stopCapture();
        this.handlers.onError(message.message ?? "语音识别暂时没有连接成功，请再试一次。");
        return;
      }

      if (message.type === "status" && message.label) {
        this.handlers.onState("connecting", message.label);
      }
    };

    socket.onerror = () => {
      if (!this.disposed) this.handlers.onError("本机语音服务连接失败，请确认项目服务已经启动。");
    };
  }

  async stop() {
    if (this.disposed) return;
    this.disposed = true;
    this.handlers.onState("finishing", "正在结束这一段识别…");
    await this.stopCapture();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "stop" }));
    }
    window.setTimeout(() => this.socket?.close(), 120);
  }

  private async stopCapture() {
    if (!this.captureStarted) return;
    this.captureStarted = false;
    await this.capture.stop();
  }
}

export async function readAsrConfiguration() {
  const response = await fetch("/api/asr/config");
  if (!response.ok) throw new Error("无法读取本机 ASR 配置");
  return response.json() as Promise<{ isConfigured: boolean }>;
}
