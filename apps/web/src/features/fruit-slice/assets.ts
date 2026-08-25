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

export const poseLandmarkerModelUrl = new URL(
  "../../../../../assets/models/mediapipe/pose_landmarker_lite.float16.v1.task",
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

export async function preloadFruitSliceAssets() {
  const urls = [...new Set(Object.values(rawAssets))];
  await Promise.all(urls.map(async (url) => {
    const image = gameImage(url);
    if (image.complete) return;
    await new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }));
}
