'use strict';
/* =========================================================
   framework.js —— 手绘卡通教学视频 · 通用主框架
   做新视频时：一般不需要改本文件，只需：
   1) 在场景文件里实现 scene1..sceneN 函数（接收全局时间 t）
   2) 修改下方 SCENES 数组（start / dur / draw / name）
   ========================================================= */

const W=1920,H=1080,FPS=24;

/* ---------- 场景注册表（★ 唯一需要按项目修改的部分） ----------
   约定：scene 函数内部全部使用【全局时间】，由 draw() 直接传入。
   总时长由 SCENES 自动求和得出。 */
const SCENES=[
  {start:0.0,   dur:17, draw:typeof scene1!=='undefined'?scene1:()=>{}, name:'hook'},
  {start:17.0,  dur:26, draw:typeof scene2!=='undefined'?scene2:()=>{}, name:'s2'},
  {start:43.0,  dur:30, draw:typeof scene3!=='undefined'?scene3:()=>{}, name:'s3'},
  {start:73.0,  dur:24, draw:typeof scene4!=='undefined'?scene4:()=>{}, name:'s4'},
  {start:97.0,  dur:22, draw:typeof scene5!=='undefined'?scene5:()=>{}, name:'s5'},
  {start:119.0, dur:22, draw:typeof scene6!=='undefined'?scene6:()=>{}, name:'s6'},
  {start:141.0, dur:18, draw:typeof scene7!=='undefined'?scene7:()=>{}, name:'s7'},
  {start:159.0, dur:11, draw:typeof scene8!=='undefined'?scene8:()=>{}, name:'end'}
];
const DUR=SCENES.reduce((a,s)=>Math.max(a,s.start+s.dur),0);

/* ---------- 纸张背景 ---------- */
function drawBackground(ctx,t,opts={}){
  ctx.fillStyle=C.paper;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.globalAlpha=0.05;ctx.fillStyle=C.ink;
  for(let y=40;y<H;y+=64)for(let x=40;x<W;x+=64){ctx.fillRect(x,y,2.2,2.2);}
  ctx.restore();
  const g=ctx.createRadialGradient(960,540,500,960,540,1250);
  g.addColorStop(0,'rgba(120,88,40,0)');g.addColorStop(1,'rgba(120,88,40,0.10)');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  // 页眉（开场场景之后显示，结尾场景淡出）
  const header=window.VIDEO_HEADER||{left:'',right:''};
  if(header.left||header.right){
    const showAfter=SCENES.length>1?SCENES[1].start+0.2:0.2;
    const fadeStart=SCENES[SCENES.length-1].start-0.6;
    if(t>showAfter){
      const a=Math.min(1,(t-showAfter)*2)*(t>fadeStart?Math.max(0,1-(t-fadeStart-0.6)*3):1);
      ctx.save();ctx.globalAlpha=0.55*a;
      if(header.left)handText(ctx,header.left,60,44,24,{align:'left',seed:911,color:C.gray});
      if(header.right)handText(ctx,header.right,1860,44,24,{align:'right',seed:912,color:C.gray});
      ctx.restore();
    }
  }
}

/* ---------- 纸张擦除转场 ---------- */
function drawWipe(ctx,t){
  for(let i=1;i<SCENES.length;i++){
    const st=SCENES[i].start;
    if(t<st-0.28||t>st+0.28)continue;
    const u=(t-(st-0.28))/0.56;
    const wFrac=u<0.5?easeInOutCubic(u*2):easeInOutCubic((1-u)*2);
    const wpx=wFrac*(W+90);
    const R=RNG(bs(777+i));
    ctx.save();
    ctx.beginPath();ctx.moveTo(-10,-10);
    const edge=[];
    for(let y=0;y<=H;y+=54){edge.push([wpx-45+Math.sin(y*0.021+i*7)*30+(R.f()-.5)*10,y]);}
    ctx.lineTo(edge[0][0],-10);
    for(const[x,y]of edge)ctx.lineTo(x,y);
    ctx.lineTo(-10,H+10);ctx.closePath();
    ctx.fillStyle=C.paperDark;ctx.fill();
    ctx.beginPath();ctx.moveTo(-10,-10);ctx.lineTo(wpx-75,-10);
    const edge2=[];
    for(let y=0;y<=H;y+=54){edge2.push([wpx-75+Math.sin(y*0.021+i*7+0.5)*30+(R.f()-.5)*10,y]);}
    for(const[x,y]of edge2)ctx.lineTo(x,y);
    ctx.lineTo(-10,H+10);ctx.closePath();
    ctx.fillStyle=C.paper;ctx.fill();
    lw(ctx,3);ctx.strokeStyle='rgba(59,50,41,0.35)';
    ctx.beginPath();ctx.moveTo(edge2[0][0],edge2[0][1]);
    for(const[x,y]of edge2)ctx.lineTo(x,y);
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------- 底部进度条（含章节节点 + 小铅笔） ---------- */
function drawProgressBar(ctx,t){
  const x0=140,x1=1780,y=1050;
  strokePts(ctx,buildLinePts(x0,y,x1,y,900,1,10),{color:C.graySoft,width:4});
  const px=x0+(x1-x0)*clamp01(t/DUR);
  if(px>x0+4)strokePts(ctx,buildLinePts(x0,y,px,y,901,1,10),{color:C.red,width:6});
  for(let i=0;i<SCENES.length;i++){
    const nx=x0+(x1-x0)*SCENES[i].start/DUR;
    const cur=t>=SCENES[i].start&&(i===SCENES.length-1||t<SCENES[i+1].start);
    jcircle(ctx,nx,y,cur?9:5,902+i,{color:cur?C.red:C.gray,width:cur?4:2.5});
    if(cur)jcircleFill(ctx,nx,y,4,902+i,{fill:C.red});
  }
  ctx.save();ctx.translate(px,y);ctx.rotate(-1.2);
  fillStrokePts(ctx,buildPolyPts([[0,-11],[16,0],[0,11],[-12,0]],904,1.2,3),{fill:C.yellow,stroke:C.ink,width:2.5});
  ctx.restore();
}

/* ---------- 主渲染（确定性：同一 t 永远渲染出同一帧） ---------- */
function draw(t){
  t=clamp01(t/DUR)*DUR;
  setBoil(Math.floor(t*8)); // 手绘抖动：每秒 8 次换 seed
  const ctx=CTX;
  ctx.clearRect(0,0,W,H);
  drawBackground(ctx,t);
  let sc=SCENES[0];
  for(const s of SCENES)if(t>=s.start)sc=s;
  ctx.save();
  sc.draw(ctx,t);
  ctx.restore();
  drawWipe(ctx,t);
  drawProgressBar(ctx,t);
}
let CTX=null;
function initCanvas(canvas){
  CTX=canvas.getContext('2d');
  CTX.lineCap='round';CTX.lineJoin='round';
}
window.renderFrame=function(t){
  if(!CTX)initCanvas(document.getElementById('cv'));
  draw(t);
  return 'ok';
};
/* 预览自动播放（URL 带 ?play，点击画布暂停/继续） */
if(typeof location!=='undefined'&&location.search.indexOf('play')>=0){
  window.addEventListener('load',()=>{
    const cv=document.getElementById('cv');
    initCanvas(cv);
    document.fonts.ready.then(()=>{
      let t0=null,paused=false;
      cv.addEventListener('click',()=>paused=!paused);
      function loop(ts){
        if(t0===null)t0=ts;
        if(!paused)draw(((ts-t0)/1000)%DUR);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    });
  });
}
