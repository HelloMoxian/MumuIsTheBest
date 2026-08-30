import {
  type ShapeKind,
  type SolidKind,
  type StickerBaseKind,
  type StickerKind,
} from "./logic";
import stickerCatalogAsset from "../../../../../content/drawing-studio/sticker-catalog.v1.json";

export type CatalogOption<T extends string> = {
  id: T;
  label: string;
  group: string;
};

export const SHAPE_OPTIONS: CatalogOption<ShapeKind>[] = [
  { id: "circle", label: "圆形", group: "圆与弧" },
  { id: "ellipse", label: "椭圆形", group: "圆与弧" },
  { id: "semicircle", label: "半圆", group: "圆与弧" },
  { id: "triangle", label: "三角形", group: "基础形状" },
  { id: "square", label: "正方形", group: "基础形状" },
  { id: "rectangle", label: "长方形", group: "基础形状" },
  { id: "rounded-rectangle", label: "圆角长方形", group: "基础形状" },
  { id: "trapezoid", label: "梯形", group: "四边形" },
  { id: "parallelogram", label: "平行四边形", group: "四边形" },
  { id: "star", label: "五角星", group: "装饰形状" },
  { id: "heart", label: "爱心", group: "装饰形状" },
];

export const SOLID_OPTIONS: CatalogOption<SolidKind>[] = [
  { id: "cube", label: "正方体", group: "棱柱" },
  { id: "cuboid", label: "长方体", group: "棱柱" },
  { id: "triangular-pyramid", label: "三棱锥", group: "棱锥" },
  { id: "cylinder", label: "圆柱体", group: "曲面立体" },
  { id: "cone", label: "圆锥体", group: "曲面立体" },
  { id: "sphere", label: "球体", group: "曲面立体" },
];

const STICKER_BASE_OPTIONS: CatalogOption<StickerBaseKind>[] = [
  { id: "leaf-oval", label: "椭圆叶", group: "树叶" },
  { id: "leaf-maple", label: "枫叶", group: "树叶" },
  { id: "leaf-tropical", label: "热带叶", group: "树叶" },
  { id: "butterfly-simple", label: "简洁蝴蝶", group: "蝴蝶" },
  { id: "butterfly-medium", label: "分区蝴蝶", group: "蝴蝶" },
  { id: "butterfly-rich", label: "丰富蝴蝶", group: "蝴蝶" },
  { id: "cloud-simple", label: "云朵", group: "云彩" },
  { id: "cloud-rain", label: "雨云", group: "云彩" },
  { id: "cloud-rainbow", label: "彩虹云", group: "云彩" },
  { id: "flower-daisy", label: "雏菊", group: "花朵" },
  { id: "flower-tulip", label: "郁金香", group: "花朵" },
  { id: "flower-sunflower", label: "向日葵", group: "花朵" },
  { id: "sky-sun", label: "太阳", group: "天空" },
  { id: "sky-moon", label: "月亮", group: "天空" },
  { id: "sky-star", label: "星星", group: "天空" },
  { id: "weather-rainbow", label: "彩虹", group: "天气" },
  { id: "weather-lightning", label: "闪电", group: "天气" },
  { id: "weather-snowflake", label: "雪花", group: "天气" },
  { id: "insect-ladybug", label: "瓢虫", group: "小虫子" },
  { id: "insect-dragonfly", label: "蜻蜓", group: "小虫子" },
  { id: "insect-beetle", label: "甲虫", group: "小虫子" },
  { id: "ocean-shell", label: "贝壳", group: "海洋" },
  { id: "ocean-starfish", label: "海星", group: "海洋" },
  { id: "ocean-coral", label: "珊瑚", group: "海洋" },
  { id: "fruit-apple", label: "苹果", group: "果实" },
  { id: "fruit-strawberry", label: "草莓", group: "果实" },
  { id: "fruit-acorn", label: "橡果", group: "果实" },
  { id: "tree-round", label: "圆冠树", group: "树木" },
  { id: "tree-pine", label: "松树", group: "树木" },
  { id: "tree-palm", label: "棕榈树", group: "树木" },
  { id: "garden-mushroom", label: "蘑菇", group: "庭院" },
  { id: "garden-watering-can", label: "洒水壶", group: "庭院" },
  { id: "garden-flowerpot", label: "花盆", group: "庭院" },
  { id: "transport-rocket", label: "火箭", group: "出行" },
  { id: "transport-sailboat", label: "帆船", group: "出行" },
  { id: "transport-balloon", label: "气球", group: "出行" },
  { id: "home-house", label: "小房子", group: "小屋" },
  { id: "home-castle", label: "城堡", group: "小屋" },
  { id: "home-tent", label: "帐篷", group: "小屋" },
  { id: "toy-kite", label: "风筝", group: "玩具" },
  { id: "toy-pinwheel", label: "风车", group: "玩具" },
  { id: "toy-blocks", label: "积木", group: "玩具" },
  { id: "nature-mountain", label: "山峰", group: "自然" },
  { id: "nature-wave", label: "浪花", group: "自然" },
  { id: "nature-raindrops", label: "雨滴", group: "自然" },
];

type GeneratedStickerArt = {
  id: string;
  label: string;
  group: string;
  width: number;
  height: number;
  inkPath: string;
  regions: Array<{ id: string; path: string; area: number }>;
};

const GENERATED_STICKER_ART = new Map<string, GeneratedStickerArt>(
  (stickerCatalogAsset.stickers as GeneratedStickerArt[]).map((sticker) => [sticker.id, sticker]),
);

export const STICKER_OPTIONS: CatalogOption<StickerKind>[] = (
  stickerCatalogAsset.stickers as GeneratedStickerArt[]
).map((sticker) => ({ id: sticker.id as StickerKind, label: sticker.label, group: sticker.group }));

type BasicArtProps = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
};

const starPoints = "50,7 61,36 92,36 67,55 76,88 50,68 24,88 33,55 8,36 39,36";

export function ShapeArt({
  kind,
  fill = "#ffffff",
  stroke = "#171536",
  strokeWidth = 4,
}: BasicArtProps & { kind: ShapeKind }) {
  const shared = { fill, stroke, strokeWidth, strokeLinejoin: "round" as const };
  if (kind === "circle") return <circle cx="50" cy="50" r="39" {...shared} data-region-id="fill" />;
  if (kind === "ellipse") return <ellipse cx="50" cy="50" rx="43" ry="30" {...shared} data-region-id="fill" />;
  if (kind === "semicircle") return <path d="M10 76 A40 40 0 0 1 90 76 Z" {...shared} data-region-id="fill" />;
  if (kind === "triangle") return <polygon points="50,8 92,88 8,88" {...shared} data-region-id="fill" />;
  if (kind === "square") return <rect x="12" y="12" width="76" height="76" {...shared} data-region-id="fill" />;
  if (kind === "rectangle") return <rect x="6" y="22" width="88" height="56" {...shared} data-region-id="fill" />;
  if (kind === "rounded-rectangle") return <rect x="6" y="22" width="88" height="56" rx="15" {...shared} data-region-id="fill" />;
  if (kind === "trapezoid") return <polygon points="26,14 74,14 92,86 8,86" {...shared} data-region-id="fill" />;
  if (kind === "parallelogram") return <polygon points="29,14 93,14 71,86 7,86" {...shared} data-region-id="fill" />;
  if (kind === "star") return <polygon points={starPoints} {...shared} data-region-id="fill" />;
  return (
    <path
      d="M50 88 C43 80 12 60 12 35 C12 17 34 9 50 28 C66 9 88 17 88 35 C88 60 57 80 50 88 Z"
      {...shared}
      data-region-id="fill"
    />
  );
}

function faceFill(faceFills: Record<string, string>, id: string, fallback: string) {
  return faceFills[id] ?? fallback;
}

export function SolidArt({
  kind,
  yaw = 18,
  pitch = -14,
  depth = 70,
  faceFills = {},
  stroke = "#171536",
  strokeWidth = 3.5,
}: BasicArtProps & {
  kind: SolidKind;
  yaw?: number;
  pitch?: number;
  depth?: number;
  faceFills?: Record<string, string>;
}) {
  const dx = Math.max(-24, Math.min(24, yaw * 0.34)) + depth * 0.12;
  const dy = Math.max(-24, Math.min(20, pitch * 0.4)) - depth * 0.1;
  const shared = { stroke, strokeWidth, strokeLinejoin: "round" as const };

  if (kind === "sphere") {
    return (
      <g>
        <circle cx="50" cy="50" r="39" fill={faceFill(faceFills, "surface", "#ffffff")} {...shared} data-region-id="surface" />
        <ellipse cx="50" cy="50" rx="39" ry={Math.max(8, 18 + pitch * 0.12)} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.72} />
        <path d={`M50 11 C${35 - yaw * 0.08} 30 ${35 - yaw * 0.08} 70 50 89`} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.72} />
      </g>
    );
  }

  if (kind === "cylinder") {
    return (
      <g>
        <path d="M18 30 L18 73 C18 84 82 84 82 73 L82 30 Z" fill={faceFill(faceFills, "side", "#ffffff")} {...shared} data-region-id="side" />
        <ellipse cx="50" cy="30" rx="32" ry="12" fill={faceFill(faceFills, "top", "#f2f0ff")} {...shared} data-region-id="top" />
        <path d="M18 73 C18 84 82 84 82 73" fill="none" stroke={stroke} strokeWidth={strokeWidth} />
      </g>
    );
  }

  if (kind === "cone") {
    return (
      <g>
        <path d="M50 10 L17 75 C20 88 80 88 83 75 Z" fill={faceFill(faceFills, "side", "#ffffff")} {...shared} data-region-id="side" />
        <path d="M17 75 C20 88 80 88 83 75 C80 66 20 66 17 75 Z" fill={faceFill(faceFills, "base", "#f2f0ff")} {...shared} data-region-id="base" />
      </g>
    );
  }

  if (kind === "triangular-pyramid") {
    const apexX = 50 + yaw * 0.15;
    const apexY = 10 + pitch * 0.08;
    return (
      <g>
        <polygon points={`${apexX},${apexY} 8,82 51,68`} fill={faceFill(faceFills, "left", "#ffffff")} {...shared} data-region-id="left" />
        <polygon points={`${apexX},${apexY} 51,68 92,82`} fill={faceFill(faceFills, "right", "#ece9ff")} {...shared} data-region-id="right" />
        <polygon points="8,82 51,68 92,82 50,94" fill={faceFill(faceFills, "base", "#dcd7ff")} {...shared} data-region-id="base" />
      </g>
    );
  }

  const frontLeft = kind === "cuboid" ? 13 : 20;
  const frontRight = kind === "cuboid" ? 79 : 76;
  const frontTop = kind === "cuboid" ? 31 : 28;
  const frontBottom = kind === "cuboid" ? 76 : 82;
  const backLeft = frontLeft + dx;
  const backRight = frontRight + dx;
  const backTop = frontTop + dy;
  const backBottom = frontBottom + dy;
  return (
    <g>
      <polygon
        points={`${frontLeft},${frontTop} ${backLeft},${backTop} ${backRight},${backTop} ${frontRight},${frontTop}`}
        fill={faceFill(faceFills, "top", "#eeecff")}
        {...shared}
        data-region-id="top"
      />
      <polygon
        points={`${frontRight},${frontTop} ${backRight},${backTop} ${backRight},${backBottom} ${frontRight},${frontBottom}`}
        fill={faceFill(faceFills, "side", "#dcd7ff")}
        {...shared}
        data-region-id="side"
      />
      <rect
        x={frontLeft}
        y={frontTop}
        width={frontRight - frontLeft}
        height={frontBottom - frontTop}
        fill={faceFill(faceFills, "front", "#ffffff")}
        {...shared}
        data-region-id="front"
      />
    </g>
  );
}

function regionFill(regionFills: Record<string, string>, id: string) {
  return regionFills[id] ?? "#ffffff";
}

type StickerArtProps = BasicArtProps & {
  kind: StickerKind;
  regionFills?: Record<string, string>;
};

function StickerBaseArt({
  kind,
  regionFills = {},
  stroke = "#171536",
  strokeWidth = 3.2,
}: Omit<StickerArtProps, "kind"> & { kind: StickerBaseKind }) {
  const region = (id: string) => ({
    fill: regionFill(regionFills, id),
    stroke,
    strokeWidth,
    strokeLinejoin: "round" as const,
  });

  if (kind === "leaf-oval") {
    return (
      <g>
        <path d="M50 9 C20 20 10 53 20 75 C28 91 44 94 50 94 Z" {...region("left-lower")} data-region-id="left-lower" />
        <path d="M50 9 C80 20 90 53 80 75 C72 91 56 94 50 94 Z" {...region("right-lower")} data-region-id="right-lower" />
        <path d="M50 28 L20 50 L50 54 Z" {...region("left-upper")} data-region-id="left-upper" />
        <path d="M50 28 L80 50 L50 54 Z" {...region("right-upper")} data-region-id="right-upper" />
        <path d="M50 54 L22 73 L50 78 Z" {...region("left-middle")} data-region-id="left-middle" />
        <path d="M50 54 L78 73 L50 78 Z" {...region("right-middle")} data-region-id="right-middle" />
        <path d="M50 12 L50 96" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      </g>
    );
  }

  if (kind === "leaf-maple") {
    return (
      <g>
        <path d="M50 6 L60 28 L76 18 L73 41 L94 37 L78 58 L88 68 L60 71 L54 94 L46 94 L40 71 L12 68 L22 58 L6 37 L27 41 L24 18 L40 28 Z" {...region("leaf")} data-region-id="leaf" />
        <path d="M50 31 L36 57 L50 51 Z" {...region("left-center")} data-region-id="left-center" />
        <path d="M50 31 L64 57 L50 51 Z" {...region("right-center")} data-region-id="right-center" />
        <path d="M50 51 L28 63 L50 68 Z" {...region("left-lower")} data-region-id="left-lower" />
        <path d="M50 51 L72 63 L50 68 Z" {...region("right-lower")} data-region-id="right-lower" />
        <path d="M50 31 L50 96" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      </g>
    );
  }

  if (kind === "leaf-tropical") {
    return (
      <g>
        <path fillRule="evenodd" d="M50 8 C18 8 7 32 12 58 C16 82 34 94 50 95 C66 94 84 82 88 58 C93 32 82 8 50 8 Z M33 30 C26 27 23 35 28 39 C34 43 40 38 39 32 Z M67 30 C74 27 77 35 72 39 C66 43 60 38 61 32 Z M27 53 C18 51 17 62 25 65 C33 68 38 60 35 55 Z M73 53 C82 51 83 62 75 65 C67 68 62 60 65 55 Z" {...region("leaf")} data-region-id="leaf" />
        <path d="M50 14 L50 97" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
        <path d="M50 43 L23 27 M50 61 L17 52 M50 78 L29 88 M50 43 L77 27 M50 61 L83 52 M50 78 L71 88" fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.8} strokeLinecap="round" />
      </g>
    );
  }

  if (kind.startsWith("butterfly")) {
    const medium = kind !== "butterfly-simple";
    const rich = kind === "butterfly-rich";
    return (
      <g>
        <path d="M46 45 C34 12 7 10 9 33 C11 52 29 59 46 55 Z" {...region("wing-left-top")} data-region-id="wing-left-top" />
        <path d="M46 55 C24 53 9 65 16 84 C22 98 40 84 48 65 Z" {...region("wing-left-bottom")} data-region-id="wing-left-bottom" />
        <path d="M54 45 C66 12 93 10 91 33 C89 52 71 59 54 55 Z" {...region("wing-right-top")} data-region-id="wing-right-top" />
        <path d="M54 55 C76 53 91 65 84 84 C78 98 60 84 52 65 Z" {...region("wing-right-bottom")} data-region-id="wing-right-bottom" />
        {medium && (
          <>
            <path d="M17 27 C25 21 35 28 39 43 C29 43 20 39 17 27 Z" {...region("left-top-spot")} data-region-id="left-top-spot" />
            <path d="M83 27 C75 21 65 28 61 43 C71 43 80 39 83 27 Z" {...region("right-top-spot")} data-region-id="right-top-spot" />
            <path d="M21 73 C27 63 38 65 42 70 C35 82 25 84 21 73 Z" {...region("left-bottom-spot")} data-region-id="left-bottom-spot" />
            <path d="M79 73 C73 63 62 65 58 70 C65 82 75 84 79 73 Z" {...region("right-bottom-spot")} data-region-id="right-bottom-spot" />
          </>
        )}
        {rich && (
          <>
            <circle cx="20" cy="48" r="5" {...region("left-dot")} data-region-id="left-dot" />
            <circle cx="80" cy="48" r="5" {...region("right-dot")} data-region-id="right-dot" />
            <circle cx="33" cy="84" r="4" {...region("left-lower-dot")} data-region-id="left-lower-dot" />
            <circle cx="67" cy="84" r="4" {...region("right-lower-dot")} data-region-id="right-lower-dot" />
          </>
        )}
        <ellipse cx="50" cy="55" rx="7" ry="24" {...region("body")} data-region-id="body" />
        <path d="M47 33 C43 20 37 16 33 14 M53 33 C57 20 63 16 67 14" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
        <circle cx="32" cy="14" r="2.5" fill={stroke} />
        <circle cx="68" cy="14" r="2.5" fill={stroke} />
      </g>
    );
  }

  if (kind === "flower-daisy" || kind === "flower-sunflower") {
    const petalCount = kind === "flower-sunflower" ? 12 : 8;
    return (
      <g>
        {Array.from({ length: petalCount }, (_, index) => {
          const angle = index * (360 / petalCount);
          return <ellipse key={angle} cx="50" cy="23" rx={kind === "flower-sunflower" ? 8 : 11} ry="16" transform={`rotate(${angle} 50 50)`} {...region(`petal-${index + 1}`)} data-region-id={`petal-${index + 1}`} />;
        })}
        <circle cx="50" cy="50" r={kind === "flower-sunflower" ? 18 : 15} {...region("center")} data-region-id="center" />
        <path d="M47 66 L47 95 L53 95 L53 66 Z" {...region("stem")} data-region-id="stem" />
        <path d="M47 77 C33 68 25 74 30 84 C36 91 44 86 47 81 Z" {...region("leaf-left")} data-region-id="leaf-left" />
        <path d="M53 84 C64 75 74 79 70 89 C65 96 57 92 53 88 Z" {...region("leaf-right")} data-region-id="leaf-right" />
      </g>
    );
  }

  if (kind === "flower-tulip") {
    return (
      <g>
        <path d="M18 20 C27 18 35 23 50 39 C65 23 73 18 82 20 C82 53 68 66 50 66 C32 66 18 53 18 20 Z" {...region("outer-flower")} data-region-id="outer-flower" />
        <path d="M31 22 C39 20 45 27 50 39 C55 27 61 20 69 22 C67 48 60 58 50 62 C40 58 33 48 31 22 Z" {...region("middle-flower")} data-region-id="middle-flower" />
        <path d="M47 65 L47 96 L53 96 L53 65 Z" {...region("stem")} data-region-id="stem" />
        <path d="M47 76 C31 63 20 67 24 85 C31 93 40 88 47 82 Z" {...region("leaf-left")} data-region-id="leaf-left" />
        <path d="M53 83 C65 70 79 73 76 89 C68 96 59 91 53 87 Z" {...region("leaf-right")} data-region-id="leaf-right" />
      </g>
    );
  }

  if (kind === "sky-sun") {
    return (
      <g>
        {Array.from({ length: 12 }, (_, index) => (
          <polygon key={index} points="50,3 44,18 56,18" transform={`rotate(${index * 30} 50 50)`} {...region(`ray-${index + 1}`)} data-region-id={`ray-${index + 1}`} />
        ))}
        <circle cx="50" cy="50" r="29" {...region("sun")} data-region-id="sun" />
        <circle cx="50" cy="50" r="15" {...region("sun-center")} data-region-id="sun-center" />
      </g>
    );
  }

  if (kind === "sky-moon") {
    return (
      <g>
        <path d="M70 10 C38 13 23 39 30 64 C37 89 65 98 87 79 C63 83 47 69 46 49 C45 31 55 18 70 10 Z" {...region("moon")} data-region-id="moon" />
        <path d="M20 18 L24 27 L34 28 L26 34 L29 44 L20 38 L11 44 L14 34 L6 28 L16 27 Z" {...region("star-top")} data-region-id="star-top" />
        <path d="M19 58 L22 65 L30 66 L24 71 L26 79 L19 75 L12 79 L14 71 L8 66 L16 65 Z" {...region("star-bottom")} data-region-id="star-bottom" />
      </g>
    );
  }

  if (kind === "sky-star") {
    return (
      <g>
        <polygon points={starPoints} {...region("star-outer")} data-region-id="star-outer" />
        <polygon points="50,25 57,43 76,43 61,54 67,73 50,61 33,73 39,54 24,43 43,43" {...region("star-inner")} data-region-id="star-inner" />
      </g>
    );
  }

  if (kind === "weather-rainbow") {
    return (
      <g>
        <path d="M8 72 A42 42 0 0 1 92 72 L82 72 A32 32 0 0 0 18 72 Z" {...region("band-outer")} data-region-id="band-outer" />
        <path d="M20 72 A30 30 0 0 1 80 72 L70 72 A20 20 0 0 0 30 72 Z" {...region("band-middle")} data-region-id="band-middle" />
        <path d="M32 72 A18 18 0 0 1 68 72 L58 72 A8 8 0 0 0 42 72 Z" {...region("band-inner")} data-region-id="band-inner" />
        <path d="M4 73 C2 62 12 56 20 62 C26 56 37 64 32 74 Z" {...region("cloud-left")} data-region-id="cloud-left" />
        <path d="M68 74 C63 64 74 56 81 62 C91 56 99 64 96 74 Z" {...region("cloud-right")} data-region-id="cloud-right" />
      </g>
    );
  }

  if (kind === "weather-lightning") {
    return (
      <g>
        <path d="M13 50 C3 39 13 27 25 31 C28 14 49 10 58 25 C69 15 88 23 85 39 C97 45 91 58 80 58 L22 58 C15 58 11 55 13 50 Z" {...region("cloud")} data-region-id="cloud" />
        <polygon points="51,52 34,75 49,74 42,97 70,66 55,67" {...region("bolt")} data-region-id="bolt" />
      </g>
    );
  }

  if (kind === "weather-snowflake") {
    return (
      <g>
        <polygon points="50,38 61,44 61,56 50,62 39,56 39,44" {...region("center")} data-region-id="center" />
        {Array.from({ length: 6 }, (_, index) => (
          <g key={index} transform={`rotate(${index * 60} 50 50)`}>
            <polygon points="46,37 50,5 54,37" {...region(`arm-${index + 1}`)} data-region-id={`arm-${index + 1}`} />
            <polygon points="48,20 35,13 39,28" {...region(`branch-${index + 1}`)} data-region-id={`branch-${index + 1}`} />
          </g>
        ))}
      </g>
    );
  }

  if (kind === "insect-ladybug") {
    return (
      <g>
        <path d="M50 18 C20 18 11 42 17 71 C22 93 39 95 50 83 Z" {...region("wing-left")} data-region-id="wing-left" />
        <path d="M50 18 C80 18 89 42 83 71 C78 93 61 95 50 83 Z" {...region("wing-right")} data-region-id="wing-right" />
        <path d="M31 20 C35 5 65 5 69 20 C59 27 41 27 31 20 Z" {...region("head")} data-region-id="head" />
        {[{ x: 31, y: 43 }, { x: 29, y: 68 }, { x: 69, y: 43 }, { x: 71, y: 68 }].map((spot, index) => <circle key={index} cx={spot.x} cy={spot.y} r="7" {...region(`spot-${index + 1}`)} data-region-id={`spot-${index + 1}`} />)}
      </g>
    );
  }

  if (kind === "insect-dragonfly") {
    return (
      <g>
        <path d="M45 39 C22 9 4 15 11 34 C17 48 33 49 46 50 Z" {...region("wing-left-top")} data-region-id="wing-left-top" />
        <path d="M45 53 C19 50 7 64 17 78 C27 89 40 73 47 61 Z" {...region("wing-left-bottom")} data-region-id="wing-left-bottom" />
        <path d="M55 39 C78 9 96 15 89 34 C83 48 67 49 54 50 Z" {...region("wing-right-top")} data-region-id="wing-right-top" />
        <path d="M55 53 C81 50 93 64 83 78 C73 89 60 73 53 61 Z" {...region("wing-right-bottom")} data-region-id="wing-right-bottom" />
        {[16, 30, 44, 58, 72].map((y, index) => <ellipse key={y} cx="50" cy={y} rx={index === 0 ? 8 : 6} ry="9" {...region(`body-${index + 1}`)} data-region-id={`body-${index + 1}`} />)}
      </g>
    );
  }

  if (kind === "insect-beetle") {
    return (
      <g>
        <path d="M50 25 C22 24 14 45 19 73 C23 94 40 95 50 83 Z" {...region("shell-left")} data-region-id="shell-left" />
        <path d="M50 25 C78 24 86 45 81 73 C77 94 60 95 50 83 Z" {...region("shell-right")} data-region-id="shell-right" />
        <path d="M29 26 C30 8 70 8 71 26 C61 34 39 34 29 26 Z" {...region("thorax")} data-region-id="thorax" />
        <path d="M34 46 L48 54 L35 66 Z" {...region("left-mark")} data-region-id="left-mark" />
        <path d="M66 46 L52 54 L65 66 Z" {...region("right-mark")} data-region-id="right-mark" />
      </g>
    );
  }

  if (kind === "ocean-shell") {
    return (
      <g>
        <path d="M12 75 C10 36 26 10 50 8 C74 10 90 36 88 75 L74 91 L26 91 Z" {...region("shell")} data-region-id="shell" />
        {[23, 36, 50, 64, 77].map((x, index) => <path key={x} d={`M50 12 L${x} 75 L${index === 0 ? 26 : index === 4 ? 74 : x + (x < 50 ? 5 : -5)} 88 Z`} {...region(`fan-${index + 1}`)} data-region-id={`fan-${index + 1}`} />)}
      </g>
    );
  }

  if (kind === "ocean-starfish") {
    return (
      <g>
        <path d="M50 6 L60 35 L91 23 L70 50 L93 73 L62 66 L50 96 L38 66 L7 73 L30 50 L9 23 L40 35 Z" {...region("body")} data-region-id="body" />
        {[{ x: 50, y: 28 }, { x: 68, y: 48 }, { x: 61, y: 70 }, { x: 39, y: 70 }, { x: 32, y: 48 }].map((dot, index) => <circle key={index} cx={dot.x} cy={dot.y} r="5" {...region(`spot-${index + 1}`)} data-region-id={`spot-${index + 1}`} />)}
      </g>
    );
  }

  if (kind === "ocean-coral") {
    return (
      <g>
        <path d="M43 88 C38 69 43 56 34 45 C24 34 24 24 30 19 C39 26 40 35 44 38 C45 23 41 15 49 7 C58 16 53 31 54 42 C61 35 62 20 73 17 C78 27 70 38 61 48 C72 44 79 35 88 42 C86 56 70 57 59 60 C66 70 64 82 58 90 Z" {...region("coral")} data-region-id="coral" />
        <path d="M11 88 C19 73 32 72 43 88 Z" {...region("rock-left")} data-region-id="rock-left" />
        <path d="M55 88 C67 70 84 75 91 88 Z" {...region("rock-right")} data-region-id="rock-right" />
      </g>
    );
  }

  if (kind === "fruit-apple") {
    return (
      <g>
        <path d="M50 29 C35 15 10 25 10 53 C10 82 30 96 50 88 C70 96 90 82 90 53 C90 25 65 15 50 29 Z" {...region("apple")} data-region-id="apple" />
        <path d="M49 24 C49 13 54 7 63 5 L66 10 C59 14 56 19 55 27 Z" {...region("stem")} data-region-id="stem" />
        <path d="M56 22 C66 8 85 10 88 17 C79 30 66 32 56 22 Z" {...region("leaf")} data-region-id="leaf" />
        <path d="M24 47 C31 38 41 38 47 45 C39 53 31 54 24 47 Z" {...region("shine")} data-region-id="shine" />
      </g>
    );
  }

  if (kind === "fruit-strawberry") {
    return (
      <g>
        <path d="M18 31 C28 19 72 19 82 31 C79 61 67 84 50 96 C33 84 21 61 18 31 Z" {...region("berry")} data-region-id="berry" />
        <path d="M18 31 L30 12 L42 27 L50 6 L58 27 L72 12 L82 31 C63 38 37 38 18 31 Z" {...region("leaves")} data-region-id="leaves" />
        {[{ x: 34, y: 47 }, { x: 51, y: 45 }, { x: 67, y: 48 }, { x: 42, y: 64 }, { x: 59, y: 67 }, { x: 50, y: 82 }].map((seed, index) => <ellipse key={index} cx={seed.x} cy={seed.y} rx="3" ry="5" {...region(`seed-${index + 1}`)} data-region-id={`seed-${index + 1}`} />)}
      </g>
    );
  }

  if (kind === "fruit-acorn") {
    return (
      <g>
        <path d="M27 40 C24 65 33 88 50 96 C67 88 76 65 73 40 Z" {...region("nut")} data-region-id="nut" />
        <path d="M18 41 C18 20 34 12 50 17 C66 12 82 20 82 41 C64 49 36 49 18 41 Z" {...region("cap")} data-region-id="cap" />
        <path d="M48 17 C46 8 52 4 61 5 L61 12 C56 11 54 14 55 18 Z" {...region("stem")} data-region-id="stem" />
        <path d="M29 25 L39 43 M43 18 L51 46 M58 18 L62 44 M72 24 L68 43" fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.72} />
      </g>
    );
  }

  if (kind === "tree-round") {
    return (
      <g>
        <path d="M43 61 L43 94 L57 94 L57 61 Z" {...region("trunk")} data-region-id="trunk" />
        <path d="M15 55 C3 40 14 24 29 27 C34 7 58 5 66 22 C85 14 97 35 86 50 C96 65 77 78 64 69 C54 82 36 77 34 67 C24 72 13 65 15 55 Z" {...region("crown")} data-region-id="crown" />
        <path d="M20 49 C31 42 41 47 43 59 C31 63 23 59 20 49 Z" {...region("leaf-left")} data-region-id="leaf-left" />
        <path d="M58 42 C68 34 79 39 80 50 C70 57 61 54 58 42 Z" {...region("leaf-right")} data-region-id="leaf-right" />
      </g>
    );
  }

  if (kind === "tree-pine") {
    return (
      <g>
        <path d="M44 73 L44 96 L56 96 L56 73 Z" {...region("trunk")} data-region-id="trunk" />
        <polygon points="50,4 24,44 76,44" {...region("top")} data-region-id="top" />
        <polygon points="50,21 15,65 85,65" {...region("middle")} data-region-id="middle" />
        <polygon points="50,39 8,83 92,83" {...region("bottom")} data-region-id="bottom" />
      </g>
    );
  }

  if (kind === "tree-palm") {
    return (
      <g>
        <path d="M45 34 C48 55 44 76 38 95 L57 95 C60 72 60 50 55 34 Z" {...region("trunk")} data-region-id="trunk" />
        <path d="M50 34 C32 8 12 8 5 22 C22 25 36 31 50 40 Z" {...region("leaf-left")} data-region-id="leaf-left" />
        <path d="M51 34 C63 6 84 5 96 19 C77 24 65 31 51 40 Z" {...region("leaf-right")} data-region-id="leaf-right" />
        <path d="M51 34 C39 10 41 1 50 2 C59 8 59 20 51 34 Z" {...region("leaf-top")} data-region-id="leaf-top" />
        <path d="M48 35 C27 22 14 30 14 43 C29 43 39 41 48 35 Z" {...region("leaf-low-left")} data-region-id="leaf-low-left" />
        <path d="M53 35 C75 21 88 28 88 42 C73 43 63 41 53 35 Z" {...region("leaf-low-right")} data-region-id="leaf-low-right" />
      </g>
    );
  }

  if (kind === "garden-mushroom") {
    return (
      <g>
        <path d="M12 52 C13 22 30 7 50 7 C70 7 87 22 88 52 Z" {...region("cap")} data-region-id="cap" />
        <path d="M38 50 C40 69 36 79 29 91 C42 98 58 98 71 91 C64 79 60 69 62 50 Z" {...region("stem")} data-region-id="stem" />
        <circle cx="31" cy="32" r="8" {...region("spot-left")} data-region-id="spot-left" />
        <circle cx="55" cy="22" r="7" {...region("spot-top")} data-region-id="spot-top" />
        <circle cx="70" cy="39" r="6" {...region("spot-right")} data-region-id="spot-right" />
      </g>
    );
  }

  if (kind === "garden-watering-can") {
    return (
      <g>
        <path d="M26 40 L72 40 L77 86 L22 86 Z" {...region("can")} data-region-id="can" />
        <path d="M24 48 C8 45 4 63 16 72 L23 67 C15 62 15 55 25 57 Z" {...region("handle")} data-region-id="handle" />
        <path d="M71 51 L90 34 L96 43 L76 67 Z" {...region("spout")} data-region-id="spout" />
        <path d="M86 29 L97 22 L99 44 L93 46 Z" {...region("rose")} data-region-id="rose" />
        <path d="M42 31 L42 41 L57 41 L57 31 Z" {...region("top-handle")} data-region-id="top-handle" />
      </g>
    );
  }

  if (kind === "garden-flowerpot") {
    return (
      <g>
        <path d="M23 59 L77 59 L69 94 L31 94 Z" {...region("pot")} data-region-id="pot" />
        <rect x="18" y="51" width="64" height="13" rx="5" {...region("rim")} data-region-id="rim" />
        <path d="M47 51 L47 29 L53 29 L53 51 Z" {...region("stem")} data-region-id="stem" />
        <circle cx="50" cy="20" r="9" {...region("center")} data-region-id="center" />
        {[0, 60, 120, 180, 240, 300].map((angle, index) => <ellipse key={angle} cx="50" cy="8" rx="7" ry="11" transform={`rotate(${angle} 50 20)`} {...region(`petal-${index + 1}`)} data-region-id={`petal-${index + 1}`} />)}
        <path d="M47 40 C34 29 25 35 31 45 C37 50 43 46 47 43 Z" {...region("leaf")} data-region-id="leaf" />
      </g>
    );
  }

  if (kind === "transport-rocket") {
    return (
      <g>
        <path d="M50 5 C69 20 72 51 63 75 L37 75 C28 51 31 20 50 5 Z" {...region("body")} data-region-id="body" />
        <circle cx="50" cy="36" r="11" {...region("window")} data-region-id="window" />
        <path d="M37 55 C24 61 18 76 20 88 L39 76 Z" {...region("fin-left")} data-region-id="fin-left" />
        <path d="M63 55 C76 61 82 76 80 88 L61 76 Z" {...region("fin-right")} data-region-id="fin-right" />
        <path d="M41 75 L50 97 L59 75 Z" {...region("flame")} data-region-id="flame" />
      </g>
    );
  }

  if (kind === "transport-sailboat") {
    return (
      <g>
        <path d="M10 68 L90 68 L78 87 L23 87 Z" {...region("hull")} data-region-id="hull" />
        <path d="M48 14 L48 65 L13 65 Z" {...region("sail-left")} data-region-id="sail-left" />
        <path d="M53 20 L53 65 L86 65 Z" {...region("sail-right")} data-region-id="sail-right" />
        <path d="M50 9 L50 70" fill="none" stroke={stroke} strokeWidth={strokeWidth} />
        <path d="M8 91 C20 84 30 98 42 91 C54 84 64 98 76 91 C85 86 91 89 95 92 L95 98 L7 98 Z" {...region("wave")} data-region-id="wave" />
      </g>
    );
  }

  if (kind === "transport-balloon") {
    return (
      <g>
        <ellipse cx="50" cy="40" rx="30" ry="35" {...region("balloon")} data-region-id="balloon" />
        <path d="M50 75 L43 84 L57 84 Z" {...region("knot")} data-region-id="knot" />
        <path d="M33 25 C39 15 47 12 53 13 C46 21 42 30 42 39 Z" {...region("shine")} data-region-id="shine" />
        <path d="M50 84 C35 91 67 92 51 98" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      </g>
    );
  }

  if (kind === "home-house") {
    return (
      <g>
        <rect x="18" y="42" width="64" height="51" {...region("wall")} data-region-id="wall" />
        <polygon points="8,45 50,8 92,45" {...region("roof")} data-region-id="roof" />
        <rect x="42" y="64" width="17" height="29" {...region("door")} data-region-id="door" />
        <rect x="24" y="55" width="14" height="15" {...region("window-left")} data-region-id="window-left" />
        <rect x="64" y="55" width="14" height="15" {...region("window-right")} data-region-id="window-right" />
      </g>
    );
  }

  if (kind === "home-castle") {
    return (
      <g>
        <path d="M12 34 L12 18 L22 18 L22 28 L32 28 L32 18 L42 18 L42 92 L10 92 Z" {...region("tower-left")} data-region-id="tower-left" />
        <path d="M58 18 L68 18 L68 28 L78 28 L78 18 L88 18 L90 92 L58 92 Z" {...region("tower-right")} data-region-id="tower-right" />
        <path d="M37 48 L37 35 L47 35 L47 45 L55 45 L55 35 L64 35 L64 92 L36 92 Z" {...region("center")} data-region-id="center" />
        <path d="M45 92 L45 71 C45 59 56 59 56 71 L56 92 Z" {...region("gate")} data-region-id="gate" />
        <rect x="20" y="48" width="10" height="17" {...region("window-left")} data-region-id="window-left" />
        <rect x="70" y="48" width="10" height="17" {...region("window-right")} data-region-id="window-right" />
      </g>
    );
  }

  if (kind === "home-tent") {
    return (
      <g>
        <polygon points="50,8 6,91 50,91" {...region("tent-left")} data-region-id="tent-left" />
        <polygon points="50,8 94,91 50,91" {...region("tent-right")} data-region-id="tent-right" />
        <path d="M50 52 L32 91 L68 91 Z" {...region("door")} data-region-id="door" />
        <path d="M50 8 L50 91" fill="none" stroke={stroke} strokeWidth={strokeWidth} />
      </g>
    );
  }

  if (kind === "toy-kite") {
    return (
      <g>
        <polygon points="50,5 50,50 13,43" {...region("panel-left-top")} data-region-id="panel-left-top" />
        <polygon points="50,5 87,43 50,50" {...region("panel-right-top")} data-region-id="panel-right-top" />
        <polygon points="13,43 50,50 50,79" {...region("panel-left-bottom")} data-region-id="panel-left-bottom" />
        <polygon points="87,43 50,79 50,50" {...region("panel-right-bottom")} data-region-id="panel-right-bottom" />
        <path d="M50 79 C34 86 70 89 48 97" fill="none" stroke={stroke} strokeWidth={strokeWidth} />
        <path d="M38 84 L48 89 L40 94 L31 89 Z" {...region("bow")} data-region-id="bow" />
      </g>
    );
  }

  if (kind === "toy-pinwheel") {
    return (
      <g>
        <path d="M50 50 C25 52 10 42 12 21 C29 19 43 28 50 50 Z" {...region("blade-1")} data-region-id="blade-1" />
        <path d="M50 50 C48 25 58 10 79 12 C81 29 72 43 50 50 Z" {...region("blade-2")} data-region-id="blade-2" />
        <path d="M50 50 C75 48 90 58 88 79 C71 81 57 72 50 50 Z" {...region("blade-3")} data-region-id="blade-3" />
        <path d="M50 50 C52 75 42 90 21 88 C19 71 28 57 50 50 Z" {...region("blade-4")} data-region-id="blade-4" />
        <circle cx="50" cy="50" r="7" {...region("center")} data-region-id="center" />
        <path d="M48 56 L45 97 L55 97 L52 56 Z" {...region("stick")} data-region-id="stick" />
      </g>
    );
  }

  if (kind === "toy-blocks") {
    return (
      <g>
        <rect x="8" y="54" width="35" height="35" {...region("block-left")} data-region-id="block-left" />
        <rect x="57" y="54" width="35" height="35" {...region("block-right")} data-region-id="block-right" />
        <rect x="32" y="15" width="36" height="36" {...region("block-top")} data-region-id="block-top" />
        <circle cx="25" cy="72" r="8" {...region("circle")} data-region-id="circle" />
        <polygon points="75,62 85,82 65,82" {...region("triangle")} data-region-id="triangle" />
        <polygon points="50,22 54,31 64,31 56,37 59,46 50,40 41,46 44,37 36,31 46,31" {...region("star")} data-region-id="star" />
      </g>
    );
  }

  if (kind === "nature-mountain") {
    return (
      <g>
        <polygon points="8,88 39,30 68,88" {...region("mountain-left")} data-region-id="mountain-left" />
        <polygon points="42,88 69,12 95,88" {...region("mountain-right")} data-region-id="mountain-right" />
        <polygon points="28,50 39,30 49,50 42,47 38,56" {...region("snow-left")} data-region-id="snow-left" />
        <polygon points="58,36 69,12 80,36 72,32 67,42" {...region("snow-right")} data-region-id="snow-right" />
        <path d="M5 88 L96 88 L96 97 L5 97 Z" {...region("ground")} data-region-id="ground" />
      </g>
    );
  }

  if (kind === "nature-wave") {
    return (
      <g>
        <path d="M5 43 C22 18 42 23 53 43 C61 25 83 22 96 42 C80 36 70 47 67 61 C52 50 36 52 27 68 C19 54 10 50 5 43 Z" {...region("wave-top")} data-region-id="wave-top" />
        <path d="M4 64 C19 54 33 78 49 66 C65 53 78 77 96 65 L96 80 C79 91 64 69 49 82 C33 94 19 71 4 83 Z" {...region("wave-middle")} data-region-id="wave-middle" />
        <path d="M4 85 C21 76 34 96 49 87 C64 76 79 96 96 86 L96 97 L4 97 Z" {...region("wave-bottom")} data-region-id="wave-bottom" />
      </g>
    );
  }

  if (kind === "nature-raindrops") {
    return (
      <g>
        <path d="M26 8 C12 28 8 40 12 52 C16 66 36 68 42 54 C47 42 39 27 26 8 Z" {...region("drop-left")} data-region-id="drop-left" />
        <path d="M67 20 C52 42 48 55 53 68 C58 82 79 82 85 68 C90 55 82 40 67 20 Z" {...region("drop-right")} data-region-id="drop-right" />
        <path d="M35 61 C25 75 24 83 28 90 C33 99 47 97 50 88 C53 79 46 69 35 61 Z" {...region("drop-small")} data-region-id="drop-small" />
      </g>
    );
  }

  const cloudPath = "M18 69 C5 67 4 47 18 43 C16 25 38 17 50 30 C62 12 88 22 84 44 C98 49 94 70 80 70 Z";
  if (kind === "cloud-simple") {
    return <path d={cloudPath} {...region("cloud")} data-region-id="cloud" />;
  }
  if (kind === "cloud-rain") {
    return (
      <g>
        <path d={cloudPath} {...region("cloud")} data-region-id="cloud" />
        <path d="M27 75 C19 85 22 92 28 92 C35 92 36 84 27 75 Z" {...region("drop-left")} data-region-id="drop-left" />
        <path d="M50 75 C42 85 45 92 51 92 C58 92 59 84 50 75 Z" {...region("drop-middle")} data-region-id="drop-middle" />
        <path d="M73 75 C65 85 68 92 74 92 C81 92 82 84 73 75 Z" {...region("drop-right")} data-region-id="drop-right" />
      </g>
    );
  }
  return (
    <g>
      <path d={cloudPath} {...region("cloud")} data-region-id="cloud" />
      <path d="M20 42 A30 30 0 0 1 80 42 L72 42 A22 22 0 0 0 28 42 Z" {...region("rainbow-outer")} data-region-id="rainbow-outer" />
      <path d="M31 42 A19 19 0 0 1 69 42 L60 42 A10 10 0 0 0 40 42 Z" {...region("rainbow-inner")} data-region-id="rainbow-inner" />
    </g>
  );
}

export function StickerArt({
  kind,
  regionFills = {},
  stroke = "#171536",
  strokeWidth: _strokeWidth = 3.2,
}: StickerArtProps) {
  const art = GENERATED_STICKER_ART.get(kind);
  if (!art) return null;
  const scale = 88 / Math.max(art.width, art.height);
  const offsetX = (100 - art.width * scale) / 2;
  const offsetY = (100 - art.height * scale) / 2;
  return (
    <g transform={`translate(${offsetX} ${offsetY}) scale(${scale})`}>
      {art.regions.map((region) => (
        <path
          key={region.id}
          d={region.path}
          fill={regionFill(regionFills, region.id)}
          fillRule="evenodd"
          clipRule="evenodd"
          data-region-id={region.id}
        />
      ))}
      <path d={art.inkPath} fill={stroke} fillRule="evenodd" clipRule="evenodd" />
    </g>
  );
}

export function CatalogPreview({
  type,
  id,
}: {
  type: "shape" | "solid" | "sticker";
  id: ShapeKind | SolidKind | StickerKind;
}) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {type === "shape" && <ShapeArt kind={id as ShapeKind} strokeWidth={4.5} />}
      {type === "solid" && <SolidArt kind={id as SolidKind} strokeWidth={3.8} />}
      {type === "sticker" && <StickerArt kind={id as StickerKind} strokeWidth={3.3} />}
    </svg>
  );
}
