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
    if (child.exitCode !== null) {
      throw new Error(`测试服务提前退出：${stderr}`);
    }
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

function attempt(known: boolean) {
  return {
    character: "木",
    rank: 134,
    poolSize: 500,
    known,
    studiedAt: known
      ? "2026-07-29T08:01:00.000Z"
      : "2026-07-29T08:00:00.000Z",
  };
}

after(async () => {
  await Promise.all(children.map((child) => stopServer(child)));
  await Promise.all(
    cleanupPaths.map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("common character progress API", () => {
  it("stores known and review attempts with atomic private file semantics", async () => {
    const dataDirectory = await mkdtemp(
      resolve(tmpdir(), "mumu-common-characters-"),
    );
    cleanupPaths.push(dataDirectory);
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const emptyResponse = await fetch(
        `${baseUrl}/api/chinese/common-characters/progress`,
      );
      assert.equal(emptyResponse.status, 200);
      const empty = await emptyResponse.json() as {
        schemaVersion: number;
        records: unknown[];
      };
      assert.equal(empty.schemaVersion, 1);
      assert.deepEqual(empty.records, []);

      const invalidResponse = await fetch(
        `${baseUrl}/api/chinese/common-characters/progress/attempt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...attempt(false), rank: 501 }),
        },
      );
      assert.equal(invalidResponse.status, 400);

      const reviewResponse = await fetch(
        `${baseUrl}/api/chinese/common-characters/progress/attempt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempt(false)),
        },
      );
      assert.equal(reviewResponse.status, 201);

      const knownResponse = await fetch(
        `${baseUrl}/api/chinese/common-characters/progress/attempt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempt(true)),
        },
      );
      assert.equal(knownResponse.status, 201);
      const known = await knownResponse.json() as {
        record: {
          studiedCount: number;
          knownCount: number;
          notKnownCount: number;
          lastKnownAt: string;
        };
      };
      assert.deepEqual(
        {
          studiedCount: known.record.studiedCount,
          knownCount: known.record.knownCount,
          notKnownCount: known.record.notKnownCount,
          lastKnownAt: known.record.lastKnownAt,
        },
        {
          studiedCount: 2,
          knownCount: 1,
          notKnownCount: 1,
          lastKnownAt: "2026-07-29T08:01:00.000Z",
        },
      );

      const conflictResponse = await fetch(
        `${baseUrl}/api/chinese/common-characters/progress/attempt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...attempt(true), rank: 135 }),
        },
      );
      assert.equal(conflictResponse.status, 409);

      const progressPath = resolve(
        dataDirectory,
        "learning",
        "chinese",
        "common-characters-progress.json",
      );
      const stored = JSON.parse(await readFile(progressPath, "utf8")) as {
        schemaVersion: number;
        id: string;
        records: unknown[];
      };
      assert.equal(stored.schemaVersion, 1);
      assert.match(stored.id, /^[0-9a-f-]{36}$/);
      assert.equal(stored.records.length, 1);
      assert.equal((await stat(progressPath)).mode & 0o777, 0o600);

      await writeFile(progressPath, '{"schemaVersion":999}\n', { mode: 0o600 });
      const corruptResponse = await fetch(
        `${baseUrl}/api/chinese/common-characters/progress`,
      );
      assert.equal(corruptResponse.status, 500);
    } finally {
      await stopServer(child);
    }
  });

  it("reports write failure without claiming that progress was saved", async () => {
    const parentDirectory = await mkdtemp(
      resolve(tmpdir(), "mumu-common-character-write-failure-"),
    );
    cleanupPaths.push(parentDirectory);
    const unusableDataPath = resolve(parentDirectory, "not-a-directory");
    await writeFile(unusableDataPath, "occupied");
    const { baseUrl, child } = await startServer(unusableDataPath);

    try {
      const response = await fetch(
        `${baseUrl}/api/chinese/common-characters/progress/attempt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempt(true)),
        },
      );
      assert.equal(response.status, 500);
      const result = await response.json() as { code: string };
      assert.equal(result.code, "COMMON_CHARACTER_PROGRESS_WRITE_FAILED");
    } finally {
      await stopServer(child);
    }
  });
});
