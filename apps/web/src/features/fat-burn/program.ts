import { getCourse, segmentAt, type WorkoutCourse } from "./plan";

export interface WeekDay {
  day: string;
  courseId?: string;
  walkMinutes: readonly [number, number];
  note: string;
}

/** Examples, not a deadline or a measured activity record. Walking can be split up. */
export const WEEK_PLANS: Readonly<Record<"starting" | "steady", readonly WeekDay[]>> = {
  starting: [
    { day: "周一", courseId: "restart-20", walkMinutes: [0, 0], note: "先找能从容说话的节奏，累了可提前整理。" },
    { day: "周二", courseId: "strength-a-20", walkMinutes: [0, 0], note: "每个动作一组；先学会稳定地做。" },
    { day: "周三", walkMinutes: [10, 20], note: "可以拆成两次走，按当天状态选择时长。" },
    { day: "周四", courseId: "restart-20", walkMinutes: [0, 0], note: "重复熟悉的动作，不需要每次都加难度。" },
    { day: "周五", courseId: "recovery-20", walkMinutes: [0, 0], note: "也可以完全休息，尤其睡眠不足或还在酸痛时。" },
    { day: "周六", courseId: "strength-b-20", walkMinutes: [0, 0], note: "慢慢上下垫子，动作做够就休息。" },
    { day: "周日", walkMinutes: [10, 20], note: "轻松散步也有价值，不必为了数字硬撑。" },
  ],
  steady: [
    { day: "周一", courseId: "cardio-30", walkMinutes: [10, 10], note: "有氧主体 20 分钟，加一天中累计的快走。" },
    { day: "周二", courseId: "strength-a-30", walkMinutes: [15, 15], note: "力量与快走可分开完成，不需要一次做完。" },
    { day: "周三", walkMinutes: [30, 30], note: "给力量训练的肌肉留恢复时间。" },
    { day: "周四", courseId: "cardio-30", walkMinutes: [10, 10], note: "能说话、难唱歌；动作轻落地。" },
    { day: "周五", courseId: "strength-b-30", walkMinutes: [15, 15], note: "同一动作两组，休息后再做下一组。" },
    { day: "周六", walkMinutes: [30, 30], note: "可拆成三次 10 分钟快走。" },
    { day: "周日", courseId: "recovery-20", walkMinutes: [0, 0], note: "舒缓恢复或完全休息，按身体感受决定。" },
  ],
};

export function weeklyAerobicRange(days: readonly WeekDay[]): readonly [number, number] {
  return days.reduce<[number, number]>((sum, day) => {
    const courseMinutes = day.courseId ? getCourse(day.courseId).aerobicCandidateMs / 60_000 : 0;
    return [sum[0] + courseMinutes + day.walkMinutes[0], sum[1] + courseMinutes + day.walkMinutes[1]];
  }, [0, 0]);
}

/** Leaving a mat exercise early still reserves the authored time to get upright. */
export function cooldownDestination(course: WorkoutCourse, elapsedMs: number): number {
  const cooldownStart = course.phases.find(phase => phase.id === "cooldown")!.startMs;
  const current = segmentAt(elapsedMs, course).segment;
  const floorMoves = ["glute-bridge", "heel-slide", "bird-dog", "floor-rest", "quadruped-rest"];
  if (floorMoves.includes(current.move) || current.transition === "to-floor" || current.transition === "to-quadruped") {
    const preparation = course.segments.find(segment => segment.transition === "to-standing" && segment.endMs > elapsedMs);
    if (preparation) return Math.max(elapsedMs, preparation.startMs);
  }
  return cooldownStart;
}

export const PROGRAM_SCOPE = "适用于已恢复日常活动、无明确运动限制的成年人。这是一般健身安排，不是产后康复课程。";
export const PROGRAM_SOURCES = [
  { title: "CDC · 每周有氧与力量建议", href: "https://www.cdc.gov/physical-activity-basics/guidelines/adults.html" },
  { title: "CDC · 谈话测试与强度", href: "https://www.cdc.gov/physical-activity-basics/measuring/index.html" },
  { title: "ACSM · 2026 力量训练指南", href: "https://acsm.org/resistance-training-guidelines-update-2026/" },
  { title: "ACOG · 产后运动适用边界", href: "https://www.acog.org/womens-health/faqs/exercise-after-pregnancy" },
] as const;
