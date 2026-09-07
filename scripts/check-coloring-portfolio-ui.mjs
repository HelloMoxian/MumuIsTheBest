// Run against a dedicated Vite dev server. Every /api request is intercepted;
// this check never contacts the real server or reads/writes personal data.
// PLAYWRIGHT_MODULE may point to the desktop's bundled Playwright package.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
let state = null;
let failSave = false;
const checkpoints = [];
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (url.pathname === "/api/persistent-data/drawing-studio") {
    if (request.method() === "PUT") {
      const now = new Date().toISOString();
      state = { stableId: "drawing-studio", createdAt: now, updatedAt: now, payload: request.postDataJSON().payload };
    }
    return json({ state });
  }
  if (url.pathname.startsWith("/api/persistent-data/")) return json({ state: null });
  if (url.pathname === "/api/drawing-studio/works") return json({ works: [] });
  if (url.pathname.startsWith("/api/drawing-studio/works/") && request.method() === "PUT") {
    const { document, thumbnailDataUrl } = request.postDataJSON();
    checkpoints.push(document);
    if (failSave) return json({ message: "模拟保存失败，当前画布已保留。" }, 503);
    return json({ summary: { id: document.id, title: document.title, author: document.author, locked: false,
      createdAt: document.createdAt, updatedAt: document.updatedAt, elementCount: document.elements.length, thumbnailDataUrl } });
  }
  return json({ message: "Isolated UI test: unrelated service unavailable" }, 503);
});

try {
  await page.goto(process.env.PORTFOLIO_TEST_URL || "http://127.0.0.1:5187/games/drawing-studio");
  const entry = page.getByRole("button", { name: "预制作品集", exact: true });
  await entry.click();
  const dialog = page.getByRole("dialog", { name: "预制作品集", exact: true });
  await page.locator(".portfolio-card").first().waitFor();
  assert.equal(await page.locator(".portfolio-card").count(), 12);
  await dialog.getByLabel("找作品").fill("不存在的作品xyz");
  await dialog.getByText("还没有找到这个作品，换个名字或主题试试。").waitFor();
  await dialog.getByRole("button", { name: "清除筛选" }).click();
  await dialog.getByLabel("选主题").selectOption("category-03");
  await page.locator('[data-work-id="pc-031"]').waitFor();
  await dialog.getByRole("button", { name: "下一页" }).click();
  await page.locator('[data-work-id="pc-043"]').waitFor();
  assert.equal(await page.locator(".portfolio-card").count(), 3);
  await dialog.getByLabel("选主题").selectOption("all");
  await dialog.getByLabel("找作品").fill("pc-091");
  await page.locator('[data-work-id="pc-091"]').click();
  if (process.env.PORTFOLIO_SCREENSHOT_DIR) await dialog.screenshot({ path: path.join(process.env.PORTFOLIO_SCREENSHOT_DIR, "browser-desktop.png") });
  await dialog.getByRole("button", { name: "开始涂色", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.querySelector(".drawing-stage")?.classList.contains("tool-fill"));
  // Click an exposed roof area via the actual rendered primitive's coordinates.
  const roof = page.locator('.drawing-canvas [data-element-id] polygon').first();
  const roofBox = await roof.boundingBox();
  assert.ok(roofBox);
  await page.mouse.click(roofBox.x + roofBox.width / 2, roofBox.y + roofBox.height * .62);
  await page.waitForFunction(() => [...document.querySelectorAll(".drawing-canvas [data-region-id='fill']")].some((e) => e.getAttribute("fill") === "#ffd166"));
  await page.getByRole("button", { name: /撤销/ }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll(".drawing-canvas [data-region-id='fill']")].some((e) => e.getAttribute("fill") === "#ffd166"));
  await page.getByRole("button", { name: /重做/ }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".drawing-canvas [data-region-id='fill']")].some((e) => e.getAttribute("fill") === "#ffd166"));
  await entry.click();
  await dialog.getByLabel("找作品").fill("pc-226");
  await page.locator('[data-work-id="pc-226"]').click();
  failSave = true;
  await dialog.getByRole("button", { name: "保存当前画布并开始" }).click();
  await dialog.getByRole("alert").waitFor();
  assert.ok((await page.locator(".drawing-document-name strong").textContent()).includes("周末家庭花园"));
  const failedId = checkpoints.at(-1).id;
  failSave = false;
  await dialog.getByRole("button", { name: "保存当前画布并开始" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(checkpoints.at(-1).id, failedId);
  assert.equal(await page.locator(".drawing-document-name strong").textContent(), "火车山谷线");
  const count = checkpoints.length;
  await entry.click();
  await dialog.getByLabel("找作品").fill("pc-250");
  await page.locator('[data-work-id="pc-250"]').click();
  await dialog.getByRole("button", { name: "开始涂色", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(checkpoints.length, count, "Untouched templates must not create backups");
  await page.setViewportSize({ width: 390, height: 844 });
  await entry.click();
  await page.locator(".portfolio-card").first().waitFor();
  assert.ok(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
  if (process.env.PORTFOLIO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PORTFOLIO_SCREENSHOT_DIR, "browser-mobile.png") });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await entry.evaluate((e) => document.activeElement === e), true);
  assert.deepEqual(errors, []);
  console.log("PASS: browse, categories, pagination, empty search, preview, colouring, undo/redo, failed save preservation, retry identity, pristine switching, mobile width, Escape and focus. All APIs mocked.");
} finally { await context.close(); await browser.close(); }
