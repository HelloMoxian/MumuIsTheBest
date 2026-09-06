import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Fastify from "fastify";
import { BOARD_COLUMNS, BOARD_SIZE, COLORS, createGame, findMove, findRuns, playMove, type Frame, type MoveResult } from "./bejeweled-engine.js";
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
  assert.deepEqual(rewardFor([], Array.from({ length: BOARD_SIZE }, (_, i) => i)), { knowledge: BOARD_SIZE, energy: 0 });
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
    game.board = Array.from({ length: BOARD_SIZE }, (_, id) => ({ id, color: COLORS[(Math.floor(id / BOARD_COLUMNS) * 2 + id % BOARD_COLUMNS) % 7], special: "normal" as const }));
    game.nextId = BOARD_SIZE;
    for (const i of [0, 1, 3, 14]) game.board[i]!.color = "red";
    game.board[2]!.color = "white";
    await writeFile(path, JSON.stringify({ ...initial, game }));
    failEnergy = true;
    const payload = { type: "swap", a: 14, b: 2, revision: 0, operationId: randomUUID() };
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
    const { columns: _columns, rows: _rows, ...legacyGame } = createGame(128, "endless", 8, 8);
    const original = JSON.stringify({ ...state, game: legacyGame, schemaVersion: 1 });
    await writeFile(path, original);
    const migrated = migrateBejeweled(JSON.parse(original));
    assert.equal(migrated.schemaVersion, 3);
    assert.equal(migrated.game.board.length, BOARD_SIZE);
    legacyGame.board.forEach((gem, index) => assert.deepEqual(migrated.game.board[Math.floor(index / 8) * BOARD_COLUMNS + index % 8], gem));
    assert.deepEqual(migrated.rewardTotals, { knowledge: 0, energy: 0 });
    const response = await app.inject({ method: "POST", url: "/api/games/bejeweled", payload: { type: "new", mode: "classic", revision: migrated.revision, operationId: randomUUID() } });
    assert.equal(response.statusCode, 200);
    assert.equal(await readFile(path + ".v1.bak", "utf8"), original);
    assert.throws(() => migrateBejeweled({ ...state, schemaVersion: 4 }));
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test("v2 expansion preserves all history and pending entitlements, backs up once and rejects old cell revisions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mumu-bejeweled-v2-"));
  let knowledge = 0, energy = 0;
  const wallets = {
    knowledge: async (total: number) => { knowledge = total; return { balance: total + 100, updatedAt: new Date().toISOString() }; },
    energy: async (total: number) => { energy = total; return { balance: total + 200, updatedAt: new Date().toISOString() }; },
  };
  let app = Fastify(); registerBejeweledApi(app, dir, wallets);
  const path = join(dir, "learning/games/bejeweled-state.json");
  try {
    const { balances: _balance, ...initial } = (await app.inject({ url: "/api/games/bejeweled" })).json();
    const old = createGame(39, "classic", 8, 8);
    const move = playMove(old, ...findMove(old.board, 8, 8)!)!;
    const { columns: _columns, rows: _rows, ...game } = move.game;
    const legacy = { ...initial, schemaVersion: 2, revision: 22, game, totalScore: game.score, totalCleared: game.cleared,
      totalMoves: game.moves, counts: move.counts, bestScore: game.score, longestCascade: move.longestCascade,
      rewardTotals: { knowledge: 13, energy: 9 }, lastReward: { knowledge: 1, energy: 2 }, rewardStatus: "pending" };
    const original = JSON.stringify(legacy);
    await writeFile(path, original); await app.close();
    app = Fastify(); registerBejeweledApi(app, dir, wallets); await app.ready();
    const stored = JSON.parse(await readFile(path, "utf8"));
    assert.equal(stored.schemaVersion, 3); assert.equal(stored.revision, 23);
    assert.equal(stored.game.columns, 12); assert.equal(stored.game.rows, 10);
    assert.equal(stored.game.board.length, 120); assert.equal(findRuns(stored.game.board).length, 0);
    game.board.forEach((gem, index) => assert.deepEqual(stored.game.board[Math.floor(index / 8) * 12 + index % 8], gem));
    for (const key of ["totalScore", "totalCleared", "totalMoves", "counts", "bestScore", "longestCascade", "rewardTotals", "lastReward", "createdAt"] as const) assert.deepEqual(stored[key], legacy[key]);
    assert.deepEqual([knowledge, energy, stored.rewardStatus], [13, 9, "settled"]);
    assert.equal(await readFile(path + ".v2.bak", "utf8"), original);
    const stale = await app.inject({ method: "POST", url: "/api/games/bejeweled", payload: { type: "swap", a: 0, b: 1, revision: 22, operationId: randomUUID() } });
    assert.equal(stale.statusCode, 409);
    const loaded = (await app.inject({ url: "/api/games/bejeweled" })).json();
    assert.deepEqual(loaded.balances, { knowledge: 113, energy: 209 });
    assert.equal(await readFile(path + ".v2.bak", "utf8"), original);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
test("an expansion write failure never replaces a legacy save, and recovery does not lose its backup", async () => {
  if (process.platform === "win32" || process.getuid?.() === 0) return;
  const dir = await mkdtemp(join(tmpdir(), "mumu-bejeweled-expand-failure-"));
  const wallets = { knowledge: async (total: number) => ({ balance: total, updatedAt: new Date().toISOString() }), energy: async (total: number) => ({ balance: total, updatedAt: new Date().toISOString() }) };
  const app = Fastify(); registerBejeweledApi(app, dir, wallets);
  const path = join(dir, "learning/games/bejeweled-state.json"), parent = join(dir, "learning/games");
  try {
    const { balances: _balances, ...initial } = (await app.inject({ url: "/api/games/bejeweled" })).json();
    const { columns: _columns, rows: _rows, ...game } = createGame(44, "endless", 8, 8);
    const original = JSON.stringify({ ...initial, schemaVersion: 2, game });
    await writeFile(path, original); await chmod(parent, 0o500);
    assert.equal((await app.inject({ url: "/api/games/bejeweled" })).statusCode, 503);
    assert.equal(await readFile(path, "utf8"), original);
    await chmod(parent, 0o700);
    assert.equal((await app.inject({ url: "/api/games/bejeweled" })).json().game.board.length, 120);
    assert.equal(await readFile(path + ".v2.bak", "utf8"), original);
  } finally { await chmod(parent, 0o700).catch(() => undefined); await app.close(); await rm(dir, { recursive: true, force: true }); }
});
