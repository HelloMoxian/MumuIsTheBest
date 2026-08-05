# 万物构成塔美术资产

## 已确认的美术方向

关键词：`premium fantasy-science children's game art`、深海军蓝宇宙底、光泽珐琅、
发光水晶、细小金色花丝、青/紫/品红/金色轮廓光、克制星尘、64px 下仍清楚。

后续生成必须继续以 `source-atlases/rune-frames-v1.png` 和早期确认稿
`temp/world-tower-assets/rune-atlas-v2.png` 作为风格参考，保持：

- 单个主体居中，四周留足安全区；
- 同一图集的尺度、背景、光向和细节密度一致；
- 不生成文字、数字、水印、外框、选中光效或锁定状态；
- 人物、脸和无关装饰不进入教育图标；
- 武器装备只做静态的工程认知展示，不出现使用场景。

## 组合规则

运行时节点由三层组成：

1. `frames/` 的透明外框；
2. `nodes/` 或 `placeholders/` 的内容图；
3. 页面中的 HTML 名称、问号、数量与状态。

外框绝不与内容图合并。这样几千个节点可以共享少量品质外框，有语义图片时直接替换，
没有通过语义校验的图片时使用星尘纹理和节点自身名称占位。层级主题图只服务左侧导航，
不能冒充某一个具体节点。

## 目录

- `backgrounds/`：页面背景；
- `frames/`：普通、稀有、史诗、传说四种透明外框；
- `nodes/core/`：40 个一期核心节点专属内容图；
- `nodes/atlases/`：518 个化合物的结构准确 SVG 图集；
- `nodes/levels/`：15 个左侧层级导航主题图；
- `resources/action/`：24 个动作；
- `resources/condition/`：12 个条件；
- `resources/environment/`：20 个环境；
- `resources/knowledge/`：79 个知识点；
- `placeholders/`：无图节点的星尘占位；
- `source-atlases/`：未经运行时缩小的原始图集。

原始图集按固定网格生成并保留。单图优先使用 WebP；透明外框和 AI 源图保留 PNG，
大批化合物使用 SVG 图集。运行时通过清单中的行、列、格位精确裁切，不复制成 2000 个请求。
图标路径由 `content/world-tower/icon-manifest.v1.json` 统一维护，不在页面里散落映射。

## 可复用生成提示词基线

本轮 AI 图集使用 `stylized-concept` 模式，并以已确认的核心节点图和元素图集仅作为风格参考：

> premium children's science discovery game icon source atlas; premium fantasy-science cosmic
> enamel/crystal illustration; deep navy cells; glossy dimensional objects; cyan, violet, magenta
> and gold rim lighting; restrained stardust; centered isolated subject; recognizable at small size;
> no text, numbers, formulas, UI frames, circular borders, labels, logos, watermarks, people or hands.

每批在提示词末尾追加固定网格和严格的 row-major 主体清单。生成后必须人工核对实际格位；
模型偶尔会合并相近概念或留下空格，清单只能登记肉眼确认语义一致的格位，不能盲信提示顺序。
元素层保存在 `nodes-elements-01-v2.png` 至 `nodes-elements-06-v2.png`；其余图集按
`nodes-{level}-{batch}-v2.png` 命名。本轮源图保留在 `source-atlases/`，后续新页面可复用。

## 扩展流程

1. 先判断是否存在语义相同的基础图；同一物品的儿童款、便携款等变体可以共用基础语义图。
2. 没有匹配图时先保留名称占位，再按 4×4 或 5×4 固定网格生成，不得临时套用层级主题图。
3. 原图保存到 `source-atlases/`，人工校验后在 `scripts/generate-world-icon-manifest.mjs` 登记实际格位。
4. 化合物结构变化时运行 `node scripts/generate-world-icon-assets.mjs`，始终从统一化合物目录重建。
5. 运行 `pnpm content:world-tower:validate`，确认覆盖率、格位边界和所有文件都有效。

当前资产包 ID：`mumu-world-tower-cosmic-runes-v2`，覆盖 118 个元素、518 个化合物和
872 个核心/宏观语义节点，共 1508 个节点图标映射。
