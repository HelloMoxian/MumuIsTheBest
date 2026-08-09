import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.join(repositoryRoot, "content", "world-tower");
const graph = JSON.parse(fs.readFileSync(path.join(contentRoot, "world-graph.v1.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(contentRoot, "unlock-catalog.v1.json"), "utf8"));
const icons = JSON.parse(fs.readFileSync(path.join(contentRoot, "icon-manifest.v1.json"), "utf8"));
const rules = JSON.parse(fs.readFileSync(path.join(contentRoot, "composition-rules.v2.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertUnique(values, label) {
  assert(new Set(values).size === values.length, `${label}存在重复值。`);
}

assert(graph.schemaVersion === 1, "图谱运行时 schemaVersion 必须为 1。");
assert(graph.graphId === rules.graphId, "图谱与合成规则 ID 不一致。");
assert(graph.nodes.length === graph.counts.nodes, "节点计数与实际内容不一致。");
assert(graph.levels.length === 16, "物质塔必须保持用户确定的十六层结构。");
assert(graph.levels.length === rules.levels.length, "图谱层级与合成规则不一致。");
assertUnique(graph.nodes.map((node) => node.id), "节点 ID");
assertUnique(graph.nodes.map((node) => node.name), "节点名称");

const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
const resourceList = Object.values(graph.resources).flat();
const resourceIds = new Set(resourceList.map((resource) => resource.id));
assertUnique([...resourceIds], "资源 ID");
assert(resourceList.length === 0, "新版物质塔不应再维护动作、条件、环境或知识背包资源。");
assert(graph.counts.resources === 0, "资源计数应为 0。");

const rootIds = new Set(graph.semantics.rootNodeIds);
assert(rootIds.size === 10, "基本粒子层应包含十个可直接点亮的起点。");
assertUnique([...rootIds], "起点节点");
for (const rootId of rootIds) assert(nodeById.has(rootId), `起点节点不存在：${rootId}`);

let recipeCount = 0;
const outgoing = new Map(graph.nodes.map((node) => [node.id, new Set()]));
const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
for (const node of graph.nodes) {
  if (rootIds.has(node.id)) {
    assert(node.recipes.length === 0, `可直接点亮的基本粒子不应有配方：${node.id}`);
  } else {
    assert(node.recipes.length === 1, `非起点节点应有且仅有一条精简配方：${node.id}`);
  }
  recipeCount += node.recipes.length;
  for (const recipe of node.recipes) {
    assert(recipe.logic === "ALL", `配方必须使用 ALL 逻辑：${recipe.id}`);
    assert(recipe.inputs.length >= 1 && recipe.inputs.length <= 3, `配方前置节点必须为 1—3 个：${recipe.id}`);
    assert(typeof recipe.relationLabel === "string" && recipe.relationLabel.length > 0, `配方缺少关系标签：${recipe.id}`);
    assert(typeof recipe.knowledgeTopic === "string" && recipe.knowledgeTopic.length > 0, `配方缺少知识主题：${recipe.id}`);
    assert(recipe.outputs.some((output) => output.nodeId === node.id), `配方没有输出所属节点：${recipe.id}`);
    assert(
      Object.values(recipe.requirements).every((requirements) => requirements.length === 0),
      `新版配方不应包含动作或资源条件：${recipe.id}`,
    );
    for (const input of recipe.inputs) {
      assert(nodeById.has(input.nodeId), `配方引用了不存在的输入：${input.nodeId}`);
      assert(input.consumed === false, `知识图谱前置节点不应被消耗：${recipe.id}`);
      if (!outgoing.get(input.nodeId).has(node.id)) {
        outgoing.get(input.nodeId).add(node.id);
        indegree.set(node.id, indegree.get(node.id) + 1);
      }
    }
  }
}
assert(recipeCount === graph.counts.recipes, "配方计数与实际内容不一致。");

const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
let visitedCount = 0;
for (let cursor = 0; cursor < queue.length; cursor += 1) {
  const nodeId = queue[cursor];
  visitedCount += 1;
  for (const dependentId of outgoing.get(nodeId)) {
    const nextDegree = indegree.get(dependentId) - 1;
    indegree.set(dependentId, nextDegree);
    if (nextDegree === 0) queue.push(dependentId);
  }
}
assert(visitedCount === graph.nodes.length, "构成图中存在有向环。");

const reachable = new Set(rootIds);
const reachQueue = [...rootIds];
for (let cursor = 0; cursor < reachQueue.length; cursor += 1) {
  for (const dependentId of outgoing.get(reachQueue[cursor])) {
    if (reachable.has(dependentId)) continue;
    reachable.add(dependentId);
    reachQueue.push(dependentId);
  }
}
assert(reachable.size === graph.nodes.length, `有 ${graph.nodes.length - reachable.size} 个节点无法从基本粒子到达。`);

assert(catalog.graphId === graph.graphId, "点亮目录与图谱 ID 不一致。");
assert(catalog.nodePrices.length === graph.nodes.length, "节点价格没有完整覆盖图谱。");
assertUnique(catalog.nodePrices.map((item) => item.targetId), "节点价格目标");
const priceById = new Map(catalog.nodePrices.map((item) => [item.targetId, item.priceCoins]));
for (const level of rules.levels) {
  for (const nodeId of graph.indexes.nodeIdsByLevel[level.id] ?? []) {
    assert(
      priceById.get(nodeId) === level.unlockPriceCoins,
      `${nodeId} 的价格应为 ${level.unlockPriceCoins} 知识币。`,
    );
  }
}
assert(catalog.resourcePrices.length === 0, "新版物质塔不应有资源价格。");

assert(Object.keys(icons.levelFallbacks).length === graph.levels.length, "层级回退图片不完整。");
assert(Object.keys(icons.resourceAssets).length === 0, "新版物质塔不应有资源图标。");
assert(
  Object.keys(icons.nodeAssets).length === graph.nodes.length,
  `物质塔的 ${graph.nodes.length} 个节点都必须有语义图片。`,
);
for (const [nodeId, asset] of Object.entries(icons.nodeAssets)) {
  assert(nodeById.has(nodeId), "图标清单引用了不存在的节点：" + nodeId);
  assert(typeof asset.path === "string" && asset.path.startsWith("/"), "节点图片路径无效：" + nodeId);
  if (asset.atlas) {
    assert(asset.atlas.columns > 0 && asset.atlas.rows > 0, "图集行列无效：" + nodeId);
    assert(asset.atlas.index >= 0 && asset.atlas.index < asset.atlas.columns * asset.atlas.rows, "图集格位越界：" + nodeId);
  }
}
const assetPaths = [
  icons.backgroundAsset,
  icons.placeholderTexture,
  ...Object.values(icons.frameAssets),
  ...Object.values(icons.levelFallbacks),
  ...Object.values(icons.nodeAssets).map((asset) => asset.path),
];
for (const assetPath of new Set(assetPaths)) {
  const filePath = path.join(repositoryRoot, "apps", "web", "public", assetPath.replace(/^\//, ""));
  assert(fs.existsSync(filePath), `图标清单中的文件不存在：${assetPath}`);
}

console.log(
  `物质塔校验通过：${graph.nodes.length} 节点、${recipeCount} 条精简关系、`
  + `${graph.levels.length} 层、${Object.keys(icons.nodeAssets).length} 个完整语义图片节点。`,
);
