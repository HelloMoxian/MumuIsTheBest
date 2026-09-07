import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import manifest from "../../../../../content/drawing-studio/portfolio/references.v1.json";
import { createEmptyDrawing, parseDrawingDocument } from "./logic";
import { getPaintingReference, clampReferencePosition } from "./painting-references";
import { createPortfolioDocument, parsePortfolioCatalog, parsePortfolioCategory } from "./portfolio";

test("all 60 originals are local, complete, attributed and tied to the matching primitive work", () => {
  const root = new URL("../../../../../", import.meta.url);
  const read = (name: string) => JSON.parse(readFileSync(new URL("content/drawing-studio/portfolio/" + name, root), "utf8"));
  const catalog = parsePortfolioCatalog(read("catalog.v1.json"));
  assert.equal(manifest.works.length, 60);
  assert.equal(new Set(manifest.works.map((r) => r.id)).size, 60);
  assert.equal(new Set(manifest.works.map((r) => r.sha256)).size, 60);
  for (const ref of manifest.works) {
    assert.match(ref.image, /^\/images\/drawing-studio\/masterpieces\/pc-\d{3}\.jpg$/);
    assert.equal(new URL(ref.sourceUrl).hostname, "commons.wikimedia.org");
    assert.ok(["Public domain", "CC0"].includes(ref.license));
    const bytes = readFileSync(new URL("apps/web/public" + ref.image, root));
    assert.equal(bytes.length, ref.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), ref.sha256);
    const entry = catalog.works.find((work) => work.id === ref.id)!;
    const template = parsePortfolioCategory(read(entry.categoryId + ".v1.json"), entry.categoryId, catalog).get(ref.id)!;
    assert.equal(template.portfolioReferenceId, ref.id);
    assert.equal(template.title, ref.title);
    const opened = createPortfolioDocument(template, createEmptyDrawing(), { width: 1000, height: 800 });
    opened.title = "我自己的名字";
    const restored = parseDrawingDocument(JSON.parse(JSON.stringify(opened)));
    assert.equal(getPaintingReference(restored.portfolioReferenceId)?.title, ref.title);
    assert.ok(restored.elements.every((element) => element.type === "shape"));
  }
});

test("legacy documents remain valid and imported reference fields cannot supply image URLs", () => {
  const legacy = createEmptyDrawing();
  for (const schemaVersion of [1, 2, 3]) {
    assert.equal(parseDrawingDocument({ ...legacy, schemaVersion }).portfolioReferenceId, undefined);
  }
  for (const portfolioReferenceId of ["../../secret", "https://example.com/image.jpg", 42, null, "pc-1234"]) {
    assert.throws(() => parseDrawingDocument({ ...legacy, portfolioReferenceId }));
  }
  assert.equal(getPaintingReference("pc-999"), undefined);
  assert.equal(getPaintingReference(undefined), undefined);
  assert.deepEqual(clampReferencePosition({ x: 9999, y: -300 }, { width: 260, height: 400 }, { width: 390, height: 844 }), { x: 122, y: 8 });
  assert.deepEqual(clampReferencePosition({ x: 500, y: 500 }, { width: 260, height: 400 }, { width: 270, height: 410 }), { x: 8, y: 8 });
});
