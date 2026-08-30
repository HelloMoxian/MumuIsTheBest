import { racerImage, type RacerThemeAssets } from "./assets";
import {
  collisionSpeed,
  cubicBezierValue,
  RACER_ACCELERATION,
  RACER_INITIAL_SPEED,
  RACER_MAX_DURATION_MS,
  RACER_ROAD_LENGTH,
} from "./logic";
import type {
  FaceFrame,
  RacerHudSnapshot,
  RacerLane,
  RacerStageConfig,
} from "./types";

type Obstacle = {
  id: number;
  lane: RacerLane;
  worldDistance: number;
  speed: number;
  sprite: string;
  driftPhase: number;
  hit: boolean;
};

type ProjectedRoad = {
  x: number;
  y: number;
  halfWidth: number;
  scale: number;
};

type EngineCallbacks = {
  onHud: (snapshot: RacerHudSnapshot) => void;
  onCollision: (snapshot: RacerHudSnapshot) => void;
  onFinish: (snapshot: RacerHudSnapshot) => void;
};

const VIEW_DISTANCE = 330;

function laneValue(lane: RacerLane) {
  return lane;
}

function imageReady(image: HTMLImageElement) {
  return image.complete && image.naturalWidth > 0;
}

function seededNoise(value: number) {
  const raw = Math.sin(value * 12.9898) * 43_758.5453;
  return raw - Math.floor(raw);
}

export class GalaxyRacerEngine {
  private readonly context: CanvasRenderingContext2D;
  private frameId = 0;
  private lastFrameAt = 0;
  private lastHudAt = 0;
  private elapsedMs = 0;
  private distance = 0;
  private speed = RACER_INITIAL_SPEED;
  private collisions = 0;
  private lane: RacerLane = 0;
  private laneVisual = 0;
  private laneAnimation?: {
    from: number;
    to: number;
    startedAt: number;
    duration: number;
  };
  private face: FaceFrame | null = null;
  private obstacles: Obstacle[] = [];
  private obstacleId = 1;
  private nextSpawnAt = 0;
  private collisionAt = -10_000;
  private laneChangeAt = -10_000;
  private laneChangeDirection: -1 | 1 = 1;
  private running = false;
  private paused = false;
  private finished = false;
  private reducedMotion = false;
  private dpr = 1;
  private width = 1;
  private height = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly video: HTMLVideoElement | null,
    private readonly stage: RacerStageConfig,
    private readonly theme: RacerThemeAssets,
    private readonly callbacks: EngineCallbacks,
  ) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("当前浏览器无法打开赛车画布。");
    this.context = context;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  start() {
    this.running = true;
    this.paused = false;
    this.lastFrameAt = performance.now();
    this.resize();
    this.frameId = requestAnimationFrame(this.render);
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.lastFrameAt = performance.now();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  setFace(face: FaceFrame | null) {
    this.face = face;
  }

  setLane(lane: RacerLane, now = performance.now()) {
    if (lane === this.lane) return;
    const direction = lane > this.laneVisual ? 1 : -1;
    this.lane = lane;
    this.laneAnimation = {
      from: this.laneVisual,
      to: laneValue(lane),
      startedAt: now,
      duration: this.reducedMotion ? 90 : Math.max(260, 420 - this.stage.level * 22),
    };
    this.laneChangeAt = now;
    this.laneChangeDirection = direction;
  }

  snapshot(): RacerHudSnapshot {
    return {
      distance: this.distance,
      elapsedMs: this.elapsedMs,
      speed: this.speed,
      collisions: this.collisions,
      lane: this.lane,
    };
  }

  private readonly render = (now: number) => {
    if (!this.running) return;
    this.resize();
    const deltaMs = Math.min(50, Math.max(0, now - this.lastFrameAt));
    this.lastFrameAt = now;
    if (!this.paused && !this.finished) this.update(deltaMs / 1_000, now);
    this.draw(now);
    if (now - this.lastHudAt >= 80) {
      this.callbacks.onHud(this.snapshot());
      this.lastHudAt = now;
    }
    this.frameId = requestAnimationFrame(this.render);
  };

  private update(deltaSeconds: number, now: number) {
    this.elapsedMs += deltaSeconds * 1_000;
    this.speed += RACER_ACCELERATION * deltaSeconds;
    this.distance += this.speed * deltaSeconds;

    if (this.laneAnimation) {
      const progress = (now - this.laneAnimation.startedAt) / this.laneAnimation.duration;
      if (progress >= 1) {
        this.laneVisual = this.laneAnimation.to;
        this.laneAnimation = undefined;
      } else {
        const eased = cubicBezierValue(progress, 0.1, 1.08);
        this.laneVisual = this.laneAnimation.from
          + (this.laneAnimation.to - this.laneAnimation.from) * eased;
      }
    }

    for (const obstacle of this.obstacles) {
      const ahead = obstacle.worldDistance - this.distance;
      const farProgress = Math.max(0, Math.min(1, (ahead - 8) / 160));
      const farEase = farProgress * farProgress * (3 - 2 * farProgress);
      obstacle.worldDistance += (
        obstacle.speed - this.stage.farApproachBoost * farEase
      ) * deltaSeconds;
    }
    this.obstacles = this.obstacles.filter((obstacle) => obstacle.worldDistance > this.distance - 35);
    while (this.distance >= this.nextSpawnAt && this.distance < RACER_ROAD_LENGTH - 115) {
      const activeVehicles = this.obstacles.filter((obstacle) => {
        const ahead = obstacle.worldDistance - this.distance;
        return ahead > -10 && ahead < VIEW_DISTANCE;
      }).length;
      const availableSlots = this.stage.maxVisibleVehicles - activeVehicles;
      if (availableSlots > 0) this.spawnGroup(availableSlots);
      this.nextSpawnAt += this.stage.spawnGap;
    }

    for (const obstacle of this.obstacles) {
      const ahead = obstacle.worldDistance - this.distance;
      if (
        !obstacle.hit
        && ahead >= -2
        && ahead <= 10
        && Math.abs(obstacle.lane - this.laneVisual) < 0.5
        && now - this.collisionAt > 1_200
      ) {
        obstacle.hit = true;
        this.speed = collisionSpeed(this.speed);
        this.collisions += 1;
        this.collisionAt = now;
        this.callbacks.onCollision(this.snapshot());
      }
    }

    if (this.distance >= RACER_ROAD_LENGTH || this.elapsedMs >= RACER_MAX_DURATION_MS) {
      this.distance = RACER_ROAD_LENGTH;
      this.finished = true;
      this.callbacks.onFinish(this.snapshot());
    }
  }

  private spawnGroup(availableSlots: number) {
    const seed = this.stage.level * 1_000 + this.obstacleId * 7 + Math.floor(this.distance);
    const firstLane = ([-1, 0, 1] as RacerLane[])[Math.floor(seededNoise(seed) * 3)];
    const lanes: RacerLane[] = [firstLane];
    if (availableSlots > 1 && seededNoise(seed + 2) < this.stage.doubleChance) {
      const candidates = ([-1, 0, 1] as RacerLane[]).filter((lane) => lane !== firstLane);
      lanes.push(candidates[Math.floor(seededNoise(seed + 3) * candidates.length)]);
    }
    for (const [index, lane] of lanes.entries()) {
      const speedRange = this.stage.obstacleSpeedMax - this.stage.obstacleSpeedMin;
      this.obstacles.push({
        id: this.obstacleId++,
        lane,
        worldDistance: this.distance + this.stage.reactionDistance + index * 4,
        speed: this.stage.obstacleSpeedMin + seededNoise(seed + index + 5) * speedRange,
        sprite: this.theme.obstacles[Math.floor(seededNoise(seed + index + 9) * this.theme.obstacles.length)],
        driftPhase: seededNoise(seed + index + 12) * Math.PI * 2,
        hit: false,
      });
    }
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = dpr;
  }

  private project(ahead: number): ProjectedRoad {
    const normalized = Math.max(0, Math.min(1, 1 - ahead / VIEW_DISTANCE));
    const depth = Math.pow(normalized, 1.55);
    const horizon = this.height * 0.19;
    const y = horizon + (this.height * 1.08 - horizon) * depth;
    const halfWidth = this.width * (0.055 + Math.pow(normalized, 1.24) * 0.58);
    const curve = Math.sin((this.distance + ahead) * 0.007 + this.stage.level * 0.8)
      * this.width * 0.035 * depth;
    return {
      x: this.width / 2 + curve,
      y,
      halfWidth,
      scale: 0.1 + depth * 0.9,
    };
  }

  private draw(now: number) {
    const ctx = this.context;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground(ctx);
    this.drawRoad(ctx);
    this.drawRoadsideProps(ctx);
    this.drawSpeedLines(ctx, now);
    this.drawObstacles(ctx, now);
    this.drawPlayer(ctx, now);
    this.drawCollisionEffect(ctx, now);
    this.drawFinishGlow(ctx);
  }

  private drawBackground(ctx: CanvasRenderingContext2D) {
    const background = racerImage(this.theme.background);
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, this.theme.id === "solar" ? "#1677e8" : "#080c50");
    gradient.addColorStop(0.55, this.theme.id === "crystal" ? "#7747dd" : "#176fe3");
    gradient.addColorStop(1, "#071b49");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    if (imageReady(background)) {
      const imageRatio = background.naturalWidth / background.naturalHeight;
      const drawHeight = this.height * 0.62;
      const drawWidth = Math.max(this.width, drawHeight * imageRatio);
      const parallax = Math.sin(this.distance * 0.0015) * this.width * 0.02;
      ctx.globalAlpha = 0.96;
      ctx.drawImage(background, (this.width - drawWidth) / 2 + parallax, 0, drawWidth, drawHeight);
      ctx.globalAlpha = 1;
    }
  }

  private drawRoad(ctx: CanvasRenderingContext2D) {
    for (let ahead = VIEW_DISTANCE; ahead > 0; ahead -= 10) {
      const far = this.project(ahead);
      const near = this.project(Math.max(0, ahead - 10));
      const stripe = Math.floor((this.distance + ahead) / 20) % 2;
      ctx.beginPath();
      ctx.moveTo(far.x - far.halfWidth, far.y);
      ctx.lineTo(far.x + far.halfWidth, far.y);
      ctx.lineTo(near.x + near.halfWidth, near.y);
      ctx.lineTo(near.x - near.halfWidth, near.y);
      ctx.closePath();
      ctx.fillStyle = stripe ? "rgba(23,50,110,.98)" : "rgba(29,61,129,.98)";
      ctx.fill();

      ctx.strokeStyle = this.theme.id === "solar" ? "rgba(255,209,72,.78)" : "rgba(38,225,255,.76)";
      ctx.lineWidth = Math.max(1, near.scale * 5);
      ctx.beginPath();
      ctx.moveTo(far.x - far.halfWidth, far.y);
      ctx.lineTo(near.x - near.halfWidth, near.y);
      ctx.moveTo(far.x + far.halfWidth, far.y);
      ctx.lineTo(near.x + near.halfWidth, near.y);
      ctx.stroke();

      if (Math.floor((this.distance + ahead) / 12) % 2 === 0) {
        ctx.strokeStyle = "rgba(212,245,255,.8)";
        ctx.lineWidth = Math.max(1, near.scale * 3);
        for (const divider of [-1 / 3, 1 / 3]) {
          ctx.beginPath();
          ctx.moveTo(far.x + far.halfWidth * divider, far.y);
          ctx.lineTo(near.x + near.halfWidth * divider, near.y);
          ctx.stroke();
        }
      }
    }
  }

  private drawRoadsideProps(ctx: CanvasRenderingContext2D) {
    const base = Math.floor(this.distance / 72) * 72;
    for (let world = base; world < this.distance + VIEW_DISTANCE; world += 72) {
      const ahead = world - this.distance + 35;
      if (ahead <= 8 || ahead > VIEW_DISTANCE) continue;
      const projection = this.project(ahead);
      const propIndex = Math.floor(world / 72) % this.theme.props.length;
      const image = racerImage(this.theme.props[propIndex]);
      if (!imageReady(image)) continue;
      const size = Math.max(15, 120 * projection.scale);
      const side = Math.floor(world / 72) % 2 === 0 ? -1 : 1;
      const x = projection.x + side * projection.halfWidth * 1.16;
      ctx.globalAlpha = Math.min(1, 0.35 + projection.scale);
      ctx.drawImage(image, x - size / 2, projection.y - size * 0.75, size, size);
      ctx.globalAlpha = 1;
    }
  }

  private drawObstacles(ctx: CanvasRenderingContext2D, now: number) {
    const visible = this.obstacles
      .map((obstacle) => ({ obstacle, ahead: obstacle.worldDistance - this.distance }))
      .filter(({ ahead }) => ahead > -10 && ahead < VIEW_DISTANCE)
      .sort((left, right) => right.ahead - left.ahead);
    for (const { obstacle, ahead } of visible) {
      const projection = this.project(Math.max(0, ahead));
      const drift = this.reducedMotion ? 0 : Math.sin(now * 0.0012 + obstacle.driftPhase) * 0.018;
      const x = projection.x + projection.halfWidth * 0.55 * (obstacle.lane + drift);
      const image = racerImage(obstacle.sprite);
      const size = Math.max(18, Math.min(this.width * 0.19, 188 * projection.scale));
      ctx.globalAlpha = obstacle.hit ? 0.64 : 1;
      if (imageReady(image)) {
        ctx.drawImage(image, x - size / 2, projection.y - size * 0.66, size, size);
      } else {
        ctx.fillStyle = "#ff7f8f";
        ctx.beginPath();
        ctx.roundRect(x - size / 2, projection.y - size * 0.35, size, size * 0.5, size * 0.2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawSpeedLines(ctx: CanvasRenderingContext2D, now: number) {
    if (this.reducedMotion || this.speed < 18) return;
    const intensity = Math.min(1, (this.speed - 18) / 22);
    ctx.save();
    ctx.globalAlpha = 0.14 + intensity * 0.23;
    ctx.lineCap = "round";
    for (let index = 0; index < 12; index += 1) {
      const seed = index * 31 + Math.floor(now / 90);
      const side = index % 2 === 0 ? -1 : 1;
      const x = this.width / 2 + side * (this.width * (0.18 + seededNoise(seed) * 0.42));
      const y = this.height * (0.35 + seededNoise(seed + 1) * 0.58);
      const length = 25 + intensity * 85 * seededNoise(seed + 2);
      ctx.strokeStyle = index % 3 === 0 ? "#ffd94a" : "#5ff2ff";
      ctx.lineWidth = 1.5 + intensity * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + side * 10, y + length * 0.45, x + side * 18, y + length);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, now: number) {
    const projection = this.project(0);
    const x = projection.x + projection.halfWidth * 0.55 * this.laneVisual;
    const playerY = this.height * 0.79;
    const size = Math.max(150, Math.min(286, this.width * 0.22));
    const colliding = now - this.collisionAt < 470;
    const changing = now - this.laneChangeAt < 430;
    const state = colliding
      ? "collision"
      : changing
        ? this.laneChangeDirection < 0 ? "left" : "right"
        : "neutral";
    const image = racerImage(this.theme.player[state]);
    const compress = colliding && !this.reducedMotion
      ? 1 - Math.sin(Math.min(1, (now - this.collisionAt) / 470) * Math.PI) * 0.1
      : 1;
    const shake = colliding && !this.reducedMotion
      ? Math.sin((now - this.collisionAt) * 0.08) * 8 * (1 - (now - this.collisionAt) / 470)
      : 0;

    if (changing && !this.reducedMotion) {
      const fromX = projection.x + projection.halfWidth * 0.55 * (this.laneAnimation?.from ?? this.laneVisual);
      ctx.save();
      ctx.strokeStyle = this.laneChangeDirection < 0 ? "rgba(99,237,255,.58)" : "rgba(255,211,70,.58)";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(fromX, playerY + size * 0.2);
      ctx.bezierCurveTo(
        fromX,
        playerY + size * 0.34,
        x - this.laneChangeDirection * size * 0.18,
        playerY + size * 0.36,
        x,
        playerY + size * 0.22,
      );
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x + shake, playerY);
    ctx.scale(1 / compress, compress);
    if (imageReady(image)) ctx.drawImage(image, -size / 2, -size * 0.57, size, size);
    this.drawFace(ctx, size);
    ctx.restore();
  }

  private drawFace(ctx: CanvasRenderingContext2D, size: number) {
    const centerY = -size * 0.315;
    const radiusX = size * 0.105;
    const radiusY = size * 0.13;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.clip();
    if (this.video && this.face && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const sourceWidth = this.video.videoWidth;
      const sourceHeight = this.video.videoHeight;
      const expandedWidth = this.face.width * 1.45;
      const expandedHeight = this.face.height * 1.75;
      const mirroredX = this.face.x + this.face.width / 2 - expandedWidth / 2;
      const sourceX = (1 - mirroredX - expandedWidth) * sourceWidth;
      const sourceY = (this.face.y + this.face.height / 2 - expandedHeight * 0.47) * sourceHeight;
      ctx.translate(radiusX, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this.video,
        Math.max(0, sourceX),
        Math.max(0, sourceY),
        Math.min(sourceWidth, expandedWidth * sourceWidth),
        Math.min(sourceHeight, expandedHeight * sourceHeight),
        0,
        centerY - radiusY,
        radiusX * 2,
        radiusY * 2,
      );
    } else {
      const glow = ctx.createRadialGradient(0, centerY - radiusY * 0.3, 2, 0, centerY, radiusY);
      glow.addColorStop(0, "#fff6ca");
      glow.addColorStop(1, "#38cce7");
      ctx.fillStyle = glow;
      ctx.fillRect(-radiusX, centerY - radiusY, radiusX * 2, radiusY * 2);
    }
    ctx.restore();
    ctx.strokeStyle = "#64f4ff";
    ctx.lineWidth = Math.max(3, size * 0.018);
    ctx.beginPath();
    ctx.ellipse(0, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawCollisionEffect(ctx: CanvasRenderingContext2D, now: number) {
    const age = now - this.collisionAt;
    if (age < 0 || age > 600) return;
    const image = racerImage(this.theme.vfx.collision);
    if (!imageReady(image)) return;
    const player = this.project(0);
    const x = player.x + player.halfWidth * 0.55 * this.laneVisual;
    const size = Math.min(this.width * 0.34, 380) * (0.75 + age / 1_200);
    ctx.globalAlpha = 1 - age / 600;
    ctx.drawImage(image, x - size / 2, this.height * 0.62 - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  private drawFinishGlow(ctx: CanvasRenderingContext2D) {
    const remaining = RACER_ROAD_LENGTH - this.distance;
    if (remaining > 180) return;
    const projection = this.project(Math.max(20, remaining));
    const pulse = this.reducedMotion ? 0.4 : 0.35 + Math.sin(this.elapsedMs * 0.006) * 0.12;
    const gradient = ctx.createRadialGradient(
      projection.x,
      projection.y,
      0,
      projection.x,
      projection.y,
      Math.max(80, projection.halfWidth * 1.4),
    );
    gradient.addColorStop(0, `rgba(255,225,88,${pulse})`);
    gradient.addColorStop(1, "rgba(85,236,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
  }
}
