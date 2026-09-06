import { useCallback, useEffect, useRef, useState } from "react";
import { MOVES, DEFAULT_MOVES, DEFAULT_SETTINGS, validSettings, earnedRewards, type WorkoutSettings, validPlan, validPool, moveById, stageAt, advanceWorkout, WORKOUT_MS, type MoveId, type Stage } from "../../../../server/src/workout-contract";
import { EnergyCoinBalancePill } from "../../shared/EnergyCoinBalancePill";
import { Coach3D as Coach } from "./Coach3D";
import { WorkoutAudio } from "./audio";
import "./workout.css";

async function request(url: string, method: string, body?: unknown) {
  const response = await fetch("/api/games/workout/" + url, {
    method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data?.message === "string" ? data.message : "暂时没有连接好，请重试。");
  return data;
}
type Session = { id: string; plan: Stage[]; elapsedMs: number; enabledMoves: MoveId[]; settings: WorkoutSettings };
function readSession(data: unknown): { session: Session; enabledMoves: MoveId[]; settings: WorkoutSettings } {
  const value = data as { session?: Session; enabledMoves?: unknown; settings?: unknown };
  const s = value?.session;
  if (!validPool(value?.enabledMoves) || !validSettings(value?.settings) || !s || typeof s.id !== "string" || !Number.isInteger(s.elapsedMs)
    || s.elapsedMs < 0 || s.elapsedMs > WORKOUT_MS || !validPlan(s.plan) || !validPool(s.enabledMoves) || !validSettings(s.settings))
    throw new Error("课程数据暂时不完整，请重试。");
  return { session: s, enabledMoves: value.enabledMoves, settings:value.settings };
}
const timeText = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
};
function Camera() {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), generation = useRef(0);
  const [status, setStatus] = useState("正在打开摄像头…"), [active, setActive] = useState(false);
  const [pending, setPending] = useState(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = useCallback(() => {
    clearTimeout(timer.current); setPending(false);
    generation.current++; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
  }, []);
  const start = useCallback(async () => {
    stop(); const token = generation.current; setStatus("正在打开摄像头…");
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("这里没有可用的摄像头，跟着小人一样可以玩"); return; }
    setPending(true);
    timer.current = setTimeout(() => { if (token === generation.current) setStatus("等待摄像头授权，可以先跟着小人运动"); }, 10_000);
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } }, audio: false });
      if (token !== generation.current) { next.getTracks().forEach(track => track.stop()); return; }
      stream.current = next;
      for (const track of next.getVideoTracks()) {
        track.enabled = !document.hidden;
        track.onended = () => { if (token === generation.current) { stop(); setStatus("摄像头断开了，可以重新连接"); } };
      }
      if (video.current) {
        video.current.srcObject = next;
        await video.current.play();
      }
      if (token === generation.current) { clearTimeout(timer.current); setPending(false); setActive(true); setStatus("镜子里的你"); }
    } catch {
      if (token === generation.current) { stop(); setStatus("摄像头没有打开，运动可以继续"); }
    }
  }, [stop]);
  useEffect(() => {
    void start();
    const hide = () => { stream.current?.getTracks().forEach(t => { t.enabled = !document.hidden; }); };
    const leave = () => stop();
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", leave);
    return () => { stop(); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", leave); };
  }, [start, stop]);
  return <section className="workout-camera" aria-label="本地摄像头预览">
    <video ref={video} autoPlay muted playsInline className={active ? "" : "is-unavailable"} />
    {!active && <div className="workout-camera-empty"><span aria-hidden="true">◎</span><p>{status}</p></div>}
    <div className="workout-camera-caption"><span>{active ? "镜子里的你 · 只在本机显示" : "不录制 · 不上传"}</span>
      <button onClick={() => { if (active || pending) { stop(); setStatus("摄像头已关闭"); } else void start(); }}>{active ? "关闭摄像头" : pending ? "暂不开启" : "重试摄像头"}</button>
    </div>
  </section>;
}
export function WorkoutGame() {
  const [session, setSession] = useState<Session | null>(null), sessionRef = useRef<Session | null>(null);
  const [elapsed, setElapsed] = useState(0), elapsedRef = useRef(0);
  const [paused, setPaused] = useState(false), pausedRef = useRef(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [pool, setPool] = useState<MoveId[]>([...DEFAULT_MOVES]), [draft, setDraft] = useState<MoveId[]>([...DEFAULT_MOVES]);
  const [saveState, setSaveState] = useState(""), [configBusy, setConfigBusy] = useState(false);
  const [dirtyPool, setDirtyPool] = useState(false), [reward, setReward] = useState(false);
  const [settings, setSettings] = useState<WorkoutSettings>({...DEFAULT_SETTINGS});
  const [draftSettings, setDraftSettings] = useState<WorkoutSettings>({...DEFAULT_SETTINGS});
  const [earned, setEarned] = useState(0), credited = useRef(0);
  const [celebration, setCelebration] = useState<{amount:number;round:number}|null>(null);
  const audio = useRef<WorkoutAudio|null>(null);
  const [spoken, setSpoken] = useState(false), [speechError, setSpeechError] = useState(false);
  const [activePool, setActivePool] = useState<MoveId[]>([...DEFAULT_MOVES]);
  const [syncError, setSyncError] = useState(false), [syncBusy, setSyncBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null), chooseButton = useRef<HTMLButtonElement>(null);
  const wasPaused = useRef(false), alive = useRef(true), bootToken = useRef(0), id = useRef(crypto.randomUUID());
  const pendingSync = useRef<Promise<boolean>|null>(null);
  const syncing = useRef(false), lastSync = useRef(0), nextAttempt = useRef(0), rewarded = useRef(false);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const setPause = (value: boolean) => { pausedRef.current = value; setPaused(value); };
  const boot = useCallback(async (fresh = false) => {
    const token = ++bootToken.current;
    if (fresh) id.current = crypto.randomUUID();
    setLoading(true); setError(""); pausedRef.current = true; setPaused(true);
    try {
      const data = readSession(await request("sessions", "POST", { id: id.current }));
      if (!alive.current || token !== bootToken.current) return;
      sessionRef.current = data.session; elapsedRef.current = data.session.elapsedMs;
      setSession(data.session); setElapsed(data.session.elapsedMs); setPool(data.enabledMoves); setDraft(data.enabledMoves);
      setActivePool(data.session.enabledMoves); setSettings(data.settings); setDraftSettings(data.settings);
      credited.current = earnedRewards(data.session.plan,data.session.elapsedMs).reduce((n,a)=>n+a.amount,0); setEarned(credited.current); setCelebration(null);
      lastSync.current = data.session.elapsedMs; nextAttempt.current = 0; rewarded.current = false;
      setReward(false); setSyncError(false); setDirtyPool(false);
      pausedRef.current = document.hidden; setPaused(document.hidden);
    } catch (e) {
      if (alive.current && token === bootToken.current) setError(e instanceof Error ? e.message : "课程没有连接好，请重试。");
    } finally { if (alive.current && token === bootToken.current) setLoading(false); }
  }, []);
  const sync = useCallback((): Promise<boolean> => {
    if (pendingSync.current) return pendingSync.current;
    const current = sessionRef.current;
    if (!current || rewarded.current) return Promise.resolve(true);
    const duration = Math.floor(elapsedRef.current);
    syncing.current = true; if (alive.current) setSyncBusy(true);
    const operation = (async () => {
      try {
        const data = await request("sessions/" + current.id, "PUT", { elapsedMs: duration });
        const expected = earnedRewards(current.plan, data.elapsedMs).reduce((n,a)=>n+a.amount,0);
        if (!Number.isInteger(data.elapsedMs) || data.elapsedMs < duration || data.elapsedMs > WORKOUT_MS
          || data.reward !== expected || (data.reward > 0 && (!Number.isInteger(data.balance) || data.balance < 0)))
          throw new Error("INVALID_SETTLEMENT");
        if (!alive.current || sessionRef.current?.id !== current.id) return false;
        lastSync.current = duration; setSyncError(false);
        if (data.reward > credited.current) {
          const amount = data.reward - credited.current;
          const round = earnedRewards(current.plan,data.elapsedMs).at(-1)!.round;
          credited.current = data.reward; setEarned(data.reward);
          setCelebration({amount,round}); setRevision(r=>r+1); audio.current?.reward(round);
        }
        if (duration === WORKOUT_MS) { rewarded.current = true; setReward(true); }
        return true;
      } catch { if (alive.current && sessionRef.current?.id === current.id) setSyncError(true); return false; }
      finally { syncing.current=false; pendingSync.current=null; nextAttempt.current=performance.now()+5000; if(alive.current)setSyncBusy(false);
        if(lastSync.current===duration && earnedRewards(current.plan,elapsedRef.current).reduce((n,a)=>n+a.amount,0)>credited.current)nextAttempt.current=0;
      }
    })();
    pendingSync.current=operation; return operation;
  }, []);
  const restart = async () => {
    setPause(true);
    if (pendingSync.current) await pendingSync.current;
    if (!await sync()) return;
    await boot(true);
  };
  useEffect(() => {
    const output=new WorkoutAudio(()=>setSpeechError(true)); audio.current=output;
    return ()=>{output.dispose();audio.current=null;};
  }, []);
  useEffect(() => {
    if (!celebration) return;
    const timer=setTimeout(()=>setCelebration(null),4200); return ()=>clearTimeout(timer);
  }, [celebration]);
  useEffect(() => {
    alive.current = true; void boot();
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReduced(media.matches);
    media.addEventListener("change", changed);
    return () => { alive.current = false; bootToken.current++; media.removeEventListener("change", changed); };
  }, [boot]);
  useEffect(() => {
    let previous = performance.now(), frame = 0, lastPaint = 0;
    const tick = (now: number) => {
      const delta = now - previous; previous = now;
      if (delta > 1000 && sessionRef.current && !pausedRef.current) setPause(true);
      elapsedRef.current = advanceWorkout(elapsedRef.current, delta, !!sessionRef.current && !pausedRef.current && !document.hidden);
      if (now - lastPaint > 32) { setElapsed(elapsedRef.current); lastPaint = now; }
      const plan=sessionRef.current?.plan;
      const due=plan ? earnedRewards(plan,elapsedRef.current).reduce((n,a)=>n+a.amount,0) : 0;
      if ((elapsedRef.current-lastSync.current>=5000 || due>credited.current || (elapsedRef.current>=WORKOUT_MS&&!rewarded.current)) && now>=nextAttempt.current) void sync();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const hidden = () => { if (document.hidden) { audio.current?.pause(true); setPause(true); void sync(); } };
    document.addEventListener("visibilitychange", hidden);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", hidden); };
  }, [sync]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const current=sessionRef.current;
      if (current && (earnedRewards(current.plan,elapsedRef.current).reduce((n,a)=>n+a.amount,0)>credited.current
        || (elapsedRef.current>=WORKOUT_MS&&!rewarded.current))) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  // Final few seconds must settle even if the last periodic checkpoint was recent.
  useEffect(() => { if (elapsed >= WORKOUT_MS && !rewarded.current) void sync(); }, [elapsed, sync]);
  const completedGroups = session ? earnedRewards(session.plan,elapsed).length : 0;
  useEffect(()=>{if(completedGroups>0)void sync();},[completedGroups,sync]);
  const openConfig = () => {
    wasPaused.current = pausedRef.current; setPause(true); setDraft([...pool]); setDraftSettings({...settings}); setSaveState("");
    dialog.current?.showModal();
  };
  const closeConfig = () => {
    dialog.current?.close(); setPause(wasPaused.current || document.hidden); chooseButton.current?.focus();
  };
  const saveConfig = async () => {
    if (!validPool(draft) || configBusy) return;
    setConfigBusy(true); setSaveState("正在保存…");
    try {
      const result = await request("preferences", "PUT", { enabledMoves: draft, settings: draftSettings });
      if (!validPool(result.enabledMoves) || !validSettings(result.settings)) throw new Error();
      setPool(result.enabledMoves); setSettings(result.settings); setDirtyPool(true); setSaveState("已永久保存 · 关闭后点“刷新重开”应用");
    } catch { setSaveState("没有保存成功，勾选仍在这里，请重试"); }
    finally { setConfigBusy(false); }
  };
  const current = session ? stageAt(session.plan, elapsed) : null;
  const stage = current?.stage, move = stage ? moveById(stage.move) : null;
  const complete = elapsed >= WORKOUT_MS;
  const resting = stage?.kind === "rest";
  const preparationStill = !!stage && (stage.kind === "warmup" || stage.kind === "cooldown") && !activePool.includes(stage.move);
  const title = complete ? "五分钟，完成啦！" : preparationStill ? "站稳，慢慢呼吸" : stage?.kind === "warmup" ? "先轻轻踏步，热热身"
    : stage?.kind === "cooldown" ? "慢慢伸展，放松一下" : resting ? "休息一下，呼吸慢一点" : move?.name ?? "正在准备运动";
  const period = (stage?.cycleMs ?? 1000) / 1000;
  const phase = (current?.localMs ?? 0) / (period * 1000);
  const visualPhase = stage?.move === "room-run" ? (current?.localMs ?? 0) / 350 : phase;
  const showPhase = reduced ? Math.floor(visualPhase * 2) / 2 : visualPhase;
  const next = session && current ? session.plan.slice(current.index + 1).find(s => s.kind === "move" || s.kind === "cooldown") : null;
  const preparation = next?.kind === "move" && moveById(next.move).advanced
    ? "接下来"+moveById(next.move).name+"，到地垫上准备。"+(next.move==="pushup"?"可以用跪姿。":"") : "";
  const cue = preparationStill ? preparation || "肩膀放轻松，按照自己的节奏呼吸"
    : resting ? (stage?.move==="room-run" ? "慢慢回到屏幕前，还没回来就点暂停。" : preparation || "松松手，深呼吸；想多歇一会儿就点暂停")
    : stage?.kind==="warmup" && preparation ? preparation : move?.cue;
  const count = stage?.kind==="move" && stage.move!=="room-run" ? Math.min(stage.reps,Math.floor(phase)+1) : 0;
  const groups = session?.plan.filter(s=>s.kind==="move") ?? [];
  useEffect(() => {
    audio.current?.pause(paused || loading || complete);
    audio.current?.tick(session?.id+":"+current?.index,title+"。"+(cue??""),count,stage?.cycleMs??1000);
  }, [paused, loading, complete, session?.id, current?.index, title, cue, count, stage?.cycleMs, spoken]);
  return <main className="workout-page" data-skip-startup-greeting>
    <header className="workout-top">
      <a href="/#games-title" onClick={event=>{
        if(session && !loading){event.preventDefault();setPause(true);void (async()=>{
          if(pendingSync.current)await pendingSync.current;
          if(await sync())location.href="/#games-title";
        })();}
      }}>‹ 游戏大厅</a><span className="workout-brand">跳操 <small>星际活力站</small></span>
      <EnergyCoinBalancePill key={revision} />
      <div className="workout-actions">
        <button disabled={loading || !session || complete} onClick={() => setPause(!paused)}>{paused ? "继续运动" : "暂停休息"}</button>
        <button ref={chooseButton} disabled={loading || !session} onClick={openConfig}>选择动作</button>
        <button disabled={loading || syncBusy || (complete && !reward)} onClick={() => void restart()}>刷新重开</button>
      </div>
    </header>
    <div className="workout-progress">
      <div><span>五分钟活力旅行</span><strong>{timeText(Math.min(elapsed, WORKOUT_MS))} / 5:00</strong><span>已得 <b>{earned}</b> / 200 能量币</span></div>
      <progress value={elapsed} max={WORKOUT_MS} aria-label="整节运动进度" />
    </div>
    {dirtyPool && <p className="workout-notice">动作选择已保存。点“刷新重开”，开始新的随机课程。</p>}
    {loading || error ? <section className="workout-message" role="status"><h1>{error || "小教练准备中…"}</h1>
      {!loading && <button onClick={() => void boot()}>重新连接课程</button>}</section> :
      <section className={"workout-stage " + (resting ? "is-resting" : "") + (complete ? "is-complete" : "")}>
        <div className="workout-stage-heading">
          <span className="workout-chip">{complete ? "✦ 活力收集成功" : stage?.kind === "warmup" ? "热身 · 15 秒" : stage?.kind === "cooldown" ? "放松伸展" : `第 ${stage?.round} / ${groups.length} 组 · ${resting ? "充充电" : ["", "轻松", "适中", "较费力"][move?.intensity ?? 1]}`}</span>
          <h1>{title}</h1>
          <p>{complete ? "喝一小口水，给自己一个拥抱！" : cue}</p>
        </div>
        <div className="workout-demonstrations">
          <div className="workout-view"><span>正面 · 跟我一起</span><Coach move={complete || resting || preparationStill ? "rest" : stage?.move ?? "rest"} phase={showPhase} /></div>
          <div className="workout-center-stat">
            {complete ? <><strong>✦</strong><span>{reward ? "已收集 "+earned+" 能量币" : "记录正在保存…"}</span></>
              : <><strong>{resting ? Math.ceil((stage!.durationMs - current!.localMs) / 1000)
                : stage?.kind === "move" && stage.move !== "room-run" ? count : Math.ceil((stage!.durationMs - current!.localMs) / 1000)}</strong>
                <span>{resting ? "秒后继续" : stage?.kind === "move" && stage.move !== "room-run" ? "/" + stage.reps + " 次" : "秒"}</span></>}
            <div className="workout-rounds" aria-label={`已完成 ${completedGroups} 个动作小节`}>
              {groups.map(group => group.round).map(n => <span key={n} className={complete || (stage?.round ?? 0) > n || (resting && stage?.round === n) ? "is-done" : ""}>{n}</span>)}
            </div>
          </div>
          <div className="workout-view"><span>侧面 · 看清姿势</span><Coach profile move={complete || resting || preparationStill ? "rest" : stage?.move ?? "rest"} phase={showPhase} /></div>
        </div>
        {paused && !complete && <div className="workout-pause"><h2>歇一歇，随时继续</h2><button onClick={() => setPause(false)}>继续运动</button></div>}
        {celebration && <div className="workout-award" role="status" key={celebration.round}>✦ +{celebration.amount} 能量币 <small>这一组，完成啦！</small></div>}
        {stage?.kind==="move" && <div className="workout-group-reward">本组 +{stage.reward} 能量币</div>}
        <div className="workout-next" aria-live="polite">{complete ? reward ? "✓ 200 能量币已到账" : "完成记录会自动重试保存" : next ? `接下来：${next.kind === "cooldown" ? "放松伸展" : moveById(next.move).name}` : "马上完成这次活力旅行"}</div>
      </section>}
    <div className="workout-bottom"><Camera /><aside className="workout-companion">
      <span className="workout-chip">属于你的节奏</span><h2>{complete ? "你坚持到了最后！" : resting ? "小身体，充充电" : "小动作，大活力"}</h2>
      <p>找一块空地，离桌角远一点。跟不上时可以慢一点，不舒服就停下来。</p>
      <p className="workout-muted">次数是小教练的示范节拍，不检测或评判你的动作。</p>
      <button aria-pressed={spoken} onClick={() => { audio.current?.enable(!spoken); setSpoken(!spoken); setSpeechError(false); }}>{spoken ? "口令·音效：开" : "开启口令·音效"}</button>
      {speechError && spoken && <p role="status">这台设备暂时不能朗读，跟着画面也可以。</p>}
      {syncError && <div role="status"><p>记录暂时没存好，正在重试。</p><button disabled={syncBusy} onClick={() => void sync()}>{syncBusy ? "保存中…" : "重试保存"}</button></div>}
      {complete && reward && <button className="workout-primary" onClick={() => void restart()}>再来五分钟</button>}
    </aside></div>
    <dialog ref={dialog} className="workout-dialog" aria-labelledby="workout-options-title" onCancel={e => { e.preventDefault(); if (!configBusy) closeConfig(); }}>
      <header><div><h2 id="workout-options-title">动作和节奏</h2><p>勾选孩子能做的动作，保存后刷新重开。</p></div><button disabled={configBusy} onClick={closeConfig}>关闭</button></header>
      <p className="workout-muted">热身与放松时段固定保留；取消踏步或伸展后，对应时段改为站立呼吸。强度为课程编排估算。</p>
      <div className="workout-settings">
        <label>每组休息<select disabled={configBusy} value={draftSettings.restSeconds} onChange={e=>{setSaveState("");setDraftSettings(v=>({...v,restSeconds:Number(e.target.value)}));}}>
          {[5,10,15,20,25,30].map(n=><option key={n} value={n}>{n} 秒{n===10?" · 推荐":""}</option>)}</select></label>
        <label>俯卧撑后休息<select disabled={configBusy} value={draftSettings.pushupRestSeconds} onChange={e=>{setSaveState("");setDraftSettings(v=>({...v,pushupRestSeconds:Number(e.target.value)}));}}>
          {[20,30,40,50,60].map(n=><option key={n} value={n}>{n} 秒{n===30?" · 推荐":""}</option>)}</select></label>
        <label>动作节奏<select disabled={configBusy} value={draftSettings.pace} onChange={e=>{setSaveState("");setDraftSettings(v=>({...v,pace:Number(e.target.value)}));}}>
          <option value={.8}>慢一点</option><option value={1}>自然节奏</option><option value={1.2}>活力节奏</option></select></label>
      </div>
      <p className="workout-muted">地面动作请由大人确认孩子能完成，再加入动作池；俯卧撑每组 10 个，可跪姿。跑到姥姥屋固定 10 秒，请先留出畅通路线。</p>
      <div className="workout-pool">{MOVES.map(m => <label key={m.id} className={draft.includes(m.id) ? "is-selected" : ""}>
        <input type="checkbox" checked={draft.includes(m.id)} disabled={configBusy} onChange={e => {
          setDraft(old => e.target.checked ? [...old, m.id] : old.filter(id => id !== m.id)); setSaveState("");
        }} /><span><strong>{m.name}</strong><small>{["", "轻松", "适中", "较费力"][m.intensity]} · {m.id==="room-run" ? "10 秒一趟" : m.reps+" 次一组"}{m.advanced ? " · 需大人确认" : ""}{m.jump ? " · 需要跳跃" : ""}</small></span>
      </label>)}</div>
      <footer><p role="status">{draft.length ? saveState || `已选 ${draft.length} 个动作` : "请至少保留一个动作"}</p>
        <button className="workout-primary" disabled={!draft.length || configBusy} onClick={() => void saveConfig()}>{configBusy ? "保存中…" : "保存设置"}</button></footer>
    </dialog>
  </main>;
}
