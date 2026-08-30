#!/usr/bin/env node
/* 实机验证工具: 无头 Chrome + CDP 驱动 game.html, 注入玩家状态后截图。
   用法: node tests/aph_live_probe.js <case> <out.png>
   case: sleep | downed | sick | medLying | baseline
   返回 exit 0 = 探针跑通(截图生成 + 无致命错误)。 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'file:///Users/mac/aphelion/game.html?autostart=1&debugmark=1';
const PORT = 9223;
let ws = null;

const cases = {
  sleep:   `APH.state.meta.playerNeeds.isSleeping = true; APH.Ent.findPlayer()&&(APH.Ent.findPlayer().isSleeping=true);`,
  downed:  `APH.state.meta.playerNeeds.downed = true; APH.state.meta.playerNeeds.downT = 88; APH.state.hp = 0;`,
  sick:    `APH.state.meta.playerNeeds.illness = 70;`,
  medLying:`(function(){ var r=(APH.state.meta.residents||[]).slice(0,3); r.forEach(function(x){ x.medLying=true; }); })();`,
  baseline:`/* no injection */`,
};

async function cdp(method, params){
  return new Promise((resolve, reject) => {
    const id = ++ws._id;
    const onMsg = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.id === id) { ws.removeEventListener('message', onMsg); resolve(m.result || m); }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(()=>{ ws.removeEventListener('message', onMsg); reject(new Error('timeout '+method)); }, 10000);
  });
}

async function main(){
  const which = process.argv[2] || 'baseline';
  const out = process.argv[3] || ('/tmp/aph_live_' + which + '.png');
  const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-sandbox',
    '--window-size=1280,800', '--remote-debugging-port=' + PORT,
    '--user-data-dir=/tmp/aph_cdp_profile', URL], { stdio: 'ignore' });
  // 等 devtools 就绪
  let target = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 300));
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
      target = list.find(t => t.type === 'page' && t.url.includes('game.html'));
      if (target) break;
    } catch (e) {}
  }
  if (!target) { console.error('no page target'); chrome.kill(); process.exit(2); }
  const w = new WebSocket(target.webSocketDebuggerUrl);
  ws = w;
  ws._id = 0;
  await new Promise((res, rej) => { w.onopen = res; w.onerror = rej; });
  await cdp('Page.enable', {});
  await cdp('Runtime.enable', {});
  await new Promise(r => setTimeout(r, 2500)); // 等 boot + 首帧

  // 注入状态
  if (cases[which]) {
    const r = await cdp('Runtime.evaluate', { expression: cases[which], returnByValue: true });
    if ((r && r.exceptionDetails)) console.error('inject warn:', JSON.stringify(r.exceptionDetails).slice(0, 200));
    await new Promise(r2 => setTimeout(r2, 800)); // 等渲染帧
  }

  // 探针: 读状态
  const probe = await cdp('Runtime.evaluate', {
    expression: `(function(){ var s=APH.state; var pn=s.meta&&s.meta.playerNeeds; var pe=APH.Ent.findPlayer&&APH.Ent.findPlayer(); return JSON.stringify({mode:s.mode, sleeping:pn&&pn.isSleeping, downed:pn&&pn.downed, downT:pn&&pn.downT, illness:pn&&pn.illness, hp:s.hp, peDowned:pe&&pe.downed, peSleeping:pe&&pe.isSleeping, entities:s.entities.length}); })()`,
    returnByValue: true
  });
  console.log('PROBE:', (probe && probe.result && probe.result.value) || JSON.stringify(probe));

  // 截图
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SHOT:', out, fs.statSync(out).size, 'bytes');
  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch(e => { console.error('ERR', e.message); process.exit(1); });
