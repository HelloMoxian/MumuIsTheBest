import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GameTopBar } from "../../shared/GameTopBar";
import { useGameFullscreen } from "../../shared/useGameFullscreen";
import { useGameControllers } from "../../shared/controllers/useGameControllers";
import { DIAMOND_CONTROLS } from "./controls";
import { act, createGame, DEFAULT_CONFIG, ghost, level, reconfigure, SKINS, speed, tick, TRACKS, validConfig, type Action, type Config, type Game } from "./logic";
import { GameStore, STORAGE_KEY } from "./storage";
import { DiamondAudio, TRACK_NAMES } from "./audio";
import { Gem, SKIN_NAMES, SYMBOLS } from "./Gem";
import "./diamond-blocks.css";

const message = (error: unknown) => error instanceof Error ? error.message : "浏览器未能保存，请检查可用空间后重试";
function initial() {
  const store = new GameStore({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) });
  try { return { store, game: store.read()?.game ?? createGame(), error: "" }; }
  catch (error) { return { store, game: createGame(), error: message(error) }; }
}
const fields = [
  { key: "width", name: "横向格数", min: 6, max: 15, step: 1 },
  { key: "height", name: "纵向格数", min: 10, max: 20, step: 1 },
  { key: "target", name: "每关消除元素数", min: 3, max: 9999, step: 1 },
  { key: "speed", name: "初始速度（格 / 秒）", min: 0, max: 10, step: .1 },
  { key: "increment", name: "每级增速（格 / 秒）", min: 0, max: 5, step: .05 },
] as const;
type NumericKey = typeof fields[number]["key"];
const numbersFor = (c: Config) => Object.fromEntries(fields.map(f => [f.key, String(c[f.key])])) as Record<NumericKey, string>;

export function DiamondBlocksGame() {
  const [boot] = useState(initial);
  const [game, setGame] = useState(boot.game);
  const live = useRef(boot.game), store = useRef(boot.store);
  const [paused, setPaused] = useState(false), pausedRef = useRef(false);
  const [savedError, setSavedError] = useState(boot.error), errorRef = useRef(boot.error);
  const [audioNotice, setAudioNotice] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState(game.config);
  const [numbers, setNumbers] = useState(numbersFor(game.config));
  const [formError, setFormError] = useState("");
  const [confirm, setConfirm] = useState<"restart" | "resize" | "replace" | null>(null);
  const root = useRef<HTMLDivElement>(null), board = useRef<HTMLDivElement>(null);
  const settings = useRef<HTMLDialogElement>(null), confirmation = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null), resumeAfterSettings = useRef(false), resumeAfterConfirm = useRef(false);
  const audio = useRef<DiamondAudio | null>(null);
  const fullscreen = useGameFullscreen(root);
  const running = !paused && !settingsOpen && !confirm && game.phase !== "over";
  const runningRef = useRef(running); runningRef.current = running;

  function save() {
    if (errorRef.current) return;
    try { store.current.write(live.current); setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })); }
    catch (error) {
      const text = message(error); errorRef.current = text; setSavedError(text);
      pause(true);
    }
  }
  function pause(value: boolean) {
    pausedRef.current = value; setPaused(value);
    runningRef.current = !value && !settings.current?.open && !confirmation.current?.open && live.current.phase !== "over";
    audio.current?.configure(live.current.config, runningRef.current);
    if (value) save();
  }
  function publish(next: Game, action?: Action) {
    const prior = live.current;
    live.current = next; setGame(next);
    if (action && next !== prior) audio.current?.play(action === "rotate" || action === "reverse" ? "rotate" : action === "drop" ? "drop" : "move");
    if (next.pieces > prior.pieces) audio.current?.play("lock");
    if (next.phase === "clearing" && (prior.phase !== "clearing" || next.chain !== prior.chain)) audio.current?.play(next.chain > 1 ? "chain" : "clear", next.chain);
    if (level(next) > level(prior)) audio.current?.play("level");
    if (next.phase === "over" && prior.phase !== "over") audio.current?.play("over");
    save();
  }
  function action(value: Action) {
    if (!runningRef.current || document.hidden || settings.current?.open || confirmation.current?.open) return;
    const next = act(live.current, value);
    if (next !== live.current) publish(next, value);
  }
  const handlers = useRef({ action, pause, save, publish });
  handlers.current = { action, pause, save, publish };
  useGameControllers(DIAMOND_CONTROLS, {
    enabled: running, editing: false,
    onDisconnect: () => pause(true),
    onActions: events => {
      const pressed = events.filter(e => e.type === "press" || e.type === "repeat");
      if (pressed.some(e => e.action === "pause" && e.type === "press")) { pause(true); return; }
      for (const event of pressed) action(event.action as Action);
    },
  });
  useEffect(() => {
    const sound = new DiamondAudio(setAudioNotice); audio.current = sound;
    sound.configure(live.current.config, runningRef.current);
    const unlock = (event: Event) => { if (event.isTrusted) sound.unlock(); };
    window.addEventListener("pointerdown", unlock, true); window.addEventListener("keydown", unlock, true);
    return () => { window.removeEventListener("pointerdown", unlock, true); window.removeEventListener("keydown", unlock, true); sound.dispose(); audio.current = null; };
  }, []);
  useEffect(() => { audio.current?.configure(game.config, running); }, [game.config, running]);
  useEffect(() => {
    let last = performance.now(), lastSave = last;
    const timer = window.setInterval(() => {
      const now = performance.now(), elapsed = now - last; last = now;
      if (!runningRef.current || document.hidden) return;
      const prev = live.current, next = tick(prev, elapsed);
      if (next.phase !== prev.phase || next.active?.y !== prev.active?.y || next.pieces !== prev.pieces || next.score !== prev.score) handlers.current.publish(next);
      else live.current = next;
      if (now - lastSave > 1000) { handlers.current.save(); lastSave = now; }
    }, 50);
    const hide = () => { resumeAfterSettings.current = false; resumeAfterConfirm.current = false; handlers.current.pause(true); };
    const visibility = () => { if (document.hidden) hide(); };
    const keys = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || document.querySelector("dialog[open]") || (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, [contenteditable=true]"))) return;
      if (event.code === "KeyP" || event.code === "Escape") {
        if (!event.repeat) { event.preventDefault(); handlers.current.pause(event.code === "Escape" ? true : !pausedRef.current); }
        return;
      }
      const map: Record<string, Action> = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowDown: "down", KeyS: "down", ArrowUp: "rotate", KeyW: "rotate", KeyX: "rotate", KeyZ: "reverse", Space: "drop" };
      const move = map[event.code];
      if (!move || !runningRef.current) return;
      if (event.code === "Space" && event.target instanceof HTMLElement && event.target.closest("button, a")) return;
      event.preventDefault();
      if (event.repeat && ["drop", "rotate", "reverse"].includes(move)) return;
      handlers.current.action(move);
    };
    const externalSave = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      const error = "另一个页面更新了进度，已暂停。请重新读取，或确认保留这一盘";
      errorRef.current = error; setSavedError(error); hide();
    };
    window.addEventListener("blur", hide); window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visibility); window.addEventListener("keydown", keys);
    window.addEventListener("storage", externalSave);
    handlers.current.save();
    return () => {
      clearInterval(timer); handlers.current.save();
      window.removeEventListener("blur", hide); window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility); window.removeEventListener("keydown", keys);
      window.removeEventListener("storage", externalSave);
    };
  }, []);

  function openSettings() {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resumeAfterSettings.current = !pausedRef.current;
    setDraft(live.current.config); setNumbers(numbersFor(live.current.config)); setFormError("");
    runningRef.current = false; audio.current?.configure(live.current.config, false); save();
    setSettingsOpen(true); settings.current?.showModal();
  }
  function closeSettings() {
    setSettingsOpen(false);
    pause(!resumeAfterSettings.current);
    opener.current?.focus({ preventScroll: true });
  }
  function parsedDraft(): Config {
    const next = { ...draft, ...Object.fromEntries(fields.map(f => [f.key, numbers[f.key].trim() === "" ? NaN : Number(numbers[f.key])])) };
    if (!validConfig(next)) throw new Error("请填写范围内的数字，并保留至少两种元素");
    return next;
  }
  function applySettings() {
    try {
      const next = reconfigure(live.current, parsedDraft()); publish(next);
      settings.current?.close(); setFormError("");
    } catch (error) { setFormError(message(error)); }
  }
  function requestConfirm(kind: "restart" | "resize" | "replace") {
    if (kind === "resize") { try { parsedDraft(); } catch (error) { setFormError(message(error)); return; } }
    resumeAfterConfirm.current = !pausedRef.current;
    pause(true); setConfirm(kind); confirmation.current?.showModal();
  }
  function confirmAction() {
    if (confirm === "replace") {
      try { store.current.replace(live.current); errorRef.current = ""; setSavedError(""); }
      catch (error) { errorRef.current = message(error); setSavedError(message(error)); }
    } else {
      const next = createGame(confirm === "resize" ? parsedDraft() : live.current.config);
      publish(next);
      if (settings.current?.open) { resumeAfterSettings.current = true; settings.current.close(); }
      resumeAfterConfirm.current = true;
    }
    confirmation.current?.close();
  }
  function reload() {
    try {
      const nextStore = new GameStore({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) });
      const next = nextStore.read(); store.current = nextStore;
      errorRef.current = ""; setSavedError("");
      if (next) { live.current = next.game; setGame(next.game); }
      pause(true);
    } catch (error) { errorRef.current = message(error); setSavedError(message(error)); }
  }
  function retry() { errorRef.current = ""; setSavedError(""); save(); }
  function changeAudio(key: "music" | "effects") {
    setAudioNotice(""); publish({ ...live.current, config: { ...live.current.config, [key]: !live.current.config[key] } });
    audio.current?.configure(live.current.config, runningRef.current); audio.current?.unlock();
  }
  const landing = ghost(game), progress = game.cleared % game.config.target;
  const remaining = game.config.target - progress;
  const status = game.phase === "over" ? "这一盘装满了，再来一次吧" : paused ? "休息一下，灵感马上回来" : game.phase === "clearing" ? (game.chain > 1 ? `漂亮！${game.chain} 连锁 · ${game.matches.length} 颗` : `连成啦！消除 ${game.matches.length} 颗`) : game.phase === "settling" ? "星光归位中…" : speed(game) === 0 ? "慢慢想，按 ↓ 或「直落」放下" : "横、竖、斜线，三个相同就消除";
  const occupied = game.board.filter(v => v !== null).length;
  return <div ref={root} className={`diamond-blocks ${fullscreen.focused ? "db-fullscreen" : ""}`} data-gamepad-native={running ? "playing" : undefined} data-skip-startup-greeting>
    <GameTopBar title="钻石方块" wallets={false} controls={<>
      <button onClick={openSettings}>设置</button>
      <button data-gamepad-pause disabled={game.phase === "over"} onClick={() => { pause(!paused); if (paused) { audio.current?.unlock(); audio.current?.play("resume"); board.current?.focus(); } }}>{paused ? "继续" : "暂停"}</button>
      <button onClick={() => requestConfirm("restart")}>重新开局</button>
      <button disabled={fullscreen.switching} data-fullscreen-exit={fullscreen.focused || undefined} onClick={() => void (fullscreen.focused ? fullscreen.leave() : fullscreen.enter())}>{fullscreen.focused ? "退出全屏" : "全屏"}</button>
    </>} />
    <main className="db-main">
      <aside className="db-preview db-panel">
        <span className="db-eyebrow">NEXT / 下一组</span>
        <div className="db-next">{game.next.map((kind, i) => <div key={i}><Gem kind={kind} skin={game.config.skin} /></div>)}</div>
        <div className="db-preview-copy"><strong>三颗一组<br />无限灵感</strong><p>换个顺序<br />就有新发现</p></div>
        <div className="db-palette" aria-label={`已启用 ${game.config.kinds.length} 种元素`}>{game.config.kinds.map(kind => <Gem key={kind} kind={kind} skin={game.config.skin} />)}</div>
        <span className="db-muted">{game.config.kinds.length} 种 · {SKIN_NAMES[game.config.skin]}</span>
      </aside>
      <section className="db-play">
        <div className="db-board-heading"><span><i />{game.config.width} × {game.config.height}</span><span>{speed(game) === 0 ? "自在模式" : `${speed(game).toFixed(2)} 格 / 秒`}</span></div>
        <div className="db-board-area">
          <div ref={board} tabIndex={0} className={`db-board ${game.phase === "settling" ? "is-settling" : ""}`} style={{ "--cols": game.config.width, "--rows": game.config.height, "--ratio": game.config.width / game.config.height } as CSSProperties} role="img" aria-label={`${game.config.width} 列 ${game.config.height} 行，已消除 ${game.cleared} 颗；左右移动，上键换序，空格直落`}>
            {game.board.map((kind, i) => {
              const x = i % game.config.width, y = Math.floor(i / game.config.width);
              const active = game.active && x === game.active.x && y >= game.active.y && y < game.active.y + 3;
              const shadow = !active && landing && x === landing.x && y >= landing.y && y < landing.y + 3;
              const value = active ? game.active!.gems[y - game.active!.y] : kind;
              return <div key={i} className={`db-cell ${active ? "is-active" : ""} ${shadow ? "is-ghost" : ""} ${game.matches.includes(i) ? "is-clearing" : ""}`}>
                {value !== null ? <Gem kind={value} skin={game.config.skin} /> : shadow ? <span className="db-ghost-symbol">{SYMBOLS[landing!.gems[y - landing!.y]]}</span> : null}
              </div>;
            })}
            {(paused || game.phase === "over") && !settingsOpen && !confirm && <div className="db-overlay">
              <span className="db-overlay-mark">{game.phase === "over" ? "✧" : "Ⅱ"}</span>
              <h2>{game.phase === "over" ? "星舱装满啦" : "休息一下"}</h2>
              <p>{game.phase === "over" ? `点亮了 ${game.cleared} 颗，收获 ${game.score} 分` : "这一盘已经为你留好"}</p>
              <button className="db-primary" onClick={() => { if (game.phase === "over") requestConfirm("restart"); else { pause(false); audio.current?.unlock(); board.current?.focus(); } }}>{game.phase === "over" ? "再来一盘" : "继续探索"}</button>
            </div>}
          </div>
        </div>
        <div className={`db-feedback ${game.phase === "clearing" ? "is-success" : ""}`} role="status">{status}</div>
        <div className="db-touch" aria-label="方块操作">
          {([["left", "←", "左移"], ["rotate", "↻", "换序"], ["right", "→", "右移"], ["down", "↓", "下移"], ["drop", "⤓", "直落"]] as const).map(([id, icon, label]) => <button key={id} className={id === "drop" ? "db-primary" : ""} disabled={!running || game.phase !== "falling"} onClick={event => { action(id); if (event.detail > 0) board.current?.focus({ preventScroll: true }); }}><b aria-hidden="true">{icon}</b>{label}</button>)}
        </div>
        <p className="db-key-guide">← → 移动 · ↑ 换序 · ↓ 下移 · 空格直落 · P 暂停</p>
      </section>
      <aside className="db-stats db-panel">
        <div className="db-score"><span className="db-eyebrow">SCORE / 得分</span><strong>{game.score.toLocaleString()}</strong></div>
        <div className="db-level"><span>LEVEL</span><strong>{String(level(game)).padStart(2, "0")}</strong><span>探索关卡</span></div>
        <div className="db-progress"><div><span>下一关</span><b>还差 {remaining} 颗</b></div><progress max={game.config.target} value={progress} /><span>{progress} / {game.config.target}</span></div>
        <dl><div><dt>累计消除</dt><dd>{game.cleared}<small> 颗</small></dd></div><div><dt>最高连锁</dt><dd>{game.bestChain}<small> 次</small></dd></div><div><dt>已落方块</dt><dd>{game.pieces}<small> 组</small></dd></div></dl>
        <div className="db-audio"><button aria-pressed={game.config.music} onClick={() => changeAudio("music")}>音乐{game.config.music ? "：开" : "：关"}</button><button aria-pressed={game.config.effects} onClick={() => changeAudio("effects")}>音效{game.config.effects ? "：开" : "：关"}</button></div>
        <p className="db-save">{savedError ? "进度尚未保存" : `✓ 自动保存${savedAt ? " · " + savedAt : ""}`}</p>
      </aside>
    </main>
    {!occupied && !game.pieces && <p className="db-intro">移动三连块，把相同的元素连在一起。试试「换序」！</p>}
    {audioNotice && <p className="db-notice" role="status">{audioNotice}<button onClick={() => { setAudioNotice(""); audio.current?.unlock(); }}>重试声音</button></p>}
    {savedError && <div className="db-notice db-error" role="alert"><p>{savedError}。当前盘面仍保留在页面中。</p><button onClick={retry}>重试保存</button><button onClick={reload}>读取已保存进度</button><button onClick={() => requestConfirm("replace")}>保留这一盘并替换缓存</button></div>}
    <dialog ref={settings} className="db-dialog" aria-labelledby="db-settings-title" onClose={closeSettings} onKeyDown={event => event.stopPropagation()}>
      <form onSubmit={event => { event.preventDefault(); applySettings(); }}>
        <header><div><span className="db-eyebrow">YOUR PLAYGROUND</span><h2 id="db-settings-title">玩法设置</h2></div><button type="button" onClick={() => settings.current?.close()}>取消</button></header>
        <p>游戏已暂停。调整后继续这一盘。</p>
        <section><h3>节奏与空间</h3><div className="db-fields">{fields.map(f => <label key={f.key}><span>{f.name}</span><input type="number" min={f.min} max={f.max} step={f.step} value={numbers[f.key]} required onChange={event => setNumbers({ ...numbers, [f.key]: event.target.value })} /><small>{f.min}—{f.max}</small></label>)}</div><p className="db-help">初始速度 0：不自动下落。每级增速 0：保持速度。速度最高 20 格 / 秒。关卡按累计消除数重新计算。</p></section>
        <section><h3>换一种光彩</h3><div className="db-skins">{SKINS.map(skin => <button type="button" key={skin} aria-pressed={draft.skin === skin} onClick={() => setDraft({ ...draft, skin })}><div><Gem kind={skin === "elements" ? 2 : 0} skin={skin} /><Gem kind={skin === "elements" ? 4 : 1} skin={skin} /><Gem kind={skin === "elements" ? 6 : 3} skin={skin} /></div><span>{draft.skin === skin ? "✓ " : ""}{SKIN_NAMES[skin]}</span></button>)}</div></section>
        <section><h3>选择参与的元素 <small>{draft.kinds.length} / 7 种</small></h3><div className="db-kinds">{Array.from({ length: 7 }, (_, kind) => <button key={kind} type="button" aria-label={`元素 ${kind + 1}，${draft.kinds.includes(kind) ? "已启用" : "未启用"}`} aria-pressed={draft.kinds.includes(kind)} disabled={draft.kinds.length === 2 && draft.kinds.includes(kind)} onClick={() => setDraft({ ...draft, kinds: draft.kinds.includes(kind) ? draft.kinds.filter(v => v !== kind) : [...draft.kinds, kind].sort() })}><Gem kind={kind} skin={draft.skin} /><span>{draft.kinds.includes(kind) ? "✓" : "＋"} {kind + 1}</span></button>)}</div><p className="db-help">至少两种，种类越多越有挑战。取消的元素会随机变成仍启用的元素，已落方块和下一组一起更新。</p></section>
        <section><h3>星际电台</h3><label className="db-track"><span>背景配乐</span><select value={draft.track} onChange={event => setDraft({ ...draft, track: event.target.value as Config["track"] })}>{TRACKS.map(track => <option value={track} key={track}>{TRACK_NAMES[track]}</option>)}</select></label>
          <div className="db-fields">{([["music", "volume", "音乐"], ["effects", "effectVolume", "音效"]] as const).map(([enabled, volume, label]) => <div className="db-volume" key={enabled}><label><input type="checkbox" checked={draft[enabled]} onChange={event => setDraft({ ...draft, [enabled]: event.target.checked })} />{label} {Math.round(draft[volume] * 100)}%</label><input aria-label={label + "音量"} type="range" min="0" max="1" step=".05" value={draft[volume]} onChange={event => setDraft({ ...draft, [volume]: Number(event.target.value) })} /></div>)}</div>
          <p className="db-help">四首原创芯片配乐，加三首本机音乐；真实操作后开始发声，暂停时一起休息。</p>
        </section>
        <details><summary>玩法与操作</summary><p>横、竖、斜线连续三个及以上相同元素消除。交叉只计一次，下坠后可再次连锁；每颗 10 分 × 连锁次数。顶部放不下新三连块时结束。</p><p>键盘：A / D 或左右键移动，W / ↑ / X 换序，Z 反向换序，S / ↓ 下移，空格直落，P 暂停。手柄：方向控制，A 换序，X 反向，Y 直落，B / 菜单暂停；暂停后可操作顶部设置。</p><p>配置和整盘进度只保存在此浏览器。刷新立即继续，离开窗口暂停；清理浏览器缓存会删除进度。尺寸变化保留左侧与底部，放不下时不会裁掉已有元素。</p></details>
        {formError && <p className="db-error" role="alert">{formError}</p>}
        <footer><button type="button" onClick={() => { setDraft({ ...DEFAULT_CONFIG }); setNumbers(numbersFor(DEFAULT_CONFIG)); setFormError(""); }}>默认设置</button><button type="button" onClick={() => requestConfirm("resize")}>按新设置重新开局</button><button className="db-primary" type="submit">应用设置并继续</button></footer>
      </form>
    </dialog>
    <dialog ref={confirmation} className="db-dialog db-confirm" aria-labelledby="db-confirm-title" onKeyDown={event => event.stopPropagation()} onClose={() => { setConfirm(null); pause(!resumeAfterConfirm.current); if (!settings.current?.open) board.current?.focus(); }}>
      <h2 id="db-confirm-title">{confirm === "replace" ? "用这一盘替换缓存？" : "开始新的一盘？"}</h2>
      <p>{confirm === "replace" ? "浏览器原来保存的进度会被当前盘面替换。此操作不能撤销。" : "当前盘面和分数会清空，设置将保留。新盘会立即开始并自动保存。"}</p>
      <div><button autoFocus onClick={() => confirmation.current?.close()}>取消</button><button className="db-primary" onClick={confirmAction}>{confirm === "replace" ? "确认替换" : "重新开局"}</button></div>
    </dialog>
  </div>;
}
