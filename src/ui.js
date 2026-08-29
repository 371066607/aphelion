/* ============================================================
   Aphelion · ui.js — HUD/提示/卡片/全屏界面 (无游戏逻辑)
   挂载: window.APH.UI
   ============================================================ */
window.APH = window.APH || {};

APH.UI = (function(){
  'use strict';
  var U = APH.U;

  function $(id){ return document.getElementById(id); }

  /* ---------- HUD ---------- */
  function updHUD(){
    var s = APH.state;
    $('bO2').style.width = U.clamp(s.o2/APH.CFG.player.o2Max*100,0,100)+'%';
    $('vO2').textContent = Math.round(Math.max(0,s.o2));
    $('bHP').style.width = U.clamp(s.hp/APH.CFG.player.hpMax*100,0,100)+'%';
    $('vHP').textContent = Math.round(Math.max(0,s.hp));
    var atHome=s.scene==='home';
    var needs=s.meta && s.meta.playerNeeds;
    var rowFood=$('rowFood');
    if(rowFood){
      rowFood.style.display = atHome ? '' : 'none';
      if(atHome){
        var food=(needs && needs.food != null)
          ? needs.food : ((APH.CFG.player && APH.CFG.player.homeFoodStart) || 80);
        var bFood=$('bFood'), vFood=$('vFood');
        if(bFood) bFood.style.width = U.clamp(food,0,100)+'%';
        if(vFood) vFood.textContent = Math.round(Math.max(0,food));
      }
    }
    var rowRest=$('rowRest');
    if(rowRest){
      rowRest.style.display = atHome ? '' : 'none';
      if(atHome){
        var rest=(needs && needs.rest != null)
          ? needs.rest : ((APH.CFG.player && APH.CFG.player.homeRestStart) || 100);
        var bRest=$('bRest'), vRest=$('vRest');
        if(bRest) bRest.style.width = U.clamp(rest,0,100)+'%';
        if(vRest) vRest.textContent = Math.round(Math.max(0,rest));
      }
    }
    $('bCR').style.width = U.clamp(s.cry*4,0,100)+'%';
    $('vCR').textContent = s.cry;
    var cw = APH.Combat.carryWeight(s.carry);
    var capNow = APH.Colony.carryMaxOf(s.colony&&s.colony.buildings);
    $('bCW').style.width = U.clamp(cw/capNow*100,0,100)+'%';
    $('vCW').textContent = cw;
    /* T4 战争态势: 有战斗记录或袭击过才显示 */
    var war=s.war||{}, rowWar=$('rowWar');
    if(rowWar){
      var showWar=(war.wins||0)+(war.raids||0)>0 || war.raidActive;
      rowWar.style.display = showWar?'':'none';
      if(showWar){
        var topMil=1, def=10;
        try{
          (s.rivalStates||[]).forEach(function(r){ if(r.rival.military>topMil) topMil=r.rival.military; });
          def = 10 + (s.colony.buildings.filter(function(b){return b.id==='bl_turret';}).length)*12
                    + APH.Colony.plasmaTechLevel(s.meta.tech)*5;
        }catch(e){}
        var ws = APH.Rivals.warScore(topMil, def, war.wins, war.raids);
        $('bWAR').style.width = U.clamp(ws,2,100)+'%';
        $('vWAR').textContent = ws;
        $('bWAR').style.background = ws>=60?'#7dffab':(ws>=35?'#ffc857':'#ff6d7a');
      }
    }
    $('bDS').style.width = (s.found/s.totalBeacons*100)+'%';
    $('vDS').textContent = s.found+'/'+s.totalBeacons;
    var vEco=$('vEco');
    if(vEco && s.meta && s.meta.res){
      var C = window.APH.Colony;
      var gt = (C && C.groundTally) ? C.groundTally(s.entities) : {};
      var sh = (C && C.shortageBrief)
        ? C.shortageBrief(s.meta, s.colony&&s.colony.buildings, gt)
        : null;
      var lab = (C && C.stockLabel)
        ? function(k){ return C.stockLabel(s.meta.res, s.entities, k); }
        : function(k){ return String((s.meta.res[k]||0)); };
      vEco.textContent = sh
        ? ('矿'+lab('mineral')+' 粮'+lab('food')+' 药'+lab('med')+' 闲'+sh.idle)
        : ('矿'+lab('mineral')+' 粮'+lab('food')+' 药'+lab('med'));
    }
    var vig = $('vig');
    vig.style.opacity = s.o2<25 ? (1-s.o2/25)*.85 : 0;
  }

  /* ---------- 提示条 ---------- */
  var hintEl=null;
  function setHint(t){
    if(!hintEl) hintEl=$('hint');
    hintEl.textContent=t; hintEl.style.opacity=t?1:0;
  }

  /* ---------- 拾取飘字 ---------- */
  var ftEl=null, ftT=null;
  function floatText(txt,col){
    if(!ftEl){
      ftEl=document.createElement('div');
      ftEl.style.cssText='position:fixed;left:50%;bottom:186px;transform:translateX(-50%);z-index:60;'+
        'font-size:14px;letter-spacing:2px;pointer-events:none;transition:all .6s;text-shadow:0 0 10px currentColor';
      document.body.appendChild(ftEl);
    }
    ftEl.textContent=txt; ftEl.style.color=col;
    ftEl.style.opacity=1; ftEl.style.bottom='186px';
    clearTimeout(ftT);
    ftT=setTimeout(function(){ ftEl.style.opacity=0; ftEl.style.bottom='204px'; },850);
  }

  /* ---------- 发现卡片 ---------- */
  var cardT=null;
  function showCard(name,lore){
    $('dcName').textContent=name; $('dcLore').textContent=lore;
    var c=$('discCard'); c.classList.add('show');
    clearTimeout(cardT);
    cardT=setTimeout(function(){ c.classList.remove('show'); },6500);
  }

  /* ---------- 扫描环 ---------- */
  function showScanRing(){ $('scanRing').style.display='block'; }
  function hideScanRing(){
    $('scanRing').style.display='none';
    $('ringArc').style.strokeDashoffset=238.7;
  }
  function setScanProgress(k){
    $('ringArc').style.strokeDashoffset=238.7*(1-U.clamp(k,0,1));
  }
  function setActBtn(visible){
    $('actBtn').classList.toggle('show',!!visible);
  }

  /* ---------- 全屏界面 ---------- */
  function hideIntro(){ $('intro').classList.add('hide'); }
  function showDeath(reason,stats){
    var s=$('intro');
    s.querySelector('.tag').textContent='SIGNAL LOST';
    s.querySelector('h1').textContent='信 号 中 断';
    s.querySelector('h2').textContent='';
    var carryTxt='';
    if(stats.carry && Object.keys(stats.carry).length){
      var parts=[];
      var items=(APH.CFG && APH.CFG.items) || {};
      for(var k in stats.carry){
        var it=items[k];
        parts.push(((it && it.name) || k)+'×'+stats.carry[k]);
      }
      carryTxt='<br><span style="color:#ff9a9a">丢失：'+parts.join('、')+
               '（共'+(stats.runLoot||0)+'件战利品）</span>';
    }else if(stats.runLoot>0){
      carryTxt='<br><span style="color:#5d6f96">本次远征曾拾取 '+stats.runLoot+' 件(已随之前结算入库)</span>';
    }
    var surv='';
    if(typeof stats.survived==='number' && stats.survived>0){
      var mm=Math.floor(stats.survived/60), ss=Math.round(stats.survived%60);
      surv=' · 着陆存活 '+mm+'分'+ss+'秒';
    }
    s.querySelector('p').innerHTML=reason+
      '<br>已建档异常 '+stats.found+'/'+stats.total+surv+
      ' · 研究点保留'+carryTxt+
      '<br><span style="color:#5d6f96">殖民地数据库永久保留。下一次着陆，你仍知道这一切。</span>';
    var b=$('startBtn'); b.textContent='重 新 着 陆';
    b.onclick=function(){ location.reload(); };
    s.classList.remove('hide');
  }
  function showWin(stats){
    $('endStats').innerHTML=
      '用时 '+Math.round(stats.clock/60)+' 分 · 采集晶体 '+stats.cry+' 枚'+
      ' · 历经 '+(stats.clock/APH.CFG.DAY_LEN>=1?'昼夜交替':'白昼')+
      '<br><br><span style="color:#5d6f96">正式版中，异常档案由 AI 依据你的行动轨迹即时撰写。</span>';
    $('end').classList.add('show');
  }

  /* ---------- 致命错误 ---------- */
  function fatal(msg){
    var f=$('fatal');
    if(f){ f.style.display='block'; f.textContent=msg; }
  }

  /* ---------- 启动探针（调试协议，验证用） ---------- */
  var probeT=null;
  function armProbe(){
    if(document.getElementById('probeRun')) return;
    var pb=document.createElement('button');
    pb.id='probeRun';
    pb.style.cssText='position:fixed;bottom:8px;left:10px;z-index:50;background:rgba(12,18,32,.55);'+
      'border:1px solid rgba(34,50,82,.6);color:#4a5b7d;font-size:10px;padding:3px 8px;border-radius:7px;'+
      'pointer-events:none;';
    pb.textContent='● 0s';
    document.body.appendChild(pb);
    probeT=setInterval(function(){
      var s=APH.state;
      pb.textContent='● '+Math.round(s.clock)+'s · O2 '+Math.max(0,Math.round(s.o2))+'%';
    },1000);
  }

  return {
    updHUD:updHUD, setHint:setHint, floatText:floatText, showCard:showCard,
    showScanRing:showScanRing, hideScanRing:hideScanRing, setScanProgress:setScanProgress,
    setActBtn:setActBtn, hideIntro:hideIntro, showDeath:showDeath, showWin:showWin,
    fatal:fatal, armProbe:armProbe,
  };
})();
