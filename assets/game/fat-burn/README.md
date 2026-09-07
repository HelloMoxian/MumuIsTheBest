# 妈妈燃脂 · 原创人物 v3（当前）

使用 OpenAI 内置图像生成工具重绘。以普通白领妈妈的自然体态为目标：柔和肩线、匀称四肢、正常胸腰髋，紫色圆领短袖和深蓝休闲运动裤；没有夸张肌肉或紧身健美服。v2 只用于部件顺序与网格参考，不延续其身材比例。

- 最终源图：`assets/game/fat-burn/mom-v3-atlas.png`，1254 × 1254，4 × 4 网格。
- 当前运行素材：`apps/web/public/images/fat-burn/mom-v3/`，16 张透明 PNG 和 `manifest.json`；正、侧面各 8 件，稳定命名与格位顺序延续 v2。
- 提取：`python3 scripts/prepare-fat-burn-mom-art.py --version v3`（默认也是 v3），复用工程内 chroma-atlas-extractor 的绿色自动取色、柔边透明和去色溢；每格内缩 3px、不裁透明边。原图保留不变。
- 颈部只画在 head，torso 是圆领到衣摆，不再叠加脖子或胯部；upper-arm 包含短袖，四肢穿着自然宽松的布料。挂点与遮挡由 `mom-art.ts` 和 `MomCoach.tsx` 管理，不通过缩瘦 v2 纹理冒充新版。
- 所有素材为静态产品内容，不包含用户照片、个人数据或运行时联网依赖。

## v3 实际生成提示（内置工具）

```text
Use case: stylized-concept. Replace this fitness character atlas with a newly drawn, coherent, beautiful ORDINARY OFFICE-WORKING YOUNG MOTHER, age around 30. Reference image is ONLY the 4x4 technical grid and part ordering; completely redesign its unnatural muscular exaggerated body and its clothing. The user dislikes the huge muscles and pin-up proportions. She should have an everyday naturally slim-to-average soft body, gently sloped narrow shoulders, slender smooth arms, ordinary chest size, natural waist, ordinary hips, straight gently tapered legs. Not a bodybuilder, not a fitness influencer, not hourglass pin-up, no visible muscles, no shoulder spheres, no bulging biceps, no sculpted thighs or calves. Healthy and approachable, neither emaciated nor hyperathletic.

ART: polished warm contemporary illustration with soft matte painted shading, clean organic contours and restrained detail, appealing subtly smiling East Asian adult woman, gentle brown eyes, natural understated makeup, medium chestnut ponytail, smaller/neater hair volume. Consistent lighting and SAME WOMAN in all cells. She wears a modest relaxed-fit LAVENDER CREW-NECK SHORT-SLEEVE T-SHIRT with opaque soft fabric, normal straight fit with ease at the waist, covering the waist and top of hips; DARK NAVY tapered leisure joggers (not painted-on leggings, no shiny muscles); small simple white-lilac sneakers. Soft gentle shading, no hard highlights, no dramatic anatomical shadows, no logos/text/jewelry.

PRODUCTION GRID: EXACT 4 columns x 4 rows, sixteen equal cells, 2048x2048 square. Entire background uniform flat solid lime green #00FF00, including margins, no transparency/checkerboard, no shadows on background. Each part completely INSIDE its own cell, centered, minimum 12% margin on every edge, NO crossing cell boundaries, no visible grid lines. Preserve natural widths, no stretching each part to fill width. Straight vertical relaxed limbs oriented proximal at top, distal at bottom. A reusable articulated-paper-puppet parts sheet with full soft-shaded illustrations, not a whole assembled person.

ROW1:
C1 FRONT head with full ponytail and a SHORT SLIM NECK only ending just below collar, NO torso or shoulders. Friendly beautiful everyday face.
C2 FRONT headless ARMLESS T-SHIRT TORSO from crew-neck collar to slightly rounded hem below hips; WITHOUT neck, WITHOUT arms, WITHOUT sleeves sticking out, WITHOUT bare shoulder caps, WITHOUT pants/upper legs. Upper-arm sleeves are separate in C3; here top is clean clothing neckline and shoulder seams. Straight gently fitted torso, no cleavage, no exposed skin, no corset waist.
C3 FRONT one upper arm vertical: lavender short sleeve covering the upper 40%, narrow smooth bare arm from sleeve cuff to elbow. Shoulder join flat rounded INSIDE CLOTH, no exposed ball. Slim normal nonmuscular upper arm.
C4 FRONT one slim smooth forearm elbow top to wrist bottom, NO hand, no pronounced tendons or muscular bulges.

ROW2:
C1 FRONT one delicate relaxed hand, wrist top, five natural fingers softly close together downward, no forearm.
C2 FRONT one upper leg in dark navy relaxed tapered joggers from hip to knee; normal soft fabric contour, no buttocks protrusion, no separate full hip section. Vertical with natural gentle taper.
C3 FRONT one lower leg same joggers knee to ankle, gently tapering mostly straight fabric, NO sculpted calf bulge.
C4 FRONT small simple white-lilac sneaker, ankle opening above, toe toward viewer/down.

ROW3 is EXACT SAME WOMAN and clothes, SIDE PROFILE facing RIGHT:
C1 head with short slim neck, nose RIGHT, neat ponytail LEFT. No shoulders.
C2 headless armless side torso: ONLY relaxed crew-neck T-shirt, no neck, no bare shoulders, no arms, no sleeves sticking out, no pelvis or pants. Normal modest chest and natural relaxed posture, vertical back, no arched spine, no dramatic breasts or butt, hem covers waist and upper hip.
C3 side upper arm with lavender short sleeve upper40%, smooth narrow bare arm down to elbow, no hand, no spherical shoulder.
C4 side forearm narrow smooth, elbow top wrist bottom, no hand.

ROW4 SIDE PROFILE facing RIGHT:
C1 delicate relaxed hand wrist top fingers down.
C2 dark navy jogger upper leg, hip top knee bottom, normal straight gentle taper, no huge buttocks.
C3 dark navy jogger lower leg, knee top ankle bottom, modest straight tapered shape.
C4 small simple white-lilac sneaker pointing RIGHT, sole horizontal.

These are game animation assets. Each neck and shoulder appears in ONLY ONE part: neck belongs to head; upper-arm sleeve owns shoulder; torso owns neither. Clothes have consistent plain color across shared joints. All sixteen parts have clean generous green margins. Avoid exaggerated bosom, buttocks, muscular arms, tight clothes, shiny spandex, doll ball joints, plastic skin, bare midriff, body-part crop accidents. Use ordinary graceful proportions and understated everyday beauty.
```

---

## v3 侧面衣服局部修正

`assets/game/fat-burn/mom-v3-torso-fix-atlas.png` 是内置图像编辑工具的局部修正结果，用于去掉上抬手臂后露出的深色袖孔。提取脚本只采用其中第 3 行第 2 列替换 `side-torso.png`，其余 15 张仍来自 v3 原图。清单对该格单独记录来源和取色值，画布与挂点保持兼容。

第一次编辑提示：

```text
Use case: precise-object-edit. Edit this character-parts atlas with ONE small correction. Keep the exact 4x4 layout, cell positions, part sizes, plain lime green background, face, body proportions, clothing colors, and all other 15 cells absolutely unchanged. Only edit ROW 3 COLUMN 2: the side-profile lavender T-shirt torso. REMOVE the dark oval empty sleeve-hole outline/ring and all its interior shading from the upper-left shoulder/chest area. Replace that oval completely with CONTINUOUS SMOOTH LAVENDER T-SHIRT FABRIC matching the surrounding shirt. This torso piece must be a clean uninterrupted side silhouette with no visible armhole, no inner oval, no circular seam, no shoulder circle, no detached-joint socket. Keep the exact outside contour of the torso, same soft small chest, collar height, hem, cloth color, and all pixels outside the oval region as faithfully as possible. Do not add arms or sleeves or a neck. All other cells unchanged. This is for overlaying a separate sleeve/arm in an animated game: a drawn socket becomes an unwanted second circle when the arm lifts.
```

最终追加编辑提示：

```text
Use case: precise-object-edit. One cell correction only: ROW THREE, COLUMN TWO (the lavender shirt side torso). The previous edit still left a visible circular outline and seam on its shoulder. ERASE THE ENTIRE CIRCLE/OVAL, including every curved outline and both concentric seam lines. Repaint the whole upper-left portion of that shirt interior as plain uninterrupted lavender cotton with a smooth broad lighting gradient, absolutely NO circle, NO oval, NO ring, NO sleeve hole, NO arm socket, NO curved seam. Think of a perfectly PLAIN side panel of a T-shirt waiting for a sleeve to be overlaid later. Retain the current outside silhouette, its exact pixel position and dimensions, neckline, bottom hem, and natural body proportion. Only that shirt cell changes; all other fifteen character cells and the 4x4 green-background grid remain as shown. The green background remains perfectly solid lime green. Do not add any labels or borders.
```


## v2 历史素材与生成记录（不再用于页面）

2026-09-07 使用 OpenAI 内置图像生成工具创作，不引用现成角色或外部照片。人物是成年年轻妈妈的通用插画形象，不来自用户照片。运行时使用本机静态图片，不调用生成服务。

## 产品资产

- 原始最终图集：`assets/game/fat-burn/mom-v2-atlas.png`，1254 × 1254，4 × 4 网格。
- 透明 PNG 与格位清单：`apps/web/public/images/fat-burn/mom-v2/`。
- 每个视角各 8 件：head、torso、upper-arm、forearm、hand、thigh、shin、shoe；上两行正面，下两行右侧面。
- 保留完整格位画布，不逐图裁边；显式关节坐标位于 `apps/web/src/features/fat-burn/mom-art.ts`。
- 正侧面的插画部件分别随同一套三维姿势坐标投影，由 Canvas 2D 合成。头脸保持比例，四肢长度随透视缩短，接缝柔化仅用于绘制；它不是任意角度旋转的三维角色模型。

## 提取与复现

在仓库根目录运行 `python3 scripts/prepare-fat-burn-mom-art.py --version v2`。该脚本复用工程内 chroma-atlas-extractor，保留原图集，稳定 ID，格位内缩 3 像素。最终底色使用洋红色而非初稿绿色，按边缘自动采样，距离阈值 24 / 130，柔边透明与边缘去底色。紫色衣服与洋红底色接近，因此使用 RGB 距离抠图，避免通用洋红优势算法误删紫色衣服。无需增加 Python 或 Pillow 依赖。

清单保留相对原图路径、每格尺寸、来源区域、透明角与警告。最终 16 格均含有效主体、四角透明、无提取警告。

## 生成提示

以下是人物创作的基础提示。迭代只调整制作规格：最终为洋红底色、严格 4 × 4、每格约 14% 留白，以解决初稿跨格和背景不纯的问题；服装、人物、视角和部件顺序保持下述要求。原始图集是最终选择的生成结果，早期废稿不是产品依赖。

```text
Use case: stylized-concept. Create a production-ready 4-column by 4-row character-parts sprite atlas for a beautiful young adult East Asian mom fitness coach, for a premium warm friendly fitness game. This is original polished high-end 3D animation-film character artwork, rendered as separated reusable animation pieces, NOT a whole scene. A mature 28-35 year old woman with a lovely expressive face, graceful naturally healthy athletic build, almond brown eyes, long dark chestnut hair in a high flowing ponytail, warm confident smile, subtle natural makeup. Very appealing, sophisticated, high-quality smooth organic anatomy, studio soft lighting and subtle shading. Wear a fitted sleeveless lavender/periwinkle athletic top with understated pink edge piping, deep indigo/plum high-waisted leggings, clean white trainers with soft lilac accents. No logos, no text.

LAYOUT: 2048x2048 square image, EXACT regular 4x4 grid, sixteen equal 512x512 virtual cells, NO visible borders or grid lines. All background perfectly flat solid #00FF00 vivid green. Each cell contains ONE isolated body part centered and oriented straight vertically, with ample clean green margin. Smooth rounded overlap ends for animation joints, no red or anatomical cut surfaces, just clean separate doll-animation artwork. Body parts from the SAME woman consistent proportions/clothes/color/lighting. Render parts filling 75-85% of cell height, but preserve natural aspect ratios. No duplicated whole bodies or extra shapes. Arms and legs point DOWN straight, proximal joint at top, distal at bottom, NOT bent.

READING ORDER exact:
Row1 Col1: FRONT VIEW full head plus short neck, elegant face looking toward viewer, complete flowing high ponytail visible to viewer's right, beautifully rendered hair strands and friendly attractive smile.
Row1 Col2: FRONT VIEW headless armless torso, sleeveless lavender top from shoulders/neckline to waist, plus the complete hip section of indigo leggings at bottom, extending slightly over upper thighs. Natural fitted shape, no waist gap.
Row1 Col3: FRONT VIEW one bare upper arm from smooth rounded shoulder end to elbow, vertical pointing down, skin softly shaded, no hand.
Row1 Col4: FRONT VIEW one bare forearm from elbow at top to slim wrist at bottom, vertical pointing down, no hand.

Row2 Col1: FRONT VIEW one relaxed hand, wrist at top, slightly curled relaxed five fingers directed down, natural graceful proportions, NO forearm.
Row2 Col2: FRONT VIEW one upper leg wearing deep indigo leggings, hip at top to knee bottom, smooth organic tapered thigh, vertical.
Row2 Col3: FRONT VIEW one lower leg wearing same deep indigo leggings, knee top to narrow ankle bottom, graceful calf, vertical.
Row2 Col4: FRONT VIEW one white-lilac sport shoe, heel/ankle at upper center, toe pointing toward camera/down in image.

Row3 Col1: SIDE PROFILE VIEW of the SAME woman's head plus short neck, face pointing RIGHT, elegant nose and lips, ponytail trailing LEFT, beautiful profile.
Row3 Col2: SIDE PROFILE VIEW torso only face direction RIGHT, headless armless, same top and full indigo hip section; softly natural adult body, vertical, no arms.
Row3 Col3: SIDE PROFILE VIEW bare upper arm, shoulder top to elbow bottom, straight down.
Row3 Col4: SIDE PROFILE VIEW bare forearm, elbow top to wrist bottom, straight down.

Row4 Col1: SIDE PROFILE VIEW relaxed hand, wrist at top, fingers down.
Row4 Col2: SIDE PROFILE VIEW same indigo upper leg, hip top knee bottom, vertical.
Row4 Col3: SIDE PROFILE VIEW same indigo lower leg, knee top ankle bottom, vertical.
Row4 Col4: SIDE PROFILE VIEW white-lilac sport shoe, toe clearly pointing RIGHT, sole horizontal.

Art should have the beauty, detailed face/hair, organic organic curves and premium rendering quality of a finished animated female lead, not a wooden mannequin or cylinders/spheres or a flat icon. Ensure every cell isolated by green. No external cast shadows. No equipment, scenery, text, borders, number labels, jewelry. All 16 requested cells must exist.
```
