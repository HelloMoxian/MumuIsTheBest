import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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
  it("renames and locks works, rejects overwrite/delete, and edits independent unlocked copies", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "mumu-work-lock-"));
    cleanupPaths.push(directory);
    const app = await createTestApp(directory);
    try {
      const id = randomUUID();
      const url = `/api/drawing-studio/works/${id}`;
      const document = drawingDocument(id);
      const saved = await app.inject({ method: "PUT", url, payload: { document } });
      assert.equal(saved.statusCode, 200);
      assert.equal(saved.json().work.schemaVersion, 2);
      assert.equal(saved.json().summary.locked, false);
      const [locked, blocked] = await Promise.all([
        app.inject({ method: "PATCH", url, payload: { locked: true } }),
        app.inject({ method: "PUT", url, payload: { document: drawingDocument(id, "不能覆盖") } }),
      ]);
      assert.equal(locked.statusCode, 200);
      assert.equal(blocked.statusCode, 409);
      const rename = await app.inject({ method: "PATCH", url, payload: { title: "  新名字  " } });
      assert.equal(rename.statusCode, 200);
      assert.equal(rename.json().summary.title, "新名字");
      assert.equal(rename.json().summary.locked, true);
      assert.equal(rename.json().summary.createdAt, saved.json().work.createdAt);
      assert.equal((await app.inject({ method: "DELETE", url })).statusCode, 409);
      const reloaded = (await app.inject({ method: "GET", url })).json().work;
      assert.deepEqual(reloaded.document.elements, document.elements);
      const copyId = randomUUID();
      const copy = await app.inject({ method: "PUT", url: `/api/drawing-studio/works/${copyId}`, payload: { document: { ...reloaded.document, id: copyId } } });
      assert.equal(copy.statusCode, 200);
      assert.equal(copy.json().summary.locked, false);
      assert.equal((await app.inject({ method: "GET", url })).json().work.locked, true);
      assert.equal((await app.inject({ method: "PATCH", url, payload: { title: " " } })).statusCode, 400);
      assert.equal((await app.inject({ method: "PATCH", url, payload: { locked: "false" } })).statusCode, 400);
      assert.equal((await app.inject({ method: "PATCH", url, payload: { locked: false } })).statusCode, 200);
      assert.equal((await app.inject({ method: "DELETE", url })).statusCode, 200);
      assert.equal((await app.inject({ method: "GET", url })).statusCode, 404);
      const trash = resolve(directory, "creative", "drawing-studio-works", "trash");
      const entries = await readdir(trash);
      assert.equal(entries.length, 1);
      const recovered = JSON.parse(await readFile(resolve(trash, entries[0]), "utf8"));
      assert.equal(recovered.id, id);
      assert.equal(recovered.document.title, "新名字");
    } finally { await app.close(); }
  });

  it("migrates legacy work metadata with a private recovery copy and rejects broken lock metadata", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "mumu-work-migration-"));
    cleanupPaths.push(directory);
    const app = await createTestApp(directory);
    try {
      const id = randomUUID();
      const url = `/api/drawing-studio/works/${id}`;
      await app.inject({ method: "PUT", url, payload: { document: drawingDocument(id) } });
      const file = resolve(directory, "creative", "drawing-studio-works", `${id}.json`);
      const old = JSON.parse(await readFile(file, "utf8"));
      old.schemaVersion = 1;
      delete old.locked;
      const original = JSON.stringify(old);
      await writeFile(file, original);
      assert.equal((await app.inject({ method: "GET", url })).json().work.locked, false);
      assert.equal((await app.inject({ method: "PATCH", url, payload: { locked: true } })).statusCode, 200);
      assert.equal(await readFile(`${file}.v1.bak`, "utf8"), original);
      assert.equal((await stat(`${file}.v1.bak`)).mode & 0o777, 0o600);
      const broken = JSON.parse(await readFile(file, "utf8"));
      delete broken.locked;
      await writeFile(file, JSON.stringify(broken));
      assert.equal((await app.inject({ method: "DELETE", url })).statusCode, 500);
      assert.equal((await app.inject({ method: "GET", url })).statusCode, 500);
    } finally { await app.close(); }
  });

  it("round-trips every supported shape and free-shape presets through file storage", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "mumu-work-shapes-"));
    cleanupPaths.push(directory);
    const app = await createTestApp(directory);
    try {
      const id = randomUUID();
      const kinds = ["diamond", "pentagon", "hexagon", "octagon", "right-triangle", "arrow-right", "arrow-left", "double-arrow", "cross", "quarter-circle", "ring", "chevron", "free-rectangle", "free-ellipse", "free-triangle", "tian-grid", "round-tian-grid", "rice-grid", "round-rice-grid", "nine-grid", "paw-print", "footprint", "scalloped-frame", "cloud-frame", "speech-bubble", "banner", "crown", "clover", "bow"];
      const source = drawingDocument(id);
      const elements = kinds.map((shape, index) => ({ id: `shape-${index}`, type: "shape", shape, x: index * 20, y: 0, width: 320, height: 60, rotation: 45, fill: "#ff00ff", stroke: "#171536", strokeWidth: 3.5, layer: 0, createdOrder: index }));
      const document = { ...source, elements, presets: [{ id: "preset", name: "自由形状", createdAt: source.createdAt, width: 1000, height: 100, elements }] };
      const url = `/api/drawing-studio/works/${id}`;
      assert.equal((await app.inject({ method: "PUT", url, payload: { document } })).statusCode, 200);
      const restored = (await app.inject({ method: "GET", url })).json().work.document;
      assert.deepEqual(restored.elements, elements);
      assert.deepEqual(restored.presets, document.presets);
    } finally { await app.close(); }
  });
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
