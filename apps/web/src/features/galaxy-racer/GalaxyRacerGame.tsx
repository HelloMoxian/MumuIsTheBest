import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { EnergyCoinBalancePill } from "../../shared/EnergyCoinBalancePill";
import { settleRacerRun, type RacerSettlement } from "./api";
import { RACER_THEMES, energyCoinUrl, preloadRacerTheme } from "./assets";
import { RacerAudio } from "./audio";
import { RacerFaceTracker } from "./face-tracker";
import { GalaxyRacerEngine } from "./game-engine";
import {
  formatRaceTime,
  laneFromHeadPosition,
  RACER_ROAD_LENGTH,
  RACER_STAGES,
  smoothHeadPosition,
  stageConfig,
  stageReachedTarget,
} from "./logic";
import type {
  RacerHudSnapshot,
  RacerLane,
  RacerStageAttempt,
} from "./types";
import "./galaxy-racer.css";

type GameStatus =
  | "booting"
  | "camera-choice"
  | "countdown"
  | "racing"
  | "paused"
  | "face-paused"
  | "stage-card"
  | "settling"
  | "summary";

type StageResult = {
  attempt: RacerStageAttempt;
  reachedTarget: boolean;
};

const INITIAL_HUD: RacerHudSnapshot = {
  distance: 0,
  elapsedMs: 0,
  speed: 15,
  collisions: 0,
  lane: 0,
};

function laneLabel(lane: RacerLane) {
  if (lane === -1) return "左车道";
  if (lane === 1) return "右车道";
  return "中间车道";
}

export function GalaxyRacerGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<GalaxyRacerEngine | null>(null);
  const trackerRef = useRef<RacerFaceTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackingFrameRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const audioRef = useRef<RacerAudio | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef<GameStatus>("booting");
  const laneRef = useRef<RacerLane>(0);
  const smoothedHeadXRef = useRef(0.5);
  const candidateRef = useRef<{ lane: RacerLane; since: number } | null>(null);
  const lastFaceAtRef = useRef(0);
  const attemptsRef = useRef<RacerStageAttempt[]>([]);
  const eventIdRef = useRef(crypto.randomUUID());
  const startedAtRef = useRef(new Date().toISOString());

  const [status, setStatus] = useState<GameStatus>("booting");
  const [level, setLevel] = useState(1);
  const [hud, setHud] = useState<RacerHudSnapshot>(INITIAL_HUD);
  const [countdown, setCountdown] = useState(3);
  const [cameraMode, setCameraMode] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [notice, setNotice] = useState("正在准备本地人脸识别和第一关…");
  const [previewHeadX, setPreviewHeadX] = useState<number | null>(null);
  const [stageResult, setStageResult] = useState<StageResult | null>(null);
  const [settlement, setSettlement] = useState<RacerSettlement | null>(null);
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<RacerStageAttempt[]>([]);

  const config = stageConfig(level);
  const progress = Math.min(100, Math.round(hud.distance / RACER_ROAD_LENGTH * 100));
  const showCameraGuide = cameraMode && ["booting", "countdown", "racing", "paused", "face-paused"].includes(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    audioRef.current = new RacerAudio();
    void beginWithCamera();
    return () => {
      mountedRef.current = false;
      clearTimers();
      cancelAnimationFrame(trackingFrameRef.current);
      engineRef.current?.stop();
      trackerRef.current?.close();
      audioRef.current?.dispose();
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    };
    // 一次点击从游戏岛进入后自动启动，本 effect 只执行一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        event.preventDefault();
        requestLane(Math.max(-1, laneRef.current - 1) as RacerLane);
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        event.preventDefault();
        requestLane(Math.min(1, laneRef.current + 1) as RacerLane);
      }
      if (event.key === " " && (statusRef.current === "racing" || statusRef.current === "paused")) {
        event.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function clearTimers() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
    timerRef.current = null;
    messageTimerRef.current = null;
  }

  function resetRun() {
    clearTimers();
    engineRef.current?.stop();
    engineRef.current = null;
    attemptsRef.current = [];
    eventIdRef.current = crypto.randomUUID();
    startedAtRef.current = new Date().toISOString();
    laneRef.current = 0;
    smoothedHeadXRef.current = 0.5;
    candidateRef.current = null;
    setPreviewHeadX(null);
    setAttempts([]);
    setSettlement(null);
    setSettlementError(null);
    setStageResult(null);
    setHud(INITIAL_HUD);
  }

  async function beginWithCamera() {
    resetRun();
    setCameraMode(true);
    setStatus("booting");
    setNotice("正在打开摄像头并准备本地人脸识别…");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("当前浏览器还不能使用摄像头。");
      }
      const tracker = new RacerFaceTracker();
      trackerRef.current?.close();
      trackerRef.current = tracker;
      const streamPromise = navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });
      const [, stream] = await Promise.all([
        tracker.initialize(),
        streamPromise,
        preloadRacerTheme(RACER_THEMES.neon),
      ]);
      if (!mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("赛车座舱还没有准备好。");
      video.srcObject = stream;
      await video.play();
      lastFaceAtRef.current = performance.now();
      startTracking();
      queueStage(1, true);
    } catch (error) {
      trackerRef.current?.close();
      trackerRef.current = null;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
      setStatus("camera-choice");
      setNotice(error instanceof Error
        ? error.message + " 可以再试一次，也可以先用方向键体验。"
        : "摄像头还没准备好，可以再试一次，也可以先用方向键体验。");
    }
  }

  function beginPractice() {
    resetRun();
    trackerRef.current?.close();
    trackerRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    setCameraMode(false);
    queueStage(1, false);
  }

  function startTracking() {
    cancelAnimationFrame(trackingFrameRef.current);
    let lastDetectionAt = 0;
    const track = (now: number) => {
      const video = videoRef.current;
      const tracker = trackerRef.current;
      if (video && tracker && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - lastDetectionAt >= 72) {
        lastDetectionAt = now;
        try {
          const face = tracker.detect(video, now);
          engineRef.current?.setFace(face);
          if (face) {
            lastFaceAtRef.current = now;
            smoothedHeadXRef.current = smoothHeadPosition(smoothedHeadXRef.current, face.centerX);
            setPreviewHeadX(smoothedHeadXRef.current);
            const desired = laneFromHeadPosition(laneRef.current, smoothedHeadXRef.current);
            if (desired === laneRef.current) {
              candidateRef.current = null;
            } else if (candidateRef.current?.lane !== desired) {
              candidateRef.current = { lane: desired, since: now };
            } else if (now - candidateRef.current.since >= 120) {
              requestLane(desired);
              candidateRef.current = null;
            }
            if (statusRef.current === "face-paused") {
              engineRef.current?.resume();
              audioRef.current?.startLoops();
              setStatus("racing");
              setNotice("看到你啦，继续冲！");
            }
          } else {
            if (now - lastFaceAtRef.current > 260) setPreviewHeadX(null);
            if (statusRef.current === "racing" && now - lastFaceAtRef.current > 800) {
              engineRef.current?.pause();
              audioRef.current?.stopLoops();
              setStatus("face-paused");
              setNotice("回到镜头中就能继续，赛程已经为你暂停。");
            }
          }
        } catch {
          // 偶发单帧推理异常只跳过该帧，避免打断赛程。
        }
      }
      if (mountedRef.current && trackerRef.current) {
        trackingFrameRef.current = requestAnimationFrame(track);
      }
    };
    trackingFrameRef.current = requestAnimationFrame(track);
  }

  function queueStage(nextLevel: number, useCamera = cameraMode) {
    engineRef.current?.stop();
    engineRef.current = null;
    const nextConfig = stageConfig(nextLevel);
    const theme = RACER_THEMES[nextConfig.theme];
    setLevel(nextLevel);
    setHud(INITIAL_HUD);
    setStageResult(null);
    setStatus("countdown");
    setCountdown(3);
    setNotice("第 " + nextLevel + " 关 · " + nextConfig.themeName);
    audioRef.current?.setTheme(theme);
    audioRef.current?.playCountdown();
    void preloadRacerTheme(theme);
    if (nextLevel < RACER_STAGES.length) {
      void preloadRacerTheme(RACER_THEMES[stageConfig(nextLevel + 1).theme]);
    }
    let value = 3;
    const tick = () => {
      value -= 1;
      if (value > 0) {
        setCountdown(value);
        timerRef.current = window.setTimeout(tick, 720);
      } else {
        launchStage(nextLevel, useCamera);
      }
    };
    timerRef.current = window.setTimeout(tick, 720);
  }

  function launchStage(stageLevel: number, useCamera: boolean) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = stageConfig(stageLevel);
    const theme = RACER_THEMES[stage.theme];
    laneRef.current = 0;
    setStatus("racing");
    setNotice(useCamera ? "移动头部到画面左、中、右区域来换道" : "使用方向键或下方车道按钮来换道");
    const engine = new GalaxyRacerEngine(canvas, useCamera ? videoRef.current : null, stage, theme, {
      onHud: (snapshot) => {
        setHud(snapshot);
        audioRef.current?.updateSpeed(snapshot.speed);
        audioRef.current?.updateProgress(snapshot.distance / RACER_ROAD_LENGTH);
      },
      onCollision: (snapshot) => {
        setHud(snapshot);
        audioRef.current?.collision(snapshot.collisions);
        setNotice("轻轻碰了一下，没关系，继续冲！");
        if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
        messageTimerRef.current = window.setTimeout(() => {
          if (statusRef.current === "racing") {
            setNotice(useCamera ? "看准前方，把头部移动到空车道" : "看准前方，切换到空车道");
          }
        }, 1_250);
      },
      onFinish: (snapshot) => handleStageFinish(stageLevel, snapshot, useCamera),
    });
    engineRef.current = engine;
    engine.start();
    audioRef.current?.playStartGrid();
    audioRef.current?.startLoops();
  }

  function handleStageFinish(stageLevel: number, snapshot: RacerHudSnapshot, useCamera: boolean) {
    const attempt: RacerStageAttempt = {
      level: stageLevel,
      elapsedMs: Math.round(snapshot.elapsedMs),
      collisions: snapshot.collisions,
      completed: true,
    };
    const reachedTarget = stageReachedTarget(attempt);
    const nextAttempts = [...attemptsRef.current, attempt];
    attemptsRef.current = nextAttempts;
    setAttempts(nextAttempts);
    setStageResult({ attempt, reachedTarget });
    setStatus("stage-card");
    audioRef.current?.finish(reachedTarget);
    if (reachedTarget && stageLevel < RACER_STAGES.length) {
      setNotice("第 " + stageLevel + " 关已点亮！能量币会在本轮结束时一起送达。");
      timerRef.current = window.setTimeout(() => queueStage(stageLevel + 1, useCamera), 1_450);
    } else {
      setNotice(reachedTarget
        ? "六座星门全部点亮，正在把本轮奖励送进能量舱！"
        : "顺利跑完全程！再熟悉一点就能点亮下一关。");
      timerRef.current = window.setTimeout(() => void finishRun(nextAttempts), 1_650);
    }
  }

  async function finishRun(runAttempts = attemptsRef.current) {
    setStatus("settling");
    setSettlementError(null);
    try {
      const result = await settleRacerRun({
        eventId: eventIdRef.current,
        startedAt: startedAtRef.current,
        attempts: runAttempts,
      });
      if (!mountedRef.current) return;
      setSettlement(result);
      audioRef.current?.reward();
      setStatus("summary");
    } catch (error) {
      if (!mountedRef.current) return;
      setSettlementError(error instanceof Error ? error.message : "奖励暂时还在星际途中，请再试一次。");
      setStatus("summary");
    }
  }

  function requestLane(lane: RacerLane) {
    if (!["racing", "countdown", "face-paused"].includes(statusRef.current)) return;
    if (lane === laneRef.current) return;
    const direction = lane > laneRef.current ? 1 : -1;
    laneRef.current = lane;
    engineRef.current?.setLane(lane);
    audioRef.current?.lane(direction);
    setHud((current) => ({ ...current, lane }));
  }

  function onTrackPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (cameraMode || statusRef.current !== "racing") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    requestLane(x < 1 / 3 ? -1 : x > 2 / 3 ? 1 : 0);
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    audioRef.current?.setEnabled(next);
    if (next && statusRef.current === "racing") audioRef.current?.startLoops();
  }

  function togglePause() {
    if (statusRef.current === "racing") {
      engineRef.current?.pause();
      audioRef.current?.stopLoops();
      setStatus("paused");
      setNotice("赛程已暂停，准备好再继续。");
    } else if (statusRef.current === "paused") {
      engineRef.current?.resume();
      audioRef.current?.startLoops();
      setStatus("racing");
      setNotice(cameraMode ? "移动头部到空车道，继续冲！" : "使用方向键切换车道，继续冲！");
    }
  }

  function restart() {
    resetRun();
    if (cameraMode && streamRef.current && trackerRef.current) queueStage(1, true);
    else if (cameraMode) void beginWithCamera();
    else queueStage(1, false);
  }

  return (
    <main className="galaxy-racer" data-theme={config.theme}>
      <canvas
        ref={canvasRef}
        className="racer-canvas"
        aria-label="斜后方俯视的三车道星际赛车赛道"
        onPointerDown={onTrackPointer}
      />

      <aside
        className={"racer-camera-guide" + (showCameraGuide ? "" : " is-hidden")}
        aria-label="摄像头头部位置提示"
        aria-hidden={!showCameraGuide}
      >
        <div className="racer-camera-guide-title">
          <span>我的位置</span>
          <strong>{previewHeadX === null ? "寻找头部" : laneLabel(hud.lane)}</strong>
        </div>
        <div
          className={"racer-camera-frame" + (previewHeadX === null ? " is-searching" : "")}
          data-lane={hud.lane}
        >
          <video ref={videoRef} className="racer-camera-video" playsInline muted aria-hidden="true" />
          <div className="racer-camera-zones" aria-hidden="true">
            <span className="is-left">左</span>
            <span className="is-center">中</span>
            <span className="is-right">右</span>
          </div>
          <span className="racer-camera-line is-left" aria-hidden="true" />
          <span className="racer-camera-line is-right" aria-hidden="true" />
          {previewHeadX !== null && (
            <span
              className="racer-head-position"
              style={{ left: Math.max(0, Math.min(100, previewHeadX * 100)) + "%" }}
              aria-hidden="true"
            />
          )}
        </div>
        <small>{previewHeadX === null ? "把脸移进小窗口" : "移动整个头部，不用歪头"}</small>
      </aside>

      <header className="racer-topbar">
        <a className="racer-icon-button racer-exit" href="/" aria-label="返回游戏岛">‹ <span>游戏岛</span></a>
        <div className="racer-stage-strip" aria-label="六关进度">
          {RACER_STAGES.map((stage) => {
            const attempt = attempts.find((item) => item.level === stage.level);
            const reached = attempt ? stageReachedTarget(attempt) : false;
            return (
              <span
                key={stage.level}
                className={stage.level === level ? "is-current" : reached ? "is-lit" : ""}
                title={"第 " + stage.level + " 关目标 " + stage.targetMs / 1_000 + " 秒"}
              >
                {reached ? "★" : stage.level}
              </span>
            );
          })}
        </div>
        <EnergyCoinBalancePill />
        <button type="button" className="racer-icon-button" onClick={toggleSound} aria-pressed={soundEnabled}>
          {soundEnabled ? "声音开" : "声音关"}
        </button>
        <button
          type="button"
          className="racer-icon-button"
          onClick={togglePause}
          disabled={!["racing", "paused"].includes(status)}
        >
          {status === "paused" ? "继续" : "暂停"}
        </button>
      </header>

      <section className="racer-hud" aria-label="当前赛程">
        <div className="racer-level-badge">
          <small>第 {level} 关 · {config.themeName}</small>
          <strong>目标 {config.targetMs / 1_000} 秒</strong>
        </div>
        <div className="racer-speed">
          <span>{Math.round(hud.speed * 5.2)}</span>
          <small>km/h</small>
        </div>
        <div className="racer-progress">
          <div><span>赛程</span><strong>{progress}%</strong></div>
          <progress value={progress} max={100} aria-label={"赛程完成 " + progress + "%"} />
          <div><span>{formatRaceTime(hud.elapsedMs)}</span><span>{laneLabel(hud.lane)}</span></div>
        </div>
      </section>

      <div className="racer-camera-status" role="status" aria-live="polite">
        <span className={cameraMode ? "is-camera" : "is-practice"} aria-hidden="true" />
        {notice}
      </div>

      {!cameraMode && status === "racing" && (
        <nav className="racer-lane-controls" aria-label="练习模式车道">
          {([-1, 0, 1] as RacerLane[]).map((lane) => (
            <button
              key={lane}
              type="button"
              className={hud.lane === lane ? "is-current" : ""}
              onClick={() => requestLane(lane)}
            >
              {laneLabel(lane)}
            </button>
          ))}
        </nav>
      )}

      {status === "booting" && (
        <section className="racer-overlay racer-loading" aria-live="polite">
          <div className="racer-orbit-loader" aria-hidden="true"><span /></div>
          <p>正在准备赛车和摄像头</p>
          <strong>看到你后会自动开始</strong>
        </section>
      )}

      {status === "camera-choice" && (
        <section className="racer-overlay racer-choice" role="dialog" aria-labelledby="camera-choice-title">
          <small>座舱提示</small>
          <h1 id="camera-choice-title">摄像头还没准备好</h1>
          <p>{notice}</p>
          <div>
            <button type="button" className="racer-primary" onClick={() => void beginWithCamera()}>再试一次</button>
            <button type="button" className="racer-secondary" onClick={beginPractice}>用方向键体验</button>
          </div>
        </section>
      )}

      {status === "countdown" && (
        <section className="racer-overlay racer-countdown" aria-live="assertive">
          <small>第 {level} 关 · {config.themeName}</small>
          <strong key={countdown}>{countdown}</strong>
          <p>{cameraMode ? "把头部移动到左、中、右区域" : "方向键和下方按钮都可以换道"}</p>
        </section>
      )}

      {(status === "paused" || status === "face-paused") && (
        <section className="racer-overlay racer-pause" aria-live="polite">
          <small>赛程已为你暂停</small>
          <h2>{status === "face-paused" ? "回到镜头中就能继续" : "准备好再继续冲"}</h2>
          {status === "paused" && <button type="button" className="racer-primary" onClick={togglePause}>继续赛车</button>}
        </section>
      )}

      {status === "stage-card" && stageResult && (
        <section className="racer-overlay racer-stage-result" aria-live="assertive">
          <div className="racer-result-star" aria-hidden="true">{stageResult.reachedTarget ? "★" : "✦"}</div>
          <small>第 {stageResult.attempt.level} 关 · 顺利冲线</small>
          <h2>{stageResult.reachedTarget ? "星门点亮！" : "完整跑完啦！"}</h2>
          <p>
            用时 {formatRaceTime(stageResult.attempt.elapsedMs)}
            {stageResult.reachedTarget
              ? "，10 枚能量币已装入本轮奖励舱。"
              : "，再熟悉一点就能点亮下一关。"}
          </p>
        </section>
      )}

      {status === "settling" && (
        <section className="racer-overlay racer-loading" aria-live="polite">
          <div className="racer-orbit-loader racer-coin-loader" aria-hidden="true"><span /></div>
          <p>正在运送本轮能量币</p>
          <strong>马上到达能量舱</strong>
        </section>
      )}

      {status === "summary" && (
        <section className="racer-overlay racer-summary" role="dialog" aria-labelledby="racer-summary-title">
          <small>本轮星际旅程</small>
          <h1 id="racer-summary-title">
            {settlement?.passedLevels
              ? "点亮了 " + settlement.passedLevels + " 座星门！"
              : "顺利完成了一段星际旅程！"}
          </h1>
          <div className="racer-reward">
            <img src={energyCoinUrl} alt="" />
            {settlement
              ? <span><small>本轮到账</small><strong>+{settlement.energyCoinsEarned}</strong></span>
              : <span><small>奖励正在等待送达</small><strong>···</strong></span>}
          </div>
          <div className="racer-attempt-list">
            {attempts.map((attempt) => (
              <div key={attempt.level}>
                <span>第 {attempt.level} 关</span>
                <strong>{formatRaceTime(attempt.elapsedMs)}</strong>
                <small>{stageReachedTarget(attempt) ? "已点亮 ★" : "顺利冲线 ✦"}</small>
              </div>
            ))}
          </div>
          {settlement && <p>能量币余额 {settlement.energyCoinBalance}，下次继续挑战更快的星门！</p>}
          {settlementError && <p className="racer-settlement-note">{settlementError}</p>}
          <div className="racer-summary-actions">
            {settlementError && (
              <button type="button" className="racer-secondary" onClick={() => void finishRun()}>再送一次奖励</button>
            )}
            <button type="button" className="racer-primary" onClick={restart}>再跑一轮</button>
            <a className="racer-secondary" href="/">回到游戏岛</a>
          </div>
        </section>
      )}
    </main>
  );
}
