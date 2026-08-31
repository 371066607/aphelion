/* ============================================================
   Aphelion · combat.js — 敌人FSM(纯函数) / 弹道 / 掉落表
   挂载: window.APH.Combat
   设计: fsmStep/rollLoot 是纯函数(node 可测);
         updateCombat 是世界侧包装(读写 APH.state, 发事件)。
   ============================================================ */
window.APH = window.APH || {};

APH.Combat = (function(){
  'use strict';
  var U = APH.U, CFG = APH.CFG, T = CFG.entType;

  /* ============================================================
     1. 敌人 FSM —— 纯函数
     状态: idle → alert → chase → attack → (低血) flee
     ctx: { dist, night, hpPct, dt, heardShot }
     ============================================================ */
  function fsmStep(en, ctx){
    var C = CFG.enemy;
    var sight = ctx.sightMul != null ? ctx.sightMul : 1;
    var aggroR = C.aggroR * (ctx.night ? C.nightAggroMul : 1) * sight;
    var noiseR = ctx.noiseAggroR != null ? ctx.noiseAggroR : (C.noiseAggroR || 300);
    var s = en.state;

    if (ctx.hpPct < C.fleeHpPct) return 'flee';

    switch(s){
      case 'idle':
        if (ctx.dist < aggroR || ctx.heardShot && ctx.dist < noiseR) return 'alert';
        return s;
      case 'alert':
        if (ctx.dist > aggroR * 1.4 && !ctx.heardShot) return 'idle';
        return 'chase';
      case 'chase':
        if (ctx.dist > C.deaggroR) return 'idle';
        if (ctx.dist < C.attackR && s !== 'flee') return 'attack';
        return s;
      case 'attack':
        if (ctx.dist > C.attackR * 1.35) return 'chase';
        return s;
      case 'flee':
        if (ctx.dist > C.deaggroR * 1.2) return 'idle';
        return s;
      default: return 'idle';
    }
  }

  /* 移动意图: FSM 状态 → 速度向量(纯函数) */
  function moveIntent(en, ctx){
    var spd = en.faction.speed * (ctx.night ? en.faction.nightBoost : 1);
    var dx = ctx.px - en.x, dy = ctx.py - en.y;
    var d = Math.sqrt(dx*dx + dy*dy) || 1;
    var nx = dx/d, ny = dy/d;
    switch(en.state){
      case 'idle':    return { vx: Math.cos(en.wanderA)*spd*.25, vy: Math.sin(en.wanderA)*spd*.25 };
      case 'alert':   return { vx: nx*spd*.5, vy: ny*spd*.5 };
      case 'chase':   return { vx: nx*spd, vy: ny*spd };
      case 'attack':  return { vx: 0, vy: 0 };
      case 'flee':    return { vx: -nx*spd*1.1, vy: -ny*spd*1.1 };
      default:        return { vx:0, vy:0 };
    }
  }

  /* spitter 是否该吐酸(纯函数) */
  function shouldSpit(en, ctx){
    return en.faction.behavior === 'spitter'
        && (en.state === 'chase' || en.state === 'alert')
        && ctx.dist < 340 && ctx.dist > 90
        && en.atkCd <= 0;
  }

  /* ============================================================
     2. 掉落表 —— 纯函数 (seeded rng 由调用方传入)
     ============================================================ */
  var LOOT_TABLE = [
    { id: 'it_crystal_ore', w: 40, n: [1,2] },
    { id: 'it_mineral',     w: 34, n: [1,3] },
    { id: 'it_alloy',       w: 20, n: [1,1] },
    { id: 'it_relic',       w: 6,  n: [1,1] },
  ];
  function rollLoot(rng){
    var total = LOOT_TABLE.reduce(function(a,e){ return a+e.w; }, 0);
    var roll = rng() * total;
    for(var i=0;i<LOOT_TABLE.length;i++){
      roll -= LOOT_TABLE[i].w;
      if(roll <= 0){
        var e = LOOT_TABLE[i];
        var n = e.n[0] + Math.floor(rng() * (e.n[1]-e.n[0]+1));
        return { id: e.id, n: n };
      }
    }
    return { id: LOOT_TABLE[0].id, n: 1 };
  }

  /* 击杀掉落实物标本 (Science #53): 酸吐者腺囊 / 硅壳甲壳 / Boss 古代芯片 */
  function specimenDropsOf(en){
    var out=[];
    if(!en) return out;
    if(en.isBoss) out.push({ id:'specimen_ancient_chip', n:1 });
    var fid=(en.faction && en.faction.id) || '';
    var beh=(en.faction && en.faction.behavior) || '';
    if(fid==='fx_spit' || beh==='spitter') out.push({ id:'specimen_acid_gland', n:1 });
    else if(fid==='fx_bulwark' || beh==='tank') out.push({ id:'specimen_chitin', n:1 });
    return out;
  }

  /* 背包操作(纯函数): 返回 {ok, carry, overflow}
     ADR: 负重超限的部分留在原地(死亡循环的经济核心) */
  function addToCarry(carry, itemId, n, carryMax){
    var def = CFG.items[itemId];
    if(!def || !n) return { ok:false, carry:carry, overflow:n };
    var w = def.w * n;
    var cur = carryWeight(carry);
    var space = carryMax - cur;
    if(space <= 0) return { ok:false, carry:carry, overflow:n };
    var take = Math.min(n, Math.floor(space / def.w));
    if(take <= 0) return { ok:false, carry:carry, overflow:n };
    var c = Object.assign({}, carry);
    c[itemId] = (c[itemId]||0) + take;
    return { ok:true, carry:c, overflow:n-take };
  }
  function carryWeight(carry){
    var w = 0;
    for(var k in carry) w += (CFG.items[k]?CFG.items[k].w:0) * carry[k];
    return w;
  }
  /* 背包→研究点(纯函数)。缺物品 id 跳过, 永不抛错。 */
  function settleValue(carry){
    var gained=0;
    if(!carry) return 0;
    for(var k in carry){
      var it=CFG.items[k];
      if(!it) continue;
      gained += (it.v||0) * (carry[k]||0);
    }
    return gained;
  }
  /* 背包分账: 矿材/合金入仓, 晶体/遗件变研究点, 异星种子/实物标本入库 (Flora #36 / Science #53) */
  function settleGoods(carry){
    var research=0, mineral=0, seeds={}, specimens={};
    if(!carry) return { research:0, mineral:0, seeds:seeds, specimens:specimens };
    for(var k in carry){
      var n=carry[k]||0;
      if(!n) continue;
      var it=CFG.items[k];
      if(k==='it_mineral') mineral += n;
      else if(k==='it_alloy') mineral += n*3;
      else if(k.startsWith('it_seed_')){
        seeds[k] = (seeds[k]||0) + n;
      }
      else if((it && it.isSpecimen) || (k.indexOf('specimen_')===0)){
        specimens[k] = (specimens[k]||0) + n;
      }
      else if(k==='it_crystal_ore' || k==='it_relic'){
        research += (it && it.v ? it.v : 0) * n;
      }
    }
    return { research:research, mineral:mineral, seeds:seeds, specimens:specimens };
  }

  function raidPillage(meta, building){
    if(!meta||!meta.res) return { food:0, mineral:0, med:0 };
    var pf=(CFG.economy&&CFG.economy.pillageFood)||3;
    var pm=(CFG.economy&&CFG.economy.pillageMineral)||2;
    var pd=(CFG.economy&&CFG.economy.pillageMed)||1;
    var food=Math.min(pf, meta.res.food||0);
    var mineral=Math.min(pm, meta.res.mineral||0);
    var med=Math.min(pd, meta.res.med||0);
    meta.res.food=(meta.res.food||0)-food;
    meta.res.mineral=(meta.res.mineral||0)-mineral;
    meta.res.med=(meta.res.med||0)-med;
    if(building) building.offlineT=(building.offlineT||0)+90;
    return { food:food, mineral:mineral, med:med };
  }

  function pickRaidFocus(en, s){
    var buildings=(s.colony&&s.colony.buildings)||[];
    var pri={ bl_warehouse:0, bl_farm:1, bl_workshop:2, bl_house:3, bl_pasture:4 };
    var best=null, bd=1e9;
    buildings.forEach(function(b){
      if(pri[b.id]==null) return;
      var d=U.dst(en.x,en.y,b.x,b.y)+pri[b.id]*40;
      if(d<bd){ bd=d; best=b; }
    });
    var pd=U.dst(en.x,en.y,s.px,s.py);
    if(!best || pd<80) return { x:s.px, y:s.py, kind:'player' };
    var resBest=null, rd=1e9;
    (s.entities||[]).forEach(function(e){
      if(!e || e.dead || e.type!==T.RESIDENT) return;
      var d=U.dst(en.x,en.y,e.x,e.y);
      if(d<rd){ rd=d; resBest=e; }
    });
    if(resBest && rd<72 && rd < U.dst(en.x,en.y,best.x,best.y)){
      return { x:resBest.x, y:resBest.y, kind:'resident', e:resBest };
    }
    return { x:best.x, y:best.y, kind:'building', b:best };
  }

  /* 阶段E: 盗掠者目标——最近地上物堆 > 仓库, 都没有则原地(等撤退指令) */
  function pickPillageFocus(en, s){
    var best=null, bd=1e9;
    (s.entities||[]).forEach(function(e){
      if(!e || e.dead || e.type!==T.DROPPED) return;
      var d=U.dst(en.x,en.y,e.x,e.y);
      if(d<bd){ bd=d; best=e; }
    });
    if(best) return { x:best.x, y:best.y, kind:'pile' };
    var wh=null, wd=1e9;
    ((s.colony&&s.colony.buildings)||[]).forEach(function(b){
      if(b.id!=='bl_warehouse') return;
      var d=U.dst(en.x,en.y,b.x,b.y);
      if(d<wd){ wd=d; wh=b; }
    });
    if(wh) return { x:wh.x, y:wh.y, kind:'building', b:wh };
    /* 无可偷之物: 奔家园中心游荡(炮塔可清), 避免原地僵持 */
    return { x:CFG.HAB.x, y:CFG.HAB.y, kind:'pile' };
  }

  /* ============================================================
     T4 袭击者寻路+破墙+围攻炮击目标 (issue #77)
     纯函数: planChase / breachFocus / wallHp / strikeWall / pickShellTarget
     依赖 APH.Nav(T1) — 运行时调用, 模块加载顺序无关。
     ============================================================ */
  /* 墙块耐久(旧存档无 hp 字段 → 默认 CFG.wall.hp) */
  function wallHp(b){
    if(b && b.hp != null) return b.hp;
    return (CFG.wall && CFG.wall.hp != null) ? CFG.wall.hp : 60;
  }
  /* 最近可拆墙块(纯函数; 排除已归零) */
  function breachFocus(en, s){
    var bs = (s && s.colony && s.colony.buildings) || [];
    var best = null, bd = 1e9;
    bs.forEach(function(b){
      if(!b || b.id !== 'bl_wall') return;
      if(b.hp != null && b.hp <= 0) return;
      var d = U.dst(en.x, en.y, b.x, b.y);
      if(d < bd){ bd = d; best = b; }
    });
    if(!best) return null;
    return { x:best.x, y:best.y, kind:'wall', b:best };
  }
  /* 袭击者寻路计划(纯函数):
     direct = 无墙或直线可见(原直线冲脸行为)
     path   = 绕墙路径(Nav.astar; 闸门格不在障碍矩阵=可直接穿门)
     breach = 完全堵死(astar 无解) → 拆最近墙(工兵行为) */
  function planChase(en, focus, s){
    var bs = (s && s.colony && s.colony.buildings) || [];
    var hasWall = false;
    var armedTraps = [];
    for(var i = 0; i < bs.length; i++){
      if(bs[i] && bs[i].id === 'bl_wall'){ hasWall = true; }
      if(bs[i] && bs[i].id === 'bl_spike_trap' && bs[i].armed !== false) armedTraps.push(bs[i]);
    }
    /* P2: 无墙但有待触发陷阱 → 也走寻路(绕陷阱); 两者皆无 → 直线 */
    if((!hasWall && !armedTraps.length) || !window.APH.Nav || !en || !focus) return { mode:'direct' };
    var grid = APH.Nav.gridOf(bs);
    var GRID = (CFG && CFG.GRID) || 48;   /* ADR-4 逻辑格网 (costFn 闭包用) */
    var trapPen = (CFG.defense && CFG.defense.trapAvoidCost != null) ? CFG.defense.trapAvoidCost : 6;
    var costFn = armedTraps.length ? function(gx, gy){
      for (var i = 0; i < armedTraps.length; i++){
        var tgx = Math.floor((armedTraps[i].x || 0) / GRID);
        var tgy = Math.floor((armedTraps[i].y || 0) / GRID);
        if (tgx === gx && tgy === gy) return trapPen;
      }
      return 0;
    } : null;
    var path = APH.Nav.astar(grid, { x:en.x, y:en.y }, { x:focus.x, y:focus.y }, costFn);
    if(path && path.length > 1) return { mode:'path', path:path };
    if(!path){
      var wf = breachFocus(en, s);
      if(wf) return { mode:'breach', wall:wf };
    }
    return { mode:'direct' };
  }
  /* 近战砍墙: 扣耐久, 归零→移除记录+掉落石料(返回是否命中过) */
  function strikeWall(en, b, s){
    if(!b || b.id !== 'bl_wall') return false;
    if(b.hp != null && b.hp <= 0) return false;
    var dmg = (en.faction && en.faction.dmg) || 6;
    b.hp = wallHp(b) - dmg;
    b.hitFlash = 0.1;
    if(b.hp <= 0) destroyWall(b, s);
    U.emit('wallHit', { x:b.x, y:b.y, hp:Math.max(0, b.hp) });
    return true;
  }
  /* 墙毁: 从 colony.buildings 移除 + 地上掉落石料 1~2 */
  function destroyWall(b, s){
    b.hp = 0;
    var list = (s && s.colony) ? s.colony.buildings : null;
    if(list){
      for(var i = 0; i < list.length; i++){
        if(list[i] === b){ list.splice(i, 1); break; }
      }
    }
    var W = CFG.wall || {};
    var lo = (W.dropStoneMin != null) ? W.dropStoneMin : 1;
    var hi = (W.dropStoneMax != null) ? W.dropStoneMax : 2;
    var n = lo + Math.floor(Math.random() * (hi - lo + 1));
    spawnDrop(b.x, b.y, 'it_stone', n, { stock:true, jitter:10 });
    s.shake = Math.min(1, (s.shake||0) + .12);
    U.emit('wallDown', { x:b.x, y:b.y });
  }
  /* T5 弹道掩体 (issue #78): 线段 vs 轴对齐墙盒(48px 格)相交判定(slab 法)
     弹丸本帧位移线段跨越墙块即命中(含贴边端点); 零长段=点是否在盒内。 */
  function segHitBox(x1, y1, x2, y2, bx, by, half){
    var minX = bx - half, maxX = bx + half;
    var minY = by - half, maxY = by + half;
    var dx = x2 - x1, dy = y2 - y1;
    var t0 = 0, t1 = 1, ta, tb, tmp;
    if(dx === 0){
      if(x1 < minX || x1 > maxX) return false;
    }else{
      ta = (minX - x1) / dx; tb = (maxX - x1) / dx;
      if(ta > tb){ tmp = ta; ta = tb; tb = tmp; }
      if(ta > t0) t0 = ta;
      if(tb < t1) t1 = tb;
      if(t0 > t1) return false;
    }
    if(dy === 0){
      if(y1 < minY || y1 > maxY) return false;
    }else{
      ta = (minY - y1) / dy; tb = (maxY - y1) / dy;
      if(ta > tb){ tmp = ta; ta = tb; tb = tmp; }
      if(ta > t0) t0 = ta;
      if(tb < t1) t1 = tb;
      if(t0 > t1) return false;
    }
    return true;
  }
  /* 围攻炮击目标(纯函数): 优先墙/炮塔, 其次最近可停机建筑(发射台除外) */
  function pickShellTarget(cx, cy, buildings){
    var sg = (CFG.raidTactics && CFG.raidTactics.tactics && CFG.raidTactics.tactics.siege) || {};
    var prefer = sg.shellPrefer || { bl_wall:1, bl_turret:1 };
    var pen = (sg.shellPreferPenalty != null) ? sg.shellPreferPenalty : 300;
    var best = null, bd = 1e9;
    (buildings || []).forEach(function(b){
      if(!b || b.id === 'bl_landing_pad') return;
      if(b.id === 'bl_wall' && b.hp != null && b.hp <= 0) return;
      var d = U.dst(cx, cy, b.x, b.y) + (prefer[b.id] ? 0 : pen);
      if(d < bd){ bd = d; best = b; }
    });
    return best;
  }

  /* 士兵找最近的非友军敌人 / 围攻营地 */
  function nearestRaidFoe(en, entities){
    var best=null, bd=1e9;
    for(var i=0;i<entities.length;i++){
      var o=entities[i];
      if(!o || o===en || o.dead || o.type!==T.ENEMY || o.isSoldier) continue;
      var d=U.dst(en.x,en.y,o.x,o.y);
      if(d<bd){ bd=d; best=o; }
    }
    return best;
  }
  function nearestSiegeCamp(en, entities){
    var best=null, bd=1e9;
    for(var i=0;i<entities.length;i++){
      var o=entities[i];
      if(!o || o.dead || o.type!==T.BUILDING || o.bid!=='bl_siege_camp') continue;
      var d=U.dst(en.x,en.y,o.x,o.y);
      if(d<bd){ bd=d; best=o; }
    }
    return best;
  }
  function stepSoldier(en, dt, night){
    var s=APH.state;
    var foe=nearestRaidFoe(en, s.entities);
    var camp=nearestSiegeCamp(en, s.entities);
    en.atkCd=(en.atkCd||0)-dt;
    en.wanderA=(en.wanderA||0)+(U.rr(-1,1))*dt*2;
    var target=foe, kind='foe';
    if(camp){
      var cd=U.dst(en.x,en.y,camp.x,camp.y);
      var fd=foe?U.dst(en.x,en.y,foe.x,foe.y):1e9;
      if(!foe || cd<=fd+30){ target=camp; kind='camp'; }
    }
    if(!target){
      en.state='idle';
      var idle=moveIntent(en, { px:en.x, py:en.y, night:!!night });
      en.x+=idle.vx*dt; en.y+=idle.vy*dt;
      en.x=U.clamp(en.x,30,CFG.WORLD-30);
      en.y=U.clamp(en.y,30,CFG.WORLD-30);
      if(en.hp<=0) en.dead=true;
      return;
    }
    var dist=U.dst(en.x,en.y,target.x,target.y);
    var maxHp=en.maxHp||en.faction.hp||1;
    var c={
      dist:dist, night:!!night,
      hpPct:en.hp/maxHp,
      heardShot:false,
      px:target.x, py:target.y,
    };
    en.state=fsmStep(en, c);
    var meleeR=kind==='camp'
      ? ((((CFG.raidTactics||{}).tactics||{}).siege||{}).campMeleeR||40)
      : CFG.enemy.attackR;
    if(dist<=meleeR && en.atkCd<=0){
      en.state='attack';
      en.atkCd=CFG.enemy.attackCd;
      if(kind==='camp'){
        target.hp-=(CFG.soldier.dmg||en.faction.dmg||6);
        target.hitFlash=0.1;
        if(target.hp<=0){ target.dead=true; U.emit('siegeCampDown', target); }
      }else{
        foe.hp-=(CFG.soldier.dmg||en.faction.dmg||6);
        foe.hitFlash=0.1;
        U.emit('enemyHit', foe);
        if(foe.hp<=0) killEnemy(foe);
      }
    }
    var mi=moveIntent(en, c);
    en.x+=mi.vx*dt; en.y+=mi.vy*dt;
    en.x=U.clamp(en.x,30,CFG.WORLD-30);
    en.y=U.clamp(en.y,30,CFG.WORLD-30);
    en.walkPh=(en.walkPh||0)+dt*(Math.abs(mi.vx)+Math.abs(mi.vy)>1?9:3);
    if(en.hp<=0) en.dead=true;
  }

  /* ============================================================
     3. 世界侧更新(非纯, 每帧调用)
     ============================================================ */
  function updateCombat(dt, night){
    var s = APH.state;
    var ctx2 = { night:night, px:s.px, py:s.py };

    var alive = 0;
    s.entities.forEach(function(en){
      if(en.type !== T.ENEMY || en.dead) return;
      alive++;

      /* 驻守士兵: 打袭击敌人, 永不打玩家, 不因离玩家过远回收 */
      if(en.isSoldier){
        stepSoldier(en, dt, night);
        return;
      }

      /* 阶段E: 溃退者——背向家园撤离, 越界消失 */
      if(en.retreat){
        var RT=CFG.raidTactics||{};
        var rdx=en.x-CFG.HAB.x, rdy=en.y-CFG.HAB.y;
        var rl=Math.sqrt(rdx*rdx+rdy*rdy)||1;
        var rspd=en.faction.speed*(RT.fleeSpdMul!=null?RT.fleeSpdMul:1.15);
        en.state='flee';
        en.x=U.clamp(en.x+rdx/rl*rspd*dt,30,CFG.WORLD-30);
        en.y=U.clamp(en.y+rdy/rl*rspd*dt,30,CFG.WORLD-30);
        en.walkPh=(en.walkPh||0)+dt*9;
        if(rl>(RT.fleeDespawnR||1000)) en.dead=true;
        if(en.hp<=0) killEnemy(en);
        return;
      }

      /* 阶段E: 围攻扎营——绕营地游走, 不进攻(被打死照常掉落) */
      if(en.sieging){
        var SRT=CFG.raidTactics||{};
        en.state='idle';
        en.wanderA=(en.wanderA||0)+(U.rr(-1,1))*dt*1.5;
        var wr=(SRT.siegeWanderR!=null?SRT.siegeWanderR:46);
        var stx=(en.campX||en.x)+Math.cos(en.wanderA)*wr;
        var sty=(en.campY||en.y)+Math.sin(en.wanderA)*wr;
        var sdx=stx-en.x, sdy=sty-en.y;
        var sl=Math.sqrt(sdx*sdx+sdy*sdy)||1;
        var sspd=en.faction.speed*(SRT.siegeWalkMul!=null?SRT.siegeWalkMul:.35);
        en.x=U.clamp(en.x+sdx/sl*sspd*dt,30,CFG.WORLD-30);
        en.y=U.clamp(en.y+sdy/sl*sspd*dt,30,CFG.WORLD-30);
        en.walkPh=(en.walkPh||0)+dt*3;
        if(en.hp<=0) killEnemy(en);
        return;
      }

      /* 感知: 家园袭击优先冲仓库/农场/工坊, 玩家靠近则改追人;
         盗掠者(阶段E)只奔地上物堆/仓库 */
      var focus = (s.scene==='home')
        ? (en.pillager ? pickPillageFocus(en, s) : pickRaidFocus(en, s))
        : { x:s.px, y:s.py, kind:'player' };
      /* T4 绕墙寻路: 非逃跑状态都算路径(0.6s 缓存, 防每帧 A*);
         完全堵死 → 改瞄最近墙(拆墙工兵), 墙被拆后立即重算 */
      var pathPlan = null;
      if(s.scene==='home' && en.state !== 'flee'){
        var fk = Math.round(focus.x)+','+Math.round(focus.y);
        en.pathT = (en.pathT || 0) - dt;
        if(!en.chasePlan || en.chasePlan.fk !== fk || en.pathT <= 0){
          en.chasePlan = planChase(en, focus, s);
          en.chasePlan.fk = fk;
          en.pathT = 0.6;
        }
        pathPlan = en.chasePlan;
        if(pathPlan.mode === 'breach'){
          if(pathPlan.wall && (pathPlan.wall.hp == null || pathPlan.wall.hp > 0)){
            focus = pathPlan.wall;          // 目标=墙块
          }else{
            /* 目标墙刚被拆: 立即重算(原目标此时可能已可达) */
            en.chasePlan = planChase(en, focus, s);
            en.chasePlan.fk = fk;
            en.pathT = 0.6;
            pathPlan = en.chasePlan;
            if(pathPlan.mode === 'breach' && pathPlan.wall) focus = pathPlan.wall;
          }
        }
      }
      var dist = U.dst(en.x, en.y, focus.x, focus.y);
      var echo = s.scene==='expedition' && window.APH.Planet && APH.Planet.hasLaw
        && APH.Planet.hasLaw(s.spec, 'lw_echo');
      var L = CFG.laws || {};
      /* W3 雾天感知: enemySightMul 乘入 aggro 判定(与 nightAggroMul 同乘法位置); 家园天气, 远征不适用 */
      var wxSightMul = 1;
      if(s.scene === 'home' && window.APH.Weather && APH.Weather.currentId){
        wxSightMul = APH.Weather.weatherEffects(APH.Weather.currentId(s.meta)).enemySightMul || 1;
      }
      var sightMul = (echo ? (L.echoSightMul || 0.45) : 1) * wxSightMul;
      var noiseMul = echo ? (L.echoNoiseMul || 1.8) : 1;
      var noiseR = (CFG.combat.noiseRadius || 300) * noiseMul;
      var c = {
        dist: dist, night: night,
        hpPct: en.hp / en.faction.hp,
        heardShot: s.noiseT > 0 && U.dst(en.x,en.y,s.px,s.py) < noiseR,
        px: focus.x, py: focus.y,
        sightMul: sightMul,
        noiseAggroR: noiseR,
      };

      /* FSM */
      var prev = en.state;
      en.state = fsmStep(en, c);
      /* 家园袭击: 刷在视口外, 远征脱战半径会 idle/回收; 非逃跑者保持冲锋 */
      if(s.scene === 'home' && en.state !== 'flee' && en.state !== 'attack') en.state = 'chase';
      if(s.scene === 'home'){
        en.stealT=(en.stealT||0)-dt;
        if(en.stealT<=0 && stealNearbyDrop(en, s)) en.stealT=0.55;
      }
      if(en.state !== prev) U.emit('enemyState', { en:en, from:prev, to:en.state });

      /* 攻击冷却 */
      en.atkCd -= dt;
      en.wanderA += (U.rr(-1,1)) * dt * 2;

      /* spitter 远程(仍瞄准玩家); 盗掠者不伤人 */
      if(!en.pillager &&
         shouldSpit(en, Object.assign({}, c, { dist:U.dst(en.x,en.y,s.px,s.py), px:s.px, py:s.py }))){
        en.atkCd = 2.2;
        var ddx = s.px-en.x, ddy = s.py-en.y, dd = Math.sqrt(ddx*ddx+ddy*ddy)||1;
        s.entities.push(makeProj(en.x, en.y, ddx/dd*CFG.enemy.projSpeed, ddy/dd*CFG.enemy.projSpeed, 'enemy', en.faction.dmg));
        U.emit('enemySpit', en);
      }

      /* 近战: 墙 → 士兵 → 玩家 → 居民 → 建筑掠夺 */
      if(en.state === 'attack' && en.atkCd <= 0 && focus.kind === 'wall' && focus.b){
        /* T4 破墙: 近战砍墙扣耐久 */
        en.atkCd = CFG.enemy.attackCd;
        strikeWall(en, focus.b, s);
      }else if(en.state === 'attack' && en.atkCd <= 0 && en.pillager){
        /* 盗掠者(阶段E): 不打建筑不伤人, 只从仓库偷资源(不致停机) */
        en.atkCd = CFG.enemy.attackCd;
        if(focus.kind==='building' && focus.b){
          var pl=raidPillage(s.meta, null);
          if(pl.food||pl.mineral||pl.med){
            if(window.APH.UI && APH.UI.floatText)
              APH.UI.floatText('⚠ 仓库被盗掠','#ff9a9a');
            U.emit('raidStole', en);
          }
        }
      }else if(en.state === 'attack' && en.atkCd <= 0){
        en.atkCd = CFG.enemy.attackCd;
        var solHit=null, sd=CFG.enemy.attackR;
        s.entities.forEach(function(o){
          if(o.type!==T.ENEMY || !o.isSoldier || o.dead) return;
          var d=U.dst(en.x,en.y,o.x,o.y);
          if(d<sd){ sd=d; solHit=o; }
        });
        if(solHit){
          solHit.hp -= en.faction.dmg;
          solHit.hitFlash=0.1;
          if(solHit.hp<=0) solHit.dead=true;
        }else if(U.dst(en.x,en.y,s.px,s.py) < CFG.enemy.attackR){
          hurtPlayer(en.faction.dmg, en.faction.name);
        }else if(s.scene==='home' && strikeResident(en, s)){
          /* 打伤殖民者, 不致死 */
        }else if(focus.kind==='building' && focus.b){
          var loot=raidPillage(s.meta, focus.b);
          if((loot.food||loot.mineral||loot.med) && window.APH.UI && APH.UI.floatText){
            var bits=[];
            if(loot.food) bits.push('粮-'+loot.food);
            if(loot.mineral) bits.push('矿-'+loot.mineral);
            if(loot.med) bits.push('药-'+loot.med);
            APH.UI.floatText('⚠ 被抢 '+bits.join(' '),'#ff9a9a');
          }
        }
        U.emit('enemyMelee', en);
      }

      /* 移动: 绕墙沿 A* 路径推进; 其余走原直线意图 */
      /* T10 减速: 沙袋 ×0.5 + 出血 ×0.7 (敌近战/远程皆适用); home 限定(远征无阵地) */
      if(en.bleedT>0) en.bleedT=Math.max(0, en.bleedT-dt);   // 出血衰减
      var t10Mul = 1;
      if(s.scene==='home' && window.APH.Colony){
        var bags=(s.colony&&s.colony.buildings||[]).filter(function(b){ return b.id==='bl_sandbag'; });
        t10Mul = APH.Colony.sandbagMul(bags, en) * APH.Colony.bleedMul(en);
      }
      if(pathPlan && pathPlan.mode === 'path' && en.state === 'chase'){
        var pSpd = en.faction.speed * (night ? ((en.faction.nightBoost != null) ? en.faction.nightBoost : 1) : 1) * t10Mul;
        APH.Nav.followPath(en, pathPlan.path, dt, pSpd);
        en.x = U.clamp(en.x, 30, CFG.WORLD-30);
        en.y = U.clamp(en.y, 30, CFG.WORLD-30);
        en.walkPh += dt * (en.walking ? 9 : 3);
      }else{
        var mi = moveIntent(en, c);
        en.x += mi.vx * t10Mul * dt; en.y += mi.vy * t10Mul * dt;
        en.x = U.clamp(en.x, 30, CFG.WORLD-30);
        en.y = U.clamp(en.y, 30, CFG.WORLD-30);
        en.walkPh += dt * (Math.abs(mi.vx)+Math.abs(mi.vy) > 1 ? 9 : 3);
      }

      /* T10 尖刺陷阱: 敌人踩中(armed格内) → 穿刺伤害+出血+触发布置(一次性) */
      if(s.scene==='home' && window.APH.Colony && !en.pillager && !en.retreat && !en.sieging){
        var traps=(s.colony&&s.colony.buildings||[]).filter(function(b){ return b.id==='bl_spike_trap'; });
        var hitTrap=APH.Colony.trapTriggers(traps, en);
        if(hitTrap){
          var strike=APH.Colony.trapStrike(en);
          hitTrap.armed=false;                       /* 一次性: 触发后不再触发 */
          hitTrap.cd=2;                              /* 触发展示计时(已触发态) */
          s.parts= s.parts||[];
          s.parts.push({t:'spark', x:en.x, y:en.y-14, life:.4, max:.4});
          if(window.APH.UI && APH.UI.floatText)
            APH.UI.floatText('⚠ 尖刺 '+Math.round(strike.dmg)+' 出血!','#ff6d7a');
        }
      }

      /* 太远回收(家园袭击不按离玩家距离清波) */
      if(U.dst(en.x,en.y,s.px,s.py) > CFG.enemy.despawnR && s.scene !== 'home'){ en.dead = true; }
    });

    /* ---- 玩家弹丸 ---- */
    s.entities.forEach(function(p){
      if(p.type !== T.PROJECTILE || p.dead) return;
      p.life -= dt;
      if(p.life <= 0){ p.dead = true; return; }
      var segX0=p.x, segY0=p.y;              // T3-fix: 隧穿修复——线段扫描
      p.x += p.vx*dt; p.y += p.vy*dt;

      /* 点到本帧位移线段的最短距离 */
      function segDist(x1,y1,x2,y2,px2,py2){
        var dx=x2-x1, dy=y2-y1;
        var L2=dx*dx+dy*dy;
        var t2=L2? ((px2-x1)*dx+(py2-y1)*dy)/L2 : 0;
        t2=Math.max(0,Math.min(1,t2));
        var cx=x1+dx*t2, cy=y1+dy*t2;
        return Math.sqrt((px2-cx)*(px2-cx)+(py2-cy)*(py2-cy));
      }

      /* T5 弹道掩体 (issue #78): 墙块拦截一切弹丸(player/siege/enemy)
         本帧路径线段 vs 48px 格碰撞盒; 仅 bl_wall 拦弹(闸门不挡, 穿门语义延续)。
         自家墙不豁免: 玩家/炮塔弹药打自家墙同扣血——墙=真实掩体。 */
      var wList = (s.colony && s.colony.buildings) || [];
      for(var wi = 0; wi < wList.length; wi++){
        var wb = wList[wi];
        if(!wb || wb.id !== 'bl_wall') continue;
        if(wb.hp != null && wb.hp <= 0) continue;
        if(!segHitBox(segX0, segY0, p.x, p.y, wb.x, wb.y, CFG.ballistic.wallHalf)) continue;
        p.dead = true;
        /* 弹丸伤害; 围攻炮弹无 dmg 字段(T4 语义: 固定 shellDmg 两发一墙) */
        var wDmg = p.dmg || CFG.wall.shellDmg;
        wb.hp = wallHp(wb) - wDmg;
        wb.hitFlash = 0.1;
        U.emit('wallHit', { x: wb.x, y: wb.y, hp: Math.max(0, wb.hp) });
        if(wb.hp <= 0) destroyWall(wb, s);
        s.shake = Math.min(1, (s.shake || 0) + 0.12);
        if(p.side === 'siege' && window.APH.UI && APH.UI.floatText)
          APH.UI.floatText('💥 围攻炮击! 墙体受损', '#ff9a9a');
        break;
      }
      if(p.dead) return;      // 弹丸被墙消耗: 不再参与后续命中判定

      if(p.side === 'player'){
        for(var ei=0; ei<s.entities.length; ei++){
          var en=s.entities[ei];
          if(en.type === T.BUILDING && (en.bid==='bl_rival_base'||en.bid==='bl_siege_camp')
             && !en.dead
             && segDist(segX0,segY0,p.x,p.y,en.x,en.y) < 44){
            p.dead=true; en.hp-=p.dmg;
            s.shake=Math.min(1,s.shake+.15);
            U.emit('rivalBaseHit',en);
            if(en.hp<=0){
              if(en.bid==='bl_rival_base') raidBaseSuccess(en);
              else { en.dead=true; U.emit('siegeCampDown', en); }  // 阶段E: 拆营→溃退
            }
            break;
          }
          if(en.type !== T.ENEMY || en.dead || en.isSoldier) continue;
          var r = 14 * en.faction.gene.size * (en.isBoss?1.9:1);
          if(segDist(segX0,segY0,p.x,p.y,en.x,en.y) < r){
            p.dead = true;
            en.hp -= p.dmg;
            s.shake = Math.min(1, s.shake+.12);
            U.emit('enemyHit', en);
            if(en.hp <= 0) killEnemy(en);
            break;
          }
        }
      }else if(p.side === 'siege'){
        var blds=(s.colony&&s.colony.buildings)||[];
        for(var bi=0; bi<blds.length; bi++){
          var tb=blds[bi];
          if(!tb || tb.id==='bl_landing_pad') continue;
          /* T5: 墙块已在弹道障碍层拦截(segHitBox+墙伤害), 此处只处理非墙建筑 */
          if(tb.id === 'bl_wall') continue;
          if(segDist(segX0,segY0,p.x,p.y,tb.x,tb.y) < 36){
            p.dead=true;
            tb.offlineT=(tb.offlineT||0)+(p.offlineSec!=null?p.offlineSec:20);
            s.shake=Math.min(1,(s.shake||0)+.3);
            if(window.APH.UI && APH.UI.floatText)
              APH.UI.floatText('💥 围攻炮击! 建筑停机','#ff9a9a');
            break;
          }
        }
      }else if(p.side === 'enemy'){
        if(segDist(segX0,segY0,p.x,p.y,s.px,s.py) < CFG.player.radius+5){
          p.dead = true;
          hurtPlayer(p.dmg, '酸液');
        }else{
          for(var si=0; si<s.entities.length; si++){
            var sol=s.entities[si];
            if(!sol.isSoldier || sol.dead) continue;
            if(segDist(segX0,segY0,p.x,p.y,sol.x,sol.y) < 16){
              p.dead=true;
              sol.hp-=p.dmg;
              if(sol.hp<=0) sol.dead=true;
              break;
            }
          }
        }
      }
    });

    /* 枪声衰减 */
    if(s.noiseT > 0) s.noiseT -= dt;

    /* 清尸 */
    s.entities = s.entities.filter(function(e){ return !e.dead || e.type===T.PLAYER; });
  }

  function makeProj(x,y,vx,vy,side,dmg){
    return { id:'pj_'+(++pid), type:T.PROJECTILE,
             x:x, y:y, vx:vx, vy:vy, side:side, dmg:dmg,
             life: side==='player' ? CFG.combat.plasmaLife : CFG.enemy.projLife };
  }
  var pid = 0;

  function spawnDrop(x, y, itemId, n, extra){
    var s = APH.state;
    if(!s || !s.entities || !itemId || !n) return null;
    extra = extra || {};
    var H = CFG.haul || {};
    var stackR = extra.stackR != null ? extra.stackR : (H.stackR || 44);
    var jitter = extra.jitter != null ? extra.jitter : 16;
    var found = null;
    if(extra.merge !== false){
      for(var i=0;i<s.entities.length;i++){
        var e=s.entities[i];
        if(!e || e.dead || e.type!==T.DROPPED || e.itemId!==itemId) continue;
        if(U.dst(e.x,e.y,x,y)<stackR){ found=e; break; }
      }
    }
    if(found){ found.n=(found.n||1)+n; return found; }
    var drop={
      id:'dp_'+(++pid), type:T.DROPPED,
      x:x+(Math.random()*2-1)*jitter, y:y+(Math.random()*2-1)*jitter*0.7,
      itemId:itemId, n:n, bobA:Math.random()*6.28,
      stock: s.scene==='home' || !!extra.stock
    };
    s.entities.push(drop);
    return drop;
  }

  function stealNearbyDrop(en, s){
    var H=CFG.haul||{};
    var r=H.stealR!=null?H.stealR:28;
    var best=null, bd=r;
    (s.entities||[]).forEach(function(e){
      if(!e || e.dead || e.type!==T.DROPPED) return;
      var d=U.dst(en.x,en.y,e.x,e.y);
      if(d<bd){ bd=d; best=e; }
    });
    if(!best) return false;
    best.dead=true;
    var it=(CFG.items&&CFG.items[best.itemId])||{};
    if(window.APH.UI && APH.UI.floatText)
      APH.UI.floatText('⚠ 地上被抢走 '+(it.name||best.itemId)+'×'+(best.n||1),'#ff9a9a');
    U.emit('raidStole', en);
    return true;
  }

  /* ---------- Task4: 炮塔/士兵(纯函数部分) ---------- */
  function turretDamage(lv){ return CFG.turret.dmgBase + CFG.turret.dmgPerLv*((lv||1)-1); }
  function soldierCount(barracks){
    return barracks.reduce(function(a,b){ return a + CFG.soldier.perBarracks*(b.lv||1); },0);
  }
  /* 炮塔单步: 冷却递减; 射程内最近敌人受击。返回是否开火 */
  function turretStep(turret, enemies, dt){
    turret.cd=(turret.cd||0)-dt;
    if(turret.cd>0) return false;
    var best=null,bd=CFG.turret.range;
    enemies.forEach(function(en){
      if(en.dead || en.isSoldier) return;
      var d=U.dst(turret.x,turret.y,en.x,en.y);
      if(d<bd){bd=d;best=en;}
    });
    if(!best) return false;
    turret.lastTarget=best;                 // 供视觉层取炮管朝向
    best.hp-=turretDamage(turret.lv);
    best.hitFlash=0.1;
    turret.cd=CFG.turret.cd;
    U.emit('enemyHit',best);
    if(best.hp<=0) killEnemy(best);
    return true;
  }

  /* ---- 击杀: 掉落生成 ---- */
  function killEnemy(en){
    en.dead = true;
    var s = APH.state;
    s.meta.stats.kills++;
    s.shake = Math.min(1, s.shake+.25);
    var rng = U.makeRng((s.seed ^ Math.floor(en.x*7) ^ Math.floor(en.y*13)) >>> 0);
    var lootCount = en.isBoss ? 4 : 1;
    var r = U.makeRng(Date.now() & 0xffff);          // 表现层散布用
    for(var k=0;k<(en.isBoss?20:8);k++)
      s.parts.push({t:'shard', x:en.x, y:en.y, vx:U.rr(-90,90), vy:U.rr(-110,-10),
                    life:U.rr(.4,.9), max:.9, hue:en.faction.gene.hue});
    for(var li=0;li<lootCount;li++){
      var loot = rollLoot(rng);
      spawnDrop(en.x, en.y, loot.id, en.isBoss?loot.n+1:loot.n, {jitter:22, merge:false});
    }
    if(en.isBoss){
      spawnDrop(en.x, en.y-10, 'it_relic', 1, {jitter:4, merge:false});
    }
    var specDrops = specimenDropsOf(en);
    for(var si=0;si<specDrops.length;si++){
      spawnDrop(en.x, en.y, specDrops[si].id, specDrops[si].n||1, {jitter:16, merge:false});
    }
    U.emit('enemyKilled', { en:en, loot:loot });
  }

  /* ---- 掠夺敌基地成功 ---- */
  function raidBaseSuccess(base){
    base.dead=true;
    var s=APH.state;
    s.war.raids++;
    if(s.meta){
      s.meta.war = s.meta.war || {wins:0, raids:0};
      s.meta.war.raids = s.war.raids;
      s.meta.war.wins = s.war.wins||0;
      if(window.APH.Save) APH.Save.saveMeta(s.meta);
    }
    /* 大量战利品撒落 */
    for(var i=0;i<6;i++){
      var loot=rollLoot(U.makeRng((Date.now()+i*77)&0xffff));
      spawnDrop(base.x, base.y, loot.id, loot.n, {jitter:60, merge:false});
    }
    spawnDrop(base.x, base.y, 'it_relic', 2, {jitter:8, merge:false});
    s.shake=1;
    if(window.APH.UI && APH.UI.floatText) APH.UI.floatText('💥 '+base.rivalName+' 基地被掠夺!','#ff9ad0');
    U.emit('raidSuccess',{ rivalId:base.rivalId });
  }

  /* ---- 家园医疗舱回血(纯函数): 无舱不回血; 靠近才缓慢回; 氧气始终补 ---- */
  function homeRegen(hp, o2, dt, clinicDist){
    var P=CFG.player;
    var o2n=Math.min(P.o2Max, o2+dt*(P.o2HomeRefill!=null?P.o2HomeRefill:10));
    var hpn=hp;
    var r=P.clinicHealR!=null?P.clinicHealR:80;
    var rate=P.healAtClinic!=null?P.healAtClinic:4;
    if(clinicDist!=null && clinicDist<r)
      hpn=Math.min(P.hpMax, hp+dt*rate);
    return { hp:hpn, o2:o2n };
  }

  /* 袭击近战打伤最近的殖民者; 无敌帧内跳过; 找不到名册则当没打中 */
  function strikeResident(en, s){
    var R=window.APH.Res;
    if(!R || !R.hurtResident) return false;
    var C=CFG.residents||{};
    var iframe=C.raidIFrame!=null?C.raidIFrame:0.8;
    var wound=C.raidWound!=null?C.raidWound:18;
    var best=null, bd=CFG.enemy.attackR;
    (s.entities||[]).forEach(function(o){
      if(!o || o.dead || o.type!==T.RESIDENT) return;
      if((o.hurtCd||0)>0) return;
      var d=U.dst(en.x,en.y,o.x,o.y);
      if(d<bd){ bd=d; best=o; }
    });
    if(!best) return false;
    var roster=(s.meta&&s.meta.residents)||[];
    var rec=null;
    for(var i=0;i<roster.length;i++){
      if(roster[i].id===best.rid || roster[i].id===best.id){ rec=roster[i]; break; }
    }
    if(!rec) return false;
    R.hurtResident(rec, wound);
    best.illness=rec.illness; best.mood=rec.mood;
    best.hurtCd=iframe; best.hitFlash=0.12;
    if(window.APH.UI && APH.UI.floatText)
      APH.UI.floatText((rec.name||'居民')+' 受伤','#ff9a9a');
    U.emit('residentHurt', { id:rec.id, illness:rec.illness });
    return true;
  }

  /* ---- 玩家受伤(含无敌帧) ---- */
  function hurtPlayer(dmg, source){
    var s = APH.state;
    if(s.iFrameT > 0) return;
    /* #66 床边睡眠: 受伤即醒(伤害真正落地时) */
    if(s.meta && s.meta.playerNeeds && s.meta.playerNeeds.isSleeping){
      if(window.APH.Res && window.APH.Res.playerWake) window.APH.Res.playerWake(s.meta.playerNeeds);
    }
    s.iFrameT = 0.5;
    s.hp -= dmg;
    s.shake = Math.min(1, s.shake+.35);
    s.hurtFlash = 0.35;
    U.emit('playerHurt', { dmg:dmg, source:source });
    /* #72 家园击倒: hp<=0 且在家园 → 击倒而非死亡(不进死亡画面, 不动 clinicKit/stats.deaths)。
       必须在远征 clinicKit 复活/死亡分支之前判定, 否则家园带残余 clinicKit===1 会被误消耗。 */
    if(s.hp <= 0 && s.scene === 'home'){
      s.hp = 0;
      var needs = s.meta && s.meta.playerNeeds;
      if(!needs && APH.Res && APH.Res.ensurePlayerNeeds) needs = APH.Res.ensurePlayerNeeds(s.meta).playerNeeds;
      if(needs && !needs.downed){
        needs.downed = true;
        needs.downT = (CFG.player.downedTime != null ? CFG.player.downedTime : 90);
        s.downed = true;
        U.emit('playerDowned', { source:source });
        if(window.APH.UI && APH.UI.floatText) APH.UI.floatText('💥 你被击倒了!','#ff4757');
      }
      return;
    }
    if(s.hp <= 0 && (s.clinicKit||0)>0){
      s.clinicKit--;
      s.hp = Math.min(CFG.player.hpMax, (CFG.economy&&CFG.economy.clinicHeal)||40);
      s.iFrameT = 0.8;
      if(window.APH.UI && APH.UI.floatText) APH.UI.floatText('✚ 医疗舱急救 +'+s.hp,'#7dffab');
      return;
    }
    if(s.hp <= 0){
      s.hp = 0;
      s.mode = 'dead';
      U.emit('gameOver',{});
      s.meta.stats.deaths++;
      APH.Save.saveMeta(s.meta);
      if(window.APH.UI && APH.UI.showDeath) APH.UI.showDeath('你被 '+source+'终结了。', {
        cry:s.cry, found:s.found, total:s.totalBeacons,
        carry:s.carry, runLoot:s.runLoot, survived:s.clock-(s.landedAt||0),
      });
    }
  }

  /* ---- 玩家射击(由输入层调用) ---- */
  function firePlasma(){
    var s = APH.state;
    /* #66 床边睡眠: 睡着时不能射击 · #72 家园击倒: 击倒昏迷时也不能射击 */
    if(s.fireCd > 0 || s.mode !== 'running' ||
       (s.meta && s.meta.playerNeeds && (s.meta.playerNeeds.isSleeping || s.meta.playerNeeds.downed))) return false;
    s.fireCd = CFG.combat.fireCd;
    var a = s.face;
    s.entities.push(makeProj(
      s.px + Math.cos(a)*16, s.py + Math.sin(a)*16 - 11,
      Math.cos(a)*CFG.combat.plasmaSpeed, Math.sin(a)*CFG.combat.plasmaSpeed,
      'player', CFG.combat.plasmaDmg));
    s.noiseT = 0.8;                                    // 惊动附近敌人
    U.emit('playerFired');
    return true;
  }

  /* ---- 掉落物拾取: 远征进背包; 家园进仓库(RimWorld 地上物) ---- */
  function updateDropped(dt){
    var s = APH.state;
    s.entities.forEach(function(e){
      if(e.type !== T.DROPPED || e.dead) return;
      e.bobA += dt*3;
      if(U.dst(e.x,e.y,s.px,s.py) >= 26) return;
      var it = CFG.items[e.itemId] || { name:e.itemId, w:1 };
      if(s.scene==='home' && window.APH.Colony && APH.Colony.collectHome){
        var got=APH.Colony.collectHome(s.meta, e.itemId, e.n||1);
        e.dead=true;
        if(got.kind==='stock'){
          U.emit('lootPicked', { id:e.itemId, n:e.n, home:true });
          if(window.APH.UI && APH.UI.floatText)
            APH.UI.floatText('入库 +'+(got.n||e.n)+' '+(got.label||it.name),'#9fe8c8');
        }else if(got.kind==='research'){
          U.emit('lootPicked', { id:e.itemId, n:e.n, home:true });
          if(window.APH.UI && APH.UI.floatText)
            APH.UI.floatText('研究 +'+got.research+' ('+(got.label||it.name)+')','#ffe28a');
        }
        return;
      }
      var r = addToCarry(s.carry, e.itemId, e.n,
        APH.Colony.carryMaxOf(s.colony&&s.colony.buildings));
      if(r.ok){
        e.dead = true;
        s.carry = r.carry;
        s.runLoot=(s.runLoot||0)+Math.min(e.n, e.n-(r.overflow||0));
        U.emit('lootPicked', { id:e.itemId, n:Math.min(e.n, e.n - (r.overflow||0)) });
        var nm = it.name;
        if(window.APH.UI && APH.UI.floatText) APH.UI.floatText('+'+ (e.n - (r.overflow||0)) +' '+nm + (r.overflow? '（超重遗落'+r.overflow+'）':''), '#9fe8c8');
      }else{
        if(window.APH.UI && APH.UI.floatText) APH.UI.floatText('负重已满！回舱卸货', '#ff9a9a');
      }
    });
    s.entities = s.entities.filter(function(e){ return e.type!==T.DROPPED || !e.dead; });
  }

  return {
    fsmStep:fsmStep, moveIntent:moveIntent, shouldSpit:shouldSpit,
    rollLoot:rollLoot, specimenDropsOf:specimenDropsOf, addToCarry:addToCarry, carryWeight:carryWeight,
    updateCombat:updateCombat, updateDropped:updateDropped,
    firePlasma:firePlasma, makeProj:makeProj,
    turretStep:turretStep, soldierCount:soldierCount, turretDamage:turretDamage,
    settleValue:settleValue, settleGoods:settleGoods,
    raidPillage:raidPillage, pickRaidFocus:pickRaidFocus, hurtPlayer:hurtPlayer,
    homeRegen:homeRegen, strikeResident:strikeResident,
    spawnDrop:spawnDrop, stealNearbyDrop:stealNearbyDrop,
    /* T4 寻路+破墙+围攻炮击目标 */
    wallHp:wallHp, breachFocus:breachFocus, planChase:planChase,
    strikeWall:strikeWall, destroyWall:destroyWall, pickShellTarget:pickShellTarget,
    /* T5 弹道掩体 */
    segHitBox:segHitBox,
  };
})();
