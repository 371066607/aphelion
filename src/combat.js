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
    var aggroR = C.aggroR * (ctx.night ? C.nightAggroMul : 1);
    var s = en.state;

    if (ctx.hpPct < C.fleeHpPct) return 'flee';

    switch(s){
      case 'idle':
        if (ctx.dist < aggroR || ctx.heardShot && ctx.dist < C.noiseAggroR) return 'alert';
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

  /* 背包操作(纯函数): 返回 {ok, carry, overflow}
     ADR: 负重超限的部分留在原地(死亡循环的经济核心) */
  function addToCarry(carry, itemId, n, carryMax){
    var w = CFG.items[itemId].w * n;
    var cur = carryWeight(carry);
    var space = carryMax - cur;
    if(space <= 0) return { ok:false, carry:carry, overflow:n };
    var take = Math.min(n, Math.floor(space / CFG.items[itemId].w));
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

      /* 感知 */
      var dist = U.dst(en.x, en.y, s.px, s.py);
      var c = {
        dist: dist, night: night,
        hpPct: en.hp / en.faction.hp,
        heardShot: s.noiseT > 0 && dist < CFG.combat.noiseRadius,
        px: s.px, py: s.py,
      };

      /* FSM */
      var prev = en.state;
      en.state = fsmStep(en, c);
      if(en.state !== prev) U.emit('enemyState', { en:en, from:prev, to:en.state });

      /* 攻击冷却 */
      en.atkCd -= dt;
      en.wanderA += (U.rr(-1,1)) * dt * 2;

      /* spitter 远程 */
      if(shouldSpit(en, c)){
        en.atkCd = 2.2;
        var ddx = s.px-en.x, ddy = s.py-en.y, dd = Math.sqrt(ddx*ddx+ddy*ddy)||1;
        s.entities.push(makeProj(en.x, en.y, ddx/dd*CFG.enemy.projSpeed, ddy/dd*CFG.enemy.projSpeed, 'enemy', en.faction.dmg));
        U.emit('enemySpit', en);
      }

      /* 近战接触 */
      if(en.state === 'attack' && en.atkCd <= 0){
        en.atkCd = CFG.enemy.attackCd;
        hurtPlayer(en.faction.dmg, en.faction.name);
        U.emit('enemyMelee', en);
      }

      /* 移动 */
      var mi = moveIntent(en, c);
      en.x += mi.vx * dt; en.y += mi.vy * dt;
      en.x = U.clamp(en.x, 30, CFG.WORLD-30);
      en.y = U.clamp(en.y, 30, CFG.WORLD-30);
      en.walkPh += dt * (Math.abs(mi.vx)+Math.abs(mi.vy) > 1 ? 9 : 3);

      /* 太远回收 */
      if(dist > CFG.enemy.despawnR){ en.dead = true; }
    });

    /* ---- 玩家弹丸 ---- */
    s.entities.forEach(function(p){
      if(p.type !== T.PROJECTILE || p.dead) return;
      p.life -= dt;
      if(p.life <= 0){ p.dead = true; return; }
      p.x += p.vx*dt; p.y += p.vy*dt;

      if(p.side === 'player'){
        s.entities.forEach(function(en){
          if(en.type !== T.ENEMY || en.dead) return;
          var r = 14 * en.faction.gene.size;
          if(U.dst(p.x,p.y,en.x,en.y) < r){
            p.dead = true;
            en.hp -= p.dmg;
            s.shake = Math.min(1, s.shake+.12);
            U.emit('enemyHit', en);
            if(en.hp <= 0) killEnemy(en);
          }
        });
      }else if(p.side === 'enemy'){
        if(U.dst(p.x,p.y,s.px,s.py) < CFG.player.radius+5){
          p.dead = true;
          hurtPlayer(p.dmg, '酸液');
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

  /* ---- 击杀: 掉落生成 ---- */
  function killEnemy(en){
    en.dead = true;
    var s = APH.state;
    s.meta.stats.kills++;
    s.shake = Math.min(1, s.shake+.25);
    var rng = U.makeRng((s.seed ^ Math.floor(en.x*7) ^ Math.floor(en.y*13)) >>> 0);
    var loot = rollLoot(rng);
    var r = U.makeRng(Date.now() & 0xffff);          // 表现层散布用
    for(var k=0;k<8;k++)
      s.parts.push({t:'shard', x:en.x, y:en.y, vx:U.rr(-90,90), vy:U.rr(-110,-10),
                    life:U.rr(.4,.9), max:.9, hue:en.faction.gene.hue});
    s.entities.push({
      id:'dp_'+(++pid), type:T.DROPPED,
      x:en.x+U.rr(-14,14), y:en.y+U.rr(-10,10),
      itemId:loot.id, n:loot.n, bobA:U.rr(0,U.TAU),
    });
    U.emit('enemyKilled', { en:en, loot:loot });
  }

  /* ---- 玩家受伤(含无敌帧) ---- */
  function hurtPlayer(dmg, source){
    var s = APH.state;
    if(s.iFrameT > 0) return;
    s.iFrameT = 0.5;
    s.hp -= dmg;
    s.shake = Math.min(1, s.shake+.35);
    s.hurtFlash = 0.35;
    U.emit('playerHurt', { dmg:dmg, source:source });
    if(s.hp <= 0){
      s.hp = 0;
      s.mode = 'dead';
      s.meta.stats.deaths++;
      APH.Save.saveMeta(s.meta);
      APH.UI.showDeath('你被 '+source+'终结了。', {
        cry:s.cry, found:s.found, total:s.totalBeacons,
        carry:s.carry,
      });
    }
  }

  /* ---- 玩家射击(由输入层调用) ---- */
  function firePlasma(){
    var s = APH.state;
    if(s.fireCd > 0 || s.mode !== 'running') return false;
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

  /* ---- 掉落物拾取 ---- */
  function updateDropped(dt){
    var s = APH.state;
    s.entities.forEach(function(e){
      if(e.type !== T.DROPPED || e.dead) return;
      e.bobA += dt*3;
      if(U.dst(e.x,e.y,s.px,s.py) < 26){
        var r = addToCarry(s.carry, e.itemId, e.n, CFG.player.carryMax);
        if(r.ok){
          e.dead = true;
          s.carry = r.carry;
          U.emit('lootPicked', { id:e.itemId, n:Math.min(e.n, e.n - (r.overflow||0)) });
          var nm = CFG.items[e.itemId].name;
          APH.UI.floatText('+'+ (e.n - (r.overflow||0)) +' '+nm + (r.overflow? '（超重遗落'+r.overflow+'）':''), '#9fe8c8');
        }else{
          APH.UI.floatText('负重已满！回舱卸货', '#ff9a9a');
        }
      }
    });
  }

  return {
    fsmStep:fsmStep, moveIntent:moveIntent, shouldSpit:shouldSpit,
    rollLoot:rollLoot, addToCarry:addToCarry, carryWeight:carryWeight,
    updateCombat:updateCombat, updateDropped:updateDropped,
    firePlasma:firePlasma, makeProj:makeProj,
  };
})();
