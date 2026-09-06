// Browser-safe v2 choreography. Old plans are frozen in workout-v1.ts.
export const WORKOUT_MS = 300_000;
export const WORKOUT_REWARD = 200;
export const MOVES = [
  { id:"march", name:"原地踏步", cue:"一二一，手脚一起摆起来！", intensity:1, reps:20, seconds:.6, jump:false, advanced:false },
  { id:"step", name:"左右点步", cue:"左边点一点，右边点一点！", intensity:1, reps:12, seconds:.8, jump:false, advanced:false },
  { id:"heels", name:"踮脚长高", cue:"踮起来，轻轻落下来！", intensity:1, reps:10, seconds:1.2, jump:false, advanced:false },
  { id:"reach", name:"伸手摘星", cue:"向上摘星星，再收回来！", intensity:1, reps:10, seconds:1.2, jump:false, advanced:false },
  { id:"tap", name:"脚跟点地", cue:"脚跟往前点，左右换一换！", intensity:1, reps:12, seconds:.8, jump:false, advanced:false },
  { id:"arms", name:"小鸟开合臂", cue:"翅膀打开，再抱一抱！", intensity:1, reps:12, seconds:1, jump:false, advanced:false },
  { id:"knees", name:"交替抬膝", cue:"抬起膝盖，换另一边！", intensity:2, reps:12, seconds:.8, jump:false, advanced:false },
  { id:"squat", name:"蹲起", cue:"屁股向后坐，站起来！", intensity:3, reps:8, seconds:1.8, jump:false, advanced:false },
  { id:"side", name:"小树侧伸展", cue:"左边伸一伸，右边伸一伸！", intensity:1, reps:8, seconds:1.5, jump:false, advanced:false },
  { id:"cross", name:"交叉碰膝", cue:"小手找对面膝盖，换一边！", intensity:2, reps:12, seconds:.9, jump:false, advanced:false },
  { id:"jack", name:"开合跳", cue:"双脚跳开，头顶拍手！合拢，再来！", intensity:3, reps:10, seconds:1.2, jump:true, advanced:false },
  { id:"hop", name:"轻轻小跳", cue:"像小兔一样，轻轻弹起来！", intensity:3, reps:10, seconds:.8, jump:true, advanced:false },
  { id:"room-run", name:"客厅跑到姥姥屋", cue:"出发！从客厅跑到姥姥屋！到达后慢慢回到屏幕前。", intensity:2, reps:1, seconds:10, jump:false, advanced:false },
  { id:"high-run", name:"原地高抬腿跑", cue:"膝盖抬高，跑起来！", intensity:3, reps:30, seconds:.4, jump:false, advanced:false },
  { id:"pushup", name:"俯卧撑", cue:"小手撑稳，身体一起下、一起上。也可以膝盖着地！", intensity:3, reps:10, seconds:2, jump:false, advanced:true },
  { id:"burpee", name:"波比跳", cue:"蹲下撑地，脚向后，再收回来，起身小跳！", intensity:3, reps:3, seconds:4, jump:true, advanced:true },
  { id:"situp", name:"仰卧起坐", cue:"屈膝躺好，手放胸前，起身再慢慢躺下！", intensity:3, reps:6, seconds:2.4, jump:false, advanced:true },
  { id:"punch", name:"超级英雄出拳", cue:"左一拳，右一拳，前面留出空位！", intensity:2, reps:16, seconds:.6, jump:false, advanced:false },
  { id:"skate", name:"小企鹅滑步", cue:"左右迈小步，像小企鹅滑冰！", intensity:2, reps:12, seconds:.9, jump:false, advanced:false },
] as const;
export type MoveId = typeof MOVES[number]["id"];
export const DEFAULT_MOVES: MoveId[] = MOVES.filter(m=>!m.advanced && m.id!=="hop").map(m=>m.id);
export const moveById = (id: MoveId) => MOVES.find(m=>m.id===id)!;
export function validPool(raw: unknown): raw is MoveId[] {
  return Array.isArray(raw) && raw.length>0 && raw.length<=MOVES.length
    && new Set(raw).size===raw.length && raw.every(id=>MOVES.some(m=>m.id===id));
}
export type WorkoutSettings = { restSeconds:number; pushupRestSeconds:number; pace:number };
export const DEFAULT_SETTINGS: WorkoutSettings = { restSeconds:10, pushupRestSeconds:30, pace:1 };
export function validSettings(raw: unknown): raw is WorkoutSettings {
  const v=raw as WorkoutSettings;
  return !!v && typeof v==="object" && Object.keys(v).length===3
    && Number.isInteger(v.restSeconds) && v.restSeconds>=5 && v.restSeconds<=30
    && Number.isInteger(v.pushupRestSeconds) && v.pushupRestSeconds>=20 && v.pushupRestSeconds<=60
    && [.8,1,1.2].includes(v.pace);
}
export type Stage = { kind:"warmup"|"move"|"rest"|"cooldown"; move:MoveId; durationMs:number; round:number; reps:number; cycleMs:number; reward:number };
export function makePlan(pool: MoveId[], settings: WorkoutSettings=DEFAULT_SETTINGS, random=Math.random): Stage[] {
  if(!validPool(pool)||!validSettings(settings)) throw new Error("INVALID_WORKOUT_CONFIG");
  const stages: Stage[]=[{kind:"warmup",move:"march",durationMs:15_000,round:0,reps:0,cycleMs:700,reward:0}];
  let used=15_000, bag:MoveId[]=[], previous:MoveId|undefined, round=0;
  const timing=(id:MoveId)=>{
    const m=moveById(id), cycleMs=id==="room-run"?10_000:Math.round(m.seconds*1000/settings.pace);
    const restMs=(id==="pushup"?Math.max(settings.restSeconds,settings.pushupRestSeconds):settings.restSeconds)*1000;
    return {cycleMs,durationMs:m.reps*cycleMs,restMs};
  };
  while(true) {
    const fitting=pool.filter(id=>used+timing(id).durationMs+timing(id).restMs<=WORKOUT_MS-15_000);
    if(!fitting.length) break;
    if(!bag.some(id=>fitting.includes(id))) bag=[...fitting];
    let options=bag.filter(id=>fitting.includes(id));
    const varied=options.filter(id=>id!==previous);
    if(varied.length) options=varied;
    const gentle=previous && moveById(previous).intensity===3 ? options.filter(id=>moveById(id).intensity<3) : [];
    if(gentle.length) options=gentle;
    const id=options[Math.min(options.length-1,Math.floor(random()*options.length))], m=moveById(id), t=timing(id);
    bag=bag.filter(v=>v!==id); previous=id; round++;
    stages.push({kind:"move",move:id,durationMs:t.durationMs,round,reps:m.reps,cycleMs:t.cycleMs,reward:0});
    stages.push({kind:"rest",move:id,durationMs:t.restMs,round,reps:0,cycleMs:1000,reward:0});
    used+=t.durationMs+t.restMs;
  }
  stages.push({kind:"cooldown",move:"reach",durationMs:WORKOUT_MS-used,round:round+1,reps:0,cycleMs:2200,reward:0});
  const groups=stages.filter(s=>s.kind==="move");
  groups.forEach((s,i)=>{s.reward=Math.floor(WORKOUT_REWARD/groups.length)+(i<WORKOUT_REWARD%groups.length?1:0);});
  return stages;
}
export function validPlan(raw: unknown): raw is Stage[] {
  if(!Array.isArray(raw)||raw.length<4||raw.length>62||raw.length%2!==0) return false;
  const plan=raw as Stage[];
  if(plan.some(s=>!s||!validPool([s.move])||!Number.isInteger(s.durationMs)||s.durationMs<=0
    ||!Number.isInteger(s.round)||!Number.isInteger(s.reps)||s.reps<0
    ||!Number.isInteger(s.cycleMs)||s.cycleMs<=0||!Number.isInteger(s.reward)||s.reward<0)) return false;
  const last=plan.at(-1)!;
  if(plan[0].move!=="march"||plan[0].reps!==0||plan[0].cycleMs!==700||plan[0].kind!=="warmup"||plan[0].round!==0||plan[0].durationMs!==15_000||plan[0].reward!==0
    ||last.move!=="reach"||last.reps!==0||last.cycleMs!==2200||last.kind!=="cooldown"||last.round!==plan.length/2||last.reward!==0||last.durationMs<15_000) return false;
  for(let i=1;i<plan.length-1;i+=2) {
    const s=plan[i], rest=plan[i+1], m=moveById(s.move), groups=(plan.length-2)/2;
    if(s.kind!=="move"||rest.kind!=="rest"||rest.move!==s.move||s.round!==(i+1)/2||rest.round!==s.round
      ||rest.reps!==0||rest.cycleMs!==1000||rest.durationMs%1000!==0
      ||s.reward!==Math.floor(200/groups)+(s.round<=200%groups?1:0)
      ||!(s.move==="room-run"?s.cycleMs===10000:[.8,1,1.2].some(p=>s.cycleMs===Math.round(m.seconds*1000/p)))
      ||s.reps!==m.reps||s.durationMs!==s.reps*s.cycleMs||rest.durationMs<5000||rest.durationMs>60_000||rest.reward!==0
      ||(s.move==="pushup"&&rest.durationMs<20_000)) return false;
  }
  return plan.reduce((n,s)=>n+s.durationMs,0)===WORKOUT_MS && plan.reduce((n,s)=>n+s.reward,0)===WORKOUT_REWARD;
}
export function earnedRewards(plan: Stage[], elapsed:number): {round:number;amount:number}[] {
  let end=0;
  return plan.flatMap(s=>{end+=s.durationMs;return s.reward>0&&elapsed>=end?[{round:s.round,amount:s.reward}]:[];});
}
export function stageAt(plan:Stage[],elapsed:number) {
  let start=0;
  for(let index=0;index<plan.length;index++){
    const stage=plan[index];
    if(elapsed<start+stage.durationMs||index===plan.length-1) return {stage,index,localMs:Math.max(0,Math.min(stage.durationMs,elapsed-start))};
    start+=stage.durationMs;
  }
  throw new Error("EMPTY_WORKOUT");
}
export function advanceWorkout(elapsed:number,delta:number,running:boolean) {
  return running&&Number.isFinite(delta)&&delta>=0&&delta<=1000?Math.min(WORKOUT_MS,elapsed+delta):elapsed;
}
