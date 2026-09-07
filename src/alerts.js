/* ============================================================
   Aphelion · alerts.js — 警报选择纯函数 (ADR-30 / #167)
   挂载: window.APH.Alerts
   ============================================================ */
window.APH = window.APH || {};

APH.Alerts = (function(){
  'use strict';
  var CFG = APH.CFG;

  function A(){ return (CFG.alerts) || {}; }
  function prioOf(kind){
    var p = A().prio || {};
    return p[kind] != null ? p[kind] : 0;
  }
  function commanderName(){ return A().commander || '指挥官'; }
  function eatBelow(){ return (CFG.residents && CFG.residents.eatBelow != null) ? CFG.residents.eatBelow : 60; }
  function restSleepAt(){
    return (CFG.player && CFG.player.restSleepAt != null) ? CFG.player.restSleepAt : 20;
  }
  function hab(){ return CFG.HAB || { x:1100, y:1100 }; }

  function pawnPos(s, rid, fallback){
    var ents = (s && s.entities) || [];
    var i, e;
    for(i=0;i<ents.length;i++){
      e = ents[i];
      if(!e || e.dead) continue;
      if(rid && (e.rid === rid || e.id === rid)) return { x:e.x, y:e.y };
    }
    return fallback || hab();
  }

  function push(list, kind, text, x, y, id){
    list.push({ id: id || (kind + ':' + text), kind: kind, text: text, x: x, y: y, prio: prioOf(kind) });
  }

  function shortfall(bid, res){
    var def = (APH.Colony && APH.Colony.get) ? APH.Colony.get(bid) : null;
    if(!def) return null;
    var stock = res || {};
    var cr = def.costRes || {};
    var k, need, have;
    for(k in cr){
      need = cr[k] || 0;
      if(need <= 0) continue;
      have = stock[k] != null ? stock[k] : 0;
      if(have < need) return k;
    }
    if((def.costMineral || 0) > (stock.mineral || 0)) return 'mineral';
    return null;
  }

  function buildingName(bid){
    var def = (APH.Colony && APH.Colony.get) ? APH.Colony.get(bid) : null;
    return (def && def.name) || bid;
  }

  function collect(s){
    var out = [];
    if(!s || s.scene !== 'home') return out;
    var meta = s.meta || {};
    var needs = meta.playerNeeds || {};
    var res = meta.res || {};
    var cx = s.px != null ? s.px : hab().x;
    var cy = s.py != null ? s.py : hab().y;
    var cmd = commanderName();

    if(s.war && s.war.raidActive){
      var ex = hab().x, ey = hab().y;
      var ents = s.entities || [], i, e;
      for(i=0;i<ents.length;i++){
        e = ents[i];
        if(e && e.type === (CFG.entType && CFG.entType.ENEMY) && !e.dead){
          ex = e.x; ey = e.y; break;
        }
      }
      push(out, 'raid', A().raid || '袭击进行中', ex, ey, 'raid');
    }

    if(needs.downed){
      push(out, 'downed', cmd + '倒地', cx, cy, 'downed:player');
    }
    (meta.residents || []).forEach(function(r){
      if(!r || !r.downed) return;
      var p = pawnPos(s, r.id, hab());
      push(out, 'downed', (r.name || r.id) + '倒地', p.x, p.y, 'downed:' + r.id);
    });

    if((res.food || 0) <= 0){
      var wx = hab().x, wy = hab().y;
      var bs = (s.colony && s.colony.buildings) || [];
      for(i=0;i<bs.length;i++){
        if(bs[i] && bs[i].id === 'bl_warehouse'){ wx = bs[i].x; wy = bs[i].y; break; }
      }
      push(out, 'no_food', A().noFood || '仓库没有口粮', wx, wy, 'no_food');
    }

    if((needs.food != null) && needs.food < eatBelow()){
      push(out, 'hungry', cmd + '饥饿', cx, cy, 'hungry:player');
    }
    (meta.residents || []).forEach(function(r){
      if(!r || r.downed) return;
      if(r.food == null || r.food >= eatBelow()) return;
      var p = pawnPos(s, r.id, hab());
      push(out, 'hungry', (r.name || r.id) + '饥饿', p.x, p.y, 'hungry:' + r.id);
    });

    var sleepy = !needs.isSleeping && (needs.wantSleep || (needs.rest != null && needs.rest < restSleepAt()));
    if(sleepy && !needs.downed){
      push(out, 'sleepy', cmd + '需要睡觉', cx, cy, 'sleepy:player');
    }
    (meta.residents || []).forEach(function(r){
      if(!r || r.downed || r.isSleeping) return;
      if(!(r.wantSleep || (r.rest != null && r.rest < restSleepAt()))) return;
      var p = pawnPos(s, r.id, hab());
      push(out, 'sleepy', (r.name || r.id) + '需要睡觉', p.x, p.y, 'sleepy:' + r.id);
    });

    /* T3 入冬预警: 冬天作物停长, 靠的是入冬前囤的粮。
       只在「有人要养 + 存粮不足以过冬」时出现, 否则是噪音。 */
    var W = window.APH.Weather;
    if(W && W.seasonAt){
      var season = W.seasonAt(s.clock, CFG.DAY_LEN);
      var pop = (meta.residents || []).length + 1;          // +1 = 指挥官
      var need = (APH.Colony && APH.Colony.winterFoodNeed) ? APH.Colony.winterFoodNeed(pop) : pop * 12;
      var food = res.food || 0;
      var hx = hab().x, hy = hab().y;
      if(season.isWinter){
        if(food < need){
          push(out, 'winter',
            (A().winterNow || '寒冬 · 只能吃存粮（{food}）')
              .replace('{food}', Math.round(food)).replace('{need}', need),
            hx, hy, 'winter');
        }
      } else if(W.daysUntilWinter){
        var toW = W.daysUntilWinter(s.clock, CFG.DAY_LEN);
        var warnD = (CFG.seasons && CFG.seasons.winterWarnDays != null) ? CFG.seasons.winterWarnDays : 2;
        if(toW != null && toW <= warnD && food < need){
          push(out, 'winter',
            (A().winterSoon || '{n} 天后入冬 · 存粮 {food}/{need}')
              .replace('{n}', toW).replace('{food}', Math.round(food)).replace('{need}', need),
            hx, hy, 'winter');
        }
      }
    }

    var queue = (s.colony && s.colony.buildQueue) || [];
    queue.forEach(function(q, qi){
      if(!q || !q.bid) return;
      if(!shortfall(q.bid, res)) return;
      push(out, 'missing', buildingName(q.bid) + '缺料', q.x, q.y, 'missing:' + q.bid + ':' + qi);
    });

    out.sort(function(a, b){ return (b.prio - a.prio) || (a.id < b.id ? -1 : 1); });
    return out;
  }

  function focus(s, alert){
    if(!s || !alert) return false;
    if(alert.x == null || alert.y == null) return false;
    s.camX = alert.x;
    s.camY = alert.y;
    return true;
  }

  return { collect: collect, focus: focus };
})();
