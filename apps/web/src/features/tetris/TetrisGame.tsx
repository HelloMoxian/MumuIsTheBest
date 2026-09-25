import { useEffect, useRef, useState, type CSSProperties } from "react";
import { speakLearningMoment, stopLearningSpeech } from "../../shared/experience/learning-speech";
import { act, cells, createGame, HEIGHT, KEY_BINDINGS, landing, levelFor, SHAPES, speedFor, tick, WIDTH, type Action, type Game, type Kind, type Settings } from "./logic";
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
import "./tetris.css";

const KINDS = Object.keys(SHAPES) as Kind[];
type Phase = "ready" | "playing" | "paused" | "finished";


export function CrystalPiece({ kind }: { kind: Kind }) {
  return <span className="tetris-mini" aria-label={`${kind} 形方块`} style={{ gridTemplateColumns: `repeat(${SHAPES[kind].length}, 1fr)` }}>
    {SHAPES[kind].flatMap((row, y) => row.map((value, x) => <span key={`${x}-${y}`} className={value ? `tetris-crystal crystal-${kind}` : ""} />))}
  </span>;
}

function PlayerBoard({ game, index, phase, praise, move, controls, connected, bindings, press, release }: {
  game: Game; index: number; phase: Phase; praise?: PraiseEvent;
  controls: PlayerControls; connected: boolean; bindings: KeyBindings;
  press: (id: string, index: number, action: Action) => void; release: (id: string) => void;
  move: (index: number, action: Action) => void;
}) {
  const active = new Set(cells(game.piece).map(([x, y]) => y * WIDTH + x));
  const ghost = new Set(cells(landing(game)).map(([x, y]) => y * WIDTH + x));
  const clearing = game.clearing;
  const covered = phase === "paused" || (game.ended && !clearing);
  const speed = speedFor(game.settings, game.lines);
  return <section className={`tetris-player player-${index + 1}`} aria-label={`玩家 ${index + 1} 棋盘`}>
    <header className="tetris-player-heading"><span className="tetris-player-number">0{index + 1}</span><div><h2>玩家 {index + 1}</h2><span>{controls.mode === "gamepad" ? connected ? "✓ 手柄 + 键盘" : "手柄待连接 · 键盘可用" : "自选键盘控制"}</span></div><div className="tetris-score"><span>得分</span><strong>{game.score.toLocaleString()}</strong></div></header>
    <div className="tetris-playfield-layout">
      <div className="tetris-board-frame">
        <div className="tetris-board" role="img" aria-label={`玩家 ${index + 1}，${game.lines} 行，${game.score} 分，${game.ended ? "本局完成" : `当前 ${game.piece.kind} 形方块`}`}>
          {(clearing?.board ?? game.board).flatMap((row, y) => row.map((cell, x) => {
            const id = y * WIDTH + x;
            const moving = !clearing && !game.ended && active.has(id);
            const kind = moving ? game.piece.kind : cell;
            const isGhost = !clearing && !kind && !game.ended && ghost.has(id);
            const breaking = clearing?.rows.includes(y) ?? false;
            const elapsed = clearing?.elapsed ?? 0;
            const broken = breaking && elapsed >= x * 55;
            const fall = breaking ? Math.min(1, Math.max(0, (elapsed - 600) / 200)) : 0;
            const shift = clearing && !breaking ? clearing.rows.filter(row => row > y).length * Math.min(1, Math.max(0, (elapsed - 800) / 240)) : 0;
            const style: CSSProperties = { animationPlayState: phase === "playing" ? "running" : "paused", ...(breaking ? { opacity: 1 - fall, transform: `translateY(${fall * 130}%)` } : clearing ? { transform: `translateY(calc(${shift * 100}% + ${shift}px))` } : {}) };
            return <span key={id} style={style} className={`tetris-cell ${kind ? `tetris-crystal crystal-${kind}` : ""} ${moving ? "is-moving" : ""} ${isGhost ? "is-ghost" : ""} ${broken ? "is-broken" : ""}`} />;
          }))}
        </div>
        {covered && <div className="tetris-board-cover"><span aria-hidden="true">{game.ended ? "✧" : "Ⅱ"}</span><h3>{game.ended ? "拼得很精彩" : "休息一下"}</h3><p>{game.ended ? `消除 ${game.lines} 行 · ${game.score} 分` : "准备好，再继续"}</p>{game.ended && phase !== "finished" && <p>另一位玩家还可以继续</p>}</div>}
      </div>
      <aside className="tetris-player-info">
        <div className="tetris-next"><h3>接下来</h3>{game.next.map((kind, i) => <CrystalPiece key={`${i}-${kind}`} kind={kind} />)}</div>
        <dl><div><dt>等级</dt><dd>{levelFor(game.lines).toString().padStart(2, "0")}</dd></div><div><dt>速度</dt><dd>{speed}<small> / 100</small></dd></div><div><dt>消除行数</dt><dd>{game.lines}</dd></div></dl>
        <div className="tetris-level-progress"><span>再消 {20 - game.lines % 20} 行升级</span><progress max={20} value={game.lines % 20} aria-label={`玩家 ${index + 1} 升级进度`} /></div>
        {speed === 0 && <p className="tetris-manual">手动慢慢拼<br />不会自动下落</p>}
      </aside>
    </div>
    <div className="tetris-praise" aria-live="polite" aria-atomic="true">
      {praise ? <><strong>✦ {praise.praise.zh}</strong><span lang="en">{praise.praise.en}</span></> : <><strong>把一整行拼满，就能消除</strong><span>虚线框是方块的落点</span></>}
    </div>
    <div className="tetris-controls" aria-label={`玩家 ${index + 1} 触控操作`}>
      {KEY_ACTIONS.map(control => <button key={control.action} type="button" disabled={phase !== "playing" || game.ended} onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        press(`pointer-${event.pointerId}`, index, control.action);
      }} onPointerUp={event => release(`pointer-${event.pointerId}`)} onPointerCancel={event => release(`pointer-${event.pointerId}`)} onLostPointerCapture={event => release(`pointer-${event.pointerId}`)} onClick={event => { if (event.detail === 0) move(index, control.action); }} aria-label={`玩家 ${index + 1} ${control.label}`}><kbd>{keyLabel(keyFor(bindings, index, control.action))}</kbd><span>{control.label}</span></button>)}
    </div>
    {controls.mode === "gamepad" && <details className="controller-help"><summary>玩家 {index + 1} · 我的手柄键位</summary><dl>{TETRIS_CONTROLS.actions.map(action => <div key={action.id}><dt>{action.label}</dt><dd>{controls.bindings[action.id]?.map(b => bindingLabel(b, controls.device?.mapping !== "")).join(" / ") || "尚未设置"}</dd></div>)}</dl></details>}
  </section>;
}

export function TetrisGame() {
  const [bindings, setBindings] = useState<KeyBindings>(KEY_BINDINGS);
  const [keyboardNotice, setKeyboardNotice] = useState("使用默认键位");
  const controllerDown = useRef(new Map<number, number>());
  const [showControllerSettings, setShowControllerSettings] = useState(false);
  const [controllerNotice, setControllerNotice] = useState("");
  const [initialSpeed, setInitialSpeed] = useState("0");
  const [increment, setIncrement] = useState("0");
  const [sound, setSound] = useState(false);
  const [audioOptions, setAudioOptions] = useState<AudioOptions>({ music: false, effects: true });
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [phase, setPhase] = useState<Phase>("ready");
  const [confirmReset, setConfirmReset] = useState(false);
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
    enabled: (phase === "playing" || phase === "paused") && !confirmReset && !showControllerSettings,
    editing: phase === "ready" || showControllerSettings,
    onActions: events => {
      if (confirmReset || showControllerSettings) return;
      for (const event of events) {
        if (event.action !== "down") continue;
        if (event.type === "release") controllerDown.current.delete(event.player);
        if (event.type === "press") {
          const game = model.current.games[event.player];
          controllerDown.current.set(event.player, game?.clearing ? -1 : game?.pieceId ?? -1);
        }
      }
      const intent = tetrisControllerIntent(events.filter(event => event.action !== "down" || controllerDown.current.get(event.player) === model.current.games[event.player]?.pieceId));
      if (intent.pause && (model.current.phase === "playing" || model.current.phase === "paused")) {
        changePhase(model.current.phase === "playing" ? "paused" : "playing");
      } else if (model.current.phase === "playing") {
        let changed = false;
        for (const { player, action } of intent.moves) {
          const game = model.current.games[player];
          if (!game || (action === "down" && controllerDown.current.get(player) !== game.pieceId)) continue;
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
  }, []);
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
  }
  function refresh() {
    const current = model.current;
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
    redraw(value => value + 1);
  }
  function move(index: number, action: Action) {
    const current = model.current;
    if (current.phase !== "playing" || !current.games[index]) return;
    if (act(current.games[index], action)) refresh();
    arena.current?.focus();
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
    setPraises([]);
    setConfirmReset(false);
    changePhase("playing");
    arena.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
  function reset() {
    setShowControllerSettings(false);
    setControllerNotice("");
    controllers.cancelCapture();
    playback.current?.clear();
    changePhase("ready");
    model.current.games = [];
    setConfirmReset(false);
    setPraises([]);
  }
  // Event callbacks use the current model through refs, so held keys never depend on render timing.
  const callbacks = useRef({ refresh, changePhase, confirmReset, showControllerSettings });
  callbacks.current = { refresh, changePhase, confirmReset, showControllerSettings };
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
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.altKey || event.metaKey || event.ctrlKey || callbacks.current.confirmReset || callbacks.current.showControllerSettings) return;
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
        for (const [player, action] of model.current.held.repeat(now, model.current.games.map(game => game.pieceId))) changed = act(model.current.games[player], action) || changed;
        for (const game of model.current.games) changed = tick(game, delta, motion.matches) || changed;
        if (changed) callbacks.current.refresh();
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", visibility);
      model.current.held.clear();
      output.clear();
      playback.current = null;
      gameAudio.current?.dispose();
      gameAudio.current = null;
    };
  }, []);

  return <div className="app-shell tetris-shell">
    <div className="star-field" aria-hidden="true" />
    <main className="tetris-page">
      <header className="tetris-topbar">
        <a href="/#games" className="tetris-button">← 返回游戏</a>
        <div className="tetris-title"><span>CRYSTAL BLOCKS</span><h1>俄罗斯方块</h1></div>
        <div className="tetris-toolbar">
          {(["music", "effects"] as const).map(kind => <button key={kind} type="button" className="tetris-button" aria-pressed={audioOptions[kind]} onClick={() => {
            const next = { ...audioOptions, [kind]: !audioOptions[kind] };
            setAudioOptions(next); setAudioUnavailable(false); gameAudio.current?.configure(next);
            if (phase === "playing") arena.current?.focus();
          }}>{kind === "music" ? "音乐" : "音效"}：{audioOptions[kind] ? "开 ✓" : "关"}</button>)}
          <button type="button" className="tetris-button" aria-pressed={sound} onClick={() => {
            setSound(!sound);
            playback.current?.setEnabled(!sound);
            if (phase === "finished") { playback.current?.setPaused(false); setSpeechPaused(false); }
            if (phase === "playing") arena.current?.focus();
          }}>{sound ? "✓ 中英表扬" : "表扬声音：关"}</button>
          {phase !== "ready" && <button type="button" className="tetris-button" disabled={phase === "finished" || confirmReset || showControllerSettings} onClick={() => { changePhase(phase === "paused" ? "playing" : "paused"); arena.current?.focus(); }}>{phase === "paused" ? "继续游戏" : "暂停"}</button>}
          {phase !== "ready" && <button type="button" className="tetris-button" disabled={confirmReset} aria-expanded={showControllerSettings} onClick={() => {
            if (phase === "playing") changePhase("paused");
            controllers.cancelCapture(); setShowControllerSettings(!showControllerSettings);
          }}>{showControllerSettings ? "收起控制设置" : "键盘 / 手柄设置"}</button>}
          {phase !== "ready" && <button type="button" className="tetris-button" onClick={() => { controllers.cancelCapture(); setShowControllerSettings(false); if (phase === "finished") reset(); else { changePhase("paused"); setConfirmReset(true); } }}>重新设置</button>}
        </div>
      </header>
      {audioUnavailable && <p className="tetris-validation" role="status">音乐或音效暂时不可用，游戏可以继续。可关闭后重新打开声音试试。</p>}
      {controllerNotice && <p className="tetris-validation" role="status">{controllerNotice}</p>}
      {showControllerSettings && <section className="tetris-controller-settings">{keyboardSettings}<ControllerSetup definition={TETRIS_CONTROLS} session={controllers} lockPlayerCount /><button type="button" className="tetris-button" onClick={() => { controllers.cancelCapture(); setShowControllerSettings(false); arena.current?.focus(); }}>完成设置</button></section>}
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
          <ControllerSetup definition={TETRIS_CONTROLS} session={controllers} />
          <label className="tetris-speed-label" htmlFor="tetris-speed">初始下落速度 <span>0—100</span></label>
          <div className="tetris-speed-input"><input aria-label="初始下落速度滑杆" type="range" min="0" max="100" step="1" value={valid ? initialSpeed : 0} onChange={event => setInitialSpeed(event.target.value)} /><input id="tetris-speed" type="number" min="0" max="100" step="1" value={initialSpeed} onChange={event => setInitialSpeed(event.target.value)} aria-describedby="tetris-speed-help" /></div>
          <p id="tetris-speed-help" className="tetris-field-help">设为 0，就不会自己下落。100 约一秒落到底。</p>
          <label className="tetris-speed-label" htmlFor="tetris-increment">每级增加速度 <span>0—100</span></label>
          <div className="tetris-speed-input"><input aria-label="每级增加速度滑杆" type="range" min="0" max="100" step="1" value={valid ? increment : 0} onChange={event => setIncrement(event.target.value)} /><input id="tetris-increment" type="number" min="0" max="100" step="1" value={increment} onChange={event => setIncrement(event.target.value)} /></div>
          <p className="tetris-field-help">每消 20 行升一级；增速为 0 时始终保持当前速度。</p>
          {!valid && <p role="alert" className="tetris-validation">请输入 0 到 100 的整数。</p>}
          <details className="tetris-key-guide"><summary>键盘设置 · 自由换键</summary>{keyboardSettings}</details>
          <p className="tetris-field-help">{KEY_ACTIONS.map(({ action, label }) => `${keyLabel(keyFor(bindings, 0, action))} ${label}`).join(" · ")}</p>
          <button type="button" className="tetris-start" disabled={!valid || controllers.saved.status === "loading" || !!controllers.capture} onClick={start}>开始{players === 2 ? "双人" : "单人"}游戏 <span aria-hidden="true">↗</span></button>
          <p className="tetris-field-help">{sound ? "每消一行，先听中文，再听英文。" : "想听双语鼓励，可以打开顶部“表扬声音”。"}</p>
        </section>
      </div> : null}
      <div ref={arena} tabIndex={-1} className={`tetris-arena ${model.current.games.length === 2 ? "is-duo" : ""}`} aria-label="俄罗斯方块游戏区" hidden={phase === "ready"} onPointerDown={event => { if (!(event.target instanceof Element) || !event.target.closest("button, a")) arena.current?.focus(); }}>
        {model.current.games.map((game, index) => <PlayerBoard key={index} game={game} index={index} phase={phase} praise={praises[index]} move={move} press={press} release={id => model.current.held.release(id)} bindings={bindings} controls={controllers.profile.players[index]} connected={controllers.devices.some(d => sameDevice(d.device, controllers.profile.players[index]?.device ?? null))} />)}
      </div>
      {confirmReset && <div className="tetris-confirm" role="alert"><p>重新设置会结束当前这一局。</p><button type="button" className="tetris-button" onClick={() => { setConfirmReset(false); changePhase("playing"); arena.current?.focus(); }}>继续这一局</button><button type="button" className="tetris-button" onClick={reset}>确认重新设置</button></div>}
      {phase === "finished" && <section className="tetris-finish" aria-live="polite"><div><h2>这次的拼图旅程完成啦</h2><p>{model.current.games.map((game, index) => `玩家 ${index + 1}：${game.score} 分 / ${game.lines} 行`).join("　·　")}</p></div><button type="button" className="tetris-start" onClick={start}>再玩一次 ↗</button></section>}
      {sound && phase !== "ready" && <div className="tetris-speech-status" role="status">{speechState.unavailable ? "声音暂时不可用，文字表扬会继续显示。" : speechPaused ? "表扬朗读也休息一下，准备好后再听。" : speechState.count ? `正在依次朗读表扬 · 剩余 ${speechState.count} 组` : "消一行，听一句中文和英文。"}{speechState.unavailable && <button type="button" className="tetris-button" disabled={phase === "paused"} onClick={() => { setSpeechPaused(false); playback.current?.setPaused(false); playback.current?.enqueue({ player: 0, praise: praises[0]?.praise ?? pickPraise.current() }); }}>再试朗读</button>}{phase === "finished" && speechPaused && speechState.count > 0 && <button type="button" className="tetris-button" onClick={() => { setSpeechPaused(false); playback.current?.setPaused(false); }}>继续听表扬</button>}</div>}
      <details className="tetris-rules"><summary>玩法与计分</summary><div><p>10 列 × {HEIGHT} 行，拼满一行就消除。一次消除 1 / 2 / 3 / 4 行，分别获得 100 / 300 / 500 / 800 × 当前等级的分数。手动下移每格 1 分，直落每格 2 分。</p><p>每 20 行升一级，最高速度 100。初始速度和每级增速都设为 0，即为全手动。下移到不能再下移时，再按下移即可固定；直落会立即固定方块。按住下落只操作当前这一块，下一块需要松开后再按。</p><p>双人独立计分、独立升级，方块顺序相同，一方堆满后另一方继续。P / Escape 暂停，切换窗口自动暂停。两个键盘仍按键位分组，不能用相同按键区分设备。</p><p>每消一行获得一组表扬。启用声音后先中文、后英文；同时消多行或双人同时消行会依次播放。暂停保留待播表扬，关闭声音或重新设置会清除待播内容。成绩仅保留在本次页面中。</p></div></details>
    </main>
  </div>;
}
