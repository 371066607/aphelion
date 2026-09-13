#!/usr/bin/env node
/* Chrome/CDP runtime smoke: fresh ordinary home, then labelled construction fixture.
   node tests/home_live_probe.js [output directory]
   Requires local Google Chrome; no dependency installation and no user profile access. */
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),{pathToFileURL}=require('url');
const out=process.argv[2]||'/tmp/aphelion-camera-qa';fs.mkdirSync(out,{recursive:true});
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
    ws.onmessage=ev=>{const m=JSON.parse(String(ev.data));if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args);if(m.id&&requests.has(m.id)){const p=requests.get(m.id);requests.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
    await cdp('Runtime.enable');await cdp('Page.enable');
    let ready=false;for(let i=0;i<80;i++){await sleep(100);ready=await evaluate("!!(window.APH&&APH.state&&APH.state.mode==='running'&&APH.state._worldReady)");if(ready)break;}
    if(!ready)throw Error('ordinary startup did not reach running home');
    const baseline=await evaluate(`(()=>{const s=APH.state;return {mode:s.mode,scene:s.scene,width:s.colony.scene.width,residents:s.meta.residents.length,buildings:s.colony.buildings.length,objects:s.entities.length,bedCapacity:APH.Colony.housingCapacity(s.colony.buildings,s.colony)};})()`);
    if(baseline.scene!=='home'||baseline.width!==6144||baseline.residents!==3||baseline.buildings!==0||baseline.bedCapacity!==0)throw Error('fresh startup contract: '+JSON.stringify(baseline));
    await sleep(1200); // let the ordinary intro fade finish before visual evidence
    await shot('ordinary-home');
    await evaluate(`(()=>{const s=APH.state;s.paused=true;s.clock=APH.CFG.DAY_LEN*.25;s.entities=s.entities.filter(e=>e.type===APH.CFG.entType.RESIDENT);s.colony.buildings=[];s.colony.buildQueue=[];s.devFreeBuild=true;s.camX=1248;s.camY=1248;})()`);
    const fixture=[];
    for(const spec of [{zoom:.5,x:1392,y:1392,rotation:1},{zoom:2,x:1344,y:1296,rotation:3}]){
      const pos=await evaluate(`(()=>{const s=APH.state;s.buildMode='bl_bed';s.buildRotation=${spec.rotation};APH.Camera.setZoom(s,${spec.zoom},null,APH.World.getViewport());return APH.Camera.toScreen(s,${spec.x},${spec.y},APH.World.getViewport());})()`);
      await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:pos.x,y:pos.y});
      await sleep(100);await shot('preview-'+spec.zoom);
      await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:pos.x,y:pos.y});
      await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:pos.x,y:pos.y});
      const placed=await evaluate(`(()=>{const s=APH.state,b=s.colony.buildings[s.colony.buildings.length-1];return {count:s.colony.buildings.length,x:b&&b.x,y:b&&b.y,rotation:b&&b.rotation,hit:b&&APH.BuildGrid.rectOf(b)};})()`);
      if(placed.count!==fixture.length+1||placed.rotation!==spec.rotation)throw Error('zoom placement failed '+JSON.stringify({spec,placed}));
      fixture.push({spec,placed});await shot('placed-'+spec.zoom);
    }
    await evaluate("APH.state.buildMode=null;APH.MapUI.open()");await shot('map-overview');
    const map=await evaluate(`(()=>{const s=APH.state,before=s.entities.filter(e=>e.type===APH.CFG.entType.RESIDENT).map(e=>[e.x,e.y]);const c=document.querySelector('#mapOverviewOverlay canvas'),r=c.getBoundingClientRect();const ev=new MouseEvent('click',{clientX:r.left+r.width*.75,clientY:r.top+r.height*.75,bubbles:true}),expected={x:(ev.clientX-r.left)/r.width*6144,y:(ev.clientY-r.top)/r.height*6144};c.dispatchEvent(ev);return {mode:s.mode,x:s.camX,y:s.camY,expected,pawnsUnchanged:JSON.stringify(before)===JSON.stringify(s.entities.filter(e=>e.type===APH.CFG.entType.RESIDENT).map(e=>[e.x,e.y]))};})()`);
    if(map.mode!=='running'||Math.abs(map.x-map.expected.x)>1e-6||Math.abs(map.y-map.expected.y)>1e-6||!map.pawnsUnchanged)throw Error('map focus failed '+JSON.stringify(map));
    if(errors.length)throw Error('runtime errors: '+JSON.stringify(errors));
    const report={baseline,fixture,map,runtimeErrors:errors,scope:'Headless Chrome; real pointer placement at 50% and 200%, overview focus. Construction uses explicit free-build fixture.'};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{if(ws)ws.close();chrome.kill();await sleep(250);fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
