#!/usr/bin/env node
/* Chrome/CDP runtime smoke: fresh ordinary home, then labelled construction fixture.
   node tests/home_live_probe.js [output directory]
   Requires local Google Chrome; no dependency installation and no user profile access. */
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),{pathToFileURL}=require('url');
const out=process.argv[2]||'/tmp/aphelion-home-qa';fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'aph-home-qa-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-sandbox','--window-size=1280,800','--remote-debugging-port=0','--user-data-dir='+profile,pathToFileURL(path.resolve(__dirname,'../game.html')).href+'?autostart=1'],{stdio:'ignore'});
let ws,id=0;const requests=new Map(),errors=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function cdp(method,params={}){
  return new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{requests.delete(n);reject(Error('CDP timeout: '+method));},10000);requests.set(n,{resolve:r=>{clearTimeout(t);resolve(r);},reject:e=>{clearTimeout(t);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});
}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function shot(name){const r=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
(async()=>{
  try{
    let port;
    for(let i=0;i<80;i++){await sleep(100);try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];if(port)break;}catch{}}
    if(!port)throw Error('Chrome did not start');
    const targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),target=targets.find(t=>t.type==='page');
    ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    ws.onmessage=ev=>{const m=JSON.parse(String(ev.data));if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.id&&requests.has(m.id)){const p=requests.get(m.id);requests.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
    await cdp('Runtime.enable');await cdp('Page.enable');
    let ready=false;for(let i=0;i<80;i++){await sleep(100);ready=await evaluate("!!(window.APH&&APH.state&&APH.state.mode==='running'&&APH.state._worldReady)");if(ready)break;}
    if(!ready)throw Error('ordinary startup did not reach running home');
    const baseline=await evaluate(`(()=>{const s=APH.state;return {mode:s.mode,scene:s.scene,width:s.colony.scene.width,residents:s.meta.residents.length,buildings:s.colony.buildings.length,objects:s.entities.length,bedCapacity:APH.Colony.housingCapacity(s.colony.buildings,s.colony)};})()`);
    if(baseline.scene!=='home'||baseline.width!==6144||baseline.residents!==3||baseline.buildings!==0||baseline.bedCapacity!==0)throw Error('fresh startup contract: '+JSON.stringify(baseline));
    await sleep(1200); // let the ordinary intro fade finish before visual evidence
    await shot('ordinary-home');
    const fixture=await evaluate(`(()=>{const s=APH.state;s.paused=true;s.clock=APH.CFG.DAY_LEN*.25;s.entities=s.entities.filter(e=>e.type===APH.CFG.entType.RESIDENT);s.colony.buildings=[];s.colony.buildQueue=[];s.colony.rulesVersion=1;s.devFreeBuild=true;s.camX=1248;s.camY=1248;
      const items=[['bl_bed',1056,1104,0],['bl_bed',1200,1104,1],['bl_bed',1392,1104,2],['bl_bed',1536,1104,3],['bl_dining_table',1248,1344,0],['bl_dining_chair',1296,1488,0]];
      for(let i=0;i<8;i++)items.push([i===3?'bl_gate':'bl_wall',1008+i*48,1008,0]);
      items.forEach(a=>{s.buildRotation=a[3];APH.Main.tryPlace(a[0],a[1],a[2]);});
      return {expected:items.length,placed:s.colony.buildings.length,bedRotations:s.colony.buildings.filter(b=>b.id==='bl_bed').map(b=>b.rotation)};})()`);
    if(fixture.placed!==fixture.expected||fixture.bedRotations.join(',')!=='0,1,2,3')throw Error('construction fixture failed '+JSON.stringify(fixture));
    await sleep(500);await shot('four-direction-furniture-fixture');
    if(errors.length)throw Error('runtime errors: '+JSON.stringify(errors));
    const report={baseline,fixture,runtimeErrors:errors,scope:'Headless Chrome actual Canvas; autostart skips intro only. Furniture screenshot uses explicit free-build fixture, not survival acceptance.'};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{if(ws)ws.close();chrome.kill();await sleep(250);fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
