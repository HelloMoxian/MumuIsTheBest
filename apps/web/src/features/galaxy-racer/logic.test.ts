import assert from "node:assert/strict";
import test from "node:test";
import {
  collisionSpeed,
  cubicBezierValue,
  energyRewardForAttempts,
  laneFromHeadPosition,
  RACER_CENTER_ZONE,
  RACER_STAGES,
  sequentialPassedLevels,
} from "./logic";

test("左右边界使用带缓冲的滞回阈值", () => {
  assert.ok(Math.abs(RACER_CENTER_ZONE.right - RACER_CENTER_ZONE.left - 0.15) < 1e-9);
  assert.equal(laneFromHeadPosition(-1, 0.449), -1);
  assert.equal(laneFromHeadPosition(-1, 0.45), 0);
  assert.equal(laneFromHeadPosition(0, 0.401), 0);
  assert.equal(laneFromHeadPosition(0, 0.4), -1);
  assert.equal(laneFromHeadPosition(0, 0.599), 0);
  assert.equal(laneFromHeadPosition(0, 0.6), 1);
  assert.equal(laneFromHeadPosition(1, 0.551), 1);
  assert.equal(laneFromHeadPosition(1, 0.55), 0);
});

test("六关目标和三套主题严格循环", () => {
  assert.deepEqual(RACER_STAGES.map((stage) => stage.targetMs / 1_000), [80, 70, 60, 55, 50, 45]);
  assert.deepEqual(RACER_STAGES.map((stage) => stage.theme), ["neon", "crystal", "solar", "neon", "crystal", "solar"]);
});

test("障碍车保持稀疏并从远处快速进入操作区", () => {
  assert.ok(RACER_STAGES.every((stage) => stage.spawnGap >= 140));
  assert.ok(RACER_STAGES.every((stage) => stage.doubleChance <= 0.24));
  assert.deepEqual(RACER_STAGES.map((stage) => stage.maxVisibleVehicles), [2, 2, 3, 3, 3, 4]);
  assert.ok(RACER_STAGES.every((stage) => stage.farApproachBoost > stage.obstacleSpeedMax));
});

test("奖励只计算首个未点亮关卡之前的连续关卡", () => {
  const attempts = [
    { level: 1, elapsedMs: 65_000, collisions: 1, completed: true as const },
    { level: 2, elapsedMs: 71_000, collisions: 3, completed: true as const },
    { level: 3, elapsedMs: 50_000, collisions: 0, completed: true as const },
  ];
  assert.equal(sequentialPassedLevels(attempts), 1);
  assert.equal(energyRewardForAttempts(attempts), 10);
});

test("碰撞降速有下限，贝塞尔首尾保持连续", () => {
  assert.equal(collisionSpeed(12), 10);
  assert.ok(Math.abs(collisionSpeed(100) - 58) < 1e-9);
  assert.equal(cubicBezierValue(0, 0.16, 1), 0);
  assert.equal(cubicBezierValue(1, 0.16, 1), 1);
});
