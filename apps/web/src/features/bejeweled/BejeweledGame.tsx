import { useEffect, useRef, useState } from "react";
import { COLORS, adjacent, canSwap, findMove, type Board, type Frame, type Mode } from "../../../../server/src/bejeweled-engine";
import type { BejeweledCommand, BejeweledResponse, BejeweledState } from "../../../../server/src/bejeweled";
import { GemIcon, GemSwapBoard, GEM_NAMES } from "../../shared/GemSwapBoard";
import { LearningCoinBalancePill } from "../../shared/LearningCoinLayer";
import { LEARNING_COINS_CHANGED_EVENT } from "../../shared/learning-coins";
import type { GemReward } from "../../../../server/src/bejeweled-rewards";
import { frameDuration, SWAP_MS } from "./motion";
import { BejeweledRewardTrail } from "./BejeweledRewardTrail";
import { GemAudio, frameSound } from "./audio";
import { useAudioPreferences, setAudioPreferences } from "../../shared/audio/audio-store";
import { audioFocus } from "../../shared/audio/audio-focus";
import "./bejeweled.css";

const number = (value: number) => value.toLocaleString("zh-CN");
const modeName = (mode: Mode) => mode === "endless" ? "无尽探索" : "经典挑战";
function isState(value: unknown): value is BejeweledState {
  if (!value || typeof value !== "object") return false;
  const state = value as BejeweledState;
  return state.schemaVersion === 2 && state.id === "game-bejeweled"
    && Number.isSafeInteger(state.revision) && Array.isArray(state.game?.board)
    && state.game.board.length === 64 && state.game.board.every(gem => gem && COLORS.includes(gem.color)
      && ["normal", "flame", "star", "cube", "nova"].includes(gem.special))
    && COLORS.every(color => Number.isSafeInteger(state.counts?.[color]))
    && Number.isSafeInteger(state.totalScore) && Number.isSafeInteger(state.totalCleared)
    && Number.isSafeInteger(state.rewardTotals?.knowledge) && Number.isSafeInteger(state.rewardTotals?.energy)
    && Number.isSafeInteger(state.lastReward?.knowledge) && Number.isSafeInteger(state.lastReward?.energy);
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = window.setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}
export function BejeweledGame() {
  const [state, setState] = useState<BejeweledState | null>(null);
  const [board, setBoard] = useState<Board>([]);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [rejected, setRejected] = useState(0);
  const [balances, setBalances] = useState<GemReward | null>(null);
  const [reward, setReward] = useState<(GemReward & { id: string }) | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState<number[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("正在恢复上次的宝石棋盘…");
  const [saveStatus, setSaveStatus] = useState("正在恢复");
  const [paused, setPaused] = useState(false);
  const [help, setHelp] = useState(false);
  const audioSettings = useAudioPreferences();
  const sound = audioSettings.ready && audioSettings.preferences.effectsEnabled;
  const [newMode, setNewMode] = useState<Mode | null>(null);
  const pending = useRef<BejeweledCommand | null>(null);
  const lock = useRef(true);
  const mounted = useRef(true);
  const playback = useRef(new AbortController());
  const audio = useRef<GemAudio | null>(null);
  const pauseRef = useRef(false);
  const latest = useRef<BejeweledState | null>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const newGameDialog = useRef<HTMLDialogElement>(null);

  function updateBalances(value: GemReward | undefined) {
    if (!value || !Number.isSafeInteger(value.knowledge) || !Number.isSafeInteger(value.energy)) return;
    setBalances(value);
    window.dispatchEvent(new CustomEvent(LEARNING_COINS_CHANGED_EVENT, {
      detail: { coinBalance: value.knowledge, updatedAt: new Date().toISOString() },
    }));
  }

  useEffect(() => {
    if (help) helpDialog.current?.showModal();
    if (newMode) newGameDialog.current?.showModal();
  }, [help, newMode]);

  function accept(next: BejeweledState) {
    latest.current = next; setState(next); setBoard(next.game.board);
    setSelected(null); setHint([]); setFrame(null);
  }
  useEffect(() => {
    const effects = new GemAudio(() => { if (mounted.current) setMessage("音效暂时不可用，仍然可以继续玩；下次点击会重试。"); });
    audio.current = effects;
    effects.prepare();
    return () => { effects.dispose(); audio.current = null; };
  }, []);
  useEffect(() => { audio.current?.configure(sound, audioSettings.preferences.effectsVolume); }, [sound, audioSettings.preferences.effectsVolume]);
  useEffect(() => {
    const update = () => audio.current?.setStopped(paused || help || newMode !== null || document.hidden || audioFocus.isMicrophoneActive());
    update();
    return audioFocus.subscribe(update);
  }, [paused, help, newMode]);
  async function restore() {
    lock.current = true; setBusy(true); setError(""); setSaveStatus("正在恢复");
    try {
      const response = await fetch("/api/games/bejeweled", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const data: unknown = await response.json();
      if (!response.ok || !isState(data)) throw new Error("暂时无法恢复进度。请检查服务或本机数据文件，再点击重试。");
      if (!mounted.current) return;
      updateBalances((data as BejeweledState & { balances?: GemReward }).balances);
      accept(data); pending.current = null; setSaveStatus("已自动保存");
      setMessage(data.totalMoves ? "已接回上次棋盘，继续寻找闪亮的三连吧。" : "点一个宝石，再点它旁边的宝石，连成三个就能消除。");
    } catch (cause) {
      if (mounted.current) { setError((cause as Error).message); setSaveStatus("等待重试"); }
    } finally {
      if (mounted.current) { lock.current = false; setBusy(false); }
    }
  }
  useEffect(() => {
    mounted.current = true;
    void restore();
    const visibility = () => {
      if (document.hidden) {
        pauseRef.current = true; setPaused(true); playback.current.abort();
        audio.current?.setStopped(true);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false; playback.current.abort();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  async function submit(command: BejeweledCommand) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setHint([]); setSelected(null);
    setSaveStatus("正在保存并发放奖励"); setReward(null); pending.current = command;
    try {
      const response = await fetch("/api/games/bejeweled", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command), signal: AbortSignal.timeout(15000), keepalive: true,
      });
      const data = await response.json() as BejeweledResponse & { message?: string };
      if (!mounted.current) return;
      if (response.status === 409 && isState(data.state)) {
        updateBalances(data.balances);
        accept(data.state); pending.current = null; setSaveStatus("已恢复最新进度");
        setMessage("另一页面更新了棋盘，已经为你接回最新进度。"); return;
      }
      if (response.status === 422) {
        pending.current = null; setSaveStatus("已自动保存"); setMessage(data.message ?? "试试另一对相邻宝石。"); return;
      }
      if (!response.ok || !isState(data.state)) throw new Error(data.message ?? "这一步暂时没有收到保存确认，请点击重试。");
      pending.current = null; latest.current = data.state; setState(data.state); setSaveStatus("已自动保存");
      updateBalances(data.balances);
      playback.current.abort(); playback.current = new AbortController();
      const signal = playback.current.signal;
      if (data.move && !matchMedia("(prefers-reduced-motion: reduce)").matches && !pauseRef.current && !document.hidden) {
        let previousBoard = board;
        for (const next of data.move.frames) {
          if (signal.aborted || !mounted.current) break;
          setBoard(next.board); setFrame(next);
          const soundName = frameSound(next);
          if (soundName) audio.current?.play(soundName, next.cascade);
          if (next.points) setMessage("第 " + next.cascade + " 次连锁 · +" + number(next.points) + " 分");
          await delay(frameDuration(next, previousBoard), signal);
          if (next.phase === "fall" && !signal.aborted) audio.current?.play("land");
          previousBoard = next.board;
        }
      } else if (data.move && !data.replayed) audio.current?.play("clear");
      if (!mounted.current) return;
      accept(data.state);
      if (command.type === "swap" && !data.replayed) setReward({ ...data.state.lastReward, id: command.operationId });
      setMessage(data.move ? "消除了 " + data.move.cleared + " 颗宝石 · +" + number(data.move.points) + " 分"
        + (data.move.longestCascade > 1 ? " · " + data.move.longestCascade + " 次连锁！" : "")
        + (data.move.shuffled ? " · 棋盘已重新排列，继续探索吧。" : "")
        + " · 知识币 +" + data.state.lastReward.knowledge + "，能量币 +" + data.state.lastReward.energy
        : data.replayed ? "这一步已保存，累计成绩没有重复增加。" : "新棋盘准备好了，累计收藏依然保留。");
    } catch (cause) {
      if (mounted.current) { setError((cause as Error).name === "TimeoutError" ? "暂时没收到保存确认，请重试这一步。" : (cause as Error).message); setSaveStatus("等待重试"); }
    } finally {
      if (mounted.current) { lock.current = false; setBusy(false); }
    }
  }
  function swap(a: number, b: number) {
    const current = latest.current;
    if (!current || lock.current || paused || help || newMode || pending.current || current.game.status === "finished") return;
    audio.current?.unlock();
    setSelected(null); setHint([]);
    if (!canSwap(current.game.board, a, b)) {
      setMessage("这两个交换后还不能连成三个，试试另一对吧。");
      if (adjacent(a, b)) void rejectSwap(current.game.board, a, b);
      return;
    }
    void submit({ type: "swap", a, b, revision: current.revision, operationId: crypto.randomUUID() });
  }
  async function rejectSwap(original: Board, a: number, b: number) {
    audio.current?.play("swap");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { audio.current?.play("return"); setRejected(value => value + 1); return; }
    lock.current = true; setBusy(true);
    playback.current.abort(); playback.current = new AbortController();
    const signal = playback.current.signal;
    const swapped = [...original]; [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
    const visual = (next: Board): Frame => ({ board: next, cleared: [], created: [], points: 0, cascade: 0, phase: "swap" });
    setFrame(visual(swapped)); setBoard(swapped);
    await delay(SWAP_MS + 30, signal);
    if (!mounted.current) return;
    if (!signal.aborted) audio.current?.play("return");
    setFrame(visual(original)); setBoard(original);
    await delay(SWAP_MS + 30, signal);
    if (!mounted.current) return;
    setFrame(null); setRejected(value => value + 1); lock.current = false; setBusy(false);
  }
  function choose(index: number) {
    audio.current?.play("select");
    if (selected === null) setSelected(index);
    else if (selected === index) setSelected(null);
    else if (adjacent(selected, index)) swap(selected, index);
    else setSelected(index);
  }
  function togglePause() {
    const next = !paused;
    pauseRef.current = next; setPaused(next);
    if (next) { playback.current.abort(); audio.current?.setStopped(true); }
    else { audio.current?.setStopped(false); audio.current?.unlock(); }
  }
  function toggleSound() {
    setAudioPreferences({ effectsEnabled: !sound });
    audio.current?.configure(!sound, audioSettings.preferences.effectsVolume);
    if (!sound) audio.current?.unlock();
  }
  const disabled = busy || !!error || paused || help || newMode !== null || state?.game.status === "finished";
  const progress = state ? state.game.cleared % 100 : 0;
  return <main className="bj-page" data-motion-paused={paused}>
    <BejeweledRewardTrail reward={reward} stopped={paused} />
    <header className="bj-header">
      <a className="bj-button" href="/#games">‹ 返回游戏</a>
      <div className="bj-brand"><span className="bj-eyebrow">CRYSTAL CONSTELLATION</span><h1>宝石迷阵</h1></div>
      <div className="bj-header-actions">
        <div data-bj-currency="knowledge"><LearningCoinBalancePill /></div>
        <div className="bj-energy-wallet" data-bj-currency="energy" aria-label={"能量币余额 " + (balances?.energy ?? "正在读取")}><span aria-hidden="true">ϟ</span><span><small>能量币</small><strong>{balances ? number(balances.energy) : "…"}</strong></span></div>
        <span className="bj-save" role="status">{saveStatus === "已自动保存" ? "✓ " : ""}{saveStatus}</span>
        <button className="bj-button" onClick={toggleSound} disabled={!audioSettings.ready} aria-pressed={sound}>音效{sound ? "：开" : "：关"}</button>
        <button className="bj-button" onClick={() => setHelp(!help)} aria-expanded={help}>玩法说明</button>
      </div>
    </header>
    <div className="bj-layout">
      <aside className="bj-panel bj-session">
        <span className="bj-eyebrow">本次旅程</span>
        <h2>{state ? modeName(state.game.mode) : "星光正在汇聚"}</h2>
        <span className="bj-label">本局得分</span><strong className="bj-score">{number(state?.game.score ?? 0)}</strong>
        <div className="bj-level"><span>探索等级</span><b>{state?.game.level ?? 1}</b></div>
        <progress value={progress} max={100} aria-label="距离下一级的消除进度" />
        <p className="bj-muted">再消除 {100 - progress} 颗，点亮下一等级</p>
        <div className="bj-session-details"><span>本局消除 <b>{number(state?.game.cleared ?? 0)}</b></span><span>有效交换 <b>{number(state?.game.moves ?? 0)}</b></span></div>
        <button className="bj-button bj-primary" disabled={!state || disabled} onClick={() => {
          const move = findMove(board);
          if (move) { setHint(move); setSelected(null); setMessage("试试交换第 " + (Math.floor(move[0] / 8) + 1) + " 行第 " + (move[0] % 8 + 1) + " 列与第 " + (Math.floor(move[1] / 8) + 1) + " 行第 " + (move[1] % 8 + 1) + " 列的宝石。"); }
        }}>✧ 给我一个提示</button>
        <button className="bj-button" onClick={togglePause} disabled={!state}> {paused ? "继续探索" : "暂停一下"}</button>
        <button className="bj-button" disabled={!state || busy || !!error} onClick={() => setNewMode(state!.game.mode)}>换一局 / 切换模式</button>
        <p className="bj-muted">每一步都自动保存<br />下次打开，接着这里玩</p>
      </aside>
      <section className="bj-play" aria-label="宝石消除游戏">
        <div className="bj-board-caption"><span>交换相邻宝石 · 三颗同色连成线</span><span>8 × 8</span></div>
        <div className="bj-board-frame">
          {board.length === 64 && <GemSwapBoard board={board} selected={selected} hint={hint} cleared={frame?.cleared ?? []} created={frame?.created ?? []} disabled={disabled} onSelect={choose} onSwap={swap} onInteract={() => audio.current?.unlock()} frame={frame} stopped={paused} rejected={rejected} />}
          {!state && <div className="bj-overlay bj-loading"><h2>{busy ? "正在恢复宝石…" : "暂时无法打开棋盘"}</h2><p>你的长期收藏会保存在本机。</p></div>}
          {paused && state && <div className="bj-overlay"><span className="bj-overlay-symbol">Ⅱ</span><h2>星光休息一下</h2><p>棋盘和收藏都在这里等你。</p><button className="bj-button bj-primary" onClick={togglePause}>继续探索</button></div>}
          {state?.game.status === "finished" && !paused && <div className="bj-overlay"><h2>这一局收集完成！</h2><p>棋盘已经没有可用交换。</p><strong className="bj-score">{number(state.game.score)} 分</strong><button className="bj-button bj-primary" disabled={busy || !!error} onClick={() => setNewMode("classic")}>再开一局</button></div>}
        </div>
        <div className="bj-feedback" role="status" aria-live="polite"><span aria-hidden="true">✦</span><p>{message}</p></div>
        {reward && <div className="bj-reward-summary">已到账：知识币 +{reward.knowledge} · 能量币 +{reward.energy}</div>}
        {error && <div className="bj-error" role="alert"><p>{error}</p><button className="bj-button" disabled={busy} onClick={() => pending.current ? void submit(pending.current) : void restore()}>重试{pending.current ? "保存这一步" : "恢复进度"}</button></div>}
        <p className="bj-mobile-note">小屏可横向滚动棋盘，或横屏畅玩。也可以按住宝石向旁边拖动。</p>
        {help && <dialog ref={helpDialog} className="bj-panel bj-help" aria-label="玩法说明" onCancel={() => setHelp(false)}>
          <h2>把闪亮宝石连起来</h2>
          <p>点击两颗相邻宝石或拖动交换。横向、竖向连成三个同色就会消除；没连成就留在原位。上方宝石落下后还能继续连锁。</p>
          <ul><li>四颗连成线 → 火焰宝石，消除周围 3 × 3 格。</li><li>五颗连成 T / L 形 → 星形宝石，消除整行和整列。</li><li>五颗连成线 → 超能宝石，与任意颜色交换，消除该颜色。</li><li>六颗及以上连成线 → 新星宝石，消除三行和三列。</li><li>两颗超能宝石交换 → 全盘消除。特殊宝石被消除时还会引发连锁。</li></ul>
          <p>键盘方向键移动焦点，回车或空格选择；“提示”会圈出能交换的一对。</p>
          <p>每组三连随机获得 1 枚知识币或能量币；四连获得两种币各 2 枚；五连及以上（含 T / L 形）各 5 枚。爆炸额外消除的每颗宝石随机获得一种币，连锁中的每组分别奖励。</p>
          <p>无尽模式没有时间限制，死盘会重新排列；经典模式在无可用交换时结束。每消除一颗得 50 × 等级 × 本步连锁数分，制造特殊宝石另有奖励，每消除 100 颗升一级。</p>
          <button className="bj-button bj-primary" onClick={() => setHelp(false)}>知道了，继续玩</button>
        </dialog>}
        {newMode && <dialog ref={newGameDialog} className="bj-panel bj-confirm" aria-label="确认换局" onCancel={() => setNewMode(null)}>
          <h2>开启一张新棋盘？</h2><p>本局棋盘和本局得分将重新开始；总得分、所有颜色收藏和最佳纪录会保留。</p>
          <div className="bj-mode-options"><button className="bj-button" aria-pressed={newMode === "endless"} onClick={() => setNewMode("endless")}>无尽探索</button><button className="bj-button" aria-pressed={newMode === "classic"} onClick={() => setNewMode("classic")}>经典挑战</button></div>
          <p>{newMode === "endless" ? "没有倒计时，遇到死盘会重新排列。" : "没有倒计时，遇到死盘后结束本局。"}</p>
          <div className="bj-mode-options"><button className="bj-button" onClick={() => setNewMode(null)}>保留这局</button><button className="bj-button bj-primary" disabled={busy || !!error} onClick={() => {
            if (!latest.current) return;
            const mode = newMode; setNewMode(null);
            void submit({ type: "new", mode, revision: latest.current.revision, operationId: crypto.randomUUID() });
          }}>确认开启新棋盘</button></div>
        </dialog>}
      </section>
      <aside className="bj-panel bj-collection">
        <span className="bj-eyebrow">永久收藏</span><h2>我的宝石星藏</h2>
        <div className="bj-total"><span>总得分</span><strong>{number(state?.totalScore ?? 0)}</strong></div>
        <div className="bj-total"><span>总消除宝石</span><strong>{number(state?.totalCleared ?? 0)} <small>颗</small></strong></div>
        <div className="bj-color-list">{COLORS.map(color => <div className="bj-color-row" key={color}><GemIcon gem={{ color, special: "normal" }} small /><span>{GEM_NAMES[color]}<small>宝石</small></span><strong>{number(state?.counts[color] ?? 0)}</strong></div>)}</div>
        <div className="bj-records"><span>最佳单局 <b>{number(state?.bestScore ?? 0)}</b></span><span>最长连锁 <b>{state?.longestCascade ?? 0} 次</b></span></div>
      </aside>
    </div>
  </main>;
}
