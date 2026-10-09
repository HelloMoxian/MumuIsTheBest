import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { GameTopBar } from '../../shared/GameTopBar';
import { useGameFullscreen } from '../../shared/useGameFullscreen';
import { registerGameControls } from '../../shared/controllers/registry';
import { useGameControllers } from '../../shared/controllers/useGameControllers';
import { ControllerSetup } from '../../shared/controllers/ControllerSetup';
import { newGame, reroute, tick } from './engine';
import { BOSSES, EMPTY_INPUT, SCENES, type Game, type Input } from './model';
import { SAVE_KEY, SeaKidStore } from './persistence';
import { SeaKidRenderer } from './renderer';
import { effectsFor } from './effects';
import './sea-kid.css';

const CONTROLS = registerGameControls({ id: 'sea-kid', label: '跳海小孩', maxPlayers: 1, actions: [
  { id: 'left', label: '向左', description: '按住向左移动', direction: 'left', defaults: [{kind:'button',index:14},{kind:'axis',index:0,direction:-1}] },
  { id: 'right', label: '向右', description: '按住向右移动', direction: 'right', defaults: [{kind:'button',index:15},{kind:'axis',index:0,direction:1}] },
  { id: 'jump', label: '跳跃', description: '按一下跳一次', defaults: [{kind:'button',index:0}] },
  { id: 'attack', label: '攻击', description: '按住连续投掷', defaults: [{kind:'button',index:2}] },
  { id: 'run', label: '加速', description: '按住跑得更快、跳得更远', defaults: [{kind:'button',index:5}] },
  { id: 'pause', label: '暂停', description: '休息后继续', defaults: [{kind:'button',index:9}] },
] });
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
type Summary = { world: number; scene: number; score: number; distance: number; percent: number; deaths: number; phase: Game['phase']; settlementReady: boolean; stageScore: number; boss: number; bossHp: number; bossMax: number; weapon: string; tier: number; ring: boolean; scooter: boolean };
function summarize(g: Game): Summary { return { world:g.level.world,scene:g.level.scene,score:g.score,distance:Math.floor((g.completedDistance+g.farthest)/32),percent:g.farthest/g.level.length*100,deaths:g.deaths,phase:g.phase,settlementReady:!effectsFor(g).defeats.some(d=>d.sprite.startsWith('boss-')&&d.age<1.1),stageScore:g.score-g.stageScore,boss:g.boss.active?g.boss.kind:-1,bossHp:Math.max(0,g.boss.hp),bossMax:g.boss.maxHp,weapon:g.player.weapon,tier:g.player.tier,ring:g.player.ring,scooter:g.player.scooter }; }
export function SeaKidGame() {
  const root=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),dialog=useRef<HTMLDialogElement>(null);
  const fullscreen=useGameFullscreen(root);
  const game=useRef<Game|null>(null),store=useRef<SeaKidStore|null>(null),renderer=useRef<SeaKidRenderer|null>(null);
  const held=useRef(new Set<string>()),pausedRef=useRef(true),alive=useRef(true);
  const [summary,setSummary]=useState<Summary|null>(null),[paused,setPaused]=useState(true),[ready,setReady]=useState(false);
  const [error,setError]=useState(''),[assetNotice,setAssetNotice]=useState(''),[settings,setSettings]=useState(false),[loadAttempt,setLoadAttempt]=useState(0);
  const [confirm,setConfirm]=useState<'route'|'restart'|null>(null),[resumed,setResumed]=useState(false);
  const save=useCallback(()=>{
    if(!game.current||!store.current)return;
    try{store.current.save(game.current);if(alive.current)setError('');}
    catch{if(alive.current){setError('进度暂未保存，或另一窗口更新了存档。请重试保存；有冲突时重新载入。');setPaused(true);}pausedRef.current=true;held.current.clear();}
  },[]);
  const pause=useCallback((value:boolean)=>{pausedRef.current=value;setPaused(value);held.current.clear();if(value)save();else canvas.current?.focus({preventScroll:true});},[save]);
  const controllers=useGameControllers(CONTROLS,{enabled:ready&&!paused,editing:settings,onDisconnect:()=>pause(true),onActions:events=>{
    for(const event of events){if(event.action==='pause'&&event.type==='press'){pause(!pausedRef.current);continue;}const key=`pad:${event.action}`;if(event.type==='release')held.current.delete(key);else held.current.add(key);}
  }});
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    let cancelled=false;setReady(false);setError('');game.current=null;
    try{const nextStore=new SeaKidStore(window.localStorage);const old=nextStore.load();store.current=nextStore;game.current=old??newGame(randomSeed(),crypto.randomUUID());setResumed(!!old);setSummary(summarize(game.current));}
    catch{setError('无法读取存档，原记录已保留。可以备份原存档或重新载入。');return;}
    const art=new SeaKidRenderer();renderer.current=art;
    void art.load().then(()=>{if(cancelled)return;setReady(true);setAssetNotice(art.missing?'部分图片未加载，已使用替代图形。刷新可重试。':'');if(game.current&&canvas.current)art.draw(canvas.current,game.current,window.matchMedia('(prefers-reduced-motion: reduce)').matches);save();});
    return()=>{cancelled=true;};
  },[loadAttempt,save]);
  useEffect(()=>{
    if(!ready)return;
    let frame=0,previous=performance.now(),accumulator=0,lastSave=previous,lastSummary=previous;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const run=(now:number)=>{
      const delta=Math.min(.1,(now-previous)/1000);previous=now;
      const g=game.current;
      if(g&&renderer.current&&canvas.current){
        if(!pausedRef.current){
          accumulator+=delta;const input:Input={...EMPTY_INPUT};
          for(const key of held.current){const action=key.slice(key.lastIndexOf(':')+1) as keyof Input;if(action in input)input[action]=true;}
          const oldPhase=g.phase,oldStage=`${g.level.world}:${g.level.scene}`;
          while(accumulator>=1/120){tick(g,input,1/120);accumulator-=1/120;}
          if(oldPhase!==g.phase||oldStage!==`${g.level.world}:${g.level.scene}`){save();held.current.clear();}
        }else accumulator=0;
        renderer.current.draw(canvas.current,g,reduced.matches);
        if(now-lastSummary>100){setSummary(summarize(g));lastSummary=now;}
        if(!pausedRef.current&&now-lastSave>1800){save();lastSave=now;}
      }
      frame=requestAnimationFrame(run);
    };
    frame=requestAnimationFrame(run);return()=>cancelAnimationFrame(frame);
  },[ready,save]);
  useEffect(()=>{
    const mapping:Record<string,keyof Input>={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',Space:'jump',KeyZ:'jump',KeyK:'jump',KeyJ:'attack',KeyX:'attack',ShiftLeft:'run',ShiftRight:'run'};
    const down=(e:KeyboardEvent)=>{
      if(e.metaKey||e.ctrlKey||e.altKey||dialog.current?.open)return;
      if(e.code==='Escape'||e.code==='KeyP'){if(!e.repeat&&game.current){e.preventDefault();pause(!pausedRef.current);}return;}
      if(pausedRef.current)return;
      if(e.target instanceof HTMLElement&&(/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)||e.target.isContentEditable))return;
      const action=mapping[e.code];if(action){e.preventDefault();held.current.add(`key:${e.code}:${action}`);}
    };
    const up=(e:KeyboardEvent)=>{const action=mapping[e.code];if(action)held.current.delete(`key:${e.code}:${action}`);};
    const blur=()=>{if(game.current)pause(true);};
    const visibility=()=>{if(document.hidden)blur();};
    const storageChanged=(e:StorageEvent)=>{if(e.key===SAVE_KEY){pausedRef.current=true;held.current.clear();setPaused(true);setError('另一窗口更新了进度，请重新载入后继续。');}};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);window.addEventListener('pagehide',blur);window.addEventListener('storage',storageChanged);document.addEventListener('visibilitychange',visibility);
    return()=>{save();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);window.removeEventListener('pagehide',blur);window.removeEventListener('storage',storageChanged);document.removeEventListener('visibilitychange',visibility);};
  },[pause,save]);
  useEffect(()=>{if(settings||confirm)dialog.current?.showModal();else dialog.current?.close();},[settings,confirm]);
  const touch=(action:keyof Input,event:PointerEvent<HTMLButtonElement>,pressed:boolean)=>{
    event.preventDefault();if(pressed){event.currentTarget.setPointerCapture(event.pointerId);held.current.add(`touch:${event.pointerId}:${action}`);}else held.current.delete(`touch:${event.pointerId}:${action}`);
  };
  const apply=()=>{
    if(!game.current)return;
    if(confirm==='route')reroute(game.current,randomSeed());
    if(confirm==='restart')game.current=newGame(randomSeed(),crypto.randomUUID());
    setSummary(summarize(game.current));setConfirm(null);save();
  };
  const download=()=>{
    try{const raw=window.localStorage.getItem(SAVE_KEY);if(!raw)return;const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`sea-kid-backup-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setError('浏览器暂时无法读取原存档。');}
  };
  return <div ref={root} className={`sea-kid ${fullscreen.focused?'sea-kid--fullscreen':''}`} data-gamepad-native={ready&&!paused?'playing':undefined} data-skip-startup-greeting>
    <GameTopBar title="跳海小孩" wallets={false} controls={<>
      <button disabled={!ready||(paused&&!!error)} data-gamepad-pause onClick={()=>pause(!paused)}> {paused?'继续':'暂停'} </button>
      <button disabled={!ready||!!error} onClick={()=>{pause(true);setConfirm('route');}}>换个路线</button>
      <button disabled={!ready||!!error} onClick={()=>{pause(true);setConfirm('restart');}}>重新开始</button>
      <button onClick={()=>{pause(true);setSettings(true);}}>操作</button>
      <button data-fullscreen-exit disabled={fullscreen.switching} onClick={()=>void(fullscreen.focused?fullscreen.leave():fullscreen.enter())}>{fullscreen.focused?'退出全屏':'全屏'}</button>
    </>}/>
    {error&&<div className="sea-kid__error" role="alert">{error}<button onClick={save} disabled={!game.current}>重试保存</button><button onClick={()=>{pause(true);setLoadAttempt(v=>v+1);}}>重新载入</button><button onClick={download}>备份原存档</button></div>}
    <main className="sea-kid__main">
      <div className="sea-kid__hud">
        <strong>第 {summary?.world??1} 大关 · {SCENES[summary?.scene??0]}</strong>
        <span>得分 <b>{summary?.score??0}</b></span><span>最远距离 <b>{summary?.distance??0}</b></span>
        <div className="sea-kid__progress" role="progressbar" aria-label="当前小关最远进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(summary?.percent??0)}><i style={{width:`${summary?.percent??0}%`}}/></div>
      </div>
      <div className="sea-kid__viewport">
        <canvas ref={canvas} tabIndex={0} width={1280} height={640} aria-label="跳海小孩游戏画面。左右移动，空格跳跃，J 攻击，Shift 加速，P 暂停。"/>
        {summary&&summary.boss>=0&&summary.phase==='playing'&&<div className="sea-kid__boss"><span>{BOSSES[summary.boss]} {summary.bossHp} / {summary.bossMax}</span><meter min={0} max={summary.bossMax} value={summary.bossHp}/></div>}
        {(!ready||paused||(summary?.phase==='settlement'&&summary.settlementReady)||summary?.phase==='dead')&&<div className="sea-kid__overlay">
          {!ready?<strong>{error?'原存档已保留':'正在准备小岛…'}</strong>:paused?<><h1>{resumed?'继续小岛冒险':'准备好出发了吗？'}</h1><p>左右移动 · 空格跳跃 · J 攻击 · 按住 Shift 加速</p><button className="sea-kid__start" disabled={!!error} onClick={()=>{setResumed(true);pause(false);}}>开始冒险</button></>:summary?.phase==='settlement'?<><h2>小关完成！</h2><p>本小关 +{summary.stageScore} 分 · 正在前往下一站</p></>:<><h2>再试一次</h2><p>回到这一小关开头 · 路线不变</p></>}
        </div>}
      </div>
      <div className="sea-kid__bottom"><span>{summary?.weapon==='none'?'向前找到锤子':summary?.weapon==='firewheel'?'风火轮':'锤子'}{summary?.tier?' · 药水强化':''}{summary?.scooter?' · 滑板车':''}{summary?.ring?' · 泳圈保护':''}</span><span>只有落海、掉坑才会重来 · 无限尝试</span></div>
      {assetNotice&&<p role="status">{assetNotice}</p>}
      <div className="sea-kid__touch" aria-label="屏幕操作">
        {([['left','向左'],['right','向右'],['run','加速'],['attack','攻击'],['jump','跳跃']] as const).map(([action,label])=><button key={action} disabled={!ready||paused} onPointerDown={e=>touch(action,e,true)} onPointerUp={e=>touch(action,e,false)} onPointerCancel={e=>touch(action,e,false)} onLostPointerCapture={e=>touch(action,e,false)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();held.current.add(`button:${action}`);}}} onKeyUp={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();held.current.delete(`button:${action}`);}}} onBlur={()=>held.current.delete(`button:${action}`)}>{label}</button>)}
      </div>
    </main>
    <dialog ref={dialog} className="sea-kid__dialog" onCancel={()=>{setSettings(false);setConfirm(null);}}>
      {settings?<><h2>操作</h2><p>方向键 / A、D 移动；空格 / K / Z 跳跃；J / X 攻击；Shift 加速；P 暂停。</p><p>药水先提高跳跃，再提高速度。泳圈只抵消一次落海。带箭头的是升降平台，裂纹平台踩上后会掉落。</p><ControllerSetup definition={CONTROLS} session={controllers} lockPlayerCount/><button onClick={()=>setSettings(false)}>返回游戏</button></>:<><h2>{confirm==='route'?'换一条路线？':'从第一关重新开始？'}</h2><p>{confirm==='route'?'回到当前小关开头，保留装备、得分和最远距离。':'清空本轮成绩与装备，从第一大关重新出发。'}</p><button onClick={apply}>确定</button><button onClick={()=>setConfirm(null)}>取消</button></>}
    </dialog>
  </div>;
}
