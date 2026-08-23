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
    $('bCR').style.width = U.clamp(s.cry*4,0,100)+'%';
    $('vCR').textContent = s.cry;
    var cw = APH.Combat.carryWeight(s.carry);
    $('bCW').style.width = U.clamp(cw/APH.CFG.player.carryMax*100,0,100)+'%';
    $('vCW').textContent = cw;
    $('bDS').style.width = (s.found/s.totalBeacons*100)+'%';
    $('vDS').textContent = s.found+'/'+s.totalBeacons;
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
      ftEl.style.cssText='position:fixed;left:50%;bottom:186px;transform:translateX(-50%);z-index:9;'+
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
      for(var k in stats.carry)
        parts.push(CFG.items[k].name+'×'+stats.carry[k]);
      carryTxt='<br><span style="color:#ff9a9a">丢失：'+parts.join('、')+'</span>';
    }
    s.querySelector('p').innerHTML=reason+
      '<br>已建档异常 '+stats.found+'/'+stats.total+
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
    pb.style.cssText='position:fixed;bottom:8px;right:10px;z-index:50;background:#0c1220;'+
      'border:1px solid #223252;color:#6f84ab;font-size:11px;padding:4px 9px;border-radius:7px;';
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
