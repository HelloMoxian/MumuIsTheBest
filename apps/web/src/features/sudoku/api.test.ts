import assert from "node:assert/strict";
import test from "node:test";
import { makeGame, publicGame } from "../../../../server/src/sudoku-engine";
import { isSudokuView, requestSudoku, SudokuApiError, type SudokuView, type SudokuCommand } from "./api";

function fixture(): SudokuView {
  return { schemaVersion: 1, revision: 1, game: publicGame(makeGame(0, "gems", 123, "cf616b09-b69a-4adc-a8bc-380f6d0e5b91")),
    history: [], completedCount: 0, pendingRewards: 0, reward: null, message: "准备好了", settlement: null };
}
test("正式公开棋盘可用，损坏的候选、故事、规模和奖励响应不能进入界面", () => {
  const valid = fixture(); assert(isSudokuView(valid));
  assert(isSudokuView({ ...valid, game: null }));
  for (const bad of [null, {}, { ...valid, revision: -1 }, { ...valid, game: { ...valid.game, level: 6 } },
    { ...valid, game: { ...valid.game, cells: [] } }, { ...valid, game: { ...valid.game, theme: "unknown" } },
    { ...valid, game: { ...valid.game, story: { title: "bad", rows: [] } } },
    { ...valid, hintValues: [9] }, { ...valid, reward: { amount: -30, status: "granted" } },
    { ...valid, settlement: { eventId: "award", amount: 30, knowledgeBalance: -1, energyBalance: 30, updatedAt: "now" } },
  ]) assert.equal(isSudokuView(bad), false);
  const candidates = structuredClone(valid);
  candidates.game!.cells[candidates.game!.given.indexOf(0)].crossed = [1, 1];
  assert.equal(isSudokuView(candidates), false);
});
test("保留同一操作ID和修订号重试，不提交奖励金额", async t => {
  const view = fixture(), calls: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.equal(url, "/api/games/sudoku"); assert.equal(init?.method, "POST");
    calls.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(view), { status: 200 });
  });
  const command: SudokuCommand = { type: "new", level: 0, theme: "gems", revision: 1, operationId: "704e054d-51e8-4622-a05a-ffbd1632b542" };
  await requestSudoku(command); await requestSudoku(command);
  assert.deepEqual(calls, [command, command]);
});
test("版本冲突保留明确状态，未知响应拒绝展示为已保存", async t => {
  const mocked = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ message: "恢复最新棋盘" }), { status: 409 }));
  await assert.rejects(requestSudoku(), error => error instanceof SudokuApiError && error.status === 409);
  mocked.mock.mockImplementation(async () => new Response(JSON.stringify({ schemaVersion: 99 }), { status: 200 }));
  await assert.rejects(requestSudoku(), /不完整/);
});
