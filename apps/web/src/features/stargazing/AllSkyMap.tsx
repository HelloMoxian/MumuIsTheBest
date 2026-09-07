import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { Constellation, SkyLayers, Star } from "./types";
import { colorForStar, wrapDegrees } from "./astronomy";

type Point = { x: number; y: number };
type Segment = { a: Point; b: Point };
const MAP_WIDTH = 1_000;
const MAP_HEIGHT = 500;

export function atlasPoint(ra: number, dec: number): Point {
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || Math.abs(dec) > 90) return { x: NaN, y: NaN };
  return { x: MAP_WIDTH - wrapDegrees(ra) / 360 * MAP_WIDTH, y: (90 - dec) / 180 * MAP_HEIGHT };
}

/** Split a line crossing the map's RA=0 seam into its two visible edge pieces. */
export function atlasLineSegments(line: [number, number][]): Segment[] {
  const result: Segment[] = [];
  for (let index = 1; index < line.length; index += 1) {
    const a = atlasPoint(...line[index - 1]), b = atlasPoint(...line[index]);
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
    if (Math.abs(a.x - b.x) <= MAP_WIDTH / 2) { result.push({ a, b }); continue; }
    const shiftedB = b.x > a.x ? b.x - MAP_WIDTH : b.x + MAP_WIDTH;
    const edge = shiftedB < 0 ? 0 : MAP_WIDTH;
    const fraction = (edge - a.x) / (shiftedB - a.x);
    const edgeY = a.y + (b.y - a.y) * fraction;
    result.push({ a, b: { x: edge, y: edgeY } });
    result.push({ a: { x: edge === 0 ? MAP_WIDTH : 0, y: edgeY }, b });
  }
  return result;
}

function distanceToSegment(point: Point, segment: Segment) {
  const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - segment.a.x - t * dx, point.y - segment.a.y - t * dy);
}

export function atlasNearestConstellation(items: { id: string; center: Point; segments: Segment[] }[], point: Point, scale: number, lines: boolean): string | null {
  if (![point.x, point.y, scale].every(Number.isFinite) || scale <= 0) return null;
  let closest: string | null = null, distance = 24 / scale;
  for (const item of items) {
    const centerDistance = Math.hypot(point.x - item.center.x, point.y - item.center.y);
    const next = lines ? Math.min(centerDistance, ...item.segments.map(segment => distanceToSegment(point, segment))) : centerDistance;
    if (next <= distance) { closest = item.id; distance = next; }
  }
  return closest;
}

export function AllSkyMap({ stars, constellations, layers, selectedIds, title, onSelect }: {
  stars: Star[]; constellations: Constellation[]; layers: SkyLayers; selectedIds: string[]; title?: string; onSelect: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const pointerStart = useRef<Point | null>(null);
  const dots = useMemo(() => stars.filter(star => Number.isFinite(star.ra) && Number.isFinite(star.dec) && Math.abs(star.dec) <= 90)
    .map(star => ({ star, point: atlasPoint(star.ra, star.dec), color: colorForStar(star) })), [stars]);
  const figures = useMemo(() => constellations.map(constellation => ({
    ...constellation, center: atlasPoint(constellation.ra, constellation.dec), segments: constellation.lines.flatMap(atlasLineSegments),
  })), [constellations]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const resize = () => {
      const rect = svg.getBoundingClientRect();
      const next = Math.max(0.05, Math.min(rect.width / 1016, rect.height / 535));
      setScale(previous => Math.abs(previous - next) > 0.001 ? next : previous);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(svg); resize();
    return () => observer.disconnect();
  }, []);

  const labels = useMemo(() => {
    if (!layers.labels) return [];
    const boxes: { id: string; name: string; x: number; y: number; width: number; height: number }[] = [];
    for (const item of [...figures].sort((a, b) => Number(selectedIds.includes(b.id)) - Number(selectedIds.includes(a.id)) || a.rank - b.rank)) {
      if (item.rank > 30 && !selectedIds.includes(item.id)) continue;
      const width = Math.max(item.name.length * 18, 48) / scale, height = 26 / scale;
      const x = Math.max(0, Math.min(MAP_WIDTH - width, item.center.x - width / 2));
      const y = Math.max(0, Math.min(MAP_HEIGHT - height, item.center.y - 26 / scale));
      if (boxes.some(other => x < other.x + other.width + 12 / scale && x + width + 12 / scale > other.x && y < other.y + other.height + 6 / scale && y + height + 6 / scale > other.y)) continue;
      boxes.push({ id: item.id, name: item.name, x, y, width, height });
    }
    return boxes;
  }, [figures, layers.labels, scale, selectedIds]);

  const pick = (event: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current, matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const cursor = svg.createSVGPoint();
    cursor.x = event.clientX; cursor.y = event.clientY;
    const point = cursor.matrixTransform(matrix.inverse());
    // This includes SVG letterboxing, page offsets and CSS resizing; a separate HTML percentage overlay does not.
    const actualScale = Math.hypot(matrix.a, matrix.b);
    const label = labels.find(item => point.x >= item.x && point.x <= item.x + item.width && point.y >= item.y && point.y <= item.y + item.height);
    return label?.id ?? atlasNearestConstellation(figures, point, actualScale, layers.lines);
  };
  const activeId = hovered || focused;
  const active = figures.find(figure => figure.id === activeId);
  const activeLabelWidth = active ? (active.name.length * 18 + 28) / scale : 0;
  const activeLabelX = active ? Math.max(activeLabelWidth / 2, Math.min(MAP_WIDTH - activeLabelWidth / 2, active.center.x)) : 0;
  const activeLabelY = active ? Math.max(26 / scale, active.center.y - 30 / scale) : 0;

  return <div className={`sg-atlas${title ? " sg-atlas-collection" : ""}`} data-visible-star-count={stars.length} data-constellation-count={constellations.length}>
    <div className="sg-atlas-heading"><h2>{title || "一眼看见全天"}</h2><p>{title ? `只展示这一组 ${constellations.length} 个星座 · 点一座，单独观察` : "把整个天球展开 · 点星座，走近看"}</p></div>
    <svg ref={svgRef} viewBox="-8 -18 1016 535" role="group" aria-label={`${title || "全天八十八星座"}展开图。赤经由右向左增加、赤纬由上向下减少。点星座连线或名称进入，也可用 Tab 选择星座并按回车。`}
      onPointerDown={event => { pointerStart.current = { x: event.clientX, y: event.clientY }; }}
      onClick={event => {
        if (pointerStart.current && Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y) > 12) return;
        const id = pick(event); if (id) onSelect(id);
      }}
      onMouseMove={event => setHovered(pick(event))} onMouseLeave={() => setHovered(null)}
      style={{ cursor: hovered ? "pointer" : "default" }}>
      {layers.grid && <g className="sg-atlas-grid" aria-hidden="true">
        {[0, 60, 120, 180, 240, 300, 360].map(ra => <path key={ra} d={"M" + (1000 - ra / 360 * 1000) + ",0 V500"} />)}
        {[-60, -30, 0, 30, 60].map(dec => <path key={dec} d={"M0," + atlasPoint(0, dec).y + " H1000"} />)}
      </g>}
      <rect x="0" y="0" width="1000" height="500" rx="6" fill="none" stroke="var(--line-glow)" aria-hidden="true" />
      <g aria-hidden="true">{dots.map(({ star, point, color }) => <circle key={star.id} cx={point.x} cy={point.y} r={Math.max(.35, 1.8 - star.magnitude * .21)} fill={color} opacity={Math.max(.22, 1 - star.magnitude * .1)} />)}</g>
      {figures.map(figure => <g key={figure.id} className="sg-atlas-constellation" role="button" tabIndex={0} aria-label={"查看" + figure.name} aria-pressed={selectedIds.includes(figure.id)}
        onFocus={() => setFocused(figure.id)} onBlur={() => setFocused(null)}
        onClick={event => { if (event.detail === 0) { event.stopPropagation(); onSelect(figure.id); } }}
        onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect(figure.id); } }}
        opacity={selectedIds.length && !selectedIds.includes(figure.id) ? .25 : 1} style={{ outline: "none" }}>
        {layers.lines && figure.segments.map((segment, index) => <path key={index} d={"M" + segment.a.x + "," + segment.a.y + " L" + segment.b.x + "," + segment.b.y} vectorEffect="non-scaling-stroke" style={{ strokeWidth: .8, opacity: activeId === figure.id ? .85 : .38 }} />)}
        <circle cx={figure.center.x} cy={figure.center.y} r={24 / scale} fill="transparent" stroke="none" aria-hidden="true" />
      </g>)}
      <g aria-hidden="true" style={{ pointerEvents: "none" }}>{labels.map(label => <text key={label.id} x={label.x + label.width / 2} y={label.y + label.height / 2} textAnchor="middle" dominantBaseline="middle" fill="var(--ink-secondary)" style={{ fontSize: 18 / scale, fontWeight: 400, paintOrder: "stroke", stroke: "var(--space-950)", strokeWidth: 3 / scale }}>{label.name}</text>)}</g>
      {active && <g aria-hidden="true" style={{ pointerEvents: "none" }}>
        <circle cx={active.center.x} cy={active.center.y} r={24 / scale} fill="var(--glass-500)" stroke="var(--cyan-300)" strokeWidth={1.5 / scale} />
        <rect x={activeLabelX - activeLabelWidth / 2} y={activeLabelY - 25 / scale} width={activeLabelWidth} height={34 / scale} rx={8 / scale} fill="var(--glass-700)" />
        <text x={activeLabelX} y={activeLabelY} textAnchor="middle" fill="var(--ink-primary)" style={{ fontSize: 18 / scale }}>{active.name}</text>
      </g>}
      <text x="8" y={-8 / scale} className="sg-atlas-axis" style={{ fontSize: 18 / scale }}>北天 +90°</text>
      <text x="8" y={500 + 24 / scale} className="sg-atlas-axis" style={{ fontSize: 18 / scale }}>南天 −90°</text>
    </svg>
  </div>;
}
