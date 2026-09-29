import { useRef, type PointerEvent, type KeyboardEvent } from "react";
import {
  MATERIALS,
  localVertices,
  partMass,
  SHAPE_NAMES,
  WORLD,
  validPlacement,
  type HousePart,
  type Point,
} from "./model";
import type { HouseWorkspace } from "./challenge";
import type { SimulationSnapshot } from "./engine";
import { renderPieces } from "./render-pieces";
export const sx = (x: number) => (x + 8) * 62.5,
  sy = (y: number) => 575 - y * 62.5;
export function HouseStage({
  workspace,
  snapshot,
  selected,
  ghost,
  tool,
  onSelect,
  onMove,
  onView,
  onKey,
}: {
  workspace: HouseWorkspace;
  snapshot?: SimulationSnapshot;
  selected?: string;
  ghost?: HousePart;
  tool: string;
  onSelect: (id: string) => void;
  onMove: (p: HousePart, commit: boolean) => void;
  onView: (patch: Partial<HouseWorkspace["view"]>) => void;
  onKey: (e: KeyboardEvent<SVGSVGElement>) => void;
}) {
  const { design, view, challenge } = workspace;
  const stage = useRef<SVGSVGElement>(null);
  const drag = useRef<
    | { start: Point; part?: HousePart; view: typeof view; next?: HousePart }
    | undefined
  >(undefined);
  const point = (e: PointerEvent<SVGSVGElement>): Point => {
    const matrix = stage.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: p.x / 62.5 - 8, y: (575 - p.y) / 62.5 };
  };
  const finish = (cancel = false) => {
    const d = drag.current;
    drag.current = undefined;
    if (d?.part) onMove(cancel ? d.part : (d.next ?? d.part), true);
  };
  const pieces: SimulationSnapshot["pieces"] =
    snapshot?.pieces ??
    design.parts.map((p) => ({
      ...p,
      key: p.id,
      damaged: false,
      utilization: 0,
      mass: partMass(p),
    }));
  const visiblePieces = renderPieces(pieces);
  const groups = design.parts.flatMap((p) => {
    const bodies = visiblePieces.filter((b) => b.id === p.id);
    if (bodies.some((b) => b.damaged))
      return bodies.map((b) => ({
        key: b.key,
        width: b.width,
        x: b.x,
        y: b.y,
        mass: b.mass,
      }));
    return [
      {
        key: p.id,
        width: p.width,
        mass: partMass(p),
        x: bodies.length
          ? bodies.reduce((n, b) => n + b.x, 0) / bodies.length
          : p.x,
        y: bodies.length
          ? bodies.reduce((n, b) => n + b.y, 0) / bodies.length
          : p.y,
      },
    ];
  });
  const mass = design.parts.reduce((n, p) => n + partMass(p), 0);
  const center = snapshot?.center ?? {
    x: mass
      ? design.parts.reduce((n, p) => n + p.x * partMass(p), 0) / mass
      : 0,
    y: mass
      ? design.parts.reduce((n, p) => n + p.y * partMass(p), 0) / mass
      : 0,
  };
  const ground = snapshot?.ground ?? { x: 0, y: 0 };
  const regions = challenge.flags.foundation
    ? challenge.regions
    : [{ left: WORLD.left, right: WORLD.right }];
  const shape = (
    p: { shape: string; width: number; height: number; vertices?: Point[] },
    fill: string,
  ) => {
    if (p.shape === "triangle" && !p.vertices)
      p = { ...p, vertices: localVertices(p) };
    if (p.vertices)
      return (
        <polygon
          points={p.vertices
            .map((v) => `${v.x * 62.5},${-v.y * 62.5}`)
            .join(" ")}
          fill={fill}
        />
      );
    return p.shape === "circle" ? (
      <circle r={p.width * 31.25} fill={fill} />
    ) : (
      <rect
        x={-p.width * 31.25}
        y={-p.height * 31.25}
        width={p.width * 62.5}
        height={p.height * 62.5}
        rx="2"
        fill={fill}
      />
    );
  };
  const labelSize = (18 * view.span) / 16;
  return (
    <svg
      ref={stage}
      className="house-stage"
      viewBox={`${sx(view.x - view.span / 2)} ${sy(view.y + view.span * 0.3)} ${view.span * 62.5} ${view.span * 0.6 * 62.5}`}
      tabIndex={0}
      aria-label="大搭建台，空白处拖动平移；点击积木选择，方向键微调，R旋转，Delete移走"
      onKeyDown={onKey}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== 1) return;
        const id = (e.target as Element)
          .closest("[data-part-id]")
          ?.getAttribute("data-part-id");
        const p = design.parts.find((p) => p.id === id);
        if (id && tool !== "pan") {
          onSelect(id);
          if (snapshot || tool !== "move") return;
        }
        drag.current = {
          start: point(e),
          part: tool === "move" && !snapshot ? p : undefined,
          view: { ...view },
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const p = point(e);
        if (d.part) {
          d.next = {
            ...d.part,
            x: d.part.x + p.x - d.start.x,
            y: d.part.y + p.y - d.start.y,
          };
          onMove(d.next, false);
        } else {
          const matrix = stage.current?.getScreenCTM();
          if (!matrix) return;
          // Pointer world coordinates already include the newest camera position.
          onView({
            x: Math.max(-40, Math.min(40, view.x + d.start.x - p.x)),
            y: Math.max(-2, Math.min(40, view.y + d.start.y - p.y)),
          });
        }
      }}
      onPointerUp={() => finish()}
      onPointerCancel={() => finish(true)}
      onLostPointerCapture={() => {
        if (drag.current) finish(true);
      }}
    >
      <defs>
        <pattern
          id="house-grid"
          width="62.5"
          height="62.5"
          patternUnits="userSpaceOnUse"
          y="12.5"
        >
          <path
            d="M62.5 0H0V62.5"
            fill="none"
            stroke="var(--line-glow)"
            strokeWidth="1"
          />
        </pattern>
        {Object.entries(MATERIALS).map(([id, m]) => (
          <linearGradient id={"house-" + id} key={id} x2=".7" y2="1">
            <stop stopColor={`var(${m.token})`} />
            <stop offset="1" stopColor={`var(${m.token})`} stopOpacity=".45" />
          </linearGradient>
        ))}
      </defs>
      <rect
        x={sx(-40)}
        y={sy(40)}
        width={80 * 62.5}
        height={40 * 62.5}
        fill="url(#house-grid)"
      />
      {Array.from({ length: 9 }, (_, i) => i * 5).map((y) => (
        <text
          key={y}
          x={sx(view.x - view.span / 2) + 8}
          y={sy(y) - 8}
          fontSize={labelSize}
          className="house-ruler"
        >
          {y} m
        </text>
      ))}
      {regions.map((r, i) => (
        <g key={i}>
          <rect
            x={sx(r.left + ground.x)}
            y={sy(ground.y)}
            width={(r.right - r.left) * 62.5}
            height="28"
            fill="var(--cyan-300)"
            opacity=".3"
          />
          <line
            x1={sx(r.left + ground.x)}
            x2={sx(r.right + ground.x)}
            y1={sy(ground.y)}
            y2={sy(ground.y)}
            stroke="var(--cyan-300)"
            strokeWidth="4"
          />
          {challenge.flags.foundation && (
            <text
              x={sx((r.left + r.right) / 2)}
              y={sy(-0.55)}
              textAnchor="middle"
              fontSize={labelSize}
              className="house-ruler"
            >
              地基 {i + 1}
            </text>
          )}
        </g>
      ))}
      {challenge.flags.height && (
        <g pointerEvents="none">
          <line
            x1={sx(-40)}
            x2={sx(40)}
            y1={sy(challenge.height + ground.y)}
            y2={sy(challenge.height + ground.y)}
            stroke="var(--warning-300)"
            strokeWidth="2"
            strokeDasharray="10 8"
          />
          <text
            x={sx(view.x - view.span / 2) + 90}
            y={sy(challenge.height + ground.y) - 12}
            className="house-goal-text"
            fontSize={labelSize}
          >
            目标 {challenge.height} 米
          </text>
        </g>
      )}
      {challenge.flags.target && (
        <g
          transform={`translate(${sx(challenge.target.x + ground.x)},${sy(challenge.target.y + ground.y)})`}
          pointerEvents="none"
        >
          <circle r="15" fill="none" stroke="var(--pink-400)" strokeWidth="3" />
          <path
            d="M-22 0H22M0-22V22"
            stroke="var(--pink-400)"
            strokeWidth="2"
          />
          <text x="22" y="-15" fontSize={labelSize} className="house-goal-text">
            ({challenge.target.x}, {challenge.target.y})
          </text>
        </g>
      )}
      {visiblePieces.map((p) => (
        <g
          key={p.key}
          data-part-id={p.id}
          transform={`translate(${sx(p.x)},${sy(p.y)}) rotate(${(-p.angle * 180) / Math.PI})`}
          className={`house-piece ${selected === p.id ? "is-selected" : ""}`}
          role="button"
          tabIndex={
            p.key === visiblePieces.find((b) => b.id === p.id)?.key ? 0 : -1
          }
          aria-label={`${MATERIALS[p.material].name}${SHAPE_NAMES[design.parts.find((x) => x.id === p.id)?.shape ?? "block"]}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(p.id);
            }
          }}
        >
          {shape(p, `url(#house-${p.material})`)}
          {p.shape === "circle" && (
            <path
              d={`M0 0L${p.width * 26} 0`}
              stroke="var(--space-950)"
              strokeWidth="3"
            />
          )}
          {p.damaged && (
            <path
              d={`M${-p.width * 20} ${-p.height * 20}L0 0l${p.width * 18} ${p.height * 18}`}
              stroke="var(--space-950)"
              strokeWidth="3"
            />
          )}
          <title>
            {MATERIALS[p.material].name} ·{" "}
            {p.damaged ? "已损坏" : `受力 ${Math.round(p.utilization * 100)}%`}
          </title>
        </g>
      ))}
      {(
        snapshot?.links ??
        design.connections.map((c) => ({
          id: c.id,
          kind: c.kind,
          a: c.anchor,
          b: c.anchor,
        }))
      ).map((c) => (
        <g key={c.id} pointerEvents="none">
          <line
            x1={sx(c.a.x)}
            y1={sy(c.a.y)}
            x2={sx(c.b.x)}
            y2={sy(c.b.y)}
            stroke="var(--ink-primary)"
            strokeWidth="3"
          />
          {c.kind === "hinge" ? (
            <circle
              cx={sx(c.a.x)}
              cy={sy(c.a.y)}
              r="6"
              fill="var(--space-950)"
              stroke="var(--ink-primary)"
              strokeWidth="2"
            />
          ) : (
            <rect
              x={sx(c.a.x) - 5}
              y={sy(c.a.y) - 5}
              width="10"
              height="10"
              fill="var(--space-950)"
              stroke="var(--ink-primary)"
              strokeWidth="2"
            />
          )}
        </g>
      ))}
      {view.showMass &&
        groups.map(({ key, x, y, mass, width }) => (
          <text
            key={key}
            x={sx(x)}
            y={sy(y) + 5}
            textAnchor="middle"
            fontSize={Math.min(labelSize, width * 21)}
            className="house-mass"
            pointerEvents="none"
          >
            {Number(mass.toFixed(1))} kg
          </text>
        ))}
      {ghost && (
        <g
          pointerEvents="none"
          transform={`translate(${sx(ghost.x)},${sy(ghost.y)}) rotate(${(-ghost.angle * 180) / Math.PI})`}
          stroke={
            validPlacement(ghost, design.parts)
              ? "var(--green-400)"
              : "var(--rose-400)"
          }
          strokeWidth="3"
          strokeDasharray="8 4"
        >
          {shape(ghost, "none")}
        </g>
      )}
      {view.showCenter && mass > 0 && (
        <g
          pointerEvents="none"
          transform={`translate(${sx(center.x)},${sy(center.y)})`}
        >
          <circle
            r="10"
            fill="var(--space-950)"
            stroke="var(--ink-primary)"
            strokeWidth="2"
          />
          <path d="M-7 0H7M0-7V7" stroke="var(--ink-primary)" strokeWidth="2" />
          <text x="15" y="-12" fontSize={labelSize} className="house-ruler">
            重心
          </text>
        </g>
      )}
    </svg>
  );
}
