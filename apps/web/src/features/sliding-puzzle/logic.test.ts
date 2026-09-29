import test from "node:test";
import assert from "node:assert/strict";
import { createPuzzle, isSolved, movable, parsePuzzle, play, scramble, slide, solvedCells, undo } from "./logic";
import { PuzzleConflict, readPuzzle, savePuzzle } from "./storage";

test("点击远端格子只移动同一行/列之间的整段，每块恰好一格", () => {
  assert.deepEqual(slide([1,2,3,4,5,6,7,8,0], 3, 6), [1,2,3,4,5,6,0,7,8]);
  assert.deepEqual(slide([1,2,3,4,5,6,7,8,0], 3, 2), [1,2,0,4,5,3,7,8,6]);
  const board = solvedCells(3, 3);
  for (const from of [0,1,3,4,8,-1,9,1.5]) assert.equal(slide(board,3,from), board);
});
test("25 种长宽的 50 步打乱均合法、不直接反向、未完成且可完整还原", () => {
  let seed = 9823;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let rows = 2; rows <= 6; rows++) for (let cols = 2; cols <= 6; cols++) {
    const { cells, moves } = scramble(rows, cols, random);
    assert.equal(moves.length,50); assert.equal(isSolved(cells),false);
    let replay = solvedCells(rows, cols);
    moves.forEach((step, index) => {
      assert.equal(step.empty,replay.indexOf(0));
      assert.ok(movable(replay,cols,step.from));
      if(index) assert.notEqual(step.from,moves[index-1].empty);
      replay=slide(replay,cols,step.from);
    });
    assert.deepEqual(replay,cells);
    for (const step of [...moves].reverse()) replay=slide(replay,cols,step.empty);
    assert.deepEqual(replay,solvedCells(rows,cols));
  }
});
test("旧版 200 步存档继续读取并保留玩家的撤销历史", () => {
  let legacy = createPuzzle(3, 4);
  for (let i = legacy.shuffle.length; i < 200; i++) {
    const empty = legacy.cells.indexOf(0);
    const from = legacy.cells.findIndex((_, index) => movable(legacy.cells, legacy.cols, index));
    legacy = { ...legacy, cells: slide(legacy.cells, legacy.cols, from), shuffle: [...legacy.shuffle, { from, empty }] };
  }
  const initial = [...legacy.cells];
  legacy = play(legacy, legacy.cells.findIndex((_, index) => movable(legacy.cells, legacy.cols, index)));
  const restored = parsePuzzle(JSON.parse(JSON.stringify(legacy)));
  assert.equal(restored.shuffle.length, 200);
  assert.deepEqual(undo(restored).cells, initial);
});
test("矩形棋盘多次滑动与撤销、序列化后继续撤销均精确恢复", () => {
  const initial = createPuzzle(3,5);
  let p = initial;
  for(let i=0;i<40;i++) p=play(p,p.cells.findIndex((_,index)=>movable(p.cells,p.cols,index)));
  const count=p.history.length;
  p=parsePuzzle(JSON.parse(JSON.stringify(p)));
  for(let i=0;i<count;i++) p=undo(p);
  assert.deepEqual(p.cells,initial.cells); assert.equal(p.history.length,0);
  assert.equal(undo(p),p);
});
test("还原后记录完成；撤销完成步仍可再还原，完成标记不会重复创建", () => {
  let p=createPuzzle(2,3);
  for(const step of [...p.shuffle].reverse()) {
    p=play(p,step.empty);
    if(isSolved(p.cells)) break;
  }
  assert.ok(isSolved(p.cells)); assert.ok(p.completedAt);
  const completedAt=p.completedAt, last=p.history.at(-1)!;
  p=undo(p); assert.equal(isSolved(p.cells),false);
  p=play(p,last.from);
  assert.ok(isSolved(p.cells)); assert.equal(p.completedAt,completedAt);
  assert.deepEqual(parsePuzzle(JSON.parse(JSON.stringify(p))),p);
});
test("空数据、损坏数据、未来版本与非法设置都不会被误用", () => {
  for(const value of [null, {}, {schemaVersion:2}, [], "bad"]) assert.throws(()=>parsePuzzle(value));
  assert.throws(()=>createPuzzle(1,3)); assert.throws(()=>createPuzzle(3,7));
  const p=createPuzzle(3,3);
  for(const patch of [{cells:[]},{cells:[...p.cells].reverse()},{cropX:NaN},{imageId:"missing"},{history:[{from:0,empty:-1}]},{shuffle:[]}])
    assert.throws(()=>parsePuzzle({...p,...patch}));
});
test("浏览器写入失败保留旧档、重试成功、其他页面更新拒绝覆盖", () => {
  let raw:string|null=null, fail=false;
  const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{if(fail) throw new Error("quota");raw=value;}};
  assert.equal(readPuzzle(storage).puzzle,null);
  const p=createPuzzle(3,3), first=savePuzzle(storage,p,null);
  fail=true; assert.throws(()=>savePuzzle(storage,{...p,updatedAt:new Date().toISOString()},first));
  assert.equal(raw,first);
  fail=false; assert.equal(savePuzzle(storage,p,first),first);
  raw="another-tab"; assert.throws(()=>savePuzzle(storage,p,first),PuzzleConflict); assert.equal(raw,"another-tab");
  assert.throws(()=>readPuzzle(storage)); assert.equal(raw,"another-tab");
  savePuzzle(storage,p,null,true); assert.deepEqual(readPuzzle(storage).puzzle,p);
});
