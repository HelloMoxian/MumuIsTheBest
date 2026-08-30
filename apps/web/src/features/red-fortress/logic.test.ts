import assert from "node:assert/strict";
import test from "node:test";
import {
  STAGES,
  circlesOverlap,
  getPowerTier,
  getStage,
  getStageProgress,
  isSpawnScheduleSorted,
  normalized,
  selectNearestTarget,
} from "./logic";

test("all four stages have sorted spawn schedules and increasing campaign distance", () => {
  assert.equal(STAGES.length, 4);
  for (const stage of STAGES) {
    assert.equal(isSpawnScheduleSorted(stage), true, stage.name);
    assert.ok(stage.spawns.length >= 20, stage.name);
    assert.ok(stage.bossHp > 0);
  }
  assert.deepEqual(STAGES.map((stage) => stage.id), ["emerald", "snow", "lava", "citadel"]);
  assert.deepEqual(STAGES.map((stage) => stage.length), [2900, 3300, 3600, 4000]);
});

test("power tier follows the documented rescue thresholds", () => {
  assert.equal(getPowerTier(0), 1);
  assert.equal(getPowerTier(1), 1);
  assert.equal(getPowerTier(2), 2);
  assert.equal(getPowerTier(3), 2);
  assert.equal(getPowerTier(4), 3);
  assert.equal(getPowerTier(5), 3);
  assert.equal(getPowerTier(6), 4);
  assert.equal(getPowerTier(50), 4);
});

test("stage progress clamps empty, active, and completed distances", () => {
  const stage = STAGES[0];
  assert.equal(getStageProgress(-20, stage), 0);
  assert.equal(getStageProgress(stage.length / 2, stage), 0.5);
  assert.equal(getStageProgress(stage.length + 1, stage), 1);
});

test("circle collision includes touching edges without using sprite transparency", () => {
  assert.equal(circlesOverlap({ x: 0, y: 0 }, 20, { x: 40, y: 0 }, 20), true);
  assert.equal(circlesOverlap({ x: 0, y: 0 }, 20, { x: 40.1, y: 0 }, 20), false);
});

test("nearest target selection ignores inactive and out-of-range candidates", () => {
  const target = selectNearestTarget(
    { x: 0, y: 0 },
    [
      { id: 1, x: 10, y: 0, active: false },
      { id: 2, x: 30, y: 0, active: true },
      { id: 3, x: 90, y: 0, active: true },
    ],
    50,
  );
  assert.equal(target?.id, 2);
  assert.equal(selectNearestTarget({ x: 0, y: 0 }, [{ id: 4, x: 80, y: 0, active: true }], 50), undefined);
});

test("normalization and invalid stage lookup have stable safe fallbacks", () => {
  assert.deepEqual(normalized({ x: 4, y: 4 }, { x: 4, y: 4 }), { x: 0, y: -1 });
  const direction = normalized({ x: 0, y: 0 }, { x: 3, y: 4 });
  assert.equal(direction.x, 0.6);
  assert.equal(direction.y, 0.8);
  assert.equal(getStage(999).id, "emerald");
  assert.equal(getStage(-1).id, "emerald");
});
