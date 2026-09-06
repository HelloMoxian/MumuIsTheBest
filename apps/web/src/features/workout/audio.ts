import { browserTts } from "../../shared/speech";
import { LatestMomentQueue } from "../../shared/speech/latest-moment-queue";
import { audioFocus } from "../../shared/audio/audio-focus";
import { getAudioSnapshot, subscribeAudio } from "../../shared/audio/audio-store";

export function spokenCount(count:number,cycleMs:number) {
  return !Number.isInteger(count)||count<1||(cycleMs<600&&count%2!==0)?null:`${count}！`;
}
/** Keep the newest count; slow speech engines must never build a stale counting backlog. */
export class WorkoutAudio {
  private enabled=false;
  private paused=false;
  private key="";
  private counted=0;
  private context:AudioContext|null=null;
  private nodes=new Set<OscillatorNode>();
  private queue:LatestMomentQueue<string>;
  private subscriptions:(()=>void)[];
  constructor(failed:()=>void){
    this.queue=new LatestMomentQueue({
      play:text=>browserTts.speak({text,lang:"zh-CN",rate:1.22,pitch:1.12,preferLocalVoice:true}),
      stop:()=>browserTts.stop(),pause:()=>browserTts.pause(),resume:()=>browserTts.resume(),
      busy:()=>audioFocus.isMicrophoneActive(),show:()=>{},failed,
    });
    this.queue.setEnabled(false);
    this.subscriptions=[
      audioFocus.subscribe(()=>{if(audioFocus.isMicrophoneActive()){this.queue.clear();this.stopTones();}else this.queue.wake();}),
      subscribeAudio(()=>{if(!getAudioSnapshot().preferences.effectsEnabled)this.stopTones();}),
    ];
  }
  enable(value:boolean){
    this.enabled=value;this.key="";this.counted=0;this.queue.setEnabled(value);
    if(!value){this.stopTones();return;}
    try{this.context??=new AudioContext();void this.context.resume().catch(()=>{});}catch{/* Visual play remains available. */}
  }
  pause(value:boolean){
    if(this.paused===value)return;this.paused=value;this.key="";this.counted=0;
    if(value){this.queue.clear();this.stopTones();}
  }
  tick(key:string,intro:string,count:number,cycleMs:number){
    if(!this.enabled||this.paused||audioFocus.isMicrophoneActive())return;
    if(key!==this.key){this.queue.clear();this.key=key;this.counted=count;this.queue.enqueue(intro);return;}
    if(count!==this.counted&&count>0){
      this.counted=count;const spoken=spokenCount(count,cycleMs);
      if(spoken)this.queue.enqueue(spoken);
      this.tone(240+(count%2)*80,0,.055,.045);
    }
  }
  reward(round:number){
    if(!this.enabled||this.paused||audioFocus.isMicrophoneActive())return;
    [523.25,659.25,783.99,1046.5].forEach((frequency,i)=>this.tone(frequency,i*.11,.15,.11));
    this.queue.enqueue(round%2?"太棒啦！能量到手！":"好样的！又完成一组！");
  }
  private tone(frequency:number,delay:number,duration:number,volume:number){
    const context=this.context,preferences=getAudioSnapshot().preferences;
    if(!context||context.state!=="running"||!preferences.effectsEnabled)return;
    const oscillator=context.createOscillator(),gain=context.createGain(),start=context.currentTime+delay;
    oscillator.type="sine";oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume*preferences.effectsVolume,start+.008);
    gain.gain.exponentialRampToValueAtTime(.001,start+duration);
    oscillator.connect(gain).connect(context.destination);this.nodes.add(oscillator);
    oscillator.onended=()=>{this.nodes.delete(oscillator);oscillator.disconnect();gain.disconnect();};
    oscillator.start(start);oscillator.stop(start+duration);
  }
  private stopTones(){this.nodes.forEach(node=>{try{node.stop();}catch{}});this.nodes.clear();}
  dispose(){this.queue.dispose();this.stopTones();this.subscriptions.forEach(fn=>fn());void this.context?.close().catch(()=>{});}
}
