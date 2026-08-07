#!/usr/bin/env python3
"""Split a regular image atlas and optionally remove a flat chroma background."""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

from PIL import Image


KEY_DOMINANCE_THRESHOLD = 16.0
ALPHA_NOISE_FLOOR = 8


def parse_color(value: str) -> tuple[int, int, int]:
    normalized = value.strip().lstrip("#")
    if not re.fullmatch(r"[0-9a-fA-F]{6}", normalized):
        raise argparse.ArgumentTypeError("key color must use RRGGBB or #RRGGBB")
    return tuple(int(normalized[index : index + 2], 16) for index in (0, 2, 4))


def safe_id(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-")
    if not normalized:
        raise ValueError(f"invalid empty sprite id derived from {value!r}")
    return normalized.lower()


def parse_ids(raw: str | None, count: int, prefix: str) -> list[str]:
    if raw:
        values = [safe_id(item) for item in raw.split(",") if item.strip()]
        if len(values) != count:
            raise ValueError(f"--ids must contain exactly {count} values, got {len(values)}")
        if len(set(values)) != len(values):
            raise ValueError("--ids values must be unique")
        return values
    width = max(2, len(str(count)))
    return [f"{safe_id(prefix)}-{index + 1:0{width}d}" for index in range(count)]


def sample_grid_key(
    image: Image.Image, columns: int, rows: int, inset: int
) -> tuple[int, int, int]:
    source = image.convert("RGB")
    samples: list[tuple[int, int, int]] = []
    offset = max(5, inset + 3)
    radius = 2
    for row in range(rows):
        for column in range(columns):
            left = round(column * source.width / columns)
            top = round(row * source.height / rows)
            right = round((column + 1) * source.width / columns) - 1
            bottom = round((row + 1) * source.height / rows) - 1
            for center_x, center_y in (
                (left + offset, top + offset),
                (right - offset, top + offset),
                (left + offset, bottom - offset),
                (right - offset, bottom - offset),
            ):
                for y in range(center_y - radius, center_y + radius + 1):
                    for x in range(center_x - radius, center_x + radius + 1):
                        samples.append(source.getpixel((x, y)))
    return tuple(round(statistics.median(channel)) for channel in zip(*samples))


def spill_channels(key: tuple[int, int, int]) -> list[int]:
    key_max = max(key)
    if key_max < 128:
        return []
    return [
        index
        for index, value in enumerate(key)
        if value >= key_max - 16 and value >= 128
    ]


def dominance_alpha(
    rgb: tuple[int, int, int], key: tuple[int, int, int]
) -> tuple[int, float]:
    spill = spill_channels(key)
    if not spill:
        return 255, 0
    non_spill = [index for index in range(3) if index not in spill]
    key_strength = min(rgb[index] for index in spill)
    non_key_strength = max((rgb[index] for index in non_spill), default=0)
    dominance = float(key_strength - non_key_strength)
    if dominance <= 0:
        return 255, dominance
    denominator = max(1.0, float(max(key)) - non_key_strength)
    alpha = round((1 - min(1.0, dominance / denominator)) * 255)
    return alpha, dominance


def cleanup_spill(
    rgb: tuple[int, int, int], key: tuple[int, int, int], alpha: int
) -> tuple[int, int, int]:
    if alpha >= 252:
        return rgb
    channels = [float(value) for value in rgb]
    spill = spill_channels(key)
    non_spill = [index for index in range(3) if index not in spill]
    if not spill or not non_spill:
        return rgb
    cap = max(0.0, max(channels[index] for index in non_spill) - 1.0)
    for index in spill:
        channels[index] = min(channels[index], cap)
    return tuple(max(0, min(255, round(value))) for value in channels)


def chroma_to_alpha(
    image: Image.Image,
    key: tuple[int, int, int],
    transparent_threshold: float,
    opaque_threshold: float,
    despill: bool,
) -> Image.Image:
    source = image.convert("RGBA")
    converted: list[tuple[int, int, int, int]] = []
    span = opaque_threshold - transparent_threshold

    for red, green, blue, source_alpha in source.getdata():
        rgb = (red, green, blue)
        distance = max(abs(rgb[index] - key[index]) for index in range(3))
        if distance <= transparent_threshold:
            matte_alpha = 0
        elif distance >= opaque_threshold:
            matte_alpha = 255
        else:
            progress = (distance - transparent_threshold) / span
            progress = progress * progress * (3 - 2 * progress)
            matte_alpha = round(progress * 255)

        dominance_matte, dominance = dominance_alpha(rgb, key)
        key_like = distance <= 32 or dominance >= KEY_DOMINANCE_THRESHOLD
        alpha = min(source_alpha, matte_alpha, dominance_matte) if key_like else source_alpha
        if 0 < alpha <= ALPHA_NOISE_FLOOR:
            alpha = 0
        if alpha == 0:
            converted.append((0, 0, 0, 0))
            continue

        if despill and key_like:
            red, green, blue = cleanup_spill(rgb, key, alpha)

        converted.append((red, green, blue, alpha))

    result = Image.new("RGBA", source.size)
    result.putdata(converted)
    return result


def trim_transparent(image: Image.Image, padding: int) -> tuple[Image.Image, list[int] | None]:
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    if box is None:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0)), None
    left = max(0, box[0] - padding)
    top = max(0, box[1] - padding)
    right = min(image.width, box[2] + padding)
    bottom = min(image.height, box[3] + padding)
    return image.crop((left, top, right, bottom)), [left, top, right, bottom]


def alpha_metrics(image: Image.Image) -> tuple[float, list[int]]:
    if image.mode != "RGBA":
        return 1.0, [255, 255, 255, 255]
    alpha = image.getchannel("A")
    values = list(alpha.getdata())
    coverage = sum(value > 16 for value in values) / max(1, len(values))
    corners = [
        alpha.getpixel((0, 0)),
        alpha.getpixel((image.width - 1, 0)),
        alpha.getpixel((0, image.height - 1)),
        alpha.getpixel((image.width - 1, image.height - 1)),
    ]
    return round(coverage, 6), corners


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Split a regular atlas into per-cell PNGs with optional chroma removal."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--columns", required=True, type=int)
    parser.add_argument("--rows", required=True, type=int)
    parser.add_argument("--ids", help="Comma-separated row-major stable IDs")
    parser.add_argument("--prefix", default="sprite")
    parser.add_argument("--key-color", type=parse_color, default=parse_color("#00FF00"))
    parser.add_argument(
        "--auto-key",
        choices=("border", "none"),
        default="border",
        help="Estimate the actual key color from every cell corner or use --key-color exactly",
    )
    parser.add_argument("--transparent-threshold", type=float, default=24)
    parser.add_argument("--opaque-threshold", type=float, default=150)
    parser.add_argument("--inset", type=int, default=2)
    parser.add_argument("--trim", action="store_true")
    parser.add_argument("--padding", type=int, default=4)
    parser.add_argument("--keep-background", action="store_true")
    parser.add_argument("--no-despill", action="store_true")
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--fail-on-warning", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.columns <= 0 or args.rows <= 0:
        raise ValueError("columns and rows must be positive")
    if args.inset < 0 or args.padding < 0:
        raise ValueError("inset and padding cannot be negative")
    if args.transparent_threshold < 0 or args.opaque_threshold <= args.transparent_threshold:
        raise ValueError("opaque threshold must be greater than transparent threshold")
    if not args.input.is_file():
        raise FileNotFoundError(args.input)

    cell_count = args.columns * args.rows
    ids = parse_ids(args.ids, cell_count, args.prefix)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = args.manifest or args.output_dir / "manifest.json"

    source = Image.open(args.input)
    source.load()
    actual_key = (
        sample_grid_key(source, args.columns, args.rows, args.inset)
        if not args.keep_background and args.auto_key == "border"
        else args.key_color
    )
    items: list[dict[str, object]] = []
    warnings: list[str] = []

    for index, sprite_id in enumerate(ids):
        row = index // args.columns
        column = index % args.columns
        left = round(column * source.width / args.columns) + args.inset
        top = round(row * source.height / args.rows) + args.inset
        right = round((column + 1) * source.width / args.columns) - args.inset
        bottom = round((row + 1) * source.height / args.rows) - args.inset
        if right <= left or bottom <= top:
            raise ValueError(f"inset {args.inset} removes all pixels from cell {index}")

        cell = source.crop((left, top, right, bottom))
        trim_box: list[int] | None = None
        if args.keep_background:
            output = cell.convert("RGBA")
        else:
            output = chroma_to_alpha(
                cell,
                actual_key,
                args.transparent_threshold,
                args.opaque_threshold,
                not args.no_despill,
            )
            if args.trim:
                output, trim_box = trim_transparent(output, args.padding)

        coverage, corner_alphas = alpha_metrics(output)
        item_warnings: list[str] = []
        if not args.keep_background:
            if coverage < 0.005:
                item_warnings.append("cell appears empty")
            if coverage > 0.92:
                item_warnings.append("subject coverage is unusually high")
            if max(corner_alphas) > 12:
                item_warnings.append("one or more output corners are not transparent")

        filename = f"{sprite_id}.png"
        output_path = args.output_dir / filename
        output.save(output_path, format="PNG", optimize=True)
        for warning in item_warnings:
            warnings.append(f"{sprite_id}: {warning}")
        items.append(
            {
                "id": sprite_id,
                "index": index,
                "row": row,
                "column": column,
                "filename": filename,
                "sourceBox": [left, top, right, bottom],
                "trimBox": trim_box,
                "outputWidth": output.width,
                "outputHeight": output.height,
                "opaqueCoverage": coverage,
                "cornerAlphas": corner_alphas,
                "warnings": item_warnings,
            }
        )

    manifest = {
        "schemaVersion": 1,
        "source": str(args.input.resolve()),
        "sourceWidth": source.width,
        "sourceHeight": source.height,
        "columns": args.columns,
        "rows": args.rows,
        "indexOrder": "row-major-zero-based",
        "inset": args.inset,
        "trimmed": args.trim,
        "backgroundRemoved": not args.keep_background,
        "keyColor": None
        if args.keep_background
        else "#" + "".join(f"{channel:02X}" for channel in actual_key),
        "keyColorMode": "none" if args.keep_background else args.auto_key,
        "items": items,
        "warnings": warnings,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(
        f"wrote {len(items)} sprites to {args.output_dir} "
        f"with {len(warnings)} warning(s); manifest: {manifest_path}"
    )
    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)
    return 1 if warnings and args.fail_on_warning else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, FileNotFoundError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2)
