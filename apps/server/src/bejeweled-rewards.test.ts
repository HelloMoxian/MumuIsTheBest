import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Fastify from "fastify";
import { COLORS, createGame, type Frame, type MoveResult } from "./bejeweled-engine.js";
import { calculateGemRewards } from "./bejeweled-rewards.js";
import { migrateBejeweled, registerBejeweledApi, type BejeweledState } from "./bejeweled.js";
import { registerFruitSliceHistoryApi } from "./fruit-slice-history.js";
import { registerWorldTowerApi } from "./world-tower.js";

function rewardFor(groups: number[][], cleared: number[], random = () => 0) {
  const frame: Frame = { board: [], groups, cleared, created: [], points: 0, cascade: 1, phase: "clear" };
  return calculateGemRewards({ frames: [frame] } as MoveResult, random);
}
test("match rewards: random triple, four pays 2+2, five or intersections pay 5+5", () => {
  assert.deepEqual(rewardFor([[0, 1, 2]], [0, 1, 2]), { knowledge: 1, energy: 0 });
  assert.deepEqual(rewardFor([[0, 1, 2]], [0, 1, 2], () => .5), { knowledge: 0, energy: 1 });
  assert.deepEqual(rewardFor([[0, 1, 2, 3]], [0, 1, 3]), { knowledge: 2, energy: 2 });
  assert.deepEqual(rewardFor([[0, 1, 2, 3, 4]], [0, 1, 3, 4]), { knowledge: 5, energy: 5 });
  assert.deepEqual(rewardFor([[0, 1, 2, 3, 4, 5]], [0, 1, 2, 3, 5]), { knowledge: 5, energy: 5 });
  assert.deepEqual(rewardFor([[0, 1, 2, 10, 18]], [0, 1, 10, 18]), { knowledge: 5, energy: 5 });
});
test("independent simultaneous groups and blast-only gems pay separately without double counting", () => {
  let draws = 0;
  const random = () => (draws++ % 2) ? .75 : .25;
  assert.deepEqual(rewardFor([[0, 1, 2], [8, 9, 10]], [0, 1, 2, 8, 9, 10, 20, 21], random), { knowledge: 2, energy: 2 });
  assert.equal(draws, 4);
  assert.deepEqual(rewardFor([], Array.from({ length: 64 }, (_, i) => i)), { knowledge: 64, energy: 0 });
});
test("reward cursor survives partial settlement, service restart, changed balances, and duplicate operation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mumu-bejeweled-wallets-"));
  const root = resolve(import.meta.dirname, "../../..");
  let failEnergy = false;
  function server() {
    const app = Fastify();
    const knowledge = registerWorldTowerApi(app, dir, root);
    const energy = registerFruitSliceHistoryApi(app, dir);
    registerBejeweledApi(app, dir, {
      knowledge: knowledge.creditBejeweled,
      energy: total => { if (failEnergy && total > 0) return Promise.reject(new Error("disk unavailable")); return energy.creditBejeweled(total); },
    });
    return { app, knowledge, energy };
  }
  let current = server();
  const path = join(dir, "learning/games/bejeweled-state.json");
  const knowledgePath = join(dir, "learning/world-tower/progress.json");
  const energyPath = join(dir, "learning/games/fruit-slice-history.json");
  try {
    const loaded = (await current.app.inject({ url: "/api/games/bejeweled" })).json();
    const { balances: _balance, ...initial } = loaded;
    const game = createGame(143);
    game.board = Array.from({ length: 64 }, (_, id) => ({ id, color: COLORS[(Math.floor(id / 8) * 2 + id % 8) % 7], special: "normal" as const }));
    game.nextId = 64;
    for (const i of [0, 1, 3, 10]) game.board[i]!.color = "red";
    game.board[2]!.color = "white";
    await writeFile(path, JSON.stringify({ ...initial, game }));
    failEnergy = true;
    const payload = { type: "swap", a: 10, b: 2, revision: 0, operationId: randomUUID() };
    const failed = await current.app.inject({ method: "POST", url: "/api/games/bejeweled", payload });
    assert.equal(failed.statusCode, 503);
    const pending = JSON.parse(await readFile(path, "utf8")) as BejeweledState;
    assert.equal(pending.rewardStatus, "pending");
    assert.ok(pending.lastReward.knowledge >= 2 && pending.lastReward.energy >= 2);
    const firstWallet = JSON.parse(await readFile(knowledgePath, "utf8"));
    assert.equal(firstWallet.coinBalance, pending.rewardTotals.knowledge);
    await current.app.close();
    failEnergy = false;
    current = server();
    await current.app.ready(); // Recover without a browser resubmitting the move.
    assert.equal(JSON.parse(await readFile(path, "utf8")).rewardStatus, "settled");
    const energyWallet = JSON.parse(await readFile(energyPath, "utf8"));
    assert.equal(energyWallet.energyCoinBalance, pending.rewardTotals.energy);
    const replay = await current.app.inject({ method: "POST", url: "/api/games/bejeweled", payload });
    assert.equal(replay.json().replayed, true);
    assert.deepEqual(replay.json().state.rewardTotals, pending.rewardTotals);
    assert.equal(replay.json().balances.knowledge, firstWallet.coinBalance);
    // Spending or a parent reset must not make the same entitlement payable again.
    const spent = JSON.parse(await readFile(knowledgePath, "utf8"));
    spent.coinBalance = 0; await writeFile(knowledgePath, JSON.stringify(spent));
    assert.equal((await current.knowledge.creditBejeweled(pending.rewardTotals.knowledge)).balance, 0);
    const energySpent = JSON.parse(await readFile(energyPath, "utf8"));
    energySpent.energyCoinBalance = 0; await writeFile(energyPath, JSON.stringify(energySpent));
    assert.equal((await current.energy.creditBejeweled(pending.rewardTotals.energy)).balance, 0);
    await assert.rejects(current.knowledge.creditBejeweled(0), /CURSOR_AHEAD/);
    await assert.rejects(current.energy.creditBejeweled(0), /CURSOR_AHEAD/);
    const invalid = await current.app.inject({ method: "POST", url: "/api/games/bejeweled", payload: { ...payload, knowledge: 999 } });
    assert.equal(invalid.statusCode, 400);
  } finally { await current.app.close(); await rm(dir, { recursive: true, force: true }); }
});
test("v1 migration preserves the board and history, has no retroactive reward, and keeps a recovery copy", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mumu-bejeweled-migrate-"));
  const app = Fastify();
  const wallets = { knowledge: async (total: number) => ({ balance: total, updatedAt: new Date().toISOString() }), energy: async (total: number) => ({ balance: total, updatedAt: new Date().toISOString() }) };
  registerBejeweledApi(app, dir, wallets);
  const path = join(dir, "learning/games/bejeweled-state.json");
  try {
    const loaded = (await app.inject({ url: "/api/games/bejeweled" })).json();
    const { balances, rewardTotals, lastReward, rewardStatus, ...state } = loaded;
    const original = JSON.stringify({ ...state, schemaVersion: 1 });
    await writeFile(path, original);
    const migrated = migrateBejeweled(JSON.parse(original));
    assert.equal(migrated.schemaVersion, 2);
    assert.deepEqual(migrated.game, state.game);
    assert.deepEqual(migrated.rewardTotals, { knowledge: 0, energy: 0 });
    const response = await app.inject({ method: "POST", url: "/api/games/bejeweled", payload: { type: "new", mode: "classic", revision: 0, operationId: randomUUID() } });
    assert.equal(response.statusCode, 200);
    assert.equal(await readFile(path + ".v1.bak", "utf8"), original);
    assert.throws(() => migrateBejeweled({ ...state, schemaVersion: 3 }));
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
