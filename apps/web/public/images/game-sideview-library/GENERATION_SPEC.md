# 横版图集生成规范 v1

本规范记录这批资产的构图方法，目的是让后续追加内容仍保持同一视觉品质、视角、尺度与格位规则。它只描述美术资产，不包含任何“万物构成塔”规则。

## 固定母版提示词

后续每批替换“格位清单”，其余部分尽量保持不变：

```text
Create one polished production-ready 2D game asset atlas with EXACTLY 20 separate subjects arranged in a strict 5-column by 4-row grid, following the supplied row-major slot list exactly.

Every cell contains exactly one complete subject. Use a pure horizontal side view at eye level: orthographic profile, never isometric, never top-down, never three-quarter perspective. Characters, animals and vehicles face right unless the object is naturally symmetric. Buildings show their complete readable side elevation. Keep the entire silhouette, weapons, roof, wheels, feet and ground-contact shadow inside its cell with generous safe padding. Give all subjects a consistent baseline and visually comparable gameplay scale while preserving differences between infantry, vehicles, buildings and landmarks.

Visual direction: premium hand-painted remastered classic RTS concept art, crisp readable silhouettes, carefully layered metal/stone/cloth/energy materials, lively cyan, cobalt, warm gold, magenta and faction-specific accents, restrained luminous effects, child-friendly clarity, adventurous rather than grim. Match the established deep-space polished icon quality, but make the overall exposure and color energy about 10–15 percent brighter and more cheerful. Rich detail must remain legible at small gameplay size.

Canvas: 3:2 landscape, deep navy-to-indigo studio gradient, subtle low ground haze, thin cyan separators forming an exact 5×4 grid. No scenery crossing cell borders. No labels, letters, numbers, logos, emblems, watermarks, UI frames, circular icon borders, cards or decorative captions. Do not combine adjacent items. Do not crop any subject.

The 20 cells, left-to-right and top-to-bottom, are:
1. ...
20. ...
```

## 阵营视觉锚点

- 盟军：冷蓝、银白、清洁几何装甲、青色能量与航空科技感。
- 苏联：暗红、工业钢铁、厚重铆钉、特斯拉电弧与强烈机械体量。
- 尤里：紫红、深黑、青绿心灵能量、生化曲线与异质科技。
- 人类：蓝银、石墙、金色镶边、清晰的中世纪工程结构。
- 兽族：暖红、粗木、骨饰、铁箍、厚重且富有力量的轮廓。
- 不死亡灵：紫黑、病绿、骨骼、尖塔与幽灵能量；避免过度恐怖和血腥。
- 暗夜精灵：月蓝、青绿、活体树木、弯月金属与柔和自然荧光。
- 中立元素：按元素自身材质配色，但保持统一的深蓝工作底和明快曝光。

## 批次与文件名

### 红色警戒 2／尤里的复仇

1. `ra2-01-allied-buildings`：盟军建筑。
2. `ra2-02-soviet-buildings`：苏联建筑。
3. `ra2-03-yuri-neutral-buildings`：尤里与中立建筑。
4. `ra2-04-neutral-landmarks-fauna`：中立设施、地标与动物。
5. `ra2-05-infantry-core`：核心步兵。
6. `ra2-06-special-units-fauna`：特殊单位与生物。
7. `ra2-07-ground-vehicles`：地面载具。
8. `ra2-08-air-naval-yuri-vehicles`：空军、海军与尤里载具。

### 魔兽争霸 Ⅲ

1. `wc3-01-human-orc-buildings`：人类与兽族建筑。
2. `wc3-02-undead-nightelf-buildings`：不死亡灵与暗夜精灵建筑。
3. `wc3-03-human-units`：人类单位与英雄。
4. `wc3-04-undead-units`：不死亡灵单位与英雄。
5. `wc3-05-orc-nightelf-units`：兽族与暗夜精灵单位。
6. `wc3-06-nightelf-neutral-heroes`：暗夜精灵与中立英雄。
7. `wc3-07-neutral-mechanics`：中立单位、资源与核心机制。

每个批次的精确 20 格名称和稳定 ID，以 `catalog.v1.json` 为唯一映射来源。

## 生成后的验收清单

1. 数量必须正好是 20，网格必须正好是 5×4。
2. 逐格按目录顺序核对，不允许漏项、并项或跨格。
3. 人物、动物、载具为完整侧身轮廓，默认朝右；建筑为完整侧立面。
4. 不允许俯视、等距视角或明显三分之四视角。
5. 任何枪口、机翼、屋顶、脚、轮子和底座都不能被裁掉。
6. 不允许文字、数字、Logo、水印、名称牌和圆形图标框。
7. 分隔线清晰，内容不得越过分隔线；相邻格不能出现共享背景物件。
8. 暗部仍应辨认主体，整体比“万物构成塔”节点图约明亮 10–15%。
9. 小尺寸下先看轮廓，放大后再看材质细节；不能只靠微小装饰区分元素。
10. 不合格的整批重新生成，不在错误母图上继续追加，避免格位与目录错位。

## 输出与后处理

- 保留 1536×1024 PNG 作为源图。
- 导出同尺寸 WebP，当前质量参数为 90，用于网页预览和运行时加载。
- 如需透明单体精灵，以 PNG 为源，按比例格位边界裁切，再单独去除深蓝背景和青色分隔线。
- 如果未来需要动作帧，应新建动画序列目录；不要覆盖本批静态识别图，也不要改变已有 ID。
