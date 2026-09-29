# 俄罗斯方块材质图集

运行时资源：`apps/web/public/images/tetris/block-themes-v1.webp`

- 生成方式：Codex 内置 ImageGen
- 原始输出：1355 × 1161 RGBA PNG，约 1.9 MB
- 运行时输出：672 × 576 WebP，7 列 × 6 行，每格 96 × 96，约 49 KB
- 后处理：先按规则网格切成 42 个精灵，逐格裁掉原始透明空边，再归一化铺满 96 × 96 格位；按材质重建左右、上下严格对称的抗锯齿透明轮廓，检查四角透明与边缘完整后重组图集，并压缩为 WebP
- 列顺序：青、黄、紫、绿、红、蓝、橙粉，对应 I、O、T、S、Z、J、L
- 行顺序：晶莹剔透、随机水晶、随机宝石、小笑脸、立体方块、扁球体

## ImageGen 提示词

```text
Use case: stylized-concept
Asset type: compact game tile sprite atlas for a browser Tetris game
Primary request: create one tightly aligned sprite atlas containing 42 separate square game-block tiles in an exact 7-column by 6-row grid.
Scene/backdrop: genuinely transparent background everywhere outside the individual tiles.
Subject: each grid cell contains exactly one isolated, front-facing, perfectly square tile with rounded corners, centered and filling about 86% of its cell. Columns always use this color order: bright cyan, sunny yellow, vivid violet, emerald green, saturated ruby red, electric blue, hot orange-pink. Rows always use this material order:
1) crystal clear glass — transparent polished glass with a subtle bevel and bright edge highlights;
2) varied natural crystal — faceted translucent crystal, each color with slightly different internal facets;
3) precious gem — jewel-cut gemstone with restrained sparkle and deep saturated color;
4) smiling tile — glossy rounded square with one simple friendly embossed smiley face, no text;
5) dimensional block — soft 3D beveled cube-like square viewed straight-on, only mild depth;
6) flattened orb — smooth glossy rounded-square / squashed bead, front-facing, broad soft highlight.
Style/medium: polished child-friendly 3D game UI sprites, crisp at small sizes, consistent lighting from upper left.
Composition/framing: exact orthographic 7 by 6 regular grid; equal square cells; equal gutters; no perspective on the atlas; every tile has identical outer bounds.
Lighting/mood: clean studio lighting, luminous but not neon bloom-heavy.
Constraints: transparent background; exactly 42 tiles; no labels, letters, numbers, logos, watermark, grid lines, frames, Tetris tetromino shapes, connected tiles, drop shadows extending beyond a tile's cell, particles, or background decoration. Keep strong silhouette and readable details after downscaling to 32x32 pixels.
```
