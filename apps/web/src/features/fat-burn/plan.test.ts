import assert from "node:assert/strict";
import test from "node:test";
import { advanceElapsed, COURSE, empowermentAt, moveCue, moveLabel, PHASES, segmentAt, skipCourseAhead, TOTAL_MS, type PhaseId } from "./plan";

test("course has exact 5 / 20 / 5 minute phases, unique segments, and a continuous timeline", () => {
  assert.equal(TOTAL_MS, 1_800_000);
  assert.equal(new Set(COURSE.map((segment) => segment.id)).size, COURSE.length);
  assert.deepEqual(PHASES.map((phase) => phase.durationMs), [300_000, 1_200_000, 300_000]);
  let cursor = 0;
  for (const segment of COURSE) {
    assert.equal(segment.startMs, cursor);
    assert.equal(segment.endMs - segment.startMs, segment.durationMs);
    assert.ok(Number.isInteger(segment.durationMs) && segment.durationMs > 0);
    assert.ok(Number.isFinite(segment.beatMs) && segment.beatMs > 0);
    const phase = PHASES.find((item) => item.id === segment.phase)!;
    assert.equal(segment.bpm, phase.bpm);
    assert.ok(segment.startMs >= phase.startMs && segment.endMs <= phase.endMs);
    cursor = segment.endMs;
  }
  assert.equal(cursor, TOTAL_MS);
  for (const phase of PHASES) {
    assert.equal(COURSE.filter((segment) => segment.phase === phase.id).reduce((total, segment) => total + segment.durationMs, 0), phase.durationMs);
  }
  assert.ok(Object.isFrozen(COURSE) && COURSE.every(Object.isFrozen));
});

test("all four main rounds contain five complete 45s / 15s pairs without skipping recovery", () => {
  for (let round = 1; round <= 4; round++) {
    const segments = COURSE.filter((segment) => segment.round === round);
    assert.equal(segments.length, 10);
    for (let slot = 0; slot < 5; slot++) {
      const active = segments[slot * 2];
      const recovery = segments[slot * 2 + 1];
      assert.equal(active.kind, "move");
      assert.equal(active.durationMs, 45_000);
      assert.equal(recovery.kind, "recovery");
      assert.equal(recovery.move, "march");
      assert.equal(recovery.durationMs, 15_000);
      assert.equal(active.endMs, recovery.startMs);
    }
    assert.ok(new Set(segments.filter((segment) => segment.kind === "move").map((segment) => segment.move)).size >= 4);
  }
  assert.ok(COURSE.filter((segment) => segment.phase !== "workout").every((segment) => segment.round === null));
});

test("warmup is non-jumping and cooldown lowers pace before equal left/right static holds", () => {
  const warmup = COURSE.filter((segment) => segment.phase === "warmup");
  assert.equal(warmup.length, 5);
  assert.ok(warmup.every((segment) => segment.durationMs === 60_000));
  assert.ok(warmup.every((segment) => !["jack", "skater", "squat"].includes(segment.move)));
  const cooldown = COURSE.filter((segment) => segment.phase === "cooldown");
  assert.equal(cooldown[0].move, "march");
  assert.equal(cooldown[0].durationMs, 60_000);
  for (const move of ["calf-stretch", "quad-stretch", "side-stretch"]) {
    const pair = cooldown.filter((segment) => segment.move === move);
    assert.deepEqual(pair.map((segment) => segment.side), ["left", "right"]);
    assert.deepEqual(pair.map((segment) => segment.durationMs), [30_000, 30_000]);
    assert.equal(pair[0].endMs, pair[1].startMs);
  }
  assert.equal(cooldown.at(-1)!.move, "breathe");
});

test("every timing boundary starts its next segment and completion remains bounded", () => {
  for (let index = 0; index < COURSE.length; index++) {
    const segment = COURSE[index];
    const beginning = segmentAt(segment.startMs);
    assert.equal(beginning.segment.id, segment.id);
    assert.equal(beginning.index, index);
    assert.equal(beginning.withinMs, 0);
    assert.equal(beginning.remainingMs, segment.durationMs);
    assert.equal(beginning.next, COURSE[index + 1] ?? null);
    assert.equal(segmentAt(segment.endMs - 0.25).segment.id, segment.id);
    assert.equal(segmentAt(segment.endMs).segment, COURSE[index + 1] ?? segment);
  }
  assert.deepEqual(segmentAt(TOTAL_MS + 5_000), segmentAt(TOTAL_MS));
  assert.equal(segmentAt(TOTAL_MS).remainingMs, 0);
  assert.equal(segmentAt(TOTAL_MS).withinMs, COURSE.at(-1)!.durationMs);
  assert.equal(segmentAt(TOTAL_MS).next, null);
  for (const invalid of [-10, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.deepEqual(segmentAt(invalid), segmentAt(0));
  }
});

test("clock counts only running finite frame time and never credits suspended time", () => {
  assert.equal(advanceElapsed(5_000, 100, true), 5_100);
  assert.equal(advanceElapsed(5_000, 100, false), 5_000);
  assert.equal(advanceElapsed(5_000, 1_000, true), 6_000);
  for (const invalid of [-1, 1_001, 60_000, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(advanceElapsed(5_000, invalid, true), 5_000);
  }
  assert.equal(advanceElapsed(TOTAL_MS - 50, 100, true), TOTAL_MS);
  assert.equal(advanceElapsed(TOTAL_MS + 100, 100, true), TOTAL_MS);
  assert.equal(advanceElapsed(Number.NaN, 100, false), 0);
  assert.equal(advanceElapsed(-5, 10, true), 10);
  let elapsed = 0;
  for (let tick = 0; tick < 3_600; tick++) elapsed = advanceElapsed(elapsed, 500, true);
  assert.equal(elapsed, TOTAL_MS);
});

test("next section goes exactly one segment forward, retaining recovery and the final breathing segment", () => {
  for (let index = 0; index < COURSE.length - 1; index++) {
    const segment = COURSE[index];
    const halfway = segment.startMs + segment.durationMs / 2;
    const jump = skipCourseAhead(halfway);
    assert.equal(jump.elapsedMs, COURSE[index + 1].startMs);
    assert.equal(segmentAt(jump.elapsedMs).segment, COURSE[index + 1]);
    for (const phase of PHASES) {
      assert.equal(jump.skippedMs[phase.id], phase.id === segment.phase ? segment.durationMs / 2 : 0);
    }
  }
  const firstMove = COURSE.find(segment => segment.phase === "workout")!;
  const recovery = skipCourseAhead(firstMove.startMs);
  assert.equal(segmentAt(recovery.elapsedMs).segment.kind, "recovery");
  assert.equal(segmentAt(skipCourseAhead(recovery.elapsedMs).elapsedMs).segment.kind, "move");
  for (const elapsed of [COURSE.at(-1)!.startMs, TOTAL_MS - 1, TOTAL_MS, TOTAL_MS + 1]) {
    assert.deepEqual(skipCourseAhead(elapsed), {
      elapsedMs: Math.min(elapsed, TOTAL_MS),
      skippedMs: { warmup: 0, workout: 0, cooldown: 0 },
    });
  }
});

test("early cooldown and repeated next sections account for skipped time separately from actual activity", () => {
  assert.deepEqual(skipCourseAhead(90_000, 1_500_000), {
    elapsedMs: 1_500_000, skippedMs: { warmup: 210_000, workout: 1_200_000, cooldown: 0 },
  });
  let elapsed = 0, actual = 0;
  const skipped: Record<PhaseId, number> = { warmup: 0, workout: 0, cooldown: 0 };
  while (segmentAt(elapsed).next) {
    const advanced = advanceElapsed(elapsed, 750, true);
    actual += advanced - elapsed;
    const jump = skipCourseAhead(advanced);
    elapsed = jump.elapsedMs;
    for (const phase of PHASES) skipped[phase.id] += jump.skippedMs[phase.id];
    assert.equal(actual + Object.values(skipped).reduce((sum, time) => sum + time, 0), elapsed);
    // A paused course remains fixed at the new segment's beginning.
    assert.equal(advanceElapsed(elapsed, 750, false), elapsed);
  }
  actual += TOTAL_MS - elapsed;
  assert.equal(actual + Object.values(skipped).reduce((sum, time) => sum + time, 0), TOTAL_MS);
  assert.ok(actual < 70_000);
  assert.ok(PHASES.every(phase => skipped[phase.id] > 0));
});

test("course skipping never moves backwards or propagates invalid time", () => {
  for (const target of [90_000, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(skipCourseAhead(90_000, target), {
      elapsedMs: 90_000, skippedMs: { warmup: 0, workout: 0, cooldown: 0 },
    });
  }
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.deepEqual(skipCourseAhead(invalid), {
      elapsedMs: 0, skippedMs: { warmup: 0, workout: 0, cooldown: 0 },
    });
  }
});

test("low-impact adaptations cover jump movements without changing course timing", () => {
  const before = JSON.stringify(COURSE);
  for (const segment of COURSE) {
    assert.equal(moveLabel(segment, false), segment.label);
    assert.equal(moveCue(segment, false), segment.cue);
    assert.ok(moveLabel(segment, true).length > 0 && moveCue(segment, true).length > 0);
    if (segment.phase !== "workout" || segment.kind === "recovery") {
      assert.equal(moveLabel(segment, true), segment.label);
      assert.equal(moveCue(segment, true), segment.cue);
    }
  }
  assert.equal(moveLabel(COURSE.find((segment) => segment.move === "jack")!, true), "无跳开合步");
  assert.match(moveCue(COURSE.find((segment) => segment.move === "skater")!, true), /不跳跃/);
  assert.equal(JSON.stringify(COURSE), before);
});

test("support stays stable between cues, varies across the course, and avoids performance claims", () => {
  const messages = new Set<string>();
  for (const segment of COURSE) {
    assert.equal(empowermentAt(segment, 0), empowermentAt(segment, 14_999));
    for (let within = 0; within < segment.durationMs; within += 15_000) {
      const message = empowermentAt(segment, within);
      assert.equal(typeof message, "string");
      assert.ok(message.length > 10);
      assert.doesNotMatch(message, /减掉|消耗.*卡|动作.*标准|偷懒|必须坚持|不能停|燃掉|更瘦/);
      messages.add(message);
    }
    assert.equal(empowermentAt(segment, Number.NaN), empowermentAt(segment, 0));
    assert.equal(empowermentAt(segment, -1), empowermentAt(segment, 0));
  }
  assert.ok(messages.size >= 45, `${messages.size} distinct lines`);
});
