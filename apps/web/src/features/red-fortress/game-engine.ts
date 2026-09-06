import { audioFocus } from "../../shared/audio/audio-focus";
import {
  ROAD_BOUNDS,
  STAGES,
  UNIT_ATLAS,
  UNIT_SPRITES,
  VFX_ATLAS,
  VFX_SPRITES,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  circlesOverlap,
  clamp,
  distanceBetween,
  getEnemyStats,
  getPowerTier,
  getStage,
  getStageProgress,
  normalized,
  selectNearestTarget,
  type BossPattern,
  type EnemyKind,
  type SpawnEvent,
  type StageDefinition,
  type Vector,
} from "./logic";

export type GamePhase =
  | "title"
  | "countdown"
  | "playing"
  | "boss-warning"
  | "boss"
  | "stage-clear"
  | "complete"
  | "paused";

export type PlayerSnapshot = {
  shield: number;
  maxShield: number;
  active: boolean;
  respawnSeconds: number;
  heavyCooldown: number;
};

export type GameSnapshot = {
  phase: GamePhase;
  phaseBeforePause?: GamePhase;
  assetsReady: boolean;
  stageIndex: number;
  stage: StageDefinition;
  progress: number;
  distance: number;
  countdown: number;
  score: number;
  stageScore: number;
  rescued: number;
  stageRescued: number;
  destroyed: number;
  stageDestroyed: number;
  respawns: number;
  stageRespawns: number;
  powerTier: number;
  scout: PlayerSnapshot;
  heavy: PlayerSnapshot;
  bossHp: number;
  bossMaxHp: number;
  bossShielded: boolean;
  soundEnabled: boolean;
  elapsedSeconds: number;
};

type PlayerId = "scout" | "heavy";

type PlayerEntity = Vector & {
  id: PlayerId;
  radius: number;
  heading: number;
  aim: Vector;
  target: Vector;
  shield: number;
  maxShield: number;
  active: boolean;
  respawn: number;
  invincible: number;
  fireCooldown: number;
  heavyCooldown: number;
};

type EnemyEntity = Vector & {
  id: number;
  kind: EnemyKind | "barrier";
  baseX: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  score: number;
  contactDamage: number;
  active: boolean;
  age: number;
  fireCooldown: number;
};

type RescueEntity = Vector & {
  id: number;
  radius: number;
  active: boolean;
  age: number;
};

type BossEntity = Vector & {
  id: number;
  pattern: BossPattern;
  radius: number;
  hp: number;
  maxHp: number;
  active: boolean;
  age: number;
  fireCooldown: number;
  shielded: boolean;
};

type BulletEntity = Vector & {
  id: number;
  owner: "player" | "enemy";
  source: PlayerId | "enemy";
  velocity: Vector;
  radius: number;
  damage: number;
  life: number;
  heavy: boolean;
};

type ParticleKind = "impact" | "explosion" | "bossExplosion" | "rescue" | "shield";

type ParticleEntity = Vector & {
  id: number;
  kind: ParticleKind;
  age: number;
  duration: number;
  size: number;
  velocity: Vector;
  rotation: number;
};

type EngineCallbacks = {
  onSnapshot: (snapshot: GameSnapshot) => void;
  onAnnouncement?: (message: string) => void;
};

const PLAYER_SPEED = 310;
const PLAYER_RADIUS = 30;
const RESPAWN_SECONDS = 1.8;
const INVINCIBLE_SECONDS = 1.5;
const MAX_ENEMIES = 38;
const MAX_BULLETS = 120;
const MAX_PARTICLES = 54;

const atlasCell = 256;

function rotateVector(vector: Vector, angle: number): Vector {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
}

function playerSnapshot(player: PlayerEntity): PlayerSnapshot {
  return {
    shield: player.shield,
    maxShield: player.maxShield,
    active: player.active,
    respawnSeconds: Math.max(0, player.respawn),
    heavyCooldown: Math.max(0, player.heavyCooldown),
  };
}

class ExpeditionAudio {
  private context?: AudioContext;
  private enabled = false;
  private beatTimer = 0;
  private beatIndex = 0;
  private effectThrottle = 0;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) {
      const AudioContextClass = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass && !this.context) this.context = new AudioContextClass();
      void this.context?.resume();
    } else {
      void this.context?.suspend();
    }
  }

  isEnabled() {
    return this.enabled;
  }

  update(deltaSeconds: number, intense: boolean) {
    if (!this.enabled || !this.context) return;
    this.beatTimer -= deltaSeconds;
    this.effectThrottle = Math.max(0, this.effectThrottle - deltaSeconds);
    if (audioFocus.isMusicActive() || audioFocus.isMicrophoneActive()) return;
    if (this.beatTimer > 0) return;
    const melody = intense
      ? [196, 247, 294, 392, 330, 294, 440, 330]
      : [164, 220, 247, 294, 247, 220, 330, 247];
    const frequency = melody[this.beatIndex % melody.length];
    this.tone(frequency, intense ? 0.15 : 0.19, 0.026, "triangle");
    if (this.beatIndex % 2 === 0) this.tone(frequency / 2, 0.1, 0.018, "sine");
    this.beatIndex += 1;
    this.beatTimer = intense ? 0.22 : 0.29;
  }

  effect(kind: "light" | "heavy" | "impact" | "rescue" | "warning" | "return") {
    if (!this.enabled || !this.context) return;
    if (kind === "light" && this.effectThrottle > 0) return;
    if (kind === "light") this.effectThrottle = 0.07;
    const settings = {
      light: [520, 0.045, 0.018, "square"],
      heavy: [120, 0.18, 0.055, "sawtooth"],
      impact: [170, 0.08, 0.032, "triangle"],
      rescue: [740, 0.2, 0.045, "sine"],
      warning: [92, 0.32, 0.06, "sawtooth"],
      return: [420, 0.24, 0.04, "triangle"],
    } as const;
    const [frequency, duration, gain, type] = settings[kind];
    this.tone(frequency, duration, gain, type);
    if (kind === "rescue" || kind === "return") {
      this.tone(frequency * 1.5, duration * 0.8, gain * 0.7, "sine", 0.08);
    }
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    delay = 0,
  ) {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const start = this.context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, frequency * 0.72), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  destroy() {
    void this.context?.close();
    this.context = undefined;
  }
}

export class RedFortressEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly callbacks: EngineCallbacks;
  private readonly audio = new ExpeditionAudio();
  private readonly keys = new Set<string>();
  private readonly reducedMotion: boolean;
  private readonly backgrounds = new Map<string, HTMLImageElement>();
  private unitAtlas = new Image();
  private vfxAtlas = new Image();
  private assetsReady = false;
  private frameId = 0;
  private lastFrame = 0;
  private lastSnapshotAt = 0;
  private nextId = 1;
  private phase: GamePhase = "title";
  private phaseBeforePause?: GamePhase;
  private phaseTimer = 0;
  private stageIndex = 0;
  private stage = STAGES[0];
  private distance = 0;
  private spawnIndex = 0;
  private score = 0;
  private stageScore = 0;
  private rescued = 0;
  private stageRescued = 0;
  private destroyed = 0;
  private stageDestroyed = 0;
  private respawns = 0;
  private stageRespawns = 0;
  private campaignStartedAt = performance.now();
  private stageStartedAt = performance.now();
  private shake = 0;
  private boss?: BossEntity;
  private readonly enemies: EnemyEntity[] = [];
  private readonly rescues: RescueEntity[] = [];
  private readonly bullets: BulletEntity[] = [];
  private readonly particles: ParticleEntity[] = [];
  private scout: PlayerEntity = this.makePlayer("scout");
  private heavy: PlayerEntity = this.makePlayer("heavy");

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法创建游戏画布。");
    this.context = context;
    this.callbacks = callbacks;
    this.canvas.width = WORLD_WIDTH;
    this.canvas.height = WORLD_HEIGHT;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.frameId = requestAnimationFrame(this.frame);
    this.emitSnapshot(true);
  }

  async loadAssets() {
    const backgroundLoads = STAGES.map(async (stage) => {
      const image = await this.loadImage(stage.backgroundUrl);
      if (image) this.backgrounds.set(stage.id, image);
    });
    const [unitAtlas, vfxAtlas] = await Promise.all([
      this.loadImage(UNIT_ATLAS),
      this.loadImage(VFX_ATLAS),
      ...backgroundLoads,
    ]);
    if (unitAtlas instanceof HTMLImageElement) this.unitAtlas = unitAtlas;
    if (vfxAtlas instanceof HTMLImageElement) this.vfxAtlas = vfxAtlas;
    this.assetsReady = true;
    this.emitSnapshot(true);
  }

  startCampaign() {
    this.score = 0;
    this.rescued = 0;
    this.destroyed = 0;
    this.respawns = 0;
    this.campaignStartedAt = performance.now();
    this.startStage(0);
  }

  startStage(index: number) {
    this.stageIndex = clamp(Math.floor(index), 0, STAGES.length - 1);
    this.stage = getStage(this.stageIndex);
    this.distance = 0;
    this.spawnIndex = 0;
    this.stageScore = 0;
    this.stageRescued = 0;
    this.stageDestroyed = 0;
    this.stageRespawns = 0;
    this.stageStartedAt = performance.now();
    this.enemies.length = 0;
    this.rescues.length = 0;
    this.bullets.length = 0;
    this.particles.length = 0;
    this.boss = undefined;
    this.scout = this.makePlayer("scout");
    this.heavy = this.makePlayer("heavy");
    this.phase = "countdown";
    this.phaseBeforePause = undefined;
    this.phaseTimer = 3.45;
    this.callbacks.onAnnouncement?.(`第 ${this.stage.number} 关，${this.stage.name}。准备出发。`);
    this.emitSnapshot(true);
  }

  restartStage() {
    this.score -= this.stageScore;
    this.rescued -= this.stageRescued;
    this.destroyed -= this.stageDestroyed;
    this.respawns -= this.stageRespawns;
    this.startStage(this.stageIndex);
  }

  continueAfterClear() {
    if (this.stageIndex >= STAGES.length - 1) {
      this.phase = "complete";
      this.callbacks.onAnnouncement?.("四段航线全部完成，双车远征成功！");
      this.emitSnapshot(true);
      return;
    }
    this.startStage(this.stageIndex + 1);
  }

  setSoundEnabled(enabled: boolean) {
    this.audio.setEnabled(enabled);
    this.emitSnapshot(true);
  }

  togglePause() {
    if (this.phase === "title" || this.phase === "complete" || this.phase === "stage-clear") return;
    if (this.phase === "paused") {
      this.phase = this.phaseBeforePause ?? "playing";
      this.phaseBeforePause = undefined;
      this.callbacks.onAnnouncement?.("继续任务。");
    } else {
      this.phaseBeforePause = this.phase;
      this.phase = "paused";
      this.callbacks.onAnnouncement?.("任务已暂停。");
    }
    this.emitSnapshot(true);
  }

  pauseForVisibility() {
    if (this.phase === "playing" || this.phase === "boss" || this.phase === "boss-warning") {
      this.phaseBeforePause = this.phase;
      this.phase = "paused";
      this.emitSnapshot(true);
    }
  }

  handleKeyDown(key: string) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "escape") {
      this.togglePause();
      return;
    }
    if (["w", "a", "s", "d", "j", "k"].includes(normalizedKey)) this.keys.add(normalizedKey);
  }

  handleKeyUp(key: string) {
    this.keys.delete(key.toLowerCase());
  }

  setVirtualKey(key: "w" | "a" | "s" | "d" | "j" | "k", pressed: boolean) {
    if (pressed) this.keys.add(key);
    else this.keys.delete(key);
  }

  moveScoutTarget(worldX: number, worldY: number) {
    if (!["playing", "boss", "boss-warning", "countdown"].includes(this.phase)) return;
    this.scout.target = {
      x: clamp(worldX, ROAD_BOUNDS.left + 30, ROAD_BOUNDS.right - 30),
      y: clamp(worldY, ROAD_BOUNDS.top + 35, ROAD_BOUNDS.bottom - 30),
    };
  }

  getSnapshot() {
    return this.createSnapshot();
  }

  destroy() {
    cancelAnimationFrame(this.frameId);
    this.audio.destroy();
    this.keys.clear();
  }

  private readonly frame = (timestamp: number) => {
    const rawDelta = this.lastFrame === 0 ? 0 : (timestamp - this.lastFrame) / 1000;
    const delta = clamp(rawDelta, 0, 0.034);
    this.lastFrame = timestamp;
    if (this.phase !== "paused" && this.phase !== "title" && this.phase !== "stage-clear" && this.phase !== "complete") {
      this.update(delta);
    }
    this.draw();
    this.emitSnapshot(false, timestamp);
    this.frameId = requestAnimationFrame(this.frame);
  };

  private update(delta: number) {
    if (this.phase === "countdown") {
      this.phaseTimer -= delta;
      this.updatePlayers(delta, false);
      this.updateParticles(delta);
      if (this.phaseTimer <= 0) {
        this.phase = "playing";
        this.callbacks.onAnnouncement?.("出发！沿着航标向前推进。");
        this.emitSnapshot(true);
      }
      return;
    }

    this.updateRespawns(delta);
    const hasActivePlayer = this.scout.active || this.heavy.active;
    if (!hasActivePlayer) {
      this.updateParticles(delta);
      return;
    }

    this.updatePlayers(delta, true);
    this.audio.update(delta, this.phase === "boss");

    if (this.phase === "boss-warning") {
      this.phaseTimer -= delta;
      this.updateEnemies(delta, false);
      this.updateBullets(delta);
      this.updateParticles(delta);
      if (this.phaseTimer <= 0) this.beginBoss();
      return;
    }

    if (this.phase === "playing") {
      this.distance = Math.min(this.stage.length, this.distance + this.stage.scrollSpeed * delta);
      this.spawnDueEvents();
      if (this.distance >= this.stage.length) {
        this.beginBossWarning();
      }
    }

    this.updateEnemies(delta, this.phase === "playing");
    this.updateBoss(delta);
    this.updateBullets(delta);
    this.updateRescues(delta);
    this.updateParticles(delta);
    this.resolvePlayerContacts();
    this.pruneEntities();
    this.shake = Math.max(0, this.shake - delta * 18);
  }

  private updateRespawns(delta: number) {
    for (const player of [this.scout, this.heavy]) {
      player.invincible = Math.max(0, player.invincible - delta);
      player.heavyCooldown = Math.max(0, player.heavyCooldown - delta);
      if (player.active) continue;
      player.respawn -= delta;
      if (player.respawn <= 0) {
        player.active = true;
        player.shield = player.maxShield;
        player.invincible = INVINCIBLE_SECONDS;
        player.x = player.id === "scout" ? 455 : 825;
        player.y = 610;
        player.target = { x: player.x, y: player.y - 70 };
        player.aim = { x: 0, y: -1 };
        this.addParticle("shield", player.x, player.y, 96);
        this.audio.effect("return");
        this.callbacks.onAnnouncement?.(`${player.id === "scout" ? "蓝色侦察车" : "橙色重装车"}已返回战场。`);
      }
    }
  }

  private updatePlayers(delta: number, canFire: boolean) {
    this.scout.fireCooldown = Math.max(0, this.scout.fireCooldown - delta);
    this.heavy.fireCooldown = Math.max(0, this.heavy.fireCooldown - delta);
    this.heavy.heavyCooldown = Math.max(0, this.heavy.heavyCooldown - delta);

    if (this.scout.active) {
      const distance = distanceBetween(this.scout, this.scout.target);
      if (distance > 6) {
        const direction = normalized(this.scout, this.scout.target);
        const step = Math.min(distance, PLAYER_SPEED * delta);
        this.scout.x += direction.x * step;
        this.scout.y += direction.y * step;
        this.scout.heading = Math.atan2(direction.y, direction.x) + Math.PI / 2;
      }
      this.keepPlayerInBounds(this.scout);
    }

    if (this.heavy.active) {
      const direction = {
        x: (this.keys.has("d") ? 1 : 0) - (this.keys.has("a") ? 1 : 0),
        y: (this.keys.has("s") ? 1 : 0) - (this.keys.has("w") ? 1 : 0),
      };
      const magnitude = Math.hypot(direction.x, direction.y);
      if (magnitude > 0) {
        direction.x /= magnitude;
        direction.y /= magnitude;
        this.heavy.x += direction.x * PLAYER_SPEED * delta;
        this.heavy.y += direction.y * PLAYER_SPEED * delta;
        this.heavy.aim = { ...direction };
        this.heavy.heading = Math.atan2(direction.y, direction.x) + Math.PI / 2;
      }
      this.keepPlayerInBounds(this.heavy);
    }

    this.applyTeamTether();
    if (!canFire) return;

    const tier = this.currentPowerTier();
    if (this.scout.active && this.scout.fireCooldown <= 0) {
      const candidates: Array<EnemyEntity | BossEntity> = this.enemies.filter((enemy) => enemy.active);
      if (this.boss?.active) candidates.push(this.boss);
      const target = selectNearestTarget(this.scout, candidates, 590);
      if (target) {
        const direction = normalized(this.scout, target);
        this.scout.aim = direction;
        this.scout.heading = Math.atan2(direction.y, direction.x) + Math.PI / 2;
        this.firePlayerVolley(this.scout, direction, tier, false);
        this.scout.fireCooldown = [0, 0.34, 0.27, 0.21, 0.16][tier];
      }
    }

    if (this.heavy.active && this.keys.has("j") && this.heavy.fireCooldown <= 0) {
      this.firePlayerVolley(this.heavy, this.heavy.aim, tier, false);
      this.heavy.fireCooldown = [0, 0.28, 0.23, 0.19, 0.15][tier];
    }
    if (this.heavy.active && this.keys.has("k") && this.heavy.heavyCooldown <= 0) {
      this.firePlayerVolley(this.heavy, this.heavy.aim, tier, true);
      this.heavy.heavyCooldown = Math.max(0.72, 1.2 - tier * 0.08);
    }
  }

  private applyTeamTether() {
    if (!this.scout.active || !this.heavy.active) return;
    const distance = distanceBetween(this.scout, this.heavy);
    if (distance <= 460) return;
    const direction = normalized(this.scout, this.heavy);
    const correction = (distance - 460) * 0.5;
    this.scout.x += direction.x * correction;
    this.scout.y += direction.y * correction;
    this.heavy.x -= direction.x * correction;
    this.heavy.y -= direction.y * correction;
    this.keepPlayerInBounds(this.scout);
    this.keepPlayerInBounds(this.heavy);
  }

  private firePlayerVolley(player: PlayerEntity, direction: Vector, tier: number, heavy: boolean) {
    const count = heavy ? 1 : tier >= 4 ? 3 : tier >= 2 ? 2 : 1;
    const spread = count === 1 ? [0] : count === 2 ? [-0.055, 0.055] : [-0.1, 0, 0.1];
    for (const angle of spread) {
      const shotDirection = rotateVector(direction, angle);
      this.bullets.push({
        id: this.nextId++,
        owner: "player",
        source: player.id,
        x: player.x + shotDirection.x * 32,
        y: player.y + shotDirection.y * 32,
        velocity: {
          x: shotDirection.x * (heavy ? 480 : 690),
          y: shotDirection.y * (heavy ? 480 : 690),
        },
        radius: heavy ? 14 : 7,
        damage: heavy ? 8 + tier : tier >= 3 ? 2 : 1,
        life: heavy ? 1.65 : 1.2,
        heavy,
      });
    }
    this.audio.effect(heavy ? "heavy" : "light");
  }

  private spawnDueEvents() {
    while (
      this.spawnIndex < this.stage.spawns.length
      && this.stage.spawns[this.spawnIndex].distance <= this.distance
    ) {
      this.spawnEvent(this.stage.spawns[this.spawnIndex]);
      this.spawnIndex += 1;
    }
  }

  private spawnEvent(event: SpawnEvent) {
    const x = ROAD_BOUNDS.left + event.lane * (ROAD_BOUNDS.right - ROAD_BOUNDS.left);
    const y = -70 - (event.delay ?? 0);
    if (event.kind === "rescue") {
      this.rescues.push({ id: this.nextId++, x, y, radius: 31, active: true, age: 0 });
      return;
    }
    if (this.enemies.length >= MAX_ENEMIES) return;
    if (event.kind === "barrier") {
      this.enemies.push({
        id: this.nextId++,
        kind: "barrier",
        x,
        y,
        baseX: x,
        radius: 40,
        hp: 6,
        maxHp: 6,
        speed: 0,
        score: 120,
        contactDamage: 1,
        active: true,
        age: 0,
        fireCooldown: 99,
      });
      return;
    }
    const stats = getEnemyStats(event.kind);
    this.enemies.push({
      id: this.nextId++,
      kind: event.kind,
      x,
      y,
      baseX: x,
      radius: stats.radius,
      hp: stats.hp + Math.floor(this.stageIndex / 2),
      maxHp: stats.hp + Math.floor(this.stageIndex / 2),
      speed: stats.speed,
      score: stats.score,
      contactDamage: stats.contactDamage,
      active: true,
      age: 0,
      fireCooldown: 0.8 + Math.random() * 1.4,
    });
  }

  private updateEnemies(delta: number, scrollWorld: boolean) {
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      enemy.age += delta;
      const scroll = scrollWorld ? this.stage.scrollSpeed : 18;
      const mobileSpeed = ["buggy", "hover", "boat", "drone"].includes(enemy.kind) ? enemy.speed : 0;
      enemy.y += (scroll + mobileSpeed) * delta;
      if (enemy.kind === "buggy" || enemy.kind === "hover") {
        enemy.x = enemy.baseX + Math.sin(enemy.age * (enemy.kind === "buggy" ? 2.5 : 1.65)) * 58;
      } else if (enemy.kind === "drone") {
        enemy.x = enemy.baseX + Math.sin(enemy.age * 3.1) * 94;
      } else if (enemy.kind === "boat") {
        enemy.x = enemy.baseX + Math.sin(enemy.age * 1.3) * 32;
      }
      enemy.x = clamp(enemy.x, ROAD_BOUNDS.left + 25, ROAD_BOUNDS.right - 25);
      enemy.fireCooldown -= delta;
      if (
        enemy.fireCooldown <= 0
        && enemy.y > 55
        && enemy.y < 520
        && !["mine", "barrier", "shield"].includes(enemy.kind)
      ) {
        const target = this.nearestActivePlayer(enemy);
        if (target) {
          const direction = normalized(enemy, target);
          const speed = enemy.kind === "rocket" ? 285 : 245;
          this.fireEnemyBullet(enemy.x, enemy.y, direction, speed, enemy.kind === "rocket" ? 2 : 1);
          enemy.fireCooldown = enemy.kind === "turret" ? 1.55 : enemy.kind === "rocket" ? 2.15 : 2.45;
        }
      }
    }
  }

  private updateRescues(delta: number) {
    for (const rescue of this.rescues) {
      if (!rescue.active) continue;
      rescue.age += delta;
      rescue.y += this.stage.scrollSpeed * delta;
      for (const player of [this.scout, this.heavy]) {
        if (player.active && circlesOverlap(rescue, rescue.radius, player, player.radius)) {
          rescue.active = false;
          this.stageRescued += 1;
          this.rescued += 1;
          this.score += 250;
          this.stageScore += 250;
          this.addParticle("rescue", rescue.x, rescue.y, 92);
          this.audio.effect("rescue");
          const tier = this.currentPowerTier();
          this.callbacks.onAnnouncement?.(`营救成功！团队火力现在是 ${tier} 级。`);
          this.emitSnapshot(true);
          break;
        }
      }
    }
  }

  private beginBossWarning() {
    if (this.phase !== "playing") return;
    this.phase = "boss-warning";
    this.phaseTimer = 2.6;
    this.bullets.splice(0, this.bullets.length, ...this.bullets.filter((bullet) => bullet.owner === "player"));
    for (const enemy of this.enemies) {
      if (enemy.y < 210) enemy.active = false;
    }
    this.audio.effect("warning");
    this.callbacks.onAnnouncement?.(`Boss 警报：${this.stage.bossName}正在进入战场。`);
    this.emitSnapshot(true);
  }

  private beginBoss() {
    this.enemies.length = 0;
    this.bullets.length = 0;
    this.phase = "boss";
    this.boss = {
      id: this.nextId++,
      pattern: this.stage.bossPattern,
      x: WORLD_WIDTH / 2,
      y: -120,
      radius: this.stage.bossPattern === "core" ? 104 : 88,
      hp: this.stage.bossHp,
      maxHp: this.stage.bossHp,
      active: true,
      age: 0,
      fireCooldown: 1.2,
      shielded: false,
    };
    this.emitSnapshot(true);
  }

  private updateBoss(delta: number) {
    const boss = this.boss;
    if (!boss?.active || this.phase !== "boss") return;
    boss.age += delta;
    if (boss.y < 142) boss.y = Math.min(142, boss.y + 115 * delta);
    const healthRatio = boss.hp / boss.maxHp;
    const speedScale = healthRatio < 0.4 ? 1.35 : 1;
    const amplitude = boss.pattern === "core" ? 260 : boss.pattern === "drill" ? 210 : 300;
    boss.x = WORLD_WIDTH / 2 + Math.sin(boss.age * speedScale * (boss.pattern === "owl" ? 1.2 : 0.82)) * amplitude;
    boss.y = Math.max(118, boss.y + Math.sin(boss.age * 1.7) * 0.35);
    boss.shielded = (
      (boss.pattern === "owl" && Math.sin(boss.age * 0.9) > 0.76)
      || (boss.pattern === "core" && Math.sin(boss.age * 0.72) > 0.58)
    );
    boss.fireCooldown -= delta;
    if (boss.fireCooldown > 0 || boss.y < 100) return;

    const target = this.nearestActivePlayer(boss);
    if (!target) return;
    const aimed = normalized(boss, target);
    if (boss.pattern === "crab") {
      for (const angle of [-0.18, 0, 0.18]) this.fireEnemyBullet(boss.x, boss.y + 35, rotateVector(aimed, angle), 285, 1);
      boss.fireCooldown = healthRatio < 0.45 ? 0.78 : 1.15;
    } else if (boss.pattern === "owl") {
      for (const angle of [-0.45, -0.22, 0, 0.22, 0.45]) {
        this.fireEnemyBullet(boss.x, boss.y + 25, rotateVector({ x: 0, y: 1 }, angle), 270, 1);
      }
      boss.fireCooldown = 1.25;
    } else if (boss.pattern === "drill") {
      this.fireEnemyBullet(boss.x, boss.y + 45, aimed, 360, 2, true);
      boss.fireCooldown = healthRatio < 0.45 ? 0.8 : 1.35;
    } else {
      for (let index = 0; index < 8; index += 1) {
        this.fireEnemyBullet(
          boss.x,
          boss.y,
          rotateVector({ x: 0, y: 1 }, (Math.PI * 2 * index) / 8 + boss.age * 0.15),
          245,
          1,
        );
      }
      boss.fireCooldown = healthRatio < 0.5 ? 0.82 : 1.18;
    }
  }

  private fireEnemyBullet(x: number, y: number, direction: Vector, speed: number, damage: number, heavy = false) {
    if (this.bullets.length >= MAX_BULLETS) return;
    this.bullets.push({
      id: this.nextId++,
      owner: "enemy",
      source: "enemy",
      x,
      y,
      velocity: { x: direction.x * speed, y: direction.y * speed },
      radius: heavy ? 13 : 8,
      damage,
      life: 3.8,
      heavy,
    });
  }

  private updateBullets(delta: number) {
    for (const bullet of this.bullets) {
      if (bullet.life <= 0) continue;
      bullet.x += bullet.velocity.x * delta;
      bullet.y += bullet.velocity.y * delta;
      bullet.life -= delta;

      if (bullet.owner === "player") {
        let hit = false;
        for (const enemy of this.enemies) {
          if (!enemy.active || !circlesOverlap(bullet, bullet.radius, enemy, enemy.radius)) continue;
          this.damageEnemy(enemy, bullet.damage, bullet.heavy);
          hit = true;
          break;
        }
        const boss = this.boss;
        if (!hit && boss?.active && circlesOverlap(bullet, bullet.radius, boss, boss.radius)) {
          if (boss.shielded) {
            this.addParticle("shield", bullet.x, bullet.y, 52);
          } else {
            boss.hp -= bullet.damage;
            this.addParticle("impact", bullet.x, bullet.y, bullet.heavy ? 48 : 28);
            if (bullet.heavy) {
              this.damageEnemiesInRadius(bullet, 92, Math.ceil(bullet.damage * 0.45));
              this.shake = this.reducedMotion ? 0 : 7;
            }
            if (boss.hp <= 0) this.defeatBoss();
          }
          hit = true;
        }
        if (hit) bullet.life = 0;
      } else {
        for (const player of [this.scout, this.heavy]) {
          if (
            player.active
            && player.invincible <= 0
            && circlesOverlap(bullet, bullet.radius, player, player.radius)
          ) {
            bullet.life = 0;
            this.damagePlayer(player, bullet.damage);
            break;
          }
        }
      }
    }
  }

  private damageEnemy(enemy: EnemyEntity, damage: number, splash: boolean) {
    enemy.hp -= damage;
    this.addParticle("impact", enemy.x, enemy.y, splash ? 46 : 26);
    if (splash) {
      this.damageEnemiesInRadius(enemy, 86, Math.max(2, Math.floor(damage * 0.4)), enemy.id);
      this.shake = this.reducedMotion ? 0 : 5;
    }
    if (enemy.hp > 0) return;
    enemy.active = false;
    this.destroyed += 1;
    this.stageDestroyed += 1;
    this.score += enemy.score;
    this.stageScore += enemy.score;
    this.addParticle("explosion", enemy.x, enemy.y, enemy.radius * 2.5);
    this.audio.effect("impact");
  }

  private damageEnemiesInRadius(center: Vector, radius: number, damage: number, excludedId?: number) {
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.id === excludedId || distanceBetween(center, enemy) > radius) continue;
      enemy.hp -= damage;
      if (enemy.hp <= 0) {
        enemy.active = false;
        this.destroyed += 1;
        this.stageDestroyed += 1;
        this.score += enemy.score;
        this.stageScore += enemy.score;
        this.addParticle("explosion", enemy.x, enemy.y, enemy.radius * 2.4);
      }
    }
  }

  private damagePlayer(player: PlayerEntity, damage: number) {
    if (!player.active || player.invincible > 0) return;
    player.shield -= damage;
    player.invincible = 0.48;
    this.addParticle("impact", player.x, player.y, 42);
    this.shake = this.reducedMotion ? 0 : 4;
    if (player.shield > 0) return;
    player.active = false;
    player.respawn = RESPAWN_SECONDS;
    player.shield = 0;
    this.respawns += 1;
    this.stageRespawns += 1;
    this.addParticle("explosion", player.x, player.y, 108);
    this.callbacks.onAnnouncement?.(`${player.id === "scout" ? "蓝色侦察车" : "橙色重装车"}正在呼叫无限支援。`);
    this.emitSnapshot(true);
  }

  private resolvePlayerContacts() {
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      for (const player of [this.scout, this.heavy]) {
        if (!player.active || player.invincible > 0) continue;
        if (circlesOverlap(enemy, enemy.radius * 0.82, player, player.radius)) {
          this.damagePlayer(player, enemy.contactDamage);
          if (enemy.kind === "mine" || enemy.kind === "buggy") {
            enemy.active = false;
            this.addParticle("explosion", enemy.x, enemy.y, 78);
          }
        }
      }
    }
  }

  private defeatBoss() {
    const boss = this.boss;
    if (!boss?.active) return;
    boss.active = false;
    boss.hp = 0;
    this.destroyed += 1;
    this.stageDestroyed += 1;
    const bossScore = 1800 + this.stageIndex * 600;
    this.score += bossScore;
    this.stageScore += bossScore;
    for (let index = 0; index < (this.reducedMotion ? 3 : 10); index += 1) {
      this.addParticle(
        "bossExplosion",
        boss.x + (Math.random() - 0.5) * 150,
        boss.y + (Math.random() - 0.5) * 110,
        100 + Math.random() * 90,
      );
    }
    this.shake = this.reducedMotion ? 0 : 12;
    this.phase = "stage-clear";
    this.callbacks.onAnnouncement?.(`${this.stage.bossName}已停止，${this.stage.name}航线完成。`);
    this.emitSnapshot(true);
  }

  private addParticle(kind: ParticleKind, x: number, y: number, size: number) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      id: this.nextId++,
      kind,
      x,
      y,
      age: 0,
      duration: kind === "bossExplosion" ? 1.15 : kind === "rescue" ? 0.85 : 0.55,
      size,
      velocity: this.reducedMotion
        ? { x: 0, y: 0 }
        : { x: (Math.random() - 0.5) * 22, y: (Math.random() - 0.5) * 22 },
      rotation: Math.random() * Math.PI * 2,
    });
  }

  private updateParticles(delta: number) {
    for (const particle of this.particles) {
      particle.age += delta;
      particle.x += particle.velocity.x * delta;
      particle.y += particle.velocity.y * delta;
      particle.rotation += delta * 1.2;
    }
  }

  private pruneEntities() {
    const removeInactive = <T extends { active: boolean; y: number }>(items: T[]) => {
      for (let index = items.length - 1; index >= 0; index -= 1) {
        if (!items[index].active || items[index].y > WORLD_HEIGHT + 100) items.splice(index, 1);
      }
    };
    removeInactive(this.enemies);
    removeInactive(this.rescues);
    for (let index = this.bullets.length - 1; index >= 0; index -= 1) {
      const bullet = this.bullets[index];
      if (
        bullet.life <= 0
        || bullet.x < -90
        || bullet.x > WORLD_WIDTH + 90
        || bullet.y < -90
        || bullet.y > WORLD_HEIGHT + 90
      ) this.bullets.splice(index, 1);
    }
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      if (this.particles[index].age >= this.particles[index].duration) this.particles.splice(index, 1);
    }
  }

  private nearestActivePlayer(origin: Vector) {
    const activePlayers = [this.scout, this.heavy].filter((player) => player.active);
    return selectNearestTarget(
      origin,
      activePlayers.map((player, index) => ({ ...player, id: index, active: true })),
      1200,
    );
  }

  private keepPlayerInBounds(player: PlayerEntity) {
    player.x = clamp(player.x, ROAD_BOUNDS.left + player.radius, ROAD_BOUNDS.right - player.radius);
    player.y = clamp(player.y, ROAD_BOUNDS.top + player.radius, ROAD_BOUNDS.bottom - player.radius);
  }

  private makePlayer(id: PlayerId): PlayerEntity {
    const x = id === "scout" ? 455 : 825;
    return {
      id,
      x,
      y: 610,
      radius: PLAYER_RADIUS,
      heading: 0,
      aim: { x: 0, y: -1 },
      target: { x, y: 540 },
      shield: 3,
      maxShield: 3,
      active: true,
      respawn: 0,
      invincible: 0,
      fireCooldown: 0,
      heavyCooldown: 0,
    };
  }

  private currentPowerTier() {
    return getPowerTier(this.stageRescued + (this.stageIndex > 0 ? 2 : 0));
  }

  private async loadImage(url: string): Promise<HTMLImageElement | undefined> {
    return await new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(undefined);
      image.src = url;
    });
  }

  private draw() {
    const context = this.context;
    context.save();
    context.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    if (this.shake > 0 && !this.reducedMotion) {
      context.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this.drawBackground();
    this.drawRoadSignals();
    this.drawRescues();
    this.drawEnemies();
    this.drawBoss();
    this.drawPlayers();
    this.drawBullets();
    this.drawParticles();
    this.drawCanvasStatus();
    context.restore();
  }

  private drawBackground() {
    const context = this.context;
    const image = this.backgrounds.get(this.stage.id);
    if (image?.complete && image.naturalWidth > 0) {
      if (this.reducedMotion) {
        context.drawImage(image, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      } else {
        const offset = (this.distance * 0.13) % WORLD_HEIGHT;
        context.drawImage(image, 0, offset - WORLD_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT);
        context.drawImage(image, 0, offset, WORLD_WIDTH, WORLD_HEIGHT);
      }
    } else {
      const gradient = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
      gradient.addColorStop(0, "#25205d");
      gradient.addColorStop(0.55, "#113a53");
      gradient.addColorStop(1, "#0e0d2b");
      context.fillStyle = gradient;
      context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }
    const roadShade = context.createLinearGradient(0, 0, WORLD_WIDTH, 0);
    roadShade.addColorStop(0, "rgba(7, 8, 29, .62)");
    roadShade.addColorStop(0.18, "rgba(7, 8, 29, .1)");
    roadShade.addColorStop(0.5, "rgba(8, 11, 35, .26)");
    roadShade.addColorStop(0.82, "rgba(7, 8, 29, .1)");
    roadShade.addColorStop(1, "rgba(7, 8, 29, .62)");
    context.fillStyle = roadShade;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.fillStyle = "rgba(8, 10, 32, .16)";
    context.fillRect(ROAD_BOUNDS.left, 0, ROAD_BOUNDS.right - ROAD_BOUNDS.left, WORLD_HEIGHT);
  }

  private drawRoadSignals() {
    const context = this.context;
    context.save();
    context.lineWidth = 3;
    context.setLineDash([24, 28]);
    context.lineDashOffset = this.reducedMotion ? 0 : this.distance * 0.7;
    context.strokeStyle = this.stage.accent;
    context.globalAlpha = 0.52;
    context.beginPath();
    context.moveTo(ROAD_BOUNDS.left + 20, 0);
    context.lineTo(ROAD_BOUNDS.left + 20, WORLD_HEIGHT);
    context.moveTo(ROAD_BOUNDS.right - 20, 0);
    context.lineTo(ROAD_BOUNDS.right - 20, WORLD_HEIGHT);
    context.stroke();
    context.restore();

    const propKey = `${this.stage.id}Prop` as keyof typeof VFX_SPRITES;
    const prop = VFX_SPRITES[propKey];
    for (let index = 0; index < 4; index += 1) {
      const y = ((index * 238 + this.distance * 0.42) % (WORLD_HEIGHT + 220)) - 110;
      this.drawAtlas(this.vfxAtlas, prop.column, prop.row, 108, y, 135, 0, 0.78);
      this.drawAtlas(this.vfxAtlas, prop.column, prop.row, WORLD_WIDTH - 108, y + 116, 135, Math.PI, 0.78);
    }
  }

  private drawPlayers() {
    for (const player of [this.scout, this.heavy]) {
      if (!player.active) continue;
      const sprite = player.id === "scout" ? UNIT_SPRITES.scout : UNIT_SPRITES.heavy;
      const alpha = player.invincible > 0 && Math.floor(player.invincible * 10) % 2 === 0 ? 0.52 : 1;
      this.drawAtlas(this.unitAtlas, sprite.column, sprite.row, player.x, player.y, player.id === "scout" ? 86 : 94, player.heading, alpha);
      this.context.save();
      this.context.strokeStyle = player.id === "scout" ? "#59e7ff" : "#ff9c66";
      this.context.lineWidth = 4;
      this.context.globalAlpha = 0.88;
      this.context.beginPath();
      this.context.arc(player.x, player.y, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (player.shield / player.maxShield));
      this.context.stroke();
      this.context.restore();
    }
    if (this.scout.active) {
      this.context.save();
      this.context.strokeStyle = "rgba(89, 231, 255, .9)";
      this.context.lineWidth = 3;
      this.context.setLineDash([7, 7]);
      this.context.beginPath();
      this.context.arc(this.scout.target.x, this.scout.target.y, 19, 0, Math.PI * 2);
      this.context.moveTo(this.scout.target.x - 28, this.scout.target.y);
      this.context.lineTo(this.scout.target.x + 28, this.scout.target.y);
      this.context.moveTo(this.scout.target.x, this.scout.target.y - 28);
      this.context.lineTo(this.scout.target.x, this.scout.target.y + 28);
      this.context.stroke();
      this.context.restore();
    }
  }

  private drawEnemies() {
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      if (enemy.kind === "barrier") {
        const sprite = VFX_SPRITES.barrier;
        this.drawAtlas(this.vfxAtlas, sprite.column, sprite.row, enemy.x, enemy.y, 88, 0, 1);
      } else {
        const sprite = UNIT_SPRITES[enemy.kind];
        const rotation = enemy.kind === "drone" ? enemy.age * 0.22 : Math.PI;
        this.drawAtlas(this.unitAtlas, sprite.column, sprite.row, enemy.x, enemy.y, enemy.radius * 2.65, rotation, 1);
      }
      if (enemy.hp < enemy.maxHp) this.drawHealthBar(enemy.x, enemy.y - enemy.radius - 16, 64, enemy.hp / enemy.maxHp);
    }
  }

  private drawRescues() {
    for (const rescue of this.rescues) {
      if (!rescue.active) continue;
      const sprite = UNIT_SPRITES.rescue;
      const bob = this.reducedMotion ? 0 : Math.sin(rescue.age * 3) * 5;
      this.drawAtlas(this.unitAtlas, sprite.column, sprite.row, rescue.x, rescue.y + bob, 82, 0, 1);
      this.context.save();
      this.context.strokeStyle = "#4ce0a3";
      this.context.lineWidth = 3;
      this.context.globalAlpha = 0.65;
      this.context.beginPath();
      this.context.arc(rescue.x, rescue.y + bob, 42 + Math.sin(rescue.age * 4) * 3, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
    }
  }

  private drawBoss() {
    const boss = this.boss;
    if (!boss?.active) return;
    const rotation = boss.pattern === "core" && !this.reducedMotion ? boss.age * 0.18 : Math.PI;
    this.drawAtlas(this.unitAtlas, this.stage.bossAtlasColumn, 3, boss.x, boss.y, boss.radius * 2.55, rotation, 1);
    if (boss.shielded) {
      this.context.save();
      this.context.strokeStyle = "#9beeff";
      this.context.lineWidth = 7;
      this.context.globalAlpha = 0.76;
      this.context.beginPath();
      this.context.arc(boss.x, boss.y, boss.radius + 17, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
    }
  }

  private drawBullets() {
    for (const bullet of this.bullets) {
      if (bullet.life <= 0) continue;
      const sprite = bullet.owner === "enemy"
        ? VFX_SPRITES.enemyBullet
        : bullet.heavy
          ? VFX_SPRITES.heavyBullet
          : VFX_SPRITES.lightBullet;
      const rotation = Math.atan2(bullet.velocity.y, bullet.velocity.x) + Math.PI / 2;
      this.drawAtlas(
        this.vfxAtlas,
        sprite.column,
        sprite.row,
        bullet.x,
        bullet.y,
        bullet.heavy ? 42 : 24,
        rotation,
        1,
      );
    }
  }

  private drawParticles() {
    const spriteForParticle = {
      impact: VFX_SPRITES.smallImpact,
      explosion: VFX_SPRITES.explosion,
      bossExplosion: VFX_SPRITES.bossExplosion,
      rescue: VFX_SPRITES.rescueStar,
      shield: VFX_SPRITES.shieldBurst,
    } as const;
    for (const particle of this.particles) {
      const progress = clamp(particle.age / particle.duration, 0, 1);
      const sprite = spriteForParticle[particle.kind];
      const scale = particle.kind === "rescue" ? 0.65 + progress * 0.7 : 0.55 + progress * 0.65;
      this.drawAtlas(
        this.vfxAtlas,
        sprite.column,
        sprite.row,
        particle.x,
        particle.y,
        particle.size * scale,
        particle.rotation,
        1 - progress,
      );
    }
  }

  private drawCanvasStatus() {
    const context = this.context;
    if (this.phase === "countdown") {
      const number = Math.ceil(this.phaseTimer);
      context.save();
      context.fillStyle = "rgba(9, 8, 37, .48)";
      context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "900 128px ui-rounded, sans-serif";
      context.fillStyle = "#ffffff";
      context.shadowColor = this.stage.accent;
      context.shadowBlur = 34;
      context.fillText(number > 0 ? String(number) : "出发", WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
      context.font = "900 26px ui-rounded, sans-serif";
      context.fillStyle = "#dffbff";
      context.fillText(this.stage.name, WORLD_WIDTH / 2, WORLD_HEIGHT / 2 + 105);
      context.restore();
    }
    if (this.phase === "boss-warning") {
      context.save();
      context.fillStyle = "rgba(28, 8, 48, .42)";
      context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      context.textAlign = "center";
      context.font = "900 64px ui-rounded, sans-serif";
      context.fillStyle = "#fff1b0";
      context.shadowColor = "#ff67c7";
      context.shadowBlur = 30;
      context.fillText("BOSS 警报", WORLD_WIDTH / 2, 300);
      context.font = "900 34px ui-rounded, sans-serif";
      context.fillStyle = "#ffffff";
      context.fillText(this.stage.bossName, WORLD_WIDTH / 2, 360);
      context.restore();
    }
    if (this.phase === "paused") {
      context.save();
      context.fillStyle = "rgba(6, 6, 28, .72)";
      context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      context.restore();
    }
  }

  private drawAtlas(
    image: HTMLImageElement,
    column: number,
    row: number,
    x: number,
    y: number,
    size: number,
    rotation: number,
    alpha: number,
  ) {
    const context = this.context;
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.globalAlpha = alpha;
    if (image.complete && image.naturalWidth > 0) {
      context.drawImage(
        image,
        column * atlasCell,
        row * atlasCell,
        atlasCell,
        atlasCell,
        -size / 2,
        -size / 2,
        size,
        size,
      );
    } else {
      context.fillStyle = column < 2 ? "#59e7ff" : "#ff67c7";
      context.beginPath();
      context.arc(0, 0, size * 0.36, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private drawHealthBar(x: number, y: number, width: number, ratio: number) {
    const context = this.context;
    context.save();
    context.fillStyle = "rgba(9, 8, 35, .8)";
    context.fillRect(x - width / 2, y, width, 7);
    context.fillStyle = ratio > 0.5 ? "#4ce0a3" : ratio > 0.25 ? "#ffd166" : "#ff7596";
    context.fillRect(x - width / 2, y, width * clamp(ratio, 0, 1), 7);
    context.strokeStyle = "rgba(255,255,255,.7)";
    context.strokeRect(x - width / 2, y, width, 7);
    context.restore();
  }

  private createSnapshot(): GameSnapshot {
    return {
      phase: this.phase,
      phaseBeforePause: this.phaseBeforePause,
      assetsReady: this.assetsReady,
      stageIndex: this.stageIndex,
      stage: this.stage,
      progress: getStageProgress(this.distance, this.stage),
      distance: this.distance,
      countdown: Math.max(0, Math.ceil(this.phaseTimer)),
      score: this.score,
      stageScore: this.stageScore,
      rescued: this.rescued,
      stageRescued: this.stageRescued,
      destroyed: this.destroyed,
      stageDestroyed: this.stageDestroyed,
      respawns: this.respawns,
      stageRespawns: this.stageRespawns,
      powerTier: this.currentPowerTier(),
      scout: playerSnapshot(this.scout),
      heavy: playerSnapshot(this.heavy),
      bossHp: Math.max(0, this.boss?.hp ?? 0),
      bossMaxHp: this.boss?.maxHp ?? this.stage.bossHp,
      bossShielded: this.boss?.shielded ?? false,
      soundEnabled: this.audio.isEnabled(),
      elapsedSeconds: Math.max(0, (performance.now() - this.campaignStartedAt) / 1000),
    };
  }

  private emitSnapshot(force: boolean, timestamp = performance.now()) {
    if (!force && timestamp - this.lastSnapshotAt < 90) return;
    this.lastSnapshotAt = timestamp;
    this.callbacks.onSnapshot(this.createSnapshot());
  }
}
