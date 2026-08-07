# 猫和老鼠横版资产生成规范 v1

本目录保存一批经典手绘赛璐璐风格的角色动作、背景和恶搞道具图集。图集用于后续横版玩法原型，不依赖现有业务模块。

格位名称、稳定 ID 和接口映射以 `catalog.v1.json` 为唯一事实来源。

## 资产规模

- 角色动作：汤姆、杰瑞、斯派克各一张 4×4 图集，每个角色 16 个动作。
- 场景背景：两张 2×2 图集，共 8 个完整背景。
- 恶搞与测量道具：三张 4×4 图集，共 48 个道具。
- 每张图集同时保留无损 PNG 源图和质量 90 的 WebP 运行时版本。

## 固定美术方向

- 经典 1940s—1950s 美国影院动画的手绘赛璐璐质感。
- 清楚的深色墨线、平涂色块、少量手绘高光和夸张的 squash-and-stretch 动作。
- 角色与道具使用纯色 `#00FF00` 绿幕；背景是完整场景，不使用绿幕。
- 角色与道具采用横版侧视、默认朝右；需要朝左时由渲染层水平翻转。
- 不生成文字、标签、Logo、水印、界面边框、地面投影或独立特效。

## 本批实际提示词骨架

### 角色动作图集

```text
Use case: stylized-concept
Asset type: production 2D side-view character action sprite atlas
Primary request: create exactly sixteen separate full-body actions of [Tom/Jerry/Spike]
in a strict 4-column by 4-row square grid, faithfully matching the classic theatrical
Tom and Jerry hand-drawn cel-animation character design.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key background; exact grid;
no scenery, floor, shadow, gradient or texture.
Composition/framing: orthographic side view at eye level, facing right, one complete
character per cell, shared baseline, generous safe padding, nothing crossing grid lines.
Style/medium: classic 1940s-1950s American theatrical cel animation, clean dark ink
contours, flat painted cel colors, restrained highlights, expressive squash-and-stretch.
Constraints: exactly 16 subjects; no extra character, actual prop, text, watermark,
speed line, dust, impact effect, cast shadow or cropped limb.
```

三名角色使用完全相同的动作语义顺序：第一行移动，第二行握持接口，第三行交互，第四行表情与受击反应。具体 16 格动作见目录文件。

### 背景图集

```text
Use case: stylized-concept
Asset type: production 2D side-view cartoon game environment background atlas
Primary request: create exactly four empty environment plates in a strict 2x2 grid.
Style/medium: high-fidelity hand-painted classic theatrical animation background,
warm gouache-like paint, simplified readable forms and period-appropriate design.
Composition/framing: eye-level side-on stage view, fixed ground baseline, broad open
lower action corridor, no foreground obstruction, nothing crossing cell dividers.
Constraints: no character, animal, movable gag prop, text, sign, logo or watermark.
```

### 手持道具图集

```text
Use case: stylized-concept
Asset type: production 2D side-view handheld prop sprite atlas
Primary request: create exactly sixteen isolated props in a strict 4x4 grid.
Scene/backdrop: flat uniform #00FF00 chroma-key field; no floor, shadow or gradient.
Style/medium: classic theatrical cel-animation prop art, clean dark ink contours,
flat colors, exaggerated readable silhouette and period materials.
Attachment geometry: row 1 uses G1, row 2 uses G2, row 3 uses G3; handles and shafts
must remain fully visible and unobstructed at the nominal catalog anchor positions.
Constraints: no character, hand, paw, arm, scenery, text, watermark or cropped handle.
```

### 投掷物与机关图集

```text
Use case: stylized-concept
Asset type: production 2D slapstick prop and trap sprite atlas
Primary request: create exactly sixteen isolated gag props in a strict 4x4 grid.
Scene/backdrop: flat uniform #00FF00 chroma-key field.
Composition/framing: eye-level side view; complete silhouettes; floor props share a
baseline; handheld items expose their pickup area; rope ends remain isolated.
Constraints: playful child-friendly slapstick only; no realistic injury, gore, flame,
explosion, character, hand, text, logo, watermark, shadow or cropped prop.
```

### 测量参照物图集

```text
Use case: stylized-concept
Asset type: production 2D side-view measurement-reference prop sprite atlas
Primary request: create exactly sixteen isolated height, length and stacking references
in a strict 4x4 grid, including paired tall/short rocks, posts and planks, plus one/two/
three-crate stacks, a barrel, ladder, bench, table and three ascending stone steps.
Scene/backdrop: flat uniform #00FF00 chroma-key field.
Composition/framing: eye-level side view, shared baseline, complete flat tops and bottoms,
clear tall/short and long/short relationships, no subject crossing a divider.
Constraints: no character, measurement number, ruler marking, text, logo, shadow or cropped edge.
```

## 握持与衔接规则

- `G1`：单手短柄横握。
- `G2`：单手长柄斜握。
- `G3`：双手长杆，带两个握点。
- `G4`：双手举起或托举大型物体。
- `T1`：掌心投掷物。
- `F1`：地面接触点。
- `R1`：绳索或钓线自由端。

角色第二行的细校准杆用于识别手掌通道和轴线，不属于最终运行时画面。切分单格时应先从校准杆计算手部握点，再删除该校准杆。道具使用目录中的名义锚点作为初值，实际接入时允许按切图后的非透明边界做少量像素校准。

叠放手持道具时建议使用三层：

```text
角色身体后层
  ↓
道具与握柄层
  ↓
手掌／手指前层
```

只做整张角色精灵与整张道具精灵的两层叠放，无法保证柄杆自然穿过手指；正式接入应为握持动作生成手部前景遮罩。

## 输出与后处理

- PNG 源图位于 `source-atlases/`，不得被有损版本覆盖。
- WebP 图集位于 `atlases/`，当前质量参数为 90。
- 透明单图位于 `sprites/`；角色保留完整格位画布，独立道具可以裁紧透明边界，背景只切分不抠色。
- 图集切分和绿幕处理使用个人 Skill `chroma-atlas-extractor`，每个输出目录同时保存 `manifest.json`。
- 角色与道具按 4×4 比例边界裁切；背景按 2×2 比例边界裁切。
- 绿幕抠图应使用软边蒙版和去绿溢色，不能只做单一颜色硬删除。
- 汤姆、杰瑞、斯派克的建议运行时高度比例为 `1.00 : 0.30 : 1.10`。
- 特效、速度线、灰尘、眩晕星星和地面阴影应作为独立资产或运行时效果，不烘焙进角色动作。

## 权利说明

本目录为非官方同人概念资产。《猫和老鼠》及相关角色设定归其权利方所有。公开发布或商业使用前需要确认授权范围，必要时替换为拥有完整使用权的原创角色设计。
