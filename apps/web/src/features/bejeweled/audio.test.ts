import test from "node:test";
import assert from "node:assert/strict";
import { GemAudio, frameSound } from "./audio";
import type { Frame } from "../../../../server/src/bejeweled-engine";
const tick = () => new Promise(resolve => setImmediate(resolve));
class Source {
  buffer = null; playbackRate = { value: 1 }; onended?: () => void;
  started = 0; stopped = 0;
  connect() {} disconnect() {}
  start() { this.started++; }
  stop() { this.stopped++; this.onended?.(); }
}
class Context {
  state = "suspended"; currentTime = 1; destination = {}; sources: Source[] = [];
  createBufferSource() { const s = new Source(); this.sources.push(s); return s; }
  createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} }; }
  async decodeAudioData() { return {}; }
  async resume() { this.state = "running"; }
  async close() { this.state = "closed"; }
}
const read = async () => new Response(new Uint8Array([1, 2]));
test("预载不发声，真实操作解锁；样本播放限流，暂停与静音立即停止", async () => {
  const context = new Context();
  const audio = new GemAudio(() => {}, () => context as unknown as AudioContext, read);
  audio.prepare(); await tick(); assert.equal(context.state, "suspended"); assert.equal(context.sources.length, 0);
  audio.configure(true, .55); audio.unlock(); await tick(); audio.play("select");
  assert.equal(context.sources.length, 1); assert.equal(context.sources[0].started, 1);
  audio.play("select"); assert.equal(context.sources.length, 1);
  for (let i = 0; i < 20; i++) { context.currentTime += .06; audio.play("clear", i + 1); }
  assert.ok(context.sources.filter(s => !s.stopped).length <= 8);
  assert.ok(context.sources.at(-1)!.playbackRate.value <= 1.5);
  audio.setStopped(true); assert.ok(context.sources.every(s => s.stopped));
  const count = context.sources.length; audio.play("star"); assert.equal(context.sources.length, count);
  audio.setStopped(false); audio.configure(false, .55); audio.play("swap"); assert.equal(context.sources.length, count);
  audio.dispose(); assert.equal(context.state, "closed");
});
test("加载迟到不补播过期点击，损坏资源只降级音效", async () => {
  const context = new Context(); let release!: (value: Response) => void; let errors = 0;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  const audio = new GemAudio(() => errors++, () => context as unknown as AudioContext, () => pending.then(r => r.clone()));
  audio.configure(true, .5); audio.play("select"); audio.setStopped(true);
  release(new Response(new Uint8Array([1]))); await tick();
  assert.equal(context.sources.length, 0); audio.dispose(); assert.equal(errors, 0);
  const bad = new GemAudio(() => errors++, () => new Context() as unknown as AudioContext, async () => new Response("", { status: 404 }));
  bad.prepare(); await tick(); assert.equal(errors, 1); bad.dispose();
});
test("每轮使用真实消除类型选择声音，不为交换空帧重复消除音", () => {
  const frame: Frame = { board: [], cleared: [1, 2, 3], created: [], points: 150, cascade: 1, phase: "clear" };
  assert.equal(frameSound(frame), "clear");
  assert.equal(frameSound({ ...frame, cascade: 3 }), "cascade");
  for (const [kind, expected] of [["flame", "flame"], ["star", "star"], ["nova", "star"], ["cube", "cube"]] as const)
    assert.equal(frameSound({ ...frame, blasts: [{ kind, source: 1, targets: [2] }] }), expected);
  assert.equal(frameSound({ ...frame, phase: "fall" }), null);
  assert.equal(frameSound({ ...frame, phase: "vacate" }), null);
  assert.equal(frameSound({ ...frame, phase: "swap" }), "swap");
});
