import assert from "node:assert/strict";
import test from "node:test";
import { createBoard, findMove, findPath, GEMS, LEVELS, rankRecords, shuffleBoard, type Board, type Point, type RecordEntry, levelGemKinds, adjacentPairs } from "./logic";
import { parseHistory } from "./api";

function validPath(board: Board, path: Point[], a: number, b: number) {
  assert.deepEqual(path[0], { r: Math.floor(a / board.cols), c: a % board.cols });
  assert.deepEqual(path.at(-1), { r: Math.floor(b / board.cols), c: b % board.cols });
  let turns = 0, previous = "";
  for (let i = 1; i < path.length; i++) {
    const p = path[i], before = path[i - 1];
    assert.equal(Math.abs(p.r - before.r) + Math.abs(p.c - before.c), 1);
    const direction = `${p.r - before.r},${p.c - before.c}`;
    if (previous && previous !== direction) turns++;
    previous = direction;
    assert.ok(p.r >= -1 && p.r <= board.rows && p.c >= -1 && p.c <= board.cols);
    if (i < path.length - 1 && p.r >= 0 && p.r < board.rows && p.c >= 0 && p.c < board.cols) assert.equal(board.tiles[p.r * board.cols + p.c], null);
  }
  assert.ok(turns <= 2);
}
test("直线、一次拐弯、外缘两次拐弯、阻挡与不匹配", () => {
  const cases: [Board, number, number][] = [
    [{ rows: 1, cols: 3, tiles: [0, null, 0] }, 0, 2],
    [{ rows: 2, cols: 2, tiles: [0, null, 1, 0] }, 0, 3],
    [{ rows: 1, cols: 3, tiles: [0, 1, 0] }, 0, 2],
  ];
  for (const [board, a, b] of cases) validPath(board, findPath(board, a, b)!, a, b);
  const blocked = { rows: 3, cols: 3, tiles: [0, 1, 2, 3, 0, 4, 5, 6, 7] };
  assert.equal(findPath(blocked, 0, 4), null);
  assert.equal(findPath(blocked, 0, 1), null);
  assert.equal(findPath(blocked, 0, 0), null);
  assert.equal(findPath(blocked, -1, 0), null);
});
test("十关递进、每种宝石成对，随机棋盘全部能够完成", () => {
  assert.equal(LEVELS.length, 10); assert.equal(GEMS.length, 17);
  assert.equal(LEVELS[0].rows * LEVELS[0].cols, 60);
  assert.equal(LEVELS[9].rows * LEVELS[9].cols, 180);
  let seed = 42;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let previousCount = 0;
  for (let level = 1; level <= 10; level++) {
    const config = LEVELS[level - 1];
    assert.ok(config.rows * config.cols > previousCount);
    previousCount = config.rows * config.cols;
    for (let round = 0; round < 12; round++) {
      let board = createBoard(level, random);
      assert.equal(new Set(board.tiles).size, config.kinds);
      assert.deepEqual([...new Set(board.tiles)].sort((a, b) => a! - b!), levelGemKinds(level));
      for (const kind of new Set(board.tiles)) assert.equal(board.tiles.filter(tile => tile === kind).length % 2, 0);
      for (let pair = 0; pair < config.rows * config.cols / 2; pair++) {
        if (!findMove(board)) board = shuffleBoard(board, random);
        const move = findMove(board);
        assert.ok(move, `关卡 ${level}，第 ${pair} 对`);
        validPath(board, findPath(board, ...move)!, ...move);
        board.tiles[move[0]] = null; board.tiles[move[1]] = null;
      }
      assert.ok(board.tiles.every(tile => tile === null));
      assert.equal(findMove(board), null);
      assert.deepEqual(shuffleBoard(board), board);
    }
  }
});
test("最坏随机源也保证无解重排恢复一对，保留全部宝石与空位", () => {
  const board = { rows: 2, cols: 2, tiles: [0, 1, 1, 0] };
  assert.equal(findMove(board), null);
  const result = shuffleBoard(board, () => .999);
  assert.ok(findMove(result));
  assert.deepEqual([...result.tiles].sort(), [...board.tiles].sort());
  assert.deepEqual(board.tiles, [0, 1, 1, 0]);
  assert.throws(() => createBoard(0)); assert.throws(() => createBoard(11));
});
test("仅比较同关，按毫秒排序，并列稳定；响应校验拒绝未来版本和非法数据", () => {
  const base = { rulesVersion: 3 as const, rewardStatus: "granted" as const, hints: 0, shuffles: 0, pairCount: 30, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const records: RecordEntry[] = [
    { ...base, id: "00000000-0000-4000-8000-000000000001", level: 1, durationMs: 1800 },
    { ...base, id: "00000000-0000-4000-8000-000000000002", level: 2, pairCount: 36, durationMs: 1000 },
    { ...base, id: "00000000-0000-4000-8000-000000000003", level: 1, durationMs: 1700 },
  ];
  assert.deepEqual(rankRecords(records, 1).map(record => record.durationMs), [1700, 1800]);
  assert.equal(parseHistory({ schemaVersion: 3, records }).length, 3);
  assert.equal(rankRecords([...records, { ...records[0], id: "old", rulesVersion: 1, rewardStatus: "legacy", pairCount: 6, durationMs: 1 }], 1).length, 2);
  assert.deepEqual(parseHistory({ schemaVersion: 3, records: [] }), []);
  const previous = { ...records[0], id: "00000000-0000-4000-8000-000000000099", rulesVersion: 2 as const };
  assert.equal(rankRecords([...records, previous], 1).length, 2);
  assert.equal(parseHistory({ schemaVersion: 3, records: [previous] }).length, 1);
  assert.throws(() => parseHistory({ schemaVersion: 4, records }));
  assert.throws(() => parseHistory({ schemaVersion: 3, records: [{ ...records[0], durationMs: -1 }] }));
  assert.throws(() => parseHistory({ schemaVersion: 3, records: [records[0], records[0]] }));
});

test("每关新增宝石按顺序进入并全部成对，分布减少同色扎堆", () => {
  assert.equal(new Set(GEMS.map(gem => gem.id)).size, 17);
  assert.deepEqual(LEVELS.map(level => level.kinds), [4, 5, 7, 8, 10, 11, 13, 14, 16, 17]);
  for (let level = 2; level <= 10; level++) {
    const kinds = levelGemKinds(level);
    assert.ok(kinds.includes(8 + level - 2));
    assert.equal(kinds.includes(8 + level - 1), false);
  }
  const board = createBoard(10, () => .999);
  assert.ok(findMove(board), "最差随机源也应能连接");
  const clustered = { rows: 2, cols: 4, tiles: [0, 0, 1, 1, 0, 0, 1, 1] };
  assert.equal(adjacentPairs(clustered), 8);
});

test("后续关卡在有限次合法布局中优先减少相邻同种宝石", () => {
  const rng = (initial: number) => {
    let seed = initial;
    return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  };
  let improved = 0;
  for (let level = 2; level <= 10; level++) {
    const config = LEVELS[level - 1], kinds = levelGemKinds(level);
    const tiles = Array.from({ length: config.rows * config.cols }, (_, i) => kinds[Math.floor(i / 2) % kinds.length]);
    const first = shuffleBoard({ rows: config.rows, cols: config.cols, tiles }, rng(level));
    const spread = createBoard(level, rng(level));
    assert.ok(adjacentPairs(spread) <= adjacentPairs(first));
    assert.ok(findMove(spread));
    if (adjacentPairs(spread) < adjacentPairs(first)) improved++;
  }
  assert.ok(improved >= 5);
});
