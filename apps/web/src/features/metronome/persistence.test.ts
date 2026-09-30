import assert from "node:assert/strict";
import { test } from "node:test";
import { createLibrary, type MusicLibrary } from "./logic";
import { loadMusic, MusicSaveQueue } from "./persistence";
const state = (library: MusicLibrary, revision: number) => ({ schemaVersion: 1, id: "metronome-library", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", revision, library });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
test("loader distinguishes missing data from malformed and future data", async () => {
  assert.equal(await loadMusic(async () => response({ state: null })), null);
  await assert.rejects(loadMusic(async () => response({ state: { schemaVersion: 99 } })));
  await assert.rejects(loadMusic(async () => response({ message: "preserved" }, 500)), /preserved/);
});
test("save queue coalesces intermediate edits and advances revisions in strict order", async () => {
  const sent: { expectedRevision: number; library: MusicLibrary }[] = [];
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const queue = new MusicSaveQueue(0, () => {}, async (_url, init) => {
    const input = JSON.parse(init!.body as string); sent.push(input);
    if (sent.length === 1) await gate;
    return response({ state: state(input.library, input.expectedRevision + 1) });
  });
  const library = createLibrary(); queue.enqueue(library);
  const second = structuredClone(library); second.projects[0].bpm = 100; queue.enqueue(second);
  const latest = structuredClone(library); latest.projects[0].bpm = 130; queue.enqueue(latest);
  assert.equal(queue.dirty, true); release!(); await queue.flush();
  assert.deepEqual(sent.map(s => s.expectedRevision), [0, 1]);
  assert.deepEqual(sent.map(s => s.library.projects[0].bpm), [90, 130]); assert.equal(queue.dirty, false);
});
test("failed save retains the newest edit, retries explicitly, and never hides conflicts", async () => {
  let fail = true; const statuses: string[] = [], sent: number[] = [];
  const queue = new MusicSaveQueue(3, status => statuses.push(status), async (_url, init) => {
    const input = JSON.parse(init!.body as string); sent.push(input.library.projects[0].bpm);
    if (fail) return response({ message: "另一窗口已更新" }, 409);
    return response({ state: state(input.library, input.expectedRevision + 1) });
  });
  const library = createLibrary(); queue.enqueue(library); await assert.rejects(queue.flush(), /另一窗口/);
  assert.equal(queue.dirty, true); assert.equal(statuses.at(-1), "error");
  library.projects[0].bpm = 150; queue.enqueue(library);
  assert.equal(sent.length, 1); fail = false; await queue.flush();
  assert.deepEqual(sent, [90, 150]); assert.equal(queue.dirty, false);
});
test("fetch is invoked as a standalone function, never bound to the save queue", async () => {
  const queue = new MusicSaveQueue(0, () => {}, async function (this: unknown, _url, init) {
    assert.equal(this, undefined);
    const input = JSON.parse(init!.body as string);
    return response({ state: state(input.library, 1) });
  });
  queue.enqueue(createLibrary()); await queue.flush();
  assert.equal(queue.dirty, false);
});
