#!/usr/bin/env python3
"""Build a small, reproducible teaching overlay; never reads personal data."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
CLDR = "https://raw.githubusercontent.com/unicode-org/cldr-json/47.0.0/cldr-json/cldr-core/supplemental/territoryInfo.json"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson"
LICENSE = "https://raw.githubusercontent.com/unicode-org/cldr-json/47.0.0/LICENSE"
LANGUAGES = [
    ("zh", "中文", "#EF8687"), ("ja", "日语", "#E8B67C"), ("ko", "韩语 / 朝鲜语", "#CC92CB"),
    ("en", "英语", "#789FF0"), ("fr", "法语", "#BA9DEC"), ("ru", "俄语", "#67BBCB"),
    ("pt", "葡萄牙语", "#68BC99"), ("es", "西班牙语", "#E1CC6D"), ("ar", "阿拉伯语", "#BAAA68"),
    ("de", "德语", "#CC9272"), ("it", "意大利语", "#A3BF7B"), ("hi", "印地语", "#EDACB5"),
    ("bn", "孟加拉语", "#89CED2"), ("ur", "乌尔都语", "#9C95D2"), ("id", "印度尼西亚语", "#E1BCA2"),
    ("tr", "土耳其语", "#CD7795"), ("fa", "波斯语", "#83AABB"), ("sw", "斯瓦希里语", "#B2C593"),
]
ALIASES = {code: "zh" for code in ["yue", "wuu", "nan", "hak", "gan", "hsn"]}
def fetch(url):
    with urllib.request.urlopen(url, timeout=90) as response:
        return response.read()
def select_languages(populations):
    national = [(code, entry) for code, entry in populations.items()
                if entry.get("_officialStatus") in ("official", "de_facto_official")]
    # Use national languages first, so English proficiency alone does not recolor Europe.
    pool = national + [(code, entry) for code, entry in populations.items()
                       if entry.get("_officialStatus") == "official_regional"
                       and float(entry.get("_populationPercent", 0)) >= 20]
    if not national:
        pool = [(code, entry) for code, entry in populations.items()
                if float(entry.get("_populationPercent", 0)) >= 50]
    allowed = {row[0] for row in LANGUAGES}
    candidates = {}
    for raw, entry in pool:
        code = raw.split("_")[0]
        code = ALIASES.get(code, code)
        percent = float(entry.get("_populationPercent", 0))
        if code in allowed and percent >= 5:
            # Script variants/Chinese varieties overlap; never add their percentages.
            candidates[code] = max(candidates.get(code, 0), percent)
    return [code for code, _ in sorted(candidates.items(), key=lambda item: (-item[1], item[0]))[:2]]

def main():
    raw_cldr, raw_ne = fetch(CLDR), fetch(NE)
    territories = json.loads(raw_cldr)["supplemental"]["territoryInfo"]
    countries = json.loads(raw_ne)["features"]
    labels = json.loads((ROOT / "content/nature/maps/labels.zh-CN.v1.json").read_text())["names"]
    regions = {}
    for index, feature in enumerate(countries):
        p = feature["properties"]
        code = p.get("ISO_A2_EH") or p.get("ISO_A2")
        name = p.get("NAME_ZH") or p.get("NAME") or ""
        name = labels.get(name, name)
        populations = territories.get(code, {}).get("languagePopulation", {})
        regions[f"countries-{index}"] = {
            "name": name, "territory": code,
            "languages": select_languages(populations),
        }
    result = {
        "schemaVersion": 1, "id": "core-language-regions",
        "createdAt": "2026-09-29T00:00:00Z", "updatedAt": "2026-09-29T00:00:00Z",
        "description": "18 curated language groups, at most two per territory. Educational national/regional overview, not population ranking or within-country language boundaries.",
        "selection": "CLDR 47 national official/de facto languages with >=5% speakers, plus regional official languages with >=20%. If no national language is recorded, consider >=50%. Filter to curated groups and keep the two largest CLDR population percentages. Chinese varieties and script variants merge using maximum, never sum. Others remain neutral. CLDR estimates have differing dates and include second-language speakers.",
        "languages": [{"id": code, "name": name, "color": color} for code, name, color in LANGUAGES],
        "regions": regions,
        "sources": [{"url": CLDR, "sha256": hashlib.sha256(raw_cldr).hexdigest(), "license": "Unicode-3.0"},
                    {"url": NE, "sha256": hashlib.sha256(raw_ne).hexdigest(), "license": "Public Domain"}],
        "licenseFile": "unicode-license.txt",
    }
    folder = ROOT / "content/nature/maps"
    (folder / "core-languages.v1.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    (folder / "unicode-license.txt").write_bytes(fetch(LICENSE))
    print(f"{len(regions)} regions; {sum(bool(r['languages']) for r in regions.values())} colored; 18 language groups")
    for region in regions.values():
        if region["territory"] in ("CN", "HK", "TW", "JP", "KR", "CA", "IN", "SG", "DE", "FR", "BR"):
            print(region)

if __name__ == "__main__":
    main()
