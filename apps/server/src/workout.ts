import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DEFAULT_MOVES, DEFAULT_SETTINGS, moveById, makePlan, validPlan, validPool, validSettings, earnedRewards, WORKOUT_MS, WORKOUT_REWARD, type MoveId, type WorkoutSettings } from "./workout-contract.js";
import { validPlan as validV1Plan, moveById as oldMove, type MoveId as OldMoveId } from "./workout-v1.js";
const poolSchema=z.custom<MoveId[]>(validPool), settingsSchema=z.custom<WorkoutSettings>(validSettings);
const baseStage=z.object({kind:z.enum(["warmup","move","rest","cooldown"]),move:z.custom<MoveId>(v=>validPool([v])),
  durationMs:z.number().int().positive().max(120_000),round:z.number().int().min(0).max(31)}).strict();
const stageSchema=baseStage.extend({reps:z.number().int().min(0).max(100),cycleMs:z.number().int().positive().max(10_000),reward:z.number().int().min(0).max(200)});
const sessionFields={id:z.string().uuid(),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),elapsedMs:z.number().int().min(0).max(WORKOUT_MS)};
const sessionSchema=z.object({...sessionFields,rulesVersion:z.union([z.literal(1),z.literal(2)]),
  enabledMoves:poolSchema,settings:settingsSchema,plan:z.array(stageSchema).min(4).max(62)}).strict().refine(s=>{
  if(s.rulesVersion===2) return validPlan(s.plan)&&s.plan.every(p=>{
    if(p.kind==="move")return s.enabledMoves.includes(p.move)&&p.cycleMs===(p.move==="room-run"?10000:Math.round(moveById(p.move).seconds*1000/s.settings.pace));
    if(p.kind==="rest")return p.durationMs===1000*(p.move==="pushup"?Math.max(s.settings.restSeconds,s.settings.pushupRestSeconds):s.settings.restSeconds);
    return true;
  });
  return validV1Plan(s.plan.map(({kind,move,durationMs,round})=>({kind,move,durationMs,round})))
    &&s.plan.every(p=>p.reward===0);
});
const header={stableId:z.literal("kids-workout"),createdAt:z.string().datetime(),updatedAt:z.string().datetime()};
const legacySchema=z.object({...header,schemaVersion:z.literal(1),enabledMoves:poolSchema,
  sessions:z.array(z.object({...sessionFields,plan:z.array(baseStage).refine(validV1Plan)}).strict()).max(100_000)}).strict();
export const workoutSchema=z.object({...header,schemaVersion:z.literal(2),enabledMoves:poolSchema,settings:settingsSchema,
  sessions:z.array(sessionSchema).max(100_000)}).strict().refine(d=>new Set(d.sessions.map(s=>s.id)).size===d.sessions.length);
export function migrateWorkout(raw:unknown) {
  if((raw as {schemaVersion?:number}|null)?.schemaVersion!==1) return workoutSchema.parse(raw);
  const old=legacySchema.parse(raw);
  return workoutSchema.parse({...old,schemaVersion:2,settings:{...DEFAULT_SETTINGS},sessions:old.sessions.map(s=>({
    ...s,rulesVersion:1,enabledMoves:old.enabledMoves,settings:{...DEFAULT_SETTINGS},plan:s.plan.map(p=>{
      const m=oldMove(p.move as OldMoveId);
      return {...p,reps:p.kind==="move"?m.reps:0,cycleMs:Math.round(m.seconds*1000),reward:0};
    }),
  }))});
}
export function emptyWorkout(now=Date.now()){
  return workoutSchema.parse({schemaVersion:2,stableId:"kids-workout",createdAt:new Date(now).toISOString(),
    updatedAt:new Date(now).toISOString(),enabledMoves:[...DEFAULT_MOVES],settings:{...DEFAULT_SETTINGS},sessions:[]});
}
type Wallet=(total:number)=>Promise<{balance:number;updatedAt:string}>;
export function sessionRewards(session:z.infer<typeof sessionSchema>){
  return session.rulesVersion===1?(session.elapsedMs===WORKOUT_MS?[{round:0,amount:WORKOUT_REWARD}]:[]):earnedRewards(session.plan,session.elapsedMs);
}
export function registerWorkoutApi(app:FastifyInstance,dataDir:string,credit:Wallet,now=Date.now){
  const path=resolve(dataDir,"learning/games/workout.json");
  let queue:Promise<unknown>=Promise.resolve();
  function serialized<T>(fn:()=>Promise<T>){const next=queue.catch(()=>undefined).then(fn);queue=next;return next;}
  async function read(){
    try{return migrateWorkout(JSON.parse(await readFile(path,"utf8")));}
    catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return emptyWorkout(now());throw e;}
  }
  async function save(raw:z.infer<typeof workoutSchema>){
    const data=workoutSchema.parse(raw);
    await mkdir(dirname(path),{recursive:true,mode:0o700});
    // Preserve exact v1 bytes before the first version-changing write; never overwrite a recovery point.
    try{
      const original=await readFile(path,"utf8");
      if(JSON.parse(original).schemaVersion===1){
        const backup=path+"."+randomUUID()+".backup.tmp";
        try{
          await writeFile(backup,original,{flag:"wx",mode:0o600});
          await link(backup,path+".v1.bak").catch(e=>{if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;});
        }finally{await unlink(backup).catch(()=>undefined);}
      }
    }catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
    const temp=path+"."+randomUUID()+".tmp";
    try{await writeFile(temp,JSON.stringify(data,null,2)+"\n",{flag:"wx",mode:0o600});await rename(temp,path);}
    finally{await unlink(temp).catch(()=>undefined);}
  }
  const totalFor=(d:z.infer<typeof workoutSchema>)=>d.sessions.reduce((n,s)=>n+sessionRewards(s).reduce((sum,a)=>sum+a.amount,0),0);
  const unavailable={message:"运动记录暂时没存好，原记录已保留，会继续重试。"};
  app.addHook("onReady",async()=>{await serialized(async()=>{const d=await read();if(totalFor(d))await credit(totalFor(d));}).catch(()=>undefined);});
  app.get("/api/games/workout/preferences",async(_req,reply)=>{
    reply.header("Cache-Control","no-store");
    try{return await serialized(async()=>{const d=await read();return{enabledMoves:d.enabledMoves,settings:d.settings};});}
    catch{return reply.code(503).send(unavailable);}
  });
  app.put("/api/games/workout/preferences",async(req,reply)=>{
    const input=z.object({enabledMoves:poolSchema,settings:settingsSchema.optional()}).strict().safeParse(req.body);
    if(!input.success)return reply.code(400).send({message:"至少保留一个动作，并选择有效的休息时间和节奏。"});
    try{return await serialized(async()=>{
      const d=await read();d.enabledMoves=input.data.enabledMoves;if(input.data.settings)d.settings=input.data.settings;
      d.updatedAt=new Date(now()).toISOString();await save(d);return{enabledMoves:d.enabledMoves,settings:d.settings};
    });}catch{return reply.code(503).send(unavailable);}
  });
  app.post("/api/games/workout/sessions",async(req,reply)=>{
    const input=z.object({id:z.string().uuid()}).strict().safeParse(req.body);
    if(!input.success)return reply.code(400).send({message:"课程编号无效，请刷新课程。"});
    try{return await serialized(async()=>{
      const d=await read();let session=d.sessions.find(s=>s.id===input.data.id);
      if(!session){
        const time=new Date(now()).toISOString();
        session={id:input.data.id,createdAt:time,updatedAt:time,elapsedMs:0,rulesVersion:2,enabledMoves:[...d.enabledMoves],
          settings:{...d.settings},plan:makePlan(d.enabledMoves,d.settings)};
        // Partial-cycle rewards are durable entitlements too, even if the course was abandoned.
        d.sessions=d.sessions.filter(s=>sessionRewards(s).length>0||now()-Date.parse(s.createdAt)<86_400_000);
        d.sessions.push(session);d.updatedAt=time;await save(d);
      }
      return{session,enabledMoves:d.enabledMoves,settings:d.settings};
    });}catch{return reply.code(503).send(unavailable);}
  });
  app.put("/api/games/workout/sessions/:id",async(req,reply)=>{
    const id=z.object({id:z.string().uuid()}).safeParse(req.params);
    const input=z.object({elapsedMs:z.number().int().min(0).max(WORKOUT_MS)}).strict().safeParse(req.body);
    if(!id.success||!input.success)return reply.code(400).send({message:"运动进度格式不正确。"});
    try{
      const result=await serialized(async()=>{
        const d=await read(),s=d.sessions.find(v=>v.id===id.data.id);
        if(!s)return null;
        if(input.data.elapsedMs>now()-Date.parse(s.createdAt))return{tooEarly:true as const};
        if(input.data.elapsedMs>s.elapsedMs){s.elapsedMs=input.data.elapsedMs;s.updatedAt=d.updatedAt=new Date(now()).toISOString();await save(d);}
        const awards=sessionRewards(s),reward=awards.reduce((n,a)=>n+a.amount,0);
        const wallet=reward?await credit(totalFor(d)):undefined;
        return{elapsedMs:s.elapsedMs,reward,awards,balance:wallet?.balance,complete:s.elapsedMs===WORKOUT_MS};
      });
      if(!result)return reply.code(404).send({message:"找不到这节课程，请刷新重开。"});
      if("tooEarly"in result)return reply.code(409).send({message:"课程仍在进行，稍后再保存进度。"});
      return result;
    }catch{return reply.code(503).send(unavailable);}
  });
}
