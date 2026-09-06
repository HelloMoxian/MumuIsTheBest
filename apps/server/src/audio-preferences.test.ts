import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { registerPersistentUserDataApi } from "./persistent-user-data.js";
import { DEFAULT_AUDIO_PREFERENCES as defaults } from "./audio-preferences.js";
test("音频偏好空记录、持久恢复、独立设置与非法输入", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mumu-audio-test-"));
  const app = Fastify(); registerPersistentUserDataApi(app, dir);
  const url = "/api/persistent-data/audio-preferences";
  try {
    assert.equal((await app.inject({ url })).json().state, null);
    const saved = await app.inject({ url, method: "PUT", payload: { payload: { ...defaults, musicEnabled: false, track: "scifi", musicVolume: .3 } } });
    assert.equal(saved.statusCode, 200);
    const before = saved.json().state;
    assert.equal(before.schemaVersion, 1); assert.ok(before.id); assert.ok(before.createdAt);
    assert.equal((await app.inject({ url })).json().state.payload.musicEnabled, false);
    for (const payload of [{ ...defaults, track: "unknown" }, { ...defaults, musicVolume: 1.1 }, { ...defaults, schemaVersion: 2 }, { ...defaults, source: "https://example.com" }, {}])
      assert.equal((await app.inject({ url, method: "PUT", payload: { payload } })).statusCode, 400);
    assert.deepEqual((await app.inject({ url })).json().state, before);
    const path = join(dir, "preferences/audio.json");
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await app.close();
    const reopened = Fastify(); registerPersistentUserDataApi(reopened, dir);
    assert.deepEqual((await reopened.inject({ url })).json().state, before);
    await reopened.close();
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
test("现有语言设置兼容，损坏和未来版本不覆盖，写入错误可恢复", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mumu-audio-failure-"));
  const app = Fastify(); registerPersistentUserDataApi(app, dir);
  const url = "/api/persistent-data/audio-preferences", path = join(dir, "preferences/audio.json");
  try {
    const legacy = { interfaceMode: "zh", readAloudMode: "none" };
    assert.equal((await app.inject({ method: "PUT", url: "/api/persistent-data/experience-preferences", payload: { payload: legacy } })).statusCode, 200);
    await mkdir(join(dir, "preferences"), { recursive: true });
    for (const damaged of ["{bad", JSON.stringify({ schemaVersion: 88, payload: defaults })]) {
      await writeFile(path, damaged);
      assert.equal((await app.inject({ url })).statusCode, 500);
      assert.equal((await app.inject({ url, method: "PUT", payload: { payload: defaults } })).statusCode, 500);
      assert.equal(await readFile(path, "utf8"), damaged);
    }
    await rm(path); await mkdir(path);
    assert.equal((await app.inject({ url, method: "PUT", payload: { payload: defaults } })).statusCode, 500);
    await rm(path, { recursive: true });
    assert.equal((await app.inject({ url, method: "PUT", payload: { payload: defaults } })).statusCode, 200);
    assert.deepEqual((await app.inject({ url: "/api/persistent-data/experience-preferences" })).json().state.payload, legacy);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
