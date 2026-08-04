# 万物构成塔：美术生成与节点展示规则

状态：**原型阶段确认记录，尚未进入正式设计系统**

记录日期：2026-08-04

## 1. 已确认的美术方向

第二版生成的宇宙背景和圆形符文图标，其整体美术品质与方向得到确认。后续即使调整节点结构、内容展示规则或交互方式，也应保持这一画面品质。

必须保持的核心特征：

- 高品质手绘游戏 UI 质感，而不是扁平信息图标。
- 奇幻与科学融合，但不做成黑暗、恐怖或高压风格。
- 深海军蓝背景，使用青、紫、洋红和暖金作为主要辉光。
- 使用珐琅、半透明水晶、星尘和精细金属镶边等材质语言。
- 画面精致、宝石感强，在较小尺寸下仍有清楚的轮廓和主体。
- 节点可以跨越粒子、物质、地貌、工程、艺术和宇宙，但必须保持同一视觉世界观。
- 图片中不生成节点名称、公式、数量、状态文字、按钮或其他业务 UI。
- 选中辉光、关系强弱、成功、锁定等状态由界面实现，不烘焙进内容图片。

## 2. 当前资产及其生成方式

本次使用 Codex 内置图像生成能力生成，没有使用 CLI 模式。

现有临时资产：

- cosmic-tower-v2.png：1536 × 1024，万物构成塔背景。
- rune-atlas-v2.png：1254 × 1254，4 × 4 圆形符文图集。

### 2.1 宇宙背景的原始提示词

~~~text
Use case: stylized-concept
Asset type: wide game UI environment background for a children's science-building rune tree
Primary request: a majestic vertical "tower of everything" rising from a tiny quantum spark at the bottom through microscopic nebulae, molecular lattices, natural landscapes, a planet horizon, stars, and a grand galaxy canopy at the top
Scene/backdrop: deep-space observatory atmosphere with a subtle central energy trunk and a few elegant branching light paths, designed to sit behind interactive circular rune nodes
Style/medium: premium hand-painted game environment art with polished fantasy-science UI sensibility; sophisticated but friendly for a five-year-old
Composition/framing: wide landscape; strongest vertical flow through the center; generous calm negative space across the middle for many interactive nodes; the left and right edges may have subtle cosmic architecture; no pre-drawn buttons or panels
Lighting/mood: mysterious, inviting, wondrous, soft volumetric glow, never dark or threatening
Color palette: deep navy and indigo with restrained cyan, violet, magenta, and warm gold highlights matching a glassy space-exploration interface
Materials/textures: soft nebula mist, stardust, translucent crystal energy, subtle celestial stone; no heavy texture
Constraints: no text, no letters, no numbers, no logos, no watermark, no UI labels, no characters, no spaceship, no hard rectangular frames, no tree leaves, no literal wooden tree; keep the central background low-detail enough for readable UI nodes
~~~

### 2.2 圆形符文图集的原始提示词

~~~text
Use case: stylized-concept
Asset type: square game UI icon atlas for a children's science-building rune tree
Primary request: exactly sixteen polished circular rune icons arranged in a perfectly even 4-by-4 grid, with consistent cell size and generous internal padding
Scene/backdrop: one uniform deep navy atlas background with subtle thin separators between cells
Subject: row 1 from left to right: glowing electron orbit, proton-and-neutron nucleus, luminous atom, water molecule cluster; row 2: clear water droplet, blue ice crystal, layered rock, golden sediment grains; row 3: tranquil pond, powerful flood wave, wind-carved yardang landform, fjord between cliffs; row 4: sleek airplane, modern computer chip, colorful video game world portal, friendly artificial-intelligence neural core
Style/medium: premium hand-painted fantasy-science game UI icons, jewel-like circular frames, readable at small size, cohesive rune-tree inventory style
Composition/framing: exact orthographic front view; every icon centered inside its own circular frame; no icon overlaps another cell; identical outer circle size in all sixteen cells
Lighting/mood: magical, inviting, high clarity, restrained glow
Color palette: deep navy, cyan, violet, magenta, warm gold, with subject-specific accents
Materials/textures: enamel, translucent crystal, stardust, fine metal filigree
Constraints: exactly 16 icons, exactly 4 columns and 4 rows, no text, no letters, no numbers, no labels, no logos, no watermark, no characters, no rectangular UI panels beyond the uniform atlas background, do not merge subjects
~~~

### 2.3 本次成图效果较好的关键原因

- 明确指定为高品质游戏 UI 图标，而不是普通插画或扁平 icon。
- 明确指定圆形宝石框、材质、光照和小尺寸可读性。
- 使用一致的深蓝底色和青紫金配色，让跨领域内容仍像同一套资产。
- 对每一格的主体、顺序、数量和构图方式做了明确约束。
- 禁止文字、标签、水印和多余界面，避免生成内容与业务 UI 耦合。

## 3. 当前图集的局限

rune-atlas-v2.png 把“符文外框”和“节点内容图”生成在了同一张图片里。它适合验证美术方向，但不适合作为上千个节点的长期资产结构。

主要问题：

- 每新增一个节点都要重新生成包含外框的完整 icon，生成数量和维护成本过高。
- 外框、品质、选中态和内容图绑定，后续难以统一调整框体。
- 生成结果的边框尺寸可能存在细微差异，不利于密集图谱整齐排列。
- 没有图片的新节点难以复用同一外框进行文字占位。
- 长方形、正方形或不同裁切比例的内容图不容易稳定放入现有成品 icon。

因此，当前图集只能作为美术质量参考和临时原型资产，不应通过继续生成大量“外框 + 内容”的成品 icon 来扩展正式内容。

## 4. 正式节点必须拆分为独立图层

长期节点建议由以下五层组合，彼此独立：

~~~text
关系辉光层
  ↓
品质外框层
  ↓
内容裁切窗口
  ↓
状态标记层
  ↓
节点名称层
~~~

### 4.1 关系辉光层

由 CSS 或 Canvas 实现，不属于图片资产。

- 当前选中：最强的紫粉、青色动态辉光。
- 组成来路：稳定的青色中强度辉光。
- 可去方向：暖金色或紫金色次级辉光。
- 普通已点亮节点：始终保持明亮，不因未选中而变暗。
- 未解锁节点：使用问号、暗纹理和虚线框，但不能暴露真实名称。

### 4.2 品质外框层

外框是有限数量、可以被所有节点重复使用的 UI 资产。

要求：

- 单独生成纯外框，不包含物质、地貌、人物、建筑或其他主体。
- 中央内容区域必须真正透明。
- 外框外侧也必须透明，不能带整块深蓝背景。
- 外框保持正方形画布和稳定中心。
- 外框的持续呼吸、选中光圈和关系色不烘焙进图片。
- 可以准备基础、稀有、史诗、传说等少量品质变体，但必须共享相同外尺寸与内容窗口。
- 允许保留珐琅、水晶、星尘和金属镶边质感，以延续当前图集的品质。

外框透明资产优先采用“内置图像生成 → 单色背景 → 本地抠图”的方式制作，并检查：

- 四角透明；
- 中央窗口透明；
- 金属和水晶边缘没有明显色边；
- 外框没有被裁掉；
- 各品质框的内容窗口完全一致。

### 4.3 内容裁切窗口

界面必须定义一个稳定的内容安全区，而不是依赖每张图片自带圆框。

要求：

- 内容窗口的位置和大小由 UI 统一决定。
- 矩形、正方形内容图均可使用 cover 方式放入窗口。
- 图片主体必须位于中央安全区，避免裁切后丢失关键部分。
- 圆形、上半圆或“上部图片、下部名称”的具体比例可以继续调整，但确定后必须成为统一模板。
- 同一品质的所有节点使用完全相同的裁切窗口。
- 图片与外框之间允许有一层通用暗色渐变或纹理，避免不同来源图片边缘突兀。

### 4.4 状态标记层

状态标记由界面绘制，不进入内容图片。至少包含：

- 已点亮；
- 线索已解锁但尚未生成；
- 未解锁；
- 当前选中；
- 条件不足；
- 正在生成。

状态不能只依赖颜色，还要同时使用对号、菱形、问号、边框形态或文字。

### 4.5 节点名称层

名称永远由真实文字渲染，不生成到图片里。

- 图片区域负责识别主体。
- 名称放在统一位置，允许后续本地化和无障碍朗读。
- 分子式、说明、数量等详细信息只在选中后的详情区域出现，不挤进普通树形节点。

## 5. 没有内容图时的占位规则

“暂时没有图片”必须是一个正式支持的状态，而不是异常。

显示优先级：

1. 节点专属内容图；
2. 同类别通用内容图；
3. 通用暗纹理 + 1—2 个代表汉字或简短符号；
4. 未解锁时只显示问号。

文字占位要求：

- 继续使用相同品质外框。
- 内容窗口内使用低密度星尘、晶体纹理或柔和渐变。
- 中央放 1—2 个高辨识度汉字，例如“水”“风”“AI”“城”。
- 节点完整名称仍放在框外统一标签中。
- 文字占位也必须支持当前、来路和去向三种关系辉光。
- 后续补充真实图片时，只替换内容层，不改变节点位置、外框、连接关系和名称。

## 6. 面向上千节点的资产策略

- 外框资产保持为有限集合，所有节点复用。
- 内容图是可选字段，不能成为创建节点的前置条件。
- 新节点可以先以文字占位立即进入图谱，图片后补。
- 内容图按需加载，不要求首次进入时加载全部节点图片。
- 同类节点可以共享类别图，直到专属图片准备完成。
- 图片资产与节点事实数据分离，业务数据只记录可选图片引用。
- 不为每个节点重复生成选中、锁定、成功、不同品质等多套内容图。
- 后续批量生成时，只生成“无外框的节点内容图片”，再由统一 UI 框装配。
- 每批生成都复用同一提示词骨架、色彩、材质和主体安全区，避免画风漂移。

## 7. 后续内容图的提示词骨架

后续单个节点内容图应保持当前图集的品质，但明确去掉外框：

~~~text
Use case: stylized-concept
Asset type: standalone content artwork for a children's science-building rune-tree node
Primary request: [节点主体]
Style/medium: premium hand-painted fantasy-science game UI artwork; jewel-like clarity; readable at small size; same visual world as the confirmed rune icon atlas
Composition/framing: one centered subject with a strong clean silhouette; generous safe padding; keep all important details inside the central safe area; suitable for cropping into a circular or upper-half node window
Lighting/mood: magical, inviting, high clarity, restrained glow
Color palette: deep navy, cyan, violet, magenta and warm gold, with subject-specific accents
Materials/textures: enamel-like polish, translucent crystal light, subtle stardust and fine material detail
Constraints: content artwork only; no decorative outer frame; no border; no text; no letters; no numbers; no label; no logo; no watermark; no UI state; no selection glow
~~~

如果内容图使用普通矩形背景，背景应保持低细节、主体居中，并允许 UI 使用统一遮罩裁切。

## 8. 后续纯外框的提示词骨架

下一步生成外框时，应使用独立提示词，不再同时生成节点主体：

~~~text
Use case: stylized-concept
Asset type: reusable game UI rune frame
Primary request: one exquisite circular fantasy-science rune frame with an empty central content window
Style/medium: premium hand-painted game UI asset; polished enamel, translucent crystal accents, stardust and fine metal filigree
Composition/framing: exact front view; perfectly centered; square canvas; symmetrical outer silhouette; identical clear inner window geometry; generous padding around the frame
Lighting/mood: refined magical glow, inviting and high clarity
Color palette: deep navy metal with restrained cyan, violet and warm gold accents
Constraints: frame only; no subject inside; no icon; no text; no letters; no numbers; no label; no logo; no watermark; no button background; no baked selection state; the entire central window must be empty and suitable for transparency removal
~~~

计划交付的外框资产至少应包含：

- 基础框；
- 稀有框；
- 史诗框；
- 传说框；
- 与外框匹配的内容窗口尺寸说明或遮罩；
- 一个无图片文字占位样例；
- 一个矩形图片装入窗口的裁切样例。

## 9. 当前原型中的处理结论

第二版原型仍通过 rune-atlas-v2.png 的背景定位直接显示“外框 + 内容”的成品格子。这是为了快速验证画面品质。

后续正式化时：

- 不沿用当前图集作为大规模节点资产方案；
- 保留它作为画质和风格参考；
- 优先生成、抠出并验证纯外框；
- 再改造节点组件，使内容图、文字占位和外框能够独立组合；
- 在上述结构稳定后，才开始批量补充节点内容图。
