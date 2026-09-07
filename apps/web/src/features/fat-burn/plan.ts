export type PhaseId = "warmup" | "workout" | "cooldown";

export type MoveId =
  | "march" | "step" | "heel-dig" | "reach" | "knee-drive"
  | "punch" | "squat" | "skater" | "jack" | "hamstring-curl"
  | "side-stretch" | "calf-stretch" | "quad-stretch" | "chest-open" | "breathe"
  | "chair-stand" | "wall-push" | "bottle-row" | "hip-hinge" | "calf-raise" | "wall-plank"
  | "glute-bridge" | "heel-slide" | "bird-dog" | "shoulder-roll" | "hamstring-stretch"
  | "floor-rest" | "quadruped-rest";

type MovementPattern = "knee" | "push" | "pull" | "hinge" | "calf" | "trunk";

export interface WorkoutSegment {
  id: string;
  phase: PhaseId;
  kind: "move" | "recovery";
  move: MoveId;
  label: string;
  cue: string;
  durationMs: number;
  startMs: number;
  endMs: number;
  /** Music pulse only: never a measured heart rate, intensity, or movement speed. */
  bpm: number;
  /** One movement cycle / one anatomical side; independent of music BPM. */
  beatMs: number;
  round: number | null;
  side?: "left" | "right";
  purpose: "aerobic" | "strength" | "mobility" | "rest" | "warmup" | "cooldown";
  /** This floor is immutable for presets: turning off small-amplitude mode cannot add jumps. */
  lowImpact: boolean;
  prescription?: string;
  movementPattern?: MovementPattern;
  repsPerSide?: number;
  /** Recovery uses this movement's starting pose, with animation held at zero. */
  previewPose?: MoveId;
  /** A full resting interval is reserved for getting into the next position. */
  transition?: "to-floor" | "to-quadruped" | "to-standing";
}

export interface WorkoutCourse {
  id: string;
  title: string;
  category: "cardio" | "strength" | "recovery";
  description: string;
  equipment: readonly string[];
  intensity: string;
  guidance: string;
  totalMs: number;
  phases: readonly { id: PhaseId; label: string; durationMs: number; startMs: number; endMs: number; bpm: number }[];
  segments: readonly WorkoutSegment[];
  sets: number | null;
  /** Planned aerobic opportunity, conditional on the talk test; never measured exercise credit. */
  aerobicCandidateMs: number;
}

const MOVES: Record<MoveId, { label: string; cue: string; beatMs: number }> = {
  march: { label: "舒适踏步", cue: "脚掌轻落，手臂自然摆动；跟自己的呼吸走。", beatMs: 700 },
  step: { label: "左右侧步", cue: "向侧迈步再并拢，膝盖微屈，双臂自然摆动；始终有脚着地。", beatMs: 900 },
  "heel-dig": { label: "脚跟点地", cue: "脚跟向前轻点，脚尖朝上，左右交替。", beatMs: 1_100 },
  reach: { label: "交替向上伸展", cue: "左右手轮流向上伸，肩膀放松，身体不后仰。", beatMs: 3_000 },
  "knee-drive": { label: "舒适提膝", cue: "站稳后交替提膝，抬到舒适高度；提膝时呼气。", beatMs: 1_000 },
  punch: { label: "节奏直拳", cue: "双膝微屈，左右交替向前出拳；手肘不锁死，肩颈放松。", beatMs: 1_000 },
  squat: { label: "舒适浅蹲", cue: "双脚站稳，臀部向后坐，膝盖跟脚尖同向；只到舒适深度，起身呼气。", beatMs: 4_000 },
  skater: { label: "滑冰侧步", cue: "向侧迈步，另一脚向侧后方轻点；不跳跃、不交叉过深。", beatMs: 1_500 },
  jack: { label: "无跳开合步", cue: "左右轮流向外点步，始终有一只脚着地；手臂抬到舒适高度。", beatMs: 1_200 },
  "hamstring-curl": { label: "交替后勾腿", cue: "左右脚跟轮流轻轻靠近臀部，膝盖朝下，手臂自然拉回。", beatMs: 1_000 },
  "side-stretch": { label: "体侧伸展", cue: "双脚站稳，手臂向上延伸，身体轻轻侧弯；保持呼吸，不弹震。", beatMs: 8_000 },
  "calf-stretch": { label: "小腿拉伸", cue: "前后站稳，后脚跟贴地，前膝轻弯；只到舒适牵拉感，可扶墙保持平衡。", beatMs: 8_000 },
  "quad-stretch": { label: "大腿前侧拉伸", cue: "可扶稳墙面，站立腿微屈，另一脚跟靠近臀部；膝盖向下，不强拉。", beatMs: 8_000 },
  "chest-open": { label: "舒展胸肩", cue: "双手轻放身后，肩膀向后向下，胸口自然打开；不憋气、不后仰。", beatMs: 8_000 },
  breathe: { label: "放松呼吸", cue: "双脚舒适站稳，双肩放下，自然吸气、慢慢呼气。", beatMs: 8_000 },
  "chair-stand": { label: "椅子坐站", cue: "椅子靠墙固定，双脚站稳。臀部慢慢坐到椅面再起身；起身呼气，需要时双手轻扶大腿。", beatMs: 4_000 },
  "wall-push": { label: "墙面俯卧撑", cue: "双手约与胸肩同高撑墙，手指向上，身体成直线；屈肘靠近墙面，再推回并呼气。双脚靠近墙面可减轻负荷。", beatMs: 4_000 },
  "bottle-row": { label: "水瓶俯身划船", cue: "双脚站稳、膝微屈，髋部后移，背部自然延长。双肘向身后拉、呼气，再慢慢放下。空手仅用于学习动作；熟悉后用合适的水瓶或轻哑铃提供阻力。", beatMs: 4_000 },
  "hip-hinge": { label: "髋铰链", cue: "膝盖轻弯，臀部向后推，背部自然延长；感受髋部折叠，再站直呼气，不弓背也不追求低。", beatMs: 4_000 },
  "calf-raise": { label: "扶椅提踵", cue: "手轻扶稳固椅背，双脚平行。脚跟慢慢抬起，再有控制地落下；身体站直，不憋气。", beatMs: 4_000 },
  "wall-plank": { label: "墙面支撑", cue: "双手撑墙、手肘不锁死，身体从头到脚保持舒适直线。正常呼吸，别塌腰；脚靠近墙可减轻负荷。", beatMs: 4_000 },
  "glute-bridge": { label: "臀桥", cue: "仰卧屈膝、双脚踩稳，呼气时轻抬臀部，身体到肩髋膝自然连线即可；慢慢放回，不顶腰。", beatMs: 4_000 },
  "heel-slide": { label: "仰卧交替脚跟滑动", cue: "仰卧屈膝，腰背保持舒适。脚跟贴垫慢慢向前滑，再收回；左右交替，腹部轻轻用力，正常呼吸。", beatMs: 5_000 },
  "bird-dog": { label: "四点跪姿腿后滑", cue: "双手双膝撑垫，背部平稳，双手保持着地。左右脚尖轮流贴垫向后滑，再收回；不抬手、不扭腰，每侧 4 次。", beatMs: 5_000 },
  "shoulder-roll": { label: "轻柔肩环绕", cue: "肩膀轻轻向上、向后、向下绕圈，缓慢连贯；不耸肩用力，不做到疼痛。", beatMs: 5_000 },
  "hamstring-stretch": { label: "大腿后侧拉伸", cue: "一脚向前、脚跟着地，后腿微屈。背部自然延长，臀部稍向后移；只到大腿后侧轻柔牵拉，可扶椅。", beatMs: 8_000 },
  "floor-rest": { label: "仰卧休息", cue: "留在垫上，屈膝踩稳，双肩放松；正常呼吸，需要更多时间就暂停。", beatMs: 8_000 },
  "quadruped-rest": { label: "跪姿休息", cue: "留在垫上，调整到舒适的跪姿，放松肩膀和手腕；需要更多时间就暂停。", beatMs: 8_000 },
};

type SegmentOptions = Partial<Omit<WorkoutSegment, "id" | "phase" | "move" | "durationMs" | "startMs" | "endMs" | "bpm">>;
type CourseDefinition = Pick<WorkoutCourse, "id" | "title" | "category" | "description" | "equipment" | "intensity" | "guidance" | "sets"> & { mainMinutes: 10 | 20 };

/** Course decisions and evidence precede choreography; see docs/FAT_BURN_PROGRAM.md. */
function buildCourse(definition: CourseDefinition): WorkoutCourse {
  const mainMs = definition.mainMinutes * 60_000;
  const totalMs = 600_000 + mainMs;
  const phases: WorkoutCourse["phases"] = Object.freeze([
    Object.freeze({ id: "warmup" as const, label: "热身", durationMs: 300_000, startMs: 0, endMs: 300_000, bpm: 104 }),
    Object.freeze({ id: "workout" as const, label: definition.category === "strength" ? "全身力量" : definition.category === "recovery" ? "舒缓活动" : "低冲击有氧", durationMs: mainMs, startMs: 300_000, endMs: 300_000 + mainMs, bpm: definition.category === "recovery" ? 90 : definition.category === "strength" ? 112 : definition.mainMinutes === 10 ? 118 : 126 }),
    Object.freeze({ id: "cooldown" as const, label: "整理放松", durationMs: 300_000, startMs: 300_000 + mainMs, endMs: totalMs, bpm: 84 }),
  ]);
  const segments: WorkoutSegment[] = [];
  let cursor = 0;
  const add = (phase: PhaseId, move: MoveId, durationMs: number, options: SegmentOptions = {}) => {
    segments.push(Object.freeze({
      id: `${definition.id}-${segments.length + 1}`,
      phase, kind: "move", move, ...MOVES[move], durationMs,
      startMs: cursor, endMs: cursor + durationMs,
      bpm: phases.find(item => item.id === phase)!.bpm,
      round: null, lowImpact: true,
      purpose: phase === "warmup" ? "warmup" : phase === "cooldown" ? "cooldown" : definition.category === "cardio" ? "aerobic" : definition.category === "strength" ? "strength" : "mobility",
      ...options,
    }));
    cursor += durationMs;
  };

  add("warmup", "march", 60_000, { label: "轻松踏步", beatMs: 1_100, cue: "先用小步活动起来，肩膀放松，给身体准备的时间。" });
  add("warmup", "step", 60_000, { label: "小幅侧步", beatMs: 1_400 });
  add("warmup", "shoulder-roll", 60_000);
  add("warmup", "heel-dig", 60_000, { beatMs: 1_600 });
  add("warmup", "hip-hinge", 60_000, { label: "轻幅髋部活动", beatMs: 6_000, cue: "空手、膝微屈，臀部只向后移一点，再慢慢站直；幅度小、用力轻，熟悉髋部折叠。" });

  if (definition.category === "cardio") {
    const sequence: readonly MoveId[] = ["march", "step", "heel-dig", "knee-drive", "hamstring-curl", "jack", "step", "knee-drive", "hamstring-curl", "march"];
    for (let minute = 0; minute < definition.mainMinutes; minute++) {
      const move = sequence[minute % sequence.length];
      add("workout", move, 60_000, {
        beatMs: MOVES[move].beatMs * (definition.mainMinutes === 10 ? 1.15 : 1),
        prescription: "能说话、但不轻松唱歌是中等强度的参考；若说话困难，立即减速或暂停。",
        cue: `${MOVES[move].cue} 能说话、但不轻松唱歌即可；需要时减速或暂停。`,
      });
    }
  } else if (definition.category === "strength") {
    const isA = definition.id.startsWith("strength-a-");
    const stations: readonly { move: MoveId; pattern: MovementPattern }[] = isA
      ? [{ move: "chair-stand", pattern: "knee" }, { move: "wall-push", pattern: "push" }, { move: "hip-hinge", pattern: "hinge" }, { move: "bottle-row", pattern: "pull" }, { move: "calf-raise", pattern: "calf" }, { move: "wall-plank", pattern: "trunk" }]
      : [{ move: "squat", pattern: "knee" }, { move: "wall-push", pattern: "push" }, { move: "bottle-row", pattern: "pull" }, { move: "glute-bridge", pattern: "hinge" }, { move: "heel-slide", pattern: "trunk" }, { move: "bird-dog", pattern: "trunk" }];
    for (const { move, pattern } of stations) {
      for (let set = 1; set <= definition.sets!; set++) {
        const isHold = move === "wall-plank";
        const alternating = move === "heel-slide" || move === "bird-dog";
        const prescription = isHold ? "最多保持 20 秒，呼吸自然；随时可提前休息。"
          : alternating ? "40 秒练习窗，左右各 4 次；少做也可以，做够即可休息。"
            : "40 秒练习窗，约 4 秒一次，共 8–10 次；新手可从 5 次开始，做够即可休息。";
        add("workout", move, isHold ? 20_000 : 40_000, {
          round: set, movementPattern: pattern, prescription,
          ...(alternating ? { repsPerSide: 4 } : {}),
          cue: `${MOVES[move].cue} ${prescription}`,
        });
        const lastSet = set === definition.sets;
        const transition = !isA && lastSet
          ? move === "bottle-row" ? "to-floor" : move === "heel-slide" ? "to-quadruped" : move === "bird-dog" ? "to-standing" : undefined
          : undefined;
        const restMove: MoveId = move === "glute-bridge" || move === "heel-slide" ? "floor-rest" : move === "bird-dog" ? "quadruped-rest" : "breathe";
        const previewPose: MoveId = restMove;
        const transitionCopy = transition === "to-floor"
          ? { label: "换位准备 · 慢慢到垫上", cue: "放好水瓶，铺稳垫子。用这 60 秒慢慢坐下、侧身转为仰卧屈膝；准备好再继续，需要更多时间就暂停。" }
          : transition === "to-quadruped"
            ? { label: "换位准备 · 转为四点跪姿", cue: "先侧身，用手支撑，慢慢转为双手双膝撑垫。调整手腕与膝盖位置；这 60 秒用于准备，需要时暂停。" }
            : transition === "to-standing"
              ? { label: "换位准备 · 慢慢起身", cue: "先在垫上缓一缓，再借稳固椅子支撑、经半跪慢慢起身。完整 60 秒用于准备，不着急；站稳后才慢步，不适就暂停。" }
              : { label: `组间休息 · ${MOVES[restMove].label}`, cue: restMove === "breathe" ? "保持舒适站姿，放下用力、自然呼吸。用这段时间恢复；做够次数后不用追着示范继续。" : MOVES[restMove].cue };
        add("workout", restMove, isHold ? 80_000 : 60_000, {
          kind: "recovery", purpose: "rest", round: set, previewPose, transition,
          ...transitionCopy,
          prescription: lastSet ? "充分休息并准备下一动作；需要更多时间可暂停。" : "本动作下一组前充分休息；保持原处，不必起身换位。",
        });
      }
    }
  } else {
    add("workout", "march", 60_000, { beatMs: 1_300, label: "舒缓慢步" });
    add("workout", "shoulder-roll", 60_000, { beatMs: 6_000 });
    add("workout", "hip-hinge", 60_000, { beatMs: 6_000, label: "轻幅髋部活动" });
    add("workout", "step", 60_000, { beatMs: 1_800, label: "舒适侧步" });
    add("workout", "reach", 60_000, { beatMs: 4_000 });
    for (const side of ["left", "right"] as const) {
      add("workout", "side-stretch", 30_000, { side, label: `体侧伸展 · ${side === "left" ? "左侧" : "右侧"}`, prescription: "舒适保持 30 秒，不弹震、不忍痛。" });
    }
    add("workout", "chest-open", 30_000);
    add("workout", "march", 60_000, { beatMs: 1_400, label: "放松慢步" });
    add("workout", "shoulder-roll", 30_000, { beatMs: 6_000 });
    add("workout", "breathe", 30_000);
    for (const side of ["left", "right"] as const) {
      add("workout", "calf-stretch", 30_000, { side, label: `小腿拉伸 · ${side === "left" ? "左侧" : "右侧"}`, prescription: "舒适保持 30 秒，不弹震、不忍痛。" });
    }
    add("workout", "breathe", 30_000);
  }

  add("cooldown", "march", 60_000, { label: "慢步降速", beatMs: 1_100, cue: "慢慢减小步幅，让呼吸平稳下来；不要突然停住。还很喘时可暂停，多慢步一会儿。" });
  add("cooldown", "march", 60_000, { label: "轻步放缓", beatMs: 1_500, cue: "继续轻轻走动，肩膀放松；呼吸平稳后，再进入轻柔拉伸。" });
  for (const move of ["calf-stretch", "hamstring-stretch"] as const) {
    for (const side of ["left", "right"] as const) {
      const sideLabel = side === "left" ? "左侧" : "右侧";
      add("cooldown", move, 30_000, { side, label: `${MOVES[move].label} · ${sideLabel}`, cue: `${sideLabel}舒适保持约 30 秒。${MOVES[move].cue}`, prescription: "轻柔牵拉，不弹震、不忍痛。" });
    }
  }
  add("cooldown", "chest-open", 30_000);
  add("cooldown", "breathe", 30_000);
  if (cursor !== totalMs) throw new Error(`Invalid preset duration: ${definition.id}`);
  const { mainMinutes: _mainMinutes, ...metadata } = definition;
  return Object.freeze({ ...metadata, equipment: Object.freeze([...definition.equipment]), totalMs, phases, segments: Object.freeze(segments), aerobicCandidateMs: segments.filter(segment => segment.purpose === "aerobic").reduce((sum, segment) => sum + segment.durationMs, 0) });
}

const CARDIO_GUIDANCE = "全程不跳跃。以能说话、但不轻松唱歌为中等强度参考，按自己的感受减速或暂停；音乐不决定运动速度。";
const STRENGTH_GUIDANCE = "每次约 4 秒，做够即可休息，不必做满练习窗。呼气用力、不憋气；同一肌群的力量课至少隔一天。空手仅学动作，不替代有阻力的划船；熟练后按余力增加负荷。";
export const PRESET_COURSES: readonly WorkoutCourse[] = Object.freeze([
  buildCourse({ id: "restart-20", title: "轻松起步", category: "cardio", description: "给较少运动、重新开始的你：5 分钟热身，10 分钟低冲击有氧，5 分钟整理。", equipment: [], intensity: "从轻松起步，逐渐接近中等强度", guidance: CARDIO_GUIDANCE, sets: null, mainMinutes: 10 }),
  buildCourse({ id: "cardio-30", title: "低冲击有氧", category: "cardio", description: "适应起步课后，逐渐延长到 20 分钟有氧主段；全程以稳定、舒适为先。", equipment: [], intensity: "以谈话测试调整到个人中等强度", guidance: CARDIO_GUIDANCE, sets: null, mainMinutes: 20 }),
  buildCourse({ id: "strength-a-20", title: "全身力量 A · 一组起步", category: "strength", description: "6 个站立力量动作各 1 组，先学习坐站、推、拉、髋部与核心控制。", equipment: ["靠墙固定的稳固椅子", "牢固墙面", "两只水瓶或轻哑铃（用于划船阻力）"], intensity: "轻负荷学习，保留余力", guidance: STRENGTH_GUIDANCE, sets: 1, mainMinutes: 10 }),
  buildCourse({ id: "strength-a-30", title: "全身力量 A · 两组练习", category: "strength", description: "熟悉 A 课后，每个动作增加到 2 组；同一动作两组完成后再换站。", equipment: ["靠墙固定的稳固椅子", "牢固墙面", "两只水瓶或轻哑铃（用于划船阻力）"], intensity: "保持动作稳定，逐渐增加练习量", guidance: STRENGTH_GUIDANCE, sets: 2, mainMinutes: 20 }),
  buildCourse({ id: "strength-b-20", title: "全身力量 B · 一组起步", category: "strength", description: "6 个动作各 1 组，加入臀桥、脚跟滑动与简化鸟狗；含充分的上下垫准备。", equipment: ["防滑运动垫", "牢固墙面", "稳固椅子（起身扶持）", "两只水瓶或轻哑铃（用于划船阻力）"], intensity: "轻负荷学习，核心控制与自然呼吸", guidance: STRENGTH_GUIDANCE, sets: 1, mainMinutes: 10 }),
  buildCourse({ id: "strength-b-30", title: "全身力量 B · 两组练习", category: "strength", description: "熟悉 B 课后，每个动作增加到 2 组；地面动作集中完成，减少反复起落。", equipment: ["防滑运动垫", "牢固墙面", "稳固椅子（起身扶持）", "两只水瓶或轻哑铃（用于划船阻力）"], intensity: "保持控制，逐渐增加练习量", guidance: STRENGTH_GUIDANCE, sets: 2, mainMinutes: 20 }),
  buildCourse({ id: "recovery-20", title: "舒缓恢复", category: "recovery", description: "轻松慢步、关节活动和短时舒展；适合恢复日，不计作中等强度有氧。", equipment: ["稳固椅子或墙面（可选扶持）"], intensity: "轻松舒适，能够自在交谈", guidance: "轻柔活动，不追求出汗或拉伸幅度；需要时休息，今天也可以选择完全休息。", sets: null, mainMinutes: 10 }),
]);
export const DEFAULT_COURSE = PRESET_COURSES[0];
export function getCourse(id: unknown): WorkoutCourse {
  return PRESET_COURSES.find(course => course.id === id) ?? DEFAULT_COURSE;
}
/** Compatibility aliases refer to the default beginner course. */
export const COURSE = DEFAULT_COURSE.segments;
export const PHASES = DEFAULT_COURSE.phases;
export const TOTAL_MS = DEFAULT_COURSE.totalMs;

function boundedElapsed(elapsedMs: number, course: WorkoutCourse): number {
  return Number.isFinite(elapsedMs) ? Math.max(0, Math.min(course.totalMs, elapsedMs)) : 0;
}

/** Boundaries belong to the next segment; completion retains the final pose at zero remaining. */
export function segmentAt(elapsedMs: number, course: WorkoutCourse = DEFAULT_COURSE): {
  segment: WorkoutSegment; index: number; withinMs: number; remainingMs: number; next: WorkoutSegment | null;
} {
  const elapsed = boundedElapsed(elapsedMs, course);
  let low = 0;
  let high = course.segments.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (elapsed < course.segments[middle].endMs) high = middle;
    else low = middle + 1;
  }
  const segment = course.segments[low];
  const withinMs = Math.min(segment.durationMs, Math.max(0, elapsed - segment.startMs));
  return { segment, index: low, withinMs, remainingMs: segment.durationMs - withinMs, next: course.segments[low + 1] ?? null };
}

/** Ignore suspended/background gaps; only bounded foreground frames advance the clock. */
export function advanceElapsed(elapsedMs: number, deltaMs: number, running: boolean, course: WorkoutCourse = DEFAULT_COURSE): number {
  const elapsed = boundedElapsed(elapsedMs, course);
  if (!running || !Number.isFinite(deltaMs) || deltaMs < 0 || deltaMs > 1_000) return elapsed;
  return Math.min(course.totalMs, elapsed + deltaMs);
}

/** Moving the cursor never credits skipped time as exercise or rest actually taken. */
export function skipCourseAhead(elapsedMs: number, targetMs?: number, course: WorkoutCourse = DEFAULT_COURSE): {
  elapsedMs: number; skippedMs: Record<PhaseId, number>;
} {
  const elapsed = boundedElapsed(elapsedMs, course);
  const target = targetMs ?? segmentAt(elapsed, course).next?.startMs ?? elapsed;
  const destination = Number.isFinite(elapsedMs) && Number.isFinite(target) ? Math.max(elapsed, boundedElapsed(target, course)) : elapsed;
  return {
    elapsedMs: destination,
    skippedMs: { warmup: 0, workout: 0, cooldown: 0,
      ...Object.fromEntries(course.phases.map(phase => [phase.id, Math.max(0, Math.min(destination, phase.endMs) - Math.max(elapsed, phase.startMs))])),
    },
  };
}

const SMALL_AMPLITUDE: Partial<Record<MoveId, { label: string; cue: string }>> = {
  jack: { label: "小幅无跳开合步", cue: "左右轮流向外点小步，始终有脚着地；手臂轻轻打开，不必过肩。" },
  skater: { label: "小幅侧后点步", cue: "向侧迈小步，另一脚向侧后轻点；不跳跃、不交叉过深。" },
  "knee-drive": { label: "轻抬膝", cue: "站稳再轻抬膝，抬低一点也很好；可以隔拍慢做，不必追赶。" },
  step: { label: "轻盈侧步", cue: "左右迈小步再并拢，不跳跃，手臂自然摆动。" },
  march: { label: "轻松小步", cue: "脚步放轻，膝盖抬低一些；跟着舒服的呼吸走，也可以隔拍慢做。" },
  "hamstring-curl": { label: "轻松后勾腿", cue: "左右轮流轻勾脚跟，站稳后再换边；幅度小一点也可以。" },
};
export function moveLabel(segment: WorkoutSegment, smallAmplitude: boolean): string {
  return smallAmplitude && segment.purpose === "aerobic" ? SMALL_AMPLITUDE[segment.move]?.label ?? segment.label : segment.label;
}
export function moveCue(segment: WorkoutSegment, smallAmplitude: boolean): string {
  const alternative = smallAmplitude && segment.purpose === "aerobic" ? SMALL_AMPLITUDE[segment.move]?.cue : undefined;
  return alternative ? `${alternative} ${segment.prescription ?? ""}`.trim() : segment.cue;
}

const WARMUP_SUPPORT = [
  "这段时间，也可以属于你自己。很高兴陪你开始。",
  "先不用做到最好，愿意给自己一点时间，就很珍贵。",
  "今天的力气有多少，就用多少；你可以照顾自己的节奏。",
  "把肩膀放松一点，把注意力轻轻带回自己。",
  "如果今天很忙，愿意停下来照顾自己，已经很不容易。",
  "慢慢进入状态就好，我们给身体一点准备的时间。",
  "你有权把自己的需要，也放进今天的安排里。",
  "这一刻不用回应所有事情，先听听自己的呼吸。",
  "动作大小由你决定，舒服和稳定都值得被放在前面。",
  "运动可以是送给自己的陪伴，不必变成又一项任务。",
];

const WORKOUT_SUPPORT = [
  "这一段属于你，试着把每一步都走成自己的节奏。",
  "愿意开始和愿意照顾自己，都值得一句赞许。",
  "不需要和任何人比较，今天的你有自己的步调。",
  "给自己留出空间，是一件很有力量的事。",
  "生活里要兼顾的事很多；这里，可以先把注意力留给自己。",
  "轻一点、慢一点，也是在认真对待身体。",
  "需要休息时就休息，主动调整也是一种力量。",
  "让音乐陪着你，动作做到舒服的范围就好。",
  "这一小段自我照顾，也有它独一份的分量。",
  "你不必一直照顾所有人，也值得得到自己的关心。",
  "可以给自己一点鼓励：我正在为自己留时间。",
  "不用证明什么，能感受自己，就是此刻很好的方向。",
  "有精神就舒展一些，有点累就把步子放小。",
  "今天的状态可以和昨天不同，你的节奏由你决定。",
  "认真听身体说话，这份温柔也很有力量。",
  "把呼气慢慢送出去，下一拍仍然可以从容。",
  "这一刻，你的感受比屏幕上的节拍更重要。",
  "不跳跃也可以尽兴，属于你的方式一样值得尊重。",
  "生活再忙，也愿你有一些只为自己而动的时刻。",
  "允许自己轻松一点，这也是长久陪伴自己的方式。",
  "每次愿意重新开始，都可以是新的起点。",
  "你可以随时暂停；这一段时间不会因此失去意义。",
  "把比较放下，把呼吸找回来，我们一小段一小段来。",
  "愿你在音乐里，留意到属于自己的轻快时刻。",
];

const RECOVERY_SUPPORT = [
  "现在一起缓一缓。休息是课程的一部分，你不用赶。",
  "保持舒适姿势、慢慢呼气，给自己一点回旋的空间。",
  "想喝水就按暂停，身体的需要值得被认真对待。",
  "可以试着说一句完整的话；如果很吃力，就把强度降下来。",
  "可以少做几次，找到能舒服继续的方式。",
  "不用把每一秒都用满，留些余地给自己。",
  "现在可以轻轻松开双手，也放松一下肩膀。",
  "休息没有亏欠感，照顾自己本来就包含停一停。",
];

const COOLDOWN_SUPPORT = [
  "接下来把节奏放下来，给自己一个温柔的收尾。",
  "不急着回到忙碌里，先陪自己的呼吸待一会儿。",
  "这段为自己留下的时间，值得被好好珍惜。",
  "拉伸做到舒服就好，不需要忍痛，也不用和画面比幅度。",
  "肩膀放下来，允许自己此刻什么也不用赶。",
  "不论今天做了多少，愿你记得照顾自己的这份心意。",
  "身体的感受值得被听见，今天如此，每一天也如此。",
  "带着一点轻松结束吧，你也值得被温柔照顾。",
  "给自己一句谢谢，谢谢自己留出了这段时间。",
  "愿接下来的日子，也有这样属于你自己的片刻。",
];

/** Stable for 15 seconds; encouragement never claims unobserved form or performance. */
export function empowermentAt(segment: WorkoutSegment, withinMs: number): string {
  const bucket = Math.floor(Math.max(0, Math.min(segment.durationMs - 1, Number.isFinite(withinMs) ? withinMs : 0)) / 15_000);
  const lines = segment.kind === "recovery" ? RECOVERY_SUPPORT : segment.phase === "warmup" ? WARMUP_SUPPORT : segment.phase === "cooldown" ? COOLDOWN_SUPPORT : WORKOUT_SUPPORT;
  // IDs include their course and local section, so every preset varies without a default-course lookup.
  const cueIndex = [...segment.id].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0);
  return lines[(cueIndex + bucket) % lines.length];
}
