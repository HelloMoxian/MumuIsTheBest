import catalog from './assets.json';
import { PHYSICS, BOSS_SPRITES, clamp, type Game } from './model';
import { platformY } from './generator';
import { enemyPosition, trapActive } from './engine';
import { effectsFor, rockId } from './effects';

type Art = { url: string; bounds: number[]; size: number[]; anchor?: number[] };
const assets: Record<string, Art> = catalog;
export class SeaKidRenderer {
  images = new Map<string, HTMLImageElement>();
  missing = 0;
  private patternCache = new Map<string, CanvasPattern>();
  async load() {
    await Promise.all(Object.entries(assets).map(([id, art]) => new Promise<void>(resolve => {
      const image = new Image(); image.onload = () => { this.images.set(id, image); resolve(); }; image.onerror = () => { this.missing++; resolve(); }; image.src = art.url;
    })));
  }
  sprite(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, width: number, height: number, flip = false, rotation = 0) {
    const image = this.images.get(id), art = assets[id];
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1); if (rotation) ctx.rotate(rotation);
    if (image && art) { const [l,t,r,b] = art.bounds; ctx.drawImage(image, l,t,r-l,b-t,-width/2,-height,width,height); }
    else { ctx.fillStyle = '#FFD166'; ctx.fillRect(-width/2,-height,width,height); }
    ctx.restore();
  }
  tile(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number, size = 88) {
    const image = this.images.get(id);
    if (!image) { ctx.fillStyle = '#495774'; ctx.fillRect(x,y,w,h); return; }
    const key = `${id}:${size}`;
    let pattern = this.patternCache.get(key);
    if (!pattern) {
      const tile = document.createElement('canvas'); tile.width = tile.height = size;
      tile.getContext('2d')?.drawImage(image, 0,0,size,size);
      pattern = ctx.createPattern(tile,'repeat') ?? undefined;
      if (pattern) this.patternCache.set(key,pattern);
    }
    if (pattern) {
      ctx.save(); ctx.translate(x,y); ctx.fillStyle = pattern; ctx.fillRect(0,0,w,h); ctx.restore();
    }
  }
  draw(canvas: HTMLCanvasElement, g: Game, reduced: boolean) {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const width = 1280, height = 640;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const { level, player: p } = g, fx = effectsFor(g);
    const camera = g.boss.active ? level.length - PHYSICS.arena : clamp(p.x - 330, 0, level.length - width);
    const scene = level.scene;
    const sky = ctx.createLinearGradient(0,0,0,height);
    sky.addColorStop(0, scene === 2 ? '#181d39' : scene === 1 ? '#6ac9ed' : '#8bd5ef');
    sky.addColorStop(1, scene === 2 ? '#414c60' : '#d4efd6'); ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
    if (scene !== 2) {
      const cloudStart = Math.floor(camera * .18 / 280) - 1;
      for (let i = cloudStart; i < cloudStart + 9; i++) {
        const x = i * 280 - camera * .18, variant = ((i % 3) + 3) % 3;
        this.sprite(ctx,'cloud',x+130,90+variant*29,130+(i&1)*50,56);
        if (scene === 1) this.sprite(ctx,'island',x+120,475,220,145);
      }
      if (scene === 0) {
        ctx.globalAlpha=.48;
        const treeStart = Math.floor(camera * .38 / 235) - 1;
        for (let i=treeStart;i<treeStart+9;i++) {
          const variant = ((i % 3) + 3) % 3;
          this.sprite(ctx,['palm','tree','tree-slim'][variant],i*235-camera*.38+100,505,170+(i&1)*30,285+variant*25);
        }
        ctx.globalAlpha=1;
      }
    } else {
      ctx.globalAlpha=.17; this.tile(ctx,'cave',0,0,width,height,230);ctx.globalAlpha=1;
      const caveStart = Math.floor(camera * .28 / 310) - 1;
      for(let i=caveStart;i<caveStart+7;i++) { const x=i*310-camera*.28;ctx.globalAlpha=.22;this.sprite(ctx,'relief',x+110,365,155,155);ctx.globalAlpha=1;this.sprite(ctx,'torch',x+250,245,30,55); }
    }
    ctx.save();ctx.translate(-camera,0);
    for(const ground of level.platforms) {
      if(ground.x+ground.w<camera-60 || ground.x>camera+width+60)continue;
      const y=platformY(ground,g.time,g.fallen);
      if(y>700)continue;
      if(ground.kind==='cloud') {
        // Clip each strip independently: fractional widths do not stretch whole tiles.
        ctx.save();ctx.beginPath();ctx.rect(ground.x,y,ground.w,47);ctx.clip();
        for(let x=ground.x;x<ground.x+ground.w;x+=88)this.sprite(ctx,'cloud-platform',x+44,y+45,96,45);
        ctx.restore();
      } else if(['rise','sink','fall'].includes(ground.kind)) {
        ctx.save();ctx.beginPath();ctx.rect(ground.x,y,ground.w,32);ctx.clip();
        for(let x=ground.x;x<ground.x+ground.w;x+=80)this.sprite(ctx,ground.kind==='fall'?'fall-platform':'lift-platform',x+40,y+32,82,32);
        ctx.restore();ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.fillStyle='#f5f5ff';
        const descending = (ground.kind==='sink'?-1:1)*Math.cos(g.time*Math.PI*2/ground.period+ground.phase)>0;
        ctx.fillText(ground.kind==='fall'?'⌄':descending?'↓':'↑',ground.x+ground.w/2,y+23);
        if(ground.kind==='fall' && g.fallen[ground.id]!==undefined && g.time-g.fallen[ground.id]<.8){ctx.strokeStyle='#FFD166';ctx.lineWidth=3;ctx.strokeRect(ground.x,y,ground.w,30);}
      } else {
        this.tile(ctx,ground.kind==='ice'?'ice':scene===2?'cave':'earth',ground.x,y,ground.w,height-y,88);
        if(scene===0)this.tile(ctx,'grass',ground.x,y,ground.w,48,88);
        ctx.fillStyle=ground.kind==='ice'?'#cef9ff':scene===2?'#8296b7':'#86d149';ctx.fillRect(ground.x,y,ground.w,3);
      }
    }
    if(scene===2){for(let x=Math.floor(camera/220)*220;x<camera+width+220;x+=220)this.sprite(ctx,'stalactites',x+100,82,200,95);}
    for(const [index, trap] of level.traps.entries()) {
      if(trap.kind==='rock' && g.collected.includes(rockId(index)))continue;
      if(Math.abs(trap.x-camera-width/2)>width/2+100)continue;
      const y=platformY(level.platforms[trap.platform],g.time,g.fallen),active=trapActive(g.time,trap.phase);
      if(trap.kind==='flame') { this.sprite(ctx,'rock',trap.x,y,40,16);if(active)this.sprite(ctx,'flame',trap.x,y,52,90);else {ctx.fillStyle='#ffb052';ctx.fillRect(trap.x-12,y-7,24,5);} }
      if(trap.kind==='pusher')this.sprite(ctx,'pusher',trap.x,y,active?115:48,38);
      if(trap.kind==='rock')this.sprite(ctx,'rock',trap.x,y,50,36);
      if(trap.kind==='boulder'){ctx.font='bold 26px sans-serif';ctx.fillStyle='#ffd166';ctx.fillText('↓',trap.x,70);}
    }
    for(const item of level.pickups) {
      if(g.collected.includes(item.id) || item.x<camera-50 || item.x>camera+width+50)continue;
      const ground=level.platforms[item.platform],y=item.y+platformY(ground,g.time,g.fallen)-ground.y;
      const bob=reduced?0:Math.sin(g.time*3+item.x)*3;
      this.sprite(ctx,item.kind,item.x,y+15+bob,item.kind==='scooter'?52:32,item.kind==='scooter'?42:34);
    }
    for(const e of level.enemies){if(e.hp<=0)continue;const pos=enemyPosition(g,e);if(pos.x<camera-60||pos.x>camera+width+60)continue;const bounce=reduced?0:Math.sin(g.time*7+e.phase)*1.5;this.sprite(ctx,e.kind,pos.x,pos.y+bounce,e.kind==='bat'?60:48,e.kind==='snail'?32:44,pos.x>p.x);}
    for(const shot of g.shots)this.sprite(ctx,shot.kind,shot.x,shot.y+(shot.kind==='boulder'?31:14),shot.kind==='boulder'?62:30,shot.kind==='boulder'?62:30,false,shot.kind==='hammer'||shot.kind==='firewheel'?g.time*14:0);
    for(const defeated of fx.defeats) {
      const t=defeated.age;
      ctx.save();
      ctx.globalAlpha=reduced?Math.max(0,1-t/.35):Math.min(1,(1.3-t)/.25);
      ctx.translate(defeated.x+(reduced?0:defeated.direction*125*t),defeated.y+(reduced?0:-300*t+650*t*t));
      if(!reduced)ctx.rotate(Math.PI+defeated.direction*t*4);
      this.sprite(ctx,defeated.sprite,0,defeated.height/2,defeated.width,defeated.height);
      ctx.restore();
    }
    if(scene===2){
      const b=g.boss;
      if(b.hp>0){ctx.globalAlpha=g.time-b.hitAt<.12?.55:1;this.sprite(ctx,BOSS_SPRITES[b.kind],b.x,b.y+100,130,120,true);ctx.globalAlpha=1;}
      if(b.active){ctx.strokeStyle='#a582f0';ctx.lineWidth=6;ctx.setLineDash([12,8]);ctx.beginPath();ctx.moveTo(level.length-PHYSICS.arena+6,50);ctx.lineTo(level.length-PHYSICS.arena+6,610);ctx.stroke();ctx.setLineDash([]);}
    }
    const walking=['walk-a','idle','walk-b','idle'][Math.floor(fx.stride/26)%4];
    const frame=p.hurt>0?'hurt':p.attack>.10?'attack':p.grounded===null?'jump':!p.scooter&&Math.abs(p.vx)>12?walking:'idle';
    const id=`hero-${p.tier}-${frame}`,image=this.images.get(id),art=assets[id];
    const floor=p.y+PHYSICS.height;
    if(p.scooter)this.sprite(ctx,'scooter',p.x+15,floor+5,62,40,p.facing<0);
    ctx.save();ctx.translate(p.x+14,floor-(p.scooter?10:0));if(p.facing<0)ctx.scale(-1,1);
    // Full frame canvas and head/foot anchors avoid per-frame auto-trim wobble.
    if(image && art.anchor){
      const scale=(68+p.tier*4)/215;
      const draw=()=>ctx.drawImage(image,-art.anchor![0]*scale,-art.anchor![1]*scale,art.size[0]*scale,art.size[1]*scale);
      ctx.globalAlpha=p.invulnerable>0?.7:1;draw();
      if(fx.boost>0&&!reduced){
        ctx.globalAlpha=(1-Math.cos((1-fx.boost)*Math.PI*10))*.44;
        ctx.filter='brightness(3) saturate(.45)';draw();ctx.filter='none';
      }
    }
    else{ctx.fillStyle='#FFD166';ctx.fillRect(-14,-48,28,48);}ctx.restore();
    if(p.weapon!=='none'&&p.attack<.1)this.sprite(ctx,p.weapon,p.x+14+p.facing*21,p.y+30,24,27,p.facing<0);
    if(p.ring)this.sprite(ctx,'ring',p.x+14,p.y+41,54,26);
    if(p.rescue>0){ctx.strokeStyle='#59e7ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x+14,floor,38,0,Math.PI*2);ctx.stroke();}
    if(fx.boost>0&&reduced){ctx.strokeStyle='#ffd166';ctx.lineWidth=3;ctx.strokeRect(p.x-15,p.y-25,58,78);}
    for(const score of fx.scores){
      ctx.save();ctx.globalAlpha=Math.min(1,(1.05-score.age)/.25);
      ctx.font='900 28px ui-rounded, sans-serif';ctx.textAlign='center';ctx.lineJoin='round';ctx.lineWidth=4;
      const y=score.y-(reduced?0:46*(1-(1-score.age/1.05)**2)),label=`+${score.amount}`;
      ctx.strokeStyle='#322749';ctx.strokeText(label,score.x,y);ctx.fillStyle='#fff1a1';ctx.fillText(label,score.x,y);ctx.restore();
    }
    if(scene!==2){ctx.fillStyle='#fff7cc';ctx.fillRect(level.length-50,300,5,150);ctx.fillStyle='#ffb75b';ctx.beginPath();ctx.moveTo(level.length-45,300);ctx.lineTo(level.length+5,319);ctx.lineTo(level.length-45,338);ctx.fill();}
    ctx.restore();
    if(scene===1){this.tile(ctx,'water',0,592,width,48,180);}
    if(g.phase==='dead'){ctx.fillStyle='rgba(245,245,255,.22)';ctx.fillRect(0,0,width,height);}
  }
}
