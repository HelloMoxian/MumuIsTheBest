import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const graphPath = path.join(
  repositoryRoot,
  "content",
  "world-tower",
  "world-graph.v1.json",
);
const compoundCatalogPath = path.join(
  repositoryRoot,
  "content",
  "chemistry",
  "compound-catalog.v1.json",
);
const outputPath = path.join(
  repositoryRoot,
  "content",
  "world-tower",
  "icon-manifest.v1.json",
);
const generatedArtPlanPath = path.join(
  repositoryRoot,
  "content",
  "world-tower",
  "generated-art-plan.v1.json",
);
const chemistryArtPlanPath = path.join(
  repositoryRoot,
  "content",
  "world-tower",
  "chemistry-art-plan.v1.json",
);
const publicRoot = path.join(repositoryRoot, "apps", "web", "public");
const assetRoot = "/images/world-tower";

const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const compoundCatalog = JSON.parse(fs.readFileSync(compoundCatalogPath, "utf8"));
const generatedArtPlan = JSON.parse(fs.readFileSync(generatedArtPlanPath, "utf8"));
const chemistryArtPlan = JSON.parse(fs.readFileSync(chemistryArtPlanPath, "utf8"));
const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

const coreNodeArt = new Map([
  ["电子", "electron"],
  ["质子", "proton"],
  ["中子", "neutron"],
  ["氢", "hydrogen"],
  ["氧", "oxygen"],
  ["碳", "carbon"],
  ["铁", "iron"],
  ["水", "water-molecule"],
  ["液态水", "liquid-water"],
  ["冰", "ice"],
  ["空气", "air"],
  ["木材", "wood"],
  ["普通玻璃", "glass"],
  ["钢", "steel"],
  ["桌子", "table"],
  ["塑料椅子", "plastic-chair"],
  ["铅笔", "pencil"],
  ["肥皂", "soap"],
  ["书本", "book"],
  ["电灯", "electric-light"],
  ["床", "bed"],
  ["卧室", "bedroom"],
  ["房子", "house"],
  ["汽车", "car"],
  ["飞机", "airplane"],
  ["坦克", "tank"],
  ["大炮", "cannon"],
  ["计算机", "computer"],
  ["电影", "film"],
  ["电子游戏", "video-game"],
  ["人工智能", "artificial-intelligence"],
  ["红土", "red-soil"],
  ["黑土", "black-soil"],
  ["高岭土", "kaolin"],
  ["黄土", "loess"],
  ["盐碱地", "saline-land"],
  ["峡湾", "fjord"],
  ["雅丹地貌", "yardang"],
  ["地球表层系统", "earth"],
  ["可观测宇宙", "observable-universe"],
]);

function publicAsset(relativePath) {
  return `${assetRoot}/${relativePath}`;
}

function directAsset(relativePath) {
  return { path: publicAsset(relativePath), atlas: null };
}

function atlasAsset(relativePath, columns, rows, index) {
  return {
    path: publicAsset(relativePath),
    atlas: { columns, rows, index },
  };
}

function localPath(publicPath) {
  return path.join(publicRoot, publicPath.replace(/^\//, ""));
}

const semanticAtlasSources = [
  {
    path: "nodes/atlases/nodes-materials-01-v2.webp", columns: 5, rows: 4,
    cells: [
      "木材", "竹材", "纸浆", "棉纤维", "羊毛纤维",
      "亚麻纤维", "天然橡胶", "皮革", "软木", "聚乙烯",
      "聚丙烯", "聚氯乙烯", "聚苯乙烯", "尼龙", "聚酯纤维",
      "聚碳酸酯", "有机玻璃", "硅橡胶", "人造革", "石英玻璃",
    ],
  },
  {
    path: "nodes/atlases/nodes-materials-02-v2.webp", columns: 5, rows: 4,
    cells: [
      "普通玻璃", "石英玻璃", "陶瓷", "瓷器材料", "水泥",
      "混凝土", "石膏材料", "石灰材料", "黏土", "钢",
      "不锈钢", "铸铁", "黄铜", ["青铜", "铝合金"], "钛合金",
      "焊锡", "铜材", "铝材",
    ],
  },
  {
    path: "nodes/atlases/nodes-materials-03-v2.webp", columns: 5, rows: 4,
    cells: [
      "石墨材料", "碳纤维", "玻璃纤维", "泡沫塑料", "海绵材料",
      "沥青材料", "颜料", "油墨", "液态水", "冰",
      "水蒸气", "空气", "砂", "基础土壤混合物", "食用油",
      "糖材料", "洗涤剂基",
    ],
  },
  {
    path: "nodes/atlases/nodes-life-01-v2.webp", columns: 5, rows: 4,
    cells: [
      "橡树", "松树", "竹子", "棉花植株", "水稻",
      "玉米植株", "大豆植株", "油菜", "花生植株", "番茄植株",
      "胡萝卜植株", "白菜", "苹果树", "橙树", "葡萄藤",
      "茶树", "咖啡树",
    ],
  },
  {
    path: "nodes/atlases/nodes-life-02-v2.webp", columns: 5, rows: 4,
    cells: [
      "可可树", "甘蔗", "甜菜", "亚麻植株", "荷花",
      "芦苇", "苔藓", "蕨类植物", "海藻", "牛",
      "羊", "山羊", "猪", "鸭", "鹅", "兔", "马", "蚕",
    ],
  },
  {
    path: "nodes/atlases/nodes-components-01-v2.webp", columns: 5, rows: 4,
    cells: [
      "螺钉", "螺栓", "螺母", "齿轮", "弹簧",
      "轴承", "铰链", "轮子", "车轴", "链条",
      "制动器", "把手", "机械按键", "刀片", "导线",
      "电缆", "开关", "插头", "插座",
    ],
  },
  {
    path: "nodes/atlases/nodes-components-02-v2.webp", columns: 4, rows: 4,
    cells: [
      "电池单元", "发光单元", "电动机", "发电单元",
      ["芯片", "电路板"], "显示屏", ["扬声器", "麦克风"], "天线",
      "透镜", "棱镜", "图像传感器", "温度传感器", "距离传感器",
    ],
  },
  {
    path: "nodes/atlases/nodes-daily-01-v2.webp", columns: 5, rows: 4,
    cells: [
      "桌子", "椅子", "书架", "床", "衣柜",
      "沙发", "茶几", "凳子", ["书桌", "餐桌"], "床头柜",
      "屏风", "枕头", ["被子", "床单"], "窗帘", "地毯",
      "毛巾", "雨伞", "购物袋",
    ],
  },
  {
    path: "nodes/atlases/nodes-daily-02-v2.webp", columns: 5, rows: 4,
    cells: [
      "杯子", "玻璃杯", "碗", "盘子", ["筷子", "勺子"],
      "锅", "水壶", ["菜刀", "砧板"], "保鲜盒", "烤盘",
      "铅笔", "钢笔", ["橡皮", "尺子"], "剪刀", "订书机",
      "书本", "笔记本",
    ],
  },
  {
    path: "nodes/atlases/nodes-machines-01-v2.webp", columns: 5, rows: 4,
    cells: [
      "自行车", "电动自行车", "摩托车", ["汽车", "公交车"], "卡车",
      "救护车", "消防车", ["火车", "有轨电车"], "地铁列车", "轮船",
      "帆船", "潜水艇", "电风扇", "洗衣机", "冰箱", "空调", "吸尘器",
    ],
  },
  {
    path: "nodes/atlases/nodes-machines-02-v2.webp", columns: 5, rows: 4,
    cells: [
      "电饭锅", "烤箱", "微波炉", "电灯", ["相机", "电影"],
      "打印机", "计算器", "电影", ["手机", "平板电脑"], "笔记本电脑",
      "计算机", "服务器", ["电子游戏", "机器人"], "人工智能", "水泵",
      "电动机", "发电机", "起重机",
    ],
  },
  {
    path: "nodes/atlases/nodes-spaces-01-v2.webp", columns: 5, rows: 4,
    cells: [
      "书房", "卧室", "客厅", "餐厅", ["厨房", "卫生间"],
      "儿童房", "游戏室", "音乐室", "画室", "洗衣房",
      "车库", "实验室", "图书室", "办公室", "会议室", "医务室", "健身房",
    ],
  },
  {
    path: "nodes/atlases/nodes-buildings-01-v2.webp", columns: 5, rows: 4,
    cells: [
      "房子", "楼房", "农舍", "车库楼", "学校",
      "幼儿园", "图书馆", "博物馆", "科技馆", "音乐厅",
      "剧院", "电影院建筑", "游泳馆", "实验楼", "医院", "诊所", "办公楼",
    ],
  },
  {
    path: "nodes/atlases/nodes-systems-01-v2.webp", columns: 5, rows: 4,
    cells: [
      "居住社区", "学校校园", "大学校园", "医院园区", "工业园区",
      ["科技园区", "商业街区"], "步行街", "城市街区", "村庄", ["小镇", "城市"],
      "道路网络", "桥梁网络", "地铁网络", "机场系统", "港口系统",
      "电力网络", "供水网络",
    ],
  },
  {
    path: "nodes/atlases/nodes-geography-01-v2.webp", columns: 5, rows: 4,
    cells: [
      "红土", "黑土", "黄土", "高岭土", "砂质土",
      "泥炭土", "盐碱土", "砖红壤", "水稻土", "石灰土",
      "火山灰土", "冻土", "森林土", "草原生态系统", "湿地生态系统",
      "湖泊生态系统", "河流生态系统",
    ],
  },
  {
    path: "nodes/atlases/nodes-geography-02-v2.webp", columns: 5, rows: 4,
    cells: [
      "河口生态系统", "珊瑚礁生态系统", "海洋生态系统", "农田生态系统", "果园生态系统",
      "荒漠生态系统", "苔原生态系统", "高山草甸生态系统", "沼泽生态系统", "红树林生态系统",
      "山地", "丘陵", "高原", "平原", ["盆地", "山谷"],
      "峡谷", "峡湾", "喀斯特地貌", "洞穴",
    ],
  },
  {
    path: "nodes/atlases/nodes-planets-01-v2.webp", columns: 5, rows: 4,
    cells: [
      "流域", "大型河流盆地", "海岸带", "山脉", ["高原区域", "沙漠区域"],
      "极地冰盖", "大陆架", "大洋盆地", "群岛", "海洋",
      "岩石圈", "水圈", "生物圈", "地球表层系统", "类地行星",
      "气态巨行星", "宜居行星模型",
    ],
  },
  {
    path: "nodes/atlases/nodes-expansion-01-v3.webp", columns: 4, rows: 4,
    cells: [
      "丝纤维", "砖材", "砂浆", "肥皂基",
      "食盐材料", "小麦", "马铃薯植株", "梨树",
      "向日葵", "鸡", "蜜蜂", "鱼",
      "虾", "螃蟹", "蚯蚓", "酵母菌",
    ],
  },
  {
    path: "nodes/atlases/nodes-expansion-02-v3.webp", columns: 4, rows: 4,
    cells: [
      "乳酸菌", "蓝细菌", "霉菌", "浮游微生物",
      "滑轮", "反射镜", "织物片", "拉链",
      "带子", "搭扣", "软垫", "刷头",
      "框架", "面板", "梁", "柱",
    ],
  },
  {
    path: "nodes/atlases/nodes-expansion-03-v3.webp", columns: 4, rows: 4,
    cells: [
      "管道", "阀门", "容器罐", "密封圈",
      "窗户单元", "门单元", "搁板", "容器外壳",
      "连接器", "画笔", "文具盒", "牙刷",
      "牙膏", "洗发水", "拖把", "扫帚",
    ],
  },
  {
    path: "nodes/atlases/nodes-expansion-04-v3.webp", columns: 4, rows: 4,
    cells: [
      "水桶", "垃圾桶", "T恤", "衬衫",
      "裤子", "裙子", "外套", "帽子",
      "鞋子", "袜子", "手套", "围巾",
      "积木", "拼图", "玩偶", "风筝",
    ],
  },
  {
    path: "nodes/atlases/nodes-expansion-05-v3.webp", columns: 4, rows: 4,
    cells: [
      "足球", "篮球", "羽毛球拍", "跳绳",
      "滑板", "望远镜", "吉他", "钢琴",
      "鼓", "显微镜", "地球仪", "电视机",
      "挖掘机", "推土机", "拖拉机", "机床",
    ],
  },
  {
    path: "nodes/atlases/nodes-expansion-06-v3.webp", columns: 4, rows: 4,
    cells: [
      "3D打印机", "风力发电机", "太阳能发电站", "装甲车",
      "雷达车", "运输直升机", "巡逻艇", "工程保障车",
      "无人侦察机", "储藏室", "教室", "车间",
      "机房", "温室", "展厅", "录音室",
    ],
  },
  {
    path: "nodes/atlases/nodes-expansion-07-v3.webp", columns: 4, rows: 4,
    cells: [
      "演播室", "控制室", "观察室", "天文台观测室",
      "电影院", "剧场", "餐馆", "商店",
      "超市", "咖啡馆", "车站候车室", "机场候机厅",
      "船舱", "驾驶舱", "安全避难室", "酒店",
    ],
  },
  {
    path: "nodes/atlases/nodes-expansion-08-v3.webp", columns: 4, rows: 4,
    cells: [
      "美术馆", "体育馆", "商场", "超市建筑",
      "餐厅建筑", "消防站", "警察局", "火车站",
      "地铁站", "汽车站", "机场航站楼", "港口码头",
      "电视塔", "灯塔", "工厂", "仓库",
    ],
  },
  {
    path: "nodes/atlases/nodes-expansion-09-v3.webp", columns: 4, rows: 4,
    cells: [
      "发电站", "水厂", "污水处理厂", "温室大棚",
      "谷仓", "数据中心", "铁路网络", "污水处理网络",
      "垃圾回收系统", "通信网络", "互联网", "数据中心集群",
      "物流网络", "公共交通系统", "消防救援系统", "医疗急救系统",
    ],
  },
  {
    path: "nodes/atlases/nodes-expansion-10-v3.webp", columns: 4, rows: 4,
    cells: [
      "气象监测系统", "农田灌溉系统", "农场系统", "牧场系统",
      "果园系统", "森林管理系统", "矿区系统", "钢铁生产系统",
      "化工生产系统", "汽车制造系统", "飞机制造系统", "船舶制造系统",
      "建筑工地系统", "航天发射中心", "天文台阵列", "科学考察基地",
    ],
  },
  {
    path: "nodes/atlases/nodes-expansion-11-v3.webp", columns: 4, rows: 4,
    cells: [
      "黏质土", "紫色土", "森林生态系统", "沙丘",
      "三角洲", "冲积扇", "海滩", "海蚀崖",
      "岛屿", "火山", "冰川", "大陆",
      "大气圈", "行星系统", "卫星系统", "小行星带",
    ],
  },
  {
    path: "nodes/atlases/nodes-expansion-12-v3.webp", columns: 4, rows: 3,
    cells: [
      "彗星群", "原行星盘", "恒星", "双星系统",
      "疏散星团", "球状星团", "星云", "类太阳恒星系统",
      "类银河系", "旋涡星系", "椭圆星系", "星系群",
    ],
  },
];

const semanticAssetsByName = new Map();
for (const source of semanticAtlasSources) {
  source.cells.forEach((cell, index) => {
    const names = Array.isArray(cell) ? cell : [cell];
    for (const name of names) {
      semanticAssetsByName.set(
        name,
        atlasAsset(source.path, source.columns, source.rows, index),
      );
    }
  });
}

const levelFallbacks = Object.fromEntries(
  graph.levels.map((level) => [
    level.id,
    publicAsset("placeholders/stardust.webp"),
  ]),
);

const nodeAssets = {};

const elementNodes = graph.nodes.filter((node) => node.kind === "chemical-element");
for (const [index, node] of elementNodes.entries()) {
  const pageIndex = index < 100 ? Math.floor(index / 20) : 5;
  const localIndex = index < 100 ? index % 20 : index - 100;
  nodeAssets[node.id] = atlasAsset(
    "nodes/atlases/nodes-elements-"
      + String(pageIndex + 1).padStart(2, "0")
      + "-v2.webp",
    pageIndex === 5 ? 6 : 5,
    pageIndex === 5 ? 3 : 4,
    localIndex,
  );
}

for (const [index, compound] of compoundCatalog.records.entries()) {
  const pageIndex = Math.floor(index / 100);
  const nodeId = "compound:" + compound.id;
  if (!nodeById.has(nodeId)) continue;
  nodeAssets[nodeId] = atlasAsset(
    "nodes/atlases/compounds-"
      + String(pageIndex + 1).padStart(2, "0")
      + "-v2.svg",
    10,
    10,
    index % 100,
  );
}

const groupedLevelSizes = new Map([
  ["level:04-materials", 3],
  ["level:05-life", 3],
  ["level:06-components", 4],
  ["level:07-daily", 4],
  ["level:08-machines", 4],
  ["level:09-spaces", 2],
  ["level:10-buildings", 2],
]);
const groupedCoreAssets = new Map([
  ["level:07-daily|肥皂", "soap"],
  ["level:08-machines|飞机", "airplane"],
  ["level:08-machines|坦克", "tank"],
  ["level:08-machines|大炮", "cannon"],
]);
for (const [levelId, groupSize] of groupedLevelSizes) {
  const nodeIds = graph.indexes.nodeIdsByLevel[levelId] ?? [];
  for (const [index, nodeId] of nodeIds.entries()) {
    const baseNode = nodeById.get(nodeIds[index - index % groupSize]);
    const lookupName = levelId === "level:06-components"
      ? baseNode?.name.replace(/^微型/u, "")
      : baseNode?.name;
    const groupedCoreAsset = lookupName
      ? groupedCoreAssets.get(`${levelId}|${lookupName}`)
      : null;
    const asset = groupedCoreAsset
      ? directAsset(`nodes/core/${groupedCoreAsset}.webp`)
      : lookupName ? semanticAssetsByName.get(lookupName) : null;
    if (asset) nodeAssets[nodeId] = asset;
  }
}
for (const node of graph.nodes) {
  const asset = semanticAssetsByName.get(node.name);
  if (asset) nodeAssets[node.id] = asset;
}

for (const [nodeName, assetName] of coreNodeArt) {
  const matches = graph.nodes.filter((node) => node.name === nodeName);
  if (matches.length > 1) {
    throw new Error(
      `核心节点“${nodeName}”应唯一匹配，实际得到 ${matches.length} 个。`,
    );
  }
  if (matches.length === 0) continue;
  nodeAssets[matches[0].id] = directAsset("nodes/core/" + assetName + ".webp");
}

if (generatedArtPlan.graphId !== graph.graphId) {
  throw new Error("生成图片计划与物质塔图谱 ID 不一致。");
}
if (
  generatedArtPlan.grid.columns !== 5
  || generatedArtPlan.grid.rows !== 4
  || generatedArtPlan.grid.cellsPerAtlas !== 20
  || generatedArtPlan.grid.cutPolicy !== "equal-width-and-height-grid-with-24px-inset"
) {
  throw new Error("生成图片计划必须固定为 5×4、20 格和 24px 安全内缩。");
}

let generatedNodeAssetCount = 0;
for (const batch of generatedArtPlan.batches) {
  if (batch.columns !== 5 || batch.rows !== 4 || batch.items.length !== 20) {
    throw new Error(`生成图集 ${batch.id} 不是固定的 5×4、20 格。`);
  }
  for (const item of batch.items) {
    if (item.reserved) continue;
    const node = nodeById.get(item.nodeId);
    if (!node || node.name !== item.name) {
      throw new Error(`生成图集 ${batch.id} 的格位 ${item.slot} 与节点清单不一致。`);
    }
    nodeAssets[item.nodeId] = {
      path: `${batch.outputDirectory}/${item.assetId}.png`,
      atlas: null,
    };
    generatedNodeAssetCount += 1;
  }
}

if (chemistryArtPlan.graphId !== graph.graphId) {
  throw new Error("化学扩展图片计划与物质塔图谱 ID 不一致。");
}
if (
  chemistryArtPlan.grid.columns !== 3
  || chemistryArtPlan.grid.rows !== 4
  || chemistryArtPlan.grid.cellsPerAtlas !== 12
  || chemistryArtPlan.grid.cutPolicy !== "equal-width-and-height-grid-with-24px-inset"
) {
  throw new Error("化学扩展图片计划必须固定为 3×4、12 格和 24px 安全内缩。");
}
for (const batch of chemistryArtPlan.batches) {
  if (batch.columns !== 3 || batch.rows !== 4 || batch.items.length !== 12) {
    throw new Error(`化学扩展图集 ${batch.id} 不是固定的 3×4、12 格。`);
  }
  for (const item of batch.items) {
    if (item.reserved) {
      throw new Error(`化学扩展图集 ${batch.id} 不应包含保留格。`);
    }
    const node = nodeById.get(item.nodeId);
    if (!node || node.name !== item.name || node.levelId !== item.levelId) {
      throw new Error(`化学扩展图集 ${batch.id} 的格位 ${item.slot} 与节点清单不一致。`);
    }
    nodeAssets[item.nodeId] = {
      path: `${batch.outputDirectory}/${item.assetId}.png`,
      atlas: null,
    };
    generatedNodeAssetCount += 1;
  }
}

const resourceAssets = {};
const particlePackAssets = {
  "particle-pack:electron": publicAsset("nodes/core/electron.webp"),
  "particle-pack:proton": publicAsset("nodes/core/proton.webp"),
};
for (const group of Object.values(graph.resources)) {
  for (const resource of group) {
    const assetName = resource.id.slice(resource.id.indexOf(":") + 1);
    resourceAssets[resource.id] = particlePackAssets[resource.id] ?? publicAsset(
      `resources/${resource.kind}/${assetName}.webp`,
    );
  }
}

const manifest = {
  schemaVersion: 1,
  assetPackId: "mumu-world-tower-cosmic-runes-v4",
  generatedAt: "2026-08-09T00:00:00.000Z",
  artDirection: {
    style: "premium-fantasy-science-cosmic-runes",
    composition: "separate-frame-content-image-and-html-label",
    fallbackPolicy: "every-node-has-a-semantic-image-stardust-is-emergency-only",
    generatedAtlasProtocol: "legacy-fixed-5x4-plus-chemistry-fixed-3x4-row-major-24px-inset-transparent-png",
  },
  backgroundAsset: publicAsset("backgrounds/cosmic-tower-v2.webp"),
  frameAssets: {
    common: publicAsset("frames/common.png"),
    rare: publicAsset("frames/rare.png"),
    epic: publicAsset("frames/epic.png"),
    legendary: publicAsset("frames/legendary.png"),
  },
  levelFallbacks,
  clusterFallbacks: {},
  nodeAssets,
  resourceAssets,
  placeholderTexture: publicAsset("placeholders/stardust.webp"),
};

const runtimePaths = [
  manifest.backgroundAsset,
  ...Object.values(manifest.frameAssets),
  ...Object.values(manifest.levelFallbacks),
  ...Object.values(manifest.nodeAssets).map((asset) => asset.path),
  ...Object.values(manifest.resourceAssets),
  manifest.placeholderTexture,
];
const missingAssets = runtimePaths.filter((assetPath) => !fs.existsSync(localPath(assetPath)));
if (missingAssets.length > 0) {
  throw new Error(`缺少 ${missingAssets.length} 个图标资产：\n${missingAssets.join("\n")}`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `已生成图标清单：${Object.keys(nodeAssets).length} 个语义图片节点（其中 ${generatedNodeAssetCount} 个为本轮生成）、`
  + `${Object.keys(resourceAssets).length} 个资源、`
  + `${Object.keys(levelFallbacks).length} 个层级占位。`,
);
