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
  const url = process.env.PORTFOLIO_TEST_URL || "http://127.0.0.1:5187/games/drawing-studio";
  await page.goto(url);
  const entry = page.getByRole("button", { name: "预制作品集", exact: true });
  const dialog = page.getByRole("dialog", { name: "预制作品集", exact: true });
  await entry.click();
  await dialog.getByLabel("找作品").fill("世界名画");
  await dialog.getByText("找到 60 幅 · 共 360 幅", { exact: true }).waitFor();
  await dialog.getByLabel("找作品").fill("pc-316");
  await page.locator('[data-work-id="pc-316"]').click();
  await dialog.getByRole("button", { name: "开始涂色", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const panel = page.getByRole("complementary", { name: "名画参考窗" });
  const image = panel.getByRole("img", { name: "星夜原画参考" });
  await image.waitFor();
  await page.waitForFunction(() => document.querySelector(".painting-reference img")?.naturalWidth > 0);
  assert.equal(await page.locator(".drawing-canvas image").count(), 0, "Reference must never enter exported SVG");
  const before = await page.locator(".drawing-canvas").innerHTML();
  await panel.getByRole("button", { name: "放大参考图", exact: true }).click();
  assert.equal(await panel.getByLabel("参考图缩放比例").textContent(), "125%");
  await panel.getByRole("button", { name: "适合", exact: true }).click();
  const move = panel.getByRole("button", { name: "移动参考图，拖动或用方向键移动" });
  const a = await panel.boundingBox();
  await move.focus(); await page.keyboard.press("ArrowRight");
  const b = await panel.boundingBox();
  assert.ok(b.x >= a.x + 19);
  const handle = await move.boundingBox();
  await page.mouse.move(handle.x + 25, handle.y + 25); await page.mouse.down();
  await page.mouse.move(handle.x + 175, handle.y + 70, { steps: 8 }); await page.mouse.up();
  const c = await panel.boundingBox();
  assert.ok(c.x > b.x + 100);
  assert.equal(await page.locator(".drawing-canvas").innerHTML(), before, "Reference gestures must not edit artwork");
  if (process.env.PORTFOLIO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PORTFOLIO_SCREENSHOT_DIR, "masterpiece-desktop.png") });
  await panel.getByRole("button", { name: "关闭参考图" }).click();
  await panel.waitFor({ state: "hidden" });
  const reopen = page.getByRole("button", { name: "参考原画", exact: true });
  await page.waitForFunction(() => document.activeElement?.textContent === "参考原画");
  await reopen.click(); await panel.waitFor();
  await panel.getByRole("button", { name: "关闭参考图" }).focus(); await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  await reopen.click(); await panel.waitFor();
  await page.waitForFunction(() => document.querySelector(".painting-reference img")?.naturalWidth > 0);
  await page.waitForTimeout(700);
  assert.equal(state.payload.portfolioReferenceId, "pc-316");
  await page.reload(); await panel.waitFor();
  await page.waitForFunction(() => document.querySelector(".painting-reference img")?.naturalWidth > 0);
  // A real missing reference remains a recoverable, independent failure.
  await panel.getByRole("button", { name: "关闭参考图" }).click();
  await page.route("**/images/drawing-studio/masterpieces/pc-316.jpg", (route) => route.abort());
  await page.reload();
  await panel.getByRole("button", { name: "重试参考图" }).waitFor();
  await page.unroute("**/images/drawing-studio/masterpieces/pc-316.jpg");
  await panel.getByRole("button", { name: "重试参考图" }).click();
  await page.waitForFunction(() => document.querySelector(".painting-reference img")?.naturalWidth > 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const mobile = await panel.boundingBox();
  assert.ok(mobile.x >= 0 && mobile.y >= 0 && mobile.x + mobile.width <= 390 && mobile.y + mobile.height <= 844);
  if (process.env.PORTFOLIO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PORTFOLIO_SCREENSHOT_DIR, "masterpiece-mobile.png") });
  await panel.getByRole("button", { name: "关闭参考图" }).click();
  await entry.click(); await dialog.getByLabel("找作品").fill("pc-001");
  await page.locator('[data-work-id="pc-001"]').click();
  await dialog.getByRole("button", { name: "保存当前画布并开始", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("button", { name: "参考原画", exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: 60 paintings, local reference, zoom/fit, pointer and keyboard movement, canvas isolation, close/reopen/Escape, restored association, image retry, mobile bounds and switching to a normal work. All APIs mocked.");
} finally { await context.close(); await browser.close(); }
