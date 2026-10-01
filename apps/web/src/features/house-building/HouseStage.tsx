import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import {
  MATERIALS,
  localVertices,
  partMass,
  SHAPE_NAMES,
  WORLD,
  validPlacement,
  bounds,
  type HousePart,
  type Point,
} from "./model";
import type { HouseWorkspace } from "./challenge";
import type { SimulationSnapshot } from "./engine";
import { moveTaskGoal, addTaskArea, type TaskDrawKind } from "./task-layout";
import type { HouseChallenge } from "./challenge";
import { windStreaks } from "./wind-visual";
import { renderPieces } from "./render-pieces";
export const sx = (x: number) => (x + 8) * 62.5,
  sy = (y: number) => 575 - y * 62.5;
export function HouseStage({
  workspace,
  snapshot,
  selected,
  selectedIds,
  onSelection,
  ghost,
  tool,
  onSelect,
  onDeselect,
  editingTask,
  drawTask,
  onTaskDrawn,
  onTaskChange,
  onMove,
  onView,
  onKey,
}: {
  workspace: HouseWorkspace;
  snapshot?: SimulationSnapshot;
  selected?: string;
  selectedIds: string[];
  onSelection: (ids: string[]) => void;
  ghost?: HousePart;
  tool: string;
  onSelect: (id: string, additive?: boolean) => void;
  onDeselect: () => void;
  editingTask?: boolean;
  drawTask?: TaskDrawKind;
  onTaskDrawn: (success: boolean) => void;
  onTaskChange: (challenge: HouseChallenge) => void;
  onMove: (p: HousePart, commit: boolean) => void;
  onView: (patch: Partial<HouseWorkspace["view"]>) => void;
  onKey: (e: KeyboardEvent<SVGSVGElement>) => void;
}) {
  const { design, view, challenge } = workspace;
  const [drawing, setDrawing] = useState<{ a: Point; b: Point }>();
  const [selectionBox, setSelectionBox] = useState<{ a: Point; b: Point }>();
  const stage = useRef<SVGSVGElement>(null);
  const drag = useRef<
    | {
        start: Point;
        part?: HousePart;
        view: typeof view;
        next?: HousePart;
        task?: string;
        area?: TaskDrawKind;
        selecting?: boolean;
        end?: Point;
        originalTask?: HouseChallenge;
      }
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
    setDrawing(undefined);
    setSelectionBox(undefined);
    if (d?.selecting && !cancel) {
      const end = d.end ?? d.start,
        left = Math.min(d.start.x, end.x),
        right = Math.max(d.start.x, end.x),
        bottom = Math.min(d.start.y, end.y),
        top = Math.max(d.start.y, end.y);
      onSelection(
        design.parts
          .filter((p) => {
            const b = bounds(p);
            return (
              b.right >= left &&
              b.left <= right &&
              b.top >= bottom &&
              b.bottom <= top
            );
          })
          .map((p) => p.id),
      );
    }
    if (d?.area && !cancel) {
      const next = addTaskArea(
        challenge,
        d.area,
        d.start,
        d.end ?? d.start,
        crypto.randomUUID(),
      );
      if (next !== challenge) onTaskChange(next);
      onTaskDrawn(next !== challenge);
    }
    if (cancel && d?.originalTask) onTaskChange(d.originalTask);
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
  const windSpeed =
    snapshot && view.wind ? (snapshot.ambientWindSpeed ?? 0) : 0;
  const windLines = windStreaks(
    windSpeed,
    snapshot?.windTravel ?? 0,
    view.span,
  );
  const stillWindLines = windStreaks(windSpeed, 0, view.span);
  const stripeSize = (view.span * 62.5) / 65;
  const drawWind = (
    lines: ReturnType<typeof windStreaks>,
    className: string,
  ) => (
    <g
      className={className}
      pointerEvents="none"
      aria-hidden="true"
      stroke="var(--cyan-300)"
      strokeLinecap="round"
    >
      {lines.map((line, i) => (
        <line
          key={i}
          x1={sx(view.x - view.span / 2 + line.x * view.span)}
          x2={sx(
            view.x -
              view.span / 2 +
              (line.x - line.length * design.settings.windDirection) *
                view.span,
          )}
          y1={sy(view.y + view.span * 0.3 - line.y * view.span * 0.6)}
          y2={sy(view.y + view.span * 0.3 - line.y * view.span * 0.6)}
          opacity={line.opacity}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
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
        const taskGoal = (e.target as Element)
          .closest("[data-task-goal]")
          ?.getAttribute("data-task-goal");
        if (editingTask && drawTask) {
          const p = point(e);
          drag.current = {
            start: p,
            end: p,
            view: { ...view },
            area: drawTask,
          };
          setDrawing({ a: p, b: p });
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
        if (editingTask && taskGoal) {
          drag.current = {
            start: point(e),
            view: { ...view },
            task: taskGoal,
            originalTask: challenge,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
        if (editingTask) {
          drag.current = { start: point(e), view: { ...view } };
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }

        const id = (e.target as Element)
          .closest("[data-part-id]")
          ?.getAttribute("data-part-id");
        const p = design.parts.find((p) => p.id === id);
        if (!snapshot && !id && (tool === "select" || e.shiftKey)) {
          const p = point(e);
          drag.current = {
            start: p,
            end: p,
            view: { ...view },
            selecting: true,
          };
          setSelectionBox({ a: p, b: p });
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
        if (!id) onDeselect();
        if (id && tool !== "pan") {
          onSelect(id, !snapshot && (e.shiftKey || tool === "select"));
          if (e.shiftKey || tool === "select") return;
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
        if (d.selecting) {
          d.end = p;
          setSelectionBox({ a: d.start, b: p });
          return;
        }
        if (d.area) {
          d.end = p;
          setDrawing({ a: d.start, b: p });
          return;
        }
        if (d.task) {
          onTaskChange(moveTaskGoal(challenge, d.task, p));
          return;
        }
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
          id="house-foundation-stripes"
          patternUnits="userSpaceOnUse"
          width={stripeSize}
          height={stripeSize}
          patternTransform={`translate(${ground.x * 62.5} ${-ground.y * 62.5})`}
        >
          <path
            d={`M${-stripeSize / 2} ${stripeSize}L${stripeSize / 2} 0M0 ${stripeSize}L${stripeSize} 0M${stripeSize / 2} ${stripeSize}L${stripeSize * 1.5} 0`}
            stroke="var(--cyan-300)"
            strokeWidth={stripeSize * 0.16}
            opacity=".8"
          />
        </pattern>
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
            height={labelSize * 1.15}
            fill="var(--cyan-300)"
            opacity=".3"
          />
          <rect
            x={sx(r.left + ground.x)}
            y={sy(ground.y)}
            width={(r.right - r.left) * 62.5}
            height={labelSize * 1.15}
            fill="url(#house-foundation-stripes)"
            pointerEvents="none"
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
              x={sx((r.left + r.right) / 2 + ground.x)}
              y={sy(ground.y - 0.55)}
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
      {(challenge.zones ?? [])
        .filter((z) => z.enabled)
        .map((z, i) => (
          <g key={z.id} pointerEvents="none">
            <rect
              x={sx(z.left + ground.x)}
              y={sy(z.top + ground.y)}
              width={(z.right - z.left) * 62.5}
              height={(z.top - z.bottom) * 62.5}
              fill={
                z.kind === "forbidden" ? "var(--pink-400)" : "var(--cyan-300)"
              }
              fillOpacity=".12"
              stroke={
                z.kind === "forbidden" ? "var(--pink-400)" : "var(--cyan-300)"
              }
              strokeWidth="2"
              strokeDasharray="8 5"
            />
            <text
              x={sx(z.left + ground.x) + 6}
              y={sy(z.top + ground.y) + labelSize}
              fontSize={labelSize}
              className="house-goal-text"
            >
              {z.kind === "forbidden" ? "禁入" : "必经"} {i + 1}
            </text>
          </g>
        ))}
      {drawing && (
        <rect
          x={sx(Math.min(drawing.a.x, drawing.b.x))}
          y={sy(
            drawTask === "foundation" ? 0 : Math.max(drawing.a.y, drawing.b.y),
          )}
          width={Math.abs(drawing.b.x - drawing.a.x) * 62.5}
          height={
            drawTask === "foundation"
              ? 28
              : Math.abs(drawing.b.y - drawing.a.y) * 62.5
          }
          fill="var(--cyan-300)"
          fillOpacity=".2"
          stroke="var(--cyan-300)"
          pointerEvents="none"
        />
      )}
      {visiblePieces.map((p) => (
        <g
          key={p.key}
          data-part-id={p.id}
          transform={`translate(${sx(p.x)},${sy(p.y)}) rotate(${(-p.angle * 180) / Math.PI})`}
          className={`house-piece ${selectedIds.includes(p.id) || selected === p.id ? "is-selected" : ""}`}
          role="button"
          tabIndex={
            p.key === visiblePieces.find((b) => b.id === p.id)?.key ? 0 : -1
          }
          aria-label={`${MATERIALS[p.material].name}${SHAPE_NAMES[design.parts.find((x) => x.id === p.id)?.shape ?? "block"]}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(p.id, !snapshot && (e.shiftKey || tool === "select"));
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
      {selectionBox && (
        <rect
          x={sx(Math.min(selectionBox.a.x, selectionBox.b.x))}
          y={sy(Math.max(selectionBox.a.y, selectionBox.b.y))}
          width={Math.abs(selectionBox.a.x - selectionBox.b.x) * 62.5}
          height={Math.abs(selectionBox.a.y - selectionBox.b.y) * 62.5}
          fill="var(--cyan-300)"
          fillOpacity=".12"
          stroke="var(--cyan-300)"
          strokeWidth="2"
          strokeDasharray="8 5"
          pointerEvents="none"
        />
      )}
      {drawWind(windLines, "house-wind-motion")}
      {drawWind(stillWindLines, "house-wind-still")}
      {editingTask &&
        !snapshot &&
        [
          ...(challenge.zones ?? []).map((z) => ({
            id: "zone:" + z.id,
            x: (z.left + z.right) / 2,
            y: (z.bottom + z.top) / 2,
            label: "拖动" + (z.kind === "forbidden" ? "禁入区域" : "必经区域"),
          })),
          ...(challenge.flags.height
            ? [
                {
                  id: "height",
                  x: view.x,
                  y: challenge.height,
                  label: "拖动任务高度",
                },
              ]
            : []),
          ...(challenge.flags.target
            ? [{ id: "target", ...challenge.target, label: "拖动目标点" }]
            : []),
          ...(challenge.flags.foundation
            ? challenge.regions.map((r, i) => ({
                id: "foundation:" + i,
                x: (r.left + r.right) / 2,
                y: 0,
                label: "拖动地基 " + (i + 1),
              }))
            : []),
        ].map((handle) => (
          <g
            key={handle.id}
            data-task-goal={handle.id}
            className="house-task-handle"
            role="button"
            tabIndex={0}
            aria-label={handle.label}
            onKeyDown={(e) => {
              const delta = {
                ArrowLeft: [-0.1, 0],
                ArrowRight: [0.1, 0],
                ArrowUp: [0, 0.1],
                ArrowDown: [0, -0.1],
              }[e.key];
              if (delta) {
                e.preventDefault();
                e.stopPropagation();
                onTaskChange(
                  moveTaskGoal(challenge, handle.id, {
                    x: handle.x + delta[0],
                    y: handle.y + delta[1],
                  }),
                );
              }
            }}
          >
            {handle.id === "height" && (
              <line
                x1={sx(view.x - view.span / 2)}
                x2={sx(view.x + view.span / 2)}
                y1={sy(handle.y)}
                y2={sy(handle.y)}
                stroke="transparent"
                strokeWidth={labelSize * 1.5}
              />
            )}
            <rect
              x={sx(handle.x) - labelSize}
              y={sy(handle.y) - labelSize * 0.65}
              width={labelSize * 2}
              height={labelSize * 1.3}
              rx={labelSize * 0.3}
              fill="var(--space-850)"
              stroke="var(--cyan-300)"
              strokeWidth="2"
            />
            <text
              x={sx(handle.x)}
              y={sy(handle.y) + labelSize * 0.3}
              textAnchor="middle"
              fill="var(--cyan-300)"
              fontSize={labelSize}
            >
              {handle.id === "height"
                ? "↕"
                : handle.id === "target" || handle.id.startsWith("zone:")
                  ? "✛"
                  : "↔"}
            </text>
            <title>{handle.label}，也可用方向键微调</title>
          </g>
        ))}
    </svg>
  );
}
