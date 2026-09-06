import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { LEVELS, THEMES, peers, range, type ThemeId, type CellAction } from "../../../../server/src/sudoku-engine";
import { requestSudoku, SudokuApiError, type SudokuCommand, type SudokuView } from "./api";
import { LearningCoinBalancePill, useLearningCoinStatus } from "../../shared/LearningCoinLayer";
import { EnergyCoinBalancePill } from "../../shared/EnergyCoinBalancePill";
import { LEARNING_COINS_AWARDED_EVENT, LEARNING_COINS_CHANGED_EVENT, type LearningCoinAward } from "../../shared/learning-coins";
import { useTts } from "../../shared/speech/use-tts";
import "./sudoku.css";

const gemNames = ["水滴晶", "菱形晶", "六角晶", "三角晶", "八角晶", "梯形晶", "星星晶", "风筝晶", "方形晶"];
const crewNames = ["阿蓝", "朵朵", "阳阳", "芽芽", "阿紫", "桃桃", "小灰", "月月", "星星"];
const elementNames = ["氢 H", "氦 He", "锂 Li", "铍 Be", "硼 B", "碳 C", "氮 N", "氧 O", "氟 F"];
export function symbolLabel(theme: ThemeId, value: number) {
  if (theme === "gems") return gemNames[value - 1];
  if (theme === "crew") return crewNames[value - 1];
  if (theme === "elements") return elementNames[value - 1];
  return theme === "letters" ? String.fromCharCode(64 + value) : String(value);
}
function Symbol({ theme, value }: { theme: ThemeId; value: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [theme, value]);
  return broken ? <span className="sd-symbol sd-fallback" aria-hidden="true">{symbolLabel(theme, value)}</span>
    : <img className="sd-symbol" src={`/images/sudoku/icons/${theme}/symbol-${String(value).padStart(2, "0")}.png`} alt="" aria-hidden="true" draggable={false} onError={() => setBroken(true)} />;
}
function Modal({ open, title, children, onClose, busy = false }: { open: boolean; title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open) dialog.current?.close(); }, [open]);
  return <dialog ref={dialog} className="sd-dialog" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2>{title}</h2>{children}<button className="sd-close-dialog" onClick={onClose} disabled={busy}>返回棋盘</button>
  </dialog>;
}
export function SudokuGame() {
  const [data, setData] = useState<SudokuView | null>(null), latest = useRef<SudokuView | null>(null);
  const [busy, setBusy] = useState(true), working = useRef(false);
  const pending = useRef<SudokuCommand | null>(null), announced = useRef(new Set<string>());
  const [error, setError] = useState(""), [stale, setStale] = useState(false);
  const [selected, setSelected] = useState<number | null>(null), [panel, setPanel] = useState(false);
  const [mode, setMode] = useState<"cross" | "set">("cross"), [hint, setHint] = useState<number[] | null>(null);
  const [setup, setSetup] = useState(false), [help, setHelp] = useState(false);
  const [draftLevel, setDraftLevel] = useState(0), [draftTheme, setDraftTheme] = useState<ThemeId>("gems");
  const [energyRevision, setEnergyRevision] = useState(0);
  const alive = useRef(true), buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const { refresh } = useLearningCoinStatus();
  const tts = useTts({ stopOnUnmount: true });
  const accept = useCallback((next: SudokuView) => {
    if (!alive.current) return;
    if (next.game?.id !== latest.current?.game?.id) { setSelected(null); setPanel(false); setHint(null); }
    if (!latest.current || next.settlement) { void refresh(); setEnergyRevision(value => value + 1); }
    latest.current = next; setData(next); setError(""); setStale(false);
    if (!next.game) setSetup(true);
    const reward = next.settlement;
    if (reward && !announced.current.has(reward.eventId)) {
      announced.current.add(reward.eventId);
      window.dispatchEvent(new CustomEvent(LEARNING_COINS_CHANGED_EVENT, { detail: { coinBalance: reward.knowledgeBalance, updatedAt: reward.updatedAt } }));
      const award: LearningCoinAward = { alreadyAwarded: false, baseRewardCoins: reward.amount, multiplier: 1, criticalHit: false,
        rewardCoins: reward.amount, source: "games:sudoku", progress: { coinBalance: reward.knowledgeBalance, updatedAt: reward.updatedAt } };
      window.dispatchEvent(new CustomEvent(LEARNING_COINS_AWARDED_EVENT, { detail: award }));
    }
  }, [refresh]);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void requestSudoku(undefined, controller.signal).then(next => { if (!controller.signal.aborted) accept(next); }).catch(() => {
      if (!controller.signal.aborted) setError("暂时无法读取数独进度，请重试。");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { alive.current = false; controller.abort(); };
  }, [accept]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (pending.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, []);
  async function reload(discardStale = false) {
    if (working.current) return;
    if (discardStale) { pending.current = null; setSelected(null); setPanel(false); }
    working.current = true; setBusy(true);
    try { accept(await requestSudoku()); }
    catch { setError("暂时无法读取数独进度，原进度已保留，请重试。"); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  async function execute(command: SudokuCommand) {
    if (working.current) return;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    working.current = true; pending.current = command; setBusy(true); setError(""); tts.stop();
    if (command.type !== "hint") setHint(null);
    try {
      const next = await requestSudoku(command);
      pending.current = null; accept(next);
      if (command.type === "hint") setHint(next.hintValues ?? []);
      if (command.type === "new") { setSetup(false); setMode("cross"); }
    } catch (failure) {
      if (failure instanceof SudokuApiError && failure.status === 409) setStale(true);
      else if (failure instanceof SudokuApiError && [400, 422].includes(failure.status)) pending.current = null;
      setError(failure instanceof SudokuApiError ? failure.message : "这一步还没有确认保存，请点击重试。");
    } finally {
      working.current = false;
      if (alive.current) {
        setBusy(false);
        // Disabling a focused button during saving can drop keyboard focus.
        if (command.type !== "new") requestAnimationFrame(() => {
          if (!alive.current || working.current || (document.activeElement !== document.body && document.activeElement !== focused)) return;
          const target = focused?.isConnected && !focused.matches(":disabled") ? focused : buttons.current[selected ?? -1];
          target?.focus({ preventScroll: true });
        });
      }
    }
  }
  const locked = busy || !!pending.current;
  function send(action: CellAction) {
    if (locked || !data?.game) return;
    void execute({ ...action, revision: data.revision, gameId: data.game.id, operationId: crypto.randomUUID() });
  }
  function chooseCell(index: number) {
    if (locked || !data?.game) return;
    setSelected(index); setPanel(true); setHint(null);
    const cell = data.game.cells[index];
    if (!data.game.completedAt && !data.game.given[index] && !cell.value && !cell.noted) send({ type: "note", index });
  }
  function openSetup() {
    setDraftLevel(data?.game?.level ?? 0); setDraftTheme(data?.game?.theme ?? "gems"); setSetup(true);
  }
  function keyboard(event: KeyboardEvent) {
    if (locked || selected === null || !data?.game || event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
    const n = LEVELS[data.game.level].n, row = Math.floor(selected / n), col = selected % n;
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -n, ArrowDown: n };
    if (event.key in offsets) {
      event.preventDefault();
      if ((event.key === "ArrowLeft" && col === 0) || (event.key === "ArrowRight" && col === n - 1)
        || (event.key === "ArrowUp" && row === 0) || (event.key === "ArrowDown" && row === n - 1)) return;
      const next = selected + offsets[event.key]; setSelected(next); setPanel(true); setHint(null); buttons.current[next]?.focus(); return;
    }
    if (event.key === "Escape") { event.preventDefault(); setPanel(false); buttons.current[selected]?.focus(); return; }
    if (!panel || data.game.given[selected] || data.game.completedAt) return;
    if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); send({ type: "clear", index: selected }); return; }
    const value = /^[1-9]$/.test(event.key) ? Number(event.key) : /^[a-i]$/i.test(event.key) ? event.key.toUpperCase().charCodeAt(0) - 64 : 0;
    if (value > 0 && value <= n) { event.preventDefault(); send({ type: mode, index: selected, value }); }
  }
  const game = data?.game, spec = game ? LEVELS[game.level] : LEVELS[draftLevel];
  const theme = THEMES.find(theme => theme.id === (game?.theme ?? draftTheme))!;
  const values = range(spec.n).map(i => i + 1), related = selected === null ? [] : peers(selected, spec);
  const cell = selected === null ? null : game?.cells[selected];
  const usable = game && selected !== null && !game.given[selected] && !game.completedAt;
  const readable = game?.story.rows.filter(row => row.complete).map(row => row.pieces.join("")).join("\n") ?? "";
  const errorContent = error && <div className="sd-error" role="alert"><p>{error}</p><button disabled={busy} onClick={() => stale ? void reload(true) : pending.current ? void execute(pending.current) : void reload()}>{stale ? "恢复最新棋盘" : "重试"}</button></div>;
  return <main className="sd-page">
    <header className="sd-topbar"><a href="/?tab=games" className="sd-button">← 游戏大厅</a><strong>星页数独</strong><div className="sd-wallets"><LearningCoinBalancePill /><EnergyCoinBalancePill key={energyRevision} /></div></header>
    <section className="sd-intro"><div><span className="sd-eyebrow">图案推理 · 故事探索</span><h1>把图案，拼成故事。</h1><p>填一格，发现线索。拼一行，读一段冒险。</p></div><div className="sd-actions"><button onClick={() => setHelp(true)}>怎么玩</button><button className="sd-primary" disabled={locked} onClick={openSetup}>新的故事</button></div></section>
    {!setup && errorContent}
    {!data && <section className="sd-card sd-loading" aria-live="polite">{busy ? "正在恢复你的数独棋盘……" : "请重试打开探索地图"}</section>}
    {data && !game && <section className="sd-card sd-loading"><h2>第一段冒险，从这里开始</h2><p>选择一个图案世界和探索难度。</p><button className="sd-primary" disabled={locked} onClick={openSetup}>选择新故事</button></section>}
    {data && game && <>
      {game.completedAt && <section className="sd-success" role="status"><h2>✓ 整本故事拼好啦！</h2><p>{data.reward?.status === "granted" ? `本局知识币 +${data.reward.amount}、能量币 +${data.reward.amount}，已存入全局钱包。` : "通关已保存，奖励正在途中，可以重试领取。"}</p><div className="sd-actions">{data.pendingRewards > 0 && <button disabled={locked} onClick={() => void reload()}>重试领奖</button>}<button className="sd-primary" disabled={locked} onClick={() => { setDraftLevel(Math.min(game.level + 1, 5)); setDraftTheme(game.theme); setSetup(true); }}>{game.level < 5 ? "挑战下一档" : "再拼一个故事"}</button></div></section>}
      {!game.completedAt && data.pendingRewards > 0 && <div className="sd-error" role="status">已有通关奖励等待补发。<button disabled={locked} onClick={() => void reload()}>重试领奖</button></div>}
      <div className="sd-workspace" onKeyDown={keyboard}>
        <section className="sd-card"><div className="sd-scene"><img src={`/images/sudoku/backgrounds/${game.theme}.png`} alt="" onError={event => { event.currentTarget.hidden = true; }} /><div><span className="sd-eyebrow">第 {game.level + 1} 档 · {spec.name}</span><h2>{theme.name}</h2><p>{theme.tag}</p></div></div>
          <div className="sd-board-inner"><div className="sd-section-head"><h3>{spec.n} × {spec.n} 探索地图</h3><span>{game.cells.filter(cell => cell.value).length} / {spec.n ** 2} 已填</span></div>
            <div className="sd-scroll"><div className={`sd-board sd-n${spec.n}`} style={{ "--sd-n": spec.n } as CSSProperties} role="group" aria-label="数独棋盘，每行每列每宫图案不重复">
              {game.cells.map((cell, index) => {
                const r = Math.floor(index / spec.n), c = index % spec.n;
                const left = values.filter(value => !cell.crossed.includes(value)), shown = left.slice(0, spec.n === 9 ? 3 : 4);
                const conflict = game.conflicts.includes(index), fixed = !!game.given[index];
                const name = cell.value ? symbolLabel(game.theme, cell.value) : cell.noted ? `候选 ${left.map(value => symbolLabel(game.theme, value)).join("、") || "全部排除"}` : "空格";
                return <button key={game.id + index} ref={element => { buttons.current[index] = element; }}
                  className={`sd-cell ${fixed ? "sd-given" : ""} ${selected === index ? "sd-selected" : ""} ${related.includes(index) ? "sd-related" : ""} ${conflict ? "sd-conflict" : ""} ${cell.noted && !cell.value ? "sd-noted" : ""} ${!cell.value && !cell.noted ? "sd-empty" : ""} ${c % spec.w === spec.w - 1 && c < spec.n - 1 ? "sd-block-right" : ""} ${r % spec.h === spec.h - 1 && r < spec.n - 1 ? "sd-block-bottom" : ""}`}
                  disabled={busy} aria-pressed={selected === index} aria-label={`${r + 1} 行 ${c + 1} 列，${name}，${fixed ? "题目固定" : cell.value ? "自己填写" : "可填写"}${conflict ? "，有重复，请检查" : ""}`} onClick={() => chooseCell(index)}>
                  {fixed && <span className="sd-given-dot" aria-hidden="true">●</span>}
                  {cell.value ? <Symbol theme={game.theme} value={cell.value} /> : cell.noted ? <><span className="sd-question" aria-hidden="true">?</span><span className="sd-notes" aria-hidden="true">{shown.map(value => <span key={value}><Symbol theme={game.theme} value={value} /></span>)}{left.length > shown.length && <b>…</b>}{!left.length && <small>请恢复</small>}</span></> : <span aria-hidden="true">＋</span>}
                  {conflict && <span className="sd-conflict-mark" aria-hidden="true">!</span>}
                </button>;
              })}
            </div></div><div className="sd-origins"><span><i className="sd-fixed-sample" aria-hidden="true">●</i>题目固定</span><span><i aria-hidden="true" />自己填写</span></div>
            <p className="sd-rule">每行、每列、每个 {spec.h} × {spec.w} 粗框，各种图案只出现一次。<br />金色亮框是固定线索，! 提醒你看看重复的格子。</p>
            <div className="sd-legend">{values.map(value => <span key={value}><Symbol theme={game.theme} value={value} />{symbolLabel(game.theme, value)}</span>)}</div>
          </div>
        </section>
        <aside className="sd-aside"><section className="sd-card sd-bench"><div className="sd-section-head"><div><h2>推理工作台</h2><p>{selected === null ? "从一个空格开始" : `第 ${Math.floor(selected / spec.n) + 1} 行 · 第 ${selected % spec.n + 1} 格`}</p></div>{panel && <button onClick={() => { setPanel(false); if (selected !== null) buttons.current[selected]?.focus(); }}>收起</button>}</div>
          {panel && usable && cell && selected !== null ? <><div className="sd-mode"><button disabled={locked} aria-pressed={mode === "cross"} onClick={() => setMode("cross")}>{mode === "cross" && "✓ "}排除候选</button><button disabled={locked} aria-pressed={mode === "set"} onClick={() => setMode("set")}>{mode === "set" && "✓ "}直接填写</button></div><p>{mode === "cross" ? "点一下打叉，再点一下恢复。" : "选一个图案，先填进格子里。"}</p>
            <div className="sd-candidates">{values.map(value => { const crossed = mode === "cross" && cell.crossed.includes(value); return <button key={value} className={crossed ? "sd-crossed" : ""} disabled={locked} aria-pressed={mode === "cross" ? crossed : undefined} aria-label={`${mode === "set" ? "填写" : crossed ? "恢复" : "排除"} ${symbolLabel(game.theme, value)}`} onClick={() => send({ type: mode, index: selected, value })}><Symbol theme={game.theme} value={value} /><span>{crossed ? "点我恢复" : symbolLabel(game.theme, value)}</span>{crossed && <b aria-hidden="true">×</b>}</button>; })}</div>
            <div className="sd-actions"><button disabled={locked} onClick={() => { setMode("cross"); send({ type: "note", index: selected }); }}>重新考虑</button><button disabled={locked} onClick={() => send({ type: "clear", index: selected })}>清空这格</button></div>
            <button className="sd-primary sd-wide" disabled={locked} onClick={() => { setPanel(false); buttons.current[selected]?.focus(); }}>{cell.value ? "保留填写，收起" : "保留问号，收起"}</button><button className="sd-wide" disabled={locked} onClick={() => send({ type: "hint", index: selected })}>看看行、列、粗框的提示</button>
            {hint !== null && <div className="sd-hint" role="status" aria-label={hint.length ? `可以考虑 ${hint.map(value => symbolLabel(game.theme, value)).join("、")}` : "没有可放的图案，检查周围填写"}><p>{hint.length ? "看看这些图案：" : "暂时放不下图案，再检查周围吧。"}</p><div>{hint.map(value => <Symbol key={value} theme={game.theme} value={value} />)}</div></div>}
          </> : <div className="sd-empty-bench"><span aria-hidden="true">{game.completedAt ? "✧" : "?"}</span><h3>{game.completedAt ? "你拼出了一个新故事" : panel && !usable ? "这是题目给你的线索" : "这里会留下你的思考"}</h3><p>{panel && !usable && !game.completedAt ? "金色亮框里的图案不用改，看看旁边的空格吧。" : "点开格子，把不可能的图案一个个排除。"}</p>{!panel && usable && <button onClick={() => setPanel(true)}>继续想这一格</button>}</div>}
          <button className="sd-wide" disabled={locked || !game.canUndo || !!game.completedAt} onClick={() => send({ type: "undo" })}>↶ 撤销上一步</button>
        </section><section className="sd-card sd-reward"><h3>这一局的星光奖励</h3><p><strong>+{spec.reward}</strong> 知识币 <strong>+{spec.reward}</strong> 能量币</p><span>完整拼好后获得 · 不限时 · 不扣币</span><progress value={game.story.rows.filter(row => row.complete).length} max={spec.n} aria-label="故事完成进度" /></section></aside>
      </div>
      <section className="sd-card sd-story"><div className="sd-section-head"><div><span className="sd-eyebrow">正在编织的冒险</span><h2>{game.story.title}</h2><p>{game.story.teaser}</p></div><div className="sd-actions"><button disabled={!readable} onClick={() => void tts.speak({ text: readable, lang: "zh-CN", preferLocalVoice: true })}>朗读已拼好的故事</button>{tts.status === "speaking" && <button onClick={tts.pause}>暂停朗读</button>}{tts.status === "paused" && <button onClick={tts.resume}>继续朗读</button>}{["speaking", "paused", "loading"].includes(tts.status) && <button onClick={tts.stop}>停止朗读</button>}</div></div>
        {tts.error && <p className="sd-speech-note" role="status">{tts.error.message} 仍然可以看故事和继续玩。</p>}
        {game.story.rows.map((row, index) => <div key={index} className={`sd-story-row ${row.complete ? "sd-done" : ""} ${selected !== null && Math.floor(selected / spec.n) === index ? "sd-active" : ""}`}><span className="sd-row-mark">{row.complete ? "✓" : index + 1}</span><div><div className="sd-fragments">{row.pieces.map((piece, i) => <span key={i} className={piece === null ? "sd-missing" : ""}>{piece ?? "···"}</span>)}</div><p>第 {index + 1} 行 · {row.complete ? "故事已拼好" : "填入图案，让故事连起来"}</p></div></div>)}
      </section><footer className="sd-footer"><span role="status">{busy ? "正在保存……" : pending.current ? "这一步尚未确认，请重试" : data.message || "✓ 已自动保存在本机"}</span><span>已完成 {data.completedCount} 个故事</span></footer>
    </>}
    <Modal open={setup} title="下一页，去哪里冒险？" busy={busy} onClose={() => setSetup(false)}><p>六档难度都可以自由选择，每局都有新地图和新故事。</p><h3>选择探索难度</h3><div className="sd-level-options">{LEVELS.map((level, index) => <button key={index} disabled={locked} aria-pressed={draftLevel === index} onClick={() => setDraftLevel(index)}><strong>{draftLevel === index ? "✓" : index + 1} {level.name}</strong><span>{level.n} × {level.n} · {level.clues} 个已知格</span><span>两种币各 +{level.reward}</span></button>)}</div><h3>选择故事世界</h3><div className="sd-theme-options">{THEMES.map(theme => <button key={theme.id} disabled={locked} aria-pressed={draftTheme === theme.id} onClick={() => setDraftTheme(theme.id as ThemeId)}><Symbol theme={theme.id as ThemeId} value={1} />{draftTheme === theme.id && "✓ "}{theme.name}</button>)}</div>
      {game && !game.completedAt && <p className="sd-warning">开始后会替换当前未完成的棋盘，已获得的奖励会保留。</p>}{setup && errorContent}<button className="sd-primary" disabled={locked || !data} onClick={() => data && void execute({ type: "new", level: draftLevel, theme: draftTheme, revision: data.revision, operationId: crypto.randomUUID() })}>{game && !game.completedAt ? "放下本局，开始新故事" : "开始新故事"}</button>
    </Modal>
    <Modal open={help} title="一起拼一页故事" onClose={() => setHelp(false)}><p>每行、每列、每个粗框里，每种图案只能出现一次。金色亮框和圆点是题目固定的线索。</p><ol><li>点一个空格，在工作台里看全部图案。</li><li>点“不可能”的图案打叉，再点可以恢复。</li><li>收起后留下问号和剩余候选小图片。只剩一种时自动填上。</li><li>也可以直接填写，再用撤销或重新考虑修改。</li><li>每拼好一行，故事就连成一句话；全盘完成后，两种币各奖励 {spec.reward} 枚。</li></ol><p>方向键移动，1—9 或 A—I 按图案顺序操作，Escape 收起，Backspace 清空。没有倒计时。</p></Modal>
  </main>;
}
