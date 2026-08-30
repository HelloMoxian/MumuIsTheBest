import type { RacerThemeId } from "./types";

const rawGameAssets = import.meta.glob(
  [
    "../../../../../assets/game/galaxy-racer/backgrounds/*.png",
    "../../../../../assets/game/galaxy-racer/sprites/{vehicles,vfx,props}/*.png",
    "../../../../../assets/game/galaxy-racer/themes/*/backgrounds/*.png",
    "../../../../../assets/game/galaxy-racer/themes/*/sprites/{vehicles,vfx,props}/*.png",
  ],
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

function gameAsset(relativePath: string) {
  const suffix = "/galaxy-racer/" + relativePath.replace(/^\/+/, "");
  const match = Object.entries(rawGameAssets).find(([path]) => path.endsWith(suffix));
  if (!match) throw new Error("赛车图片资产缺失：" + relativePath);
  return match[1];
}

export type RacerThemeAssets = {
  id: RacerThemeId;
  background: string;
  player: Record<"neutral" | "left" | "right" | "collision", string>;
  obstacles: string[];
  vfx: Record<"speed" | "turbo" | "collision" | "wobble" | "leftTrail" | "rightTrail" | "finish" | "confetti", string>;
  props: string[];
  music: string;
  climaxMusic: string;
};

function playerSet(root: string) {
  const prefix = root ? root + "/" : "";
  return {
    neutral: gameAsset(prefix + "sprites/vehicles/player-neutral.png"),
    left: gameAsset(prefix + "sprites/vehicles/player-left.png"),
    right: gameAsset(prefix + "sprites/vehicles/player-right.png"),
    collision: gameAsset(prefix + "sprites/vehicles/player-collision.png"),
  };
}

function themed(
  root: string,
  id: RacerThemeId,
  background: string,
  music: string,
  climaxMusic: string,
): RacerThemeAssets {
  const prefix = root + "/";
  return {
    id,
    background: gameAsset(prefix + "backgrounds/" + background),
    player: playerSet(root),
    obstacles: ["compact", "pod", "buggy", "bus"].map((name) => (
      gameAsset(prefix + "sprites/vehicles/obstacle-" + name + ".png")
    )),
    vfx: {
      speed: gameAsset(prefix + "sprites/vfx/speed-streak.png"),
      turbo: gameAsset(prefix + "sprites/vfx/turbo-glow.png"),
      collision: gameAsset(prefix + "sprites/vfx/collision-burst.png"),
      wobble: gameAsset(prefix + "sprites/vfx/wobble-stars.png"),
      leftTrail: gameAsset(prefix + "sprites/vfx/lane-trail-left.png"),
      rightTrail: gameAsset(prefix + "sprites/vfx/lane-trail-right.png"),
      finish: gameAsset(prefix + "sprites/vfx/finish-sparkle.png"),
      confetti: gameAsset(prefix + "sprites/vfx/confetti.png"),
    },
    props: [
      "guardrail",
      "arrow-sign",
      "checkpoint-arch",
      "roadside-lamp",
      "robot-spectator",
      "safety-bollard",
    ].map((name) => gameAsset(prefix + "sprites/props/" + name + ".png")),
    music,
    climaxMusic,
  };
}

export const RACER_THEMES: Record<RacerThemeId, RacerThemeAssets> = {
  neon: {
    id: "neon",
    background: gameAsset("backgrounds/space-city-horizon.v1.png"),
    player: playerSet(""),
    obstacles: [
      "obstacle-coral",
      "obstacle-purple-pod",
      "obstacle-yellow-buggy",
      "obstacle-teal-bus",
    ].map((name) => gameAsset("sprites/vehicles/" + name + ".png")),
    vfx: {
      speed: gameAsset("sprites/vfx/speed-streak.png"),
      turbo: gameAsset("sprites/vfx/turbo-glow.png"),
      collision: gameAsset("sprites/vfx/collision-burst.png"),
      wobble: gameAsset("sprites/vfx/wobble-stars.png"),
      leftTrail: gameAsset("sprites/vfx/lane-trail-left.png"),
      rightTrail: gameAsset("sprites/vfx/lane-trail-right.png"),
      finish: gameAsset("sprites/vfx/finish-sparkle.png"),
      confetti: gameAsset("sprites/vfx/confetti.png"),
    },
    props: [
      "guardrail",
      "arrow-sign",
      "checkpoint-arch",
      "roadside-lamp",
      "robot-spectator",
      "safety-bollard",
    ].map((name) => gameAsset("sprites/props/" + name + ".png")),
    music: new URL(
      "../../../../../assets/audio/galaxy-racer/race-loop.cc0.ogg",
      import.meta.url,
    ).href,
    climaxMusic: new URL(
      "../../../../../assets/audio/galaxy-racer/race-climax-loop.cc0.ogg",
      import.meta.url,
    ).href,
  },
  crystal: themed(
    "themes/crystal",
    "crystal",
    "crystal-comet-canyon.v1.png",
    new URL(
      "../../../../../assets/audio/galaxy-racer/theme-crystal-loop.cc0.ogg",
      import.meta.url,
    ).href,
    new URL(
      "../../../../../assets/audio/galaxy-racer/theme-crystal-climax.cc0.ogg",
      import.meta.url,
    ).href,
  ),
  solar: themed(
    "themes/solar",
    "solar",
    "solar-ring-garden.v1.png",
    new URL(
      "../../../../../assets/audio/galaxy-racer/theme-solar-loop.cc0.mp3",
      import.meta.url,
    ).href,
    new URL(
      "../../../../../assets/audio/galaxy-racer/theme-solar-loop.cc0.mp3",
      import.meta.url,
    ).href,
  ),
};

export const faceDetectorModelUrl = new URL(
  "../../../../../assets/models/mediapipe/blaze_face_short_range.float16.v1.tflite",
  import.meta.url,
).href;
export const energyCoinUrl = new URL(
  "../../../../../assets/game/energy-coin.v1.png",
  import.meta.url,
).href;
export const racerSounds = {
  engine: new URL(
    "../../../../../assets/audio/galaxy-racer/engine-loop.cc0.wav",
    import.meta.url,
  ).href,
  lane: new URL(
    "../../../../../assets/audio/galaxy-racer/lane-whoosh-short.cc0.ogg",
    import.meta.url,
  ).href,
  laneAlt: new URL(
    "../../../../../assets/audio/galaxy-racer/lane-whoosh-alt.cc0.ogg",
    import.meta.url,
  ).href,
  collision: new URL(
    "../../../../../assets/audio/galaxy-racer/collision-soft.cc0.ogg",
    import.meta.url,
  ).href,
  countdown: new URL(
    "../../../../../assets/audio/galaxy-racer/countdown.cc0.ogg",
    import.meta.url,
  ).href,
  finish: new URL(
    "../../../../../assets/audio/galaxy-racer/finish-best.cc0.mp3",
    import.meta.url,
  ).href,
  finishGentle: new URL(
    "../../../../../assets/audio/galaxy-racer/finish-gentle.cc0.ogg",
    import.meta.url,
  ).href,
  stageIntro: new URL(
    "../../../../../assets/audio/galaxy-racer/stage-intro.cc0.ogg",
    import.meta.url,
  ).href,
  startGrid: new URL(
    "../../../../../assets/audio/galaxy-racer/start-grid.cc0.ogg",
    import.meta.url,
  ).href,
  finalLap: new URL(
    "../../../../../assets/audio/galaxy-racer/final-lap.cc0.ogg",
    import.meta.url,
  ).href,
  checkpoint: new URL(
    "../../../../../assets/audio/galaxy-racer/checkpoint.cc0.ogg",
    import.meta.url,
  ).href,
  reward: new URL(
    "../../../../../assets/audio/galaxy-racer/reward.cc0.ogg",
    import.meta.url,
  ).href,
} as const;

const imageCache = new Map<string, HTMLImageElement>();

export function racerImage(url: string) {
  let image = imageCache.get(url);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = url;
    imageCache.set(url, image);
  }
  return image;
}

export async function preloadRacerTheme(theme: RacerThemeAssets) {
  const urls = [
    theme.background,
    ...Object.values(theme.player),
    ...theme.obstacles,
    ...Object.values(theme.vfx),
    ...theme.props,
  ];
  await Promise.all(urls.map(async (url) => {
    const image = racerImage(url);
    if (image.complete) return;
    await new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }));
}
