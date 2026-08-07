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
  | "math:cat-mouse-game";

async function postLearningReward(
  baseUrl: string,
  source: LearningRewardSource,
  eventId: string = randomUUID(),
) {
  return fetch(`${baseUrl}/api/world-tower/coins/earn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, source }),
  });
}

async function resetLearningCoins(baseUrl: string, password: string) {
  return fetch(`${baseUrl}/api/world-tower/coins/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

after(async () => {
  await Promise.all(children.map((child) => stopServer(child)));
  await Promise.all(cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
});

describe("world tower API", () => {
  it("pages 2000 nodes and persists unlocks and resources as a private atomic file", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-world-tower-"));
    cleanupPaths.push(dataDirectory);
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const manifestResponse = await fetch(`${baseUrl}/api/world-tower/manifest`);
      assert.equal(manifestResponse.status, 200);
      const manifest = await manifestResponse.json() as {
        counts: { nodes: number; resources: number };
        levels: Array<{ imagePath: string }>;
        resources: {
          particlePacks: Array<{ id: string; shop: { coinCost: number | null } }>;
          conditions: Array<{ id: string }>;
          knowledge: unknown[];
        };
        progress: { coinBalance: number; unlockedNodeIds: string[] };
        backgroundAsset: string;
      };
      assert.equal(manifest.counts.nodes, 2_000);
      assert.equal(manifest.counts.resources, 135);
      assert.deepEqual(
        manifest.resources.particlePacks.map((resource) => [resource.id, resource.shop.coinCost]),
        [["particle-pack:electron", 10], ["particle-pack:proton", 10]],
      );
      assert.equal(manifest.levels.length, 15);
      assert.equal(manifest.resources.knowledge.length, 79);
      assert.equal(manifest.resources.conditions.some((resource) => (
        resource.id === "condition:stable-combination"
        || resource.id === "condition:low-risk-demo"
      )), false);
      assert.match(manifest.backgroundAsset, /world-tower/);
      assert.equal(manifest.progress.coinBalance, 0);
      assert.deepEqual(
        manifest.progress.unlockedNodeIds.sort(),
        ["particle:electron", "particle:neutron", "particle:proton"],
      );

      for (let index = 0; index < 5; index += 1) {
        assert.equal(
          (await postLearningReward(baseUrl, "math:cat-mouse-game")).status,
          201,
        );
      }

      const mapResponse = await fetch(`${baseUrl}/api/world-tower/map`);
      assert.equal(mapResponse.status, 200);
      const map = await mapResponse.json() as {
        totalNodes: number;
        isTruncated: boolean;
        levelNodeCounts: Record<string, number>;
        items: Array<{ id: string; levelId: string; isUnlocked: boolean }>;
        edges: Array<{ sourceId: string; targetId: string }>;
      };
      assert.equal(map.totalNodes, 2_000);
      assert.equal(map.isTruncated, true);
      assert.ok(map.items.length >= 100 && map.items.length <= 160);
      assert.equal(Object.keys(map.levelNodeCounts).length, 15);
      assert.ok(Object.values(map.levelNodeCounts).every((count) => count > 0));
      assert.ok(map.edges.length >= 120);
      const mapNodeIds = new Set(map.items.map((node) => node.id));
      assert.ok(["particle:electron", "particle:proton", "particle:neutron"].every((id) => mapNodeIds.has(id)));
      assert.ok(map.edges.every((edge) => mapNodeIds.has(edge.sourceId) && mapNodeIds.has(edge.targetId)));

      const fullElementMapResponse = await fetch(
        `${baseUrl}/api/world-tower/level-map?levelId=level%3A02-elements&visibility=all`,
      );
      assert.equal(fullElementMapResponse.status, 200);
      const fullElementMap = await fullElementMapResponse.json() as {
        totalInLevel: number;
        matchedTotal: number;
        groups: Array<{ nodeIds: string[] }>;
        items: Array<{ id: string }>;
        edges: Array<{ sourceId: string; targetId: string }>;
      };
      assert.equal(fullElementMap.totalInLevel, 118);
      assert.equal(fullElementMap.matchedTotal, 118);
      assert.equal(fullElementMap.items.length, 118);
      assert.equal(fullElementMap.groups.length, 4);
      assert.ok(fullElementMap.groups.every((group) => group.nodeIds.length >= 1 && group.nodeIds.length <= 30));
      assert.equal(
        fullElementMap.groups.reduce((sum, group) => sum + group.nodeIds.length, 0),
        118,
      );

      const unlockedElementMapResponse = await fetch(
        `${baseUrl}/api/world-tower/level-map?levelId=level%3A02-elements&visibility=unlocked`,
      );
      assert.equal(unlockedElementMapResponse.status, 200);
      assert.equal(
        (await unlockedElementMapResponse.json() as { matchedTotal: number }).matchedTotal,
        0,
      );

      const pageResponse = await fetch(
        `${baseUrl}/api/world-tower/nodes?levelId=level%3A02-elements&offset=0&limit=12`,
      );
      assert.equal(pageResponse.status, 200);
      const page = await pageResponse.json() as {
        total: number;
        items: Array<{ id: string; imagePath: string; unlockPriceCoins: number }>;
      };
      assert.equal(page.total, 118);
      assert.equal(page.items.length, 12);
      assert.equal(page.items[0].id, "element:H");
      assert.equal(page.items[0].unlockPriceCoins, 3);
      assert.match(page.items[0].imagePath, /nodes\/core\/hydrogen/);

      const oversizedPage = await fetch(
        `${baseUrl}/api/world-tower/nodes?levelId=level%3A02-elements&limit=61`,
      );
      assert.equal(oversizedPage.status, 400);

      const earlyUnlock = await post(
        baseUrl,
        "/api/world-tower/unlock-node",
        "element:H",
      );
      assert.equal(earlyUnlock.status, 409);
      assert.equal(
        (await earlyUnlock.json() as { code: string }).code,
        "WORLD_TOWER_REQUIREMENTS_MISSING",
      );

      for (const knowledgeId of ["knowledge:atomic-structure", "knowledge:periodic-table"]) {
        const response = await post(
          baseUrl,
          "/api/world-tower/purchase-resource",
          knowledgeId,
        );
        assert.equal(response.status, 201);
      }

      const missingParticlePacks = await post(
        baseUrl,
        "/api/world-tower/unlock-node",
        "element:H",
      );
      assert.equal(missingParticlePacks.status, 409);

      for (const particlePackId of ["particle-pack:electron", "particle-pack:proton"]) {
        const response = await post(
          baseUrl,
          "/api/world-tower/purchase-resource",
          particlePackId,
        );
        assert.equal(response.status, 201);
      }

      const conditionPurchase = await post(
        baseUrl,
        "/api/world-tower/purchase-resource",
        "condition:enough-quantity",
      );
      assert.equal(conditionPurchase.status, 409);

      const unlockResponse = await post(
        baseUrl,
        "/api/world-tower/unlock-node",
        "element:H",
      );
      assert.equal(unlockResponse.status, 201);
      const unlocked = await unlockResponse.json() as {
        alreadyUnlocked: boolean;
        progress: {
          coinBalance: number;
          unlockedNodeIds: string[];
          resourceInventory: Record<string, number>;
        };
      };
      assert.equal(unlocked.alreadyUnlocked, false);
      assert.equal(unlocked.progress.coinBalance, 70);
      assert.ok(unlocked.progress.unlockedNodeIds.includes("element:H"));
      assert.equal(unlocked.progress.resourceInventory["particle-pack:electron"], 0);
      assert.equal(unlocked.progress.resourceInventory["particle-pack:proton"], 0);

      const duplicateUnlock = await post(
        baseUrl,
        "/api/world-tower/unlock-node",
        "element:H",
      );
      assert.equal(duplicateUnlock.status, 200);
      assert.equal(
        (await duplicateUnlock.json() as { progress: { coinBalance: number } })
          .progress.coinBalance,
        70,
      );

      const learnedElementMapResponse = await fetch(
        `${baseUrl}/api/world-tower/level-map?levelId=level%3A02-elements&visibility=unlocked`,
      );
      assert.equal(learnedElementMapResponse.status, 200);
      assert.equal(
        (await learnedElementMapResponse.json() as { matchedTotal: number }).matchedTotal,
        1,
      );

      const oxygenWithoutPacks = await post(
        baseUrl,
        "/api/world-tower/unlock-node",
        "element:O",
      );
      assert.equal(oxygenWithoutPacks.status, 409);

      for (const particlePackId of ["particle-pack:electron", "particle-pack:proton"]) {
        const response = await post(
          baseUrl,
          "/api/world-tower/purchase-resource",
          particlePackId,
        );
        assert.equal(response.status, 201);
      }

      const oxygenUnlock = await post(
        baseUrl,
        "/api/world-tower/unlock-node",
        "element:O",
      );
      assert.equal(oxygenUnlock.status, 201);
      const oxygenProgress = await oxygenUnlock.json() as {
        progress: { resourceInventory: Record<string, number> };
      };
      assert.equal(oxygenProgress.progress.resourceInventory["particle-pack:electron"], 0);
      assert.equal(oxygenProgress.progress.resourceInventory["particle-pack:proton"], 0);

      const bondingCharge = await post(
        baseUrl,
        "/api/world-tower/purchase-resource",
        "action:chemical-bonding",
      );
      assert.equal(bondingCharge.status, 201);
      for (const knowledgeId of ["knowledge:chemical-bonds", "knowledge:molecular-geometry"]) {
        const response = await post(
          baseUrl,
          "/api/world-tower/purchase-resource",
          knowledgeId,
        );
        assert.equal(response.status, 201);
      }
      const waterUnlock = await post(
        baseUrl,
        "/api/world-tower/unlock-node",
        "compound:compound-pubchem-962",
      );
      assert.equal(waterUnlock.status, 201);
      const waterProgress = await waterUnlock.json() as {
        progress: {
          coinBalance: number;
          unlockedNodeIds: string[];
          resourceInventory: Record<string, number>;
        };
      };
      assert.equal(waterProgress.progress.coinBalance, 29);
      assert.ok(waterProgress.progress.unlockedNodeIds.includes("compound:compound-pubchem-962"));
      assert.equal(waterProgress.progress.resourceInventory["action:chemical-bonding"], 0);

      for (let index = 0; index < 2; index += 1) {
        const response = await post(
          baseUrl,
          "/api/world-tower/purchase-resource",
          "action:chemical-bonding",
        );
        assert.equal(response.status, 201);
      }

      const duplicateKnowledge = await post(
        baseUrl,
        "/api/world-tower/purchase-resource",
        "knowledge:atomic-structure",
      );
      assert.equal(duplicateKnowledge.status, 200);
      const duplicateKnowledgeBody = await duplicateKnowledge.json() as {
        alreadyUnlocked: boolean;
        progress: { coinBalance: number; resourceInventory: Record<string, number> };
      };
      assert.equal(duplicateKnowledgeBody.alreadyUnlocked, true);
      assert.equal(duplicateKnowledgeBody.progress.coinBalance, 25);
      assert.equal(
        duplicateKnowledgeBody.progress.resourceInventory["action:chemical-bonding"],
        2,
      );

      const progressPath = resolve(
        dataDirectory,
        "learning",
        "world-tower",
        "progress.json",
      );
      const stored = JSON.parse(await readFile(progressPath, "utf8")) as {
        schemaVersion: number;
        id: string;
        updatedAt: string;
        transactions: unknown[];
        appliedGrantIds: string[];
      };
      assert.equal(stored.schemaVersion, 1);
      assert.match(stored.id, /^[0-9a-f-]{36}$/);
      assert.match(stored.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(stored.transactions.length, 19);
      assert.deepEqual(stored.appliedGrantIds, ["learning-coins-reset-to-zero-v1"]);
      assert.equal((await stat(progressPath)).mode & 0o777, 0o600);

      await writeFile(progressPath, '{"schemaVersion":999}\n', { mode: 0o600 });
      const corruptResponse = await fetch(`${baseUrl}/api/world-tower/manifest`);
      assert.equal(corruptResponse.status, 500);
    } finally {
      await stopServer(child);
    }
  });

  it("persists unlock-all and clear-all without changing earned knowledge coins", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-world-tower-manage-"));
    cleanupPaths.push(dataDirectory);
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      assert.equal((await postLearningReward(baseUrl, "math:cat-mouse-game")).status, 201);
      assert.equal((await postLearningReward(baseUrl, "math:cat-mouse-game")).status, 201);

      assert.equal((await post(
        baseUrl,
        "/api/world-tower/purchase-resource",
        "knowledge:atomic-structure",
      )).status, 201);
      assert.equal((await post(
        baseUrl,
        "/api/world-tower/purchase-resource",
        "action:chemical-bonding",
      )).status, 201);

      const unlockAllResponse = await postProgressAction(baseUrl, "unlock-all");
      assert.equal(unlockAllResponse.status, 201);
      const unlockAll = await unlockAllResponse.json() as {
        affectedNodes: number;
        progress: { unlockedNodeIds: string[] };
      };
      assert.equal(unlockAll.affectedNodes, 1_997);
      assert.equal(unlockAll.progress.unlockedNodeIds.length, 2_000);

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
      assert.equal(clearAll.affectedNodes, 1_997);
      assert.equal(clearAll.progress.coinBalance, 35);
      assert.deepEqual(
        clearAll.progress.unlockedNodeIds.sort(),
        ["particle:electron", "particle:neutron", "particle:proton"],
      );
      assert.deepEqual(clearAll.progress.permanentResourceIds, []);
      assert.deepEqual(clearAll.progress.resourceInventory, {});

      const reloadedManifest = await fetch(`${baseUrl}/api/world-tower/manifest`);
      assert.equal(reloadedManifest.status, 200);
      const persisted = await reloadedManifest.json() as {
        progress: { coinBalance: number; unlockedNodeIds: string[] };
      };
      assert.equal(persisted.progress.coinBalance, 35);
      assert.equal(persisted.progress.unlockedNodeIds.length, 3);

      const progressPath = resolve(dataDirectory, "learning", "world-tower", "progress.json");
      const stored = JSON.parse(await readFile(progressPath, "utf8")) as {
        transactions: Array<{ kind: string }>;
      };
      assert.deepEqual(
        stored.transactions.map((transaction) => transaction.kind),
        [
          "learning-reward",
          "learning-reward",
          "resource-unlock",
          "resource-charge",
          "admin-unlock-all",
          "admin-clear-all",
        ],
      );

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

  it("awards the configured amount once per solved-question event and requires the reset password", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-learning-coins-"));
    cleanupPaths.push(dataDirectory);
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const rewards: Array<[LearningRewardSource, number]> = [
        ["math:add-subtract", 1],
        ["math:arithmetic-battle", 5],
        ["math:multiplication", 5],
        ["math:cat-mouse-game", 20],
      ];
      let expectedBalance = 0;
      let firstEventId = "";
      for (const [source, rewardCoins] of rewards) {
        const eventId = randomUUID();
        if (!firstEventId) firstEventId = eventId;
        const response = await postLearningReward(baseUrl, source, eventId);
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
      assert.equal(duplicateBody.progress.coinBalance, 31);

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
        31,
      );

      const resetResponse = await resetLearningCoins(baseUrl, "123456");
      assert.equal(resetResponse.status, 201);
      const resetBody = await resetResponse.json() as {
        coinDelta: number;
        progress: { coinBalance: number };
      };
      assert.equal(resetBody.coinDelta, -31);
      assert.equal(resetBody.progress.coinBalance, 0);
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
      assert.equal(stored.coinBalance, 1);
      assert.deepEqual(stored.appliedGrantIds, [
        "knowledge-coin-preview-100000-v1",
        "learning-coins-reset-to-zero-v1",
      ]);
    } finally {
      await stopServer(child);
    }
  });

  it("does not report an unlock when the configured data path cannot be written", async () => {
    const parentDirectory = await mkdtemp(resolve(tmpdir(), "mumu-world-tower-write-failure-"));
    cleanupPaths.push(parentDirectory);
    const unusableDataPath = resolve(parentDirectory, "not-a-directory");
    await writeFile(unusableDataPath, "occupied");
    const { baseUrl, child } = await startServer(unusableDataPath);

    try {
      const response = await post(
        baseUrl,
        "/api/world-tower/purchase-resource",
        "knowledge:atomic-structure",
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
    } finally {
      await stopServer(child);
    }
  });
});
