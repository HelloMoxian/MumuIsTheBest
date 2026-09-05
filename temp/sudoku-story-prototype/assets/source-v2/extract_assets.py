"""Deterministically isolate generated sprites, then use the project atlas tool.

Generated rows are visually aligned but are not exact mathematical thirds.
Find the nine large alpha components, crop their original pixels, and center
them on identical canvases. This does not redraw or recolor generated art.
"""
from collections import deque
import json
import os
from pathlib import Path
import subprocess
import sys
from PIL import Image, ImageChops, ImageFilter

SOURCE = Path(__file__).resolve().parent
ASSETS = SOURCE.parent
EXTRACTOR = SOURCE.parents[3] / '.agents/skills/chroma-atlas-extractor/scripts/extract_chroma_atlas.py'
THEMES = ['gems', 'elements', 'numbers', 'letters', 'crew']


def regions(image):
    width, height = image.size
    pixels = bytearray(image.getchannel('A').point(lambda a: 255 if a > 32 else 0).tobytes())
    found = []
    for start in range(width * height):
        if not pixels[start]:
            continue
        pixels[start] = 0
        queue = deque([start])
        members = []
        count = 0
        left = right = start % width
        top = bottom = start // width
        while queue:
            pixel = queue.popleft()
            members.append(pixel)
            x, y = pixel % width, pixel // width
            count += 1
            left, right = min(left, x), max(right, x)
            top, bottom = min(top, y), max(bottom, y)
            for neighbor in (pixel - 1 if x else -1, pixel + 1 if x < width - 1 else -1, pixel - width, pixel + width):
                if 0 <= neighbor < width * height and pixels[neighbor]:
                    pixels[neighbor] = 0
                    queue.append(neighbor)
        if count > 9000:
            found.append(((left, top, right + 1, bottom + 1), members))
    if len(found) != 9:
        raise ValueError(f'Expected 9 main silhouettes, found {len(found)}; inspect the atlas.')
    by_row = sorted(found, key=lambda item: item[0][1] + item[0][3])
    return [item for row in range(3) for item in sorted(by_row[row * 3:row * 3 + 3], key=lambda item: item[0][0])]


for theme in THEMES:
    source = Image.open(SOURCE / f'{theme}-atlas.png').convert('RGBA')
    aligned = Image.new('RGBA', (1536, 1536), (0, 0, 0, 0))
    placements = []
    for index, (box, members) in enumerate(regions(source)):
        box = (max(0, box[0] - 2), max(0, box[1] - 2), min(source.width, box[2] + 2), min(source.height, box[3] + 2))
        sprite = source.crop(box)
        # Keep the subject's original alpha and its antialiased edge; omit
        # disconnected alpha dust and faint pixels from a neighboring row.
        support = bytearray(sprite.width * sprite.height)
        for pixel in members:
            x, y = pixel % source.width - box[0], pixel // source.width - box[1]
            support[y * sprite.width + x] = 255
        matte = Image.frombytes('L', sprite.size, bytes(support)).filter(ImageFilter.MaxFilter(5))
        sprite.putalpha(ImageChops.multiply(sprite.getchannel('A'), matte))
        if max(sprite.size) > 432:
            raise ValueError(f'{theme} sprite {index + 1} needs a larger canvas; inspect before scaling.')
        position = (index % 3 * 512 + (512 - sprite.width) // 2, index // 3 * 512 + (512 - sprite.height) // 2)
        aligned.paste(sprite, position)
        placements.append({'id': f'symbol-{index + 1:02}', 'sourceBox': box, 'alignedPosition': position})
    prepared = SOURCE / f'{theme}-aligned.png'
    aligned.save(prepared)
    (SOURCE / f'{theme}-alignment.json').write_text(json.dumps({'source': f'{theme}-atlas.png', 'placements': placements}, indent=2) + '\n')
    subprocess.run([sys.executable, str(EXTRACTOR), '--input', str(prepared), '--output-dir', str(ASSETS / 'v2/icons' / theme), '--columns', '3', '--rows', '3', '--ids', ','.join(f'symbol-{i:02}' for i in range(1, 10)), '--keep-background', '--inset', '0', '--fail-on-warning'], check=True)

subprocess.run([sys.executable, str(EXTRACTOR), '--input', str(SOURCE / 'backgrounds-atlas.png'), '--output-dir', str(ASSETS / 'v2/backgrounds'), '--columns', '2', '--rows', '3', '--ids', ','.join(THEMES + ['hub']), '--keep-background', '--inset', '0'], check=True)

# Manifests travel with the assets and must not depend on this computer's path.
for manifest in (ASSETS / 'v2').rglob('manifest.json'):
    data = json.loads(manifest.read_text())
    data['source'] = Path(os.path.relpath(data['source'], manifest.parent)).as_posix()
    manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
