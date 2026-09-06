import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { LEVELS, THEMES, generatePuzzle, generateStory, makeGame, solve, act, publicGame, rewardForLevel, type ThemeId } from "./sudoku-engine.js";
import { registerSudokuApi, emptySudokuState, parseSudokuState, writeSudokuState, type SudokuState, type SudokuView, type SudokuWallets } from "./sudoku.js";
import { registerWorldTowerApi } from "./world-tower.js";
import { registerFruitSliceHistoryApi } from "./fruit-slice-history.js";
for (let level = 0; level < 6; level++) test(`难度 ${level + 1}：40 道随机题精确给定数、唯一解与种子复现`, () => {
  const distinct = new Set(), algorithms = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const p = generatePuzzle(level, seed * 7919), spec = LEVELS[level];
    assert.equal(p.given.filter(Boolean).length, spec.clues);
    assert.equal(solve(p.given, spec).count, 1); assert.deepEqual(solve(p.given, spec).first, p.solution);
    distinct.add(p.given.join()); algorithms.add(p.algorithm);
    if (seed === 1) assert.deepEqual(generatePuzzle(level, seed * 7919), p);
  }
  assert.equal(distinct.size, 40); assert.equal(algorithms.size, 2);
});
test('五个主题、三种规模均生成完整连续故事，至少 150 个不同故事', () => {
  const distinct = new Set();
  for (const theme of THEMES) for (const n of [4, 6, 9]) for (let seed = 1; seed <= 30; seed++) {
    const story = generateStory(theme.id as ThemeId, n, seed); assert.equal(story.rows.length, n);
    assert(story.rows.every(r => r.length === n && r.every(p => p.length > 0)));
    const full = story.rows.flat().join(''); assert(full.includes(theme.destination) && full.includes(theme.object)); assert(!full.includes('undefined'));
    distinct.add(full);
  }
  assert(distinct.size > 150);
});
test('排除、恢复、自动唯一、直接确定、撤销、全排除与提示', () => {
  const g = makeGame(0, 'gems', 4, 'test'), i = g.given.indexOf(0);
  act(g, {type:'note',index:i}); assert(g.cells[i].noted);
  for (const value of [1, 2, 3]) act(g,{type:'cross',index:i,value}); assert.equal(g.cells[i].value,4);
  act(g,{type:'cross',index:i,value:4}); assert.equal(g.cells[i].value,0); assert.equal(g.cells[i].crossed.length,4);
  act(g,{type:'cross',index:i,value:2}); assert.equal(g.cells[i].value,2);
  act(g,{type:'set',index:i,value:3}); assert.equal(g.cells[i].value,3);
  act(g,{type:'undo'}); assert.equal(g.cells[i].value,2);
  const before=structuredClone(g.cells); assert(act(g,{type:'hint',index:i}).message); assert.deepEqual(g.cells,before);
  act(g,{type:'clear',index:i}); assert.deepEqual(g.cells[i],{value:0,noted:false,crossed:[]});
  assert.throws(()=>act(g,{type:'set',index:g.given.findIndex(Boolean),value:1}));
  assert.throws(()=>act(g,{type:'set',index:i,value:9})); assert.throws(()=>generatePuzzle(-1,1));
});
test('仅全盘解出才完成，故事跟着行重组，冲突可见', () => {
  const g = makeGame(0,'letters',991,'test'); let result;
  const i=g.given.indexOf(0), duplicate=g.given.slice(Math.floor(i/4)*4, Math.floor(i/4)*4+4).find(Boolean);
  if(duplicate){ act(g,{type:'set',index:i,value:duplicate}); assert(publicGame(g)!.conflicts.includes(i)); }
  for (let j=0;j<g.cells.length;j++) if(!g.given[j]) result=act(g,{type:'set',index:j,value:g.solution[j]});
  assert.equal(result?.completed,true); assert(publicGame(g)!.story.rows.every(r=>r.complete));
  assert(!('solution' in publicGame(g)!)); assert(!('undo' in publicGame(g)!));
  assert.deepEqual(publicGame(g)!.story.rows.map(r=>r.pieces.join('')),g.story.rows.map(r=>r.join('')));
});

const projectRoot = resolve(import.meta.dirname, "../../..");
async function setup(t: TestContext, options: { dir?: string; energyFailure?: () => boolean; writer?: typeof writeSudokuState } = {}) {
  const dir = options.dir ?? await mkdtemp(join(tmpdir(), "mumu-sudoku-test-"));
  const app = Fastify();
  const knowledge = registerWorldTowerApi(app, dir, projectRoot);
  const energy = registerFruitSliceHistoryApi(app, dir);
  const wallets: SudokuWallets = { knowledge: knowledge.awardSudoku, energy: async (...args) => {
    if (options.energyFailure?.()) throw new Error("simulated wallet failure");
    return energy.awardSudoku(...args);
  } };
  registerSudokuApi(app, dir, wallets, options.writer);
  t.after(async () => { await app.close(); if (!options.dir) await rm(dir, { recursive: true, force: true }); });
  return { app, dir, path: join(dir, "learning/games/sudoku-state.json"), knowledge, energy };
}
async function load(app: FastifyInstance): Promise<SudokuView> {
  const result = await app.inject({ url: "/api/games/sudoku" });
  assert.equal(result.statusCode, 200, result.body); return result.json();
}
async function command(app: FastifyInstance, current: SudokuView, action: Record<string, unknown>) {
  const payload = { revision: current.revision, operationId: randomUUID(), ...(action.type === "new" ? {} : { gameId: current.game?.id }), ...action };
  const result = await app.inject({ method: "POST", url: "/api/games/sudoku", payload });
  assert.equal(result.statusCode, 200, result.body); return { view: result.json<SudokuView>(), payload };
}
async function begin(app: FastifyInstance, level = 0) {
  return (await command(app, await load(app), { type: "new", level, theme: "gems" })).view;
}
async function fill(app: FastifyInstance, current: SudokuView, leaveLast = false) {
  let view = current;
  const game = view.game!, answer = solve(game.given, LEVELS[game.level], 1).first!;
  const empty = game.cells.flatMap((cell, index) => !game.given[index] && cell.value !== answer[index] ? [index] : []);
  const last = empty.at(-1)!;
  for (const index of empty.filter(i => !leaveLast || i !== last)) view = (await command(app, view, { type: "set", index, value: answer[index] })).view;
  return { view, final: { type: "set", index: last, value: answer[last] } };
}
async function balances(dir: string) {
  const knowledge = JSON.parse(await readFile(join(dir, "learning/world-tower/progress.json"), "utf8"));
  const energy = JSON.parse(await readFile(join(dir, "learning/games/fruit-slice-history.json"), "utf8"));
  return { knowledge: knowledge.coinBalance, energy: energy.energyCoinBalance, knowledgeLedger: knowledge.sudokuRewards, energyLedger: energy.sudokuRewards };
}

test("六档各奖励30/50/70/90/110/130双币；每局唯一结算，重放和重启不加币", async t => {
  const { app, dir, path } = await setup(t);
  assert.equal((await load(app)).game, null);
  assert.deepEqual(LEVELS.map((spec, index) => spec.reward === rewardForLevel(index) && spec.reward), [30,50,70,90,110,130]);
  let total = 0;
  for (let level = 0; level < 6; level++) {
    const state = await begin(app, level), almost = await fill(app, state, true);
    const result = await command(app, almost.view, almost.final);
    const completed = result.view;
    total += 30 + level * 20;
    assert.equal(completed.reward?.amount, 30 + level * 20);
    assert.equal(completed.reward?.status, "granted");
    assert(completed.game?.completedAt); assert(completed.game?.story.rows.every(row => row.complete));
    assert(!("solution" in completed.game!)); assert(!("seed" in completed.game!)); assert(!("undo" in completed.game!));
    const replay = await app.inject({ method: "POST", url: "/api/games/sudoku", payload: result.payload });
    assert.equal(replay.statusCode, 200); assert.equal(replay.json().revision, completed.revision);
    const locked = await command(app, completed, { type: "undo" });
    assert.equal(locked.view.revision, completed.revision);
    const wallet = await balances(dir); assert.equal(wallet.knowledge, total); assert.equal(wallet.energy, total);
  }
  assert.equal(total, 480);
  const saved = parseSudokuState(JSON.parse(await readFile(path, "utf8")));
  assert.equal(saved.history.length, 6);
  if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o777, 0o600);
  await app.close();
  const restarted = await setup(t, { dir });
  assert.equal((await load(restarted.app)).completedCount, 6);
  assert.equal((await balances(dir)).energy, 480);
  // Replaying the same difficulty as a new game earns exactly one new award.
  const again = await fill(restarted.app, await begin(restarted.app, 0));
  assert.equal(again.view.completedCount, 7); assert.equal((await balances(dir)).knowledge, 510);
});

test("候选排除过程、只剩一个、强制填写、撤销、提示只读及固定格保护", async t => {
  const { app, path } = await setup(t); let view = await begin(app);
  const index = view.game!.given.indexOf(0);
  view = (await command(app, view, { type: "note", index })).view;
  for (const value of [1,2,3]) view = (await command(app, view, { type: "cross", index, value })).view;
  assert.equal(view.game!.cells[index].value, 4);
  view = (await command(app, view, { type: "cross", index, value: 4 })).view;
  assert.equal(view.game!.cells[index].value, 0);
  view = (await command(app, view, { type: "set", index, value: 2 })).view;
  assert.equal(view.game!.cells[index].value, 2);
  view = (await command(app, view, { type: "undo" })).view;
  assert.equal(view.game!.cells[index].value, 0);
  const before = await readFile(path, "utf8"), hint = await command(app, view, { type: "hint", index });
  assert.equal(hint.view.revision, view.revision); assert(Array.isArray(hint.view.hintValues));
  assert.equal(await readFile(path, "utf8"), before);
  for (const action of [{ type: "set", index: view.game!.given.findIndex(Boolean), value: 1 }, { type: "set", index, value: 9 }]) {
    assert.equal((await app.inject({ method: "POST", url: "/api/games/sudoku", payload: { ...action, revision: view.revision, gameId: view.game!.id, operationId: randomUUID() } })).statusCode, 422);
  }
});

test("并发修订冲突与请求ID碰撞，不覆盖另一页的填写", async t => {
  const { app } = await setup(t), view = await begin(app), index = view.game!.given.indexOf(0);
  const payload = { type: "note", index, revision: view.revision, gameId: view.game!.id, operationId: randomUUID() };
  const post = (body: typeof payload) => app.inject({ method: "POST", url: "/api/games/sudoku", payload: body });
  const responses = await Promise.all([post(payload),post(payload),post({ ...payload, operationId: randomUUID() })]);
  assert.deepEqual(responses.map(r => r.statusCode), [200,200,409]);
  assert.equal((await post({ ...payload, type: "clear" })).statusCode, 409);
  assert.equal((await load(app)).revision, view.revision + 1);
});

test("非法输入、损坏存档、未来版本及试玩格式均拒绝；原文件不覆盖", async t => {
  const { app, path } = await setup(t);
  for (const action of [{ type: "new", level: 6, theme: "gems" }, { type: "new", level: 0, theme: "unknown" }, { type: "new", level: 0, theme: "gems", reward: 999 }]) {
    assert.equal((await app.inject({ method: "POST", url: "/api/games/sudoku", payload: { ...action, revision: 0, operationId: randomUUID() } })).statusCode, 400);
  }
  await mkdir(dirnameOf(path), { recursive: true });
  for (const contents of ["broken", JSON.stringify({ ...emptySudokuState(), schemaVersion: 2 }), JSON.stringify({ ...emptySudokuState(), id: randomUUID(), wallet: { knowledge: 1000, energy: 1000 } })]) {
    await writeFile(path, contents);
    assert.equal((await app.inject({ url: "/api/games/sudoku" })).statusCode, 503);
    assert.equal((await app.inject({ method: "POST", url: "/api/games/sudoku", payload: { type: "new", level: 0, theme: "gems", revision: 0, operationId: randomUUID() } })).statusCode, 503);
    assert.equal(await readFile(path, "utf8"), contents);
  }
});
test("已解出的棋盘必须同时包含通关和奖励记录", () => {
  const state = emptySudokuState();
  const game = makeGame(0, "gems", 17, randomUUID());
  game.cells.forEach((cell, index) => { cell.value = game.solution[index]; });
  state.game = game;
  assert.throws(() => parseSudokuState(state));
  game.completedAt = new Date().toISOString();
  assert.throws(() => parseSudokuState(state));
});
function dirnameOf(path: string) { return resolve(path, ".."); }

test("存档写入失败不先发币，原操作可以安全重试", async t => {
  let fail = false;
  const { app, dir, path } = await setup(t, { writer: async (...args) => { if (fail) throw new Error("disk full"); await writeSudokuState(...args); } });
  const ready = await fill(app, await begin(app), true), before = await readFile(path, "utf8");
  const payload = { ...ready.final, revision: ready.view.revision, gameId: ready.view.game!.id, operationId: randomUUID() };
  fail = true;
  assert.equal((await app.inject({ method: "POST", url: "/api/games/sudoku", payload })).statusCode, 503);
  assert.equal(await readFile(path, "utf8"), before);
  await assert.rejects(readFile(join(dir, "learning/world-tower/progress.json")), { code: "ENOENT" });
  fail = false;
  assert.equal((await app.inject({ method: "POST", url: "/api/games/sudoku", payload })).json().reward.status, "granted");
  assert.equal((await balances(dir)).knowledge, 30);
});

test("一方钱包中断或到账标记保存失败，重启补齐双币而不重复发放", async t => {
  for (const mode of ["energy", "receipt"] as const) await t.test(mode, async sub => {
    let fail = true;
    const { app, dir, path } = await setup(sub, { energyFailure: () => mode === "energy" && fail,
      writer: async (path, state) => { if (mode === "receipt" && fail && state.history.some(record => record.rewardStatus === "granted")) throw new Error("receipt write failed"); await writeSudokuState(path, state); } });
    const completed = await fill(app, await begin(app));
    assert.equal(completed.view.reward?.status, "pending");
    assert.equal(JSON.parse(await readFile(path, "utf8")).history[0].rewardStatus, "pending");
    assert.equal(JSON.parse(await readFile(join(dir, "learning/world-tower/progress.json"), "utf8")).coinBalance, 30);
    await app.close(); fail = false;
    const restarted = await setup(sub, { dir });
    assert.equal((await load(restarted.app)).reward?.status, "granted");
    const wallet = await balances(dir); assert.equal(wallet.knowledge, 30); assert.equal(wallet.energy, 30);
    assert.equal(Object.keys(wallet.knowledgeLedger).length, 1); assert.equal(Object.keys(wallet.energyLedger).length, 1);
  });
});

test("旧钱包缺少数独账本时兼容补空，余额和其他游戏奖励保留", async t => {
  const { app, dir, knowledge, energy } = await setup(t);
  await knowledge.creditBejeweled(7); await energy.creditBejeweled(7);
  for (const relative of ["learning/world-tower/progress.json", "learning/games/fruit-slice-history.json"]) {
    const path = join(dir, relative), saved = JSON.parse(await readFile(path, "utf8"));
    delete saved.sudokuRewards; await writeFile(path, JSON.stringify(saved));
  }
  const result = await fill(app, await begin(app)); assert.equal(result.view.reward?.status, "granted");
  const wallet = await balances(dir); assert.equal(wallet.knowledge, 37); assert.equal(wallet.energy, 37);
  const id = result.view.game!.id;
  await knowledge.awardSudoku(id, 1); await energy.awardSudoku(id, 1);
  await assert.rejects(knowledge.awardSudoku(id, 6)); await assert.rejects(energy.awardSudoku(id, 6));
  assert.equal((await balances(dir)).knowledge, 37); assert.equal((await balances(dir)).energy, 37);
});
