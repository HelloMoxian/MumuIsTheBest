# 自然地图：数据调研与接入方案

> 第二阶段已正式接入真实地图、点亮与照片。当前运行时合同、安装方法与限制见 [NATURE_GEOGRAPHY.md](NATURE_GEOGRAPHY.md)。以下内容保留为第一阶段调研记录，其中“尚未接入/下一阶段”属于当时状态；当前数据以正式合同和 runtime.v1.json 为准。

调研日期：2026-09-29。范围：先完成自然分类下的「世界」「中国」「足迹」入口与图标，再验证数据获取和明确后续实现路线。

## 当前交付与边界

- 已接入三个独立路由：`/nature/world`、`/nature/china`、`/nature/footprints`，可互相切换并返回自然分类。
- 使用本机 SVG 图标；当前页面明确为「正在准备」。世界列出海拔、国家、大洲、海洋、气候、语种、山脉、矿藏八个计划图层（将“大州”规范为“大洲”）。
- 可复用的真实地图研究数据放在 `content/nature/maps/research/`，出处与哈希见相邻清单，校验命令为 `node scripts/validate-nature-map-sources.mjs`。这些数据不打入前端首屏，也没有被包装成已完成的游戏。
- 本阶段不实现地图缩放、行政区点亮、足迹上传或个人数据存储；没有更改数据目录、备份规则、运行时依赖或部署站点。

## 结论：可以获取，但不要做成一张无限放大的 SVG

矢量表示让边缘在任意显示倍率保持清晰；原始几何顶点、测绘比例尺和年份决定实际细节。给低精度轮廓增加平滑曲线不能补出真实海岸线或县界。Natural Earth 的 **10m 是 1:10,000,000 比例尺，绝不是 10 米精度**。

推荐后续采用 **MapLibre GL JS + 本机 PMTiles 矢量瓦片 + 按需加载的主题图层**。原始数据保留为 GeoJSON/GeoPackage；少量点用 GeoJSON，大量边界在构建时切成矢量瓦片。PMTiles 是可按 HTTP Range 读取的单文件档案，适合现有 Fastify 本机服务，不需要数据库或新地图服务器。地图样式、中文字体、精灵图及瓦片全部本地化，不能把示例里的远程瓦片地址直接带进运行时。[MapLibre 官方集成](https://maplibre.org/maplibre-gl-js/docs/examples/pmtiles-source-and-protocol/)、[PMTiles 官方说明](https://docs.protomaps.com/pmtiles/)。

海拔阴影和连续气候区域适合保留栅格瓦片，上面叠加矢量边界、等高线与文字。不要为了“纯矢量”把数百万栅格像元全部变成小多边形。SVG/Canvas + 分省 TopoJSON 是规模较小时的备选；全国细节、照片聚合和多图层长期维护更适合统一地图引擎。

## 世界八图层

| 图层 | 首选数据与获取方式 | 表达与限制 |
| --- | --- | --- |
| 海拔图 | [Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) 的 GLO-30/GLO-90；全球概览可用 [GEBCO](https://www.gebco.net/data-products/gridded-bathymetry-data) | 数字高程/表面模型转成本机分层设色与地形阴影；Copernicus 是 DSM，包含植被、建筑影响，不能称为裸地高程。大范围先低分辨率，局部再取 30/90m 数据；逐项保留许可。 |
| 国家图 | [Natural Earth 10m Cultural](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/) 的国家面、边界线、争议区域 | Public Domain；适合世界和国家概览，不用于街道。应明确展示口径；数据默认 de facto，提供 POV/worldview 字段，不能默认视为中国标准地图。 |
| 大洲图 | Natural Earth 陆地与地理区域数据，按教育用七大洲分类整理 | 不可只按国家属性合并：跨洲国家需要地理划分，岛屿与南极洲单独核对。固定一份可审阅分类表。 |
| 海洋图 | [Natural Earth Physical Labels](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-physical-labels/) 海洋区域/名称；GEBCO 补水深 | 五大洋与海域名称是教学分类，不能把海域面当领海或海上国界；自然区域轮廓属于概括表达。 |
| 气候图 | [Köppen–Geiger 作者数据与论文](https://www.nature.com/articles/sdata2018214)，由论文链接下载 GeoTIFF | 论文提供约 1km、10km、50km 网格；入库固定数据版本、许可与时间段。气候长期分类不等于当天的天气；先合并为少量儿童可理解大类，保留原始类别。 |
| 语种分布 | [Glottolog 下载](https://glottolog.org/meta/downloads)：语言/方言地理位置 CSV | CC BY 4.0；坐标是语言位置点，不是完整使用范围或人口占比。第一版用点和聚合簇；不能擅自插值成语言疆界，也不能把一国涂成只说一种语言。 |
| 山脉图 | Natural Earth 地理区域、山峰与高程点，结合 DEM 阴影 | 山脉范围通常是概略区域，不能标为精密边界；先整理中文山脉名、代表峰与解释。 |
| 矿藏图 | [USGS MRDS 数据服务](https://energy.usgs.gov/arcgis/rest/services/Hosted/Mineral_Resource_Data_System/FeatureServer/0) | 矿点/矿床点按矿种分组，适合本机抽取和聚合。全球覆盖不均，美国最全；历史记录不能表示现存储量、矿山仍开采或精确矿体范围。 |

Natural Earth 的公共领域条款允许修改与再分发；工程仍保留来源。[许可](https://www.naturalearthdata.com/about/terms-of-use/)。Copernicus 的取数渠道与模型含义见 [OpenTopography 官方说明](https://opentopography.org/news/updated-copernicus-30m-DEM-available)。上述主题源已经调研，除清单所列样本外尚未批量下载。

## 中国：四条可行路径与实测

### 1. DataV.GeoAtlas：最直接的省 → 市 → 区县结构候选

官方说明提供地理边界提取入口与 GeoJSON 接口，接口含中文名称、adcode、父级和子级数量。[阿里云文档](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/choropleth-layers-of-v4-x-for-datav-7)。

本机实测成功（字节为未压缩响应大小）：

| 请求 | 字节 | 要素数 | 检查结果 |
| --- | ---: | ---: | --- |
| [全国](https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json) | 582,522 | 35 | 34 个省级条目，以及 adcode 为 `100000_JD` 的无名附加线要素；不能算成第 35 个省或丢弃所有非面要素。 |
| [浙江省](https://geo.datav.aliyun.com/areas_v3/bound/330000_full.json) | 120,401 | 11 | 市级条目，带父子关系。 |
| [杭州市](https://geo.datav.aliyun.com/areas_v3/bound/330100_full.json) | 108,019 | 13 | 包含钱塘区、临平区等区县条目。 |

可据子级 adcode 逐层取得几何；不应把“市辖区”虚拟汇总节点当成真实面。GeoJSON 格式本身也不证明坐标就是 WGS84，接入前须核实提供方坐标说明并以控制点检查，不能与 GPS 足迹直接拼接。

**可访问不等于允许把全部数据再分发到仓库。** 当前查到的使用文档没有给出足够明确的独立数据再分发许可，因此本阶段只做读取验证、记录结果，不将 DataV 全量边界打包交付。若后续取得适用的离线分发授权，它是建立完整中文层级目录的优先候选。未对全国每个区县逐一验证，不能宣称已经获得当前全国完整精确县界。

### 2. geoBoundaries：有可再利用数据，适合验证，当前中国条目偏旧

[官方 API](https://www.geoboundaries.org/api.html) 可返回固定版本下载链接与每份数据许可。不要只凭 `gbOpen` 集合名称推断每一份源数据都只有同一许可，应保存条目本身的许可与来源。

| 元数据接口 | 标记年份 | 元数据数量 | 注意 |
| --- | --- | ---: | --- |
| [CHN ADM1](https://www.geoboundaries.org/api/current/gbOpen/CHN/ADM1/) | 2019 | 34 | 来源许可 Public Domain；本地下载实测 34 个面，270,578 字节，适合省级概览验证。 |
| [CHN ADM2](https://www.geoboundaries.org/api/current/gbOpen/CHN/ADM2/) | 2017 | 2,391 | 名称是 **County Level**，不是可以直接当成地级市的中间层。PDDL；本阶段只核验元数据。 |
| [CHN ADM3](https://www.geoboundaries.org/api/current/gbOpen/CHN/ADM3/) | 2017 | 2,867 | OSM / Lee Beryman 来源，ODbL-1.0。实际固定提交下载是 **2,864** 个要素、88,780,624 字节；与 API 数量不一致，不能把元数据计数当作文件校验结论。 |

固定版本使用 `9469f09`。GitHub raw 地址可能仅返回 Git LFS 指针；真正数据通过清单内的 `media.githubusercontent.com/media/...` 地址获取，必须验证解析成功，不能把指针文件当 GeoJSON。

本工程保留完整省级概览和杭州附近县级几何样本；县级样本按包围盒中心筛选，不代表杭州市完整行政范围。它证明细边界可以获取，不代表时效性和全国层级已经满足。旧数据缺少统一的当前中文行政代码和完整父子关系，不推荐直接用于正式点亮进度。

### 3. OpenStreetMap / Geofabrik：可离线维护的细节主候选

[Geofabrik 中国下载](https://download.geofabrik.de/asia/china.html) 提供国家和分省 OSM PBF。针对道路、湖泊、海岸线、行政 relation 进行离线提取，适合后续足迹的大倍率底图；中国全量包属于 GB 级，应先做单省样本，不能把全量 PBF 打进网页。

[OSM 许可](https://www.openstreetmap.org/copyright) 为 ODbL，要求署名，分发改编数据库需遵守相同许可。工程应把公开底图与私人旅行记录分开；不把 OSM 在线公共瓦片当作可随意批量下载的素材服务。当前关系的完整性、admin_level、中文名称、岛屿、几何洞与行政代码都需要专项检查；OSM 也不自动保证全国县级完整、实时且边界一致。

### 4. 官方地图服务与 GADM：各有适用边界

天地图可作为官方展示与细节核对候选，但在线服务、鉴权、离线使用及再分发条件需要分别核实；本次官方服务文档未能稳定取得，不据此承诺存在可免费离线打包的完整全国矢量包。不要把标准地图图片、在线瓦片服务、可再分发原始矢量数据混为一谈。

GADM 虽可获取行政边界，但其 [许可](https://gadm.org/license.html) 不允许未经许可再分发或商业使用；不作为本仓库默认随代码分发的底图。

**中国正式采用建议：**先以单省完成 OSM 细节 + 独立行政代码目录的审阅试点；同时确认 DataV 或官方/授权供应商的省市县边界离线分发条件。世界概览可先落地；中国完整三级底图须通过完整性、时效、中文层级和坐标核对再切换为正式内容。不能通过平滑旧轮廓掩盖数据缺项。

## 在现有工程中的实现约定（下一阶段）

1. **共用地图工作台。** 世界、中国、足迹共享镜头、缩放、边界命中和图层开关；中国与足迹复用同一版本的行政区数据。动态加载 MapLibre，只在进入地图时加载。
2. **分级加载。** 起步可采用 z0–4 世界、z5–7 省、z8–10 市、z11+ 区县与足迹；这是待性能测试的显示策略，不是数据精度声明。矢量瓦片保留稳定 feature ID，点亮使用 feature-state；不要把整国高精度 GeoJSON塞进首屏。
3. **统一坐标与投影。** 公开数据及用户点统一保存 WGS84 经度、纬度；显示投影由引擎处理。GCJ-02/BD-09 源须先确认并单独转换，记录转换 provenance。世界全貌考虑含极区的投影/球面；Web Mercator 不能完整呈现南北极。
4. **行政层级目录。** 内容包使用稳定 `id + parentId + level + nameZh + sourceId + boundaryVersion + sourceDate`；直辖市、自治州、省直管县与港澳台单独测试。行政代码和几何 ID 不混用。更新边界版本时显式迁移点亮进度，不按名称猜测。
5. **点亮数据。** 由服务端校验区域 ID 并持久化，包含 schemaVersion、稳定 ID、创建/更新时间；单文件写队列与原子替换。父级点亮是否包含子级须在界面写清，默认独立勾选。
6. **足迹与照片。** 建议后续使用仓库外 `APP_DATA_DIR/nature/footprints/`，本次尚未创建目录或写入数据。点包含稳定 ID、经纬度、日期、文字与照片 ID；API 校验坐标、文字长度、文件格式、解码后的像素/大小，缩略图与原图分开。照片只由同源后端按 ID 提供，不放 public、不进 Git、不自动上传云端；EXIF 定位不得自动变成足迹点。
7. **缩放展示照片。** 远景聚合点和数量，近景显示有限数量的缩略图，点击打开相册；只取视口内点，缩略图懒加载，放大阈值按设备和密度调节。同一位置多照片打开列表，不全量创建 DOM 图片。
8. **交互与验证。** 加减/适合范围按钮、键盘平移、触控双指、可搜索中文行政列表；图形与文字共同表达点亮。验证孔洞、多面、日期线、岛屿、地图加载失败、断网、保存重试、幂等上传和旧版本迁移。PMTiles 服务验证 206/Content-Range，地图页断网仍可读取本机样式、字体、图标与瓦片。

## 可复现与验收

- 清单：`content/nature/maps/sources.v1.json`。
- 研究数据及许可证说明：`content/nature/maps/README.md`。
- 离线校验：`node scripts/validate-nature-map-sources.mjs`，核对文件哈希、要素数、坐标、闭环与来源标记；这不等于已完成拓扑无缝、行政完整性或精度认证。
- 页面仅请求三个本机 SVG，八图层没有挂载外部 API。研究源不进入 Vite 依赖图，不增加首页下载量。
