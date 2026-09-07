export type PhaseId = "warmup" | "workout" | "cooldown";

export type MoveId =
  | "march" | "step" | "heel-dig" | "reach" | "knee-drive"
  | "punch" | "squat" | "skater" | "jack" | "hamstring-curl"
  | "side-stretch" | "calf-stretch" | "quad-stretch" | "chest-open" | "breathe";

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
  /** Music pulse, not a measured heart rate or intensity. */
  bpm: number;
  /** Time per movement beat; a left/right action uses two movement beats. */
  beatMs: number;
  round: number | null;
  /** Anatomical side, never camera/screen direction. */
  side?: "left" | "right";
}

export const TOTAL_MS = 30 * 60_000;

export const PHASES = [
  { id: "warmup", label: "热身", durationMs: 300_000, startMs: 0, endMs: 300_000, bpm: 110 },
  { id: "workout", label: "活力运动", durationMs: 1_200_000, startMs: 300_000, endMs: 1_500_000, bpm: 132 },
  { id: "cooldown", label: "整理拉伸", durationMs: 300_000, startMs: 1_500_000, endMs: TOTAL_MS, bpm: 86 },
] as const;

const MOVES: Record<MoveId, { label: string; cue: string; beats: number }> = {
  march: { label: "活力踏步", cue: "脚掌轻落，手臂自然摆动；跟自己的呼吸走。", beats: 1 },
  step: { label: "左右律动步", cue: "向侧迈步再并拢，膝盖微屈，双臂跟着打开。", beats: 1 },
  "heel-dig": { label: "脚跟点地", cue: "脚跟向前轻点，脚尖朝上，左右交替。", beats: 2 },
  reach: { label: "交替向上伸展", cue: "左右手轮流向上伸，肩膀放松，身体不后仰。", beats: 2 },
  "knee-drive": { label: "交替提膝", cue: "站稳后交替提膝，抬到舒适高度；手臂自然配合，提膝时呼气。", beats: 1 },
  punch: { label: "节奏直拳", cue: "双膝微屈，左右交替向前出拳；手肘不锁死，肩颈放松。", beats: 1 },
  squat: { label: "力量蹲起", cue: "脚跟稳稳落地，臀部向后坐，膝盖跟脚尖同向；起身时呼气。", beats: 4 },
  skater: { label: "滑冰侧步", cue: "左右轻跃换重心，另一脚向侧后方轻点；落地缓冲，不追求跨大步。", beats: 2 },
  jack: { label: "活力开合跳", cue: "轻跳打开双脚与手臂，再轻落收回；保持膝盖柔软。", beats: 2 },
  "hamstring-curl": { label: "交替后勾腿", cue: "左右脚跟轮流靠近臀部，膝盖朝下，手臂自然拉回。", beats: 1 },
  "side-stretch": { label: "体侧伸展", cue: "双脚站稳，手臂向上延伸，身体轻轻侧弯；保持呼吸，不弹震。", beats: 8 },
  "calf-stretch": { label: "小腿拉伸", cue: "前后站稳，后脚跟贴地，前膝轻弯；保持呼吸，只到舒适牵拉感。", beats: 8 },
  "quad-stretch": { label: "大腿前侧拉伸", cue: "可扶稳墙面，站立腿微屈，另一脚跟靠近臀部；膝盖向下，不强拉。", beats: 8 },
  "chest-open": { label: "舒展胸肩", cue: "双手轻放身后，肩膀向后向下，胸口自然打开；不憋气、不后仰。", beats: 8 },
  breathe: { label: "放松呼吸", cue: "双脚舒适站稳，双肩放下，自然吸气、慢慢呼气。", beats: 8 },
};

// This fixed standing routine is product choreography, not a clinical prescription.
// Warm/cool guidance and 10–30s comfortable, non-bouncing holds:
// https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/warm-up-cool-down
// Relative intensity varies by person; music BPM does not classify the user's effort:
// https://www.cdc.gov/physical-activity-basics/adding-adults/what-counts.html
function buildCourse(): readonly WorkoutSegment[] {
  const result: WorkoutSegment[] = [];
  let cursor = 0;
  const add = (
    phase: PhaseId,
    move: MoveId,
    durationMs: number,
    options: Partial<Pick<WorkoutSegment, "kind" | "label" | "cue" | "round" | "side">> & { beats?: number } = {},
  ) => {
    const definition = MOVES[move];
    const bpm = PHASES.find((item) => item.id === phase)!.bpm;
    const { beats = definition.beats, ...overrides } = options;
    result.push(Object.freeze({
      id: `fat-burn-${result.length + 1}`,
      phase,
      kind: "move",
      move,
      label: definition.label,
      cue: definition.cue,
      durationMs,
      startMs: cursor,
      endMs: cursor + durationMs,
      bpm,
      beatMs: 60_000 / bpm * beats,
      round: null,
      ...overrides,
    }));
    cursor += durationMs;
  };

  add("warmup", "march", 60_000, { label: "轻松踏步", beats: 2, cue: "先用小步活动起来，肩膀放松，不急着加速。" });
  add("warmup", "step", 60_000, { label: "侧步唤醒", beats: 2 });
  add("warmup", "heel-dig", 60_000);
  add("warmup", "reach", 60_000);
  add("warmup", "hamstring-curl", 60_000, { label: "后勾腿热身", beats: 2 });

  const rounds: readonly (readonly MoveId[])[] = [
    ["step", "knee-drive", "punch", "squat", "jack"],
    ["skater", "punch", "hamstring-curl", "squat", "knee-drive"],
    ["jack", "knee-drive", "punch", "skater", "squat"],
    ["step", "hamstring-curl", "jack", "punch", "march"],
  ];
  rounds.forEach((moves, roundIndex) => {
    moves.forEach((move, slotIndex) => {
      add("workout", move, 45_000, { round: roundIndex + 1 });
      add("workout", "march", 15_000, {
        kind: "recovery",
        label: "缓步恢复",
        cue: slotIndex === 4
          ? "小步慢走，让呼吸缓下来；需要喝水时，随时暂停。"
          : "步子放小，慢慢呼气；可以调整到不跳跃，按自己的感受继续。",
        beats: 2,
        round: roundIndex + 1,
      });
    });
  });

  // Five one-minute blocks. Paired 30s segments give each anatomical side equal time.
  add("cooldown", "march", 60_000, {
    label: "慢步降速", beats: 2,
    cue: "步子越来越轻，让呼吸慢慢平稳；还很喘时可暂停，多缓步一会儿再拉伸。",
  });
  for (const move of ["calf-stretch", "quad-stretch", "side-stretch"] as const) {
    for (const side of ["left", "right"] as const) {
      const sideLabel = side === "left" ? "左侧" : "右侧";
      add("cooldown", move, 30_000, {
        side,
        label: `${MOVES[move].label} · ${sideLabel}`,
        cue: `${sideLabel}保持约 30 秒。${MOVES[move].cue}`,
      });
    }
  }
  add("cooldown", "chest-open", 30_000);
  add("cooldown", "breathe", 30_000);
  return Object.freeze(result);
}

export const COURSE = buildCourse();

function boundedElapsed(elapsedMs: number): number {
  return Number.isFinite(elapsedMs) ? Math.max(0, Math.min(TOTAL_MS, elapsedMs)) : 0;
}

/** Boundaries belong to the next segment; completion keeps the final pose at 0 remaining. */
export function segmentAt(elapsedMs: number): {
  segment: WorkoutSegment;
  index: number;
  withinMs: number;
  remainingMs: number;
  next: WorkoutSegment | null;
} {
  const elapsed = boundedElapsed(elapsedMs);
  let low = 0;
  let high = COURSE.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (elapsed < COURSE[middle].endMs) high = middle;
    else low = middle + 1;
  }
  const segment = COURSE[low];
  const withinMs = Math.min(segment.durationMs, Math.max(0, elapsed - segment.startMs));
  return { segment, index: low, withinMs, remainingMs: segment.durationMs - withinMs, next: COURSE[low + 1] ?? null };
}

/** Ignore background/suspend gaps instead of pretending the user kept exercising. */
export function advanceElapsed(elapsedMs: number, deltaMs: number, running: boolean): number {
  const elapsed = boundedElapsed(elapsedMs);
  if (!running || !Number.isFinite(deltaMs) || deltaMs < 0 || deltaMs > 1_000) return elapsed;
  return Math.min(TOTAL_MS, elapsed + deltaMs);
}

/** Move the course cursor forward without treating skipped time as activity. */
export function skipCourseAhead(elapsedMs: number, targetMs?: number): {
  elapsedMs: number;
  skippedMs: Record<PhaseId, number>;
} {
  const elapsed = boundedElapsed(elapsedMs);
  const target = targetMs ?? segmentAt(elapsed).next?.startMs ?? elapsed;
  const destination = Number.isFinite(elapsedMs) && Number.isFinite(target)
    ? Math.max(elapsed, boundedElapsed(target))
    : elapsed;
  return {
    elapsedMs: destination,
    skippedMs: {
      warmup: 0,
      workout: 0,
      cooldown: 0,
      ...Object.fromEntries(PHASES.map(phase => [phase.id,
        Math.max(0, Math.min(destination, phase.endMs) - Math.max(elapsed, phase.startMs)),
      ])),
    },
  };
}

const LOW_IMPACT: Partial<Record<MoveId, { label: string; cue: string }>> = {
  jack: { label: "无跳开合步", cue: "左右轮流向外点步，始终有一只脚着地；手臂抬到舒适高度。" },
  skater: { label: "侧后点步", cue: "向侧迈小步，另一脚向侧后方轻点；不跳跃、不交叉过深。" },
  "knee-drive": { label: "轻抬膝", cue: "站稳再轻抬膝，抬低一点也很好；可以隔拍慢做，不必追赶。" },
  squat: { label: "舒适浅蹲", cue: "脚跟贴地，臀部轻轻向后坐，只蹲到舒适深度；缓慢起身呼气。" },
  punch: { label: "轻快直拳", cue: "轻轻交替出拳，肩膀放松，手肘不锁死；需要时隔拍慢做。" },
  step: { label: "轻盈侧步", cue: "左右迈小步再并拢，不跳跃，手臂自然摆动。" },
  march: { label: "舒适踏步", cue: "脚步放轻，膝盖抬低一些；跟着舒服的呼吸走，也可以隔拍慢做。" },
  "hamstring-curl": { label: "轻松后勾腿", cue: "左右轮流轻勾脚跟，站稳后再换边；幅度小一点也可以。" },
};

export function moveLabel(segment: WorkoutSegment, lowImpact: boolean): string {
  return lowImpact && segment.phase === "workout" && segment.kind === "move"
    ? LOW_IMPACT[segment.move]?.label ?? segment.label
    : segment.label;
}

export function moveCue(segment: WorkoutSegment, lowImpact: boolean): string {
  return lowImpact && segment.phase === "workout" && segment.kind === "move"
    ? LOW_IMPACT[segment.move]?.cue ?? segment.cue
    : segment.cue;
}

const WARMUP_SUPPORT = [
  "这三十分钟，也可以属于你自己。很高兴陪你开始。",
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
  "慢步、呼气，给自己一点回旋的空间。",
  "想喝水就按暂停，身体的需要值得被认真对待。",
  "可以试着说一句完整的话；如果很吃力，就把强度降下来。",
  "切换到不跳跃也很好，找到能继续享受的方式。",
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

/** Stable for 15 seconds; praise never claims that unobserved movement/form was correct. */
export function empowermentAt(segment: WorkoutSegment, withinMs: number): string {
  const bucket = Math.floor(Math.max(0, Math.min(segment.durationMs - 1, Number.isFinite(withinMs) ? withinMs : 0)) / 15_000);
  const index = Math.max(0, COURSE.findIndex((item) => item.id === segment.id));
  const workoutIndex = Math.max(0, Math.floor((index - 5) / 2));
  if (segment.kind === "recovery") return RECOVERY_SUPPORT[workoutIndex % RECOVERY_SUPPORT.length];
  const lines = segment.phase === "warmup" ? WARMUP_SUPPORT : segment.phase === "cooldown" ? COOLDOWN_SUPPORT : WORKOUT_SUPPORT;
  const cueIndex = segment.phase === "workout" ? workoutIndex : index;
  return lines[(cueIndex * 3 + bucket) % lines.length];
}
