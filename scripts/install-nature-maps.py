#!/usr/bin/env python3
"""Fetch public geography sources once. Runtime is offline; no user records are read.
Requires Python 3, Pillow and numpy. See docs/NATURE_MAPS.md for attribution.
"""
import argparse
import base64
import concurrent.futures
import csv
import datetime
import gzip
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/'
SOURCES = []
DISPLAY_NAMES = json.loads((ROOT / 'content/nature/maps/labels.zh-CN.v1.json').read_text())['names']

def fetch(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'MumuGeography/1.0'}), timeout=100) as r:
                raw = r.read()
            SOURCES.append({'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)})
            return raw
        except Exception:
            if attempt == 3:
                raise
            time.sleep(1 + attempt)

def fc(features):
    return {'type': 'FeatureCollection', 'features': features}

def feature(geometry, **properties):
    return {'type': 'Feature', 'geometry': geometry, 'properties': properties}

def collection(name):
    return json.loads(fetch(NE + name + '.geojson'))['features']

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    value.update(schemaVersion=1, id=path.stem, createdAt=NOW, updatedAt=NOW, sources=list(SOURCES))
    raw = gzip.compress(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    tmp = path.with_suffix('.tmp')
    with open(tmp, 'wb') as f:
        os.chmod(tmp, 0o600)
        f.write(raw)
    os.replace(tmp, path)
    print(f'Installed {path.name}: {len(raw):,} bytes', flush=True)

def china(path):
    datasets = {}
    regions = {}
    missing = []
    def get(code):
        url = f'https://geo.datav.aliyun.com/areas_v3/bound/{code}_full.json'
        try:
            data = json.loads(fetch(url))
            assert data['type'] == 'FeatureCollection' and data['features']
            return code, data
        except Exception as error:
            return code, str(error)
    pending = ['100000']
    seen = set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        while pending:
            batch = [x for x in pending if x not in seen]
            seen.update(batch)
            pending = []
            for code, data in executor.map(get, batch):
                if isinstance(data, str):
                    if code == '100000':
                        raise RuntimeError('National map download failed: ' + data)
                    missing.append(code)
                    continue
                children = []
                for f in data['features']:
                    p = f['properties']; adcode = str(p.get('adcode', ''))
                    if not re.fullmatch(r'\d{6}', adcode) or not p.get('name'):
                        # Preserve offshore supplementary geometry but do not treat it as a region.
                        children.append(feature(f['geometry'], id=adcode or 'supplement', name='', kind='supplement', parent=code, children=0))
                        continue
                    props = dict(id=adcode, name=p['name'], kind=p.get('level', 'district'), parent=code, children=p.get('childrenNum', 0))
                    children.append(feature(f['geometry'], **props))
                    regions[adcode] = props
                    if props['children'] and props['kind'] != 'district':
                        pending.append(adcode)
                datasets[code] = fc(children)
            print(f'China: {len(datasets)} regional maps, {len(regions)} regions', flush=True)
    # Unavailable children stay visible, but never offer a dead drill-down button.
    for data in datasets.values():
        for f in data['features']:
            f['properties']['children'] = len(datasets.get(f['properties']['id'], {}).get('features', []))
    save(path, {'coordinateSystem': 'GCJ-02', 'datasets': datasets, 'regions': regions, 'missing': missing,
                'description': '阿里云 DataV GeoAtlas 本次下载快照；省、市、区县边界，非街道地图。未提供数据的地区不编造细分。',
                'attribution': '中国行政区划：阿里云 DataV GeoAtlas（GCJ-02）；来源未提供统一行政区划年份。'})

def world(path):
    datasets = {}
    def normal(items, kind, predicate=lambda p: True):
        result = []
        for i, f in enumerate(items):
            p = {k.lower(): v for k, v in f['properties'].items()}
            if predicate(p):
                name = p.get('name_zh') or p.get('name') or p.get('admin') or ''
                name = DISPLAY_NAMES.get(name, name)
                detail = str(p.get('featurecla') or '')
                if p.get('elevation') is not None:
                    detail += f" · 海拔 {p['elevation']} 米"
                result.append(feature(f['geometry'], id=f'{kind}-{i}', name=name, detail=detail, kind=kind,
                                      group=str(p.get('continent') or p.get('region') or kind), color=i % 7,
                                      elevation=p.get('elevation', 0)))
        return fc(result)
    # Full 1:10m land outlines retain small islands; thematic country polygons use the same scale.
    datasets['land'] = normal(collection('ne_10m_land'), 'land')
    datasets['countries'] = normal(collection('ne_10m_admin_0_countries'), 'countries')
    china_color = next((f['properties']['color'] for f in datasets['countries']['features'] if f['properties']['name'] in ('中国', '中华人民共和国')), 2)
    for f in datasets['countries']['features']:
        if f['properties']['name'] in ('中国台湾', '中国香港', '中国澳门'):
            f['properties'].update(color=china_color, group='中国', detail=f['properties']['name'])
    regions = collection('ne_10m_geography_regions_polys')
    datasets['continents'] = normal(regions, 'continents', lambda p: p.get('featurecla') == 'Continent')
    datasets['mountains'] = normal(regions, 'mountains', lambda p: p.get('featurecla') in ('Range/mtn', 'Plateau', 'Foothills'))
    datasets['oceans'] = normal(collection('ne_10m_geography_marine_polys'), 'oceans')
    datasets['elevation'] = normal(collection('ne_10m_geography_regions_elevation_points'), 'elevation')
    print('World: Natural Earth vector layers ready', flush=True)
    # Immutable Glottolog 5.3 asset, not the moving "latest" download page.
    url = 'https://cdstar.eva.mpg.de//bitstreams/EAEA0-608B-9919-A962-0/languages_and_dialects_geo.csv'
    rows = csv.DictReader(io.StringIO(fetch(url).decode('utf-8-sig')))
    languages = []
    for row in rows:
        if row.get('level') != 'language' or not row.get('latitude') or not row.get('longitude'):
            continue
        languages.append(feature({'type': 'Point', 'coordinates': [float(row['longitude']), float(row['latitude'])]},
                                 id=row['glottocode'], name=row['name'], kind='languages', group=row.get('family_id') or '未分组',
                                 detail='语言代表位置；不表示使用人口、国界或完整分布范围。'))
    datasets['languages'] = fc(languages)
    mineral_url = 'https://energy.usgs.gov/arcgis/rest/services/Hosted/Mineral_Resource_Data_System/FeatureServer/0/query'
    from urllib.parse import urlencode
    minerals = []
    offset = 0
    while True:
        query = urlencode({'f':'geojson', 'where':"grade IN ('A','B')", 'outFields':'dep_id,site_name,dev_stat,code_list,grade',
                           'outSR':4326, 'resultOffset':offset, 'resultRecordCount':2000, 'orderByFields':'objectid_1 ASC'})
        page = json.loads(fetch(mineral_url + '?' + query))
        if 'features' not in page:
            raise RuntimeError('USGS response missing features')
        for f in page['features']:
            if not f.get('geometry'):
                continue
            p = f['properties']
            minerals.append(feature(f['geometry'], id=str(p['dep_id']), name=p.get('site_name') or '未命名矿点', kind='minerals',
                                     group=p.get('code_list') or '未分类', detail=f"{p.get('code_list') or ''} · {p.get('dev_stat') or ''}（历史矿点，不表示现有储量）"))
        offset += len(page['features'])
        print(f'World: {offset} MRDS A/B records', flush=True)
        if len(page['features']) < 2000:
            break
    datasets['minerals'] = fc(minerals)
    print(f'World: {len(languages)} languages, {len(minerals)} mineral sites', flush=True)
    from PIL import Image
    import numpy as np
    archive = zipfile.ZipFile(io.BytesIO(fetch('https://ndownloader.figshare.com/files/12407516')))
    names = archive.namelist()
    # The 0.5 degree grid is sufficient for a world overview, never upsampled into false precision.
    target = next(n for n in names if 'present_0p5' in n and n.endswith('.tif'))
    grid = np.array(Image.open(io.BytesIO(archive.read(target))))
    codes = ['Af','Am','Aw','BWh','BWk','BSh','BSk','Csa','Csb','Csc','Cwa','Cwb','Cwc','Cfa','Cfb','Cfc','Dsa','Dsb','Dsc','Dsd','Dwa','Dwb','Dwc','Dwd','Dfa','Dfb','Dfc','Dfd','ET','EF']
    labels = ['热带雨林','热带季风','热带草原','炎热沙漠','寒冷沙漠','炎热半干旱','寒冷半干旱','炎热夏季地中海','温暖夏季地中海','凉爽夏季地中海','炎热夏季冬干温带','温暖夏季冬干温带','凉爽夏季冬干温带','湿润亚热带','温带海洋','亚极地海洋','炎热夏季夏干大陆','温暖夏季夏干大陆','凉爽夏季夏干大陆','严寒冬季夏干大陆','炎热夏季冬干大陆','温暖夏季冬干大陆','凉爽夏季冬干大陆','严寒冬季冬干大陆','炎热夏季湿润大陆','温暖夏季湿润大陆','亚寒带','极寒亚寒带','苔原','冰原']
    polygons = [[] for _ in codes]
    h,w = grid.shape
    for y,row in enumerate(grid):
        top = 90-y*180/h; bottom = 90-(y+1)*180/h
        if bottom > 85 or top < -85:
            continue
        x = 0
        while x < w:
            v = int(row[x]); end=x+1
            while end<w and row[end]==v:
                end+=1
            if 1 <= v <= 30:
                left=x*360/w-180;right=end*360/w-180
                polygons[v-1].append([[[left,bottom],[right,bottom],[right,top],[left,top],[left,bottom]]])
            x=end
    datasets['climate'] = fc([feature({'type':'MultiPolygon','coordinates':p}, id=codes[i], name=labels[i], kind='climate', group=codes[i][0], color=i,
                                     detail=f'{codes[i]} · Beck 等（2018）1980–2016 年，0.5° 网格；不是即时天气。') for i,p in enumerate(polygons) if p])
    relief = zipfile.ZipFile(io.BytesIO(fetch('https://naciscdn.org/naturalearth/50m/raster/HYP_50M_SR.zip')))
    raster = Image.open(io.BytesIO(relief.read(next(n for n in relief.namelist() if n.lower().endswith('.tif'))))).convert('RGB')
    # Reproject equirectangular source into Mercator for MapLibre image source.
    width=4096; height=4096
    raster=raster.resize((width,raster.height))
    ys=(np.arange(height)+0.5)/height
    lat=np.degrees(np.arctan(np.sinh(math.pi*(1-2*ys))))
    iy=np.clip(((90-lat)/180*raster.height).astype(int),0,raster.height-1)
    mercator=Image.fromarray(np.asarray(raster)[iy,:,:])
    out=io.BytesIO();mercator.save(out,format='WEBP',quality=85)
    save(path, {'coordinateSystem':'WGS84','datasets':datasets,'terrainDataUrl':'data:image/webp;base64,'+base64.b64encode(out.getvalue()).decode(),
                'attribution':'Natural Earth 5.1.2（公有领域）；Glottolog 5.3（CC BY 4.0）；USGS MRDS（历史矿点）；Beck 等 2018 / doi:10.6084/m9.figshare.6396959（CC BY 4.0）',
                'description':'全球教学概览。国界沿用 Natural Earth 数据口径；海拔底色为气候混合地形晕渲，并非可测量高程。语种为代表位置，矿藏为历史矿点。'})

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--only',choices=['world','china','all'],default='all')
    args=parser.parse_args()
    folder=Path(os.environ.get('APP_DATA_DIR',str(ROOT.parent/'data')))
    if not folder.is_absolute() or folder.resolve()==ROOT or ROOT in folder.resolve().parents:
        raise SystemExit('APP_DATA_DIR must be an absolute directory outside the repository')
    for name in ['china','world']:
        if args.only in ('all',name):
            SOURCES.clear()
            globals()[name](folder/'cache'/'nature-maps'/f'{name}.json.gz')
