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
  var p = H.pose({ moving:false, face:0, walkPh:99, time:1.2, role:'player' });
  if (p.cycle !== 'idle') throw new Error('站住应为 idle, got '+p.cycle);
  if (p.sheet !== 'player_idle') throw new Error('sheet 应为 player_idle, got '+p.sheet);
  /* idleFps=1, time=1.2 → floor(1.2)%4=1; 右=dir2 → 2*4+1=9 */
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
  p = H.pose({ moving:false, face:Math.PI/2, walkPh:0, time:4.0, role:'player' });
  if (p.frame !== 0) throw new Error('idle 满 4 帧应回到 0, got '+p.frame);
});

test('pose: 过客有包 idle 键', () => {
  var p = H.pose({ moving:false, face:Math.PI/2, walkPh:0, time:0, role:'visitor', faceIdx:2, pack:true });
  if (p.sheet !== 'hum_2_pack_idle') throw new Error('过客待机: '+p.sheet);
  if (p.frame !== 0) throw new Error('下向 idle 第 0 帧应为 0, got '+p.frame);
});

test('pose: 居民脸 0 无包 walk', () => {
  var p = H.pose({ moving:true, face:Math.PI/2, walkPh:3.2, time:9, role:'resident', faceIdx:0, pack:false });
  if (p.sheet !== 'hum_0_nopack_walk') throw new Error('居民走: '+p.sheet);
  if (p.cycle !== 'walk') throw new Error('cycle 应为 walk, got '+p.cycle);
  if (p.frame !== 3) throw new Error('向下走第 3 帧应为 3, got '+p.frame);
});

test('pose: 居民脸 0 无包 idle，不吃 walkPh', () => {
  var p = H.pose({ moving:false, face:0, walkPh:99, time:1.2, role:'resident', faceIdx:0, pack:false });
  if (p.sheet !== 'hum_0_nopack_idle') throw new Error('居民待机: '+p.sheet);
  if (p.cycle !== 'idle') throw new Error('站住应为 idle, got '+p.cycle);
  if (p.frame !== 9) throw new Error('右待机第 1 呼吸帧应为 9, got '+p.frame);
});

test('sheetLayout: 居民 nopack 与玩家同布局', () => {
  var w = H.sheetLayout('hum_0_nopack_walk');
  var idle = H.sheetLayout('hum_0_nopack_idle');
  if (!w || w.cols !== 32 || w.count !== 32) throw new Error('居民 walk 应为 32, got '+JSON.stringify(w));
  if (!idle || idle.cols !== 16 || idle.count !== 16) throw new Error('居民 idle 应为 16, got '+JSON.stringify(idle));
});

test('pose: 过客脸 0 有包 walk', () => {
  var p = H.pose({ moving:true, face:Math.PI/2, walkPh:3.2, time:9, role:'visitor', faceIdx:0, pack:true });
  if (p.sheet !== 'hum_0_pack_walk') throw new Error('过客走: '+p.sheet);
  if (p.cycle !== 'walk') throw new Error('cycle 应为 walk, got '+p.cycle);
  if (p.frame !== 3) throw new Error('向下走第 3 帧应为 3, got '+p.frame);
});

test('pose: 过客脸 0 有包 idle，不吃 walkPh', () => {
  var p = H.pose({ moving:false, face:0, walkPh:99, time:1.2, role:'visitor', faceIdx:0, pack:true });
  if (p.sheet !== 'hum_0_pack_idle') throw new Error('过客待机: '+p.sheet);
  if (p.cycle !== 'idle') throw new Error('站住应为 idle, got '+p.cycle);
  if (p.frame !== 9) throw new Error('右待机第 1 呼吸帧应为 9, got '+p.frame);
});

test('sheetLayout: 过客 pack 与玩家同布局', () => {
  var w = H.sheetLayout('hum_0_pack_walk');
  var idle = H.sheetLayout('hum_0_pack_idle');
  if (!w || w.cols !== 32 || w.count !== 32) throw new Error('过客 walk 应为 32, got '+JSON.stringify(w));
  if (!idle || idle.cols !== 16 || idle.count !== 16) throw new Error('过客 idle 应为 16, got '+JSON.stringify(idle));
});

test('appearance: 过客有包、居民无包、脸 0–3', () => {
  var v = H.appearance('visitor', 'alpha');
  var r = H.appearance('resident', 'alpha');
  if (v.pack !== true) throw new Error('过客应有包');
  if (r.pack !== false) throw new Error('居民应无包');
  if (v.faceIdx !== r.faceIdx) throw new Error('同一 id 过客居民应同一张脸');
  if (v.faceIdx < 0 || v.faceIdx > 3) throw new Error('脸应 0–3, got '+v.faceIdx);
});

test('appearance: 已知 id 压到脸 0–3', () => {
  /* FNV-1a % 4：rs_3→0 rs_0→1 rs_1→2 rs_2→3 */
  if (H.faceIdx('rs_3') !== 0) throw new Error('rs_3 应为脸 0, got '+H.faceIdx('rs_3'));
  if (H.faceIdx('rs_0') !== 1) throw new Error('rs_0 应为脸 1, got '+H.faceIdx('rs_0'));
  if (H.faceIdx('rs_1') !== 2) throw new Error('rs_1 应为脸 2, got '+H.faceIdx('rs_1'));
  if (H.faceIdx('rs_2') !== 3) throw new Error('rs_2 应为脸 3, got '+H.faceIdx('rs_2'));
});

test('pose: 脸 1–3 无包/有包键不撞且帧对', () => {
  var a = H.pose({ moving:true, face:Math.PI/2, walkPh:3.2, time:9, role:'resident', faceIdx:1, pack:false });
  if (a.sheet !== 'hum_1_nopack_walk' || a.frame !== 3) throw new Error('脸1居民走: '+JSON.stringify(a));
  var b = H.pose({ moving:false, face:0, walkPh:99, time:1.2, role:'visitor', faceIdx:2, pack:true });
  if (b.sheet !== 'hum_2_pack_idle' || b.frame !== 9) throw new Error('脸2过客待机: '+JSON.stringify(b));
  var c = H.pose({ moving:false, face:Math.PI/2, walkPh:0, time:0, role:'resident', faceIdx:3, pack:false });
  if (c.sheet !== 'hum_3_nopack_idle' || c.frame !== 0) throw new Error('脸3居民待机: '+JSON.stringify(c));
});

test('poseFor: appearance 选脸，缺 walk sheet 回退脸 0', () => {
  if (typeof H.poseFor !== 'function') throw new Error('Humanoid.poseFor 未导出');
  var readyAll = function(){ return true; };
  var p = H.poseFor({ role:'resident', id:'rs_0', moving:true, face:Math.PI/2, walkPh:3.2, time:0 }, readyAll);
  if (p.sheet !== 'hum_1_nopack_walk') throw new Error('rs_0 居民应脸1无包走, got '+p.sheet);
  if (p.frame !== 3) throw new Error('向下走第 3 帧应为 3, got '+p.frame);
  var v = H.poseFor({ role:'visitor', id:'rs_2', moving:false, face:0, walkPh:99, time:1.2 }, readyAll);
  if (v.sheet !== 'hum_3_pack_idle') throw new Error('rs_2 过客应脸3有包待机, got '+v.sheet);
  if (v.frame !== 9) throw new Error('右待机第 1 呼吸帧应为 9, got '+v.frame);
  var none = function(){ return false; };
  var fb = H.poseFor({ role:'resident', id:'rs_0', moving:true, face:Math.PI/2, walkPh:3.2, time:0 }, none);
  if (fb.sheet !== 'hum_0_nopack_walk') throw new Error('缺图应回退脸0, got '+fb.sheet);
});

test('chibiScale: 程序化小人拉到玩家 drawH', () => {
  if (typeof H.chibiScale !== 'function') throw new Error('Humanoid.chibiScale 未导出');
  var cfg = window.APH.CFG.humanoid;
  var want = cfg.drawH / cfg.chibiH;
  var got = H.chibiScale();
  if (got !== want) throw new Error('chibiScale 应为 '+want+' (drawH/chibiH), got '+got);
  if (got <= 1) throw new Error('小人应放大到贴图身高, got '+got);
  if (cfg.chibiBodyR * 2 !== cfg.chibiH) throw new Error('chibiBodyR×2 应为 chibiH, got '+cfg.chibiBodyR);
});

test('sheetLayout: 脸 1–3 与玩家同布局', () => {
  var i, w, idle;
  for (i = 1; i <= 3; i++) {
    w = H.sheetLayout('hum_'+i+'_nopack_walk');
    idle = H.sheetLayout('hum_'+i+'_pack_idle');
    if (!w || w.cols !== 32 || w.count !== 32) throw new Error('脸'+i+' walk 应为 32, got '+JSON.stringify(w));
    if (!idle || idle.cols !== 16 || idle.count !== 16) throw new Error('脸'+i+' idle 应为 16, got '+JSON.stringify(idle));
  }
});

/* ============ #59 俯卧 (player_prone) ============ */

test('#59 sheetLayout: player_prone 16 帧横排, 建筑仍 null', () => {
  var pr = H.sheetLayout('player_prone');
  if (!pr) throw new Error('player_prone 应有布局');
  if (pr.cols !== 16 || pr.count !== 16) throw new Error('俯卧应为 16 帧横排, got '+JSON.stringify(pr));
  if (pr.fps !== 1) throw new Error('俯卧应慢呼吸 fps=1, got '+pr.fps);
  if (H.sheetLayout('bl_house')) throw new Error('建筑不应走人形布局');
});

test('#59/#60/#61/#62/#63 sheetKey: 四脸无包居民用专用俯卧，过客/玩家沿用 player_prone', () => {
  if (H.sheetKey('player', 0, false, 'prone') !== 'player_prone') throw new Error('玩家俯卧: '+H.sheetKey('player',0,false,'prone'));
  if (H.sheetKey('resident', 0, false, 'prone') !== 'hum_0_nopack_prone') throw new Error('脸0无包居民俯卧: '+H.sheetKey('resident',0,false,'prone'));
  if (H.sheetKey('resident', 1, false, 'prone') !== 'hum_1_nopack_prone') throw new Error('脸1无包居民俯卧: '+H.sheetKey('resident',1,false,'prone'));
  if (H.sheetKey('resident', 2, false, 'prone') !== 'hum_2_nopack_prone') throw new Error('脸2无包居民俯卧: '+H.sheetKey('resident',2,false,'prone'));
  if (H.sheetKey('resident', 3, false, 'prone') !== 'hum_3_nopack_prone') throw new Error('脸3无包居民俯卧: '+H.sheetKey('resident',3,false,'prone'));
  if (H.sheetKey('visitor', 0, true, 'prone') !== 'player_prone') throw new Error('有包过客俯卧: '+H.sheetKey('visitor',0,true,'prone'));
});

test('#61 sheetLayout: 脸 1 无包居民 prone 为 16 帧四向各 4', () => {
  var pr = H.sheetLayout('hum_1_nopack_prone');
  if (!pr || pr.cols !== 16 || pr.count !== 16) throw new Error('居民俯卧应为 16 帧横排, got '+JSON.stringify(pr));
  if (pr.fps !== 1) throw new Error('居民俯卧应慢呼吸 fps=1, got '+pr.fps);
});

test('#62 sheetLayout: 脸 2 无包居民 prone 为 16 帧四向各 4', () => {
  var pr = H.sheetLayout('hum_2_nopack_prone');
  if (!pr || pr.cols !== 16 || pr.count !== 16) throw new Error('居民俯卧应为 16 帧横排, got '+JSON.stringify(pr));
  if (pr.fps !== 1) throw new Error('居民俯卧应慢呼吸 fps=1, got '+pr.fps);
});

test('#63 sheetLayout: 脸 3 无包居民 prone 为 16 帧四向各 4', () => {
  var pr = H.sheetLayout('hum_3_nopack_prone');
  if (!pr || pr.cols !== 16 || pr.count !== 16) throw new Error('居民俯卧应为 16 帧横排, got '+JSON.stringify(pr));
  if (pr.fps !== 1) throw new Error('居民俯卧应慢呼吸 fps=1, got '+pr.fps);
});

test('#60 sheetLayout: 脸 0 无包居民 prone 为 16 帧四向各 4', () => {
  var pr = H.sheetLayout('hum_0_nopack_prone');
  if (!pr || pr.cols !== 16 || pr.count !== 16) throw new Error('居民俯卧应为 16 帧横排, got '+JSON.stringify(pr));
  if (pr.fps !== 1) throw new Error('居民俯卧应慢呼吸 fps=1, got '+pr.fps);
});

test('#59 pose: 俯卧四向 下0 左4 右8 上12, 不吃 walkPh', () => {
  var cases = [[Math.PI/2, 0], [Math.PI, 4], [0, 8], [-Math.PI/2, 12]];
  var i, p;
  for (i = 0; i < cases.length; i++) {
    p = H.pose({ lying:true, face:cases[i][0], walkPh:99, time:0, role:'player' });
    if (p.cycle !== 'prone') throw new Error('俯卧应为 prone, got '+p.cycle);
    if (p.sheet !== 'player_prone') throw new Error('俯卧应为 player_prone, got '+p.sheet);
    if (p.frame !== cases[i][1]) throw new Error('face '+cases[i][0]+' 俯卧帧应为 '+cases[i][1]+', got '+p.frame);
  }
  /* walkPh 99 不应被消费 */
  var q = H.pose({ lying:true, face:Math.PI/2, walkPh:99, time:4.0, role:'player' });
  if (q.frame !== 0) throw new Error('俯卧满 4 帧应回到 0, got '+q.frame);
});

test('#59 pose: 俯卧呼吸随 time 推进(同 idle fps), 例 time=1.2 → dir2 帧9', () => {
  var p = H.pose({ lying:true, face:0, walkPh:99, time:1.2, role:'player' });
  if (p.cycle !== 'prone' || p.sheet !== 'player_prone') throw new Error('应为俯卧, got '+JSON.stringify(p));
  if (p.frame !== 9) throw new Error('右俯卧第 1 呼吸帧应为 9, got '+p.frame);
});

test('#59 pose: 俯卧优先于 moving(躺着不因走而切换)', () => {
  var p = H.pose({ lying:true, moving:true, face:Math.PI/2, walkPh:3.2, time:0, role:'player' });
  if (p.cycle !== 'prone') throw new Error('俯卧应盖过 moving, got '+p.cycle);
  if (p.sheet !== 'player_prone') throw new Error('应为 player_prone, got '+p.sheet);
  if (p.frame !== 0) throw new Error('应为帧0, got '+p.frame);
});

test('#59 poseFor: 俯卧共用 sheet, 缺图也不回退走循环', () => {
  var readyAll = function(){ return true; };
  /* rs_6 → 脸3(已配专用图), 用专用图 */
  var p = H.poseFor({ role:'resident', id:'rs_6', lying:true, face:Math.PI/2, time:0, pack:false }, readyAll);
  if (p.sheet !== 'hum_3_nopack_prone') throw new Error('脸3俯卧应为 hum_3_nopack_prone, got '+p.sheet);
  if (p.cycle !== 'prone' || p.frame !== 0) throw new Error('俯卧帧应为 0, got '+JSON.stringify(p));
  /* 专用图缺图(ready=false)时回退通用 prone, 绝不换走循环 */
  var none = function(){ return false; };
  var fb = H.poseFor({ role:'resident', id:'rs_6', lying:true, face:Math.PI, time:0, pack:false }, none);
  if (fb.sheet !== 'player_prone') throw new Error('俯卧缺图也应保持 player_prone, 不可换走循环, got '+fb.sheet);
  if (fb.cycle !== 'prone') throw new Error('俯卧缺图 cycle 应仍为 prone, got '+fb.cycle);
  if (fb.sheet === 'player_walk') throw new Error('俯卧绝不回退 player_walk');
});

test('#60 pose: 脸 0 无包居民俯卧选四向专用 sheet', () => {
  var p = H.pose({ lying:true, face:0, walkPh:99, time:1.2,
                   role:'resident', faceIdx:0, pack:false });
  if (p.cycle !== 'prone' || p.sheet !== 'hum_0_nopack_prone') throw new Error('应为脸0无包俯卧, got '+JSON.stringify(p));
  if (p.frame !== 9) throw new Error('右俯卧第 1 呼吸帧应为 9, got '+p.frame);
});

test('#60 poseFor: 专用 prone 未就绪只回退通用 prone，绝不回退 walk', () => {
  var input = { role:'resident', id:'rs_3', lying:true, face:Math.PI, time:0, pack:false };
  var readyAll = function(){ return true; };
  var p = H.poseFor(input, readyAll);
  if (p.sheet !== 'hum_0_nopack_prone' || p.frame !== 4) throw new Error('脸0居民应选专用左向俯卧, got '+JSON.stringify(p));
  var genericOnly = function(name){ return name === 'player_prone' || name === 'hum_0_nopack_walk'; };
  var fb = H.poseFor(input, genericOnly);
  if (fb.sheet !== 'player_prone' || fb.cycle !== 'prone') throw new Error('专用图缺失应回退 player_prone, got '+JSON.stringify(fb));
  var none = function(){ return false; };
  var missing = H.poseFor(input, none);
  if (missing.sheet !== 'player_prone' || missing.cycle !== 'prone') throw new Error('俯卧图全缺仍保持通用 prone 键, got '+JSON.stringify(missing));
  if (missing.sheet.indexOf('_walk') >= 0) throw new Error('俯卧绝不回退 walk');
});

test('#59 poseFor: 未配专用图的身份仍共用 player_prone', () => {
  var readyAll = function(){ return true; };
  /* 过客(pack=true)与玩家: 无脸区分, 共用 player_prone */
  var a = H.poseFor({ role:'visitor', id:'rs_6', lying:true, face:Math.PI/2, time:0 }, readyAll);
  var b = H.poseFor({ role:'player', id:'', lying:true, face:Math.PI/2, time:0 }, readyAll);
  if (a.sheet !== 'player_prone' || b.sheet !== 'player_prone') throw new Error('过客/玩家俯卧应共用 player_prone, got '+a.sheet+' / '+b.sheet);
  if (a.frame !== b.frame) throw new Error('同 face/time 应同帧, got '+a.frame+' / '+b.frame);
});

/* ============ #71 击倒叠伤痕: 俯卧 sheet 几何不变式 ============ */

test('#71 geometry: 不同 contentH 的俯卧 sheet 仍映射到同一 [-drawH,0] 身体空间', () => {
  var drawH = (window.APH.CFG.humanoid && window.APH.CFG.humanoid.drawH) || 78;
  var sheets = [
    { name:'player_prone', contentH:68 },        /* main.js SPRITE_META #59 */
    { name:'hum_0_nopack_prone', contentH:122 }, /* main.js SPRITE_META #60 */
  ];
  if (typeof H.spriteScale !== 'function') throw new Error('Humanoid.spriteScale 未导出');
  var heights = [];
  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    var want = s.contentH * H.spriteScale(s.contentH);
    heights.push(want);
    if (want !== drawH) throw new Error(s.name+' contentH×spriteScale 应为 '+drawH+', got '+want);
  }
  /* 两张俯卧表内容高不同(68 vs 122), 但缩放后身体必须同高 —— 伤痕坐标固定即可贴体,
     绝不能按 contentH 再乘一次缩放(会错位, 如 ×78/122≈0.64)。 */
  if (heights[0] !== heights[1]) throw new Error('俯卧 sheet 应映射到同一身体高, got '+heights[0]+' / '+heights[1]);
});
