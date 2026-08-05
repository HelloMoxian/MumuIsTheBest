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
const publicRoot = path.join(repositoryRoot, "apps", "web", "public");
const assetRoot = "/images/world-tower";

const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const compoundCatalog = JSON.parse(fs.readFileSync(compoundCatalogPath, "utf8"));
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
    publicAsset(`nodes/levels/${level.id.replace("level:", "")}.webp`),
  ]),
);

const nodeAssets = {};

const elementNodes = graph.nodes.filter((node) => node.levelId === "level:02-elements");
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
  nodeAssets["compound:" + compound.id] = atlasAsset(
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
for (const [levelId, groupSize] of groupedLevelSizes) {
  const nodeIds = graph.indexes.nodeIdsByLevel[levelId] ?? [];
  for (const [index, nodeId] of nodeIds.entries()) {
    const baseNode = nodeById.get(nodeIds[index - index % groupSize]);
    const lookupName = levelId === "level:06-components"
      ? baseNode?.name.replace(/^微型/u, "")
      : baseNode?.name;
    const asset = lookupName ? semanticAssetsByName.get(lookupName) : null;
    if (asset) nodeAssets[nodeId] = asset;
  }
}
for (const node of graph.nodes) {
  const asset = semanticAssetsByName.get(node.name);
  if (asset) nodeAssets[node.id] = asset;
}

for (const [nodeName, assetName] of coreNodeArt) {
  const matches = graph.nodes.filter((node) => node.name === nodeName);
  if (matches.length !== 1) {
    throw new Error(
      `核心节点“${nodeName}”应唯一匹配，实际得到 ${matches.length} 个。`,
    );
  }
  nodeAssets[matches[0].id] = directAsset("nodes/core/" + assetName + ".webp");
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
  assetPackId: "mumu-world-tower-cosmic-runes-v2",
  generatedAt: "2026-08-05T00:00:00.000Z",
  artDirection: {
    style: "premium-fantasy-science-cosmic-runes",
    composition: "separate-frame-content-image-and-html-label",
    fallbackPolicy: "semantic-image-then-stardust-name-never-unrelated-level-art",
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
  `已生成图标清单：${Object.keys(nodeAssets).length} 个核心节点、`
  + `${Object.keys(resourceAssets).length} 个资源、`
  + `${Object.keys(levelFallbacks).length} 个层级占位。`,
);
