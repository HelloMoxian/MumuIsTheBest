import assert from "node:assert/strict";
import test from "node:test";
import { createPraisePicker, PRAISES, PraisePlayback, type Praise } from "./praise";

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("60组完整中英表扬无重复，每轮全部覆盖且轮间不连读同一句", () => {
  assert.equal(PRAISES.length, 60);
  assert.equal(new Set(PRAISES.map(p => p.zh)).size, 60);
  assert.equal(new Set(PRAISES.map(p => p.en)).size, 60);
  assert.ok(PRAISES.every(p => p.zh.length > 0 && p.en.length > 0));
  const pick = createPraisePicker(() => 0.5);
  let last: Praise | undefined;
  for (let cycle = 0; cycle < 3; cycle++) {
    const selected: Praise[] = [];
    for (let i = 0; i < 60; i++) { const next = pick(); assert.notEqual(next, last); selected.push(next); last = next; }
    assert.equal(new Set(selected).size, 60);
  }
});

test("四行加另一玩家一行产生五次顺序朗读，彼此不打断", async () => {
  const spoken: Praise[] = [];
  const shown: number[] = [];
  let active = 0;
  const playback = new PraisePlayback({
    speak: async praise => { assert.equal(active++, 0); spoken.push(praise); await flush(); active--; return { status: "completed" }; },
    stop: () => {}, show: event => shown.push(event.player), status: () => {},
  });
  playback.setEnabled(true);
  for (let i = 0; i < 5; i++) playback.enqueue({ player: i === 4 ? 1 : 0, praise: PRAISES[i] });
  for (let i = 0; i < 8; i++) await flush();
  assert.deepEqual(spoken, PRAISES.slice(0, 5));
  assert.deepEqual(shown, [0, 0, 0, 0, 1]);
});

test("静音不朗读；暂停保留当前事件；关闭声音清空待播", async () => {
  const spoken: Praise[] = [];
  let finish: ((result: { status: string }) => void) | undefined;
  const playback = new PraisePlayback({
    speak: praise => { spoken.push(praise); return new Promise(resolve => { finish = resolve; }); },
    stop: () => finish?.({ status: "cancelled" }), show: () => {}, status: () => {},
  });
  playback.enqueue({ player: 0, praise: PRAISES[0] });
  assert.equal(spoken.length, 0);
  playback.setEnabled(true);
  playback.enqueue({ player: 0, praise: PRAISES[1] });
  playback.enqueue({ player: 1, praise: PRAISES[2] });
  playback.setPaused(true); await flush();
  assert.equal(spoken.length, 1);
  playback.setPaused(false);
  assert.deepEqual(spoken, [PRAISES[1], PRAISES[1]]);
  playback.setEnabled(false); await flush();
  playback.setEnabled(true); await flush();
  assert.equal(spoken.length, 2);
});

test("引擎错误或外部取消不产生无限重试", async () => {
  for (const status of ["error", "unavailable", "cancelled"]) {
    let count = 0;
    let unavailable = false;
    const playback = new PraisePlayback({
      speak: async () => { count++; return { status }; }, stop: () => {}, show: () => {},
      status: (_, value) => { unavailable = value; },
    });
    playback.setEnabled(true);
    playback.enqueue({ player: 0, praise: PRAISES[0] });
    playback.enqueue({ player: 1, praise: PRAISES[1] });
    await flush();
    assert.equal(count, 1);
    assert.equal(unavailable, true);
    playback.clear();
  }
});
