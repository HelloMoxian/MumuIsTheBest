# 预制作品集

正式画图入口中的 360 幅儿童涂色模板，分为 24 个主题分类，每类 15 幅。全部作品仅由矩形、椭圆和三角形拼接，统一黑色轮廓、白色填充。每个图形可独立涂色、移动、缩放、旋转、复制和重新组合。

## 资源与浏览

- `catalog.v1.json`：分类、稳定作品编号、标题、搜索主题词和图形数量。
- `category-01.v1.json` 至 `category-24.v1.json`：可直接通过画图文档校验的完整图形数据；页面按需加载。
- `review/category-01.svg` 至 `review/category-24.svg`：每类 15 幅的整页审阅图，对应 PNG 便于查看；不作为运行时素材。
- 已确认的家庭花园、山谷火车和月球营地分别保留为 `pc-091`、`pc-226` 和 `pc-250`。

进入「画图 → 预制作品集」，可按分类或关键词查找，查看大图后开始涂色。模板始终只读；打开时创建新的作品和图形编号。当前画布有修改时先保存保留副本，保存失败不会替换画布。作品与个人预设沿用现有画图存储规则，运行时数据不写入此目录。

## 维护与校验

生成入口为 `scripts/generate-coloring-portfolio.py`，基础构造在 `scripts/coloring/geometry.py`，300 条场景配方在 `scripts/coloring/recipes.py`。生成阶段读取原始 300 主题规划以及已确认的几何示例；正式网页只依赖此目录的 JSON，不依赖临时预览或生成脚本。

生成器支持 `--list` 列举输出、`--write <绝对路径>` 更新单个资源、`--check` 校验数量、基础图形种类、纯黑白样式、边界和场景唯一性。修改时需要同步索引与对应分类文件，并重新审阅预览。

自动校验位于 `apps/web/src/features/drawing-studio/portfolio.test.ts`；浏览器检查为 `scripts/check-coloring-portfolio-ui.mjs`，覆盖筛选、翻页、涂色、撤销、保存失败保护、重试和手机布局，所有接口使用测试数据。

科学、人体和天文作品是适合儿童 DIY 的几何示意，不作为比例准确的专业图谱。


## 世界名画（新增 60 幅）

名画构图在 `scripts/coloring/masterpieces.py` 逐幅维护，包含人物位置、道具、地平线和大块区域的几何表达。它们是可拆拼的儿童简化版，不是精确描摹；原画保留在独立浮窗中，供观察与涂色参考。

四个分类各 15 幅：人物肖像、天空与风景、花园与静物、故事与构成。可在作品集搜索“世界名画”、画名或作者，也可以在主题下拉框中选择对应分类。

原画静态文件放在 `apps/web/public/images/drawing-studio/masterpieces/`。`references.v1.json` 保存逐图来源、许可、尺寸、字节数和 SHA-256。来源记录为 Wikimedia Commons 的公有领域或 CC0 图片；图片仅缩小尺寸并转换为 JPEG，没有改动构图。下载维护工具是 `scripts/fetch-painting-references.py`：`--metadata` 只输出元数据，`--download <绝对图片路径>` 只写入一个已声明文件；更换图片后需同步尺寸与校验和并重新检查许可。

参考窗可拖动标题或用方向键移动，支持 50%—300% 缩放、适合窗口、关闭及重新打开。作品保存、改名、导出 JSON 和重新加载后仍保留原画关联；PNG/SVG 画布导出不包含参考图片。操作验证见 `scripts/check-painting-reference-ui.mjs`。

| 编号 | 画作 | 作者 | 原画来源 |
|---|---|---|---|
| pc-301 | 蒙娜丽莎 | 列奥纳多·达·芬奇 | [来源](<https://commons.wikimedia.org/wiki/File:Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg>) |
| pc-302 | 抱银貂的女子 | 列奥纳多·达·芬奇 | [来源](<https://commons.wikimedia.org/wiki/File:Lady_with_an_Ermine_-_Leonardo_da_Vinci_(adjusted_levels).jpg>) |
| pc-303 | 戴珍珠耳环的少女 | 约翰内斯·维米尔 | [来源](<https://commons.wikimedia.org/wiki/File:1665_Girl_with_a_Pearl_Earring.jpg>) |
| pc-304 | 倒牛奶的女仆 | 约翰内斯·维米尔 | [来源](<https://commons.wikimedia.org/wiki/File:Johannes_Vermeer_-_Het_melkmeisje_-_Google_Art_Project.png>) |
| pc-305 | 天文学家 | 约翰内斯·维米尔 | [来源](<https://commons.wikimedia.org/wiki/File:Johannes_Vermeer_-_The_Astronomer_-_1668.jpg>) |
| pc-306 | 绘画艺术 | 约翰内斯·维米尔 | [来源](<https://commons.wikimedia.org/wiki/File:Jan_Vermeer_-_The_Art_of_Painting_-_Google_Art_Project.jpg>) |
| pc-307 | 阿尔诺芬尼夫妇像 | 扬·凡·艾克 | [来源](<https://commons.wikimedia.org/wiki/File:The_Arnolfini_portrait_(1434).jpg>) |
| pc-308 | 宫娥 | 迭戈·委拉斯开兹 | [来源](<https://commons.wikimedia.org/wiki/File:Las_Meninas,_by_Diego_Vel%C3%A1zquez,_from_Prado_in_Google_Earth.jpg>) |
| pc-309 | 大使们 | 汉斯·霍尔拜因 | [来源](<https://commons.wikimedia.org/wiki/File:Hans_Holbein_the_Younger_-_The_Ambassadors_-_Google_Art_Project.jpg>) |
| pc-310 | 蓝衣少年 | 托马斯·庚斯博罗 | [来源](<https://commons.wikimedia.org/wiki/File:The_Blue_Boy.jpg>) |
| pc-311 | 拿喷壶的小女孩 | 皮埃尔-奥古斯特·雷诺阿 | [来源](<https://commons.wikimedia.org/wiki/File:Auguste_Renoir_-_A_Girl_with_a_Watering_Can_-_Google_Art_Project.jpg>) |
| pc-312 | 画家的母亲 | 詹姆斯·惠斯勒 | [来源](<https://commons.wikimedia.org/wiki/File:Whistlers_Mother_high_res.jpg>) |
| pc-313 | 自画像（1500年） | 阿尔布雷希特·丢勒 | [来源](<https://commons.wikimedia.org/wiki/File:D%C3%BCrer_Alte_Pinakothek.jpg>) |
| pc-314 | 呐喊 | 爱德华·蒙克 | [来源](<https://commons.wikimedia.org/wiki/File:Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg>) |
| pc-315 | 吹笛少年 | 爱德华·马奈 | [来源](<https://commons.wikimedia.org/wiki/File:Manet,_Edouard_-_Young_Flautist,_or_The_Fifer,_1866_(2).jpg>) |
| pc-316 | 星夜 | 文森特·梵高 | [来源](<https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg>) |
| pc-317 | 日出·印象 | 克洛德·莫奈 | [来源](<https://commons.wikimedia.org/wiki/File:Monet_-_Impression,_Sunrise.jpg>) |
| pc-318 | 神奈川冲浪里 | 葛饰北斋 | [来源](<https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg>) |
| pc-319 | 凯风快晴（赤富士） | 葛饰北斋 | [来源](<https://commons.wikimedia.org/wiki/File:%E3%80%8C%E5%AF%8C%E5%B6%BD%E4%B8%89%E5%8D%81%E5%85%AD%E6%99%AF_%E5%87%B1%E9%A2%A8%E5%BF%AB%E6%99%B4%E3%80%8D-South_Wind,_Clear_Sky_(Gaif%C5%AB_kaisei),_also_known_as_Red_Fuji,_from_the_series_Thirty-six_Views_of_Mount_Fuji_(Fugaku_sanj%C5%ABrokkei)_MET_DP141062.jpg>) |
| pc-320 | 罗讷河上的星夜 | 文森特·梵高 | [来源](<https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg>) |
| pc-321 | 夜间的露天咖啡座 | 文森特·梵高 | [来源](<https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Terrace_of_a_Caf%C3%A9_at_Night_(Place_du_Forum)_1888.jpg>) |
| pc-322 | 麦田群鸦 | 文森特·梵高 | [来源](<https://commons.wikimedia.org/wiki/File:Korenveld_met_kraaien_-_s0149V1962_-_Van_Gogh_Museum.jpg>) |
| pc-323 | 鸢尾花 | 文森特·梵高 | [来源](<https://commons.wikimedia.org/wiki/File:Irises-Vincent_van_Gogh.jpg>) |
| pc-324 | 盛开的杏花 | 文森特·梵高 | [来源](<https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_Almond_blossom_-_Google_Art_Project.jpg>) |
| pc-325 | 阿尔勒的卧室 | 文森特·梵高 | [来源](<https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_De_slaapkamer_-_Google_Art_Project.jpg>) |
| pc-326 | 黄房子 | 文森特·梵高 | [来源](<https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_The_yellow_house_(%27The_street%27).jpg>) |
| pc-327 | 阿尔勒吊桥 | 文森特·梵高 | [来源](<https://commons.wikimedia.org/wiki/File:Vincent_Van_Gogh_0014.jpg>) |
| pc-328 | 干草车 | 约翰·康斯特布尔 | [来源](<https://commons.wikimedia.org/wiki/File:John_Constable_-_The_Hay_Wain_(1821).jpg>) |
| pc-329 | 雨、蒸汽和速度 | 约瑟夫·马洛德·威廉·透纳 | [来源](<https://commons.wikimedia.org/wiki/File:Turner_-_Rain,_Steam_and_Speed_-_National_Gallery_file.jpg>) |
| pc-330 | 被拖去解体的战舰无畏号 | 约瑟夫·马洛德·威廉·透纳 | [来源](<https://commons.wikimedia.org/wiki/File:The_Fighting_Temeraire,_JMW_Turner,_National_Gallery.jpg>) |
| pc-331 | 向日葵 | 文森特·梵高 | [来源](<https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_Sunflowers_(1888,_National_Gallery_London).jpg>) |
| pc-332 | 睡莲 | 克洛德·莫奈 | [来源](<https://commons.wikimedia.org/wiki/File:Water_Lilies_MET_DP-1208-001.jpg>) |
| pc-333 | 日本桥与睡莲池 | 克洛德·莫奈 | [来源](<https://commons.wikimedia.org/wiki/File:The_Water-Lily_Pond_1899_Claude_Monet_Metropolitan.jpg>) |
| pc-334 | 罂粟花田 | 克洛德·莫奈 | [来源](<https://commons.wikimedia.org/wiki/File:Claude_Monet_-_Poppy_Field_-_Google_Art_Project.jpg>) |
| pc-335 | 撑阳伞的女人 | 克洛德·莫奈 | [来源](<https://commons.wikimedia.org/wiki/File:Claude_Monet_-_Woman_with_a_Parasol_-_Madame_Monet_and_Her_Son_-_Google_Art_Project.jpg>) |
| pc-336 | 干草堆 | 克洛德·莫奈 | [来源](<https://commons.wikimedia.org/wiki/File:Claude_Monet_-_Stacks_of_Wheat_(End_of_Summer)_-_1985.1103_-_Art_Institute_of_Chicago.jpg>) |
| pc-337 | 鲁昂大教堂 | 克洛德·莫奈 | [来源](<https://commons.wikimedia.org/wiki/File:RouenCathedral_Monet_1894.jpg>) |
| pc-338 | 圣维克多山 | 保罗·塞尚 | [来源](<https://commons.wikimedia.org/wiki/File:Paul_C%C3%A9zanne_-_Montagne_Saint-victoire_-_Google_Art_Project.jpg>) |
| pc-339 | 苹果篮子 | 保罗·塞尚 | [来源](<https://commons.wikimedia.org/wiki/File:Paul_C%C3%A9zanne_-_The_Basket_of_Apples_-_1926.252_-_Art_Institute_of_Chicago.jpg>) |
| pc-340 | 帘子、壶与果盘 | 保罗·塞尚 | [来源](<https://commons.wikimedia.org/wiki/File:Rideau,_Cruchon_et_Compotier,_par_Paul_C%C3%A9zanne,_Yorck_Project.jpg>) |
| pc-341 | 有苹果和橘子的静物 | 保罗·塞尚 | [来源](<https://commons.wikimedia.org/wiki/File:Nature_morte_aux_pommes_et_aux_oranges,_par_Paul_C%C3%A9zanne.jpg>) |
| pc-342 | 金鱼 | 亨利·马蒂斯 | [来源](<https://commons.wikimedia.org/wiki/File:Goldfish_Matisse.jpg>) |
| pc-343 | 金翅雀 | 卡雷尔·法布里蒂乌斯 | [来源](<https://commons.wikimedia.org/wiki/File:Fabritius-vink.jpg>) |
| pc-344 | 野兔 | 阿尔布雷希特·丢勒 | [来源](<https://commons.wikimedia.org/wiki/File:Albrecht_D%C3%BCrer_-_Hare,_1502_-_Google_Art_Project.jpg>) |
| pc-345 | 鳟鱼 | 古斯塔夫·库尔贝 | [来源](<https://commons.wikimedia.org/wiki/File:Gustave_Courbet_-_Truite_-_2383_-_Kunsthaus_Z%C3%BCrich.jpg>) |
| pc-346 | 最后的晚餐 | 列奥纳多·达·芬奇 | [来源](<https://commons.wikimedia.org/wiki/File:The_Last_Supper_-_Leonardo_Da_Vinci_-_High_Resolution_32x16.jpg>) |
| pc-347 | 创造亚当 | 米开朗琪罗 | [来源](<https://commons.wikimedia.org/wiki/File:Michelangelo_-_Creation_of_Adam_(cropped).jpg>) |
| pc-348 | 维纳斯的诞生 | 桑德罗·波提切利 | [来源](<https://commons.wikimedia.org/wiki/File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg>) |
| pc-349 | 春 | 桑德罗·波提切利 | [来源](<https://commons.wikimedia.org/wiki/File:Botticelli-primavera.jpg>) |
| pc-350 | 煎饼磨坊的舞会 | 皮埃尔-奥古斯特·雷诺阿 | [来源](<https://commons.wikimedia.org/wiki/File:Renoir,_Pierre-Auguste_-_Dance_at_Le_Moulin_de_la_Galette,_1876.jpg>) |
| pc-351 | 船上的午宴 | 皮埃尔-奥古斯特·雷诺阿 | [来源](<https://commons.wikimedia.org/wiki/File:Pierre-Auguste_Renoir_-_Luncheon_of_the_Boating_Party_-_Google_Art_Project.jpg>) |
| pc-352 | 大碗岛的星期天下午 | 乔治·修拉 | [来源](<https://commons.wikimedia.org/wiki/File:A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg>) |
| pc-353 | 马戏团 | 乔治·修拉 | [来源](<https://commons.wikimedia.org/wiki/File:Georges_Seurat,_1891,_Le_Cirque_(The_Circus),_oil_on_canvas,_185_x_152_cm,_Mus%C3%A9e_d%27Orsay.jpg>) |
| pc-354 | 拾穗者 | 让-弗朗索瓦·米勒 | [来源](<https://commons.wikimedia.org/wiki/File:Jean-Fran%C3%A7ois_Millet_-_Gleaners_-_Google_Art_Project_2.jpg>) |
| pc-355 | 晚祷 | 让-弗朗索瓦·米勒 | [来源](<https://commons.wikimedia.org/wiki/File:JEAN-FRAN%C3%87OIS_MILLET_-_El_%C3%81ngelus_(Museo_de_Orsay,_1857-1859._%C3%93leo_sobre_lienzo,_55.5_x_66_cm).jpg>) |
| pc-356 | 播种者 | 让-弗朗索瓦·米勒 | [来源](<https://commons.wikimedia.org/wiki/File:Jean-Fran%C3%A7ois_Millet_-_The_Sower_-_Google_Art_Project.jpg>) |
| pc-357 | 热带风暴中的老虎 | 亨利·卢梭 | [来源](<https://commons.wikimedia.org/wiki/File:Surprised-Rousseau.jpg>) |
| pc-358 | 梦 | 亨利·卢梭 | [来源](<https://commons.wikimedia.org/wiki/File:Henri_Rousseau_-_Le_R%C3%AAve_-_Google_Art_Project.jpg>) |
| pc-359 | 红、蓝、黄的构成第二号 | 皮特·蒙德里安 | [来源](<https://commons.wikimedia.org/wiki/File:Piet_Mondriaan,_1930_-_Mondrian_Composition_II_in_Red,_Blue,_and_Yellow.jpg>) |
| pc-360 | 吻 | 古斯塔夫·克里姆特 | [来源](<https://commons.wikimedia.org/wiki/File:The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg>) |
