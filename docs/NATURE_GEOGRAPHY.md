# 自然地图正式功能

## 国家图资料卡与城市（2026-09-29）

- 国家图以国家/地区边界为选择对象，右侧优先展示本机旗帜、人口、面积、首都/政府驻地，以及地理、人文风情和经济生活三段短介绍。人口与面积各自标年；来源、统计范围与详细链接收在可展开区域。选中后侧栏回到顶部，不再弹出重复的地图详情浮层。
- `content/nature/maps/country-atlas.v1.json` 为 258 个地图要素提供版本化资料，包含 869 个精选城市点。资料按 Natural Earth 5.1.2 原始索引及归一化名称双重匹配；索引/名称不匹配则不附加资料。前端验证版本、标量、坐标、重复城市与来源链接，异常保留地图和原地区列表。
- 世界银行 WDI 采用 2023—2024 窗口内最新非空值，记录每个指标的实际年份；人口以 SP.POP.TOTL 为主，缺失时回退 Natural Earth 的 POP_EST/POP_YEAR。面积以 AG.SRF.TOTL.K2（含陆地、内陆水域及部分沿海水道）为主，其余采用 mledoze/countries 面积并标记未提供年份。中国陆地面积约 960 万平方千米另据中国政府网，人口单独提示不含港澳台的统计口径。缺失不填零；不将宗主国全国数字填入单独岛屿。
- 经济优先显示精选产业介绍，否则使用服务业增加值占 GDP 比重（NV.SRV.TOTL.ZS）；缺失时可显示人均 GDP（NY.GDP.PCAP.CD），明确不等于个人收入，再缺失则仅显示货币或资料暂缺。语言/货币取 mledoze/countries 固定提交并由 CLDR 47 转换为中文。人文使用 UNESCO 世界遗产名称；`country-notes.v1.json` 另提供 11 个国家的节庆、饮食或艺术短文，并保留逐条出处。不把地方传统泛化成每个居民的习惯。
- 首都和主要城市为独立叠加层，仅国家图可见，不进入语种/矿藏点聚合。★ 与首都文字、● 与城市文字共同区分；全球远景控制密度，选中国家后优先显示其首都，放大后逐步显示主要城市。城市列表可键盘选择、直接定位；点城市保持所属国家资料，且单独高亮该城市。
- 城市数据取 Natural Earth 5.1.2。ADM0CAP 用于筛选首都，CAPALT 不能直接视为现首都（例如京都）；荷兰海牙、玻利维亚拉巴斯标政府驻地，瑞士伯尔尼标联邦政府驻地，南非区分三类首都。斯里兰卡首都据该国外交部校正，位置来自 GeoNames 1238992；亚伦不标成瑙鲁正式首都。中国台湾、香港、澳门保持中国区域语义和中国国旗，台北等不标国家首都，既有中国联动选择保留。
- 国旗使用 flag-icons 7.5.0 的 MIT SVG 内容，合并为本机 `flags.v1.svg` 外部 symbol，内部 clip/mask ID 均加前缀；无网络字体、国旗 CDN 或运行时外网请求。所有内容均为公开静态资料，不读写家庭记录、不变更存储 schema。

重建：分别运行 `python3 scripts/generate-country-atlas.py --profiles`、`--flags`、`--licenses`。生成器需要 Python 3 与 ICU uconv（仅构建时）；原始下载均记录 SHA-256。失败不覆盖旧输出，数据更新须审阅。mledoze 固定提交 c8015eebdd94c533358406b0d709f441389e1f2e，Natural Earth 固定 5.1.2，CLDR 固定 47，WDI/UNESCO 为本次下载快照，非实时数字。国家 atlas 是 ODbL-1.0 派生数据库；各上游许可见 `country-atlas-LICENSE.txt`，不得以代码许可替换数据许可。UNESCO 仅使用名称、类别和标识等事实，不复制图片与长篇描述。

验证覆盖：数据 schema 与边界、城市 ID 唯一、本机旗帜完整/内部 ID 不冲突、错版地图隔离、首都/政府驻地纠错、搜索、缩放密度、国家/城市关联、中国联动、未知统计与无资料地区。浏览器核对国家详情、国旗、城市点击/定位和跨主题清理；个人数据不受影响。


状态：2026-09-29 已接入。入口为自然分类下的「世界」「中国」「足迹」。先前研究记录保留在 [NATURE_MAPS.md](NATURE_MAPS.md)，本文件是运行时行为与存储合同。

## 功能

- 世界：八个可切换图层、拖动/滚轮/双指与键盘缩放、文字搜索、地区列表、点击查看与放大。地理边界用 MapLibre GL JS 6.11.2 在本机 Web Worker 内切片绘制；无远程瓦片、字体、地图 Key 或运行时联网要求。
- 中国：全国 → 省 → 市 → 区县，列表与地图双入口。放大地图中心会进入有下级数据的地区，缩小返回上级；面包屑可返回。勾选点亮只记录指定 adcode，不自动点亮下属地区。
- 足迹：地图选点或选中心，填写名称、日期、文字与最多四张照片；每张不超过 8 MiB，仅 JPG/PNG/WebP。远景聚合位置点，缩放级别 8 起显示照片，点击打开原生模态相册；列表可直接定位、查看。支持编辑文字和日期，删除必须再次确认。完全重合的多个足迹仍可分别从记录列表打开。
- 控件至少 48px、文字至少 18px；键盘列表与焦点可用。无新增声音/奖励；减弱动效关闭镜头过渡。缺少 WebGL2 时显示重试提示并保留文字列表。
- 三张卡片由 ImageGen 在同一图集中生成：彩色平面世界地图、中国轮廓、底图上的定位标签与照片。保留原图集，按实际分隔线切分后等比例适配为 2:1 卡片与 WebP；插画仅作入口装饰，不作为地理数据。提示词、切分坐标与工具记录见 [artwork.v3.json](../content/nature/maps/artwork.v3.json)。

## 地图交互与名称校正

- 紫色聚合圆显示真实地点数；点击立即在地图上打开详情，最多列出该组前 30 个地点，可逐个选择或主动放大展开。重合点仍可由列表选择，失败显示重试提示，不静默忽略。黄色单点显示名称、矿点资料或海拔，选中增加描边；无名称点有“未命名高程点”等回退标签。
- 聚合数量与地名沿用 MapLibre Marker 实时定位，禁止 CSS 对定位 transform 做补间；采用亚像素定位。地图停止移动/数据就绪后再更新避让与聚合标签，不在拖动中重建整个列表。
- 海洋图使用按 Natural Earth 陆地轮廓裁出的透明地形图，海水和内陆孔洞保持透明，透出原来的海域配色。`terrainlandv1` 在本机内存生成与缓存，不写个人数据或重新下载；原 `terrain` 海拔图保持不变。海域边线、选择描边与名称继续保留。
- `content/nature/maps/labels.zh-CN.v1.json` 是版本化显示名称校正表：中文自然地名统一为简体，“裏海”显示“里海”；台湾、香港、澳门显示“中国台湾 / 中国香港 / 中国澳门”，国家图与中国大陆同色。选择“中华人民共和国”时，三地与大陆同时显示选中描边，地图标签和地区列表同步显示勾号；改选其他地区即解除该组高亮，单独选择三地仍保留各自详情。前端对已缓存的旧包也应用校正，下载脚本对新包应用同一张表。原始边界、ID、点亮记录与个人数据不改动，语种/矿点原文专名保留。

## 主要语言概览

- 「语种分布」改为十八种精选语言的国家/地区设色图；用户进入时只读取现有 `countries` 面数据，不请求旧 Glottolog 点云。保留中文、日语、韩语/朝鲜语、英语、法语、俄语、葡萄牙语、西班牙语、阿拉伯语，以及德语、意大利语、印地语、孟加拉语、乌尔都语、印度尼西亚语、土耳其语、波斯语、斯瓦希里语。
- `core-languages.v1.json` 固定使用 Unicode CLDR 47 和 Natural Earth 5.1.2。每个地区最多两种：底色表示第一种，斜纹表示第二种；它们覆盖同一几何，不虚构境内语言边界，也不代表人口比例。灰色表示精选集合外的主要语言，不能解释为无语言。
- 规则：优先该版本的全国官方/事实通用语言且使用比例至少 5%，地区官方语言至少 20%；没有全国语言记录时才考虑至少 50% 的候选。筛到十八个组后按数据中的使用比例最多取两种。中文相关汉语变体合并；书写系统变体去重，比例取最大值而不相加。该规则是教学取舍，不是官方排名或精细民族语言地图，CLDR 数值年份各异且含第二语言使用者。
- 258 个边界条目中 191 个有精选语言。用稳定 ID 加中文名称双重匹配，版本不匹配退为灰色；点击与搜索显示所选语言。原国家几何、选择联动和个人记录不变。
- 数据与许可：[Unicode CLDR 47](https://github.com/unicode-org/cldr-json/blob/47.0.0/cldr-json/cldr-core/supplemental/territoryInfo.json)，[Unicode-3.0 许可](../content/nature/maps/unicode-license.txt)；重建脚本 `scripts/generate-core-language-map.py` 记录固定 URL 和源 SHA-256。例如加拿大英法两语，与[加拿大政府说明](https://www.canada.ca/en/immigration-refugees-citizenship/services/settle-canada/language-skills.html)一致；新加坡仅选英中两语是显示限制，不能解释为只有两种官方语言。

## 已安装数据与精度

| 数据 | 本次安装 | 表达 |
| --- | --- | --- |
| 中国 GeoAtlas | 363 份分级图，3,237 个行政区 ID，34 个省级条目 | GCJ-02；源未给统一区划年份。包含离岸补充几何；只有真实有数据的节点开放下钻。不保证所有地区都有区县层级，不是测绘、街道或建筑底图。 |
| Natural Earth 5.1.2 | 258 个国家/地区、7 个大陆范围、306 个海域、297 个山脉/高原范围、711 个高程点 | 1:1000 万（10m 指比例尺，不是 10 米），WGS84，边界口径沿用原数据。 |
| 地形 | Natural Earth 50m cross-blended hypsometric relief | 地形晕渲栅格转为 4096² Mercator 图，上叠真实高程点；底色混合气候信息，不能查询任意地点海拔或称为 30 米 DEM。 |
| 气候 | Beck 等 2018，1980–2016 present 0.5° 网格 | 横向同类格合并成面，保留 28 个实际出现的 Köppen 类别；按五类主气候设色。不是即时天气或精细局地气候。 |
| 语种 | CLDR 47 精选 18 组，191 个国家/地区条目设色 | 国家级概览，每地最多 2 组；旧离线包的 Glottolog 点数据保留但不再用于界面。 |
| 矿点 | USGS MRDS A/B 资料等级，25,167 点 | 历史记录子集，非全国/全球穷尽清单；不代表当前储量、矿石品位或仍在开采。 |

地图在高缩放下保持边缘清晰，但不能凭渲染增加原始数据没有的细节。Mercator 在极区截断至约 ±85°；大洲范围是 Natural Earth 的概览地理多边形（澳大利亚大陆范围以源名称显示），不是按国家合并的精密七洲边界。未来增加道路或真实高程瓦片，应另外准备对应精度/许可的本机数据包。

来源及许可：
- [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/)：Public Domain。底色来自 [50m hypsometric relief](https://www.naturalearthdata.com/downloads/50m-raster-data/50m-cross-blend-hypso/)。
- [阿里云 DataV GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector)；[官方坐标说明](https://help.aliyun.com/en/datav/datav-7-0/user-guide/map-data-format-1)明确为 GCJ-02。数据缓存仅保存在本机仓库外，不随代码重新分发；不据下载成功宣称具备独立再分发许可。
- [Glottolog 5.3](https://glottolog.org/meta/downloads)，CC BY 4.0，固定版本的 CSV 地址保存在安装脚本中。
- [Beck 等数据](https://doi.org/10.6084/m9.figshare.6396959)，CC BY 4.0；[论文](https://www.nature.com/articles/sdata2018214)。仅用了 present 0p5 栅格，未混入 future 情景。
- [USGS MRDS](https://energy.usgs.gov/arcgis/rest/services/Hosted/Mineral_Resource_Data_System/FeatureServer/0)，使用 grade A/B 的历史点；保留原矿种代码和开发状态。
- [MapLibre v6 安装说明](https://maplibre.org/maplibre-gl-js/docs/)：Vite 使用 worker&url 构建独立 Worker，所有产物本机提供。标签由浏览器绘制，避免在线字体依赖。

## 安装与可重建性

本机已安装两份离线包，共约 19.5 MB gzip。代码首次拉取到另一台机器时需准备公开地图数据：

```sh
python3 scripts/install-nature-maps.py
# 或分别安装
python3 scripts/install-nature-maps.py --only china
python3 scripts/install-nature-maps.py --only world
```

安装环境需要 Python 3、Pillow、numpy，仅下载时联网。安装器默认写到仓库同级 data，可读取 APP_DATA_DIR；拒绝仓库内目录。先在内存获取和转换，最后临时文件原子替换。中国下载并发 8、失败重试，缺失的下级记入 missing；没有有效全国图则不发布。世界下载/转换失败不发布半成品。运行时严格校验包 schema/坐标，失败有重试且不修改个人记录；更换已加载地图包后需重启服务。安装器不要并发运行两个相同 scope 的实例。

[本次安装清单](../content/nature/maps/runtime.v1.json)保存两个 gzip 的 SHA-256、尺寸、来源 URL、原始响应哈希、每层数量和时间。本清单是本次快照；DataV/USGS 为动态接口，未来重装可能产生新快照，需重新审阅更新清单。旧 research 样本没有用于运行时。

## API 与数据合同

所有 API 在 /api/nature 下；输入与持久化文件通过 Zod 校验，所有文件路径只来自固定目录与验证过的 UUID/adcode。

- GET /maps/world 或 /maps/china：数据包说明；GET /maps/:scope/:layer：该层 GeoJSON。world/terrain 返回本机晕渲图片。
- GET /state：读取记录，缺失返回空值且不写文件。PUT /lights/:adcode 仅接受布尔 lit，验证行政区确实存在；重复设置不增加 revision。
- POST /footprints：UUID、title（1–60 字）、date（真实日历日期）、note（最多 2,000 字）、longitude/latitude、photos（最多四张 base64）。固定 GCJ-02 坐标，不自动读取 GPS/EXIF。
- PATCH /footprints/:id：只更新标题、日期、文字，保留照片和坐标。DELETE /footprints/:id：元数据提交成功后删除图片文件。
- GET /photos/:uuid/full 或 /thumb：只服务已登记照片，私有 no-store 缓存头；不公开静态文件夹。不存在的 ID 返回 404。

个人数据位置：
- learning/nature/geography.json：schemaVersion=1，稳定 ID=nature-geography，createdAt/updatedAt/revision、lights、footprints。每条足迹有 UUID、创建/更新时间、GCJ-02、所用地图快照时间和照片元数据。
- media/nature-footprints/&lt;UUID&gt;.webp 与 &lt;UUID&gt;.thumb.webp：Sharp 解码检查最多 4,000 万像素，拒绝动画，自动旋转后缩至最长 2,400px、转 WebP；缩略图 240×180。重新编码去除 EXIF/GPS，不保存原始上传。
- cache/nature-maps/china.json.gz 与 world.json.gz：公开数据缓存，不含个人内容。

同一服务进程使用单写入队列；元数据和图片采用临时文件 + rename、0600 文件权限、0700 新目录。照片全部准备好才发布记录，失败删除本次未发布图片；崩溃发生于图片写入与元数据提交之间时可能留下未引用图片，不会发布不完整足迹。UUID 重试不重复添加旅行。单台数据目录只运行一个服务写入实例。

第一阶段只有入口，无旧版个人存档，所以不存在 v0 迁移；v1 可原样重启读取，损坏或未知版本返回错误且禁止覆盖。未来格式变更必须增加显式迁移与恢复点。此功能没有更改默认数据根目录、通用备份格式或既有记录。备份时必须同时包含 geography.json 和整个 media/nature-footprints；建议暂停服务后复制，避免跨文件快照不一致。公开 cache 可重建，也可随本机备份保留，但不能替代个人数据备份。

## 验证

- 新增 11 项测试：空数据、合法地图、非法请求、并发点亮/幂等、v1 重启、损坏/未来版本保护、图片解码/旋转/去元数据/缩略图、失败回滚、写入失败、边界/大陆主体标签定位/搜索/缩放阈值。全部使用临时目录和合成图片。
- 服务端 139 项全部通过；前端 503 项中 497 通过，既有俄罗斯方块 6 项失败（input/logic，与本模块无关）。
- 前后端类型检查通过；Vite 生产打包（内存输出）通过。
- 独立临时数据环境实测省市区县下钻、点亮、照片选择与保存、放大照片与打开相册、世界八图层。390px 手机宽度无横向溢出，操作按钮均达到 48px。浏览器交互验证不写入真实家庭记录。
