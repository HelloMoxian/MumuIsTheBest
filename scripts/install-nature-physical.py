#!/usr/bin/env python3
"""Install offline physical-geography supplements. Build-only deps: shapely 2.1, pyshp 2.3.
Reads public world cache and GMBA archive only; never reads or writes learning records.
"""
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

import shapefile
from shapely import make_valid
from shapely.geometry import shape, mapping, MultiPolygon, Point
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
GMBA_URL = 'https://data.earthenv.org/mountains/standard/GMBA_Inventory_v2.0_standard.zip'
CONTINENTS = [('Asia', '亚洲'), ('Europe', '欧洲'), ('Africa', '非洲'),
              ('North America', '北美洲'), ('South America', '南美洲'),
              ('Oceania', '大洋洲'), ('Antarctica', '南极洲')]

def polygons(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    return [p for child in g.geoms for p in polygons(child)] if hasattr(g, 'geoms') else []

def feature(g, **props):
    return {'type': 'Feature', 'geometry': mapping(MultiPolygon(polygons(g))), 'properties': props}

def collection(features):
    return {'type': 'FeatureCollection', 'features': features}

def continents(world):
    """Use full coastal polygons, retaining NE's Europe/Asia land divider.
    Offshore components are assigned geographically, not by the administering state.
    """
    masks = {f['properties']['group']: make_valid(shape(f['geometry'])) for f in world['datasets']['continents']['features']}
    groups = {key: [] for key, _ in CONTINENTS}

    def nearest(g, country=''):
        p = g.representative_point(); x, y = p.x, p.y
        if y < -60:
            return 'Antarctica'
        if -90 < x < -58 and 8 < y < 28:
            return 'North America'  # Caribbean and Central America, including overseas islands.
        if '格陵' in country:
            return 'North America'
        if -32 < x < -10 and 60 < y < 69:
            return 'Europe'  # Iceland; do not confuse tectonic plates with continents.
        if -32 < x < -24 and 35 < y < 41:
            return 'Europe'  # Azores.
        if (132 < x < 180 and -60 < y < 0) or (-180 < x < -130 and -60 < y < 30):
            return 'Oceania'  # New Guinea, NZ and Pacific islands, including Hawaii.
        if ('印度尼' in country or '印尼' in country) and not (x > 132 and y < 0):
            return 'Asia'
        if 95 < x < 132 and -12 < y < 35:
            return 'Asia'
        if 130 < x < 180 and 0 <= y < 25:
            return 'Oceania'  # Micronesia.
        return min(masks, key=lambda key: g.distance(masks[key]))

    all_country_parts = []
    for f in world['datasets']['countries']['features']:
        name = str(f['properties']['name'])
        for part in polygons(make_valid(shape(f['geometry']))):
            all_country_parts.append(part)
            substantial = [key for key, mask in masks.items() if mask.intersects(part) and mask.intersection(part).area > part.area * 0.01]
            if len(substantial) <= 1:
                groups[substantial[0] if substantial else nearest(part, name)].append(part)
                continue
            # Cross-continent countries retain the natural continental division.
            remaining = part
            for key in substantial:
                piece = remaining.intersection(masks[key])
                groups[key].extend(polygons(piece))
                remaining = remaining.difference(masks[key])
            for piece in polygons(remaining):
                groups[nearest(piece, name)].append(piece)
    # Include tiny islands and Antarctica land pieces not carried by a country feature.
    covered = unary_union(all_country_parts)
    for f in world['datasets']['land']['features']:
        for part in polygons(make_valid(shape(f['geometry'])).difference(covered)):
            groups[nearest(part)].append(part)
    notes = {
        'Asia': '包括亚洲大陆及日本、菲律宾、印度尼西亚大部分岛屿等。俄罗斯等跨洲地区按地理分界着色。',
        'Europe': '包括欧洲大陆、英国、爱尔兰、冰岛等岛屿。冰岛归欧洲，不按板块边界拆分。',
        'North America': '包括北美大陆、中美洲、加勒比地区和格陵兰。拉丁美洲是文化地区，跨北美洲与南美洲。',
        'South America': '包括南美大陆及周边岛屿；法属圭亚那等按地理位置归南美洲。',
        'Oceania': '包括澳大利亚、新西兰、新几内亚及太平洋岛屿。印度尼西亚的新几内亚岛部分采用大洋洲地理口径；国家归属不变。',
        'Africa': '包括非洲大陆、马达加斯加及周边岛屿。',
        'Antarctica': '包括南极大陆及其周边岛屿。',
    }
    return collection([feature(unary_union(groups[key]), id='continent-' + key.lower().replace(' ', '-'),
        name=name, kind='continents', group=key, color=i, detail=notes[key]) for i, (key, name) in enumerate(CONTINENTS)])

def mountains(archive, catalog):
    with zipfile.ZipFile(archive) as z:
        stem = 'GMBA_Inventory_v2.0_standard'
        r = shapefile.Reader(shp=io.BytesIO(z.read(stem + '.shp')), shx=io.BytesIO(z.read(stem + '.shx')),
                             dbf=io.BytesIO(z.read(stem + '.dbf')), encoding='utf-8')
        selected = {entry['id']: entry for entry in catalog['ranges']}
        result = []
        for row in r.iterShapeRecords():
            p = row.record.as_dict(); entry = selected.get(p['GMBA_V2_ID'])
            if not entry:
                continue
            if not any(code in p['CountryISO'].split(', ') for code in ('CHN', 'TWN', 'HKG', 'MAC')):
                raise ValueError('Selected mountain has no China coverage')
            g = make_valid(shape(row.shape.__geo_interface__)).simplify(0.001, preserve_topology=True)
            # About 100 m geometry tolerance; source delineation itself is coarser and conceptual.
            detail = entry.get('note', '中国山脉范围；跨境山脉保留自然延伸。')
            result.append(feature(g, id='gmba-' + str(entry['id']), name=entry['name'],
                kind='chinamountains', group='中国山脉', color=entry['color'],
                priority=entry.get('priority', 50), minZoom=entry.get('minZoom', 3.8),
                originalName=p['MapName'], sourceId=p['GMBA_V2_ID'], hierarchy=p['Hier_Lvl'],
                detail=detail + ' GMBA v2 研究分区，边线不是精确山脊线。'))
        if len(result) != len(selected):
            raise ValueError('Mountain selection incomplete')
        result.sort(key=lambda f: (-f['properties']['priority'], f['properties']['name']))
        return collection(result)

def validate(datasets):
    regions = {f['properties']['group']: shape(f['geometry']) for f in datasets['continentsv2']['features']}
    if len(regions) != 7 or not all(g.is_valid and not g.is_empty for g in regions.values()):
        raise ValueError('Incomplete or invalid continents')
    # Geographic regression locations, including all user-reported omitted island groups.
    probes = [
        ('Europe', -1, 53), ('Europe', -19, 65),
        ('North America', -79, 22), ('North America', -77, 18.1),
        ('North America', -66.4, 18.2), ('North America', -61.3, 10.4),
        ('Asia', 110, -7), ('Asia', 101, -0.5), ('Asia', 120, -2), ('Asia', 115.1, -8.4),
        ('Oceania', 138, -4), ('Oceania', 170, -44), ('Oceania', -155.5, 19.7),
        ('North America', -40, 73), ('Europe', 37.6, 55.75), ('Asia', 132, 44),
        ('Asia', 121, 23.6), ('Oceania', 151, -34), ('Asia', 33, 40),
    ]
    for expected, x, y in probes:
        found = [key for key, g in regions.items() if g.covers(Point(x, y))]
        if found != [expected]:
            raise ValueError(f'Continental assignment mismatch at {x}, {y}: {found}')
    ranges = datasets['chinamountains']['features']
    ids = [f['properties']['sourceId'] for f in ranges]
    if len(ids) != len(set(ids)) or not {11762, 19421, 11412, 12308}.issubset(ids):
        raise ValueError('Duplicate or missing key China mountains')
    if not all(shape(f['geometry']).is_valid and not shape(f['geometry']).is_empty for f in ranges):
        raise ValueError('Invalid mountain geometry')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path, help='Existing GMBA Standard zip; otherwise download to public cache')
    args = parser.parse_args()
    data_dir = Path(os.environ.get('APP_DATA_DIR', ROOT.parent / 'data')).resolve()
    if data_dir == ROOT or ROOT in data_dir.parents:
        raise SystemExit('APP_DATA_DIR must be outside the repository')
    cache = data_dir / 'cache/nature-maps'
    world_path = cache / 'world.json.gz'
    world_bytes = world_path.read_bytes()
    world = json.loads(gzip.decompress(world_bytes))
    if world.get('schemaVersion') != 1 or world.get('coordinateSystem') != 'WGS84':
        raise ValueError('Unsupported world map version')
    archive = args.archive or cache / 'GMBA_Inventory_v2.0_standard.zip'
    if not archive.exists():
        request = urllib.request.Request(GMBA_URL, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.earthenv.org/'})
        with urllib.request.urlopen(request, timeout=180) as response:
            raw = response.read()
        with zipfile.ZipFile(io.BytesIO(raw)) as source:
            if source.testzip():
                raise ValueError('Corrupt GMBA download')
        archive.write_bytes(raw)
    catalog = json.loads((ROOT / 'content/nature/maps/china-mountains.v1.json').read_text())
    if catalog.get('schemaVersion') != 1:
        raise ValueError('Unsupported mountain catalog')
    print('Preparing complete continents...', flush=True)
    datasets = {'continentsv2': continents(world)}
    print('Preparing China mountain ranges...', flush=True)
    datasets['chinamountains'] = mountains(archive, catalog)
    validate(datasets)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    pack = dict(schemaVersion=1, id='physical-v1', createdAt=now, updatedAt=now,
        coordinateSystem='WGS84', datasets=datasets,
        attribution='Natural Earth 5.1.2 (Public Domain); Snethlage et al. (2022), GMBA v2 (CC BY 4.0).',
        description='七大洲完整海岸与岛屿；中国精选山脉研究分区。并非行政边界或精确山脊线。',
        sources=[{'url': GMBA_URL, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()},
                 {'worldPackSha256': hashlib.sha256(world_bytes).hexdigest()},
                 {'paper': 'https://doi.org/10.1038/s41597-022-01256-y', 'dataset': 'https://doi.org/10.48601/earthenv-t9k2-1407'}])
    raw = gzip.compress(json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    target = cache / 'physical.json.gz'; tmp = cache / 'physical.json.tmp'
    tmp.write_bytes(raw); tmp.replace(target)
    print(f'Installed {len(datasets["chinamountains"]["features"])} mountain ranges; {len(raw):,} compressed bytes', flush=True)

if __name__ == '__main__':
    main()
