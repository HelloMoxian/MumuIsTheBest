import type { FruitKind } from "./types";

const rawAssets = import.meta.glob(
  [
    "../../../../../assets/cut_image/food/**/*.png",
    "../../../../../assets/cut_image/blood/**/*.png",
    "../../../../../assets/cut_image/other/**/*.png",
  ],
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

function sequence(folder: string) {
  return Object.entries(rawAssets)
    .filter(([path]) => path.includes(`/cut_image/${folder}/`))
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([, url]) => url);
}

export const energyCoinUrl = new URL(
  "../../../../../assets/game/energy-coin.v1.png",
  import.meta.url,
).href;

export const handLandmarkerModelUrl = new URL(
  "../../../../../assets/models/mediapipe/hand_landmarker.float16.v1.task",
  import.meta.url,
).href;

export const fruitSliceBgmUrl = new URL(
  "../../../../../assets/audio/fruit-slice/happy-loop.cc0.mp3",
  import.meta.url,
).href;

export const fruitSliceHitSoundUrl = new URL(
  "../../../../../assets/audio/fruit-slice/fruit-splathit.cc0.wav",
  import.meta.url,
).href;

export const FRUIT_SLICE_ASSETS = {
  fruits: {
    carrot: { whole: sequence("food/carrot"), halves: [sequence("food/carrothalf0"), sequence("food/carrothalf1")] },
    cucumber: { whole: sequence("food/cucumber"), halves: [sequence("food/cucumberhalf0"), sequence("food/cucumberhalf1")] },
    eggplant: { whole: sequence("food/eggplant"), halves: [sequence("food/eggplanthalf0"), sequence("food/eggplanthalf1")] },
    chicken: { whole: sequence("food/chicken"), halves: [sequence("food/chickenhalf0"), sequence("food/chickenhalf1")] },
    fish: { whole: sequence("food/fish"), halves: [sequence("food/fishhalf0"), sequence("food/fishhalf1")] },
  } satisfies Record<FruitKind, { whole: string[]; halves: string[][] }>,
  splashes: [
    sequence("blood/yellow0"),
    sequence("blood/green0"),
    sequence("blood/purple0"),
    sequence("blood/blue0"),
  ],
  bomb: sequence("other/bomb"),
  lobster: sequence("other/lobster"),
  lobsterFragments: sequence("other/lobsterfragment"),
} as const;

const imageCache = new Map<string, HTMLImageElement>();
let criticalAssetsPromise: Promise<void> | undefined;
let allAssetsPromise: Promise<void> | undefined;

export function gameImage(url: string) {
  let image = imageCache.get(url);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = url;
    imageCache.set(url, image);
  }
  return image;
}

async function preloadImages(urls: readonly string[]) {
  await Promise.all(urls.map(async (url) => {
    const image = gameImage(url);
    if (image.complete) return;
    await new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }));
}

export function preloadCriticalFruitSliceAssets() {
  if (!criticalAssetsPromise) {
    const urls = [
      ...Object.values(FRUIT_SLICE_ASSETS.fruits).map((fruit) => fruit.whole[0]),
      FRUIT_SLICE_ASSETS.bomb[0],
      FRUIT_SLICE_ASSETS.lobster[0],
      ...FRUIT_SLICE_ASSETS.splashes.map((sequenceUrls) => sequenceUrls[0]),
    ].filter((url): url is string => Boolean(url));
    criticalAssetsPromise = preloadImages([...new Set(urls)]);
  }
  return criticalAssetsPromise;
}

export function preloadFruitSliceAssets() {
  if (!allAssetsPromise) {
    allAssetsPromise = preloadImages([...new Set(Object.values(rawAssets))]);
  }
  return allAssetsPromise;
}
