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
    var rowIll=$('rowIll');
    if(rowIll){
      var ill=(needs && needs.illness != null) ? needs.illness : 0;
      var showIll=atHome && ill>0;
      rowIll.style.display = showIll ? '' : 'none';
      if(showIll){
        var bIll=$('bIll'), vIll=$('vIll');
        if(bIll) bIll.style.width = U.clamp(ill,0,100)+'%';
        if(vIll) vIll.textContent = Math.round(Math.max(0,ill));
      }
    }
    /* #72 家园击倒: 家园才显示击倒倒计时条 */
    var rowDowned=$('rowDowned');
    if(rowDowned){
      var showDowned = atHome && !!(needs && needs.downed);
      rowDowned.style.display = showDowned ? '' : 'none';
      if(showDowned){
        var downedMax=(APH.CFG.player && APH.CFG.player.downedTime != null) ? APH.CFG.player.downedTime : 90;
        var downedT=(needs.downT != null) ? needs.downT : downedMax;
        var bDown=$('bDown'), vDown=$('vDown');
        if(bDown) bDown.style.width = U.clamp(downedT/downedMax*100,0,100)+'%';
        if(vDown) vDown.textContent = Math.ceil(Math.max(0,downedT));
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
    /* P1b 暴露警示: >50 边缘红雾(与氧气低共用 vig, 取更强) */
    var expVig=0;
    try{
      var exN2=(s.meta&&s.meta.playerNeeds&&s.meta.playerNeeds.exposure)||0;
      if(exN2>50) expVig=Math.min(.6, (exN2-50)/50*.6);
    }catch(eV){ /* 静默 */ }
    vig.style.opacity = Math.max(s.o2<25 ? (1-s.o2/25)*.85 : 0, expVig);

    /* W3 天气行(家园 HUD): 图标+天气名+预计剩余时长; 极端天气预警色 (值源 CFG.weather + APH.Weather) */
    var wxRow=weatherRow();
    if(wxRow){
      wxRow.style.display = atHome ? '' : 'none';
      if(atHome){
        try{
          var wxMeta=(s.meta&&s.meta.weather)||{};
          var wxIdNow=(window.APH.Weather&&APH.Weather.currentId)?APH.Weather.currentId(s.meta):'wx_clear';
          var wxNames=(APH.CFG.weather&&APH.CFG.weather.names)||{};
          var wxIcons=(APH.CFG.weather&&APH.CFG.weather.icons)||{};
          var wxName=wxNames[wxIdNow]||wxIdNow;
          var wxIcon=wxIcons[wxIdNow]||wxIcons.wx_clear||'';
          var wxRemain=(window.APH.Weather&&APH.Weather.expectRemain)?APH.Weather.expectRemain(wxMeta):0;
          var wxDays=wxRemain/APH.CFG.DAY_LEN;
          var wxDurTxt=wxDays>=1 ? (Math.round(wxDays*10)/10+' 天') : (Math.round(wxDays*24)+' 小时');
          var wxIsExtrem=((window.APH.Weather&&APH.Weather.weatherEffects(wxIdNow).exposureGain)||0)>0;
          /* P1a 天气预报: 明日=确定性 forecast (权重最高/冷却排除), 复用 names/icons */
          var wxTomorrow='';
          try{
            var wxNext=(window.APH.Weather&&APH.Weather.forecast)?APH.Weather.forecast(s.meta):'';
            if(wxNext && wxNext!==wxIdNow){
              wxTomorrow=' · 明日 '+ (wxIcons[wxNext]||'')+' '+(wxNames[wxNext]||wxNext);
            }else if(wxNext){
              wxTomorrow=' · 明日依旧 '+ (wxIcons[wxNext]||'')+' '+(wxNames[wxNext]||wxNext);
            }
          }catch(e3){ /* 预报失败静默, 不影响主行 */ }
          if(wxRow.textContent !== undefined) wxRow.textContent=wxIcon+' '+wxName+' · 预计 '+wxDurTxt+wxTomorrow;
          wxRow.style.color=wxIsExtrem ? '#ff9a9a' : '#8fd4ff';
        }catch(e){ /* HUD 只读展示, 失败静默 */ }
        /* P1b 玩家暴露条: 第六生存条 (>50 红色警示; 0 隐藏) */
        try{
          var exRow=exposureRow();
          if(exRow){
            var exN=(s.meta&&s.meta.playerNeeds&&s.meta.playerNeeds.exposure)||0;
            if(exN>0.5){
              var exTxt='☣ 暴露 '+Math.round(exN)+
                (exN>=80?' · 移动减速!':(exN>=50?' · 警惕!':''));
              if(exRow.textContent!==undefined) exRow.textContent=exTxt;
              exRow.style.display='';
              exRow.style.color = exN>=80 ? '#ff6d7a' : (exN>=50 ? '#ffd97a' : '#c8e89a');
            }else if(exRow.style.display!=='none'){
              if(exRow.textContent!==undefined) exRow.textContent='';
              exRow.style.display='none';
            }
          }
        }catch(e4){ /* 静默 */ }
        /* T7 电网行: 供电状态 (s.powerStatus 由生产跳写入) */
        try{
          var pwRow=powerRow();
          if(pwRow){
            var ps2=s.powerStatus||null;
            var hasGen=(s.colony&&s.colony.buildings||[]).some(function(b2){
              return b2.id==='bl_wood_generator'||b2.id==='bl_solar_panel';
            });
            if(!hasGen){
              if(pwRow.textContent!==undefined) pwRow.textContent='⚡ 电网未激活';
              pwRow.style.color='#8fa3cc';
            }else if(ps2 && ps2.active){
              if(pwRow.textContent!==undefined) pwRow.textContent='⚡ 供电中 · 产'+Math.round(ps2.prodW)+'/'+Math.round(ps2.loadW);
              pwRow.style.color='#ffc857';
            }else if(ps2 && ps2.shed && ps2.shed.length){
              if(pwRow.textContent!==undefined) pwRow.textContent='⚡ 供电不足 · 停机 '+ps2.shed.length+' 座';
              pwRow.style.color='#ff9a9a';
            }else{
              if(pwRow.textContent!==undefined) pwRow.textContent='⚡ 供电中';
              pwRow.style.color='#ffc857';
            }
          }
        }catch(e2){ /* 静默 */ }
      }
    }
  }

  /* W3 天气行元素(懒建一次; 挂在 #hud 下复用 .row 样式; game.html 未预置则动态创建) */
  var wxRowCache=null;
  function weatherRow(){
    if(wxRowCache) return wxRowCache;
    var rowWx=$('rowWeather');
    if(!rowWx){
      rowWx=document.createElement('div');
      rowWx.id='rowWeather';
      rowWx.className='row';
      rowWx.style.cssText='letter-spacing:1px;text-shadow:0 0 8px rgba(0,0,0,.6);color:#8fd4ff';
      var hudEl=document.getElementById('hud');
      if(hudEl && hudEl.appendChild) hudEl.appendChild(rowWx);
    }
    wxRowCache=rowWx;
    return rowWx;
  }

  /* T7 电网行元素(懒建一次; 镜像 weatherRow) */
  var wxRowCache2=null;
  function powerRow(){
    if(wxRowCache2) return wxRowCache2;
    var rowPw=$('rowPower');
    if(!rowPw){
      rowPw=document.createElement('div');
      rowPw.id='rowPower';
      rowPw.className='row';
      rowPw.style.cssText='letter-spacing:1px;text-shadow:0 0 8px rgba(0,0,0,.6);color:#ffc857';
      var hudEl=document.getElementById('hud');
      if(hudEl && hudEl.appendChild) hudEl.appendChild(rowPw);
    }
    wxRowCache2=rowPw;
    return rowPw;
  }

  /* P1b 玩家暴露行(懒建一次): 第六生存条 (值源 meta.playerNeeds.exposure) */
  var wxRowCache3=null;
  function exposureRow(){
    if(wxRowCache3) return wxRowCache3;
    var rowEx=$('rowExposure');
    if(!rowEx){
      rowEx=document.createElement('div');
      rowEx.id='rowExposure';
      rowEx.className='row';
      rowEx.style.cssText='letter-spacing:1px;text-shadow:0 0 8px rgba(0,0,0,.6);color:#c8e89a';
      var hudEl=document.getElementById('hud');
      if(hudEl && hudEl.appendChild) hudEl.appendChild(rowEx);
    }
    wxRowCache3=rowEx;
    return rowEx;
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
  function openingVideoEl(){ return $('openingVideo'); }
  function hideOpening(){
    var el=$('opening');
    if(el && el.classList) el.classList.add('hide');
    var v=openingVideoEl();
    if(v){ try{ v.pause(); }catch(e){} }
  }
  function showOpening(){
    var el=$('opening');
    if(el && el.classList) el.classList.remove('hide');
    var v=openingVideoEl();
    var src = window.APH.Opening && APH.Opening.videoSrc ? APH.Opening.videoSrc() : '';
    if(v && src){
      if(v._aphSrc!==src){
        v._aphSrc=src;
        v.src=src;
        if(v.setAttribute) v.setAttribute('playsinline','');
      }
      v.style.display='';
      var img=$('openingStill'); if(img) img.style.display='none';
      var cap=$('openingCaption'); if(cap) cap.style.display='none';
      var play=function(){
        var p=v.play();
        if(p && p.catch) p.catch(function(){ v.muted=true; v.play(); });
      };
      play();
      v.onended=function(){
        var st=window.APH && APH.state;
        if(st && st.openingClock && APH.Opening.markVideoEnded){
          APH.Opening.markVideoEnded(st.openingClock);
          renderOpening(st.openingClock);
        }
      };
    }
  }
  function skipOpeningVideo(){
    var v=openingVideoEl();
    if(!v || !v.src) return;
    try{
      if(v.duration && isFinite(v.duration)) v.currentTime=Math.max(0, v.duration-0.05);
      v.pause();
    }catch(e){}
    var st=window.APH && APH.state;
    if(st && st.openingClock && APH.Opening.markVideoEnded)
      APH.Opening.markVideoEnded(st.openingClock);
  }
  function renderOpening(clock){
    if(!clock || !window.APH.Opening) return;
    var img=$('openingStill');
    var cap=$('openingCaption');
    var btn=$('openingSurvive');
    var v=openingVideoEl();
    var vid = APH.Opening.videoSrc && APH.Opening.videoSrc();
    if(vid && v){
      if(btn && btn.style) btn.style.display=APH.Opening.isLast(clock)?'':'none';
      return;
    }
    var src=APH.Opening.assetOf(clock)||'';
    var text=APH.Opening.captionOf(clock)||'';
    if(img){
      if(img._aphSrc!==src){
        img._aphSrc=src;
        img.onerror=function(){ if(img.style) img.style.display='none'; };
        if(src){
          if(img.style) img.style.display='';
          img.src=src;
        }else if(img.style){
          img.style.display='none';
        }
      }
    }
    if(cap){ cap.style.display=''; cap.textContent=text; }
    if(btn && btn.style) btn.style.display=APH.Opening.isLast(clock)?'':'none';
  }
  function showDeath(reason,stats){
    hideOpening();
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
    setActBtn:setActBtn, hideIntro:hideIntro, hideOpening:hideOpening,
    showOpening:showOpening, skipOpeningVideo:skipOpeningVideo, renderOpening:renderOpening, showDeath:showDeath, showWin:showWin,
    fatal:fatal, armProbe:armProbe,
  };
})();
