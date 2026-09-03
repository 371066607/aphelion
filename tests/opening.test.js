/* opening.js 短片时钟 / 存档闸门 (register-style, 无 DOM) */
'use strict';
const O = window.APH.Opening, Save = window.APH.Save, CFG = window.APH.CFG;

test('clock: t=0 → shot 0; 过 shotEnds[0] → shot 1; t=30 停在最后', () => {
  const c = O.createClock();
  if(c.t !== 0 || c.shot !== 0) throw new Error('初始应为 t=0 shot=0, got t='+c.t+' shot='+c.shot);
  O.tick(c, CFG.opening.shotEnds[0] + 0.01);
  if(c.shot !== 1) throw new Error('过第一段应变 shot 1, got '+c.shot);
  c.t = 0; c.shot = 0;
  O.tick(c, 30);
  if(c.shot !== 4) throw new Error('t=30 应为 shot 4, got '+c.shot);
  if(c.t !== 30) throw new Error('t 应封顶 30, got '+c.t);
  O.tick(c, 8);
  if(c.shot !== 4 || c.t !== 30) throw new Error('最后一镜应冻结 shot=4 t=30, got shot='+c.shot+' t='+c.t);
});

test('skipToLast → shot 4, skipped, t 在最后窗口起点', () => {
  const c = O.createClock();
  O.skipToLast(c);
  if(c.shot !== 4) throw new Error('shot 应为 4, got '+c.shot);
  if(c.skipped !== true) throw new Error('skipped 应为 true');
  const startLast = CFG.opening.shotEnds[CFG.opening.lastIndex - 1];
  if(c.t !== startLast) throw new Error('t 应为最后窗口起点 '+startLast+' got '+c.t);
  if(!O.isLast(c)) throw new Error('skip 后应为最后一镜');
});

test('shouldPlay: 新档播; played / seen兼容 / autostart 不播', () => {
  if(O.shouldPlay({ played:false }, {}) !== true) throw new Error('played:false 应播');
  if(O.shouldPlay({ played:true }, {}) !== false) throw new Error('played:true 不播');
  if(O.shouldPlay({ seen:true }, {}) !== false) throw new Error('seen:true 兼容不播');
  if(O.shouldPlay({ played:false }, { autostart:true }) !== false) throw new Error('autostart 不播');
});

test('markPlayed 把 played 置 true', () => {
  const opening = { played:false };
  const r = O.markPlayed(opening);
  if(opening.played !== true) throw new Error('played 应为 true');
  if(r !== opening) throw new Error('应返回同一对象');
});

test('captions 锁定系统字; 第 3 镜无字; 第 5 镜旁白 活下去。', () => {
  const want = [
    '新曙光\n船体完整性：临界',
    '迫降申请：已提交\n迫降申请：已接受',
    '',
    '其余生命信号：丢失',
    '活下去。'
  ];
  const caps = CFG.opening.captions;
  if(!caps || caps.length !== 5) throw new Error('captions 长度应为 5, got '+(caps && caps.length));
  for(let i = 0; i < 5; i++){
    if(caps[i] !== want[i]) throw new Error('caption['+i+'] 应为 '+JSON.stringify(want[i])+' got '+JSON.stringify(caps[i]));
  }
  if(CFG.opening.button !== '活下去') throw new Error('button CFG 应为 活下去, got '+CFG.opening.button);
  const clock = O.createClock();
  clock.shot = 4;
  if(O.captionOf(clock) !== '活下去。') throw new Error('captionOf(last) 应为 活下去。');
});

test('audioOf: 1-3 镜 alarm, 4-5 镜与 skip 后 silence', () => {
  const c = O.createClock();
  if(O.audioOf(c) !== 'alarm') throw new Error('shot0 应为 alarm, got '+O.audioOf(c));
  c.shot = 1;
  if(O.audioOf(c) !== 'alarm') throw new Error('shot1 应为 alarm');
  c.shot = 2;
  if(O.audioOf(c) !== 'alarm') throw new Error('shot2 应为 alarm');
  c.shot = 3;
  if(O.audioOf(c) !== 'silence') throw new Error('shot3 应为 silence, got '+O.audioOf(c));
  c.shot = 4;
  if(O.audioOf(c) !== 'silence') throw new Error('shot4 应为 silence');
  const s = O.createClock();
  O.skipToLast(s);
  if(O.audioOf(s) !== 'silence') throw new Error('skip 后应为 silence, got '+O.audioOf(s));
});

test('Save.loadMeta 空存储 → opening.played===false', () => {
  const m = Save.loadMeta();
  if(!m.opening || m.opening.played !== false) throw new Error('新档 played 应为 false, got '+JSON.stringify(m.opening));
});

test('旧档无 opening 键 → played===true', () => {
  localStorage.setItem('aphelion_meta', JSON.stringify({
    v:1, research:0, tech:{}, res:{ mineral:100, food:0, leather:0, med:0 },
    stats:{ landings:1, deaths:0, kills:0, scans:0, playSec:0 }
  }));
  const m = Save.loadMeta();
  if(!m.opening || m.opening.played !== true) throw new Error('有存档无 opening 应为 played true, got '+JSON.stringify(m.opening));
});

test('显式 opening.played:false 保持 false', () => {
  localStorage.setItem('aphelion_meta', JSON.stringify({ v:1, opening:{ played:false } }));
  const m = Save.loadMeta();
  if(!m.opening || m.opening.played !== false) throw new Error('应保持 false, got '+JSON.stringify(m.opening));
});

test('旧 seen:true 迁成 played', () => {
  localStorage.setItem('aphelion_meta', JSON.stringify({ v:1, opening:{ seen:true } }));
  const m = Save.loadMeta();
  if(!m.opening || m.opening.played !== true) throw new Error('seen:true 应迁 played, got '+JSON.stringify(m.opening));
});


test('缝2 无居住舱 → 目标盖房且过客不允许', () => {
  const o = { nightDone:false, sleptInHouse:false, houseAt:null };
  const obj = O.objective(o, []);
  if(!obj || obj.id!=='house') throw new Error('应为 house, got '+JSON.stringify(obj));
  if(obj.text.indexOf('居住舱')<0 || obj.text.indexOf('[G]')<0) throw new Error('文案应含居住舱 [G], got '+obj.text);
  if(O.visitorAllowed(o, [], 0)!==false) throw new Error('无房过客不允许');
});

test('缝2 有舱未睡 → 目标去睡且过客不进场', () => {
  const o = { nightDone:false, sleptInHouse:false, houseAt:10 };
  const b = [{id:'bl_house',x:0,y:0}];
  const obj = O.objective(o, b);
  if(!obj || obj.id!=='sleep') throw new Error('应为 sleep, got '+JSON.stringify(obj));
  if(obj.text.indexOf('[E]')<0) throw new Error('文案应含 [E]');
  if(O.visitorAllowed(o, b, 10)!==false) throw new Error('未睡过客不进场');
});

test('缝2 舱内睡过 → 目标无且过客允许', () => {
  const o = { nightDone:false, sleptInHouse:false, houseAt:10 };
  O.noteSleptInHouse(o);
  const b = [{id:'bl_house'}];
  if(O.objective(o, b)!==null) throw new Error('睡过目标应无, got '+JSON.stringify(O.objective(o,b)));
  if(O.visitorAllowed(o, b, 11)!==true) throw new Error('睡过过客应允许');
});

test('缝2 未睡但完工超过一天 → 过客允许, 目标仍是去睡', () => {
  const day = CFG.DAY_LEN || 210;
  const o = { nightDone:false, sleptInHouse:false, houseAt:0 };
  const b = [{id:'bl_house'}];
  if(O.visitorAllowed(o, b, day)!==true) throw new Error('满一天过客应允许');
  const obj = O.objective(o, b);
  if(!obj || obj.id!=='sleep') throw new Error('未睡目标仍是 sleep');
});

test('缝2 老档 nightDone → 无目标且过客允许', () => {
  const o = O.defaults(true);
  if(!o.nightDone) throw new Error('老档 nightDone 应为 true');
  if(O.objective(o, [])!==null) throw new Error('老档无目标');
  if(O.visitorAllowed(o, [], 0)!==true) throw new Error('老档过客允许');
});

test('Save.loadMeta 新档 nightDone===false; 旧档 true', () => {
  const fresh = Save.loadMeta();
  if(fresh.opening.nightDone!==false) throw new Error('新档 nightDone false, got '+JSON.stringify(fresh.opening));
  localStorage.setItem('aphelion_meta', JSON.stringify({ v:1, research:0 }));
  const old = Save.loadMeta();
  if(old.opening.nightDone!==true) throw new Error('旧档 nightDone true, got '+JSON.stringify(old.opening));
});
