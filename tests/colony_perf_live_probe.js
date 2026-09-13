#!/usr/bin/env node
/* Large-home live performance evidence.
   node tests/colony_perf_live_probe.js

   Opens the built game in an isolated temporary Chrome profile, keeps the
   fresh 128x128 home and its generated resources, expands the roster to 20,
   then measures the real game requestAnimationFrame callback. No user Chrome
   profile or simulated Date.now clock is used. */
'use strict';

const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const {pathToFileURL}=require('url');

const OUT='/tmp/aphelion-large-live';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'aph-large-live-'));
const gameUrl=pathToFileURL(path.resolve(__dirname,'../game.html')).href+'?autostart=1';
fs.mkdirSync(OUT,{recursive:true});

const chrome=spawn(CHROME,[
  '--headless=new','--disable-gpu','--no-sandbox','--window-size=1280,800',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});

let ws=null,nextId=0;
const requests=new Map();
const runtimeExceptions=[];
const consoleErrors=[];
const logErrors=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++nextId;
    const timer=setTimeout(()=>{
      requests.delete(id);
      reject(new Error('CDP timeout: '+method));
    },20000);
    requests.set(id,{
      resolve(value){clearTimeout(timer);resolve(value);},
      reject(error){clearTimeout(timer);reject(error);}
    });
    ws.send(JSON.stringify({id,method,params}));
  });
}

async function evaluate(expression){
  const result=await cdp('Runtime.evaluate',{
    expression,
    returnByValue:true,
    awaitPromise:true
  });
  if(result.exceptionDetails) throw new Error('Runtime.evaluate failed: '+JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

function percentile(sorted,p){
  if(!sorted.length)return null;
  return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
}

function stats(values){
  const sorted=values.slice().sort((a,b)=>a-b);
  return {
    samples:sorted.length,
    median:+percentile(sorted,.5).toFixed(3),
    p95:+percentile(sorted,.95).toFixed(3),
    max:+sorted[sorted.length-1].toFixed(3)
  };
}

function describeRemoteArg(arg){
  if(arg.value!==undefined){
    try{return typeof arg.value==='string'?arg.value:JSON.stringify(arg.value);}
    catch{return String(arg.value);}
  }
  return arg.description||arg.unserializableValue||arg.type||'';
}

(async()=>{
  let report=null;
  try{
    if(!fs.existsSync(CHROME))throw new Error('Google Chrome not found at '+CHROME);
    let port=null;
    for(let i=0;i<100;i++){
      await sleep(100);
      try{
        port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
        if(port)break;
      }catch{}
    }
    if(!port)throw new Error('Chrome did not expose a DevTools port');

    const targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
    const target=targets.find(item=>item.type==='page');
    if(!target)throw new Error('Chrome page target not found');
    ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    ws.onmessage=event=>{
      const message=JSON.parse(String(event.data));
      if(message.method==='Runtime.exceptionThrown')runtimeExceptions.push(message.params.exceptionDetails);
      if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error'){
        consoleErrors.push((message.params.args||[]).map(describeRemoteArg).join(' '));
      }
      if(message.method==='Log.entryAdded'&&message.params.entry&&message.params.entry.level==='error'){
        logErrors.push(message.params.entry.text||'Chrome log error');
      }
      if(message.id&&requests.has(message.id)){
        const pending=requests.get(message.id);requests.delete(message.id);
        if(message.error)pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
      }
    };

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Log.enable');
    await cdp('Page.navigate',{url:gameUrl});

    let ready=false;
    for(let i=0;i<150;i++){
      await sleep(100);
      try{
        ready=await evaluate("!!(window.APH&&APH.Main&&APH.state&&APH.state.mode==='running'&&APH.state.scene==='home'&&APH.state._worldReady)");
      }catch{}
      if(ready)break;
    }
    if(!ready)throw new Error('fresh game did not reach running home');

    const fixture=await evaluate(`(()=>{
      const s=APH.state,C=APH.CFG;
      const before={scene:s.scene,width:s.colony.scene&&s.colony.scene.width,
        cells:(s.colony.scene&&s.colony.scene.width)/(s.colony.scene&&s.colony.scene.grid),
        residents:(s.meta.residents||[]).length,entities:(s.entities||[]).length};
      const names=(s.meta.residents||[]).map(r=>r.name);
      while(s.meta.residents.length<20){
        const i=s.meta.residents.length;
        const r=APH.Res.generate('large_live_'+i,77000+i,names);
        names.push(r.name);r.worldId='home';r.dead=false;r.downed=false;r.medLying=false;
        r.isSleeping=false;r.hp=r.hp==null?100:r.hp;r.food=100;r.rest=100;r.recreation=100;
        s.meta.residents.push(r);
      }
      s.mode='running';s.scene='home';s.paused=false;s.timeScale=1;
      s.camX=1100;s.camY=1100;s.px=1100;s.py=1100;
      APH.Main.syncResidents();
      APH.World.buildTerrain();
      const residents=s.entities.filter(e=>e.type===C.entType.RESIDENT&&!e.dead).length;
      const worldObjects=s.entities.filter(e=>e.type!==C.entType.RESIDENT&&!e.dead).length;
      return {before,residents,worldObjects,totalEntities:s.entities.filter(e=>!e.dead).length,
        descriptor:s.colony.scene,terrainBefore:APH.World.stats()};
    })()`);

    if(fixture.before.scene!=='home'||fixture.before.cells!==128)throw new Error('fresh 128-cell home contract failed: '+JSON.stringify(fixture));
    if(fixture.before.residents!==3)throw new Error('temporary profile was not a fresh three-resident save: '+JSON.stringify(fixture.before));
    if(fixture.residents!==20)throw new Error('20-resident fixture failed: '+JSON.stringify(fixture));
    if(fixture.worldObjects<2000)throw new Error('large home lost generated world objects: '+JSON.stringify(fixture));

    const navigation=await evaluate(`(()=>{
      const s=APH.state,scene=s.colony.scene;
      const gridStart=performance.now();
      const grid=APH.Nav.gridOf(s.colony.buildings,scene);
      const gridBuildMs=performance.now()-gridStart;
      const cacheStart=performance.now();
      const cached=APH.Nav.gridOf(s.colony.buildings,scene);
      const gridCacheHitMs=performance.now()-cacheStart;
      const walkable=[];
      for(let gy=2;gy<126;gy++)for(let gx=2;gx<126;gx++){
        const x=(gx+.5)*scene.grid,y=(gy+.5)*scene.grid;
        if(APH.TerrainModel.cellAt(scene,x,y).walkable)walkable.push({x,y});
      }
      const started=performance.now(),lengths=[];
      for(let i=0;i<20;i++){
        const from=walkable[Math.floor(i*walkable.length/40)];
        const to=walkable[walkable.length-1-Math.floor(i*walkable.length/40)];
        const route=APH.Nav.astar(grid,from,to,null,scene);
        if(!route)throw new Error('path '+i+' unreachable');
        lengths.push(route.length);
      }
      return {requested:20,completed:lengths.length,totalMs:performance.now()-started,
        pathLengths:lengths,gridBuildMs,gridCacheHitMs,gridIdentityCached:grid===cached,
        gridRows:grid.length,gridCols:grid[0]&&grid[0].length};
    })()`);

    const frameEvidence=await evaluate(`new Promise((resolve,reject)=>{
      const nativeRaf=window.requestAnimationFrame.bind(window);
      const costs=[],intervals=[];
      let previous=null,warmup=10,probeFrames=0;
      const before=APH.Main.debugState();
      const clockBefore=APH.state.clock;
      window.requestAnimationFrame=function(callback){
        return nativeRaf(function(timestamp){
          if(callback&&callback.name==='frame'){
            const started=performance.now();
            callback(timestamp);
            costs.push(performance.now()-started);
          }else callback(timestamp);
        });
      };
      function sample(timestamp){
        if(previous!==null){
          const interval=timestamp-previous;
          if(warmup>0)warmup--;else intervals.push(interval);
        }
        previous=timestamp;probeFrames++;
        if(costs.length>=120&&intervals.length>=120){
          window.requestAnimationFrame=nativeRaf;
          resolve({costs:costs.slice(0,120),intervals:intervals.slice(0,120),
            gameFrameBefore:before.frameN,gameFrameAfter:APH.Main.debugState().frameN,
            clockBefore,clockAfter:APH.state.clock,probeFrames});
          return;
        }
        if(probeFrames>360){window.requestAnimationFrame=nativeRaf;reject(new Error('did not observe 120 game frames'));return;}
        nativeRaf(sample);
      }
      nativeRaf(sample);
    })`);

    if(frameEvidence.costs.length!==120||frameEvidence.intervals.length!==120)
      throw new Error('incomplete frame evidence: '+JSON.stringify(frameEvidence));
    if(frameEvidence.gameFrameAfter-frameEvidence.gameFrameBefore<120||frameEvidence.clockAfter<=frameEvidence.clockBefore)
      throw new Error('game simulation did not advance with measured rAF callbacks: '+JSON.stringify(frameEvidence));

    const persistence=await evaluate(`(()=>{
      const s=APH.state;
      const started=performance.now();
      APH.Main.checkpointWorlds(s);
      const persistMs=performance.now()-started;
      const raw=localStorage.getItem(APH.CFG.save.KEY_COLONY)||'';
      const stringifyStart=performance.now();
      const json=JSON.stringify(s.colony);
      const stringifyMs=performance.now()-stringifyStart;
      return {persistMs,stringifyMs,saveBytes:new TextEncoder().encode(raw).length,
        inMemoryBytes:new TextEncoder().encode(json).length,
        runtimeBytes:new TextEncoder().encode(JSON.stringify(s.colony.homeRuntime||{})).length};
    })()`);

    const environment=await evaluate(`({userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},
      devicePixelRatio:window.devicePixelRatio,terrainAfter:APH.World.stats(),entityIndex:APH.EntityIndex.stats(APH.state.entities),scene:APH.state.scene,
      mode:APH.state.mode,clock:APH.state.clock,
      residentsAfter:APH.state.entities.filter(e=>e.type===APH.CFG.entType.RESIDENT&&!e.dead).length,
      worldObjectsAfter:APH.state.entities.filter(e=>e.type!==APH.CFG.entType.RESIDENT&&!e.dead).length})`);

    report={
      generatedAt:new Date().toISOString(),
      fixture,
      frameCostMs:stats(frameEvidence.costs),
      frameIntervalMs:stats(frameEvidence.intervals),
      gameFramesAdvanced:frameEvidence.gameFrameAfter-frameEvidence.gameFrameBefore,
      simulationSecondsAdvanced:+(frameEvidence.clockAfter-frameEvidence.clockBefore).toFixed(3),
      navigation,
      terrainCache:environment.terrainAfter,
      entityIndex:environment.entityIndex,
      persistence,
      environment:{userAgent:environment.userAgent,viewport:environment.viewport,
        devicePixelRatio:environment.devicePixelRatio,scene:environment.scene,mode:environment.mode,
        residentsAfter:environment.residentsAfter,worldObjectsAfter:environment.worldObjectsAfter},
      errors:{runtimeExceptions,consoleErrors,logErrors},
      methodology:'Isolated temporary Chrome profile; actual game requestAnimationFrame callback CPU duration and rAF timestamps measured with performance.now while simulation and Canvas rendering remain active.'
    };
    fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));

    if(runtimeExceptions.length||consoleErrors.length||logErrors.length)
      throw new Error('browser runtime errors were captured; inspect '+path.join(OUT,'report.json'));
    if(!navigation.gridIdentityCached)throw new Error('navigation grid cache did not reuse the grid');
    if(environment.residentsAfter!==20||environment.worldObjectsAfter<2000)
      throw new Error('large fixture did not remain intact through measurement: '+JSON.stringify(environment));
    if(!(report.terrainCache.hits>0)||report.terrainCache.cacheSize>report.terrainCache.cacheLimit)
      throw new Error('terrain cache evidence invalid: '+JSON.stringify(report.terrainCache));

    console.log(JSON.stringify(report,null,2));
  }catch(error){
    if(!report){
      report={generatedAt:new Date().toISOString(),error:error.stack||String(error),
        errors:{runtimeExceptions,consoleErrors,logErrors}};
      fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
    }
    throw error;
  }finally{
    if(ws)ws.close();
    chrome.kill();
    await sleep(250);
    fs.rmSync(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
