import { useEffect, useRef, useState, type CSSProperties } from "react";
import { speakLearningMoment, stopLearningSpeech } from "../../shared/experience/learning-speech";
import { act, bestMousePlacement, cells, createGame, emptyStatistics, HEIGHT, KEY_BINDINGS, landing, levelFor, previewZoneFor, SHAPES, speedFor, tick, WIDTH, type Action, type Game, type Kind, type Settings, type TetrisStatistics } from "./logic";
import { createPraisePicker, PraisePlayback, type PraiseEvent } from "./praise";
import { TetrisHeldInput, type KeyBindings } from "./input";
import { KeyboardSettings } from "./KeyboardSettings";
import { keyFor, keyLabel, KEY_ACTIONS, loadKeyboard, saveKeyboard } from "./keyboard";
import { TetrisAudio, type AudioOptions } from "./audio";
import { ControllerSetup } from "../../shared/controllers/ControllerSetup";
import { useGameControllers } from "../../shared/controllers/useGameControllers";
import { bindingLabel, type PlayerControls } from "../../shared/controllers/registry";
import { sameDevice } from "../../shared/controllers/input";
import { TETRIS_CONTROLS, tetrisControllerIntent } from "./controls";
import { clearTetrisSession, loadTetrisSession, saveTetrisSession, type StoredTetrisPhase } from "./session";
import { useGameFullscreen } from "../../shared/useGameFullscreen";
import { GameTopBar } from "../../shared/GameTopBar";
import { addStatistics, clearTetrisHistory, cloneStatistics, defaultTetrisPreferences, emptyTetrisHistory, hasStatistics, loadTetrisHistory, loadTetrisPreferences, perfectRate, rollTetrisHistory, saveTetrisHistory, saveTetrisPreferences, statisticsDelta, TETRIS_BLOCK_THEMES, type TetrisBlockTheme, type TetrisHistory, type TetrisPreferences } from "./statistics";
import "./tetris.css";

const KINDS = Object.keys(SHAPES) as Kind[];
const BLOCK_THEME_LABELS: Record<TetrisBlockTheme, string> = {
  default: "默认配色",
  "classic-fc": "经典 FC 配色",
  "clear-glass": "晶莹剔透",
  "random-crystal": "随机水晶",
  "random-gem": "随机宝石",
  smile: "小笑脸",
  dimensional: "立体方块",
  orb: "扁球体",
  solid: "纯色",
};
type Phase = "ready" | "playing" | "paused" | "finished";


export function CrystalPiece({ kind }: { kind: Kind }) {
  return <span className="tetris-mini" aria-label={`${kind} 形方块`} style={{ gridTemplateColumns: `repeat(${SHAPES[kind].length}, 1fr)` }}>
    {SHAPES[kind].flatMap((row, y) => row.map((value, x) => <span key={`${x}-${y}`} className={value ? `tetris-crystal crystal-${kind}` : ""} />))}
  </span>;
}

function mouseBaseline(clientX: number, bounds: Pick<DOMRect, "left" | "right" | "width">) {
  if (clientX <= bounds.left) return 0;
  if (clientX >= bounds.right) return WIDTH - 2;
  const pointedColumn = Math.floor((clientX - bounds.left) / bounds.width * WIDTH);
  return Math.min(WIDTH - 2, Math.max(0, pointedColumn - 1));
}
const totalAppearances = (statistics: TetrisStatistics) => KINDS.reduce((sum, kind) => sum + statistics.appearances[kind], 0);
const overallRateLabel = (statistics: TetrisStatistics) => {
  const rate = perfectRate(statistics);
  return rate === null ? "—" : `${(rate * 100).toFixed(2)}%`;
};
const pieceRateLabel = (statistics: TetrisStatistics, kind: Kind) => {
  const rate = perfectRate(statistics, kind);
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
};

function StatisticsPanel({ game, history, onRequestClear }: { game: Game; history: TetrisHistory; onRequestClear: () => void }) {
  const scopes = [{ label: "累计", value: history.all }, { label: "今日", value: history.today.statistics }, { label: "本轮", value: game.statistics }];
  const allAppearances = totalAppearances(history.all);
  const metricMaximum = Math.max(1, ...KINDS.flatMap(kind => [history.all.appearances[kind], history.all.clearedLines[kind]]));
  return <aside className="tetris-player-stats" aria-label="落块统计">
    <header><div><span>落块观察</span><strong>完美率</strong></div><div><small>没有新增纵向单列空腔</small><button type="button" onClick={onRequestClear}>清空统计</button></div></header>
    <div className="tetris-perfect-summary">{scopes.map(scope => <div key={scope.label}><span>{scope.label}</span><strong>{overallRateLabel(scope.value)}</strong></div>)}</div>
    <section className="tetris-clear-stats" aria-label="同时消除行数"><h3>同时消除</h3><div>{[1, 2, 3, 4].map((lines, index) => <article key={lines}><strong>{lines}<small> 行</small></strong><span>累计 {history.all.lineClears[index]}</span><span>今日 {history.today.statistics.lineClears[index]} · 本轮 {game.statistics.lineClears[index]}</span></article>)}</div></section>
    <section className="tetris-piece-stats" aria-label="各积木出现次数、归属消行数与完美率"><h3>积木表现 <span>出现次数 · 归属消行 · 完美率</span></h3><div className="tetris-piece-list">{KINDS.map(kind => {
      const count = history.all.appearances[kind];
      const clearedLines = history.all.clearedLines[kind];
      const share = allAppearances ? count / allAppearances : 0;
      return <article key={kind} className={`piece-${kind}`}>
        <CrystalPiece kind={kind} />
        <div className="tetris-piece-metrics">
          <div className="tetris-piece-metric-label"><strong>{kind} · 出现 {count} 次</strong><span>{Math.round(share * 100)}%</span></div>
          <div className="tetris-piece-meter is-appearance" role="progressbar" aria-label={`${kind} 形积木累计出现 ${count} 次`} aria-valuemin={0} aria-valuemax={metricMaximum} aria-valuenow={count}><span style={{ width: `${count / metricMaximum * 100}%` }} /></div>
          <div className="tetris-piece-metric-label"><strong>归属消行</strong><span>{clearedLines} 行</span></div>
          <div className="tetris-piece-meter is-cleared" role="progressbar" aria-label={`${kind} 形积木累计归属消行 ${clearedLines} 行`} aria-valuemin={0} aria-valuemax={metricMaximum} aria-valuenow={clearedLines}><span style={{ width: `${clearedLines / metricMaximum * 100}%` }} /></div>
        </div>
        <div className="tetris-piece-perfect"><span>完美率</span><div className="tetris-piece-rates">{scopes.map(scope => <span key={scope.label}><small>{scope.label}</small><strong>{pieceRateLabel(scope.value, kind)}</strong></span>)}</div></div>
      </article>;
    })}</div></section>
  </aside>;
}

function PlayerBoard({ game, index, phase, praise, move, resume, controls, connected, bindings, press, release, immersive, history, mouseMode, aimMouse, onRequestClearStatistics }: {
  game: Game; index: number; phase: Phase; praise?: PraiseEvent;
  controls: PlayerControls; connected: boolean; bindings: KeyBindings; immersive: boolean;
  history: TetrisHistory; mouseMode: boolean; aimMouse: (index: number, baselineLeft: number) => void; onRequestClearStatistics: () => void;
  press: (id: string, index: number, action: Action) => void; release: (id: string) => void;
  move: (index: number, action: Action) => void; resume: () => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const aimMouseRef = useRef(aimMouse);
  aimMouseRef.current = aimMouse;
  const active = new Set(cells(game.piece).map(([x, y]) => y * WIDTH + x));
  const ghost = new Set(cells(landing(game)).map(([x, y]) => y * WIDTH + x));
  const clearing = game.clearing;
  const covered = phase === "paused" || (game.ended && !clearing);
  const speed = speedFor(game.settings, game.lines);
  const previewZone = previewZoneFor(game.board);
  useEffect(() => {
    if (!mouseMode || phase !== "playing") return;
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const bounds = boardRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const cell = bounds.width / WIDTH;
      if (event.clientX < bounds.left - cell * 2 || event.clientX > bounds.right + cell * 2 || event.clientY < bounds.top - cell * 2 || event.clientY > bounds.bottom + cell * 2) return;
      aimMouseRef.current(index, mouseBaseline(event.clientX, bounds));
    };
    window.addEventListener("pointermove", pointerMove);
    return () => window.removeEventListener("pointermove", pointerMove);
  }, [index, mouseMode, phase]);
  return <section className={`tetris-player player-${index + 1}`} aria-label={`玩家 ${index + 1} 棋盘`}>
    <header className="tetris-player-heading"><span className="tetris-player-number">0{index + 1}</span><div><h2>玩家 {index + 1}</h2><span>{controls.mode === "gamepad" ? connected ? "✓ 手柄 + 键盘" : "手柄待连接 · 键盘可用" : "自选键盘控制"}</span></div><div className="tetris-score"><span>得分</span><strong>{game.score.toLocaleString()}</strong></div></header>
    <div className="tetris-playfield-layout">
      <div className="tetris-board-frame">
        <div ref={boardRef} className={`tetris-board ${mouseMode ? "is-mouse-mode" : ""}`} role="img" aria-label={`玩家 ${index + 1}，${game.lines} 行，${game.score} 分，${game.ended ? "本局完成" : `当前 ${game.piece.kind} 形方块`}`} onPointerDown={event => {
          if (!mouseMode || event.pointerType !== "mouse" || event.button !== 0 || phase !== "playing") return;
          event.preventDefault();
          aimMouse(index, mouseBaseline(event.clientX, event.currentTarget.getBoundingClientRect()));
          move(index, "drop");
        }}>
          {(clearing?.board ?? game.board).flatMap((row, y) => row.map((cell, x) => {
            const id = y * WIDTH + x;
            const moving = !clearing && !game.ended && active.has(id);
            const kind = moving ? game.piece.kind : cell;
            const isGhost = !clearing && !kind && !game.ended && ghost.has(id);
            const breaking = clearing?.rows.includes(y) ?? false;
            const elapsed = clearing?.elapsed ?? 0;
            const shift = clearing && !breaking ? clearing.rows.filter(row => row > y).length : 0;
            const style: CSSProperties = { animationPlayState: phase === "playing" ? "running" : "paused", ...(breaking ? {
              animationDelay: `${x * 22 - elapsed}ms`,
              "--fracture-direction": x % 2 ? 1 : -1,
            } as CSSProperties : shift ? {
              animationDelay: `${150 - elapsed}ms`,
              "--clear-distance": `calc(${shift * 100}% + ${shift}px)`,
            } as CSSProperties : {}) };
            return <span key={id} style={style} className={`tetris-cell ${kind ? `tetris-crystal crystal-${kind}` : ""} ${moving ? "is-moving" : ""} ${isGhost ? "is-ghost" : ""} ${breaking ? "is-fracturing is-broken" : ""} ${shift ? "is-clearing-shift" : ""}`} />;
          }))}
        </div>
        {covered && <div className="tetris-board-cover">{game.ended ? <><span aria-hidden="true">✧</span><h3>拼得很精彩</h3><p>消除 {game.lines} 行 · {game.score} 分</p>{phase !== "finished" && <p>另一位玩家还可以继续</p>}</> : <button type="button" className="tetris-resume" onClick={resume}><span aria-hidden="true">▶</span><strong>继续游戏</strong></button>}</div>}
      </div>
      <aside className={`tetris-player-info preview-zone-${previewZone}`} data-preview-zone={previewZone}>
        <div className="tetris-next"><h3>下一个</h3><div className="tetris-next-primary"><CrystalPiece kind={game.next[0]} /></div><div className="tetris-next-later"><span>之后</span>{game.next.slice(1).map((kind, i) => <CrystalPiece key={`${i}-${kind}`} kind={kind} />)}</div></div>
        <div className="tetris-player-status">
          <dl><div><dt>等级</dt><dd>{levelFor(game.lines).toString().padStart(2, "0")}</dd></div><div><dt>速度</dt><dd>{speed}<small> / 100</small></dd></div><div><dt>{immersive ? "消行" : "消除行数"}</dt><dd>{game.lines}</dd></div></dl>
          <div className="tetris-level-progress"><span>{immersive ? `距升级 ${20 - game.lines % 20} 行` : `再消 ${20 - game.lines % 20} 行升级`}</span><progress max={20} value={game.lines % 20} aria-label={`玩家 ${index + 1} 升级进度`} /></div>
          {speed === 0 && <p className="tetris-manual">{immersive ? "手动下落" : <>手动慢慢拼<br />不会自动下落</>}</p>}
        </div>
      </aside>
      <StatisticsPanel game={game} history={history} onRequestClear={onRequestClearStatistics} />
    </div>
    <div className="tetris-praise" aria-live="polite" aria-atomic="true">
      {praise ? <><strong>✦ {praise.praise.zh}</strong><span lang="en">{praise.praise.en}</span></> : <><strong>把一整行拼满，就能消除</strong><span>虚线框是方块的落点</span></>}
    </div>
    <div className="tetris-controls" aria-label={`玩家 ${index + 1} 触控操作`}>
      {KEY_ACTIONS.map(control => <button key={control.action} type="button" disabled={phase !== "playing" || game.ended} onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        press(`pointer-${event.pointerId}`, index, control.action);
      }} onPointerUp={event => release(`pointer-${event.pointerId}`)} onPointerCancel={event => release(`pointer-${event.pointerId}`)} onLostPointerCapture={event => release(`pointer-${event.pointerId}`)} onClick={event => { if (event.detail === 0) move(index, control.action); }} aria-label={`玩家 ${index + 1} ${control.label}`}><kbd>{keyLabel(keyFor(bindings, index, control.action))}</kbd><span>{immersive ? ({ down: "下落", rotate: "变形", drop: "落底" } as Partial<Record<Action, string>>)[control.action] ?? control.label : control.label}</span></button>)}
    </div>
    {!immersive && controls.mode === "gamepad" && <details className="controller-help"><summary>玩家 {index + 1} · 我的手柄键位</summary><dl>{TETRIS_CONTROLS.actions.map(action => <div key={action.id}><dt>{action.label}</dt><dd>{controls.bindings[action.id]?.map(b => bindingLabel(b, controls.device?.mapping !== "")).join(" / ") || "尚未设置"}</dd></div>)}</dl></details>}
  </section>;
}

export function TetrisGame() {
  const pageRef = useRef<HTMLDivElement>(null);
  const fullscreen = useGameFullscreen(pageRef);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const [bindings, setBindings] = useState<KeyBindings>(KEY_BINDINGS);
  const [keyboardNotice, setKeyboardNotice] = useState("使用默认键位");
  const controllerDown = useRef(new Map<number, { pieceId: number; step: number }>());
  const lastSessionSave = useRef(0);
  const [showControllerSettings, setShowControllerSettings] = useState(false);
  const [controllerNotice, setControllerNotice] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [history, setHistory] = useState<TetrisHistory>(() => emptyTetrisHistory());
  const historyRef = useRef(history);
  const committedStatistics = useRef<TetrisStatistics[]>([]);
  const [mouseMode, setMouseMode] = useState(false);
  const [blockTheme, setBlockTheme] = useState<TetrisBlockTheme>("default");
  const preferences = useRef<TetrisPreferences | null>(null);
  const lastMouseAim = useRef<{ pieceId: number; baseline: number }[]>([]);
  const [initialSpeed, setInitialSpeed] = useState("0");
  const [increment, setIncrement] = useState("0");
  const [sound, setSound] = useState(false);
  const [audioOptions, setAudioOptions] = useState<AudioOptions>({ music: false, effects: true });
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [phase, setPhase] = useState<Phase>("ready");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClearStatistics, setConfirmClearStatistics] = useState(false);
  const statisticsWasPlaying = useRef(false);
  const [praises, setPraises] = useState<(PraiseEvent | undefined)[]>([]);
  const [speechState, setSpeechState] = useState({ count: 0, unavailable: false });
  const [speechPaused, setSpeechPaused] = useState(false);
  const [, redraw] = useState(0);
  const arena = useRef<HTMLDivElement>(null);
  const model = useRef({ games: [] as Game[], phase: "ready" as Phase, held: new TetrisHeldInput() });
  const pickPraise = useRef(createPraisePicker());
  const playback = useRef<PraisePlayback | null>(null);
  const gameAudio = useRef<TetrisAudio | null>(null);
  const controllers = useGameControllers(TETRIS_CONTROLS, {
    enabled: (phase === "playing" || phase === "paused") && !confirmReset && !confirmClearStatistics && !showControllerSettings,
    editing: phase === "ready" || showControllerSettings,
    onActions: events => {
      if (confirmReset || showControllerSettings) return;
      for (const event of events) {
        if (event.action !== "down") continue;
        if (event.type === "release") controllerDown.current.delete(event.player);
        if (event.type === "press") {
          const game = model.current.games[event.player];
          controllerDown.current.set(event.player, { pieceId: game?.clearing ? -1 : game?.pieceId ?? -1, step: 1 });
        }
      }
      const expanded = events.flatMap(event => {
        if (event.action !== "down") return [event];
        const held = controllerDown.current.get(event.player);
        if (!held || held.pieceId !== model.current.games[event.player]?.pieceId) return [];
        if (event.type !== "repeat") return [event];
        held.step = Math.min(5, held.step + 1);
        return Array.from({ length: held.step }, () => event);
      });
      const intent = tetrisControllerIntent(expanded);
      if (intent.pause && (model.current.phase === "playing" || model.current.phase === "paused")) {
        changePhase(model.current.phase === "playing" ? "paused" : "playing");
      } else if (model.current.phase === "playing") {
        let changed = false;
        for (const { player, action } of intent.moves) {
          const game = model.current.games[player];
          if (!game || (action === "down" && controllerDown.current.get(player)?.pieceId !== game.pieceId)) continue;
          changed = act(game, action) || changed;
        }
        if (changed) refresh();
      }
    },
    onDisconnect: () => {
      if (model.current.phase === "playing") {
        changePhase("paused");
        setControllerNotice("手柄连接中断，游戏已暂停。重新连接后点继续，也可以用对应键盘接着玩。");
      }
    },
  });
  const players = controllers.profile.playerCount;
  const valid = [initialSpeed, increment].every(value => /^\d{1,3}$/.test(value) && Number(value) <= 100);

  useEffect(() => {
    try { const saved = loadKeyboard(localStorage); setBindings(saved); model.current.held.bindings = saved; setKeyboardNotice("键位已从此浏览器恢复"); }
    catch { setKeyboardNotice("暂时无法读取已存键位，先用默认设置；修改后可再次保存。"); }
    try { const saved = loadTetrisHistory(localStorage); historyRef.current = saved; setHistory(saved); }
    catch { setSessionNotice("累计统计暂时无法读取；本局仍可正常游戏。"); }
    try { const saved = loadTetrisPreferences(localStorage); preferences.current = saved; setMouseMode(saved.mouseMode); setBlockTheme(saved.blockTheme); }
    catch { setSessionNotice("鼠标设置暂时无法读取，已使用键盘模式。"); }
    try {
      const saved = loadTetrisSession(localStorage);
      if (saved) {
        model.current.games = saved.games;
        committedStatistics.current = saved.games.map(game => cloneStatistics(game.statistics));
        const restoredPhase: Phase = saved.phase === "finished" ? "finished" : "paused";
        model.current.phase = restoredPhase;
        setPhase(restoredPhase);
        setInitialSpeed(String(saved.games[0].settings.initialSpeed));
        setIncrement(String(saved.games[0].settings.speedIncrement));
        setSessionNotice(saved.phase === "finished" ? "✓ 已恢复上次完成的分数与棋盘" : "✓ 已恢复上次进度，点击继续即可接着玩");
        redraw(value => value + 1);
      }
    } catch { setSessionNotice("上次进度无法读取；新开一局后会重新保存。"); }
  }, []);
  function persistSession(force = false, phaseOverride: Phase = model.current.phase) {
    if (!model.current.games.length || phaseOverride === "ready") return;
    const now = Date.now();
    if (!force && now - lastSessionSave.current < 90) return;
    lastSessionSave.current = now;
    try {
      saveTetrisSession(localStorage, phaseOverride as StoredTetrisPhase, model.current.games);
      if (sessionNotice && !sessionNotice.startsWith("✓")) setSessionNotice("✓ 玩法进度已保存在此浏览器");
    } catch { setSessionNotice("本局可以继续，但浏览器暂时无法保存进度。"); }
  }
  function syncStatistics() {
    let next = rollTetrisHistory(historyRef.current);
    let changed = next !== historyRef.current;
    model.current.games.forEach((game, index) => {
      const committed = committedStatistics.current[index] ?? emptyStatistics();
      const delta = statisticsDelta(game.statistics, committed);
      committedStatistics.current[index] = cloneStatistics(game.statistics);
      if (!hasStatistics(delta)) return;
      next = { ...next, all: addStatistics(next.all, delta), today: { ...next.today, statistics: addStatistics(next.today.statistics, delta) } };
      changed = true;
    });
    if (!changed) return;
    historyRef.current = next;
    setHistory(next);
    try { saveTetrisHistory(localStorage, next); }
    catch { setSessionNotice("本局统计会继续显示，但累计统计暂时无法保存。"); }
  }
  function updateKeyboard(next: KeyBindings) {
    setBindings(next); model.current.held.clear(); model.current.held.bindings = next;
    try { saveKeyboard(localStorage, next); setKeyboardNotice("✓ 键位已保存在此浏览器"); }
    catch { setKeyboardNotice("本页键位已生效，但浏览器未能保存；请点击再次保存。"); }
  }
  function press(id: string, index: number, action: Action) {
    const game = model.current.games[index];
    if (model.current.phase !== "playing" || !game) return;
    if (model.current.held.press(id, performance.now(), game.clearing ? -1 : game.pieceId, [index, action])) move(index, action);
  }
  const keyboardSettings = <KeyboardSettings bindings={bindings} players={players} notice={keyboardNotice} update={updateKeyboard} />;
  useEffect(() => { if (phase === "playing") arena.current?.focus({ preventScroll: true }); }, [phase]);

  useEffect(() => {
    if (!fullscreen.switching && phase === "playing" && !showControllerSettings) arena.current?.focus({ preventScroll: true });
  }, [fullscreen.focused, fullscreen.switching, phase, showControllerSettings]);
  useEffect(() => {
    const dialog = settingsDialog.current;
    if (fullscreen.focused && showControllerSettings) { if (dialog && !dialog.open) dialog.showModal(); }
    else if (dialog?.open) dialog.close();
  }, [fullscreen.focused, showControllerSettings]);
  function openSettings() {
    if (model.current.phase === "playing") changePhase("paused");
    controllers.cancelCapture(); setShowControllerSettings(true);
  }
  function closeSettings() {
    controllers.cancelCapture(); setShowControllerSettings(false); arena.current?.focus({ preventScroll: true });
  }
  function changePhase(next: Phase) {
    model.current.phase = next;
    model.current.held.clear();
    controllerDown.current.clear();
    controllers.reset();
    if (next === "playing") setControllerNotice("");
    setPhase(next);
    gameAudio.current?.setPlaying(next === "playing");
    setSpeechPaused(next === "paused" || next === "ready");
    playback.current?.setPaused(next === "paused" || next === "ready");
    if (next !== "ready") persistSession(true, next);
  }
  function refresh() {
    const current = model.current;
    syncStatistics();
    current.games.forEach((game, player) => {
      for (const event of game.sounds.splice(0)) gameAudio.current?.play(event);
      for (const event of game.events.splice(0)) {
        for (let line = 0; line < event.lines; line++) {
          const praise = { player, praise: pickPraise.current() };
          setPraises(previous => { const next = [...previous]; next[player] = praise; return next; });
          playback.current?.enqueue(praise);
        }
      }
    });
    if (current.phase === "playing" && current.games.every(game => game.ended && !game.clearing)) changePhase("finished");
    else persistSession();
    redraw(value => value + 1);
  }
  function move(index: number, action: Action) {
    const current = model.current;
    if (current.phase !== "playing" || !current.games[index]) return;
    if (act(current.games[index], action)) refresh();
    arena.current?.focus();
  }
  function toggleMouseMode() {
    const next = !mouseMode;
    setMouseMode(next);
    lastMouseAim.current = [];
    const current = preferences.current ?? defaultTetrisPreferences();
    const updated = { ...current, mouseMode: next, updatedAt: new Date().toISOString() };
    preferences.current = updated;
    try { saveTetrisPreferences(localStorage, updated); }
    catch { setSessionNotice("鼠标模式已生效，但浏览器暂时无法保存这个设置。"); }
  }
  function chooseBlockTheme(next: TetrisBlockTheme) {
    setBlockTheme(next);
    const current = preferences.current ?? defaultTetrisPreferences();
    const updated = { ...current, blockTheme: next, updatedAt: new Date().toISOString() };
    preferences.current = updated;
    try { saveTetrisPreferences(localStorage, updated); }
    catch { setSessionNotice("方块外观已切换，但浏览器暂时无法保存这个选择。"); }
    if (phase === "playing") arena.current?.focus();
  }
  function aimMouse(index: number, baseline: number) {
    const game = model.current.games[index];
    if (!game || model.current.phase !== "playing" || game.clearing) return;
    const previous = lastMouseAim.current[index];
    if (previous?.pieceId === game.pieceId && previous.baseline === baseline) return;
    lastMouseAim.current[index] = { pieceId: game.pieceId, baseline };
    const target = bestMousePlacement(game, baseline);
    if (!target) return;
    game.piece = target;
    persistSession();
    redraw(value => value + 1);
  }
  function requestClearStatistics() {
    statisticsWasPlaying.current = model.current.phase === "playing";
    if (statisticsWasPlaying.current) changePhase("paused");
    setConfirmClearStatistics(true);
  }
  function cancelClearStatistics() {
    setConfirmClearStatistics(false);
    if (statisticsWasPlaying.current) changePhase("playing");
  }
  function clearAllStatistics() {
    let empty = emptyTetrisHistory();
    let saved = true;
    try { empty = clearTetrisHistory(localStorage); }
    catch { saved = false; }
    for (const game of model.current.games) game.statistics = emptyStatistics();
    committedStatistics.current = model.current.games.map(() => emptyStatistics());
    historyRef.current = empty;
    setHistory(empty);
    setConfirmClearStatistics(false);
    persistSession(true, model.current.phase);
    setSessionNotice(saved ? "✓ 累计、今日和本轮统计都已清空并保存" : "统计已在本页清空，但浏览器暂时无法保存；请稍后再试。");
    if (statisticsWasPlaying.current) changePhase("playing");
  }
  function start() {
    if (!valid || controllers.saved.status === "loading" || controllers.capture) return;
    setShowControllerSettings(false);
    playback.current?.clear();
    playback.current?.setEnabled(sound);
    gameAudio.current?.restart();
    gameAudio.current?.configure(audioOptions);
    const settings: Settings = { initialSpeed: Number(initialSpeed), speedIncrement: Number(increment) };
    const seed = Date.now();
    model.current.games = Array.from({ length: players }, () => createGame(settings, seed));
    committedStatistics.current = model.current.games.map(() => emptyStatistics());
    lastMouseAim.current = [];
    syncStatistics();
    setPraises([]);
    setConfirmReset(false);
    changePhase("playing");
    setSessionNotice("✓ 本局进度会自动保存在此浏览器");
    persistSession(true, "playing");
    arena.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
  async function reset() {
    if (fullscreen.focused) await fullscreen.leave();
    setShowControllerSettings(false);
    setControllerNotice("");
    controllers.cancelCapture();
    playback.current?.clear();
    changePhase("ready");
    model.current.games = [];
    committedStatistics.current = [];
    try { clearTetrisSession(localStorage); setSessionNotice(""); }
    catch { setSessionNotice("浏览器暂时无法清除旧进度，新局仍可继续。"); }
    setConfirmReset(false);
    setPraises([]);
  }
  // Event callbacks use the current model through refs, so held keys never depend on render timing.
  const callbacks = useRef({ refresh, changePhase, confirmReset, confirmClearStatistics, showControllerSettings, focused: fullscreen.focused, leaveFullscreen: fullscreen.leave });
  callbacks.current = { refresh, changePhase, confirmReset, confirmClearStatistics, showControllerSettings, focused: fullscreen.focused, leaveFullscreen: fullscreen.leave };
  useEffect(() => {
    try { gameAudio.current = new TetrisAudio(undefined, () => setAudioUnavailable(true)); }
    catch { setAudioUnavailable(true); }
    const output = new PraisePlayback({
      speak: praise => speakLearningMoment(praise, "bilingual"),
      stop: stopLearningSpeech,
      show: event => setPraises(previous => { const next = [...previous]; next[event.player] = event; return next; }),
      status: (count, unavailable) => { setSpeechState({ count, unavailable }); gameAudio.current?.setDucked(count > 0 && !unavailable); },
    });
    playback.current = output;
    let frame = 0;
    let previous = performance.now();
    const pause = () => {
      model.current.held.clear();
      if (model.current.phase === "playing") callbacks.current.changePhase("paused");
      // Even after both boards finish, do not keep talking in a hidden tab.
      output.setPaused(true);
      setSpeechPaused(true);
    };
    const visibility = () => { if (document.hidden) pause(); };
    const pagehide = () => { syncStatistics(); persistSession(true, model.current.phase); };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.code === "Escape" && callbacks.current.focused) { event.preventDefault(); void callbacks.current.leaveFullscreen(); return; }
      if (event.isComposing || event.altKey || event.metaKey || event.ctrlKey || callbacks.current.confirmReset || callbacks.current.confirmClearStatistics || callbacks.current.showControllerSettings) return;
      if (event.target instanceof Element && event.target.closest("input, select, textarea, button, a, summary, [contenteditable=true]")) return;
      if ((event.code === "Escape" || event.code === "KeyP") && model.current.phase !== "ready" && model.current.phase !== "finished") {
        event.preventDefault();
        if (!event.repeat) callbacks.current.changePhase(model.current.phase === "playing" ? "paused" : "playing");
        return;
      }
      const binding = model.current.held.bindings[event.code];
      if (!binding || !model.current.games[binding[0]] || model.current.phase !== "playing") return;
      event.preventDefault();
      if (event.repeat || !model.current.held.press(event.code, performance.now(), model.current.games[binding[0]].clearing ? -1 : model.current.games[binding[0]].pieceId)) return;
      if (act(model.current.games[binding[0]], binding[1])) callbacks.current.refresh();
    };
    const keyup = (event: KeyboardEvent) => { model.current.held.release(event.code); };
    const animate = (now: number) => {
      const delta = now - previous;
      previous = now;
      let changed = false;
      if (model.current.phase === "playing") {
        for (const [player, action, pieceId] of model.current.held.repeat(now, model.current.games.map(game => game.pieceId))) {
          if (action === "down" && model.current.games[player]?.pieceId !== pieceId) continue;
          changed = act(model.current.games[player], action) || changed;
        }
        for (const game of model.current.games) changed = tick(game, delta, motion.matches) || changed;
        if (changed) callbacks.current.refresh();
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", pause);
    window.addEventListener("pagehide", pagehide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", pause);
      window.removeEventListener("pagehide", pagehide);
      document.removeEventListener("visibilitychange", visibility);
      model.current.held.clear();
      output.clear();
      playback.current = null;
      gameAudio.current?.dispose();
      gameAudio.current = null;
    };
  }, []);

  const audioControls = <>{(["music", "effects"] as const).map(kind => <button key={kind} type="button" className="tetris-button" aria-pressed={audioOptions[kind]} onClick={() => {
            const next = { ...audioOptions, [kind]: !audioOptions[kind] };
            setAudioOptions(next); setAudioUnavailable(false); gameAudio.current?.configure(next);
            if (phase === "playing") arena.current?.focus();
          }}>{kind === "music" ? "音乐" : "音效"}：{audioOptions[kind] ? "开 ✓" : "关"}</button>)}
          <button type="button" className="tetris-button" aria-pressed={sound} onClick={() => {
            setSound(!sound);
            playback.current?.setEnabled(!sound);
            if (phase === "finished") { playback.current?.setPaused(false); setSpeechPaused(false); }
            if (phase === "playing") arena.current?.focus();
          }}>{sound ? "✓ 中英表扬" : "表扬声音：关"}</button></>;
  const mouseModeToggle = <label className="tetris-mouse-toggle"><input type="checkbox" checked={mouseMode} onChange={toggleMouseMode} /><span>鼠标模式</span></label>;
  const blockThemeSelect = <label className="tetris-theme-picker"><span>方块外观</span><select aria-label="选择方块外观" value={blockTheme} onChange={event => chooseBlockTheme(event.target.value as TetrisBlockTheme)}>{TETRIS_BLOCK_THEMES.map(theme => <option key={theme} value={theme}>{BLOCK_THEME_LABELS[theme]}</option>)}</select></label>;
  const canPause = model.current.games.some(game => speedFor(game.settings, game.lines) > 0);
  const settingsContents = <>
    {fullscreen.focused && <><h2 id="tetris-dialog-title">游戏设置</h2><div className="tetris-toolbar">{audioControls}<button type="button" className="tetris-button" disabled={fullscreen.switching} onClick={() => { closeSettings(); setConfirmReset(true); }}>重新设置本局</button></div></>}
    {keyboardSettings}<ControllerSetup definition={TETRIS_CONTROLS} session={controllers} lockPlayerCount />
    <button type="button" className="tetris-button" onClick={closeSettings}>完成设置</button>
  </>;
  const controllerPlaying = phase === "playing" && controllers.profile.players.slice(0, players).some(player => player.mode === "gamepad");
  return <div ref={pageRef} className={`app-shell tetris-shell ${fullscreen.focused ? "tetris-immersive" : ""}`} data-block-theme={blockTheme} data-gamepad-native={controllerPlaying ? "playing" : undefined}>

    <div className="star-field" aria-hidden="true" />
    <main className="tetris-page">
      {fullscreen.focused && <header className="tetris-focusbar">
        <h1>俄罗斯方块</h1>
        {blockThemeSelect}
        {mouseModeToggle}
        {canPause && <button type="button" className="tetris-button" data-gamepad-pause disabled={phase === "finished" || confirmReset || showControllerSettings} onClick={() => changePhase(phase === "paused" ? "playing" : "paused")}>{phase === "paused" ? "继续" : "暂停"}</button>}
        <button type="button" className="tetris-button" disabled={confirmReset} onClick={openSettings}>游戏设置</button>
        <button type="button" className="tetris-button" data-fullscreen-exit disabled={fullscreen.switching} onClick={() => void fullscreen.leave()}>退出全屏</button>
      </header>}
      <GameTopBar title="俄罗斯方块" backHref="/#games" backLabel="游戏大厅" controls={<div className="tetris-toolbar">
          {blockThemeSelect}
          {mouseModeToggle}
          {audioControls}
          {phase !== "ready" && <button type="button" className="tetris-button" disabled={fullscreen.switching || confirmReset || showControllerSettings} onClick={() => void fullscreen.enter()}>全屏游戏</button>}
          {phase !== "ready" && canPause && <button type="button" className="tetris-button" data-gamepad-pause disabled={phase === "finished" || confirmReset || showControllerSettings} onClick={() => { changePhase(phase === "paused" ? "playing" : "paused"); arena.current?.focus(); }}>{phase === "paused" ? "继续游戏" : "暂停"}</button>}
          {phase !== "ready" && <button type="button" className="tetris-button" disabled={confirmReset} aria-expanded={showControllerSettings} onClick={() => {
            if (phase === "playing") changePhase("paused");
            controllers.cancelCapture(); setShowControllerSettings(!showControllerSettings);
          }}>{showControllerSettings ? "收起控制设置" : "键盘 / 手柄设置"}</button>}
          {phase !== "ready" && <button type="button" className="tetris-button" onClick={() => { controllers.cancelCapture(); setShowControllerSettings(false); if (phase === "finished") reset(); else { changePhase("paused"); setConfirmReset(true); } }}>重新设置</button>}
        </div>} />
      {audioUnavailable && <p className="tetris-validation" role="status">音乐或音效暂时不可用，游戏可以继续。可关闭后重新打开声音试试。</p>}
      {controllerNotice && <p className="tetris-validation" role="status">{controllerNotice}</p>}
      {sessionNotice && <p className="tetris-session-status" role="status">{sessionNotice}</p>}
      {showControllerSettings && !fullscreen.focused && <section className="tetris-controller-settings">{settingsContents}</section>}
      <dialog ref={settingsDialog} className="tetris-settings-dialog" aria-labelledby="tetris-dialog-title" onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }} onCancel={event => { event.preventDefault(); closeSettings(); }}>{fullscreen.focused && showControllerSettings && settingsContents}</dialog>
      {phase === "ready" ? <div className="tetris-welcome">
        <section className="tetris-intro">
          <span className="tetris-eyebrow">晶莹相遇 · 一起拼出惊喜</span>
          <h2>让每一块<br /><em>刚刚好。</em></h2>
          <p>转一转，拼一拼。<br />把一整行变成闪闪发光的成就。</p>
          <div className="tetris-sculpture" aria-hidden="true">{KINDS.map(kind => <div key={kind} className={`tetris-specimen specimen-${kind}`}><CrystalPiece kind={kind} /></div>)}</div>
          <div className="tetris-intro-notes"><span>七种经典形状</span><span>单人 / 双人</span><span>60 组双语表扬</span></div>
        </section>
        <section className="tetris-settings" aria-labelledby="tetris-settings-title">
          <span className="tetris-eyebrow">准备好你的节奏</span><h2 id="tetris-settings-title">一起玩，或慢慢想</h2>
          <ControllerSetup definition={TETRIS_CONTROLS} session={controllers} showDetails={false} />
          <label className="tetris-speed-label" htmlFor="tetris-speed">初始下落速度 <span>0—100</span></label>
          <div className="tetris-speed-input"><input aria-label="初始下落速度滑杆" type="range" min="0" max="100" step="1" value={valid ? initialSpeed : 0} onChange={event => setInitialSpeed(event.target.value)} /><input id="tetris-speed" type="number" min="0" max="100" step="1" value={initialSpeed} onChange={event => setInitialSpeed(event.target.value)} /></div>
          <label className="tetris-speed-label" htmlFor="tetris-increment">每级增加速度 <span>0—100</span></label>
          <div className="tetris-speed-input"><input aria-label="每级增加速度滑杆" type="range" min="0" max="100" step="1" value={valid ? increment : 0} onChange={event => setIncrement(event.target.value)} /><input id="tetris-increment" type="number" min="0" max="100" step="1" value={increment} onChange={event => setIncrement(event.target.value)} /></div>
          {!valid && <p role="alert" className="tetris-validation">请输入 0 到 100 的整数。</p>}
          <button type="button" className="tetris-start" disabled={!valid || controllers.saved.status === "loading" || !!controllers.capture} onClick={start}>开始{players === 2 ? "双人" : "单人"}游戏 <span aria-hidden="true">↗</span></button>
          <p className="tetris-field-help">{sound ? "每消一行，先听中文，再听英文。" : "想听双语鼓励，可以打开顶部“表扬声音”。"}</p>
          <details className="tetris-key-guide"><summary>需要时修改键盘</summary>{keyboardSettings}</details>
          <ControllerSetup definition={TETRIS_CONTROLS} session={controllers} showOverview={false} showStatus={false} />
        </section>
      </div> : null}
      <div ref={arena} tabIndex={-1} className={`tetris-arena ${model.current.games.length === 2 ? "is-duo" : ""}`} aria-label="俄罗斯方块游戏区" hidden={phase === "ready"} onPointerDown={event => { if (!(event.target instanceof Element) || !event.target.closest("button, a")) arena.current?.focus(); }}>
        {model.current.games.map((game, index) => <PlayerBoard key={index} game={game} index={index} phase={phase} praise={praises[index]} move={move} resume={() => changePhase("playing")} press={press} release={id => model.current.held.release(id)} bindings={bindings} immersive={fullscreen.focused} controls={controllers.profile.players[index]} connected={controllers.devices.some(d => sameDevice(d.device, controllers.profile.players[index]?.device ?? null))} history={history} mouseMode={mouseMode} aimMouse={aimMouse} onRequestClearStatistics={requestClearStatistics} />)}
      </div>
      {confirmClearStatistics && <div className="tetris-confirm" role="alert"><p>要清空累计、今日和本轮的全部落块统计吗？棋盘和分数会保留。</p><button type="button" className="tetris-button" onClick={cancelClearStatistics}>保留统计</button><button type="button" className="tetris-button" onClick={clearAllStatistics}>确认清空</button></div>}
      {confirmReset && <div className="tetris-confirm" role="alert"><p>重新设置会结束当前这一局。</p><button type="button" className="tetris-button" onClick={() => { setConfirmReset(false); changePhase("playing"); arena.current?.focus(); }}>继续这一局</button><button type="button" className="tetris-button" onClick={reset}>确认重新设置</button></div>}
      {phase === "finished" && <section className="tetris-finish" aria-live="polite"><div><h2>这次的拼图旅程完成啦</h2><p>{model.current.games.map((game, index) => `玩家 ${index + 1}：${game.score} 分 / ${game.lines} 行`).join("　·　")}</p></div><button type="button" className="tetris-start" onClick={start}>再玩一次 ↗</button></section>}
      {sound && phase !== "ready" && <div className="tetris-speech-status" role="status">{speechState.unavailable ? "声音暂时不可用，文字表扬会继续显示。" : speechPaused ? "表扬朗读也休息一下，准备好后再听。" : speechState.count ? `正在依次朗读表扬 · 剩余 ${speechState.count} 组` : "消一行，听一句中文和英文。"}{speechState.unavailable && <button type="button" className="tetris-button" disabled={phase === "paused"} onClick={() => { setSpeechPaused(false); playback.current?.setPaused(false); playback.current?.enqueue({ player: 0, praise: praises[0]?.praise ?? pickPraise.current() }); }}>再试朗读</button>}{phase === "finished" && speechPaused && speechState.count > 0 && <button type="button" className="tetris-button" onClick={() => { setSpeechPaused(false); playback.current?.setPaused(false); }}>继续听表扬</button>}</div>}
      <details className="tetris-rules"><summary>玩法与计分</summary><div><p>10 列 × {HEIGHT} 行，拼满一行就消除。一次消除 1 / 2 / 3 / 4 行，分别获得 100 / 300 / 500 / 800 × 当前等级的分数。手动下移每格 1 分，直落每格 2 分。</p><p>每 20 行升一级，最高速度 100。初始速度和每级增速都设为 0，即为全手动。轻按下落移动 1 格；持续按住后，每次依次加速为 2、3、4、5 格。按住下落只操作当前这一块，下一块需要松开后再按。</p><p>双人独立计分、独立升级，方块顺序相同，一方堆满后另一方继续。P / Escape 暂停，切换窗口自动暂停。两个键盘仍按键位分组，不能用相同按键区分设备。</p><p>棋盘、当前方块、后续方块、分数、行数、速度设置与暂停状态会自动保存在当前浏览器，再次打开可继续。每消一行获得一组中英表扬；声音关闭时仍显示文字。</p></div></details>
    </main>
  </div>;
}
