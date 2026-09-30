#!/usr/bin/env python3
"""Install public Terrarium DEM tiles in one atomic, indexed offline pack.

No runtime networking. Requires Pillow. Re-running reuses verified existing tiles;
failed downloads never replace the last complete pack. See NATURE_GEOGRAPHY.md.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import io
import json
import math
import os
from pathlib import Path
import struct
import time
import urllib.request
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BOUNDS = [73, 18, 136, 54]  # Coverage rectangle, never an administrative boundary.
SOURCE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
# WGS84 landmarks, not claims about the location of a road's highest point.
PASSES = [
    ('tanggula', '唐古拉山口', 91.663753, 33.010958, 'https://en.wikipedia.org/wiki/Tanggula_Pass'),
    ('pingxing', '平型关', 113.923575, 39.320883, 'Q7195851'),
    ('juyong', '居庸关', 116.068611, 40.287778, 'Q1330063'),
    ('shanhai', '山海关', 119.75357, 40.00916, 'Q1048381'),
    ('yanmen', '雁门关', 112.870306, 39.193503, 'Q1275915'),
    ('jianmen', '剑门关', 105.563333, 32.215, 'Q6191827'),
    ('tong', '潼关', 110.286111, 34.606111, 'Q6757995'),
    ('kunlun', '昆仑山口', 94.06859, 35.64049, 'Q1771024'),
    ('tongla', '聂拉木通拉山口', 86.167417, 28.516767, 'Q2441653'),
    ('jiayu', '嘉峪关', 98.21583, 39.80139, 'https://en.wikipedia.org/wiki/Jiayu_Pass'),
]

def tile(lon, lat, z):
    return (lon + 180) / 360 * 2**z, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2**z

def bounds_tiles(bounds, z):
    w, n = tile(bounds[0], bounds[3], z)
    e, s = tile(bounds[2], bounds[1], z)
    return {(z, x, y) for x in range(int(w), int(e) + 1) for y in range(int(n), int(s) + 1)}

def validate(data):
    image = Image.open(io.BytesIO(data))
    if image.format != 'PNG' or image.size != (256, 256) or image.mode != 'RGB':
        raise ValueError('Unexpected DEM encoding')
    image.load()
    return data

def install(folder, national_zoom=9):
    target = folder / 'cache/nature-maps/china-terrain.v1.pack'
    # A low-resolution global pyramid gives China and the surrounding world the
    # same palette, without a conspicuous rectangular image boundary.
    tiles = {(z, x, y) for z in range(5) for x in range(2**z) for y in range(2**z)}
    for z in range(4, national_zoom + 1):
        tiles |= bounds_tiles(BOUNDS, z)
    passes = []
    for id_, name, lon, lat, source in PASSES:
        # 5×5 z12 tiles (~35–45 km across), plus all parent tiles.
        x, y = map(int, tile(lon, lat, 12))
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                for z in range(national_zoom + 1, 13):
                    tiles.add((z, (x + dx) >> (12 - z), (y + dy) >> (12 - z)))
        passes.append(dict(id=id_, name=name, longitude=lon, latitude=lat,
                           source=source if source.startswith('https:') else 'https://www.wikidata.org/wiki/' + source))
    previous = {}
    if target.exists():
        raw = target.read_bytes()
        if raw[:8] != b'MUMUDEM1':
            raise ValueError('Existing terrain pack is invalid; preserved')
        length = struct.unpack('<I', raw[8:12])[0]
        old = json.loads(raw[12:12+length])
        if old.get('schemaVersion') != 1:
            raise ValueError('Unsupported existing terrain version; preserved')
        for key, (offset, size, digest) in old['tiles'].items():
            data = raw[12+length+offset:12+length+offset+size]
            if hashlib.sha256(data).hexdigest() != digest:
                raise ValueError('Existing terrain tile is damaged; preserved')
            previous[key] = data
    def download(t):
        z, x, y = t
        key = f'{z}/{x}/{y}'
        if key in previous:
            return key, validate(previous[key])
        for attempt in range(4):
            try:
                request = urllib.request.Request(SOURCE.format(z=z, x=x, y=y), headers={'User-Agent': 'MumuOfflineTerrain/1.0'})
                with urllib.request.urlopen(request, timeout=45) as response:
                    return key, validate(response.read(1024*1024))
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(1 + attempt)
    payloads = {}
    print(f'Downloading {len(tiles)} tiles; {len(previous)} cached', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=24) as executor:
        for future in concurrent.futures.as_completed([executor.submit(download, t) for t in sorted(tiles)]):
            key, data = future.result()
            payloads[key] = data
            if len(payloads) % 250 == 0:
                print(f'{len(payloads)}/{len(tiles)}', flush=True)
    for p in passes:
        x, y = tile(p['longitude'], p['latitude'], 12)
        image = Image.open(io.BytesIO(payloads[f'12/{int(x)}/{int(y)}']))
        r, g, b = image.getpixel((int(x % 1 * 256), int(y % 1 * 256)))
        p['elevation'] = round((r * 256 + g + b / 256 - 32768) / 10) * 10
    index, offset = {}, 0
    for key in sorted(payloads):
        data = payloads[key]
        index[key] = [offset, len(data), hashlib.sha256(data).hexdigest()]
        offset += len(data)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    manifest = dict(schemaVersion=1, id='china-terrain', createdAt=now, updatedAt=now,
                    coordinateSystem='WGS84', encoding='terrarium', bounds=BOUNDS,
                    minZoom=0, nationalZoom=national_zoom, maxZoom=12, passes=passes,
                    attribution='Mapzen / Tilezen; SRTM and GMTED2010 courtesy of USGS; ETOPO1 courtesy of NOAA. Coordinates: Wikidata (CC0).',
                    source=SOURCE, tiles=index)
    header = json.dumps(manifest, ensure_ascii=False, separators=(',', ':')).encode()
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.pack.tmp')
    # Exclusive creation also prevents concurrent publishers of this fixed pack.
    try:
        with temporary.open('xb') as f:
            f.write(b'MUMUDEM1' + struct.pack('<I', len(header)) + header)
            for key in sorted(payloads):
                f.write(payloads[key])
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary, target)
    except FileExistsError:
        raise RuntimeError('Another installation is publishing; existing files preserved')
    print(json.dumps(dict(path=str(target), tiles=len(tiles), bytes=target.stat().st_size, passes=passes), ensure_ascii=False), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--national-zoom', type=int, choices=[8, 9, 10], default=9)
    args = parser.parse_args()
    folder = Path(os.environ.get('APP_DATA_DIR', str(ROOT.parent / 'data')))
    if not folder.is_absolute() or folder.resolve() == ROOT or ROOT in folder.resolve().parents:
        raise SystemExit('APP_DATA_DIR must be an absolute directory outside the repository')
    install(folder, args.national_zoom)
