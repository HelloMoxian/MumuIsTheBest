#!/usr/bin/env python3
"""Generate four clean 5x2 atlases of outlined digits for drawing stickers."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / "content/drawing-studio/sticker-atlases/v1"
CELL_WIDTH = 320
CELL_HEIGHT = 360
COLS = 5
ROWS = 2

STYLES = [
    ("number-rounded", "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf", 244, 9),
    ("number-block", "/System/Library/Fonts/Supplemental/Arial Black.ttf", 228, 8),
    ("number-serif", "/System/Library/Fonts/Supplemental/Georgia Bold.ttf", 238, 8),
    ("number-chalk", "/System/Library/Fonts/Supplemental/ChalkboardSE.ttc", 248, 8),
]


def draw_atlas(name: str, font_path: str, font_size: int, stroke_width: int) -> Path:
    image = Image.new("RGBA", (CELL_WIDTH * COLS, CELL_HEIGHT * ROWS), (255, 255, 255, 0))
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(font_path, font_size)
    for digit in range(10):
        column = digit % COLS
        row = digit // COLS
        text = str(digit)
        bounds = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
        text_width = bounds[2] - bounds[0]
        text_height = bounds[3] - bounds[1]
        x = column * CELL_WIDTH + (CELL_WIDTH - text_width) / 2 - bounds[0]
        y = row * CELL_HEIGHT + (CELL_HEIGHT - text_height) / 2 - bounds[1]
        draw.text(
            (x, y),
            text,
            font=font,
            fill=(255, 255, 255, 255),
            stroke_width=stroke_width,
            stroke_fill=(15, 17, 27, 255),
        )
    destination = OUTPUT_ROOT / f"{name}.atlas.png"
    image.save(destination, optimize=True)
    return destination


def main() -> int:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    for style in STYLES:
        print(draw_atlas(*style))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
