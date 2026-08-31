import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import Fastify from "fastify";
import { registerDrawingStudioWorksApi } from "./drawing-studio-works.js";

const cleanupPaths: string[] = [];

after(async () => {
  await Promise.all(cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
});

async function createTestApp(dataDirectory: string) {
  const app = Fastify({ logger: false });
  registerDrawingStudioWorksApi(app, dataDirectory);
  await app.ready();
  return app;
}

function drawingDocument(id: string, title = "测试作品") {
  const now = new Date().toISOString();
  return {
    schemaVersion: 3,
    id,
    title,
    author: "木木",
    createdAt: now,
    updatedAt: now,
    viewport: { x: 320, y: 240, zoom: 1 },
    elements: [{
      id: "text-1",
      type: "text",
      text: "你好",
      fontSize: 48,
      color: "#171536",
      layout: "horizontal",
      x: 20,
      y: 30,
      width: 92,
      height: 62,
      rotation: 0,
      stroke: "#171536",
      strokeWidth: 1,
      layer: 2,
      createdOrder: 0,
    }],
    presets: [],
  };
}

describe("drawing studio works API", () => {
  it("stores each work as a private file and restores it through the long-term list", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-drawing-works-"));
    cleanupPaths.push(dataDirectory);
    const app = await createTestApp(dataDirectory);
    try {
      const empty = await app.inject({ method: "GET", url: "/api/drawing-studio/works" });
      assert.deepEqual(empty.json(), { works: [] });

      const id = randomUUID();
      const saved = await app.inject({
        method: "PUT",
        url: `/api/drawing-studio/works/${id}`,
        payload: { document: drawingDocument(id), thumbnailDataUrl: null },
      });
      assert.equal(saved.statusCode, 200);
      assert.equal(saved.json().summary.title, "测试作品");

      const destination = resolve(dataDirectory, "creative", "drawing-studio-works", `${id}.json`);
      assert.equal((await stat(destination)).mode & 0o777, 0o600);
      const stored = JSON.parse(await readFile(destination, "utf8")) as { id: string; document: { schemaVersion: number } };
      assert.equal(stored.id, id);
      assert.equal(stored.document.schemaVersion, 3);

      const list = await app.inject({ method: "GET", url: "/api/drawing-studio/works" });
      assert.equal(list.statusCode, 200);
      assert.deepEqual(list.json().works.map((work: { title: string }) => work.title), ["测试作品"]);

      const opened = await app.inject({ method: "GET", url: `/api/drawing-studio/works/${id}` });
      assert.equal(opened.statusCode, 200);
      assert.equal(opened.json().work.document.elements[0].type, "text");

      const firstCreatedAt = opened.json().work.createdAt;
      const overwritten = await app.inject({
        method: "PUT",
        url: `/api/drawing-studio/works/${id}`,
        payload: { document: drawingDocument(id, "改名后的作品"), thumbnailDataUrl: null },
      });
      assert.equal(overwritten.statusCode, 200);
      assert.equal(overwritten.json().work.createdAt, firstCreatedAt);
      assert.equal(overwritten.json().summary.title, "改名后的作品");
    } finally {
      await app.close();
    }
  });

  it("rejects mismatched ids and unsupported drawing versions", async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), "mumu-drawing-works-invalid-"));
    cleanupPaths.push(dataDirectory);
    const app = await createTestApp(dataDirectory);
    try {
      const id = randomUUID();
      const mismatch = await app.inject({
        method: "PUT",
        url: `/api/drawing-studio/works/${id}`,
        payload: { document: drawingDocument(randomUUID()), thumbnailDataUrl: null },
      });
      assert.equal(mismatch.statusCode, 400);

      const legacy = await app.inject({
        method: "PUT",
        url: `/api/drawing-studio/works/${id}`,
        payload: { document: { ...drawingDocument(id), schemaVersion: 2 }, thumbnailDataUrl: null },
      });
      assert.equal(legacy.statusCode, 400);
    } finally {
      await app.close();
    }
  });

  it("reports an unusable data directory instead of claiming the work was saved", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "mumu-drawing-works-failure-"));
    cleanupPaths.push(parent);
    const occupied = resolve(parent, "occupied");
    await writeFile(occupied, "not a directory");
    const app = await createTestApp(occupied);
    try {
      const id = randomUUID();
      const response = await app.inject({
        method: "PUT",
        url: `/api/drawing-studio/works/${id}`,
        payload: { document: drawingDocument(id), thumbnailDataUrl: null },
      });
      assert.equal(response.statusCode, 500);
    } finally {
      await app.close();
    }
  });
});
