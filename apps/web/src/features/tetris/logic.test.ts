import assert from "node:assert/strict";
import test from "node:test";
import { act, cells, createGame, fits, HEIGHT, intervalFor, KEY_BINDINGS, landing, levelFor, SHAPES, speedFor, tick, WIDTH, type Game, type Kind } from "./logic";

const manual = { initialSpeed: 0, speedIncrement: 0 };
function verticalLine(game: Game) {
  game.piece = { kind: "I", matrix: [[1], [1], [1], [1]], x: 9, y: 0 };
}

test("七种方块各四格；空棋盘及非法配置", () => {
  const game = createGame(manual, 42);
  assert.equal(game.board.length, HEIGHT);
  assert.ok(game.board.every(row => row.length === WIDTH && row.every(cell => cell === null)));
  for (const kind of Object.keys(SHAPES) as Kind[]) assert.equal(cells({ kind, matrix: SHAPES[kind], x: 0, y: 0 }).length, 4);
  for (const value of [-1, 101, 1.5, NaN, Infinity]) {
    assert.throws(() => createGame({ initialSpeed: value, speedIncrement: 0 }));
    assert.throws(() => createGame({ initialSpeed: 0, speedIncrement: value }));
  }
});

test("零速度在空中与触底后都不自动移动或固定", () => {
  const game = createGame(manual, 42);
  const initial = structuredClone(game);
  for (let i = 0; i < 1000; i++) tick(game, 250);
  assert.deepEqual(game, initial);
  game.piece = landing(game);
  const grounded = structuredClone(game);
  tick(game, 600000);
  assert.deepEqual(game, grounded);
  act(game, "down");
  assert.ok(game.board.flat().some(Boolean));
});

test("每二十行升级，增量为零不加速，速度封顶100", () => {
  assert.deepEqual([0, 19, 20, 39, 40].map(levelFor), [1, 1, 2, 2, 3]);
  assert.equal(speedFor({ initialSpeed: 10, speedIncrement: 1 }, 40), 12);
  assert.equal(speedFor({ initialSpeed: 0, speedIncrement: 1 }, 20), 1);
  assert.equal(speedFor({ initialSpeed: 10, speedIncrement: 0 }, 2000), 10);
  assert.equal(speedFor({ initialSpeed: 99, speedIncrement: 50 }, 20), 100);
  assert.equal(intervalFor(0), Infinity);
  assert.equal(intervalFor(100), 50);
});

test("100速度约一秒穿过整个棋盘，不给自动下落加分", () => {
  const game = createGame({ initialSpeed: 100, speedIncrement: 0 }, 1);
  game.piece = { kind: "O", matrix: SHAPES.O, x: 4, y: 0 };
  for (let i = 0; i < 18; i++) tick(game, 50);
  assert.equal(game.piece.y, 18);
  tick(game, 50);
  assert.equal(game.board[19][4], "O");
  assert.equal(game.score, 0);
});

test("消1至4行按锁定前等级计分，升级发生在消除之后", () => {
  for (let count = 1; count <= 4; count++) {
    const game = createGame({ initialSpeed: 0, speedIncrement: 1 }, 3);
    game.lines = 19;
    for (let y = HEIGHT - count; y < HEIGHT; y++) game.board[y] = [...Array<Kind>(9).fill("T"), null];
    verticalLine(game);
    act(game, "drop");
    assert.equal(game.lines, 19 + count);
    assert.equal(game.events.length, 1);
    assert.equal(game.events[0].lines, count);
    assert.equal(game.events[0].points, [0, 100, 300, 500, 800][count]);
    assert.equal(game.score, game.events[0].points + 32);
    assert.equal(game.board.length, HEIGHT);
    assert.equal(speedFor(game.settings, game.lines), 1);
  }
});

test("清行后上方格位整体下移，落点不穿过障碍", () => {
  const game = createGame(manual, 2);
  game.board[19] = [...Array<Kind>(9).fill("T"), null];
  game.board[10][0] = "L";
  verticalLine(game);
  act(game, "drop");
  assert.equal(game.board[11][0], "L");
  game.piece = { kind: "O", matrix: SHAPES.O, x: 0, y: 0 };
  assert.equal(landing(game).y, 9);
});

test("墙边旋转不越界；被包围时不能旋转或穿模", () => {
  const game = createGame(manual, 3);
  game.piece = { kind: "T", matrix: SHAPES.T, x: 3, y: 5 };
  const initial = structuredClone(game.piece);
  for (let i = 0; i < 4; i++) act(game, "rotate");
  assert.deepEqual(game.piece, initial);
  act(game, "rotate"); act(game, "reverse");
  assert.deepEqual(game.piece, initial);
  for (let i = 0; i < 20; i++) act(game, "left");
  act(game, "rotate"); assert.ok(fits(game, game.piece));
  game.board = Array.from({ length: HEIGHT }, () => Array<Kind | null>(WIDTH).fill("O"));
  for (const [x, y] of cells(game.piece)) game.board[y][x] = null;
  assert.equal(act(game, "rotate"), false);
});

test("七袋随机没有缺块，双人顺序相同且操作互不干扰", () => {
  const first = createGame(manual, 123), second = createGame(manual, 123);
  assert.deepEqual(first, second);
  act(first, "left");
  assert.notEqual(first.piece.x, second.piece.x);
  const sequence: Kind[] = [];
  for (let i = 0; i < 140; i++) {
    assert.equal(first.piece.kind, second.piece.kind);
    sequence.push(first.piece.kind);
    for (const game of [first, second]) {
      game.board = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(null));
      act(game, "drop");
    }
  }
  for (let i = 0; i < sequence.length; i += 7) assert.equal(new Set(sequence.slice(i, i + 7)).size, 7);
});

test("生成区域被挡时结束，不再响应输入和时钟", () => {
  const game = createGame(manual, 22);
  game.piece = { kind: "O", matrix: SHAPES.O, x: 0, y: 18 };
  for (let x = 2; x <= 7; x++) game.board[0][x] = game.board[1][x] = "T";
  act(game, "drop");
  assert.equal(game.ended, true);
  const state = structuredClone(game);
  assert.equal(act(game, "drop"), false);
  assert.equal(tick(game, 250), false);
  assert.deepEqual(game, state);
});

test("双人键位独立，旋转与直落不共用", () => {
  assert.deepEqual(KEY_BINDINGS.KeyN, [0, "rotate"]);
  assert.deepEqual(KEY_BINDINGS.KeyK, [1, "rotate"]);
  assert.deepEqual(KEY_BINDINGS.Enter, [0, "drop"]);
  assert.deepEqual(KEY_BINDINGS.KeyE, [1, "drop"]);
  assert.deepEqual(KEY_BINDINGS.KeyM, [0, "reverse"]);
  assert.deepEqual(KEY_BINDINGS.KeyJ, [1, "reverse"]);
  assert.equal(KEY_BINDINGS.ArrowUp, undefined);
  assert.equal(KEY_BINDINGS.KeyW, undefined);
  assert.equal(KEY_BINDINGS.KeyQ, undefined);
  assert.equal(KEY_BINDINGS.Slash, undefined);
});

test("100个种子连续移动、旋转、下落始终保持棋盘边界", () => {
  for (let seed = 0; seed < 100; seed++) {
    const game = createGame({ initialSpeed: 100, speedIncrement: 100 }, seed);
    for (let i = 0; i < 500 && !game.ended; i++) {
      act(game, (["left", "right", "rotate", "reverse"] as const)[i % 4]);
      tick(game, 50);
      if (i % 7 === 0) act(game, "drop");
      assert.equal(game.board.length, HEIGHT);
      assert.ok(game.board.every(row => row.length === WIDTH));
      if (!game.ended) assert.ok(fits(game, game.piece));
    }
  }
});

test("音效只对应成功操作；升级用庆祝声，自动下落不逐格发声", () => {
  const game = createGame({ initialSpeed: 100, speedIncrement: 1 }, 9);
  game.piece = { kind: "T", matrix: SHAPES.T, x: 3, y: 0 };
  act(game, "left"); act(game, "rotate");
  assert.deepEqual(game.sounds.splice(0), ["move", "rotate"]);
  tick(game, 50);
  assert.deepEqual(game.sounds, []);
  act(game, "drop");
  assert.deepEqual(game.sounds.splice(0), ["lock"]);
  game.lines = 19;
  game.board = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(null));
  game.board[19] = [...Array<Kind>(9).fill("T"), null];
  verticalLine(game); act(game, "drop");
  assert.deepEqual(game.sounds, ["level"]);
});
