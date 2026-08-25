import { FRUIT_SLICE_ASSETS, gameImage } from "./assets";
import {
  bombPenalty,
  collisionRadiusForSize,
  evaluateSwipe,
  fruitWaveFormation,
  pairedLaneSpawn,
  pointToSegmentDistance,
  randomizedWaveDelay,
  recordSuccessfulSlice,
  resetCombo,
  scoreForSlice,
  smoothPoint,
  waveObjectCount,
  type ComboState,
  type SwipeSegment,
} from "./logic";
import {
  FRUIT_KINDS,
  type FruitKind,
  type FruitSliceSettings,
  type GameHud,
  type GameItemKind,
  type GameMode,
  type PlayerResult,
  type PlayerSelection,
  type PlayerSide,
  type Point,
  type TrackingFrame,
} from "./types";

type TrailPoint = Point & { time: number; speed: number; active: boolean };

type RuntimePlayer = PlayerResult & {
  comboState: ComboState;
  trails: Map<string, TrailPoint[]>;
};

type FlyingItem = {
  id: number;
  kind: GameItemKind;
  side: PlayerSide;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  spin: number;
  bornAt: number;
  size: number;
  hitsRemaining: number;
  lastHitAt: number;
};

type FlyingFragment = {
  id: number;
  sequence: readonly string[];
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  spin: number;
  size: number;
  bornAt: number;
};

type Splash = {
  id: number;
  sequence: readonly string[];
  x: number;
  y: number;
  size: number;
  bornAt: number;
};

type Shockwave = {
  id: number;
  x: number;
  y: number;
  bornAt: number;
  kind: "bomb" | "super";
};

type EngineOptions = {
  canvas: HTMLCanvasElement;
  video?: HTMLVideoElement;
  mode: GameMode;
  settings: FruitSliceSettings;
  players: PlayerSelection[];
  reducedMotion: boolean;
  onHud: (hud: GameHud) => void;
  onEnd: (players: PlayerResult[], durationMs: number) => void;
};

const FRUIT_SPLASH_INDEX: Readonly<Record<FruitKind, number>> = {
  carrot: 0,
  cucumber: 1,
  eggplant: 2,
  chicken: 0,
  fish: 3,
};

const FRUIT_FALLBACK_COLOR: Readonly<Record<FruitKind, string>> = {
  carrot: "#ffad33",
  cucumber: "#58d878",
  eggplant: "#b86fff",
  chicken: "#ffd166",
  fish: "#59e7ff",
};

const FLIGHT_TIME_SCALE = 0.5;

function mapCameraPointToField(
  point: Point,
  video: HTMLVideoElement,
  fieldWidth: number,
  fieldHeight: number,
): Point {
  const videoWidth = video.videoWidth || 16;
  const videoHeight = video.videoHeight || 9;
  const videoAspect = videoWidth / videoHeight;
  const fieldAspect = fieldWidth / fieldHeight;
  if (videoAspect > fieldAspect) {
    const visibleWidth = fieldAspect / videoAspect;
    const offset = (1 - visibleWidth) / 2;
    return { x: (point.x - offset) / visibleWidth, y: point.y };
  }
  const visibleHeight = videoAspect / fieldAspect;
  const offset = (1 - visibleHeight) / 2;
  return { x: point.x, y: (point.y - offset) / visibleHeight };
}

function frameAt(sequence: readonly string[], bornAt: number, now: number, loop = true) {
  if (sequence.length === 0) return undefined;
  const index = Math.floor((now - bornAt) / 50);
  return sequence[loop ? index % sequence.length : Math.min(index, sequence.length - 1)];
}

function drawCenteredImage(
  context: CanvasRenderingContext2D,
  url: string | undefined,
  x: number,
  y: number,
  size: number,
  rotation: number,
) {
  if (!url) return false;
  const image = gameImage(url);
  if (!image.complete || image.naturalWidth === 0) return false;
  const ratio = image.naturalWidth / image.naturalHeight;
  const width = ratio >= 1 ? size : size * ratio;
  const height = ratio >= 1 ? size / ratio : size;
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
  return true;
}

export class FruitSliceEngine {
  private readonly context: CanvasRenderingContext2D;
  private readonly players = new Map<PlayerSide, RuntimePlayer>();
  private readonly items: FlyingItem[] = [];
  private readonly fragments: FlyingFragment[] = [];
  private readonly splashes: Splash[] = [];
  private readonly shockwaves: Shockwave[] = [];
  private animationFrame = 0;
  private lastFrameAt = 0;
  private nextSpawnAt = 0;
  private lastHudAt = -Infinity;
  private remainingMs: number;
  private elapsedMs = 0;
  private nextId = 1;
  private paused = false;
  private stopped = false;

  constructor(private readonly options: EngineOptions) {
    const context = options.canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("当前浏览器无法创建切水果画布。");
    this.context = context;
    this.remainingMs = options.settings.durationSeconds * 1_000;
    for (const selection of options.players) {
      this.players.set(selection.side, {
        ...selection,
        score: 0,
        fruitSlices: 0,
        lobsterSlices: 0,
        bombsHit: 0,
        maxCombo: 0,
        fastestSwipe: 0,
        superActivations: 0,
        comboState: { combo: 0, lastHitAt: 0, recentHits: [], superUntil: 0 },
        trails: new Map(),
      });
    }
  }

  start() {
    this.options.canvas.addEventListener("pointermove", this.handlePointer, { passive: false });
    this.options.canvas.addEventListener("pointerdown", this.handlePointer, { passive: false });
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  updateTracking(frame: TrackingFrame, now = performance.now()) {
    const width = Math.max(1, this.options.canvas.clientWidth);
    const height = Math.max(1, this.options.canvas.clientHeight);
    for (const hand of frame.hands) {
      const point = this.options.video
        ? mapCameraPointToField(hand.point, this.options.video, width, height)
        : hand.point;
      if (point.x < -0.1 || point.x > 1.1 || point.y < -0.1 || point.y > 1.1) continue;
      this.recordHandPoint(hand.id, hand.side, point, now);
    }
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.lastFrameAt = performance.now();
    this.emitHud(performance.now(), true);
  }

  finish() {
    this.complete();
  }

  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    cancelAnimationFrame(this.animationFrame);
    this.options.canvas.removeEventListener("pointermove", this.handlePointer);
    this.options.canvas.removeEventListener("pointerdown", this.handlePointer);
  }

  private readonly handlePointer = (event: PointerEvent) => {
    if (this.options.video || this.paused || this.stopped) return;
    event.preventDefault();
    const bounds = this.options.canvas.getBoundingClientRect();
    const point = {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
    const side: PlayerSide = this.options.mode === "single" ? "full" : point.x < 0.5 ? "left" : "right";
    this.recordHandPoint(`pointer-${event.pointerId}`, side, point, performance.now());
  };

  private recordHandPoint(id: string, side: PlayerSide, rawPoint: Point, now: number) {
    const player = this.players.get(side);
    if (!player) return;
    const trail = player.trails.get(id) ?? [];
    const previous = trail.at(-1);
    const point = smoothPoint(previous, rawPoint);
    let speed = 0;
    let active = false;
    if (previous) {
      const segment = evaluateSwipe(previous, point, now - previous.time, this.options.settings.swipeSensitivity);
      speed = segment.speed;
      active = segment.active;
      if (active && !this.paused) this.sliceItems(player, segment, now);
    }
    trail.push({ ...point, time: now, speed, active });
    while (trail.length > 18 || (trail[0] && now - trail[0].time > 520)) trail.shift();
    player.trails.set(id, trail);
  }

  private sliceItems(player: RuntimePlayer, segment: SwipeSegment, now: number) {
    const width = Math.max(1, this.options.canvas.clientWidth);
    const height = Math.max(1, this.options.canvas.clientHeight);
    const from = { x: segment.from.x * width, y: segment.from.y * height };
    const to = { x: segment.to.x * width, y: segment.to.y * height };
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index]!;
      if (item.side !== player.side || now - item.lastHitAt < 150) continue;
      const distance = pointToSegmentDistance(
        { x: item.x * width, y: item.y * height },
        from,
        to,
      );
      if (distance > collisionRadiusForSize(item.size)) continue;
      item.lastHitAt = now;
      player.fastestSwipe = Math.max(player.fastestSwipe, Math.min(100, segment.speed));

      if (item.kind === "bomb") {
        player.score -= bombPenalty();
        player.bombsHit += 1;
        player.comboState = resetCombo(player.comboState);
        this.shockwaves.push({ id: this.nextId++, x: item.x, y: item.y, bornAt: now, kind: "bomb" });
        this.items.splice(index, 1);
        continue;
      }

      const combo = recordSuccessfulSlice(player.comboState, now);
      player.comboState = combo.state;
      player.maxCombo = Math.max(player.maxCombo, combo.state.combo);
      if (combo.activated) {
        player.superActivations += 1;
        this.shockwaves.push({ id: this.nextId++, x: item.x, y: item.y, bornAt: now, kind: "super" });
      }
      player.score += scoreForSlice(segment.speed, combo.multiplier);

      if (item.kind === "lobster") {
        player.lobsterSlices += 1;
        item.hitsRemaining -= 1;
        if (item.hitsRemaining > 0) {
          item.velocityY -= 0.18;
          item.spin *= -1.15;
          continue;
        }
        this.fragments.push({
          id: this.nextId++,
          sequence: FRUIT_SLICE_ASSETS.lobsterFragments,
          x: item.x,
          y: item.y,
          velocityX: item.velocityX,
          velocityY: item.velocityY - 0.25,
          rotation: item.rotation,
          spin: item.spin,
          size: item.size * 1.12,
          bornAt: now,
        });
        this.items.splice(index, 1);
        continue;
      }

      player.fruitSlices += 1;
      this.addFruitCut(item, now);
      this.items.splice(index, 1);
    }
  }

  private addFruitCut(item: FlyingItem, now: number) {
    const kind = item.kind as FruitKind;
    const asset = FRUIT_SLICE_ASSETS.fruits[kind];
    for (let half = 0; half < 2; half += 1) {
      this.fragments.push({
        id: this.nextId++,
        sequence: asset.halves[half]!,
        x: item.x,
        y: item.y,
        velocityX: item.velocityX + (half === 0 ? -0.24 : 0.24),
        velocityY: item.velocityY - 0.12 + half * 0.04,
        rotation: item.rotation,
        spin: item.spin + (half === 0 ? -2.6 : 2.6),
        size: item.size * 0.75,
        bornAt: now,
      });
    }
    this.splashes.push({
      id: this.nextId++,
      sequence: FRUIT_SLICE_ASSETS.splashes[FRUIT_SPLASH_INDEX[kind]]!,
      x: item.x,
      y: item.y,
      size: item.size * 1.45,
      bornAt: now,
    });
  }

  private readonly tick = (now: number) => {
    if (this.stopped) return;
    this.resizeCanvas();
    const deltaSeconds = this.lastFrameAt ? Math.min(0.04, (now - this.lastFrameAt) / 1_000) : 0;
    this.lastFrameAt = now;
    if (!this.paused) {
      this.remainingMs = Math.max(0, this.remainingMs - deltaSeconds * 1_000);
      this.elapsedMs += deltaSeconds * 1_000;
      this.updateWorld(deltaSeconds, now);
    }
    this.render(now);
    this.emitHud(now);
    if (this.remainingMs <= 0) {
      this.complete();
      return;
    }
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private updateWorld(deltaSeconds: number, now: number) {
    const bombOnScreen = this.items.some((item) => item.kind === "bomb");
    if (now >= this.nextSpawnAt && !bombOnScreen) {
      this.spawnGroup(now);
      this.nextSpawnAt = now + randomizedWaveDelay(this.options.settings.density);
    } else if (bombOnScreen) {
      // 炸弹独占屏幕，避免前后波次因半速飞行叠在一起，打断连续切水果。
      this.nextSpawnAt = Math.max(this.nextSpawnAt, now + 180);
    }
    const gravity = 1.34;
    const flightDelta = deltaSeconds * this.options.settings.speedMultiplier * FLIGHT_TIME_SCALE;
    for (const item of this.items) {
      item.x += item.velocityX * flightDelta;
      item.y += item.velocityY * flightDelta;
      item.velocityY += gravity * flightDelta;
      item.rotation += item.spin * deltaSeconds;
    }
    for (const fragment of this.fragments) {
      fragment.x += fragment.velocityX * deltaSeconds;
      fragment.y += fragment.velocityY * deltaSeconds;
      fragment.velocityY += gravity * this.options.settings.speedMultiplier * deltaSeconds;
      if (!this.options.reducedMotion) fragment.rotation += fragment.spin * deltaSeconds;
    }
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index]!;
      if (item.y > 1.3 || item.x < -0.25 || item.x > 1.25) this.items.splice(index, 1);
    }
    for (let index = this.fragments.length - 1; index >= 0; index -= 1) {
      const fragment = this.fragments[index]!;
      if (fragment.y > 1.35 || now - fragment.bornAt > 1_400) this.fragments.splice(index, 1);
    }
    for (let index = this.splashes.length - 1; index >= 0; index -= 1) {
      if (now - this.splashes[index]!.bornAt > 700) this.splashes.splice(index, 1);
    }
    for (let index = this.shockwaves.length - 1; index >= 0; index -= 1) {
      if (now - this.shockwaves[index]!.bornAt > 750) this.shockwaves.splice(index, 1);
    }
  }

  private spawnGroup(now: number) {
    const roll = Math.random();
    if (this.options.settings.includeBombs && roll < 0.09 && this.items.length === 0) {
      this.spawnStandalone("bomb", now);
      return;
    }
    if (this.options.settings.includeLobster && roll < 0.16) {
      this.spawnStandalone("lobster", now);
      return;
    }

    const requestedCount = waveObjectCount(this.options.settings.density);
    const count = this.options.mode === "versus" ? Math.min(3, requestedCount) : requestedCount;
    const formation = fruitWaveFormation(count, this.options.mode === "versus" ? "left" : "full");
    for (const spawn of formation) {
      const kind = FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)]!;
      const sizeJitter = 0.9 + Math.random() * 0.2;
      const side = this.options.mode === "versus" ? "left" : "full";
      this.items.push(this.createItem(
        kind,
        side,
        spawn.x,
        spawn.velocityX,
        spawn.velocityY,
        sizeJitter,
        now,
        spawn.y,
      ));
      if (this.options.mode === "versus") {
        this.items.push(this.createItem(
          kind,
          "right",
          1 - spawn.x,
          -spawn.velocityX,
          spawn.velocityY,
          sizeJitter,
          now,
          spawn.y,
        ));
      }
    }
    const maximumItems = this.options.mode === "versus" ? 48 : 36;
    if (this.items.length > maximumItems) {
      this.items.splice(0, this.items.length - maximumItems);
    }
  }

  private spawnStandalone(kind: "bomb" | "lobster", now: number) {
    const sizeJitter = 0.9 + Math.random() * 0.2;
    if (this.options.mode === "versus") {
      for (const spawn of pairedLaneSpawn()) {
        this.items.push(this.createItem(
          kind,
          spawn.side,
          spawn.x,
          spawn.velocityX,
          spawn.velocityY,
          sizeJitter,
          now,
        ));
      }
      return;
    }
    this.items.push(this.createItem(
      kind,
      "full",
      0.16 + Math.random() * 0.68,
      (Math.random() - 0.5) * 0.24,
      -(0.92 + Math.random() * 0.4),
      sizeJitter,
      now,
    ));
  }

  private createItem(
    kind: GameItemKind,
    side: PlayerSide,
    x: number,
    velocityX: number,
    velocityY: number,
    sizeJitter: number,
    now: number,
    initialY = 1.14,
  ): FlyingItem {
    return {
      id: this.nextId++,
      kind,
      side,
      x,
      y: initialY,
      velocityX,
      velocityY,
      rotation: (Math.random() - 0.5) * 0.7,
      spin: (Math.random() - 0.5) * 3.4,
      bornAt: now,
      size: this.options.settings.fruitSize * sizeJitter * (kind === "lobster" ? 1.12 : 1),
      hitsRemaining: kind === "lobster" ? 3 : 1,
      lastHitAt: -Infinity,
    };
  }

  private render(now: number) {
    const { width, height } = this.options.canvas;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const context = this.context;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cssWidth = width / dpr;
    const cssHeight = height / dpr;
    context.clearRect(0, 0, cssWidth, cssHeight);
    if (!this.options.video) {
      const background = context.createLinearGradient(0, 0, cssWidth, cssHeight);
      background.addColorStop(0, "#10183f");
      background.addColorStop(1, "#25124f");
      context.fillStyle = background;
      context.fillRect(0, 0, cssWidth, cssHeight);
    }
    if (this.options.mode === "versus") this.drawLaneDivider(cssWidth, cssHeight);
    this.drawSplashes(context, cssWidth, cssHeight, now);
    this.drawItems(context, cssWidth, cssHeight, now);
    this.drawFragments(context, cssWidth, cssHeight, now);
    this.drawShockwaves(context, cssWidth, cssHeight, now);
    this.drawTrails(context, cssWidth, cssHeight, now);
  }

  private drawLaneDivider(width: number, height: number) {
    const gradient = this.context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(0.25, "rgba(255,255,255,.34)");
    gradient.addColorStop(0.75, "rgba(255,255,255,.34)");
    gradient.addColorStop(1, "transparent");
    this.context.strokeStyle = gradient;
    this.context.lineWidth = 2;
    this.context.setLineDash([9, 12]);
    this.context.beginPath();
    this.context.moveTo(width / 2, 0);
    this.context.lineTo(width / 2, height);
    this.context.stroke();
    this.context.setLineDash([]);
  }

  private drawItems(context: CanvasRenderingContext2D, width: number, height: number, now: number) {
    for (const item of this.items) {
      const x = item.x * width;
      const y = item.y * height;
      let sequence: readonly string[];
      if (item.kind === "bomb") sequence = FRUIT_SLICE_ASSETS.bomb;
      else if (item.kind === "lobster") sequence = FRUIT_SLICE_ASSETS.lobster;
      else sequence = FRUIT_SLICE_ASSETS.fruits[item.kind].whole;
      if (!drawCenteredImage(context, frameAt(sequence, item.bornAt, now), x, y, item.size, item.rotation)) {
        context.fillStyle = item.kind === "bomb"
          ? "#171536"
          : item.kind === "lobster" ? "#ff7596" : FRUIT_FALLBACK_COLOR[item.kind];
        context.beginPath();
        context.arc(x, y, item.size * 0.34, 0, Math.PI * 2);
        context.fill();
      }
      if (item.kind === "lobster" && item.hitsRemaining < 3) {
        context.fillStyle = "rgba(14,13,43,.78)";
        context.font = "900 16px ui-rounded, sans-serif";
        context.textAlign = "center";
        context.fillText(`再切 ${item.hitsRemaining} 次`, x, y - item.size * 0.55);
      }
    }
  }

  private drawFragments(context: CanvasRenderingContext2D, width: number, height: number, now: number) {
    for (const fragment of this.fragments) {
      drawCenteredImage(
        context,
        frameAt(fragment.sequence, fragment.bornAt, now, false),
        fragment.x * width,
        fragment.y * height,
        fragment.size,
        fragment.rotation,
      );
    }
  }

  private drawSplashes(context: CanvasRenderingContext2D, width: number, height: number, now: number) {
    for (const splash of this.splashes) {
      const progress = Math.min(1, (now - splash.bornAt) / 700);
      context.save();
      context.globalAlpha = 1 - progress;
      drawCenteredImage(
        context,
        frameAt(splash.sequence, splash.bornAt, now, false),
        splash.x * width,
        splash.y * height,
        splash.size,
        0,
      );
      context.restore();
    }
  }

  private drawShockwaves(context: CanvasRenderingContext2D, width: number, height: number, now: number) {
    for (const shockwave of this.shockwaves) {
      const progress = Math.min(1, (now - shockwave.bornAt) / 750);
      const radius = 28 + progress * (shockwave.kind === "bomb" ? 150 : 110);
      context.save();
      context.globalAlpha = 1 - progress;
      context.strokeStyle = shockwave.kind === "bomb" ? "#ff7596" : "#ffd166";
      context.lineWidth = shockwave.kind === "bomb" ? 12 : 8;
      context.shadowBlur = this.options.reducedMotion ? 0 : 24;
      context.shadowColor = context.strokeStyle;
      context.beginPath();
      context.arc(shockwave.x * width, shockwave.y * height, radius, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  private drawTrails(context: CanvasRenderingContext2D, width: number, height: number, now: number) {
    for (const player of this.players.values()) {
      const color = player.side === "right" ? "#ff67c7" : "#59e7ff";
      for (const [id, trail] of player.trails) {
        const visible = trail.filter((point) => now - point.time <= (this.options.reducedMotion ? 210 : 460));
        if (visible.length < 2) {
          if (visible.length === 0) player.trails.delete(id);
          continue;
        }
        context.save();
        context.strokeStyle = color;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = Math.max(5, Math.min(16, 5 + visible.at(-1)!.speed * 4));
        context.shadowBlur = this.options.reducedMotion ? 0 : 20;
        context.shadowColor = color;
        context.globalAlpha = Math.max(0.25, 1 - (now - visible.at(-1)!.time) / 520);
        context.beginPath();
        context.moveTo(visible[0]!.x * width, visible[0]!.y * height);
        for (let index = 1; index < visible.length - 1; index += 1) {
          const current = visible[index]!;
          const next = visible[index + 1]!;
          const midX = (current.x + next.x) * 0.5 * width;
          const midY = (current.y + next.y) * 0.5 * height;
          context.quadraticCurveTo(current.x * width, current.y * height, midX, midY);
        }
        const last = visible.at(-1)!;
        context.lineTo(last.x * width, last.y * height);
        context.stroke();
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.arc(last.x * width, last.y * height, 5, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
  }

  private emitHud(now: number, force = false) {
    if (!force && now - this.lastHudAt < 90) return;
    this.lastHudAt = now;
    this.options.onHud({
      remainingMs: this.remainingMs,
      paused: this.paused,
      players: [...this.players.values()].map((player) => ({
        ...this.publicPlayer(player),
        combo: player.comboState.combo,
        superRemainingMs: Math.max(0, player.comboState.superUntil - now),
      })),
    });
  }

  private publicPlayer(player: RuntimePlayer): PlayerResult {
    return {
      role: player.role,
      side: player.side,
      score: player.score,
      fruitSlices: player.fruitSlices,
      lobsterSlices: player.lobsterSlices,
      bombsHit: player.bombsHit,
      maxCombo: player.maxCombo,
      fastestSwipe: Number(player.fastestSwipe.toFixed(3)),
      superActivations: player.superActivations,
    };
  }

  private resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(this.options.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.options.canvas.clientHeight * dpr));
    if (this.options.canvas.width !== width || this.options.canvas.height !== height) {
      this.options.canvas.width = width;
      this.options.canvas.height = height;
    }
  }

  private complete() {
    if (this.stopped) return;
    const results = [...this.players.values()].map((player) => this.publicPlayer(player));
    const durationMs = Math.max(1_000, Math.round(this.elapsedMs));
    this.dispose();
    this.options.onEnd(results, durationMs);
  }
}
