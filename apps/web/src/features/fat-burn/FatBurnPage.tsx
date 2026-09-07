import { useCallback, useEffect, useRef, useState } from "react";
import { useGameFullscreen } from "../../shared/useGameFullscreen";
import { MomCoach } from "./MomCoach";
import { CameraMirror } from "./CameraMirror";
import { FatBurnAudio } from "./audio";
import { DEFAULT_COURSE, getCourse, advanceElapsed, empowermentAt, moveCue, moveLabel, segmentAt, skipCourseAhead, type PhaseId } from "./plan";
import { CourseLibrary, CoursePlan, WeeklyProgram } from "./CoursePanels";
import { cooldownDestination, PROGRAM_SCOPE } from "./program";
import { momDemonstrationView, momDemonstrationViewNote } from "./sprite-rig";
import "./fat-burn.css";

const timeText = (ms: number) => {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};

export function FatBurnPage() {
  const [courseId, setCourseId] = useState(DEFAULT_COURSE.id);
  const course = getCourse(courseId), courseRef = useRef(course);
  courseRef.current = course;
  const [draftCourseId, setDraftCourseId] = useState(courseId);
  const root = useRef<HTMLDivElement>(null);
  const fullscreen = useGameFullscreen(root);
  const [elapsed, setElapsed] = useState(0), elapsedRef = useRef(0);
  const [activeMs, setActiveMs] = useState(0), activeRef = useRef(0);
  const [running, setRunning] = useState(false), runningRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const lowImpact = false; // Presets carry their own mandatory low-impact motion and cues.
  const [profile, setProfile] = useState(false);
  const [music, setMusic] = useState(false), [voice, setVoice] = useState(false);
  const [volume, setVolume] = useState(0.34), [audioError, setAudioError] = useState("");
  const audio = useRef<FatBurnAudio | null>(null);
  const [showTime, setShowTime] = useState(true);
  const [earlyCooldown, setEarlyCooldown] = useState(false);
  const [skippedMs, setSkippedMs] = useState<Record<PhaseId, number>>({ warmup: 0, workout: 0, cooldown: 0 });
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const lastTick = useRef(performance.now());
  const dialog = useRef<HTMLDialogElement>(null);
  const [dialogMode, setDialogMode] = useState<"plan" | "restart" | "courses" | "week">("plan");
  const returnFocus = useRef<HTMLElement | null>(null), resumeAfterDialog = useRef(false);
  const complete = elapsed >= courseRef.current.totalMs;
  const current = segmentAt(elapsed, course);
  const { segment, withinMs, remainingMs, next } = current;
  const phase = course.phases.find(item => item.id === segment.phase)!;
  const cooldownStart = course.phases.find(item => item.id === "cooldown")!.startMs;
  const encouragement = complete ? "你为自己腾出的每一分钟，都值得被珍惜。谢谢今天愿意动起来的你。" : empowermentAt(segment, withinMs);
  const motionPhase = reduced ? Math.floor(withinMs / segment.beatMs * 2) / 2 : withinMs / segment.beatMs;
  const activeMove = !started || complete ? "breathe" : segment.previewPose ?? segment.move;
  const actualProfile = momDemonstrationView(activeMove, profile);
  const viewNote = momDemonstrationViewNote(activeMove);
  const actionTitle = moveLabel(segment, lowImpact).split(" · ")[0];
  const actionCue = moveCue(segment, lowImpact).replace(segment.prescription ?? "", "").trim();
  const hasSkipped = course.phases.some(item => skippedMs[item.id] > 0);
  const nextLabel = !started ? "开始后可切换小节" : next ? moveLabel(next, lowImpact) : "已是最后一小节";
  const nextButtonLabel = next && started ? `下一小节：${nextLabel}` : nextLabel;

  const changeRunning = useCallback((value: boolean, reason = "") => {
    lastTick.current = performance.now();
    runningRef.current = value && !document.hidden && elapsedRef.current < courseRef.current.totalMs;
    setRunning(runningRef.current); setPauseReason(reason);
    audio.current?.setRunning(runningRef.current);
  }, []);

  useEffect(() => {
    const output = new FatBurnAudio(setAudioError);
    output.setVolume(0.34); audio.current = output;
    return () => { output.dispose(); audio.current = null; };
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    let frame = 0, painted = 0;
    const tick = (now: number) => {
      const delta = now - lastTick.current; lastTick.current = now;
      if (runningRef.current && delta > 1000) changeRunning(false, "刚刚离开了一会儿，进度已为你暂停。");
      const previous = elapsedRef.current;
      elapsedRef.current = advanceElapsed(previous, delta, runningRef.current && !document.hidden, courseRef.current);
      activeRef.current += elapsedRef.current - previous;
      if (runningRef.current && elapsedRef.current >= courseRef.current.totalMs) changeRunning(false);
      if (now - painted >= 33 || elapsedRef.current >= courseRef.current.totalMs) {
        setElapsed(elapsedRef.current); setActiveMs(activeRef.current); painted = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const hide = () => { if (document.hidden) { resumeAfterDialog.current = false; changeRunning(false, "切到后台时已经暂停，准备好再继续。"); } };
    const leave = () => { resumeAfterDialog.current = false; changeRunning(false, "进度已暂停，准备好再继续。"); };
    frame = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", leave);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", leave); };
  }, [changeRunning]);
  const soundtrackPhase = course.category === "cardio" ? segment.phase : course.category === "recovery" || segment.kind === "recovery" || segment.phase === "cooldown" ? "cooldown" : "warmup";
  useEffect(() => { audio.current?.setPhase(soundtrackPhase); }, [soundtrackPhase]);
  useEffect(() => { document.title = `燃脂 · ${course.title}`; }, [course.title]);
  // One current instruction or affirmation at a time, never a queue of old counts.
  const spokenBlock = Math.floor(withinMs / 15_000);
  useEffect(() => {
    if (!running || !voice) return;
    const instruction = segment.transition ? actionCue : `${actionCue} ${segment.prescription ?? ""}`;
    audio.current?.speak(spokenBlock === 0 ? `${moveLabel(segment, lowImpact)}。${instruction}` : encouragement);
  }, [running, voice, segment.id, spokenBlock, lowImpact, encouragement]);

  const startOrPause = useCallback(() => {
    if (runningRef.current) { changeRunning(false, "歇一歇也很好。你的节奏，由你决定。"); return; }
    setStarted(true); changeRunning(true);
  }, [changeRunning]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.repeat || dialog.current?.open || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === "Escape" && runningRef.current) { changeRunning(false, "已暂停，慢慢来。"); return; }
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest("button, input, select, textarea, a, summary") || target.isContentEditable)) return;
      if (event.code === "Space" && elapsedRef.current < courseRef.current.totalMs) { event.preventDefault(); startOrPause(); }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [startOrPause, changeRunning]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (elapsedRef.current > 0 && elapsedRef.current < courseRef.current.totalMs) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const openDialog = (mode: "plan" | "restart" | "courses" | "week") => {
    if (mode === "courses") setDraftCourseId(courseId);
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resumeAfterDialog.current = runningRef.current;
    changeRunning(false); setDialogMode(mode); dialog.current?.showModal();
  };
  const closeDialog = () => {
    dialog.current?.close();
    if (resumeAfterDialog.current && !document.hidden) changeRunning(true);
    returnFocus.current?.focus();
  };
  const reset = () => {
    resumeAfterDialog.current = false; closeDialog(); changeRunning(false);
    elapsedRef.current = 0; activeRef.current = 0; setElapsed(0); setActiveMs(0);
    setStarted(false); setEarlyCooldown(false); setSkippedMs({ warmup: 0, workout: 0, cooldown: 0 }); setPauseReason("");
  };
  const chooseCourse = () => {
    const selected = getCourse(draftCourseId);
    reset(); courseRef.current = selected; setCourseId(selected.id);
  };
  const skipAhead = (targetMs?: number) => {
    if (!started || elapsedRef.current >= courseRef.current.totalMs) return;
    const transition = skipCourseAhead(elapsedRef.current, targetMs, courseRef.current);
    if (transition.elapsedMs === elapsedRef.current) return;
    // Clear the old instruction immediately, including when moving within one phase.
    const wasRunning = runningRef.current;
    audio.current?.setRunning(false);
    elapsedRef.current = transition.elapsedMs; setElapsed(transition.elapsedMs);
    setSkippedMs(previous => ({
      warmup: previous.warmup + transition.skippedMs.warmup,
      workout: previous.workout + transition.skippedMs.workout,
      cooldown: previous.cooldown + transition.skippedMs.cooldown,
    }));
    const destination = segmentAt(transition.elapsedMs, courseRef.current).segment;
    audio.current?.setPhase(course.category === "cardio" ? destination.phase : course.category === "recovery" || destination.kind === "recovery" || destination.phase === "cooldown" ? "cooldown" : "warmup");
    changeRunning(wasRunning, wasRunning ? "" : `已切换到${moveLabel(destination, lowImpact)}，准备好再继续。`);
  };
  const enterCooldown = () => {
    if (elapsedRef.current >= cooldownStart) return;
    setEarlyCooldown(true); skipAhead(cooldownDestination(course, elapsedRef.current));
  };
  const toggleMusic = () => {
    const enabled = !music; setMusic(enabled); setAudioError(""); void audio.current?.setMusic(enabled);
  };
  const toggleVoice = () => {
    const enabled = !voice; setVoice(enabled); setAudioError(""); audio.current?.setVoice(enabled);
  };
  const retryAudio = () => { setAudioError(""); void audio.current?.setMusic(music); audio.current?.setVoice(voice); audio.current?.setRunning(runningRef.current); };

  return <div ref={root} className={`fat-burn ${fullscreen.focused ? "is-fullscreen" : ""}`} data-elapsed-ms={Math.floor(elapsed)} data-running={running} data-course-id={course.id}>
    <header className="fat-burn-header">
      <a className="fat-burn-brand" href="/" aria-label="返回木木学习岛"><span aria-hidden="true">✦</span><div>燃脂 <small>妈妈的运动课</small></div></a>
      <div className="fat-burn-header-actions">
        <button className="fb-button fb-quiet" onClick={() => openDialog("week")}>一周课表</button>
        <button className="fb-button fb-quiet" data-fullscreen-exit disabled={fullscreen.switching} onClick={() => void (fullscreen.focused ? fullscreen.leave() : fullscreen.enter())}>{fullscreen.focused ? "退出全屏" : "全屏跟练"}</button>
      </div>
    </header>

    <main className="fat-burn-main">
      <section className="fat-burn-selected-course" aria-label="当前课程">
        <div><span className="fat-burn-kicker">今天练什么</span><h2>{course.title} <small>{course.totalMs / 60_000} 分钟</small></h2><p>{course.intensity}</p><p>准备：{course.equipment.join("、") || "徒手，无需器械"}</p></div>
        <div className="fat-burn-course-actions"><button className="fb-button fb-primary" onClick={() => openDialog("courses")}>选择课程</button><button className="fb-button" onClick={() => openDialog("plan")}>动作与安排</button></div>
      </section>
      <section className="fat-burn-timeline" aria-label="三阶段课程进度">
        {course.phases.map((item, index) => {
          const skipped = skippedMs[item.id] > 0;
          const done = elapsed >= item.endMs && !skipped;
          const playedMs = Math.max(0, Math.min(item.durationMs, elapsed - item.startMs) - skippedMs[item.id]);
          return <div key={item.id} className={`fat-burn-phase ${item.id === phase.id && started && !complete ? "is-current" : ""} ${done ? "is-done" : ""}`} aria-current={item.id === phase.id && started && !complete ? "step" : undefined}>
            <span className="fat-burn-phase-number">{done ? "✓" : `0${index + 1}`}</span>
            <div><strong>{item.label}</strong><span>{skipped ? earlyCooldown && item.id !== "cooldown" ? "提前结束" : "有跳过" : `${item.durationMs / 60_000} 分钟`}</span></div>
            <div className="fat-burn-phase-track" aria-hidden="true"><i style={{ width: `${playedMs / item.durationMs * 100}%` }} /></div>
          </div>;
        })}
        <div className="fat-burn-total"><span>{complete ? "本次跟练" : "整节剩余"}</span><strong>{showTime ? timeText(complete ? activeMs : courseRef.current.totalMs - elapsed) : "跟随自己"}</strong></div>
      </section>

      <div className="fat-burn-workspace">
        <section className="fat-burn-stage" aria-label="妈妈动作示范">
          <div className="fat-burn-stage-heading"><span className="fat-burn-chip">{!started ? "为自己，动起来" : complete ? "今天的你，值得一个拥抱" : segment.kind === "recovery" ? "休息与准备 · 不用赶" : `${phase.label}${segment.round ? ` · 第 ${segment.round} / ${course.sets ?? 1} 组` : ""}`}</span><span className="fat-burn-impact">{course.category === "strength" ? "慢速练习 · 不跟音乐赶拍" : "低冲击 · 不跳跃"}</span></div>
          <div className="fat-burn-coach-heading"><h1>{!started ? <>把这段时间<br /><em>留给自己。</em></> : complete ? <>好好动过，<br /><em>也好好爱自己。</em></> : <>{actionTitle}{segment.side && <span className="fat-burn-action-side">{segment.side === "left" ? "左侧" : "右侧"} · 保持舒适拉伸</span>}</>}</h1>
            <p>{!started ? "让身体热起来，让心情亮起来。" : complete ? "不必和任何人比较，今天的投入已经很珍贵。" : actionCue}</p>
          </div>
          <div className="fat-burn-figure"><MomCoach move={activeMove} phase={!started || complete || segment.previewPose ? 0 : motionPhase} profile={profile} lowImpact={segment.lowImpact || lowImpact} side={segment.side} /></div>
          <div className="fat-burn-stage-bottom">{viewNote ? <span className="fat-burn-auto-view">{viewNote}</span> : <div className="fat-burn-view" role="group" aria-label="示范视角"><button aria-pressed={!actualProfile} onClick={() => setProfile(false)}>正面</button><button aria-pressed={actualProfile} onClick={() => setProfile(true)}>侧面</button></div>}
            {!viewNote && <span>原创妈妈示范 · 幅度由你决定</span>}</div>
          {started && !running && !complete && <div className="fat-burn-paused" role="status"><strong>休息一下，也很好</strong><span>{pauseReason || "进度已暂停，准备好再继续。"}</span><button className="fb-button fb-primary" onClick={startOrPause}>继续跟练</button></div>}
        </section>

        <aside className="fat-burn-console">
          <section className="fat-burn-now">
            <span className="fat-burn-kicker">{!started ? "今天，只为你" : complete ? "这一刻，为自己鼓掌" : segment.kind === "recovery" ? "给呼吸一点空间" : "感受每一个当下"}</span>
            <div className="fat-burn-clock" aria-label={!started ? `课程总长${course.totalMs / 60_000}分钟` : complete ? `本次跟练用时${timeText(activeMs)}，含休息` : `当前环节剩余${timeText(remainingMs)}`}><strong>{!started ? course.totalMs / 60_000 : showTime ? timeText(complete ? activeMs : remainingMs) : "自在"}</strong>{!started && <span>分钟</span>}</div>
            <p className="fat-burn-clock-caption">{!started ? course.phases.map(item => `${item.durationMs / 60_000} 分钟${item.label}`).join(" · ") : complete ? (!hasSkipped ? "课程播放结束 · 含休息，不代表已测得运动量" : skippedMs.cooldown === 0 ? "整理流程已结束 · 跟练用时含休息" : "本次练习已结束 · 跟练用时含休息") : `${segment.kind === "recovery" ? "休息不足可以暂停多歇一会儿" : "当前动作"} · ${lowImpact ? "小幅度也很棒" : "动作稳稳地做"}`}</p>
            {started && !complete && segment.prescription && <p className="fat-burn-prescription">{segment.prescription}</p>}
            <div className="fat-burn-step-progress" role="progressbar" aria-label="当前动作进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(withinMs / segment.durationMs * 100)}><i style={{ width: `${complete ? 100 : withinMs / segment.durationMs * 100}%` }} /></div>
            <div className="fat-burn-main-control">
              {complete ? <button className="fb-button fb-primary" onClick={() => openDialog("restart")}>再开一次练习</button> : <button className="fb-button fb-primary" onClick={startOrPause}><span aria-hidden="true">{running ? "Ⅱ" : "▶"}</span>{!started ? `开始这 ${course.totalMs / 60_000} 分钟` : running ? "暂停 · 歇一歇" : "继续跟练"}</button>}
              {!complete && <button className="fb-button fat-burn-next-step" disabled={!started || !next} aria-label={nextButtonLabel} onClick={() => skipAhead()}><span>下一小节 <span aria-hidden="true">→</span></span><small>{nextLabel}</small></button>}
            </div>
            <span className="fat-burn-key-hint">{!started ? course.category === "strength" ? "做够就休息 · 先一组，再加量" : course.category === "recovery" ? "轻柔活动 · 不追求出汗" : "能说话、难唱歌 · 强度由感受判断" : complete ? "本次进度仅在此页面保留" : "空格键可暂停 / 继续"}</span>
          </section>

          <section className="fat-burn-encouragement" aria-label="陪伴鼓励"><span aria-hidden="true">“</span><p aria-live="polite">{!started ? "照顾了那么多事，也给自己一点温柔的关注。这段时间，我们一起。" : encouragement}</p><small>陪你一起，慢慢变有力量</small></section>

          <section className="fat-burn-next"><span>{!started ? "从这里开始" : complete ? "接下来" : "下一小节"}</span><strong>{!started ? moveLabel(course.segments[0], lowImpact) : complete ? "喝点水，感受身体的轻松" : next ? moveLabel(next, lowImpact) : "拥抱今天的自己"}</strong><p>{!started ? "先让身体暖起来，不急着追赶。" : complete ? "运动结束了，属于你的照顾可以继续。" : next ? moveCue(next, lowImpact) : "慢慢呼吸，准备结束。"}</p></section>
        </aside>
      </div>

      <section className="fat-burn-controls" aria-label="本次运动设置">
        <button className="fb-button" aria-pressed={music} onClick={toggleMusic}>{music ? "♫ 音乐已开" : "♫ 开启燃力音乐"}</button>
        <button className="fb-button" aria-pressed={voice} onClick={toggleVoice}>{voice ? "✓ 鼓励语音已开" : "开启鼓励语音"}</button>
        <button className="fb-button fb-quiet" aria-pressed={!showTime} onClick={() => setShowTime(value => !value)}>{showTime ? "隐藏倒计时" : "显示倒计时"}</button>
        {started && !complete && <button className="fb-button fb-quiet" onClick={() => openDialog("restart")}>重新开始</button>}
      </section>
      {audioError && <div className="fat-burn-error" role="status"><span>{audioError}</span><button className="fb-button" onClick={retryAudio}>重试声音</button><button className="fb-button fb-quiet" onClick={() => setAudioError("")}>收起提示</button></div>}

      <div className="fat-burn-lower">
        <CameraMirror />
        <section className="fat-burn-adjustments"><details onToggle={event => { if (event.currentTarget.open && runningRef.current) changeRunning(false, "调整好设置，再继续跟练。"); }}><summary>按今天的状态，照顾好自己</summary><div className="fat-burn-settings-content"><label htmlFor="fat-burn-volume">音乐音量 <output>{Math.round(volume * 100)}%</output></label><input id="fat-burn-volume" aria-label="音乐音量" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => { const value = Number(event.target.value); setVolume(value); audio.current?.setVolume(value); }} /><p>有氧以能说话、难唱歌来判断中等强度。力量不赶拍、用力时呼气；达到目标次数就休息，休息不足可以暂停延长。</p><p>若有疼痛、头晕或明显不适，请停止。拉伸轻柔、不弹振；不需要追求疼痛感。</p><p>{PROGRAM_SCOPE} 产后恢复、已有疼痛、漏尿或盆底坠胀时，需要个别指导。</p><p>声音和镜子由你主动开启。当前页面不保存个人记录，不估算热量，也不自动判断强度是否达标。</p></div></details>
          {started && !complete && elapsed < cooldownStart && <button className="fb-button fat-burn-cooldown-button" disabled={earlyCooldown} onClick={enterCooldown}>{earlyCooldown ? "先慢慢起身，再整理放松" : "今天到这里，提前整理拉伸 →"}</button>}
          <p className="fat-burn-footer-note">给妈妈的独立运动空间 · 本次设置不影响木木的跳操</p>
        </section>
      </div>
    </main>

    {!complete && <div className="fat-burn-mobile-control"><span>{!started ? "准备好就开始" : running ? moveLabel(segment, lowImpact) : "歇一歇，也很好"}</span><div className="fat-burn-mobile-actions"><button className="fb-button fb-primary" onClick={startOrPause}>{!started ? "开始跟练" : running ? "暂停跟练" : "继续运动"}</button><button className="fb-button" disabled={!started || !next} aria-label={nextButtonLabel} title={nextButtonLabel} onClick={() => skipAhead()}>下一小节 <span aria-hidden="true">→</span></button></div></div>}

    <dialog ref={dialog} className="fat-burn-dialog" aria-labelledby="fat-burn-dialog-title" onCancel={event => { event.preventDefault(); closeDialog(); }}>
      <div className="fat-burn-dialog-heading"><h2 id="fat-burn-dialog-title">{dialogMode === "plan" ? course.title : dialogMode === "courses" ? "选一节适合今天的课" : dialogMode === "week" ? "一周怎么安排" : "重新开始这次练习？"}</h2><button className="fb-button fb-quiet" onClick={closeDialog}>关闭</button></div>
      {dialogMode === "restart" ? <><p>本次跟练用时 {timeText(activeMs)}（含休息）。重新开始会回到热身，清除本页这次进度。</p><div className="fat-burn-dialog-actions"><button className="fb-button" onClick={closeDialog}>保留这次进度</button><button className="fb-button fb-primary" onClick={reset}>确认重新开始</button></div></>
        : dialogMode === "courses" ? <><CourseLibrary selectedId={draftCourseId} onChange={setDraftCourseId} />{started && <p className="fat-burn-switch-note">使用所选课程会结束当前跟练并清除本次进度。关闭可回到原课。</p>}<div className="fat-burn-dialog-actions"><button className="fb-button" onClick={closeDialog}>返回原课</button><button className="fb-button fb-primary" onClick={chooseCourse}>使用所选课程</button></div></>
        : dialogMode === "week" ? <WeeklyProgram onChoose={id => { setDraftCourseId(id); setDialogMode("courses"); }} />
        : <><CoursePlan key={course.id} course={course} /><div className="fat-burn-dialog-actions"><button className="fb-button fb-primary" onClick={closeDialog}>回到跟练</button></div></>}

    </dialog>
  </div>;
}
