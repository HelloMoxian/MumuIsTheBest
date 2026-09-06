import assert from "node:assert/strict";
import test from "node:test";
import { LatestMomentQueue } from "./latest-moment-queue";
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
function setup() {
  const played: string[] = [], shown: string[] = [], calls: string[] = [];
  const finishes: ((result: { status: string }) => void)[] = [];
  let busy = false;
  const queue = new LatestMomentQueue<string>({
    play: value => { played.push(value); return new Promise(resolve => finishes.push(resolve)); },
    show: value => { shown.push(value); },
    busy: () => busy,
    stop: () => { calls.push("stop"); }, pause: () => { calls.push("pause"); }, resume: () => { calls.push("resume"); },
    failed: () => { calls.push("failed"); },
  });
  return { queue, played, shown, calls, finishes, busy: (value: boolean) => { busy = value; } };
}
test("a bilingual pair finishes intact while a burst retains only its newest waiting pair", async () => {
  const x = setup();
  x.queue.enqueue("English A + 中文 A"); x.queue.enqueue("B"); x.queue.enqueue("C"); x.queue.enqueue("D");
  assert.deepEqual(x.played, ["English A + 中文 A"]);
  assert.deepEqual(x.calls, []);
  x.finishes[0]({ status: "completed" }); await tick();
  assert.deepEqual(x.played, ["English A + 中文 A", "D"]);
  assert.deepEqual(x.shown, x.played);
  x.finishes[1]({ status: "completed" }); await tick();
  assert.equal(x.played.length, 2);
});
test("pause/resume continues the current pair and delays the waiting pair", async () => {
  const x = setup();
  x.queue.enqueue("A"); x.queue.enqueue("B"); x.queue.setPaused(true);
  x.queue.enqueue("C"); x.queue.wake();
  assert.deepEqual(x.calls, ["pause"]);
  assert.deepEqual(x.played, ["A"]);
  x.queue.setPaused(false);
  assert.deepEqual(x.calls, ["pause", "resume"]);
  x.finishes[0]({ status: "completed" }); await tick();
  assert.deepEqual(x.played, ["A", "C"]);
});
test("muting or leaving clears the queue and late completion cannot resurrect speech", async () => {
  const x = setup();
  x.queue.enqueue("A"); x.queue.enqueue("B"); x.queue.setEnabled(false);
  x.queue.enqueue("C");
  x.finishes[0]({ status: "cancelled" }); await tick();
  assert.deepEqual(x.played, ["A"]);
  assert.deepEqual(x.calls, ["stop"]);
  x.queue.setEnabled(true); x.queue.enqueue("D"); x.queue.dispose();
  x.finishes[1]({ status: "completed" }); await tick();
  assert.deepEqual(x.played, ["A", "D"]);
  assert.deepEqual(x.calls, ["stop", "stop"]);
});
test("global narration/microphone ownership delays playback; failure releases the queue", async () => {
  const x = setup(); x.busy(true);
  x.queue.enqueue("A"); x.queue.enqueue("B");
  assert.equal(x.played.length, 0);
  x.busy(false); x.queue.wake(); x.queue.enqueue("C");
  assert.deepEqual(x.played, ["B"]);
  x.finishes[0]({ status: "error" }); await tick();
  assert.deepEqual(x.played, ["B", "C"]); assert.deepEqual(x.calls, ["failed"]);
});
