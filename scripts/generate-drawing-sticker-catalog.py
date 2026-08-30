#!/usr/bin/env python3
"""Build scalable, fillable drawing stickers from generated 4x3 line-art atlases."""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import tempfile
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ATLAS_ROOT = ROOT / "content/drawing-studio/sticker-atlases/v1"
DEFAULT_OUTPUT = ROOT / "content/drawing-studio/sticker-catalog.v1.json"
EXTRACTOR = ROOT / ".agents/skills/chroma-atlas-extractor/scripts/extract_chroma_atlas.py"


def styled_ids(base_ids: list[str]) -> list[str]:
    suffixes = ["", "-airy", "-patterned", "-detailed"]
    return [f"{base}{suffix}" for suffix in suffixes for base in base_ids]


THEMES = [
    {
        "atlas": "leaf",
        "group": "树叶",
        "ids": styled_ids(["leaf-oval", "leaf-maple", "leaf-tropical"]),
        "labels": ["椭圆叶", "枫叶", "龟背竹叶", "银杏叶", "橡树叶", "柳叶", "蕨叶", "四叶草", "荷叶", "冬青叶", "桉树枝", "栗树叶"],
    },
    {
        "atlas": "butterfly",
        "group": "蝴蝶",
        "ids": styled_ids(["butterfly-simple", "butterfly-medium", "butterfly-rich"]),
        "labels": ["圆翅蝶", "燕尾蝶", "几何斑蝶", "长翼蝶", "小粉蝶", "阔翅蝶", "透翅蝶", "孔雀纹蝶", "枯叶蝶", "条纹长翼蝶", "锯缘蝶", "小弄蝶"],
    },
    {
        "atlas": "cloud",
        "group": "云彩",
        "ids": ["cloud-simple", "cloud-simple-airy", "cloud-simple-patterned", "cloud-simple-detailed", "cloud-rain-airy", "cloud-rain", "cloud-rain-patterned", "cloud-rain-detailed", "cloud-rainbow-airy", "cloud-rainbow-patterned", "cloud-rainbow", "cloud-rainbow-detailed"],
        "labels": ["积云", "层云", "卷云", "云朵群", "风吹云", "雨云", "雪云", "雷雨云", "太阳云", "月亮云", "彩虹云", "雾云"],
    },
    {
        "atlas": "flower",
        "group": "花朵",
        "ids": styled_ids(["flower-daisy", "flower-tulip", "flower-sunflower"]),
        "labels": ["雏菊", "郁金香", "向日葵", "玫瑰", "百合", "水仙", "樱花枝", "牵牛花", "牡丹", "荷花", "风铃草", "三色堇"],
    },
    {
        "atlas": "sky",
        "group": "天空",
        "ids": ["sky-sun", "sky-moon", "sky-moon-airy", "sky-star", "sky-star-airy", "sky-star-patterned", "sky-sun-airy", "sky-star-detailed", "sky-moon-patterned", "sky-sun-patterned", "sky-sun-detailed", "sky-moon-detailed"],
        "labels": ["太阳", "月牙", "满月", "星星", "流星", "彗星", "土星", "星星群", "银河", "日食", "流星雨", "望远镜"],
    },
    {
        "atlas": "weather",
        "group": "天气",
        "ids": styled_ids(["weather-rainbow", "weather-lightning", "weather-snowflake"]),
        "labels": ["彩虹", "闪电", "雪花", "雨滴", "太阳雨", "风吹叶", "龙卷风", "冰雹云", "暴雪云", "雨伞", "雾气", "风向标"],
    },
    {
        "atlas": "insect",
        "group": "小虫子",
        "ids": styled_ids(["insect-ladybug", "insect-dragonfly", "insect-beetle"]),
        "labels": ["瓢虫", "蜻蜓", "甲虫", "蜜蜂", "蚂蚁", "毛毛虫", "螳螂", "蝉", "蚱蜢", "萤火虫", "竹节虫", "蜗牛"],
    },
    {
        "atlas": "ocean",
        "group": "海洋",
        "ids": styled_ids(["ocean-shell", "ocean-starfish", "ocean-coral"]),
        "labels": ["扇贝壳", "海星", "珊瑚", "海螺", "水母", "海马", "海草", "珍珠蚌", "海胆", "船锚", "漂流瓶", "沙钱"],
    },
    {
        "atlas": "fruit",
        "group": "果实",
        "ids": styled_ids(["fruit-apple", "fruit-strawberry", "fruit-acorn"]),
        "labels": ["苹果", "草莓", "橡果", "梨", "葡萄", "樱桃", "桃子", "西瓜", "柠檬", "菠萝", "香蕉", "南瓜"],
    },
    {
        "atlas": "tree",
        "group": "树木",
        "ids": styled_ids(["tree-round", "tree-pine", "tree-palm"]),
        "labels": ["阔叶树", "松树", "棕榈树", "柳树", "银杏树", "开花树", "苹果树", "白桦林", "猴面包树", "盆景", "冬日树", "竹林"],
    },
    {
        "atlas": "garden",
        "group": "庭院",
        "ids": styled_ids(["garden-mushroom", "garden-watering-can", "garden-flowerpot"]),
        "labels": ["蘑菇", "洒水壶", "花盆", "小铲子", "耙子", "园艺手套", "木桶", "篱笆", "长椅", "雨靴", "园艺剪", "鸟屋"],
    },
    {
        "atlas": "transport",
        "group": "出行",
        "ids": styled_ids(["transport-rocket", "transport-sailboat", "transport-balloon"]),
        "labels": ["火箭", "帆船", "热气球", "小汽车", "蒸汽火车", "飞机", "自行车", "滑板车", "直升机", "潜水艇", "公交车", "拖拉机"],
    },
    {
        "atlas": "home",
        "group": "小屋",
        "ids": styled_ids(["home-house", "home-castle", "home-tent"]),
        "labels": ["乡间小屋", "城堡", "帐篷", "灯塔", "谷仓", "木屋", "树屋", "冰屋", "风车屋", "城市小楼", "蘑菇屋", "小亭子"],
    },
    {
        "atlas": "toy",
        "group": "玩具",
        "ids": styled_ids(["toy-kite", "toy-pinwheel", "toy-blocks"]),
        "labels": ["风筝", "风车", "积木", "小鼓", "皮球", "拼图", "摇摇马", "纸飞机", "沙桶", "陀螺", "呼啦圈", "小拉车"],
    },
    {
        "atlas": "nature",
        "group": "自然",
        "ids": styled_ids(["nature-mountain", "nature-wave", "nature-raindrops"]),
        "labels": ["山峰", "浪花", "雨滴", "火山", "河流", "瀑布", "岩石", "草丛", "湖泊", "沙丘", "峡谷", "山洞"],
    },
]


Point = tuple[int, int]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--threshold", type=int, default=150)
    parser.add_argument("--min-ink-area", type=int, default=20)
    parser.add_argument("--min-region-area", type=int, default=28)
    parser.add_argument("--max-regions", type=int, default=56)
    parser.add_argument("--simplify", type=float, default=0.9)
    return parser.parse_args()


def composite_gray(image: Image.Image) -> Image.Image:
    source = image.convert("RGBA")
    white = Image.new("RGBA", source.size, (255, 255, 255, 255))
    return Image.alpha_composite(white, source).convert("L").filter(ImageFilter.MedianFilter(3))


def image_to_mask(image: Image.Image, threshold: int) -> list[list[bool]]:
    gray = composite_gray(image)
    initial = gray.point(lambda value: 255 if value < threshold else 0)
    thickened = initial.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MedianFilter(3))
    pixels = thickened.load()
    return [[pixels[x, y] > 0 for x in range(thickened.width)] for y in range(thickened.height)]


def components(mask: list[list[bool]], target: bool) -> list[tuple[list[Point], bool]]:
    height = len(mask)
    width = len(mask[0]) if height else 0
    seen = [[False] * width for _ in range(height)]
    found: list[tuple[list[Point], bool]] = []
    for y in range(height):
        for x in range(width):
            if seen[y][x] or mask[y][x] is not target:
                continue
            queue = deque([(x, y)])
            seen[y][x] = True
            points: list[Point] = []
            touches_edge = False
            while queue:
                current_x, current_y = queue.popleft()
                points.append((current_x, current_y))
                if current_x == 0 or current_y == 0 or current_x == width - 1 or current_y == height - 1:
                    touches_edge = True
                for next_x, next_y in ((current_x - 1, current_y), (current_x + 1, current_y), (current_x, current_y - 1), (current_x, current_y + 1)):
                    if 0 <= next_x < width and 0 <= next_y < height and not seen[next_y][next_x] and mask[next_y][next_x] is target:
                        seen[next_y][next_x] = True
                        queue.append((next_x, next_y))
            found.append((points, touches_edge))
    return found


def remove_small_ink(mask: list[list[bool]], min_area: int) -> list[list[bool]]:
    result = [row[:] for row in mask]
    for points, _ in components(mask, True):
        if len(points) < min_area:
            for x, y in points:
                result[y][x] = False
    return result


def mask_for_points(width: int, height: int, points: list[Point]) -> list[list[bool]]:
    result = [[False] * width for _ in range(height)]
    for x, y in points:
        result[y][x] = True
    return result


DIRECTIONS = {(1, 0): 0, (0, 1): 1, (-1, 0): 2, (0, -1): 3}


def boundary_loops(mask: list[list[bool]]) -> list[list[Point]]:
    height = len(mask)
    width = len(mask[0]) if height else 0
    edges: set[tuple[Point, Point]] = set()
    for y in range(height):
        for x in range(width):
            if not mask[y][x]:
                continue
            if y == 0 or not mask[y - 1][x]:
                edges.add(((x, y), (x + 1, y)))
            if x == width - 1 or not mask[y][x + 1]:
                edges.add(((x + 1, y), (x + 1, y + 1)))
            if y == height - 1 or not mask[y + 1][x]:
                edges.add(((x + 1, y + 1), (x, y + 1)))
            if x == 0 or not mask[y][x - 1]:
                edges.add(((x, y + 1), (x, y)))

    outgoing: dict[Point, set[Point]] = {}
    for start, end in edges:
        outgoing.setdefault(start, set()).add(end)

    loops: list[list[Point]] = []
    while edges:
        start_edge = min(edges)
        start, current = start_edge
        previous = start
        loop = [start]
        edges.remove(start_edge)
        outgoing[start].remove(current)
        guard = 0
        while current != start and guard < 1_000_000:
            loop.append(current)
            candidates = [candidate for candidate in outgoing.get(current, set()) if (current, candidate) in edges]
            if not candidates:
                break
            previous_direction = DIRECTIONS[(current[0] - previous[0], current[1] - previous[1])]

            def turn_priority(candidate: Point) -> tuple[int, Point]:
                direction = DIRECTIONS[(candidate[0] - current[0], candidate[1] - current[1])]
                turn = (direction - previous_direction) % 4
                priority = {1: 0, 0: 1, 3: 2, 2: 3}[turn]
                return priority, candidate

            next_point = min(candidates, key=turn_priority)
            edges.remove((current, next_point))
            outgoing[current].remove(next_point)
            previous, current = current, next_point
            guard += 1
        if current == start and len(loop) >= 4:
            loops.append(loop)
    return loops


def distance_to_line(point: Point, start: Point, end: Point) -> float:
    if start == end:
        return math.dist(point, start)
    numerator = abs((end[1] - start[1]) * point[0] - (end[0] - start[0]) * point[1] + end[0] * start[1] - end[1] * start[0])
    denominator = math.hypot(end[1] - start[1], end[0] - start[0])
    return numerator / denominator


def rdp(points: list[Point], epsilon: float) -> list[Point]:
    if len(points) <= 2:
        return points
    start, end = points[0], points[-1]
    distances = [distance_to_line(point, start, end) for point in points[1:-1]]
    if not distances:
        return [start, end]
    maximum = max(distances)
    if maximum <= epsilon:
        return [start, end]
    index = distances.index(maximum) + 1
    return rdp(points[: index + 1], epsilon)[:-1] + rdp(points[index:], epsilon)


def simplify_loop(loop: list[Point], epsilon: float) -> list[Point]:
    if len(loop) < 8:
        return loop
    first = min(range(len(loop)), key=lambda index: (loop[index][0], loop[index][1]))
    rotated = loop[first:] + loop[:first]
    farthest = max(range(1, len(rotated)), key=lambda index: math.dist(rotated[0], rotated[index]))
    first_half = rdp(rotated[: farthest + 1], epsilon)
    second_half = rdp(rotated[farthest:] + [rotated[0]], epsilon)
    return first_half[:-1] + second_half[:-1]


def path_for_mask(mask: list[list[bool]], simplify: float) -> str:
    commands: list[str] = []
    for loop in boundary_loops(mask):
        simplified = simplify_loop(loop, simplify)
        if len(simplified) < 3:
            continue
        commands.append(f"M{simplified[0][0]} {simplified[0][1]}")
        commands.extend(f"L{x} {y}" for x, y in simplified[1:])
        commands.append("Z")
    return "".join(commands)


def build_sticker(image: Image.Image, sticker_id: str, label: str, group: str, args: argparse.Namespace) -> dict[str, object]:
    mask = remove_small_ink(image_to_mask(image, args.threshold), args.min_ink_area)
    height = len(mask)
    width = len(mask[0]) if height else 0
    ink_path = path_for_mask(mask, args.simplify)
    if not ink_path:
        raise ValueError(f"{sticker_id} has no usable ink path")

    region_candidates = [
        points for points, touches_edge in components(mask, False)
        if not touches_edge and len(points) >= args.min_region_area
    ]
    region_candidates.sort(key=len, reverse=True)
    region_candidates = region_candidates[: args.max_regions]
    region_candidates.sort(key=lambda points: (sum(y for _, y in points) / len(points), sum(x for x, _ in points) / len(points)))
    regions = []
    for index, points in enumerate(region_candidates):
        region_path = path_for_mask(mask_for_points(width, height, points), args.simplify)
        if region_path:
            regions.append({"id": f"region-{index + 1:02d}", "path": region_path, "area": len(points)})

    return {
        "id": sticker_id,
        "label": label,
        "group": group,
        "width": width,
        "height": height,
        "inkPath": ink_path,
        "regions": regions,
    }


def extract_theme(theme: dict[str, object], output_dir: Path) -> Path:
    atlas_name = str(theme["atlas"])
    ids = list(theme["ids"])
    theme_dir = output_dir / atlas_name
    command = [
        "python3", str(EXTRACTOR),
        "--input", str(ATLAS_ROOT / f"{atlas_name}.atlas.png"),
        "--output-dir", str(theme_dir),
        "--columns", "4",
        "--rows", "3",
        "--ids", ",".join(ids),
        "--auto-key", "none",
        "--key-color", "#00FF00",
        "--trim",
        "--padding", "6",
        "--inset", "2",
        "--fail-on-warning",
    ]
    subprocess.run(command, check=True, capture_output=True, text=True)
    return theme_dir


def validate_theme_metadata() -> None:
    all_ids: list[str] = []
    for theme in THEMES:
        ids = list(theme["ids"])
        labels = list(theme["labels"])
        if len(ids) != 12 or len(labels) != 12:
            raise ValueError(f"{theme['atlas']} must contain exactly 12 ids and labels")
        all_ids.extend(ids)
    if len(all_ids) != 180 or len(set(all_ids)) != 180:
        raise ValueError("sticker ids must contain 180 unique values")


def main() -> int:
    args = parse_args()
    validate_theme_metadata()
    stickers: list[dict[str, object]] = []
    source_manifests: list[dict[str, object]] = []
    with tempfile.TemporaryDirectory(prefix="mumu-drawing-stickers-") as temporary:
        temporary_root = Path(temporary)
        for theme in THEMES:
            theme_dir = extract_theme(theme, temporary_root)
            manifest = json.loads((theme_dir / "manifest.json").read_text(encoding="utf-8"))
            source_manifests.append({
                "atlas": theme["atlas"],
                "sourceWidth": manifest["sourceWidth"],
                "sourceHeight": manifest["sourceHeight"],
                "warnings": manifest["warnings"],
            })
            for sticker_id, label in zip(theme["ids"], theme["labels"]):
                image = Image.open(theme_dir / f"{sticker_id}.png")
                stickers.append(build_sticker(image, str(sticker_id), str(label), str(theme["group"]), args))

    output = {
        "schemaVersion": 1,
        "style": "generated-premium-black-white-coloring-line-art",
        "stickerCount": len(stickers),
        "themeCount": len(THEMES),
        "sourceAtlases": source_manifests,
        "stickers": stickers,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    region_counts = [len(sticker["regions"]) for sticker in stickers]
    print(
        f"wrote {len(stickers)} stickers to {args.output}; "
        f"regions min/avg/max={min(region_counts)}/{sum(region_counts) / len(region_counts):.1f}/{max(region_counts)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
