import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GameTopBar } from "../../shared/GameTopBar";
import { ControllerSetup } from "../../shared/controllers/ControllerSetup";
import { sameDevice } from "../../shared/controllers/input";
import { bindingLabel } from "../../shared/controllers/registry";
import { useGameControllers } from "../../shared/controllers/useGameControllers";
import { useGameFullscreen } from "../../shared/useGameFullscreen";
import { TetrisAudio, type AudioOptions } from "../tetris/audio";
import { TetrisHeldInput } from "../tetris/input";
import { keyLabel } from "../tetris/keyboard";
import { SUPER_BLOCKS_CONTROLS, superBlocksControllerIntent } from "./controls";
import { actWithKinds, bestMousePlacement, cells, createGame, HEIGHT, KEY_BINDINGS, landing, levelFor, SHAPES, SHAPE_BY_ID, SHAPE_COUNTS, speedFor, tick, WIDTH, type Action, type Game, type Matrix, type Settings } from "./logic";
import { clearSession, defaultPreferences, emptyHistory, loadHistory, loadPreferences, loadSession, saveHistory, savePreferences, saveSession, type StoredPhase, type SuperBlocksHistory, type SuperBlocksPreferences } from "./storage";
import "./super-blocks.css";

type Phase = "ready" | "playing" | "paused" | "finished";
const ACTIONS: { action: Action; label: string }[] = [
  { action: "left", label: "左移" }, { action: "down", label: "下落一格" }, { action: "right", label: "右移" },
  { action: "rotate", label: "变形（右旋）" }, { action: "reverse", label: "左旋" }, { action: "drop", label: "瞬间落底" },
];
const keyFor = (action: Action) => Object.keys(KEY_BINDINGS).find(code => KEY_BINDINGS[code][1] === action)!;
const colorClass = (kind: string) => `crystal-super-${SHAPES.findIndex(shape => shape.id === kind) % 7}`;
function mouseBaseline(clientX: number, bounds: Pick<DOMRect, "left" | "right" | "width">) {
  if (clientX <= bounds.left) return 0;
  if (clientX >= bounds.right) return WIDTH - 2;
  const pointedColumn = Math.floor((clientX - bounds.left) / bounds.width * WIDTH);
  return Math.min(WIDTH - 2, Math.max(0, pointedColumn - 1));
}

function MiniPiece({ kind, matrix = SHAPE_BY_ID.get(kind)!.matrix }: { kind: string; matrix?: Matrix }) {
  return <span className="tetris-mini" aria-label={`${SHAPE_BY_ID.get(kind)!.size} 格积木`} style={{ gridTemplateColumns: `repeat(${matrix.length}, 1fr)` }}>
    {matrix.flatMap((row, y) => row.map((value, x) => <span key={`${x}-${y}`} className={value ? `tetris-crystal ${colorClass(kind)}` : ""} />))}
  </span>;
}

function ShapeStats({ appearances }: { appearances: Record<string, number> }) {
  return <div className="super-blocks-shape-grid">
    {SHAPES.map(shape => <div className="super-blocks-shape-stat" key={shape.id}><MiniPiece kind={shape.id} /><span>{shape.size} 格 · {shape.id}</span><strong>× {appearances[shape.id] ?? 0}</strong></div>)}
  </div>;
}

function ShapeBars({ appearances, enabledKinds, toggleKind }: { appearances: Record<string, number>; enabledKinds: ReadonlySet<string>; toggleKind: (kind: string) => void }) {
  const maximum = Math.max(1, ...SHAPES.map(shape => appearances[shape.id] ?? 0));
  return <div className="super-blocks-bars" aria-label="本轮不同积木出现次数">
    {SHAPES.map(shape => {
      const count = appearances[shape.id] ?? 0;
      const progress = count / maximum * 100;
      const enabled = enabledKinds.has(shape.id);
      return <button type="button" className="super-blocks-bar-row" key={shape.id} aria-pressed={enabled} aria-label={`${enabled ? "允许" : "不允许"}${shape.id}，出现 ${count} 次`} onClick={() => toggleKind(shape.id)}>
        <MiniPiece kind={shape.id} />
        <div className="super-blocks-bar-track" role="progressbar" aria-label={`${shape.id} 出现 ${count} 次`} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={count}>
          <span style={{ "--shape-progress": `${progress}%` } as CSSProperties} />
        </div>
        <strong>{count}</strong>
      </button>;
    })}
  </div>;
}

function Board({ game, phase, immersive, move, press, release, connected, controls, enabledKinds, toggleKind, mouseMode, aimMouse, resume }: {
  game: Game; phase: Phase; immersive: boolean; connected: boolean; controls: ReturnType<typeof useGameControllers>["profile"]["players"][number];
  enabledKinds: ReadonlySet<string>; toggleKind: (kind: string) => void; mouseMode: boolean; aimMouse: (baselineLeft: number) => void;
  move: (action: Action) => void; press: (id: string, action: Action) => void; release: (id: string) => void; resume: () => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null); const aimMouseRef = useRef(aimMouse); aimMouseRef.current = aimMouse;
  const active = new Set(cells(game.piece).map(([x, y]) => y * WIDTH + x));
  const ghost = new Set(cells(landing(game)).map(([x, y]) => y * WIDTH + x));
  const clearing = game.clearing;
  const covered = phase === "paused" || (game.ended && !clearing);
  const speed = speedFor(game.settings, game.lines);
  useEffect(() => {
    if (!mouseMode || phase !== "playing") return;
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const bounds = boardRef.current?.getBoundingClientRect(); if (!bounds) return;
      const cell = bounds.width / WIDTH;
      if (event.clientX < bounds.left - cell * 2 || event.clientX > bounds.right + cell * 2 || event.clientY < bounds.top - cell * 2 || event.clientY > bounds.bottom + cell * 2) return;
      aimMouseRef.current(mouseBaseline(event.clientX, bounds));
    };
    window.addEventListener("pointermove", pointerMove);
    return () => window.removeEventListener("pointermove", pointerMove);
  }, [mouseMode, phase]);
  return <section className="tetris-player player-1" aria-label="超级积木棋盘">
    <header className="tetris-player-heading"><span className="tetris-player-number">01</span><div><h2>单人探索</h2><span>{controls.mode === "gamepad" ? connected ? "✓ 手柄 + 键盘" : "手柄待连接 · 键盘可用" : "键盘与屏幕按钮"}</span></div><div className="tetris-score"><span>得分</span><strong>{game.score.toLocaleString()}</strong></div></header>
    <div className="tetris-playfield-layout">
      <div className="tetris-board-frame">
        <div ref={boardRef} className={`tetris-board ${mouseMode ? "is-mouse-mode" : ""}`} role="img" aria-label={`20 列棋盘，已消除 ${game.lines} 行，本轮出现 ${game.cellsSpawned} 个小格`} onPointerDown={event => {
          if (!mouseMode || event.pointerType !== "mouse" || event.button !== 0 || phase !== "playing") return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          aimMouse(mouseBaseline(event.clientX, bounds));
          move("drop");
        }}>
          {(clearing?.board ?? game.board).flatMap((row, y) => row.map((cell, x) => {
            const id = y * WIDTH + x; const moving = !clearing && !game.ended && active.has(id); const kind = moving ? game.piece.kind : cell;
            const breaking = clearing?.rows.includes(y) ?? false; const elapsed = clearing?.elapsed ?? 0;
            const fracture = breaking ? Math.min(1, Math.max(0, (elapsed - x * 11) / 150)) : 0;
            const shift = clearing && !breaking ? clearing.rows.filter(rowIndex => rowIndex > y).length * Math.min(1, Math.max(0, (elapsed - 150) / 240)) : 0;
            const style: CSSProperties = { animationPlayState: phase === "playing" ? "running" : "paused", ...(breaking ? { opacity: 1 - fracture, transform: `translateX(${fracture * 34}%) scale(${1 - fracture * .28})`, "--fracture-progress": fracture } as CSSProperties : clearing ? { transform: `translateY(calc(${shift * 100}% + ${shift}px))` } : {}) };
            return <span key={id} style={style} className={`tetris-cell ${kind ? `tetris-crystal ${colorClass(kind)}` : ""} ${moving ? "is-moving" : ""} ${!clearing && !kind && !game.ended && ghost.has(id) ? "is-ghost" : ""} ${breaking ? "is-fracturing" : ""} ${fracture > 0 ? "is-broken" : ""}`} />;
          }))}
        </div>
        {covered && <div className="tetris-board-cover">{game.ended ? <><span aria-hidden="true">✧</span><h3>拼得很精彩</h3><p>消除 {game.lines} 行 · {game.score} 分</p></> : <button type="button" className="super-blocks-resume" onClick={resume}><span aria-hidden="true">▶</span><strong>继续游戏</strong></button>}</div>}
      </div>
      <aside className="tetris-player-info">
        {immersive ? <div className="super-blocks-live-stats">
          <header><div><strong>本轮积木</strong><span>最多次数为满格</span></div><dl><div><dt>行</dt><dd>{game.lines}</dd></div><div><dt>小格</dt><dd>{game.cellsSpawned}</dd></div></dl></header>
          <ShapeBars appearances={game.appearances} enabledKinds={enabledKinds} toggleKind={toggleKind} />
        </div> : <>
          <div className="tetris-next"><h3>接下来</h3>{game.next.map((kind, index) => <MiniPiece key={`${index}-${kind}`} kind={kind} />)}</div>
          <dl><div><dt>等级</dt><dd>{levelFor(game.lines).toString().padStart(2, "0")}</dd></div><div><dt>速度</dt><dd>{speed}<small> / 100</small></dd></div><div><dt>本轮消行</dt><dd>{game.lines}</dd></div><div><dt>本轮小格</dt><dd>{game.cellsSpawned}</dd></div></dl>
          <div className="tetris-level-progress"><span>再消 {20 - game.lines % 20} 行升级</span><progress max={20} value={game.lines % 20} aria-label="升级进度" /></div>
          {speed === 0 && <p className="tetris-manual">手动下落</p>}
        </>}
      </aside>
    </div>
    <div className="tetris-praise" aria-live="polite"><strong>✦ 29 种积木，慢慢找到好位置</strong><span>虚线框是当前积木的落点</span></div>
    <div className="tetris-controls" aria-label="触控操作">
      {ACTIONS.map(control => <button key={control.action} type="button" disabled={phase !== "playing" || game.ended} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); press(`pointer-${event.pointerId}`, control.action); }} onPointerUp={event => release(`pointer-${event.pointerId}`)} onPointerCancel={event => release(`pointer-${event.pointerId}`)} onLostPointerCapture={event => release(`pointer-${event.pointerId}`)} onClick={event => { if (event.detail === 0) move(control.action); }}><kbd>{keyLabel(keyFor(control.action))}</kbd><span>{control.label}</span></button>)}
    </div>
    {!immersive && controls.mode === "gamepad" && <details className="controller-help"><summary>我的手柄键位</summary><dl>{SUPER_BLOCKS_CONTROLS.actions.map(action => <div key={action.id}><dt>{action.label}</dt><dd>{controls.bindings[action.id]?.map(binding => bindingLabel(binding, controls.device?.mapping !== "")).join(" / ") || "尚未设置"}</dd></div>)}</dl></details>}
  </section>;
}

export function SuperBlocksGame() {
  const pageRef = useRef<HTMLDivElement>(null); const arena = useRef<HTMLDivElement>(null); const fullscreen = useGameFullscreen(pageRef);
  const [phase, setPhase] = useState<Phase>("ready"); const [initialSpeed, setInitialSpeed] = useState("0"); const [increment, setIncrement] = useState("0");
  const [audioOptions, setAudioOptions] = useState<AudioOptions>({ music: false, effects: true }); const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [notice, setNotice] = useState(""); const [showControls, setShowControls] = useState(false); const [confirmReset, setConfirmReset] = useState(false); const [confirmRestart, setConfirmRestart] = useState(false);
  const [history, setHistory] = useState<SuperBlocksHistory>(emptyHistory); const [, redraw] = useState(0);
  const [enabledKinds, setEnabledKinds] = useState<Set<string>>(() => new Set(SHAPES.map(shape => shape.id))); const [mouseMode, setMouseMode] = useState(false);
  const model = useRef<{ game: Game | null; phase: Phase; held: TetrisHeldInput }>({ game: null, phase: "ready", held: new TetrisHeldInput(KEY_BINDINGS) });
  const audio = useRef<TetrisAudio | null>(null); const committed = useRef({ lines: 0, appearances: {} as Record<string, number> }); const lastSave = useRef(0);
  const enabledKindsRef = useRef<Set<string>>(new Set(SHAPES.map(shape => shape.id))); const preferences = useRef<SuperBlocksPreferences>(defaultPreferences()); const lastMouseAim = useRef({ pieceId: -1, baseline: -1 }); const restartWasPlaying = useRef(false);
  const controllers = useGameControllers(SUPER_BLOCKS_CONTROLS, {
    enabled: (phase === "playing" || phase === "paused") && !confirmReset && !confirmRestart && !showControls, editing: phase === "ready" || showControls,
    onActions: events => {
      const intent = superBlocksControllerIntent(events);
      if (intent.pause && (model.current.phase === "playing" || model.current.phase === "paused")) changePhase(model.current.phase === "playing" ? "paused" : "playing");
      else if (model.current.phase === "playing" && model.current.game) { let changed = false; intent.moves.forEach(action => { changed = actWithKinds(model.current.game!, action, enabledKindsRef.current) || changed; }); if (changed) refresh(); }
    },
    onDisconnect: () => { if (model.current.phase === "playing") { changePhase("paused"); setNotice("手柄连接中断，已经暂停；也可以用键盘继续。"); } },
  });
  const valid = [initialSpeed, increment].every(value => /^\d{1,3}$/.test(value) && Number(value) <= 100);

  function persist(force = false, override = model.current.phase) {
    if (!model.current.game || override === "ready") return; const now = Date.now(); if (!force && now - lastSave.current < 90) return; lastSave.current = now;
    try { saveSession(localStorage, override as StoredPhase, model.current.game); } catch { setNotice("本局可以继续，但浏览器暂时无法保存进度。"); }
  }
  function syncHistory() {
    const game = model.current.game; if (!game) return;
    const lineDelta = Math.max(0, game.lines - committed.current.lines); const next = { ...history, appearances: { ...history.appearances }, totalLines: history.totalLines + lineDelta, totalCells: history.totalCells };
    for (const shape of SHAPES) { const delta = Math.max(0, (game.appearances[shape.id] ?? 0) - (committed.current.appearances[shape.id] ?? 0)); if (delta) { next.appearances[shape.id] = (next.appearances[shape.id] ?? 0) + delta; next.totalCells += delta * shape.size; } }
    committed.current = { lines: game.lines, appearances: { ...game.appearances } };
    if (!lineDelta && next.totalCells === history.totalCells) return;
    try { saveHistory(localStorage, next); setHistory(next); } catch { setNotice("本局会继续，但历史累计暂时无法保存。"); }
  }
  function changePhase(next: Phase) { model.current.phase = next; model.current.held.clear(); controllers.reset(); setPhase(next); audio.current?.setPlaying(next === "playing"); if (next !== "ready") persist(true, next); }
  function refresh() {
    const game = model.current.game; if (!game) return; game.sounds.splice(0).forEach(sound => audio.current?.play(sound)); game.events.splice(0); syncHistory();
    if (model.current.phase === "playing" && game.ended && !game.clearing) changePhase("finished"); else persist(); redraw(value => value + 1);
  }
  function move(action: Action) { if (model.current.phase === "playing" && model.current.game && actWithKinds(model.current.game, action, enabledKindsRef.current)) refresh(); arena.current?.focus(); }
  function press(id: string, action: Action) { const game = model.current.game; if (model.current.phase === "playing" && game && model.current.held.press(id, performance.now(), game.clearing ? -1 : game.pieceId, [0, action])) move(action); }
  function persistPreferences(nextKinds: Set<string>, nextMouseMode: boolean) {
    const next = { ...preferences.current, enabledKinds: [...nextKinds], mouseMode: nextMouseMode, updatedAt: new Date().toISOString() };
    try { savePreferences(localStorage, next); preferences.current = next; } catch { setNotice("本次设置已生效，但浏览器暂时无法保存。"); }
  }
  function toggleKind(kind: string) {
    const next = new Set(enabledKindsRef.current);
    if (next.has(kind)) { if (next.size === 1) return; next.delete(kind); } else next.add(kind);
    enabledKindsRef.current = next; setEnabledKinds(next); persistPreferences(next, mouseMode);
  }
  function toggleMouseMode() { const next = !mouseMode; setMouseMode(next); persistPreferences(enabledKindsRef.current, next); lastMouseAim.current = { pieceId: -1, baseline: -1 }; }
  function aimMouse(baseline: number) {
    const game = model.current.game; if (!game || model.current.phase !== "playing" || game.clearing || game.fastDrop) return;
    if (lastMouseAim.current.pieceId === game.pieceId && lastMouseAim.current.baseline === baseline) return;
    lastMouseAim.current = { pieceId: game.pieceId, baseline };
    const target = bestMousePlacement(game, baseline); if (!target) return;
    game.piece = target; persist(); redraw(value => value + 1);
  }
  function start() {
    if (!valid) return; const settings: Settings = { initialSpeed: Number(initialSpeed), speedIncrement: Number(increment) }; model.current.game = createGame(settings, Date.now(), enabledKindsRef.current); committed.current = { lines: 0, appearances: {} }; setConfirmReset(false); setConfirmRestart(false); setShowControls(false); lastMouseAim.current = { pieceId: -1, baseline: -1 }; audio.current?.restart(); audio.current?.configure(audioOptions); changePhase("playing"); syncHistory(); persist(true, "playing"); setNotice("✓ 本局进度和累计统计会保存在此浏览器");
  }
  function requestRestart() { restartWasPlaying.current = model.current.phase === "playing"; if (restartWasPlaying.current) changePhase("paused"); setConfirmReset(false); setConfirmRestart(true); }
  async function reset() { if (fullscreen.focused) await fullscreen.leave(); changePhase("ready"); model.current.game = null; setConfirmReset(false); setShowControls(false); try { clearSession(localStorage); setNotice(""); } catch { setNotice("浏览器暂时无法清除旧进度，新局仍可继续。"); } }

  useEffect(() => {
    try { const savedPreferences = loadPreferences(localStorage); preferences.current = savedPreferences; const kinds = new Set(savedPreferences.enabledKinds); enabledKindsRef.current = kinds; setEnabledKinds(kinds); setMouseMode(savedPreferences.mouseMode); } catch { setNotice("积木选择暂时无法读取，已允许全部积木。"); }
    try { setHistory(loadHistory(localStorage)); } catch { setNotice("历史累计暂时无法读取，新局仍可开始。"); }
    try { const saved = loadSession(localStorage); if (saved) { model.current.game = saved.game; committed.current = { lines: saved.game.lines, appearances: { ...saved.game.appearances } }; const restored: Phase = saved.phase === "finished" ? "finished" : "paused"; model.current.phase = restored; setPhase(restored); setInitialSpeed(String(saved.game.settings.initialSpeed)); setIncrement(String(saved.game.settings.speedIncrement)); setNotice(saved.phase === "finished" ? "✓ 已恢复上次完成的棋盘" : "✓ 已恢复上次进度，点击继续即可接着玩"); redraw(value => value + 1); } } catch { setNotice("上次进度无法读取；新开一局后会重新保存。"); }
  }, []);
  const callbacks = useRef({ refresh, changePhase, focused: fullscreen.focused, leave: fullscreen.leave, blocked: confirmReset || confirmRestart || showControls }); callbacks.current = { refresh, changePhase, focused: fullscreen.focused, leave: fullscreen.leave, blocked: confirmReset || confirmRestart || showControls };
  useEffect(() => {
    try { audio.current = new TetrisAudio(undefined, () => setAudioUnavailable(true)); } catch { setAudioUnavailable(true); }
    let frame = 0; let previous = performance.now(); const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pause = () => { model.current.held.clear(); if (model.current.phase === "playing") callbacks.current.changePhase("paused"); };
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.metaKey || event.ctrlKey || callbacks.current.blocked) return;
      if (event.code === "Escape" && callbacks.current.focused) { event.preventDefault(); void callbacks.current.leave(); return; }
      if (event.target instanceof Element && event.target.closest("input, select, textarea, button, a, summary, [contenteditable=true]")) return;
      if ((event.code === "Escape" || event.code === "KeyP") && !["ready", "finished"].includes(model.current.phase)) { event.preventDefault(); if (!event.repeat) callbacks.current.changePhase(model.current.phase === "playing" ? "paused" : "playing"); return; }
      const binding = KEY_BINDINGS[event.code]; const game = model.current.game; if (!binding || !game || model.current.phase !== "playing") return; event.preventDefault(); if (!event.repeat && model.current.held.press(event.code, performance.now(), game.clearing ? -1 : game.pieceId, binding) && actWithKinds(game, binding[1], enabledKindsRef.current)) callbacks.current.refresh();
    };
    const keyup = (event: KeyboardEvent) => model.current.held.release(event.code);
    const animate = (now: number) => { const delta = now - previous; previous = now; const game = model.current.game; let changed = false; if (game && model.current.phase === "playing") { for (const [, action, pieceId] of model.current.held.repeat(now, [game.pieceId])) { if (action === "down" && pieceId !== game.pieceId) continue; changed = actWithKinds(game, action, enabledKindsRef.current) || changed; } changed = tick(game, delta, motion.matches, enabledKindsRef.current) || changed; if (changed) callbacks.current.refresh(); } frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate); window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", pause); document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", pause); model.current.held.clear(); audio.current?.dispose(); };
  }, []);

  const audioControls = <>{(["music", "effects"] as const).map(kind => <button key={kind} type="button" className="tetris-button" aria-pressed={audioOptions[kind]} onClick={() => { const next = { ...audioOptions, [kind]: !audioOptions[kind] }; setAudioOptions(next); audio.current?.configure(next); }}>{kind === "music" ? "音乐" : "音效"}：{audioOptions[kind] ? "开 ✓" : "关"}</button>)}</>;
  const mouseModeToggle = <label className="super-blocks-mouse-toggle"><input type="checkbox" checked={mouseMode} onChange={toggleMouseMode} /><span>鼠标模式</span></label>;
  const game = model.current.game; const playerControls = controllers.profile.players[0]; const connected = controllers.devices.some(device => sameDevice(device.device, playerControls.device));
  const controllerPlaying = phase === "playing" && playerControls.mode === "gamepad";
  return <div ref={pageRef} className={`app-shell tetris-shell super-blocks-shell ${fullscreen.focused ? "tetris-immersive" : ""}`} data-gamepad-native={controllerPlaying ? "playing" : undefined}><div className="star-field" aria-hidden="true" /><main className="tetris-page">
    {fullscreen.focused && <header className="tetris-focusbar"><h1>超级积木</h1>{mouseModeToggle}<button className="tetris-button" data-gamepad-pause onClick={() => changePhase(phase === "paused" ? "playing" : "paused")}>{phase === "paused" ? "继续" : "暂停"}</button><button className="tetris-button" onClick={requestRestart}>重新开始</button><button className="tetris-button" onClick={() => setShowControls(true)}>游戏设置</button><button className="tetris-button" onClick={() => void fullscreen.leave()}>退出全屏</button></header>}
    <GameTopBar title="超级积木" backHref="/#games" backLabel="游戏大厅" controls={<div className="tetris-toolbar">{mouseModeToggle}{audioControls}{phase !== "ready" && <><button className="tetris-button" onClick={() => void fullscreen.enter()}>全屏游戏</button><button className="tetris-button" data-gamepad-pause onClick={() => changePhase(phase === "paused" ? "playing" : "paused")}>{phase === "paused" ? "继续游戏" : "暂停"}</button><button className="tetris-button" onClick={requestRestart}>重新开始</button><button className="tetris-button" onClick={() => { if (phase === "playing") changePhase("paused"); setShowControls(value => !value); }}>{showControls ? "收起控制设置" : "手柄设置"}</button><button className="tetris-button" onClick={() => { if (phase === "finished") void reset(); else { changePhase("paused"); setConfirmReset(true); } }}>重新设置</button></>}</div>} />
    {audioUnavailable && <p className="tetris-validation" role="status">音乐或音效暂时不可用，游戏可以继续。</p>}{notice && <p className="tetris-session-status" role="status">{notice}</p>}
    {showControls && <section className="tetris-controller-settings"><ControllerSetup definition={SUPER_BLOCKS_CONTROLS} session={controllers} lockPlayerCount /><button className="tetris-button" onClick={() => setShowControls(false)}>完成设置</button></section>}
    {phase === "ready" && <div className="tetris-welcome"><section className="tetris-intro"><span className="tetris-eyebrow">20 列水晶舱 · 29 种连续结构</span><h2>更宽一点，<br /><em>更多可能。</em></h2><p>从一个小格到五格积木，转一转，找到刚刚好的位置。</p><div className="tetris-sculpture" aria-hidden="true">{SHAPES.filter((_, index) => [0, 1, 3, 8, 18, 24].includes(index)).map(shape => <div key={shape.id} className="tetris-specimen"><MiniPiece kind={shape.id} /></div>)}</div><div className="tetris-intro-notes"><span>20 × 20 棋盘</span><span>仅单人模式</span><span>自动保存进度</span></div></section>
      <section className="tetris-settings"><span className="tetris-eyebrow">历史累计</span><h2>继续你的积木宇宙</h2><div className="super-blocks-history"><div><span>累计消除</span><strong>{history.totalLines} 行</strong></div><div><span>累计出现</span><strong>{history.totalCells} 小格</strong></div><div><span>积木种类</span><strong>29 种</strong></div></div><details className="super-blocks-shapes"><summary>查看不同积木累计次数</summary><ShapeStats appearances={history.appearances} /></details>
      <label className="tetris-speed-label" htmlFor="super-speed">初始下落速度 <span>0—100</span></label><div className="tetris-speed-input"><input aria-label="初始下落速度滑杆" type="range" min="0" max="100" value={valid ? initialSpeed : 0} onChange={event => setInitialSpeed(event.target.value)} /><input id="super-speed" type="number" min="0" max="100" value={initialSpeed} onChange={event => setInitialSpeed(event.target.value)} /></div>
      <label className="tetris-speed-label" htmlFor="super-increment">每级增加速度 <span>0—100</span></label><div className="tetris-speed-input"><input aria-label="每级增加速度滑杆" type="range" min="0" max="100" value={valid ? increment : 0} onChange={event => setIncrement(event.target.value)} /><input id="super-increment" type="number" min="0" max="100" value={increment} onChange={event => setIncrement(event.target.value)} /></div>{!valid && <p className="tetris-validation">请输入 0 到 100 的整数。</p>}<ControllerSetup definition={SUPER_BLOCKS_CONTROLS} session={controllers} showDetails={false} /><button className="tetris-start" disabled={!valid} onClick={start}>开始单人游戏 <span>↗</span></button></section></div>}
    <div ref={arena} tabIndex={-1} className="tetris-arena" hidden={phase === "ready"}>{game && <Board game={game} phase={phase} immersive={fullscreen.focused} move={move} press={press} release={id => model.current.held.release(id)} connected={connected} controls={playerControls} enabledKinds={enabledKinds} toggleKind={toggleKind} mouseMode={mouseMode} aimMouse={aimMouse} resume={() => changePhase("playing")} />}</div>
    {confirmReset && <div className="tetris-confirm" role="alert"><p>重新设置会结束当前这一局，历史累计会保留。</p><button className="tetris-button" onClick={() => { setConfirmReset(false); changePhase("playing"); }}>继续这一局</button><button className="tetris-button" onClick={() => void reset()}>确认重新设置</button></div>}
    {confirmRestart && <div className="tetris-confirm" role="alert"><p>重新开始会清空本局棋盘，速度、积木选择和历史累计都会保留。</p><button className="tetris-button" onClick={() => { setConfirmRestart(false); if (restartWasPlaying.current) changePhase("playing"); }}>继续这一局</button><button className="tetris-button" onClick={start}>确认重新开始</button></div>}
    {phase === "finished" && game && <section className="tetris-finish"><div><h2>这次的积木旅程完成啦</h2><p>{game.score} 分 · 消除 {game.lines} 行 · 出现 {game.cellsSpawned} 个小格</p></div><button className="tetris-start" onClick={start}>再玩一次 ↗</button></section>}
    <details className="tetris-rules"><summary>玩法与统计</summary><div><p>{WIDTH} 列 × {HEIGHT} 行，共 {Object.values(SHAPE_COUNTS).reduce((sum, count) => sum + count, 0)} 种连续积木。五格积木中每种的出现权重是其他积木的三分之一。</p><p>本轮和历史都会记录消除行数、小格出现总数以及不同积木的出现次数。预览区不计数，积木真正进入棋盘时才累计。</p><p>A / D 左右，S 下落，J / K 旋转，W 直落，P 暂停。棋盘、分数、统计和随机序列会自动缓存。</p></div></details>
  </main></div>;
}
