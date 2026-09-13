#!/usr/bin/env node
/* Chrome/CDP runtime smoke: fresh ordinary home, then dual-world lifecycle fixture.
   node tests/dual_world_live_probe.js [output directory]
   Requires local Google Chrome; no dependency installation and no user profile access. */
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process'),{pathToFileURL}=require('url');
const out=process.argv[2]||'/tmp/aphelion-dual-qa';fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'aph-home-qa-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-sandbox','--window-size=1280,800','--remote-debugging-port=0','--user-data-dir='+profile,pathToFileURL(path.resolve(__dirname,'../game.html')).href+'?autostart=1'],{stdio:'ignore'});
let ws,id=0;const requests=new Map(),errors=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function cdp(method,params={}){
  return new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{requests.delete(n);reject(Error('CDP timeout: '+method));},10000);requests.set(n,{resolve:r=>{clearTimeout(t);resolve(r);},reject:e=>{clearTimeout(t);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});
}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function shot(name){const r=await cdp('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
async function key(keyName,code,keyCode,modifiers=0){const args={key:keyName,code,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode,modifiers};await cdp('Input.dispatchKeyEvent',{...args,type:'keyDown'});await cdp('Input.dispatchKeyEvent',{...args,type:'keyUp'});}
async function rawKey(keyName,code,keyCode,modifiers=0){const args={key:keyName,code,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode,modifiers};await cdp('Input.dispatchKeyEvent',{...args,type:'rawKeyDown'});await cdp('Input.dispatchKeyEvent',{...args,type:'keyUp'});}
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
    const fixture=await evaluate(`(()=>{const s=APH.state;APH.ExpeditionUI.open(s);const panel=document.getElementById('expeditionPlannerOverlay');const checks=[...panel.querySelectorAll('input[type=checkbox]')];checks.forEach((c,i)=>c.checked=i===0);panel.querySelector('#expeditionSupplyFood').value='0';panel.querySelector('#expeditionDestination').value='unknown';[...panel.querySelectorAll('button')].find(b=>b.textContent==='出发').click();const run=APH.ExpeditionState.active(s.colony),entry=APH.Atlas.find(s.meta,run.destination.planetId);return {scene:s.scene,mode:s.mode,away:run.memberIds.length,home:s.worlds.home.entities.filter(e=>e.type===APH.CFG.entType.RESIDENT).length,planetId:run.destination.planetId,visits:entry&&entry.visits};})()`);
    if(fixture.scene!=='expedition'||fixture.mode!=='running'||fixture.away!==1||fixture.home!==2)throw Error('planner failed '+JSON.stringify(fixture));
    if(!fixture.planetId||fixture.visits!==1)throw Error('first discovery identity failed '+JSON.stringify(fixture));
    const knownDestination='planet:'+fixture.planetId;
    const firstPlanetRaw=await evaluate(`localStorage.getItem(APH.CFG.save.KEY_PLANET+'${fixture.planetId}')`);
    await sleep(400);await shot('expedition-squad');
    const movement=await evaluate(`(()=>{const s=APH.state,run=APH.ExpeditionState.active(s.colony),p=s.entities.find(e=>e.rid===run.memberIds[0]);s.spawnT=-10000;s.entities=s.entities.filter(e=>e.type!==APH.CFG.entType.ENEMY);const before={x:p.x,y:p.y};s.paused=false;APH.Main.tacticalMoveTo(p.x+70,p.y);for(let i=0;i<100;i++)APH.Main.simStep(.05);return {distance:Math.hypot(p.x-before.x,p.y-before.y),id:p.rid};})()`);
    if(movement.distance<20)throw Error('squad did not move '+JSON.stringify(movement));
    await evaluate(`(()=>{const s=APH.state;s.carry.specimen_dew=2;APH.Main.checkpointWorlds(s);})()`);
    await cdp('Page.reload');await sleep(1300);
    const restored=await evaluate(`(()=>{const s=APH.state,run=APH.ExpeditionState.active(s.colony);return {scene:s.scene,carry:s.carry.specimen_dew,away:run.memberIds.length,home:s.worlds.home.entities.filter(e=>e.type===APH.CFG.entType.RESIDENT).length};})()`);
    if(restored.scene!=='expedition'||restored.carry!==2||restored.away!==1||restored.home!==2)throw Error('reload failed '+JSON.stringify(restored));
    const returned=await evaluate(`(()=>{const s=APH.state;APH.UI.cmd('switchWorld','home');APH.UI.cmd('returnExpedition');const count=()=>s.entities.filter(e=>!e.dead&&e.itemId==='specimen_dew').reduce((n,e)=>n+e.n,0);const first=count();APH.UI.cmd('returnExpedition');return {scene:s.scene,residents:s.meta.residents.length,pawns:s.entities.filter(e=>e.type===APH.CFG.entType.RESIDENT).length,first,again:count()};})()`);
    if(returned.scene!=='home'||returned.pawns!==3||returned.first!==2||returned.again!==2)throw Error('return failed '+JSON.stringify(returned));
    await shot('returned-home');

    // Pure keyboard route: E opens the planner; reverse Tab reaches the native
    // destination select; Tab returns through the form to Start.
    await key('e','KeyE',69);await sleep(80);
    const keyboardOpen=await evaluate(`(()=>{const panel=document.getElementById('expeditionPlannerOverlay');return {shown:panel&&panel.style.display==='flex',focusText:document.activeElement&&document.activeElement.textContent};})()`);
    if(!keyboardOpen.shown||keyboardOpen.focusText!=='出发')throw Error('keyboard planner open/focus failed '+JSON.stringify(keyboardOpen));
    for(let i=0;i<3;i++)await key('Tab','Tab',9,8);
    const destinationFocus=await evaluate(`(()=>{const a=document.activeElement;return {id:a&&a.id,value:a&&a.value,known:[...a.options].filter(o=>o.value.startsWith('planet:')).map(o=>o.value)};})()`);
    if(destinationFocus.id!=='expeditionDestination'||destinationFocus.value!==''||destinationFocus.known.length!==1||destinationFocus.known[0]!==knownDestination)
      throw Error('keyboard destination focus/reselect failed '+JSON.stringify(destinationFocus));
    await rawKey('End','End',35);await sleep(80);
    const selectedKnown=await evaluate(`(()=>({id:document.activeElement&&document.activeElement.id,value:document.activeElement&&document.activeElement.value}))()`);
    if(selectedKnown.value!==knownDestination)throw Error('keyboard known destination selection failed '+JSON.stringify(selectedKnown));
    const focusTrace=[];let startFocus=null;
    for(let i=0;i<8;i++){
      await key('Tab','Tab',9);
      const focused=await evaluate(`(()=>{const a=document.activeElement,p=document.getElementById('expeditionPlannerOverlay');return {tag:a&&a.tagName,id:a&&a.id,text:a&&a.textContent,inside:!!(p&&a&&p.contains(a))};})()`);
      focusTrace.push(focused);
      if(focused.text==='出发'){startFocus=focused;break;}
      if(!focused.inside)break;
    }
    if(!startFocus)throw Error('keyboard did not return to Start: '+JSON.stringify(focusTrace));
    await key('Enter','Enter',13);await sleep(250);
    const keyboard=await evaluate(`(()=>{const s=APH.state,run=APH.ExpeditionState.active(s.colony),stored=run&&APH.Save.loadPlanet(run.destination.planetId),entry=run&&APH.Atlas.find(s.meta,run.destination.planetId);return {scene:s.scene,runId:run&&run.id,planetId:run&&run.destination.planetId,stored:!!stored,visits:entry&&entry.visits,observed:!!(s.worldDescriptor&&s.worldDescriptor.kind==='expedition'&&s.worldDescriptor.generation===1&&APH.TerrainModel.hasObservation(s.worldDescriptor))};})()`);
    if(keyboard.scene!=='expedition'||!keyboard.runId||keyboard.planetId!==fixture.planetId||!keyboard.stored||keyboard.visits!==2||!keyboard.observed)
      throw Error('keyboard known-planet launch failed '+JSON.stringify(keyboard));
    const revisitPlanetRaw=await evaluate(`localStorage.getItem(APH.CFG.save.KEY_PLANET+'${fixture.planetId}')`);
    if(revisitPlanetRaw!==firstPlanetRaw)throw Error('known revisit rewrote PlanetSpec bytes');
    await evaluate(`APH.Main.returnHome()`);
    await key('e','KeyE',69);await sleep(80);
    const reselect=await evaluate(`(()=>{const panel=document.getElementById('expeditionPlannerOverlay'),destination=document.getElementById('expeditionDestination');return {shown:panel&&panel.style.display==='flex',value:destination&&destination.value,known:destination?[...destination.options].filter(o=>o.value.startsWith('planet:')).length:0};})()`);
    if(!reselect.shown||reselect.value!==''||reselect.known!==1)throw Error('planner retained previous destination '+JSON.stringify(reselect));
    await evaluate(`APH.ExpeditionUI.close()`);
    if(errors.length)throw Error('runtime errors: '+JSON.stringify(errors));
    const report={baseline,fixture,movement,restored,returned,keyboardOpen,destinationFocus,selectedKnown,focusTrace,keyboard,reselect,planetSpecBytesPreserved:revisitPlanetRaw===firstPlanetRaw,runtimeErrors:errors,scope:'Headless Chrome; real planner DOM submission and pure-keyboard known-planet revisit, squad movement, reload, idempotent return, and required destination reselect. The first submit uses DOM click(), while movement and cargo are explicit fixtures; this is not mouse-input proof or a season survival playthrough.'};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{if(ws)ws.close();chrome.kill();await sleep(250);fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
