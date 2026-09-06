import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import Fastify from "fastify";
import { parseControllerPreferences } from "./game-controller-preferences.js";
import { registerPersistentUserDataApi } from "./persistent-user-data.js";

const example = () => ({ schemaVersion: 1, games: { tetris: { playerCount: 2, players: [
  { mode: "keyboard", device: null, bindings: { rotate: [{ kind: "button", index: 0 }] } },
  { mode: "gamepad", device: { id: "Test pad", mapping: "standard", occurrence: 0 }, bindings: { left: [{ kind: "axis", index: 0, direction: -1 }], rotate: [{ kind: "button", index: 5 }] } },
] } } });
test("shared contract validates empty and custom profiles; rejects malformed, duplicate and future data", () => {
  assert.deepEqual(parseControllerPreferences({ schemaVersion: 1, games: {} }), { schemaVersion: 1, games: {} });
  assert.deepEqual(parseControllerPreferences(example()), example());
  for (const invalid of [null, [], {}, { ...example(), schemaVersion: 2 }, { ...example(), unexpected: true }, { schemaVersion: 1, games: { "../escape": {} } }]) assert.equal(parseControllerPreferences(invalid), undefined);
  for (const patch of [
    { bad: [{ kind: "button", index: -1 }] },
    { bad: [{ kind: "button", index: 64 }] },
    { bad: [{ kind: "axis", index: 0, direction: 0 }] },
    { bad: [{ kind: "axis", index: 0, direction: NaN }] },
    { a: [{ kind: "button", index: 0 }], b: [{ kind: "button", index: 0 }] },
  ]) {
    const data = example();
    data.games.tetris.players[0].bindings = patch as never;
    assert.equal(parseControllerPreferences(data), undefined);
  }
  const duplicate = example();
  duplicate.games.tetris.players[0] = structuredClone(duplicate.games.tetris.players[1]);
  assert.equal(parseControllerPreferences(duplicate), undefined);
  assert.equal(parseControllerPreferences(JSON.parse('{"schemaVersion":1,"games":{"__proto__":{}}}')), undefined);
});

test("controller preferences persist atomically with stable identity and survive server reopening", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "mumu-controller-api-"));
  const url = "/api/persistent-data/game-controller-preferences";
  const app = Fastify({ logger: false });
  registerPersistentUserDataApi(app, directory);
  const reopen = Fastify({ logger: false });
  registerPersistentUserDataApi(reopen, directory);
  try {
    assert.deepEqual((await app.inject({ method: "GET", url })).json(), { state: null });
    const first = await app.inject({ method: "PUT", url, payload: { payload: example() } });
    assert.equal(first.statusCode, 200);
    const state = first.json().state;
    assert.equal(state.schemaVersion, 1);
    assert.match(state.id, /^[a-f0-9-]{36}$/);
    assert.ok(state.createdAt && state.updatedAt);
    const destination = resolve(directory, "preferences/game-controllers.json");
    assert.equal((await stat(destination)).mode & 0o777, 0o600);
    await app.close();
    assert.deepEqual((await reopen.inject({ method: "GET", url })).json().state.payload, example());
    const next = example(); next.games.tetris.playerCount = 1;
    const second = (await reopen.inject({ method: "PUT", url, payload: { payload: next } })).json().state;
    assert.equal(second.id, state.id);
    assert.equal(second.createdAt, state.createdAt);
    const invalid = await reopen.inject({ method: "PUT", url, payload: { payload: { ...next, schemaVersion: 99 } } });
    assert.equal(invalid.statusCode, 400);
    assert.deepEqual(JSON.parse(await readFile(destination, "utf8")).payload, next);
    await writeFile(destination, '{"schemaVersion":99}');
    assert.equal((await reopen.inject({ method: "GET", url })).statusCode, 500);
    assert.equal((await reopen.inject({ method: "PUT", url, payload: { payload: example() } })).statusCode, 500);
    assert.equal(await readFile(destination, "utf8"), '{"schemaVersion":99}');
  } finally { await app.close(); await reopen.close(); await rm(directory, { recursive: true }); }
});

test("controller API reports write failure and permits retry without losing prior state", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "mumu-controller-write-"));
  const occupied = resolve(directory, "occupied");
  await writeFile(occupied, "test fixture");
  const app = Fastify({ logger: false });
  registerPersistentUserDataApi(app, occupied);
  try {
    const result = await app.inject({ method: "PUT", url: "/api/persistent-data/game-controller-preferences", payload: { payload: example() } });
    assert.equal(result.statusCode, 500);
    assert.equal(result.json().code, "PERSISTENT_DATA_WRITE_FAILED");
  } finally { await app.close(); await rm(directory, { recursive: true }); }
});

test("independent game tabs merge their own preferences inside the server write queue", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "mumu-controller-tabs-"));
  const app = Fastify({ logger: false });
  registerPersistentUserDataApi(app, directory);
  const url = "/api/persistent-data/game-controller-preferences";
  try {
    const car = { schemaVersion: 1, games: { car: example().games.tetris } };
    const results = await Promise.all([
      app.inject({ method: "PUT", url, payload: { payload: example() } }),
      app.inject({ method: "PUT", url, payload: { payload: car } }),
    ]);
    assert.ok(results.every(r => r.statusCode === 200));
    const next = example(); next.games.tetris.playerCount = 1;
    await app.inject({ method: "PUT", url, payload: { payload: next } });
    const saved = (await app.inject({ method: "GET", url })).json().state.payload;
    assert.equal(saved.games.tetris.playerCount, 1);
    assert.deepEqual(saved.games.car, car.games.car);
  } finally { await app.close(); await rm(directory, { recursive: true }); }
});
