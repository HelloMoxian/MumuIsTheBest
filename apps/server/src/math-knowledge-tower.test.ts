import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { mathKnowledgeAge } from "./math-knowledge-tower.js";

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

async function postLight(baseUrl: string, topicId: string, masteryId: string) {
  return fetch(`${baseUrl}/api/math/knowledge-tower/lights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topicId, masteryId }),
  });
}

function progressPath(dataDirectory: string) {
  return resolve(dataDirectory, "learning", "math", "knowledge-tower-progress.json");
}

after(async () => {
  await Promise.all(children.map((child) => stopServer(child)));
  await Promise.all(cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
});

describe("math knowledge tower API", () => {
  it("serves exactly 517 stable points and toggles a light on and off", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-math-tower-"));
    cleanupPaths.push(dataDirectory);
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const initialResponse = await fetch(`${baseUrl}/api/math/knowledge-tower`);
      assert.equal(initialResponse.status, 200);
      const initial = await initialResponse.json() as {
        catalog: {
          knowledgePointCount: number;
          totalLights: number;
          grades: Array<{ order: number; semesters: Array<{ points: Array<{ id: string }> }> }>;
        };
        progress: { litCount: number; score: number; maxScore: number; equivalentAge: { label: string } };
      };
      const points = initial.catalog.grades.flatMap(
        (grade) => grade.semesters.flatMap((semester) => semester.points),
      );
      assert.equal(initial.catalog.knowledgePointCount, 517);
      assert.equal(initial.catalog.totalLights, 2_068);
      assert.equal(points.length, 517);
      assert.equal(new Set(points.map((point) => point.id)).size, 517);
      assert.deepEqual(initial.catalog.grades.map((grade) => grade.order), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
      assert.equal(initial.progress.litCount, 0);
      assert.equal(initial.progress.score, 0);
      assert.equal(initial.progress.maxScore, 2_068);
      assert.equal(initial.progress.equivalentAge.label, "6岁0月0天");

      const firstResponse = await postLight(baseUrl, "g01-001", "aware");
      assert.equal(firstResponse.status, 200);
      const first = await firstResponse.json() as {
        isLit: boolean;
        progress: { litCount: number; score: number; equivalentAge: { label: string } };
      };
      assert.equal(first.isLit, true);
      assert.equal(first.progress.litCount, 1);
      assert.equal(first.progress.score, 1);
      assert.equal(first.progress.equivalentAge.label, "6岁0月1天");

      const offResponse = await postLight(baseUrl, "g01-001", "aware");
      assert.equal(offResponse.status, 200);
      const off = await offResponse.json() as {
        isLit: boolean;
        progress: { litCount: number; score: number; equivalentAge: { label: string } };
      };
      assert.equal(off.isLit, false);
      assert.equal(off.progress.litCount, 0);
      assert.equal(off.progress.score, 0);
      assert.equal(off.progress.equivalentAge.label, "6岁0月0天");

      const saved = JSON.parse(await readFile(progressPath(dataDirectory), "utf8")) as {
        schemaVersion: number;
        litLightIds: string[];
      };
      assert.equal(saved.schemaVersion, 1);
      assert.deepEqual(saved.litLightIds, []);
      assert.equal((await stat(progressPath(dataDirectory))).mode & 0o777, 0o600);

      assert.equal((await postLight(baseUrl, "missing", "aware")).status, 400);
      assert.equal((await postLight(baseUrl, "g01-001", "unknown")).status, 400);
    } finally {
      await stopServer(child);
    }
  });

  it("maps the score boundaries to exactly 6 and 15 years old", () => {
    assert.equal(mathKnowledgeAge(0).label, "6岁0月0天");
    assert.equal(mathKnowledgeAge(1).label, "6岁0月1天");
    assert.equal(mathKnowledgeAge(2_068).label, "15岁0月0天");
    assert.equal(mathKnowledgeAge(99_999).label, "15岁0月0天");
  });

  it("migrates the legacy point-to-level record", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-math-tower-migrate-"));
    cleanupPaths.push(dataDirectory);
    const path = progressPath(dataDirectory);
    await mkdir(resolve(path, ".."), { recursive: true });
    const now = new Date().toISOString();
    await writeFile(path, JSON.stringify({
      schemaVersion: 0,
      id: randomUUID(),
      catalogId: "mumu-math-knowledge-tower-v1",
      createdAt: now,
      updatedAt: now,
      litLights: { "g01-001": ["aware", "understand"] },
    }));
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const response = await fetch(`${baseUrl}/api/math/knowledge-tower`);
      assert.equal(response.status, 200);
      const body = await response.json() as { progress: { litCount: number } };
      assert.equal(body.progress.litCount, 2);
      const saved = JSON.parse(await readFile(path, "utf8")) as {
        schemaVersion: number;
        litLightIds: string[];
      };
      assert.equal(saved.schemaVersion, 1);
      assert.deepEqual(saved.litLightIds, ["g01-001:aware", "g01-001:understand"]);
    } finally {
      await stopServer(child);
    }
  });

  it("rejects a damaged or future progress file", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-math-tower-damaged-"));
    cleanupPaths.push(dataDirectory);
    const path = progressPath(dataDirectory);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, JSON.stringify({ schemaVersion: 99, litLightIds: [] }));
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const response = await fetch(`${baseUrl}/api/math/knowledge-tower`);
      assert.equal(response.status, 500);
      const body = await response.json() as { code: string };
      assert.equal(body.code, "KNOWLEDGE_TOWER_READ_FAILED");
    } finally {
      await stopServer(child);
    }
  });

  it("does not report a light when the atomic write cannot start", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-math-tower-write-"));
    cleanupPaths.push(dataDirectory);
    const directory = resolve(dataDirectory, "learning", "math");
    await mkdir(directory, { recursive: true });
    await chmod(directory, 0o500);
    const { baseUrl, child } = await startServer(dataDirectory);

    try {
      const response = await postLight(baseUrl, "g01-001", "aware");
      assert.equal(response.status, 500);
      const body = await response.json() as { code: string };
      assert.equal(body.code, "KNOWLEDGE_TOWER_WRITE_FAILED");
    } finally {
      await chmod(directory, 0o700);
      await stopServer(child);
    }
  });
});
