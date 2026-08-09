import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";

const serverDirectory = resolve(import.meta.dirname, "..");
const cleanupPaths: string[] = [];
const children: ChildProcess[] = [];

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  return address.port;
}

async function startServer(dataDirectory: string) {
  const port = await availablePort();
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      APP_DATA_DIR: dataDirectory,
      HOST: "127.0.0.1",
      PORT: String(port),
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  children.push(child);
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`测试服务提前退出：${stderr}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return { baseUrl, child };
    } catch {
      // The test server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
  }
  throw new Error(`测试服务启动超时：${stderr}`);
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolveExit) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolveExit();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveExit();
    });
  });
}

async function post(baseUrl: string, path: string, targetId: string) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetId }),
  });
}

async function postProgressAction(
  baseUrl: string,
  action: "unlock-all" | "clear-all",
) {
  return fetch(`${baseUrl}/api/world-tower/manage-progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

type LearningRewardSource =
  | "math:add-subtract"
  | "math:arithmetic-battle"
  | "math:multiplication"
  | "math:find-number"
  | "math:cat-mouse-game";
type LearningRewardKey =
  | "easy"
  | "medium"
  | "hard"
  | "facts"
  | "reverse"
  | "advanced"
  | "100"
  | "1000"
  | "10000"
  | "100000";

async function postLearningReward(
  baseUrl: string,
  source: LearningRewardSource,
  eventId: string = randomUUID(),
  options: { sessionId?: string; rewardKey?: LearningRewardKey } = {},
) {
  return fetch(`${baseUrl}/api/world-tower/coins/earn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, source, ...options }),
  });
}

async function startRewardSession(
  baseUrl: string,
  source: LearningRewardSource,
  promotionId?: string,
) {
  return fetch(`${baseUrl}/api/world-tower/reward-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, promotionId }),
  });
}

async function resetLearningCoins(baseUrl: string, password: string) {
  return fetch(`${baseUrl}/api/world-tower/coins/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

async function setLearningCoinBalance(baseUrl: string, password: string, balance: number) {
  return fetch(`${baseUrl}/api/world-tower/coins/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, balance }),
  });
}

after(async () => {
  await Promise.all(children.map((child) => stopServer(child)));
  await Promise.all(cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
});

describe("world tower API", () => {
  it("serves every curated node and persists the simplified particle-to-matter route", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-material-tower-"));
    cleanupPaths.push(dataDirectory);
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const manifestResponse = await fetch(`${baseUrl}/api/world-tower/manifest`);
      assert.equal(manifestResponse.status, 200);
      const manifest = await manifestResponse.json() as {
        graphId: string;
        counts: { nodes: number; recipes: number; levels: number; resources: number };
        levels: Array<{ id: string; order: number; name: string }>;
        resources: Record<string, unknown[]>;
        progress: { coinBalance: number; unlockedNodeIds: string[] };
      };
      assert.equal(manifest.graphId, "mumu-material-tower-graph-v2");
      assert.deepEqual(manifest.counts, {
        ...manifest.counts,
        nodes: 479,
        recipes: 469,
        levels: 16,
        resources: 0,
      });
      assert.equal(Object.values(manifest.resources).flat().length, 0);
      assert.equal(manifest.levels[0].name, "宇宙级");
      assert.equal(manifest.levels.at(-1)?.name, "基本粒子");
      assert.equal(manifest.progress.coinBalance, 0);
      assert.deepEqual(manifest.progress.unlockedNodeIds, []);

      const mapResponse = await fetch(`${baseUrl}/api/world-tower/map`);
      assert.equal(mapResponse.status, 200);
      const map = await mapResponse.json() as {
        totalNodes: number;
        isTruncated: boolean;
        levelNodeCounts: Record<string, number>;
        items: Array<{ id: string; name: string; isUnlocked: boolean; unlockPriceCoins: number }>;
        edges: Array<{ sourceId: string; targetId: string }>;
      };
      assert.equal(map.totalNodes, 479);
      assert.equal(map.isTruncated, false);
      assert.equal(map.items.length, 479);
      assert.equal(map.edges.length, 1_186);
      assert.equal(Object.keys(map.levelNodeCounts).length, 16);
      assert.ok(Object.values(map.levelNodeCounts).every((count) => count > 0));
      assert.ok(map.items.every((item) => item.name.length > 0));
      const mapNodeIds = new Set(map.items.map((item) => item.id));
      assert.ok(map.edges.every((edge) => mapNodeIds.has(edge.sourceId) && mapNodeIds.has(edge.targetId)));

      const elementMapResponse = await fetch(
        `${baseUrl}/api/world-tower/level-map?levelId=level%3A15-elements&visibility=all`,
      );
      assert.equal(elementMapResponse.status, 200);
      const elementMap = await elementMapResponse.json() as {
        totalInLevel: number;
        matchedTotal: number;
        items: Array<{ id: string; unlockPriceCoins: number; imagePath: string | null }>;
      };
      assert.equal(elementMap.totalInLevel, 118);
      assert.equal(elementMap.matchedTotal, 118);
      assert.equal(elementMap.items.length, 118);
      const hydrogen = elementMap.items.find((item) => item.id === "element:H");
      assert.equal(hydrogen?.unlockPriceCoins, 5);
      assert.match(hydrogen?.imagePath ?? "", /nodes\/core\/hydrogen/);

      for (let index = 0; index < 2; index += 1) {
        assert.equal((await postLearningReward(baseUrl, "math:cat-mouse-game")).status, 201);
      }

      const earlyHydrogen = await post(baseUrl, "/api/world-tower/unlock-node", "element:H");
      assert.equal(earlyHydrogen.status, 409);
      assert.equal((await earlyHydrogen.json() as { code: string }).code, "WORLD_TOWER_REQUIREMENTS_MISSING");

      for (const particleId of ["particle:proton", "particle:electron", "particle:neutron"]) {
        const response = await post(baseUrl, "/api/world-tower/unlock-node", particleId);
        assert.equal(response.status, 201);
      }

      assert.equal((await post(baseUrl, "/api/world-tower/unlock-node", "element:H")).status, 201);
      assert.equal((await post(baseUrl, "/api/world-tower/unlock-node", "element:O")).status, 201);
      const waterResponse = await post(baseUrl, "/api/world-tower/unlock-node", "node:水");
      assert.equal(waterResponse.status, 201);
      const water = await waterResponse.json() as {
        progress: { coinBalance: number; unlockedNodeIds: string[]; resourceInventory: Record<string, number> };
      };
      assert.equal(water.progress.coinBalance, 17);
      assert.ok(water.progress.unlockedNodeIds.includes("node:水"));
      assert.deepEqual(water.progress.resourceInventory, {});

      const duplicate = await post(baseUrl, "/api/world-tower/unlock-node", "node:水");
      assert.equal(duplicate.status, 200);
      assert.equal(
        (await duplicate.json() as { progress: { coinBalance: number } }).progress.coinBalance,
        17,
      );

      const resourcePurchase = await post(
        baseUrl,
        "/api/world-tower/purchase-resource",
        "knowledge:atomic-structure",
      );
      assert.equal(resourcePurchase.status, 404);

      const detailResponse = await fetch(`${baseUrl}/api/world-tower/nodes/${encodeURIComponent("node:水")}`);
      assert.equal(detailResponse.status, 200);
      const detail = await detailResponse.json() as {
        node: { recipes: Array<{ relationLabel: string; knowledgeTopic: string; inputs: unknown[] }> };
        inputs: Array<{ name: string }>;
      };
      assert.equal(detail.node.recipes[0].relationLabel, "组成");
      assert.ok(detail.node.recipes[0].knowledgeTopic.length > 0);
      assert.deepEqual(detail.inputs.map((item) => item.name).sort(), ["氢", "氧"]);

      const progressPath = resolve(dataDirectory, "learning", "world-tower", "progress.json");
      const stored = JSON.parse(await readFile(progressPath, "utf8")) as {
        schemaVersion: number;
        id: string;
        graphId: string;
        transactions: unknown[];
        appliedGrantIds: string[];
      };
      assert.equal(stored.schemaVersion, 1);
      assert.equal(stored.graphId, "mumu-material-tower-graph-v2");
      assert.match(stored.id, /^[0-9a-f-]{36}$/);
      assert.equal(stored.transactions.length, 8);
      assert.deepEqual(stored.appliedGrantIds, ["learning-coins-reset-to-zero-v1"]);
      assert.equal((await stat(progressPath)).mode & 0o777, 0o600);

      await writeFile(progressPath, '{"schemaVersion":999}\n', { mode: 0o600 });
      assert.equal((await fetch(`${baseUrl}/api/world-tower/manifest`)).status, 500);
    } finally {
      await stopServer(child);
    }
  });

  it("persists unlock-all and clear-all without changing earned knowledge coins", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-material-tower-manage-"));
    cleanupPaths.push(dataDirectory);
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      assert.equal((await postLearningReward(baseUrl, "math:cat-mouse-game")).status, 201);
      assert.equal((await postLearningReward(baseUrl, "math:cat-mouse-game")).status, 201);

      const unlockAllResponse = await postProgressAction(baseUrl, "unlock-all");
      assert.equal(unlockAllResponse.status, 201);
      const unlockAll = await unlockAllResponse.json() as {
        affectedNodes: number;
        progress: { coinBalance: number; unlockedNodeIds: string[] };
      };
      assert.equal(unlockAll.affectedNodes, 479);
      assert.equal(unlockAll.progress.unlockedNodeIds.length, 479);
      assert.equal(unlockAll.progress.coinBalance, 40);

      const clearAllResponse = await postProgressAction(baseUrl, "clear-all");
      assert.equal(clearAllResponse.status, 201);
      const clearAll = await clearAllResponse.json() as {
        affectedNodes: number;
        progress: {
          coinBalance: number;
          unlockedNodeIds: string[];
          permanentResourceIds: string[];
          resourceInventory: Record<string, number>;
        };
      };
      assert.equal(clearAll.affectedNodes, 479);
      assert.equal(clearAll.progress.coinBalance, 40);
      assert.deepEqual(clearAll.progress.unlockedNodeIds, []);
      assert.deepEqual(clearAll.progress.permanentResourceIds, []);
      assert.deepEqual(clearAll.progress.resourceInventory, {});

      const reloaded = await fetch(`${baseUrl}/api/world-tower/manifest`);
      assert.equal(reloaded.status, 200);
      const persisted = await reloaded.json() as {
        progress: { coinBalance: number; unlockedNodeIds: string[] };
      };
      assert.equal(persisted.progress.coinBalance, 40);
      assert.deepEqual(persisted.progress.unlockedNodeIds, []);

      const progressPath = resolve(dataDirectory, "learning", "world-tower", "progress.json");
      const stored = JSON.parse(await readFile(progressPath, "utf8")) as {
        transactions: Array<{ kind: string }>;
      };
      assert.deepEqual(stored.transactions.map((transaction) => transaction.kind), [
        "learning-reward",
        "learning-reward",
        "admin-unlock-all",
        "admin-clear-all",
      ]);

      const invalidResponse = await fetch(`${baseUrl}/api/world-tower/manage-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "erase-the-universe" }),
      });
      assert.equal(invalidResponse.status, 400);
    } finally {
      await stopServer(child);
    }
  });
  it("awards each event once and requires the parent password to set the balance", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-learning-coins-"));
    cleanupPaths.push(dataDirectory);
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const rewards: Array<[LearningRewardSource, LearningRewardKey | undefined, number]> = [
        ["math:add-subtract", undefined, 2],
        ["math:arithmetic-battle", "easy", 4],
        ["math:arithmetic-battle", "medium", 6],
        ["math:arithmetic-battle", "hard", 8],
        ["math:multiplication", "facts", 2],
        ["math:multiplication", "reverse", 3],
        ["math:multiplication", "advanced", 5],
        ["math:cat-mouse-game", undefined, 20],
      ];
      let expectedBalance = 0;
      let firstEventId = "";
      for (const [source, rewardKey, rewardCoins] of rewards) {
        const eventId = randomUUID();
        if (!firstEventId) firstEventId = eventId;
        const response = await postLearningReward(
          baseUrl,
          source,
          eventId,
          rewardKey ? { rewardKey } : {},
        );
        assert.equal(response.status, 201);
        expectedBalance += rewardCoins;
        const body = await response.json() as {
          alreadyAwarded: boolean;
          rewardCoins: number;
          progress: { coinBalance: number };
        };
        assert.equal(body.alreadyAwarded, false);
        assert.equal(body.rewardCoins, rewardCoins);
        assert.equal(body.progress.coinBalance, expectedBalance);
      }

      const duplicate = await postLearningReward(
        baseUrl,
        "math:add-subtract",
        firstEventId,
      );
      assert.equal(duplicate.status, 200);
      const duplicateBody = await duplicate.json() as {
        alreadyAwarded: boolean;
        rewardCoins: number;
        progress: { coinBalance: number };
      };
      assert.equal(duplicateBody.alreadyAwarded, true);
      assert.equal(duplicateBody.rewardCoins, 0);
      assert.equal(duplicateBody.progress.coinBalance, 50);

      const missingDifficulty = await postLearningReward(
        baseUrl,
        "math:arithmetic-battle",
      );
      assert.equal(missingDifficulty.status, 400);

      const invalidReward = await fetch(`${baseUrl}/api/world-tower/coins/earn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: randomUUID(), source: "math:unknown" }),
      });
      assert.equal(invalidReward.status, 400);

      const wrongPassword = await resetLearningCoins(baseUrl, "654321");
      assert.equal(wrongPassword.status, 403);
      assert.equal(
        (await fetch(`${baseUrl}/api/world-tower/coins`).then((response) => response.json()) as {
          coinBalance: number;
        }).coinBalance,
        50,
      );

      const resetResponse = await resetLearningCoins(baseUrl, "123456");
      assert.equal(resetResponse.status, 201);
      const resetBody = await resetResponse.json() as {
        coinDelta: number;
        progress: { coinBalance: number };
      };
      assert.equal(resetBody.coinDelta, -50);
      assert.equal(resetBody.progress.coinBalance, 0);

      const setResponse = await setLearningCoinBalance(baseUrl, "123456", 12_345);
      assert.equal(setResponse.status, 201);
      const setBody = await setResponse.json() as {
        coinDelta: number;
        progress: { coinBalance: number };
      };
      assert.equal(setBody.coinDelta, 12_345);
      assert.equal(setBody.progress.coinBalance, 12_345);

      const rejectedSet = await setLearningCoinBalance(baseUrl, "654321", 77);
      assert.equal(rejectedSet.status, 403);
      assert.equal(
        (await fetch(`${baseUrl}/api/world-tower/coins`).then((response) => response.json()) as {
          coinBalance: number;
        }).coinBalance,
        12_345,
      );

      const invalidSet = await fetch(`${baseUrl}/api/world-tower/coins/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "123456", balance: -1 }),
      });
      assert.equal(invalidSet.status, 403);
    } finally {
      await stopServer(child);
    }
  });

  it("locks the ten-minute triple promotion on entry and awards all find-number ranges", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-learning-promotions-"));
    cleanupPaths.push(dataDirectory);
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const statusResponse = await fetch(`${baseUrl}/api/world-tower/coins`);
      assert.equal(statusResponse.status, 200);
      const status = await statusResponse.json() as {
        coinBalance: number;
        promotion: {
          id: string;
          source: LearningRewardSource;
          multiplier: 3;
          startsAt: string;
          endsAt: string;
        };
      };
      assert.equal(status.coinBalance, 0);
      assert.equal(status.promotion.multiplier, 3);
      assert.ok(Date.parse(status.promotion.endsAt) - Date.parse(status.promotion.startsAt) === 10 * 60 * 1_000);

      const tripleSessionResponse = await startRewardSession(
        baseUrl,
        status.promotion.source,
        status.promotion.id,
      );
      assert.equal(tripleSessionResponse.status, 201);
      const tripleSession = await tripleSessionResponse.json() as {
        id: string;
        source: LearningRewardSource;
        multiplier: 1 | 3;
        promotionId: string | null;
      };
      assert.equal(tripleSession.multiplier, 3);
      assert.equal(tripleSession.promotionId, status.promotion.id);

      const promotedRewardKey: LearningRewardKey | undefined =
        status.promotion.source === "math:find-number"
          ? "100"
          : status.promotion.source === "math:arithmetic-battle"
            ? "easy"
            : status.promotion.source === "math:multiplication"
              ? "facts"
              : undefined;
      const promotedBase = status.promotion.source === "math:add-subtract"
        ? 2
        : status.promotion.source === "math:cat-mouse-game"
          ? 20
          : status.promotion.source === "math:find-number"
            ? 10
            : status.promotion.source === "math:arithmetic-battle" ? 4 : 2;
      const promotedAwardResponse = await postLearningReward(
        baseUrl,
        status.promotion.source,
        randomUUID(),
        { sessionId: tripleSession.id, rewardKey: promotedRewardKey },
      );
      assert.equal(promotedAwardResponse.status, 201);
      const promotedAward = await promotedAwardResponse.json() as {
        baseRewardCoins: number;
        multiplier: 1 | 3;
        rewardCoins: number;
        progress: { coinBalance: number };
      };
      assert.equal(promotedAward.baseRewardCoins, promotedBase);
      assert.equal(promotedAward.multiplier, 3);
      assert.equal(promotedAward.rewardCoins, promotedBase * 3);

      const findSessionResponse = await startRewardSession(
        baseUrl,
        "math:find-number",
        "expired-or-unrelated-promotion",
      );
      assert.equal(findSessionResponse.status, 201);
      const findSession = await findSessionResponse.json() as { id: string; multiplier: 1 | 3 };
      assert.equal(findSession.multiplier, 1);

      let expectedBalance = promotedBase * 3;
      for (const [rewardKey, expectedReward] of [
        ["100", 10],
        ["1000", 30],
        ["10000", 60],
        ["100000", 150],
      ] as const) {
        const response = await postLearningReward(
          baseUrl,
          "math:find-number",
          randomUUID(),
          { sessionId: findSession.id, rewardKey },
        );
        assert.equal(response.status, 201);
        expectedBalance += expectedReward;
        const award = await response.json() as {
          baseRewardCoins: number;
          multiplier: 1 | 3;
          rewardCoins: number;
          progress: { coinBalance: number };
        };
        assert.equal(award.baseRewardCoins, expectedReward);
        assert.equal(award.multiplier, 1);
        assert.equal(award.rewardCoins, expectedReward);
        assert.equal(award.progress.coinBalance, expectedBalance);
      }

      const missingRange = await postLearningReward(
        baseUrl,
        "math:find-number",
        randomUUID(),
        { sessionId: findSession.id },
      );
      assert.equal(missingRange.status, 400);

      const progressPath = resolve(dataDirectory, "learning", "world-tower", "progress.json");
      const stored = JSON.parse(await readFile(progressPath, "utf8")) as {
        rewardSessions: Array<{ id: string; multiplier: number }>;
      };
      assert.equal(stored.rewardSessions.length, 2);
      assert.equal(stored.rewardSessions.find((session) => session.id === tripleSession.id)?.multiplier, 3);
    } finally {
      await stopServer(child);
    }
  });

  it("migrates the old preview balance to zero before the first learning reward", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-learning-coins-migration-"));
    cleanupPaths.push(dataDirectory);
    const progressDirectory = resolve(dataDirectory, "learning", "world-tower");
    await mkdir(progressDirectory, { recursive: true });
    const progressPath = resolve(progressDirectory, "progress.json");
    const timestamp = "2026-08-07T00:00:00.000Z";
    await writeFile(progressPath, `${JSON.stringify({
      schemaVersion: 1,
      id: "00000000-0000-4000-8000-000000000001",
      graphId: "mumu-world-composition-graph-v1",
      createdAt: timestamp,
      updatedAt: timestamp,
      coinBalance: 100_000,
      unlockedNodeIds: ["particle:electron", "particle:proton", "particle:neutron"],
      permanentResourceIds: [],
      resourceInventory: {},
      appliedGrantIds: ["knowledge-coin-preview-100000-v1"],
      transactions: [],
    }, null, 2)}\n`, { mode: 0o600 });
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const beforeReward = await fetch(`${baseUrl}/api/world-tower/coins`);
      assert.equal(beforeReward.status, 200);
      assert.equal(
        (await beforeReward.json() as { coinBalance: number }).coinBalance,
        0,
      );
      assert.equal((await postLearningReward(baseUrl, "math:add-subtract")).status, 201);
      const stored = JSON.parse(await readFile(progressPath, "utf8")) as {
        coinBalance: number;
        appliedGrantIds: string[];
      };
      assert.equal(stored.coinBalance, 2);
      assert.deepEqual(stored.appliedGrantIds, [
        "knowledge-coin-preview-100000-v1",
        "learning-coins-reset-to-zero-v1",
      ]);
    } finally {
      await stopServer(child);
    }
  });

  it("does not report progress or balance changes when the data path cannot be written", async () => {
    const parentDirectory = await mkdtemp(resolve(tmpdir(), "mumu-world-tower-write-failure-"));
    cleanupPaths.push(parentDirectory);
    const unusableDataPath = resolve(parentDirectory, "not-a-directory");
    await writeFile(unusableDataPath, "occupied");
    const { baseUrl, child } = await startServer(unusableDataPath);

    try {
      const response = await post(
        baseUrl,
        "/api/world-tower/unlock-node",
        "particle:electron",
      );
      assert.equal(response.status, 500);
      assert.equal(
        (await response.json() as { code: string }).code,
        "WORLD_TOWER_STORAGE_FAILED",
      );

      const manageResponse = await postProgressAction(baseUrl, "unlock-all");
      assert.equal(manageResponse.status, 500);
      assert.equal(
        (await manageResponse.json() as { code: string }).code,
        "WORLD_TOWER_STORAGE_FAILED",
      );

      const setBalanceResponse = await setLearningCoinBalance(baseUrl, "123456", 888);
      assert.equal(setBalanceResponse.status, 500);
      assert.equal(
        (await setBalanceResponse.json() as { code: string }).code,
        "WORLD_TOWER_STORAGE_FAILED",
      );
    } finally {
      await stopServer(child);
    }
  });
});
