#!/usr/bin/env python3
"""Rebuild one metronome icon at a time, preserving the generated source atlases."""
import argparse
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/art/metronome/instruments/v1"
OUTPUT = ROOT / "apps/web/public/images/metronome/instruments/v1"
CATALOG = json.loads((ROOT / "content/metronome/instruments.v1.json").read_text())["instruments"]
EXTRACTOR = ROOT / ".agents/skills/chroma-atlas-extractor/scripts/extract_chroma_atlas.py"
spec = importlib.util.spec_from_file_location("chroma_atlas", EXTRACTOR)
chroma = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chroma)


def extract(index):
    sheet = "abc"[index // 16]
    cell = index % 16
    row, column = divmod(cell, 4)
    image = Image.open(SOURCE / ("atlas-" + sheet + ".png")).convert("RGBA")
    xs = [round(i * image.width / 4) for i in range(5)]
    ys = [round(i * image.height / 4) for i in range(5)]
    # Three inspected cuts avoid clipping a cello scroll, music-box lid or bass scroll.
    # Coordinates are recorded relative to the original 1254px artwork.
    if sheet == "a" and column == 3:
        ys[2] = round(624 * image.height / 1254)
    if sheet == "b" and column == 1:
        ys[3] = round(927 * image.height / 1254)
    if sheet == "b" and column == 3:
        ys[1] = round(313 * image.height / 1254)
    box = [xs[column], ys[row], xs[column + 1], ys[row + 1]]
    cell_image = image.crop(box)
    # Outputs already contain native alpha; do not key out black instrument parts.
    cell_image.putalpha(cell_image.getchannel("A").point(lambda alpha: 0 if alpha <= chroma.ALPHA_NOISE_FLOOR else alpha))
    trimmed, trim_box = chroma.trim_transparent(cell_image, padding=0)
    if trim_box is None:
        raise ValueError("Empty instrument cell: " + CATALOG[index]["id"])
    coverage, _ = chroma.alpha_metrics(trimmed)
    trimmed.thumbnail((232, 232), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    output.alpha_composite(trimmed, ((256 - trimmed.width) // 2, (256 - trimmed.height) // 2))
    final_coverage, corners = chroma.alpha_metrics(output)
    if max(corners) or final_coverage < .015:
        raise ValueError("Invalid icon alpha: " + CATALOG[index]["id"])
    return output, {
        "id": CATALOG[index]["id"], "name": CATALOG[index]["name"], "sheet": sheet,
        "row": row, "column": column, "sourceBox": box, "trimBox": trim_box,
        "nativeAlpha": True, "alphaNoiseFloor": chroma.ALPHA_NOISE_FLOOR,
        "outputWidth": 256, "outputHeight": 256, "opaqueCoverage": final_coverage,
        "cornerAlphas": corners,
        "file": "/images/metronome/instruments/v1/" + CATALOG[index]["id"] + ".webp",
    }


def create(asset):
    index = next(i for i, instrument in enumerate(CATALOG) if instrument["id"] == asset)
    image, item = extract(index)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT / (asset + ".webp")
    image.save(destination, "WEBP", lossless=True, method=6)
    print(json.dumps(item, ensure_ascii=False))


def manifest():
    items = []
    for index, instrument in enumerate(CATALOG):
        _, item = extract(index)
        destination = OUTPUT / (instrument["id"] + ".webp")
        item["sha256"] = hashlib.sha256(destination.read_bytes()).hexdigest()
        items.append(item)
    value = {
        "schemaVersion": 1, "generator": "built-in image_gen",
        "sourceGrid": {"columns": 4, "rows": 4, "indexOrder": "row-major-zero-based"},
        "sources": [{"file": "atlas-" + sheet + ".png",
            "sha256": hashlib.sha256((SOURCE / ("atlas-" + sheet + ".png")).read_bytes()).hexdigest()}
            for sheet in "abc"],
        "unusedCells": {"c": list(range(6, 16))},
        "items": items,
    }
    (SOURCE / "manifest.json").write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print("manifest: " + str(len(items)) + " verified icons")


def preview():
    cell, columns = 128, 8
    canvas = Image.new("RGB", (columns * cell, math.ceil(len(CATALOG) / columns) * cell), "#10112d")
    for index, instrument in enumerate(CATALOG):
        image = Image.open(OUTPUT / (instrument["id"] + ".webp")).convert("RGBA")
        image.thumbnail((104, 104), Image.Resampling.LANCZOS)
        x = (index % columns) * cell + (cell - image.width) // 2
        y = (index // columns) * cell + (cell - image.height) // 2
        canvas.paste(image, (x, y), image)
    canvas.save(SOURCE / "preview.webp", "WEBP", quality=92, method=6)
    print("preview: 38 icons on the app background")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--asset", choices=[item["id"] for item in CATALOG])
    group.add_argument("--manifest", action="store_true")
    group.add_argument("--preview", action="store_true")
    args = parser.parse_args()
    if args.asset:
        create(args.asset)
    elif args.manifest:
        manifest()
    else:
        preview()
