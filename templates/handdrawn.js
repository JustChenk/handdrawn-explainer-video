'use strict';
/* =========================================================
   handdrawn.js —— 手绘卡通风格 Canvas 工具库（确定性渲染）
   所有随机均由 seed 驱动；boil（手绘抖动）每秒 8 次换 seed
   ========================================================= */

const TAU = Math.PI * 2;

/* ---------- 伪随机 ---------- */
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function RNG(seed){const r=mulberry32(((Math.floor(seed)*2654435761)>>>0)||1);return{f:()=>r(),range:(a,b)=>a+(b-a)*r(),int:(a,b)=>Math.floor(a+(b-a+1)*r()),sign:()=>(r()<.5?-1:1),pick:a=>a[Math.floor(r()*a.length)]};}

/* ---------- 缓动 ---------- */
const clamp01=v=>v<0?0:v>1?1:v;
const seg=(t,a,b)=>clamp01((t-a)/(b-a));
const lerp=(a,b,p)=>a+(b-a)*p;
const easeOutCubic=p=>1-Math.pow(1-p,3);
const easeInCubic=p=>p*p*p;
const easeInOutCubic=p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
const easeOutBack=p=>{const c=2.2;return 1+(c+1)*Math.pow(p-1,3)+c*Math.pow(p-1,2);};
const easeOutQuad=p=>1-(1-p)*(1-p);

/* ---------- 调色板 ---------- */
const C={
  paper:'#FBF4E6', paperDark:'#F0E5CC', ink:'#3B3229',
  red:'#E4572E', redSoft:'#F5B49E',
  yellow:'#F5B82E', yellowSoft:'#FAE1A6',
  blue:'#2E7DD1', blueSoft:'#B4D2F0',
  green:'#3E9B4F', greenSoft:'#B9DEC0',
  purple:'#8A5FB0', purpleSoft:'#D5C1E8',
  pink:'#E88FB4', pinkSoft:'#F6CFDF',
  gray:'#8C8377', graySoft:'#D8D0C2',
  white:'#FFFDF8'
};

/* ---------- 全局 boil ---------- */
let BI=0;
function setBoil(i){BI=i;}
function bs(seed){return ((seed*97+BI*131)>>>0)||7;}

/* ---------- 线宽 ---------- */
function lw(ctx,n){ctx.lineWidth=n;ctx.lineCap='round';ctx.lineJoin='round';}

/* ---------- 点构建 ---------- */
function buildLinePts(x1,y1,x2,y2,seed,amp=2.2,n=7){
  const R=RNG(bs(seed));const dx=x2-x1,dy=y2-y1;
  const len=Math.hypot(dx,dy)||1;const nx=-dy/len,ny=dx/len;const pts=[];
  for(let i=0;i<=n;i++){const p=i/n;const o=(i===0||i===n)?amp*0.5:amp;pts.push([x1+dx*p+nx*(R.f()-.5)*o*2, y1+dy*p+ny*(R.f()-.5)*o*2]);}
  return pts;
}
function buildArcPts(cx,cy,rx,ry,seed,amp=1.6,n=26,a0=0,a1=TAU){
  const R=RNG(bs(seed));const pts=[];
  for(let i=0;i<=n;i++){const a=lerp(a0,a1,i/n);const jr=1+(R.f()-.5)*amp*2/Math.max(rx,ry);
    pts.push([cx+Math.cos(a)*rx*jr, cy+Math.sin(a)*ry*jr]);}
  return pts;
}
function buildRoundRectPts(x,y,w,h,rad,seed,amp=1.8,n=6){
  const R=RNG(bs(seed));const pts=[];
  const rr=Math.min(rad,w/2,h/2);
  // 顺时针连续：左上(左缘→顶部) 右上(顶部→右缘) 右下(右缘→底部) 左下(底部→左缘)
  const cs=[
    [x+rr,y+rr, Math.PI, Math.PI*1.5],
    [x+w-rr,y+rr, -Math.PI/2, 0],
    [x+w-rr,y+h-rr, 0, Math.PI/2],
    [x+rr,y+h-rr, Math.PI/2, Math.PI]
  ];
  for(const [cx,cy,a0,a1] of cs){
    for(let i=0;i<=n;i++){const a=lerp(a0,a1,i/n);
      pts.push([cx+Math.cos(a)*rr+(R.f()-.5)*amp*2, cy+Math.sin(a)*rr+(R.f()-.5)*amp*2]);}
  }
  return pts;
}
function buildPolyPts(corners,seed,amp=2.2,per=5){
  const R=RNG(bs(seed));const pts=[];const nc=corners.length;
  for(let i=0;i<nc;i++){const a=corners[i],b=corners[(i+1)%nc];
    for(let j=0;j<per;j++){const p=j/per;pts.push([lerp(a[0],b[0],p)+(R.f()-.5)*amp*2, lerp(a[1],b[1],p)+(R.f()-.5)*amp*2]);}}
  return pts;
}

/* progress 截断：按折线长度截取前 progress 比例 */
function cutPts(pts,progress){
  if(progress>=1)return pts;
  const L=[];let total=0;
  for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);L.push(d);total+=d;}
  const target=total*clamp01(progress);let acc=0;const out=[pts[0]];
  for(let i=0;i<L.length;i++){if(acc+L[i]>=target){const p=(target-acc)/L[i];
    out.push([lerp(pts[i][0],pts[i+1][0],p),lerp(pts[i][1],pts[i+1][1],p)]);break;}
    acc+=L[i];out.push(pts[i+1]);}
  return out;
}

/* 中点平滑描线 */
function strokePts(ctx,pts,o={}){
  const{width=4,color=C.ink,alpha=1,progress=1,closed=false}=o;
  if(pts.length<2||alpha<=0||width<=0)return;
  const P=cutPts(pts,progress);if(P.length<2)return;
  ctx.save();ctx.globalAlpha*=alpha;lw(ctx,width);ctx.strokeStyle=color;
  ctx.beginPath();ctx.moveTo(P[0][0],P[0][1]);
  for(let i=1;i<P.length-1;i++){const mx=(P[i][0]+P[i+1][0])/2,my=(P[i][1]+P[i+1][1])/2;ctx.quadraticCurveTo(P[i][0],P[i][1],mx,my);}
  const last=P[P.length-1];ctx.lineTo(last[0],last[1]);
  if(closed)ctx.closePath();
  ctx.stroke();ctx.restore();
}
function fillPts(ctx,pts,o={}){
  const{color=C.ink,alpha=1}=o;
  if(pts.length<2||alpha<=0)return;
  ctx.save();ctx.globalAlpha*=alpha;ctx.fillStyle=color;
  ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length-1;i++){const mx=(pts[i][0]+pts[i+1][0])/2,my=(pts[i][1]+pts[i+1][1])/2;ctx.quadraticCurveTo(pts[i][0],pts[i][1],mx,my);}
  ctx.closePath();ctx.fill();ctx.restore();
}
function fillStrokePts(ctx,pts,o={}){
  const{fill=C.white,stroke=C.ink,width=4,alpha=1}=o;
  if(pts.length<2||alpha<=0)return;
  ctx.save();ctx.globalAlpha*=alpha;
  // fill
  ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length-1;i++){const mx=(pts[i][0]+pts[i+1][0])/2,my=(pts[i][1]+pts[i+1][1])/2;ctx.quadraticCurveTo(pts[i][0],pts[i][1],mx,my);}
  ctx.closePath();ctx.fill();
  // stroke
  if(width>0){lw(ctx,width);ctx.strokeStyle=stroke;ctx.stroke();}
  ctx.restore();
}

/* ---------- 快捷图元 ---------- */
function jline(ctx,x1,y1,x2,y2,seed,o={}){strokePts(ctx,buildLinePts(x1,y1,x2,y2,seed,o.amp||2.2,o.n||7),o);}
function jcircle(ctx,cx,cy,r,seed,o={}){strokePts(ctx,buildArcPts(cx,cy,r,r,seed,o.amp||1.6),o);}
function jellipseStroke(ctx,cx,cy,rx,ry,seed,o={}){strokePts(ctx,buildArcPts(cx,cy,rx,ry,seed,o.amp||1.6),o);}
function jarc(ctx,cx,cy,r,seed,a0,a1,o={}){strokePts(ctx,buildArcPts(cx,cy,r,r,seed,o.amp||1.4,14,a0,a1),o);}
function jcircleFill(ctx,cx,cy,r,seed,o={}){fillPts(ctx,buildArcPts(cx,cy,r,r,seed,o.amp||1.6),o);}
function jrr(ctx,x,y,w,h,rad,seed,o={}){
  const pts=buildRoundRectPts(x,y,w,h,rad,seed,o.amp||1.8);
  fillStrokePts(ctx,pts,o);
  return pts;
}
function jpolygon(ctx,corners,seed,o={}){fillStrokePts(ctx,buildPolyPts(corners,seed,o.amp||2.2,o.per||5),o);}
function jpolygonStroke(ctx,corners,seed,o={}){strokePts(ctx,buildPolyPts(corners,seed,o.amp||2.2,o.per||5),{closed:true,...o});}
function jdot(ctx,x,y,r,color,alpha=1){ctx.save();ctx.globalAlpha*=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.restore();}

/* ---------- 文本 ---------- */
function handText(ctx,txt,x,y,size,o={}){
  const{align='center',base='middle',alpha=1,rot=0,stroke=null,seed=1,boilAmp=1,lsx=0,lsy=0}=o;
  const color=o.color||C.ink,font=o.font||'ZCOOL KuaiLe',weight=o.weight||'';
  if(alpha<=0)return;
  ctx.save();const R=RNG(bs(seed));
  ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(rot+(R.f()-.5)*0.014*boilAmp);
  ctx.font=`${weight?weight+' ':''}${size}px "${font}", sans-serif`;
  ctx.textAlign=align;ctx.textBaseline=base;
  if(stroke){ctx.lineWidth=stroke.width||size*0.14;ctx.strokeStyle=stroke.color||C.paper;ctx.lineJoin='round';ctx.strokeText(txt,lsx,lsy);}
  ctx.fillStyle=color;ctx.fillText(txt,lsx,lsy);
  ctx.restore();
}
function handLines(ctx,lines,x,y,size,gap,o={}){
  const total=lines.length;
  lines.forEach((ln,i)=>{handText(ctx,ln,x,y+(i-(total-1)/2)*gap,size,o);});
}
/* 打字机文本（返回已显示字符数） */
function typeText(ctx,full,x,y,size,o={},cps=16,t0=0,t=0){
  const n=Math.floor(clamp01((t-t0)*cps)*full.length);
  const s=full.slice(0,n);
  if(s)handText(ctx,s,x,y,{align:'left',...o});
  return n;
}

/* ---------- 箭头 ---------- */
function drawArrow(ctx,x1,y1,x2,y2,seed,o={}){
  const{color=C.ink,width=5,curve=0.18,progress=1,alpha=1}=o;
  const mx=(x1+x2)/2,my=(y1+y2)/2;
  const dx=x2-x1,dy=y2-y1;const len=Math.hypot(dx,dy)||1;
  const nx=-dy/len,ny=dx/len;
  const cx0=mx+nx*len*curve,cy0=my+ny*len*curve;
  // 采样贝塞尔
  const R=RNG(bs(seed));const pts=[];const n=16;
  for(let i=0;i<=n;i++){const p=i/n;const ix=(1-p)*(1-p)*x1+2*(1-p)*p*cx0+p*p*x2;const iy=(1-p)*(1-p)*y1+2*(1-p)*p*cy0+p*p*y2;
    pts.push([ix+(R.f()-.5)*2.4,iy+(R.f()-.5)*2.4]);}
  strokePts(ctx,pts,{color,width,alpha,progress:Math.min(1,progress*1.15)});
  if(progress>=0.92){ // 箭头头部
    const ang=Math.atan2(y2-cy0,x2-cx0);
    const h1=ang+2.5,h2=ang-2.5,hl=len*0.13+10;
    const R2=RNG(bs(seed+3));
    strokePts(ctx,buildLinePts(x2,y2,x2+Math.cos(h1)*hl,y2+Math.sin(h1)*hl,seed+11,2,4),{color,width,alpha});
    strokePts(ctx,buildLinePts(x2,y2,x2+Math.cos(h2)*hl,y2+Math.sin(h2)*hl,seed+12,2,4),{color,width,alpha});
  }
}

/* ---------- 勾 / 叉 / 强调 ---------- */
function drawCheck(ctx,x,y,s,seed,color=C.green,progress=1,width=8){
  const p1=buildLinePts(x-s*.55,y+s*.05,x-s*.1,y+s*.45,seed,2,4);
  const p2=buildLinePts(x-s*.1,y+s*.45,x+s*.6,y-s*.42,seed+1,2,4);
  const L1=Math.hypot(s*.45,s*.4),L2=Math.hypot(s*.7,s*.87),L=L1+L2;
  const cut=L*clamp01(progress);
  strokePts(ctx,p1,{color,width,progress:clamp01(cut/L1)});
  if(cut>L1)strokePts(ctx,p2,{color,width,progress:clamp01((cut-L1)/L2)});
}
function drawCross(ctx,x,y,s,seed,color=C.red,progress=1,width=8){
  const L=Math.hypot(s,s);
  strokePts(ctx,buildLinePts(x-s*.5,y-s*.5,x+s*.5,y+s*.5,seed,2.2,5),{color,width,progress:clamp01(progress*2)});
  if(progress>0.5)strokePts(ctx,buildLinePts(x+s*.5,y-s*.5,x-s*.5,y+s*.5,seed+1,2.2,5),{color,width,progress:clamp01((progress-0.5)*2)});
}
function drawBurst(ctx,x,y,s,seed,color=C.yellow,alpha=1){
  const R=RNG(bs(seed));
  for(let i=0;i<8;i++){const a=i/8*TAU+R.f()*.3;const r1=s*(.55+R.f()*.2),r2=s*(1+R.f()*.35);
    strokePts(ctx,buildLinePts(x+Math.cos(a)*r1,y+Math.sin(a)*r1,x+Math.cos(a)*r2,y+Math.sin(a)*r2,seed+i,1.4,3),{color,width:4,alpha});}
}
function drawStar5(ctx,x,y,r,seed,o={}){
  const{color=C.yellow,rot=0,alpha=1,stroke=true}=o;
  const R=RNG(bs(seed));const pts=[];
  for(let i=0;i<10;i++){const a=-Math.PI/2+rot+i/10*TAU;const rr=(i%2===0?r:r*.45)*(1+(R.f()-.5)*.12);
    pts.push([x+Math.cos(a)*rr,y+Math.sin(a)*rr]);}
  fillStrokePts(ctx,pts,{fill:color,stroke:stroke?C.ink:color,width:stroke?3:0,alpha});
}

/* ---------- 阴影 ---------- */
function softShadow(ctx,drawFn,dx=6,dy=8,blur=0.16){
  ctx.save();ctx.globalAlpha*=blur;ctx.translate(dx,dy);
  ctx.fillStyle='#3B3229';drawFn();ctx.restore();
}

/* ---------- 对话气泡 ---------- */
function bubble(ctx,x,y,w,h,seed,o={}){
  const{fill=C.white,tail='none',alpha=1,tx=null,ty=null,rot=0}=o;
  const R=RNG(bs(seed+5));
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(rot);
  if(tail!=='none'){
    let p1,p2,p3;
    if(tail==='bl'){p1=[-w*.28,h*.42];p2=[-w*.36,h*.75];p3=[-w*.12,h*.48];}
    else if(tail==='br'){p1=[w*.28,h*.42];p2=[w*.36,h*.75];p3=[w*.12,h*.48];}
    else if(tail==='r'){p1=[w*.44,-h*.05];p2=[w*.7,0];p3=[w*.44,h*.2];}
    else if(tail==='l'){p1=[-w*.44,-h*.05];p2=[-w*.7,0];p3=[-w*.44,h*.2];}
    fillStrokePts(ctx,[[p1[0],p1[1]],[p2[0],p2[1]],[p3[0],p3[1]]],{fill,stroke:C.ink,width:4});
  }
  jrr(ctx,-w/2,-h/2,w,h,26,seed,{fill,stroke:C.ink,width:4});
  ctx.restore();
}
function thinkBubble(ctx,x,y,r,seed,o={}){jellipseStroke(ctx,x,y,r,r*.8,seed,{color:o.color||C.ink,width:o.width||4,fill:o.fill,alpha:o.alpha||1});}

/* ---------- 便利贴/贴纸 ---------- */
function sticky(ctx,x,y,w,h,seed,o={}){
  const{fill=C.yellow,rot=0.02,alpha=1,tape=true,label=null,labelColor=C.ink}=o;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(rot);
  ctx.save();ctx.globalAlpha*=0.13;ctx.translate(6,9);
  fillPts(ctx,buildRoundRectPts(-w/2,-h/2,w,h,10,seed+98,1.2),{color:'#3B3229'});
  ctx.restore();
  const pts=buildRoundRectPts(-w/2,-h/2,w,h,10,seed,1.6);
  fillStrokePts(ctx,pts,{fill,stroke:C.ink,width:4});
  if(tape){ctx.save();ctx.globalAlpha*=0.55;ctx.translate(0,-h/2);
    const tp=buildRoundRectPts(-w*.16,-14,w*.32,26,6,seed+9,1.2);
    fillStrokePts(ctx,tp,{fill:C.white,stroke:C.graySoft,width:2});ctx.restore();}
  if(label)handText(ctx,label,0,0,Math.min(h*.42,44),{color:labelColor,seed:seed+3});
  ctx.restore();
}

/* ---------- token 卡片 ---------- */
function tokenCard(ctx,x,y,w,h,o={}){
  const{label='?',sub=null,num=null,color=C.blue,seed=1,progress=1,alpha=1,rot=0,scale=1,mood=null,shake=0,flat=false,labelFont=null,labelColor=null,labelSize=null}=o;
  if(alpha<=0)return;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x+shake*Math.sin(seed*13),y);ctx.rotate(rot);ctx.scale(scale,scale);
  ctx.save();ctx.globalAlpha*=0.15;ctx.translate(7,10);
  fillPts(ctx,buildRoundRectPts(-w/2,-h/2,w,h,16,seed+98,1.2),{color:'#3B3229'});
  ctx.restore();
  jrr(ctx,-w/2,-h/2,w,h,16,seed,{fill:C.white,stroke:C.ink,width:4});
  if(!flat){ // 顶部色带
    const band=buildRoundRectPts(-w/2+8,-h/2+8,w-16,Math.min(46,h*.28),10,seed+2,1.4);
    fillStrokePts(ctx,band,{fill:color,stroke:C.ink,width:3});
    if(num!==null)handText(ctx,num,0,-h/2+8+Math.min(46,h*.28)/2,Math.min(46,h*.28)*.6,{color:C.white,seed:seed+4,font:'Patrick Hand',weight:'bold'});
  }
  if(label)handText(ctx,label,0,flat?0:h*.08,labelSize||Math.min(w*.2,h*.3,64),{seed:seed+5,color:labelColor,font:labelFont,weight:labelFont==='Patrick Hand'?'bold':''});
  if(sub)handText(ctx,sub,0,h*.34,Math.min(24,h*.13),{color:C.gray,seed:seed+6});
  if(mood==='sad'){ // 哭脸
    jarc(ctx,-w*.13,h*.05,10,seed+20,Math.PI*0.15,Math.PI*0.85,{color:C.ink,width:3});
    jdot(ctx,-w*.2,h*.0,3.4,C.ink);jdot(ctx,-w*.06,h*.0,3.4,C.ink);
  }
  ctx.restore();
}

/* ---------- 角色 ---------- */
function drawHuman(ctx,x,y,s,seed,o={}){
  const{mood='happy',arm='down',alpha=1,rot=0,skin=C.white}=o;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(rot);ctx.scale(s,s);
  lw(ctx,4);ctx.strokeStyle=C.ink;
  // 身体
  strokePts(ctx,buildLinePts(0,26,0,86,seed,1.5,4),{width:4});
  // 腿
  strokePts(ctx,buildLinePts(0,86,-16,124,seed+1,1.5,4),{width:4});
  strokePts(ctx,buildLinePts(0,86,16,124,seed+2,1.5,4),{width:4});
  // 手臂
  if(arm==='up'){strokePts(ctx,buildLinePts(0,44,-26,18,seed+3,1.5,4),{width:4});strokePts(ctx,buildLinePts(0,44,28,4,seed+4,1.5,4),{width:4});}
  else if(arm==='point'){strokePts(ctx,buildLinePts(0,44,-24,64,seed+3,1.5,4),{width:4});strokePts(ctx,buildLinePts(0,44,34,30,seed+4,1.5,4),{width:4});}
  else{strokePts(ctx,buildLinePts(0,44,-24,72,seed+3,1.5,4),{width:4});strokePts(ctx,buildLinePts(0,44,24,72,seed+4,1.5,4),{width:4});}
  // 头
  jcircle(ctx,0,0,26,seed+5,{width:4});
  fillStrokePts(ctx,buildArcPts(0,0,26,26,seed+5,1.6,26,0,TAU),{fill:skin,stroke:C.ink,width:4});
  // 头发
  for(let i=0;i<3;i++){const a=-2.2+i*.5;strokePts(ctx,buildLinePts(Math.cos(a)*24,Math.sin(a)*24,Math.cos(a)*34,Math.sin(a)*34-4,seed+6+i,1,3),{width:3});}
  // 脸
  if(mood==='happy'){jdot(ctx,-9,-3,3,C.ink);jdot(ctx,9,-3,3,C.ink);jarc(ctx,0,4,9,seed+10,0.3,Math.PI-0.3,{width:3});}
  else if(mood==='think'){jdot(ctx,-9,-3,3,C.ink);jdot(ctx,9,-3,3,C.ink);jline(ctx,-7,12,7,12,seed+10,{width:3});}
  ctx.restore();
}
function drawRobot(ctx,x,y,s,seed,o={}){
  const{mood='ok',alpha=1,rot=0,shake=0}=o;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x+shake*Math.sin(seed*7),y);ctx.rotate(rot);ctx.scale(s,s);
  lw(ctx,4);ctx.strokeStyle=C.ink;
  // 天线
  strokePts(ctx,buildLinePts(0,-72,0,-92,seed,1.2,3),{width:4});
  jcircleFill(ctx,0,-98,7,seed+1,{fill:C.red});jcircle(ctx,0,-98,7,seed+1,{width:3});
  // 身体
  jrr(ctx,-30,28,60,58,12,seed+2,{fill:C.blueSoft,stroke:C.ink,width:4});
  jcircleFill(ctx,0,57,12,seed+3,{fill:C.yellow});jcircle(ctx,0,57,12,seed+3,{width:3});
  // 腿
  strokePts(ctx,buildLinePts(-16,86,-16,112,seed+4,1.2,3),{width:4});
  strokePts(ctx,buildLinePts(16,86,16,112,seed+5,1.2,3),{width:4});
  // 手臂
  strokePts(ctx,buildLinePts(-30,44,-50,64,seed+6,1.2,3),{width:4});
  strokePts(ctx,buildLinePts(30,44,50,24,seed+7,1.2,3),{width:4});
  // 头
  jrr(ctx,-40,-72,80,86,18,seed+8,{fill:C.white,stroke:C.ink,width:4});
  // 眼屏
  jrr(ctx,-28,-56,56,34,10,seed+9,{fill:C.ink,stroke:C.ink,width:3});
  if(mood==='dizzy'){ // X 眼
    drawCross(ctx,-13,-39,9,seed+10,C.red,1,4);drawCross(ctx,13,-39,9,seed+11,C.red,1,4);
  }else if(mood==='ok'){
    jdot(ctx,-13,-39,6,C.white);jdot(ctx,13,-39,6,C.white);
    jdot(ctx,-11,-41,2.4,C.ink);jdot(ctx,15,-41,2.4,C.ink);
  }
  // 嘴格栅
  for(let i=-1;i<=1;i++)strokePts(ctx,buildLinePts(i*8,-18,i*8,-8,seed+12+i,0.8,2),{width:3});
  ctx.restore();
}
function drawPuff(ctx,x,y,s,seed,alpha=1){ // 烟雾
  const R=RNG(bs(seed));
  for(let i=0;i<3;i++){const ox=(R.f()-.5)*s*1.6,oy=-i*s*.7;
    jellipseStroke(ctx,x+ox,y+oy,s*(.6-i*.08),s*(.45-i*.05),seed+i,{color:C.gray,width:3,alpha});}
}

/* ---------- 草莓 ---------- */
function drawStrawberry(ctx,x,y,s,seed,o={}){
  const{alpha=1,rot=0}=o;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(rot);ctx.scale(s,s);
  lw(ctx,4);
  // 叶子
  const leaves=[[-1,-0.9],[0,-1.15],[1,-0.9]];
  for(const[lx,ly]of leaves){
    fillStrokePts(ctx,[[lx*30-10,-52],[lx*44,-78],[lx*30+12,-50]],{fill:C.green,stroke:C.ink,width:3.5});
  }
  strokePts(ctx,buildLinePts(0,-56,0,-74,seed,1,3),{width:4});
  // 身体
  const body=[[0,86],[-52,10],[-56,-30],[-28,-56],[28,-56],[56,-30],[52,10]];
  const R=RNG(bs(seed));
  const bpts=[];
  for(let i=0;i<body.length;i++){const a=body[i],b=body[(i+1)%body.length];
    for(let j=0;j<4;j++){const p=j/4;bpts.push([lerp(a[0],b[0],p)+(R.f()-.5)*3,lerp(a[1],b[1],p)+(R.f()-.5)*3]);}}
  fillStrokePts(ctx,bpts,{fill:C.red,stroke:C.ink,width:4});
  // 籽
  const seeds=[[-24,-24],[0,-16],[24,-24],[-32,8],[0,16],[32,8],[-16,44],[16,44],[0,-42]];
  for(const[sx,sy]of seeds){jline(ctx,sx,sy-4,sx,sy+4,seed+sx+40,{width:3,color:C.yellowSoft});}
  // 高光
  jarc(ctx,-30,-24,14,seed+60,-2.6,-1.2,{color:C.white,width:4});
  ctx.restore();
}

/* ---------- 分词器机器 ---------- */
function drawMachine(ctx,x,y,s,t,seed,o={}){
  const{alpha=1,shake=0,label=null}=o;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x+shake*Math.sin(t*40),y);ctx.scale(s,s);
  lw(ctx,4);ctx.strokeStyle=C.ink;
  // 支脚
  strokePts(ctx,buildLinePts(-70,60,-78,86,seed,1,3),{width:5});
  strokePts(ctx,buildLinePts(70,60,78,86,seed+1,1,3),{width:5});
  // 箱体
  jrr(ctx,-90,-40,180,104,14,seed+2,{fill:C.blueSoft,stroke:C.ink,width:4});
  // 漏斗
  jpolygon(ctx,[[-58,-40],[-38,-78],[38,-78],[58,-40]],seed+3,{fill:C.yellowSoft,stroke:C.ink,width:4,amp:1.6,per:4});
  // 出料口
  jrr(ctx,56,10,44,26,8,seed+4,{fill:C.paperDark,stroke:C.ink,width:4});
  // 铆钉
  for(const[px,py]of[[-76,-24],[76,-24],[-76,44],[40,44]])jdot(ctx,px,py,3.2,C.gray);
  // 齿轮
  drawGear(ctx,-38,10,24,t*2.4,seed+5);
  drawGear(ctx,10,26,16,-t*3.1,seed+6);
  // 剪刀口动画（箱体右侧的"刀"）
  const cut=Math.abs(Math.sin(t*9))*10;
  strokePts(ctx,buildLinePts(64,-8+cut,84,4,seed+7,1,3),{width:4,color:C.gray});
  strokePts(ctx,buildLinePts(64,8-cut,84,-4,seed+8,1,3),{width:4,color:C.gray});
  if(label){handText(ctx,label,0,88,26,{seed:seed+9,color:C.ink});}
  ctx.restore();
}
function drawGear(ctx,cx,cy,r,rot,seed){
  const pts=[];const teeth=8;
  for(let i=0;i<teeth*2;i++){const a=rot+i/(teeth*2)*TAU;const rr=(i%2===0)?r:r*.72;
    pts.push([cx+Math.cos(a)*rr,cy+Math.sin(a)*rr]);}
  fillStrokePts(ctx,pts,{fill:C.graySoft,stroke:C.ink,width:3});
  jcircle(ctx,cx,cy,r*.3,seed,{width:3});
}

/* ---------- 章节标题贴纸（顶部） ---------- */
function chapterTitle(ctx,txt,t,a,b,seed,sub=null){
  if(sub&&typeof sub==='object')sub=sub.sub||null;
  const p=seg(t,a,b);if(p<=0)return;
  const x=960,y=104;
  sticky(ctx,x,y+lerp(-30,0,easeOutCubic(p)),Math.min(1180,64*txt.length*0.62+140),76,seed,{fill:C.yellow,rot:(RNG(bs(seed)).f()-.5)*0.02,alpha:easeOutCubic(p),tape:false});
  const R=RNG(bs(seed+2));
  handText(ctx,txt,x,y+lerp(-30,0,easeOutCubic(p)),38,{seed:seed+3,alpha:seg(t,a+0.15,b),color:C.ink});
  if(sub)handText(ctx,sub,x,y+58,24,{seed:seed+4,alpha:seg(t,a+0.3,b),color:C.gray});
}

/* ---------- 强调圈（手绘椭圆圈注） ---------- */
function circled(ctx,cx,cy,rx,ry,seed,o={}){
  const{color=C.red,width=5,alpha=1,progress=1,rot=0.06}=o;
  const pts=buildArcPts(cx,cy,rx,ry,seed,4,30,0.5,TAU+0.3);
  strokePts(ctx,pts.map(p=>{const c=Math.cos(rot),s=Math.sin(rot);const dx=p[0]-cx,dy=p[1]-cy;return[cx+dx*c-dy*s,cy+dx*s+dy*c];}),{color,width,alpha,progress});
}

/* ---------- 金句横幅 ---------- */
function banner(ctx,y,txt,t,a,b,seed,o={}){
  const p=seg(t,a,b);if(p<=0)return;
  const w=Math.min(1560,txt.length*62+180),h=92;
  const x=960;
  const pop=easeOutBack(p);
  ctx.save();ctx.translate(x,y);ctx.scale(pop,pop);
  sticky(ctx,0,0,w,h,seed,{fill:C.white,rot:0,tape:false,alpha:1});
  handText(ctx,txt,0,4,44,{seed:seed+2,alpha:seg(t,a+.12,b),...o});
  ctx.restore();
}
