'use strict';
/* =========================================================
   scenes_example.js —— 示例场景（主题：大模型 Tokenization）
   ★ 做新视频时参考本文件的场景写法，重写 scene1..sceneN。
   ★ 场景函数接收【全局时间 t】，内部所有 seg() 时间点与
     framework.js 中 SCENES 数组的 start/dur 保持一致。
   ★ 辅助小函数（tile/dashLine/stamp/brick/drawFish...）也在这里，
     新视频可复用或增删。

   ★★ 写字前先看这一条：参数错位是本库最高频 bug ★★
     JS 不报错，症状只有两个，且都很像"设计效果"：
       ① 该显示的文字静默消失   ② 画面上凭空多出一个数字（seed/size 被当文字画了）
     成因：调用时少传/错传了中间参数，后面每个实参整体前移。
     三个已知踩坑点：
       handText(ctx, txt, x, y, size, o)          ← 第2个是文本，x/y 是锚点
       banner(ctx, y, txt, t, a, b, seed, o)      ← ★没有 x 参数！
       badge(ctx, x, y, s, txt, seed, o)          ← 第4个是缩放 s，第5个才是文本
     自定义 helper 请统一按 (ctx, x, y, [数值...], txt, seed, o={}) 排序；
     在 translate/scale 之后绘制的元素，传给 handText 的用【局部坐标】。
     完整签名表见 handdrawn.js 顶部。
   ★★ 写完场景后必须跑：node <skill>/scripts/precheck.js scenes.js handdrawn.js framework.js
      它会自动校验所有调用点的参数个数与位置类型，退出码 0 才进入渲染。
   ========================================================= */



/* ---------- 通用：字母/字符小块 ---------- */
function tile(ctx,x,y,w,h,ch,seed,o={}){
  const{fill=C.white,stroke=C.ink,textColor=C.ink,size=null,alpha=1,scale=1,rot=0,hl=false,lw=4}=o;
  if(alpha<=0)return;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(rot);ctx.scale(scale,scale);
  ctx.save();ctx.globalAlpha*=0.13;ctx.translate(6,9);
  fillPts(ctx,buildRoundRectPts(-w/2,-h/2,w,h,14,seed+99,1.2),{color:'#3B3229'});
  ctx.restore();
  jrr(ctx,-w/2,-h/2,w,h,14,seed,{fill:hl?C.redSoft:fill,stroke:hl?C.red:stroke,width:lw});
  if(ch)handText(ctx,ch,0,0,size||h*.52,{color:textColor,seed:seed+3});
  ctx.restore();
}
/* 手绘虚线（竖直/任意方向） */
function dashLine(ctx,x1,y1,x2,y2,seed,o={}){
  const{color=C.red,width=5,dash=18,gap=12,alpha=1}=o;
  const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy),n=Math.floor(L/(dash+gap));
  for(let i=0;i<=n;i++){const p0=i*(dash+gap)/L,p1=Math.min(1,p0+dash/L);
    jline(ctx,x1+dx*p0,y1+dy*p0,x1+dx*p1,y1+dy*p1,seed+i,{color,width,alpha});}
}
/* 印章 */
function stamp(ctx,x,y,r,txt,seed,o={}){
  const{color=C.red,alpha=1,rot=-0.18}=o;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(rot);
  strokePts(ctx,buildArcPts(0,0,r,r,seed,2.5),{color,width:5,closed:true});
  handText(ctx,txt,0,1,r*1.05,{color,font:'Patrick Hand',weight:'bold',seed:seed+2});
  ctx.restore();
}
/* 砖块（token 比喻） */
function brick(ctx,x,y,w,h,seed,o={}){
  const{color=C.green,alpha=1,rot=0}=o;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.rotate(rot);
  jrr(ctx,-w/2,-h/2,w,h,8,seed,{fill:color,stroke:C.ink,width:3});
  ctx.restore();
}
/* 简单小鱼（SolidGoldMagikarp 涂鸦） */
function drawFish(ctx,x,y,s,seed,alpha=1){
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.scale(s,s);
  const body=[[50,0],[28,-26],[-8,-30],[-38,-14],[-38,14],[-8,30],[28,26]];
  fillStrokePts(ctx,buildPolyPts(body,seed,2,5),{fill:C.redSoft,stroke:C.ink,width:4});
  fillStrokePts(ctx,buildPolyPts([[-38,0],[-62,-22],[-58,0],[-62,22]],seed+1,1.6,4),{fill:C.red,stroke:C.ink,width:3.5});
  jdot(ctx,22,-8,4,C.ink);
  jarc(ctx,10,8,10,seed+2,0.2,Math.PI-0.2,{width:3});
  // 王冠
  fillStrokePts(ctx,buildPolyPts([[-10,-32],[-10,-48],[-2,-36],[6,-50],[14,-36],[22,-46],[22,-32]],seed+3,1.4,3),{fill:C.yellow,stroke:C.ink,width:3});
  ctx.restore();
}
/* 盾牌 + 裂纹 */
function drawShield(ctx,x,y,s,seed,crack=1,alpha=1){
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);ctx.scale(s,s);
  fillStrokePts(ctx,buildPolyPts([[0,-40],[34,-28],[36,6],[18,34],[0,44],[-18,34],[-36,6],[-34,-28]],seed,1.8,4),{fill:C.blueSoft,stroke:C.ink,width:4});
  if(crack>0){strokePts(ctx,buildLinePts(-6,-38,4,-12,seed+1,1.5,4),{color:C.red,width:4,progress:crack});
    if(crack>0.5)strokePts(ctx,buildLinePts(4,-12,-8,10,seed+2,1.5,4),{color:C.red,width:4,progress:(crack-0.5)*2});
    if(crack>0.8)strokePts(ctx,buildLinePts(4,-12,16,4,seed+3,1.5,4),{color:C.red,width:4,progress:(crack-0.8)*5});}
  ctx.restore();
}
/* 波浪乱纹（发疯） */
function crazyWave(ctx,x,y,w,seed,alpha=1){
  const R=RNG(bs(seed));const pts=[];
  for(let i=0;i<=18;i++){pts.push([x+w*i/18,y+Math.sin(i*1.3)*16+(R.f()-.5)*10]);}
  strokePts(ctx,pts,{color:C.red,width:4,alpha});
}
/* 汗滴 */
function sweat(ctx,x,y,seed,alpha=1){
  fillPts(ctx,[[x-7,y-10],[x+7,y-10],[x,y+12]],{color:C.blue,alpha});
}

/* =========================================================
   S1 开场钩子 (0 - 17s)
   ========================================================= */
function scene1(ctx,t){
  const seed=100;
  // --- 大标题两阶段 ---
  const p=seg(t,2.6,3.4);
  const ty=lerp(440,196,easeInOutCubic(p));
  const ts=lerp(112,58,easeInOutCubic(p));
  const pa=seg(t,0.25,0.8);
  if(pa>0){
    const pop=easeOutBack(pa);
    ctx.save();ctx.translate(960,ty);ctx.scale(pop,pop);
    handText(ctx,'AI 也会栽跟头？',0,0,ts,{stroke:{color:C.paper,width:ts*0.2},seed,rot:-0.01});
    ctx.restore();
  }
  // 问题气泡（阶段2）
  if(p>0.55){
    const bp=seg(t,3.0,3.5);
    ctx.save();ctx.globalAlpha=easeOutCubic(bp);
    // 下划线
    jline(ctx,770,252,1150,248,seed+4,{color:C.red,width:5,progress:easeOutCubic(bp)});
    ctx.restore();
  }
  // --- 草莓 ---
  const sp=seg(t,1.0,1.9);
  if(sp>0){
    drawStrawberry(ctx,1635,255+lerp(-40,0,easeOutBack(sp)),1.05*(0.6+0.4*easeOutBack(sp)),seed+7,{alpha:Math.min(1,sp*2),rot:0.08});
    if(sp>=1)handText(ctx,'strawberry',1635,368,42,{font:'Caveat',weight:'bold',seed:seed+8,color:C.red});
  }
  // --- 字母条 ---
  const letters=['s','t','r','a','w','b','e','r','r','y'];
  const x0=222,gapX=152,ly=430;
  for(let i=0;i<10;i++){
    const ap=seg(t,3.8+i*0.07,4.25+i*0.07);
    if(ap>0){
      const isR=letters[i]==='r';
      tile(ctx,x0+i*gapX+54,ly,108,108,letters[i],seed+10+i,{size:60,alpha:1,scale:easeOutBack(ap),hl:false,
        band:isR?C.red:null,fill:isR?C.white:C.paperDark});
    }
  }
  // 三个 r 圈注
  for(const[idx,ct]of[[2,6.0],[7,6.7],[8,7.4]]){
    const cp=seg(t,ct,ct+0.65);
    if(cp>0)circled(ctx,x0+idx*gapX+54,ly,66,60,seed+30+idx,{progress:cp,width:6});
  }
  if(t>7.9&&t<9.4)drawCheck(ctx,1770,432,52,seed+40,1,10);
  // --- 左：人类 ---
  const hp=seg(t,5.2,5.9);
  if(hp>0){
    drawHuman(ctx,320,826,1.25*(0.7+0.3*easeOutBack(hp)),seed+50,{alpha:easeOutCubic(hp),arm:'point',mood:'happy',rot:-0.03});
    const bp=seg(t,5.7,6.2);
    if(bp>0){
      bubble(ctx,640,762,470,112,seed+51,{alpha:easeOutBack(bp),tail:'l'});
      handText(ctx,'3 个！一眼就能数清',640,760,40,{seed:seed+52,alpha:seg(t,5.9,6.3),color:C.green});
    }
  }
  // --- 右：机器人 ---
  const rp=seg(t,9.3,10.0);
  if(rp>0){
    const dizzy=t>10.9;
    drawRobot(ctx,1592,838,1.15*(0.7+0.3*easeOutBack(rp)),seed+60,{alpha:easeOutCubic(rp),mood:dizzy?'dizzy':'ok',shake:dizzy?1.6:0});
    const bp=seg(t,9.8,10.3);
    if(bp>0){
      bubble(ctx,1290,735,330,112,seed+61,{alpha:easeOutBack(bp),tail:'r'});
      handText(ctx,'2 个',1290,733,46,{seed:seed+62,alpha:seg(t,10.0,10.4),color:C.ink});
    }
    if(t>10.9){
      const cp2=seg(t,10.9,11.4);
      drawCross(ctx,1425,700,46,seed+63,1,9);
      // 汗滴 + 冒烟
      if(t>11.6){sweat(ctx,1655,742,seed+64,0.5+0.5*Math.sin(t*6));
        drawPuff(ctx,1560,690,20,seed+65,0.5);
        drawPuff(ctx,1622,664,24,seed+66,0.7);}
    }
  }
  // 小标签
  if(hp>=1)handText(ctx,'人类',320,990,26,{seed:seed+70,color:C.gray});
  if(rp>=1)handText(ctx,'大模型',1592,998,26,{seed:seed+71,color:C.gray});
  // --- 底部悬念 ---
  const qp=seg(t,14.4,15.2);
  if(qp>0){
    ctx.save();ctx.translate(960,995);ctx.scale(easeOutBack(qp),easeOutBack(qp));
    handText(ctx,'问题出在 AI「认字」的方式上 →',0,0,50,{seed:seed+80,alpha:easeOutCubic(qp),stroke:{color:C.paper,width:8},color:C.ink,rot:-0.005});
    ctx.restore();
  }
}

/* =========================================================
   S2 模型眼中的文字 (17 - 43s)
   ========================================================= */
function scene2(ctx,t){
  const seed=200;
  chapterTitle(ctx,'① 模型读到的不是字，是带编号的拼图',t,17.3,18.1,seed);
  // --- 人类视角 ---
  const wp=seg(t,19.0,19.7);
  if(wp>0){
    ctx.save();ctx.translate(lerp(160,340,easeOutCubic(wp)),402);ctx.globalAlpha=easeOutCubic(wp);
    handText(ctx,'strawberry',0,0,92,{font:'Caveat',weight:'bold',seed:seed+2,rot:-0.02});
    ctx.restore();
    handText(ctx,'我们看到的',340,478,26,{seed:seed+3,color:C.gray,alpha:seg(t,19.6,20.1)});
  }
  // --- 机器 ---
  const mp=seg(t,20.5,21.6);
  if(mp>0){
    drawMachine(ctx,lerp(1500,1230,easeOutCubic(mp)),378,1.35,t,seed+5,{alpha:easeOutCubic(mp),shake:t>22.8?1.2:0,label:'分词器 Tokenizer'});
  }
  // 箭头
  const ap=seg(t,22.6,23.4);
  if(ap>0)drawArrow(ctx,540,404,1046,398,seed+6,{progress:easeOutCubic(ap),width:6,curve:0.12});
  // 咔嚓火花
  if(t>23.2&&t<25.2&&Math.floor(t*8)%2===0)drawBurst(ctx,1312,416,34,seed+7,C.yellow,0.9);
  // --- token 掉落 ---
  const cards=[{x:935,label:'straw',num:'# 39935',color:C.blue,st:25.2,flip:28.6},{x:1215,label:'berry',num:'# 15717',color:C.yellow,st:26.0,flip:29.6}];
  for(let i=0;i<cards.length;i++){
    const c=cards[i],cp=seg(t,c.st,c.st+0.65);
    if(cp<=0)continue;
    const fl=seg(t,c.flip,c.flip+0.55);
    // 掉落
    const y=lerp(470,628,easeInCubic(cp));
    let sx=1,content=c.label,txtColor=C.ink;
    if(fl>0){ // 翻面
      sx=Math.abs(Math.cos(Math.PI*fl));
      if(fl>0.5){content=c.num;txtColor=C.red;}
    }
    ctx.save();ctx.translate(c.x,y);ctx.scale(Math.max(0.02,sx),1);ctx.translate(-c.x,-y);
    const flipped=content===c.num;
    tokenCard(ctx,c.x,y,238,128,{label:content,color:c.color,seed:seed+10+i,progress:1,alpha:easeOutCubic(cp),
      rot:(1-cp)*0.25,flat:flipped,labelFont:flipped?'Patrick Hand':null,labelColor:flipped?C.red:null,labelSize:flipped?46:null});
    ctx.restore();
    if(cp>=1&&t>c.st+0.5&&Math.floor((t-c.st)*8)%3===0&&t<c.flip)drawBurst(ctx,c.x,700,26,seed+14+i,C.yellow,0.8);
  }
  handText(ctx,'每块拼图 = 一个 token',1072,742,34,{seed:seed+20,alpha:seg(t,27.0,27.7),color:C.ink});
  handText(ctx,'token ＝ 带编号的字块',1072,786,24,{seed:seed+21,color:C.gray,alpha:seg(t,27.2,27.9)});
  // --- 结论 ---
  const kp=seg(t,31.5,32.3);
  if(kp>0){
    ctx.save();ctx.translate(960,846);ctx.scale(easeOutBack(kp),easeOutBack(kp));
    handText(ctx,'模型看到的不是字母，是一串数字',0,0,52,{seed:seed+22,alpha:easeOutCubic(kp),stroke:{color:C.paper,width:10},rot:-0.004});
    ctx.restore();
  }
  // --- 小剧场：换个字母 ---
  const zone=seg(t,37.5,38.2);
  if(zone>0){
    const zy=968;
    // 左卡
    const l1=seg(t,37.7,38.3);
    if(l1>0)tile(ctx,330,zy,300,86,'strawberry',seed+30,{size:42,scale:easeOutBack(l1),alpha:easeOutCubic(l1),fill:C.white});
    // 箭头 + 标注
    const a1=seg(t,38.4,39.1);
    if(a1>0){
      drawArrow(ctx,505,zy-8,830,zy-8,seed+31,{progress:easeOutCubic(a1),width:6,curve:-0.1,color:C.red});
      handText(ctx,'把 r 全换成 z',672,zy-56,27,{seed:seed+32,alpha:seg(t,38.7,39.2),color:C.red});
    }
    // 右卡（碎裂乱码）
    const l2=seg(t,39.2,39.9);
    if(l2>0){
      ctx.save();ctx.translate(1120,zy);ctx.rotate(0.03);ctx.scale(easeOutBack(l2),easeOutBack(l2));
      tile(ctx,0,0,420,86,'',seed+33,{fill:C.graySoft,alpha:1});
      handText(ctx,'sztawbezzy',0,0,42,{font:'Caveat',weight:'bold',seed:seed+34,color:C.gray});
      // 裂纹
      strokePts(ctx,buildLinePts(-150,-38,-90,8,seed+35,2,4),{color:C.gray,width:3});
      strokePts(ctx,buildLinePts(40,-40,90,14,seed+36,2,4),{color:C.gray,width:3});
      ctx.restore();
      if(t>40.2)drawPuff(ctx,1382,zy-58,16,seed+37,0.55);
    }
    // 懵掉的机器人
    const rb=seg(t,40.4,41.0);
    if(rb>0){
      drawRobot(ctx,1520,zy-4,0.6*(0.7+0.3*easeOutBack(rb)),seed+38,{alpha:easeOutCubic(rb),mood:'dizzy'});
      handText(ctx,'拼图被打碎，模型当场懵住',1120,zy+62,24,{seed:seed+39,alpha:seg(t,40.9,41.5),color:C.gray});
    }
  }
}

/* =========================================================
   S3 BPE 算法演示 (43 - 73s)
   ========================================================= */
/* 渲染 BPE 字母行；groups=[['l','o','w'],...] 每组一个块；hi={row,idx0,idx1} 高亮 */
function bpeRow(ctx,groups,y,seed,appearT,t,hi){
  let x=270;
  for(let i=0;i<groups.length;i++){
    const g=groups[i];
    const wTxt=34+(g.length-1)*30;
    const w=Math.max(64,26+g.length*30);
    const ap=seg(t,appearT+i*0.06,appearT+0.35+i*0.06);
    if(ap<=0){x+=w+22;continue;}
    const isHi=hi&&hi.row===groups.rowIndex&&i>=hi.idx0&&i<=hi.idx1;
    const flash=isHi?0.75+0.25*Math.sin(t*10):1;
    ctx.save();ctx.globalAlpha*=flash;
    tile(ctx,x+w/2,y,w,72,g,seed+i*3+(groups.rowIndex*31),{size:40,scale:easeOutBack(ap),
      fill:isHi?C.redSoft:C.paperDark,stroke:isHi?C.red:C.ink,hl:false});
    ctx.restore();
    x+=w+22;
  }
  return x;
}
function scene3(ctx,t){
  const seed=300;
  chapterTitle(ctx,'② 拼图块不是人定的，是算法统计出来的',t,43.3,44.1,seed,{sub:'BPE · Byte Pair Encoding 字节对编码'});
  handText(ctx,'没有语言学家编字典 —— 算法在海量文本里自己找规律',960,208,32,{seed:seed+2,alpha:seg(t,45.2,45.9),color:C.gray});
  // 语料卡
  const c1=seg(t,47.0,47.7),c2=seg(t,47.5,48.2);
  if(c1>0){
    ctx.save();ctx.translate(560,312);ctx.rotate(-0.02);ctx.scale(easeOutBack(c1),easeOutBack(c1));
    tile(ctx,0,0,300,92,'low',seed+5,{size:48,fill:C.white});
    stamp(ctx,150,-38,30,'×5',seed+6,{alpha:seg(t,47.4,47.9)});
    ctx.restore();
    handText(ctx,'语料里出现 5 次',560,382,24,{seed:seed+7,color:C.gray,alpha:seg(t,47.8,48.4)});
  }
  if(c2>0){
    ctx.save();ctx.translate(1230,312);ctx.rotate(0.018);ctx.scale(easeOutBack(c2),easeOutBack(c2));
    tile(ctx,0,0,340,92,'lower',seed+8,{size:48,fill:C.white});
    stamp(ctx,168,-38,30,'×2',seed+9,{alpha:seg(t,47.9,48.4)});
    ctx.restore();
    handText(ctx,'语料里出现 2 次',1230,382,24,{seed:seed+10,color:C.gray,alpha:seg(t,48.3,48.9)});
  }
  // 字母行状态
  const stages=[
    {r1:['l','o','w'],r2:['l','o','w','e','r'],t:50.0},
    {r1:['lo','w'],r2:['lo','w','e','r'],t:59.2},
    {r1:['low'],r2:['low','e','r'],t:64.6},
    {r1:['low'],r2:['low','er'],t:67.6}
  ];
  // 选当前 stage（取 t 之前最新的）
  let st=stages[0];
  for(const s of stages)if(t>=s.t)st=s;
  // 行标签
  handText(ctx,'×5',236,442,26,{font:'Patrick Hand',weight:'bold',color:C.gray,seed:seed+11,alpha:seg(t,50,50.4)});
  handText(ctx,'×2',236,542,26,{font:'Patrick Hand',weight:'bold',color:C.gray,seed:seed+12,alpha:seg(t,50,50.4)});
  const rowShift={r1:st.r1,r2:st.r2};
  rowShift.r1.rowIndex=0;rowShift.r2.rowIndex=1;
  // 高亮
  let hi=null;
  if(t>=53.0&&t<56.4)hi={row:0,idx0:0,idx1:1};
  if(t>=61.0&&t<64.0)hi={row:0,idx0:0,idx1:1};
  bpeRow(ctx,st.r1,442,seed+13,st.t,t,hi);
  bpeRow(ctx,st.r2,542,seed+14,st.t+0.15,t,hi);
  // 第 1 步标注
  if(t>=53.0&&t<59.4){
    const p=seg(t,53.2,53.9);
    handText(ctx,'数一数：相邻的「l+o」',990,442,30,{align:'left',seed:seed+15,alpha:easeOutCubic(p),color:C.ink});
    handText(ctx,'两词里共出现 5+2 = 7 次 → 最高频！',990,490,30,{align:'left',seed:seed+16,alpha:seg(t,53.8,54.5),color:C.red});
  }
  // 合并块展示
  const merges=[
    {x:760,label:'lo',color:C.red,st:56.4,note:'合并！'},
    {x:1010,label:'low',color:C.yellow,st:61.6,note:'再合并！'},
    {x:1260,label:'lower',color:C.purple,st:67.9,note:'……一直合并下去',ghost:true}
  ];
  for(const m of merges){
    const p=seg(t,m.st,m.st+0.55);
    if(p<=0)continue;
    ctx.save();ctx.globalAlpha=m.ghost?0.92:1;
    tile(ctx,m.x,672,210,104,m.label,seed+20+m.label.length,{size:52,scale:easeOutBack(p),
      fill:m.color===C.red?C.redSoft:m.color===C.yellow?C.yellowSoft:C.purpleSoft,
      stroke:m.color,width:5,alpha:easeOutCubic(p)});
    handText(ctx,m.note,m.x,756,26,{seed:seed+21,color:C.gray,alpha:seg(t,m.st+0.3,m.st+0.8)});
    ctx.restore();
    if(t>m.st&&t<m.st+0.8)drawBurst(ctx,m.x,672,44,seed+22,C.yellow,1);
  }
  // 底部行
  handText(ctx,'循环往复，常见的前缀、词根、整词就「长」了出来',660,852,32,{seed:seed+25,alpha:seg(t,68.6,69.3),color:C.ink});
  // 右侧步骤贴纸
  const steps=[
    {y:352,l1:'第 1 步',l2:'找出出现最多的相邻对',st:53.4},
    {y:478,l1:'第 2 步',l2:'把它俩合并成新字块',st:61.2},
    {y:604,l1:'第 3 步',l2:'重复，直到字块表够大',st:66.2}
  ];
  for(const s of steps){
    const p=seg(t,s.st,s.st+0.5);
    if(p<=0)continue;
    ctx.save();ctx.translate(1630,s.y);ctx.rotate((RNG(bs(seed+30)).f()-.5)*0.03);
    sticky(ctx,0,0,470,96,seed+30+s.y,{fill:C.yellowSoft,rot:0,alpha:easeOutCubic(p),tape:false});
    handText(ctx,s.l1,-150,0,30,{seed:seed+31,color:C.red,align:'center',alpha:seg(t,s.st+0.1,s.st+0.4),weight:''});
    handText(ctx,s.l2,40,0,27,{seed:seed+32,align:'center',alpha:seg(t,s.st+0.15,s.st+0.45)});
    ctx.restore();
  }
  // 结论贴纸
  const cp=seg(t,69.4,70.2);
  if(cp>0){
    ctx.save();ctx.translate(1630,790);ctx.scale(easeOutBack(cp),easeOutBack(cp));
    sticky(ctx,0,0,470,180,seed+40,{fill:C.greenSoft,rot:0.015,alpha:1,tape:true});
    handLines(ctx,['高频组合 → 越长越大','序列更短，算得更快'],0,-18,30,44,{seed:seed+41,alpha:seg(t,69.6,70.3)});
    handText(ctx,'小贪心 ≠ 全局最优（够用的工程折中）',0,58,22,{seed:seed+42,color:C.gray,alpha:seg(t,69.9,70.6)});
    ctx.restore();
  }
}


/* =========================================================
   S4 代价一：算术 (73 - 97s)
   ========================================================= */
function scene4(ctx,t){
  const seed=400;
  chapterTitle(ctx,'③ 代价一：数学题容易算错',t,73.3,74.1,seed,{sub:'数字被打包后，数位结构对模型几乎是隐形的'});
  // 大数字
  const np=seg(t,75.5,76.3);
  if(np>0){
    ctx.save();ctx.translate(960,300);ctx.scale(easeOutBack(np),easeOutBack(np));
    handText(ctx,'8675309',0,0,132,{font:'Patrick Hand',weight:'bold',seed:seed+2,alpha:easeOutCubic(np),stroke:{color:C.paper,width:16}});
    ctx.restore();
  }
  // 切割虚线
  for(const cx of [860,1060]){
    const cp=seg(t,77.0+(cx-860)/200*0.4,77.5+(cx-860)/200*0.4);
    if(cp>0)dashLine(ctx,cx,222,cx,372,seed+3+cx,{alpha:cp});
  }
  handText(ctx,'每 3 位一组，从左往右切',960,452,32,{seed:seed+4,color:C.gray,alpha:seg(t,81.6,82.3)});
  // 三块 token
  const blocks=[{x:730,w:270,label:'867',color:C.blue,st:78.6},{x:1010,w:270,label:'530',color:C.yellow,st:79.2},{x:1250,w:170,label:'9',color:C.red,st:79.8}];
  for(let i=0;i<blocks.length;i++){
    const b=blocks[i],p=seg(t,b.st,b.st+0.6);
    if(p<=0)continue;
    tokenCard(ctx,b.x,lerp(320,560,easeInCubic(p)),b.w,110,{label:b.label,color:b.color,seed:seed+5+i,
      alpha:easeOutCubic(p),rot:(1-p)*0.3});
  }
  // 对比区
  // 左：人类竖式
  const lp=seg(t,84.0,84.7);
  if(lp>0){
    drawHuman(ctx,330,842,1.05*(0.7+0.3*easeOutBack(lp)),seed+10,{alpha:easeOutCubic(lp),arm:'point',rot:-0.03});
    const cp2=seg(t,84.4,85.1);
    if(cp2>0){
      ctx.save();ctx.translate(700,790);ctx.scale(easeOutBack(cp2),easeOutBack(cp2));
      tile(ctx,0,0,440,230,'',seed+11,{fill:C.white});
      handText(ctx,'867',-95,-64,52,{font:'Patrick Hand',weight:'bold',align:'right',seed:seed+12,alpha:seg(t,84.7,85.1)});
      handText(ctx,'+ 530',-95,4,52,{font:'Patrick Hand',weight:'bold',align:'right',seed:seed+13,alpha:seg(t,84.9,85.3)});
      jline(ctx,-170,44,10,40,seed+14,{width:4,alpha:seg(t,85.1,85.5)});
      handText(ctx,'1397',-95,86,52,{font:'Patrick Hand',weight:'bold',align:'right',seed:seed+15,color:C.blue,alpha:seg(t,85.3,85.8)});
      ctx.restore();
      // 从右往左箭头
      const ap=seg(t,86.0,86.8);
      drawArrow(ctx,890,936,560,936,seed+16,{color:C.red,width:6,progress:easeOutCubic(ap),curve:-0.15});
      handText(ctx,'人类竖式：从右往左，个位算起',725,982,28,{seed:seed+17,alpha:seg(t,86.6,87.2)});
    }
  }
  // 右：模型
  const rp=seg(t,85.6,86.3);
  if(rp>0){
    drawRobot(ctx,1180,842,1.05*(0.7+0.3*easeOutBack(rp)),seed+20,{alpha:easeOutCubic(rp),mood:'ok'});
    const cp2=seg(t,86.0,86.7);
    if(cp2>0){
      ctx.save();ctx.translate(1490,790);ctx.scale(easeOutBack(cp2),easeOutBack(cp2));
      tile(ctx,0,0,420,230,'',seed+21,{fill:C.white});
      tokenCard(ctx,-95,-42,160,72,{label:'867',color:C.blue,seed:seed+22});
      tokenCard(ctx,75,-42,160,72,{label:'530',color:C.yellow,seed:seed+23});
      ctx.restore();
      // 掉队的 9
      const p9=seg(t,87.6,88.4);
      if(p9>0){
        ctx.save();ctx.translate(lerp(1610,1750,easeOutCubic(p9)),lerp(770,872,easeOutCubic(p9)));ctx.rotate(lerp(0,0.3,easeOutCubic(p9)));
        tokenCard(ctx,0,0,130,84,{label:'9',color:C.red,seed:seed+24,scale:easeOutBack(p9),mood:'sad'});
        ctx.restore();
        handText(ctx,'孤零零的个位',1750,948,24,{seed:seed+25,color:C.red,alpha:seg(t,88.4,89.0)});
      }
      const ap=seg(t,86.8,87.6);
      drawArrow(ctx,1330,936,1650,936,seed+26,{color:C.blue,width:6,progress:easeOutCubic(ap),curve:-0.15});
      handText(ctx,'模型读到：从左往右，三位一组',1490,982,28,{seed:seed+27,alpha:seg(t,87.4,88.0)});
    }
  }
  // 金句
  const bp=seg(t,90.8,91.6);
  if(bp>0){
    ctx.save();ctx.translate(960,1000);ctx.scale(easeOutBack(bp),easeOutBack(bp));
    sticky(ctx,0,0,1180,86,seed+30,{fill:C.white,rot:-0.004,tape:false});
    handText(ctx,'数位权重被打乱 → 多位数运算经常出错',0,2,40,{seed:seed+31,alpha:seg(t,91.0,91.7),color:C.red});
    ctx.restore();
  }
  handText(ctx,'反证：让模型直接读字节的版本，算术和「数字母」都会变好',960,1052,24,{seed:seed+32,color:C.gray,alpha:seg(t,92.6,93.3)});
}

/* =========================================================
   S5 代价二：语言不平等 (97 - 119s)
   ========================================================= */
function scene5(ctx,t){
  const seed=500;
  chapterTitle(ctx,'④ 代价二：说不同语言，价格不一样',t,97.3,98.1,seed,{sub:'API 按 token 计费，输出比输入更贵'});
  // 条形图
  const bars=[
    {y:352,label:'English',sub:'Hello, how are you?',n:6,color:C.green,st:101.0},
    {y:478,label:'中文',sub:'你好，你怎么样？',n:13,color:C.yellow,st:102.2},
    {y:604,label:'缅甸语',sub:'同样的问候',n:21,color:C.red,st:103.4}
  ];
  handText(ctx,'同一句话的 token 数（示意）',250,272,34,{align:'left',seed:seed+2,alpha:seg(t,100.2,100.9),color:C.ink});
  for(const b of bars){
    const p=seg(t,b.st,b.st+1.1);
    if(p<=0)continue;
    const w=lerp(0,b.n*42,easeOutCubic(p));
    // 语言标签
    handText(ctx,b.label,560,b.y-20,34,{align:'right',seed:seed+3,color:C.ink,alpha:easeOutCubic(p)});
    handText(ctx,b.sub,560,b.y+22,22,{align:'right',seed:seed+4,color:C.gray,alpha:easeOutCubic(p)});
    // 条
    ctx.save();ctx.globalAlpha=0.9;
    fillStrokePts(ctx,buildRoundRectPts(600,b.y-36,w,72,12,seed+5+b.y,1.6),{fill:b.color,stroke:C.ink,width:3.5});
    ctx.restore();
    // 数字
    if(p>0.9){
      const np2=seg(t,b.st+1.0,b.st+1.4);
      ctx.save();ctx.translate(620+w+56,b.y);ctx.scale(easeOutBack(np2),easeOutBack(np2));
      handText(ctx,String(b.n),0,0,46,{font:'Patrick Hand',weight:'bold',color:b.color,seed:seed+6});
      handText(ctx,'tokens',0,32,18,{font:'Patrick Hand',color:C.gray,seed:seed+7});
      ctx.restore();
    }
  }
  handText(ctx,'* 同一句话，不同语言切出来的 token 数相差好几倍（近似示意）',300,690,22,{align:'left',seed:seed+8,color:C.gray,alpha:seg(t,104.8,105.5)});
  // 数据卡
  const dp=seg(t,107.5,108.3);
  if(dp>0){
    ctx.save();ctx.translate(880,852);ctx.scale(easeOutBack(dp),easeOutBack(dp));
    sticky(ctx,0,0,1140,178,seed+10,{fill:C.white,rot:-0.005,tape:true});
    handText(ctx,'《世界人权宣言》用 GPT-4o 生成，费用 ÷ 当地时薪',0,-52,30,{seed:seed+11,alpha:seg(t,107.7,108.4)});
    handText(ctx,'= 民众要打工换钱的秒数：美国 vs 缅甸',0,0,30,{seed:seed+12,alpha:seg(t,107.9,108.6)});
    handText(ctx,'相差 54.3 倍',0,58,50,{seed:seed+13,color:C.red,font:'Patrick Hand',weight:'bold',alpha:seg(t,108.3,109.0)});
    ctx.restore();
  }
  // 两个搬砖小人
  const p1=seg(t,109.4,110.1);
  if(p1>0){
    drawHuman(ctx,180,892,1.0*(0.7+0.3*easeOutBack(p1)),seed+15,{alpha:easeOutCubic(p1),arm:'up'});
    const bp1=seg(t,109.7,110.3);
    if(bp1>0){brick(ctx,180,752,64,42,seed+16,{color:C.green,scale:easeOutBack(bp1)});handText(ctx,'轻松',180,700,24,{seed:seed+17,color:C.green,alpha:bp1});}
  }
  const p2=seg(t,110.0,110.7);
  if(p2>0){
    drawHuman(ctx,1755,902,1.0*(0.7+0.3*easeOutBack(p2)),seed+18,{alpha:easeOutCubic(p2),arm:'down',rot:0.06});
    for(let i=0;i<5;i++){
      const bp2=seg(t,110.2+i*0.1,110.7+i*0.1);
      if(bp2>0)brick(ctx,1755,742-i*48,64,42,seed+19+i,{color:C.redSoft,scale:easeOutBack(bp2)});
    }
    if(t>111.2){sweat(ctx,1812,772,seed+25,0.6+0.4*Math.sin(t*5));handText(ctx,'吃力…',1852,742,24,{seed:seed+26,color:C.red,alpha:seg(t,111.2,111.8)});}
  }
  handText(ctx,'注意力计算量 ∝ 序列长度的平方：token 翻倍，算力约 ×4',960,1000,28,{seed:seed+30,color:C.gray,alpha:seg(t,114.6,115.4)});
}

/* =========================================================
   S6 代价三：安全与垄断 (119 - 141s)
   ========================================================= */
function scene6(ctx,t){
  const seed=600;
  chapterTitle(ctx,'⑤ 代价三：看不见的漏洞与垄断',t,119.3,120.1,seed,{sub:'有些字块「分词器认识，模型却没学过」'});
  // ---- 左区：SolidGoldMagikarp ----
  const z1=seg(t,121.0,121.6);
  if(z1>0){
    ctx.save();ctx.translate(500,330);ctx.scale(easeOutBack(z1),easeOutBack(z1));
    tile(ctx,0,0,700,116,'',seed+2,{fill:C.white});
    handText(ctx,'SolidGoldMagikarp',0,-18,46,{font:'Patrick Hand',weight:'bold',seed:seed+3,color:C.ink});
    handText(ctx,'「纯金鲤鱼王」· 一个游戏网名',0,34,24,{seed:seed+4,color:C.gray});
    ctx.restore();
    const fp=seg(t,122.2,123.0);
    if(fp>0)drawFish(ctx,166,520,1.1,seed+5,fp);
    handLines(ctx,['分词器语料里它高频出现，','模型的正文语料里却几乎没见过 →','它的向量接近「随机噪声」，一出现就捣乱'],560,474,30,46,{seed:seed+6,alpha:seg(t,122.4,123.6)});
    if(t>124.0){crazyWave(ctx,320,600,430,seed+7,seg(t,124,124.6));handText(ctx,'模型开始胡言乱语…',536,668,24,{seed:seed+8,color:C.red,alpha:seg(t,124.4,125.0)});}
  }
  // ---- 右区：隐形字符 ----
  const z2=seg(t,127.2,127.8);
  if(z2>0){
    handText(ctx,'肉眼看起来：一模一样！',1420,258,30,{seed:seed+10,alpha:easeOutCubic(z2),color:C.ink});
    const a1=seg(t,127.4,128.1),a2=seg(t,127.9,128.6);
    if(a1>0){
      ctx.save();ctx.translate(1265,382);ctx.scale(easeOutBack(a1),easeOutBack(a1));
      tile(ctx,0,0,210,160,'a',seed+11,{size:86,fill:C.white});
      handText(ctx,'拉丁字母',0,100,24,{seed:seed+12,color:C.gray});
      ctx.restore();
    }
    if(a2>0){
      ctx.save();ctx.translate(1575,382);ctx.scale(easeOutBack(a2),easeOutBack(a2));
      tile(ctx,0,0,210,160,'а',seed+13,{size:86,fill:C.white});
      handText(ctx,'西里尔字母',0,100,24,{seed:seed+14,color:C.gray});
      ctx.restore();
    }
    handText(ctx,'vs',1420,382,34,{font:'Caveat',weight:'bold',seed:seed+15,color:C.gray,alpha:seg(t,128.6,129.0)});
    if(t>129.2)drawArrow(ctx,1420,478,1420,540,seed+16,{width:5,progress:seg(t,129.2,129.8),curve:0});
    handLines(ctx,['分词器：彻底乱套 → 敏感词被切成无关碎片','→ 轻松绕过内容安全审核'],1420,596,28,44,{seed:seed+17,alpha:seg(t,129.8,130.8),color:C.ink});
    drawShield(ctx,1770,382,1.15,seed+18,seg(t,130.6,131.4),seg(t,130.4,131.0));
  }
  // ---- 数据横幅 ----
  const bp=seg(t,133.4,134.2);
  if(bp>0){
    ctx.save();ctx.translate(960,800);ctx.scale(easeOutBack(bp),easeOutBack(bp));
    sticky(ctx,0,0,1290,96,seed+20,{fill:C.yellow,rot:-0.004,tape:false});
    ctx.save();ctx.translate(-510,2);
    handText(ctx,'94%',0,0,56,{font:'Patrick Hand',weight:'bold',color:C.red,seed:seed+21,alpha:seg(t,133.6,134.3)});
    ctx.restore();
    handText(ctx,'的开源模型，直接用「别人的分词器」',40,0,42,{seed:seed+22,alpha:seg(t,133.7,134.5)});
    ctx.restore();
  }
  const c1=seg(t,135.2,135.9);
  if(c1>0){
    ctx.save();ctx.translate(560,940);ctx.scale(easeOutBack(c1),easeOutBack(c1));
    tile(ctx,0,0,760,96,'',seed+25,{fill:C.white});
    handText(ctx,'下载量第一：2018 年的 BERT 分词器 · 占 23.2%',0,0,28,{seed:seed+26,alpha:seg(t,135.4,136.1)});
    ctx.restore();
  }
  const c2=seg(t,136.2,136.9);
  if(c2>0){
    ctx.save();ctx.translate(1430,940);ctx.rotate(0.015);ctx.scale(easeOutBack(c2),easeOutBack(c2));
    sticky(ctx,0,0,560,100,seed+27,{fill:C.yellowSoft,rot:0,tape:true});
    handText(ctx,'冷知识：Claude 反向缩小词表 49K → 16K',0,0,25,{seed:seed+28,alpha:seg(t,136.4,137.1)});
    ctx.restore();
  }
}

/* =========================================================
   S7 未来：换一种认字法 (141 - 159s)
   ========================================================= */
function card7(ctx,cx,cy,w,h,title,sub,seed,drawFig,o={}){
  const{color=C.blue,alpha=1,scale=1,lines=[]}=o;
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(cx,cy);ctx.scale(scale,scale);
  ctx.save();ctx.globalAlpha*=0.14;ctx.translate(8,10);
  fillPts(ctx,buildRoundRectPts(-w/2,-h/2,w,h,20,seed+98,1.2),{color:'#3B3229'});
  ctx.restore();
  jrr(ctx,-w/2,-h/2,w,h,20,seed,{fill:C.white,stroke:C.ink,width:4});
  fillStrokePts(ctx,buildRoundRectPts(-w/2+10,-h/2+10,w-20,74,12,seed+1,1.5),{fill:color,stroke:C.ink,width:3});
  handText(ctx,title,0,-h/2+47,42,{font:'Patrick Hand',weight:'bold',color:C.white,seed:seed+2});
  handText(ctx,sub,0,-h/2+118,29,{seed:seed+3});
  if(drawFig)drawFig(ctx,-w/2,60,seed);
  lines.forEach((ln,i)=>handText(ctx,ln[0],0,224+i*44,ln[2]||26,{color:ln[1]||C.gray,seed:seed+4+i}));
  ctx.restore();
}
function scene7(ctx,t){
  const seed=700;
  chapterTitle(ctx,'⑥ 能不能换一种「认字法」？',t,141.3,142.1,seed);
  const cards=[
    {cx:330,cy:545,st:143.2,color:C.green,title:'ByT5',sub:'直接读字节',
     fig:(ctx,ox,oy,s)=>{
       for(let r=0;r<2;r++)for(let i=0;i<7;i++){
         const ap=seg(t,144.0+r*0.3+i*0.06,144.35+r*0.3+i*0.06);
         if(ap>0)tile(ctx,ox+255+(i-3)*70, oy-45+r*70, 56,56, RNG(bs(s+i+r*9)).pick(['0','1']),s+i+r*7,{size:26,scale:easeOutBack(ap),fill:C.greenSoft});
       }
       handText(ctx,'…',ox+255+4*70,oy+25,32,{seed:s+40});
     },
     lines:[['✓ 256 个字节单元，覆盖一切语言',C.green],['✓ 彻底告别「生词」',C.green],['✗ 序列膨胀数倍，生成太慢',C.red]]},
    {cx:960,cy:545,st:145.4,color:C.blue,title:'BLT',sub:'动态下刀（Meta）',
     fig:(ctx,ox,oy,s)=>{
       const R=RNG(bs(s));const pts=[];
       for(let i=0;i<=20;i++){pts.push([ox+90+i*22, oy-10-Math.abs(Math.sin(i*0.55))*44-(R.f()-.5)*8]);}
       strokePts(ctx,pts,{color:C.blue,width:5,alpha:seg(t,146.2,147.2)});
       for(const[cut,ct]of[[pts[6],146.6],[pts[13],147.0],[pts[18],147.4]]){
         const cp=seg(t,ct,ct+0.4);
         if(cp>0){dashLine(ctx,cut[0],oy-64,cut[0],oy+56,s+cut[0],{color:C.red,alpha:cp,dash:12,gap:9,width:4});}
       }
       handText(ctx,'信息量飙升处 = 词的边界',ox+270,oy+100,22,{seed:s+50,color:C.gray,alpha:seg(t,147.4,148.0)});
     },
     lines:[['实时预测下一个字节的信息量',C.gray],['信息量飙升的地方，才切一刀',C.gray],['把「怎么切」交给模型自己',C.blue]]},
    {cx:1590,cy:545,st:147.6,color:C.purple,title:'PIXEL',sub:'文字当图片看',
     fig:(ctx,ox,oy,s)=>{
       const fp=seg(t,148.4,149.2);
       if(fp>0){
         ctx.save();ctx.translate(ox+270,oy+5);ctx.scale(easeOutBack(fp),easeOutBack(fp));
         jrr(ctx,-140,-85,280,170,10,s,{fill:C.paperDark,stroke:C.ink,width:4});
         handText(ctx,'A 文 中',-20,0,48,{seed:s+2,color:C.ink,alpha:1});
         jrr(ctx,62,-32,64,64,8,s+3,{fill:C.purpleSoft,stroke:C.purple,width:3});
         handText(ctx,'?',94,2,36,{font:'Caveat',weight:'bold',color:C.purple,seed:s+4});
         ctx.restore();
       }
       handText(ctx,'22M 参数 ≈ 86M BERT 的成绩',ox+270,oy+135,22,{seed:s+60,color:C.gray,alpha:seg(t,149.2,149.8)});
     },
     lines:[['把文字渲染成图像，像「看图」认字',C.gray],['跨语种、生僻字形表现很好',C.gray],['难点：输出端还要转回文字',C.red]]}
  ];
  for(const c of cards){
    const p=seg(t,c.st,c.st+0.7);
    if(p<=0)continue;
    card7(ctx,c.cx,c.cy+lerp(-50,0,easeOutCubic(p)),540,650,c.title,c.sub,seed+c.cx,
      c.fig,{color:c.color,alpha:easeOutCubic(p),scale:easeOutBack(p),lines:c.lines});
  }
  handText(ctx,'各有亮点 —— 但换掉「认字地基」，训练和评测的成本还很高',960,948,32,{seed:seed+90,alpha:seg(t,155.2,156.0),color:C.ink});
}

/* =========================================================
   S8 结尾 (159 - 170s)
   ========================================================= */
function scene8(ctx,t){
  const seed=800;
  const p1=seg(t,159.4,160.2);
  if(p1>0){
    ctx.save();ctx.translate(960,368);ctx.scale(easeOutBack(p1),easeOutBack(p1));
    handText(ctx,'下次 AI 犯傻，',0,0,74,{seed,alpha:easeOutCubic(p1),stroke:{color:C.paper,width:12},rot:-0.008});
    ctx.restore();
    const p1b=seg(t,160.0,160.8);
    if(p1b>0){
      ctx.save();ctx.translate(960,470);ctx.scale(easeOutBack(p1b),easeOutBack(p1b));
      handText(ctx,'先别急着说它笨',0,0,74,{seed:seed+1,alpha:easeOutCubic(p1b),stroke:{color:C.paper,width:12},rot:0.006});
      ctx.restore();
    }
  }
  const p2=seg(t,162.2,162.9);
  if(p2>0)handText(ctx,'先问一句 ——',960,586,38,{seed:seed+2,alpha:easeOutCubic(p2),color:C.gray});
  const p3=seg(t,163.4,164.4);
  if(p3>0){
    ctx.save();ctx.translate(960,672);ctx.scale(lerp(0.92,1,easeOutCubic(p3)),lerp(0.92,1,easeOutCubic(p3)));
    handText(ctx,'文字进入它大脑的第一步，被切成了什么？',0,0,56,{seed:seed+3,alpha:easeOutCubic(p3),color:C.ink,stroke:{color:C.paper,width:10},rot:-0.004});
    ctx.restore();
    const up=seg(t,164.6,165.6);
    if(up>0)jline(ctx,520,726,1400,720,seed+4,{color:C.red,width:6,progress:easeOutCubic(up)});
  }
  // 呼应开头
  const sp=seg(t,166.0,166.8);
  if(sp>0){
    drawStrawberry(ctx,1560,560,0.85*(0.6+0.4*easeOutBack(sp)),seed+5,{alpha:sp,rot:0.1});
    handText(ctx,'r r r',1560,455,30,{font:'Caveat',weight:'bold',color:C.red,seed:seed+6,alpha:seg(t,166.4,167.0)});
  }
  const p4=seg(t,167.6,168.4);
  if(p4>0){
    handText(ctx,'· 完 ·',960,930,36,{seed:seed+7,alpha:easeOutCubic(p4),color:C.gray});
    drawStar5(ctx,580,930,20,seed+8,{alpha:p4,rot:0.2});
    drawStar5(ctx,1355,924,15,seed+9,{alpha:p4,rot:-0.3,color:C.pink});
  }
}

