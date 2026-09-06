import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { emptyWorkout, registerWorkoutApi, workoutSchema } from "./workout.js";
import { registerFruitSliceHistoryApi } from "./fruit-slice-history.js";
import { DEFAULT_MOVES, MOVES, makePlan, validPlan, validPool, stageAt, advanceWorkout, WORKOUT_MS } from "./workout-contract.js";

async function setup(t: TestContext, failWallet = false) {
  const dir = await mkdtemp(join(tmpdir(), "mumu-workout-test-"));
  const app = Fastify(), wallet = registerFruitSliceHistoryApi(app, dir);
  let clock = Date.now(), fail = failWallet;
  registerWorkoutApi(app, dir, total => fail ? Promise.reject(new Error("wallet unavailable")) : wallet.creditWorkout(total), () => clock);
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const start = (id = randomUUID()) => app.inject({ method: "POST", url: "/api/games/workout/sessions", payload: { id } });
  const progress = (id: string, elapsedMs: number) => app.inject({ method: "PUT", url: "/api/games/workout/sessions/" + id, payload: { elapsedMs } });
  return { app, dir, start, progress, advance: (ms: number) => { clock += ms; }, recoverWallet: () => { fail = false; } };
}
test("all pools have exactly five minutes, six units, fixed rest, no excluded random moves", () => {
  for (const pool of [[...DEFAULT_MOVES], ...MOVES.map(m => [m.id]), MOVES.map(m => m.id)]) {
    for (let n = 0; n < 100; n++) {
      const plan = makePlan(pool);
      assert.equal(validPlan(plan), true);
      assert.equal(plan.reduce((sum, p) => sum + p.durationMs, 0), WORKOUT_MS);
      assert.equal(plan.filter(p => p.kind === "move").length, 6);
      assert.equal(plan.filter(p => p.kind === "rest").length, 6);
      assert.ok(plan.filter(p => p.kind === "move").every(p => pool.includes(p.move)));
      assert.ok(plan.filter(p => p.kind === "rest").every(p => p.durationMs >= 20_000));
      if (pool.length > 1) {
        const moves = plan.filter(p => p.kind === "move");
        assert.ok(moves.every((m, i) => i === 0 || m.move !== moves[i - 1].move));
      }
      assert.equal(stageAt(plan, 30_000).stage.kind, "move");
      assert.equal(stageAt(plan, WORKOUT_MS).stage.kind, "cooldown");
    }
  }
  assert.equal(validPool([]), false); assert.equal(validPool(["squat", "squat"]), false);
  assert.equal(validPool(["unknown"]), false); assert.throws(() => makePlan([]));
});
test("pause, background suspension and completion boundaries never skip exercise time", () => {
  const forged = makePlan([...DEFAULT_MOVES]);
  forged[1].kind = "rest";
  assert.equal(validPlan(forged), false);
  assert.equal(advanceWorkout(5000, 100, true), 5100);
  assert.equal(advanceWorkout(5000, 100, false), 5000);
  assert.equal(advanceWorkout(5000, 60_000, true), 5000);
  assert.equal(advanceWorkout(5000, NaN, true), 5000);
  assert.equal(advanceWorkout(WORKOUT_MS - 50, 100, true), WORKOUT_MS);
});
test("empty defaults, durable pool, forbidden input and full-only idempotent 200 energy reward", async t => {
  const s = await setup(t);
  assert.deepEqual((await s.app.inject("/api/games/workout/preferences")).json().enabledMoves, DEFAULT_MOVES);
  for (const enabledMoves of [[], ["bad"], ["march", "march"]]) {
    assert.equal((await s.app.inject({ method: "PUT", url: "/api/games/workout/preferences", payload: { enabledMoves } })).statusCode, 400);
  }
  assert.equal((await s.app.inject({ method: "PUT", url: "/api/games/workout/preferences", payload: { enabledMoves: ["squat"] } })).statusCode, 200);
  const first = (await s.start()).json().session;
  assert.ok(first.plan.filter((p: { kind: string }) => p.kind === "move").every((p: { move: string }) => p.move === "squat"));
  assert.equal((await s.progress(first.id, WORKOUT_MS)).statusCode, 409);
  s.advance(WORKOUT_MS);
  assert.equal((await s.progress(first.id, WORKOUT_MS - 1)).json().reward, 0);
  const results = await Promise.all(Array.from({ length: 8 }, () => s.progress(first.id, WORKOUT_MS)));
  assert.ok(results.every(r => r.statusCode === 200 && r.json().reward === 200));
  assert.equal((await s.app.inject("/api/games/fruit-slice/energy-coins")).json().balance, 200);
  assert.equal((await s.progress(first.id, 100)).json().elapsedMs, WORKOUT_MS);
  assert.equal((await s.progress(randomUUID(), WORKOUT_MS)).statusCode, 404);
  assert.equal((await s.progress(first.id, -1)).statusCode, 400);
  const storedPath = join(s.dir, "learning/games/workout.json");
  const stored = workoutSchema.parse(JSON.parse(await readFile(storedPath, "utf8")));
  assert.equal(stored.sessions.length, 1);
  assert.deepEqual(stored.enabledMoves, ["squat"]);
  if (process.platform !== "win32") assert.equal((await stat(storedPath)).mode & 0o777, 0o600);
});
test("reward saved before wallet failure, process restart recovers exactly once", async t => {
  const s = await setup(t, true), first = (await s.start()).json().session;
  s.advance(WORKOUT_MS);
  assert.equal((await s.progress(first.id, WORKOUT_MS)).statusCode, 503);
  const app2 = Fastify(), wallet = registerFruitSliceHistoryApi(app2, s.dir);
  registerWorkoutApi(app2, s.dir, wallet.creditWorkout);
  t.after(() => app2.close());
  await app2.ready();
  assert.equal((await app2.inject("/api/games/fruit-slice/energy-coins")).json().balance, 200);
  s.recoverWallet();
  assert.equal((await s.progress(first.id, WORKOUT_MS)).statusCode, 200);
  assert.equal((await s.app.inject("/api/games/fruit-slice/energy-coins")).json().balance, 200);
});
test("corrupt and future data remain intact; write failures are retryable", async t => {
  const s = await setup(t), path = join(s.dir, "learning/games/workout.json");
  await mkdir(join(path, ".."), { recursive: true });
  for (const raw of ["broken", JSON.stringify({ ...emptyWorkout(), schemaVersion: 2 })]) {
    await writeFile(path, raw);
    assert.equal((await s.start()).statusCode, 503);
    assert.equal(await readFile(path, "utf8"), raw);
  }
  await rm(path);
  await mkdir(path); // File replaced by a directory: no accidental reset or successful write.
  assert.equal((await s.start()).statusCode, 503);
  await rm(path, { recursive: true });
  assert.equal((await s.start()).statusCode, 200);
});
test("existing v2 energy wallet migrates absent workout cursor without changing existing rewards", async t => {
  const s = await setup(t), first = (await s.start()).json().session;
  s.advance(WORKOUT_MS); await s.progress(first.id, WORKOUT_MS);
  const path = join(s.dir, "learning/games/fruit-slice-history.json");
  const wallet = JSON.parse(await readFile(path, "utf8"));
  delete wallet.workoutRewardTotal; wallet.energyCoinBalance = 37;
  await writeFile(path, JSON.stringify(wallet));
  await s.progress(first.id, WORKOUT_MS);
  const migrated = JSON.parse(await readFile(path, "utf8"));
  assert.equal(migrated.energyCoinBalance, 237);
  assert.equal(migrated.workoutRewardTotal, 200);
  assert.deepEqual(migrated.gemConnectRewards, wallet.gemConnectRewards);
});
test("failed atomic write cannot report success and the queue recovers", async t => {
  if (process.platform === "win32" || process.getuid?.() === 0) { t.skip("requires ordinary POSIX filesystem permissions"); return; }
  const s = await setup(t), folder = join(s.dir, "learning/games");
  await mkdir(folder, { recursive: true });
  await chmod(folder, 0o500);
  try { assert.equal((await s.start()).statusCode, 503); }
  finally { await chmod(folder, 0o700); }
  assert.equal((await s.start()).statusCode, 200);
});
