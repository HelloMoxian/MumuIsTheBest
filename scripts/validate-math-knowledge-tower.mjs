import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const catalogPath = resolve("content", "math", "knowledge-tower.v1.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(`数学知识塔校验失败：${message}`);
}

assert(catalog.schemaVersion === 1, "schemaVersion 必须为 1。" );
assert(catalog.catalogId === "mumu-math-knowledge-tower-v1", "catalogId 不正确。" );
assert(catalog.knowledgePointCount === 517, "声明的知识点总数必须为 517。" );
assert(Array.isArray(catalog.masteryLevels) && catalog.masteryLevels.length === 4, "必须有四级熟练度。" );
assert(Array.isArray(catalog.grades) && catalog.grades.length === 9, "必须包含九个年级。" );

const expectedMasteryIds = ["aware", "understand", "calculate", "master"];
assert(
  catalog.masteryLevels.every((level, index) => level.id === expectedMasteryIds[index]),
  "四级熟练度 ID 或顺序不正确。",
);

const points = catalog.grades.flatMap((grade, gradeIndex) => {
  assert(grade.order === gradeIndex + 1, `${grade.label ?? "未知年级"}的顺序不连续。`);
  assert(Array.isArray(grade.semesters) && grade.semesters.length === 2, `${grade.label}必须包含上下册。`);
  return grade.semesters.flatMap((semester) => semester.points ?? []);
});

assert(points.length === 517, `实际知识点为 ${points.length} 个，不是 517 个。`);
assert(new Set(points.map(([id]) => id)).size === 517, "知识点稳定 ID 存在重复。" );
assert(points.every(([id]) => /^g\d{2}-\d{3}$/.test(id)), "存在格式不正确的知识点 ID。" );
assert(points.every(([, description]) => typeof description === "string" && description.trim().length > 0), "存在空知识点描述。" );

console.log("数学知识塔校验通过：517 个知识点、2068 盏熟练度灯、9 个年级。" );
