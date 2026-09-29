import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { GameTopBar } from "../../shared/GameTopBar";
import { useGameFullscreen } from "../../shared/useGameFullscreen";
import { PICTURES } from "./pictures";
import { STORAGE_KEY, createPuzzle, isSolved, movable, play, slide, solvedCells, undo, type Puzzle } from "./logic";
import { PuzzleConflict, readPuzzle, savePuzzle } from "./storage";
import { GemAudio } from "../bejeweled/audio";
import { audioFocus } from "../../shared/audio/audio-focus";
import "./sliding-puzzle.css";

type Intro = { id: string; phase: "whole" | "split" | "hole" | "shuffle"; step: number; cells: number[] };
type Dialog = "pictures" | "size" | "restart" | null;
type VictoryPhase = "settle" | "sparkle" | "breathe" | "reveal" | "complete";
const VICTORY_SEQUENCE: Record<Exclude<VictoryPhase, "complete">, { duration: number; next: VictoryPhase }> = {
  settle: { duration: 240, next: "sparkle" },
  sparkle: { duration: 1200, next: "breathe" },
  breathe: { duration: 2400, next: "reveal" },
  reveal: { duration: 900, next: "complete" },
};
const choices = [2, 3, 4, 5, 6];
export function SlidingPuzzleGame() {
  const root = useRef<HTMLDivElement>(null), modal = useRef<HTMLDialogElement>(null);
  const fullscreen = useGameFullscreen(root);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const current = useRef<Puzzle | null>(null);
  const [intro, setIntro] = useState<Intro | null>(null);
  const [victory, setVictory] = useState<{ id: string; phase: VictoryPhase } | null>(null);
  const victoryClock = useRef({ key: "", remaining: 0 });
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const conflictRef = useRef(false), saved = useRef<string | null>(null), unsaved = useRef(false);
  const initialized = useRef(false), lockedUntil = useRef(0);
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">("loading");
  const [imageAttempt, setImageAttempt] = useState(0);
  const [hoveredTile, setHoveredTile] = useState<number | null>(null);
  const [focusedTile, setFocusedTile] = useState<number | null>(null);
  const [sound, setSound] = useState(false);
  const audio = useRef<GemAudio | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [draftRows, setDraftRows] = useState(3), [draftCols, setDraftCols] = useState(3);
  const [draftImage, setDraftImage] = useState<string | undefined>();
  const opener = useRef<HTMLElement | null>(null);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const effects = new GemAudio();
    audio.current = effects;
    return () => { effects.dispose(); audio.current = null; };
  }, []);
  useEffect(() => {
    audio.current?.configure(sound, .35);
  }, [sound]);
  useEffect(() => {
    const sync = () => audio.current?.setStopped(document.hidden || !!dialog || conflict || audioFocus.isMicrophoneActive());
    sync();
    const unsubscribe = audioFocus.subscribe(sync);
    document.addEventListener("visibilitychange", sync);
    return () => { unsubscribe(); document.removeEventListener("visibilitychange", sync); };
  }, [dialog, conflict]);

  const persist = useCallback((next: Puzzle, replace = false) => {
    try {
      const raw = savePuzzle(localStorage, next, saved.current, replace);
      saved.current = raw; unsaved.current = false; setSaveError("");
    } catch (error) {
      if (error instanceof PuzzleConflict) { conflictRef.current = true; setConflict(true); }
      unsaved.current = true;
      setSaveError(conflictRef.current && error instanceof Error ? error.message : "进度未保存，请重试");
    }
  }, []);
  const commit = useCallback((next: Puzzle) => {
    current.current = next; setPuzzle(next); persist(next);
  }, [persist]);
  const start = useCallback((rows: number, cols: number, imageId?: string, replace = false) => {
    const next = createPuzzle(rows, cols, imageId);
    conflictRef.current = false; setConflict(false); setLoadError("");
    current.current = next; setPuzzle(next); setHoveredTile(null); setFocusedTile(null);
    setVictory(null);
    setIntro({ id: next.id, phase: "whole", step: 0, cells: solvedCells(rows, cols) });
    lockedUntil.current = 0; persist(next, replace);
  }, [persist]);
  const read = useCallback(() => {
    try {
      const { raw, puzzle: restored } = readPuzzle(localStorage);
      saved.current = raw; conflictRef.current = false; setConflict(false);
      unsaved.current = false; setSaveError(""); setLoadError("");
      if (restored) {
        current.current = restored; setPuzzle(restored); setIntro(null); setHoveredTile(null); setFocusedTile(null);
        setVictory(null);
      } else start(3, 3);
    } catch {
      setLoadError("原来的进度暂时无法读取");
    }
  }, [start]);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true; read();
  }, [read]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if ((event.key === STORAGE_KEY || event.key === null) && event.newValue !== saved.current) {
        conflictRef.current = true; setConflict(true);
      }
    };
    const beforeLeave = (event: BeforeUnloadEvent) => {
      if (unsaved.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const visibility = () => setVisible(!document.hidden);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(media.matches);
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("storage", onStorage); window.addEventListener("beforeunload", beforeLeave);
    return () => {
      media.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("storage", onStorage); window.removeEventListener("beforeunload", beforeLeave);
    };
  }, []);
  const picture = PICTURES.find(p => p.id === puzzle?.imageId);
  useEffect(() => {
    if (!picture) return;
    let alive = true;
    setImageState("loading");
    const image = new Image();
    image.onload = () => { if (alive) setImageState("ready"); };
    image.onerror = () => { if (alive) setImageState("error"); };
    image.src = picture.src;
    return () => { alive = false; image.onload = null; image.onerror = null; };
  }, [picture, imageAttempt]);

  useEffect(() => {
    if (!intro || !puzzle || intro.id !== puzzle.id || imageState === "loading" || !visible || dialog || conflict) return;
    if (reduced || imageState === "error") { setIntro(null); return; }
    const delay = intro.phase === "whole" ? 1200 : intro.phase === "split" ? 750 : intro.phase === "hole" ? 500 : 32;
    const timer = window.setTimeout(() => {
      if (intro.phase === "whole") setIntro({ ...intro, phase: "split" });
      else if (intro.phase === "split") setIntro({ ...intro, phase: "hole" });
      else if (intro.phase === "hole") setIntro({ ...intro, phase: "shuffle" });
      else if (intro.step < puzzle.shuffle.length) {
        const step = puzzle.shuffle[intro.step];
        audio.current?.play("swap");
        setIntro({ ...intro, step: intro.step + 1, cells: slide(intro.cells, puzzle.cols, step.from) });
      } else setIntro(null);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [intro, puzzle, imageState, visible, dialog, conflict, reduced]);

  useEffect(() => {
    if (dialog && !modal.current?.open) modal.current?.showModal();
  }, [dialog]);
  const closeDialog = () => {
    modal.current?.close(); setDialog(null);
    opener.current?.focus({ preventScroll: true });
  };
  const openDialog = (kind: Dialog) => {
    setHoveredTile(null); setFocusedTile(null);
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDraftRows(current.current?.rows ?? 3); setDraftCols(current.current?.cols ?? 3);
    setDraftImage(kind === "pictures" ? current.current?.imageId : undefined); setDialog(kind);
  };
  const move = useCallback((tile: number) => {
    const previous = current.current;
    if (!previous || intro || dialog || conflictRef.current || loadError || Date.now() < lockedUntil.current) return;
    const next = play(previous, previous.cells.indexOf(tile));
    if (next === previous) return;
    if (isSolved(next.cells)) {
      setVictory({ id: next.id, phase: reduced ? "complete" : "settle" });
      setHoveredTile(null); setFocusedTile(null);
    }
    audio.current?.play(isSolved(next.cells) && reduced ? "clear" : "swap");
    lockedUntil.current = Date.now() + (reduced ? 0 : 180); commit(next);
  }, [intro, dialog, loadError, reduced, commit]);
  const stepBack = useCallback(() => {
    const previous = current.current;
    if (!previous || intro || dialog || conflictRef.current || loadError || Date.now() < lockedUntil.current) return;
    const next = undo(previous);
    if (next !== previous) { setVictory(null); audio.current?.play("return"); lockedUntil.current = Date.now() + (reduced ? 0 : 180); commit(next); }
  }, [intro, dialog, loadError, reduced, commit]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || dialog) return;
      if (event.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.key.toLowerCase() === "z") { event.preventDefault(); stepBack(); return; }
      const p = current.current;
      if (!p) return;
      const empty = p.cells.indexOf(0), row = Math.floor(empty / p.cols), col = empty % p.cols;
      const index = event.key === "ArrowLeft" && col > 0 ? empty - 1
        : event.key === "ArrowRight" && col < p.cols - 1 ? empty + 1
        : event.key === "ArrowUp" && row > 0 ? empty - p.cols
        : event.key === "ArrowDown" && row < p.rows - 1 ? empty + p.cols : -1;
      if (event.key.startsWith("Arrow")) event.preventDefault();
      if (index >= 0) move(p.cells[index]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, stepBack, dialog]);

  const done = !!puzzle && !intro && isSolved(puzzle.cells);
  const victoryPhase = done ? (victory?.id === puzzle?.id ? victory.phase : "complete") : null;
  useEffect(() => {
    if (!done || !victory || victory.phase === "complete") return;
    if (reduced) { setVictory({ ...victory, phase: "complete" }); return; }
    if (!visible || dialog || conflict) return;
    const stage = VICTORY_SEQUENCE[victory.phase];
    const key = victory.id + ":" + victory.phase;
    if (victoryClock.current.key !== key) victoryClock.current = { key, remaining: stage.duration };
    const clock = victoryClock.current, started = performance.now();
    const timer = window.setTimeout(() => {
      if (victory.phase === "settle") audio.current?.play("clear");
      setVictory(previous => previous === victory ? { ...victory, phase: stage.next } : previous);
    }, clock.remaining);
    return () => {
      window.clearTimeout(timer);
      clock.remaining = Math.max(0, clock.remaining - (performance.now() - started));
    };
  }, [done, victory, reduced, visible, dialog, conflict]);
  const cells = intro?.cells ?? puzzle?.cells ?? [];
  const rows = puzzle?.rows ?? 3, cols = puzzle?.cols ?? 3;
  const blocked = !!intro || conflict || !!loadError || imageState === "loading";
  const highlightedTiles = intro || dialog || done ? [] : [...new Set([hoveredTile, focusedTile].filter((tile): tile is number => tile !== null))];
  const style = {
    "--puzzle-cols": cols, "--puzzle-rows": rows, "--puzzle-ratio": cols / rows,
    "--puzzle-crop": ((puzzle?.cropX ?? 0.5) * 100) + "% " + ((puzzle?.cropY ?? 0.5) * 100) + "%",
  } as CSSProperties;
  const pictureStyle = (tile: number): CSSProperties => ({
    width: (cols * 100) + "%", height: (rows * 100) + "%",
    left: "-" + (((tile - 1) % cols) * 100) + "%",
    top: "-" + (Math.floor((tile - 1) / cols) * 100) + "%",
  });
  const place = (index: number): CSSProperties => ({
    width: (100 / cols) + "%", height: (100 / rows) + "%",
    transform: "translate(" + ((index % cols) * 100) + "%, " + (Math.floor(index / cols) * 100) + "%)",
  });
  return <div ref={root} className={"sliding-puzzle " + (fullscreen.focused ? "sliding-puzzle--fullscreen " : "") + (done ? "has-victory " : "") + (!visible || dialog || conflict ? "is-celebration-paused" : "")} data-skip-startup-greeting style={style} onPointerDownCapture={() => audio.current?.unlock()} onKeyDownCapture={() => audio.current?.unlock()}>
    {done && <div className="sliding-puzzle__celebration" aria-hidden="true">
      <div className="sliding-puzzle__victory-aura" />
      {victory && victoryPhase !== "settle" && victoryPhase !== "complete" && Array.from({ length: 28 }, (_, i) =>
        <span key={i} className="sliding-puzzle__victory-star" style={{
          left: (i % 2 ? 94 - (i % 5) * 3 : 3 + (i % 5) * 3) + "%",
          top: (12 + (i * 17) % 76) + "%",
          "--star-delay": ((i % 7) * 90) + "ms",
          "--star-drift": ((i % 2 ? -1 : 1) * (30 + i % 4 * 18)) + "px",
        } as CSSProperties}>✦</span>)}
    </div>}
    {!fullscreen.focused && <GameTopBar title="华容道" backHref="/?tab=math" backLabel="数学" />}
    <main className="sliding-puzzle__main">
      <div className="sliding-puzzle__toolbar">
        <div className="sliding-puzzle__actions">
          <button disabled={!puzzle || blocked || !puzzle.history.length} onClick={stepBack}>↶ 撤销</button>
          <button disabled={conflict} onClick={() => openDialog("restart")}>新一局</button>
          <button disabled={conflict} onClick={() => openDialog("pictures")}>换图片</button>
          <button disabled={conflict} onClick={() => openDialog("size")}>{rows} × {cols}</button>
          <button aria-pressed={sound} onClick={() => {
            const enabled = !sound;
            audio.current?.configure(enabled, .35);
            if (enabled) audio.current?.unlock();
            setSound(enabled);
          }}>音效：{sound ? "开" : "关"}</button>
        </div>
        <button data-fullscreen-exit={fullscreen.focused || undefined} disabled={fullscreen.switching} onClick={() => void (fullscreen.focused ? fullscreen.leave() : fullscreen.enter())}>{fullscreen.focused ? "退出全屏" : "全屏"}</button>
      </div>
      {(loadError || saveError || conflict) && <div className="sliding-puzzle__notice" role="status">
        <span>{conflict ? "另一页面更新了进度" : loadError || saveError}</span>
        {conflict || loadError ? <button onClick={read}>重新读取</button> : <button onClick={() => puzzle && persist(puzzle)}>重试保存</button>}
      </div>}
      {!puzzle ? <div className="sliding-puzzle__loading" role="status">{loadError ? "可以重试，或开始新一局" : "正在打开拼图…"}</div> : <>
        <div className="sliding-puzzle__workspace">
          <div className="sliding-puzzle__board-space">
            <div className={"sliding-puzzle__board " + (intro ? "is-" + intro.phase : "") + (victoryPhase ? " victory-" + victoryPhase : "")} role="group" aria-label={rows + " 行 " + cols + " 列数字拼图"} aria-busy={!!intro || imageState === "loading"}>
              <div className="sliding-puzzle__empty" style={place(cells.indexOf(0))} aria-hidden="true" />
              {Array.from({ length: rows * cols - 1 }, (_, i) => i + 1).map(tile => {
                const index = cells.indexOf(tile), allowed = movable(cells, cols, index);
                return <button key={tile} className={"sliding-puzzle__tile " + (allowed ? "can-move" : "")}
                  style={place(index)} aria-label={"数字 " + tile + "，第 " + (Math.floor(index / cols) + 1) + " 行第 " + (index % cols + 1) + " 列" + (allowed ? "，可移动" : "")}
                  aria-disabled={blocked || done || !allowed} onClick={() => !blocked && move(tile)}
                  onPointerEnter={event => { if (event.pointerType !== "touch" && !intro) setHoveredTile(tile); }}
                  onPointerLeave={() => setHoveredTile(previous => previous === tile ? null : previous)}
                  onPointerDown={() => setFocusedTile(null)}
                  onFocus={event => { if (!intro && event.currentTarget.matches(":focus-visible")) setFocusedTile(tile); }}
                  onBlur={() => setFocusedTile(previous => previous === tile ? null : previous)}>
                  {imageState === "ready" && <img src={picture?.src} alt="" draggable={false} style={pictureStyle(tile)} />}
                  <span className="sliding-puzzle__number">{tile}</span>
                </button>;
              })}
              <div aria-hidden="true" className={"sliding-puzzle__last " + (intro?.phase === "whole" || intro?.phase === "split" || victoryPhase === "reveal" || victoryPhase === "complete" ? "is-visible" : "")} style={place(rows * cols - 1)}>
                {imageState === "ready" && <img src={picture?.src} alt="" draggable={false} style={pictureStyle(rows * cols)} />}
              </div>
              {intro?.phase === "whole" && imageState === "ready" && <img className="sliding-puzzle__whole" src={picture?.src} alt={picture?.name} />}
              {imageState === "loading" && <div className="sliding-puzzle__image-loading" role="status">图片准备中…</div>}
            </div>
          </div>
          <aside className="sliding-puzzle__reference">
            <div className="sliding-puzzle__reference-title"><strong>完整图片</strong><span>{picture?.name}</span></div>
            <div className="sliding-puzzle__preview">
              {imageState === "ready" ? <img src={picture?.src} alt={picture?.name + "，拼好后的完整图案"} /> : <span>数字拼图</span>}
              {highlightedTiles.map(tile => <span key={tile} aria-hidden="true" className="sliding-puzzle__highlight" style={place(tile - 1)} />)}
            </div>
            {imageState === "error" && <div className="sliding-puzzle__notice" role="status">图片未加载，可继续玩数字<button onClick={() => setImageAttempt(n => n + 1)}>重试图片</button></div>}
          </aside>
        </div>
        <div className="sliding-puzzle__status">
          {done ? <div className="sliding-puzzle__result">
            <span className="sliding-puzzle__victory-message" role="status"><strong>你拼好啦！</strong><span>+{rows * cols * 3} 分</span></span>
            <button onClick={() => start(rows, cols)}>再玩一局</button>
          </div> : <span>{intro ? intro.phase === "shuffle" ? "正在打乱 " + intro.step + " / " + puzzle.shuffle.length : "看一看这张图" : puzzle.history.length + " 步"}</span>}
          {intro && <button onClick={() => setIntro(null)}>跳过演示</button>}
        </div>
      </>}
    </main>
    <dialog ref={modal} className="sliding-puzzle__dialog" aria-labelledby="sliding-puzzle-dialog-title" onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }} onCancel={closeDialog} onClose={() => { setDialog(null); opener.current?.focus({ preventScroll: true }); }}>
      <div className="sliding-puzzle__dialog-heading"><h2 id="sliding-puzzle-dialog-title">{dialog === "pictures" ? "选一张图片" : dialog === "size" ? "棋盘大小" : "开始新一局"}</h2><button onClick={closeDialog}>取消</button></div>
      {dialog === "size" && <div className="sliding-puzzle__dimensions">
        <label>行数<select value={draftRows} onChange={event => setDraftRows(Number(event.target.value))}>{choices.map(n => <option key={n}>{n}</option>)}</select></label>
        <span>×</span>
        <label>列数<select value={draftCols} onChange={event => setDraftCols(Number(event.target.value))}>{choices.map(n => <option key={n}>{n}</option>)}</select></label>
        <div className="sliding-puzzle__mini-grid" style={{ gridTemplateColumns: "repeat(" + draftCols + ", 1fr)", aspectRatio: draftCols + " / " + draftRows }} aria-label={draftRows + " 行 " + draftCols + " 列"}>
          {Array.from({ length: draftRows * draftCols }, (_, i) => <span key={i}>{i === draftRows * draftCols - 1 ? "" : i + 1}</span>)}
        </div>
      </div>}
      {dialog === "pictures" && <div className="sliding-puzzle__gallery">
        <button className="sliding-puzzle__random" aria-pressed={!draftImage} onClick={() => setDraftImage(undefined)}>{!draftImage ? "✓ " : ""}随机图片</button>
        {PICTURES.map(image => <button key={image.id} aria-pressed={draftImage === image.id} onClick={() => setDraftImage(image.id)}>
          <img src={image.src} alt="" loading="lazy" /><span>{draftImage === image.id ? "✓ " : ""}{image.name}</span>
        </button>)}
      </div>}
      <div className="sliding-puzzle__dialog-footer">
        <p>{puzzle && !done ? "将替换当前这一局" : "准备好了吗？"}</p>
        <button className="sliding-puzzle__primary" onClick={() => {
          start(draftRows, draftCols, dialog === "pictures" ? draftImage : undefined, !!loadError);
          closeDialog();
        }}>开始新一局</button>
      </div>
    </dialog>
  </div>;
}
