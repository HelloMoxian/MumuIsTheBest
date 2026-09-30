#!/usr/bin/env python3
"""Build the offline 1/12-degree Beck 2018 climate layer; build-only numpy/Pillow/shapely."""
import argparse
import datetime
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import urllib.request
import zipfile
import numpy as np
from PIL import Image
from shapely.geometry import box, mapping, MultiPolygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
URL = 'https://ndownloader.figshare.com/files/12407516'
CODES = ['Af','Am','Aw','BWh','BWk','BSh','BSk','Csa','Csb','Csc','Cwa','Cwb','Cwc','Cfa','Cfb','Cfc','Dsa','Dsb','Dsc','Dsd','Dwa','Dwb','Dwc','Dwd','Dfa','Dfb','Dfc','Dfd','ET','EF']
LABELS = ['热带雨林','热带季风','热带草原','炎热沙漠','寒冷沙漠','炎热半干旱','寒冷半干旱','炎热夏季地中海','温暖夏季地中海','凉爽夏季地中海','炎热夏季冬干温带','温暖夏季冬干温带','凉爽夏季冬干温带','湿润亚热带','温带海洋','亚极地海洋','炎热夏季夏干大陆','温暖夏季夏干大陆','凉爽夏季夏干大陆','严寒冬季夏干大陆','炎热夏季冬干大陆','温暖夏季冬干大陆','凉爽夏季冬干大陆','严寒冬季冬干大陆','炎热夏季湿润大陆','温暖夏季湿润大陆','亚寒带','极寒亚寒带','苔原','冰原']

def polygon_parts(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [part for child in getattr(geometry, 'geoms', []) for part in polygon_parts(child)]

def vectorize(grid):
    """Merge exact grid-cell runs before projection; preserve holes and do not smooth labels."""
    if grid.ndim != 2 or grid.min() < 0 or grid.max() > 30:
        raise ValueError('Invalid climate grid')
    height, width = grid.shape
    groups = [[] for _ in CODES]
    for y, row in enumerate(grid):
        boundaries = np.r_[0, np.flatnonzero(row[1:] != row[:-1]) + 1, width]
        for start, end in zip(boundaries[:-1], boundaries[1:]):
            value = int(row[start])
            if value:
                # Integer coordinates avoid tiny cracks between adjacent rows.
                groups[value - 1].append(box(int(start), y, int(end), y + 1))
    from shapely.ops import transform
    features = []
    for index, cells in enumerate(groups):
        if not cells:
            continue
        merged = unary_union(cells).simplify(0, preserve_topology=True)
        projected = transform(lambda x, y, z=None: (np.asarray(x) * 360 / width - 180, 90 - np.asarray(y) * 180 / height), merged)
        clipped = MultiPolygon(polygon_parts(projected.intersection(box(-180, -85, 180, 85))))
        if clipped.is_empty:
            continue
        features.append(dict(type='Feature', geometry=mapping(clipped), properties=dict(
            id=CODES[index], name=LABELS[index], kind='climate', group=CODES[index][0], color=index,
            detail=CODES[index] + ' · 1980–2016 年气候分类', resolutionDegrees=360 / width)))
        print(CODES[index], 'ready', flush=True)
    return dict(type='FeatureCollection', features=features)

def install(folder):
    folder = folder.resolve()
    if folder == ROOT or ROOT in folder.parents:
        raise ValueError('Map caches must stay outside the repository')
    target = folder / 'cache/nature-maps/climate.json.gz'
    if target.exists():
        old = json.loads(gzip.decompress(target.read_bytes()))
        if old.get('schemaVersion') != 1 or old.get('id') != 'climate-v1':
            raise ValueError('Invalid or future climate pack preserved')
    print('Downloading Beck 2018 source archive', flush=True)
    request = urllib.request.Request(URL, headers={'User-Agent': 'MumuOfflineClimate/1.0'})
    with urllib.request.urlopen(request, timeout=120) as response:
        raw = response.read()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        name = next(n for n in archive.namelist() if 'present_0p083' in n and n.endswith('.tif'))
        grid = np.array(Image.open(io.BytesIO(archive.read(name))))
    if grid.shape != (2160, 4320):
        raise ValueError('Unexpected resolution; preserving previous pack')
    now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    layer = vectorize(grid)
    if len(layer['features']) < 28:
        raise ValueError('Incomplete climate layer')
    pack = dict(schemaVersion=1, id='climate-v1', createdAt=now, updatedAt=now,
        coordinateSystem='WGS84', datasets={'climatev2': layer},
        attribution='Beck et al. (2018), CC BY 4.0, doi:10.6084/m9.figshare.6396959. Grid cells merged into vector regions.',
        description='1980–2016 present climate; 1/12 degree (~9 km at equator); not weather or 1 km resolution.',
        source=dict(url=URL, file=name, sha256=hashlib.sha256(raw).hexdigest()))
    payload = gzip.compress(json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix(target.suffix + '.tmp')
    try:
        with temp.open('xb') as output:
            output.write(payload); output.flush(); os.fsync(output.fileno())
        os.replace(temp, target)
    finally:
        # A pre-existing temp is not owned by this run and must not be removed.
        pass
    print(f'Installed {len(layer["features"])} climate types; {len(payload)} bytes', flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', type=Path, default=Path(os.environ.get('APP_DATA_DIR', str(ROOT.parent / 'data'))))
    install(parser.parse_args().data_dir)
