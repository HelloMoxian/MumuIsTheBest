import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  energyCoinUrl,
  FRUIT_SLICE_ASSETS,
  fruitSliceBgmUrl,
  fruitSliceHitSoundUrl,
  preloadCriticalFruitSliceAssets,
  preloadFruitSliceAssets,
} from "./assets";
import {
  loadFruitSliceHistory,
  saveFruitSliceSession,
  type FruitSliceHistory,
} from "./api";
import { FruitSliceEngine } from "./game-engine";
import {
  MediaPipeBodyHandTracker,
  preloadMediaPipeRuntimeAssets,
} from "./mediapipe-tracker";
import {
  FRUIT_SLICE_ROLES,
  type Density,
  type FruitSliceRole,
  type FruitSliceSettings,
  type GameHud,
  type GameMode,
  type PlayerResult,
  type PlayerSelection,
  type SwipeSensitivity,
  type TrackingFrame,
} from "./types";
import "./fruit-slice.css";

type Phase = "setup" | "loading" | "countdown" | "playing" | "result";
type SaveState = "idle" | "saving" | "saved" | "error";

const DEFAULT_SETTINGS: FruitSliceSettings = {
  durationSeconds: 30,
  density: "standard",
  speedMultiplier: 1,
  fruitSize: 160,
  includeBombs: false,
  includeLobster: true,
  swipeSensitivity: "gentle",
};

const EMPTY_TRACKING: TrackingFrame = {
  hands: [],
  bodyCount: 0,
  bodySides: { left: false, right: false },
};

const DENSITY_LABELS: Readonly<Record<Density, string>> = {
  relaxed: "舒缓",
  standard: "标准",
  busy: "热闹",
  storm: "果雨",
};

const SENSITIVITY_LABELS: Readonly<Record<SwipeSensitivity, string>> = {
  gentle: "轻轻一挥",
  standard: "标准挥动",
  strong: "大力挥动",
};

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function playersFor(mode: GameMode, leftRole: FruitSliceRole, rightRole: FruitSliceRole): PlayerSelection[] {
  return mode === "single"
    ? [{ role: leftRole, side: "full" }]
    : [{ role: leftRole, side: "left" }, { role: rightRole, side: "right" }];
}

function RoleSelect({
  label,
  value,
  onChange,
  disabledRole,
}: {
  label: string;
  value: FruitSliceRole;
  onChange: (role: FruitSliceRole) => void;
  disabledRole?: FruitSliceRole;
}) {
  return (
    <label className="fruit-role-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as FruitSliceRole)}>
        {FRUIT_SLICE_ROLES.map((role) => (
          <option value={role} disabled={role === disabledRole} key={role}>{role}</option>
        ))}
      </select>
    </label>
  );
}

function SegmentButtons<T extends string | number>({
  label,
  values,
  value,
  onChange,
  render,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
  render: (value: T) => string;
}) {
  return (
    <fieldset className="fruit-segment-field">
      <legend>{label}</legend>
      <div className="fruit-segments">
        {values.map((candidate) => (
          <button
            className={candidate === value ? "is-selected" : ""}
            type="button"
            aria-pressed={candidate === value}
            onClick={() => onChange(candidate)}
            key={candidate}
          >
            {candidate === value && <span aria-hidden="true">✓</span>}{render(candidate)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ToggleSetting({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className={`fruit-toggle ${checked ? "is-checked" : ""}`}>
      <span><strong>{title}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true"><b /></i>
    </label>
  );
}

function EnergyCoinPill({ balance }: { balance: number | null }) {
  return (
    <div className="energy-coin-pill" aria-label={`能量币余额 ${balance ?? "正在读取"}`}>
      <img src={energyCoinUrl} alt="" />
      <span><small>能量币</small><strong>{balance ?? "…"}</strong></span>
    </div>
  );
}

function HistoryPanel({
  history,
  loading,
  error,
  onClose,
  onRetry,
}: {
  history: FruitSliceHistory | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="fruit-history-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="fruit-history-panel" role="dialog" aria-modal="true" aria-labelledby="fruit-history-title">
        <header>
          <div><p>家庭运动战报</p><h2 id="fruit-history-title">每个人的切水果记录</h2></div>
          <button type="button" onClick={onClose} aria-label="关闭历史战报">×</button>
        </header>
        {loading && <div className="fruit-history-state" aria-live="polite">正在整理每个人的战报…</div>}
        {error && (
          <div className="fruit-history-state is-error" role="alert">
            <p>{error}</p><button type="button" onClick={onRetry}>再试一次</button>
          </div>
        )}
        {history && !loading && (
          <>
            <div className="fruit-role-stats">
              {history.summary.roles.map((role) => (
                <article className={role.role === "木木" ? "is-mumu" : ""} key={role.role}>
                  <strong>{role.role}</strong>
                  <span>{role.gamesPlayed} 局</span>
                  <b>最高 {role.highestScore}</b>
                  {role.role === "木木" && <small>累计获得 {role.energyCoinsEarned} 枚能量币</small>}
                </article>
              ))}
            </div>
            <section className="fruit-matchups" aria-labelledby="fruit-matchups-title">
              <h3 id="fruit-matchups-title">双人胜败比例</h3>
              {history.summary.matchups.length === 0 ? (
                <p className="fruit-empty-copy">还没有双人战报。一起玩一局，这里就会出现胜负比例。</p>
              ) : history.summary.matchups.map((matchup) => (
                <article key={`${matchup.roleA}-${matchup.roleB}`}>
                  <div><strong>{matchup.roleA}</strong><b>{matchup.winsA}</b></div>
                  <span>{matchup.games} 局 · 平局 {matchup.ties}</span>
                  <div><b>{matchup.winsB}</b><strong>{matchup.roleB}</strong></div>
                  <i aria-hidden="true">
                    <b style={{ width: `${matchup.games ? matchup.winsA / matchup.games * 100 : 50}%` }} />
                  </i>
                </article>
              ))}
            </section>
            <section className="fruit-session-list" aria-labelledby="fruit-session-title">
              <h3 id="fruit-session-title">最近每局分数</h3>
              {history.sessions.length === 0 ? (
                <p className="fruit-empty-copy">第一局结束后，分数会安全保存在这台电脑上。</p>
              ) : [...history.sessions].reverse().slice(0, 20).map((session) => (
                <article key={session.id}>
                  <time>{new Date(session.completedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                  <span>{session.mode === "versus" ? "双人对战" : "单人挑战"}</span>
                  <div>{session.players.map((player) => <b key={player.role}>{player.role} {player.score} 分</b>)}</div>
                </article>
              ))}
            </section>
          </>
        )}
      </section>
    </div>
  );
}

function PlayerHudCard({ player }: { player: GameHud["players"][number] }) {
  const superActive = player.superRemainingMs > 0;
  return (
    <article className={`fruit-player-hud side-${player.side} ${superActive ? "is-super" : ""}`}>
      <div><small>{player.side === "right" ? "右边" : player.side === "left" ? "左边" : "挑战者"}</small><strong>{player.role}</strong></div>
      <b>{player.score}</b>
      <span>{superActive ? `超级 ×3 · ${Math.ceil(player.superRemainingMs / 1_000)}秒` : `连击 ${player.combo}`}</span>
    </article>
  );
}

export function FruitSliceGame() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [mode, setMode] = useState<GameMode>("single");
  const [leftRole, setLeftRole] = useState<FruitSliceRole>("木木");
  const [rightRole, setRightRole] = useState<FruitSliceRole>("爸爸");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [tracking, setTracking] = useState<TrackingFrame>(EMPTY_TRACKING);
  const [countdown, setCountdown] = useState(3);
  const [usingCamera, setUsingCamera] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loadingLabel, setLoadingLabel] = useState("正在请求摄像头权限…");
  const [hud, setHud] = useState<GameHud | null>(null);
  const [results, setResults] = useState<PlayerResult[] | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [energyAward, setEnergyAward] = useState(0);
  const [history, setHistory] = useState<FruitSliceHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<MediaPipeBodyHandTracker | null>(null);
  const trackingFrameRef = useRef(0);
  const engineRef = useRef<FruitSliceEngine | null>(null);
  const pendingSaveRef = useRef<Parameters<typeof saveFruitSliceSession>[0] | null>(null);
  const startedAtRef = useRef("");
  const lastTrackingUiAtRef = useRef(0);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const sliceVoicesRef = useRef<HTMLAudioElement[]>([]);

  const selectedPlayers = useMemo(
    () => playersFor(mode, leftRole, rightRole),
    [leftRole, mode, rightRole],
  );
  const reducedMotion = useMemo(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    [],
  );
  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await loadFruitSliceHistory());
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "历史战报暂时无法读取。");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    let active = true;
    void preloadMediaPipeRuntimeAssets()
      .catch(() => undefined)
      .then(() => {
        if (active) void preloadFruitSliceAssets();
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && historyOpen) setHistoryOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [historyOpen]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(trackingFrameRef.current);
    trackingFrameRef.current = 0;
    trackerRef.current?.close();
    trackerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTracking(EMPTY_TRACKING);
  }, []);

  const startTrackingLoop = useCallback(() => {
    let lastVideoTime = -1;
    let lastDetectionAt = -Infinity;
    const loop = (now: number) => {
      const video = videoRef.current;
      const tracker = trackerRef.current;
      if (
        video
        && tracker
        && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && video.currentTime !== lastVideoTime
        && now - lastDetectionAt >= 66
      ) {
        lastVideoTime = video.currentTime;
        lastDetectionAt = now;
        try {
          const frame = tracker.detect(video, now);
          engineRef.current?.updateTracking(frame, now);
          if (now - lastTrackingUiAtRef.current > 180) {
            lastTrackingUiAtRef.current = now;
            setTracking(frame);
          }
        } catch {
          setCameraError("动作识别暂时停顿了。请保持在画面中，或返回设置后重试。");
        }
      }
      trackingFrameRef.current = requestAnimationFrame(loop);
    };
    trackingFrameRef.current = requestAnimationFrame(loop);
  }, []);

  const startGameAudio = useCallback(() => {
    if (!soundEnabled) return;
    const bgm = bgmRef.current ?? new Audio(fruitSliceBgmUrl);
    bgmRef.current = bgm;
    bgm.loop = true;
    bgm.volume = 0.18;
    void bgm.play().catch(() => undefined);
  }, [soundEnabled]);

  const pauseGameAudio = useCallback(() => {
    bgmRef.current?.pause();
  }, []);

  const stopGameAudio = useCallback(() => {
    const bgm = bgmRef.current;
    if (bgm) {
      bgm.pause();
      bgm.currentTime = 0;
    }
    for (const voice of sliceVoicesRef.current) {
      voice.pause();
      voice.currentTime = 0;
    }
  }, []);

  const playFruitSliceSound = useCallback((swipeSpeed: number) => {
    if (!soundEnabled) return;
    let voice = sliceVoicesRef.current.find((candidate) => candidate.paused || candidate.ended);
    if (!voice && sliceVoicesRef.current.length < 6) {
      voice = new Audio(fruitSliceHitSoundUrl);
      sliceVoicesRef.current.push(voice);
    }
    voice ??= sliceVoicesRef.current[0];
    if (!voice) return;
    voice.currentTime = 0;
    voice.volume = 0.42;
    voice.playbackRate = Math.min(1.2, 0.9 + swipeSpeed * 0.08);
    void voice.play().catch(() => undefined);
  }, [soundEnabled]);

  const beginCountdown = () => {
    setCameraError(null);
    setCountdown(3);
    setPhase("countdown");
  };

  const enterFullscreen = () => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const startCamera = async () => {
    enterFullscreen();
    startGameAudio();
    setCameraError(null);
    setLoadingLabel("正在请求摄像头权限…");
    setUsingCamera(true);
    setPhase("loading");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!navigator.mediaDevices?.getUserMedia) {
      stopGameAudio();
      setCameraError("这个浏览器不能使用摄像头。可以切换到单人鼠标练习模式。");
      return;
    }
    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      stopGameAudio();
      setCameraError("摄像头需要在 localhost 或 HTTPS 页面中使用。可以先切换到鼠标练习模式。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 24, max: 24 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("摄像头舞台还没有准备好。");
      video.srcObject = stream;
      await video.play();
      setLoadingLabel("正在加载本机手部动作模型…");
      const tracker = new MediaPipeBodyHandTracker(mode);
      trackerRef.current = tracker;
      await Promise.all([tracker.initialize(), preloadCriticalFruitSliceAssets()]);
      void preloadFruitSliceAssets();
      startTrackingLoop();
      beginCountdown();
    } catch (error) {
      stopCamera();
      stopGameAudio();
      const name = error instanceof DOMException ? error.name : "";
      setCameraError(name === "NotAllowedError"
        ? "没有获得摄像头权限。请在地址栏允许摄像头，或使用单人鼠标练习模式。"
        : error instanceof Error ? error.message : "摄像头或动作模型没有准备好，请再试一次。");
    }
  };

  const startPointerMode = async () => {
    stopCamera();
    startGameAudio();
    if (mode === "versus") setMode("single");
    setUsingCamera(false);
    setCameraError(null);
    setLoadingLabel("正在准备鼠标练习场…");
    setPhase("loading");
    await preloadCriticalFruitSliceAssets();
    void preloadFruitSliceAssets();
    beginCountdown();
  };

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("playing");
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 850);
    return () => window.clearTimeout(timer);
  }, [countdown, phase]);

  const persistPendingSession = useCallback(async () => {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      const saved = await saveFruitSliceSession(pending);
      setEnergyAward(saved.energyCoinsEarned);
      setSaveState("saved");
      await refreshHistory();
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "本局战报暂时无法保存。");
    }
  }, [refreshHistory]);

  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    startedAtRef.current = new Date().toISOString();
    const engine = new FruitSliceEngine({
      canvas,
      video: usingCamera ? videoRef.current ?? undefined : undefined,
      mode,
      settings,
      players: selectedPlayers,
      reducedMotion,
      onHud: setHud,
      onFruitSlice: playFruitSliceSound,
      onEnd: (players, durationMs) => {
        stopGameAudio();
        setResults(players);
        setPhase("result");
        stopCamera();
        const pending = {
          eventId: crypto.randomUUID(),
          startedAt: startedAtRef.current,
          mode,
          durationMs,
          settings,
          players,
        };
        pendingSaveRef.current = pending;
        void persistPendingSession();
      },
    });
    engineRef.current = engine;
    setHud(null);
    engine.start();
    return () => {
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [mode, persistPendingSession, phase, playFruitSliceSound, reducedMotion, selectedPlayers, settings, stopCamera, stopGameAudio, usingCamera]);

  useEffect(() => () => {
    engineRef.current?.dispose();
    stopCamera();
    stopGameAudio();
  }, [stopCamera, stopGameAudio]);

  const resetToSetup = () => {
    engineRef.current?.dispose();
    engineRef.current = null;
    stopCamera();
    stopGameAudio();
    setPhase("setup");
    setHud(null);
    setResults(null);
    setSaveState("idle");
    setSaveError(null);
    setEnergyAward(0);
    pendingSaveRef.current = null;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
  };

  const renderSetup = () => (
    <main className="fruit-setup" aria-labelledby="fruit-title">
      <section className="fruit-setup-hero">
        <div className="fruit-hero-copy">
          <p className="fruit-kicker">体感游戏 · 全身一起动</p>
          <h1 id="fruit-title">挥动双手，<em>切开果能风暴！</em></h1>
          <p>摄像头只在这台电脑里识别手部位置。轻轻挥动就会留下平滑光轨，挥得越快，切中得分越高。</p>
          <div className="fruit-how-to" aria-label="玩法步骤">
            <span><b>1</b>站进画面</span><span><b>2</b>轻轻挥手</span><span><b>3</b>连续命中 ×3</span>
          </div>
        </div>
        <div className="fruit-hero-art" aria-hidden="true">
          <img src={FRUIT_SLICE_ASSETS.fruits.carrot.whole[0]} alt="" />
          <i /><i /><i />
        </div>
      </section>

      <section className="fruit-settings-panel" aria-labelledby="fruit-settings-title">
        <div className="fruit-panel-heading">
          <div><p>赛前控制台</p><h2 id="fruit-settings-title">先调好这一局</h2></div>
          <span>所有设置只在下一局生效</span>
        </div>

        <div className="fruit-settings-row">
          <SegmentButtons
            label="玩家人数"
            values={["single", "versus"] as const}
            value={mode}
            onChange={setMode}
            render={(value) => value === "single" ? "1 人挑战" : "2 人对战"}
          />
          <div className={`fruit-role-grid ${mode === "single" ? "is-single" : ""}`}>
            <RoleSelect label={mode === "single" ? "我是谁" : "左边是谁"} value={leftRole} onChange={setLeftRole} disabledRole={mode === "versus" ? rightRole : undefined} />
            {mode === "versus" && <RoleSelect label="右边是谁" value={rightRole} onChange={setRightRole} disabledRole={leftRole} />}
          </div>
        </div>

        <div className="fruit-settings-row">
          <SegmentButtons
            label="游戏时长 · 能量币上限 20 / 30 / 40 / 50"
            values={[30, 60, 90, 120] as const}
            value={settings.durationSeconds}
            onChange={(durationSeconds) => setSettings((current) => ({ ...current, durationSeconds }))}
            render={(value) => `${value} 秒`}
          />
          <SegmentButtons
            label="水果密度"
            values={["relaxed", "standard", "busy", "storm"] as const}
            value={settings.density}
            onChange={(density) => setSettings((current) => ({ ...current, density }))}
            render={(value) => DENSITY_LABELS[value]}
          />
        </div>

        <div className="fruit-range-grid">
          <label>
            <span><strong>飞行速度</strong><b>{settings.speedMultiplier.toFixed(2)}×</b></span>
            <input type="range" min="0.75" max="1.5" step="0.25" value={settings.speedMultiplier} onChange={(event) => setSettings((current) => ({ ...current, speedMultiplier: Number(event.target.value) }))} />
            <small>慢一点容易观察，快一点更有挑战。</small>
          </label>
          <label>
            <span><strong>物体大小</strong><b>{settings.fruitSize}px</b></span>
            <input type="range" min="128" max="256" step="16" value={settings.fruitSize} onChange={(event) => setSettings((current) => ({ ...current, fruitSize: Number(event.target.value) }))} />
            <small>默认 160px，大物体更适合全身挥动。</small>
          </label>
        </div>

        <div className="fruit-settings-row fruit-settings-effects">
          <SegmentButtons
            label="挥动灵敏度"
            values={["gentle", "standard", "strong"] as const}
            value={settings.swipeSensitivity}
            onChange={(swipeSensitivity) => setSettings((current) => ({ ...current, swipeSensitivity }))}
            render={(value) => SENSITIVITY_LABELS[value]}
          />
          <div className="fruit-toggle-grid">
            <ToggleSetting checked={settings.includeBombs} onChange={(includeBombs) => setSettings((current) => ({ ...current, includeBombs }))} title="炸弹" description="切中扣 30 分" />
            <ToggleSetting checked={settings.includeLobster} onChange={(includeLobster) => setSettings((current) => ({ ...current, includeLobster }))} title="龙虾" description="可以连续切 3 次" />
            <ToggleSetting checked={soundEnabled} onChange={setSoundEnabled} title="游戏声音" description="欢乐音乐与切中反馈" />
          </div>
        </div>

        <div className="fruit-start-actions">
          <button className="fruit-primary-button" type="button" onClick={() => void startCamera()}>
            <span aria-hidden="true">◉</span> 打开摄像头，进入游戏
          </button>
          <button className="fruit-secondary-button" type="button" onClick={() => void startPointerMode()}>
            不开摄像头 · 单人鼠标练习
          </button>
        </div>
        <aside className="fruit-privacy-note">
          <span aria-hidden="true">⌾</span>
          <p><strong>轻量本机识别：</strong>只运行手部模型，摄像头使用 640×360、24fps，推理约 15fps；画面不上传、不保存。</p>
        </aside>
      </section>
    </main>
  );

  const renderStage = () => (
    <main className={`fruit-game-stage phase-${phase} ${usingCamera ? "uses-camera" : "uses-pointer"}`}>
      {usingCamera && <video ref={videoRef} muted playsInline aria-label="镜像摄像头画面" />}
      <canvas ref={canvasRef} aria-label="切水果游戏画布" />
      <div className="fruit-vignette" aria-hidden="true" />

      {phase === "loading" && (
        <section className="fruit-calibration" aria-live="polite">
          <span className="fruit-loader" aria-hidden="true" /><h2>正在点亮手部雷达</h2><p>{loadingLabel}</p>
          {cameraError && (
            <div className="fruit-camera-error" role="alert">
              <p>{cameraError}</p>
              <button type="button" onClick={() => void startCamera()}>重新打开摄像头</button>
              <button type="button" onClick={() => void startPointerMode()}>单人鼠标练习</button>
              <button type="button" onClick={resetToSetup}>返回设置</button>
            </div>
          )}
        </section>
      )}

      {phase === "countdown" && (
        <section className="fruit-countdown" aria-live="assertive">
          <span>{countdown > 0 ? countdown : "GO"}</span>
          <p>{usingCamera ? "挥动手臂，切开飞来的食物！" : "移动鼠标或手指，切开飞来的食物！"}</p>
        </section>
      )}

      {phase === "playing" && (
        <>
          <header className="fruit-live-header">
            <div className="fruit-live-players">{hud?.players.map((player) => <PlayerHudCard player={player} key={player.side} />)}</div>
            <div className="fruit-clock" aria-label={`剩余时间 ${formatTime(hud?.remainingMs ?? settings.durationSeconds * 1_000)}`}>
              <small>剩余</small><strong>{formatTime(hud?.remainingMs ?? settings.durationSeconds * 1_000)}</strong>
            </div>
            <div className="fruit-live-controls">
              <button type="button" onClick={() => {
                const paused = !(hud?.paused ?? false);
                engineRef.current?.setPaused(paused);
                if (paused) pauseGameAudio();
                else startGameAudio();
              }}>{hud?.paused ? "继续" : "暂停"}</button>
              <button type="button" onClick={() => engineRef.current?.finish()}>结束本局</button>
            </div>
          </header>
          <div className="fruit-tracking-chip" aria-live="polite">
            {usingCamera ? `轻量手部雷达 · ${tracking.hands.length} 只手` : "鼠标练习模式"}
          </div>
          {hud?.paused && <div className="fruit-paused-overlay"><h2>游戏已暂停</h2><button type="button" onClick={() => { engineRef.current?.setPaused(false); startGameAudio(); }}>继续挥动</button></div>}
        </>
      )}

      {phase === "result" && results && (
        <section className="fruit-results" aria-labelledby="fruit-result-title">
          <p className="fruit-kicker">本局结算</p>
          <h2 id="fruit-result-title">
            {results.length === 2
              ? results[0]!.score === results[1]!.score ? "这局打成平手！" : `${[...results].sort((a, b) => b.score - a.score)[0]!.role} 赢得这一局！`
              : `${results[0]!.role}，挥得真有力量！`}
          </h2>
          <div className={`fruit-result-cards ${results.length === 1 ? "is-single" : ""}`}>
            {results.map((player) => (
              <article key={player.side}>
                <span>{player.role}</span><strong>{player.score}<small>分</small></strong>
                <dl>
                  <div><dt>切中食物</dt><dd>{player.fruitSlices}</dd></div>
                  <div><dt>龙虾连切</dt><dd>{player.lobsterSlices}</dd></div>
                  <div><dt>最高连击</dt><dd>{player.maxCombo}</dd></div>
                  <div><dt>超级模式</dt><dd>{player.superActivations}</dd></div>
                </dl>
                {player.role === "木木" && saveState === "saved" && (
                  <p className="fruit-energy-award"><img src={energyCoinUrl} alt="" />{player.score >= 500 ? `木木获得 ${energyAward} 枚能量币` : "达到 500 分就能获得能量币"}</p>
                )}
              </article>
            ))}
          </div>
          <div className={`fruit-save-status is-${saveState}`} aria-live="polite">
            {saveState === "saving" && "正在把本局写进家庭战报…"}
            {saveState === "saved" && `战报已保存 · 能量币余额 ${history?.energyCoinBalance ?? "已更新"}`}
            {saveState === "error" && <><span>{saveError}</span><button type="button" onClick={() => void persistPendingSession()}>重新保存</button></>}
          </div>
          <div className="fruit-result-actions">
            <button className="fruit-primary-button" type="button" onClick={resetToSetup}>调整设置，再来一局</button>
            <button className="fruit-secondary-button" type="button" onClick={() => setHistoryOpen(true)}>查看家庭战报</button>
            <a className="fruit-secondary-button" href="/">返回学习岛</a>
          </div>
        </section>
      )}
    </main>
  );

  return (
    <div className="fruit-slice-shell">
      <div className="fruit-space-glow" aria-hidden="true" />
      <header className="fruit-page-header">
        <a href="/" className="fruit-back-link">← 返回学习岛</a>
        <strong><span aria-hidden="true">✦</span> 切水果体感舱</strong>
        <div>
          <EnergyCoinPill balance={history?.energyCoinBalance ?? null} />
          <button type="button" onClick={() => setHistoryOpen(true)}>历史战报</button>
        </div>
      </header>
      {phase === "setup" ? renderSetup() : renderStage()}
      {historyOpen && <HistoryPanel history={history} loading={historyLoading} error={historyError} onClose={() => setHistoryOpen(false)} onRetry={() => void refreshHistory()} />}
    </div>
  );
}
