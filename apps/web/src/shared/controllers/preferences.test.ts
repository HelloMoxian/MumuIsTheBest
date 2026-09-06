import assert from "node:assert/strict";
import { test } from "node:test";
import { ControllerPreferencesStore } from "./preferences";
import { defaultGameControls } from "./registry";
import { TETRIS_CONTROLS } from "../../features/tetris/controls";

const response = (payload: unknown) => Response.json({ state: {
  schemaVersion: 1, id: "controller-test", stableId: "game-controller-preferences",
  createdAt: "2026-09-06T00:00:00.000Z", updatedAt: "2026-09-06T00:00:00.000Z", payload,
} });
async function settled(store: ControllerPreferencesStore) {
  for (let i = 0; i < 30 && store.getSnapshot().status === "saving"; i++) await new Promise(r => setTimeout(r, 1));
}
test("loading is shared, choices are saved and a new store restores both players and bindings", async () => {
  let stored: unknown = null;
  let reads = 0;
  const fetcher: typeof fetch = async (_, init) => {
    if (init?.method === "PUT") { stored = JSON.parse(String(init.body)).payload; return response(stored); }
    reads++; return stored ? response(stored) : Response.json({ state: null });
  };
  const store = new ControllerPreferencesStore(fetcher);
  await Promise.all([store.load(), store.load()]);
  assert.equal(reads, 1);
  const config = defaultGameControls(TETRIS_CONTROLS);
  config.playerCount = 2;
  config.players[1].mode = "gamepad";
  config.players[1].device = { id: "Generic controller", occurrence: 0, mapping: "standard" };
  config.players[1].bindings.rotate = [{ kind: "button", index: 5 }];
  store.update("tetris", config);
  await settled(store);
  assert.equal(store.getSnapshot().status, "saved");
  const nextPage = new ControllerPreferencesStore(fetcher);
  await nextPage.load();
  assert.deepEqual(nextPage.getSnapshot().preferences.games.tetris, config);
});
test("a bad stored version is not overwritten; keyboard preferences work in this session", async () => {
  let writes = 0;
  const store = new ControllerPreferencesStore(async (_, init) => {
    if (init?.method === "PUT") writes++;
    return response({ schemaVersion: 99, games: {} });
  });
  await store.load();
  assert.equal(store.getSnapshot().status, "read-error");
  store.update("tetris", defaultGameControls(TETRIS_CONTROLS));
  assert.ok(store.getSnapshot().preferences.games.tetris);
  assert.equal(writes, 0);
});
test("save failure preserves the latest choice, retry persists it, queued games don't erase each other", async () => {
  let fail = true;
  let stored: unknown;
  const store = new ControllerPreferencesStore(async (_, init) => {
    if (init?.method !== "PUT") return Response.json({ state: null });
    if (fail) return Response.json({ message: "无法保存" }, { status: 500 });
    stored = JSON.parse(String(init.body)).payload;
    return response(stored);
  });
  await store.load();
  const config = defaultGameControls(TETRIS_CONTROLS);
  store.update("tetris", config);
  await settled(store);
  assert.equal(store.getSnapshot().status, "write-error");
  fail = false;
  await store.retry();
  assert.equal(store.getSnapshot().status, "saved");
  store.update("another-game", config);
  store.update("tetris", { ...config, playerCount: 2 });
  await settled(store);
  assert.equal(store.getSnapshot().status, "saved");
  assert.equal((stored as { games: Record<string, unknown> }).games["another-game"] !== undefined, true);
  assert.equal(store.getSnapshot().preferences.games.tetris.playerCount, 2);
});

test("a read retry preserves choices made during the outage and merges other saved games", async () => {
  let fail = true;
  let stored = { schemaVersion: 1, games: { other: defaultGameControls(TETRIS_CONTROLS) } };
  const store = new ControllerPreferencesStore(async (_, init) => {
    if (fail) throw new Error("Offline");
    if (init?.method === "PUT") stored = { ...stored, games: { ...stored.games, ...JSON.parse(String(init.body)).payload.games } };
    return response(stored);
  });
  await store.load();
  store.update("tetris", { ...defaultGameControls(TETRIS_CONTROLS), playerCount: 2 });
  fail = false;
  await store.retry();
  assert.equal(store.getSnapshot().status, "saved");
  assert.equal(store.getSnapshot().preferences.games.tetris.playerCount, 2);
  assert.ok(store.getSnapshot().preferences.games.other);
});
