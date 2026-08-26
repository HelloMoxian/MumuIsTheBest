import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.join(repositoryRoot, "content", "world-tower");
const publicRoot = path.join(repositoryRoot, "apps", "web", "public");
const graph = JSON.parse(fs.readFileSync(path.join(contentRoot, "world-graph.v1.json"), "utf8"));
const plan = JSON.parse(fs.readFileSync(path.join(contentRoot, "generated-art-plan.v1.json"), "utf8"));
const chemistryPlan = JSON.parse(fs.readFileSync(path.join(contentRoot, "chemistry-art-plan.v1.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function localPublicPath(publicPath) {
  return path.join(publicRoot, publicPath.replace(/^\//, ""));
}

assert(plan.graphId === graph.graphId, "生成图片计划与物质塔图谱 ID 不一致。");
assert(plan.grid.columns === 5 && plan.grid.rows === 4, "所有生成图集必须固定为 5×4。" );
assert(plan.grid.cellsPerAtlas === 20, "每张生成图集必须固定为 20 格。");
assert(
  plan.grid.readingOrder === "row-major-left-to-right-top-to-bottom",
  "生成图集必须按从左到右、从上到下的行优先顺序编号。",
);
assert(
  plan.grid.cutPolicy === "equal-width-and-height-grid-with-24px-inset",
  "生成图集必须使用等分网格和 24px 安全内缩。",
);
assert(plan.counts.graphNodes === graph.nodes.length, "图片计划中的节点总数已过期。");
assert(plan.counts.missingSuitableAssets === 296, "本轮生成节点数应固定为 296。" );
assert(plan.counts.atlases === 15, "本轮应有 15 张固定规格源图集。" );
assert(plan.counts.reservedCells === 4, "最后一张图集应有 4 个空白保留格。" );

const graphNodeById = new Map(graph.nodes.map((node) => [node.id, node]));
const plannedNodeIds = [];
let reservedCellCount = 0;

for (const batch of plan.batches) {
  assert(batch.columns === 5 && batch.rows === 4, `${batch.id} 不是 5×4。`);
  assert(batch.items.length === 20, `${batch.id} 不是 20 格。`);
  assert(fs.existsSync(localPublicPath(batch.sourcePath)), `${batch.id} 缺少原始图集。`);

  const outputDirectory = localPublicPath(batch.outputDirectory);
  const extractorManifestPath = path.join(outputDirectory, "manifest.json");
  assert(fs.existsSync(extractorManifestPath), `${batch.id} 缺少切图清单。`);
  const extractorManifest = JSON.parse(fs.readFileSync(extractorManifestPath, "utf8"));
  assert(extractorManifest.columns === 5 && extractorManifest.rows === 4, `${batch.id} 切图清单不是 5×4。`);
  assert(extractorManifest.items.length === 20, `${batch.id} 没有切出 20 格。`);
  assert(extractorManifest.indexOrder === "row-major-zero-based", `${batch.id} 切图顺序不是行优先。`);
  assert(extractorManifest.inset === 24, `${batch.id} 没有使用统一的 24px 内缩。`);

  for (const [index, item] of batch.items.entries()) {
    const expectedRow = Math.floor(index / 5) + 1;
    const expectedColumn = index % 5 + 1;
    assert(item.slot === index + 1, `${batch.id} 的格位编号不连续。`);
    assert(item.row === expectedRow && item.column === expectedColumn, `${batch.id} 的格位坐标错误。`);

    const extracted = extractorManifest.items[index];
    assert(extracted.id === item.assetId, `${batch.id} 的第 ${item.slot} 格 ID 对不上。`);
    assert(extracted.index === index, `${batch.id} 的第 ${item.slot} 格索引错误。`);
    assert(extracted.row === expectedRow - 1 && extracted.column === expectedColumn - 1, `${batch.id} 的切图坐标错误。`);
    assert(extracted.cornerAlphas.every((alpha) => alpha === 0), `${item.assetId} 的透明边不干净。`);

    const spritePath = path.join(outputDirectory, extracted.filename);
    assert(fs.existsSync(spritePath), `${item.assetId} 缺少切分后的 PNG。`);

    if (item.reserved) {
      reservedCellCount += 1;
      assert(item.nodeId === null, `${item.assetId} 是保留格但仍绑定了节点。`);
      assert(extracted.opaqueCoverage === 0, `${item.assetId} 保留格不是空白。`);
      assert(extracted.outputWidth === 1 && extracted.outputHeight === 1, `${item.assetId} 保留格输出不为空。`);
      assert(extracted.warnings.length === 1 && extracted.warnings[0] === "cell appears empty", `${item.assetId} 保留格状态异常。`);
      continue;
    }

    const node = graphNodeById.get(item.nodeId);
    assert(node?.name === item.name, `${item.assetId} 的节点名称或 ID 已过期。`);
    assert(extracted.opaqueCoverage > 0, `${item.assetId} 实际没有图像内容。`);
    assert(extracted.warnings.length === 0, `${item.assetId} 切图存在警告：${extracted.warnings.join("；")}`);
    plannedNodeIds.push(item.nodeId);
  }
}

assert(new Set(plannedNodeIds).size === plannedNodeIds.length, "生成图片计划重复绑定了节点。" );
assert(plannedNodeIds.length === plan.counts.missingSuitableAssets, "生成图片数量与计划不一致。" );
assert(reservedCellCount === plan.counts.reservedCells, "空白保留格数量与计划不一致。" );

assert(chemistryPlan.graphId === graph.graphId, "化学扩展图片计划与物质塔图谱 ID 不一致。");
assert(
  chemistryPlan.grid.columns === 3 && chemistryPlan.grid.rows === 4,
  "化学扩展图集必须固定为 3×4。",
);
assert(chemistryPlan.grid.cellsPerAtlas === 12, "每张化学扩展图集必须固定为 12 格。");
assert(
  chemistryPlan.grid.readingOrder === "row-major-left-to-right-top-to-bottom",
  "化学扩展图集必须按从左到右、从上到下的行优先顺序编号。",
);
assert(
  chemistryPlan.grid.cutPolicy === "equal-width-and-height-grid-with-24px-inset",
  "化学扩展图集必须使用等分网格和 24px 安全内缩。",
);
assert(chemistryPlan.counts.graphNodes === graph.nodes.length, "化学扩展图片计划中的节点总数已过期。");
assert(chemistryPlan.counts.coveredNodes === 24, "化学扩展图集应覆盖 24 个新增节点。");
assert(chemistryPlan.counts.atlases === 2, "化学扩展内容应使用 2 张源图集。");
assert(chemistryPlan.counts.reservedCells === 0, "化学扩展图集不应包含保留格。");

const chemistryNodeIds = [];
for (const batch of chemistryPlan.batches) {
  assert(batch.columns === 3 && batch.rows === 4, `${batch.id} 不是 3×4。`);
  assert(batch.items.length === 12, `${batch.id} 不是 12 格。`);
  assert(fs.existsSync(localPublicPath(batch.sourcePath)), `${batch.id} 缺少原始图集。`);

  const outputDirectory = localPublicPath(batch.outputDirectory);
  const extractorManifestPath = path.join(outputDirectory, "manifest.json");
  assert(fs.existsSync(extractorManifestPath), `${batch.id} 缺少切图清单。`);
  const extractorManifest = JSON.parse(fs.readFileSync(extractorManifestPath, "utf8"));
  assert(extractorManifest.columns === 3 && extractorManifest.rows === 4, `${batch.id} 切图清单不是 3×4。`);
  assert(extractorManifest.items.length === 12, `${batch.id} 没有切出 12 格。`);
  assert(extractorManifest.indexOrder === "row-major-zero-based", `${batch.id} 切图顺序不是行优先。`);
  assert(extractorManifest.inset === 24, `${batch.id} 没有使用统一的 24px 内缩。`);
  assert(extractorManifest.backgroundRemoved === true, `${batch.id} 没有移除键色背景。`);
  assert(extractorManifest.trimmed === true, `${batch.id} 没有裁切透明边。`);

  for (const [index, item] of batch.items.entries()) {
    const expectedRow = Math.floor(index / 3) + 1;
    const expectedColumn = index % 3 + 1;
    assert(item.slot === index + 1, `${batch.id} 的格位编号不连续。`);
    assert(item.row === expectedRow && item.column === expectedColumn, `${batch.id} 的格位坐标错误。`);
    assert(item.reserved === false, `${batch.id} 不应包含保留格。`);

    const extracted = extractorManifest.items[index];
    assert(extracted.id === item.assetId, `${batch.id} 的第 ${item.slot} 格 ID 对不上。`);
    assert(extracted.index === index, `${batch.id} 的第 ${item.slot} 格索引错误。`);
    assert(
      extracted.row === expectedRow - 1 && extracted.column === expectedColumn - 1,
      `${batch.id} 的切图坐标错误。`,
    );
    assert(extracted.cornerAlphas.every((alpha) => alpha === 0), `${item.assetId} 的透明边不干净。`);
    assert(extracted.opaqueCoverage > 0, `${item.assetId} 实际没有图像内容。`);
    assert(extracted.warnings.length === 0, `${item.assetId} 切图存在警告：${extracted.warnings.join("；")}`);
    assert(fs.existsSync(path.join(outputDirectory, extracted.filename)), `${item.assetId} 缺少切分后的 PNG。`);

    const node = graphNodeById.get(item.nodeId);
    assert(node?.name === item.name && node.levelId === item.levelId, `${item.assetId} 的节点名称、层级或 ID 已过期。`);
    chemistryNodeIds.push(item.nodeId);
  }
}

assert(new Set(chemistryNodeIds).size === chemistryNodeIds.length, "化学扩展图片计划重复绑定了节点。");
assert(chemistryNodeIds.length === chemistryPlan.counts.coveredNodes, "化学扩展图片数量与计划不一致。");
assert(
  chemistryNodeIds.every((nodeId) => !plannedNodeIds.includes(nodeId)),
  "化学扩展图集不应覆盖旧版生成图集节点。",
);

console.log(
  `物质塔生成图片校验通过：${plan.batches.length} 张 5×4 图集、`
  + `${chemistryPlan.batches.length} 张 3×4 化学扩展图集、`
  + `${plannedNodeIds.length + chemistryNodeIds.length} 张节点图、`
  + `${reservedCellCount} 个空白保留格。`,
);
