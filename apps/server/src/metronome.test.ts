import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, readdir, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import Fastify from "fastify";
import { CLICK_LEVELS, parseMusicLibrary, parseMusicState, type MusicLibrary } from "./metronome-contract.js";
import { registerMetronomeApi } from "./metronome.js";
const now = "2026-01-01T00:00:00.000Z";
function fixture(): MusicLibrary {
  return { schemaVersion: 2, activeId: "project-one", projects: [{
    id: "project-one", title: "测试乐队", createdAt: now, updatedAt: now, preset: "pop", bpm: 90, bars: 2,
    backing: true, click: "low", volume: .7, snap: "auto", scale: "major", activeTrackId: "track-one",
    tracks: [{ id: "track-one", instrument: "piano", volume: .8, muted: false, solo: false, octave: 0, mode: "notes",
      notes: [{ id: "note-one", key: 0, tick: 0, duration: 48, velocity: .8 }] }],
  }] };
}
function legacyFixture(click = true) {
  const library = fixture();
  return { ...library, schemaVersion: 1, projects: library.projects.map(p => ({ ...p, click })) };
}
const legacyState = () => ({ schemaVersion: 1, id: "metronome-library", createdAt: now, updatedAt: now, revision: 4, library: legacyFixture() });
async function setup(run: (app: ReturnType<typeof Fastify>, dir: string) => Promise<void>) {
  const dir = await mkdtemp(resolve(tmpdir(), "mumu-metronome-test-"));
  const app = Fastify({ logger: false }); registerMetronomeApi(app, dir);
  try { await run(app, dir); } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
}
test("v2 accepts an empty track/project and rejects unknown versions", () => {
  assert.deepEqual(parseMusicLibrary(fixture()), fixture());
  const empty = fixture(); empty.projects[0].tracks = []; empty.projects[0].activeTrackId = null;
  assert.ok(parseMusicLibrary(empty));
  for (const v of [null, [], {}, { ...fixture(), schemaVersion: 0 }, { ...fixture(), schemaVersion: 3 }, { ...fixture(), extra: "bad" }]) assert.equal(parseMusicLibrary(v), undefined);
  assert.equal(parseMusicLibrary({ ...fixture(), projects: [] }), undefined);
  assert.equal(parseMusicLibrary({ ...fixture(), activeId: "missing" }), undefined);
});
test("v1 switches migrate to off/low without mutating the input, while v2 validates all four levels", () => {
  for (const enabled of [false, true]) {
    const legacy = legacyFixture(enabled), before = structuredClone(legacy);
    const expected = fixture(); expected.projects[0].click = enabled ? "low" : "off";
    assert.deepEqual(parseMusicLibrary(legacy), expected);
    assert.deepEqual(legacy, before);
  }
  assert.deepEqual(parseMusicState(legacyState())?.library, fixture());
  for (const click of CLICK_LEVELS) {
    const library = fixture(); library.projects[0].click = click;
    assert.deepEqual(parseMusicLibrary(library), library);
  }
  for (const click of [true, false, 0, 1, "loud", "", null]) {
    const library = fixture(); Object.assign(library.projects[0], { click });
    assert.equal(parseMusicLibrary(library), undefined);
  }
  assert.equal(parseMusicLibrary({ ...fixture(), schemaVersion: 1 }), undefined);
  const invalidLegacy = legacyFixture(); invalidLegacy.projects[0].tracks[0].notes[0].tick = -1;
  assert.equal(parseMusicLibrary(invalidLegacy), undefined, "migration still validates all legacy notes");
});
test("rejects malformed notes, unknown instruments, excessive data and broken references", () => {
  for (const patch of [{ tick: -1 }, { tick: 768 }, { duration: 769 }, { duration: 0 }, { key: 10 }, { key: 1.5 }, { velocity: 1.1 }, { velocity: NaN }, { unexpected: true }]) {
    const v = fixture(); Object.assign(v.projects[0].tracks[0].notes[0], patch);
    assert.equal(parseMusicLibrary(v), undefined, JSON.stringify(patch));
  }
  for (const patch of [{ instrument: "fake" }, { volume: Infinity }, { octave: 2 }, { muted: 1 }, { mode: "unknown" }]) {
    const v = fixture(); Object.assign(v.projects[0].tracks[0], patch); assert.equal(parseMusicLibrary(v), undefined);
  }
  const repeated = fixture(); repeated.projects[0].tracks[0].notes.push({ ...repeated.projects[0].tracks[0].notes[0] });
  assert.equal(parseMusicLibrary(repeated), undefined);
  const bad = fixture(); bad.projects[0].activeTrackId = "absent"; assert.equal(parseMusicLibrary(bad), undefined);
  const many = fixture(); many.projects = Array.from({ length: 25 }, (_, i) => ({ ...many.projects[0], id: "project-" + i })); assert.equal(parseMusicLibrary(many), undefined);
});
test("empty store, serial atomic writes, private permissions and reopening preserve identity and notes", () => setup(async (app, dir) => {
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/metronome" })).json(), { state: null });
  const first = await app.inject({ method: "PUT", url: "/api/metronome", payload: { expectedRevision: 0, library: fixture() } });
  assert.equal(first.statusCode, 200);
  const state = parseMusicState(first.json().state)!; assert.ok(state);
  assert.equal(state.revision, 1);
  const path = resolve(dir, "creative/metronome-library.json");
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  const next = fixture(); next.projects[0].bpm = 120; next.projects[0].click = "high";
  const second = await app.inject({ method: "PUT", url: "/api/metronome", payload: { expectedRevision: 1, library: next } });
  assert.equal(second.statusCode, 200); assert.equal(second.json().state.revision, 2);
  assert.equal(second.json().state.createdAt, state.createdAt);
  assert.deepEqual(await readdir(resolve(dir, "creative")), ["metronome-library.json"]);
  const reopened = Fastify({ logger: false }); registerMetronomeApi(reopened, dir);
  try { assert.deepEqual((await reopened.inject({ method: "GET", url: "/api/metronome" })).json().state.library, next); }
  finally { await reopened.close(); }
}));
test("v1 reads are non-mutating and first v2 save atomically preserves the exact original", () => setup(async (app, dir) => {
  const path = resolve(dir, "creative/metronome-library.json"), original = JSON.stringify(legacyState(), null, 2) + "\n";
  await mkdir(resolve(dir, "creative")); await writeFile(path, original);
  const loaded = await app.inject({ method: "GET", url: "/api/metronome" });
  assert.equal(loaded.statusCode, 200); assert.deepEqual(loaded.json().state.library, fixture());
  assert.equal(await readFile(path, "utf8"), original);
  assert.deepEqual(await readdir(resolve(dir, "creative")), ["metronome-library.json"]);
  const next = fixture(); next.projects[0].click = "high";
  const request = { method: "PUT" as const, url: "/api/metronome", payload: { expectedRevision: 4, library: next } };
  const responses = await Promise.all([app.inject(request), app.inject(request)]);
  assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 409]);
  const files = await readdir(resolve(dir, "creative")), backup = files.find(f => f.endsWith(".bak"))!;
  assert.equal(files.length, 2); assert.ok(backup);
  assert.equal(await readFile(resolve(dir, "creative", backup), "utf8"), original);
  assert.equal((await stat(resolve(dir, "creative", backup))).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")).library, next);
  assert.equal((await app.inject({ ...request, payload: { ...request.payload, expectedRevision: 5 } })).statusCode, 200);
  assert.deepEqual(await readdir(resolve(dir, "creative")), files);
  // Restoring the original and saving again reuses its verified recovery point.
  await writeFile(path, original);
  assert.equal((await app.inject(request)).statusCode, 200);
  assert.deepEqual(await readdir(resolve(dir, "creative")), files);
}));
test("a failed migration backup leaves the v1 file intact and a retry succeeds", () => setup(async (app, dir) => {
  const path = resolve(dir, "creative/metronome-library.json"), original = JSON.stringify(legacyState());
  await mkdir(resolve(dir, "creative")); await writeFile(path, original);
  const backup = path + ".v1." + createHash("sha256").update(original).digest("hex") + ".bak";
  await writeFile(backup, "invalid recovery point");
  const request = { method: "PUT" as const, url: "/api/metronome", payload: { expectedRevision: 4, library: fixture() } };
  const response = await app.inject(request);
  assert.equal(response.statusCode, 500); assert.equal(response.json().code, "WRITE_FAILED");
  assert.equal(await readFile(path, "utf8"), original);
  assert.equal((await readdir(resolve(dir, "creative"))).some(f => f.endsWith(".tmp")), false);
  await rm(backup);
  assert.equal((await app.inject(request)).statusCode, 200);
  assert.equal(await readFile(backup, "utf8"), original);
}));
test("concurrent old revisions cannot overwrite the winning window", () => setup(async (app) => {
  const results = await Promise.all([90, 110].map(bpm => {
    const library = fixture(); library.projects[0].bpm = bpm;
    return app.inject({ method: "PUT", url: "/api/metronome", payload: { expectedRevision: 0, library } });
  }));
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
  const winning = results.find(r => r.statusCode === 200)!.json().state;
  assert.deepEqual((await app.inject({ method: "GET", url: "/api/metronome" })).json().state, winning);
}));
test("corrupt and future files are never replaced by defaults or valid new requests", () => setup(async (app, dir) => {
  const path = resolve(dir, "creative/metronome-library.json");
  await mkdir(resolve(dir, "creative"));
  for (const original of ["not json", '{"schemaVersion":99}', JSON.stringify({ schemaVersion: 0 }),
    JSON.stringify({ ...legacyState(), library: { ...fixture(), schemaVersion: 3 } })]) {
    await writeFile(path, original);
    assert.equal((await app.inject({ method: "GET", url: "/api/metronome" })).statusCode, 500);
    assert.equal((await app.inject({ method: "PUT", url: "/api/metronome", payload: { expectedRevision: 0, library: fixture() } })).statusCode, 500);
    assert.equal(await readFile(path, "utf8"), original);
  }
}));
test("invalid requests leave the existing file intact", () => setup(async (app, dir) => {
  await app.inject({ method: "PUT", url: "/api/metronome", payload: { expectedRevision: 0, library: fixture() } });
  const path = resolve(dir, "creative/metronome-library.json"), original = await readFile(path, "utf8");
  for (const payload of [null, {}, { expectedRevision: -1, library: fixture() }, { expectedRevision: 1, library: { ...fixture(), schemaVersion: 3 } }]) {
    assert.equal((await app.inject({ method: "PUT", url: "/api/metronome", payload })).statusCode, 400);
    assert.equal(await readFile(path, "utf8"), original);
  }
}));
test("write failure returns an actionable error and a retry can succeed", () => setup(async (app, dir) => {
  await writeFile(resolve(dir, "creative"), "test fixture");
  const request = { method: "PUT" as const, url: "/api/metronome", payload: { expectedRevision: 0, library: fixture() } };
  const failure = await app.inject(request);
  assert.equal(failure.statusCode, 500); assert.equal(failure.json().code, "WRITE_FAILED");
  await rm(resolve(dir, "creative"));
  assert.equal((await app.inject(request)).statusCode, 200);
}));
