import assert from "node:assert/strict";
import test from "node:test";
import { advanceElapsed, COURSE, DEFAULT_COURSE, empowermentAt, getCourse, moveCue, moveLabel, PHASES, PRESET_COURSES, segmentAt, skipCourseAhead, TOTAL_MS, type PhaseId, type WorkoutCourse } from "./plan";

const strengthCourses = PRESET_COURSES.filter(course => course.category === "strength");
const main = (course: WorkoutCourse) => course.segments.filter(segment => segment.phase === "workout");

test("seven independent presets have the planned 5 / 10-or-20 / 5 timeline and safe lookup", () => {
  assert.deepEqual(PRESET_COURSES.map(course => course.id), ["restart-20", "cardio-30", "strength-a-20", "strength-a-30", "strength-b-20", "strength-b-30", "recovery-20"]);
  assert.equal(DEFAULT_COURSE.id, "restart-20");
  assert.equal(COURSE, DEFAULT_COURSE.segments);
  assert.equal(PHASES, DEFAULT_COURSE.phases);
  assert.equal(TOTAL_MS, 1_200_000);
  for (const invalid of ["missing", "", null, undefined, [], {}, 0, Number.NaN]) assert.equal(getCourse(invalid), DEFAULT_COURSE);
  const allIds = PRESET_COURSES.flatMap(course => course.segments.map(segment => segment.id));
  assert.equal(new Set(allIds).size, allIds.length);
  for (const course of PRESET_COURSES) {
    assert.equal(getCourse(course.id), course);
    const mainDuration = course.id.endsWith("30") ? 1_200_000 : 600_000;
    assert.deepEqual(course.phases.map(phase => phase.id), ["warmup", "workout", "cooldown"]);
    assert.deepEqual(course.phases.map(phase => phase.durationMs), [300_000, mainDuration, 300_000]);
    assert.equal(course.totalMs, mainDuration + 600_000);
    let cursor = 0;
    for (const segment of course.segments) {
      assert.equal(segment.startMs, cursor);
      assert.equal(segment.endMs - segment.startMs, segment.durationMs);
      assert.ok(Number.isInteger(segment.durationMs) && segment.durationMs > 0);
      assert.ok(Number.isFinite(segment.beatMs) && segment.beatMs > 0);
      const phase = course.phases.find(item => item.id === segment.phase)!;
      assert.equal(segment.bpm, phase.bpm);
      assert.ok(segment.startMs >= phase.startMs && segment.endMs <= phase.endMs);
      cursor = segment.endMs;
    }
    assert.equal(cursor, course.totalMs);
    for (const phase of course.phases) {
      assert.equal(course.segments.filter(segment => segment.phase === phase.id).reduce((sum, segment) => sum + segment.durationMs, 0), phase.durationMs);
    }
    assert.ok(Object.isFrozen(course) && Object.isFrozen(course.segments) && course.segments.every(Object.isFrozen));
    assert.ok(Object.isFrozen(course.phases) && Object.isFrozen(course.equipment));
  }
});

test("aerobic prescriptions start low-impact and count only main aerobic opportunity", () => {
  for (const course of PRESET_COURSES) {
    assert.ok(course.segments.every(segment => segment.lowImpact), `${course.id} cannot become a jumping routine`);
    assert.ok(course.segments.every(segment => !["skater", "punch"].includes(segment.move)));
    const eligible = course.segments.filter(segment => segment.purpose === "aerobic");
    assert.ok(eligible.every(segment => segment.phase === "workout" && segment.kind === "move"));
    assert.equal(course.aerobicCandidateMs, eligible.reduce((sum, segment) => sum + segment.durationMs, 0));
    if (course.category === "cardio") {
      assert.equal(course.aerobicCandidateMs, course.id === "restart-20" ? 600_000 : 1_200_000);
      assert.ok(main(course).every(segment => segment.purpose === "aerobic" && segment.durationMs === 60_000));
      assert.deepEqual(new Set(main(course).map(segment => segment.move)), new Set(["march", "step", "heel-dig", "knee-drive", "hamstring-curl", "jack"]));
      assert.ok(eligible.every(segment => /能说话/.test(segment.prescription!) && /减速或暂停/.test(segment.cue)));
      assert.equal(moveLabel(eligible.find(segment => segment.move === "jack")!, false), "无跳开合步");
    } else assert.equal(course.aerobicCandidateMs, 0);
  }
});

test("strength courses cover the planned whole-body patterns and order", () => {
  for (const course of strengthCourses) {
    const active = main(course).filter(segment => segment.purpose === "strength");
    const isA = course.id.startsWith("strength-a");
    const expected = isA
      ? ["chair-stand", "wall-push", "hip-hinge", "bottle-row", "calf-raise", "wall-plank"]
      : ["squat", "wall-push", "bottle-row", "glute-bridge", "heel-slide", "bird-dog"];
    assert.deepEqual(active.map(segment => segment.move), expected.flatMap(move => Array<string>(course.sets!).fill(move)));
    for (const pattern of ["knee", "push", "pull", "hinge", "trunk"]) assert.ok(active.some(segment => segment.movementPattern === pattern));
    assert.ok(course.equipment.some(item => item.includes("墙")));
    assert.ok(course.equipment.some(item => item.includes("水瓶")));
    assert.match(course.guidance, /至少隔一天/);
    assert.ok(course.segments.some(segment => segment.phase === "warmup" && segment.move === "hip-hinge" && /幅度小/.test(segment.cue)));
  }
});

test("strength uses practice windows, controlled cycles, and a full resting interval after every set", () => {
  for (const course of strengthCourses) {
    const segments = main(course);
    assert.equal(segments.length, 12 * course.sets!);
    for (let index = 0; index < segments.length; index += 2) {
      const active = segments[index], rest = segments[index + 1];
      const hold = active.move === "wall-plank";
      const alternating = active.move === "heel-slide" || active.move === "bird-dog";
      assert.equal(active.purpose, "strength");
      assert.equal(active.durationMs, hold ? 20_000 : 40_000);
      assert.equal(active.beatMs, alternating ? 5_000 : 4_000);
      assert.notEqual(active.beatMs, 60_000 / active.bpm, "music cannot accelerate a strength repetition");
      assert.equal(rest.kind, "recovery");
      assert.equal(rest.purpose, "rest");
      assert.equal(rest.durationMs, hold ? 80_000 : 60_000);
      assert.equal(active.endMs, rest.startMs);
      assert.equal(rest.round, active.round);
      assert.equal(active.durationMs + rest.durationMs, 100_000);
      if (alternating) {
        assert.equal(active.repsPerSide, 4);
        assert.equal(active.durationMs / active.beatMs, 8);
        assert.match(active.cue, /左右各 4 次/);
      } else if (!hold) assert.match(active.prescription!, /8–10 次.*5 次/);
      if (rest.move === "breathe") assert.equal(rest.previewPose, "breathe", "standing recovery releases loaded positions");
      assert.notEqual(rest.move, "march", "strength rest is not compulsory cardio");
      if (course.sets === 2 && active.round === 1) {
        assert.equal(segments[index + 2].move, active.move, "repeat this station before changing position");
        assert.equal(segments[index + 2].round, 2);
        assert.equal(rest.transition, undefined);
      }
    }
  }
});

test("floor stations remain on the mat between sets with explicit slow transitions and 60 seconds to stand", () => {
  for (const course of strengthCourses.filter(item => item.id.startsWith("strength-b"))) {
    const segments = main(course);
    assert.deepEqual(segments.filter(segment => segment.transition).map(segment => segment.transition), ["to-floor", "to-quadruped", "to-standing"]);
    for (let index = 0; index < segments.length; index += 2) {
      const active = segments[index], rest = segments[index + 1];
      if (["glute-bridge", "heel-slide"].includes(active.move)) assert.equal(rest.previewPose, "floor-rest");
      if (active.move === "bird-dog") assert.equal(rest.previewPose, "quadruped-rest");
      if (rest.transition) {
        assert.equal(rest.durationMs, 60_000);
        assert.match(rest.cue, /慢慢|60 秒/);
        assert.match(rest.cue, /暂停/);
      }
    }
    const toFloor = segments.findIndex(segment => segment.transition === "to-floor");
    assert.equal(segments[toFloor - 1].move, "bottle-row");
    assert.equal(segments[toFloor + 1].move, "glute-bridge");
    const toQuadruped = segments.findIndex(segment => segment.transition === "to-quadruped");
    assert.equal(segments[toQuadruped - 1].move, "heel-slide");
    assert.equal(segments[toQuadruped + 1].move, "bird-dog");
    assert.equal(segments.at(-1)!.transition, "to-standing");
    assert.equal(segments.at(-1)!.durationMs, 60_000);
    assert.equal(segments.at(-1)!.endMs, course.phases[2].startMs);
    assert.ok(segments.slice(toFloor + 1).every(segment => ["glute-bridge", "heel-slide", "bird-dog", "floor-rest", "quadruped-rest"].includes(segment.move)));
  }
});

test("warmup precedes training and five-minute cooldown starts with two minutes of slowing down", () => {
  const staticMoves = new Set(["calf-stretch", "hamstring-stretch", "quad-stretch", "side-stretch", "chest-open"]);
  for (const course of PRESET_COURSES) {
    const warmup = course.segments.filter(segment => segment.phase === "warmup");
    assert.equal(warmup.length, 5);
    assert.ok(warmup.every(segment => segment.purpose === "warmup" && segment.durationMs === 60_000 && !staticMoves.has(segment.move)));
    const cooldown = course.segments.filter(segment => segment.phase === "cooldown");
    assert.deepEqual(cooldown.slice(0, 2).map(segment => [segment.move, segment.durationMs]), [["march", 60_000], ["march", 60_000]]);
    assert.ok(cooldown[1].beatMs > cooldown[0].beatMs);
    assert.equal(cooldown.at(-1)!.move, "breathe");
    for (const phase of course.phases) {
      const holds = course.segments.filter(segment => segment.phase === phase.id && staticMoves.has(segment.move));
      assert.ok(holds.every(segment => segment.durationMs >= 20_000 && segment.durationMs <= 30_000));
      for (const move of new Set(holds.filter(segment => segment.move !== "chest-open").map(segment => segment.move))) {
        const pair = holds.filter(segment => segment.move === move);
        assert.deepEqual(pair.map(segment => segment.side), ["left", "right"]);
        assert.equal(pair[0].durationMs, pair[1].durationMs);
        assert.equal(pair[0].endMs, pair[1].startMs);
      }
    }
  }
  const recovery = getCourse("recovery-20");
  assert.ok(main(recovery).every(segment => segment.purpose === "mobility"));
  assert.ok(main(recovery).some(segment => segment.move === "shoulder-roll"));
  assert.ok(main(recovery).some(segment => segment.move === "side-stretch"));
  assert.equal(recovery.aerobicCandidateMs, 0);
});

test("every boundary and completion uses the selected course, including the 20/30-minute variants", () => {
  for (const course of PRESET_COURSES) {
    for (let index = 0; index < course.segments.length; index++) {
      const segment = course.segments[index];
      const beginning = segmentAt(segment.startMs, course);
      assert.equal(beginning.segment, segment);
      assert.equal(beginning.index, index);
      assert.equal(beginning.withinMs, 0);
      assert.equal(beginning.remainingMs, segment.durationMs);
      assert.equal(beginning.next, course.segments[index + 1] ?? null);
      assert.equal(segmentAt(segment.endMs - 0.25, course).segment, segment);
      assert.equal(segmentAt(segment.endMs, course).segment, course.segments[index + 1] ?? segment);
    }
    assert.deepEqual(segmentAt(course.totalMs + 5_000, course), segmentAt(course.totalMs, course));
    assert.equal(segmentAt(course.totalMs, course).remainingMs, 0);
    assert.equal(segmentAt(course.totalMs, course).next, null);
    for (const invalid of [-10, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) assert.deepEqual(segmentAt(invalid, course), segmentAt(0, course));
  }
});

test("clock credits only running finite foreground frames and respects the chosen duration", () => {
  for (const course of PRESET_COURSES) {
    assert.equal(advanceElapsed(5_000, 100, true, course), 5_100);
    assert.equal(advanceElapsed(5_000, 100, false, course), 5_000);
    assert.equal(advanceElapsed(5_000, 1_000, true, course), 6_000);
    for (const invalid of [-1, 1_001, 60_000, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(advanceElapsed(5_000, invalid, true, course), 5_000);
    assert.equal(advanceElapsed(course.totalMs - 50, 100, true, course), course.totalMs);
    assert.equal(advanceElapsed(course.totalMs + 100, 100, true, course), course.totalMs);
    assert.equal(advanceElapsed(Number.NaN, 100, false, course), 0);
    assert.equal(advanceElapsed(-5, 10, true, course), 10);
    let elapsed = 0;
    for (let tick = 0; tick < course.totalMs / 1_000; tick++) elapsed = advanceElapsed(elapsed, 1_000, true, course);
    assert.equal(elapsed, course.totalMs);
  }
});

test("next section advances exactly once, preserves rest boundaries, and cannot skip the final breath", () => {
  for (const course of PRESET_COURSES) {
    for (let index = 0; index < course.segments.length - 1; index++) {
      const segment = course.segments[index];
      const halfway = segment.startMs + segment.durationMs / 2;
      const jump = skipCourseAhead(halfway, undefined, course);
      assert.equal(jump.elapsedMs, course.segments[index + 1].startMs);
      assert.equal(segmentAt(jump.elapsedMs, course).segment, course.segments[index + 1]);
      for (const phase of course.phases) assert.equal(jump.skippedMs[phase.id], phase.id === segment.phase ? segment.durationMs / 2 : 0);
    }
    for (const elapsed of [course.segments.at(-1)!.startMs, course.totalMs - 1, course.totalMs, course.totalMs + 1]) {
      assert.deepEqual(skipCourseAhead(elapsed, undefined, course), { elapsedMs: Math.min(elapsed, course.totalMs), skippedMs: { warmup: 0, workout: 0, cooldown: 0 } });
    }
  }
});

test("early cooldown and repeated skipping conserve actual foreground time plus skipped phase time", () => {
  for (const course of PRESET_COURSES) {
    assert.deepEqual(skipCourseAhead(90_000, course.phases[2].startMs, course), {
      elapsedMs: course.phases[2].startMs, skippedMs: { warmup: 210_000, workout: course.phases[1].durationMs, cooldown: 0 },
    });
    let elapsed = 0, actual = 0;
    const skipped: Record<PhaseId, number> = { warmup: 0, workout: 0, cooldown: 0 };
    while (segmentAt(elapsed, course).next) {
      const advanced = advanceElapsed(elapsed, 750, true, course);
      actual += advanced - elapsed;
      const jump = skipCourseAhead(advanced, undefined, course);
      elapsed = jump.elapsedMs;
      for (const phase of course.phases) skipped[phase.id] += jump.skippedMs[phase.id];
      assert.equal(actual + Object.values(skipped).reduce((sum, time) => sum + time, 0), elapsed);
      assert.equal(advanceElapsed(elapsed, 750, false, course), elapsed);
    }
    actual += course.totalMs - elapsed;
    assert.equal(actual + Object.values(skipped).reduce((sum, time) => sum + time, 0), course.totalMs);
    assert.ok(actual < 75_000);
    assert.ok(course.phases.every(phase => skipped[phase.id] > 0));
  }
});

test("invalid skip targets never rewind or inject activity", () => {
  for (const course of PRESET_COURSES) {
    for (const target of [90_000, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.deepEqual(skipCourseAhead(90_000, target, course), { elapsedMs: 90_000, skippedMs: { warmup: 0, workout: 0, cooldown: 0 } });
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) assert.deepEqual(skipCourseAhead(invalid, undefined, course), { elapsedMs: 0, skippedMs: { warmup: 0, workout: 0, cooldown: 0 } });
  }
});

test("small-amplitude controls preserve strength instructions and never mutate no-jump presets", () => {
  const before = JSON.stringify(PRESET_COURSES);
  for (const course of PRESET_COURSES) {
    for (const segment of course.segments) {
      assert.equal(moveLabel(segment, false), segment.label);
      assert.equal(moveCue(segment, false), segment.cue);
      assert.ok(moveLabel(segment, true).length > 0 && moveCue(segment, true).length > 0);
      if (segment.purpose !== "aerobic") {
        assert.equal(moveLabel(segment, true), segment.label);
        assert.equal(moveCue(segment, true), segment.cue);
      } else assert.match(moveCue(segment, true), /能说话/);
    }
  }
  assert.equal(JSON.stringify(PRESET_COURSES), before);
});

test("encouragement varies across every course without fixed-duration, performance, or standing-rest claims", () => {
  const messages = new Set<string>();
  for (const course of PRESET_COURSES) {
    const workoutMessages = new Set<string>();
    for (const segment of course.segments) {
      assert.equal(empowermentAt(segment, 0), empowermentAt(segment, 14_999));
      for (let within = 0; within < segment.durationMs; within += 15_000) {
        const message = empowermentAt(segment, within);
        assert.ok(message.length > 10);
        assert.doesNotMatch(message, /三十分钟|30 分钟|减掉|消耗.*卡|动作.*标准|偷懒|必须坚持|不能停|燃掉|更瘦/);
        if (segment.kind === "recovery") assert.doesNotMatch(message, /慢步|踏步|跳跃/);
        if (segment.phase === "workout") workoutMessages.add(message);
        messages.add(message);
      }
      assert.equal(empowermentAt(segment, Number.NaN), empowermentAt(segment, 0));
      assert.equal(empowermentAt(segment, -1), empowermentAt(segment, 0));
    }
    assert.ok(workoutMessages.size >= 12, `${course.id}: ${workoutMessages.size} workout messages`);
  }
  assert.ok(messages.size >= 45, `${messages.size} distinct lines`);
});
