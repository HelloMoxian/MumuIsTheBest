import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Coach as FlatCoach, poseFor, type Point } from "./Coach";
import type { MoveId } from "../../../../server/src/workout-contract";

const Y=new THREE.Vector3(0,1,0);
const FLOOR_MOVES=new Set<MoveId>(["pushup","situp","burpee"]);
const palette={fur:0xeeb781,cream:0xffead2,ear:0xdc8d87,ink:0x24203b,eye:0x17132a,suit:0x58d2d7,pants:0x7862c5,white:0xfff9ee,accent:0xffb74d};
export function Coach3D({move,phase,profile=false}:{move:MoveId|"rest";phase:number;profile?:boolean}){
  const host=useRef<HTMLDivElement>(null), draw=useRef<((move:MoveId|"rest",phase:number)=>void)|null>(null);
  const latest=useRef({move,phase}), [failed,setFailed]=useState(false);
  latest.current={move,phase};
  useEffect(()=>{
    const element=host.current;if(!element)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:"low-power"});}catch{setFailed(true);return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
    element.appendChild(renderer.domElement);
    const scene=new THREE.Scene(), camera=new THREE.OrthographicCamera(-1.7,1.7,2.8,0,.1,30);
    const ambient=new THREE.HemisphereLight(0xe1f7ff,0x706292,2.1);scene.add(ambient);
    const key=new THREE.DirectionalLight(0xffe4c6,3.4);key.position.set(-3,5,5);scene.add(key);
    const fill=new THREE.DirectionalLight(0x7adeff,1.6);fill.position.set(3,2,3);scene.add(fill);
    const rim=new THREE.DirectionalLight(0xc8a3ff,3);rim.position.set(0,3,-4);scene.add(rim);
    const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
    const sphere=new THREE.SphereGeometry(1,24,18);geometries.push(sphere);
    const mats=Object.fromEntries(Object.entries(palette).map(([name,color])=>{
      const material=new THREE.MeshStandardMaterial({color,roughness:name==="eye"?.18:.64,metalness:0});
      materials.push(material);return[name,material];
    })) as Record<keyof typeof palette,THREE.MeshStandardMaterial>;
    function ball(parent:THREE.Object3D,material:THREE.Material,x:number,y:number,z:number,sx:number,sy=sx,sz=sx){
      const m=new THREE.Mesh(sphere,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;
    }
    const rig=new THREE.Group();scene.add(rig);
    const body=ball(rig,mats.suit,0,1.3,0,.30,.40,.24);
    const tummy=ball(body,mats.white,0,-.02,.83,.78,.82,.28);
    // Compact star badge, raised piping and a contrasting waistband are part of the suit.
    const starShape=new THREE.Shape();
    for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.052:.105,x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)starShape.moveTo(x,y);else starShape.lineTo(x,y);}
    starShape.closePath();const starGeometry=new THREE.ShapeGeometry(starShape);geometries.push(starGeometry);
    const badge=new THREE.Mesh(starGeometry,mats.accent);rig.add(badge);
    const waist=ball(rig,mats.pants,0,1,0,.28,.18,.25);
    const head=new THREE.Group();rig.add(head);
    ball(head,mats.fur,0,0,0,.39,.365,.34);
    for(const side of [-1,1]){
      ball(head,mats.fur,side*.31,.285,-.015,.14,.15,.095);
      ball(head,mats.ear,side*.31,.292,.065,.082,.085,.027);
      ball(head,mats.cream,side*.115,-.10,.285,.16,.125,.095);
      ball(head,mats.eye,side*.143,.06,.305,.061,.075,.039);
      ball(head,mats.white,side*.143-.018,.086,.337,.020);
      ball(head,mats.white,side*.143+.02,.046,.34,.009);
      ball(head,mats.ear,side*.258,-.067,.263,.054,.028,.02);
      const brow=ball(head,mats.ink,side*.142,.162,.279,.060,.013,.017);brow.rotation.z=side*.12;
    }
    ball(head,mats.ink,0,-.065,.383,.067,.045,.038);
    const smileGeometry=new THREE.TorusGeometry(.054,.009,8,20,Math.PI);geometries.push(smileGeometry);
    const smile=new THREE.Mesh(smileGeometry,mats.ink);smile.position.set(0,-.113,.362);smile.rotation.z=Math.PI;head.add(smile);
    // A jaunty sports headband: a real curved mesh, so the side view stays coherent.
    const bandGeo=new THREE.TorusGeometry(.353,.032,10,48,Math.PI*1.5);geometries.push(bandGeo);
    const band=new THREE.Mesh(bandGeo,mats.suit);band.rotation.x=Math.PI/2;band.position.y=.17;head.add(band);
    const limbs:THREE.Mesh[]=[];
    for(let i=0;i<8;i++)limbs.push(ball(rig,i<4?mats.pants:mats.suit,0,0,0,.1,.2,.1));
    const knees=[ball(rig,mats.pants,0,0,0,.115),ball(rig,mats.pants,0,0,0,.115)];
    const elbows=[ball(rig,mats.suit,0,0,0,.1),ball(rig,mats.suit,0,0,0,.1)];
    const hands=[ball(rig,mats.white,0,0,0,.12,.13,.12),ball(rig,mats.white,0,0,0,.12,.13,.12)];
    hands.forEach((hand,i)=>{ball(hand,mats.white,i?-.7:.7,-.05,.1,.4,.45,.4);});
    const shoes=[new THREE.Group(),new THREE.Group()];
    shoes.forEach(shoe=>{
      rig.add(shoe);ball(shoe,mats.white,0,-.035,.075,.145,.070,.225);
      ball(shoe,mats.pants,0,.02,.04,.139,.085,.192);
      ball(shoe,mats.suit,0,.065,.09,.105,.032,.100);
      for(let i=0;i<3;i++)ball(shoe,mats.white,0,.08,.03+i*.045,.082,.012,.011);
    });
    const floorGeometry=new THREE.CylinderGeometry(1.2,1.25,.06,64);geometries.push(floorGeometry);
    const floorMat=new THREE.MeshStandardMaterial({color:0x383454,roughness:.6});materials.push(floorMat);
    const floor=new THREE.Mesh(floorGeometry,floorMat);floor.position.y=-.04;scene.add(floor);
    const ringGeo=new THREE.TorusGeometry(1.12,.014,8,64);geometries.push(ringGeo);
    const ringMat=new THREE.MeshBasicMaterial({color:0x7bddf1,transparent:true,opacity:.5});materials.push(ringMat);
    const ring=new THREE.Mesh(ringGeo,ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=0;scene.add(ring);
    const shadowCanvas=document.createElement("canvas");shadowCanvas.width=128;shadowCanvas.height=128;
    const context=shadowCanvas.getContext("2d")!;
    const gradient=context.createRadialGradient(64,64,5,64,64,64);gradient.addColorStop(0,"rgba(9,6,30,.7)");gradient.addColorStop(1,"rgba(9,6,30,0)");
    context.fillStyle=gradient;context.fillRect(0,0,128,128);
    const shadowTexture=new THREE.CanvasTexture(shadowCanvas),shadowGeo=new THREE.PlaneGeometry(2.1,2.1);geometries.push(shadowGeo);
    const shadowMat=new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false});materials.push(shadowMat);
    const shadow=new THREE.Mesh(shadowGeo,shadowMat);shadow.rotation.x=-Math.PI/2;shadow.position.y=.005;scene.add(shadow);
    function position(obj:THREE.Object3D,p:Point){obj.position.set(...p);}
    function between(obj:THREE.Mesh,a:Point,b:Point,radius:number){
      const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);
      obj.position.copy(av.add(bv).multiplyScalar(.5));obj.quaternion.setFromUnitVectors(Y,d.clone().normalize());
      obj.scale.set(radius,d.length()/2+.055,radius);
    }
    const render=(action:MoveId|"rest",t:number)=>{
      const p=poseFor(action,t);
      position(head,p.head);
      head.quaternion.setFromUnitVectors(Y,new THREE.Vector3(...p.head).sub(new THREE.Vector3(...p.chest)).normalize());
      between(body,p.hips,p.chest,.3);body.scale.z=.255;
      position(waist,p.hips);waist.quaternion.copy(body.quaternion);
      position(badge,[p.chest[0],p.chest[1],p.chest[2]+.27]);badge.quaternion.copy(body.quaternion);
      for(let i=0;i<2;i++){
        between(limbs[i*2],p.hip[i],p.knees[i],.115);between(limbs[i*2+1],p.knees[i],p.feet[i],.10);
        between(limbs[4+i*2],p.shoulders[i],p.elbows[i],.105);between(limbs[5+i*2],p.elbows[i],p.hands[i],.09);
        position(knees[i],p.knees[i]);position(elbows[i],p.elbows[i]);position(hands[i],p.hands[i]);position(shoes[i],p.feet[i]);
      }
      const ground=action!=="rest"&&FLOOR_MOVES.has(action);
      const center=action==="burpee" ? .80+.50*THREE.MathUtils.clamp((p.hips[1]-.45)/.55,0,1) : ground ? .80 : 1.30;
      const width=Math.max(1,element.clientWidth),height=Math.max(1,element.clientHeight),aspect=width/height,vertical=ground?3.15:3.10;
      camera.left=-vertical*aspect/2;camera.right=vertical*aspect/2;camera.top=vertical/2;camera.bottom=-vertical/2;
      camera.position.set(profile?5:0,ground?2.5:2.0,profile ? .12 : 5);camera.lookAt(0,center,0);camera.updateProjectionMatrix();
      floor.scale.setScalar(ground?1.25:1);ring.scale.setScalar(ground?1.25:1);
      renderer.render(scene,camera);
    };
    draw.current=render;
    const resize=()=>{renderer.setSize(element.clientWidth,element.clientHeight,false);render(latest.current.move,latest.current.phase);};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();
    const lost=(event:Event)=>{event.preventDefault();setFailed(true);};
    renderer.domElement.addEventListener("webglcontextlost",lost);
    return()=>{draw.current=null;observer.disconnect();renderer.domElement.removeEventListener("webglcontextlost",lost);
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());shadowTexture.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[profile]);
  useEffect(()=>{draw.current?.(move,phase);},[move,phase]);
  return <div className="workout-coach-3d" role="img" aria-label={profile?"立体小熊侧面动作示范":"立体小熊正面动作示范"}>
    <div ref={host} className={failed?"is-hidden":""}/>
    {failed&&<><FlatCoach move={move} phase={phase} profile={profile}/><small>设备暂不支持立体画面 · 简洁示范</small></>}
  </div>;
}
