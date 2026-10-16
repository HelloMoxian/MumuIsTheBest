// Isolated browser regression: synthetic microphone, all /api calls intercepted.
// PLAYWRIGHT_MODULE may point to the desktop's bundled playwright package.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const now = "2026-01-01T00:00:00.000Z";
let state = { schemaVersion: 1, id: "metronome-library", createdAt: now, updatedAt: now, revision: 1,
  library: { schemaVersion: 2, activeId: "test-project", projects: [{ id: "test-project", title: "合成测试乐队", createdAt: now, updatedAt: now,
    preset: "pop", bpm: 200, bars: 2, backing: true, click: "low", volume: .5, snap: "auto", scale: "major", activeTrackId: "test-track",
    tracks: [{ id: "test-track", instrument: "piano", volume: .8, muted: false, solo: false, octave: 0, mode: "notes",
      notes: [{ id: "old-note", key: 0, tick: 0, duration: 48, velocity: .8 }] }] }] } };
let failSave = false;
const errors = [], saved = [];
page.on("pageerror", error => errors.push(error.message));
await page.route("**/api/**", async route => {
  const request = route.request(), url = new URL(request.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (url.pathname === "/api/metronome") {
    if (request.method() === "PUT") {
      if (failSave) return json({ message: "测试保存失败，当前编辑已保留。" }, 503);
      const { expectedRevision, library } = request.postDataJSON();
      assert.equal(expectedRevision, state.revision);
      state = { ...state, revision: state.revision + 1, library, updatedAt: new Date().toISOString() }; saved.push(structuredClone(library));
    }
    return json({ state });
  }
  return json({ message: "Isolated test: unrelated API unavailable" }, 503);
});
await page.addInitScript(() => {
  window.humTestMode = "ok";
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
    if (window.humTestMode === "denied") throw new DOMException("test permission denied", "NotAllowedError");
    if (window.humTestMode === "pending") await new Promise(resolve => { window.grantHum = resolve; });
    const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(), output = context.createMediaStreamDestination();
    gain.gain.value = 0; oscillator.frequency.value = 440;
    oscillator.connect(gain); gain.connect(output); oscillator.start(); await context.resume();
    window.humTest = { context, oscillator, gain, stream: output.stream };
    return output.stream;
  } });
});
const url = process.env.METRONOME_TEST_URL || "http://127.0.0.1:5187/art/metronome";
const notes = () => state.library.projects[0].tracks[0].notes;
const signal = (pitch, gain) => page.evaluate(({ pitch, gain }) => {
  window.humTest.oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12); window.humTest.gain.gain.value = gain;
}, { pitch, gain });
const begin = async () => {
  await page.getByRole("button", { name: "哼唱录入", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".metro-record-position")?.textContent?.startsWith("录制中"));
};
const closeSource = () => page.evaluate(async () => { await window.humTest?.context.close(); });
try {
  await page.goto(url);
  await page.getByRole("button", { name: "哼唱录入", exact: true }).waitFor();
  await begin();
  await signal(61, .04); await page.waitForTimeout(430);
  await signal(61, 0); await page.waitForTimeout(180);
  await signal(61, .23); await page.waitForTimeout(430);
  await signal(64, .1); await page.waitForTimeout(450);
  await page.getByRole("button", { name: "收好哼唱", exact: true }).click();
  await page.getByRole("button", { name: "清除原声", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".metro-save")?.textContent === "已保存");
  const added = notes().filter(n => n.pitch !== undefined);
  assert.deepEqual(added.map(n => n.pitch), [61, 61, 64]);
  assert.ok(added[1].velocity > added[0].velocity); assert.ok(added.every(n => n.duration > 50));
  assert.equal(state.library.schemaVersion, 3); assert.equal(notes()[0].id, "old-note");
  assert.equal(await page.evaluate(() => window.humTest.stream.getAudioTracks()[0].readyState), "ended");
  assert.equal(await page.locator(".metro-note-mark").count(), 4);
  for (const [width, height] of [[1366, 768], [375, 667]]) {
    await page.setViewportSize({ width, height });
    const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }));
    assert.ok(overflow.x <= 1 && overflow.y <= 1, "Original preview layout: " + JSON.stringify(overflow));
  }
  if (process.env.METRONOME_MOBILE_SCREENSHOT) await page.screenshot({ path: process.env.METRONOME_MOBILE_SCREENSHOT });
  await page.setViewportSize({ width: 1366, height: 768 });
  // Native original preview is audible only after an explicit play action.
  await page.locator(".metro-hum-panel audio").evaluate(audio => audio.play());
  await page.waitForTimeout(120);
  assert.equal(await page.locator(".metro-hum-panel audio").evaluate(audio => audio.paused), false);
  await page.locator(".metro-hum-panel audio").evaluate(audio => audio.pause());
  await closeSource();
  if (process.env.METRONOME_SCREENSHOT) await page.screenshot({ path: process.env.METRONOME_SCREENSHOT });
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".metro-note-mark").length === 1);
  await page.waitForFunction(() => document.querySelector(".metro-save")?.textContent === "已保存");
  assert.equal(notes().length, 1);
  // Denial and delayed permission must not alter the existing take or reopen capture.
  await page.evaluate(() => { window.humTestMode = "denied"; });
  await page.getByRole("button", { name: "哼唱录入", exact: true }).click();
  await page.locator(".metro-notice").getByText(/麦克风还未授权/).waitFor(); assert.equal(notes().length, 1);
  await page.evaluate(() => { window.humTestMode = "pending"; });
  await page.getByRole("button", { name: "哼唱录入", exact: true }).click();
  await page.getByRole("button", { name: "取消麦克风", exact: true }).click();
  await page.evaluate(() => window.grantHum()); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.humTest.stream.getAudioTracks()[0].readyState), "ended");
  assert.equal(notes().length, 1); await closeSource();
  // A completed take automatically ends the lease and continues loop playback.
  await page.evaluate(() => { window.humTestMode = "ok"; });
  await begin(); await signal(72, .1);
  await page.getByRole("button", { name: "哼唱录入", exact: true }).waitFor({ timeout: 6000 });
  await page.waitForFunction(() => document.querySelector(".metro-save")?.textContent === "已保存");
  assert.equal(notes().at(-1).pitch, 72);
  await page.getByRole("button", { name: "停止", exact: true }).click(); await closeSource();
  // A microphone failure retains the partial melody; save failures retain it for retry.
  failSave = true;
  await begin(); await signal(67, .1); await page.waitForTimeout(450);
  await page.evaluate(() => window.humTest.stream.getAudioTracks()[0].dispatchEvent(new Event("ended")));
  await page.getByRole("button", { name: "重试保存", exact: true }).waitFor();
  const beforeRetry = notes().length;
  assert.ok(await page.locator(".metro-note-mark").count() > beforeRetry);
  failSave = false; await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".metro-save")?.textContent === "已保存");
  assert.equal(notes().at(-1).pitch, 67); await closeSource();
  await page.reload(); await page.getByRole("button", { name: "哼唱录入", exact: true }).waitFor();
  assert.equal(await page.locator(".metro-hum-panel audio").count(), 0);
  await page.getByRole("button", { name: "手动编辑钢琴", exact: true }).click();
  const editor = page.getByRole("region", { name: "钢琴手动编辑" });
  await editor.getByLabel("编辑第几小节").selectOption("0");
  assert.match(await editor.textContent(), /C5|G4/);
  await page.getByRole("button", { name: "完成手动编辑", exact: true }).click();
  // JSON and WAV exports retain editable absolute pitches and actual rendered audio.
  await page.getByRole("button", { name: "作品", exact: true }).click();
  await page.getByRole("button", { name: "导出音乐", exact: true }).click();
  const jsonDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "下载可编辑作品", exact: true }).click();
  assert.ok((await jsonDownload).suggestedFilename().endsWith(".json"));
  const wavDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "下载音乐", exact: true }).click();
  assert.ok((await wavDownload).suggestedFilename().endsWith(".wav"));
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  for (const [width, height] of [[1366, 768], [375, 667]]) {
    await page.setViewportSize({ width, height });
    const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }));
    assert.ok(overflow.x <= 1 && overflow.y <= 1, JSON.stringify(overflow));
  }
  assert.deepEqual(errors, []); assert.ok(saved.length >= 4);
  console.log("PASS: chromatic pitch/velocity/duration, original preview, undo, v2 migration, permission denial/cancel, automatic finish, disconnect/save retry, reload/edit, JSON/WAV, desktop/mobile; synthetic input only.");
} catch (error) {
  console.error(await page.locator(".metro").innerText().catch(() => "Page unavailable"));
  await page.screenshot({ path: "/tmp/mumu-humming-ui-failure.png" }).catch(() => undefined);
  throw error;
} finally { await browser.close(); }
