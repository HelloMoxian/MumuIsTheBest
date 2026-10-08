# 钻石方块 · 高辨识元素皮肤 v1

通过内置 ImageGen 生成一个 4×2 透明图集，再用工程内 chroma-atlas-extractor 规则切分。原图保留于 `source-atlas.png`，裁切范围与透明度记录见 `manifest.json`；保留完整格位，不抠除任何颜色。

运行时图片：`apps/web/public/images/diamond-blocks/elements-v1/`。固定映射 0—6 为 H、He、Li、Be、B、C、N，不改变已存盘面的身份编号，不修改数独共用素材。

| ID | 元素符号 | 主色 | 轮廓 |
| --- | --- | --- | --- |
| 0 | H | 红 | 圆形 |
| 1 | He | 蓝 | 水滴 |
| 2 | Li | 绿 | 三角 |
| 3 | Be | 黄 | 方形 |
| 4 | B | 紫 | 菱形 |
| 5 | C | 橙 | 六边形 |
| 6 | N | 白 | 五角星 |

颜色为游戏区分设计，不代表元素真实外观。字母同时辅助识别。第八格 unused 为空白预留格，不参与玩法。背景透明通道由 ImageGen 直接生成，切分时用 `--keep-background` 原样保留，避免去色损伤绿色/蓝色主体。

生成日期：2026-10-08。方式：内置 ImageGen（非 CLI）。

## 最终生成提示词

```text
Use case: stylized-concept.
Asset type: ONE production-ready sprite atlas for a children's falling-block match-three game, chemistry-element skin.
Primary request: create exactly SEVEN beautiful, instantly distinguishable chemistry element tokens on a genuinely transparent RGBA background. A regular 4-column by 2-row grid on a 2048x1024 canvas. Eight equal 512x512 square cells; fill seven cells in row-major reading order and leave the bottom-right eighth cell completely transparent. No gutters, no divider lines, no scene, no captions outside tokens. Each token individually centered within its cell and occupies about 82% of the cell, never touches edges. All tokens face straight forward and have matching perceived size and crisp clean alpha edges.
Art direction: polished chunky 3D enamel-and-glass science game tokens with restrained bevels and soft highlights. Friendly, handsome, richly colored. Visual identity must remain easy at 28px display size. Broad uninterrupted SOLID COLOR faces, NOT mostly white/gold/silver rims. Thin darker bevel matching each token's own color. Very large bold simple chemical symbol centered, taking 55% of token width, with subtle bevel. Strong color AND silhouette distinctions. No orbit rings, satellite beads, particles, sparkles, shadows outside the token, tiny decorations, or common cyan glow.
Exact cell contents:
Row 1 column 1: H (uppercase H only), saturated crimson RED round disk; white bold H.
Row 1 column 2: He (capital H lowercase e), saturated azure BLUE teardrop, pointed top and rounded bottom; white bold He.
Row 1 column 3: Li (capital L lowercase i), vivid emerald GREEN broad rounded triangle; white bold Li.
Row 1 column 4: Be (capital B lowercase e), sunny bright YELLOW rounded square; dark charcoal bold Be.
Row 2 column 1: B (uppercase B only), deep royal PURPLE diamond/rhombus, four strong tips; white bold B.
Row 2 column 2: C (uppercase C only), vivid tangerine ORANGE flat-topped hexagon; dark charcoal bold C.
Row 2 column 3: N (uppercase N only), bright porcelain WHITE chunky five-point star; deep navy bold N, cool gray edge for silhouette.
Row 2 column 4: EMPTY TRANSPARENT.
Constraints: every symbol exactly as written, no atomic numbers or extra text. This is an intentional game color palette, not scientific element color coding. Do not add a common gold rim or excessive white reflections that dilute the seven dominant colors. Truly transparent background, no checkered background baked into image. This single coherent sprite-sheet asset will be mechanically split on exact 4x2 grid boundaries.
```
