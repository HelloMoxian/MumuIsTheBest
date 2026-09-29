import test from "node:test";
import assert from "node:assert/strict";
import { GemSessions } from "./session";
import { pauseGame, pickGem, tickGame } from "./engine";
import { findMove, RULES_VERSION } from "./logic";

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test("switching and reload preserve independent boards, clocks and session IDs", () => {
  const storage = memoryStorage(), sessions = new GemSessions(storage);
  let game = tickGame(sessions.load(15), 1000);
  game = tickGame(game, 2345);
  const [a, b] = findMove(game.board)!;
  game = pickGem(pickGem(game, a), b);
  sessions.save(game, true);
  const other = sessions.load(14);
  sessions.save(other, true);
  assert.equal(sessions.load(15), game);
  sessions.save(game, true);
  const reload = new GemSessions(storage);
  const restored = reload.load(reload.activeLevel());
  assert.equal(restored.level, 15);
  assert.equal(restored.id, game.id);
  assert.equal(restored.elapsed, 2345);
  assert.deepEqual(restored.board, game.board);
  assert.deepEqual(restored.matches, []);
  assert.equal(reload.load(14).id, other.id);
  const restarted = sessions.restart(15);
  assert.notEqual(restarted.id, game.id);
  assert.equal(restarted.elapsed, 0);
  assert.ok(restarted.board.tiles.every(tile => tile !== null));
  assert.equal(sessions.load(14), other);
});

test("paused progress stays paused on reload", () => {
  const storage = memoryStorage(), sessions = new GemSessions(storage);
  const paused = pauseGame(tickGame(sessions.load(1), 1000));
  sessions.save(paused, true);
  const restored = new GemSessions(storage).load(1);
  assert.equal(restored.phase, "paused");
  assert.equal(tickGame(restored, 50000).elapsed, paused.elapsed);
});

test("invalid and obsolete snapshots do not erase other levels", () => {
  const storage = memoryStorage(), sessions = new GemSessions(storage);
  const intact = sessions.load(14);
  sessions.save(intact, true);
  const key = `mumu:gem-connect:session:v1:rules${RULES_VERSION}:15`;
  for (const value of ["{bad json", JSON.stringify({ schemaVersion: 99 }), JSON.stringify({ schemaVersion: 1, rulesVersion: RULES_VERSION, game: { level: 15 } })]) {
    storage.setItem(key, value);
    const reload = new GemSessions(storage);
    assert.equal(reload.load(15).elapsed, 0);
    assert.equal(reload.load(14).id, intact.id);
  }
});

test("blocked browser storage retains in-memory progress", () => {
  const sessions = new GemSessions({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } });
  const game = tickGame(tickGame(sessions.load(15), 1000), 3000);
  assert.equal(sessions.activeLevel(), 1);
  assert.doesNotThrow(() => sessions.save(game, true));
  sessions.load(14);
  assert.equal(sessions.load(15), game);
});
