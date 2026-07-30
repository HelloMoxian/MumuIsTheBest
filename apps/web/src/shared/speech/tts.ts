export type TtsStatus =
  | "idle"
  | "loading"
  | "speaking"
  | "paused"
  | "unavailable"
  | "error";

export type TtsResultStatus =
  | "completed"
  | "cancelled"
  | "empty"
  | "unavailable"
  | "error";

export type TtsErrorCode =
  | "audio-busy"
  | "audio-hardware"
  | "network"
  | "synthesis-unavailable"
  | "synthesis-failed"
  | "language-unavailable"
  | "voice-unavailable"
  | "text-too-long"
  | "invalid-argument"
  | "not-allowed"
  | "timeout"
  | "unknown";

export type TtsError = {
  code: TtsErrorCode;
  message: string;
};

export type TtsState = {
  status: TtsStatus;
  supported: boolean;
  text: string;
  segmentIndex: number;
  segmentCount: number;
  error: TtsError | null;
};

export type TtsResult = {
  status: TtsResultStatus;
  error?: TtsError;
};

export type TtsSegment = {
  text: string;
  index: number;
  count: number;
};

export type SpeakOptions = {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceURI?: string;
  preferLocalVoice?: boolean;
  localOnly?: boolean;
  maxSegmentLength?: number;
  onSegmentStart?: (segment: TtsSegment) => void;
};

export type SpeechVoiceLike = {
  default: boolean;
  lang: string;
  localService: boolean;
  name: string;
  voiceURI: string;
};

type SpeechErrorEventLike = {
  error?: string;
};

export type SpeechUtteranceLike = {
  lang: string;
  pitch: number;
  rate: number;
  text: string;
  voice: SpeechVoiceLike | null;
  volume: number;
  onend: (() => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onstart: (() => void) | null;
};

export type SpeechSynthesisAdapter = {
  cancel(): void;
  getVoices(): SpeechVoiceLike[];
  pause(): void;
  resume(): void;
  speak(utterance: SpeechUtteranceLike): void;
  addEventListener?(type: "voiceschanged", listener: () => void): void;
  removeEventListener?(type: "voiceschanged", listener: () => void): void;
};

type ActiveSpeech = {
  id: number;
  options: Required<
    Pick<
      SpeakOptions,
      | "lang"
      | "rate"
      | "pitch"
      | "volume"
      | "preferLocalVoice"
      | "localOnly"
      | "maxSegmentLength"
    >
  > &
    Pick<SpeakOptions, "voiceURI" | "onSegmentStart">;
  resolve: (result: TtsResult) => void;
  segments: string[];
};

const DEFAULT_LANG = "zh-CN";
const DEFAULT_MAX_SEGMENT_LENGTH = 120;
const INITIAL_STATE: TtsState = {
  status: "idle",
  supported: true,
  text: "",
  segmentIndex: 0,
  segmentCount: 0,
  error: null,
};

const ERROR_MESSAGES: Record<TtsErrorCode, string> = {
  "audio-busy": "扬声器正在被其他应用使用，请稍后再试。",
  "audio-hardware": "当前设备没有可用的声音输出。",
  network: "朗读声音暂时没有连接成功，请检查网络。",
  "synthesis-unavailable": "当前设备暂时没有可用的朗读引擎。",
  "synthesis-failed": "这段内容暂时没有读出来，请再试一次。",
  "language-unavailable": "当前设备还没有安装这种语言的声音。",
  "voice-unavailable": "刚才选择的声音现在不可用，请换一个声音。",
  "text-too-long": "这段内容太长了，请分段朗读。",
  "invalid-argument": "朗读设置暂时不可用，请恢复默认设置。",
  "not-allowed": "浏览器需要先由你点击朗读按钮，才能播放声音。",
  timeout: "朗读等待时间过长，已经安全停止。",
  unknown: "这段内容暂时没有读出来，请再试一次。",
};

function clamp(value: number | undefined, minimum: number, maximum: number, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeLanguage(language: string) {
  return language.trim().toLowerCase().replaceAll("_", "-");
}

function splitLongSegment(segment: string, maximumLength: number): string[] {
  const result: string[] = [];
  let remaining = segment.trim();

  while (remaining.length > maximumLength) {
    const candidate = remaining.slice(0, maximumLength + 1);
    const minimumPreferredBreak = Math.floor(maximumLength * 0.45);
    const punctuationBreaks = ["，", ",", "、", "：", ":"]
      .map((punctuation) => candidate.lastIndexOf(punctuation))
      .filter((index) => index >= minimumPreferredBreak);
    const breakAt = punctuationBreaks.length > 0 ? Math.max(...punctuationBreaks) + 1 : maximumLength;

    result.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }

  if (remaining) result.push(remaining);
  return result;
}

export function segmentSpeechText(
  text: string,
  maximumLength = DEFAULT_MAX_SEGMENT_LENGTH,
): string[] {
  const safeMaximumLength = Math.round(clamp(maximumLength, 20, 500, DEFAULT_MAX_SEGMENT_LENGTH));
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (!normalized) return [];

  const sentences =
    normalized.match(/[^\n。！？!?；;]+(?:[。！？!?；;]+|(?=\n|$))/g)?.map((sentence) => sentence.trim()) ??
    [];

  return sentences.flatMap((sentence) => splitLongSegment(sentence, safeMaximumLength));
}

export function selectSpeechVoice(
  voices: readonly SpeechVoiceLike[],
  language: string,
  options: Pick<SpeakOptions, "voiceURI" | "preferLocalVoice" | "localOnly"> = {},
): SpeechVoiceLike | null {
  if (options.voiceURI) {
    const explicitVoice = voices.find((voice) => voice.voiceURI === options.voiceURI);
    if (explicitVoice && (!options.localOnly || explicitVoice.localService)) return explicitVoice;
  }

  const normalizedLanguage = normalizeLanguage(language);
  const baseLanguage = normalizedLanguage.split("-")[0];
  const compatibleVoices = voices.filter((voice) => {
    const voiceLanguage = normalizeLanguage(voice.lang);
    const languageMatches =
      voiceLanguage === normalizedLanguage || voiceLanguage.split("-")[0] === baseLanguage;
    return languageMatches && (!options.localOnly || voice.localService);
  });

  if (compatibleVoices.length === 0) return null;

  return [...compatibleVoices].sort((left, right) => {
    const leftLanguage = normalizeLanguage(left.lang);
    const rightLanguage = normalizeLanguage(right.lang);
    const leftScore =
      (leftLanguage === normalizedLanguage ? 8 : 0) +
      (options.preferLocalVoice !== false && left.localService ? 4 : 0) +
      (left.default ? 2 : 0);
    const rightScore =
      (rightLanguage === normalizedLanguage ? 8 : 0) +
      (options.preferLocalVoice !== false && right.localService ? 4 : 0) +
      (right.default ? 2 : 0);
    return rightScore - leftScore || left.name.localeCompare(right.name);
  })[0]!;
}

function normalizeErrorCode(error: string | undefined): TtsErrorCode {
  if (
    error === "audio-busy" ||
    error === "audio-hardware" ||
    error === "network" ||
    error === "synthesis-unavailable" ||
    error === "synthesis-failed" ||
    error === "language-unavailable" ||
    error === "voice-unavailable" ||
    error === "text-too-long" ||
    error === "invalid-argument" ||
    error === "not-allowed"
  ) {
    return error;
  }
  return "unknown";
}

function createBrowserAdapter(): {
  adapter: SpeechSynthesisAdapter;
  createUtterance: (text: string) => SpeechUtteranceLike;
} | null {
  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    return null;
  }

  const synthesis = window.speechSynthesis;
  return {
    adapter: {
      cancel: () => synthesis.cancel(),
      getVoices: () => synthesis.getVoices(),
      pause: () => synthesis.pause(),
      resume: () => synthesis.resume(),
      speak: (utterance) => synthesis.speak(utterance as SpeechSynthesisUtterance),
      addEventListener: (type, listener) => synthesis.addEventListener(type, listener),
      removeEventListener: (type, listener) => synthesis.removeEventListener(type, listener),
    },
    createUtterance: (text) =>
      new SpeechSynthesisUtterance(text) as unknown as SpeechUtteranceLike,
  };
}

export class BrowserTtsService {
  private readonly adapter: SpeechSynthesisAdapter | null;
  private readonly createUtterance: ((text: string) => SpeechUtteranceLike) | null;
  private readonly listeners = new Set<() => void>();
  private readonly onVoicesChanged = () => {
    this.voices = this.adapter?.getVoices() ?? [];
    this.updateState({ ...this.state });
  };
  private active: ActiveSpeech | null = null;
  private sequence = 0;
  private state: TtsState;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private voices: SpeechVoiceLike[] = [];

  constructor(
    adapter?: SpeechSynthesisAdapter | null,
    createUtterance?: ((text: string) => SpeechUtteranceLike) | null,
  ) {
    const browser = adapter === undefined && createUtterance === undefined ? createBrowserAdapter() : null;
    this.adapter = adapter === undefined ? (browser?.adapter ?? null) : adapter;
    this.createUtterance =
      createUtterance === undefined ? (browser?.createUtterance ?? null) : createUtterance;
    const supported = this.adapter !== null && this.createUtterance !== null;
    this.state = supported
      ? INITIAL_STATE
      : { ...INITIAL_STATE, status: "unavailable", supported: false };

    if (supported) {
      this.voices = this.adapter?.getVoices() ?? [];
      this.adapter?.addEventListener?.("voiceschanged", this.onVoicesChanged);
    }
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.state;

  readonly getAvailableVoices = (language?: string) => {
    this.voices = this.adapter?.getVoices() ?? this.voices;
    if (!language) return [...this.voices];
    const baseLanguage = normalizeLanguage(language).split("-")[0];
    return this.voices.filter(
      (voice) => normalizeLanguage(voice.lang).split("-")[0] === baseLanguage,
    );
  };

  readonly speak = (options: SpeakOptions): Promise<TtsResult> => {
    const segments = segmentSpeechText(options.text, options.maxSegmentLength);
    if (segments.length === 0) {
      this.stop();
      return Promise.resolve({ status: "empty" });
    }
    if (!this.adapter || !this.createUtterance) {
      const error: TtsError = {
        code: "synthesis-unavailable",
        message: ERROR_MESSAGES["synthesis-unavailable"],
      };
      this.updateState({
        status: "unavailable",
        supported: false,
        text: "",
        segmentIndex: 0,
        segmentCount: 0,
        error,
      });
      return Promise.resolve({ status: "unavailable", error });
    }

    this.stop();
    const id = ++this.sequence;
    const normalizedOptions: ActiveSpeech["options"] = {
      lang: options.lang?.trim() || DEFAULT_LANG,
      rate: clamp(options.rate, 0.1, 10, 0.92),
      pitch: clamp(options.pitch, 0, 2, 1),
      volume: clamp(options.volume, 0, 1, 1),
      preferLocalVoice: options.preferLocalVoice !== false,
      localOnly: options.localOnly === true,
      maxSegmentLength: Math.round(
        clamp(options.maxSegmentLength, 20, 500, DEFAULT_MAX_SEGMENT_LENGTH),
      ),
      voiceURI: options.voiceURI,
      onSegmentStart: options.onSegmentStart,
    };

    return new Promise<TtsResult>((resolve) => {
      this.active = { id, options: normalizedOptions, resolve, segments };
      this.updateState({
        status: "loading",
        supported: true,
        text: segments[0]!,
        segmentIndex: 0,
        segmentCount: segments.length,
        error: null,
      });
      this.speakSegment(id, 0);
    });
  };

  readonly stop = () => {
    const active = this.active;
    this.active = null;
    this.sequence += 1;
    this.clearTimeout();
    this.adapter?.cancel();
    active?.resolve({ status: "cancelled" });

    if (this.state.supported) {
      this.updateState({
        status: "idle",
        supported: true,
        text: "",
        segmentIndex: 0,
        segmentCount: 0,
        error: null,
      });
    }
  };

  readonly pause = () => {
    if (!this.adapter || this.state.status !== "speaking") return;
    this.adapter.pause();
    this.updateState({ ...this.state, status: "paused" });
  };

  readonly resume = () => {
    if (!this.adapter || this.state.status !== "paused") return;
    this.adapter.resume();
    this.updateState({ ...this.state, status: "speaking" });
  };

  readonly destroy = () => {
    this.stop();
    this.adapter?.removeEventListener?.("voiceschanged", this.onVoicesChanged);
    this.listeners.clear();
  };

  private speakSegment(id: number, segmentIndex: number) {
    const active = this.active;
    if (!active || active.id !== id || !this.adapter || !this.createUtterance) return;

    const text = active.segments[segmentIndex];
    if (!text) {
      this.finish(id, { status: "completed" });
      return;
    }

    this.voices = this.adapter.getVoices();
    const voice = selectSpeechVoice(this.voices, active.options.lang, active.options);
    if (active.options.localOnly && !voice) {
      const error: TtsError = {
        code: "voice-unavailable",
        message: "当前设备还没有安装可用的本地朗读声音。",
      };
      this.finish(id, { status: "unavailable", error });
      return;
    }
    const utterance = this.createUtterance(text);
    utterance.lang = active.options.lang;
    utterance.rate = active.options.rate;
    utterance.pitch = active.options.pitch;
    utterance.volume = active.options.volume;
    utterance.voice = voice;
    utterance.onstart = () => {
      if (this.active?.id !== id) return;
      this.updateState({
        status: "speaking",
        supported: true,
        text,
        segmentIndex,
        segmentCount: active.segments.length,
        error: null,
      });
    };
    utterance.onend = () => {
      if (this.active?.id !== id) return;
      this.clearTimeout();
      const nextIndex = segmentIndex + 1;
      if (nextIndex >= active.segments.length) {
        this.finish(id, { status: "completed" });
        return;
      }
      this.speakSegment(id, nextIndex);
    };
    utterance.onerror = (event) => {
      if (this.active?.id !== id) return;
      this.clearTimeout();
      if (event.error === "canceled" || event.error === "interrupted") {
        this.finish(id, { status: "cancelled" });
        return;
      }
      const code = normalizeErrorCode(event.error);
      const error: TtsError = { code, message: ERROR_MESSAGES[code] };
      this.finish(id, { status: "error", error });
    };

    this.updateState({
      status: "speaking",
      supported: true,
      text,
      segmentIndex,
      segmentCount: active.segments.length,
      error: null,
    });
    try {
      active.options.onSegmentStart?.({
        text,
        index: segmentIndex,
        count: active.segments.length,
      });
    } catch {
      // Consumer callbacks must not interrupt speech playback.
    }

    const timeoutMilliseconds = Math.min(180_000, Math.max(20_000, 10_000 + text.length * 800));
    this.timeout = setTimeout(() => {
      if (this.active?.id !== id) return;
      this.adapter?.cancel();
      const error: TtsError = { code: "timeout", message: ERROR_MESSAGES.timeout };
      this.finish(id, { status: "error", error });
    }, timeoutMilliseconds);

    try {
      this.adapter.speak(utterance);
    } catch {
      this.clearTimeout();
      const error: TtsError = { code: "unknown", message: ERROR_MESSAGES.unknown };
      this.finish(id, { status: "error", error });
    }
  }

  private finish(id: number, result: TtsResult) {
    const active = this.active;
    if (!active || active.id !== id) return;

    this.active = null;
    this.clearTimeout();
    if (result.status === "error" || result.status === "unavailable") {
      this.updateState({
        status: result.status === "error" ? "error" : "unavailable",
        supported: true,
        text: this.state.text,
        segmentIndex: this.state.segmentIndex,
        segmentCount: this.state.segmentCount,
        error: result.error ?? {
          code: "unknown",
          message: ERROR_MESSAGES.unknown,
        },
      });
    } else {
      this.updateState({
        status: "idle",
        supported: true,
        text: "",
        segmentIndex: 0,
        segmentCount: 0,
        error: null,
      });
    }
    active.resolve(result);
  }

  private clearTimeout() {
    if (this.timeout === null) return;
    clearTimeout(this.timeout);
    this.timeout = null;
  }

  private updateState(state: TtsState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}

export const browserTts = new BrowserTtsService();
