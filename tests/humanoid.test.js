/* Humanoid pose 缝: 朝向 / 走或停 / 脸 / 有包无包 → sheet + 帧 */
'use strict';
const H = window.APH.Humanoid;

test('dirOf: 下左上右', () => {
  if (H.dirOf(Math.PI/2) !== 0) throw new Error('face π/2 应为下=0, got '+H.dirOf(Math.PI/2));
  if (H.dirOf(Math.PI) !== 1) throw new Error('face π 应为左=1, got '+H.dirOf(Math.PI));
  if (H.dirOf(0) !== 2) throw new Error('face 0 应为右=2, got '+H.dirOf(0));
  if (H.dirOf(-Math.PI/2) !== 3) throw new Error('face -π/2 应为上=3, got '+H.dirOf(-Math.PI/2));
});

test('sheetKey: 玩家 walk/idle 固定键', () => {
  if (H.sheetKey('player', 0, false, 'walk') !== 'player_walk') throw new Error('玩家走应为 player_walk');
  if (H.sheetKey('player', 3, true, 'idle') !== 'player_idle') throw new Error('玩家待机应为 player_idle');
});

test('sheetLayout: 玩家 idle 16 帧横排，walk 32', () => {
  if (typeof H.sheetLayout !== 'function') throw new Error('Humanoid.sheetLayout 未导出');
  var idle = H.sheetLayout('player_idle');
  if (!idle) throw new Error('player_idle 应有布局');
  if (idle.cols !== 16 || idle.count !== 16) throw new Error('idle 应为 16 帧横排, got '+JSON.stringify(idle));
  var walk = H.sheetLayout('player_walk');
  if (!walk || walk.cols !== 32 || walk.count !== 32) throw new Error('walk 应为 32 帧横排, got '+JSON.stringify(walk));
  if (H.sheetLayout('bl_house')) throw new Error('建筑不应走人形布局');
});

test('sheetKey: 居民无包、过客有包、键不撞', () => {
  if (H.sheetKey('resident', 0, false, 'walk') !== 'hum_0_nopack_walk') throw new Error('居民走: '+H.sheetKey('resident',0,false,'walk'));
  if (H.sheetKey('visitor', 0, true, 'walk') !== 'hum_0_pack_walk') throw new Error('过客走: '+H.sheetKey('visitor',0,true,'walk'));
  var seen = {};
  var i, pack, cyc, k;
  for (i = 0; i < 4; i++) {
    for (pack = 0; pack < 2; pack++) {
      for (cyc = 0; cyc < 2; cyc++) {
        k = H.sheetKey('resident', i, !!pack, cyc ? 'idle' : 'walk');
        if (seen[k]) throw new Error('sheet 键重复 '+k);
        seen[k] = 1;
      }
    }
  }
  if (Object.keys(seen).length !== 16) throw new Error('NPC 键应 16 个, got '+Object.keys(seen).length);
});

test('pose: 向下走第 3 帧用 walk sheet', () => {
  var p = H.pose({ moving:true, face:Math.PI/2, walkPh:3.2, time:9, role:'player' });
  if (p.dir !== 0) throw new Error('dir 应为 0, got '+p.dir);
  if (p.cycle !== 'walk') throw new Error('cycle 应为 walk, got '+p.cycle);
  if (p.frame !== 3) throw new Error('frame 应为 3, got '+p.frame);
  if (p.sheet !== 'player_walk') throw new Error('sheet 应为 player_walk, got '+p.sheet);
});

test('pose: 向右走第 0 帧是 16，不是 idle', () => {
  var p = H.pose({ moving:true, face:0, walkPh:0.1, time:0, role:'player' });
  if (p.dir !== 2) throw new Error('dir 应为 2, got '+p.dir);
  if (p.frame !== 16) throw new Error('右走第 0 帧应为 16, got '+p.frame);
  if (p.cycle !== 'walk') throw new Error('应为 walk');
});

test('pose: 站住走 idle 出口，不是 walk 第 0 帧', () => {
  var p = H.pose({ moving:false, face:0, walkPh:99, time:0.6, role:'player' });
  if (p.cycle !== 'idle') throw new Error('站住应为 idle, got '+p.cycle);
  if (p.sheet !== 'player_idle') throw new Error('sheet 应为 player_idle, got '+p.sheet);
  /* idleFps=2, time=0.6 → floor(1.2)%4=1; 右=dir2 → 2*4+1=9 */
  if (p.frame !== 9) throw new Error('右待机第 1 呼吸帧应为 9, got '+p.frame);
  if (p.sheet === 'player_walk' && p.frame === 16) throw new Error('不可用走循环第 0 帧冒充呼吸');
});

test('pose: idle 四向 下0 左4 右8 上12，不吃 walkPh', () => {
  var cases = [[Math.PI/2, 0], [Math.PI, 4], [0, 8], [-Math.PI/2, 12]];
  var i, p;
  for (i = 0; i < cases.length; i++) {
    p = H.pose({ moving:false, face:cases[i][0], walkPh:99, time:0, role:'player' });
    if (p.sheet !== 'player_idle') throw new Error('应为 player_idle, got '+p.sheet);
    if (p.cycle !== 'idle') throw new Error('应为 idle');
    if (p.frame !== cases[i][1]) throw new Error('face '+cases[i][0]+' idle 帧应为 '+cases[i][1]+', got '+p.frame);
  }
  p = H.pose({ moving:false, face:Math.PI/2, walkPh:0, time:2.0, role:'player' });
  if (p.frame !== 0) throw new Error('idle 满 4 帧应回到 0, got '+p.frame);
});

test('pose: 过客有包 idle 键', () => {
  var p = H.pose({ moving:false, face:Math.PI/2, walkPh:0, time:0, role:'visitor', faceIdx:2, pack:true });
  if (p.sheet !== 'hum_2_pack_idle') throw new Error('过客待机: '+p.sheet);
  if (p.frame !== 0) throw new Error('下向 idle 第 0 帧应为 0, got '+p.frame);
});

test('appearance: 过客有包、居民无包、脸 0–3', () => {
  var v = H.appearance('visitor', 'alpha');
  var r = H.appearance('resident', 'alpha');
  if (v.pack !== true) throw new Error('过客应有包');
  if (r.pack !== false) throw new Error('居民应无包');
  if (v.faceIdx !== r.faceIdx) throw new Error('同一 id 过客居民应同一张脸');
  if (v.faceIdx < 0 || v.faceIdx > 3) throw new Error('脸应 0–3, got '+v.faceIdx);
});
