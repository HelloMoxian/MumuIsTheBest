# 节拍器乐器图标 v1

使用内置 ImageGen 生成三张 4×4 图集。A/B 各 16 个乐器，C 为 6 个打击乐组合与 10 个空位，共 38 个独立图标。没有调用外部图像 API 或 CLI 生成路径。

## 保存位置

- 原始图集：`atlas-a.png`、`atlas-b.png`、`atlas-c.png`，均原样保留，1254×1254 RGBA。
- 图标清单：`manifest.json`，记录稳定 ID、行列、源裁切位置、透明度、输出位置与 SHA-256。
- 深色背景总览：`preview.webp`。
- 运行时：`apps/web/public/images/metronome/instruments/v1/<instrument-id>.webp`，38 张 256×256 无损透明 WebP。
- 重建：`scripts/prepare-metronome-icons.py --asset <instrument-id>`；每次只写一个图标，便于逐文件变更记录。`--manifest`、`--preview` 各只写一个对应文件。

## 切分与接入

生成提示词要求绿幕，但内置工具实际返回原生透明 PNG。保留原生 alpha，不再对黑色乐器做色键抠图。提取脚本复用项目 `.agents/skills/chroma-atlas-extractor/scripts/extract_chroma_atlas.py` 的透明边裁切、噪声阈值及 alpha 校验能力。

四列分界为 314、627、940。默认四行同样在 314、627、940 分界；检查原稿后为三个局部轮廓做了小幅调整：A 第四列第二条横切线为 624；B 第二列第三条为 927；B 第四列第一条为 313。避免裁掉大提琴/低音提琴琴头或音乐盒盖。清除 alpha ≤8 的不可见噪声后裁切主体、等比缩放，居中放入 256px 画布，四周至少 12px 透明留白；不改变乐器画法。

选择卡片显示 72px，音轨 40px（窄屏 28—32px），底部当前乐器 32px。保持现有行高、按钮大小及页面布局。图片只作辅助，按钮继续提供完整中文名称；没有增加说明文案、背景板或装饰动效。

## 图标对应

| 图集 | 行 | 列 | ID | 乐器 |
|---|---|---|---|---|
| A | 1 | 1 | piano | 钢琴 |
| A | 1 | 2 | electric-piano | 电钢琴 |
| A | 1 | 3 | organ | 管风琴 |
| A | 1 | 4 | accordion | 手风琴 |
| A | 2 | 1 | guitar | 木吉他 |
| A | 2 | 2 | steel-guitar | 钢弦吉他 |
| A | 2 | 3 | electric-guitar | 电吉他 |
| A | 2 | 4 | harp | 竖琴 |
| A | 3 | 1 | banjo | 班卓琴 |
| A | 3 | 2 | violin | 小提琴 |
| A | 3 | 3 | viola | 中提琴 |
| A | 3 | 4 | cello | 大提琴 |
| A | 4 | 1 | pizzicato | 拨奏弦乐 |
| A | 4 | 2 | flute | 长笛 |
| A | 4 | 3 | recorder | 竖笛 |
| A | 4 | 4 | clarinet | 单簧管 |
| B | 1 | 1 | oboe | 双簧管 |
| B | 1 | 2 | bassoon | 巴松管 |
| B | 1 | 3 | sax | 萨克斯 |
| B | 1 | 4 | trumpet | 小号 |
| B | 2 | 1 | trombone | 长号 |
| B | 2 | 2 | horn | 圆号 |
| B | 2 | 3 | bass | 贝斯 |
| B | 2 | 4 | acoustic-bass | 低音提琴 |
| B | 3 | 1 | xylophone | 木琴 |
| B | 3 | 2 | marimba | 马林巴 |
| B | 3 | 3 | vibraphone | 颤音琴 |
| B | 3 | 4 | glockenspiel | 钟琴 |
| B | 4 | 1 | steel-drums | 钢鼓 |
| B | 4 | 2 | music-box | 音乐盒 |
| B | 4 | 3 | taiko | 太鼓 |
| B | 4 | 4 | timpani | 定音鼓 |
| C | 1 | 1 | drum-kit | 架子鼓 |
| C | 1 | 2 | hand-drums | 手鼓 |
| C | 1 | 3 | shakers | 沙锤与铃鼓 |
| C | 1 | 4 | cymbals | 镲与三角铁 |
| C | 2 | 1 | wood | 木块与响棒 |
| C | 2 | 2 | woodblock | 木块 |

## 实际生成提示词

每张图的完整提示词是「公共前缀 + 一个换行 + 对应图集后缀」。目标分辨率和绿幕是请求参数描述；实际产物尺寸与透明通道以上面的记录为准。

### 公共前缀

```text
Use case: stylized-concept.
Asset type: production raster sprite atlas of musical instrument icons for a child-friendly dark navy music application.
Create one high-quality 2048 x 2048 square image arranged on an EXACT invisible regular 4 columns x 4 rows grid. Each cell is 512 x 512 pixels. Center each occupied instrument silhouette on the center of its designated cell. Every silhouette, bow, stick, tube and highlight must be completely contained within the middle 76% of its cell, with at least 12% empty padding at every cell edge. Keep all cells isolated without overlaps or shared objects.
Backdrop: perfectly flat solid CHROMA GREEN #00FF00 edge-to-edge, including every gap and all unused cells. No gradient, no grid lines, no floor, no scenery, no white frames, no UI tiles. Do not put any green material or green colored part in the instruments; turquoise instruments must be clearly BLUE with no green.
Style: colorful polished compact instrument illustrations, restrained soft 3D volume, natural material colors, clean broad silhouettes that remain readable at 40–72 pixels. Friendly recognizable real musical instruments, not distorted baby toys. Soft consistent upper-left lighting and scale. No thin line drawing. No heavy or ground shadows. No text, numbers, labels, logos, watermark, people, hands, faces, or decorative stars.
The grid below defines exact cell contents in row-major order; names and positions are instructions and MUST NOT appear in the image.
```

### 图集 A 后缀

```text
ATLAS A: all sixteen cells occupied, exactly one instrument or specified instrument-and-bow group per cell.
Row 1 left to right:
r1c1 piano: black grand piano with open lid, visible ivory keyboard.
r1c2 electric-piano: compact violet digital keyboard, simple solid body, no stand.
r1c3 organ: small polished wood pipe organ with silver vertical pipes.
r1c4 accordion: red piano accordion with visible bellows.
Row 2 left to right:
r2c1 guitar: warm brown classical nylon-string acoustic guitar.
r2c2 steel-guitar: amber steel-string dreadnought acoustic guitar with black pickguard.
r2c3 electric-guitar: clearly teal-BLUE solid body electric guitar, no green.
r2c4 harp: golden curved concert harp.
Row 3 left to right:
r3c1 banjo: banjo with round white drum body and long neck.
r3c2 violin: small amber violin with bow.
r3c3 viola: broader dark reddish-brown viola with bow, visually distinct from lighter violin.
r3c4 cello: upright warm amber cello with black endpin and bow.
Row 4 left to right:
r4c1 pizzicato: reddish violin WITHOUT bow, strings prominent, no hand.
r4c2 flute: silver transverse concert flute on a diagonal.
r4c3 recorder: ivory recorder with visible finger holes on a diagonal.
r4c4 clarinet: black clarinet with silver keys and a flared bell on a diagonal.
Respect EXACT instrument order and 4 by 4 alignment; do not add any extra items.
```

### 图集 B 后缀

```text
ATLAS B: all sixteen cells occupied, exactly one instrument or specified instrument-and-mallets group per cell.
Row 1 left to right:
r1c1 oboe: slender dark wood oboe, silver keys and tiny protruding double reed, narrow slightly flared foot, visibly distinct from clarinet.
r1c2 bassoon: reddish bassoon with long folded wooden tube and silver bent bocal.
r1c3 sax: gold alto saxophone.
r1c4 trumpet: gold trumpet with three valves.
Row 2 left to right:
r2c1 trombone: gold trombone with long slide.
r2c2 horn: gold French horn, coiled tubing, circular silhouette.
r2c3 bass: blue four-string electric bass with long neck.
r2c4 acoustic-bass: large amber double bass with endpin, upright.
Row 3 left to right:
r3c1 xylophone: simple small wooden-bar xylophone with two mallets.
r3c2 marimba: larger wood-bar marimba with gold resonator pipes and two mallets.
r3c3 vibraphone: silver metal bars, blue frame, resonator tubes.
r3c4 glockenspiel: small silver glockenspiel in a blue case.
Row 4 left to right:
r4c1 steel-drums: single silver concave steelpan showing tone zones, no long stand.
r4c2 music-box: small open wooden music box revealing brass cylinder and mechanism.
r4c3 taiko: Japanese reddish barrel taiko drum with thick cream drumhead and two sticks.
r4c4 timpani: single copper bowl timpani, cream head, short black stand.
Respect EXACT instrument order and 4 by 4 alignment; do not add any extra items.
```

### 图集 C 后缀

```text
ATLAS C: exactly SIX occupied cells and TEN genuinely empty pure green cells. Keep the full square 4 by 4 grid spacing; do NOT enlarge the six groups to fill the sheet. The bottom half of this image must be entirely empty flat #00FF00. Do NOT invent other objects or fill empty cells.
Row 1 left to right:
r1c1 drum-kit: compact blue drum kit grouped as one icon: bass drum, two toms, snare and cymbals.
r1c2 hand-drums: warm red/orange pair of bongos beside one taller conga, one compact group.
r1c3 shakers: pair of red maracas and a cream wood tambourine, one compact group.
r1c4 cymbals: pair of small golden cymbals with a hanging silver triangle beside them, one compact group.
Row 2 left to right:
r2c1 wood: one woodblock and a pair of wooden claves grouped together.
r2c2 woodblock: single hollow wooden slit percussion block with one mallet.
r2c3 EMPTY, pure #00FF00 only.
r2c4 EMPTY, pure #00FF00 only.
Row 3: all four cells EMPTY, pure #00FF00 only.
Row 4: all four cells EMPTY, pure #00FF00 only.
Respect EXACT six-group placement: centers at (256,256), (768,256), (1280,256), (1792,256), (256,768), (768,768) in the 2048 square. No visible grid. All other cells absolutely empty green.
```
