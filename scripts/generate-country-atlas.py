#!/usr/bin/env python3
"""Refresh public teaching content only; never reads/writes the personal data folder.

Run separately with --profiles, --flags or --licenses. Network failure leaves the
previous output intact. Review source changes before adopting a new snapshot.
"""
import argparse
import concurrent.futures
import hashlib
import io
import json
import re
import shutil
import subprocess
import tarfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/"
COUNTRIES = "https://raw.githubusercontent.com/mledoze/countries/c8015eebdd94c533358406b0d709f441389e1f2e/"
CLDR = "https://raw.githubusercontent.com/unicode-org/cldr-json/47.0.0/cldr-json/"
FLAGS = "https://registry.npmjs.org/flag-icons/-/flag-icons-7.5.0.tgz"
UNESCO = "https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/exports/json?select=name_zh,name_en,iso_codes,id_no,category,date_inscribed"
WB = "https://api.worldbank.org/v2/country/all/indicator/{}?format=json&date=2023:2024&per_page=1000"
SUBREGIONS = dict(zip(
    ["Eastern Asia", "Southern Asia", "South-Eastern Asia", "Western Asia", "Central Asia", "Northern Europe", "Southern Europe", "Western Europe", "Eastern Europe", "Northern Africa", "Western Africa", "Middle Africa", "Eastern Africa", "Southern Africa", "Northern America", "Central America", "South America", "Caribbean", "Australia and New Zealand", "Melanesia", "Micronesia", "Polynesia", "Antarctica"],
    ["东亚", "南亚", "东南亚", "西亚", "中亚", "北欧", "南欧", "西欧", "东欧", "北非", "西非", "中非", "东非", "南部非洲", "北美洲北部", "中美洲", "南美洲", "加勒比地区", "澳大利亚与新西兰地区", "美拉尼西亚", "密克罗尼西亚", "波利尼西亚", "南极地区"]))

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mumu-geography-content/1.0"}), timeout=120) as response:
        return response.read()

def simplify(text):
    command = shutil.which("uconv") or next((str(p) for p in [Path("/opt/homebrew/opt/icu4c/bin/uconv")] if p.exists()), None)
    if not command:
        raise RuntimeError("Install ICU uconv to normalize Chinese labels before generating content")
    return subprocess.run([command, "-x", "Traditional-Simplified"], input=text, text=True, capture_output=True, check=True).stdout

def profiles():
    urls = {
        "boundaries": NE + "ne_10m_admin_0_countries.geojson",
        "cities": NE + "ne_10m_populated_places.geojson", "countries": COUNTRIES + "countries.json",
        "languages": CLDR + "cldr-localenames-full/main/zh/languages.json",
        "currency": CLDR + "cldr-numbers-full/main/zh/currencies.json",
        "aliases": CLDR + "cldr-core/supplemental/aliases.json", "heritage": UNESCO,
        "population": WB.format("SP.POP.TOTL"), "area": WB.format("AG.SRF.TOTL.K2"),
        "services": WB.format("NV.SRV.TOTL.ZS"), "gdpPerCapita": WB.format("NY.GDP.PCAP.CD"),
    }
    def download(item):
        key, url = item
        raw = fetch(url)
        print(f"Loaded {key}: {len(raw)} bytes", flush=True)
        return key, raw
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        raws = dict(pool.map(download, urls.items()))
    data = {key: json.loads(value) for key, value in raws.items()}
    # One ICU pass covers every imported Chinese proper name, including city names.
    data = json.loads(simplify(json.dumps(data, ensure_ascii=False)))
    labels = json.loads((ROOT / "content/nature/maps/labels.zh-CN.v1.json").read_text())["names"]
    countries = {c["cca2"]: c for c in data["countries"]}
    languages = data["languages"]["main"]["zh"]["localeDisplayNames"]["languages"]
    currencies = data["currency"]["main"]["zh"]["numbers"]["currencies"]
    aliases = data["aliases"]["supplemental"]["metadata"]["alias"]["languageAlias"]
    indicators = {}
    for key in ["population", "area", "services", "gdpPerCapita"]:
        if data[key][0]["pages"] != 1:
            raise ValueError("Indicator pagination changed")
        values = {}
        for row in data[key][1]:
            if row["value"] is not None and (row["countryiso3code"] not in values or row["date"] > values[row["countryiso3code"]]["year"]):
                values[row["countryiso3code"]] = {"value": row["value"], "year": row["date"], "source": "World Bank"}
        indicators[key] = values
    heritage = {}
    for site in data["heritage"]:
        for code in re.split(r"[,; ]+", site["iso_codes"] or ""):
            heritage.setdefault(code.upper(), []).append(site)
    code_by_iso3 = {c["cca3"]: c["cca2"] for c in data["countries"]}
    all_cities = {}
    for feature in data["cities"]["features"]:
        p = feature["properties"]
        code = p.get("ISO_A2")
        if not code or code == "-99":
            code = code_by_iso3.get(p.get("ADM0_A3"), {"KOS": "XK"}.get(p.get("ADM0_A3")))
        if not code:
            continue
        name = {"Ōsaka": "大阪", "Washington,  D.C.": "华盛顿", "Osaka": "大阪", "Washington, D.C.": "华盛顿", "Washington": "华盛顿", "Nur-Sultan": "阿斯塔纳"}.get(p["NAME"], p.get("NAME_ZH") or p["NAME"])
        city = {"id": "city-" + str(p["NE_ID"]), "name": name, "english": p["NAME"],
                "coordinates": feature["geometry"]["coordinates"], "capital": bool(p["ADM0CAP"]),
                "rank": p["POP_MAX"] or 0}
        all_cities.setdefault(code, []).append(city)
    regions = {}
    for index, feature in enumerate(data["boundaries"]["features"]):
        p = feature["properties"]
        code = p.get("ISO_A2_EH") or p.get("ISO_A2")
        c = countries.get(code, {})
        # An ISO fallback may name the sovereign state (e.g. Clipperton -> FR).
        # Do not copy its national population or mainland cities onto an island.
        if c and p["ADM0_A3"] != c["cca3"] and p["ADM0_A3"] not in ("KOS",):
            c = {}
        iso3 = c.get("cca3", p["ADM0_A3"])
        name = labels.get(p.get("NAME_ZH"), p.get("NAME_ZH") or p["NAME"])
        independent = c.get("independent") is True and code not in ("TW", "HK", "MO")
        preferred = {"CN": ["北京", "上海", "广州", "深圳", "天津", "重庆", "成都", "武汉", "西安", "杭州", "南京", "哈尔滨", "乌鲁木齐"], "US": ["华盛顿", "纽约", "洛杉矶", "芝加哥", "旧金山"]}.get(code, [])
        candidates = sorted(all_cities.get(code, []) if c else [], key=lambda city: (-int(city["capital"]), -int(city["name"] in preferred), -city["rank"]))
        selected = [city.copy() for city in candidates if city["capital"]]
        selected += [city.copy() for city in candidates if not city["capital"]][:12 if code == "CN" else 4]
        for city in selected:
            city["role"] = "首都" if city["capital"] and independent else "行政中心" if city["capital"] and code != "TW" else "主要城市"
            city["capital"] = city["capital"] and independent
            # Taipei, Hong Kong and Macao are not presented as national capitals.
            if code in ("TW", "HK", "MO"):
                city["capital"] = False
                city["role"] = "主要城市"
        if code == "LK":
            # MFA Sri Lanka confirms the capital; GeoNames 1238992 supplies the city position.
            selected.insert(0, {"id": "city-geonames-1238992", "name": "斯里贾亚瓦德纳普拉科特", "english": "Sri Jayewardenepura Kotte", "coordinates": [79.90708, 6.88297], "capital": True, "role": "首都", "rank": 0})
        for city in selected:
            if code == "LK" and city["english"] == "Colombo":
                city.update(capital=False, role="主要城市")
            if code == "BO" and city["english"] == "La Paz":
                city.update(capital=False, role="政府驻地")
            if code == "ZA" and city["capital"]:
                city["role"] = {"Pretoria": "行政首都", "Cape Town": "立法首都", "Bloemfontein": "司法首都"}.get(city["english"], "首都")
            if code == "NL" and city["english"] == "The Hague":
                city.update(capital=False, role="政府驻地")
            if code == "CH" and city["english"] == "Bern":
                city.update(capital=False, role="联邦政府驻地")
        lang_names = [languages.get(aliases.get(k, {}).get("_replacement", k), v) for k, v in c.get("languages", {}).items()]
        money = [currencies.get(k, {}).get("displayName", k) for k in c.get("currencies", {})]
        subregion = SUBREGIONS.get(p["SUBREGION"], "南极地区" if code == "AQ" else p["SUBREGION"])
        population = indicators["population"].get(iso3)
        if population is None and p.get("POP_EST", -1) >= 0 and p.get("POP_YEAR", -1) > 1900:
            population = {"value": p["POP_EST"], "year": str(p["POP_YEAR"]), "source": "Natural Earth"}
        area = indicators["area"].get(iso3)
        if area is None and c.get("area", 0) > 0:
            area = {"value": c["area"], "year": "", "source": "mledoze/countries"}
        sites = sorted(heritage.get(code, []) if c else [], key=lambda s: (s["category"] != "Cultural", not bool(s["name_zh"]), len(s["name_zh"] or s["name_en"])))
        highlights = [{"name": s["name_zh"] or s["name_en"], "url": "https://whc.unesco.org/en/list/" + str(s["id_no"]) + "/"} for s in sites[:2]]
        capitals = [city["name"] for city in selected if city["capital"]]
        overview = f"位于{subregion}，" + ("地处内陆。" if c.get("landlocked") else "拥有海岸或岛屿。")
        if not c:
            overview = f"位于{subregion}。此条目为地图中的地理区域，资料按该区域单独展示。"
        if code == "NR":
            overview = "太平洋上的岛国，没有正式首都，政府机构设在亚伦区。"
        if code == "CN":
            overview = "位于亚洲东部、太平洋西岸，地势总体西高东低，山地、平原与高原交错。"
            area = {"value": 9600000, "year": "", "source": "中国政府网", "note": "陆地面积约数"}
        if code in ("TW", "HK", "MO"):
            overview = {"TW": "中国台湾位于中国东南沿海，隔台湾海峡与福建相望。", "HK": "中国香港位于珠江口东侧，是中国的特别行政区。", "MO": "中国澳门位于珠江口西侧，是中国的特别行政区。"}[code]
        if code == "AQ":
            overview = "南极洲是被冰盖覆盖的大陆，不是国家；科考站人员数量随季节变化。"
            population = None
        regions[f"countries-{index}"] = {
            "name": name, "code": code if c else p["ADM0_A3"], "independent": independent,
            "flag": "cn" if code in ("CN", "HK", "MO", "TW") else code.lower() if c and code != "AQ" else "",
            "population": population, "area": area, "capitals": capitals, "cities": selected,
            "overview": overview, "languages": lang_names, "currencies": money,
            "heritage": highlights, "heritageCount": len(sites),
            "services": indicators["services"].get(iso3), "gdpPerCapita": indicators["gdpPerCapita"].get(iso3),
            "populationNote": "统计口径不含港澳台" if code == "CN" else "",
        }
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    result = {"schemaVersion": 1, "id": "country-atlas", "createdAt": now, "updatedAt": now,
              "sources": [{"id": key, "url": urls[key], "sha256": hashlib.sha256(raw).hexdigest()} for key, raw in raws.items()],
              "regions": regions}
    assert len(regions) == 258 and sum(len(r["cities"]) for r in regions.values()) > 700
    target = ROOT / "content/nature/maps/country-atlas.v1.json"
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(regions)} profiles; {sum(len(r['cities']) for r in regions.values())} cities")

def flag_archive():
    return tarfile.open(fileobj=io.BytesIO(fetch(FLAGS)), mode="r:gz")

def flags():
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    ns = "{http://www.w3.org/2000/svg}"
    root = ET.Element(ns + "svg")
    with flag_archive() as archive:
        for member in sorted(archive.getmembers(), key=lambda m: m.name):
            if not re.fullmatch(r"package/flags/4x3/[a-z]{2}\.svg", member.name):
                continue
            code = Path(member.name).stem
            # Prefix clip/mask IDs because all flags share one external symbol document.
            text = archive.extractfile(member).read().decode()
            ids = re.findall(r'\bid="([^"]+)"', text)
            for old in sorted(ids, key=len, reverse=True):
                text = text.replace(f'id="{old}"', f'id="{code}-{old}"').replace(f'url(#{old})', f'url(#{code}-{old})').replace(f'href="#{old}"', f'href="#{code}-{old}"')
            svg = ET.fromstring(text)
            symbol = ET.SubElement(root, ns + "symbol", {"id": code, "viewBox": svg.get("viewBox", "0 0 640 480")})
            symbol.extend(list(svg))
    target = ROOT / "apps/web/public/images/nature/geography/flags.v1.svg"
    target.write_bytes(ET.tostring(root, encoding="utf-8", xml_declaration=True))
    print(f"{len(root)} local flag symbols")

def licenses():
    with flag_archive() as archive:
        flag_license = archive.extractfile("package/LICENSE").read().decode()
    text = "Country atlas data notices\n\nflag-icons 7.5.0 — MIT\n" + flag_license
    text += "\n\nmledoze/countries — ODbL-1.0; country-atlas.v1.json is a derived database.\n" + fetch(COUNTRIES + "LICENSE").decode()
    text += "\n\nNatural Earth 5.1.2: Public Domain. https://www.naturalearthdata.com/about/terms-of-use/\n"
    text += "Unicode CLDR 47: Unicode-3.0; see unicode-license.txt.\n"
    text += "World Bank WDI: CC BY 4.0. https://datacatalog.worldbank.org/public-licenses\n"
    text += "UNESCO World Heritage List: site names, categories and identifiers only; no descriptions or images copied. https://data.unesco.org/explore/dataset/whc001/\n"
    (ROOT / "content/nature/maps/country-atlas-LICENSE.txt").write_text(text)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--profiles", action="store_true")
    group.add_argument("--flags", action="store_true")
    group.add_argument("--licenses", action="store_true")
    args = parser.parse_args()
    profiles() if args.profiles else flags() if args.flags else licenses()
