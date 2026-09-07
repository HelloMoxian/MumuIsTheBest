import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createEmptyDrawing, makeHistoryNode, parseDrawingDocument } from "./logic";
import {
  createPortfolioDocument, filterPortfolio, parsePortfolioCatalog, parsePortfolioCategory,
  portfolioContentSignature, preparePortfolioOpening,
} from "./portfolio";

const directory = new URL("../../../../../content/drawing-studio/portfolio/", import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, directory), "utf8"));
const rawCatalog = read("catalog.v1.json");
const catalog = parsePortfolioCatalog(rawCatalog);
const rawCategory = read("category-01.v1.json");
const first = parsePortfolioCategory(rawCategory, "category-01", catalog).get("pc-001")!;

test("all 360 works use valid, distinct, independently colourable geometry", () => {
  assert.equal(catalog.works.length, 360);
  assert.equal(catalog.categories.length, 24);
  const signatures = new Set<string>();
  for (const category of catalog.categories) {
    const group = parsePortfolioCategory(read(`${category.id}.v1.json`), category.id, catalog);
    assert.equal(group.size, 15);
    for (const work of group.values()) {
      const plain = work.elements.map(({ id: _id, createdOrder: _order, ...geometry }) => geometry);
      const signature = JSON.stringify(plain);
      assert.equal(signatures.has(signature), false, work.title);
      signatures.add(signature);
      assert.equal(work.presets.length, 0);
      for (const e of work.elements) {
        assert.equal(e.groupId, undefined);
        const a = e.rotation * Math.PI / 180;
        const width = Math.abs(e.width * Math.cos(a)) + Math.abs(e.height * Math.sin(a));
        const height = Math.abs(e.width * Math.sin(a)) + Math.abs(e.height * Math.cos(a));
        assert.ok(e.x + e.width / 2 - width / 2 >= 29);
        assert.ok(e.y + e.height / 2 - height / 2 >= 29);
        assert.ok(e.x + e.width / 2 + width / 2 <= 971);
        assert.ok(e.y + e.height / 2 + height / 2 <= 771);
      }
      const history = makeHistoryNode("未涂色", work.elements);
      const recoloured = structuredClone(work);
      recoloured.elements[0]!.fill = "#ff0000";
      assert.equal(parseDrawingDocument(recoloured).elements[0]!.type, "shape");
      assert.equal(history.elements[0]!.type === "shape" && history.elements[0]!.fill, "#ffffff");
    }
  }
  assert.equal(signatures.size, 360);
});

test("catalog rejects unsupported versions, duplicate IDs, foreign categories and bad counts", () => {
  for (const mutate of [
    (v: typeof rawCatalog) => { v.schemaVersion = 2; },
    (v: typeof rawCatalog) => { v.works[1].id = v.works[0].id; },
    (v: typeof rawCatalog) => { v.categories[1].id = v.categories[0].id; },
    (v: typeof rawCatalog) => { v.works[0].categoryId = "../../private"; },
    (v: typeof rawCatalog) => { v.categories[0].count = 16; },
    (v: typeof rawCatalog) => { v.works[0].elementCount = -1; },
  ]) {
    const value = structuredClone(rawCatalog); mutate(value);
    assert.throws(() => parsePortfolioCatalog(value));
  }
  assert.deepEqual(parsePortfolioCatalog({ schemaVersion: 1, style: "primitive-diy", categories: [], works: [] }).works, []);
});

test("category rejects corrupted scenes, non-primitives, colour, grouping and wrong membership", () => {
  for (const mutate of [
    (v: typeof rawCategory) => { v.schemaVersion = 9; },
    (v: typeof rawCategory) => { v.categoryId = "category-02"; },
    (v: typeof rawCategory) => { v.works.pop(); },
    (v: typeof rawCategory) => { v.works[0].document.title = "different"; },
    (v: typeof rawCategory) => { v.works[0].document.elements[0].fill = "#ff0000"; },
    (v: typeof rawCategory) => { v.works[0].document.elements[0].shape = "circle"; },
    (v: typeof rawCategory) => { v.works[0].document.elements[0].groupId = "locked-together"; },
    (v: typeof rawCategory) => { v.works[0].document.elements[0].x = NaN; },
  ]) {
    const value = structuredClone(rawCategory); mutate(value);
    assert.throws(() => parsePortfolioCategory(value, "category-01", catalog));
  }
});

test("search supports category, subjects, title, ID, multiple words and empty results", () => {
  assert.equal(filterPortfolio(catalog, "category-03", "").length, 15);
  assert.equal(filterPortfolio(catalog, "all", " PC-001 ")[0]?.id, "pc-001");
  assert.ok(filterPortfolio(catalog, "all", "火车").length > 0);
  assert.equal(filterPortfolio(catalog, "category-03", "火车").length, 0);
  assert.equal(filterPortfolio(catalog, "all", "not-a-real-work").length, 0);
  assert.equal(filterPortfolio(catalog, "all", "科学 望远镜")[0]?.id, "pc-001");
});

test("opening creates fresh IDs, retains personal presets and author, and fits the canvas", () => {
  const current = createEmptyDrawing(); current.author = "示例作者";
  current.presets = [{ id: "personal", name: "个人图形", width: 100, height: 100,
    createdAt: new Date().toISOString(), elements: first.elements.slice(0, 2) }];
  const next = createPortfolioDocument(first, current, { width: 900, height: 700 });
  const other = createPortfolioDocument(first, current, { width: 350, height: 530 });
  assert.notEqual(next.id, first.id); assert.notEqual(next.id, other.id);
  assert.notEqual(next.elements[0]!.id, first.elements[0]!.id);
  assert.deepEqual(next.presets, current.presets);
  assert.notEqual(next.presets, current.presets);
  assert.equal(next.author, current.author);
  assert.ok(next.viewport.zoom * 1000 <= 900);
  assert.ok(other.viewport.zoom * 1000 <= 350);
  assert.equal(parseDrawingDocument(next).elements.length, first.elements.length);
  const signature = portfolioContentSignature(next);
  next.viewport.x += 200;
  assert.equal(portfolioContentSignature(next), signature);
  next.title += " 新名字";
  assert.notEqual(portfolioContentSignature(next), signature);
});

test("failed preservation never mutates the draft; retries reuse the checkpoint ID", async () => {
  const current = createPortfolioDocument(first, createEmptyDrawing(), { width: 900, height: 700 });
  current.elements[0]!.x += 20;
  const before = structuredClone(current);
  const checkpointId = crypto.randomUUID(); const savedIds: string[] = [];
  const options = { current, template: first, size: { width: 900, height: 700 }, checkpointId };
  await assert.rejects(preparePortfolioOpening({ ...options, saveCheckpoint: async (doc) => {
    savedIds.push(doc.id); throw new Error("模拟写入失败");
  } }), /模拟写入失败/);
  assert.deepEqual(current, before);
  const opened = await preparePortfolioOpening({ ...options, saveCheckpoint: async (doc) => { savedIds.push(doc.id); } });
  assert.deepEqual(savedIds, [checkpointId, checkpointId]);
  assert.notEqual(opened.id, current.id);
  assert.notEqual(opened.id, checkpointId);
  await preparePortfolioOpening({ ...options, checkpointId: null, saveCheckpoint: async () => { assert.fail("Empty/pristine draft must not consume a save slot"); } });
});
