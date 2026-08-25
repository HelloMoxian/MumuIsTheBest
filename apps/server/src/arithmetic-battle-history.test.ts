import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
  const deadline = Date.now() + 8_000;
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

function completedBattleSession() {
  return {
    startedAt: "2026-07-29T08:00:00.000Z",
    questionCount: 2,
    difficulty: "easy",
    childAge: 5,
    totalDurationMs: 8_000,
    calculationDurationMs: 7_000,
    asrSessionCount: 1,
    questions: [
      {
        id: "battle-1",
        operands: [23, 58],
        operators: ["+"],
        expression: "23 + 58",
        answer: 81,
        solvedDurationMs: 3_000,
        solvedAtOffsetMs: 3_000,
        solvedOrder: 1,
      },
      {
        id: "battle-2",
        operands: [72, 38],
        operators: ["-"],
        expression: "72 - 38",
        answer: 34,
        solvedDurationMs: 4_000,
        solvedAtOffsetMs: 7_000,
        solvedOrder: 2,
      },
    ],
  };
}

after(async () => {
  await Promise.all(children.map((child) => stopServer(child)));
  await Promise.all(cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
});

describe("arithmetic battle history API", () => {
  it("saves only complete, answer-unique sessions with interval timing", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-battle-history-"));
    cleanupPaths.push(dataDirectory);
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const emptyResponse = await fetch(`${baseUrl}/api/math/arithmetic-battle/history`);
      assert.equal(emptyResponse.status, 200);
      assert.deepEqual(await emptyResponse.json(), {
        schemaVersion: 1,
        updatedAt: new Date(0).toISOString(),
        sessions: [],
      });

      const invalidTiming = completedBattleSession();
      invalidTiming.questions[1]!.solvedDurationMs = 3_999;
      const invalidTimingResponse = await fetch(`${baseUrl}/api/math/arithmetic-battle/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidTiming),
      });
      assert.equal(invalidTimingResponse.status, 400);

      const duplicateAnswers = completedBattleSession();
      duplicateAnswers.questions[1] = {
        ...duplicateAnswers.questions[1]!,
        operands: [52, 29],
        operators: ["+"],
        expression: "52 + 29",
        answer: 81,
      };
      const duplicateResponse = await fetch(`${baseUrl}/api/math/arithmetic-battle/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(duplicateAnswers),
      });
      assert.equal(duplicateResponse.status, 400);

      const saveResponse = await fetch(`${baseUrl}/api/math/arithmetic-battle/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completedBattleSession()),
      });
      assert.equal(saveResponse.status, 201);
      const saved = await saveResponse.json() as {
        session: { correctCount: number; accuracy: number; questions: unknown[] };
      };
      assert.equal(saved.session.correctCount, 2);
      assert.equal(saved.session.accuracy, 1);
      assert.equal(saved.session.questions.length, 2);

      const historyPath = resolve(
        dataDirectory,
        "learning",
        "math",
        "arithmetic-battle-history.json",
      );
      const stored = JSON.parse(await readFile(historyPath, "utf8")) as { sessions: unknown[] };
      assert.equal(stored.sessions.length, 1);
      assert.equal((await stat(historyPath)).mode & 0o777, 0o600);

      await writeFile(historyPath, '{"schemaVersion":999}\n', { mode: 0o600 });
      const corruptResponse = await fetch(`${baseUrl}/api/math/arithmetic-battle/history`);
      assert.equal(corruptResponse.status, 500);
    } finally {
      await stopServer(child);
    }
  });

  it("reports write failures without creating a completed score", async () => {
    const parentDirectory = await mkdtemp(resolve(tmpdir(), "mumu-battle-write-failure-"));
    cleanupPaths.push(parentDirectory);
    const { baseUrl, child } = await startServer(parentDirectory);
    await writeFile(resolve(parentDirectory, "learning"), "occupied");

    try {
      const response = await fetch(`${baseUrl}/api/math/arithmetic-battle/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completedBattleSession()),
      });
      assert.equal(response.status, 500);
      const result = await response.json() as { code: string };
      assert.equal(result.code, "BATTLE_HISTORY_WRITE_FAILED");
    } finally {
      await stopServer(child);
    }
  });
});
