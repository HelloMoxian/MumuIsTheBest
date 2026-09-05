import { useEffect, useRef } from "react";
import type { Frame } from "../../../../server/src/bejeweled-engine";
import { createShards, GEM_LIGHT, shardAt } from "./particles";

/** A bounded, local additive-light layer. It never owns gameplay or hit testing. */
export function BejeweledEffects({ frame, stopped }: { frame: Frame | null; stopped: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const context = node.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, node.width, node.height);
    if (!frame || frame.phase !== "clear" || stopped || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = node.getBoundingClientRect();
    if (!rect.width) return;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    node.width = Math.round(rect.width * density); node.height = Math.round(rect.height * density);
    const scale = node.width / 8;
    const particles = createShards(frame);
    const blasts = (frame.blasts ?? []).slice(0, 12);
    let animation = 0;
    const start = performance.now();
    const ring = (x: number, y: number, radius: number, color: string, alpha: number, width: number) => {
      context.globalAlpha = Math.max(0, alpha);
      context.strokeStyle = color; context.lineWidth = width;
      context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke();
    };
    const glow = (x: number, y: number, radius: number, color: string, alpha: number) => {
      context.globalAlpha = Math.max(0, alpha);
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "#ffffff"); gradient.addColorStop(.16, color); gradient.addColorStop(1, color + "00");
      context.fillStyle = gradient; context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, node.width, node.height);
      if (t > .9 || document.hidden) return;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.globalCompositeOperation = "lighter";
      for (const index of frame.cleared) {
        const x = index % 8 + .5, y = Math.floor(index / 8) + .5;
        const color = GEM_LIGHT[frame.board[index]?.color ?? "white"];
        if (t < .32) glow(x, y, .3 + t * 1.2, color, (1 - t / .32) * .42);
        if (t < .5) ring(x, y, .12 + t * 1.3, color, (1 - t / .5) * .6, .025);
      }
      for (const blast of blasts) {
        const x = blast.source % 8 + .5, y = Math.floor(blast.source / 8) + .5;
        const alpha = Math.max(0, 1 - t / .8);
        if (blast.kind === "flame" || blast.kind === "nova") {
          const color = blast.kind === "flame" ? "#ffc16a" : "#e0a2ff";
          glow(x, y, .4 + t * 2.8, color, alpha * .5);
          ring(x, y, .25 + t * 3.1, color, alpha, .07 * alpha + .008);
          ring(x, y, .18 + t * 2.6, "#fff1cf", alpha * .7, .022);
        }
        if (blast.kind === "star" || blast.kind === "nova") {
          const length = Math.min(8, t * 38), width = .015 + Math.sin(Math.min(1, t / .8) * Math.PI) * .15;
          context.globalAlpha = alpha;
          for (const offset of blast.kind === "nova" ? [-1, 0, 1] : [0]) {
            context.strokeStyle = "#65dfff"; context.lineWidth = width * 2.4;
            context.beginPath(); context.moveTo(Math.max(0, x - length), y + offset); context.lineTo(Math.min(8, x + length), y + offset);
            context.moveTo(x + offset, Math.max(0, y - length)); context.lineTo(x + offset, Math.min(8, y + length)); context.stroke();
            context.strokeStyle = "#f3fcff"; context.lineWidth = width * .4; context.stroke();
          }
        }
        if (blast.kind === "cube") {
          ring(x, y, .3 + t * .9, "#c8a0ff", alpha, .045);
          // Fixed zigzags travel outward; no random per-frame flicker.
          for (const target of blast.targets.slice(0, 24)) {
            const ex = target % 8 + .5, ey = Math.floor(target / 8) + .5;
            const grow = Math.min(1, t * 6), dx = (ex - x) * grow, dy = (ey - y) * grow;
            context.globalAlpha = alpha * .8; context.strokeStyle = GEM_LIGHT[frame.board[target]?.color ?? "purple"]; context.lineWidth = .065;
            context.beginPath(); context.moveTo(x, y);
            for (let i = 1; i <= 9; i++) {
              const f = i / 9, jitter = i === 9 ? 0 : Math.sin(i * 17 + target) * .13;
              context.lineTo(x + dx * f - dy * jitter * .13, y + dy * f + dx * jitter * .13);
            }
            context.stroke(); context.strokeStyle = "#ffffff"; context.lineWidth = .015; context.stroke();
          }
        }
      }
      for (const shard of particles) {
        const point = shardAt(shard, t);
        if (point.alpha <= 0) continue;
        context.save(); context.translate(point.x, point.y); context.rotate(point.angle);
        context.globalAlpha = point.alpha; context.fillStyle = shard.color;
        context.beginPath(); context.moveTo(0, -point.radius * 1.6); context.lineTo(point.radius, 0);
        context.lineTo(0, point.radius); context.lineTo(-point.radius * .6, 0); context.closePath(); context.fill();
        context.strokeStyle = "#ffffff"; context.lineWidth = .009; context.stroke();
        context.restore();
      }
      context.globalAlpha = 1; context.globalCompositeOperation = "source-over";
      animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animation); context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, node.width, node.height); };
  }, [frame, stopped]);
  return <canvas ref={canvas} className="bj-effects" aria-hidden="true" />;
}
