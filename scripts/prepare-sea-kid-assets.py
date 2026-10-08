"""Clean disconnected atlas remnants, retaining full cell canvases and source art.

Run after chroma-atlas-extractor with --keep-background (these sources have alpha).
Uses Pillow from the local environment; no generated or personal runtime data.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps/web/public/images/sea-kid"
catalog = {}

for group in ("characters", "objects", "environment"):
    manifest_path = PUBLIC / group / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    for path in sorted((PUBLIC / group).glob("*.png")):
        image = Image.open(path).convert("RGBA")
        width, height = image.size
        if path.stem not in ("grass", "earth", "cave", "ice"):
            alpha = list(image.getchannel("A").getdata())
            seen = bytearray(width * height)
            components = []
            for index, value in enumerate(alpha):
                if value <= 20 or seen[index]:
                    continue
                queue, component = [index], []
                seen[index] = 1
                while queue:
                    current = queue.pop()
                    component.append(current)
                    x, y = current % width, current // width
                    neighbors = ([] if x == 0 else [current - 1])
                    neighbors += [] if x + 1 == width else [current + 1]
                    neighbors += [] if y == 0 else [current - width]
                    neighbors += [] if y + 1 == height else [current + width]
                    for neighbor in neighbors:
                        if not seen[neighbor] and alpha[neighbor] > 20:
                            seen[neighbor] = 1
                            queue.append(neighbor)
                components.append(component)
            if not components:
                raise ValueError(f"Empty sprite: {path.name}")
            largest = max(components, key=len)
            keep = set(largest)
            # Actors and individual items are a single subject. Adjacent-row feet
            # can be large, so size alone cannot classify them as legitimate parts.
            if group == "environment":
                for component in components:
                    if len(component) >= len(largest) * 0.035:
                        keep.update(component)
            mask = bytearray(width * height)
            for pixel in keep:
                x, y = pixel % width, pixel // width
                for yy in range(max(0, y - 1), min(height, y + 2)):
                    for xx in range(max(0, x - 1), min(width, x + 2)):
                        mask[yy * width + xx] = 1
            channel = Image.new("L", image.size)
            channel.putdata([value if mask[i] else 0 for i, value in enumerate(alpha)])
            image.putalpha(channel)
            image.save(path, optimize=True)
        alpha = image.getchannel("A")
        bounds = alpha.point(lambda v: 255 if v > 60 else 0).getbbox()
        if not bounds:
            raise ValueError(f"Empty alpha: {path.name}")
        entry = {"url": f"/images/sea-kid/{group}/{path.name}", "bounds": list(bounds), "size": [width, height]}
        if path.stem.startswith("hero-"):
            head = alpha.crop((0, 0, width, 95)).point(lambda v: 255 if v > 100 else 0).getbbox()
            entry["anchor"] = [round((head[0] + head[2]) / 2, 1) if head else 127, 240]
        catalog[path.stem] = entry
        for cell in manifest["items"]:
            if cell["id"] == path.stem:
                cell["cornerAlphas"] = [alpha.getpixel(p) for p in [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]]
                cell["opaqueCoverage"] = round(sum(v > 0 for v in alpha.getdata()) / (width * height), 6)
        if group != "environment" and not path.stem.startswith("hero-"):
            # Full original cell remains available even when renderer uses bounds.
            assert image.mode == "RGBA"
    manifest["source"] = f"assets/game/sea-kid/{group}.png"
    manifest["alphaCleanup"] = "Small disconnected components removed; full cell coordinates retained."
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

destination = ROOT / "apps/web/src/features/sea-kid/assets.json"
destination.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
print(f"Prepared {len(catalog)} sprites with stable anchors.")
