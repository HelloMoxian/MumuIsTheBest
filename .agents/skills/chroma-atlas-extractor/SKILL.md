---
name: chroma-atlas-extractor
description: Split regular grid sprite atlases into stable per-cell PNG files, optionally remove flat green-screen or magenta chroma backgrounds with a soft alpha matte and despill, preserve full-cell alignment or trim transparent bounds, and emit a JSON cell manifest. Use when Codex needs to process a generated 2x2, 4x4, 5x4, or other regular image atlas; cut a sprite sheet into individual assets; key out a solid-color background; prepare compositable character or prop sprites; preserve hand-socket or handle alignment; or validate chroma-key edges and transparent corners.
---

# Chroma Atlas Extractor

Use the bundled `scripts/extract_chroma_atlas.py` for deterministic atlas cutting and chroma removal. Resolve the script path relative to this `SKILL.md`; do not assume the current working directory. Keep the original atlas unchanged and write results to a new directory.

Assume the execution environment already supplies Python 3 and Pillow. Do not vendor, install, or add these foundational packages to this repository unless the user explicitly requests dependency management.

## Workflow

1. Inspect the source image and confirm the exact column count, row count, reading order, and key color.
2. Decide whether to preserve the full cell canvas or use `--trim`:
   - Preserve cells for animation frames, shared baselines, character hand sockets, prop handles, or other positional alignment.
   - Trim cells for independent icons or props positioned by explicit anchors.
3. Supply stable IDs with `--ids` when product code will reference the outputs. The ID count must equal `columns x rows`.
4. Use the default `--auto-key border` sampling, soft chroma removal, and despill for antialiased cel art. Use `--keep-background` only for backgrounds that need splitting without keying.
5. Inspect the emitted manifest and warnings. Verify alpha output, transparent corners, subject coverage, cell order, and absence of green fringe.
6. If output corners remain opaque, inspect the source divider thickness and increase `--inset` before changing chroma thresholds. If an object edge remains visibly green after divider removal, rerun once with a slightly larger transparent threshold. Do not overwrite the only source atlas.

## Commands

Replace `<skill-directory>` with the directory containing this `SKILL.md`.

Split a 4x4 green-screen atlas while preserving every cell canvas:

```bash
python3 <skill-directory>/scripts/extract_chroma_atlas.py \
  --input /absolute/path/atlas.png \
  --output-dir /absolute/path/sprites \
  --columns 4 \
  --rows 4 \
  --ids idle,walk,run,jump,... \
  --inset 2
```

Split a 2x2 background atlas without removing its background:

```bash
python3 <skill-directory>/scripts/extract_chroma_atlas.py \
  --input /absolute/path/backgrounds.png \
  --output-dir /absolute/path/backgrounds \
  --columns 2 \
  --rows 2 \
  --ids room,kitchen,garden,dock \
  --keep-background \
  --inset 2
```

Trim independent transparent props:

```bash
python3 <skill-directory>/scripts/extract_chroma_atlas.py \
  --input /absolute/path/props.png \
  --output-dir /absolute/path/props \
  --columns 4 \
  --rows 4 \
  --prefix prop \
  --trim \
  --padding 6
```

## Chroma Rules

- Default to automatic key-color estimation from every cell corner because generated chroma backgrounds are rarely exact. Use `--auto-key none --key-color '#FF00FF'` when the intended key is known and subjects contain meaningful green.
- Keep `--transparent-threshold` below `--opaque-threshold`.
- Preserve full cells whenever frame, hand, handle, baseline, or socket alignment matters. Keep those interaction coordinates in a product catalog keyed by the stable sprite ID; never infer them from later trimming.
- Set `--inset` large enough to exclude the entire divider line. Thin grids usually need 1 or 2 pixels; generated atlases with thick black dividers may need 4 to 6 pixels.
- Treat low subject coverage, opaque corners, missing alpha, or empty cells as validation failures requiring inspection.
- Do not remove a key color that is also semantically present in the subject.

## Outputs

The script writes one PNG per selected cell and `manifest.json` by default. The manifest records the source grid, source crop bounds, output size, alpha coverage, stable ID, row, column, and filename. Use this manifest instead of reconstructing file order from directory enumeration.
