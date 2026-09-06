import assert from "node:assert/strict";
import test from "node:test";
import { RewardCounter, coinArrivals } from "./reward-counter";

test("balances stay at pre-award values until each currency arrives, then reach exact confirmed totals", () => {
  const shown: { knowledge: number; energy: number }[] = [];
  const pulses: unknown[] = [];
  const counter = new RewardCounter((balance, pulse) => { shown.push(balance); if (pulse) pulses.push(pulse); });
  counter.sync({ knowledge: 100, energy: 200 });
  counter.prepare("move", { knowledge: 102, energy: 205 }, { knowledge: 2, energy: 5 });
  assert.deepEqual(shown.at(-1), { knowledge: 100, energy: 200 });
  counter.arrive("move", "knowledge", 1);
  assert.deepEqual(shown.at(-1), { knowledge: 101, energy: 200 });
  counter.arrive("move", "energy", 1);
  assert.deepEqual(shown.at(-1), { knowledge: 101, energy: 201 });
  counter.arrive("move", "knowledge", 2);
  counter.arrive("move", "energy", 5);
  counter.finish("move");
  assert.deepEqual(shown.at(-1), { knowledge: 102, energy: 205 });
  assert.equal(pulses.length, 4);
});
test("large bursts use weighted arrivals and duplicate/out-of-order callbacks cannot award twice", () => {
  for (const total of [0, 1, 4, 32, 33, 119, 750]) {
    let last = { knowledge: 0, energy: 0 };
    const counter = new RewardCounter(balance => { last = balance; });
    counter.prepare("burst", { knowledge: total + 42, energy: 3 }, { knowledge: total, energy: 0 });
    const arrivals = coinArrivals(total);
    assert.equal(arrivals.length, Math.min(32, total));
    for (const arrival of arrivals) {
      counter.arrive("burst", "knowledge", arrival.cumulative);
      counter.arrive("burst", "knowledge", arrival.cumulative);
      counter.arrive("burst", "knowledge", 0);
      assert.equal(last.knowledge, 42 + arrival.cumulative);
    }
    counter.finish("burst");
    assert.deepEqual(last, { knowledge: total + 42, energy: 3 });
  }
});
test("pause, cancellation, next move, retry and stale animation callbacks converge on server balance", () => {
  let last = { knowledge: 0, energy: 0 };
  const counter = new RewardCounter(balance => { last = balance; });
  counter.prepare("old", { knowledge: 10, energy: 20 }, { knowledge: 4, energy: 4 });
  counter.finish("old");
  assert.deepEqual(last, { knowledge: 10, energy: 20 });
  counter.prepare("new", { knowledge: 15, energy: 25 }, { knowledge: 5, energy: 5 });
  counter.finish("old"); counter.arrive("old", "energy", 100);
  assert.deepEqual(last, { knowledge: 10, energy: 20 });
  counter.sync({ knowledge: 15, energy: 25 });
  counter.arrive("new", "energy", 5); counter.finish();
  assert.deepEqual(last, { knowledge: 15, energy: 25 });
});
