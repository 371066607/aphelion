const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { spawn } = require('child_process');
const fs = require('fs');
const PORT = 9233;
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  '--window-size=1600,1000', '--user-data-dir=/tmp/cr189e2e', '--hide-scrollbars',
  'file:///Users/mac/aphelion/game.html?autostart=1'], { stdio:'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let target=null;
  for (let i=0;i<40 && !target;i++){
    await sleep(500);
    try{
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find(t => t.type==='page' && t.url.includes('game.html'));
    }catch(e){}
  }
  if(!target) throw new Error('Chrome 未就绪');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id=0; const pend=new Map();
  ws.onmessage = ev => { const m=JSON.parse(ev.data); if(pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params) => new Promise(res => { const i=++id; pend.set(i,res); ws.send(JSON.stringify({id:i,method,params})); });
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue:true, awaitPromise:true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  for (let i=0;i<40;i++){ if(await evaluate('!!(window.APH&&APH.state&&APH.state.mode)')) break; await sleep(500); }
  await sleep(1500);

  const setup = await evaluate(`(function(){
    var s=APH.state; s.mode='running'; s.scene='home';
    var p=APH.Res.hostilePawn(4242, []); p.origin='外来袭击者';
    var body=APH.Res.embodyHostile(p, s.px+120, s.py+60);
    body.downed=true; body.hp=0;
    s.entities.push(body);
    APH.Res.capturePrisoner(s.meta, body);
    s.selectedTarget={type:'enemy',entity:body};
    document.getElementById('inspector').innerHTML = APH.UI.inspectorHtml(s.selectedTarget, s);
    APH.UI.open('roster');
    window.__e2e = { id:p.id, name:p.name, body:body };
    return { id:p.id, name:p.name, prisoners:s.meta.prisoners.length,
             inspect:String(document.getElementById('inspector').innerHTML).length,
             resBodyLen:String(document.getElementById('resBody').innerHTML||'').length,
             resHasName:(document.getElementById('resBody').innerHTML||'').indexOf(p.name)>=0 };
  })()`);
  console.log('① 面板渲染:', JSON.stringify(setup));

  const click = await evaluate(`(function(){
    var s=APH.state, btns=document.querySelectorAll('#inspector button');
    var labels=[].map.call(btns,function(b){return b.textContent;});
    var rel=[].filter.call(btns,function(b){return b.textContent.indexOf('释放')>=0;})[0];
    if(!rel) return { err:'没有释放按钮', labels:labels };
    rel.click();
    return { labels:labels, prisoners:s.meta.prisoners.length, retreat:!!window.__e2e.body.retreat,
             captured:!!window.__e2e.body.captured, state:window.__e2e.body.state,
             rosterStillLists:(document.getElementById('resBody').innerHTML||'').indexOf(window.__e2e.name)>=0 };
  })()`);
  console.log('② 真点击释放:', JSON.stringify(click));

  const shot = await send('Page.captureScreenshot', { format:'png' });
  fs.mkdirSync('docs/evidence/prisoner-chain', { recursive:true });
  fs.writeFileSync('docs/evidence/prisoner-chain/prisoner-panel.png', Buffer.from(shot.result.data,'base64'));
  console.log('③ 截图: docs/evidence/prisoner-chain/prisoner-panel.png');
  ws.close(); proc.kill('SIGKILL');
  process.exit(0);
})().catch(async e => { console.error('✗', e.message); try{proc.kill('SIGKILL');}catch(_){} process.exit(1); });
