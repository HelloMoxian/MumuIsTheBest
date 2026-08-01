# 化学分子结构资产

“反应熔炉”使用三个静态结构资产：

- `molecular-structures.v1.json` 保存离散中性分子的权威连接拓扑；
- `element-compounds.v1.json` 保存补齐前 80 号元素的化合物记录。
- `curriculum-compounds.v1.json` 保存教材常见酸碱盐、守恒反应物质、后段金属非氧化物和碳材料代表结构。

页面不得根据分子式、原子排列顺序或视觉便利自行猜测化学键。离子晶体和固体没有合适的离散分子拓扑时，只能以“配方单元组成示意”展示；教材扩展库可以用虚线连接帮助看清组成，但虚线明确不是化学键。

## 数据来源

- 原子、二维坐标、连接关系和单/双/三键级：PubChem Compound 的标准化二维记录；
- 常见物质候选：中文维基百科《有机化合物列表》；
- 中文名称、PubChem CID 对照和简短说明：Wikidata；
- 水、氧气、二氧化碳等基础小分子使用单独白名单确保进入学习库，但连接关系仍来自 PubChem。
- 酸、碱、盐和金属材料范围：人民教育出版社《化学 九年级下册》目录与项目既有 165 条守恒反应；
- 金刚石、C₆₀、碳纳米管和石墨烯：Crystallography Open Database、Nature 原始论文和 Nobel Prize 科学资料。

每条记录都保留 PubChem CID 和详情 URL，便于逐条追溯。中文候选来源不能覆盖或修改 PubChem 给出的原子与键数据。

## 强制筛选

生成脚本只保留：

1. 总电荷为 0 的离散分子；
2. 具有完整显式原子和二维坐标的记录；
3. 分子式与显式原子逐项完全一致的记录；
4. 全部原子属于同一连通共价网络的记录；
5. 键级均可明确表示为单键、双键或三键的记录；
6. 通常不超过 36 个原子、能够在儿童界面中清楚显示的结构；原需求明确提到的 C60 仅在 PubChem 60 原子碳笼拓扑完整通过校验时作为特例保留；
7. 只含当前渲染器可靠支持的非金属或类金属元素。

上述限制适用于 `molecular-structures.v1.json`。`element-compounds.v1.json` 可以记录离子盐与固体，但必须标记为 `formula-unit / composition-schematic`，并保持 `bonds: []`。`curriculum-compounds.v1.json` 的离子晶体、盐和水合物可以使用 `style: dashed` 的最小连通树；所有虚线必须是单线且界面说明“不代表共价键”。金刚石、石墨烯和碳纳米管标记为 `representative-lattice`，明确它们只是无限结构的有限片段。

候选列表还会排除不适合在五岁儿童页面中随机出现的神经毒剂、爆炸物与农药条目；这种内容过滤不能改变任何保留记录的化学结构。

## 维护

```bash
node scripts/generate-molecular-structures.mjs
node scripts/generate-element-compounds.mjs
node scripts/generate-curriculum-compounds.mjs
node scripts/validate-molecular-structures.mjs
node scripts/validate-element-compounds.mjs
node scripts/validate-curriculum-compounds.mjs
```

生成过程遵守 PubChem PUG REST 每秒不超过 5 次请求的规则。校验器锁定乙炔 `H—C≡C—H` 和 C₆₀ 60 顶点/90 连接拓扑，检查全部记录的分子式、连通性、键索引、键级、虚实线语义和来源 URL，并保证原子序数 1—80 的每一种元素至少有一条结构记录、后段金属至少两条记录且包含非氧化物、165 条守恒反应中的物质全部进入熔炉。
