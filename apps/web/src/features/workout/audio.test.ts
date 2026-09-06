import assert from "node:assert/strict";
import test from "node:test";
import { spokenCount, WorkoutAudio } from "./audio";
import { browserTts } from "../../shared/speech";
import { audioFocus } from "../../shared/audio/audio-focus";
test("counting follows normal repetitions and skips alternate beats for fast running",()=>{
  assert.equal(spokenCount(1,1200),"1！");
  assert.equal(spokenCount(10,2000),"10！");
  assert.equal(spokenCount(1,400),null);assert.equal(spokenCount(2,400),"2！");
  assert.equal(spokenCount(0,1000),null);assert.equal(spokenCount(NaN,1000),null);
});
test("muted, paused and microphone-owned workouts never start narration; disposal stops it",async t=>{
  const texts:string[]=[];
  t.mock.method(browserTts,"speak",({text}:{text:string})=>{texts.push(text);return Promise.resolve({status:"completed"});});
  t.mock.method(browserTts,"stop",()=>{});
  const audio=new WorkoutAudio(()=>{});
  audio.tick("a","准备",1,1200);assert.deepEqual(texts,[]);
  audio.enable(true);audio.tick("a","准备",1,1200);await Promise.resolve();
  audio.tick("a","准备",2,1200);await Promise.resolve();
  assert.deepEqual(texts,["准备","2！"]);
  audio.pause(true);audio.tick("b","休息",0,1000);assert.equal(texts.length,2);
  audio.pause(false);const release=audioFocus.acquireMicrophone();
  audio.tick("b","休息",0,1000);assert.equal(texts.length,2);release();
  audio.enable(false);audio.reward(1);assert.equal(texts.length,2);
  audio.dispose();
});
