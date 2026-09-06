import { useId } from "react";
import type { MoveId } from "../../../../server/src/workout-contract";
type Point = [number, number, number];
export type Pose = { head: Point; chest: Point; hips: Point; shoulders: Point[]; elbows: Point[]; hands: Point[]; hip: Point[]; knees: Point[]; feet: Point[] };
const mix = (a: Point, b: Point, t: number): Point => a.map((v, i) => v + (b[i] - v) * t) as Point;
export function poseFor(move: MoveId | "rest", phase: number): Pose {
  const wave = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  const side = Math.floor(phase) % 2 === 0 ? 1 : 0;
  const p: Pose = {
    head: [0, 1.93, 0], chest: [0, 1.49, 0], hips: [0, 1, 0],
    shoulders: [[-.27, 1.58, 0], [.27, 1.58, 0]],
    elbows: [[-.38, 1.28, 0], [.38, 1.28, 0]],
    hands: [[-.34, 1.02, .06], [.34, 1.02, .06]],
    hip: [[-.16, 1, 0], [.16, 1, 0]],
    knees: [[-.17, .55, .12], [.17, .55, .12]],
    feet: [[-.18, .10, .06], [.18, .10, .06]],
  };
  const raiseArms = (amount: number) => {
    for (let i = 0; i < 2; i++) {
      const sign = i ? 1 : -1;
      p.elbows[i] = mix(p.elbows[i], [sign * .4, 1.91, 0], amount);
      p.hands[i] = mix(p.hands[i], [sign * .24, 2.23, .03], amount);
    }
  };
  if (move === "reach") raiseArms(wave);
  if (move === "arms") {
    for (let i = 0; i < 2; i++) {
      const sign = i ? 1 : -1;
      p.elbows[i] = mix([sign * .58, 1.5, 0], [sign * .22, 1.4, .3], wave);
      p.hands[i] = mix([sign * .87, 1.49, 0], [-sign * .15, 1.48, .36], wave);
    }
  }
  if (move === "march" || move === "knees" || move === "cross") {
    const height = move === "march" ? .13 : .38;
    p.feet[side][1] += height * wave;
    p.feet[side][2] += .08 * wave;
    p.knees[side][1] += height * wave;
    p.knees[side][2] += .35 * wave;
    p.elbows[1 - side][2] += .26 * wave;
    p.hands[1 - side] = mix(p.hands[1 - side],
      move === "cross" ? [p.knees[side][0], .98, .46] : [p.hands[1 - side][0], 1.43, .35], wave);
  }
  if (move === "step") {
    p.feet[side][0] += (side ? 1 : -1) * .34 * wave;
    p.knees[side][0] += (side ? 1 : -1) * .15 * wave;
    raiseArms(wave * .42);
  }
  if (move === "tap") {
    p.feet[side][2] += .42 * wave;
    p.knees[side][2] += .22 * wave;
    p.hands[1 - side][2] += .2 * wave;
  }
  if (move === "squat") {
    p.hips[1] -= .32 * wave; p.hips[2] -= .22 * wave;
    p.chest[1] -= .28 * wave; p.chest[2] += .03 * wave;
    p.head[1] -= .28 * wave; p.head[2] += .08 * wave;
    for (let i = 0; i < 2; i++) {
      p.hip[i][1] -= .32 * wave; p.hip[i][2] -= .22 * wave;
      p.knees[i][1] -= .12 * wave; p.knees[i][2] += .20 * wave;
      p.shoulders[i][1] -= .28 * wave; p.shoulders[i][2] += .03 * wave;
      p.elbows[i] = mix(p.elbows[i], [p.elbows[i][0], 1.24, .3], wave);
      p.hands[i] = mix(p.hands[i], [p.hands[i][0], 1.28, .58], wave);
    }
  }
  if (move === "side") {
    const lean = (side ? 1 : -1) * .2 * wave;
    p.head[0] += lean; p.chest[0] += lean * .6;
    p.shoulders.forEach(s => { s[0] += lean * .65; });
    raiseArms(.8); p.hands.forEach(h => { h[0] += lean * 1.8; });
  }
  if (move === "jack") {
    raiseArms(wave);
    for (let i = 0; i < 2; i++) {
      const sign = i ? 1 : -1;
      p.feet[i][0] += sign * .28 * wave; p.knees[i][0] += sign * .14 * wave;
    }
  }
  if (move === "heels" || move === "hop" || move === "jack") {
    const lift = wave * (move === "heels" ? .10 : .13);
    for (const key of ["head", "chest", "hips"] as const) p[key][1] += lift;
    for (const key of ["shoulders", "elbows", "hands", "hip", "knees"] as const)
      p[key].forEach(point => { point[1] += lift; });
    if (move !== "heels") p.feet.forEach(point => { point[1] += lift; });
  }
  return p;
}
export function Coach({ move, phase, profile = false }: { move: MoveId | "rest"; phase: number; profile?: boolean }) {
  const id = useId().replaceAll(":", ""), p = poseFor(move, phase);
  const xy = (point: Point): [number, number] =>
    [150 + (profile ? point[2] * 100 + point[0] * .13 * 100 : point[0] * 100), 260 - point[1] * 100];
  const line = (a: Point, b: Point, color: string, width: number, key: string) => {
    const [x1, y1] = xy(a), [x2, y2] = xy(b);
    return <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" />;
  };
  const [hx, hy] = xy(p.head), [cx, cy] = xy(p.chest), [px, py] = xy(p.hips);
  return <svg className="workout-coach" viewBox="0 0 300 290" role="img" aria-label={profile ? "动作侧面示范" : "动作正面示范"}>
    <defs>
      <linearGradient id={id + "suit"} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="var(--cyan-300)" /><stop offset="1" stopColor="var(--violet-400)" />
      </linearGradient>
      <linearGradient id={id + "helmet"} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="var(--ink-primary)" /><stop offset="1" stopColor="var(--ink-secondary)" />
      </linearGradient>
    </defs>
    <ellipse cx="150" cy="267" rx="89" ry="13" fill="var(--violet-400)" opacity=".12" />
    <ellipse cx="150" cy="267" rx="62" ry="8" fill="var(--cyan-300)" opacity=".13" />
    {[0, 1].map(i => <g key={i} opacity={profile && i === 0 ? .45 : 1}>
      {line(p.hip[i], p.knees[i], "var(--violet-400)", 21, "thigh")}
      {line(p.knees[i], p.feet[i], "var(--ink-primary)", 18, "shin")}
      {line(p.feet[i], [p.feet[i][0], p.feet[i][1], p.feet[i][2] + .12], "var(--cyan-300)", 20, "shoe")}
    </g>)}
    <path d={`M ${cx - (profile ? 16 : 25)} ${cy - 17} Q ${cx} ${cy - 24} ${cx + (profile ? 16 : 25)} ${cy - 17} L ${px + 20} ${py} Q ${px} ${py + 12} ${px - 20} ${py} Z`} fill={`url(#${id}suit)`} />
    {[0, 1].map(i => <g key={i} opacity={profile && i === 0 ? .45 : 1}>
      {line(p.shoulders[i], p.elbows[i], "var(--cyan-300)", 17, "upper")}
      {line(p.elbows[i], p.hands[i], "var(--ink-primary)", 15, "lower")}
      <circle cx={xy(p.hands[i])[0]} cy={xy(p.hands[i])[1]} r="9" fill="var(--pink-400)" />
    </g>)}
    {!profile && <g><circle cx={cx} cy={cy + 2} r="11" fill="var(--space-850)" /><path d={`M ${cx} ${cy - 5} l 2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z`} fill="var(--cyan-300)" /></g>}
    <ellipse cx={hx} cy={hy} rx={profile ? 24 : 29} ry="30" fill={`url(#${id}helmet)`} />
    <rect x={hx - (profile ? 3 : 23)} y={hy - 12} width={profile ? 28 : 46} height="28" rx="13" fill="var(--space-850)" />
    {profile ? <circle cx={hx + 16} cy={hy} r="3" fill="var(--cyan-300)" />
      : <g fill="var(--cyan-300)"><circle cx={hx - 10} cy={hy - 1} r="3.5" /><circle cx={hx + 10} cy={hy - 1} r="3.5" /><path d={`M ${hx - 5} ${hy + 7} Q ${hx} ${hy + 11} ${hx + 5} ${hy + 7}`} fill="none" stroke="var(--cyan-300)" strokeWidth="2" /></g>}
  </svg>;
}
