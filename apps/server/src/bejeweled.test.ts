import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { COLORS, canSwap, createGame, findMove, findRuns, playMove, type Color, type Game, type Special } from "./bejeweled-engine.js";
import { bejeweledStateSchema, registerBejeweledApi, type BejeweledState } from "./bejeweled.js";

const fakeWallets = { knowledge: async (total: number) => ({ balance: total, updatedAt: new Date().toISOString() }), energy: async (total: number) => ({ balance: total, updatedAt: new Date().toISOString() }) };
function savedOnly(value: BejeweledState & { balances?: unknown }): BejeweledState { const { balances: _balances, ...state } = value; return state; }

function fixture() {
  const game = createGame(143);
  game.board = Array.from({ length: 64 }, (_, id) => ({
    id, color: COLORS[(Math.floor(id / 8) * 2 + id % 8) % 7], special: "normal" as Special,
  }));
  game.nextId = 64;
  return game;
}
function set(game: Game, index: number, color: Color, special: Special = "normal") {
  game.board[index] = { id: index, color, special };
}
test("fresh boards are stable, deterministic, playable; invalid swaps cannot mutate input", () => {
  for (let seed = 0; seed < 100; seed++) {
    const game = createGame(seed);
    assert.equal(findRuns(game.board).length, 0);
    assert.ok(findMove(game.board));
    assert.deepEqual(game, createGame(seed));
    const previous = structuredClone(game);
    assert.equal(playMove(game, 7, 8), null);
    assert.equal(playMove(game, -1, 0), null);
    assert.equal(playMove(game, 0, 0), null);
    assert.deepEqual(game, previous);
  }
});
test("four/five/six straight matches create flame/cube/nova at the swapped slot", () => {
  for (const [length, expected] of [[4, "flame"], [5, "cube"], [6, "nova"]] as const) {
    const game = fixture();
    for (let i = 0; i < length; i++) set(game, i, "red");
    set(game, 2, "white");
    set(game, 10, "red");
    const before = structuredClone(game);
    const result = playMove(game, 10, 2)!;
    assert.ok(result);
    assert.equal(result.frames[2].board[2]?.special, expected);
    assert.equal(result.frames[1].cleared.includes(2), false);
    assert.equal(result.frames[1].cleared.length, length - 1);
    assert.deepEqual(game, before);
  }
});
test("T and L intersections create star gems without double-counting the junction", () => {
  for (const cells of [[17, 18, 19, 26, 34], [17, 18, 19, 25, 33]]) {
    const game = fixture();
    for (const i of cells) set(game, i, "red");
    set(game, 18, "white");
    set(game, 10, "red");
    const result = playMove(game, 10, 18)!;
    assert.equal(result.frames[2].board[18]?.special, "star");
    assert.equal(new Set(result.frames[1].cleared).size, result.frames[1].cleared.length);
  }
});
test("special blasts clear their correct geometry and trigger another special", () => {
  for (const special of ["flame", "star", "nova"] as const) {
    const game = fixture();
    set(game, 27, "red", special);
    set(game, 25, "purple");
    set(game, 26, "red"); set(game, 28, "white"); set(game, 20, "red");
    const result = playMove(game, 20, 28)!;
    assert.ok(result);
    const cleared = new Set(result.frames[1].cleared);
    for (let index = 0; index < 64; index++) {
      const r = Math.floor(index / 8), c = index % 8;
      const expected = special === "flame" ? Math.abs(r - 3) <= 1 && Math.abs(c - 3) <= 1
        : special === "star" ? r === 3 || c === 3 : Math.abs(r - 3) <= 1 || Math.abs(c - 3) <= 1;
      if (expected) assert.ok(cleared.has(index), special + " should clear " + index);
    }
  }
  const game = fixture();
  set(game, 27, "red", "flame"); set(game, 26, "red"); set(game, 28, "white"); set(game, 20, "red");
  set(game, 25, "purple");
  set(game, 35, "blue", "star");
  const result = playMove(game, 20, 28)!;
  assert.ok(result.frames[1].cleared.includes(3));
  assert.ok(result.frames[1].cleared.includes(39));
});
test("cube swaps clear a color, two cubes clear all 64, colors sum exactly to removed gems", () => {
  const game = fixture();
  set(game, 0, "red", "cube");
  const target = game.board[1]!.color;
  const expected = game.board.filter(gem => gem?.color === target).length + 1;
  const result = playMove(game, 0, 1)!;
  assert.equal(result.frames[1].cleared.length, expected);
  assert.equal(Object.values(result.counts).reduce((a, b) => a + b, 0), result.cleared);
  set(game, 1, "white", "cube");
  const double = playMove(game, 0, 1)!;
  assert.equal(double.frames[1].cleared.length, 64);
});
test("long runs settle, preserve IDs, score, colors, levels; classic eventually ends and endless resumes", () => {
  for (const mode of ["endless", "classic"] as const) {
    let game = createGame(741, mode);
    let total = 0, points = 0;
    let shuffles = 0;
    for (let i = 0; i < 400; i++) {
      const move = findMove(game.board);
      if (!move) { assert.equal(mode, "classic"); assert.equal(game.status, "finished"); break; }
      assert.ok(canSwap(game.board, ...move));
      const result = playMove(game, ...move)!;
      assert.ok(result);
      total += result.cleared; points += result.points; game = result.game;
      shuffles += Number(result.shuffled);
      assert.equal(findRuns(game.board).length, 0);
      assert.equal(game.board.length, 64);
      assert.equal(new Set(game.board.map(gem => gem!.id)).size, 64);
      assert.equal(game.cleared, total);
      assert.equal(game.score, points);
      assert.equal(game.level, 1 + Math.floor(total / 100));
      assert.equal(Object.values(result.counts).reduce((a, b) => a + b, 0), result.cleared);
    }
    if (mode === "classic") assert.equal(game.status, "finished");
    else { assert.equal(game.status, "playing"); assert.ok(shuffles > 0); }
  }
});
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "mumu-bejeweled-test-"));
  const app = Fastify();
  registerBejeweledApi(app, dir, fakeWallets);
  return { app, dir, path: join(dir, "learning/games/bejeweled-state.json"), close: async () => { await app.close(); await rm(dir, { recursive: true, force: true }); } };
}
test("empty storage initializes once; move persists, retry is idempotent, restart restores exact board", async () => {
  const ctx = await setup();
  try {
    const initial = savedOnly((await ctx.app.inject({ method: "GET", url: "/api/games/bejeweled" })).json());
    assert.equal(initial.totalScore, 0);
    assert.equal(initial.totalCleared, 0);
    const [a, b] = findMove(initial.game.board)!;
    const payload = { type: "swap", a, b, revision: 0, operationId: randomUUID() };
    const move = await ctx.app.inject({ method: "POST", url: "/api/games/bejeweled", payload });
    assert.equal(move.statusCode, 200);
    const stored = move.json().state as BejeweledState;
    assert.ok(stored.totalScore > 0);
    assert.deepEqual(JSON.parse(await readFile(ctx.path, "utf8")), stored);
    const retry = await ctx.app.inject({ method: "POST", url: "/api/games/bejeweled", payload });
    assert.equal(retry.json().replayed, true);
    assert.deepEqual(retry.json().state, stored);
    const restarted = Fastify(); registerBejeweledApi(restarted, ctx.dir, fakeWallets);
    const read = await restarted.inject({ method: "GET", url: "/api/games/bejeweled" });
    assert.deepEqual(savedOnly(read.json()), stored); await restarted.close();
    if (process.platform !== "win32") assert.equal((await stat(ctx.path)).mode & 0o777, 0o600);
    const nextGame = await ctx.app.inject({ method: "POST", url: "/api/games/bejeweled", payload: { type: "new", mode: "classic", revision: 1, operationId: randomUUID() } });
    assert.equal(nextGame.statusCode, 200);
    assert.equal(nextGame.json().state.totalScore, stored.totalScore);
    assert.deepEqual(nextGame.json().state.counts, stored.counts);
    assert.equal(nextGame.json().state.game.score, 0);
  } finally { await ctx.close(); }
});
test("concurrent tabs serialize; stale revisions and illegal input cannot overwrite the saved board", async () => {
  const ctx = await setup();
  try {
    const initial = savedOnly((await ctx.app.inject({ method: "GET", url: "/api/games/bejeweled" })).json());
    const [a, b] = findMove(initial.game.board)!;
    const outputs = await Promise.all([1, 2].map(() => ctx.app.inject({ method: "POST", url: "/api/games/bejeweled", payload: { type: "swap", a, b, revision: 0, operationId: randomUUID() } })));
    assert.deepEqual(outputs.map(r => r.statusCode).sort(), [200, 409]);
    const before = await readFile(ctx.path, "utf8");
    for (const payload of [
      { type: "swap", a: -1, b: 64, revision: 1, operationId: randomUUID() },
      { type: "swap", a: 0, b: 0, revision: 1, operationId: randomUUID() },
      { type: "swap", a, b, revision: 1, operationId: randomUUID(), totalScore: 999999 },
    ]) {
      const response = await ctx.app.inject({ method: "POST", url: "/api/games/bejeweled", payload });
      assert.ok([400, 422].includes(response.statusCode));
      assert.equal(await readFile(ctx.path, "utf8"), before);
    }
  } finally { await ctx.close(); }
});
test("corrupt files, future schemas and mismatched totals are rejected without destructive migration", async () => {
  const ctx = await setup();
  try {
    const initial = savedOnly((await ctx.app.inject({ method: "GET", url: "/api/games/bejeweled" })).json());
    for (const invalid of ["{broken", JSON.stringify({ ...initial, schemaVersion: 3 }), JSON.stringify({ ...initial, totalCleared: 5 })]) {
      await writeFile(ctx.path, invalid);
      const read = await ctx.app.inject({ method: "GET", url: "/api/games/bejeweled" });
      assert.equal(read.statusCode, 503);
      assert.equal(await readFile(ctx.path, "utf8"), invalid);
    }
    assert.ok(bejeweledStateSchema.safeParse(initial).success);
  } finally { await ctx.close(); }
});
test("write failure leaves original save intact, and same operation can be retried after recovery", async () => {
  const ctx = await setup();
  try {
    const initial = savedOnly((await ctx.app.inject({ method: "GET", url: "/api/games/bejeweled" })).json());
    await rm(ctx.path); await mkdir(ctx.path);
    const response = await ctx.app.inject({ method: "GET", url: "/api/games/bejeweled" });
    assert.equal(response.statusCode, 503);
    await rm(ctx.path, { recursive: true });
    await writeFile(ctx.path, JSON.stringify(initial));
    const [a, b] = findMove(initial.game.board)!;
    const payload = { type: "swap", a, b, revision: 0, operationId: randomUUID() };
    // A directory in place of the parent makes both read and write fail safely.
    const failedDir = join(ctx.dir, "blocked");
    await writeFile(failedDir, "read-only path obstacle");
    const failed = Fastify(); registerBejeweledApi(failed, failedDir, fakeWallets);
    assert.equal((await failed.inject({ method: "POST", url: "/api/games/bejeweled", payload })).statusCode, 503);
    await failed.close();
    const recovered = await ctx.app.inject({ method: "POST", url: "/api/games/bejeweled", payload });
    assert.equal(recovered.statusCode, 200);
    assert.equal(recovered.json().state.revision, 1);
  } finally { await ctx.close(); }
});

test("an atomic write failure preserves the previous file and retries exactly once", async () => {
  if (process.platform === "win32" || process.getuid?.() === 0) return;
  const ctx = await setup();
  const parent = join(ctx.dir, "learning/games");
  try {
    const initial = savedOnly((await ctx.app.inject({ method: "GET", url: "/api/games/bejeweled" })).json());
    const before = await readFile(ctx.path, "utf8");
    const [a, b] = findMove(initial.game.board)!;
    const payload = { type: "swap", a, b, revision: 0, operationId: randomUUID() };
    await chmod(parent, 0o500);
    const failed = await ctx.app.inject({ method: "POST", url: "/api/games/bejeweled", payload });
    assert.equal(failed.statusCode, 503);
    assert.equal(await readFile(ctx.path, "utf8"), before);
    await chmod(parent, 0o700);
    const recovered = await ctx.app.inject({ method: "POST", url: "/api/games/bejeweled", payload });
    assert.equal(recovered.statusCode, 200);
    const replay = await ctx.app.inject({ method: "POST", url: "/api/games/bejeweled", payload });
    assert.deepEqual(replay.json().state, recovered.json().state);
  } finally { await chmod(parent, 0o700).catch(() => undefined); await ctx.close(); }
});
