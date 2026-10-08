import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, platformY, safeGap } from './generator';
import { newGame, resetStage, tick, hurt, reroute, nextStage, earn } from './engine';
import { EMPTY_INPUT, PHYSICS, type Scene } from './model';
import { parseGame, SeaKidStore, SAVE_KEY } from './persistence';

test('fractional generation respects unbuffed reach at both lift extremes across 1800 routes',()=>{
  let fractional=0,moving=0;
  for(const world of [1,2,3,4,8,9,16,40,100,10000])for(const scene of [0,1,2] as Scene[])for(let seed=0;seed<60;seed++){
    const l=generateLevel(world,scene,seed);
    assert.equal(l.platforms.at(-1)!.x+l.platforms.at(-1)!.w,PHYSICS.length);
    for(let i=1;i<l.platforms.length;i++){
      const a=l.platforms[i-1],b=l.platforms[i],gap=b.x-a.x-a.w;
      assert.ok(gap<=safeGap(a,b)+.11,`unreachable world=${world} scene=${scene} seed=${seed} gap=${gap}`);
      assert.ok(b.w>=120);
      if(!Number.isInteger(b.x))fractional++;
      if(['rise','sink','fall'].includes(b.kind)){assert.ok(world>8);moving++;}
      if(world<=3)assert.ok(gap<=(scene===1?5.1:.01));
      if(scene===2&&world<8&&b.x>=PHYSICS.length-PHYSICS.arena)assert.ok(gap<=.01);
    }
  }
  assert.ok(fractional>100&&moving>100);
});
test('seeds reproduce terrain; same difficulty yields distinct layouts',()=>{
  assert.deepEqual(generateLevel(16,1,10),generateLevel(16,1,10));
  assert.notDeepEqual(generateLevel(16,1,10).platforms,generateLevel(16,1,11).platforms);
  assert.throws(()=>generateLevel(NaN,0,1));
});
test('basic sprint jumps genuinely cross generated difficult gaps with fixed-step physics',()=>{
  for(let seed=0;seed<15;seed++){
    const g=newGame(seed,'test');g.level=generateLevel(40,1,seed);g.level.enemies=[];g.level.traps=[];g.level.pickups=[];resetStage(g,true);
    for(let frame=0;frame<120*110&&g.phase==='playing';frame++){
      const p=g.player,ground=p.grounded===null?null:g.level.platforms[p.grounded];
      const jump=!!ground&&p.x+PHYSICS.width>ground.x+ground.w-42;
      tick(g,{...EMPTY_INPUT,right:true,run:true,jump},1/120);
    }
    assert.equal(g.phase,'settlement',`base hero failed generated route seed=${seed} at ${g.player.x}`);
  }
});
test('damage weakens two tiers, leaves weapon invincible, and pushers displace without direct death',()=>{
  const g=newGame(1,'test');g.player.weapon='firewheel';g.player.tier=2;
  hurt(g,200);assert.equal(g.player.tier,1);assert.ok(g.player.vx<0);hurt(g,200);assert.equal(g.player.tier,1);
  g.player.invulnerable=0;hurt(g,200);assert.equal(g.player.tier,0);
  g.player.invulnerable=0;g.player.vx=0;hurt(g,200);assert.equal(g.player.vx,0);assert.equal(g.phase,'playing');
  hurt(g,200,true);assert.ok(g.player.vx<0);assert.equal(g.phase,'playing');
});
test('ring rescues one sea fall only; death keeps route and score but clears equipment',()=>{
  const g=newGame(1,'test');g.level=generateLevel(4,1,1);resetStage(g,true);g.player.ring=true;g.player.weapon='firewheel';g.player.y=660;g.player.grounded=null;
  tick(g,EMPTY_INPUT,1/120);assert.equal(g.player.ring,false);assert.equal(g.phase,'playing');assert.equal(g.player.weapon,'firewheel');
  const original=JSON.stringify(g.level.platforms);g.farthest=900;g.score=300;g.player.y=660;g.player.grounded=null;tick(g,EMPTY_INPUT,1/120);assert.equal(g.phase,'dead');
  for(let n=0;n<100;n++)tick(g,EMPTY_INPUT,1/120);
  assert.equal(g.player.weapon,'none');assert.equal(g.farthest,900);assert.equal(g.score,300);assert.equal(JSON.stringify(g.level.platforms),original);
  g.level=generateLevel(8,2,3);resetStage(g,true);g.player.ring=true;g.player.y=660;g.player.grounded=null;tick(g,EMPTY_INPUT,1/120);assert.equal(g.phase,'dead');
});
test('route changes preserve both scores, stage progression adds only one route length',()=>{
  const g=newGame(1,'test');g.farthest=2000;earn(g,'p1',100);earn(g,'p1',100);assert.equal(g.score,100);
  g.player.tier=2;g.player.weapon='hammer';reroute(g,2);assert.equal(g.score,100);assert.equal(g.farthest,2000);assert.equal(g.player.tier,2);
  nextStage(g);assert.equal(g.completedDistance,PHYSICS.length);assert.equal(g.farthest,0);assert.equal(g.level.scene,1);
  nextStage(g);nextStage(g);assert.equal(g.level.scene,0);assert.equal(g.level.world,2);
});
test('boss arena locks and supplies a weapon, eight bosses rotate; collapse resets',()=>{
  const g=newGame(1,'test');g.level=generateLevel(9,2,33);resetStage(g,true);
  assert.equal(g.boss.kind,0);const start=PHYSICS.length-PHYSICS.arena;
  assert.ok(g.level.pickups.some(p=>p.kind==='hammer'&&p.x>start));
  g.player.x=start+30;tick(g,EMPTY_INPUT,1/120);assert.equal(g.boss.active,true);
  for(let i=0;i<120;i++)tick(g,{...EMPTY_INPUT,left:true},1/120);assert.ok(g.player.x>=start);
  const fall={id:1,x:0,y:430,w:150,kind:'fall' as const,amplitude:0,phase:0,period:4};
  assert.equal(platformY(fall,.5,{'1':0}),430);assert.ok(platformY(fall,2,{'1':0})>700);assert.equal(platformY(fall,5,{'1':0}),430);
});
test('saved game validates, resumes identical geometry, invalid/future data never overwrites',()=>{
  const memory=new Map<string,string>();const port={getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,v:string)=>{memory.set(key,v);}};
  const s=new SeaKidStore(port);assert.equal(s.load(),null);const g=newGame(13,'test');s.save(g);
  const loaded=new SeaKidStore(port).load()!;assert.deepEqual(loaded,g);
  assert.throws(()=>parseGame({...g,player:{...g.player,x:NaN}}));
  assert.throws(()=>parseGame({...g,level:{...g.level,platforms:[]}}));
  assert.throws(()=>parseGame({...g,schemaVersion:2}));
  for(const raw of ['broken',JSON.stringify({...g,schemaVersion:2})]){
    memory.set(SAVE_KEY,raw);const bad=new SeaKidStore(port);assert.throws(()=>bad.load());assert.throws(()=>bad.save(g));assert.equal(memory.get(SAVE_KEY),raw);
  }
});
test('write failures and concurrent tabs preserve last valid snapshot',()=>{
  let raw:string|null=null;let fail=false;const port={getItem:()=>raw,setItem:(_key:string,v:string)=>{if(fail)throw new Error('quota');raw=v;}};
  const s=new SeaKidStore(port);s.load();const g=newGame(3,'test');s.save(g);const old=raw;const revision=g.revision;
  fail=true;g.score=5;assert.throws(()=>s.save(g));assert.equal(raw,old);assert.equal(g.revision,revision);
  fail=false;s.save(g);const another=new SeaKidStore(port);const copy=another.load()!;copy.score=77;another.save(copy);const otherRaw=raw;
  assert.throws(()=>s.save(g));assert.equal(raw,otherRaw);
});

test('all eight bosses can be defeated with the base hammer, preserving automatic stage progression',()=>{
  for(let world=1;world<=8;world++){
    const g=newGame(world,'boss-test');g.level=generateLevel(world,2,world);resetStage(g,true);
    const floor=g.level.platforms.at(-1)!;
    g.player.x=floor.x+Math.max(30,floor.w/2-100);g.player.y=floor.y-PHYSICS.height;g.player.grounded=floor.id;g.player.weapon='hammer';g.boss.active=true;
    for(let frame=0;frame<120*90&&g.phase==='playing';frame++)tick(g,{...EMPTY_INPUT,attack:true},1/120);
    assert.equal(g.phase,'settlement',`boss ${world} remained hp=${g.boss.hp}`);
    assert.ok(g.score>=1000+world*100);
    for(let frame=0;frame<240;frame++)tick(g,EMPTY_INPUT,1/120);
    assert.equal(g.level.world,world+1);assert.equal(g.level.scene,0);
    assert.equal(g.player.weapon,'hammer');
  }
});
