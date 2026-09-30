#!/usr/bin/env python3
"""Extract a curated FluidR3 sample bank. Development only; no runtime network.
One invocation writes exactly the --asset destination, allowing per-file auditing.
Remote JavaScript is parsed as data, never executed.
"""
import argparse, base64, hashlib, json, re, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVISION = "23ca907d4370a04fd89ca483a92915e4d6159ab9"
BASE = "https://raw.githubusercontent.com/surikov/webaudiofontdata/" + REVISION + "/sound/"
CATALOG = json.loads((ROOT / "content/metronome/instruments.v1.json").read_text())["instruments"]
OUT = ROOT / "apps/web/public/audio/metronome"
PROGRAMS = sorted({x["program"] for x in CATALOG if x["program"] is not None})
DRUMS = sorted({n for x in CATALOG for n in x.get("drums", [])} | {36, 38, 39, 42, 46})
ASSETS = ["p%03d" % p for p in PROGRAMS] + ["drums"]

def extract(name):
    raw = urllib.request.urlopen(BASE + name, timeout=45).read()
    text = raw.decode("utf-8")
    zones = []
    for block in re.findall(r"\{[^{}]*?file:'[A-Za-z0-9+/=]+'[^{}]*?\}", text):
        encoded = re.search(r"file:'([A-Za-z0-9+/=]+)'", block).group(1)
        sample = base64.b64decode(encoded, validate=True)
        if len(sample) < 100:
            raise ValueError("Empty sample: " + name)
        zone = {}
        for key in ["keyRangeLow", "keyRangeHigh", "originalPitch", "coarseTune", "fineTune", "sampleRate", "loopStart", "loopEnd"]:
            match = re.search(r"\b" + key + r":(-?\d+(?:\.\d+)?)", block)
            zone[key] = float(match.group(1)) if match else 0
        if not 8000 <= zone["sampleRate"] <= 96000:
            raise ValueError("Invalid sample rate")
        zone["file"] = encoded
        zones.append(zone)
    if not zones:
        raise ValueError("No sample zones: " + name)
    return zones, {"url": BASE + name, "sha256": hashlib.sha256(raw).hexdigest()}

def create(asset):
    sources, zones = [], []
    if asset == "drums":
        for pitch in DRUMS:
            found, source = extract("128%d_0_FluidR3_GM_sf2_file.js" % pitch)
            # Match the played GM drum note, even if the source sample has another root pitch.
            for zone in found:
                zone["keyRangeLow"] = zone["keyRangeHigh"] = pitch
            zones.extend(found)
            sources.append(source)
    else:
        program = int(asset[1:])
        found, source = extract("%03d0_FluidR3_GM_sf2_file.js" % program)
        # Keep the core register; the highest pentatonic keys use the nearest zone.
        zones = [z for z in found if z["keyRangeHigh"] >= 24 and z["keyRangeLow"] <= 100]
        sources.append(source)
    payload = {"schemaVersion": 1, "source": "FluidR3 / WebAudioFont", "revision": REVISION, "sources": sources, "zones": zones}
    OUT.mkdir(parents=True, exist_ok=True)
    destination = OUT / (asset + ".json")
    encoded = (json.dumps(payload, separators=(",", ":")) + "\n").encode()
    destination.write_bytes(encoded)
    print(asset, len(zones), len(encoded), hashlib.sha256(encoded).hexdigest())

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", choices=ASSETS)
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()
    if args.list:
        print(json.dumps([str(OUT / (a + ".json")) for a in ASSETS]))
    elif args.asset:
        create(args.asset)
    else:
        parser.error("Use --list or --asset; existing source banks are never overwritten.")
