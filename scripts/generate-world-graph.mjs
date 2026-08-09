import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const outputDirectory = path.join(repositoryRoot, "content", "world-tower");
const rulesPath = path.join(outputDirectory, "composition-rules.v2.json");
const graphOutputPath = path.join(outputDirectory, "world-graph.v1.json");
const priceOutputPath = path.join(outputDirectory, "unlock-catalog.v1.json");
const elementSourcePath = path.join(
  repositoryRoot,
  "apps/web/src/features/periodic-table/elements.generated.ts",
);

const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
const elementSource = fs.readFileSync(elementSourcePath, "utf8");
const elementDeclarationStart = elementSource.indexOf("export const ELEMENTS");
const elementArrayStart = elementSource.indexOf("= [", elementDeclarationStart) + 2;
const elementArrayEnd = elementSource.lastIndexOf("];" ) + 1;
const elements = JSON.parse(elementSource.slice(elementArrayStart, elementArrayEnd));

if (rules.schemaVersion !== 2) throw new Error("物质塔规则 schemaVersion 必须为 2。");
if (rules.levels.length !== 16) throw new Error(`物质塔必须包含十六层，实际 ${rules.levels.length} 层。`);

const particleIds = new Map([
  ["质子", "particle:proton"],
  ["中子", "particle:neutron"],
  ["电子", "particle:electron"],
  ["光子", "particle:photon"],
  ["电子中微子", "particle:electron-neutrino"],
  ["上夸克", "particle:up-quark"],
  ["下夸克", "particle:down-quark"],
  ["胶子", "particle:gluon"],
  ["正电子", "particle:positron"],
  ["希格斯玻色子", "particle:higgs-boson"],
]);

const particleSymbols = new Map([
  ["质子", "p⁺"],
  ["中子", "n⁰"],
  ["电子", "e⁻"],
  ["光子", "γ"],
  ["电子中微子", "νₑ"],
  ["上夸克", "u"],
  ["下夸克", "d"],
  ["胶子", "g"],
  ["正电子", "e⁺"],
  ["希格斯玻色子", "H⁰"],
]);

const relationKind = {
  composition: "material-or-structural-composition",
  manufacture: "human-made-invention",
  life: "biological-development-or-classification",
  discovery: "observation-led-discovery",
  inference: "knowledge-led-inference",
  direct: "direct-knowledge-unlock",
};

const levels = rules.levels.map(({ id, order, name, description }) => ({
  id,
  order,
  name,
  description,
}));
const levelById = new Map(rules.levels.map((level) => [level.id, level]));
const clusters = rules.levels.map((level) => ({
  id: `cluster:${level.id.slice("level:".length)}`,
  order: level.order,
  name: `${level.name}节点`,
  parentClusterId: null,
}));
const clusterByLevelId = new Map(clusters.map((cluster, index) => [rules.levels[index].id, cluster.id]));

const nodes = [];
const nodeById = new Map();
const nodeByName = new Map();
const pendingRecipes = new Map();

function addNode(node, pendingRecipe) {
  if (nodeById.has(node.id)) throw new Error(`重复节点 ID：${node.id}`);
  if (nodeByName.has(node.name)) throw new Error(`重复节点名称：${node.name}`);
  nodes.push(node);
  nodeById.set(node.id, node);
  nodeByName.set(node.name, node);
  pendingRecipes.set(node.id, pendingRecipe);
}

function curatedNodeId(name) {
  return `node:${name}`;
}

for (const level of rules.levels) {
  if (level.elementRule) {
    for (const element of elements) {
      const approximateMass = Number.parseFloat(element.atomicMass.replace(/[()]/g, ""));
      const representativeNeutrons = Number.isFinite(approximateMass)
        ? Math.max(0, Math.round(approximateMass) - element.atomicNumber)
        : element.atomicNumber;
      addNode({
        id: `element:${element.symbol}`,
        name: element.chineseName,
        aliases: [element.englishName, element.symbol, element.pinyin],
        tags: ["元素", element.categoryLabel],
        art: {
          mode: "text-placeholder",
          imageAssetId: null,
          symbol: element.symbol,
          frameStyle: element.category,
        },
        kind: "chemical-element",
        levelId: level.id,
        clusterId: clusterByLevelId.get(level.id),
        summary: `${element.chineseName}元素，原子序数 ${element.atomicNumber}。${level.elementRule.knowledge}。`,
        recipes: [],
        properties: {
          relationType: level.elementRule.relationType,
          relationLabel: rules.relationTypes[level.elementRule.relationType],
          knowledgeTopic: level.elementRule.knowledge,
          atomicNumber: element.atomicNumber,
          symbol: element.symbol,
          atomicMass: element.atomicMass,
          electronConfiguration: element.electronConfiguration,
          shells: element.shells,
          category: element.category,
          categoryLabel: element.categoryLabel,
        },
        sourceRefs: [{
          type: "project-source",
          path: "apps/web/src/features/periodic-table/elements.generated.ts",
        }],
      }, {
        relationType: level.elementRule.relationType,
        inputNames: element.atomicNumber === 1 ? ["质子", "电子"] : level.elementRule.inputNames,
        knowledge: level.elementRule.knowledge,
        elementAmounts: {
          质子: element.atomicNumber,
          电子: element.atomicNumber,
          中子: representativeNeutrons,
        },
      });
    }
    continue;
  }

  for (const [name, relationType, inputNames, knowledge] of level.nodes ?? []) {
    const id = particleIds.get(name) ?? curatedNodeId(name);
    addNode({
      id,
      name,
      aliases: [],
      tags: [level.name, rules.relationTypes[relationType]],
      art: {
        mode: "text-placeholder",
        imageAssetId: null,
        symbol: particleSymbols.get(name) ?? name.slice(0, 3),
        frameStyle: relationType === "direct" ? "origin" : "common",
      },
      kind: relationKind[relationType],
      levelId: level.id,
      clusterId: clusterByLevelId.get(level.id),
      summary: `${name}：${knowledge}。`,
      recipes: [],
      properties: {
        relationType,
        relationLabel: rules.relationTypes[relationType],
        knowledgeTopic: knowledge,
      },
      sourceRefs: [{ type: "curated-rule", path: "content/world-tower/composition-rules.v2.json" }],
    }, { relationType, inputNames, knowledge });
  }
}

function graphInput(inputNode, amount = 1) {
  return {
    nodeId: inputNode.id,
    amount,
    unit: inputNode.kind === "chemical-element" ? "atom-or-key-element" : "conceptual-prerequisite",
    role: "prerequisite",
    consumed: false,
  };
}

const recipeIds = new Set();
for (const node of nodes) {
  const pending = pendingRecipes.get(node.id);
  if (!pending || pending.relationType === "direct") continue;
  if (pending.inputNames.length < 1 || pending.inputNames.length > 3) {
    throw new Error(`${node.name}必须有 1—3 个前置节点，实际 ${pending.inputNames.length} 个。`);
  }
  const inputs = pending.inputNames.map((inputName) => {
    const inputNode = nodeByName.get(inputName);
    if (!inputNode) throw new Error(`${node.name}引用了不存在的前置节点：${inputName}`);
    return graphInput(inputNode, pending.elementAmounts?.[inputName] ?? 1);
  });
  const recipeId = `recipe:${node.id.slice(node.id.indexOf(":") + 1)}:primary`;
  if (recipeIds.has(recipeId)) throw new Error(`重复配方 ID：${recipeId}`);
  recipeIds.add(recipeId);
  node.recipes = [{
    id: recipeId,
    type: pending.relationType,
    relationLabel: rules.relationTypes[pending.relationType],
    knowledgeTopic: pending.knowledge,
    logic: "ALL",
    inputs,
    requirements: {
      particlePacks: [],
      actions: [],
      conditions: [],
      environments: [],
      knowledge: [],
    },
    outputs: [{ nodeId: node.id, amount: 1 }],
    childExplanation: `${inputs.map((item) => nodeById.get(item.nodeId).name).join("、")}帮助我们通过“${rules.relationTypes[pending.relationType]}”认识${node.name}。${pending.knowledge}。`,
    safety: "child-friendly-knowledge-graph",
  }];
}

const resources = {
  particlePacks: [],
  actions: [],
  conditions: [],
  environments: [],
  knowledge: [],
};
const nodeIdsByLevel = Object.fromEntries(levels.map((level) => [level.id, []]));
const nodeIdsByCluster = Object.fromEntries(clusters.map((cluster) => [cluster.id, []]));
const dependentsByNodeId = Object.fromEntries(nodes.map((node) => [node.id, []]));
for (const node of nodes) {
  nodeIdsByLevel[node.levelId].push(node.id);
  nodeIdsByCluster[node.clusterId].push(node.id);
  for (const input of node.recipes[0]?.inputs ?? []) {
    dependentsByNodeId[input.nodeId].push(node.id);
  }
}

const levelCounts = Object.fromEntries(levels.map((level) => [level.id, nodeIdsByLevel[level.id].length]));
const kindCounts = {};
for (const node of nodes) kindCounts[node.kind] = (kindCounts[node.kind] ?? 0) + 1;
const rootNodeIds = rules.levels
  .flatMap((level) => level.nodes ?? [])
  .filter(([, relationType]) => relationType === "direct")
  .map(([name]) => nodeByName.get(name).id);

const graph = {
  schemaVersion: 1,
  graphId: rules.graphId,
  title: rules.title,
  language: rules.language,
  generatedAt: "2026-08-09T00:00:00.000Z",
  counts: {
    nodes: nodes.length,
    recipes: recipeIds.size,
    levels: levels.length,
    clusters: clusters.length,
    resources: 0,
    levelCounts,
    kindCounts,
  },
  semantics: {
    rootNodeIds,
    directUnlockNodeIds: rootNodeIds,
    relationTypes: rules.relationTypes,
    prerequisiteCount: "每个非起点节点使用 1—3 个前置节点。",
    embeddedKnowledge: "知识主题随节点展示，不作为单独资源购买或消耗。",
    noProcessResources: "不使用动作、条件、环境、粒子包或知识背包。",
    allNodesVisible: true,
  },
  loadingHints: {
    strategy: "all-nodes-single-map",
    initialMapNodeCount: nodes.length,
    renderEdges: "selected-one-hop-only",
    levelNavigation: "independent-sticky-rail",
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

const unlockCatalog = {
  schemaVersion: 1,
  catalogId: "mumu-material-tower-unlock-catalog-v2",
  graphId: graph.graphId,
  generatedAt: graph.generatedAt,
  currency: {
    id: "currency:discovery-coin",
    name: "知识币",
    symbol: "✦",
    startingBalance: 0,
    earningRulesStatus: "active",
  },
  nodePrices: nodes.map((node) => ({
    targetId: node.id,
    priceCoins: levelById.get(node.levelId).unlockPriceCoins,
    grantMode: "permanent-unlock",
  })),
  resourcePrices: [],
};

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(graphOutputPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
fs.writeFileSync(priceOutputPath, `${JSON.stringify(unlockCatalog, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  graphOutputPath,
  rulesPath,
  nodes: nodes.length,
  recipes: recipeIds.size,
  levelCounts,
}, null, 2));
