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
const outputPath = path.join(
  repositoryRoot,
  "content",
  "world-tower",
  "icon-manifest.v1.json",
);
const publicRoot = path.join(repositoryRoot, "apps", "web", "public");
const assetRoot = "/images/world-tower";

const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));

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

function localPath(publicPath) {
  return path.join(publicRoot, publicPath.replace(/^\//, ""));
}

const levelFallbacks = Object.fromEntries(
  graph.levels.map((level) => [
    level.id,
    publicAsset(`nodes/levels/${level.id.replace("level:", "")}.webp`),
  ]),
);

const nodeAssets = {};
for (const [nodeName, assetName] of coreNodeArt) {
  const matches = graph.nodes.filter((node) => node.name === nodeName);
  if (matches.length !== 1) {
    throw new Error(
      `核心节点“${nodeName}”应唯一匹配，实际得到 ${matches.length} 个。`,
    );
  }
  nodeAssets[matches[0].id] = publicAsset(`nodes/core/${assetName}.webp`);
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
  assetPackId: "mumu-world-tower-cosmic-runes-v1",
  generatedAt: "2026-08-05T00:00:00.000Z",
  artDirection: {
    style: "premium-fantasy-science-cosmic-runes",
    composition: "separate-frame-content-image-and-html-label",
    fallbackPolicy: "core-image-then-level-image-then-stardust-text",
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
  ...Object.values(manifest.nodeAssets),
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
