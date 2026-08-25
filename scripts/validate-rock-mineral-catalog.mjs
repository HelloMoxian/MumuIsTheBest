import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const catalogPath = resolve(
  projectRoot,
  "content",
  "nature",
  "rock-mineral-catalog.v1.json",
);
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

function invariant(condition, message) {
  if (!condition) throw new Error(`岩石与矿物目录校验失败：${message}`);
}

const kinds = new Set(["mineral", "variety", "rock", "ore-aggregate"]);
const requiredResearchKeys = [
  "name",
  "classification",
  "crystalStructure",
  "formation",
  "rarity",
  "mohsHardness",
  "introduction",
  "chemicalComposition",
  "uses",
  "products",
  "value",
  "safety",
];

invariant(catalog.schemaVersion === 1, "schemaVersion 必须为 1");
invariant(catalog.catalogId === "nature-rock-minerals-v1", "catalogId 不正确");
invariant(Array.isArray(catalog.items), "items 必须是数组");
invariant(catalog.items.length === 128, "首版必须完整保留 128 个样本");
invariant(catalog.itemCount === catalog.items.length, "itemCount 与实际数量不一致");
invariant(catalog.gameplay?.columns === 5 && catalog.gameplay?.rows === 6, "地层必须为 5 × 6");
invariant(catalog.gameplay?.mineralProbability === 0.2, "矿物产出概率必须为 0.2");
invariant(catalog.gameplay?.hammer?.durability === 30, "地质锤默认耐久必须为 30");
invariant(catalog.gameplay?.hammer?.energyCoinCost === 30, "地质锤价格必须为 30 能量币");
invariant(catalog.gameplay?.research?.knowledgeCoinCost === 5, "研究价格必须为 5 知识币");
invariant(
  JSON.stringify(catalog.gameplay?.research?.attributeKeys) === JSON.stringify(requiredResearchKeys),
  "研究词条集合或顺序发生了未记录的变化",
);

const ids = new Set();
for (const [index, item] of catalog.items.entries()) {
  const label = item?.id || `第 ${index + 1} 项`;
  invariant(typeof item?.id === "string" && /^[a-z0-9-]+$/.test(item.id), `${label} ID 不合法`);
  invariant(!ids.has(item.id), `${label} ID 重复`);
  ids.add(item.id);
  invariant(typeof item.name === "string" && item.name.length > 0, `${label} 缺少名称`);
  invariant(Array.isArray(item.aliases), `${label} aliases 必须是数组`);
  invariant(kinds.has(item.kind), `${label} kind 不合法`);
  invariant(typeof item.group === "string" && item.group.length > 0, `${label} 缺少分组`);
  invariant(typeof item.chemicalComposition?.formula === "string", `${label} 缺少化学式`);
  invariant(typeof item.chemicalComposition?.summary === "string", `${label} 缺少成分说明`);
  invariant(typeof item.crystalStructure?.system === "string", `${label} 缺少晶体系统`);
  invariant(typeof item.crystalStructure?.detail === "string", `${label} 缺少晶体结构细节`);
  invariant(typeof item.formation === "string" && item.formation.length >= 10, `${label} 缺少成因`);
  invariant(Number.isInteger(item.rarity) && item.rarity >= 1 && item.rarity <= 10, `${label} 稀有度越界`);
  invariant(
    Number.isFinite(item.mohsHardness?.min)
      && Number.isFinite(item.mohsHardness?.max)
      && item.mohsHardness.min >= 1
      && item.mohsHardness.max <= 10
      && item.mohsHardness.min <= item.mohsHardness.max,
    `${label} 莫氏硬度不合法`,
  );
  invariant(typeof item.introduction === "string" && item.introduction.length >= 10, `${label} 缺少介绍`);
  invariant(Array.isArray(item.uses) && item.uses.length > 0, `${label} 缺少用途`);
  invariant(Array.isArray(item.products) && item.products.length > 0, `${label} 缺少常见制成物`);
  invariant(
    Number.isInteger(item.value?.score) && item.value.score >= 1 && item.value.score <= 10,
    `${label} 价值分数越界`,
  );
  invariant(typeof item.value?.description === "string", `${label} 缺少价值说明`);
  invariant(typeof item.safety === "string" && item.safety.length >= 6, `${label} 缺少安全提示`);
  invariant(
    item.image?.path === `/images/nature/rock-minerals/samples/${item.id}.png`,
    `${label} 图片路径必须与稳定 ID 对齐`,
  );
  invariant(
    /^rock-mineral-atlas-\d{2}$/.test(item.image?.atlasId)
      && Number.isInteger(item.image?.cellIndex)
      && item.image.cellIndex >= 0
      && item.image.cellIndex <= 8,
    `${label} 图集绑定不合法`,
  );
}

const rarityKeys = Object.keys(catalog.gameplay?.rarityWeights ?? {}).sort();
invariant(rarityKeys.join(",") === "1,10,2,3,4,5,6,7,8,9", "稀有度权重必须覆盖 1—10");
for (const rarity of Array.from({ length: 10 }, (_, index) => index + 1)) {
  invariant(catalog.items.some((item) => item.rarity === rarity), `稀有度 ${rarity} 没有样本`);
  invariant(catalog.gameplay.rarityWeights[String(rarity)] > 0, `稀有度 ${rarity} 权重必须大于 0`);
}

console.log(`岩石与矿物目录校验通过：${catalog.items.length} 个样本，${ids.size} 个稳定 ID。`);
