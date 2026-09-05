import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LEVELS, THEMES, generatePuzzle, generateStory, makeGame, solve, act, publicGame } from './engine.mjs';
import { Store, validateState, atomicWrite } from './store.mjs';
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
    const story = generateStory(theme.id, n, seed); assert.equal(story.rows.length, n);
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
  if(duplicate){ act(g,{type:'set',index:i,value:duplicate}); assert(publicGame(g).conflicts.includes(i)); }
  for (let j=0;j<g.cells.length;j++) if(!g.given[j]) result=act(g,{type:'set',index:j,value:g.solution[j]});
  assert.equal(result.completed,true); assert(publicGame(g).story.rows.every(r=>r.complete));
  assert(!('solution' in publicGame(g))); assert(!('undo' in publicGame(g)));
  assert.deepEqual(publicGame(g).story.rows.map(r=>r.pieces.join('')),g.story.rows.map(r=>r.join('')));
});
async function fixture(fn) { const dir=await mkdtemp(join(tmpdir(),'sudoku-test-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});} }
const command = (s,body)=>({revision:s.state.revision,operationId:randomUUID(),gameId:s.state.game?.id,...body});
test('自动保存恢复、六档双币结算与幂等重试',()=>fixture(async dir=>{
  const s=new Store(dir);await s.load();assert.equal(s.view().game,null);let knowledge=0,energy=0;
  for(let level=0;level<6;level++){
    await s.mutate(command(s,{type:'new',level,theme:THEMES[level%5].id}));let last;
    for(let i=0;i<s.state.game.cells.length;i++)if(!s.state.game.given[i]){last=command(s,{type:'set',index:i,value:s.state.game.solution[i]});await s.mutate(last);}
    knowledge+=LEVELS[level].knowledge;energy+=LEVELS[level].energy;assert.deepEqual(s.view().wallet,{knowledge,energy});
    await s.mutate(last);await s.mutate(command(s,{type:'undo'}));assert.deepEqual(s.view().wallet,{knowledge,energy});
  }
  const restored=new Store(dir);await restored.load();assert.deepEqual(restored.view().wallet,{knowledge,energy}); assert.equal(restored.view().history.length,6);validateState(restored.state);
}));
test('写入失败不改变进度与奖励，相同请求重试成功',()=>fixture(async dir=>{
  let fail=false;const s=new Store(dir,async(p,d)=>{if(fail)throw Error('disk full');await atomicWrite(p,d);});await s.load();
  await s.mutate(command(s,{type:'new',level:0,theme:'gems'}));
  const blanks=s.state.game.given.flatMap((v,i)=>v?[]:[i]);for(const i of blanks.slice(0,-1))await s.mutate(command(s,{type:'set',index:i,value:s.state.game.solution[i]}));
  const i=blanks.at(-1),body=command(s,{type:'set',index:i,value:s.state.game.solution[i]}),before=structuredClone(s.state);fail=true;
  await assert.rejects(s.mutate(body),/保存/);assert.deepEqual(s.state,before);fail=false;await s.mutate(body);assert.equal(s.state.wallet.knowledge,5);await s.mutate(body);assert.equal(s.state.wallet.knowledge,5);
}));
test('并发不同请求拒绝过期版本，相同请求不重复处理',()=>fixture(async dir=>{
  const s=new Store(dir);await s.load();const a=command(s,{type:'new',level:0,theme:'gems'}), b=command(s,{type:'new',level:1,theme:'letters'});
  const results=await Promise.allSettled([s.mutate(a),s.mutate(a),s.mutate(b)]);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'fulfilled');assert.equal(results[2].status,'rejected');assert.equal(s.state.revision,1);
}));
test('非法文件与未知版本不覆盖原数据，非法操作拒绝',()=>fixture(async dir=>{
  const path=join(dir,'progress.v1.json');for(const content of ['broken',JSON.stringify({schemaVersion:99})]){await writeFile(path,content);await assert.rejects(new Store(dir).load());assert.equal(await readFile(path,'utf8'),content);}
  const s=new Store(join(dir,'valid'));await s.load();await assert.rejects(s.mutate(command(s,{type:'new',level:88,theme:'gems'})));
  assert.throws(()=>validateState({...s.state,schemaVersion:0}));assert.equal(s.state.game,null);
}));
