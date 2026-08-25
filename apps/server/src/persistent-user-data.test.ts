import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import Fastify from "fastify";
import { registerPersistentUserDataApi } from "./persistent-user-data.js";

const cleanupPaths: string[] = [];

after(async () => {
  await Promise.all(cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
});

async function createTestApp(dataDirectory: string) {
  const app = Fastify({ logger: false });
  registerPersistentUserDataApi(app, dataDirectory);
  await app.ready();
  return app;
}

describe("persistent user data API", () => {
  it("stores chemistry state in a private, versioned file", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-persistent-data-"));
    cleanupPaths.push(dataDirectory);
    const app = await createTestApp(dataDirectory);
    try {
      const empty = await app.inject({
        method: "GET",
        url: "/api/persistent-data/chemistry-molecule-factory",
      });
      assert.equal(empty.statusCode, 200);
      assert.deepEqual(empty.json(), { state: null });

      const payload = {
        pool: { H: 5, O: 3 },
        discoveryIds: ["compound:water"],
        selectedSymbol: "O",
        assemblingId: null,
        excludeOrganic: false,
        autoAssemble: true,
        formedIonIds: ["hydroxide"],
      };
      const saved = await app.inject({
        method: "PUT",
        url: "/api/persistent-data/chemistry-molecule-factory",
        payload: { payload },
      });
      assert.equal(saved.statusCode, 200);
      const state = saved.json().state as {
        schemaVersion: number;
        id: string;
        stableId: string;
        payload: unknown;
      };
      assert.equal(state.schemaVersion, 1);
      assert.match(state.id, /^[0-9a-f-]{36}$/);
      assert.equal(state.stableId, "chemistry-molecule-factory");
      assert.deepEqual(state.payload, payload);

      const path = resolve(
        dataDirectory,
        "learning",
        "chemistry",
        "molecule-factory-state.json",
      );
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      const stored = JSON.parse(await readFile(path, "utf8")) as { payload: unknown };
      assert.deepEqual(stored.payload, payload);

      await writeFile(path, '{"schemaVersion":999}\n', { mode: 0o600 });
      const corrupt = await app.inject({
        method: "GET",
        url: "/api/persistent-data/chemistry-molecule-factory",
      });
      assert.equal(corrupt.statusCode, 500);
    } finally {
      await app.close();
    }
  });

  it("rejects unknown records and invalid payloads", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-persistent-invalid-"));
    cleanupPaths.push(dataDirectory);
    const app = await createTestApp(dataDirectory);
    try {
      const unknown = await app.inject({
        method: "GET",
        url: "/api/persistent-data/not-registered",
      });
      assert.equal(unknown.statusCode, 404);

      const invalid = await app.inject({
        method: "PUT",
        url: "/api/persistent-data/experience-preferences",
        payload: { payload: { interfaceMode: "invalid", readAloudMode: "none" } },
      });
      assert.equal(invalid.statusCode, 400);

      const duplicateChemistryIds = await app.inject({
        method: "PUT",
        url: "/api/persistent-data/chemistry-molecule-factory",
        payload: {
          payload: {
            pool: { H: 1 },
            discoveryIds: ["water", "water"],
            selectedSymbol: "H",
            assemblingId: null,
            excludeOrganic: false,
            autoAssemble: true,
            formedIonIds: [],
          },
        },
      });
      assert.equal(duplicateChemistryIds.statusCode, 400);
    } finally {
      await app.close();
    }
  });

  it("reports a write failure without claiming success", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "mumu-persistent-write-failure-"));
    cleanupPaths.push(parent);
    const unusableDataPath = resolve(parent, "occupied");
    await writeFile(unusableDataPath, "not a directory");
    const app = await createTestApp(unusableDataPath);
    try {
      const response = await app.inject({
        method: "PUT",
        url: "/api/persistent-data/experience-preferences",
        payload: { payload: { interfaceMode: "zh", readAloudMode: "bilingual" } },
      });
      assert.equal(response.statusCode, 500);
    } finally {
      await app.close();
    }
  });
});
