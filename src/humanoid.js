/* ============================================================
   Aphelion · humanoid.js — 人形 pose 缝 (ADR-0001)
   挂载: window.APH.Humanoid
   ============================================================ */
window.APH = window.APH || {};

APH.Humanoid = (function(){
  'use strict';
  var CFG = APH.CFG;

  function hum(){
    return (CFG && CFG.humanoid) || { walkPerDir:8, idlePerDir:4, idleFps:1, walkFps:10, drawH:78, chibiH:43, sheetBaseline:248, sheetContentH:240 };
  }

  /* 下0 左1 右2 上3 — 与现有玩家朝向分档一致 */
  function dirOf(ang){
    if (ang == null || isNaN(ang)) ang = Math.PI/2;
    var c = Math.cos(ang), si = Math.sin(ang);
    if (Math.abs(c) >= Math.abs(si)) return c >= 0 ? 2 : 1;
    return si >= 0 ? 0 : 3;
  }

  function sheetKey(role, faceIdx, pack, cycle){
    if (role === 'player') return cycle === 'idle' ? 'player_idle' : 'player_walk';
    var fi = (faceIdx|0);
    if (fi < 0) fi = 0;
    if (fi > 3) fi = 3;
    var ward = pack ? 'pack' : 'nopack';
    var cyc = cycle === 'idle' ? 'idle' : 'walk';
    return 'hum_' + fi + '_' + ward + '_' + cyc;
  }

  /* 人形横排 sheet 几何: walk 32 / idle 16。建筑/敌人返回 null。 */
  function sheetLayout(name){
    var H = hum();
    if (!name || typeof name !== 'string') return null;
    if (/_walk$/.test(name)) {
      var wn = (H.walkPerDir || 8) * 4;
      return { cols: wn, count: wn, fps: H.walkFps || 10 };
    }
    if (/_idle$/.test(name)) {
      var inn = (H.idlePerDir || 4) * 4;
      return { cols: inn, count: inn, fps: H.idleFps || 1 };
    }
    return null;
  }

  function faceIdx(id){
    var h = 2166136261;
    var s = String(id == null ? '' : id);
    var i;
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 4;
  }

  function appearance(role, id){
    return {
      faceIdx: faceIdx(id),
      pack: role === 'visitor'
    };
  }

  function pose(input){
    input = input || {};
    var H = hum();
    var walkN = H.walkPerDir || 8;
    var idleN = H.idlePerDir || 4;
    var fps = H.idleFps || 1;
    var dir = dirOf(input.face);
    var moving = !!input.moving;
    var role = input.role || 'player';
    var pack = !!input.pack;
    var fi = input.faceIdx;
    if (fi == null) fi = 0;
    var cycle = moving ? 'walk' : 'idle';
    var frame;
    if (moving) {
      frame = dir * walkN + ((Math.floor(input.walkPh) | 0) % walkN + walkN) % walkN;
    } else {
      var t = input.time || 0;
      frame = dir * idleN + ((Math.floor(t * fps) % idleN) + idleN) % idleN;
    }
    return {
      dir: dir,
      cycle: cycle,
      frame: frame,
      sheet: sheetKey(role, fi, pack, cycle)
    };
  }

  /* 绘制用：appearance 选脸；该脸 walk 未就绪则回退脸 0；idle 未就绪则该向 walk 第 0 帧 */
  function poseFor(input, isReady){
    input = input || {};
    var role = input.role || 'resident';
    var look = appearance(role, input.id);
    var pack = (input.pack != null) ? !!input.pack : look.pack;
    var fi = look.faceIdx;
    var ready = typeof isReady === 'function' ? isReady : function(){ return true; };
    var walkKey = sheetKey(role, fi, pack, 'walk');
    if (!ready(walkKey)) fi = 0;
    var p = pose({
      moving: input.moving,
      face: input.face,
      walkPh: input.walkPh,
      time: input.time,
      role: role,
      pack: pack,
      faceIdx: fi
    });
    if (!ready(p.sheet) && p.cycle === 'idle') {
      var wk = sheetKey(role, fi, pack, 'walk');
      if (ready(wk)) {
        p.sheet = wk;
        p.frame = p.dir * (hum().walkPerDir || 8);
      }
    }
    return p;
  }

  function spriteScale(contentH){
    var H = hum();
    var ch = contentH || 211;
    return (H.drawH || 78) / ch;
  }

  function chibiScale(){
    var H = hum();
    return (H.drawH || 78) / (H.chibiH || 43);
  }

  return {
    dirOf: dirOf,
    sheetKey: sheetKey,
    sheetLayout: sheetLayout,
    faceIdx: faceIdx,
    appearance: appearance,
    pose: pose,
    poseFor: poseFor,
    spriteScale: spriteScale,
    chibiScale: chibiScale
  };
})();
