import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BrowserTtsService,
  segmentSpeechText,
  selectSpeechVoice,
  type SpeechSynthesisAdapter,
  type SpeechUtteranceLike,
  type SpeechVoiceLike,
} from "./tts";

class FakeUtterance implements SpeechUtteranceLike {
  lang = "";
  pitch = 1;
  rate = 1;
  voice: SpeechVoiceLike | null = null;
  volume = 1;
  onend: (() => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onstart: (() => void) | null = null;

  constructor(readonly text: string) {}
}

class FakeSpeechSynthesis implements SpeechSynthesisAdapter {
  cancelCount = 0;
  pauseCount = 0;
  resumeCount = 0;
  spoken: SpeechUtteranceLike[] = [];

  constructor(readonly voices: SpeechVoiceLike[] = []) {}

  cancel() {
    this.cancelCount += 1;
  }

  getVoices() {
    return this.voices;
  }

  pause() {
    this.pauseCount += 1;
  }

  resume() {
    this.resumeCount += 1;
  }

  speak(utterance: SpeechUtteranceLike) {
    this.spoken.push(utterance);
    utterance.onstart?.();
  }

  completeCurrent() {
    this.spoken.at(-1)?.onend?.();
  }

  failCurrent(error: string) {
    this.spoken.at(-1)?.onerror?.({ error });
  }
}

function voice(
  name: string,
  options: Partial<SpeechVoiceLike> = {},
): SpeechVoiceLike {
  return {
    default: false,
    lang: "zh-CN",
    localService: true,
    name,
    voiceURI: `voice:${name}`,
    ...options,
  };
}

describe("segmentSpeechText", () => {
  it("keeps sentence punctuation and creates ordered reading segments", () => {
    assert.deepEqual(segmentSpeechText("第一句。第二句！\n第三句？"), [
      "第一句。",
      "第二句！",
      "第三句？",
    ]);
  });

  it("splits long content at natural punctuation before using a hard limit", () => {
    const segments = segmentSpeechText(
      "这是一个比较长的句子，应该优先在逗号处分开，然后继续朗读。",
      20,
    );
    assert.ok(segments.length > 1);
    assert.ok(segments.every((segment) => segment.length <= 20));
    assert.equal(segments.join(""), "这是一个比较长的句子，应该优先在逗号处分开，然后继续朗读。");
  });

  it("returns no work for blank text", () => {
    assert.deepEqual(segmentSpeechText(" \n "), []);
  });
});

describe("selectSpeechVoice", () => {
  it("prefers an exact-language local voice", () => {
    const selected = selectSpeechVoice(
      [
        voice("remote-default", { default: true, localService: false }),
        voice("local"),
        voice("traditional", { lang: "zh-TW" }),
      ],
      "zh-CN",
      { preferLocalVoice: true },
    );
    assert.equal(selected?.name, "local");
  });

  it("honors an explicitly selected voice URI", () => {
    const selected = selectSpeechVoice(
      [voice("one"), voice("two", { lang: "en-US" })],
      "zh-CN",
      { voiceURI: "voice:two" },
    );
    assert.equal(selected?.name, "two");
  });

  it("does not select a remote voice when local-only privacy is required", () => {
    const selected = selectSpeechVoice(
      [voice("remote", { localService: false })],
      "zh-CN",
      { localOnly: true, voiceURI: "voice:remote" },
    );
    assert.equal(selected, null);
  });
});

describe("BrowserTtsService", () => {
  it("reads segments in order and resolves after the final segment", async () => {
    const synthesis = new FakeSpeechSynthesis([voice("local")]);
    const service = new BrowserTtsService(
      synthesis,
      (text) => new FakeUtterance(text),
    );
    const result = service.speak({
      text: "第一句。第二句。",
      lang: "zh-CN",
      rate: 0.9,
    });

    assert.equal(service.getSnapshot().status, "speaking");
    assert.equal(service.getSnapshot().segmentCount, 2);
    assert.equal(synthesis.spoken[0]?.rate, 0.9);
    assert.equal(synthesis.spoken[0]?.voice?.name, "local");

    synthesis.completeCurrent();
    assert.equal(service.getSnapshot().segmentIndex, 1);
    assert.equal(synthesis.spoken[1]?.text, "第二句。");

    synthesis.completeCurrent();
    assert.deepEqual(await result, { status: "completed" });
    assert.equal(service.getSnapshot().status, "idle");
    service.destroy();
  });

  it("cancels the previous request when newer content starts", async () => {
    const synthesis = new FakeSpeechSynthesis();
    const service = new BrowserTtsService(
      synthesis,
      (text) => new FakeUtterance(text),
    );
    const first = service.speak({ text: "旧题目。" });
    const second = service.speak({ text: "新题目。" });

    assert.deepEqual(await first, { status: "cancelled" });
    assert.equal(synthesis.spoken.at(-1)?.text, "新题目。");
    synthesis.completeCurrent();
    assert.deepEqual(await second, { status: "completed" });
    service.destroy();
  });

  it("exposes pause and resume state", () => {
    const synthesis = new FakeSpeechSynthesis();
    const service = new BrowserTtsService(
      synthesis,
      (text) => new FakeUtterance(text),
    );
    void service.speak({ text: "暂停测试。" });

    service.pause();
    assert.equal(service.getSnapshot().status, "paused");
    assert.equal(synthesis.pauseCount, 1);

    service.resume();
    assert.equal(service.getSnapshot().status, "speaking");
    assert.equal(synthesis.resumeCount, 1);
    service.stop();
    service.destroy();
  });

  it("returns a user-readable error without throwing", async () => {
    const synthesis = new FakeSpeechSynthesis();
    const service = new BrowserTtsService(
      synthesis,
      (text) => new FakeUtterance(text),
    );
    const result = service.speak({ text: "网络测试。" });

    synthesis.failCurrent("network");
    assert.deepEqual(await result, {
      status: "error",
      error: {
        code: "network",
        message: "朗读声音暂时没有连接成功，请检查网络。",
      },
    });
    assert.equal(service.getSnapshot().status, "error");
    service.destroy();
  });

  it("degrades cleanly when the browser has no speech engine", async () => {
    const service = new BrowserTtsService(null, null);
    const result = await service.speak({ text: "设备测试。" });

    assert.equal(result.status, "unavailable");
    assert.equal(service.getSnapshot().supported, false);
  });

  it("does not fall back to a browser default when local-only has no local voice", async () => {
    const synthesis = new FakeSpeechSynthesis([
      voice("remote", { localService: false }),
    ]);
    const service = new BrowserTtsService(
      synthesis,
      (text) => new FakeUtterance(text),
    );
    const result = await service.speak({
      text: "隐私测试。",
      localOnly: true,
    });

    assert.deepEqual(result, {
      status: "unavailable",
      error: {
        code: "voice-unavailable",
        message: "当前设备还没有安装可用的本地朗读声音。",
      },
    });
    assert.equal(synthesis.spoken.length, 0);
    service.destroy();
  });
});
