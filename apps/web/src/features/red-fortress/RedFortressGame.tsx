import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { HERO_ART, STAGES } from "./logic";
import {
  RedFortressEngine,
  type GameSnapshot,
  type PlayerSnapshot,
} from "./game-engine";
import "./red-fortress.css";

const initialPlayer: PlayerSnapshot = {
  shield: 3,
  maxShield: 3,
  active: true,
  respawnSeconds: 0,
  heavyCooldown: 0,
};

const initialSnapshot: GameSnapshot = {
  phase: "title",
  assetsReady: false,
  stageIndex: 0,
  stage: STAGES[0],
  progress: 0,
  distance: 0,
  countdown: 0,
  score: 0,
  stageScore: 0,
  rescued: 0,
  stageRescued: 0,
  destroyed: 0,
  stageDestroyed: 0,
  respawns: 0,
  stageRespawns: 0,
  powerTier: 1,
  scout: initialPlayer,
  heavy: initialPlayer,
  bossHp: 0,
  bossMaxHp: STAGES[0].bossHp,
  bossShielded: false,
  soundEnabled: false,
  elapsedSeconds: 0,
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function ShieldMeter({ player, color }: { player: PlayerSnapshot; color: "cyan" | "coral" }) {
  if (!player.active) {
    return (
      <span className="red-fortress-respawn" role="status">
        支援返回中 · {player.respawnSeconds.toFixed(1)} 秒
      </span>
    );
  }
  return (
    <span className={`red-fortress-shields is-${color}`} aria-label={`护盾 ${player.shield} / ${player.maxShield}`}>
      {Array.from({ length: player.maxShield }, (_, index) => (
        <i key={index} className={index < player.shield ? "is-filled" : ""} aria-hidden="true" />
      ))}
      <b>{player.shield}/{player.maxShield}</b>
    </span>
  );
}

function PlayerHud({
  kind,
  label,
  controls,
  player,
}: {
  kind: "scout" | "heavy";
  label: string;
  controls: string;
  player: PlayerSnapshot;
}) {
  return (
    <section className={`red-fortress-player-card is-${kind}`} aria-label={label}>
      <span className="red-fortress-player-icon" aria-hidden="true">
        <img
          src="/images/red-fortress/unit-atlas.webp"
          alt=""
          className={kind === "heavy" ? "is-heavy" : ""}
        />
      </span>
      <span className="red-fortress-player-copy">
        <strong>{label}</strong>
        <small>{controls}</small>
        <ShieldMeter player={player} color={kind === "scout" ? "cyan" : "coral"} />
      </span>
      <span className="red-fortress-infinity">∞ <small>无限支援</small></span>
    </section>
  );
}

function RoutePreview({ activeIndex, complete = false }: { activeIndex: number; complete?: boolean }) {
  return (
    <ol className="red-fortress-route" aria-label="四关远征航线">
      {STAGES.map((stage, index) => {
        const isCompleted = complete || index < activeIndex;
        const isCurrent = !complete && index === activeIndex;
        return (
          <li
            key={stage.id}
            className={isCompleted ? "is-complete" : isCurrent ? "is-current" : ""}
          >
            <span>{isCompleted ? "✓" : stage.number}</span>
            <div>
              <strong>{stage.name}</strong>
              <small>{stage.bossName}</small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function RedFortressGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RedFortressEngine | undefined>(undefined);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [announcement, setAnnouncement] = useState("正在准备双车远征。");
  const [fatalError, setFatalError] = useState("");
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    try {
      const engine = new RedFortressEngine(canvas, {
        onSnapshot: (nextSnapshot) => {
          if (alive) setSnapshot(nextSnapshot);
        },
        onAnnouncement: (message) => {
          if (alive) setAnnouncement(message);
        },
      });
      engineRef.current = engine;
      void engine.loadAssets();

      const keyDown = (event: KeyboardEvent) => {
        if (["w", "a", "s", "d", "j", "k", "escape"].includes(event.key.toLowerCase())) {
          event.preventDefault();
          engine.handleKeyDown(event.key);
        }
      };
      const keyUp = (event: KeyboardEvent) => engine.handleKeyUp(event.key);
      const visibility = () => {
        if (document.hidden) engine.pauseForVisibility();
      };
      window.addEventListener("keydown", keyDown);
      window.addEventListener("keyup", keyUp);
      document.addEventListener("visibilitychange", visibility);
      return () => {
        alive = false;
        window.removeEventListener("keydown", keyDown);
        window.removeEventListener("keyup", keyUp);
        document.removeEventListener("visibilitychange", visibility);
        engine.destroy();
        engineRef.current = undefined;
      };
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : "游戏画布启动失败。");
      return;
    }
  }, []);

  const moveScout = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    engineRef.current?.moveScoutTarget(
      ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    );
    canvas.focus();
  };

  const setVirtualKey = (key: "w" | "a" | "s" | "d" | "j" | "k", pressed: boolean) => {
    engineRef.current?.setVirtualKey(key, pressed);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      setAnnouncement("浏览器没有进入全屏，仍可以在当前窗口继续玩。");
    }
  };

  const stageStyle = {
    "--stage-accent": snapshot.stage.accent,
    "--stage-glow": snapshot.stage.glow,
  } as CSSProperties;

  const showGameHud = snapshot.phase !== "title";
  const isBoss = snapshot.phase === "boss" || snapshot.phase === "boss-warning";

  return (
    <div className="red-fortress-page" style={stageStyle}>
      <div className="red-fortress-stars" aria-hidden="true" />
      <header className="red-fortress-topbar">
        <a className="red-fortress-back" href="/#games">← 返回游戏 Tab</a>
        <div className="red-fortress-brand">
          <span className="red-fortress-brand-mark" aria-hidden="true">RF</span>
          <span>
            <strong>赤色要塞</strong>
            <small>双车星际远征</small>
          </span>
        </div>
        <div className="red-fortress-top-actions">
          <button
            type="button"
            className={snapshot.soundEnabled ? "is-active" : ""}
            aria-pressed={snapshot.soundEnabled}
            onClick={() => engineRef.current?.setSoundEnabled(!snapshot.soundEnabled)}
          >
            {snapshot.soundEnabled ? "♫ 声音开" : "♩ 声音关"}
          </button>
          <button type="button" onClick={() => setHelpOpen(true)}>？ 操作说明</button>
          <button type="button" onClick={() => void toggleFullscreen()}>⛶ 全屏</button>
          {showGameHud && (
            <button type="button" onClick={() => engineRef.current?.togglePause()}>
              {snapshot.phase === "paused" ? "▶ 继续" : "Ⅱ 暂停"}
            </button>
          )}
        </div>
      </header>

      <main className="red-fortress-main">
        <section className="red-fortress-stage-shell" ref={stageRef}>
          {showGameHud && (
            <>
              <div className="red-fortress-hud">
                <PlayerHud
                  kind="scout"
                  label="1P 蓝色侦察车"
                  controls="点击移动 · 自动开火"
                  player={snapshot.scout}
                />
                <div className="red-fortress-mission-hud">
                  <div>
                    <span>第 {snapshot.stage.number}/4 关</span>
                    <strong>{snapshot.stage.name}</strong>
                    <small>{Math.round(snapshot.distance)} / {snapshot.stage.length} 米</small>
                  </div>
                  <progress max={1} value={snapshot.progress} aria-label="本关推进距离" />
                  <div className="red-fortress-team-stats">
                    <span>火力 <b>LV.{snapshot.powerTier}</b></span>
                    <span>营救 <b>{snapshot.stageRescued}</b></span>
                    <span>得分 <b>{snapshot.score}</b></span>
                  </div>
                </div>
                <PlayerHud
                  kind="heavy"
                  label="2P 橙色重装车"
                  controls="WASD 移动 · J 轻炮 · K 重炮"
                  player={snapshot.heavy}
                />
              </div>

              {isBoss && (
                <div className="red-fortress-boss-bar" role="status">
                  <span aria-hidden="true">◆</span>
                  <div>
                    <small>{snapshot.stage.bossSubtitle}</small>
                    <strong>{snapshot.stage.bossName}</strong>
                  </div>
                  <progress
                    max={snapshot.bossMaxHp}
                    value={snapshot.phase === "boss-warning" ? snapshot.bossMaxHp : snapshot.bossHp}
                    aria-label={`${snapshot.stage.bossName}生命`}
                  />
                  <b>{snapshot.bossShielded ? "护盾开启" : `${Math.ceil(snapshot.bossHp)} / ${snapshot.bossMaxHp}`}</b>
                </div>
              )}
            </>
          )}

          <div className="red-fortress-canvas-frame">
            <canvas
              ref={canvasRef}
              className="red-fortress-canvas"
              tabIndex={0}
              aria-label="双车远征战场。鼠标点击移动蓝色侦察车；键盘 WASD 移动橙色重装车，J 发射轻炮，K 发射重炮。"
              onPointerDown={moveScout}
              onContextMenu={(event) => event.preventDefault()}
            />

            {snapshot.phase === "title" && (
              <div className="red-fortress-title-screen">
                <img src={HERO_ART} alt="" aria-hidden="true" />
                <div className="red-fortress-title-shade" />
                <div className="red-fortress-title-content">
                  <p className="red-fortress-kicker"><span>原创双人闯关</span> · 4 个完整关卡</p>
                  <h1><span>赤色</span>要塞</h1>
                  <p className="red-fortress-lead">
                    一辆车跟着鼠标出发，一辆车由键盘驾驶。一起营救科研员、升级火力、穿越四座星际要塞。
                  </p>
                  <div className="red-fortress-control-cards">
                    <article>
                      <span className="control-orb is-blue">1P</span>
                      <div><strong>蓝色侦察车</strong><small>点击目标地点 · 自动锁敌开火</small></div>
                    </article>
                    <article>
                      <span className="control-orb is-orange">2P</span>
                      <div><strong>橙色重装车</strong><small>WASD 移动 · J 轻炮 · K 重炮</small></div>
                    </article>
                    <article className="is-infinite">
                      <span className="control-orb">∞</span>
                      <div><strong>无限支援</strong><small>护盾耗尽后会在安全区自动返回</small></div>
                    </article>
                  </div>
                  <button
                    type="button"
                    className="red-fortress-start"
                    disabled={!snapshot.assetsReady || Boolean(fatalError)}
                    onClick={() => engineRef.current?.startCampaign()}
                  >
                    {fatalError ? "画布暂不可用" : snapshot.assetsReady ? "▶ 开始双车远征" : "正在装载坦克与地图…"}
                  </button>
                  <small className="red-fortress-sound-note">声音默认关闭，可在右上角主动打开原创合成音乐与音效。</small>
                </div>
                <RoutePreview activeIndex={0} />
              </div>
            )}

            {snapshot.phase === "paused" && (
              <div className="red-fortress-overlay">
                <div className="red-fortress-dialog" role="dialog" aria-modal="true" aria-labelledby="pause-title">
                  <span className="red-fortress-dialog-icon" aria-hidden="true">Ⅱ</span>
                  <p className="red-fortress-kicker">任务暂停</p>
                  <h2 id="pause-title">车辆停在安全航标</h2>
                  <p>第 {snapshot.stage.number} 关 · 营救 {snapshot.stageRescued} · 本关得分 {snapshot.stageScore}</p>
                  <div className="red-fortress-dialog-actions">
                    <button type="button" className="primary" onClick={() => engineRef.current?.togglePause()}>▶ 继续任务</button>
                    <button
                      type="button"
                      className={restartConfirm ? "danger-confirm" : ""}
                      onClick={() => {
                        if (restartConfirm) {
                          setRestartConfirm(false);
                          engineRef.current?.restartStage();
                        } else {
                          setRestartConfirm(true);
                        }
                      }}
                    >
                      {restartConfirm ? "再点一次，确认重开本关" : "↻ 重新开始本关"}
                    </button>
                    <a href="/#games">← 返回游戏 Tab</a>
                  </div>
                </div>
              </div>
            )}

            {snapshot.phase === "stage-clear" && (
              <div className="red-fortress-overlay is-clear">
                <div className="red-fortress-dialog red-fortress-clear-card" role="dialog" aria-modal="true" aria-labelledby="clear-title">
                  <span className="red-fortress-dialog-icon" aria-hidden="true">✓</span>
                  <p className="red-fortress-kicker">航线 {snapshot.stage.number}/4 已点亮</p>
                  <h2 id="clear-title">{snapshot.stage.name} · 通行</h2>
                  <p>{snapshot.stage.bossName}已经停止工作，两辆车可以继续前进。</p>
                  <div className="red-fortress-results">
                    <span><small>本关得分</small><strong>{snapshot.stageScore}</strong></span>
                    <span><small>成功营救</small><strong>{snapshot.stageRescued}</strong></span>
                    <span><small>击破设施</small><strong>{snapshot.stageDestroyed}</strong></span>
                    <span><small>支援返回</small><strong>{snapshot.stageRespawns}</strong></span>
                  </div>
                  <RoutePreview activeIndex={snapshot.stageIndex + 1} />
                  <button type="button" className="primary" onClick={() => engineRef.current?.continueAfterClear()}>
                    {snapshot.stageIndex === STAGES.length - 1 ? "查看远征成果 →" : `前往第 ${snapshot.stage.number + 1} 关 →`}
                  </button>
                </div>
              </div>
            )}

            {snapshot.phase === "complete" && (
              <div className="red-fortress-overlay is-complete">
                <div className="red-fortress-dialog red-fortress-complete-card" role="dialog" aria-modal="true" aria-labelledby="complete-title">
                  <span className="red-fortress-dialog-icon" aria-hidden="true">★</span>
                  <p className="red-fortress-kicker">双车远征完成</p>
                  <h2 id="complete-title">四座要塞，全部点亮！</h2>
                  <p>蓝色侦察车与橙色重装车安全抵达星环核心。</p>
                  <div className="red-fortress-results">
                    <span><small>团队总分</small><strong>{snapshot.score}</strong></span>
                    <span><small>科研员</small><strong>{snapshot.rescued}</strong></span>
                    <span><small>击破目标</small><strong>{snapshot.destroyed}</strong></span>
                    <span><small>远征时间</small><strong>{formatTime(snapshot.elapsedSeconds)}</strong></span>
                  </div>
                  <RoutePreview activeIndex={STAGES.length} complete />
                  <div className="red-fortress-dialog-actions is-row">
                    <button type="button" className="primary" onClick={() => engineRef.current?.startCampaign()}>↻ 再玩一次</button>
                    <a href="/#games">返回游戏 Tab</a>
                  </div>
                </div>
              </div>
            )}

            {fatalError && (
              <div className="red-fortress-overlay">
                <div className="red-fortress-dialog" role="alert">
                  <span className="red-fortress-dialog-icon" aria-hidden="true">!</span>
                  <h2>战场暂时没有打开</h2>
                  <p>{fatalError}</p>
                  <a className="primary" href="/#games">返回游戏 Tab</a>
                </div>
              </div>
            )}
          </div>

          {showGameHud && (
            <div className="red-fortress-mobile-controls" aria-label="橙色重装车屏幕备用控制">
              <div className="red-fortress-dpad">
                {(["w", "a", "s", "d"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`key-${key}`}
                    aria-label={{ w: "向上", a: "向左", s: "向下", d: "向右" }[key]}
                    onPointerDown={() => setVirtualKey(key, true)}
                    onPointerUp={() => setVirtualKey(key, false)}
                    onPointerCancel={() => setVirtualKey(key, false)}
                    onPointerLeave={() => setVirtualKey(key, false)}
                  >
                    {{ w: "↑", a: "←", s: "↓", d: "→" }[key]}
                  </button>
                ))}
              </div>
              <div className="red-fortress-fire-buttons">
                <button
                  type="button"
                  onPointerDown={() => setVirtualKey("j", true)}
                  onPointerUp={() => setVirtualKey("j", false)}
                  onPointerCancel={() => setVirtualKey("j", false)}
                  onPointerLeave={() => setVirtualKey("j", false)}
                >
                  <b>J</b><small>轻炮</small>
                </button>
                <button
                  type="button"
                  disabled={snapshot.heavy.heavyCooldown > 0}
                  onPointerDown={() => setVirtualKey("k", true)}
                  onPointerUp={() => setVirtualKey("k", false)}
                  onPointerCancel={() => setVirtualKey("k", false)}
                  onPointerLeave={() => setVirtualKey("k", false)}
                >
                  <b>{snapshot.heavy.heavyCooldown > 0 ? snapshot.heavy.heavyCooldown.toFixed(1) : "K"}</b>
                  <small>重炮</small>
                </button>
              </div>
            </div>
          )}
        </section>

        {helpOpen && (
          <div className="red-fortress-help-backdrop" role="presentation" onPointerDown={() => setHelpOpen(false)}>
            <section
              className="red-fortress-help"
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-title"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button type="button" className="red-fortress-help-close" onClick={() => setHelpOpen(false)}>× 关闭</button>
              <p className="red-fortress-kicker">操作说明</p>
              <h2 id="help-title">两辆车，一起向前</h2>
              <div className="red-fortress-help-grid">
                <article><b>1P</b><strong>蓝色侦察车</strong><p>直接点击战场上的地点。它会自动开过去，并自动向最近的敌人开火。</p></article>
                <article><b>2P</b><strong>橙色重装车</strong><p>使用 WASD 控制方向。按住 J 连续发射轻炮，按 K 发射可以范围命中的重炮。</p></article>
                <article><b>+</b><strong>营救升级</strong><p>碰到绿色救援舱就能营救科研员。营救越多，两辆车的轻炮火力等级越高。</p></article>
                <article><b>∞</b><strong>无限支援</strong><p>护盾用完不会结束。车辆短暂离场后会在安全区自动返回，关卡进度完整保留。</p></article>
              </div>
              <button type="button" className="primary" onClick={() => setHelpOpen(false)}>知道了，继续远征</button>
            </section>
          </div>
        )}

        <p className="red-fortress-live" aria-live="polite">{announcement}</p>
      </main>
    </div>
  );
}
