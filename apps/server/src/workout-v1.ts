// Frozen v1 contract: only for validation/migration of existing courses.
// Browser-safe shared choreography and scheduling contract. No personal data.
export const WORKOUT_MS = 300_000;
export const WORKOUT_REWARD = 200;
export const MOVES = [
  { id: "march", name: "原地踏步", cue: "轻轻抬脚，手臂一起摆", intensity: 1, reps: 10, seconds: 2, jump: false },
  { id: "step", name: "左右点步", cue: "向旁边点一点，再收回来", intensity: 1, reps: 10, seconds: 2, jump: false },
  { id: "heels", name: "踮脚长高", cue: "脚跟慢慢抬起，再轻轻放下", intensity: 1, reps: 10, seconds: 2, jump: false },
  { id: "reach", name: "伸手摘星", cue: "双手向上伸，肩膀放轻松", intensity: 1, reps: 10, seconds: 2, jump: false },
  { id: "tap", name: "脚跟点地", cue: "脚跟向前点，左右换一换", intensity: 1, reps: 10, seconds: 2, jump: false },
  { id: "arms", name: "小鸟开合臂", cue: "手臂打开，再抱一抱自己", intensity: 1, reps: 10, seconds: 2, jump: false },
  { id: "knees", name: "交替抬膝", cue: "慢慢抬膝，站稳再换脚", intensity: 2, reps: 6, seconds: 3, jump: false },
  { id: "squat", name: "浅蹲起", cue: "屁股向后坐一点，脚跟不离地", intensity: 3, reps: 4, seconds: 5, jump: false },
  { id: "side", name: "小树侧伸展", cue: "轻轻向旁边伸，不用弯很低", intensity: 1, reps: 6, seconds: 3, jump: false },
  { id: "cross", name: "交叉碰膝", cue: "右手找左膝，再换另一边", intensity: 2, reps: 6, seconds: 3, jump: false },
  { id: "jack", name: "开合跳", cue: "脚和手一起打开，轻轻落地", intensity: 3, reps: 4, seconds: 4, jump: true },
  { id: "hop", name: "轻轻小跳", cue: "只跳一点点，膝盖软软落地", intensity: 3, reps: 4, seconds: 4, jump: true },
] as const;
export type MoveId = typeof MOVES[number]["id"];
export const DEFAULT_MOVES: MoveId[] = MOVES.filter(m => !m.jump).map(m => m.id);
export const moveById = (id: MoveId) => MOVES.find(m => m.id === id)!;
export function validPool(raw: unknown): raw is MoveId[] {
  return Array.isArray(raw) && raw.length > 0 && raw.length <= MOVES.length
    && new Set(raw).size === raw.length && raw.every(id => MOVES.some(m => m.id === id));
}
export type Stage = { kind: "warmup" | "move" | "rest" | "cooldown"; move: MoveId; durationMs: number; round: number };
export function validPlan(raw: unknown): raw is Stage[] {
  if (!Array.isArray(raw) || raw.length !== 14) return false;
  const plan = raw as Stage[];
  if (plan.some(s => !s || !validPool([s.move]))) return false;
  if (plan[0].kind !== "warmup" || plan[0].move !== "march" || plan[0].round !== 0 || plan[0].durationMs !== 30_000
    || plan[13].kind !== "cooldown" || plan[13].move !== "reach" || plan[13].round !== 7 || plan[13].durationMs !== 30_000) return false;
  for (let round = 1; round <= 6; round++) {
    const action = plan[round * 2 - 1], rest = plan[round * 2], move = moveById(action.move);
    if (action.kind !== "move" || rest.kind !== "rest" || action.round !== round || rest.round !== round
      || action.move !== rest.move || action.durationMs !== move.reps * move.seconds * 1000
      || rest.durationMs !== 40_000 - action.durationMs) return false;
  }
  return true;
}
export function makePlan(pool: MoveId[], random = Math.random): Stage[] {
  if (!validPool(pool)) throw new Error("INVALID_WORKOUT_POOL");
  const stages: Stage[] = [{ kind: "warmup", move: "march", durationMs: 30_000, round: 0 }];
  let bag: MoveId[] = [], previous: MoveId | undefined;
  for (let round = 1; round <= 6; round++) {
    if (!bag.length) bag = [...pool];
    const alternatives = bag.filter(id => id !== previous);
    const choices = alternatives.length ? alternatives : bag;
    // Avoid consecutive demanding groups when the pool offers a gentler option.
    const gentle = previous && moveById(previous).intensity === 3
      ? choices.filter(id => moveById(id).intensity < 3) : [];
    const options = gentle.length ? gentle : choices;
    const id = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
    bag = bag.filter(item => item !== id); previous = id;
    const move = moveById(id), durationMs = move.reps * move.seconds * 1000;
    stages.push({ kind: "move", move: id, durationMs, round });
    stages.push({ kind: "rest", move: id, durationMs: 40_000 - durationMs, round });
  }
  stages.push({ kind: "cooldown", move: "reach", durationMs: 30_000, round: 7 });
  return stages;
}
export function stageAt(plan: Stage[], elapsed: number) {
  let start = 0;
  for (let index = 0; index < plan.length; index++) {
    const stage = plan[index];
    if (elapsed < start + stage.durationMs || index === plan.length - 1)
      return { stage, index, localMs: Math.max(0, Math.min(stage.durationMs, elapsed - start)) };
    start += stage.durationMs;
  }
  throw new Error("EMPTY_WORKOUT");
}
// Hidden tabs, suspended devices and pauses never create elapsed exercise time.
export function advanceWorkout(elapsed: number, delta: number, running: boolean) {
  return running && Number.isFinite(delta) && delta >= 0 && delta <= 1000
    ? Math.min(WORKOUT_MS, elapsed + delta) : elapsed;
}
