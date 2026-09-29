import assert from "node:assert/strict";
import test from "node:test";
import { act, countColumnHoles, createGame, emptyStatistics, HEIGHT, SHAPES, WIDTH, type Kind } from "./logic";
import { addStatistics, clearTetrisHistory, defaultTetrisPreferences, emptyTetrisHistory, loadTetrisHistory, loadTetrisPreferences, perfectRate, rollTetrisHistory, saveTetrisHistory, saveTetrisPreferences, statisticsDelta } from "./statistics";

const manual = { initialSpeed: 0, speedIncrement: 0 };
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
}

test("纵向单列空格都计为空腔，不检查左右连通性", () => {
  const board = Array.from({ length: HEIGHT }, () => Array<Kind | null>(WIDTH).fill(null));
  board[10][4] = "T";
  board[12][4] = "O";
  assert.equal(countColumnHoles(board), 8);
});

test("落块记录出现、完美率与一至四行同时消除次数", () => {
  const perfect = createGame(manual, 4);
  perfect.piece = { kind: "O", matrix: SHAPES.O, x: 0, y: 0 };
  perfect.statistics.appearances.O++;
  act(perfect, "drop");
  assert.equal(perfect.statistics.placements.O, 1);
  assert.equal(perfect.statistics.perfect.O, 1);

  const cavity = createGame(manual, 5);
  cavity.board[19][0] = "T";
  cavity.piece = { kind: "O", matrix: SHAPES.O, x: 0, y: 0 };
  cavity.statistics.appearances.O++;
  act(cavity, "drop");
  assert.equal(cavity.statistics.placements.O, 1);
  assert.equal(cavity.statistics.perfect.O, 0);

  for (let count = 1; count <= 4; count++) {
    const game = createGame(manual, count);
    for (let y = HEIGHT - count; y < HEIGHT; y++) game.board[y] = [...Array<Kind>(9).fill("T"), null];
    game.piece = { kind: "I", matrix: [[1], [1], [1], [1]], x: 9, y: 0 };
    act(game, "drop");
    assert.equal(game.statistics.lineClears[count - 1], 1);
    assert.equal(game.statistics.clearedLines.I, count);
  }
});

test("落子临时形成的空腔随本次消行消失时仍算完美", () => {
  const game = createGame(manual, 6);
  game.board[17] = Array<Kind | null>(WIDTH).fill("T");
  for (let x = 3; x <= 6; x++) game.board[17][x] = null;
  game.board[18] = Array<Kind | null>(WIDTH).fill("T");
  for (let x = 4; x <= 6; x++) game.board[18][x] = null;
  game.board[19] = Array<Kind | null>(WIDTH).fill("T");
  assert.equal(countColumnHoles(game.board), 0);
  game.piece = { kind: "I", matrix: [[1, 1, 1, 1]], x: 3, y: 17 };
  act(game, "down");
  assert.equal(game.statistics.lineClears[1], 1);
  assert.equal(game.statistics.clearedLines.I, 2);
  assert.equal(countColumnHoles(game.board), 0);
  assert.equal(game.statistics.perfect.I, 1);
});

test("统计增量、合并和完美率保持幂等口径", () => {
  const committed = emptyStatistics();
  const current = emptyStatistics();
  current.appearances.T = 3;
  current.clearedLines.T = 2;
  current.placements.T = 2;
  current.perfect.T = 1;
  current.lineClears[1] = 1;
  const delta = statisticsDelta(current, committed);
  const merged = addStatistics(committed, delta);
  assert.deepEqual(merged, current);
  assert.equal(perfectRate(merged), 0.5);
  assert.equal(perfectRate(merged, "I"), null);
});

test("旧版统计缺少单块消行归属时迁移为零", () => {
  const storage = memoryStorage();
  const now = new Date("2026-09-29T08:00:00+08:00");
  const history = emptyTetrisHistory(now);
  const oldAll = structuredClone(history.all) as Partial<typeof history.all>;
  const oldToday = structuredClone(history.today.statistics) as Partial<typeof history.today.statistics>;
  delete oldAll.clearedLines;
  delete oldToday.clearedLines;
  storage.setItem("mumu.tetris.statistics.v1", JSON.stringify({ schemaVersion: 1, stableId: "tetris-statistics", all: oldAll, today: { date: "2026-09-29", statistics: oldToday }, createdAt: now.toISOString(), updatedAt: now.toISOString() }));
  const loaded = loadTetrisHistory(storage, now);
  assert.equal(loaded.all.clearedLines.I, 0);
  assert.equal(loaded.today.statistics.clearedLines.T, 0);
});

test("累计统计保留，跨自然日只清空今日统计", () => {
  const storage = memoryStorage();
  const firstDay = new Date("2026-09-28T08:00:00+08:00");
  const nextDay = new Date("2026-09-29T08:00:00+08:00");
  const history = emptyTetrisHistory(firstDay);
  history.all.appearances.I = 2;
  history.today.statistics.appearances.I = 2;
  saveTetrisHistory(storage, history, firstDay);
  const loaded = loadTetrisHistory(storage, nextDay);
  assert.equal(loaded.all.appearances.I, 2);
  assert.equal(loaded.today.statistics.appearances.I, 0);
  assert.equal(rollTetrisHistory(loaded, nextDay).today.date, "2026-09-29");
});

test("清空统计会把持久记录覆盖为空值", () => {
  const storage = memoryStorage();
  const now = new Date("2026-09-29T09:00:00+08:00");
  const history = emptyTetrisHistory(now);
  history.all.appearances.T = 9;
  history.today.statistics.appearances.T = 3;
  saveTetrisHistory(storage, history, now);
  clearTetrisHistory(storage, now);
  const loaded = loadTetrisHistory(storage, now);
  assert.equal(loaded.all.appearances.T, 0);
  assert.equal(loaded.today.statistics.appearances.T, 0);
});

test("旧版偏好缺少方块外观时迁移到默认配色", () => {
  const storage = memoryStorage();
  const now = new Date("2026-09-29T09:00:00+08:00").toISOString();
  storage.setItem("mumu.tetris.preferences.v1", JSON.stringify({ schemaVersion: 1, stableId: "tetris-preferences", mouseMode: true, createdAt: now, updatedAt: now }));
  assert.deepEqual(loadTetrisPreferences(storage), { mouseMode: true, blockTheme: "default", createdAt: now, updatedAt: now });
});

test("方块外观会随偏好保存并拒绝未知方案", () => {
  const storage = memoryStorage();
  const preferences = { ...defaultTetrisPreferences(), blockTheme: "random-gem" as const };
  saveTetrisPreferences(storage, preferences);
  assert.equal(loadTetrisPreferences(storage).blockTheme, "random-gem");
  const saved = JSON.parse(storage.getItem("mumu.tetris.preferences.v1")!) as Record<string, unknown>;
  storage.setItem("mumu.tetris.preferences.v1", JSON.stringify({ ...saved, blockTheme: "unknown" }));
  assert.throws(() => loadTetrisPreferences(storage), /设置不可用/);
});
