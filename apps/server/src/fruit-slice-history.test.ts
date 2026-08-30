import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { energyCoinsForPlayer, registerFruitSliceHistoryApi } from "./fruit-slice-history.js";

const SETTINGS = {
  durationSeconds: 60,
  density: "standard",
  speedMultiplier: 1,
  fruitSize: 88,
  includeBombs: true,
  includeLobster: true,
  swipeSensitivity: "standard",
} as const;

function player(role: "爸爸" | "木木", side: "full" | "left" | "right", score: number) {
  return {
    role,
    side,
    score,
    fruitSlices: 18,
    lobsterSlices: 2,
    bombsHit: 1,
    maxCombo: 9,
    fastestSwipe: 1.7,
    superActivations: 1,
  };
}

test("能量币只奖励达到分数门槛的木木", () => {
  assert.equal(energyCoinsForPlayer("爸爸", 5_000), 0);
  assert.equal(energyCoinsForPlayer("木木", 499), 0);
  assert.equal(energyCoinsForPlayer("木木", 500), 1);
  assert.equal(energyCoinsForPlayer("木木", 10_500, 30), 20);
  assert.equal(energyCoinsForPlayer("木木", 20_000, 60), 30);
  assert.equal(energyCoinsForPlayer("木木", 25_000, 90), 40);
  assert.equal(energyCoinsForPlayer("木木", 30_000, 120), 50);
});

test("双人战报按角色统计比分、胜负并幂等发放能量币", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "mumu-fruit-slice-"));
  const app = Fastify();
  registerFruitSliceHistoryApi(app, dataDir);
  const eventId = "e1efcd9d-51e7-44ba-b507-608459be84c4";
  const payload = {
    eventId,
    startedAt: "2026-08-25T10:00:00.000Z",
    mode: "versus",
    durationMs: 60_000,
    settings: { ...SETTINGS, fruitSize: 256 },
    players: [player("爸爸", "left", 800), player("木木", "right", 1_250)],
  };

  const first = await app.inject({ method: "POST", url: "/api/games/fruit-slice/history", payload });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().energyCoinsEarned, 2);
  assert.equal(first.json().energyCoinBalance, 2);
  assert.equal(first.json().session.winnerSide, "right");

  const duplicate = await app.inject({ method: "POST", url: "/api/games/fruit-slice/history", payload });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().alreadySaved, true);
  assert.equal(duplicate.json().energyCoinsEarned, 0);
  assert.equal(duplicate.json().energyCoinBalance, 2);

  const history = await app.inject({ method: "GET", url: "/api/games/fruit-slice/history" });
  const body = history.json();
  assert.equal(body.sessions.length, 1);
  assert.deepEqual(body.summary.matchups[0], {
    roleA: "爸爸",
    roleB: "木木",
    games: 1,
    winsA: 0,
    winsB: 1,
    ties: 0,
  });
  assert.equal(body.summary.roles.find((entry: { role: string }) => entry.role === "木木").highestScore, 1_250);

  const stored = JSON.parse(await readFile(
    resolve(dataDir, "learning", "games", "fruit-slice-history.json"),
    "utf8",
  ));
  assert.equal(stored.schemaVersion, 2);
  assert.equal(stored.stableId, "game-fruit-slice-history");
  assert.equal(stored.energyCoinBalance, 2);
  assert.equal(stored.sessions[0].settings.fruitSize, 256);
  await app.close();
});

test("非法站位不会写入，损坏的历史文件返回可恢复错误", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "mumu-fruit-slice-invalid-"));
  const app = Fastify();
  registerFruitSliceHistoryApi(app, dataDir);

  const invalid = await app.inject({
    method: "POST",
    url: "/api/games/fruit-slice/history",
    payload: {
      eventId: "3df6f884-35c6-43ed-8ed9-f7a270e89f39",
      startedAt: "2026-08-25T10:00:00.000Z",
      mode: "versus",
      durationMs: 60_000,
      settings: SETTINGS,
      players: [player("爸爸", "left", 100), player("木木", "left", 200)],
    },
  });
  assert.equal(invalid.statusCode, 400);

  const historyPath = resolve(dataDir, "learning", "games", "fruit-slice-history.json");
  await mkdir(resolve(dataDir, "learning", "games"), { recursive: true });
  await writeFile(historyPath, "not-json", "utf8");
  const corrupted = await app.inject({ method: "GET", url: "/api/games/fruit-slice/history" });
  assert.equal(corrupted.statusCode, 500);
  assert.equal(corrupted.json().code, "FRUIT_SLICE_HISTORY_READ_FAILED");
  await app.close();
});

test("地质锤固定消费30枚能量币并按事件幂等", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "mumu-geology-hammer-"));
  const app = Fastify();
  registerFruitSliceHistoryApi(app, dataDir);
  for (const [eventId, startedAt] of [
    ["25c020d8-5bf5-4ccc-bacd-e84f2cc6c26a", "2026-08-25T10:00:00.000Z"],
    ["1df260dc-07aa-4854-861a-804ff32b82e9", "2026-08-25T10:02:00.000Z"],
  ]) {
    const earned = await app.inject({
      method: "POST",
      url: "/api/games/fruit-slice/history",
      payload: {
        eventId,
        startedAt,
        mode: "single",
        durationMs: 60_000,
        settings: SETTINGS,
        players: [player("木木", "full", 10_000)],
      },
    });
    assert.equal(earned.statusCode, 201);
  }

  const purchase = {
    eventId: "1cff74ba-d5ec-4253-83d1-9634d0191139",
    kind: "nature:geology-hammer",
    amount: 30,
    quantity: 1,
  };
  const first = await app.inject({
    method: "POST",
    url: "/api/games/fruit-slice/energy-coins/spend",
    payload: purchase,
  });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().balance, 10);
  assert.equal(first.json().coinDelta, -30);

  const duplicate = await app.inject({
    method: "POST",
    url: "/api/games/fruit-slice/energy-coins/spend",
    payload: purchase,
  });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().alreadySpent, true);
  assert.equal(duplicate.json().balance, 10);

  const insufficient = await app.inject({
    method: "POST",
    url: "/api/games/fruit-slice/energy-coins/spend",
    payload: { ...purchase, eventId: "10cc576f-4e5f-4d78-8cd5-2c1b1c1318ec" },
  });
  assert.equal(insufficient.statusCode, 409);
  assert.equal(insufficient.json().code, "INSUFFICIENT_ENERGY_COINS");
  await app.close();
});

test("家长密码可以直接设置能量币且不会改写切水果战报", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "mumu-energy-coin-management-"));
  const app = Fastify();
  registerFruitSliceHistoryApi(app, dataDir);

  const wrongPassword = await app.inject({
    method: "POST",
    url: "/api/games/fruit-slice/energy-coins/set",
    payload: { password: "654321", balance: 88 },
  });
  assert.equal(wrongPassword.statusCode, 403);

  const invalidBalance = await app.inject({
    method: "POST",
    url: "/api/games/fruit-slice/energy-coins/set",
    payload: { password: "123456", balance: -1 },
  });
  assert.equal(invalidBalance.statusCode, 400);

  const response = await app.inject({
    method: "POST",
    url: "/api/games/fruit-slice/energy-coins/set",
    payload: { password: "123456", balance: 88 },
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().coinDelta, 88);
  assert.equal(response.json().balance, 88);

  const stored = JSON.parse(await readFile(
    resolve(dataDir, "learning", "games", "fruit-slice-history.json"),
    "utf8",
  ));
  assert.equal(stored.energyCoinBalance, 88);
  assert.equal(stored.sessions.length, 0);
  assert.equal(stored.energyCoinTransactions.length, 1);
  assert.equal(stored.energyCoinTransactions[0].kind, "admin:coin-set");
  assert.equal(stored.energyCoinTransactions[0].balanceAfter, 88);
  await app.close();
});

test("星际极速赛按连续点亮关卡每关十币并幂等批量发放", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "mumu-galaxy-racer-"));
  const app = Fastify();
  registerFruitSliceHistoryApi(app, dataDir);
  const payload = {
    eventId: "4e2b3a67-c268-46c8-9cb4-a2cc8d942ff2",
    startedAt: "2026-08-29T10:00:00.000Z",
    attempts: [
      { level: 1, elapsedMs: 72_000, collisions: 2, completed: true },
      { level: 2, elapsedMs: 68_000, collisions: 1, completed: true },
      { level: 3, elapsedMs: 61_000, collisions: 3, completed: true },
    ],
  };

  const first = await app.inject({
    method: "POST",
    url: "/api/games/galaxy-racer/settlements",
    payload,
  });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().passedLevels, 2);
  assert.equal(first.json().energyCoinsEarned, 20);
  assert.equal(first.json().energyCoinBalance, 20);

  const duplicate = await app.inject({
    method: "POST",
    url: "/api/games/galaxy-racer/settlements",
    payload,
  });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().alreadySaved, true);
  assert.equal(duplicate.json().energyCoinsEarned, 20);
  assert.equal(duplicate.json().energyCoinBalance, 20);

  const stored = JSON.parse(await readFile(
    resolve(dataDir, "learning", "games", "fruit-slice-history.json"),
    "utf8",
  ));
  assert.equal(stored.schemaVersion, 2);
  assert.equal(stored.energyCoinTransactions.length, 1);
  assert.equal(stored.energyCoinTransactions[0].kind, "games:galaxy-racer");
  assert.equal(stored.energyCoinTransactions[0].passedLevels, 2);
  assert.equal(stored.energyCoinTransactions[0].balanceAfter, 20);
  await app.close();
});

test("星际极速赛拒绝跳关和在已点亮关卡后提前领取奖励", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "mumu-galaxy-racer-invalid-"));
  const app = Fastify();
  registerFruitSliceHistoryApi(app, dataDir);

  const early = await app.inject({
    method: "POST",
    url: "/api/games/galaxy-racer/settlements",
    payload: {
      eventId: "b09b3089-0b9f-41e2-ae19-a7b2c173b481",
      startedAt: "2026-08-29T10:00:00.000Z",
      attempts: [{ level: 1, elapsedMs: 70_000, collisions: 0, completed: true }],
    },
  });
  assert.equal(early.statusCode, 400);

  const skipped = await app.inject({
    method: "POST",
    url: "/api/games/galaxy-racer/settlements",
    payload: {
      eventId: "1770e6d4-418f-4b13-b600-996224882d50",
      startedAt: "2026-08-29T10:00:00.000Z",
      attempts: [{ level: 2, elapsedMs: 71_000, collisions: 2, completed: true }],
    },
  });
  assert.equal(skipped.statusCode, 400);
  await app.close();
});

test("旧版能量币文件读取后会迁移到第二版再安全写入", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "mumu-energy-v1-migration-"));
  const historyPath = resolve(dataDir, "learning", "games", "fruit-slice-history.json");
  await mkdir(resolve(dataDir, "learning", "games"), { recursive: true });
  await writeFile(historyPath, JSON.stringify({
    schemaVersion: 1,
    id: "e110a8ab-cd3d-4cd2-a673-26d0554fc280",
    stableId: "game-fruit-slice-history",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    energyCoinBalance: 7,
    sessions: [],
    energyCoinTransactions: [],
  }), "utf8");
  const app = Fastify();
  registerFruitSliceHistoryApi(app, dataDir);

  const read = await app.inject({ method: "GET", url: "/api/games/fruit-slice/history" });
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().schemaVersion, 2);
  assert.equal(read.json().energyCoinBalance, 7);

  const write = await app.inject({
    method: "POST",
    url: "/api/games/fruit-slice/energy-coins/set",
    payload: { password: "123456", balance: 9 },
  });
  assert.equal(write.statusCode, 201);
  const stored = JSON.parse(await readFile(historyPath, "utf8"));
  assert.equal(stored.schemaVersion, 2);
  assert.equal(stored.energyCoinBalance, 9);
  await app.close();
});

test("数据目录不可写时返回明确错误且不会伪报保存成功", async () => {
  const root = await mkdtemp(join(tmpdir(), "mumu-fruit-slice-write-failure-"));
  const blockedDataDir = resolve(root, "not-a-directory");
  await writeFile(blockedDataDir, "occupied", "utf8");
  const app = Fastify();
  registerFruitSliceHistoryApi(app, blockedDataDir);

  const response = await app.inject({
    method: "POST",
    url: "/api/games/fruit-slice/history",
    payload: {
      eventId: "2fa62b24-6583-4b7d-9b9f-b2932987633e",
      startedAt: "2026-08-25T10:00:00.000Z",
      mode: "single",
      durationMs: 60_000,
      settings: SETTINGS,
      players: [player("木木", "full", 600)],
    },
  });

  assert.equal(response.statusCode, 500);
  assert.equal(response.json().code, "FRUIT_SLICE_HISTORY_WRITE_FAILED");

  const energyCoinResponse = await app.inject({
    method: "POST",
    url: "/api/games/fruit-slice/energy-coins/set",
    payload: { password: "123456", balance: 30 },
  });
  assert.equal(energyCoinResponse.statusCode, 500);
  assert.equal(energyCoinResponse.json().code, "ENERGY_COIN_SET_FAILED");
  assert.equal(await readFile(blockedDataDir, "utf8"), "occupied");
  await app.close();
});
