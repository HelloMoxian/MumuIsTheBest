import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDirectory = path.dirname(currentFile);
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const outputDirectory = path.join(repositoryRoot, "content", "world-tower");
const graphOutputPath = path.join(outputDirectory, "world-graph.v1.json");
const priceOutputPath = path.join(outputDirectory, "unlock-catalog.v1.json");

const elementSourcePath = path.join(
  repositoryRoot,
  "apps/web/src/features/periodic-table/elements.generated.ts",
);
const compoundSourcePath = path.join(
  repositoryRoot,
  "content/chemistry/compound-catalog.v1.json",
);

const elementSource = fs.readFileSync(elementSourcePath, "utf8");
const elementDeclarationStart = elementSource.indexOf("export const ELEMENTS");
const elementArrayStart = elementSource.indexOf("= [", elementDeclarationStart) + 2;
const elementArrayEnd = elementSource.lastIndexOf("];" ) + 1;
const elements = JSON.parse(
  elementSource.slice(elementArrayStart, elementArrayEnd),
);
const compoundCatalog = JSON.parse(fs.readFileSync(compoundSourcePath, "utf8"));
const compounds = compoundCatalog.records;

const levels = [
  ["level:01-particles", "粒子基座", "电子、质子和中子构成普通物质世界的概念起点。"],
  ["level:02-elements", "元素星阵", "118 种化学元素；每种元素由原子序数确定。"],
  ["level:03-substances", "单质与化合物", "由一种或多种元素形成的单质、分子、离子晶体和水合物。"],
  ["level:04-materials", "材料与体量", "分子集合、混合物、材料和同一物质的宏观体量。"],
  ["level:05-life", "生命与自然原料", "植物、动物、微生物及其可观察的组织和自然产物。"],
  ["level:06-components", "零件与基础构件", "可重复使用的机械、电气、光学和纺织构件。"],
  ["level:07-daily", "生活用品", "家具、餐厨、文具、清洁、服装、玩具和学习用品。"],
  ["level:08-machines", "机器与工程装备", "交通工具、家电、计算设备、工程机械和装备模型。"],
  ["level:09-spaces", "房间与功能空间", "由物品和设施组织出的室内功能空间。"],
  ["level:10-buildings", "建筑与设施", "由房间、结构和系统组成的建筑。"],
  ["level:11-systems", "社区与生产系统", "由多座建筑、网络和组织共同形成的社会系统。"],
  ["level:12-geography", "土壤、生态与地貌", "物质在生命、气候、地质作用和漫长时间中的宏观结果。"],
  ["level:13-planets", "地表与行星", "流域、大陆、海洋、圈层和不同类型的行星。"],
  ["level:14-stars", "恒星与天体系统", "恒星、星云、行星系统和星团。"],
  ["level:15-universe", "星系与宇宙", "从恒星系统到星系群和可观测宇宙。"],
].map(([id, name, description], index) => ({
  id,
  order: index + 1,
  name,
  description,
}));

const clusters = [
  ["cluster:particles", "基础粒子", null],
  ["cluster:elements", "化学元素", null],
  ["cluster:substances:inorganic", "无机物与单质", null],
  ["cluster:substances:organic", "有机物", null],
  ["cluster:materials:natural", "天然材料", null],
  ["cluster:materials:polymer", "高分子材料", null],
  ["cluster:materials:mineral", "玻璃、陶瓷与矿物材料", null],
  ["cluster:materials:metal", "金属与合金", null],
  ["cluster:materials:composite", "复合与功能材料", null],
  ["cluster:materials:bulk", "体量与常见混合物", null],
  ["cluster:life:plant", "植物", null],
  ["cluster:life:animal", "动物", null],
  ["cluster:life:microbe", "微生物", null],
  ["cluster:components:mechanical", "机械构件", null],
  ["cluster:components:electrical", "电气与电子构件", null],
  ["cluster:components:optical", "光学与感知构件", null],
  ["cluster:components:textile", "软性与纺织构件", null],
  ["cluster:components:structural", "结构与管路构件", null],
  ["cluster:daily:furniture", "家具", null],
  ["cluster:daily:textile", "寝具与随身用品", null],
  ["cluster:daily:kitchen", "餐厨用品", null],
  ["cluster:daily:stationery", "文具与阅读", null],
  ["cluster:daily:cleaning", "清洁与洗护", null],
  ["cluster:daily:clothing", "衣物", null],
  ["cluster:daily:play", "玩具与运动", null],
  ["cluster:daily:music-science", "音乐与科学观察", null],
  ["cluster:machines:transport", "交通工具", null],
  ["cluster:machines:appliance", "家用电器", null],
  ["cluster:machines:computing", "计算与智能设备", null],
  ["cluster:machines:industrial", "工程与生产设备", null],
  ["cluster:machines:defense", "国防与救援装备展示", null],
  ["cluster:spaces:home", "居家空间", null],
  ["cluster:spaces:learning", "学习与工作空间", null],
  ["cluster:spaces:public", "公共与专业空间", null],
  ["cluster:buildings:home", "居住建筑", null],
  ["cluster:buildings:culture", "教育与文化建筑", null],
  ["cluster:buildings:service", "医疗与公共服务建筑", null],
  ["cluster:buildings:industry", "生产与基础设施", null],
  ["cluster:systems:settlement", "聚落与社区", null],
  ["cluster:systems:network", "城市网络", null],
  ["cluster:systems:production", "生产与科研系统", null],
  ["cluster:geography:soil", "土壤", null],
  ["cluster:geography:ecosystem", "生态系统", null],
  ["cluster:geography:landform", "地质地貌", null],
  ["cluster:planets:surface", "大型地表单元", null],
  ["cluster:planets:sphere", "行星圈层与行星", null],
  ["cluster:stars:system", "天体系统", null],
  ["cluster:universe:large-scale", "宇宙大尺度结构", null],
].map(([id, name, parentClusterId], index) => ({
  id,
  order: index + 1,
  name,
  parentClusterId,
}));

const particlePacks = [
  ["particle-pack:electron", "电子包", "合成元素时使用的电子学习资源；电子节点永久保留，电子包会被消耗。"],
  ["particle-pack:proton", "质子包", "合成元素时使用的质子学习资源；质子节点永久保留，质子包会被消耗。"],
].map(([id, name, description]) => ({
  id,
  kind: "particle",
  name,
  description,
  inventoryMode: "charge",
  shop: { purchasable: true, coinCost: 10 },
}));

const actions = [
  ["action:chemical-bonding", "形成化学键", "让原子以概念化方式形成稳定结构。", 2],
  ["action:accumulate", "积累", "把微小份量逐步变成可观察的宏观体量。", 1],
  ["action:mix", "混合", "把多种材料均匀或分层组合。", 1],
  ["action:separate", "分离", "从混合体系中得到需要的部分。", 2],
  ["action:shape", "成型", "改变材料外形而不强调具体工业参数。", 1],
  ["action:cut", "切割", "把材料分成需要的形状。", 1],
  ["action:join", "连接", "连接两个或更多构件。", 1],
  ["action:assemble", "组装", "把多个构件组织成可工作的整体。", 2],
  ["action:weave", "编织", "把纤维或线材交错成片状结构。", 2],
  ["action:heat", "加热", "提供热量；这里只表达概念，不提供危险参数。", 2],
  ["action:cool", "冷却", "带走热量，使物质状态或结构发生变化。", 1],
  ["action:melt", "熔融", "让材料进入可重新成型的状态。", 3],
  ["action:ferment", "发酵", "利用微生物进行温和的生物转化。", 2],
  ["action:grow", "生长", "让生命在合适环境中逐渐形成组织。", 1],
  ["action:photosynthesis", "光合作用", "植物利用光能积累有机物。", 1],
  ["action:organize-space", "空间布置", "把物品组织成功能明确的空间。", 1],
  ["action:construct", "建造", "把空间、构件和设施组合成建筑。", 3],
  ["action:connect-network", "连成网络", "让多个设施互相连接和协作。", 3],
  ["action:weather", "风化", "岩石在环境作用下逐渐破碎和改变。", 1],
  ["action:erode", "侵蚀", "水、风或冰逐渐搬走地表物质。", 2],
  ["action:deposit", "沉积", "让搬运来的物质逐渐堆积。", 1],
  ["action:compress", "压实", "在长期压力下让松散物质更加紧密。", 2],
  ["action:freeze-thaw", "冻融", "水的冻结和融化反复改变地表。", 2],
  ["action:orbit-aggregate", "引力聚集", "用概念模型表达天体在引力下形成系统。", 4],
].map(([id, name, description, cost]) => ({
  id,
  kind: "action",
  name,
  description,
  inventoryMode: "charge",
  shop: { purchasable: true, coinCost: cost },
}));

const conditions = [
  ["condition:stable-combination", "结构稳定", "组合能形成相对稳定的结构。"],
  ["condition:enough-quantity", "数量足够", "拥有足够的输入份量。"],
  ["condition:suitable-temperature", "温度合适", "温度位于概念任务需要的范围。"],
  ["condition:suitable-moisture", "湿度合适", "水分条件适合当前过程。"],
  ["condition:clean-material", "材料洁净", "材料达到观察或组装需要的洁净程度。"],
  ["condition:structural-balance", "结构平衡", "整体能稳定支撑并保持平衡。"],
  ["condition:energy-supply", "能量供应", "系统拥有完成任务所需的能量来源。"],
  ["condition:long-time", "漫长时间", "过程需要跨越较长的自然时间。"],
  ["condition:repeated-cycles", "反复循环", "过程需要多次重复才能显现结果。"],
  ["condition:low-risk-demo", "安全演示", "仅以儿童友好的高层模型呈现。"],
  ["condition:compatible-parts", "构件匹配", "接口、尺寸和功能在概念上相容。"],
  ["condition:gravitational-balance", "引力平衡", "天体系统在引力作用下保持整体关系。"],
].map(([id, name, description]) => ({
  id,
  kind: "condition",
  name,
  description,
  inventoryMode: "state",
  shop: { purchasable: false, coinCost: null },
}));

const environments = [
  ["environment:virtual-lab", "虚拟实验室", "用于安全观察原子、分子与材料结构。"],
  ["environment:workbench", "制作台", "用于常见材料成型和构件组合。"],
  ["environment:factory", "工厂", "用于高层展示批量制造与装配。"],
  ["environment:kitchen", "厨房", "用于儿童熟悉的食物与餐厨过程。"],
  ["environment:garden", "花园", "适合常见植物生长。"],
  ["environment:farm", "农场", "适合农作物与家养动物。"],
  ["environment:forest", "森林", "树木、土壤和动物共同存在的环境。"],
  ["environment:freshwater", "淡水环境", "河流、湖泊和池塘环境。"],
  ["environment:ocean", "海洋环境", "盐水、潮汐和海洋生命共同作用。"],
  ["environment:wetland", "湿地", "水陆交错、物质循环活跃的环境。"],
  ["environment:desert", "荒漠", "干燥、温差和风力显著的环境。"],
  ["environment:cold-region", "寒冷地区", "冰雪和冻融作用明显的环境。"],
  ["environment:wind-field", "持续风场", "风力长期搬运和磨蚀地表物质。"],
  ["environment:river-system", "河流水系", "流水持续侵蚀、搬运和沉积。"],
  ["environment:glacier", "冰川环境", "冰体缓慢移动并塑造地貌。"],
  ["environment:underground", "地下环境", "压力、地下水和岩层共同作用。"],
  ["environment:city", "城市环境", "建筑、道路和公共网络密集协作。"],
  ["environment:near-earth-space", "近地空间", "行星、卫星和航天器活动区域。"],
  ["environment:interplanetary-space", "行星际空间", "恒星与行星系统所在空间。"],
  ["environment:interstellar-space", "星际空间", "恒星、星云和星团之间的空间。"],
].map(([id, name, description]) => ({
  id,
  kind: "environment",
  name,
  description,
  inventoryMode: "state",
  shop: { purchasable: false, coinCost: null },
}));

const knowledgeNames = [
  ["atomic-structure", "原子结构"], ["periodic-table", "元素周期律"],
  ["chemical-bonds", "化学键"], ["molecular-geometry", "分子空间结构"],
  ["states-of-matter", "物态变化"], ["mixtures", "混合物与分离"],
  ["polymer-science", "高分子基础"], ["metallurgy", "金属与合金"],
  ["ceramics", "陶瓷与玻璃"], ["materials-science", "材料科学"],
  ["measurement", "测量"], ["safety", "实验安全"],
  ["plant-biology", "植物生物学"], ["animal-biology", "动物生物学"],
  ["microbiology", "微生物学"], ["ecology", "生态学"],
  ["photosynthesis", "光合作用"], ["food-chain", "食物链"],
  ["mechanics", "力学"], ["statics", "静力学"], ["dynamics", "动力学"],
  ["simple-machines", "简单机械"], ["mechanical-design", "机械设计"],
  ["manufacturing", "制造基础"], ["woodworking", "木工基础"],
  ["textiles", "纺织基础"], ["electricity", "电学"],
  ["circuits", "电路基础"], ["electromagnetism", "电磁学"],
  ["optics", "光学"], ["acoustics", "声学"],
  ["sensors", "传感器"], ["control-theory", "控制原理"],
  ["fluid-mechanics", "流体力学"], ["aerodynamics", "空气动力学"],
  ["thermodynamics", "热力学"], ["vehicle-engineering", "车辆工程"],
  ["naval-architecture", "船舶原理"], ["aviation", "航空基础"],
  ["architecture", "建筑学"], ["structural-engineering", "结构工程"],
  ["interior-design", "空间设计"], ["urban-planning", "城市规划"],
  ["transportation", "交通规划"], ["energy-systems", "能源系统"],
  ["water-systems", "给排水系统"], ["environmental-engineering", "环境工程"],
  ["computer-basics", "计算机基础"], ["binary", "二进制"],
  ["computer-architecture", "计算机组成原理"], ["operating-systems", "操作系统"],
  ["data-structures", "数据结构"], ["algorithms", "算法"],
  ["computer-networks", "计算机网络"], ["databases", "数据库"],
  ["linear-algebra", "线性代数"], ["calculus", "微积分"],
  ["probability", "概率"], ["statistics", "统计学"],
  ["graphics", "计算机图形学"], ["game-design", "电子游戏设计"],
  ["film", "电影制作"], ["animation", "动画原理"],
  ["artificial-intelligence", "人工智能"], ["machine-learning", "机器学习"],
  ["neural-networks", "神经网络"], ["robotics", "机器人学"],
  ["geology", "地质学"], ["mineralogy", "矿物学"],
  ["soil-science", "土壤学"], ["geomorphology", "地貌学"],
  ["hydrology", "水文学"], ["meteorology", "气象学"],
  ["oceanography", "海洋学"], ["plate-tectonics", "板块构造"],
  ["astronomy", "天文学"], ["orbital-mechanics", "轨道力学"],
  ["stellar-evolution", "恒星演化"], ["cosmology", "宇宙学"],
];

const knowledge = knowledgeNames.map(([key, name], index) => ({
  id: `knowledge:${key}`,
  kind: "knowledge",
  name,
  description: `学习“${name}”后，它会永久点亮，可被所有相关配方重复使用。`,
  inventoryMode: "permanent-unlock",
  shop: { purchasable: true, coinCost: 3 + (index % 8) },
}));

const resources = {
  particlePacks,
  actions,
  conditions,
  environments,
  knowledge,
};

const nodes = [];
const nodeById = new Map();
const nodeByName = new Map();
const levelOrderById = new Map(levels.map((level) => [level.id, level.order]));

function addNode(node) {
  if (nodeById.has(node.id)) throw new Error(`重复节点 ID：${node.id}`);
  if (nodeByName.has(node.name)) throw new Error(`重复节点名称：${node.name}`);
  const normalized = {
    aliases: [],
    tags: [],
    art: {
      mode: "text-placeholder",
      imageAssetId: null,
      symbol: node.symbol ?? node.name.slice(0, 2),
      frameStyle: node.frameStyle ?? "common",
    },
    ...node,
  };
  delete normalized.symbol;
  delete normalized.frameStyle;
  nodes.push(normalized);
  nodeById.set(normalized.id, normalized);
  nodeByName.set(normalized.name, normalized);
  return normalized;
}

function requirement(id, amount = 1) {
  return { resourceId: id, amount };
}

function input(nodeId, amount = 1, unit = "conceptual-part", role = "material") {
  return { nodeId, amount, unit, role, consumed: true };
}

function recipe({ id, type, outputId, inputs, particlePacks: particlePackIds = [], actions: actionIds = [], conditions: conditionIds = [], environments: environmentIds = [], knowledge: knowledgeIds = [], explanation, safety = "child-friendly-conceptual-model" }) {
  return {
    id,
    type,
    logic: "ALL",
    inputs,
    requirements: {
      particlePacks: particlePackIds.map((value) => requirement(value)),
      actions: actionIds.map((value) => requirement(value)),
      conditions: conditionIds.map((value) => requirement(value)),
      environments: environmentIds.map((value) => requirement(value)),
      knowledge: knowledgeIds.map((value) => requirement(value)),
    },
    outputs: [{ nodeId: outputId, amount: 1 }],
    childExplanation: explanation,
    safety,
  };
}

function stableId(prefix, key) {
  return `${prefix}:${key}`;
}

function semanticKey(value) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function findCompound(token) {
  const record = compounds.find(
    (item) => item.name === token || item.formula === token || item.displayFormula === token,
  );
  if (!record) throw new Error(`缺少化学底座：${token}`);
  return `compound:${record.id}`;
}

function representativeChemicalInputs(token) {
  if (/^[A-Z][a-z]?$/.test(token)) return [input(`element:${token}`)];
  const record = compounds.find(
    (item) => item.name === token || item.formula === token || item.displayFormula === token,
  );
  if (record) return [input(`compound:${record.id}`)];
  const elementParts = [...token.matchAll(/([A-Z][a-z]?)(\d*)/g)];
  if (elementParts.length === 0) throw new Error(`无法解析代表性成分：${token}`);
  return elementParts.map(([, symbol, count]) => input(`element:${symbol}`, Number(count || 1), "atom"));
}

function findNodeId(name) {
  const node = nodeByName.get(name);
  if (!node) throw new Error(`找不到节点：${name}`);
  return node.id;
}

for (const particle of [
  ["electron", "电子", "e⁻", "带负电的基础粒子。"],
  ["proton", "质子", "p⁺", "位于原子核中，数量决定元素种类。"],
  ["neutron", "中子", "n⁰", "位于原子核中，不同数量可形成同位素。"],
]) {
  const [key, name, symbol, summary] = particle;
  addNode({
    id: stableId("particle", key),
    name,
    kind: "fundamental-building-block",
    levelId: "level:01-particles",
    clusterId: "cluster:particles",
    summary,
    symbol,
    frameStyle: "origin",
    recipes: [],
    sourceRefs: [{ type: "curated-concept", path: null }],
  });
}

for (const element of elements) {
  const id = stableId("element", element.symbol);
  const approximateMass = Number.parseFloat(element.atomicMass.replace(/[()]/g, ""));
  const representativeNeutrons = Number.isFinite(approximateMass)
    ? Math.max(0, Math.round(approximateMass) - element.atomicNumber)
    : element.atomicNumber;
  addNode({
    id,
    name: element.chineseName,
    aliases: [element.englishName, element.symbol, element.pinyin],
    kind: "chemical-element",
    levelId: "level:02-elements",
    clusterId: "cluster:elements",
    summary: `${element.chineseName}元素，原子序数 ${element.atomicNumber}。`,
    symbol: element.symbol,
    frameStyle: element.category,
    properties: {
      atomicNumber: element.atomicNumber,
      symbol: element.symbol,
      atomicMass: element.atomicMass,
      electronConfiguration: element.electronConfiguration,
      shells: element.shells,
      category: element.category,
      categoryLabel: element.categoryLabel,
      period: element.period,
      group: element.group,
    },
    recipes: [
      recipe({
        id: `recipe:${id}:conceptual-atom`,
        type: "conceptual-atomic-composition",
        outputId: id,
        inputs: [
          input("particle:proton", element.atomicNumber, "particle"),
          input("particle:electron", element.atomicNumber, "particle"),
          input("particle:neutron", representativeNeutrons, "representative-particle"),
        ],
        particlePacks: ["particle-pack:electron", "particle-pack:proton"],
        environments: ["environment:virtual-lab"],
        knowledge: ["knowledge:atomic-structure", "knowledge:periodic-table"],
        explanation: `${element.atomicNumber} 个质子决定它是${element.chineseName}；中子数采用常见质量数的概念近似，同位素会不同。`,
        safety: "conceptual-only-no-nuclear-procedure",
      }),
    ],
    sourceRefs: [{ type: "project-source", path: "apps/web/src/features/periodic-table/elements.generated.ts" }],
  });
}

for (const compound of compounds) {
  const id = stableId("compound", compound.id);
  const atomEntries = Object.entries(compound.atomCounts).sort(([a], [b]) => a.localeCompare(b));
  const isSimpleSubstance = atomEntries.length === 1;
  let displayName = compound.name;
  if (nodeByName.has(displayName)) {
    displayName = isSimpleSubstance
      ? `${compound.name}单质`
      : `${compound.name}（${compound.formula}）`;
  }
  if (nodeByName.has(displayName)) displayName = `${displayName}·${compound.id}`;
  addNode({
    id,
    name: displayName,
    aliases: [compound.name, compound.nameEnglish, compound.formula].filter(Boolean),
    kind: isSimpleSubstance ? "simple-substance" : "compound",
    levelId: "level:03-substances",
    clusterId: compound.family === "organic"
      ? "cluster:substances:organic"
      : "cluster:substances:inorganic",
    summary: compound.feature,
    symbol: compound.displayFormula || compound.formula,
    frameStyle: compound.family === "organic" ? "organic" : "inorganic",
    properties: {
      formula: compound.formula,
      displayFormula: compound.displayFormula,
      family: compound.family,
      structureKind: compound.kind,
      category: compound.category,
      curriculumPriority: compound.curriculumPriority,
      atomCounts: compound.atomCounts,
      profile: compound.profile,
      image: compound.image,
    },
    recipes: [
      recipe({
        id: `recipe:${id}:abstract-bonding`,
        type: "abstract-chemical-composition",
        outputId: id,
        inputs: atomEntries.map(([symbol, count]) => input(`element:${symbol}`, count, "atom")),
        actions: ["action:chemical-bonding"],
        conditions: ["condition:stable-combination", "condition:low-risk-demo"],
        environments: ["environment:virtual-lab"],
        knowledge: ["knowledge:chemical-bonds", "knowledge:molecular-geometry"],
        explanation: `${displayName}由${atomEntries.map(([symbol, count]) => `${count} 个${symbol}`).join("、")}按特定结构组成；这里只展示组成关系。`,
        safety: "composition-only-no-real-reaction-conditions",
      }),
    ],
    sourceRefs: [{ type: "project-source", path: "content/chemistry/compound-catalog.v1.json", recordId: compound.id }],
  });
}

const materialSpecs = [
  ["wood", "木材", "natural", ["C6H12O6", "H2O"], ["木板", "木屑"]],
  ["bamboo", "竹材", "natural", ["C6H12O6", "H2O"], ["竹片", "竹纤维"]],
  ["pulp", "纸浆", "natural", ["C6H12O6", "H2O"], ["纸张", "纸板"]],
  ["cotton-fiber", "棉纤维", "natural", ["C6H12O6"], ["棉线", "棉布"]],
  ["wool-fiber", "羊毛纤维", "natural", ["C3H7NO2"], ["毛线", "毛毡"]],
  ["silk-fiber", "丝纤维", "natural", ["C3H7NO2"], ["丝线", "丝绸"]],
  ["flax-fiber", "亚麻纤维", "natural", ["C6H12O6"], ["亚麻线", "亚麻布"]],
  ["natural-rubber", "天然橡胶", "natural", ["C5H8"], ["橡胶片", "橡胶颗粒"]],
  ["leather", "皮革", "natural", ["C3H7NO2", "H2O"], ["皮革片", "皮革带"]],
  ["cork", "软木", "natural", ["C6H12O6"], ["软木片", "软木塞材"]],
  ["polyethylene", "聚乙烯", "polymer", ["C2H4"], ["聚乙烯薄膜", "聚乙烯颗粒"]],
  ["polypropylene", "聚丙烯", "polymer", ["C3H6"], ["聚丙烯片", "聚丙烯纤维"]],
  ["pvc", "聚氯乙烯", "polymer", ["C2H3Cl"], ["聚氯乙烯管材", "聚氯乙烯薄膜"]],
  ["polystyrene", "聚苯乙烯", "polymer", ["C8H8"], ["聚苯乙烯板", "聚苯乙烯泡沫"]],
  ["nylon", "尼龙", "polymer", ["C6H11NO"], ["尼龙线", "尼龙布"]],
  ["polyester", "聚酯纤维", "polymer", ["C10H8O4"], ["聚酯线", "聚酯布"]],
  ["polycarbonate", "聚碳酸酯", "polymer", ["C15H16O2"], ["聚碳酸酯板", "聚碳酸酯颗粒"]],
  ["acrylic", "有机玻璃", "polymer", ["C5H8O2"], ["有机玻璃板", "有机玻璃管"]],
  ["silicone-rubber", "硅橡胶", "polymer", ["SiO2", "C2H6O"], ["硅橡胶片", "硅橡胶密封条"]],
  ["synthetic-leather", "人造革", "polymer", ["C2H3Cl", "C2H4"], ["人造革片", "人造革带"]],
  ["glass", "普通玻璃", "mineral", ["SiO2", "Na2CO3", "CaCO3"], ["玻璃板", "玻璃珠"]],
  ["quartz-glass", "石英玻璃", "mineral", ["SiO2"], ["石英玻璃片", "石英玻璃管"]],
  ["ceramic", "陶瓷", "mineral", ["Al2O3", "SiO2"], ["陶瓷片", "陶瓷颗粒"]],
  ["porcelain", "瓷器材料", "mineral", ["Al2O3", "SiO2"], ["瓷片", "瓷粉"]],
  ["brick", "砖材", "mineral", ["SiO2", "Al2O3"], ["标准砖", "透水砖"]],
  ["cement", "水泥", "mineral", ["CaO", "SiO2"], ["水泥粉", "水泥浆"]],
  ["concrete", "混凝土", "mineral", ["CaO", "SiO2", "H2O"], ["混凝土块", "钢筋混凝土"]],
  ["gypsum", "石膏材料", "mineral", ["CaSO4", "H2O"], ["石膏粉", "石膏板"]],
  ["lime", "石灰材料", "mineral", ["CaO", "CaCO3"], ["石灰粉", "石灰浆"]],
  ["clay", "黏土", "mineral", ["Al2O3", "SiO2", "H2O"], ["黏土块", "黏土浆"]],
  ["steel", "钢", "metal", ["Fe", "C"], ["钢板", "钢丝"]],
  ["stainless-steel", "不锈钢", "metal", ["Fe", "Cr", "Ni"], ["不锈钢板", "不锈钢管"]],
  ["cast-iron", "铸铁", "metal", ["Fe", "C"], ["铸铁块", "铸铁管"]],
  ["brass", "黄铜", "metal", ["Cu", "Zn"], ["黄铜板", "黄铜丝"]],
  ["bronze", "青铜", "metal", ["Cu", "Sn"], ["青铜板", "青铜铸件"]],
  ["aluminum-alloy", "铝合金", "metal", ["Al", "Mg"], ["铝合金板", "铝合金型材"]],
  ["titanium-alloy", "钛合金", "metal", ["Ti", "Al"], ["钛合金板", "钛合金杆"]],
  ["solder", "焊锡", "metal", ["Sn", "Ag"], ["焊锡丝", "焊锡膏"]],
  ["copper", "铜材", "metal", ["Cu"], ["铜板", "铜线"]],
  ["aluminum", "铝材", "metal", ["Al"], ["铝板", "铝箔"]],
  ["graphite", "石墨材料", "composite", ["C"], ["石墨棒", "石墨粉"]],
  ["carbon-fiber", "碳纤维", "composite", ["C"], ["碳纤维布", "碳纤维板"]],
  ["glass-fiber", "玻璃纤维", "composite", ["SiO2"], ["玻璃纤维丝", "玻璃纤维布"]],
  ["foam", "泡沫塑料", "composite", ["C8H8"], ["泡沫板", "泡沫颗粒"]],
  ["sponge", "海绵材料", "composite", ["C3H6O"], ["海绵片", "海绵块"]],
  ["mortar", "砂浆", "composite", ["CaO", "SiO2", "H2O"], ["砌筑砂浆", "抹面砂浆"]],
  ["asphalt", "沥青材料", "composite", ["C", "H2O"], ["沥青块", "沥青混合料"]],
  ["pigment", "颜料", "composite", ["Fe2O3", "TiO2"], ["颜料粉", "颜料浆"]],
  ["ink", "油墨", "composite", ["C", "C2H6O"], ["黑色油墨", "彩色油墨"]],
  ["soap-base", "肥皂基", "composite", ["C18H36O2", "NaOH"], ["肥皂块料", "肥皂液基"]],
  ["liquid-water", "液态水", "bulk", ["H2O"], ["一杯水", "一池水"]],
  ["ice", "冰", "bulk", ["H2O"], ["冰块", "冰层"]],
  ["water-vapor", "水蒸气", "bulk", ["H2O"], ["一团水汽", "云雾水汽"]],
  ["air", "空气", "bulk", ["N2", "O2", "CO2"], ["一袋空气", "流动空气"]],
  ["sand", "砂", "bulk", ["SiO2"], ["一捧砂", "沙堆"]],
  ["salt", "食盐材料", "bulk", ["NaCl"], ["食盐颗粒", "盐水"]],
  ["soil-mixture", "基础土壤混合物", "bulk", ["SiO2", "H2O", "CaCO3"], ["一盆土", "土层"]],
  ["edible-oil", "食用油", "bulk", ["C18H34O2"], ["一勺食用油", "一瓶食用油"]],
  ["sugar", "糖材料", "bulk", ["C12H22O11"], ["糖粒", "糖浆"]],
  ["detergent", "洗涤剂基", "bulk", ["C12H25SO4Na"], ["洗涤剂粉", "洗涤剂液"]],
];

if (materialSpecs.length !== 60) throw new Error(`材料底座应为 60，实际 ${materialSpecs.length}`);

const materialCluster = (group) => `cluster:materials:${group}`;
const materialBaseIds = [];
for (const [key, name, group, chemicalTokens, forms] of materialSpecs) {
  const id = stableId("material", key);
  const chemicalInputs = chemicalTokens.flatMap(representativeChemicalInputs);
  const base = addNode({
    id,
    name,
    aliases: name === "普通玻璃" ? ["玻璃"] : [],
    kind: group === "bulk" ? "bulk-matter" : "material",
    levelId: "level:04-materials",
    sublevel: 1,
    clusterId: materialCluster(group),
    summary: `${name}是可继续加工、积累或组合的宏观材料节点。`,
    recipes: [recipe({
      id: `recipe:${id}:material-model`,
      type: group === "bulk" ? "aggregation-or-mixture" : "material-formation",
      outputId: id,
      inputs: chemicalInputs,
      actions: group === "bulk" ? ["action:accumulate", "action:mix"] : ["action:mix", "action:shape"],
      conditions: ["condition:enough-quantity", "condition:low-risk-demo"],
      environments: ["environment:virtual-lab"],
      knowledge: [group === "metal" ? "knowledge:metallurgy" : group === "polymer" ? "knowledge:polymer-science" : "knowledge:materials-science"],
      explanation: `${name}由若干代表性成分形成；真实材料往往还有微量成分和不同结构。`,
    })],
    sourceRefs: [{ type: "prototype-curation", note: "代表性组成，不作为工业配方" }],
  });
  materialBaseIds.push(base.id);
  forms.forEach((formName, formIndex) => {
    const formId = stableId("material", `${key}-form-${formIndex + 1}`);
    addNode({
      id: formId,
      name: formName,
      kind: "material-form",
      levelId: "level:04-materials",
      sublevel: 2,
      clusterId: materialCluster(group),
      summary: `${name}经过体量积累与外形处理得到的${formName}。`,
      recipes: [recipe({
        id: `recipe:${formId}:shape`,
        type: "physical-processing",
        outputId: formId,
        inputs: [input(id)],
        actions: ["action:accumulate", "action:shape"],
        conditions: ["condition:enough-quantity"],
        environments: ["environment:workbench"],
        knowledge: ["knowledge:measurement", "knowledge:materials-science"],
        explanation: `积累足够的${name}，再把它处理成${formName}。`,
      })],
    });
  });
}

const plants = [
  ["oak", "橡树", "橡树叶", "橡子"], ["pine", "松树", "松针", "松果"],
  ["bamboo-plant", "竹子", "竹叶", "竹笋"], ["cotton-plant", "棉花植株", "棉叶", "棉桃"],
  ["rice", "水稻", "稻叶", "稻谷"], ["wheat", "小麦", "麦叶", "麦粒"],
  ["corn", "玉米植株", "玉米叶", "玉米棒"], ["soybean", "大豆植株", "大豆叶", "大豆荚"],
  ["rapeseed", "油菜", "油菜叶", "油菜籽"], ["peanut", "花生植株", "花生叶", "花生果"],
  ["potato", "马铃薯植株", "马铃薯叶", "马铃薯块茎"], ["tomato", "番茄植株", "番茄叶", "番茄果实"],
  ["carrot", "胡萝卜植株", "胡萝卜叶", "胡萝卜根"], ["cabbage", "白菜", "白菜叶", "白菜种子"],
  ["apple-tree", "苹果树", "苹果叶", "苹果"], ["pear-tree", "梨树", "梨叶", "梨"],
  ["orange-tree", "橙树", "橙树叶", "橙子"], ["grapevine", "葡萄藤", "葡萄叶", "葡萄"],
  ["tea", "茶树", "茶叶", "茶籽"], ["coffee", "咖啡树", "咖啡叶", "咖啡果"],
  ["cocoa", "可可树", "可可叶", "可可豆荚"], ["sugarcane", "甘蔗", "甘蔗叶", "甘蔗茎"],
  ["beet", "甜菜", "甜菜叶", "甜菜根"], ["flax", "亚麻植株", "亚麻叶", "亚麻籽"],
  ["sunflower", "向日葵", "向日葵叶", "葵花籽"], ["lotus", "荷花", "荷叶", "莲藕"],
  ["reed", "芦苇", "芦苇叶", "芦苇秆"], ["moss", "苔藓", "苔藓叶状体", "苔藓孢子体"],
  ["fern", "蕨类植物", "蕨叶", "蕨类孢子囊"], ["seaweed", "海藻", "海藻叶状体", "海藻孢子"],
];
const animals = [
  ["cow", "牛", "牛毛", "牛奶"], ["sheep", "羊", "羊毛", "羊奶"],
  ["goat", "山羊", "山羊毛", "山羊奶"], ["pig", "猪", "猪毛", "猪蹄印"],
  ["chicken", "鸡", "鸡羽毛", "鸡蛋"], ["duck", "鸭", "鸭羽毛", "鸭蛋"],
  ["goose", "鹅", "鹅羽毛", "鹅蛋"], ["rabbit", "兔", "兔毛", "兔足印"],
  ["horse", "马", "马毛", "马蹄印"], ["silkworm", "蚕", "蚕丝", "蚕茧"],
  ["bee", "蜜蜂", "蜂蜡", "蜂蜜"], ["fish", "鱼", "鱼鳞", "鱼卵"],
  ["shrimp", "虾", "虾壳", "虾卵"], ["crab", "螃蟹", "蟹壳", "蟹卵"],
  ["earthworm", "蚯蚓", "蚯蚓粪土", "蚯蚓卵茧"],
];
const microbes = [
  ["yeast", "酵母菌", "酵母菌落", "酵母生物质"],
  ["lactic-bacteria", "乳酸菌", "乳酸菌落", "乳酸菌发酵物"],
  ["cyanobacteria", "蓝细菌", "蓝细菌群落", "蓝细菌生物膜"],
  ["mold", "霉菌", "霉菌菌落", "霉菌孢子群"],
  ["plankton", "浮游微生物", "浮游微生物群落", "浮游生物团"],
];
if (plants.length !== 30 || animals.length !== 15 || microbes.length !== 5) {
  throw new Error("生命节点底座数量错误");
}

function addLifeTriples(entries, kind) {
  const clusterId = `cluster:life:${kind}`;
  for (const [key, name, partOne, partTwo] of entries) {
    const id = stableId(kind, key);
    const isPlant = kind === "plant";
    const isMicrobe = kind === "microbe";
    addNode({
      id,
      name,
      kind: `${kind}-organism`,
      levelId: "level:05-life",
      sublevel: 1,
      clusterId,
      summary: `${name}是一个生命节点，会在合适环境中生长并形成组织。`,
      recipes: [recipe({
        id: `recipe:${id}:growth`,
        type: "biological-growth",
        outputId: id,
        inputs: isPlant
          ? [input(findNodeId("液态水")), input(findNodeId("空气")), input(findNodeId("基础土壤混合物"))]
          : isMicrobe
            ? [input(findNodeId("液态水")), input(findCompound("C6H12O6"))]
            : [input(findNodeId("液态水")), input(findCompound("C6H12O6")), input(findNodeId("空气"))],
        actions: ["action:grow", ...(isPlant ? ["action:photosynthesis"] : [])],
        conditions: ["condition:suitable-temperature", "condition:suitable-moisture"],
        environments: [isPlant ? "environment:garden" : isMicrobe ? "environment:virtual-lab" : "environment:farm"],
        knowledge: [isPlant ? "knowledge:plant-biology" : isMicrobe ? "knowledge:microbiology" : "knowledge:animal-biology"],
        explanation: `${name}需要物质、能量和合适环境，在一段时间中生长。`,
      })],
    });
    for (const [partIndex, partName] of [partOne, partTwo].entries()) {
      const partId = stableId(kind, `${key}-part-${partIndex + 1}`);
      addNode({
        id: partId,
        name: partName,
        kind: `${kind}-product-or-tissue`,
        levelId: "level:05-life",
        sublevel: 2,
        clusterId,
        summary: `${partName}来自${name}的生长、组织形成或自然产出。`,
        recipes: [recipe({
          id: `recipe:${partId}:from-organism`,
          type: "biological-formation",
          outputId: partId,
          inputs: [input(id)],
          actions: ["action:grow", "action:separate"],
          conditions: ["condition:long-time"],
          environments: [isPlant ? "environment:garden" : isMicrobe ? "environment:virtual-lab" : "environment:farm"],
          knowledge: [isPlant ? "knowledge:plant-biology" : isMicrobe ? "knowledge:microbiology" : "knowledge:animal-biology"],
          explanation: `${name}生长后形成或产出${partName}。`,
        })],
      });
    }
  }
}
addLifeTriples(plants, "plant");
addLifeTriples(animals, "animal");
addLifeTriples(microbes, "microbe");

const componentSpecs = [
  ["screw", "螺钉", "mechanical"], ["bolt", "螺栓", "mechanical"],
  ["nut", "螺母", "mechanical"], ["gear", "齿轮", "mechanical"],
  ["spring", "弹簧", "mechanical"], ["bearing", "轴承", "mechanical"],
  ["hinge", "铰链", "mechanical"], ["wheel", "轮子", "mechanical"],
  ["axle", "车轴", "mechanical"], ["pulley", "滑轮", "mechanical"],
  ["chain", "链条", "mechanical"], ["brake", "制动器", "mechanical"],
  ["handle", "把手", "mechanical"], ["key", "机械按键", "mechanical"],
  ["blade", "刀片", "mechanical"],
  ["wire", "导线", "electrical"], ["cable", "电缆", "electrical"],
  ["switch", "开关", "electrical"], ["plug", "插头", "electrical"],
  ["socket", "插座", "electrical"], ["battery", "电池单元", "electrical"],
  ["lamp", "发光单元", "electrical"], ["motor", "电动机", "electrical"],
  ["generator-unit", "发电单元", "electrical"], ["circuit-board", "电路板", "electrical"],
  ["chip", "芯片", "electrical"], ["display", "显示屏", "electrical"],
  ["speaker", "扬声器", "electrical"], ["microphone", "麦克风", "electrical"],
  ["antenna", "天线", "electrical"],
  ["lens", "透镜", "optical"], ["mirror", "反射镜", "optical"],
  ["prism", "棱镜", "optical"], ["camera-sensor", "图像传感器", "optical"],
  ["temperature-sensor", "温度传感器", "optical"], ["distance-sensor", "距离传感器", "optical"],
  ["fabric-panel", "织物片", "textile"], ["zipper", "拉链", "textile"],
  ["strap", "带子", "textile"], ["buckle", "搭扣", "textile"],
  ["cushion", "软垫", "textile"], ["brush-head", "刷头", "textile"],
  ["frame", "框架", "structural"], ["panel", "面板", "structural"],
  ["beam", "梁", "structural"], ["column", "柱", "structural"],
  ["pipe", "管道", "structural"], ["valve", "阀门", "structural"],
  ["tank", "容器罐", "structural"], ["seal", "密封圈", "structural"],
  ["window-unit", "窗户单元", "structural"], ["door-unit", "门单元", "structural"],
  ["shelf-unit", "搁板", "structural"], ["container-shell", "容器外壳", "structural"],
  ["connector", "连接器", "structural"],
];
if (componentSpecs.length !== 55) throw new Error(`构件底座应为 55，实际 ${componentSpecs.length}`);
const componentPrefixes = ["微型", "标准", "大型", "精密"];
const componentIds = [];
for (const [key, name, group] of componentSpecs) {
  for (const [variantIndex, prefix] of componentPrefixes.entries()) {
    const id = stableId("component", `${key}-${variantIndex + 1}`);
    const materialInput = materialBaseIds[(componentIds.length * 7 + variantIndex) % materialBaseIds.length];
    addNode({
      id,
      name: `${prefix}${name}`,
      kind: "reusable-component",
      levelId: "level:06-components",
      sublevel: variantIndex + 1,
      clusterId: `cluster:components:${group}`,
      summary: `${prefix}${name}是可被多种用品和机器复用的基础构件。`,
      recipes: [recipe({
        id: `recipe:${id}:fabrication`,
        type: "component-fabrication",
        outputId: id,
        inputs: [input(materialInput)],
        actions: ["action:shape", "action:cut"],
        conditions: ["condition:clean-material"],
        environments: ["environment:workbench"],
        knowledge: [group === "electrical" ? "knowledge:circuits" : group === "optical" ? "knowledge:optics" : group === "textile" ? "knowledge:textiles" : "knowledge:mechanical-design"],
        explanation: `选择合适材料并成型，得到${prefix}${name}。`,
      })],
    });
    componentIds.push(id);
  }
}

const dailyGroups = {
  furniture: ["桌子", "椅子", "书架", "床", "衣柜", "沙发", "茶几", "凳子", "书桌", "餐桌", "床头柜", "屏风"],
  textile: ["枕头", "被子", "床单", "窗帘", "地毯", "毛巾", "雨伞", "购物袋"],
  kitchen: ["杯子", "玻璃杯", "碗", "盘子", "筷子", "勺子", "锅", "水壶", "菜刀", "砧板", "保鲜盒", "烤盘"],
  stationery: ["铅笔", "钢笔", "橡皮", "尺子", "剪刀", "订书机", "书本", "笔记本", "画笔", "文具盒"],
  cleaning: ["肥皂", "牙刷", "牙膏", "洗发水", "拖把", "扫帚", "水桶", "垃圾桶"],
  clothing: ["T恤", "衬衫", "裤子", "裙子", "外套", "帽子", "鞋子", "袜子", "手套", "围巾"],
  play: ["积木", "拼图", "玩偶", "风筝", "足球", "篮球", "羽毛球拍", "跳绳", "滑板", "望远镜"],
  "music-science": ["吉他", "钢琴", "鼓", "显微镜", "地球仪"],
};
const dailyVariantPrefixes = ["", "儿童", "便携", "专业"];
const dailyBaseCount = Object.values(dailyGroups).flat().length;
if (dailyBaseCount !== 75) throw new Error(`生活用品底座应为 75，实际 ${dailyBaseCount}`);
let dailySerial = 0;
const dailyIds = [];
for (const [group, names] of Object.entries(dailyGroups)) {
  for (const baseName of names) {
    const baseKey = `daily-${String(dailySerial + 1).padStart(3, "0")}`;
    for (const [variantIndex, prefix] of dailyVariantPrefixes.entries()) {
      const name = baseName === "椅子" && variantIndex === 1
        ? "塑料椅子"
        : `${prefix}${baseName}`;
      const id = stableId("object", `${semanticKey(baseName)}-${variantIndex + 1}`);
      const firstComponent = componentIds[(dailySerial * 5 + variantIndex) % componentIds.length];
      const secondComponent = componentIds[(dailySerial * 11 + variantIndex + 17) % componentIds.length];
      const materialId = materialBaseIds[(dailySerial * 3 + variantIndex) % materialBaseIds.length];
      addNode({
        id,
        name,
        kind: "daily-object",
        levelId: "level:07-daily",
        clusterId: `cluster:daily:${group}`,
        summary: `${name}是由材料与可复用构件组合成的生活用品。`,
        recipes: [recipe({
          id: `recipe:${id}:assembly`,
          type: "object-assembly",
          outputId: id,
          inputs: [input(materialId), input(firstComponent), input(secondComponent)],
          actions: ["action:join", "action:assemble"],
          conditions: ["condition:compatible-parts", "condition:structural-balance"],
          environments: ["environment:workbench"],
          knowledge: [group === "textile" || group === "clothing" ? "knowledge:textiles" : group === "music-science" ? "knowledge:measurement" : "knowledge:simple-machines"],
          explanation: `把合适的材料和构件连接起来，形成${name}。`,
        })],
      });
      dailyIds.push(id);
    }
    dailySerial += 1;
  }
}

const machineGroups = {
  transport: ["自行车", "电动自行车", "摩托车", "汽车", "公交车", "卡车", "救护车", "消防车", "火车", "地铁列车", "有轨电车", "轮船", "帆船", "潜水艇", "飞机"],
  appliance: ["电风扇", "洗衣机", "冰箱", "空调", "吸尘器", "电饭锅", "烤箱", "微波炉", "电灯", "电视机", "相机", "打印机"],
  computing: ["计算器", "电影", "手机", "平板电脑", "笔记本电脑", "计算机", "服务器", "电子游戏", "机器人", "人工智能"],
  industrial: ["水泵", "发电机", "起重机", "挖掘机", "推土机", "拖拉机", "机床", "3D打印机", "风力发电机", "太阳能发电站"],
  defense: ["坦克", "装甲车", "大炮", "雷达车", "运输直升机", "巡逻艇", "工程保障车", "无人侦察机"],
};
const machineVariants = {
  transport: ["", "电动", "无人", "教学模型"],
  appliance: ["", "迷你", "节能", "智能"],
  computing: ["", "便携", "高性能", "教学模型"],
  industrial: ["", "小型", "自动化", "教学模型"],
  defense: ["", "轻型", "展示用", "博物馆模型"],
};
const machineBaseCount = Object.values(machineGroups).flat().length;
if (machineBaseCount !== 55) throw new Error(`机器底座应为 55，实际 ${machineBaseCount}`);
let machineSerial = 0;
const machineIds = [];
for (const [group, names] of Object.entries(machineGroups)) {
  for (const baseName of names) {
    for (const [variantIndex, prefix] of machineVariants[group].entries()) {
      const name = variantIndex === 0 ? baseName : `${prefix}${baseName}款`;
      const id = stableId("machine", `${group}-${semanticKey(baseName)}-${variantIndex + 1}`);
      const selectedComponents = [0, 1, 2, 3].map(
        (offset) => componentIds[(machineSerial * 13 + variantIndex * 5 + offset * 19) % componentIds.length],
      );
      const digitalCreationInputs = baseName === "电影"
        ? [findNodeId("相机"), ...selectedComponents.slice(0, 2)]
        : baseName === "电子游戏"
          ? [findNodeId("计算机"), ...selectedComponents.slice(0, 2)]
          : baseName === "人工智能"
            ? [findNodeId("计算机"), findNodeId("服务器"), ...selectedComponents.slice(0, 1)]
            : selectedComponents;
      const knowledgeIds = baseName === "电影"
        ? ["knowledge:film", "knowledge:animation", "knowledge:graphics"]
        : baseName === "电子游戏"
          ? ["knowledge:game-design", "knowledge:data-structures", "knowledge:algorithms", "knowledge:graphics"]
          : baseName === "人工智能"
            ? ["knowledge:linear-algebra", "knowledge:probability", "knowledge:data-structures", "knowledge:algorithms", "knowledge:machine-learning", "knowledge:neural-networks"]
            : group === "transport"
        ? [baseName === "飞机" ? "knowledge:aerodynamics" : baseName.includes("船") || baseName === "潜水艇" ? "knowledge:fluid-mechanics" : "knowledge:vehicle-engineering", "knowledge:mechanics"]
        : group === "computing"
          ? ["knowledge:computer-architecture", "knowledge:data-structures", "knowledge:algorithms"]
          : group === "appliance"
            ? ["knowledge:circuits", "knowledge:thermodynamics"]
            : group === "industrial"
              ? ["knowledge:mechanical-design", "knowledge:manufacturing"]
              : ["knowledge:mechanics", "knowledge:control-theory"];
      addNode({
        id,
        name,
        kind: ["电影", "电子游戏", "人工智能"].includes(baseName)
          ? "digital-creation-or-system"
          : group === "defense" ? "equipment-concept" : "machine-or-vehicle",
        levelId: "level:08-machines",
        clusterId: `cluster:machines:${group}`,
        summary: group === "defense"
          ? `${name}仅作为工程组成与历史展示节点，不包含弹药、危险配方或可执行制造参数。`
          : `${name}由多类构件组成，并依靠能量与控制协同工作。`,
        tags: group === "defense" ? ["high-level-only", "no-operational-details"] : [],
        recipes: [recipe({
          id: `recipe:${id}:system-assembly`,
          type: "machine-system-assembly",
          outputId: id,
          inputs: digitalCreationInputs.map((componentId) => input(componentId)),
          actions: ["action:join", "action:assemble"],
          conditions: ["condition:compatible-parts", "condition:energy-supply", "condition:low-risk-demo"],
          environments: ["environment:factory"],
          knowledge: knowledgeIds,
          explanation: `把结构、动力、控制和功能构件组成${name}的高层模型。`,
          safety: group === "defense" ? "display-only-no-weapons-construction-details" : "child-friendly-conceptual-model",
        })],
      });
      machineIds.push(id);
    }
    machineSerial += 1;
  }
}

const spaceGroups = {
  home: ["书房", "卧室", "客厅", "餐厅", "厨房", "卫生间", "儿童房", "游戏室", "音乐室", "画室", "储藏室", "洗衣房", "车库"],
  learning: ["实验室", "教室", "图书室", "办公室", "会议室", "医务室", "健身房", "车间", "机房", "温室", "展厅", "录音室", "演播室", "控制室", "观察室", "天文台观测室"],
  public: ["电影院", "剧场", "餐馆", "商店", "超市", "咖啡馆", "车站候车室", "机场候机厅", "船舱", "驾驶舱", "安全避难室"],
};
if (Object.values(spaceGroups).flat().length !== 40) throw new Error("空间底座应为 40");
const spaceIds = [];
let spaceSerial = 0;
for (const [group, names] of Object.entries(spaceGroups)) {
  for (const baseName of names) {
    for (const [variantIndex, prefix] of ["", "紧凑型"].entries()) {
      const name = `${prefix}${baseName}`;
      const id = stableId("space", `${semanticKey(baseName)}-${variantIndex + 1}`);
      const selectedObjects = [0, 1, 2, 3].map(
        (offset) => dailyIds[(spaceSerial * 17 + variantIndex * 7 + offset * 23) % dailyIds.length],
      );
      addNode({
        id,
        name,
        kind: "functional-space",
        levelId: "level:09-spaces",
        clusterId: `cluster:spaces:${group}`,
        summary: `${name}通过家具、用品、设备和动线形成明确功能。`,
        recipes: [recipe({
          id: `recipe:${id}:layout`,
          type: "spatial-composition",
          outputId: id,
          inputs: selectedObjects.map((objectId) => input(objectId, 1, "placed-object")),
          actions: ["action:organize-space"],
          conditions: ["condition:structural-balance"],
          environments: ["environment:city"],
          knowledge: ["knowledge:interior-design"],
          explanation: `把适合的用品和设施布置好，形成${name}。`,
        })],
      });
      spaceIds.push(id);
    }
    spaceSerial += 1;
  }
}

const buildingGroups = {
  home: ["房子", "楼房", "农舍", "车库楼", "酒店"],
  culture: ["学校", "幼儿园", "图书馆", "博物馆", "科技馆", "美术馆", "音乐厅", "剧院", "电影院建筑", "体育馆", "游泳馆", "实验楼"],
  service: ["医院", "诊所", "办公楼", "商场", "超市建筑", "餐厅建筑", "消防站", "警察局", "火车站", "地铁站", "汽车站", "机场航站楼", "港口码头", "电视塔", "灯塔"],
  industry: ["工厂", "仓库", "发电站", "水厂", "污水处理厂", "温室大棚", "谷仓", "数据中心"],
};
if (Object.values(buildingGroups).flat().length !== 40) throw new Error("建筑底座应为 40");
const buildingIds = [];
let buildingSerial = 0;
for (const [group, names] of Object.entries(buildingGroups)) {
  for (const baseName of names) {
    for (const [variantIndex, prefix] of ["", "模块化"].entries()) {
      const name = `${prefix}${baseName}`;
      const id = stableId("building", `${semanticKey(baseName)}-${variantIndex + 1}`);
      const selectedSpaces = [0, 1, 2].map(
        (offset) => spaceIds[(buildingSerial * 7 + variantIndex * 3 + offset * 13) % spaceIds.length],
      );
      addNode({
        id,
        name,
        kind: "building-or-facility",
        levelId: "level:10-buildings",
        clusterId: `cluster:buildings:${group}`,
        summary: `${name}由功能空间、承重结构和基础设施共同组成。`,
        recipes: [recipe({
          id: `recipe:${id}:construction`,
          type: "building-construction",
          outputId: id,
          inputs: [...selectedSpaces.map((spaceId) => input(spaceId)), input(findNodeId("钢筋混凝土"))],
          actions: ["action:construct"],
          conditions: ["condition:structural-balance", "condition:compatible-parts"],
          environments: ["environment:city"],
          knowledge: ["knowledge:architecture", "knowledge:structural-engineering"],
          explanation: `把多个功能空间和结构材料组织起来，形成${name}。`,
        })],
      });
      buildingIds.push(id);
    }
    buildingSerial += 1;
  }
}

const systemNames = [
  "居住社区", "学校校园", "大学校园", "医院园区", "工业园区", "科技园区", "商业街区", "步行街", "城市街区", "村庄", "小镇", "城市",
  "道路网络", "桥梁网络", "地铁网络", "铁路网络", "机场系统", "港口系统", "电力网络", "供水网络", "污水处理网络", "垃圾回收系统", "通信网络", "互联网", "数据中心集群", "物流网络", "公共交通系统", "消防救援系统", "医疗急救系统", "气象监测系统", "农田灌溉系统",
  "农场系统", "牧场系统", "果园系统", "森林管理系统", "矿区系统", "钢铁生产系统", "化工生产系统", "汽车制造系统", "飞机制造系统", "船舶制造系统", "建筑工地系统", "航天发射中心", "天文台阵列", "科学考察基地",
];
if (systemNames.length !== 45) throw new Error(`系统节点应为 45，实际 ${systemNames.length}`);
const systemIds = [];
systemNames.forEach((name, index) => {
  const id = stableId("system", semanticKey(name));
  const group = index < 12 ? "settlement" : index < 31 ? "network" : "production";
  const inputs = [0, 1, 2, 3].map((offset) => input(buildingIds[(index * 9 + offset * 11) % buildingIds.length]));
  addNode({
    id,
    name,
    kind: "societal-or-production-system",
    levelId: "level:11-systems",
    clusterId: `cluster:systems:${group}`,
    summary: `${name}让多个建筑、设施和网络协同完成更宏观的任务。`,
    recipes: [recipe({
      id: `recipe:${id}:network`,
      type: "networked-system-composition",
      outputId: id,
      inputs,
      actions: ["action:connect-network"],
      conditions: ["condition:compatible-parts", "condition:energy-supply"],
      environments: ["environment:city"],
      knowledge: [index === 23 ? "knowledge:computer-networks" : index === 24 ? "knowledge:computer-architecture" : index < 31 ? "knowledge:urban-planning" : "knowledge:manufacturing"],
      explanation: `连接相关建筑、设施和服务，形成${name}。`,
    })],
  });
  systemIds.push(id);
});

const geographyGroups = {
  soil: ["红土", "黑土", "黄土", "高岭土", "砂质土", "黏质土", "泥炭土", "盐碱土", "砖红壤", "水稻土", "紫色土", "石灰土", "火山灰土", "冻土", "森林土"],
  ecosystem: ["森林生态系统", "草原生态系统", "湿地生态系统", "湖泊生态系统", "河流生态系统", "河口生态系统", "珊瑚礁生态系统", "海洋生态系统", "农田生态系统", "果园生态系统", "荒漠生态系统", "苔原生态系统", "高山草甸生态系统", "沼泽生态系统", "红树林生态系统"],
  landform: ["山地", "丘陵", "高原", "平原", "盆地", "山谷", "峡谷", "峡湾", "喀斯特地貌", "洞穴", "沙丘", "雅丹地貌", "三角洲", "冲积扇", "海滩", "海蚀崖", "岛屿", "火山", "冰川", "盐碱地"],
};
if (Object.values(geographyGroups).flat().length !== 50) throw new Error("地理节点应为 50");
const geographyIds = [];
let geographySerial = 0;
for (const [group, names] of Object.entries(geographyGroups)) {
  for (const name of names) {
    const id = stableId("geography", semanticKey(name));
    const isSoil = group === "soil";
    const isEcosystem = group === "ecosystem";
    const specialAction = name === "峡湾" ? "action:erode" : name === "雅丹地貌" ? "action:erode" : name.includes("三角洲") || name.includes("冲积") ? "action:deposit" : name.includes("冰川") ? "action:freeze-thaw" : isSoil ? "action:weather" : isEcosystem ? "action:grow" : "action:weather";
    const specialEnvironment = name === "峡湾" || name.includes("冰川") ? "environment:glacier" : name === "雅丹地貌" || name.includes("沙") ? "environment:wind-field" : name.includes("河") || name.includes("三角洲") || name.includes("冲积") ? "environment:river-system" : name.includes("海") || name.includes("岛") || name.includes("珊瑚") ? "environment:ocean" : isEcosystem ? "environment:forest" : "environment:underground";
    const nodeInputs = isSoil
      ? [input(findNodeId("基础土壤混合物")), input(findNodeId("液态水")), input(findCompound(name === "红土" || name === "砖红壤" ? "Fe2O3" : name === "高岭土" ? "Al2O3" : name.includes("石灰") ? "CaCO3" : "SiO2"))]
      : isEcosystem
        ? [input(findNodeId("基础土壤混合物")), input("plant:oak"), input("animal:earthworm")]
        : [input(findNodeId("黏土")), input(findNodeId("砂")), input(findNodeId("液态水"))];
    addNode({
      id,
      name,
      kind: isSoil ? "soil-type" : isEcosystem ? "ecosystem" : "landform",
      levelId: "level:12-geography",
      clusterId: `cluster:geography:${group}`,
      summary: `${name}由物质基础、环境作用和时间共同形成。`,
      properties: isSoil ? {
        representativeMinerals: ["SiO2", name === "红土" || name === "砖红壤" ? "Fe2O3" : "Al2O3", "H2O"],
        note: "仅列常见代表性成分；真实土壤随地点显著变化。",
      } : undefined,
      recipes: [recipe({
        id: `recipe:${id}:natural-formation`,
        type: isSoil ? "soil-formation" : isEcosystem ? "ecosystem-formation" : "geological-formation",
        outputId: id,
        inputs: nodeInputs,
        actions: [specialAction, ...(name === "峡湾" ? ["action:freeze-thaw"] : []), ...(name === "雅丹地貌" ? ["action:weather"] : [])],
        conditions: ["condition:long-time", "condition:repeated-cycles"],
        environments: [specialEnvironment],
        knowledge: [isSoil ? "knowledge:soil-science" : isEcosystem ? "knowledge:ecology" : "knowledge:geomorphology"],
        explanation: name === "峡湾"
          ? "冰川长期侵蚀山谷，冰川退去后海水进入，形成狭长而陡峭的峡湾。"
          : name === "雅丹地貌"
            ? "干旱地区的松散地层经历长期风化和风蚀，逐渐留下条带状、垄岗状地貌。"
            : `${name}在合适环境中经过长期、反复的自然作用形成。`,
      })],
    });
    geographyIds.push(id);
    geographySerial += 1;
  }
}

const planetaryNames = [
  "流域", "大型河流盆地", "海岸带", "山脉", "高原区域", "沙漠区域", "极地冰盖", "大陆架", "大洋盆地", "群岛",
  "大陆", "海洋", "岩石圈", "水圈", "大气圈", "生物圈", "地球表层系统", "类地行星", "气态巨行星", "宜居行星模型",
];
const planetaryIds = [];
planetaryNames.forEach((name, index) => {
  const id = stableId("planetary", semanticKey(name));
  const inputs = [0, 1, 2, 3].map((offset) => input(geographyIds[(index * 5 + offset * 7) % geographyIds.length]));
  addNode({
    id,
    name,
    kind: index < 10 ? "regional-surface-system" : index < 17 ? "planetary-sphere" : "planet-type",
    levelId: "level:13-planets",
    clusterId: index < 10 ? "cluster:planets:surface" : "cluster:planets:sphere",
    summary: `${name}把许多地貌、生态或圈层组织成更大尺度的整体。`,
    recipes: [recipe({
      id: `recipe:${id}:macro-composition`,
      type: "planetary-scale-composition",
      outputId: id,
      inputs,
      actions: ["action:accumulate"],
      conditions: ["condition:long-time", "condition:gravitational-balance"],
      environments: ["environment:near-earth-space"],
      knowledge: [index < 10 ? "knowledge:geology" : "knowledge:plate-tectonics", "knowledge:meteorology"],
      explanation: `许多相互连接的地表单元和物质循环共同形成${name}。`,
    })],
  });
  planetaryIds.push(id);
});

const stellarNames = ["行星系统", "卫星系统", "小行星带", "彗星群", "原行星盘", "恒星", "双星系统", "疏散星团", "球状星团", "星云"];
const stellarIds = [];
stellarNames.forEach((name, index) => {
  const id = stableId("stellar", semanticKey(name));
  const inputIds = index === 5
    ? ["element:H", "element:He"]
    : [planetaryIds[index % planetaryIds.length], planetaryIds[(index * 3 + 7) % planetaryIds.length]];
  addNode({
    id,
    name,
    kind: "astronomical-system",
    levelId: "level:14-stars",
    clusterId: "cluster:stars:system",
    summary: `${name}是由天体、气体、尘埃和引力关系形成的宏观结构。`,
    recipes: [recipe({
      id: `recipe:${id}:gravity`,
      type: "astronomical-formation",
      outputId: id,
      inputs: inputIds.map((nodeId) => input(nodeId)),
      actions: ["action:orbit-aggregate"],
      conditions: ["condition:long-time", "condition:gravitational-balance"],
      environments: ["environment:interplanetary-space"],
      knowledge: ["knowledge:astronomy", "knowledge:orbital-mechanics", ...(index === 5 ? ["knowledge:stellar-evolution"] : [])],
      explanation: `在引力和漫长时间作用下形成${name}的概念模型。`,
    })],
  });
  stellarIds.push(id);
});

const universeNames = ["类太阳恒星系统", "类银河系", "旋涡星系", "椭圆星系", "星系群", "可观测宇宙"];
const universeIds = [];
universeNames.forEach((name, index) => {
  const id = stableId("universe", semanticKey(name));
  const inputs = index < 4
    ? [input(stellarIds[index % stellarIds.length]), input(stellarIds[(index + 6) % stellarIds.length])]
    : index === 4
      ? [input(universeIds[1]), input(universeIds[2]), input(universeIds[3])]
      : [input(universeIds[4])];
  addNode({
    id,
    name,
    kind: "cosmic-large-scale-structure",
    levelId: "level:15-universe",
    clusterId: "cluster:universe:large-scale",
    summary: `${name}把无数天体系统放进更宏大的宇宙尺度中理解。`,
    recipes: [recipe({
      id: `recipe:${id}:cosmic-composition`,
      type: "cosmic-scale-composition",
      outputId: id,
      inputs,
      actions: ["action:orbit-aggregate"],
      conditions: ["condition:long-time", "condition:gravitational-balance"],
      environments: ["environment:interstellar-space"],
      knowledge: ["knowledge:astronomy", "knowledge:cosmology"],
      explanation: `大量天体和系统在广阔空间中共同构成${name}。`,
    })],
  });
  universeIds.push(id);
});

function replaceCoreRecipe(nodeName, recipeDefinition) {
  const node = nodeByName.get(nodeName);
  if (!node) throw new Error(`无法策划核心配方，缺少节点：${nodeName}`);
  node.recipes = [recipe({
    id: `recipe:${node.id}:curated-core`,
    outputId: node.id,
    ...recipeDefinition,
  })];
}

replaceCoreRecipe("桌子", {
  type: "curated-object-assembly",
  inputs: [input(findNodeId("木板")), input(findNodeId("标准框架")), input(findNodeId("标准螺钉"))],
  actions: ["action:join", "action:assemble"],
  conditions: ["condition:compatible-parts", "condition:structural-balance"],
  environments: ["environment:workbench"],
  knowledge: ["knowledge:woodworking", "knowledge:measurement"],
  explanation: "把木板固定在稳定框架上，并用连接件组合成桌子。",
});

replaceCoreRecipe("塑料椅子", {
  type: "curated-material-shaping",
  inputs: [input(findNodeId("聚丙烯"))],
  actions: ["action:accumulate", "action:shape", "action:cool"],
  conditions: ["condition:enough-quantity", "condition:structural-balance"],
  environments: ["environment:factory"],
  knowledge: ["knowledge:polymer-science", "knowledge:materials-science"],
  explanation: "积累足够的聚丙烯材料，成型并冷却为能够稳定承重的塑料椅子。",
});

replaceCoreRecipe("玻璃杯", {
  type: "curated-material-shaping",
  inputs: [input(findNodeId("普通玻璃"))],
  actions: ["action:melt", "action:shape", "action:cool"],
  conditions: ["condition:clean-material", "condition:low-risk-demo"],
  environments: ["environment:factory"],
  knowledge: ["knowledge:ceramics", "knowledge:safety"],
  explanation: "把玻璃材料形成中空杯形并冷却；游戏只表达高层过程，不提供高温操作参数。",
});

replaceCoreRecipe("铅笔", {
  type: "curated-object-assembly",
  inputs: [input(findNodeId("木材")), input(findNodeId("石墨棒")), input(findNodeId("颜料"))],
  actions: ["action:cut", "action:shape", "action:join"],
  conditions: ["condition:compatible-parts"],
  environments: ["environment:workbench"],
  knowledge: ["knowledge:woodworking", "knowledge:materials-science"],
  explanation: "用木材包住石墨芯并形成适合握持的外形，再加上外层颜色。",
});

replaceCoreRecipe("肥皂", {
  type: "curated-material-shaping",
  inputs: [input(findNodeId("肥皂基"))],
  actions: ["action:accumulate", "action:shape", "action:cool"],
  conditions: ["condition:low-risk-demo"],
  environments: ["environment:workbench"],
  knowledge: ["knowledge:materials-science", "knowledge:safety"],
  explanation: "使用已经安全制备好的肥皂基进行积累、成型和冷却，得到肥皂块。",
});

replaceCoreRecipe("书房", {
  type: "curated-spatial-composition",
  inputs: [input(findNodeId("书桌"), 1, "placed-object"), input(findNodeId("椅子"), 1, "placed-object"), input(findNodeId("书本"), 1, "placed-object"), input(findNodeId("电灯"), 1, "placed-object")],
  actions: ["action:organize-space"],
  conditions: ["condition:energy-supply", "condition:structural-balance"],
  environments: ["environment:city"],
  knowledge: ["knowledge:interior-design", "knowledge:electricity"],
  explanation: "把书桌、椅子、书本和电灯合理布置，形成适合阅读与学习的书房。",
});

replaceCoreRecipe("卧室", {
  type: "curated-spatial-composition",
  inputs: [input(findNodeId("床"), 1, "placed-object"), input(findNodeId("枕头"), 1, "placed-object"), input(findNodeId("被子"), 1, "placed-object"), input(findNodeId("电灯"), 1, "placed-object")],
  actions: ["action:organize-space"],
  conditions: ["condition:energy-supply", "condition:structural-balance"],
  environments: ["environment:city"],
  knowledge: ["knowledge:interior-design"],
  explanation: "把床、枕头、被子和照明安排好，形成适合休息的卧室。",
});

replaceCoreRecipe("房子", {
  type: "curated-building-construction",
  inputs: [input(findNodeId("卧室")), input(findNodeId("客厅")), input(findNodeId("厨房")), input(findNodeId("卫生间")), input(findNodeId("钢筋混凝土"))],
  actions: ["action:construct"],
  conditions: ["condition:structural-balance", "condition:compatible-parts"],
  environments: ["environment:city"],
  knowledge: ["knowledge:architecture", "knowledge:structural-engineering", "knowledge:water-systems"],
  explanation: "把卧室、客厅、厨房和卫生间放进安全稳定的建筑结构中，形成房子。",
});

replaceCoreRecipe("电影", {
  type: "curated-digital-creation",
  inputs: [input(findNodeId("相机")), input(findNodeId("计算机")), input(findNodeId("标准麦克风"))],
  actions: ["action:assemble"],
  conditions: ["condition:energy-supply"],
  environments: ["environment:virtual-lab"],
  knowledge: ["knowledge:film", "knowledge:animation", "knowledge:graphics", "knowledge:acoustics"],
  explanation: "用拍摄与录音设备获取素材，再借助计算机和电影知识组织画面、声音与故事。",
});

replaceCoreRecipe("电子游戏", {
  type: "curated-digital-creation",
  inputs: [input(findNodeId("计算机")), input(findNodeId("标准显示屏")), input(findNodeId("标准扬声器"))],
  actions: ["action:assemble"],
  conditions: ["condition:energy-supply"],
  environments: ["environment:virtual-lab"],
  knowledge: ["knowledge:game-design", "knowledge:data-structures", "knowledge:algorithms", "knowledge:graphics", "knowledge:acoustics"],
  explanation: "在计算机上把玩法规则、程序、图形和声音组织起来，形成电子游戏。",
});

replaceCoreRecipe("人工智能", {
  type: "curated-digital-system",
  inputs: [input(findNodeId("计算机")), input(findNodeId("服务器"))],
  actions: ["action:connect-network", "action:assemble"],
  conditions: ["condition:energy-supply", "condition:low-risk-demo"],
  environments: ["environment:virtual-lab"],
  knowledge: ["knowledge:linear-algebra", "knowledge:probability", "knowledge:statistics", "knowledge:data-structures", "knowledge:algorithms", "knowledge:machine-learning", "knowledge:neural-networks"],
  explanation: "把计算资源、算法和已经学会的数学与机器学习知识组织成人工智能系统的概念模型。",
});

const allResourceIds = new Set(Object.values(resources).flat().map((resource) => resource.id));
const recipeIds = new Set();
for (const node of nodes) {
  if (!levelOrderById.has(node.levelId)) throw new Error(`未知层级：${node.id} -> ${node.levelId}`);
  if (!clusters.some((cluster) => cluster.id === node.clusterId)) throw new Error(`未知聚类：${node.id} -> ${node.clusterId}`);
  if (node.levelId !== "level:01-particles" && node.recipes.length === 0) {
    throw new Error(`非底层节点缺少配方：${node.id}`);
  }
  for (const item of node.recipes) {
    if (recipeIds.has(item.id)) throw new Error(`重复配方 ID：${item.id}`);
    recipeIds.add(item.id);
    if (!item.outputs.some((output) => output.nodeId === node.id)) throw new Error(`配方输出不包含自身：${item.id}`);
    for (const recipeInput of item.inputs) {
      if (!nodeById.has(recipeInput.nodeId)) throw new Error(`缺少输入节点：${item.id} -> ${recipeInput.nodeId}`);
      const inputLevel = levelOrderById.get(nodeById.get(recipeInput.nodeId).levelId);
      const outputLevel = levelOrderById.get(node.levelId);
      if (inputLevel > outputLevel) throw new Error(`配方从更高层反向输入：${item.id}`);
    }
    for (const group of Object.values(item.requirements)) {
      for (const itemRequirement of group) {
        if (!allResourceIds.has(itemRequirement.resourceId)) throw new Error(`缺少资源：${item.id} -> ${itemRequirement.resourceId}`);
      }
    }
  }
}

if (nodes.length !== 2000) throw new Error(`节点必须恰好为 2000，实际为 ${nodes.length}`);

const nodeIdsByLevel = Object.fromEntries(levels.map((level) => [level.id, []]));
const nodeIdsByCluster = Object.fromEntries(clusters.map((cluster) => [cluster.id, []]));
const dependentsByNodeId = Object.fromEntries(nodes.map((node) => [node.id, []]));
for (const node of nodes) {
  nodeIdsByLevel[node.levelId].push(node.id);
  nodeIdsByCluster[node.clusterId].push(node.id);
  for (const item of node.recipes) {
    for (const recipeInput of item.inputs) {
      const dependents = dependentsByNodeId[recipeInput.nodeId];
      if (!dependents.includes(node.id)) dependents.push(node.id);
    }
  }
}

const levelCounts = Object.fromEntries(
  Object.entries(nodeIdsByLevel).map(([levelId, ids]) => [levelId, ids.length]),
);
const kindCounts = Object.fromEntries(
  [...new Set(nodes.map((node) => node.kind))]
    .sort()
    .map((kind) => [kind, nodes.filter((node) => node.kind === kind).length]),
);

const graph = {
  schemaVersion: 1,
  graphId: "mumu-world-composition-graph-v1",
  title: "万物构成塔：2000 节点首版图谱",
  language: "zh-CN",
  generatedAt: "2026-08-04T00:00:00.000Z",
  status: "temporary-prototype-data",
  scopeNote: "用于验证层级、聚类和合成关系；不作为真实工业、化学或武器制造说明。",
  counts: {
    nodes: nodes.length,
    recipes: recipeIds.size,
    levels: levels.length,
    clusters: clusters.length,
    resources: allResourceIds.size,
    levelCounts,
    kindCounts,
  },
  semantics: {
    graphType: "directed-hypergraph",
    rootNodeIds: ["particle:electron", "particle:proton", "particle:neutron"],
    nodeCountIncludesResources: false,
    recipeRule: "同一配方中的 inputs 与 requirements 全部为 AND；一个节点拥有多个配方时，配方之间为 OR。",
    requirementRoles: {
      particlePacks: "电子、质子等节点对应的可消耗学习资源；节点永久保留，粒子包在元素合成时消耗。",
      actions: "可拥有数量、执行时消耗的工具或动作次数。",
      conditions: "必须满足但通常不消耗的状态。",
      environments: "过程发生所需的场景或自然环境，不属于物质层级。",
      knowledge: "一次购买或学习后永久点亮，不再消耗。",
    },
    elementCaveat: "元素的中子数使用四舍五入质量数得到的代表性近似；真实同位素中子数不同。",
    chemistryCaveat: "化学配方只表达原子组成，不提供反应物比例、温压、点火或实验步骤。",
    defenseCaveat: "装备节点只表达高层系统组成，不包含弹药、危险配方或可执行制造参数。",
  },
  extensionContract: {
    stableIdRule: "已发布 ID 永不复用；新增节点使用新的命名空间或序号，不因排序而重编号。",
    minimumNodeFields: ["id", "name", "kind", "levelId", "clusterId", "summary", "art", "recipes"],
    bottomLayerException: "仅 level:01-particles 的三个根节点允许 recipes 为空。",
    sourceOfTruthRule: "元素与化合物通过 sourceRefs 指向工程统一数据源；正式产品不复制维护第二套化学事实。",
    addRecipeRule: "新增配方不得修改旧配方语义；使用新的 recipe.id 追加。",
  },
  loadingHints: {
    authoringFormat: "single-json-preview",
    productionRecommendation: "按 levelId/clusterId 分片，并生成独立 manifest 与详情文件。",
    initialRenderNodeLimit: 160,
    summaryProjection: ["id", "name", "kind", "levelId", "clusterId", "art", "recipes.length"],
    detailStrategy: "选中节点后再按 ID 加载 properties、sourceRefs 和完整 recipes。",
    edgeStrategy: "默认只渲染当前节点的一跳来源和一跳去向；不要一次绘制全部边。",
    virtualization: true,
    precomputedIndexes: ["nodeIdsByLevel", "nodeIdsByCluster", "dependentsByNodeId"],
  },
  levels,
  clusters,
  resources,
  nodes,
  indexes: {
    nodeIdsByLevel,
    nodeIdsByCluster,
    dependentsByNodeId,
  },
};

const levelUnlockCosts = {
  "level:01-particles": 0,
  "level:02-elements": 3,
  "level:03-substances": 5,
  "level:04-materials": 7,
  "level:05-life": 9,
  "level:06-components": 11,
  "level:07-daily": 14,
  "level:08-machines": 18,
  "level:09-spaces": 22,
  "level:10-buildings": 27,
  "level:11-systems": 33,
  "level:12-geography": 40,
  "level:13-planets": 50,
  "level:14-stars": 65,
  "level:15-universe": 90,
};

const unlockCatalog = {
  schemaVersion: 1,
  catalogId: "mumu-world-tower-unlock-catalog-v1",
  graphId: graph.graphId,
  generatedAt: graph.generatedAt,
  currency: {
    id: "currency:discovery-coin",
    name: "知识币",
    symbol: "✦",
    startingBalance: 100000,
    earningRulesStatus: "reserved-for-future",
  },
  nodePrices: nodes.map((node) => ({
    targetId: node.id,
    priceCoins: levelUnlockCosts[node.levelId],
    grantMode: "permanent-unlock",
  })),
  resourcePrices: Object.values(resources).flat().map((resource) => ({
    targetId: resource.id,
    priceCoins: resource.shop.coinCost ?? 0,
    grantMode: resource.inventoryMode === "charge" ? "inventory-charge" : "permanent-unlock",
    grantQuantity: resource.inventoryMode === "charge" ? 1 : null,
  })),
};

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(graphOutputPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
fs.writeFileSync(priceOutputPath, `${JSON.stringify(unlockCatalog, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  graphOutputPath,
  priceOutputPath,
  nodes: nodes.length,
  recipes: recipeIds.size,
  levelCounts,
}, null, 2));
