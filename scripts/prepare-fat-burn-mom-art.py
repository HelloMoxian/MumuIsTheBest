#!/usr/bin/env python3
"""Extract the mom's keyed atlas with stable full-cell canvases and violet-safe edges."""
from pathlib import Path
import argparse
import importlib.util
import json
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SKILL_SCRIPT = ROOT / ".agents/skills/chroma-atlas-extractor/scripts/extract_chroma_atlas.py"
NAMES = [f"{view}-{part}" for view in ("front", "side") for part in (
    "head", "torso", "upper-arm", "forearm", "hand", "thigh", "shin", "shoe"
)]


def palette_safe_matte(image, key, transparent_threshold, opaque_threshold, despill):
    """Distance matte: generic magenta dominance also keys the purple costume.

    Only near-key pixels receive edge transparency. Fully opaque skin, hair,
    lavender fabric, and indigo leggings retain their exact original RGB.
    Unmixing the key from partial pixels removes the magenta edge reflection.
    """
    result = image.convert("RGBA")
    pixels = []
    for red, green, blue, original_alpha in result.getdata():
        rgb = (red, green, blue)
        distance = max(abs(channel - backdrop) for channel, backdrop in zip(rgb, key))
        if distance <= transparent_threshold:
            pixels.append((0, 0, 0, 0))
            continue
        if distance >= opaque_threshold:
            pixels.append((red, green, blue, original_alpha))
            continue
        fraction = (distance - transparent_threshold) / (opaque_threshold - transparent_threshold)
        fraction = fraction * fraction * (3 - 2 * fraction)
        alpha = round(original_alpha * fraction)
        if alpha <= 8:
            pixels.append((0, 0, 0, 0))
            continue
        if despill:
            rgb = tuple(max(0, min(255, round((channel - backdrop * (1 - fraction)) / fraction)))
                        for channel, backdrop in zip(rgb, key))
        pixels.append((*rgb, alpha))
    result.putdata(pixels)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", choices=("v2", "v3"), default="v3")
    args = parser.parse_args()
    source = ROOT / f"assets/game/fat-burn/mom-{args.version}-atlas.png"
    output = ROOT / f"apps/web/public/images/fat-burn/mom-{args.version}"
    spec = importlib.util.spec_from_file_location("chroma_atlas", SKILL_SCRIPT)
    extractor = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(extractor)
    if args.version == "v2":
        extractor.chroma_to_alpha = palette_safe_matte
    sys.argv = [str(SKILL_SCRIPT), "--input", str(source), "--output-dir", str(output),
                "--columns", "4", "--rows", "4", "--ids", ",".join(NAMES),
                "--inset", "3", "--auto-key", "border", "--fail-on-warning"]
    if args.version == "v2":
        sys.argv.extend(["--transparent-threshold", "24", "--opaque-threshold", "130"])
    code = extractor.main()
    manifest_file = output / "manifest.json"
    manifest = json.loads(manifest_file.read_text())
    manifest["source"] = source.relative_to(ROOT).as_posix()
    manifest["matte"] = ("palette-safe RGB distance; 24/130 soft alpha; key unmixing"
                         if args.version == "v2" else "skill default: automatic green key, soft alpha and despill")
    if args.version == "v3":
        # A focused image-tool correction removes the painted arm socket. Use
        # only this cell so unrelated pixels from that edit never replace v3.
        revision = ROOT / "assets/game/fat-burn/mom-v3-torso-fix-atlas.png"
        revised_atlas = Image.open(revision).convert("RGBA")
        if revised_atlas.size != (manifest["sourceWidth"], manifest["sourceHeight"]):
            raise ValueError("Torso revision must preserve the original atlas grid")
        item = next(item for item in manifest["items"] if item["id"] == "side-torso")
        key = extractor.sample_grid_key(revised_atlas, 4, 4, 3)
        cell = extractor.chroma_to_alpha(revised_atlas.crop(item["sourceBox"]), key, 24, 150, True)
        coverage, corners = extractor.alpha_metrics(cell)
        if coverage < .005 or coverage > .92 or max(corners) > 12:
            raise ValueError("Torso revision has an invalid matte")
        cell.save(output / item["filename"], format="PNG", optimize=True)
        item.update(source=revision.relative_to(ROOT).as_posix(),
                    keyColor="#" + "".join(f"{channel:02X}" for channel in key),
                    opaqueCoverage=coverage, cornerAlphas=corners)
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
