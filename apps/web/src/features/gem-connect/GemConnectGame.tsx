import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { formatTime, GEMS, LEVELS, RULES_VERSION, rankRecords, type Completion, type RecordEntry } from "./logic";
import { entryDelay, hintGame, newGame, pauseGame, pickGem, resumeGame, shuffleGame, tickGame, type Game } from "./engine";
import { fetchHistory, type Settlement } from "./api";
import { LearningCoinBalancePill, useLearningCoinStatus } from "../../shared/LearningCoinLayer";
import { EnergyCoinBalancePill } from "../../shared/EnergyCoinBalancePill";
import { LEARNING_COINS_AWARDED_EVENT, LEARNING_COINS_CHANGED_EVENT, type LearningCoinAward } from "../../shared/learning-coins";
import { useGameFullscreen } from "../../shared/useGameFullscreen";
import { displayIndex, displayPoint, fitBoard, logicalIndex } from "./layout";
import "./gem-connect.css";

const preciseTime = (ms: number) => formatTime(ms) + "." + (Math.round(ms) % 1000).toString().padStart(3, "0");
function Gem({ kind }: { kind: number }) {
  const [broken, setBroken] = useState(false);
  const gem = GEMS[kind];
  return broken ? <span className="gc-fallback">{gem.symbol}<small>{gem.name}</small></span>
    : <img src={`/images/gem-connect/${gem.id}.png`} alt="" draggable={false} onError={() => setBroken(true)} />;
}
export function GemConnectGame() {
  const { refresh: refreshKnowledgeCoins } = useLearningCoinStatus();
  const [game, setGame] = useState<Game>(() => newGame(1));
  const current = useRef(game), clock = useRef(performance.now());
  const commit = (next: Game) => { current.current = next; setGame(next); };
  const reduced = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [showTime, setShowTime] = useState(true);
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
  const [pending, setPending] = useState<Completion[]>([]);
  const pendingRef = useRef<Completion[]>([]);
  const queued = useRef(new Set<string>()), announced = useRef(new Set<string>());
  const [saving, setSaving] = useState(false), savingRef = useRef(false);
  const [reward, setReward] = useState<Settlement | null>(null);
  const rewardTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true), tilesRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [energyRevision, setEnergyRevision] = useState(0);
  const pageRef = useRef<HTMLElement | null>(null), boardArea = useRef<HTMLDivElement | null>(null);
  const recordsDialog = useRef<HTMLDialogElement | null>(null);
  const fullscreen = useGameFullscreen(pageRef);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = boardArea.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      setSpace(old => old.width === width && old.height === height ? old : { width, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  const mergeHistory = useCallback((incoming: RecordEntry[]) => {
    setRecords(old => Array.from(new Map([...old, ...incoming].map(item => [item.id, item])).values()));
    setHistoryState("ready");
  }, []);
  const loadHistory = useCallback(async () => {
    setHistoryState("loading");
    try { const result = await fetchHistory(); if (alive.current) mergeHistory(result.records); }
    catch { if (alive.current) setHistoryState("error"); }
  }, [mergeHistory]);
  const showReward = useCallback((settlement: Settlement) => {
    if (announced.current.has(settlement.eventId)) return;
    announced.current.add(settlement.eventId);
    setReward(settlement);
    setEnergyRevision(value => value + 1);
    void refreshKnowledgeCoins();
    window.dispatchEvent(new CustomEvent(LEARNING_COINS_CHANGED_EVENT, {
      detail: { coinBalance: settlement.knowledgeBalance, updatedAt: settlement.updatedAt },
    }));
    const award: LearningCoinAward = {
      alreadyAwarded: false, baseRewardCoins: settlement.amount, multiplier: 1, criticalHit: false,
      rewardCoins: settlement.amount, source: "games:gem-connect",
      progress: { coinBalance: settlement.knowledgeBalance, updatedAt: settlement.updatedAt },
    };
    window.dispatchEvent(new CustomEvent(LEARNING_COINS_AWARDED_EVENT, { detail: award }));
    clearTimeout(rewardTimer.current);
    rewardTimer.current = setTimeout(() => setReward(null), 4400);
  }, [refreshKnowledgeCoins]);
  const savePending = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      while (pendingRef.current.length) {
        const result = await fetchHistory(pendingRef.current[0]);
        if (!alive.current) return;
        mergeHistory(result.records);
        if (result.settlement) showReward(result.settlement);
        pendingRef.current = pendingRef.current.slice(1);
        setPending([...pendingRef.current]);
      }
    } catch { if (alive.current) setHistoryState("error"); }
    finally { savingRef.current = false; if (alive.current) setSaving(false); }
  }, [mergeHistory, showReward]);
  useEffect(() => {
    alive.current = true;
    void loadHistory();
    return () => { alive.current = false; clearTimeout(rewardTimer.current); };
  }, [loadHistory]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => { reduced.current = media.matches; };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  // Only a completed but unacknowledged save warrants a leave warning.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (pendingRef.current.length) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const sync = () => {
    const now = performance.now(), next = tickGame(current.current, now - clock.current, reduced.current);
    clock.current = now; commit(next); return next;
  };
  const actions = useRef({ sync });
  actions.current = { sync };
  useEffect(() => {
    const timer = setInterval(() => {
      let next = actions.current.sync();
      if (next.phase === "complete" && next.level < 10) {
        next = newGame(next.level + 1);
        if (document.hidden) next = pauseGame(next);
        clock.current = performance.now(); commit(next);
      }
    }, 80);
    const hidden = () => {
      if (document.hidden) commit(pauseGame(actions.current.sync()));
    };
    document.addEventListener("visibilitychange", hidden);
    if (document.hidden) hidden();
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  useEffect(() => {
    const completion = game.completion;
    if (!completion || queued.current.has(completion.id)) return;
    queued.current.add(completion.id);
    pendingRef.current = [...pendingRef.current, completion];
    setPending([...pendingRef.current]); void savePending();
  }, [game.completion, savePending]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (pendingRef.current.length) void savePending();
    }, 15000);
    return () => clearInterval(timer);
  }, [savePending]);
  function chooseLevel(level: number) {
    const next = newGame(level);
    clock.current = performance.now(); commit(next);
  }
  const config = LEVELS[game.level - 1];
  const layout = fitBoard(config.rows, config.cols, space.width, space.height);
  const remaining = game.board.tiles.filter(tile => tile !== null).length / 2;
  const total = config.rows * config.cols / 2, ranking = rankRecords(records, game.level);
  const best = ranking[0];
  const paused = game.phase === "paused";
  const celebrating = game.phase === "celebrating" || game.phase === "complete";
  const entryActive = game.phase === "entering" || (paused && game.resumePhase === "entering");
  const removing = new Map(game.matches.flatMap(match => [[match.a, match], [match.b, match]] as const));
  const score = (total - remaining) * 10;
  function moveFocus(event: KeyboardEvent, index: number) {
    const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: layout.cols, ArrowUp: -layout.cols };
    const offset = offsets[event.key]; if (!offset) return;
    event.preventDefault();
    const start = displayIndex(index, config.cols, layout);
    for (let next = start + offset; next >= 0 && next < game.board.tiles.length; next += offset) {
      if (Math.abs(offset) === 1 && Math.floor(next / layout.cols) !== Math.floor(start / layout.cols)) break;
      const logical = logicalIndex(next, config.cols, layout);
      if (game.board.tiles[logical] !== null) { tilesRef.current[logical]?.focus(); return; }
    }
  }
  return <main ref={pageRef} className={`gc-page ${fullscreen.focused ? "gc-focused" : ""}`}>
    <header className="gc-topbar">
      <a href="/?tab=games" className="gc-button">← 游戏大厅</a>
      <div className="gc-brand"><span aria-hidden="true">✧</span><strong>宝石连连看</strong></div>
      <label className="gc-level-select">关卡<select value={game.level} onChange={event => chooseLevel(Number(event.target.value))}>{LEVELS.map((level, i) => <option key={level.name} value={i + 1}>第 {i + 1} 关 · {level.name}</option>)}</select></label>
      <div className="gc-wallets"><LearningCoinBalancePill /><EnergyCoinBalancePill key={energyRevision} /></div>
    </header>
    <nav className="gc-levels" aria-label="十关星光航线">{LEVELS.map((level, index) => {
      const completed = records.some(record => record.rulesVersion === RULES_VERSION && record.level === index + 1) || pending.some(record => record.level === index + 1);
      return <button key={level.name} aria-current={game.level === index + 1 ? "step" : undefined} onClick={() => chooseLevel(index + 1)} aria-label={`第 ${index + 1} 关 ${level.name}${completed ? "，已通关" : ""}`}><span>{completed ? "✓" : String(index + 1).padStart(2, "0")}</span><small>{level.name}</small></button>;
    })}</nav>
    <header className="gc-focusbar" hidden={!fullscreen.focused}>
      <div className="gc-metric"><span>已用时间</span><strong>{formatTime(game.elapsed)}</strong></div>
      <div className="gc-metric"><span>得分</span><strong>{score}</strong></div>
      <button className="gc-button" data-fullscreen-exit disabled={fullscreen.switching} onClick={() => void fullscreen.leave()}>退出全屏</button>
    </header>
    <section className="gc-play" aria-label="宝石棋盘">
      <div className="gc-heading"><div className="gc-title-line"><h1>{config.name}</h1><span>第 {game.level} 关 · {total * 2} 颗 · {config.kinds} 种</span></div>
        <div className="gc-controls">
          <div className="gc-time"><small>已用时间</small><strong>{showTime ? formatTime(game.elapsed) : "∞"}</strong></div>
          <div className="gc-time"><small>得分</small><strong>{score}</strong></div>
          <button className="gc-button" disabled={fullscreen.switching} onClick={() => void fullscreen.enter()}>⛶ 全屏</button>
          <button className="gc-button" onClick={() => commit(hintGame(sync()))} disabled={game.phase !== "playing"}>✧ 帮帮我</button>
          <button className="gc-button" onClick={() => commit(shuffleGame(sync()))} disabled={game.phase !== "playing"}>↻ 重排</button>
          <button className="gc-button" disabled={game.phase === "complete"} onClick={() => {
            const g = sync(); commit(paused ? resumeGame(g) : pauseGame(g)); clock.current = performance.now();
          }}>{paused ? "继续玩" : "Ⅱ 休息"}</button>
        </div>
      </div>
      <div className="gc-progress"><span>已连接 <b>{total - remaining}</b> / {total} 对</span><progress value={total - remaining} max={total} aria-label="配对进度" /><span>通关奖励：知识币 +{game.level * 10} · 能量币 +{game.level * 10}</span></div>
      <div className={`gc-stage ${paused ? "gc-is-paused" : ""}`}><div className="gc-board-area" ref={boardArea}>
        <div className={`gc-board-frame ${entryActive ? "gc-entering" : ""}`} style={{ "--gc-cols": layout.cols, "--gc-rows": layout.rows, "--gc-cell": layout.cell + "px" } as CSSProperties}>
          <div className={`gc-board ${paused ? "gc-concealed" : ""}`} key={game.id + ":" + game.entrance}>
            {game.board.tiles.map((tile, index) => {
              const match = removing.get(index), kind = tile ?? match?.kind;
              const position = displayPoint({ r: Math.floor(index / config.cols), c: index % config.cols }, layout.transposed);
              return <div className="gc-cell" key={index} style={{ "--gc-delay": entryDelay(index, config.rows, config.cols) + "ms", gridRow: position.r + 1, gridColumn: position.c + 1 } as CSSProperties}>{kind !== undefined && kind !== null && <button
                className={`gc-tile ${game.selected === index ? "gc-selected" : ""} ${game.hint.includes(index) ? "gc-hinted" : ""} ${match ? "gc-removing" : ""}`}
                ref={element => { tilesRef.current[index] = element; }} disabled={!!match || game.phase !== "playing"}
                aria-hidden={match ? true : undefined}
                aria-label={`第 ${position.r + 1} 行第 ${position.c + 1} 列，${GEMS[kind].name}${game.hint.includes(index) ? "，提示宝石" : ""}`}
                aria-pressed={game.selected === index} onClick={event => {
                  const before = sync(), next = pickGem(before, index); commit(next);
                  if (event.detail === 0 && next.matches.length > before.matches.length && next.phase === "playing") {
                    const nextIndex = next.board.tiles.findIndex(kind => kind !== null);
                    tilesRef.current[nextIndex]?.focus({ preventScroll: true });
                  }
                }} onKeyDown={event => moveFocus(event, index)}>
                <span className="gc-gem"><Gem kind={kind} /></span>
                {game.selected === index && <span className="gc-tile-mark">✓</span>}
                {game.hint.includes(index) && <span className="gc-tile-mark">★</span>}
                {match && <span className="gc-sparks" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ "--gc-angle": i * 60 + "deg" } as CSSProperties}>✦</i>)}</span>}
              </button>}</div>;
            })}
          </div>
          {game.matches.length > 0 && <svg className={`gc-path ${paused ? "gc-concealed" : ""}`} viewBox={`0 0 ${layout.cols + 2} ${layout.rows + 2}`} preserveAspectRatio="none" aria-hidden="true">
            {game.matches.map(match => <polyline key={game.id + ":" + game.entrance + ":" + match.a + ":" + match.b} pathLength="1" points={match.path.map(point => { const position = displayPoint(point, layout.transposed); return `${position.c + 1.5},${position.r + 1.5}`; }).join(" ")} />)}
          </svg>}
        </div>
        </div>{paused && <div className="gc-pause-card"><h2>星光正在等你</h2><button className="gc-button gc-primary" onClick={() => { clock.current = performance.now(); commit(resumeGame(current.current)); }}>继续玩 →</button></div>}
        {celebrating && <div className="gc-completion" role="status"><div className="gc-emblem"><Gem kind={3} /></div><h2>{game.level < 10 ? "这一关，点亮啦！" : "璀璨星河，点亮啦！"}</h2><p>通关用时 {preciseTime(game.elapsed)}</p>{game.level < 10 ? <p>星光带你去下一关 ✧</p> : <button className="gc-button gc-primary" onClick={() => chooseLevel(1)}>再游一次星河 →</button>}</div>}
      </div>
      <div className="gc-bottom-line"><p className="gc-feedback" role="status">{game.message}</p><button className="gc-button" onClick={() => recordsDialog.current?.showModal()}>星光榜</button><button className="gc-button" onClick={() => setShowTime(value => !value)}>{showTime ? "隐藏计时" : "显示计时"}</button></div>
    </section>
    {reward && <div className="gc-reward-toast" key={reward.eventId} role="status">第 {reward.level} 关奖励已到账 <strong>知识币 +{reward.amount}　能量币 +{reward.amount}</strong><span className="gc-energy-flight" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--gc-coin": i } as CSSProperties}>✦</i>)}</span></div>}
    {(historyState === "error" || pending.length > 0 || records.some(record => record.rewardStatus === "pending")) && <div className="gc-save-status" role="status"><span>{saving ? "正在保存通关和奖励……" : "记录或奖励还在途中，可以继续玩。"}</span><button className="gc-button" disabled={saving} onClick={() => pending.length ? void savePending() : void loadHistory()}>重试保存</button></div>}
    <dialog ref={recordsDialog} className="gc-records" aria-labelledby="gc-records-title"><div className="gc-record-heading"><h2 id="gc-records-title">本关星光榜</h2><form method="dialog"><button className="gc-button">关闭</button></form></div>
      {best && <p>最快 {preciseTime(best.durationMs)}</p>}
      <p className="gc-ranking-note">第 {game.level} 关 · {config.kinds} 种宝石 · 按用时从短到长</p>
      {historyState === "loading" && <p role="status">正在寻找星光记录……</p>}
      {historyState === "ready" && ranking.length === 0 && <p>这里等着你的第一颗通关星光。</p>}
      {ranking.length > 0 && <ol className="gc-rank-list">{ranking.slice(0, 10).map((record, index) => <li key={record.id}><span className="gc-rank-number">{index + 1}</span><div><strong>{preciseTime(record.durationMs)}</strong><small>{new Date(record.createdAt).toLocaleDateString("zh-CN")} · 提示 {record.hints} · 重排 {record.shuffles}</small></div></li>)}</ol>}
      <p className="gc-ranking-note">暂停、入场及无法操作的动画收尾不计时。连续配对期间正常计时。提示和重排不加罚时。旧版成绩保留，不参与新版排名。</p>
    </dialog>
  </main>;
}
