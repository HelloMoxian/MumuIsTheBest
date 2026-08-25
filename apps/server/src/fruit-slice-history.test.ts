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
  assert.equal(energyCoinsForPlayer("木木", 10_500), 20);
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
  assert.equal(stored.schemaVersion, 1);
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
  assert.equal(await readFile(blockedDataDir, "utf8"), "occupied");
  await app.close();
});
