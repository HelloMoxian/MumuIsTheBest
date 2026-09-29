import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { calculate, cardIds, evaluate, fraction, generatePuzzle, initialBoard, isExpression, isSolved, mergeBoard, rewardForTime, solveFour, validBoard, type Expression } from "./twenty-four-engine.js";
import { emptyTwentyFourState, parseTwentyFourState, registerTwentyFourApi, writeTwentyFourState, type TwentyFourState, type TwentyFourView } from "./twenty-four.js";
import { registerWorldTowerApi } from "./world-tower.js";
import { emptyEditor } from "./twenty-four-editor.js";

test("四格编辑保存半括号、撤销恢复、整式提交与旧档兼容，不提前奖励", async t => {
  const s = await setup(t);
  let v = (await command(s.app, await load(s.app), { type: "new" })).view;
  const editor = { ...emptyEditor(), slots: [2, 0, 3, 1], operators: ["/", "-", "/"] as ("/" | "-")[], pendingStart: 1 };
  v = (await command(s.app, v, { type: "edit", editor })).view;
  assert.equal((await load(s.app)).game!.editor.pendingStart, 1);
  const bad = await s.app.inject({ method: "POST", url: "/api/math/twenty-four", payload: { type: "submit", revision: v.revision, gameId: v.game!.id, operationId: randomUUID() } });
  assert.equal(bad.statusCode, 422); assert.equal((await load(s.app)).completedCount, 0);
  v = (await command(s.app, v, { type: "edit", editor: { ...editor, pendingStart: null, groups: [{ start: 1, end: 3 }] } })).view;
  assert.equal(v.reward, null);
  v = (await command(s.app, v, { type: "edit-undo" })).view; assert.equal(v.game!.editor.pendingStart, 1);
  v = (await command(s.app, v, { type: "edit", editor: { ...editor, pendingStart: null, groups: [{ start: 1, end: 3 }] } })).view;
  const result = await command(s.app, v, { type: "submit" }); assert.equal(result.view.reward?.amount, 40);
  assert.equal((await s.app.inject({ method: "POST", url: "/api/math/twenty-four", payload: result.payload })).json().settlement, null);
  const raw = JSON.parse(await readFile(s.path, "utf8"));
  delete raw.game.editor; delete raw.game.editorUndo;
  await writeFile(s.path, JSON.stringify(raw));
  const restored = await load(s.app);
  assert.deepEqual(restored.game!.editor.slots, [2, 0, 3, 1]);
  assert.equal(restored.reward?.status, "granted");
});

test("空白、半填和清空持久化；拒绝嵌套与旧版新编辑；迁移保留原编辑器", async t => {
  const s = await setup(t);
  let v = (await command(s.app, await load(s.app), { type: "new" })).view;
  assert.deepEqual(v.game!.editor, emptyEditor());
  const half = { ...emptyEditor(), slots: [1, null, null, null], operators: [null, "+", null] };
  v = (await command(s.app, v, { type: "edit", editor: half })).view;
  assert.deepEqual((await load(s.app)).game!.editor, half);
  const submit = await s.app.inject({ method: "POST", url: "/api/math/twenty-four", payload: { type: "submit", revision: v.revision, gameId: v.game!.id, operationId: randomUUID() } });
  assert.equal(submit.statusCode, 422); assert.equal((await load(s.app)).completedCount, 0);
  for (const editor of [{ ...half, groups: [{ start: 0, end: 3 }, { start: 1, end: 2 }] }, { ...half, version: 1, operators: ["+", "+", "+"] }]) {
    const response = await s.app.inject({ method: "POST", url: "/api/math/twenty-four", payload: { type: "edit", editor, revision: v.revision, gameId: v.game!.id, operationId: randomUUID() } });
    assert.equal(response.statusCode, 400);
  }
  v = (await command(s.app, v, { type: "edit-reset" })).view;
  assert.deepEqual((await load(s.app)).game!.editor, emptyEditor());
  const raw = JSON.parse(await readFile(s.path, "utf8"));
  const legacy = { version: 1, slots: [2, 0, 3, 1], operators: ["/", "-", "/"], groups: [{ start: 1, end: 3 }, { start: 2, end: 3 }], pendingStart: null };
  raw.game.editor = legacy; raw.game.editorUndo = [legacy];
  await writeFile(s.path, JSON.stringify(raw));
  v = await load(s.app); assert.equal(v.game!.editor.version, 2);
  assert.deepEqual(v.game!.editor.groups, [{ start: 1, end: 3 }]);
  assert.deepEqual(JSON.parse(await readFile(s.path, "utf8")).game.editor, legacy);
  v = (await command(s.app, v, { type: "edit-reset" })).view;
  assert.deepEqual(JSON.parse(await readFile(s.path, "utf8")).game.legacyEditor, legacy);
  assert.deepEqual(v.game!.editor, emptyEditor());
});

const pair = (left: Expression, op: "+" | "-" | "*" | "/", right: Expression): Expression => ({ left, op, right });
const leaf = (card: number): Expression => ({ card });
const fixture = () => ({ cards: [3, 3, 8, 8, 0, 11, 12, 13], solution: pair(leaf(2), "/", pair(leaf(0), "-", pair(leaf(3), "/", leaf(1)))) });
test("随机题有八张 0—13 数字、精确四张可解、额外候选均可用，默认解没有负数和分数", () => {
  let seed = 17;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const seen = new Set<number>(), puzzles = new Set<string>();
  for (let i = 0; i < 160; i++) {
    const { cards, solution } = generatePuzzle(random);
    assert.equal(cards.length, 8); cards.forEach(n => { assert(n >= 0 && n <= 13); seen.add(n); });
    assert(isSolved(solution, cards)); assert.equal(new Set(cardIds(solution)).size, 4);
    const check = (node: Expression) => { const v = evaluate(node, cards); assert(v.n >= 0n); assert.equal(v.d, 1n); if (!("card" in node)) { check(node.left); check(node.right); } };
    check(solution); puzzles.add(cards.join(","));
  }
  assert.equal(seen.size, 14); assert(puzzles.size > 150);
  for (const random of [() => 0, () => .999999]) { const p = generatePuzzle(random); assert(isSolved(p.solution, p.cards)); }
});
test("精确分数、嵌套括号、非交换顺序、零、重复值以及四张约束", () => {
  const p = fixture();
  assert(isSolved(p.solution, p.cards)); assert(isSolved(solveFour(p.cards)!, p.cards));
  assert.equal(solveFour([0, 0, 0, 0]), null);
  assert.equal(evaluate(p.solution, p.cards).n, 24n);
  assert.deepEqual(calculate(fraction(1n, 3n), "+", fraction(2n, 3n)), fraction(1n));
  assert.throws(() => calculate(fraction(1n), "/", fraction(0n)));
  assert(!isSolved(pair(leaf(6), "+", leaf(6)), p.cards)); // Two copies of one physical card.
  assert(!isSolved(pair(leaf(3), "*", leaf(0)), p.cards)); // 24 with only two cards.
  assert.throws(() => mergeBoard(initialBoard(), p.cards, 0, 0, "+"));
  assert.throws(() => mergeBoard(initialBoard(), p.cards, 0, 4, "/"));
  const four = p.solution;
  assert.throws(() => mergeBoard([four, leaf(4)], p.cards, 0, 1, "+"));
  assert(!validBoard([leaf(0), leaf(0), ...initialBoard().slice(2)], p.cards));
  assert(!isExpression({ card: 8 })); assert(!isExpression({ card: 1, op: "+" }));
  assert(!isExpression(pair(four, "+", leaf(4))));
});
test("所有奖励时间边界，辅助奖励固定且非法时间拒绝", () => {
  assert.deepEqual([0, 60000, 60001, 180000, 180001, 300000, 300001, 86400000].map(ms => rewardForTime(ms, false)), [40,40,30,30,20,20,10,10]);
  assert.equal(rewardForTime(0, true), 5); assert.equal(rewardForTime(86400000, true), 5);
  assert.throws(() => rewardForTime(-1, false)); assert.throws(() => rewardForTime(NaN, false));
});

async function setup(t: TestContext, options: { dir?: string; writer?: typeof writeTwentyFourState; walletFailure?: () => boolean } = {}) {
  const dir = options.dir ?? await mkdtemp(join(tmpdir(), "mumu-twenty-four-test-"));
  const app = Fastify(), wallet = registerWorldTowerApi(app, dir, resolve(import.meta.dirname, "../../.."));
  let time = Date.UTC(2026, 0, 1);
  registerTwentyFourApi(app, dir, async (id, amount) => { if (options.walletFailure?.()) throw new Error("wallet unavailable"); return wallet.awardTwentyFour(id, amount); },
    { now: () => time, puzzle: fixture, writer: options.writer });
  t.after(async () => { await app.close(); if (!options.dir) await rm(dir, { recursive: true, force: true }); });
  return { app, dir, path: join(dir, "learning/math/twenty-four-state.json"), wallet, advance: (ms: number) => { time += ms; } };
}
async function load(app: FastifyInstance) {
  const response = await app.inject({ url: "/api/math/twenty-four" });
  assert.equal(response.statusCode, 200, response.body);
  return response.json<TwentyFourView>();
}
async function command(app: FastifyInstance, view: TwentyFourView, action: Record<string, unknown>) {
  const payload = { operationId: randomUUID(), revision: view.revision, gameId: view.game?.id ?? null, ...action };
  const response = await app.inject({ method: "POST", url: "/api/math/twenty-four", payload });
  assert.equal(response.statusCode, 200, response.body);
  return { view: response.json<TwentyFourView>(), payload };
}
async function finish(app: FastifyInstance, view: TwentyFourView) {
  const first = await command(app, view, { type: "merge", left: 3, right: 1, op: "/" });
  const second = await command(app, first.view, { type: "merge", left: 0, right: 6, op: "-" });
  return command(app, second.view, { type: "merge", left: 0, right: 5, op: "/" });
}
test("空数据、恢复过程、服务端分数验证、一次结算、重放/并发/重启不重复奖励", async t => {
  const s = await setup(t);
  let v = await load(s.app); assert.equal(v.game, null);
  v = (await command(s.app, v, { type: "new" })).view;
  assert.equal(v.game!.solution, null); assert.equal(v.game!.cards.length, 8);
  s.advance(60001);
  const result = await finish(s.app, v);
  assert.equal(result.view.reward?.amount, 30); assert.equal(result.view.reward?.status, "granted");
  assert.equal(result.view.completedCount, 1); assert.equal(result.view.settlement?.balance, 30);
  const replays = await Promise.all(Array.from({ length: 4 }, () => s.app.inject({ method: "POST", url: "/api/math/twenty-four", payload: result.payload })));
  assert(replays.every(r => r.statusCode === 200 && r.json().settlement === null));
  assert.equal((await load(s.app)).completedCount, 1);
  assert.equal((await s.wallet.awardTwentyFour(result.view.game!.id, 30)).balance, 30);
  await assert.rejects(s.wallet.awardTwentyFour(result.view.game!.id, 40));
  assert.equal(parseTwentyFourState(JSON.parse(await readFile(s.path, "utf8"))).history.length, 1);
  if (process.platform !== "win32") assert.equal((await stat(s.path)).mode & 0o777, 0o600);
  await s.app.close();
  const restarted = await setup(t, { dir: s.dir }); assert.equal((await load(restarted.app)).reward?.status, "granted");
  assert.equal((await restarted.wallet.awardTwentyFour(result.view.game!.id, 30)).balance, 30);
});
test("暂停不计时；撤销、重置不重置用时；提示永久锁定练习奖励", async t => {
  const s = await setup(t); let v = (await command(s.app, await load(s.app), { type: "new" })).view;
  s.advance(30_000); v = (await command(s.app, v, { type: "pause" })).view;
  s.advance(500_000); assert.equal((await load(s.app)).game!.elapsedMs, 30000);
  const bad = await s.app.inject({ method: "POST", url: "/api/math/twenty-four", payload: { type: "merge", left: 0, right: 1, op: "+", operationId: randomUUID(), revision: v.revision, gameId: v.game!.id } });
  assert.equal(bad.statusCode, 422);
  v = (await command(s.app, v, { type: "resume" })).view; s.advance(10000);
  v = (await command(s.app, v, { type: "merge", left: 0, right: 1, op: "+" })).view;
  assert.equal(v.game!.board.length, 7);
  v = (await command(s.app, v, { type: "undo" })).view; assert.equal(v.game!.board.length, 8);
  v = (await command(s.app, v, { type: "hint" })).view; assert(v.game!.solution);
  v = (await command(s.app, v, { type: "reset" })).view; assert(v.game!.assisted); assert.equal(v.game!.elapsedMs, 40000);
  v = (await finish(s.app, v)).view; assert.equal(v.reward?.amount, 5);
});
test("额外数字可以组成答案；两张得到24不能领奖；非法和陈旧操作不覆盖", async t => {
  const s = await setup(t); let v = (await command(s.app, await load(s.app), { type: "new" })).view;
  const original = v;
  v = (await command(s.app, v, { type: "merge", left: 5, right: 7, op: "+" })).view; // 11 + 13 = 24
  assert.equal(v.reward, null); assert.equal(v.completedCount, 0);
  const stale = await s.app.inject({ method: "POST", url: "/api/math/twenty-four", payload: { type: "reset", operationId: randomUUID(), revision: original.revision, gameId: original.game!.id } });
  assert.equal(stale.statusCode, 409);
  const forged = await s.app.inject({ method: "POST", url: "/api/math/twenty-four", payload: { type: "merge", operationId: randomUUID(), revision: v.revision, gameId: v.game!.id, left: 0, right: 1, op: "+", reward: 999, elapsedMs: 0 } });
  assert.equal(forged.statusCode, 400);
  v = (await command(s.app, v, { type: "merge", left: 0, right: 1, op: "-" })).view; // 3 - 3 = 0
  v = (await command(s.app, v, { type: "merge", left: 4, right: 5, op: "+" })).view;
  assert.equal(v.reward?.amount, 40); assert.equal(v.game!.board.length, 5);
});
test("保存失败不提前发币，重试沿用操作；钱包失败与入账后回执失败均能恢复", async t => {
  let failWrite = false, failReceipt = false, failWallet = false;
  const s = await setup(t, { walletFailure: () => failWallet, writer: async (path, state) => {
    if (failWrite || (failReceipt && state.history.some(r => r.rewardStatus === "granted"))) throw new Error("disk failure");
    return writeTwentyFourState(path, state);
  } });
  let v = (await command(s.app, await load(s.app), { type: "new" })).view;
  const payload = { type: "merge", left: 0, right: 1, op: "+", revision: v.revision, gameId: v.game!.id, operationId: randomUUID() };
  failWrite = true;
  assert.equal((await s.app.inject({ method: "POST", url: "/api/math/twenty-four", payload })).statusCode, 503);
  assert.equal((await load(s.app)).revision, v.revision);
  failWrite = false;
  assert.equal((await s.app.inject({ method: "POST", url: "/api/math/twenty-four", payload })).statusCode, 200);
  v = (await command(s.app, await load(s.app), { type: "reset" })).view;
  failWallet = true; v = (await finish(s.app, v)).view;
  assert.equal(v.reward?.status, "pending"); assert.equal(v.settlement, null);
  failWallet = false; failReceipt = true;
  assert.equal((await load(s.app)).reward?.status, "pending");
  assert.equal((await s.wallet.awardTwentyFour(v.game!.id, 40)).balance, 40);
  failReceipt = false;
  assert.equal((await load(s.app)).reward?.status, "granted");
  assert.equal((await s.wallet.awardTwentyFour(v.game!.id, 40)).balance, 40);
});
test("损坏/未来版本文件保留；旧钱包补齐空回执而不改变余额", async t => {
  const s = await setup(t);
  await command(s.app, await load(s.app), { type: "new" });
  const original = await readFile(s.path, "utf8");
  for (const content of ["{broken", JSON.stringify({ ...JSON.parse(original), schemaVersion: 99 })]) {
    await writeFile(s.path, content);
    assert.equal((await s.app.inject({ url: "/api/math/twenty-four" })).statusCode, 503);
    assert.equal((await s.app.inject({ method: "POST", url: "/api/math/twenty-four", payload: { type: "new", operationId: randomUUID(), revision: 0, gameId: null } })).statusCode, 503);
    assert.equal(await readFile(s.path, "utf8"), content);
  }
  assert.throws(() => parseTwentyFourState({ ...emptyTwentyFourState(), schemaVersion: 2 }));
  const id = randomUUID(); await s.wallet.awardSudoku(id, 1);
  const walletPath = join(s.dir, "learning/world-tower/progress.json");
  const old = JSON.parse(await readFile(walletPath, "utf8")); delete old.twentyFourRewards;
  await writeFile(walletPath, JSON.stringify(old));
  const next = await s.wallet.awardTwentyFour(randomUUID(), 10); assert.equal(next.balance, 40);
  const saved = JSON.parse(await readFile(walletPath, "utf8")); assert.equal(saved.sudokuRewards[id], 1);
  assert.equal(Object.keys(saved.twentyFourRewards).length, 1);
});
