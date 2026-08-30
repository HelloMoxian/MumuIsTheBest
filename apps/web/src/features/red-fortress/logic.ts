export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;
export const ROAD_BOUNDS = {
  left: 176,
  right: 1104,
  top: 88,
  bottom: 664,
} as const;

export type Vector = { x: number; y: number };

export type EnemyKind =
  | "buggy"
  | "hover"
  | "boat"
  | "drone"
  | "turret"
  | "rocket"
  | "shield"
  | "mine";

export type SpawnKind = EnemyKind | "rescue" | "barrier";
export type StageId = "emerald" | "snow" | "lava" | "citadel";
export type BossPattern = "crab" | "owl" | "drill" | "core";

export type SpawnEvent = {
  distance: number;
  kind: SpawnKind;
  lane: number;
  delay?: number;
};

export type StageDefinition = {
  id: StageId;
  number: number;
  name: string;
  subtitle: string;
  briefing: string;
  objective: string;
  backgroundUrl: string;
  accent: string;
  glow: string;
  length: number;
  scrollSpeed: number;
  bossName: string;
  bossSubtitle: string;
  bossPattern: BossPattern;
  bossHp: number;
  bossAtlasColumn: number;
  spawns: readonly SpawnEvent[];
};

export type TargetCandidate = Vector & {
  id: number;
  active: boolean;
};

export type EnemyStats = {
  hp: number;
  radius: number;
  speed: number;
  score: number;
  contactDamage: number;
};

const lane = (index: number) => [0.15, 0.28, 0.4, 0.5, 0.62, 0.74, 0.85][index] ?? 0.5;

const wave = (
  distance: number,
  kinds: readonly SpawnKind[],
  lanes: readonly number[],
): SpawnEvent[] => kinds.map((kind, index) => ({
  distance: distance + index * 24,
  kind,
  lane: lane(lanes[index] ?? 3),
}));

const emeraldSpawns: readonly SpawnEvent[] = [
  ...wave(120, ["buggy", "buggy"], [1, 5]),
  ...wave(340, ["rescue", "turret", "buggy"], [2, 5, 4]),
  ...wave(610, ["boat", "boat", "barrier"], [0, 6, 3]),
  ...wave(860, ["drone", "drone", "rescue"], [2, 4, 5]),
  ...wave(1110, ["turret", "buggy", "turret"], [1, 3, 5]),
  ...wave(1420, ["rescue", "mine", "mine", "buggy"], [3, 1, 5, 4]),
  ...wave(1730, ["boat", "drone", "boat"], [0, 3, 6]),
  ...wave(2050, ["shield", "buggy", "turret", "rescue"], [3, 1, 5, 4]),
  ...wave(2380, ["drone", "buggy", "drone", "barrier"], [1, 3, 5, 2]),
  ...wave(2670, ["rescue", "turret", "turret"], [3, 1, 5]),
];

const snowSpawns: readonly SpawnEvent[] = [
  ...wave(130, ["drone", "drone", "hover"], [1, 5, 3]),
  ...wave(380, ["rescue", "shield", "turret"], [2, 3, 5]),
  ...wave(690, ["hover", "mine", "hover", "mine"], [1, 2, 5, 4]),
  ...wave(980, ["drone", "drone", "drone"], [1, 3, 5]),
  ...wave(1260, ["rocket", "rescue", "turret"], [1, 3, 5]),
  ...wave(1580, ["shield", "hover", "hover", "shield"], [1, 2, 4, 5]),
  ...wave(1910, ["rescue", "drone", "barrier", "drone"], [2, 1, 3, 5]),
  ...wave(2240, ["rocket", "mine", "mine", "rocket"], [1, 2, 4, 5]),
  ...wave(2600, ["hover", "drone", "hover", "rescue"], [1, 3, 5, 4]),
  ...wave(2960, ["shield", "rocket", "drone"], [2, 4, 3]),
];

const lavaSpawns: readonly SpawnEvent[] = [
  ...wave(120, ["buggy", "hover", "buggy"], [1, 3, 5]),
  ...wave(390, ["rocket", "rocket", "rescue"], [1, 5, 3]),
  ...wave(720, ["mine", "mine", "hover", "mine"], [1, 3, 5, 6]),
  ...wave(1030, ["shield", "rocket", "buggy"], [3, 5, 1]),
  ...wave(1360, ["rescue", "drone", "drone", "barrier"], [2, 1, 5, 4]),
  ...wave(1690, ["rocket", "hover", "rocket"], [1, 3, 5]),
  ...wave(2030, ["mine", "shield", "mine", "rescue"], [1, 3, 5, 4]),
  ...wave(2390, ["buggy", "drone", "hover", "drone"], [1, 2, 4, 5]),
  ...wave(2780, ["rocket", "shield", "rocket", "barrier"], [1, 3, 5, 4]),
  ...wave(3200, ["rescue", "hover", "mine", "hover"], [3, 1, 3, 5]),
];

const citadelSpawns: readonly SpawnEvent[] = [
  ...wave(120, ["drone", "hover", "drone"], [1, 3, 5]),
  ...wave(390, ["shield", "turret", "shield"], [1, 3, 5]),
  ...wave(720, ["rocket", "rescue", "rocket"], [1, 3, 5]),
  ...wave(1040, ["mine", "drone", "mine", "hover"], [1, 2, 4, 5]),
  ...wave(1390, ["shield", "rocket", "turret", "shield"], [1, 2, 4, 5]),
  ...wave(1740, ["rescue", "drone", "drone", "drone"], [3, 1, 3, 5]),
  ...wave(2110, ["hover", "mine", "rocket", "hover"], [1, 2, 4, 5]),
  ...wave(2490, ["shield", "turret", "rescue", "turret"], [1, 2, 4, 5]),
  ...wave(2890, ["rocket", "drone", "rocket", "drone"], [1, 2, 4, 5]),
  ...wave(3300, ["shield", "hover", "shield", "barrier"], [1, 2, 5, 4]),
  ...wave(3670, ["rescue", "rocket", "turret", "rocket"], [3, 1, 3, 5]),
];

export const STAGES: readonly StageDefinition[] = [
  {
    id: "emerald",
    number: 1,
    name: "翡翠港湾",
    subtitle: "穿过瀑布与遗迹，打开第一道星门",
    briefing: "河道巡逻队封锁了港湾。沿着青色航标前进，营救散落在码头边的科研员。",
    objective: "推进 2.9 千米，解除藤甲蟹机甲的港口封锁",
    backgroundUrl: "/images/red-fortress/level-emerald.webp",
    accent: "#59e7ff",
    glow: "rgba(89, 231, 255, .52)",
    length: 2900,
    scrollSpeed: 82,
    bossName: "藤甲蟹机甲",
    bossSubtitle: "港湾守门者",
    bossPattern: "crab",
    bossHp: 80,
    bossAtlasColumn: 0,
    spawns: emeraldSpawns,
  },
  {
    id: "snow",
    number: 2,
    name: "云巅雪线",
    subtitle: "越过冰桥，让极光重新点亮",
    briefing: "高空观测站的护盾失去控制。小心旋翼无人机和会在雪面滑行的悬浮车。",
    objective: "推进 3.3 千米，关闭极光猫头鹰舰的暴风装置",
    backgroundUrl: "/images/red-fortress/level-snow.webp",
    accent: "#a9d8ff",
    glow: "rgba(141, 115, 255, .56)",
    length: 3300,
    scrollSpeed: 86,
    bossName: "极光猫头鹰舰",
    bossSubtitle: "雪线巡航核心",
    bossPattern: "owl",
    bossHp: 105,
    bossAtlasColumn: 1,
    spawns: snowSpawns,
  },
  {
    id: "lava",
    number: 3,
    name: "熔火工厂",
    subtitle: "穿越热能管线，停止失控生产线",
    briefing: "工厂把星核能量送进了错误的管道。寻找冷却灯带，重炮可以快速拆除火箭塔。",
    objective: "推进 3.6 千米，击停熔核钻地车",
    backgroundUrl: "/images/red-fortress/level-lava.webp",
    accent: "#ffb45c",
    glow: "rgba(255, 103, 199, .52)",
    length: 3600,
    scrollSpeed: 90,
    bossName: "熔核钻地车",
    bossSubtitle: "生产线终端机",
    bossPattern: "drill",
    bossHp: 135,
    bossAtlasColumn: 2,
    spawns: lavaSpawns,
  },
  {
    id: "citadel",
    number: 4,
    name: "星环要塞",
    subtitle: "跨过云海，完成最后的双车远征",
    briefing: "星环核心正在重启全部防御设施。两辆车要保持在同一推进线，依次拆除四个护盾象限。",
    objective: "推进 4 千米，点亮星环核心",
    backgroundUrl: "/images/red-fortress/level-citadel.webp",
    accent: "#ff8fdf",
    glow: "rgba(255, 209, 102, .52)",
    length: 4000,
    scrollSpeed: 94,
    bossName: "星环核心",
    bossSubtitle: "最终航线守护者",
    bossPattern: "core",
    bossHp: 180,
    bossAtlasColumn: 3,
    spawns: citadelSpawns,
  },
] as const;

export const UNIT_ATLAS = "/images/red-fortress/unit-atlas.webp";
export const VFX_ATLAS = "/images/red-fortress/vfx-atlas.webp";
export const HERO_ART = "/images/red-fortress/hero.webp";

export const UNIT_SPRITES = {
  scout: { column: 0, row: 0 },
  heavy: { column: 1, row: 0 },
  rescue: { column: 2, row: 0 },
  bonus: { column: 3, row: 0 },
  buggy: { column: 0, row: 1 },
  hover: { column: 1, row: 1 },
  boat: { column: 2, row: 1 },
  drone: { column: 3, row: 1 },
  turret: { column: 0, row: 2 },
  rocket: { column: 1, row: 2 },
  shield: { column: 2, row: 2 },
  mine: { column: 3, row: 2 },
} as const;

export const VFX_SPRITES = {
  lightBullet: { column: 0, row: 0 },
  heavyBullet: { column: 1, row: 0 },
  enemyBullet: { column: 2, row: 0 },
  rescueStar: { column: 3, row: 0 },
  smallImpact: { column: 0, row: 1 },
  explosion: { column: 1, row: 1 },
  bossExplosion: { column: 2, row: 1 },
  shieldBurst: { column: 3, row: 1 },
  barrier: { column: 0, row: 2 },
  gate: { column: 1, row: 2 },
  radar: { column: 2, row: 2 },
  silo: { column: 3, row: 2 },
  emeraldProp: { column: 0, row: 3 },
  snowProp: { column: 1, row: 3 },
  lavaProp: { column: 2, row: 3 },
  citadelProp: { column: 3, row: 3 },
} as const;

export function getStage(index: number): StageDefinition {
  return STAGES[index] ?? STAGES[0];
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getPowerTier(rescuedInStage: number) {
  if (rescuedInStage >= 6) return 4;
  if (rescuedInStage >= 4) return 3;
  if (rescuedInStage >= 2) return 2;
  return 1;
}

export function getStageProgress(distance: number, stage: StageDefinition) {
  return clamp(distance / stage.length, 0, 1);
}

export function circlesOverlap(a: Vector, aRadius: number, b: Vector, bRadius: number) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const radius = aRadius + bRadius;
  return dx * dx + dy * dy <= radius * radius;
}

export function distanceBetween(a: Vector, b: Vector) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalized(from: Vector, to: Vector): Vector {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.0001) return { x: 0, y: -1 };
  return { x: dx / length, y: dy / length };
}

export function selectNearestTarget<T extends TargetCandidate>(
  origin: Vector,
  candidates: readonly T[],
  maxDistance: number,
): T | undefined {
  let nearest: T | undefined;
  let nearestDistance = maxDistance;
  for (const candidate of candidates) {
    if (!candidate.active) continue;
    const distance = distanceBetween(origin, candidate);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function getEnemyStats(kind: EnemyKind): EnemyStats {
  switch (kind) {
    case "buggy":
      return { hp: 2, radius: 27, speed: 84, score: 90, contactDamage: 1 };
    case "hover":
      return { hp: 4, radius: 32, speed: 64, score: 140, contactDamage: 1 };
    case "boat":
      return { hp: 3, radius: 31, speed: 55, score: 120, contactDamage: 1 };
    case "drone":
      return { hp: 2, radius: 26, speed: 74, score: 110, contactDamage: 1 };
    case "turret":
      return { hp: 5, radius: 34, speed: 0, score: 160, contactDamage: 1 };
    case "rocket":
      return { hp: 7, radius: 38, speed: 0, score: 220, contactDamage: 2 };
    case "shield":
      return { hp: 8, radius: 40, speed: 0, score: 240, contactDamage: 1 };
    case "mine":
      return { hp: 1, radius: 22, speed: 0, score: 60, contactDamage: 2 };
  }
}

export function isSpawnScheduleSorted(stage: StageDefinition) {
  return stage.spawns.every((event, index) => index === 0 || event.distance >= stage.spawns[index - 1].distance);
}
