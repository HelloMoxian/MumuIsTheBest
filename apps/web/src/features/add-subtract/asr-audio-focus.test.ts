import assert from "node:assert/strict";
import test from "node:test";
import { AsrRecognitionSession } from "./asr-client";
import { audioFocus } from "../../shared/audio/audio-focus";

test("麦克风权限拒绝和连接失败都会释放背景音乐，不残留占用", async () => {
  const keys = ["navigator", "window", "WebSocket"] as const;
  const original = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const set = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const handlers = { onState() {}, onResult() {}, onError() {} };
  class Socket {
    static OPEN = 1; readyState = 1;
    static instance: Socket;
    onmessage?: (event: { data: string }) => Promise<void>;
    onerror?: () => void; onclose?: () => void;
    constructor() { Socket.instance = this; }
    send() {} close() {}
  }
  try {
    set("window", { location: { protocol: "http:", host: "example.test" }, setTimeout: () => 0 });
    set("navigator", { mediaDevices: { getUserMedia: async () => { throw new Error("Permission denied"); } } });
    set("WebSocket", Socket);
    const denied = new AsrRecognitionSession(handlers);
    await denied.start(); assert.equal(audioFocus.isMicrophoneActive(), true);
    await Socket.instance.onmessage!({ data: '{"type":"ready"}' });
    assert.equal(audioFocus.isMicrophoneActive(), false); await denied.stop();
    const disconnected = new AsrRecognitionSession(handlers);
    await disconnected.start(); assert.equal(audioFocus.isMicrophoneActive(), true);
    Socket.instance.onerror!(); assert.equal(audioFocus.isMicrophoneActive(), false); await disconnected.stop();
    const closed = new AsrRecognitionSession(handlers);
    await closed.start(); Socket.instance.onclose!();
    assert.equal(audioFocus.isMicrophoneActive(), false); await closed.stop();
    set("WebSocket", class { constructor() { throw new Error("Blocked socket"); } });
    await new AsrRecognitionSession(handlers).start();
    assert.equal(audioFocus.isMicrophoneActive(), false);
  } finally {
    for (const key of keys) {
      const descriptor = original.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
