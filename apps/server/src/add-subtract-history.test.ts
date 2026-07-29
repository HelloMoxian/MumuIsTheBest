import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";

const serverDirectory = resolve(import.meta.dirname, "..");
const cleanupPaths: string[] = [];
const childProcesses: ChildProcess[] = [];

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  return port;
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
  childProcesses.push(child);

  let errorOutput = "";
  child.stderr?.on("data", (chunk) => {
    errorOutput += String(chunk);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`测试服务提前退出：${errorOutput || child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return { baseUrl, child };
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
  }
  throw new Error(`测试服务启动超时：${errorOutput}`);
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

function completedSession() {
  return {
    startedAt: "2026-07-29T03:00:00.000Z",
    questionCount: 5,
    operationType: "mixed",
    speechType: "none",
    childAge: 5,
    totalDurationMs: 18_000,
    calculationDurationMs: 15_000,
    questions: [
      { id: "q1", left: 7, right: 8, operator: "+", answer: 15, firstAttemptCorrect: true, calculationDurationMs: 2_500, wrongAnswers: [] },
      { id: "q2", left: 20, right: 4, operator: "-", answer: 16, firstAttemptCorrect: false, calculationDurationMs: 4_000, wrongAnswers: [15] },
      { id: "q3", left: 4, right: 6, operator: "+", answer: 10, firstAttemptCorrect: true, calculationDurationMs: 2_200, wrongAnswers: [] },
      { id: "q4", left: 9, right: 9, operator: "-", answer: 0, firstAttemptCorrect: true, calculationDurationMs: 2_800, wrongAnswers: [] },
      { id: "q5", left: 11, right: 3, operator: "+", answer: 14, firstAttemptCorrect: false, calculationDurationMs: 3_500, wrongAnswers: [13] },
    ],
  };
}

after(async () => {
  await Promise.all(childProcesses.map((child) => stopServer(child)));
  await Promise.all(cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
});

describe("add/subtract history API", () => {
  it("handles empty, invalid, successful and unsupported-file states", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-history-api-"));
    cleanupPaths.push(dataDirectory);
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const emptyResponse = await fetch(`${baseUrl}/api/math/add-subtract/history`);
      assert.equal(emptyResponse.status, 200);
      assert.deepEqual(await emptyResponse.json(), {
        schemaVersion: 1,
        updatedAt: new Date(0).toISOString(),
        sessions: [],
      });

      const invalidResponse = await fetch(`${baseUrl}/api/math/add-subtract/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...completedSession(), questionCount: 10 }),
      });
      assert.equal(invalidResponse.status, 400);

      const saveResponse = await fetch(`${baseUrl}/api/math/add-subtract/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completedSession()),
      });
      assert.equal(saveResponse.status, 201);
      const saved = await saveResponse.json() as {
        session: { id: string; correctCount: number; accuracy: number };
      };
      assert.match(saved.session.id, /^[0-9a-f-]{36}$/);
      assert.equal(saved.session.correctCount, 3);
      assert.equal(saved.session.accuracy, 0.6);

      const historyPath = resolve(dataDirectory, "learning", "math", "add-subtract-history.json");
      const stored = JSON.parse(await readFile(historyPath, "utf8")) as { sessions: unknown[] };
      assert.equal(stored.sessions.length, 1);
      assert.equal((await stat(historyPath)).mode & 0o777, 0o600);

      await writeFile(historyPath, '{"schemaVersion":999}\n', { mode: 0o600 });
      const unsupportedResponse = await fetch(`${baseUrl}/api/math/add-subtract/history`);
      assert.equal(unsupportedResponse.status, 500);
    } finally {
      await stopServer(child);
    }
  });

  it("reports write failures without creating a partial session", async () => {
    const parentDirectory = await mkdtemp(resolve(tmpdir(), "mumu-history-write-failure-"));
    cleanupPaths.push(parentDirectory);
    const unusableDataPath = resolve(parentDirectory, "not-a-directory");
    await writeFile(unusableDataPath, "occupied");
    const { baseUrl, child } = await startServer(unusableDataPath);

    try {
      const response = await fetch(`${baseUrl}/api/math/add-subtract/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completedSession()),
      });
      assert.equal(response.status, 500);
      const result = await response.json() as { code: string };
      assert.equal(result.code, "HISTORY_WRITE_FAILED");
    } finally {
      await stopServer(child);
    }
  });
});
