import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { registerPersistentUserDataApi } from "./persistent-user-data.js";
import type { State2048 } from "./game-2048-contract.js";

function fixture(): State2048 {
  return { schemaVersion: 1, activeSize: 4, games: Object.fromEntries([4, 5, 6].map(size =>
    [size, { cells: [1, 2, ...Array(size * size - 2).fill(0)], score: "0", best: "0", spawnPower: 1 }]
  )) as State2048["games"] };
}
test("2048 saves, restores, preserves best scores and protects incompatible records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mumu-2048-"));
  const app = Fastify({ logger: false }); registerPersistentUserDataApi(app, directory);
  const url = "/api/persistent-data/math-2048";
  try {
    assert.equal((await app.inject({ method: "GET", url })).json().state, null);
    const payload = fixture(); payload.games[4].best = "1234";
    const saved = await app.inject({ method: "PUT", url, payload: { payload } });
    assert.equal(saved.statusCode, 200);
    const reset = await app.inject({ method: "PUT", url, payload: { payload: fixture() } });
    assert.equal(reset.json().state.payload.games[4].best, "1234");
    assert.equal(reset.json().state.id, saved.json().state.id);
    assert.equal((await app.inject({ method: "GET", url })).json().state.payload.games[4].best, "1234");
    assert.equal((await app.inject({ method: "PUT", url, payload: { payload: { ...fixture(), schemaVersion: 2 } } })).statusCode, 400);
    const file = join(directory, "learning/math/2048-state.json");
    const incompatible = JSON.stringify({ ...saved.json().state, schemaVersion: 99 });
    await writeFile(file, incompatible);
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 500);
    assert.equal((await app.inject({ method: "PUT", url, payload: { payload: fixture() } })).statusCode, 500);
    assert.equal(await readFile(file, "utf8"), incompatible);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
test("2048 reports an unwritable data path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mumu-2048-failure-"));
  const blocked = join(directory, "blocked"); await writeFile(blocked, "fixture");
  const app = Fastify({ logger: false }); registerPersistentUserDataApi(app, blocked);
  try {
    const response = await app.inject({ method: "PUT", url: "/api/persistent-data/math-2048", payload: { payload: fixture() } });
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().code, "PERSISTENT_DATA_WRITE_FAILED");
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
