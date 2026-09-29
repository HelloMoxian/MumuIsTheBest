import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatExpression, isSolved, REWARD_TIERS, solutionSteps } from "../../../../server/src/twenty-four-engine";
import { GameTopBar } from "../../shared/GameTopBar";
import { LearningCoinBalancePill } from "../../shared/LearningCoinLayer";
import { LEARNING_COINS_AWARDED_EVENT, LEARNING_COINS_CHANGED_EVENT, type LearningCoinAward } from "../../shared/learning-coins";
import { requestTwentyFour, TwentyFourApiError, type Action, type TwentyFourCommand, type TwentyFourView } from "./api";
import { EquationWorkbench } from "./EquationWorkbench";
import "./twenty-four.css";

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="tf-dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2>{title}</h2>{children}<button onClick={onClose}>回到题目</button>
  </dialog>;
}
export function TwentyFourGame() {
  const [data, setData] = useState<TwentyFourView | null>(null);
  const latest = useRef<TwentyFourView | null>(null), working = useRef(false), alive = useRef(true);
  const pending = useRef<TwentyFourCommand | null>(null), seen = useRef(new Set<string>());
  const receivedAt = useRef(performance.now()), deferredPause = useRef(false);
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [stale, setStale] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showTime, setShowTime] = useState(true), [announcement, setAnnouncement] = useState("点数字格选数字，点符号选运算");
  const [panel, setPanel] = useState<"help" | "history" | "new" | "hint" | "solution" | null>(null);
  const [background, setBackground] = useState(document.hidden);
  const accept = useCallback((next: TwentyFourView) => {
    if (!alive.current) return;
    latest.current = next; receivedAt.current = performance.now();
    setData(next); setElapsed(next.game?.elapsedMs ?? 0); setError(""); setStale(false);
    if (next.settlement) {
      const receipt = next.settlement;
      window.dispatchEvent(new CustomEvent(LEARNING_COINS_CHANGED_EVENT, { detail: { coinBalance: receipt.balance, updatedAt: receipt.updatedAt } }));
      if (!seen.current.has(receipt.eventId)) {
        seen.current.add(receipt.eventId);
        const award: LearningCoinAward = { alreadyAwarded: false, baseRewardCoins: receipt.amount, multiplier: 1, criticalHit: false,
          rewardCoins: receipt.amount, source: "math:twenty-four", progress: { coinBalance: receipt.balance, updatedAt: receipt.updatedAt } };
        window.dispatchEvent(new CustomEvent(LEARNING_COINS_AWARDED_EVENT, { detail: award }));
      }
    }
  }, []);
  const load = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    try { const next = await requestTwentyFour(undefined, signal); if (!signal?.aborted) { accept(next); pending.current = null; } }
    catch (e) { if (!signal?.aborted && alive.current) setError(e instanceof Error ? e.message : "读取暂时没有完成，请重试。"); }
    finally { if (!signal?.aborted && alive.current) setBusy(false); }
  }, [accept]);
  const send = useCallback(async (action: Action, retry = false) => {
    if (working.current || !latest.current) return;
    if (pending.current && !retry) return;
    working.current = true; setBusy(true); setError("");
    const current = latest.current;
    const command: TwentyFourCommand = retry && pending.current ? pending.current
      : { ...action, revision: current.revision, gameId: current.game?.id ?? null, operationId: crypto.randomUUID() };
    pending.current = command;
    try {
      const next = await requestTwentyFour(command); accept(next); pending.current = null;
      if (alive.current) {

        if (next.game?.completedAt) setAnnouncement("算出 24 啦！");
        else setAnnouncement(command.type === "hint" ? "跟着三步参考解试一试" : "点数字格选数字，点符号选运算");
      }
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "暂时没有收到回复，请重试。");
        if (e instanceof TwentyFourApiError && e.status >= 400 && e.status < 500) {
          pending.current = null; setStale(e.status === 409);
        }
      }
    } finally { working.current = false; if (alive.current) setBusy(false); }
  }, [accept]);
  useEffect(() => {
    alive.current = true; const controller = new AbortController();
    void load(controller.signal);
    return () => { alive.current = false; controller.abort(); };
  }, [load]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const g = latest.current?.game;
      if (g) setElapsed(g.elapsedMs + (!g.paused && !g.completedAt ? performance.now() - receivedAt.current : 0));
    }, 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const hide = () => {
      setBackground(document.hidden);
      if (document.hidden) deferredPause.current = true;
      if (document.hidden && !working.current && !pending.current && latest.current?.game && !latest.current.game.paused && !latest.current.game.completedAt) {
        deferredPause.current = false; void send({ type: "pause" });
      }
    };
    const leaving = () => { deferredPause.current = true; if (!working.current && !pending.current && latest.current?.game && !latest.current.game.paused && !latest.current.game.completedAt) void send({ type: "pause" }); };
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", leaving);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", leaving); };
  }, [send]);
  useEffect(() => {
    if (deferredPause.current && !busy && !pending.current && !stale && data?.game && !data.game.paused && !data.game.completedAt) {
      deferredPause.current = false; void send({ type: "pause" });
    }
  }, [busy, data, send, stale]);
  const game = data?.game, paused = !!game?.paused || background;
  const locked = busy || !!pending.current || stale || paused || !!game?.completedAt;
  const completed = game?.board.find(node => isSolved(node, game.cards));
  return <div className="app-shell tf-page">
    <div className="star-field" aria-hidden="true" />
    <GameTopBar title="24点" backHref="/?tab=math" backLabel="数学"
      wallets={<LearningCoinBalancePill />}
      controls={<><button onClick={() => setPanel("help")}>玩法与奖励</button><button onClick={() => setPanel("history")}>记录{data ? ` · ${data.completedCount}` : ""}</button></>} />
    <main className="tf-main">
      <div className="tf-heading">
        <div className="tf-target"><span>一起算出</span><strong>24</strong><span>任选 <b>4</b> 张</span></div>
      <span className="tf-save" role="status">{busy ? "正在保存与核对…" : pending.current ? "这一步等待重试，数字不会丢" : stale ? "请恢复最新题目后继续" : game?.paused ? "已暂停 · 进度已保存" : "进度自动保存"}<span className="tf-sr-only">{announcement}</span></span>
        <div className="tf-time"><button aria-label={showTime ? "隐藏本题用时" : "显示本题用时"} onClick={() => setShowTime(value => !value)}>{showTime ? `用时 ${clock(elapsed)}` : "显示用时"}</button>
          {game && !game.completedAt && <button disabled={busy || !!pending.current || stale || background} onClick={() => void send({ type: game.paused ? "resume" : "pause" })}>{game.paused ? "继续" : "休息一下"}</button>}
        </div>
      </div>
      {error && <div className="tf-error" role="alert"><span>{error}</span>{(pending.current || !data || stale) && <button disabled={busy} onClick={() => pending.current && !stale ? void send(pending.current, true) : void load()}>{stale ? "恢复最新题目" : "重试"}</button>}</div>}
      {!data && <section className="tf-empty" role="status">{busy ? "正在准备数字…" : "进度还没有读取完成，点上方重试。"}</section>}
      {data && !game && <section className="tf-empty"><h2>8 个数字，选 4 个</h2><p>把数字放进四个格子，选好运算符和括号，算出 24。</p><button className="tf-primary" disabled={busy || !!pending.current} onClick={() => void send({ type: "new" })}>开始第一题</button></section>}
      {game && <section className="tf-workbench" aria-label="24点计算台">
        {paused ? <div className="tf-paused"><span aria-hidden="true">Ⅱ</span><h2>休息一下</h2><p>数字和算式都帮你留着</p><button className="tf-primary" disabled={busy || !!pending.current || stale || background} onClick={() => void send({ type: "resume" })}>继续这一题</button></div> : <>
          <EquationWorkbench key={game.id} cards={game.cards} editor={game.editor} locked={locked} completed={!!completed}
            canUndo={game.canUndoEditor} onEdit={editor => void send({ type: "edit", editor })}
            onSubmit={() => void send({ type: "submit" })} onUndo={() => void send({ type: "edit-undo" })}
            onReset={() => void send({ type: "edit-reset" })}
            tools={<><button disabled={locked} onClick={() => setPanel(game.assisted ? "solution" : "hint")}>看看解法</button><button disabled={locked} onClick={() => setPanel("new")}>换一题</button></>} />
          {completed && <div className="tf-success" role="status"><h2>四个数字，合作成功！</h2><p>本题用时 {clock(game.elapsedMs)} · {game.assisted ? "练习奖励" : "获得"} <strong>{data.reward?.amount} 枚知识币</strong></p>
            <p>{data.reward?.status === "granted" ? "✓ 奖励已到账" : "奖励已记下，等待补发"}</p>
            <div>{data.reward?.status === "pending" && <button disabled={busy} onClick={() => void load()}>重试领取</button>}<button className="tf-primary" disabled={busy || !!pending.current} onClick={() => void send({ type: "new" })}>下一题 →</button></div>
          </div>}
        </>}
      </section>}

      {!!data?.pendingRewards && !data.reward && <p>有 {data.pendingRewards} 题奖励等待补发。<button disabled={busy} onClick={() => void load()}>重试领取</button></p>}
    </main>
    {panel === "help" && <Modal title="这样玩 24 点" onClose={() => setPanel(null)}><ol><li>8 张数字里，任选 4 张，每张只能用一次。</li><li>候选数字一直在下方，点数字依次填入空格，也可先点格子指定位置；运算符也需要自己选。</li><li>每格下方可加左括号，再点右侧结束位置合上。点已有右括号可以去掉一对；只用单层括号，不套括号。</li><li>先算括号，再乘除，后加减。点“算好了”验证，分数和负数也能用。</li></ol><p>A = 1，J = 11，Q = 12，K = 13；0 也可以用。</p><div className="tf-rewards">{REWARD_TIERS.map(tier => <div key={tier.coins}><span>{tier.label}</span><strong>{tier.coins} 币</strong></div>)}</div><p>正计时可以隐藏；休息会遮住题目并停止计时。看过参考解，完成得 5 币。重置算式不重置时间。</p></Modal>}
    {panel === "solution" && <Modal title="单层括号参考解" onClose={() => setPanel(null)}>{game?.solution ? <><p className="tf-equation">{formatExpression(game.solution, game.cards)} = 24</p><ol>{solutionSteps(game.solution, game.cards).map((step, index) => <li key={index}>{step}</li>)}</ol><p>参考练习 · 完成得 5 币</p></> : <p>{error || "正在准备解法…"}</p>}</Modal>}
    {panel === "history" && <Modal title="我的 24 点记录" onClose={() => setPanel(null)}>{!data?.history.length ? <p>还没有完成的题目，来试一题吧。</p> : <ul className="tf-history">{data.history.map(item => <li key={item.id}><strong>{formatExpression(item.expression, item.cards)} = 24</strong><span>{clock(item.elapsedMs)} · {item.assisted ? "参考练习 · " : ""}{item.amount} 币 · {item.rewardStatus === "granted" ? "已到账" : "待补发"}</span></li>)}</ul>}</Modal>}
    {panel === "new" && <Modal title="换一题？" onClose={() => setPanel(null)}><p>这一题的算式会放下，新题重新计时。</p><button className="tf-primary" disabled={busy || !!pending.current || stale} onClick={() => { setPanel(null); void send({ type: "new" }); }}>换一题，重新出发</button></Modal>}
    {panel === "hint" && <Modal title="一起看看解法" onClose={() => setPanel(null)}><p>会展示完整算式和三个计算步骤。这题完成后获得 5 枚练习知识币。</p><button className="tf-primary" disabled={busy || !!pending.current || stale} onClick={() => { setPanel("solution"); void send({ type: "hint" }); }}>看解法，再试一试</button></Modal>}
  </div>;
}
