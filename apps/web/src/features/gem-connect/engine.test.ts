import assert from "node:assert/strict";
import test from "node:test";
import { hintGame, newGame, pauseGame, pickGem, resumeGame, shuffleGame, tickGame, type Game } from "./engine";
import { ENTRY_ANIMATION_MS, MATCH_ANIMATION_MS, LEVEL_TRANSITION_MS, findMove } from "./logic";

function fixture(tiles = [0, 0, 1, 1, 2, 2, 3, 3], cols = tiles.length): Game {
  return { ...newGame(1), phase: "playing", board: { rows: tiles.length / cols, cols, tiles } };
}
const connect = (game: Game, a: number, b: number) => pickGem(pickGem(game, a), b);

test("自动入场无需开始确认，暂停与入场不算活动时间", () => {
  let game = newGame(1);
  assert.equal(game.phase, "entering");
  game = tickGame(game, ENTRY_ANIMATION_MS);
  assert.equal(game.phase, "playing"); assert.equal(game.elapsed, 0);
  game = tickGame(game, 5000);
  game = tickGame(pauseGame(game), 100000);
  assert.equal(game.elapsed, 5000);
  game = tickGame(resumeGame(game), 3000);
  assert.equal(game.elapsed, 8000);
});
test("20秒按成功配对重置，错误选择不拖延自动提示，暂停冻结阈值", () => {
  let game = tickGame(fixture(), 19999); assert.equal(game.hint.length, 0);
  game = pickGem(game, 0);
  game = tickGame(game, 1); assert.equal(game.hint.length, 2);
  assert.equal(game.hints, 0);
  game = pickGem(game, 1);
  assert.equal(game.hint.length, 0);
  game = tickGame(game, 19999);
  game = tickGame(pauseGame(game), 30000);
  assert.equal(game.hint.length, 0);
  game = tickGame(resumeGame(game), 1);
  assert.deepEqual(game.hint, [2, 3]);
});
test("三组高速连续配对，连线独立收尾且保留正在选择的下一颗", () => {
  let game = connect(fixture(), 0, 1);
  assert.equal(game.phase, "playing");
  assert.equal(game.board.tiles[0], null);
  assert.equal(game.matches[0].kind, 0);
  assert.equal(pickGem(game, 1), game);
  game = tickGame(game, 100);
  game = connect(game, 2, 3);
  game = tickGame(game, 100);
  game = connect(game, 4, 5);
  assert.deepEqual(game.matches.map(match => match.elapsedMs), [200, 100, 0]);
  const lastPath = game.matches[2].path;
  game = pickGem(game, 6);
  game = tickGame(game, MATCH_ANIMATION_MS - 200);
  assert.deepEqual(game.matches.map(match => match.a), [2, 4]);
  assert.equal(game.selected, 6);
  assert.equal(game.matches[1].path, lastPath);
  assert.equal(game.elapsed, MATCH_ANIMATION_MS);
  game = tickGame(game, 100);
  assert.deepEqual(game.matches.map(match => match.a), [4]);
  game = pickGem(game, 7);
  assert.equal(game.phase, "settling");
  assert.equal(game.completion, null);
});
test("新配对可穿过正在消失的逻辑空位，提示不选旧宝石", () => {
  let game = connect(fixture([1, 0, 0, 1, 2, 2]), 1, 2);
  const hinted = hintGame(game);
  assert.deepEqual(hinted.hint, [0, 3]);
  assert.equal(hinted.matches, game.matches);
  game = connect(hinted, 0, 3);
  assert.equal(game.matches.length, 2);
  assert.deepEqual(game.matches[1].path, [
    { r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 },
  ]);
});
test("暂停冻结所有重叠动画，重排清理视觉副本且不复活已消除宝石", () => {
  let game = connect(fixture(), 0, 1);
  game = tickGame(game, 150);
  game = connect(game, 2, 3);
  const paused = pauseGame(game);
  assert.equal(tickGame(paused, 10000), paused);
  assert.equal(pickGem(paused, 4), paused);
  game = tickGame(resumeGame(paused), 100);
  assert.deepEqual(game.matches.map(match => match.elapsedMs), [250, 100]);
  const reshuffled = shuffleGame(game);
  assert.equal(reshuffled.matches.length, 0);
  assert.equal(reshuffled.phase, "entering");
  assert.deepEqual(reshuffled.board.tiles.slice(0, 4), [null, null, null, null]);
  assert.equal(reshuffled.board.tiles.filter(tile => tile !== null).length, 4);
  assert.ok(findMove(reshuffled.board));
});
test("无可连配对时等动画结束再自动重排", () => {
  let game = connect(fixture([2, 0, 1, 2, 1, 0], 3), 0, 3);
  assert.equal(findMove(game.board), null);
  assert.equal(game.phase, "settling");
  game = tickGame(game, MATCH_ANIMATION_MS - 1);
  assert.equal(game.shuffles, 0);
  game = tickGame(game, 1);
  assert.equal(game.phase, "entering");
  assert.equal(game.shuffles, 1);
  assert.equal(game.matches.length, 0);
  assert.ok(findMove(game.board));
});
test("180颗在一轮动画内连续完成，全部收尾后只生成一次回执", () => {
  let game = { ...fixture(Array.from({ length: 180 }, (_, i) => Math.floor(i / 2) % 8), 15), level: 10 };
  for (let i = 0; i < 90; i++) {
    const pair = findMove(game.board)!;
    assert.ok(pair);
    game = tickGame(game, 5);
    game = connect(game, pair[0], pair[1]);
  }
  assert.equal(game.board.tiles.every(tile => tile === null), true);
  assert.equal(game.matches.length, 90);
  assert.equal(game.phase, "settling");
  assert.equal(game.completion, null);
  assert.equal(pickGem(game, 0), game);
  game = tickGame(game, MATCH_ANIMATION_MS - 1);
  assert.equal(game.completion, null);
  assert.equal(game.matches.length, 1);
  game = tickGame(game, 1);
  assert.equal(game.phase, "celebrating");
  assert.equal(game.completion?.pairCount, 90);
  assert.equal(game.completion?.durationMs, 450);
  const completion = game.completion;
  game = tickGame(pauseGame(game), 10000); assert.equal(game.phase, "paused");
  game = tickGame(resumeGame(game), LEVEL_TRANSITION_MS);
  assert.equal(game.phase, "complete"); assert.equal(game.completion, completion);
  assert.equal(tickGame(game, 10000), game);
  const next = newGame(1);
  assert.equal(next.phase, "entering"); assert.equal(next.completion, null); assert.equal(next.board.tiles.length, 60);
});
test("减弱动效仍可连续消除，换关隔离旧提示、动画和暂停状态", () => {
  let game = connect(fixture(), 0, 1);
  game = connect(game, 2, 3);
  assert.equal(game.matches.length, 2);
  game = tickGame(game, 100, true);
  assert.equal(game.matches.length, 0);
  assert.equal(game.board.tiles.filter(t => t !== null).length, 4);
  const next = newGame(1);
  assert.equal(next.hint.length, 0); assert.equal(next.matches.length, 0); assert.notEqual(next.id, game.id);
  assert.equal(next.elapsed, 0);
});
