# 宝石迷阵美术资产

使用内置 imagegen 生成原创 PNG；未使用 CLI/API fallback。晶体切面、华丽宝石色调与原版核心玩法相呼应，界面仍服从本站星际探索舱设计系统。

- 源图集：`gem-atlas.png`，1774 × 887，4 × 2 网格，真实透明背景。
- 运行时七色与超能 PNG：`apps/web/public/images/bejeweled/{red,orange,yellow,green,blue,purple,white,cube}.png`。
- 运行时背景：`apps/web/public/images/bejeweled/sanctuary.png`。
- 格位、尺寸与透明度清单：`apps/web/public/images/bejeweled/manifest.json`。
- 通过工程 chroma-atlas-extractor 脚本切分，保留完整格位与源 alpha，不抠掉宝石内部绿色，不裁剪公共格位。检查结果：8 个图标，所有角点透明，0 个警告。
- 火焰、星形、新星复用七色图标并叠加实时光效与文字标识，消除粒子、选中框与下落由运行时绘制，不生成静态游戏截图替代玩法。

## 图集生成提示词

Use case: stylized-concept. Asset type: production game sprite atlas for a luxurious jewel match-three game. Create exactly eight isolated exquisite faceted gemstone icons in a precise 4 columns by 2 rows equal-cell grid, straight front view, centered in each cell, identical visual size, ample 20% padding. Transparent background with actual alpha. Row 1 left to right: red square-cut ruby, orange hexagonal amber, yellow diamond-shaped topaz, green emerald rectangular octagon. Row 2 left to right: blue triangular sapphire, purple round amethyst, white pear-cut diamond, rainbow prismatic luminous spherical hypercube. Rich saturated jewel colors, high-end 3D crystalline facets, crisp polished bevels, internal refraction, small brilliant highlights, subtle contained glow. No text, no logo, no UI, no borders, no other objects, no cast ground shadows. Each gemstone must remain wholly inside its own cell. Horizontal 2:1 aspect ratio. Designed to read clearly at 64px on a deep indigo space game board. Original artwork.

## 背景生成提示词

Use case: stylized-concept. Asset type: polished game environment background. A magnificent tranquil cosmic crystal sanctuary floating above violet nebula clouds. Wide cinematic 16:9 composition. Huge beautifully faceted purple and cyan translucent crystals framing the far left and far right edges, tiny distant stars, subtle elegant celestial rings, dark indigo blue glasslike floor near bottom. Middle 65 percent is very quiet deep navy gradient negative space, low contrast and no objects, suitable behind a match-three board. Exquisite high-end fantasy 3D game art, luminous gem refractions, magical but restrained, child friendly. Rich jewel tones at edges, atmospheric depth, soft cyan and violet rim lighting. No text, no logos, no UI, no characters. Original artwork.
