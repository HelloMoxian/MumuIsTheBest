import assert from "node:assert/strict";
import test from "node:test";
import { getCourse, PRESET_COURSES } from "./plan";
import { cooldownDestination, WEEK_PLANS, weeklyAerobicRange } from "./program";

test("both weekly examples reference available courses and leave recovery between strength days", () => {
  const available = new Set(PRESET_COURSES.map(course => course.id));
  for (const days of Object.values(WEEK_PLANS)) {
    assert.equal(days.length, 7);
    const strengthDays: number[] = [];
    days.forEach((day, index) => {
      assert.ok(day.walkMinutes[0] >= 0 && day.walkMinutes[1] >= day.walkMinutes[0]);
      if (day.courseId) {
        assert.ok(available.has(day.courseId));
        if (getCourse(day.courseId).category === "strength") strengthDays.push(index);
      }
    });
    assert.equal(strengthDays.length, 2);
    const gap = strengthDays[1] - strengthDays[0];
    assert.ok(gap >= 2 && 7 - gap >= 2, "include recovery across the week boundary too");
    assert.equal(days.filter(day => day.courseId && getCourse(day.courseId).category === "recovery").length, 1);
  }
});

test("weekly aerobic opportunities count only main aerobic blocks and planned walks", () => {
  assert.deepEqual(weeklyAerobicRange(WEEK_PLANS.starting), [40, 60]);
  assert.deepEqual(weeklyAerobicRange(WEEK_PLANS.steady), [150, 150]);
  const nonAerobic = WEEK_PLANS.steady.filter(day => day.courseId && getCourse(day.courseId).category !== "cardio").map(day => ({ ...day, walkMinutes: [0, 0] as const }));
  assert.deepEqual(weeklyAerobicRange(nonAerobic), [0, 0], "strength, rest and stretching are not aerobic minutes");
  assert.deepEqual(weeklyAerobicRange([]), [0, 0]);
});

test("early cooldown from a mat movement retains time to get upright, including between exercises", () => {
  for (const id of ["strength-b-20", "strength-b-30"]) {
    const course = getCourse(id);
    const preparation = course.segments.find(segment => segment.transition === "to-standing")!;
    const cooldownStart = course.phases.find(phase => phase.id === "cooldown")!.startMs;
    assert.equal(preparation.durationMs, 60_000);
    assert.equal(preparation.endMs, cooldownStart);
    for (const segment of course.segments.filter(segment => ["glute-bridge", "heel-slide", "bird-dog", "floor-rest"].includes(segment.move) || ["to-floor", "to-quadruped"].includes(segment.transition ?? ""))) {
      assert.equal(cooldownDestination(course, segment.startMs + 500), preparation.startMs);
    }
    assert.equal(cooldownDestination(course, preparation.startMs + 500), preparation.startMs + 500);
    assert.equal(cooldownDestination(course, 50_000), cooldownStart);
  }
  const course = getCourse("restart-20");
  assert.equal(cooldownDestination(course, 50_000), 900_000);
});
