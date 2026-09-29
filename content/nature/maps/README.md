# 自然地图研究数据

## 国家图公开资料

`country-atlas.v1.json` 为正式国家资料与精选城市快照，`country-notes.v1.json` 保存简短人文介绍与逐条来源。人口、面积、经济指标保留年份；未知值为 null。国旗在 `apps/web/public/images/nature/geography/flags.v1.svg`，由 MIT 许可的 flag-icons 7.5.0 合并。

用 `scripts/generate-country-atlas.py --profiles / --flags / --licenses` 分别重建；上游版本、下载 URL 和 SHA-256 记录在 atlas 中。数据库按 ODbL-1.0 提供，上游许可及来源见 `country-atlas-LICENSE.txt`；CLDR 许可见 `unicode-license.txt`。这些正式静态资料与下述 research 研究样本用途不同，不涉及家庭记录。


正式功能已接入。`runtime.v1.json` 记录本次离线包的来源和哈希；地图包在仓库外 `data/cache/nature-maps/`，由 `scripts/install-nature-maps.py` 安装。`artwork.v3.json` 保存 ImageGen 三张入口插画的同批图集、提示词与切分坐标；`labels.zh-CN.v1.json` 保存正式显示名称校正。正式合同见 [NATURE_GEOGRAPHY.md](../../../docs/NATURE_GEOGRAPHY.md)。`core-languages.v1.json` 保存 CLDR 47 精选语言与国家/地区映射，附 Unicode 许可；由 `scripts/generate-core-language-map.py` 重建。以下 research 文件继续只作研究，不是运行时地图。

这里只保存公开地理素材，不保存任何家庭地点、照片或点亮记录。当前不作为正式地图运行时内容。

| 文件 | 内容 | 适用范围 |
| --- | --- | --- |
| `research/ne-10m-land.v5.1.2.geojson.gz` | Natural Earth 完整全球陆地面，11 个多面要素 | 1:1000 万概览；解压后约 10.2 MB，不是 10 米精度 |
| `research/chn-adm1.geoboundaries-9469f09.geojson` | geoBoundaries 中国 34 个省级面 | 2019 年标记的概览，边界较粗 |
| `research/hangzhou-area-adm3.sample.geojson` | 杭州附近 9 个区县面，保留原坐标 | 2017 年历史样本；含旧江干区、下城区，不是当前完整杭州行政目录 |

`sources.v1.json` 是来源、固定版本、许可、文件哈希与下载验证的清单。县级样本从完整 88,780,624 字节文件抽取；源文件实际 2,864 要素，与 API 声称 2,867 不同。样本的筛选条件是几何包围盒中心落在 `[119.7, 29.8, 120.5, 30.5]`，不是按市级父节点筛选。字段保留在 `researchProvenance` 中，不能据此声称覆盖整座城市。

## 许可与署名

- 世界陆地：Made with Natural Earth。[Public Domain 条款](https://www.naturalearthdata.com/about/terms-of-use/)。gzip 仅作无损压缩，几何未改动。
- 省级：中国 ADM1 条目由 geoBoundaries / Wikimedia Commons 提供，接口声明 Public Domain；见清单中的固定源与[条目元数据](https://www.geoboundaries.org/api/current/gbOpen/CHN/ADM1/)。
- 县级样本：© OpenStreetMap contributors; Lee Beryman; geoBoundaries。该样本数据库按 [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 提供；[OSM 署名与许可说明](https://www.openstreetmap.org/copyright)。这里只作空间子集抽取，不改变几何。保留这份说明和清单一起再分发；其许可不被仓库的代码许可替换。
- DataV 仅记录三个只读验证结果，没有复制边界；独立再分发许可尚未确认。

## 校验与重建

在仓库根执行 `node scripts/validate-nature-map-sources.mjs`。校验不联网、不写文件，检查已下载文件字节/哈希、GeoJSON 类型、要素数、坐标范围、环闭合及样本源信息。它不验证边界拓扑、现实位置精度、行政完整性或时效性。

重建必须使用清单内固定版本 URL。世界原始响应先验证 sourceSha256，再用 Python `gzip.compress(raw, mtime=0)`；省级原样保存；县级先验证完整源 SHA-256，再按清单条件筛选并保留所有属性/坐标。GitHub LFS 文件使用 media 下载 URL，不保存 raw 返回的指针文本。变更样本、编码或版本时同步更新哈希和文档，不能把 current 接口自动刷新后无声覆盖这些历史素材。

完整八图层选择、中国候选来源、坐标规范、瓦片与照片存储方案见 [NATURE_MAPS.md](../../../docs/NATURE_MAPS.md)。下一阶段先审阅数据，再将正式可用内容放入独立的版本化运行时包；不要直接把此 research 目录复制到 public。
