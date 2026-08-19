import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
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
    env: { ...process.env, APP_DATA_DIR: dataDirectory, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "ignore", "pipe"],
  });
  children.push(child);
  let stderr = "";
  child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
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

async function complete(baseUrl: string, sentenceId: string, eventId = randomUUID()) {
  return fetch(`${baseUrl}/api/english/echo-island/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId,
      sentenceId,
      mode: "regular",
      completedAt: "2026-08-19T08:00:00.000Z",
    }),
  });
}

after(async () => {
  await Promise.all(children.map((child) => stopServer(child)));
  await Promise.all(cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
});

describe("English Echo Island API", () => {
  it("persists a 20-sentence pool, rotates at 50, and serves original MP3 ranges", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-echo-island-"));
    cleanupPaths.push(dataDirectory);
    const { baseUrl, child } = await startServer(dataDirectory);
    try {
      const catalogResponse = await fetch(`${baseUrl}/api/english/echo-island`);
      assert.equal(catalogResponse.status, 200);
      const catalog = await catalogResponse.json() as {
        sentences: Array<{ id: string; audio: { sourceFile: string } }>;
        progress: {
          markedSentenceIds: string[];
          records: Array<{ sentenceId: string; completionCount: number }>;
          totalCompletions: number;
          regularCompletionsSinceReview: number;
        };
      };
      assert.equal(catalog.sentences.length, 1_000);
      assert.equal(catalog.progress.markedSentenceIds.length, 20);
      assert.equal(new Set(catalog.progress.markedSentenceIds).size, 20);
      assert.deepEqual(catalog.progress.records, []);

      const firstAudio = catalog.sentences[0]!.audio.sourceFile;
      const audioResponse = await fetch(`${baseUrl}/api/english/echo-island/audio/en/${firstAudio}`);
      assert.equal(audioResponse.status, 200);
      assert.equal(audioResponse.headers.get("content-type"), "audio/mpeg");
      assert.ok((await audioResponse.arrayBuffer()).byteLength > 1_000);
      const rangeResponse = await fetch(`${baseUrl}/api/english/echo-island/audio/zh/${firstAudio}`, {
        headers: { Range: "bytes=0-99" },
      });
      assert.equal(rangeResponse.status, 206);
      assert.equal((await rangeResponse.arrayBuffer()).byteLength, 100);
      assert.match(rangeResponse.headers.get("content-range") ?? "", /^bytes 0-99\/\d+$/);

      const graduatingId = catalog.progress.markedSentenceIds[0]!;
      for (let index = 0; index < 49; index += 1) {
        assert.equal((await complete(baseUrl, graduatingId)).status, 201);
      }
      const finalEventId = randomUUID();
      const graduationResponse = await complete(baseUrl, graduatingId, finalEventId);
      assert.equal(graduationResponse.status, 201);
      const graduation = await graduationResponse.json() as {
        poolChange: { removedSentenceId: string; addedSentenceId: string };
        progress: {
          markedSentenceIds: string[];
          totalCompletions: number;
          regularCompletionsSinceReview: number;
          records: Array<{ sentenceId: string; completionCount: number }>;
        };
      };
      assert.equal(graduation.poolChange.removedSentenceId, graduatingId);
      assert.ok(graduation.poolChange.addedSentenceId);
      assert.equal(graduation.progress.markedSentenceIds.length, 20);
      assert.ok(!graduation.progress.markedSentenceIds.includes(graduatingId));
      assert.equal(graduation.progress.totalCompletions, 50);
      assert.equal(graduation.progress.regularCompletionsSinceReview, 5);
      assert.equal(graduation.progress.records.find((record) => record.sentenceId === graduatingId)?.completionCount, 50);

      const duplicate = await complete(baseUrl, graduatingId, finalEventId);
      assert.equal(duplicate.status, 200);
      const duplicateBody = await duplicate.json() as {
        alreadyRecorded: boolean;
        progress: { totalCompletions: number };
      };
      assert.equal(duplicateBody.alreadyRecorded, true);
      assert.equal(duplicateBody.progress.totalCompletions, 50);

      const unmarkedId = catalog.sentences.find(
        (sentence) => !graduation.progress.markedSentenceIds.includes(sentence.id),
      )!.id;
      const markResponse = await fetch(`${baseUrl}/api/english/echo-island/marks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentenceId: unmarkedId, marked: true }),
      });
      assert.equal(markResponse.status, 200);
      const marked = await markResponse.json() as {
        replacedSentenceId: string;
        progress: { markedSentenceIds: string[] };
      };
      assert.ok(marked.replacedSentenceId);
      assert.equal(marked.progress.markedSentenceIds.length, 20);
      assert.ok(marked.progress.markedSentenceIds.includes(unmarkedId));

      const clearResponse = await fetch(`${baseUrl}/api/english/echo-island/progress/clear`, { method: "POST" });
      assert.equal(clearResponse.status, 200);
      const cleared = await clearResponse.json() as {
        progress: { markedSentenceIds: string[]; records: unknown[]; totalCompletions: number };
      };
      assert.equal(cleared.progress.markedSentenceIds.length, 20);
      assert.deepEqual(cleared.progress.records, []);
      assert.equal(cleared.progress.totalCompletions, 0);

      const invalid = await complete(baseUrl, "echo-9999");
      assert.equal(invalid.status, 400);

      const progressPath = resolve(dataDirectory, "learning", "english", "echo-island-progress.json");
      const stored = JSON.parse(await readFile(progressPath, "utf8")) as { schemaVersion: number; id: string };
      assert.equal(stored.schemaVersion, 1);
      assert.match(stored.id, /^[0-9a-f-]{36}$/);
      assert.equal((await stat(progressPath)).mode & 0o777, 0o600);

      await writeFile(progressPath, '{"schemaVersion":999}\n', { mode: 0o600 });
      assert.equal((await fetch(`${baseUrl}/api/english/echo-island`)).status, 500);
    } finally {
      await stopServer(child);
    }
  });

  it("reports an unusable data directory without claiming progress was saved", async () => {
    const parentDirectory = await mkdtemp(resolve(tmpdir(), "mumu-echo-write-failure-"));
    cleanupPaths.push(parentDirectory);
    const unusableDataPath = resolve(parentDirectory, "not-a-directory");
    await writeFile(unusableDataPath, "occupied");
    const { baseUrl, child } = await startServer(unusableDataPath);
    try {
      const response = await fetch(`${baseUrl}/api/english/echo-island`);
      assert.equal(response.status, 500);
      const body = await response.json() as { code: string };
      assert.equal(body.code, "ECHO_ISLAND_READ_FAILED");
    } finally {
      await stopServer(child);
    }
  });
});
