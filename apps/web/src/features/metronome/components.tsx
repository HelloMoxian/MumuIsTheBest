import type { ButtonHTMLAttributes } from "react";
import { getInstrument, keyLabel } from "./catalog";
import { gridStep, projectTicks, pulseCount, stepTick, TICKS, type InstrumentId, type MusicNote, type MusicProject, type MusicTrack } from "./logic";

const TOOL_PATHS = {
  solo: "M4 14v-3a8 8 0 0 1 16 0v3M4 12H2v8h5v-8H4m16 0h2v8h-5v-8h3",
  volume: "M11 4 5 9H2v6h3l6 5V4m4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
  muted: "M11 4 5 9H2v6h3l6 5V4m5 5 6 6m0-6-6 6",
  edit: "m14 4 6 6M3 21l5-1L21 7a2 2 0 0 0-4-4L4 16l-1 5Z",
  swap: "M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4",
  restart: "M3 4v6h6M3 10a9 9 0 1 1 1 9M10 10h4v4h-4z",
  clear: "m3 14 10-10 8 8-9 9H9l-6-6v-1Zm4-4 8 8m-3 3h9",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  left: "M20 12H4m6-6-6 6 6 6",
  right: "M4 12h16m-6-6 6 6-6 6",
  shorter: "M3 5v14m18-14v14M5 12h5m-3-3 3 3-3 3m12-3h-5m3-3-3 3 3 3",
  longer: "M3 5v14m18-14v14M10 12H5m3-3-3 3 3 3m6-3h5m-3-3 3 3-3 3",
  close: "m6 6 12 12M18 6 6 18",
} as const;
export function ToolButton({ icon, label, className = "", ...props }: { icon: keyof typeof TOOL_PATHS; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={"metro-tool " + className} title={label} aria-label={label} {...props}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={TOOL_PATHS[icon]} /></svg>
  </button>;
}

export function InstrumentIcon({ instrument, className = "" }: { instrument: InstrumentId; className?: string }) {
  return <img className={"metro-instrument-icon " + className} src={"/images/metronome/instruments/v1/" + instrument + ".webp"}
    alt="" aria-hidden="true" width="72" height="72" draggable={false} decoding="async" />;
}
export function TrackStrip({ track, project, playhead, reduced, cursor, leadInBars = 0 }: { track: MusicTrack; project: MusicProject; playhead: number | null; reduced: boolean; cursor?: number; leadInBars?: number }) {
  const length = projectTicks(project), bars = project.bars, pulses = pulseCount(project.preset);
  const leadTicks = leadInBars * pulses * TICKS;
  const x = (tick: number) => Math.max(0, (tick + leadTicks) / (length + leadTicks) * 1000);
  const position = playhead === null ? null : reduced ? Math.floor(playhead / TICKS) * TICKS : playhead;
  return <div className="metro-strip" aria-hidden="true">
    <svg viewBox="0 0 1000 64" preserveAspectRatio="none">
      {leadTicks > 0 && <rect x="0" y="0" width={x(0)} height="64" className="metro-countin-region" />}
      {Array.from({ length: (bars + leadInBars) * pulses + 1 }, (_, i) => <line key={i} x1={x(i * TICKS - leadTicks)} x2={x(i * TICKS - leadTicks)} y1="0" y2="64" className={i % pulses === 0 ? "metro-bar-line" : "metro-beat-line"} />)}
      {track.notes.map(note => <rect key={note.id} x={x(note.tick)} y={49 - note.key * 4.5} width={Math.max(4, note.duration / (length + leadTicks) * 1000 - 2)} height="5" rx="2" className="metro-note-mark" />)}
      {leadTicks > 0 && <line x1={x(0)} x2={x(0)} y1="0" y2="64" className="metro-record-start" />}
      {position !== null && <line x1={x(position)} x2={x(position)} y1="0" y2="64" className="metro-playhead" />}
      {cursor !== undefined && <line x1={x(cursor)} x2={x(cursor)} y1="0" y2="64" className="metro-edit-cursor" />}
    </svg>
    {!track.notes.length && !leadInBars && <span className="metro-empty-track">{project.activeTrackId === track.id ? "点选编曲" : "还没有音符"}</span>}
  </div>;
}
export function StepEditor({ project, track, cursor, selectedId, disabled, onPosition, onUpdate, onDelete, onDivision, onAudition, onClose }: {
  project: MusicProject; track: MusicTrack; cursor: number; selectedId: string | null; disabled: boolean;
  onPosition: (tick: number, noteId?: string) => void; onUpdate: (patch: Partial<Pick<MusicNote, "tick" | "duration">>) => void;
  onDelete: () => void; onDivision: (division: number) => void; onAudition: (key: number) => void; onClose: () => void;
}) {
  const step = gridStep(project), length = projectTicks(project), barTicks = pulseCount(project.preset) * TICKS;
  const bar = Math.floor(cursor / barTicks), columns = barTicks / step, division = TICKS / step;
  const active = track.notes.find(n => n.id === selectedId);
  const cellNotes = track.notes.filter(n => stepTick(project, n.tick) === cursor);
  const fractions: Record<number, string[]> = { 1: [""], 2: ["", "½"], 3: ["", "⅓", "⅔"], 4: ["", "¼", "½", "¾"] };
  return <section className="metro-step-editor" aria-label={getInstrument(track.instrument).name + "手动编辑"} tabIndex={0} onKeyDown={event => {
    if (disabled || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof Element && event.target.closest("input,select"))) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); onPosition(stepTick(project, cursor + (event.key === "ArrowLeft" ? -step : step))); }
    if ((event.key === "Delete" || event.key === "Backspace") && active) { event.preventDefault(); event.stopPropagation(); onDelete(); }
  }}>
    <div className="metro-step-toolbar">
      <ToolButton icon="left" label="上一小节" disabled={disabled || bar === 0} onClick={() => onPosition(cursor - barTicks)} />
      <label>小节<select aria-label="编辑第几小节" value={bar} disabled={disabled} onChange={e => onPosition(Number(e.target.value) * barTicks)}>{Array.from({ length: project.bars }, (_, i) => <option key={i} value={i}>{i + 1} / {project.bars}</option>)}</select></label>
      <ToolButton icon="right" label="下一小节" disabled={disabled || bar >= project.bars - 1} onClick={() => onPosition(cursor + barTicks)} />
      <label>每拍<select aria-label="每拍格数" value={division} disabled={disabled} onChange={e => onDivision(Number(e.target.value))}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} 格</option>)}</select></label>
      <span className="metro-step-hint">点一格，再按 1—0</span>
      <ToolButton icon="close" label="完成手动编辑" disabled={disabled} onClick={onClose} />
    </div>
    <div className="metro-step-scroll"><div className="metro-step-cells" style={{ gridTemplateColumns: "repeat(" + columns + ", minmax(44px, 1fr))" }}>
      {Array.from({ length: columns }, (_, column) => {
        const tick = bar * barTicks + column * step, notes = track.notes.filter(n => stepTick(project, n.tick) === tick);
        const tail = track.notes.some(n => n.tick < tick && n.tick + n.duration > tick);
        const label = String(Math.floor(column / division) + 1) + fractions[division][column % division];
        return <button key={tick} type="button" disabled={disabled} className={"metro-step-cell" + (column % division === 0 ? " is-beat" : "") + (tail ? " has-tail" : "")} aria-pressed={cursor === tick}
          aria-label={"第 " + (bar + 1) + " 小节，第 " + label + " 拍" + (notes.length ? "，" + notes.map(n => keyLabel(track, project, n.key)).join("、") : "，空位置")}
          onClick={() => onPosition(tick)}><small>{label}</small><span>{notes.length ? notes.map(n => keyLabel(track, project, n.key)).join(" · ") : tail ? "—" : "+"}</span></button>;
      })}
    </div></div>
    <div className="metro-step-toolbar metro-step-selection">
      <div className="metro-step-notes">{cellNotes.length ? cellNotes.map(note => <button key={note.id} disabled={disabled} aria-pressed={active?.id === note.id} onClick={() => { onPosition(note.tick, note.id); onAudition(note.key); }}>{keyLabel(track, project, note.key)}</button>) : <span>空位置</span>}</div>
      {active && <span className="metro-note-length">{Number((active.duration / TICKS).toFixed(2))} 拍</span>}
      <ToolButton icon="left" label="音符前移一格" disabled={disabled || !active || active.tick <= 0} onClick={() => active && onUpdate({ tick: active.tick - step })} />
      <ToolButton icon="right" label="音符后移一格" disabled={disabled || !active || active.tick + step >= length} onClick={() => active && onUpdate({ tick: active.tick + step })} />
      <ToolButton icon="shorter" label="缩短音符" disabled={disabled || !active || active.duration <= step} onClick={() => active && onUpdate({ duration: active.duration - step })} />
      <ToolButton icon="longer" label="拉长音符" disabled={disabled || !active || active.tick + active.duration >= length} onClick={() => active && onUpdate({ duration: active.duration + step })} />
      <ToolButton icon="trash" label="删除所选音符" disabled={disabled || !active} onClick={onDelete} />
    </div>
  </section>;
}
