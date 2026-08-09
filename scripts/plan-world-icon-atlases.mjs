import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.join(repositoryRoot, "content", "world-tower");
const graph = JSON.parse(fs.readFileSync(path.join(contentRoot, "world-graph.v1.json"), "utf8"));
const icons = JSON.parse(fs.readFileSync(path.join(contentRoot, "icon-manifest.v1.json"), "utf8"));
const outputPath = path.join(contentRoot, "generated-art-plan.v1.json");

const columns = 5;
const rows = 4;
const cellsPerAtlas = columns * rows;
const missingNodes = graph.nodes.filter((node) => !icons.nodeAssets[node.id]);
const paddedItems = [...missingNodes];
while (paddedItems.length % cellsPerAtlas !== 0) paddedItems.push(null);

const batches = Array.from(
  { length: paddedItems.length / cellsPerAtlas },
  (_, batchIndex) => {
    const batchNumber = batchIndex + 1;
    const items = paddedItems
      .slice(batchIndex * cellsPerAtlas, (batchIndex + 1) * cellsPerAtlas)
      .map((node, index) => {
        const slot = index + 1;
        const assetId = `material-v1-${String(batchNumber).padStart(2, "0")}-${String(slot).padStart(2, "0")}`;
        return {
          slot,
          row: Math.floor(index / columns) + 1,
          column: index % columns + 1,
          assetId,
          nodeId: node?.id ?? null,
          name: node?.name ?? "保留空格",
          levelId: node?.levelId ?? null,
          reserved: node === null,
        };
      });
    const usesMagentaKey = items.some((item) => item.levelId && [
      "level:10-agriculture",
      "level:11-ancient",
      "level:12-natural-world",
      "level:13-life",
      "level:14-matter",
    ].includes(item.levelId));
    return {
      id: `material-tower-atlas-${String(batchNumber).padStart(2, "0")}`,
      index: batchNumber,
      columns,
      rows,
      readingOrder: "row-major-left-to-right-top-to-bottom",
      keyColor: usesMagentaKey ? "#FF00FF" : "#00FF00",
      sourcePath: `/images/world-tower/source-atlases/material-tower-v1/atlas-${String(batchNumber).padStart(2, "0")}.png`,
      outputDirectory: `/images/world-tower/nodes/generated/material-tower-v1/atlas-${String(batchNumber).padStart(2, "0")}`,
      items,
    };
  },
);

const plan = {
  schemaVersion: 1,
  graphId: graph.graphId,
  generatedAt: new Date().toISOString(),
  grid: {
    columns,
    rows,
    cellsPerAtlas,
    readingOrder: "row-major-left-to-right-top-to-bottom",
    cutPolicy: "equal-width-and-height-grid-with-24px-inset",
    outputPolicy: "one-transparent-trimmed-png-per-non-reserved-cell",
  },
  counts: {
    graphNodes: graph.nodes.length,
    existingSuitableAssets: Object.keys(icons.nodeAssets).length,
    missingSuitableAssets: missingNodes.length,
    atlases: batches.length,
    reservedCells: paddedItems.filter((item) => item === null).length,
  },
  batches,
};

fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...plan.counts }, null, 2));
