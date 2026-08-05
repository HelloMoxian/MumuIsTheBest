import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.join(repositoryRoot, "content", "world-tower");
const graph = JSON.parse(fs.readFileSync(path.join(contentRoot, "world-graph.v1.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(contentRoot, "unlock-catalog.v1.json"), "utf8"));
const icons = JSON.parse(fs.readFileSync(path.join(contentRoot, "icon-manifest.v1.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertUnique(values, label) {
  assert(new Set(values).size === values.length, `${label}存在重复值。`);
}

assert(graph.schemaVersion === 1, "图谱 schemaVersion 必须为 1。");
assert(graph.nodes.length === 2_000, "一期图谱必须恰好包含 2000 个节点。");
assert(graph.levels.length === 15, "一期图谱必须包含 15 个层级。");
assertUnique(graph.nodes.map((node) => node.id), "节点 ID");
assertUnique(graph.nodes.map((node) => node.name), "节点名称");

const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
const resourceList = Object.values(graph.resources).flat();
const resourceIds = new Set(resourceList.map((resource) => resource.id));
assertUnique([...resourceIds], "资源 ID");
assert(resourceList.length === graph.counts.resources, "资源计数与实际内容不一致。");

const rootIds = new Set(graph.semantics.rootNodeIds);
assert(rootIds.size === 3, "图谱必须有电子、质子、中子三个根节点。");
for (const rootId of rootIds) assert(nodeById.has(rootId), `根节点不存在：${rootId}`);

let recipeCount = 0;
const outgoing = new Map(graph.nodes.map((node) => [node.id, new Set()]));
const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
for (const node of graph.nodes) {
  if (!rootIds.has(node.id)) {
    assert(node.recipes.length > 0, `非根节点没有构造配方：${node.id}`);
  }
  recipeCount += node.recipes.length;
  for (const recipe of node.recipes) {
    assert(recipe.logic === "ALL", `一期配方必须使用 ALL 逻辑：${recipe.id}`);
    assert(recipe.outputs.some((output) => output.nodeId === node.id), `配方没有输出所属节点：${recipe.id}`);
    for (const input of recipe.inputs) {
      assert(nodeById.has(input.nodeId), `配方引用了不存在的输入：${input.nodeId}`);
      if (!outgoing.get(input.nodeId).has(node.id)) {
        outgoing.get(input.nodeId).add(node.id);
        indegree.set(node.id, indegree.get(node.id) + 1);
      }
    }
    for (const requirements of Object.values(recipe.requirements)) {
      for (const requirement of requirements) {
        assert(resourceIds.has(requirement.resourceId), `配方引用了不存在的资源：${requirement.resourceId}`);
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
assert(reachable.size === graph.nodes.length, `有 ${graph.nodes.length - reachable.size} 个节点无法从根粒子到达。`);

assert(catalog.graphId === graph.graphId, "点亮目录与图谱 ID 不一致。");
assert(catalog.nodePrices.length === graph.nodes.length, "节点点亮价格没有完整覆盖图谱。");
assertUnique(catalog.nodePrices.map((item) => item.targetId), "节点价格目标");
assert(catalog.nodePrices.every((item) => nodeById.has(item.targetId)), "节点价格引用了不存在的节点。");
assert(catalog.resourcePrices.length === resourceList.length, "资源价格没有完整覆盖资源。");
assertUnique(catalog.resourcePrices.map((item) => item.targetId), "资源价格目标");
assert(catalog.resourcePrices.every((item) => resourceIds.has(item.targetId)), "资源价格引用了不存在的资源。");

assert(Object.keys(icons.levelFallbacks).length === graph.levels.length, "层级回退图片不完整。");
assert(Object.keys(icons.resourceAssets).length === resourceList.length, "资源图标不完整。");
assert(Object.keys(icons.nodeAssets).length >= 1_400, "语义节点图片覆盖不能少于 1,400 个节点。");
for (const [nodeId, asset] of Object.entries(icons.nodeAssets)) {
  assert(nodeById.has(nodeId), "图标清单引用了不存在的节点：" + nodeId);
  assert(typeof asset.path === "string" && asset.path.startsWith("/"), "节点图片路径无效：" + nodeId);
  if (asset.atlas) {
    assert(asset.atlas.columns > 0 && asset.atlas.rows > 0, "图集行列无效：" + nodeId);
    assert(
      asset.atlas.index >= 0 && asset.atlas.index < asset.atlas.columns * asset.atlas.rows,
      "图集格位越界：" + nodeId,
    );
  }
}
const assetPaths = [
  icons.backgroundAsset,
  icons.placeholderTexture,
  ...Object.values(icons.frameAssets),
  ...Object.values(icons.levelFallbacks),
  ...Object.values(icons.nodeAssets).map((asset) => asset.path),
  ...Object.values(icons.resourceAssets),
];
for (const assetPath of new Set(assetPaths)) {
  const localPath = path.join(repositoryRoot, "apps", "web", "public", assetPath.replace(/^\//, ""));
  assert(fs.existsSync(localPath), `图标清单中的文件不存在：${assetPath}`);
}

console.log(
  `万物构成塔校验通过：${graph.nodes.length} 节点、${recipeCount} 配方、`
  + `${resourceList.length} 资源、${assetPaths.length} 个运行时美术引用。`,
);
