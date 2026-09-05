import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { solve, choices, LEVELS, THEMES } from './engine.mjs';
import { candidateNotes } from './art.mjs';
test('候选摘要使用剩余图案，不退回数字编号', () => {
  for (const theme of THEMES) {
    const markup=candidateNotes(theme.id,[2,4],4);
    assert.deepEqual([...markup.matchAll(/symbol-(\d+)\.png/g)].map(m=>Number(m[1])),[2,4]);
    assert.equal(markup.replace(/<[^>]*>/g,''),'?');
  }
  const many=candidateNotes('crew',[1,2,3,4,5,6,7,8,9],9);
  assert.equal((many.match(/<img /g)||[]).length,3);
  assert(many.includes('…'));
  assert(candidateNotes('gems',[],4).includes('请恢复'));
});
test('独立 HTTP 服务：资源、非法请求、开局、通关、奖励幂等与重启恢复', async () => {
  const dir=await mkdtemp(join(tmpdir(),'sudoku-http-test-')), port=14317;
  let child;
  async function start(){child=spawn(process.execPath,[new URL('./server.mjs',import.meta.url).pathname],{env:{...process.env,PORT:String(port),SUDOKU_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('test server exited');})]);}
  async function stop(){const stopped=once(child,'exit');child.kill('SIGTERM');await stopped;}
  const base=`http://127.0.0.1:${port}`;
  const get=async()=>{const response=await fetch(`${base}/api/state`);assert.equal(response.status,200);return response.json();};
  const post=async body=>{const response=await fetch(`${base}/api/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:response.status,data:await response.json()};};
  try{
    await start();
    for(const path of ['/','/app.mjs','/style.css','/art.mjs','/engine.mjs']){const r=await fetch(base+path);assert.equal(r.status,200);assert((await r.text()).length>500);}
    for(const theme of THEMES){
      const paths=[`/assets/v2/backgrounds/${theme.id}.png`,...Array.from({length:9},(_,i)=>`/assets/v2/icons/${theme.id}/symbol-0${i+1}.png`)];
      for(const path of paths){const r=await fetch(base+path);assert.equal(r.status,200,path);assert.match(r.headers.get('content-type'),/^image\/png/);assert.deepEqual(new Uint8Array(await r.arrayBuffer()).slice(0,8),new Uint8Array([137,80,78,71,13,10,26,10]));}
    }
    for(const path of ['/assets/v2/icons/gems/symbol-10.png','/assets/v2/icons/unknown/symbol-01.png','/assets/source-v2/prompts.json']) assert.equal((await fetch(base+path)).status,404);
    assert.equal((await fetch(base+'/store.mjs')).status,404);
    assert.equal((await post({type:'new',level:0,theme:'gems'})).status,400);
    assert.equal((await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:'{}'})).status,403);
    let state=await get();assert.equal(state.game,null);
    const newBody={type:'new',level:0,theme:'gems',revision:state.revision,operationId:randomUUID()};
    state=(await post(newBody)).data;assert.equal(state.game.given.filter(Boolean).length,10);assert(!('solution' in state.game));
    const blank=state.game.given.findIndex(v=>!v), savedBeforeHint=await readFile(join(dir,'progress.v1.json'),'utf8');
    const hint=(await post({type:'hint',index:blank,revision:state.revision,gameId:state.game.id,operationId:randomUUID()})).data;
    assert.deepEqual(hint.hintValues,choices(state.game.cells.map(c=>c.value),blank,LEVELS[0]));
    assert.equal(hint.revision,state.revision);assert.deepEqual(hint.game,state.game);
    assert.equal(await readFile(join(dir,'progress.v1.json'),'utf8'),savedBeforeHint);
    const solution=solve(state.game.given,LEVELS[0],1).first;let last;
    for(let i=0;i<16;i++)if(!state.game.given[i]){last={type:'set',index:i,value:solution[i],revision:state.revision,gameId:state.game.id,operationId:randomUUID()};const response=await post(last);assert.equal(response.status,200);state=response.data;}
    assert.deepEqual(state.wallet,{knowledge:5,energy:2});assert(state.game.completedAt);assert(state.game.story.rows.every(r=>r.complete));
    assert.deepEqual((await post(last)).data.wallet,state.wallet);
    assert.equal((await post({...last,operationId:randomUUID()})).status,409);
    await stop();await start();assert.deepEqual((await get()).wallet,{knowledge:5,energy:2});
  }finally{if(child?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
