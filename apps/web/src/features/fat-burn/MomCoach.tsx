import { useEffect, useId, useRef, useState } from "react";
import type { MoveId } from "./plan";
import { FLOOR_MOVES, MOM_LIMBS, momPoseFor, type MomPose, type Point } from "./pose";
import { MOM_ART, MOM_HAND_MIRROR, type MomPartName } from "./mom-art";
import { angleDown, attachedSpriteMatrix, limbSpriteMatrix, MOM_SPRITE_DIMENSIONS, MOM_SPRITE_WIDTHS, momDemonstrationView, momDemonstrationViewNote, momProjection, type ScreenPoint, type SpriteMatrix } from "./sprite-rig";
import { momPropShapes } from "./motion-render";

export interface MomCoachProps {
  move: MoveId;
  phase: number;
  profile?: boolean;
  lowImpact?: boolean;
  side?: "left" | "right";
}

type CoachImages = Map<string, HTMLImageElement | HTMLCanvasElement>;
const imageLoads = new Map<string, Promise<HTMLImageElement>>();

function loadCoachImages(): Promise<CoachImages> {
  const sources = [...new Set(Object.values(MOM_ART).flatMap(view => Object.values(view).map(part => part.src)))];
  return Promise.all(sources.map(src => {
    let request = imageLoads.get(src);
    if (!request) {
      request = new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => { image.onload = null; image.onerror = null; resolve(image); };
        image.onerror = () => { image.onload = null; image.onerror = null; imageLoads.delete(src); reject(new Error("coach-art-unavailable")); };
        image.src = src;
      });
      imageLoads.set(src, request);
    }
    return request.then(image => [src, image] as const);
  })).then(entries => new Map(entries));
}

interface PaintedSprite {
  part: MomPartName;
  matrix: SpriteMatrix;
  depth: number;
  order: number;
  opacity: number;
}
interface PaintedJoint { point: ScreenPoint; radius: number; fill: string; depth: number; order: number }
type PaintedPart = PaintedSprite | PaintedJoint;

function jointTone(image: HTMLImageElement | HTMLCanvasElement, anchor: ScreenPoint): string {
  const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return "transparent";
  context.drawImage(image, Math.round(anchor[0]) - 2, Math.round(anchor[1]) + 16, 5, 5, 0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

/** Only soften the small overlapping cut edges; faces, sleeves and hems stay intact. */
function prepareJointEdges(loaded: CoachImages, art: typeof MOM_ART.front): CoachImages {
  const prepared = new Map(loaded);
  const edges: Partial<Record<MomPartName, readonly [number, number]>> = {
    "upper-arm": [0, 16], forearm: [18, 5], thigh: [0, 24], shin: [24, 0],
  };
  for (const [name, [top, bottom]] of Object.entries(edges) as [MomPartName, readonly [number, number]][]) {
    const metadata = art[name], source = loaded.get(metadata.src);
    if (!source) continue;
    const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.drawImage(source, 0, 0);
    const [, y, , height] = metadata.bounds;
    const mask = context.createLinearGradient(0, y, 0, y + height);
    mask.addColorStop(0, top ? "transparent" : "#fff");
    if (top) mask.addColorStop(top / height, "#fff");
    if (bottom) mask.addColorStop(1 - bottom / height, "#fff");
    mask.addColorStop(1, bottom ? "transparent" : "#fff");
    context.globalCompositeOperation = "destination-in"; context.fillStyle = mask;
    context.fillRect(0, 0, canvas.width, canvas.height);
    prepared.set(metadata.src, canvas);
  }
  return prepared;
}

/** Original illustrated coach; both camera views follow the same 3D joints. */
export function MomCoach({ move, phase, profile: requestedProfile = false, lowImpact = false, side = "left" }: MomCoachProps) {
  const profile = momDemonstrationView(move, requestedProfile);
  const host = useRef<HTMLDivElement>(null);
  const draw = useRef<((pose: MomPose) => void) | null>(null);
  const latest = useRef({ move, phase, lowImpact, side });
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  latest.current = { move, phase, lowImpact, side };

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let images: CoachImages | null = null;
    let elbowTone = "transparent", kneeTone = "transparent";
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) { setStatus("failed"); return; }
    const ctx = context;
    setStatus("loading");
    canvas.style.cssText = "display:block;width:100%;height:100%";
    canvas.setAttribute("aria-hidden", "true");
    element.appendChild(canvas);
    const art = MOM_ART[profile ? "side" : "front"];
    const css = getComputedStyle(element);
    const color = (token: string, fallback: string) => css.getPropertyValue(token).trim() || fallback;
    const floorColor = color("--space-850", "#171536");
    const cyan = color("--cyan-300", "#59e7ff");
    const violet = color("--violet-400", "#8d73ff");
    let width = 1, height = 1, pixelRatio = 1;

    function render(pose: MomPose) {
      if (disposed || !images) return;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const activeMove = latest.current.move;
      const projection = momProjection(width, height, profile, activeMove), { scale, point, depth } = projection;
      const center = width / 2;
      ctx.save();
      ctx.translate(center, projection.floor + scale * .012);
      ctx.scale(scale * 1.24, scale * .20);
      const glow = ctx.createRadialGradient(0, 0, .1, 0, 0, 1);
      glow.addColorStop(0, violet); glow.addColorStop(1, "transparent");
      ctx.globalAlpha = .32; ctx.fillStyle = glow; ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.ellipse(center, projection.floor, scale * 1.10, scale * .105, 0, 0, Math.PI * 2);
      ctx.globalAlpha = .8; ctx.fillStyle = floorColor; ctx.fill();
      ctx.globalAlpha = .44; ctx.strokeStyle = cyan; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(center, projection.floor, scale * 1.15, scale * .12, 0, 0, Math.PI * 2);
      ctx.globalAlpha = .16; ctx.stroke();
      ctx.restore();

      function paintProps(foreground = false) {
        ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (const shape of momPropShapes(activeMove, pose, foreground)) {
          ctx.beginPath(); shape.points.forEach((p, i) => { const [x, y] = point(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
          if (shape.closed) ctx.closePath();
          if (shape.fill) { ctx.fillStyle = color(shape.fill, floorColor); ctx.fill(); }
          ctx.lineWidth = shape.width * scale; ctx.strokeStyle = color(shape.stroke, cyan); ctx.stroke();
        }
        ctx.restore();
      }
      paintProps();

      const parts: PaintedPart[] = [];
      const meanDepth = (a: Point, b: Point) => (depth(a) + depth(b)) / 2;
      function bone(part: MomPartName, a: Point, b: Point, trueLength: number, z: number, mirror = false, opacity = 1) {
        const metadata: { start: ScreenPoint; end?: ScreenPoint } = art[part];
        if (!metadata.end) return;
        const sourceLength = Math.hypot(metadata.end[0] - metadata.start[0], metadata.end[1] - metadata.start[1]) || 1;
        const width = part in MOM_SPRITE_WIDTHS ? MOM_SPRITE_WIDTHS[part as keyof typeof MOM_SPRITE_WIDTHS] : 1;
        parts.push({ part, matrix: limbSpriteMatrix(metadata.start, metadata.end, point(a), point(b), trueLength / sourceLength * scale * width, mirror), depth: z, order: parts.length, opacity });
      }
      function attachment(part: MomPartName, anchor: Point, dimensions: readonly [number, number], rotation: number, z: number, mirror = false, opacity = 1) {
        const metadata = art[part];
        parts.push({ part, matrix: attachedSpriteMatrix(metadata.start, point(anchor), dimensions[0] / metadata.bounds[2] * scale, dimensions[1] / metadata.bounds[3] * scale, rotation, mirror), depth: z, order: parts.length, opacity });
      }
      for (let i = 0; i < 2; i++) {
        const mirror = !profile && i === 0;
        const opacity = 1;
        parts.push({ point: point(pose.knees[i]), radius: scale * .088, fill: kneeTone, depth: -2.1 + depth(pose.knees[i]) * .2, order: parts.length });
        // Hip artwork covers the thigh seam; depth still distinguishes crossing legs.
        bone("thigh", pose.hipsPair[i], pose.knees[i], MOM_LIMBS.thigh, -2 + meanDepth(pose.hipsPair[i], pose.knees[i]) * .2, mirror, opacity);
        bone("shin", pose.knees[i], pose.feet[i], MOM_LIMBS.shin, -2 + meanDepth(pose.knees[i], pose.feet[i]) * .2 + .001, mirror, opacity);
        attachment("shoe", pose.feet[i], profile ? MOM_SPRITE_DIMENSIONS.sideShoe : MOM_SPRITE_DIMENSIONS.frontShoe, profile ? pose.footPitch[i] : 0, -1.8 + depth(pose.feet[i]) * .2, mirror, opacity);
      }
      bone("torso", pose.shouldersCenter, pose.hips, .78, profile ? .02 : depth(pose.hips) + .04);
      const spineAngle = angleDown(point(pose.head), point(pose.neck));
      const head = art.head;
      const headHeight = MOM_SPRITE_DIMENSIONS.headHeight;
      attachment("head", pose.neck, [headHeight * head.bounds[2] / head.bounds[3], headHeight], spineAngle, profile ? .01 : depth(pose.hips) + .03);
      for (let i = 0; i < 2; i++) {
        const mirror = !profile && i === 0;
        const opacity = 1;
        const sideDepth = profile ? (i === 1 ? -.5 : .5) : 0;
        const armDepth = profile ? sideDepth : meanDepth(pose.shoulders[i], pose.elbows[i]);
        const forearmDepth = profile ? sideDepth + .001 : meanDepth(pose.elbows[i], pose.hands[i]) + .005;
        parts.push({ point: point(pose.elbows[i]), radius: scale * .052, fill: elbowTone, depth: Math.min(armDepth, forearmDepth) - .002, order: parts.length });
        bone("upper-arm", pose.shoulders[i], pose.elbows[i], MOM_LIMBS.upperArm, armDepth, mirror, opacity);
        bone("forearm", pose.elbows[i], pose.hands[i], MOM_LIMBS.forearm, forearmDepth, mirror, opacity);
        const hand = art.hand, handHeight = MOM_SPRITE_DIMENSIONS.handHeight;
        const fingers = pose.hands[i].map((value, axis) => value + pose.handDirection[i][axis]) as Point;
        attachment("hand", pose.hands[i], [handHeight * hand.bounds[2] / hand.bounds[3], handHeight], angleDown(point(pose.hands[i]), point(fingers)), profile ? sideDepth + .002 : depth(pose.hands[i]) + .01, MOM_HAND_MIRROR[profile ? "side" : "front"][i], opacity);
      }
      parts.sort((a, b) => a.depth - b.depth || a.order - b.order);
      for (const part of parts) {
        if ("fill" in part) {
          ctx.beginPath(); ctx.arc(...part.point, part.radius, 0, Math.PI * 2); ctx.fillStyle = part.fill; ctx.fill();
          continue;
        }
        const metadata = art[part.part], image = images.get(metadata.src);
        if (!image) continue;
        ctx.save(); ctx.globalAlpha = part.opacity;
        ctx.transform(...part.matrix);
        const [x, y, w, h] = metadata.bounds;
        ctx.drawImage(image, x, y, w, h, x, y, w, h);
        ctx.restore();
      }
      paintProps(true);
    }
    draw.current = render;
    const resize = () => {
      width = Math.max(1, element.clientWidth); height = Math.max(1, element.clientHeight);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio);
      const state = latest.current; render(momPoseFor(state.move, state.phase, state.lowImpact, state.side));
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    void loadCoachImages().then(loaded => {
      if (disposed) return;
      elbowTone = jointTone(loaded.get(art.forearm.src)!, art.forearm.start);
      kneeTone = jointTone(loaded.get(art.shin.src)!, art.shin.start);
      images = prepareJointEdges(loaded, art);
      const state = latest.current; render(momPoseFor(state.move, state.phase, state.lowImpact, state.side));
      setStatus("ready");
    }).catch(() => { if (!disposed) { draw.current = null; setStatus("failed"); } });
    return () => { disposed = true; draw.current = null; observer.disconnect(); canvas.remove(); };
  }, [profile]);

  useEffect(() => { draw.current?.(momPoseFor(move, phase, lowImpact, side)); }, [move, phase, lowImpact, side]);
  return <div className="fat-burn-coach" role="img" aria-label={`年轻妈妈${profile ? "侧面" : "正面"}动作示范${FLOOR_MOVES.includes(move) ? "，在垫子上完成地面姿势" : ""}${momDemonstrationViewNote(move) ? "，显示真实支撑位置" : ""}`} style={{ position: "relative", width: "100%", height: "100%" }}>
    <div ref={host} className="fat-burn-coach-canvas" style={{ position: "absolute", inset: 0, display: status === "failed" ? "none" : "block" }} />
    {status === "loading" && <span role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--ink-secondary)", fontSize: 18 }}>妈妈正在准备示范…</span>}
    {status === "failed" && <><FlatMomCoach move={move} phase={phase} profile={profile} lowImpact={lowImpact} side={side} /><small>示范图片暂未载入 · 简明动作示范</small></>}
  </div>;
}

function FlatMomCoach({ move, phase, profile, lowImpact, side }: MomCoachProps) {
  const id = useId().replaceAll(":", ""), pose = momPoseFor(move, phase, lowImpact, side);
  const projection = momProjection(320, 360, Boolean(profile), move), xy = projection.point;
  const limb = (a: Point, b: Point, color: string, width: number, key: string) => {
    const [x1, y1] = xy(a), [x2, y2] = xy(b);
    return <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" />;
  };
  const [hx, hy] = xy(pose.head), [cx, cy] = xy(pose.shouldersCenter), [px, py] = xy(pose.hips);
  const torsoAngle = angleDown(xy(pose.shouldersCenter), xy(pose.hips)) * 180 / Math.PI;
  const headAngle = angleDown(xy(pose.head), xy(pose.neck)) * 180 / Math.PI;
  const torsoHeight = Math.hypot(px - cx, py - cy), shoulderWidth = (profile ? .21 : .30) * projection.scale, hipWidth = .24 * projection.scale;
  const purple = "#bcb0dd", pants = "#343d53", skin = "#f2bc9d";
  const sleeveEnd = (i: number): Point => pose.shoulders[i].map((value, axis) => value + (pose.elbows[i][axis] - value) * .36) as Point;
  const props = (foreground = false) => momPropShapes(move, pose, foreground).map((shape, i) => {
    const points = shape.points.map(point => xy(point).join(",")).join(" ");
    return shape.closed ? <polygon key={i} points={points} fill={shape.fill ? `var(${shape.fill})` : "none"} stroke={`var(${shape.stroke})`} strokeWidth={shape.width * projection.scale} strokeLinejoin="round" /> : <polyline key={i} points={points} fill="none" stroke={`var(${shape.stroke})`} strokeWidth={shape.width * projection.scale} strokeLinecap="round" />;
  });
  return <svg viewBox="0 0 320 360" aria-hidden="true" style={{ display: "block", width: "100%", height: "100%" }}>
    <defs><linearGradient id={`${id}-top`} x2="1" y2="1"><stop stopColor={purple} /><stop offset="1" stopColor="#9788bc" /></linearGradient></defs>
    {!FLOOR_MOVES.includes(move) && <ellipse cx="160" cy={projection.floor} rx="105" ry="18" fill="var(--space-850)" stroke="var(--cyan-300)" strokeOpacity=".4" />}
    {props()}
    {[0, 1].map(i => <g key={i} opacity={profile && i === 0 ? .6 : 1}>
      {limb(pose.hipsPair[i], pose.knees[i], pants, 24, "thigh")}{limb(pose.knees[i], pose.feet[i], pants, 17, "shin")}
      <ellipse cx={xy(pose.feet[i])[0] + (profile ? 5 : 0)} cy={xy(pose.feet[i])[1] + 4} rx={profile ? 16 : 10} ry="7" transform={`rotate(${pose.footPitch[i] * 180 / Math.PI}, ${xy(pose.feet[i]).join(",")})`} fill="var(--ink-primary)" stroke="var(--cyan-300)" strokeWidth="3" />
    </g>)}
    {limb(pose.neck, pose.head, skin, 17, "neck")}
    <path transform={`translate(${cx}, ${cy}) rotate(${torsoAngle})`} d={`M ${-shoulderWidth} 0 Q 0 -10 ${shoulderWidth} 0 L ${hipWidth} ${torsoHeight + 5} Q 0 ${torsoHeight + 12} ${-hipWidth} ${torsoHeight + 5} Z`} fill={`url(#${id}-top)`} />
    {[0, 1].map(i => <g key={i} opacity={profile && i === 0 ? .6 : 1}>
      {limb(pose.shoulders[i], pose.elbows[i], skin, 13, "upper")}{limb(pose.elbows[i], pose.hands[i], skin, 10, "forearm")}
      {limb(pose.shoulders[i], sleeveEnd(i), purple, 18, "sleeve")}
      <ellipse cx={xy(pose.hands[i].map((value, axis) => value + pose.handDirection[i][axis] * .085) as Point)[0]} cy={xy(pose.hands[i].map((value, axis) => value + pose.handDirection[i][axis] * .085) as Point)[1]} rx="6" ry="8" fill={skin} />
    </g>)}
    <g transform={`rotate(${headAngle}, ${hx}, ${hy})`}>
    <path d={`M ${hx - 12} ${hy - 14} Q ${hx - 45} ${hy - 25} ${hx - 35} ${hy + 25} Q ${hx - 31} ${hy + 40} ${hx - 42} ${hy + 45} Q ${hx - 20} ${hy + 48} ${hx - 23} ${hy + 5} Z`} fill="#382426" />
    <ellipse cx={hx} cy={hy} rx={profile ? 20 : 22} ry="26" fill={skin} />
    <path d={`M ${hx - 22} ${hy + 2} Q ${hx - 27} ${hy - 30} ${hx} ${hy - 28} Q ${hx + 28} ${hy - 27} ${hx + 21} ${hy - 4} Q ${hx + 4} ${hy - 14} ${hx + 3} ${hy - 22} Q ${hx - 16} ${hy - 15} ${hx - 22} ${hy + 2}`} fill="#382426" />
    {(profile ? [8] : [-8, 8]).map(x => <g key={x}><ellipse cx={hx + x} cy={hy - 3} rx="4" ry="2.5" fill="#fff9f0" /><circle cx={hx + x + 1} cy={hy - 3} r="2" fill="#382426" /><path d={`M ${hx + x - 4} ${hy - 9} q 4 -2 8 0`} fill="none" stroke="#382426" strokeWidth="1.6" /></g>)}
    <path d={`M ${hx - 5 + (profile ? 8 : 0)} ${hy + 10} q 6 5 12 -1`} fill="none" stroke="#bb656c" strokeWidth="2" strokeLinecap="round" />
    {!profile && <><ellipse cx={hx - 14} cy={hy + 6} rx="4" ry="2" fill="#e29b91" /><ellipse cx={hx + 14} cy={hy + 6} rx="4" ry="2" fill="#e29b91" /></>}
    </g>
    {props(true)}
  </svg>;
}
