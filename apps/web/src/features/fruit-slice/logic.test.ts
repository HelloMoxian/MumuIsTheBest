import assert from "node:assert/strict";
import test from "node:test";
import {
  bombPenalty,
  collisionRadiusForSize,
  evaluateSwipe,
  fruitWaveFormation,
  pairedLaneSpawn,
  pointToSegmentDistance,
  randomizedWaveDelay,
  recordSuccessfulSlice,
  scoreForSlice,
  swipeHitsCircle,
  waveObjectCount,
} from "./logic";

test("滑动必须同时达到位移和速度阈值", () => {
  assert.equal(evaluateSwipe({ x: 0, y: 0 }, { x: 0.01, y: 0 }, 10, "standard").active, false);
  assert.equal(evaluateSwipe({ x: 0, y: 0 }, { x: 0.08, y: 0 }, 100, "standard").active, true);
  assert.equal(evaluateSwipe({ x: 0, y: 0 }, { x: 0.08, y: 0 }, 300, "standard").active, false);
});

test("轨迹与圆形物体使用线段距离判定", () => {
  const segment = evaluateSwipe({ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.2 }, 200, "standard");
  assert.ok(Math.abs(pointToSegmentDistance({ x: 0.5, y: 0.24 }, segment.from, segment.to) - 0.04) < 1e-9);
  assert.equal(swipeHitsCircle(segment, { x: 0.5, y: 0.24 }, 0.05), true);
  assert.equal(swipeHitsCircle(segment, { x: 0.5, y: 0.4 }, 0.05), false);
});

test("速度越高得分越高，超级模式严格三倍，炸弹固定扣三十分", () => {
  assert.ok(scoreForSlice(1.6, 1) > scoreForSlice(0.7, 1));
  assert.equal(scoreForSlice(1.6, 3), scoreForSlice(1.6, 1) * 3);
  assert.equal(bombPenalty(), 30);
});

test("放大后的物体同步获得更宽松的碰撞核", () => {
  assert.equal(collisionRadiusForSize(160), 67.2);
  assert.equal(collisionRadiusForSize(256), 107.52);
});

test("出物等待时间不再固定且高密度波次包含更多食物", () => {
  assert.equal(randomizedWaveDelay("standard", () => 0), 550);
  assert.equal(randomizedWaveDelay("standard", () => 1), 1_650);
  assert.equal(waveObjectCount("relaxed", () => 0), 1);
  assert.equal(waveObjectCount("storm", () => 0.999), 6);
});

test("同波食物按可一笔划过的有序编队出现", () => {
  const values = [0.5, 0.4, 0.6, 0.8];
  const formation = fruitWaveFormation(4, "full", () => values.shift() ?? 0.5);
  assert.equal(formation.length, 4);
  assert.deepEqual([...formation].map((spawn) => spawn.x), [...formation].map((spawn) => spawn.x).sort((a, b) => a - b));
  assert.ok(formation.every((spawn) => spawn.velocityY < 0));
  assert.ok(Math.max(...formation.map((spawn) => spawn.y)) - Math.min(...formation.map((spawn) => spawn.y)) < 0.12);
});

test("2.5 秒内六次连续命中触发六秒超级加成", () => {
  let state = { combo: 0, lastHitAt: 0, recentHits: [] as number[], superUntil: 0 };
  for (const time of [1_000, 1_300, 1_600, 1_900, 2_200]) {
    state = recordSuccessfulSlice(state, time).state;
  }
  const result = recordSuccessfulSlice(state, 2_500);
  assert.equal(result.activated, true);
  assert.equal(result.multiplier, 3);
  assert.equal(result.state.superUntil, 8_500);
});

test("双人出物在左右两边使用同一条镜像轨迹", () => {
  const values = [0.4, 0.8, 0.25];
  const pair = pairedLaneSpawn(() => values.shift() ?? 0.5);
  assert.ok(Math.abs(pair[0].x - (1 - pair[1].x)) < 1e-9);
  assert.equal(pair[0].velocityX, -pair[1].velocityX);
  assert.equal(pair[0].velocityY, pair[1].velocityY);
});
