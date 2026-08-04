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

外框绝不与内容图合并。这样几千个节点可以共享少量品质外框，有专属图片时直接替换，
没有图片时使用层级回退或星尘文字占位。

## 目录

- `backgrounds/`：页面背景；
- `frames/`：普通、稀有、史诗、传说四种透明外框；
- `nodes/core/`：40 个一期核心节点专属内容图；
- `nodes/levels/`：15 个层级回退图；
- `resources/action/`：24 个动作；
- `resources/condition/`：12 个条件；
- `resources/environment/`：20 个环境；
- `resources/knowledge/`：79 个知识点；
- `placeholders/`：无图节点的星尘占位；
- `source-atlases/`：未经运行时缩小的原始图集。

原始图集按固定网格生成并保留。运行时图标使用 WebP；透明外框保留 PNG。
图标路径由 `content/world-tower/icon-manifest.v1.json` 统一维护，不在页面里散落映射。

## 扩展流程

1. 先判断新内容能否使用现有层级回退；不能时再生成专属内容图。
2. 同批生成优先使用 5×4 或 5×3 等分图集，统一深蓝背景、无缝隙、无文字。
3. 原图保存到 `source-atlases/`，切分结果放入对应目录。
4. 核心节点在 `scripts/generate-world-icon-manifest.mjs` 登记；资源文件名使用 ID 冒号后的稳定部分。
5. 运行 `pnpm content:world-tower:validate`，确认清单中的所有文件存在。

当前资产包 ID：`mumu-world-tower-cosmic-runes-v1`。
