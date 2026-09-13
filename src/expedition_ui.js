/* ============================================================
   Aphelion · expedition_ui.js — 远征编组与双世界常驻条
   仅视图层：所有副作用经 APH.UI.cmd 交给 main 的命令表。
   ============================================================ */
window.APH = window.APH || {};

APH.ExpeditionUI = (function(){
  'use strict';

  var MODAL_ID='expeditionPlanner', MODAL_EL='expeditionPlannerOverlay';
  var modal=null, strip=null, activeState=null, registered=false, fallbackPaused=null, keyBound=false, stripSignature='';

  function ui(){ return window.APH && APH.UI; }
  function cfgObjectives(){
    var raw=APH.CFG&&APH.CFG.expedition&&APH.CFG.expedition.objectives;
    if(Array.isArray(raw)) return raw.map(function(o,i){ return {id:o.id||String(i), def:o||{}}; });
    return Object.keys(raw||{}).map(function(id){ return {id:id, def:raw[id]||{}}; });
  }
  function healthy(r){ return !!r && !r.dead && !r.downed && !r.medLying && !(r.hp!=null && r.hp<=0) && (!r.worldId||r.worldId==='home'); }
  function roster(s){ return (s&&s.meta&&s.meta.residents)||[]; }
  function availableFood(s){
    var E=window.APH&&APH.ExpeditionState;
    if(E&&typeof E.availableFood==='function')return E.availableFood(s&&s.meta,s&&s.colony,s);
    return Math.max(0,Number(s&&s.meta&&s.meta.res&&s.meta.res.food)||0);
  }
  function itemName(id){ var it=APH.CFG&&APH.CFG.items&&APH.CFG.items[id]; return (it&&it.name)||'未命名物资'; }
  function el(tag, text){ var n=document.createElement(tag); if(text!=null)n.textContent=String(text); return n; }
  function button(text, onClick){
    var b=el('button',text); b.type='button';
    b.style.cssText='padding:8px 12px;border-radius:7px;border:1px solid #49728a;background:#173344;color:#d7f5ff;cursor:pointer;';
    b.addEventListener('click',onClick); return b;
  }
  function clear(node){ while(node&&node.firstChild) node.removeChild(node.firstChild); }

  function ensureModal(){
    if(modal || typeof document==='undefined' || !document.createElement || !document.body) return modal;
    modal=el('div'); modal.id=MODAL_EL; modal.style.cssText='display:none;position:fixed;inset:0;z-index:80;background:rgba(4,9,16,.76);align-items:center;justify-content:center;padding:18px;';
    document.body.appendChild(modal);
    if(ui()&&ui().registerModal&&!registered){
      ui().registerModal(MODAL_ID,{elId:MODAL_EL,isOverlay:true,onClose:function(){ activeState=null; }});
      registered=true;
    }
    return modal;
  }
  function selectedIds(){
    var out=[];
    if(!modal || !modal._checks) return out;
    modal._checks.forEach(function(c){ if(c.checked&&!c.disabled) out.push(c.value); });
    return out;
  }
  function pauseFallback(s){ fallbackPaused=!!s.paused; s.paused=true; }
  function restoreFallback(){ if(activeState&&fallbackPaused!==null) activeState.paused=fallbackPaused; fallbackPaused=null; }
  function close(){
    var s=activeState;
    if(registered&&ui()&&ui().close) ui().close(MODAL_ID);
    else if(modal) modal.style.display='none';
    restoreFallback(); activeState=null;
    return true;
  }
  function submit(s){
    s=s||activeState;
    if(!s || !modal) return {ok:false,why:'远征面板未打开'};
    var food=Math.max(0,Math.floor(Number(modal._food&&modal._food.value)||0));
    var objective=modal._objective&&modal._objective.value;
    var destination=modal._destination&&modal._destination.value;
    var result=ui()&&ui().cmd ? ui().cmd('beginExpedition',{memberIds:selectedIds(),supply:{food:food},objective:objective,
      destination:{kind:destination},context:{entities:s.entities||[]}}) : null;
    if(result&&result.ok){ close(); return result; }
    var why=(result&&result.why)||'暂时无法出发';
    if(modal._error) modal._error.textContent=why;
    return result||{ok:false,why:why};
  }
  function render(s){
    var root=ensureModal(); if(!root) return false;
    clear(root); modal._checks=[];
    var card=el('section'); card.setAttribute('role','dialog'); card.setAttribute('aria-modal','true');
    card.style.cssText='width:min(520px,100%);max-height:90vh;overflow:auto;background:#0d1b27;color:#e7f5ff;border:1px solid #42657d;border-radius:12px;padding:18px;box-shadow:0 18px 55px #000;';
    card.appendChild(el('h2','远征编组'));
    var leave=el('p'); leave.style.marginTop='0'; card.appendChild(leave);
    var list=el('div'); list.style.cssText='display:grid;gap:6px;margin:10px 0;';
    roster(s).forEach(function(r){
      var line=el('label'); line.style.cssText='display:flex;gap:8px;align-items:center;padding:6px;background:#132636;border-radius:6px;';
      var c=el('input'); c.type='checkbox'; c.value=r.id; c.checked=healthy(r); c.disabled=!healthy(r);
      c.addEventListener('change',function(){ leave.textContent='留守人数：'+(roster(s).length-selectedIds().length); });
      var unavailable=r&&r.worldId&&r.worldId!=='home'?' · 已在远征':' · 无法出征';
      line.appendChild(c); line.appendChild(el('span',(r.name||r.id)+(healthy(r)?'':unavailable)));
      list.appendChild(line); modal._checks.push(c);
    });
    card.appendChild(list);
    leave.textContent='留守人数：'+(roster(s).length-selectedIds().length); card.appendChild(leave);
    var foodAvailable=availableFood(s);
    var supply=el('label','携带粮食（可用 '+foodAvailable+'）：');
    var food=el('input'); food.id='expeditionSupplyFood'; food.type='number'; food.min='0'; food.step='1'; food.value='0'; food.setAttribute('aria-label','携带粮食');
    food.max=String(foodAvailable);
    supply.appendChild(food); card.appendChild(supply); modal._food=food;
    card.appendChild(el('h3','目的地'));
    var destination=el('select'); destination.id='expeditionDestination'; destination.setAttribute('aria-label','远征目的地');
    var unknown=el('option','未知星球 · 首次着陆时观测');unknown.value='unknown';destination.appendChild(unknown);
    card.appendChild(destination);modal._destination=destination;
    card.appendChild(el('h3','任务目标'));
    var objective=el('select'); objective.id='expeditionObjective'; objective.setAttribute('aria-label','远征任务目标');
    var objectives=cfgObjectives();
    objectives.forEach(function(o){
      var opt=el('option',o.def.name||o.id); opt.value=o.id;
      if(o.def.description) opt.textContent=(o.def.name||o.id)+' · '+o.def.description;
      objective.appendChild(opt);
    });
    card.appendChild(objective); modal._objective=objective;
    var detail=el('p'); detail.style.cssText='min-height:18px;color:#a9c8d8;margin:6px 0;';
    function describeObjective(){
      var found=objectives.filter(function(o){ return o.id===objective.value; })[0], d=found&&found.def||{};
      var bits=[];
      if(d.description) bits.push(d.description);
      if(d.target!=null) bits.push('目标 '+d.target);
      if(d.itemIds&&d.itemIds.length) bits.push('相关物资 '+d.itemIds.map(itemName).join('、'));
      detail.textContent=bits.join(' · ');
    }
    objective.addEventListener('change',describeObjective); describeObjective(); card.appendChild(detail);
    var error=el('p'); error.style.cssText='min-height:18px;color:#ff9a9a;'; card.appendChild(error); modal._error=error;
    var actions=el('div'); actions.style.cssText='display:flex;gap:8px;justify-content:flex-end;margin-top:12px;';
    actions.appendChild(button('取消',close)); actions.appendChild(button('出发',function(){ submit(s); })); card.appendChild(actions);
    root.appendChild(card); modal._start=actions.lastChild;
    return true;
  }
  function open(state){
    var s=state||(window.APH&&APH.state); if(!s || !ensureModal()) return false;
    activeState=s; render(s);
    if(registered&&ui()&&ui().open) ui().open(MODAL_ID);
    else { pauseFallback(s); modal.style.display='flex'; }
    if(modal) modal.style.display='flex';
    if(modal._start&&modal._start.focus) modal._start.focus();
    return true;
  }
  function activeRun(colony){
    var E=window.APH&&APH.ExpeditionState;
    return E&&typeof E.active==='function' ? E.active(colony) : null;
  }
  function ensureStrip(){
    if(strip || typeof document==='undefined' || !document.createElement || !document.body) return strip;
    strip=el('div'); strip.id='expeditionWorldStrip'; strip.style.cssText='display:none;position:fixed;right:12px;top:12px;z-index:60;max-width:min(420px,calc(100vw - 24px));padding:8px;background:rgba(8,20,31,.92);border:1px solid #42657d;border-radius:8px;color:#d7f5ff;font-size:12px;';
    document.body.appendChild(strip); return strip;
  }
  function cmd(name,arg){ if(ui()&&ui().cmd) return ui().cmd(name,arg); }
  function update(state){
    var s=state||(window.APH&&APH.state), bar=ensureStrip(); if(!bar) return false;
    var run=activeRun(s&&s.colony);
    if(!run){ stripSignature=''; bar.style.display='none'; return false; }
    var objective=run.objective&&typeof run.objective==='object'?run.objective:{kind:run.objective||run.objectiveId};
    var def=(APH.CFG.expedition&&APH.CFG.expedition.objectives&&APH.CFG.expedition.objectives[objective.kind])||{};
    var current=objective.progress!=null?objective.progress:(run.current!=null?run.current:(run.found||0));
    var target=objective.target!=null?objective.target:(def.target!=null?def.target:'?');
    var members=roster(s).filter(function(r){ return r&&r.worldId===run.id; }).length;
    var food=(run.supply&&run.supply.food!=null)?run.supply.food:((run.food!=null)?run.food:0);
    var signature=[run.id,objective.kind,current,target,members,food,s&&s.scene].join('|');
    if(signature===stripSignature) return true;
    stripSignature=signature; clear(bar); bar.style.display='block';
    bar.appendChild(el('div','远征：'+(def.name||'进行中')+' · '+current+'/'+target));
    bar.appendChild(el('div','队员 '+members+' · 留守 '+Math.max(0,roster(s).length-members)+' · 粮 '+food));
    var actions=el('div'); actions.style.cssText='display:flex;gap:6px;margin-top:6px;';
    actions.appendChild(button('家园',function(){ cmd('switchWorld','home'); }));
    actions.appendChild(button('远征',function(){ cmd('switchWorld','expedition'); }));
    actions.appendChild(button('召回队伍',function(){ cmd('returnExpedition'); }));
    bar.appendChild(actions); return true;
  }
  function bindKeys(){
    if(keyBound || typeof document==='undefined' || !document.addEventListener) return;
    keyBound=true;
    document.addEventListener('keydown',function(ev){
      if(!activeState) return;
      if(ev.key==='Escape'){ if(ev.preventDefault) ev.preventDefault(); close(); }
      else if(ev.key==='Enter' && ev.target!==modal._objective&&ev.target!==modal._destination){ if(ev.preventDefault) ev.preventDefault(); submit(activeState); }
      /* Tab 使用浏览器原生焦点顺序；所有控件均为原生可聚焦元素。 */
    });
  }
  bindKeys();
  return {open:open, close:close, update:update, submit:submit};
})();
