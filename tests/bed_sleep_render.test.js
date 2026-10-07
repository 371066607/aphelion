'use strict';

// Decode the checked-in RGBA PNGs without a browser or an image dependency.
// Production contentBounds still performs the scan; this only supplies pixels
// to a small canvas double, so real transparent padding is covered too.
function bedSleepPng(name){
  const fs=require('fs'),path=require('path'),zlib=require('zlib');
  const png=fs.readFileSync(path.join(__dirname,'..','assets',name+'_sheet.png'));
  let width,height,parts=[];
  for(let p=8;p<png.length;){
    const n=png.readUInt32BE(p),type=png.toString('ascii',p+4,p+8),chunk=png.subarray(p+8,p+8+n);
    if(type==='IHDR'){
      width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);
      if(chunk[8]!==8||chunk[9]!==6||chunk[12]!==0)throw Error('fixture requires non-interlaced RGBA8 PNG');
    }else if(type==='IDAT')parts.push(chunk);
    p+=n+12;
  }
  const raw=zlib.inflateSync(Buffer.concat(parts)),stride=width*4,data=new Uint8ClampedArray(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)];
    for(let x=0;x<stride;x++){
      const a=x>=4?data[y*stride+x-4]:0,b=y?data[(y-1)*stride+x]:0,c=y&&x>=4?data[(y-1)*stride+x-4]:0;
      const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
      if(predictor===undefined)throw Error('unknown PNG filter');
      data[y*stride+x]=(raw[y*(stride+1)+x+1]+predictor)&255;
    }
  }
  return {width,height,data};
}

function bedSleepSandbox(){
  const fs=require('fs'),path=require('path'),vm=require('vm');
  const metrics={reads:0,canvases:[],images:[]},draws=[],texts=[];
  function canvas(){
    const c={width:0,height:0,style:{}};let source=null,sx=0,sy=0;
    const g={clearRect(){},putImageData(){},
      drawImage(img,x,y){source=img;sx=x;sy=y;},
      getImageData(x,y,w,h){
        metrics.reads++;
        if(source.tainted)throw Error('tainted');
        const data=new Uint8ClampedArray(w*h*4);
        for(let row=0;row<h;row++){
          const offset=((sy+y+row)*source.width+sx+x)*4;
          data.set(source.data.subarray(offset,offset+w*4),row*w*4);
        }
        return {data};
      }};
    c.getContext=()=>g;metrics.canvases.push(c);return c;
  }
  const sandbox={console,document:{createElement:canvas},Image:function(){metrics.images.push(this);}};
  sandbox.window=sandbox;
  vm.createContext(sandbox);
  for(const name of ['config','utils','build_grid','humanoid','entities','sprites','world','draw']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','src',name+'.js'),'utf8'),sandbox,{filename:name+'.js'});
  }
  const a=sandbox.APH;
  a.Colony={list:()=>({bl_bed:{cells:[1,2]}})};
  let matrix=[1,0,0,1,0,0],stack=[];
  const multiply=n=>{const [aa,b,c,d,e,f]=matrix,[A,B,C,D,E,F]=n;matrix=[aa*A+c*B,b*A+d*B,aa*C+c*D,b*C+d*D,aa*E+c*F+e,b*E+d*F+f];};
  const ctx={globalAlpha:1,save(){stack.push({matrix:matrix.slice(),alpha:this.globalAlpha});},
    restore(){const v=stack.pop();matrix=v.matrix;this.globalAlpha=v.alpha;},
    translate(x,y){multiply([1,0,0,1,x,y]);},rotate(r){multiply([Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),0,0]);},
    drawImage(...args){draws.push({args,matrix:matrix.slice()});},fillText(...args){texts.push({args,matrix:matrix.slice()});},
    beginPath(){},ellipse(){},fill(){},fillRect(){},strokeRect(){}};
  a.Ent.bindCtx(ctx);
  function sheet(name,img,baseline,contentH){
    a.Sprites.define(name,{src:name,fw:img.height,fh:img.height,cols:16,count:16,baseline,contentH});
    a.Sprites._images[name]=img;
  }
  function sleeper(id,rotation){
    const fp=rotation%2?{w:2,h:1}:{w:1,h:2};
    const bed={id:'bl_bed',bid:'bl_bed',uid:'bed_'+id,type:'building',geometryVersion:1,cells:[1,2],gx:10,gy:10,rotation,
      x:(10+fp.w/2)*48,y:(10+fp.h/2)*48};
    const pawn={id,rid:id,type:a.CFG.entType.RESIDENT,isSleeping:true,face:0,x:bed.x,y:10*48-24,rest:75,food:80,
      sleepAnchor:{x:bed.x,y:bed.y}};
    a.state={scene:'home',meta:{residents:[{id,bedId:bed.uid+':0'}]},colony:{scene:{grid:48,width:3000,height:3000},buildings:[bed]}};
    return {bed,pawn};
  }
  return {a,metrics,draws,texts,sheet,sleeper};
}

function bedSleepAssert(ok,message){if(!ok)throw Error(message);}
function bedSleepNear(actual,expected,message){bedSleepAssert(Math.abs(actual-expected)<1e-8,message+': '+actual+' != '+expected);}

test('modern bed sleep: real four-face breathing bounds fit all four rotations and head follows pillow',()=>{
  const {a,metrics,sheet,sleeper,draws,texts}=bedSleepSandbox();
  const faces=[['rs_start1',0,248,122],['rs_start2',1,248,138],['rs_start3',2,249,102],['face3',3,198,124]];
  // Choose an actual identity with face 3 rather than overriding appearance.
  let suffix=0;while(a.Humanoid.faceIdx(faces[3][0])!==3)faces[3][0]='face3_'+(++suffix);
  for(const [id,face,baseline,contentH] of faces){
    const name='hum_'+face+'_nopack_prone',img=bedSleepPng(name);
    sheet(name,img,baseline,contentH);
    sheet('hum_'+face+'_nopack_walk',img,248,240);
    const bounds=a.Sprites.contentBounds(name,0,4),reads=metrics.reads;
    bedSleepAssert(bounds&&Object.isFrozen(bounds),'measured bounds should be read-only');
    for(let rotation=0;rotation<4;rotation++){
      const {bed,pawn}=sleeper(id,rotation),before=JSON.stringify(pawn),pose=a.Ent.bedSleepPose(pawn);
      const layout=a.Ent.bedSleepLayout(pose,bounds,a.Sprites.sheetDef(name));
      const expectedHeads=[[0,-1],[1,0],[0,1],[-1,0]];
      bedSleepNear(-Math.cos(layout.angle),expectedHeads[rotation][0],'head x');
      bedSleepNear(-Math.sin(layout.angle),expectedHeads[rotation][1],'head y');
      const fittedWidth=bounds.h*layout.scale,fittedLength=bounds.w*layout.scale;
      bedSleepAssert(fittedWidth<=36+1e-8&&fittedLength<=80+1e-8,'body should fit 36x80 mattress');
      // Union centre must land on the bed centre despite sprite padding/baseline.
      const cx=layout.drawX+(bounds.x+bounds.w/2-img.height/2)*layout.scale;
      const cy=layout.drawY+(bounds.y+bounds.h/2-baseline)*layout.scale;
      bedSleepNear(cx,0,'centred x');bedSleepNear(cy,0,'centred y');
      for(let phase=0;phase<4;phase++){
        a.Ent.drawResident(pawn,phase,pose);
        const call=draws[draws.length-1],[image,sx,sy,sw,sh,dx,dy,dw,dh]=call.args;
        bedSleepAssert(image===img&&sx===phase*256&&sy===0,'keep canonical identity/breathing frame');
        const [A,B,C,D,E,F]=call.matrix;
        bedSleepNear(E,bed.x,'draw centre x');bedSleepNear(F,bed.y,'draw centre y');
        // Every alpha>8 source pixel of the actual frame stays inside its bed.
        for(let y=0;y<256;y++)for(let x=0;x<256;x++){
          if(img.data[(y*img.width+sx+x)*4+3]<=8)continue;
          const localX=dx+(x+.5)*dw/sw,localY=dy+(y+.5)*dh/sh;
          const X=A*localX+C*localY+E,Y=B*localX+D*localY+F;
          bedSleepAssert(X>=pose.rect.x&&X<=pose.rect.x+pose.rect.w&&Y>=pose.rect.y&&Y<=pose.rect.y+pose.rect.h,'alpha pixel outside rotated bed');
        }
      }
      bedSleepAssert(JSON.stringify(pawn)===before,'render must not mutate pawn/rest/face/coordinates');
      pawn.illness=25;a.Ent.drawResident(pawn,0,pose);
      const mark=texts.filter(t=>t.args[0]==='✚').pop();
      bedSleepAssert(mark.args[0]==='✚'&&mark.matrix[0]===1&&mark.matrix[1]===0,'existing illness mark stays upright');
    }
    bedSleepAssert(metrics.reads===reads,'no per-frame rescans');
  }
  // World creates two existing overlay canvases; every additional scan canvas releases its backing store.
  bedSleepAssert(metrics.canvases.slice(2).every(c=>c.width===0&&c.height===0),'release temporary scan canvases');
});

test('modern bed sleep: awake, floor, old bed, downed and medical sprites retain old scale/face/anchor',()=>{
  const {a,metrics,sheet,sleeper,draws}=bedSleepSandbox(),img=bedSleepPng('hum_0_nopack_prone');
  sheet('hum_0_nopack_prone',img,248,122);sheet('hum_0_nopack_walk',img,248,240);sheet('hum_0_nopack_idle',img,248,236);
  const variants=[(p,b)=>{p.isSleeping=false;},(p,b)=>{p.downed=true;},(p,b)=>{p.medLying=true;},
    (p,b)=>{b.geometryVersion=0;},(p,b)=>{a.state.meta.residents[0].bedId=null;},(p,b)=>{delete p.sleepAnchor;},
    (p,b)=>{b.dead=true;},(p,b)=>{a.state.scene='expedition';},(p,b)=>{p.sleepAnchor={};}];
  for(const change of variants){
    const {bed,pawn}=sleeper('rs_start1',2);change(pawn,bed);
    bedSleepAssert(a.Ent.bedSleepPose(pawn)===null,'out-of-scope pose must decline');
    const before=JSON.stringify(pawn);a.Ent.drawResident(pawn,0);
    const call=draws[draws.length-1],prone=!!(pawn.isSleeping||pawn.downed||pawn.medLying),sc=78/(prone?122:236);
    bedSleepNear(call.args[7],256*sc,'unchanged global scale');
    bedSleepAssert(call.args[1]===8*256,'unchanged right-facing frame');
    const anchor=pawn.isSleeping&&pawn.sleepAnchor&&pawn.sleepAnchor.x!=null&&pawn.sleepAnchor.y!=null?pawn.sleepAnchor:pawn;
    bedSleepNear(call.matrix[4],anchor.x,'unchanged anchor x');bedSleepNear(call.matrix[5],anchor.y,'unchanged anchor y');
    bedSleepAssert(JSON.stringify(pawn)===before,'fallback rendering mutation');
  }
  bedSleepAssert(metrics.reads===0,'out-of-scope poses must not scan pixels');
});

test('modern bed sleep: unified depth draws body after bed, computes once and leaves logical coordinates untouched',()=>{
  const {a,metrics,sleeper}=bedSleepSandbox();
  let calls=0;const original=a.Ent.bedSleepPose;
  a.Ent.bedSleepPose=e=>{calls++;return original(e);};
  for(let rotation=0;rotation<4;rotation++){
    const {bed,pawn}=sleeper('rs_start1',rotation),before=JSON.stringify([bed,pawn]);
    const other={id:'other',type:'rock',x:700,y:bed.y+1},ordinary={id:'awake',type:a.CFG.entType.RESIDENT,x:600,y:bed.y-1};
    calls=0;
    const result=a.World.sortRenderEntities([other,pawn,ordinary,bed]);
    bedSleepAssert(result.entities.map(e=>e.id).join(',')==='awake,bl_bed,rs_start1,other','bed/body depth order');
    bedSleepAssert(result.sleepPoses.get(pawn).depth===bed.y&&calls===1,'compute valid bed pose once before comparator');
    bedSleepAssert(JSON.stringify([bed,pawn])===before,'depth must not modify entity/index position');
  }
  a.state={scene:'home',meta:{get residents(){throw Error('no-bed sample should not inspect roster');}},colony:{buildings:[]}};
  const noBeds=Array.from({length:20},(_,i)=>({id:'none'+i,type:a.CFG.entType.RESIDENT,isSleeping:true,x:100,y:20-i}));
  const result=a.World.sortRenderEntities(noBeds);
  bedSleepAssert(result.sleepPoses===null&&result.entities[0].y===1,'no-bed sample retains plain Y sorting');
  bedSleepAssert(metrics.reads===0,'depth/no-bed path must not scan pixels');
});

test('modern bed sleep: home/expedition drawer wrappers preserve the prepared pose or explicit null',()=>{
  const {a,sleeper}=bedSleepSandbox(),{pawn}=sleeper('rs_start1',0),pose=a.Ent.bedSleepPose(pawn);
  const seen=[];a.Ent.drawResident=(...args)=>seen.push(args);
  a.Draw.homeDrawers().resident(pawn,2,pose);
  a.Draw.expeditionDrawers().resident(pawn,3,null);
  bedSleepAssert(seen[0][0]===pawn&&seen[0][1]===2&&seen[0][2]===pose,'home must preserve the prepared pose');
  bedSleepAssert(seen[1][2]===null,'expedition must preserve the old-path null');
});

test('modern bed sleep: bounds cache invalidates on define/load and caches unreadable or empty frames',()=>{
  const {a,metrics}=bedSleepSandbox();
  const image=(x,y)=>{const data=new Uint8ClampedArray(8*2*4);for(let i=0;i<4;i++)data[(y*8+i*2+x)*4+3]=255;return {width:8,height:2,data};};
  const def={src:'bounds_fixture',fw:2,fh:2,cols:4,count:4,baseline:2,contentH:2};
  a.Sprites.define('bounds_fixture',def);a.Sprites._images.bounds_fixture=image(0,0);
  const first=a.Sprites.contentBounds('bounds_fixture',0,4),reads=metrics.reads;
  bedSleepAssert(first.x===0&&first.y===0&&first.w===1&&first.h===1,'alpha union');
  bedSleepAssert(a.Sprites.contentBounds('bounds_fixture',0,4)===first&&metrics.reads===reads,'cache hit');
  a.Sprites.define('bounds_fixture',def);a.Sprites.contentBounds('bounds_fixture',0,4);
  bedSleepAssert(metrics.reads===reads+4,'define invalidates old measurements');
  a.Sprites.loadAll();
  const loaded=metrics.images[0];Object.assign(loaded,image(1,1));loaded.onload();
  const fresh=a.Sprites.contentBounds('bounds_fixture',0,4);
  bedSleepAssert(fresh!==first&&fresh.x===1&&fresh.y===1,'successful reload uses fresh pixels');
  for(const img of [{...image(0,0),tainted:true},{width:8,height:2,data:new Uint8ClampedArray(64)}]){
    a.Sprites._images.bounds_fixture=img;
    bedSleepAssert(a.Sprites.contentBounds('bounds_fixture',0,4)===null,'unreadable/empty scan declines');
    const after=metrics.reads;
    bedSleepAssert(a.Sprites.contentBounds('bounds_fixture',0,4)===null&&metrics.reads===after,'failed scans must not retry every frame');
  }
  bedSleepAssert(metrics.canvases.filter(c=>c.width===2).length===0,'no retained scan backing store');
});
