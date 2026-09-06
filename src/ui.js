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
    var pb = $('pauseBanner');
    if(pb){
      if(s.paused){ pb.style.display='block'; pb.textContent='⏸ 暂停'; }
      else if((s.timeScale||1)!==1){ pb.style.display='block'; pb.textContent='⏱ ×'+(s.timeScale||1); }
      else pb.style.display='none';
    }
    renderAlerts();
    var cvEl = $('cv');
    if(cvEl && cvEl.style) cvEl.style.cursor = (s.scene==='home' && s.buildMode) ? 'cell' : '';
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
          /* ADR-25: 实时环境气温与室内温度展示 */
          var isDay = (window.APH.World && APH.World.daylight) ? APH.World.daylight() >= .5 : true;
          var outTemp = (window.APH.Weather && APH.Weather.ambientTemperatureOf) ? APH.Weather.ambientTemperatureOf(wxIdNow, isDay) : 22;
          var curRoomTemp = (s.currentRoom && s.currentRoom.temp != null) ? s.currentRoom.temp : null;
          var tempTxt = ' · ' + Math.round(outTemp) + '°C' + (curRoomTemp != null ? ' (室内 ' + Math.round(curRoomTemp) + '°C)' : '');

          if(wxRow.textContent !== undefined) wxRow.textContent=wxIcon+' '+wxName+tempTxt+' · 预计 '+wxDurTxt+wxTomorrow;
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

  /* ---------- 统一模态管理器 (Modal Manager, ADR-18) ---------- */
  var modals = {};
  var activeOverlay = null;
  var prevMode = null;

  function registerModal(id, def){
    if(!id || !def) return;
    modals[id] = {
      elId: def.elId,
      isOverlay: def.isOverlay !== false,
      render: typeof def.render === 'function' ? def.render : null,
      onOpen: typeof def.onOpen === 'function' ? def.onOpen : null,
      onClose: typeof def.onClose === 'function' ? def.onClose : null
    };
  }

  function getModalEl(def){
    if(!def || !def.elId) return null;
    return (typeof document !== 'undefined' && document.getElementById) ? document.getElementById(def.elId) : null;
  }

  function isOpen(id){
    var def = modals[id];
    if(!def) return false;
    var el = getModalEl(def);
    if(!el) return false;
    return el.style.display !== 'none' && el.style.display != null && el.style.display !== undefined;
  }

  function open(id, opts){
    var def = modals[id];
    if(!def) return false;
    var el = getModalEl(def);
    if(!el) return false;

    var s = window.APH && window.APH.state;
    if(def.isOverlay){
      // 互斥关闭其它全屏模态
      for(var mId in modals){
        if(mId !== id && modals[mId].isOverlay && isOpen(mId)){
          var otherEl = getModalEl(modals[mId]);
          if(otherEl) otherEl.style.display = 'none';
          if(modals[mId].onClose) modals[mId].onClose();
          if(window.APH && window.APH.Input && window.APH.Input.popContext){
            window.APH.Input.popContext('modal:' + mId);
          }
        }
      }
      // 保存前序 mode 并挂起游戏
      if(s){
        if(s.mode !== 'paused' && prevMode === null){
          prevMode = s.mode;
        }
        s.mode = 'paused';
      }
      activeOverlay = id;
    }

    if(def.render && s) def.render(s, opts);
    if(def.onOpen) def.onOpen(opts);
    if(window.APH && window.APH.Input && window.APH.Input.pushContext){
      window.APH.Input.pushContext('modal:' + id);
    }
    el.style.display = '';
    return true;
  }

  function close(id){
    if(!id){
      id = activeOverlay;
    }
    var def = modals[id];
    if(!def) return false;
    var el = getModalEl(def);
    if(el) el.style.display = 'none';
    if(def.onClose) def.onClose();
    if(window.APH && window.APH.Input && window.APH.Input.popContext){
      window.APH.Input.popContext('modal:' + id);
    }

    if(def.isOverlay){
      if(activeOverlay === id) activeOverlay = null;
      // 检查是否还有其它全屏模态开着
      var anyOverlayLeft = false;
      for(var mId in modals){
        if(modals[mId].isOverlay && isOpen(mId)){
          anyOverlayLeft = true;
          activeOverlay = mId;
          break;
        }
      }
      if(!anyOverlayLeft){
        var s = window.APH && window.APH.state;
        if(s && prevMode !== null){
          s.mode = prevMode;
          prevMode = null;
        }
      }
    }
    return true;
  }

  function toggle(id, opts){
    if(isOpen(id)){
      close(id);
      return false;
    } else {
      return open(id, opts);
    }
  }

  function closeActive(){
    if(activeOverlay && isOpen(activeOverlay)){
      close(activeOverlay);
      return true;
    }
    for(var mId in modals){
      if(isOpen(mId)){
        close(mId);
        return true;
      }
    }
    return false;
  }

  function hasActiveModal(){
    if(activeOverlay && isOpen(activeOverlay)) return true;
    for(var mId in modals){
      if(modals[mId].isOverlay && isOpen(mId)) return true;
    }
    return false;
  }

  function getActiveModal(){
    if(activeOverlay && isOpen(activeOverlay)) return activeOverlay;
    return null;
  }

  function esc(t){ return String(t==null?'':t).replace(/</g,'&lt;'); }

  /* ---------- LLM 设置面板(开场画面内) ---------- */
  function bindLLMPanel(){
    var intro=document.getElementById('intro');
    if(!intro) return;
    if(document.getElementById('llmForm')) return;
    var panel=document.createElement('div');
    panel.style.cssText='margin-top:18px;font-size:11px;color:#5d6f96;line-height:2';
    panel.innerHTML=
      '<span id="llmStatus"></span> '+
      '<a href="#" id="llmToggle" style="color:#59d9ff;text-decoration:none">AI 档案设置</a>'+
      '<div id="llmForm" style="display:none;margin-top:8px">'+
      '<input id="llmEp" placeholder="API endpoint (https://.../v1)" '+
        'style="width:240px;background:#0c1220;border:1px solid #223252;color:#cdd9f5;padding:6px 10px;border-radius:8px;font-size:11px"><br>'+
      '<input id="llmKey" type="password" placeholder="API Key"'+
        'style="width:240px;background:#0c1220;border:1px solid #223252;color:#cdd9f5;padding:6px 10px;border-radius:8px;font-size:11px;margin-top:4px"><br>'+
      '<input id="llmModel" placeholder="模型名 (如 gemini-2.0-flash)"'+
        'style="width:240px;background:#0c1220;border:1px solid #223252;color:#cdd9f5;padding:6px 10px;border-radius:8px;font-size:11px;margin-top:4px"><br>'+
      '<button id="llmSave" style="margin-top:6px;background:none;border:1px solid #59d9ff;color:#59d9ff;'+
        'padding:5px 16px;border-radius:12px;font-size:11px;cursor:pointer">保存</button>'+
      '</div>';
    intro.appendChild(panel);
    refreshLLMStatus();
    var toggleBtn=document.getElementById('llmToggle');
    if(toggleBtn){
      toggleBtn.addEventListener('click',function(e){
        e.preventDefault();
        var f=document.getElementById('llmForm');
        if(f) f.style.display = f.style.display==='none' ? 'block' : 'none';
      });
    }
    var saveBtn=document.getElementById('llmSave');
    if(saveBtn){
      saveBtn.addEventListener('click',function(){
        if(APH.LLM && APH.LLM.setConf){
          APH.LLM.setConf(
            document.getElementById('llmEp').value,
            document.getElementById('llmKey').value,
            document.getElementById('llmModel').value);
        }
        refreshLLMStatus();
        var f=document.getElementById('llmForm');
        if(f) f.style.display='none';
      });
    }
  }

  function refreshLLMStatus(){
    var el=document.getElementById('llmStatus');
    if(!el) return;
    if(APH.LLM && APH.LLM.quotaInfo && APH.LLM.enabled){
      var q=APH.LLM.quotaInfo();
      el.textContent = APH.LLM.enabled()
        ? '● AI 档案开启 (今日余 '+q.left+')'
        : '○ AI 未配置(程序降级)';
    }
  }

  /* ---------- 科学图鉴 (Codex, ADR-18) ---------- */
  function renderCodex(){
    var s=window.APH && window.APH.state;
    if(!s) return;
    var body=document.getElementById('codexBody');
    if(!body) return;
    var T = (APH.CFG && APH.CFG.entType) || {};
    var html='';
    var b=s.spec && s.spec.biome;
    if(b){
      html+='<div style="background:rgba(89,217,255,.12);border:1px solid #59d9ff;border-radius:8px;padding:8px 12px;margin-bottom:12px">'+
        '<b style="color:#59d9ff;font-size:13px">【生态群系】'+esc(b.name)+'</b>'+
        '<div style="color:#cdd9f5;font-size:11px;margin-top:2px">'+esc(b.desc)+'</div>'+
        '</div>';
    }
    if(s.spec){
      html+='<div style="color:#59d9ff;margin-bottom:4px">'+esc(s.spec.name)+' · '+
            esc(s.spec.paletteName)+' · 难度 '+'★'.repeat(s.spec.tier||1)+'</div>';
    }
    /* 科学图鉴: 已化验标本解剖档案 (Science #55) */
    if(APH.Colony && APH.Colony.specimenCodexEntries && s.meta){
      var specEntries=APH.Colony.specimenCodexEntries(s.meta);
      var analyzedN=0;
      specEntries.forEach(function(en){ if(en.analyzed) analyzedN++; });
      html+='<div style="margin-top:14px;color:#ffc857">科学图鉴 ('+analyzedN+'/'+specEntries.length+')</div>';
      specEntries.forEach(function(en){
        if(en.analyzed){
          html+='<div style="color:#9fe8c8">◈ '+esc(en.name)+' — '+esc(en.analysisName)+
            '<br><span style="color:#5d6f96">'+esc(en.desc)+'</span></div>';
        }else{
          html+='<div style="color:#39435c">◇ 未解析 · 待化验</div>';
        }
      });
    }
    /* 已录入异常 */
    html+='<div style="margin-top:14px;color:#ffc857">已录入异常 ('+(s.found||0)+'/'+(s.totalBeacons||0)+')</div>';
    (s.entities||[]).forEach(function(e){
      if(e.type!==T.BEACON) return;
      if(e.done) html+='<div style="color:#9fe8c8">◈ '+esc(e.name)+' — '+esc((e.lore||'').slice(0,60))+'…</div>';
      else       html+='<div style="color:#39435c">◇ 未扫描</div>';
    });
    /* 已知生物 */
    html+='<div style="margin-top:14px;color:#ffc857">已知生物</div>';
    if(s.spec && s.spec.enemies && s.spec.enemies.factions){
      s.spec.enemies.factions.forEach(function(f){
        html+='<div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;'+
              'background:hsl('+f.gene.hue+',62%,52%);margin-right:6px"></span>'+
              '<b>'+esc(f.name)+'</b> <span style="color:#8fa3cc">'+esc(f.behavior)+
              ' · HP '+f.hp+'</span><br><span style="color:#5d6f96">'+esc(f.lore||'')+'</span></div>';
      });
    }
    /* 环境法则 */
    if(s.spec && s.spec.laws && s.spec.laws.length){
      html+='<div style="margin-top:14px;color:#ffc857">环境法则</div>';
      s.spec.laws.forEach(function(l){
        html+='<div style="color:#8fa3cc">· <b style="color:#cdd9f5">'+esc(l.name||l.id)+'</b> '+esc(l.fact||'')+'</div>';
      });
    }
    body.innerHTML=html;
    var subEl = document.getElementById('codexSub');
    if(subEl) subEl.textContent='殖民地数据库 · 远征档案实时同步';
  }

  /* ---------- 科技树地图 (TechTree, ADR-18) ---------- */
  function visibleTechIds(){
    var cols=(APH.Colony && APH.Colony.TECH_COLUMNS)||[];
    var ids=[];
    cols.forEach(function(c){ (c.ids||[]).forEach(function(id){ ids.push(id); }); });
    return ids;
  }

  function ensureTechSel(){
    var s=window.APH && window.APH.state;
    if(!s) return;
    var ids=visibleTechIds();
    if(!ids.length) return;
    if(ids.indexOf(s.techSel)<0) s.techSel=ids[0];
  }

  function moveTechSel(code){
    var s=window.APH && window.APH.state;
    if(!s) return;
    var cols=(APH.Colony && APH.Colony.TECH_COLUMNS)||[];
    if(!cols.length) return;
    ensureTechSel();
    var col=0, row=0, i, j;
    for(i=0;i<cols.length;i++){
      j=(cols[i].ids||[]).indexOf(s.techSel);
      if(j>=0){ col=i; row=j; break; }
    }
    if(code==='ArrowLeft') col=(col+cols.length-1)%cols.length;
    if(code==='ArrowRight') col=(col+1)%cols.length;
    var ids=cols[col].ids||[];
    if(!ids.length) return;
    if(code==='ArrowUp') row=(row+ids.length-1)%ids.length;
    else if(code==='ArrowDown') row=(row+1)%ids.length;
    else row=Math.min(row, ids.length-1);
    s.techSel=ids[row];
    renderTechMap();
  }

  function setTechMapMsg(txt, col){
    var el=document.getElementById('techMapMsg');
    if(el){ el.textContent=txt||''; el.style.color=col||'#ffc857'; }
    if(txt) floatText(txt, 400, 300, col||'#ffc857');
  }

  function tryBuySelectedTech(){
    var s=window.APH && window.APH.state;
    if(!s || !s.techSel || !s.meta) return;
    var tdef=APH.Colony && APH.Colony.TECHS && APH.Colony.TECHS[s.techSel];
    if(!tdef) return;
    if(tdef.assayKey){
      var st=APH.Colony.techNodeStatus(s.meta, s.techSel, s.meta.tech||{});
      setTechMapMsg(st.why||'已研发', st.state==='owned'?'#59d9ff':'#ffc857');
      return;
    }
    var r2=APH.Colony.buyTech(s.meta,s.techSel,s.meta.tech||{});
    if(r2.ok){
      s.meta.tech=r2.owned;
      if(APH.Save && APH.Save.saveMeta) APH.Save.saveMeta(s.meta);
      if(window.APH.Main && APH.Main.applyTech){
        APH.Main.applyTech(s.meta, s.techSel);
        (r2.granted||[]).forEach(function(id){ APH.Main.applyTech(s.meta, id); });
      }
      var okMsg='✔ 研发成功: '+tdef.name;
      if(r2.granted && r2.granted.length){
        r2.granted.forEach(function(id){
          var g=APH.Colony.TECHS[id];
          if(g) okMsg+=' · 化验钥匙点亮 '+g.name;
        });
      }
      renderTechMap();
      setTechMapMsg(okMsg, '#59d9ff');
    }else{
      setTechMapMsg('✕ '+(r2.why||'无法研发'), '#ff9a9a');
    }
  }

  function renderTechMap(){
    var s=window.APH && window.APH.state;
    if(!s) return;
    var el=document.getElementById('techMap');
    var body=document.getElementById('techMapBody');
    var pts=document.getElementById('techMapPts');
    if(!el || !body) return;
    ensureTechSel();
    if(pts) pts.textContent='研究点 '+((s.meta && s.meta.research)||0);
    var cols=(APH.Colony && APH.Colony.TECH_COLUMNS)||[];
    var html='';
    cols.forEach(function(col){
      html+='<div class="techCol"><h3>'+esc(col.name)+'</h3>';
      (col.ids||[]).forEach(function(id){
        var t=APH.Colony.TECHS[id]; if(!t) return;
        var st=APH.Colony.techNodeStatus(s.meta, id, s.meta.tech||{});
        var depth=APH.Colony.techDepth(id);
        var sel=s.techSel===id;
        var border=sel?'#ffc857':(st.state==='owned'?'#19c8b9':(st.state==='available'?'#c8e89a':(st.state==='assay'?'#59d9ff':'#3d4a5c')));
        var bg=st.state==='owned'?'rgba(25,200,185,.16)':(st.state==='available'?'rgba(247,243,223,.12)':'rgba(16,24,40,.55)');
        var dim=(st.state==='locked'||st.state==='unaffordable')?'opacity:.62;':'';
        var pips='';
        if(st.max>1){
          var i;
          for(i=0;i<st.max;i++) pips+=(i<st.lv?'●':'○');
        }
        var costLine='';
        if(t.assayKey) costLine='化验钥匙';
        else if(st.state==='owned') costLine='已研发'+(pips?' '+pips:'');
        else costLine=t.cost+' 研究点'+(pips?' '+pips:'');
        var why=st.why && st.state!=='owned' && st.state!=='available' ? '<div class="techWhy">'+esc(st.why)+'</div>' : '';
        var desc=t.desc ? '<div class="techDesc">'+esc(t.desc)+'</div>' : '';
        var act='';
        if(sel){
          if(st.state==='available') act='<div class="techAct">再点一次或 Enter 研发</div>';
          else if(st.state==='owned') act='<div class="techAct">已研发</div>';
          else if(st.state==='unaffordable'||st.state==='locked'||st.state==='assay')
            act='<div class="techAct">'+esc(st.why||'')+'</div>';
        }
        html+='<div class="techNode" data-tech="'+id+'" style="margin-left:'+(depth*16)+'px;border-color:'+border+';background:'+bg+';'+dim+
          (sel?'box-shadow:0 0 0 1px #ffc857;':'')+'">'+
          '<b>'+esc(t.name)+'</b>'+
          '<span class="techCost">'+esc(costLine)+'</span>'+
          desc+why+act+'</div>';
      });
      html+='</div>';
    });
    body.innerHTML=html;
    if(!el._techClickBound){
      el._techClickBound=true;
      el.addEventListener('click', function(ev){
        var n=ev.target;
        while(n && n!==el){
          if(n.getAttribute && n.getAttribute('data-tech')){
            var id=n.getAttribute('data-tech');
            if(APH.state.techSel===id){ tryBuySelectedTech(); return; }
            APH.state.techSel=id;
            renderTechMap();
            return;
          }
          n=n.parentNode;
        }
      });
    }
  }

  /* 默认面板注册 */
  registerModal('codex', { elId: 'codex', isOverlay: true, render: renderCodex });
  registerModal('techMap', { elId: 'techMap', isOverlay: true, render: renderTechMap, onOpen: ensureTechSel });

  /* ---------- 外星势力外交面板 (Diplomacy, ADR-17, ADR-18) ---------- */
  function getPlayerDefPower(){
    if(window.APH.Main && APH.Main.playerDefPower) return APH.Main.playerDefPower();
    var s = window.APH && window.APH.state;
    if(!s || !s.colony || !s.colony.buildings) return 10;
    var turrets = s.colony.buildings.filter(function(b){ return b.id === 'bl_turret'; }).length;
    var plasmaLv = (APH.Colony && APH.Colony.plasmaTechLevel) ? APH.Colony.plasmaTechLevel(s.meta && s.meta.tech) : 0;
    return 10 + turrets * 12 + plasmaLv * 5;
  }

  function getStock(key){
    if(window.APH.Main && APH.Main.haveStock) return APH.Main.haveStock(key);
    var s = window.APH && window.APH.state;
    if(!s || !s.meta) return 0;
    if(APH.Colony && APH.Colony.stockOf) return APH.Colony.stockOf(s.meta.res, s.entities, key);
    return (s.meta.res && s.meta.res[key]) || 0;
  }

  function renderDiplomacy(){
    var s = window.APH && window.APH.state;
    if(!s) return;
    var body = document.getElementById('diplomacyBody');
    if(!body) return;
    if(!s.rivalStates && window.APH.Main && APH.Main.loadRivals) APH.Main.loadRivals();

    var def = getPlayerDefPower();
    var defEl = document.getElementById('dipDefPower');
    if(defEl) defEl.textContent = def;

    var topMil = 1;
    (s.rivalStates || []).forEach(function(r){
      if(r.rival && r.rival.military > topMil) topMil = r.rival.military;
    });
    var war = s.war || {};
    var ws = (APH.Rivals && APH.Rivals.warScore) ? APH.Rivals.warScore(topMil, def, war.wins, war.raids) : 50;
    var wsEl = document.getElementById('dipWarScore');
    if(wsEl) wsEl.textContent = ws;

    var minStock = getStock('mineral');
    var foodStock = getStock('food');
    var medStock = getStock('med');

    var D = (APH.CFG && APH.CFG.diplomacy) || {};
    var tributes = D.tributes || {};
    var minCost = (tributes.mineral && tributes.mineral.cost) || 15;
    var foodCost = (tributes.food && tributes.food.cost) || 10;
    var medCost = (tributes.med && tributes.med.cost) || 2;
    var pactDef = D.tradePact || { minRelation: 0, costMineral: 20 };
    var detDef = D.deterrence || { defRatio: 1.2, duration: 300 };

    var TRAIT_NAMES = {
      aggressive: '好战掠夺',
      expansionist: '领地扩张',
      trader: '互利商贸'
    };

    var html = '';
    (s.rivalStates || []).forEach(function(rs, idx){
      var rv = rs.rival || {};
      var rel = (rs.relation != null) ? rs.relation : ((APH.Rivals && APH.Rivals.defaultRelationOf) ? APH.Rivals.defaultRelationOf(rv.trait) : -40);
      var tier = (APH.Rivals && APH.Rivals.relationTierOf) ? APH.Rivals.relationTierOf(rel) : 'hostile';
      var traitName = TRAIT_NAMES[rv.trait] || rv.trait || '未知';
      var rColor = rv.color || '#ff6d4a';

      var tierBadge = '';
      if(tier === 'allied'){
        tierBadge = '<span style="background:#2ed573;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">盟友 (' + rel + ')</span>';
      }else if(tier === 'neutral'){
        tierBadge = '<span style="background:#ffc857;color:#1a1a1a;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">中立 (' + rel + ')</span>';
      }else{
        tierBadge = '<span style="background:#ff4757;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">宿敌 (' + rel + ')</span>';
      }

      var statusHtml = '';
      if(rs.cowedTime > 0){
        statusHtml = '<span style="color:#8fd4ff">⚡ 畏缩防御中 (剩余 ' + Math.ceil(rs.cowedTime) + 's)</span>';
      }else if(rs.wantRaid){
        statusHtml = '<span style="color:#ff4757;font-weight:700">⚠ 备战突击中 (时机成熟)</span>';
      }else if(rs.pact){
        statusHtml = '<span style="color:#7dffab"> 通商协定生效中 (享折扣)</span>';
      }else{
        statusHtml = '<span style="color:#8fa3cc">怒气 ' + Math.round(rs.anger || 0) + ' 分钟</span>';
      }

      var milVal = Math.round(rv.military || 10);
      var milBarW = Math.min(100, Math.round(milVal / Math.max(1, def + milVal) * 100));
      var defBarW = 100 - milBarW;

      var relBarW = Math.max(2, Math.min(100, Math.round((rel + 100) / 2)));
      var relColor = rel > 40 ? '#2ed573' : (rel >= -30 ? '#ffc857' : '#ff4757');

      var needDef = Math.ceil(milVal * detDef.defRatio);
      var canDeter = (rs.cowedTime <= 0) && (def >= needDef);
      var deterReason = (rs.cowedTime > 0) ? '已处于畏缩' : ('需防御 ≥ ' + needDef);

      var canPact = !rs.pact && (rel >= pactDef.minRelation) && (minStock >= pactDef.costMineral);
      var pactReason = rs.pact ? '已签署' : (rel < pactDef.minRelation ? '需关系 ≥ ' + pactDef.minRelation : '需矿石 ' + pactDef.costMineral);

      html += '<div class="dip-card" style="background:rgba(20,28,48,.75);border:1px solid rgba(89,217,255,.2);border-radius:8px;padding:16px;position:relative">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
          '<div>' +
            '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + rColor + ';margin-right:8px;vertical-align:middle"></span>' +
            '<b style="font-size:15px;color:#cdd9f5">' + esc(rv.name || '未知势力') + '</b>' +
            '<span style="margin-left:8px;color:#8fa3cc;font-size:11px">[' + traitName + ']</span>' +
          '</div>' +
          '<div>' + tierBadge + ' ' + statusHtml + '</div>' +
        '</div>' +

        '<div style="margin-bottom:12px">' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;color:#8fa3cc;margin-bottom:3px">' +
            '<span>仇视 (-100)</span><span>关系度: ' + rel + '</span><span>崇敬 (+100)</span>' +
          '</div>' +
          '<div style="height:6px;background:#101726;border-radius:3px;overflow:hidden">' +
            '<div style="height:100%;width:' + relBarW + '%;background:' + relColor + ';border-radius:3px;transition:width .3s"></div>' +
          '</div>' +
        '</div>' +

        '<div style="margin-bottom:14px;background:rgba(10,15,30,.5);padding:8px 12px;border-radius:6px">' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">' +
            '<span style="color:#59d9ff">我方防御: ' + def + '</span>' +
            '<span style="color:#ff6d4a">敌方军力: ' + milVal + '</span>' +
          '</div>' +
          '<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:#101726">' +
            '<div style="height:100%;width:' + defBarW + '%;background:#59d9ff"></div>' +
            '<div style="height:100%;width:' + milBarW + '%;background:#ff6d4a"></div>' +
          '</div>' +
        '</div>' +

        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<span style="color:#ffc857;font-size:11px;font-weight:700">外交行动:</span>' +
          '<button class="dip-btn" data-act="tribute" data-idx="' + idx + '" data-res="mineral" ' + (minStock >= minCost ? '' : 'disabled style="opacity:.45;cursor:not-allowed"') + '>' +
            ' 纳贡矿石 (' + minCost + '矿 / 余' + minStock + ')' +
          '</button>' +
          '<button class="dip-btn" data-act="tribute" data-idx="' + idx + '" data-res="food" ' + (foodStock >= foodCost ? '' : 'disabled style="opacity:.45;cursor:not-allowed"') + '>' +
            ' 纳贡粮食 (' + foodCost + '粮 / 余' + foodStock + ')' +
          '</button>' +
          '<button class="dip-btn" data-act="tribute" data-idx="' + idx + '" data-res="med" ' + (medStock >= medCost ? '' : 'disabled style="opacity:.45;cursor:not-allowed"') + '>' +
            ' 纳贡药品 (' + medCost + '药 / 余' + medStock + ')' +
          '</button>' +
          '<button class="dip-btn" data-act="pact" data-idx="' + idx + '" ' + (canPact ? '' : 'disabled style="opacity:.45;cursor:not-allowed"') + '>' +
            (rs.pact ? '✔ 通商协定已签署' : ' 签署通商 (' + pactReason + ')') +
          '</button>' +
          '<button class="dip-btn" data-act="deter" data-idx="' + idx + '" ' + (canDeter ? '' : 'disabled style="opacity:.45;cursor:not-allowed"') + '>' +
            '⚡ 军事威慑 (' + (canDeter ? '有效' : deterReason) + ')' +
          '</button>' +
        '</div>' +
      '</div>';
    });

    body.innerHTML = html;

    var btns = body.querySelectorAll ? body.querySelectorAll('.dip-btn') : [];
    for(var bi = 0; bi < btns.length; bi++){
      btns[bi].onclick = function(){
        if(this.disabled) return;
        var act = this.getAttribute('data-act');
        var rIdx = parseInt(this.getAttribute('data-idx'), 10);
        if(act === 'tribute'){
          var resType = this.getAttribute('data-res');
          doSendTribute(rIdx, resType);
        }else if(act === 'pact'){
          doSignTradePact(rIdx);
        }else if(act === 'deter'){
          doDeterRival(rIdx);
        }
      };
    }
  }

  function doSendTribute(rIdx, resType){
    var s = window.APH && window.APH.state;
    if(!s || !s.rivalStates || !s.rivalStates[rIdx]) return;
    var rs = s.rivalStates[rIdx];
    var stock = getStock(resType);
    var res = APH.Rivals.sendTribute(rs, resType, stock);
    if(!res.success){
      floatText('✕ ' + res.reason, 400, 300, '#ff9a9a');
      return;
    }
    if(APH.Colony && APH.Colony.takeStock) APH.Colony.takeStock(s.meta.res, s.entities, resType, res.cost);
    s.rivalStates[rIdx] = res.newState;
    if(window.APH.Main && APH.Main.saveRivals) APH.Main.saveRivals();
    if(window.APH.Main && APH.Main.saveMetaQuiet) APH.Main.saveMetaQuiet();
    if(s.war && s.war.pendingWave && s.war.raidFrom === rs.rival.name){
      s.war.pendingWave = null;
      s.war.raidWarn = 0;
    }
    floatText(' 向 ' + rs.rival.name + ' 纳贡成功，怒气平息！', 400, 300, '#7dffab');
    renderDiplomacy();
  }

  function doSignTradePact(rIdx){
    var s = window.APH && window.APH.state;
    if(!s || !s.rivalStates || !s.rivalStates[rIdx]) return;
    var rs = s.rivalStates[rIdx];
    var stock = getStock('mineral');
    var res = APH.Rivals.signTradePact(rs, stock);
    if(!res.success){
      floatText('✕ ' + res.reason, 400, 300, '#ff9a9a');
      return;
    }
    if(APH.Colony && APH.Colony.takeStock) APH.Colony.takeStock(s.meta.res, s.entities, 'mineral', res.cost);
    s.rivalStates[rIdx] = res.newState;
    if(window.APH.Main && APH.Main.saveRivals) APH.Main.saveRivals();
    if(window.APH.Main && APH.Main.saveMetaQuiet) APH.Main.saveMetaQuiet();
    floatText(' 与 ' + rs.rival.name + ' 签署通商协定！', 400, 300, '#59d9ff');
    renderDiplomacy();
  }

  function doDeterRival(rIdx){
    var s = window.APH && window.APH.state;
    if(!s || !s.rivalStates || !s.rivalStates[rIdx]) return;
    var rs = s.rivalStates[rIdx];
    var def = getPlayerDefPower();
    var res = APH.Rivals.deterRival(rs, def);
    if(!res.success){
      floatText('✕ ' + res.reason, 400, 300, '#ff9a9a');
      return;
    }
    s.rivalStates[rIdx] = res.newState;
    if(window.APH.Main && APH.Main.saveRivals) APH.Main.saveRivals();
    floatText('⚡ 成功威慑 ' + rs.rival.name + '！敌方陷入畏缩。', 400, 300, '#ffc857');
    renderDiplomacy();
  }

  registerModal('diplomacy', { elId: 'diplomacyOverlay', isOverlay: true, render: renderDiplomacy });

  /* ---------- 游商交易面板 (Trader, ADR-18) ---------- */
  var RES_LABEL = { mineral:'矿材', food:'食物', leather:'皮革', med:'药品', alloy:'合金', crystal:'晶体矿' };

  function ensureTradePanel(){
    var el = document.getElementById('tradePanel');
    if(el) return el;
    if(typeof document === 'undefined' || !document.createElement) return null;
    el = document.createElement('div');
    el.id = 'tradePanel';
    el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;' +
      'background:rgba(10,14,24,.96);border:1px solid #223252;border-radius:14px;' +
      'padding:18px 22px;min-width:340px;max-height:70vh;overflow:auto;color:#cdd9f5;' +
      'font-size:12px;line-height:1.9;display:none';
    if(document.body && document.body.appendChild) document.body.appendChild(el);
    return el;
  }

  function currentTrader(){
    var s = window.APH && window.APH.state;
    if(!s) return null;
    return (s.nearVisitor && s.nearVisitor.trade && !s.nearVisitor.dead) ? s.nearVisitor : null;
  }

  function tradeRowCount(tr){
    if(!tr || !tr.trade) return 0;
    return (tr.trade.sells || []).length + (tr.trade.buys || []).length;
  }

  function moveTradeSel(code){
    var s = window.APH && window.APH.state;
    if(!s) return;
    var tr = currentTrader();
    if(!tr) return;
    var max = tradeRowCount(tr);
    if(max <= 0) return;
    if(s.tradeSel == null) s.tradeSel = 0;
    if(code === 'ArrowUp') s.tradeSel = (s.tradeSel - 1 + max) % max;
    else if(code === 'ArrowDown') s.tradeSel = (s.tradeSel + 1) % max;
    renderTradePanel();
  }

  function tradeMulNow(){
    var s = window.APH && window.APH.state;
    if(!s || !s.meta) return 0;
    var gb = (APH.Res && APH.Res.globalBonuses) ? APH.Res.globalBonuses(s.meta.residents || []) : {};
    var pactBonus = ((s.rivalStates || []).some(function(r){ return r.pact; })) ? 0.1 : 0;
    return (gb.tradeMul || 0) + pactBonus;
  }

  function renderTradePanel(){
    var s = window.APH && window.APH.state;
    if(!s) return;
    var el = ensureTradePanel();
    if(!el) return;
    var tr = currentTrader();
    if(!tr){ el.style.display = 'none'; return; }
    var mul = tradeMulNow();
    var stock = tr.trade || { sells: [], buys: [] };
    var html = '<b style="color:#ffc857;font-size:13px">游商 · ' + esc(tr.name || '') + '</b>' +
      '<span style="float:right;color:#8fa3cc">矿材 ' +
      (APH.Colony && APH.Colony.stockOf ? APH.Colony.stockOf(s.meta && s.meta.res, s.entities, 'mineral') : 0) + '</span><br>' +
      (mul > 0 ? '<span style="color:#8fd4ff">社交议价 ' + Math.round(mul * 100) + '%</span><br>' : '');
    var row = 1;
    html += '<div style="margin-top:8px;color:#9fe8c8">买入(扣矿材)</div>';
    (stock.sells || []).forEach(function(it, i){
      var cost = Math.max(1, Math.round(it.price * (1 - mul)));
      var sel = (s.tradeSel || 0) === i;
      html += '<div style="color:' + ((it.n || 0) > 0 ? '#cdd9f5' : '#39435c') +
        (sel ? ';background:#1a2838;border-radius:4px;padding:0 6px' : '') + '">' +
        (sel ? '▸ ' : '[' + row + '] ') +
        (RES_LABEL[it.key] || it.key) + ' ×' + (it.n || 0) + ' · ' + cost + '矿/件</div>';
      row++;
    });
    html += '<div style="margin-top:8px;color:#ffc857">卖出(得矿材)</div>';
    (stock.buys || []).forEach(function(of, i){
      var gain = Math.max(1, Math.round(of.price * (1 + mul)));
      var idx = (stock.sells || []).length + i;
      var sel = (s.tradeSel || 0) === idx;
      html += '<div style="color:' + ((of.n || 0) > 0 ? '#cdd9f5' : '#39435c') +
        (sel ? ';background:#1a2838;border-radius:4px;padding:0 6px' : '') + '">' +
        (sel ? '▸ ' : '[' + row + '] ') +
        (RES_LABEL[of.key] || of.key) + ' (还收' + (of.n || 0) + ') · ' + gain + '矿/件 · 库存 ' +
        (of.key === 'crystal'
          ? (APH.Colony && APH.Colony.itemCount ? APH.Colony.itemCount(s.entities, 'it_crystal_ore') : 0)
          : (APH.Colony && APH.Colony.stockOf ? APH.Colony.stockOf(s.meta && s.meta.res, s.entities, of.key === 'alloy' ? 'mineral' : of.key) : 0)) +
        '</div>';
      row++;
    });
    html += '<div style="margin-top:10px;color:#5d6f96">↑↓选 · Enter成交 · 数字键也可 · [Esc] 关闭</div>';
    el.innerHTML = html;
  }

  function doTradeRow(i){
    var s = window.APH && window.APH.state;
    if(!s) return;
    var tr = currentTrader();
    if(!tr) { close('trade'); return; }
    var stock = tr.trade || { sells: [], buys: [] };
    var kind, idx;
    if(i < (stock.sells || []).length){ kind = 'buy'; idx = i; }
    else { kind = 'sell'; idx = i - (stock.sells || []).length; }
    var r = (APH.Res && APH.Res.tradeOnce) ? APH.Res.tradeOnce(s.meta, s.entities, stock, kind, idx, tradeMulNow()) : { ok: false, why: '未实现' };
    if(!r.ok){ floatText('✕ ' + r.why, 400, 300, '#ff9a9a'); renderTradePanel(); return; }
    if(r.kind === 'buy')
      floatText(' 买入 ' + (RES_LABEL[r.key] || r.key) + ' -' + r.cost + '矿', 400, 300, '#9fe8c8');
    else
      floatText(' 卖出 ' + (RES_LABEL[r.key] || r.key) + ' +' + r.gain + '矿', 400, 300, '#ffe28a');
    if(window.APH.Main && APH.Main.saveMetaQuiet) APH.Main.saveMetaQuiet();
    if(window.APH.Main && APH.Main.saveColony) APH.Main.saveColony();
    renderTradePanel();
    if(APH.U && APH.U.emit) APH.U.emit('traded', r);
  }

  registerModal('trade', {
    elId: 'tradePanel',
    isOverlay: true,
    render: renderTradePanel,
    onOpen: function(){
      ensureTradePanel();
      if(window.APH && window.APH.state) window.APH.state.tradeSel = 0;
    }
  });

  /* ---------- 建造抽屉目录 (BuildCatalog, ADR-18) ---------- */
  function renderBuildRow(){
    var s = window.APH && window.APH.state;
    if(!s || !s.colony) return;
    var brResearch = document.getElementById('brResearch');
    if(brResearch) brResearch.textContent = '研究点 ' + ((s.meta && s.meta.research) || 0);
    var bm = document.getElementById('brMineral');
    if(bm){
      var r = (s.meta && s.meta.res) || {};
      bm.textContent = '木 ' + (r.wood || 0) + ' · 铁 ' + (r.iron || r.mineral || 0) + ' · 石 ' + (r.stone || 0);
    }
    var qEl = document.getElementById('brQueue');
    if(qEl){
      if(s.colony.buildQueue && s.colony.buildQueue.length){
        var q0 = s.colony.buildQueue[0];
        var remain = Math.ceil((q0.total || 0) * (1 - (q0.progress || 0)));
        qEl.textContent = '施工中 ' + s.colony.buildQueue.length + ' 项 · ' + remain + 's';
      } else {
        qEl.textContent = '';
      }
    }
    var grid = document.getElementById('brCards');
    if(!grid) return;
    grid.innerHTML = '';
    var colors = ['#82d5bb','#f7cd67','#e59266','#889df0','#fc736d','#8ac68a','#b77dee','#d1da49','#e18c6f'];
    var i = 0;
    var CFG = APH.CFG || {};
    Object.keys(APH.Colony.list()).forEach(function(bid){
      if(bid === 'bl_landing_pad') return;
      var def = APH.Colony.get(bid);
      var nBuilt = s.colony.buildings.filter(function(b){ return b.id === bid; }).length;
      var nQueued = (s.colony.buildQueue || []).filter(function(q){ return q.bid === bid; }).length;
      var n = nBuilt + nQueued;
      var check = APH.Colony.canPlace(s.colony.buildings, s.meta.tech, bid, s.px, s.py, s.meta.res);
      var ok = check.ok && n < def.max;
      var costRes = def.costRes || {};
      var costPills = Object.keys(costRes).map(function(k){
        var itName = (CFG.items && CFG.items[k] && CFG.items[k].name) ? CFG.items[k].name : k;
        return '<span style="display:inline-block;background:#3d4a28;color:#c8e89a;border-radius:50px;' +
          'padding:1px 7px;font-size:10px;margin-right:3px">' + costRes[k] + itName + '</span>';
      }).join('');
      var reqTag = def.reqTech && (!s.meta.tech || !s.meta.tech[def.reqTech])
        ? '<div style="color:#ff6d7a;font-size:10px;margin-top:2px">[需研: ' + (APH.Colony.TECHS[def.reqTech] ? APH.Colony.TECHS[def.reqTech].name : def.reqTech) + ']</div>'
        : '';
      var card = document.createElement('div');
      card.style.cssText = 'flex:0 0 auto;width:150px;border-radius:16px;padding:10px 12px;cursor:' +
        (ok ? 'pointer' : 'not-allowed') + ';opacity:' + (ok ? 1 : .55) + ';background:' + colors[i % colors.length] +
        ';border:2px solid #fff;box-shadow:0 3px 8px rgba(61,52,40,.12);transition:transform .25s cubic-bezier(.4,0,.2,1)';
      card.innerHTML = '<b style="color:#fff;font-size:13px;text-shadow:0 1px 2px rgba(61,52,40,.35)">' +
        def.name + '</b><span style="float:right;color:#fff;font-size:10px">' + n + '/' + def.max + '</span><br>' +
        '<div style="margin-top:4px">' + costPills + '</div>' +
        reqTag +
        '<span style="display:inline-block;background:#794f27;color:#f7f3df;border-radius:50px;' +
        'padding:1px 8px;font-size:10px;margin-top:4px">' + def.buildTime + 's</span>' +
        ((def.cells && def.cells[0] > 1) ? '<span style="display:inline-block;background:rgba(255,255,255,.25);color:#fff;' +
          'border-radius:50px;padding:1px 7px;font-size:10px;margin-left:3px">' + def.cells[0] + '×' + def.cells[1] + '</span>' : '');
      if(ok){
        card.addEventListener('click', function(){
          s.buildMode = bid;
          close('buildCatalog');
          setHint('建造: ' + def.name + ' — 点击空地放置');
        });
        card.addEventListener('mouseover', function(){ card.style.transform = 'translateY(-2px)'; });
        card.addEventListener('mouseout', function(){ card.style.transform = ''; });
      }
      grid.appendChild(card);
      i++;
    });
  }

  registerModal('buildCatalog', {
    elId: 'buildRow',
    isOverlay: false,
    render: renderBuildRow
  });

  /* ---------- 规划命令抽屉 (Orders Drawer, ADR-28 / Ticket #157) ---------- */
  function renderOrdersRow(){
    var row = document.getElementById('ordersRow');
    if(!row) return;
    var s = (window.APH && window.APH.state) || {};
    var cur = s.orderTool;
    var tools = [
      { id: 'chop', name: '砍伐', icon: '🪓', title: '单点或拉框圈选树木与灌木进行砍伐' },
      { id: 'mine', name: '开采', icon: '⛏', title: '单点或拉框圈选岩石与矿脉进行开采' },
      { id: 'haul', name: '搬运', icon: '✋', title: '单点或拉框圈选掉落物资进行优先搬运' },
      { id: 'deconstruct', name: '拆除', icon: '🔨', title: '单点或圈选建筑进行拆除退还材料' },
      { id: 'cancel', name: '取消', icon: '✕', title: '单点或拉框清除区域内的规划标记', cancel: true },
    ];
    var h = '<div style="display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap">';
    tools.forEach(function(t){
      var active = cur === t.id;
      var bg = active ? 'rgba(89,217,255,.3)' : 'rgba(89,217,255,.08)';
      var bcol = active ? '#59d9ff' : (t.cancel ? 'rgba(255,154,154,.4)' : 'rgba(89,217,255,.25)');
      var tcol = active ? '#fff' : (t.cancel ? '#ff9a9a' : '#c5e3f6');
      var shadow = active ? 'box-shadow:0 0 10px rgba(89,217,255,.5);' : '';
      h += '<button data-order-tool="' + t.id + '" title="' + t.title + '" style="' +
        'background:' + bg + ';border:1.5px solid ' + bcol + ';color:' + tcol + ';' +
        'padding:8px 18px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;' +
        'letter-spacing:1px;transition:all .15s ease;' + shadow + '">' +
        t.icon + ' ' + t.name +
        '</button>';
    });
    h += '</div>';
    row.innerHTML = h;
  }
  registerModal('orders', {
    elId: 'ordersRow',
    isOverlay: false,
    render: renderOrdersRow
  });

  /* ---------- 居民名册面板 (Roster, ADR-18) ---------- */
  function moodFace(m){
    return m >= 75 ? '😊' : (m >= 50 ? '😐' : (m >= 30 ? '😟' : '😫'));
  }

  function foodBar(f){
    var col = f >= 60 ? '#7dffab' : (f >= 35 ? '#ffc857' : '#ff6d7a');
    return '<span style="display:inline-block;width:70px;height:7px;background:#1a2334;' +
           'border-radius:3px;vertical-align:middle"><span style="display:block;height:100%;width:' +
           Math.max(0, Math.min(100, f)) + '%;background:' + col + ';border-radius:3px"></span></span> ' + Math.round(f || 0);
  }

  function sickBar(f){
    f = f || 0;
    var col = f >= 50 ? '#ff6d7a' : (f >= 20 ? '#ffc857' : '#7dffab');
    return '<span style="display:inline-block;width:70px;height:7px;background:#1a2334;' +
           'border-radius:3px;vertical-align:middle"><span style="display:block;height:100%;width:' +
           Math.max(0, Math.min(100, f)) + '%;background:' + col + ';border-radius:3px"></span></span> ' + Math.round(f);
  }

  function prioCursor(){
    var s = window.APH && window.APH.state;
    if(!s) return { r: 0, c: 0 };
    if(!s.prioSel) s.prioSel = { r: 0, c: 0 };
    return s.prioSel;
  }

  function movePrioCursor(code){
    var s = window.APH && window.APH.state, m = s && s.meta;
    if(!m) return;
    var cur = prioCursor();
    var rows = (m.residents || []).length;
    var cols = allWorkCols().length;
    if(!rows) return;
    cur.r = Math.min(cur.r, rows - 1);
    if(code === 'ArrowUp') cur.r = (cur.r + rows - 1) % rows;
    if(code === 'ArrowDown') cur.r = (cur.r + 1) % rows;
    if(code === 'ArrowLeft') cur.c = (cur.c + cols - 1) % cols;
    if(code === 'ArrowRight') cur.c = (cur.c + 1) % cols;
    s.resSel = cur.r;
    renderResPanel();
  }

  function setPrioAtCursor(v){
    var s = window.APH && window.APH.state, m = s && s.meta;
    if(!m) return;
    var cur = prioCursor();
    var r = (m.residents || [])[cur.r];
    if(!r) return;
    m.workPrio = m.workPrio || {};
    if(!m.workPrio[r.id] && APH.Res && APH.Res.defaultPrio) m.workPrio[r.id] = APH.Res.defaultPrio(r);
    var col = allWorkCols()[cur.c];
    var sk = col ? col.key : 'sk_farm';
    m.workPrio[r.id][sk] = (APH.U && APH.U.clamp) ? APH.U.clamp(v, 0, 3) : Math.max(0, Math.min(3, v));
    r.jobLocked = false;
    if(window.APH.Main && APH.Main.saveMetaQuiet) APH.Main.saveMetaQuiet();
    renderResPanel();
    floatText(r.name + ' · ' + (col ? col.name : sk) + ' 优先级 → ' + v, 400, 300, '#8fd4ff');
  }

  var PRIO_COLOR = ['#39435c','#ffc857','#cdd9f5','#5d6f96'];
  var PRIO_LABEL = ['禁','优','普','闲'];
  /* ADR-28: 虚拟工作列（不进 SKILLS 技能数组，只作优先级分配） */
  var VIRTUAL_WORK = [
    { key: 'sk_gather', name: '采集', icon: '🪓' },
    { key: 'sk_haul', name: '搬运', icon: '📦' },
  ];
  var WORK_ICONS = { sk_build:'🔨', sk_farm:'🌾', sk_ranch:'🐑', sk_craft:'🔧', sk_lore:'🔬', sk_social:'💬' };
  function allWorkCols(){
    var cols = [];
    (APH.Res.SKILLS || []).forEach(function(sk){ cols.push({ key: sk, name: (APH.Res.SKILL_NAMES[sk] || sk), icon: WORK_ICONS[sk]||'' }); });
    VIRTUAL_WORK.forEach(function(v){ cols.push(v); });
    return cols;
  }
  /* RimWorld 式优先级颜色 (1=红橙 2=黄 3=浅蓝 4=灰暗) */
  var RW_PRIO_BG = ['#1a1f2e','#c0392b','#c4a000','#2d6a9f','#3a455c'];
  var RW_PRIO_TX = ['#5d6f96','#ffffff','#ffffff','#ffffff','#8fa3cc'];

  function prioGridHtml(m){
    var s = window.APH && window.APH.state;
    var wp = m.workPrio || {};
    var cols = allWorkCols();
    var html = '<div style="margin-bottom:16px">' +
      '<div style="color:#ffc857;margin-bottom:6px;font-size:13px;font-weight:700">⚙ 工作优先级命令表 <span style="color:#5d6f96;font-weight:400;font-size:11px">点击格子切换优先级 (1最高 → 4最低 → 禁止)</span></div>' +
      '<table style="border-collapse:separate;border-spacing:3px;font-size:12px;user-select:none">' +
      '<tr><td style="padding:4px 10px;color:#ffc857;font-weight:700;font-size:12px">居民</td>';
    cols.forEach(function(col){
      var isVirt = col.key === 'sk_gather' || col.key === 'sk_haul';
      html += '<td style="padding:4px 6px;text-align:center;min-width:52px;cursor:default;' +
        'color:' + (isVirt ? '#59d9ff' : '#8fa3cc') + ';font-weight:700;font-size:11px;' +
        'background:' + (isVirt ? 'rgba(89,217,255,.08)' : 'transparent') + ';' +
        'border-radius:6px 6px 0 0" title="' + col.name + '">' +
        '<div style="font-size:16px;margin-bottom:1px">' + (col.icon||'') + '</div>' +
        '<div>' + col.name + '</div></td>';
    });
    html += '</tr>';
    /* ADR-28: 玩家自身作为命令表首行（环世界核心：玩家也是小人） */
    var playerRow = '<tr><td style="padding:4px 10px;color:#59d9ff;font-weight:700;font-size:12px;white-space:nowrap">' +
      '⭐ 指挥官(你)</td>';
    var pPrio = m.playerPrio || (m.playerPrio = {});
    cols.forEach(function(col){
      var v = pPrio[col.key] != null ? pPrio[col.key] : 2;
      var bg = v === 0 ? RW_PRIO_BG[0] : RW_PRIO_BG[v];
      var tx = v === 0 ? RW_PRIO_TX[0] : RW_PRIO_TX[v];
      var label = v === 0 ? '✕' : String(v);
      playerRow += '<td data-prio-r="player" data-prio-c="' + col.key + '" style="padding:4px 0;text-align:center;cursor:pointer;' +
        'min-width:52px;border-radius:8px;transition:all .15s;' +
        'background:' + bg + ';color:' + tx + ';' +
        'border:2px solid ' + (v===0 ? '#1a2334' : 'rgba(89,217,255,.3)') + ';' +
        (v === 0 ? 'opacity:.45;' : '') + '" ' +
        'onmouseover="this.style.borderColor=\'#ffc857\'" ' +
        'onmouseout="this.style.borderColor=\'' + (v===0 ? '#1a2334' : 'rgba(89,217,255,.3)') + '\'"' +
        ' title="指挥官 · ' + col.name + ' · 优先级 ' + v + ' · 点击切换">' +
        '<div style="font-size:18px;font-weight:800;line-height:1">' + label + '</div></td>';
    });
    html += playerRow + '</tr>';
    (m.residents || []).forEach(function(r, ri){
      html += '<tr><td style="padding:4px 10px;color:#f7f3df;font-weight:700;font-size:12px;white-space:nowrap">' +
        '<span style="color:#8fa3cc;font-size:10px">' + (ri+1) + '.</span> ' + esc(r.name) + '</td>';
      var p = wp[r.id] || (APH.Res && APH.Res.defaultPrio ? APH.Res.defaultPrio(r) : {});
      cols.forEach(function(col){
        var v = p[col.key] != null ? p[col.key] : 2;
        var lv = col.key !== 'sk_gather' && col.key !== 'sk_haul' && r.skills ? (r.skills[col.key] || 0) : 0;
        /* RimWorld 优先级: 0=禁止 1=最高(红) 2=中(黄) 3=低(蓝) */
        var bgIdx = v === 0 ? 0 : v;  /* 0→暗灰 1→红 2→黄 3→蓝 */
        var bg = v === 0 ? RW_PRIO_BG[0] : RW_PRIO_BG[v];
        var tx = v === 0 ? RW_PRIO_TX[0] : RW_PRIO_TX[v];
        var label = v === 0 ? '✕' : String(v);
        var lvTag = lv > 0 ? '<div style="font-size:9px;opacity:.6;margin-top:1px">Lv' + lv + '</div>' : '';
        html += '<td data-prio-r="' + esc(r.id) + '" data-prio-c="' + col.key + '" style="padding:4px 0;text-align:center;cursor:pointer;' +
          'min-width:52px;border-radius:8px;transition:all .15s;' +
          'background:' + bg + ';color:' + tx + ';' +
          'border:2px solid ' + (v===0 ? '#1a2334' : 'rgba(255,255,255,.15)') + ';' +
          (v === 0 ? 'opacity:.45;' : '') + '" ' +
          'onmouseover="this.style.borderColor=\'#ffc857\'" ' +
          'onmouseout="this.style.borderColor=\'' + (v===0 ? '#1a2334' : 'rgba(255,255,255,.15)') + '\'"' +
          ' title="' + esc(r.name) + ' · ' + col.name + ' · 优先级 ' + v + ' · 点击切换">' +
          '<div style="font-size:18px;font-weight:800;line-height:1">' + label + '</div>' + lvTag + '</td>';
      });
      html += '</tr>';
    });
    html += '</table>' +
      '<div style="margin-top:6px;font-size:10px;color:#5d6f96">' +
      '<span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:' + RW_PRIO_BG[1] + ';vertical-align:middle"></span> 1 最高 ' +
      '<span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:' + RW_PRIO_BG[2] + ';vertical-align:middle;margin-left:8px"></span> 2 普通 ' +
      '<span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:' + RW_PRIO_BG[3] + ';vertical-align:middle;margin-left:8px"></span> 3 闲时 ' +
      '<span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:' + RW_PRIO_BG[0] + ';vertical-align:middle;margin-left:8px"></span> ✕ 禁止' +
      '</div></div>';
    return html;
  }

  function panelStock(key){
    var s = window.APH && window.APH.state;
    if(!s) return '0';
    var w = (s.meta && s.meta.res && s.meta.res[key]) || 0;
    var g = (APH.Colony && APH.Colony.groundCount) ? APH.Colony.groundCount(s.entities, key) : 0;
    return g > 0 ? (w + ' · 地' + g) : String(w);
  }

  function housingCap(){
    var s = window.APH && window.APH.state;
    if(!s || !s.colony || !s.colony.buildings) return 2;
    return (APH.Colony && APH.Colony.housingCapacity) ? APH.Colony.housingCapacity(s.colony.buildings) : 2;
  }

  function renderResPanel(){
    var s = window.APH && window.APH.state, m = s && s.meta;
    var body = document.getElementById('resBody');
    if(!body || !m) return;
    var rf = document.getElementById('resFood'); if(rf) rf.textContent = panelStock('food');
    var rm = document.getElementById('resMineral'); if(rm) rm.textContent = panelStock('mineral');
    var rl = document.getElementById('resLeather'); if(rl) rl.textContent = panelStock('leather');
    var rmd = document.getElementById('resMed'); if(rmd) rmd.textContent = panelStock('med');
    var popCount = (m.residents || []).length + 1;
    var rp = document.getElementById('resPop'); if(rp) rp.textContent = popCount + '/' + housingCap();
    var html = prioGridHtml(m);

    /* 1. 指挥官专属角色卡 (ADR-29: 玩家小人也是殖民地首位成员) */
    var pNeeds = m.playerNeeds || {};
    var pHp = Math.max(0, Math.min(100, Math.round(s.hp != null ? s.hp : 100)));
    var pFood = Math.max(0, Math.min(100, Math.round(pNeeds.food != null ? pNeeds.food : 80)));
    var pRest = Math.max(0, Math.min(100, Math.round(pNeeds.rest != null ? pNeeds.rest : 100)));
    var pO2 = Math.max(0, Math.min(100, Math.round(s.o2 != null ? s.o2 : 100)));
    var pIllness = Math.round(pNeeds.illness || 0);
    var pStatusTxt = s.playerDrafted ? '<span style="color:#ff4d4d;font-weight:700">[战备征召]</span>' : (pNeeds.downed ? '<span style="color:#ff4757">[昏迷击倒]</span>' : (pNeeds.isSleeping ? '<span style="color:#b39dff">[睡眠中]</span>' : '<span style="color:#7dffab">[全能自治]</span>'));

    var pSkHtml = (APH.Res.SKILLS || []).map(function(sk){
      var v = (m.playerSkills && m.playerSkills[sk]) || (sk === 'sk_build' ? 6 : (sk === 'sk_farm' ? 6 : (sk === 'sk_lore' ? 6 : 5)));
      return '<span style="color:#59d9ff">' + (APH.Res.SKILL_NAMES[sk] || sk) + v + '</span>';
    }).join(' · ');

    html += '<div style="border:1.5px solid rgba(89,217,255,.5);border-radius:10px;padding:12px 16px;margin-bottom:12px;background:rgba(18,34,55,.85);box-shadow:0 0 12px rgba(89,217,255,.15)">' +
      '<b style="font-size:14px;color:#59d9ff">⭐ 指挥官 (你)</b> ' + pStatusTxt +
      ' <span style="color:#8fa3cc;font-size:11px">全能拓荒者 · 基地领袖 · 探索队长 · <span style="color:#7dffab">工作效率 1.25</span></span><br>' +
      '<span style="color:#8fa3cc;font-size:11px">' + pSkHtml + '</span><br>' +
      '<div style="margin-top:6px;font-size:11px">' +
      '生命 ' + foodBar(pHp) + '&nbsp;&nbsp;饱食 ' + foodBar(pFood) +
      '&nbsp;&nbsp;精力 ' + foodBar(pRest) + (pNeeds.isSleeping ? ' <span style="color:#8fd4ff">[睡眠]</span>' : '') +
      '&nbsp;&nbsp;氧气 ' + foodBar(pO2) +
      (pIllness > 0 ? ('&nbsp;&nbsp;<span style="color:#ff6d7a">病情 ' + sickBar(pIllness) + '</span>') : '') +
      '</div>' +
    '</div>';

    if(!m.residents || !m.residents.length){
      html += '<div style="color:#5d6f96;margin:16px 0 24px;text-align:center;font-size:12px">' +
        '暂无其他入籍居民 · 游商与过客会定期拜访家园，走近他们按 [E] 或右键招募。</div>';
    }
    (m.residents || []).forEach(function(r, idx){
      var skHtml = (APH.Res.SKILLS || []).map(function(sk){
        var v = (r.skills && r.skills[sk]) || 0;
        var col = sk === r.mainSkill ? '#ffc857' : (sk === r.subSkill ? '#8fd4ff' : '#39435c');
        return '<span style="color:' + col + '">' + (APH.Res.SKILL_NAMES[sk] || sk) + v + '</span>';
      }).join(' · ');
      var jobTxt = r.job ? ((APH.Colony && APH.Colony.get && APH.Colony.get(r.job)) || {}).name || r.job : (r.mainSkill === 'sk_farm' ? '待岗(适合务农)' : '闲居');
      var sel = ((s && s.resSel) || 0) === idx;
      var brkTag = (APH.Res && APH.Res.isBroken && APH.Res.isBroken(r))
        ? ' <span style="color:#ff6d7a;font-weight:700">[崩溃·' +
          (APH.Res.BREAK_NAMES[r.breakType] || r.breakType) + ']</span>' : '';
      html += '<div style="border:1px solid ' + (sel ? '#ffc857' : '#1a2334') + ';border-radius:10px;padding:12px 16px;margin-bottom:10px;background:#0c1220">' +
        '<b style="font-size:13px">' + (idx + 1) + '. ' + r.name + '</b>' + brkTag +
        ' <span style="color:#8fa3cc;font-size:11px">' + moodFace(r.mood) + ' ' + r.trait +
        ' · ' + r.origin + (r.job ? ' · <span style="color:#8fd4ff">' + jobTxt + ' (效率' + (APH.Res.efficiency ? APH.Res.efficiency(r) : 1) + ')</span>'
         : ' · ' + jobTxt) + '</span><br>' +
        '<span style="color:#5d6f96;font-size:11px">' + skHtml + '</span><br>' +
        (r.bio ? '<div style="color:#6f83ad;font-size:11px;margin-top:4px;border-left:2px solid #1a2334;padding-left:8px">' + esc(r.bio) + '</div>' : '') +
        '<div style="margin-top:4px;font-size:11px">' +
        '心情 ' + foodBar(r.mood) + '&nbsp;&nbsp;饱食 ' + foodBar(r.food) +
        '&nbsp;&nbsp;精力 ' + foodBar(r.rest != null ? r.rest : 100) + (r.isSleeping ? ' <span style="color:#8fd4ff">[睡眠]</span>' : '') +
        '&nbsp;&nbsp;娱乐 ' + foodBar(r.recreation != null ? r.recreation : 80) +
        (r.exposure > 0 ? ('&nbsp;&nbsp;<span style="color:#ffb35c">暴露 ' + sickBar(r.exposure) + '</span>') : '') +
        '&nbsp;&nbsp;病情 ' + sickBar(r.illness || 0) +
        (r.downed ? ' <span style="color:#ff4757;font-weight:700">[ 击倒 · 濒死 ' + Math.max(0, Math.round(r.bleedOutTimer || 0)) + 's]</span>' : '') +
        (r.ailments && r.ailments.length
          ? ' <span style="font-size:11px">' + r.ailments.map(function(a){
              var col = a.type === 'plague' ? '#ff6d7a' : (a.type === 'infection' ? '#ffb35c' : '#8fa3cc');
              return '<span style="color:' + col + '">[' +
                (APH.Res.AILMENT_NAMES[a.type] || a.type) + ' ' + Math.round(a.sev) + ']</span>';
            }).join(' ') + '</span>'
          : '') +
        '</div>' +
        (function(){
          var cap = (APH.Res && APH.Res.capacitiesOf) ? APH.Res.capacitiesOf(r) : { moving: 1, manipulation: 1, consciousness: 1 };
          var kb = (APH.Res && APH.Res.keyBondsOf) ? APH.Res.keyBondsOf(r.id, m.residents, m.bonds) : null;
          var socHtml = '';
          if(kb){
            var parts = [];
            if(kb.player){
              parts.push('领袖: <span style="color:' + kb.player.tier.color + '">' + kb.player.tier.icon + ' ' + kb.player.tier.name + '(' + Math.round(kb.player.bond) + ')</span>');
            }
            if(kb.closest && kb.closest.bond >= 60){
              parts.push('好友: <span style="color:' + kb.closest.tier.color + '">' + kb.closest.tier.icon + ' ' + kb.closest.name + '(' + Math.round(kb.closest.bond) + ')</span>');
            }
            if(kb.worst && kb.worst.bond < 40){
              parts.push('不睦: <span style="color:' + kb.worst.tier.color + '">' + kb.worst.tier.icon + ' ' + kb.worst.name + '(' + Math.round(kb.worst.bond) + ')</span>');
            }
            if(!parts.length) parts.push('<span style="color:#5d6f96">中立平和</span>');
            socHtml = ' · 羁绊[' + parts.join(' · ') + ']';
          }
          return '<div style="font-size:10px;color:#8fa3cc;margin-top:2px">' +
            '机能: 移动 ' + Math.round(cap.moving * 100) + '% · 操作 ' + Math.round(cap.manipulation * 100) + '% · 认知 ' + Math.round(cap.consciousness * 100) + '%' +
            (r.bedId ? (' · <span style="color:#7dffab">床位[' + r.bedId + ']</span>') : ' · <span style="color:#ffb35c">露宿打地铺</span>') +
            socHtml +
            '</div>';
        })() +
        '</div>';
    });
    if(m.bonds && Object.keys(m.bonds).length){
      html += '<div style="margin-top:14px;color:#ffc857;font-size:12px;font-weight:700">殖民地人际羁绊网络</div>';
      Object.keys(m.bonds).forEach(function(k){
        var v = Math.round(m.bonds[k]);
        var tier = (APH.Res && APH.Res.relationshipTierOf) ? APH.Res.relationshipTierOf(v) : { name:'平淡', icon:'😐', color:'#8fa3cc' };
        var names = k.split('|').map(function(id){
          if(id === 'player') return '指挥官(你)';
          var r = (m.residents || []).find(function(x){ return x.id === id; });
          return r ? r.name : id;
        });
        html += '<div style="font-size:11px;margin-top:2px;color:' + tier.color + '">' +
          tier.icon + ' ' + names[0] + ' ↔ ' + names[1] + ' : ' + tier.name + ' (' + v + ')</div>';
      });
    }
    body.innerHTML = html;
  }

  registerModal('roster', {
    elId: 'resPanel',
    isOverlay: true,
    render: renderResPanel
  });

  function toggleDiplomacy(show){
    if(modals['diplomacy']){
      if(show !== undefined){
        return show ? open('diplomacy') : close('diplomacy');
      }
      return toggle('diplomacy');
    }
    if(window.APH.Main && APH.Main.toggleDiplomacy) APH.Main.toggleDiplomacy(show);
  }

  /* ================= ADR-28 / Ticket #156: 通用检查器 (Inspector) ================= */
  function inspectorHtml(target, s){
    if(!s) s = (window.APH && window.APH.state) || {};
    var CFG = (window.APH && window.APH.CFG) || {};
    if(!target || target.type === 'player'){
      /* 1. 指挥官(玩家) */
      var m = s.meta || {};
      var needs = m.playerNeeds || {};
      var hp = Math.round(s.hp != null ? s.hp : 100);
      var food = Math.round(needs.food != null ? needs.food : 80);
      var rest = Math.round(needs.rest != null ? needs.rest : 100);
      var o2 = Math.round(s.o2 != null ? s.o2 : 100);
      var statusTxt = needs.downed ? '昏迷击倒' : (needs.isSleeping ? '睡眠休息中' : (s.moving ? '行进中' : '清醒 · 待命'));
      var statusCol = needs.downed ? '#ff4d4d' : (needs.isSleeping ? '#b39dff' : '#7dffab');

      var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<div style="font-size:22px;width:30px;text-align:center">🧑‍🚀</div>' +
        '<div style="flex:1">' +
          '<div style="color:#59d9ff;font-weight:800;font-size:12px;letter-spacing:1px">⭐ 指挥官(你)</div>' +
          '<div style="color:' + statusCol + ';font-size:10px">' + statusTxt + '</div>' +
        '</div>' +
      '</div>';

      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;font-size:10px">' +
        '<div><span style="color:#8fa3cc">生命 </span><b style="color:#7dffab">' + hp + '</b></div>' +
        '<div><span style="color:#8fa3cc">饱食 </span><b style="color:#ffc857">' + food + '</b></div>' +
        '<div><span style="color:#8fa3cc">精力 </span><b style="color:#59d9ff">' + rest + '</b></div>' +
        '<div><span style="color:#8fa3cc">氧气 </span><b style="color:#c5e3f6">' + o2 + '</b></div>' +
      '</div>';
      return h;
    }

    if(target.type === 'resident'){
      /* 2. 居民(Pawn) */
      var ent = target.entity || target;
      var rid = ent.rid || ent.id;
      var r = (s.meta && s.meta.residents) ? s.meta.residents.find(function(x){ return x.id === rid; }) : null;
      var name = (r && r.name) || ent.name || '居民';
      var trait = (r && r.trait) || '勤勉';
      var job = (r && r.job) ? ((CFG.buildings && CFG.buildings[r.job] && CFG.buildings[r.job].name) || r.job) : '待命中';
      var mood = Math.round((r && r.mood != null) ? r.mood : (ent.mood || 80));
      var food = Math.round((r && r.food != null) ? r.food : (ent.food || 80));
      var rest = Math.round((r && r.rest != null) ? r.rest : (ent.rest || 80));
      var action = ent.userOrder ? (ent.userOrder.type === 'move' ? '战术行军中' : (ent.userOrder.type === 'gather' ? '执行开采指令' : '执行搬运指令')) : (ent.drafted ? '战备戒备中' : (ent.gathering ? '正在采集中' : (ent.walking ? (ent.job ? '工位巡视劳作' : '基地漫步闲逛') : (ent.job ? '工位作业中' : '休闲散步中'))));

      var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<div style="font-size:22px;width:30px;text-align:center">👤</div>' +
        '<div style="flex:1">' +
          '<div style="color:#ffc857;font-weight:800;font-size:12px">' + name + ' <span style="font-size:10px;color:#8fa3cc;font-weight:400">(' + trait + ')</span></div>' +
          '<div style="color:#59d9ff;font-size:10px">' + action + ' · ' + job + '</div>' +
        '</div>' +
      '</div>';

      h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px 4px;font-size:10px">' +
        '<div><span style="color:#8fa3cc">心情 </span><b style="color:#ffd54f">' + mood + '%</b></div>' +
        '<div><span style="color:#8fa3cc">饱食 </span><b style="color:#7dffab">' + food + '</b></div>' +
        '<div><span style="color:#8fa3cc">精力 </span><b style="color:#59d9ff">' + rest + '</b></div>' +
      '</div>';
      return h;
    }

    if(target.type === 'flora'){
      /* 3. 自然树木/矿石 */
      var fe = target.entity || target;
      var kindName = fe.kind === 'tree' ? '高大红树' : (fe.kind === 'rock_stone' ? '花岗岩石' : (fe.kind === 'rock_iron' ? '富铁矿脉' : (fe.kind === 'bush_berry' ? '浆果丛' : '野生灌木')));
      var icon = fe.kind === 'tree' ? '🌲' : (fe.kind && fe.kind.startsWith('rock') ? '🪨' : '🌿');
      var hp = Math.round(fe.hp || 0);
      var maxHp = Math.round(fe.maxHp || 30);
      var des = (s.designations && s.designations[fe.id]) ? s.designations[fe.id].type : null;
      var desTxt = des === 'chop' ? '🪓 已标砍伐' : (des === 'mine' ? '⛏ 已标开采' : '未规划');
      var desCol = des ? '#59d9ff' : '#8fa3cc';

      var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
        '<div style="font-size:20px;width:30px;text-align:center">' + icon + '</div>' +
        '<div style="flex:1">' +
          '<div style="color:#c5e3f6;font-weight:700;font-size:12px">' + kindName + '</div>' +
          '<div style="color:' + desCol + ';font-size:10px">' + desTxt + '</div>' +
        '</div>' +
      '</div>';
      h += '<div style="font-size:10px;color:#8fa3cc">耐久度: <b style="color:#7dffab">' + hp + '/' + maxHp + '</b></div>';
      return h;
    }

    if(target.type === 'building'){
      /* 4. 建筑 */
      var be = target.entity || target;
      var bName = (CFG.buildings && CFG.buildings[be.bid||be.id] && CFG.buildings[be.bid||be.id].name) || be.bid || be.id || '建筑';
      var lv = be.lv || 1;
      return '<div style="display:flex;align-items:center;gap:8px">' +
        '<div style="font-size:20px;width:30px;text-align:center">🏛️</div>' +
        '<div style="flex:1">' +
          '<div style="color:#c5e3f6;font-weight:700;font-size:12px">' + bName + ' <span style="color:#ffc857;font-size:10px">Lv.' + lv + '</span></div>' +
          '<div style="color:#7dffab;font-size:10px">运转正常</div>' +
        '</div>' +
      '</div>';
    }

    if(target.type === 'dropped'){
      /* 5. 掉落物 */
      var de = target.entity || target;
      var itName = (CFG.items && CFG.items[de.itemId] && CFG.items[de.itemId].name) || de.itemId;
      return '<div style="display:flex;align-items:center;gap:8px">' +
        '<div style="font-size:20px;width:30px;text-align:center">📦</div>' +
        '<div style="flex:1">' +
          '<div style="color:#c5e3f6;font-weight:700;font-size:12px">' + itName + ' ×' + (de.n||1) + '</div>' +
          '<div style="color:#8fa3cc;font-size:10px">地上物资</div>' +
        '</div>' +
      '</div>';
    }

    /* 6. 地形/地面 */
    var wx = Math.round(target.x || s.px || 0);
    var wy = Math.round(target.y || s.py || 0);
    var temp = (window.APH.Weather && APH.Weather.ambientTemperatureOf) ? Math.round(APH.Weather.ambientTemperatureOf(s.meta, s.clock||0)) : 18;
    return '<div style="display:flex;align-items:center;gap:8px">' +
      '<div style="font-size:20px;width:30px;text-align:center">🌍</div>' +
      '<div style="flex:1">' +
        '<div style="color:#c5e3f6;font-weight:700;font-size:11px">温带平原 (' + wx + ', ' + wy + ')</div>' +
        '<div style="color:#8fa3cc;font-size:10px">气温 ' + temp + '°C · 室外露天</div>' +
      '</div>' +
    '</div>';
  }

  /* ---------- ADR-29 / Ticket #161: 顶部殖民者头像栏 ---------- */
  function colonistBarHtml(residents, s){
    if(!s) s = (window.APH && window.APH.state) || {};
    var m = s.meta || {};
    var list = residents || m.residents || [];
    var curSel = s.selectedTarget || { type: 'player' };
    var curRid = s.selectedRid;
    var h = '';

    /* 1. 指挥官卡片 */
    var isPlayerSel = curSel.type === 'player' && !curRid;
    var pDrafted = !!s.playerDrafted;
    var pHp = Math.max(0, Math.min(100, Math.round(s.hp != null ? s.hp : 100)));
    var pHpCol = pHp > 50 ? '#7dffab' : (pHp > 25 ? '#ffc857' : '#ff4d4d');
    var pCls = 'aph-colonist-card' + (isPlayerSel ? ' selected' : '') + (pDrafted ? ' drafted' : '');
    var pBadge = pDrafted ? '<div class="aph-card-badge" title="已征召战备">⚔</div>' : '';

    h += '<div class="' + pCls + '" data-pawn-id="player" title="指挥官 · 单击选中, 双击镜头聚焦">' +
      pBadge +
      '<div style="font-size:16px;line-height:1">🧑‍🚀</div>' +
      '<div style="font-size:10px;font-weight:700;color:#59d9ff;margin-top:2px">你</div>' +
      '<div class="aph-card-bar"><div class="aph-card-fill" style="width:' + pHp + '%;background:' + pHpCol + '"></div></div>' +
    '</div>';

    /* 2. 居民卡片列表 */
    list.forEach(function(r){
      var ent = (s.entities || []).find(function(e){ return e && (e.rid === r.id || e.id === r.id); });
      var isSel = curRid === r.id || (curSel.type === 'resident' && curSel.entity && (curSel.entity.rid === r.id || curSel.entity.id === r.id));
      var isDrafted = ent && !!ent.drafted;
      var mood = Math.round(r.mood != null ? r.mood : 80);
      var hp = 100 - (r.illness || 0);
      var hpCol = hp > 50 ? '#7dffab' : (hp > 25 ? '#ffc857' : '#ff4d4d');
      var cls = 'aph-colonist-card' + (isSel ? ' selected' : '') + (isDrafted ? ' drafted' : '');
      var badge = isDrafted ? '<div class="aph-card-badge" title="已征召战备">⚔</div>' : '';
      var face = mood >= 70 ? '🙂' : (mood >= 35 ? '😐' : '😞');

      h += '<div class="' + cls + '" data-pawn-id="' + r.id + '" title="' + r.name + ' · 心情 ' + mood + '% · 单击选中, 双击镜头聚焦">' +
        badge +
        '<div style="font-size:16px;line-height:1">' + face + '</div>' +
        '<div style="font-size:10px;font-weight:700;color:#c5e3f6;margin-top:2px">' + (r.name || '居民').slice(0, 3) + '</div>' +
        '<div class="aph-card-bar"><div class="aph-card-fill" style="width:' + Math.max(0, Math.min(100, hp)) + '%;background:' + hpCol + '"></div></div>' +
      '</div>';
    });

    return h;
  }

  function renderAlerts(){
    var bar = $('alertBar');
    if(!bar) return;
    var s = APH.state;
    if(!s || s.scene !== 'home' || s.mode !== 'running' || !APH.Alerts){
      bar.style.display='none';
      bar.innerHTML='';
      return;
    }
    var list = APH.Alerts.collect(s);
    if(!list.length){
      bar.style.display='none';
      bar.innerHTML='';
      return;
    }
    bar.style.display='flex';
    bar.innerHTML='';
    list.forEach(function(a){
      var d=document.createElement('div');
      d.className='aph-alert';
      d.textContent=a.text;
      d.onclick=function(){ APH.Alerts.focus(APH.state, a); };
      bar.appendChild(d);
    });
  }
  function renderColonistBar(){
    var bar = document.getElementById('colonistBar');
    var s = (window.APH && window.APH.state);
    if(bar && s){
      if(s.mode === 'running' && s.scene === 'home'){
        bar.style.display = 'flex';
        bar.innerHTML = colonistBarHtml(null, s);
      } else {
        bar.style.display = 'none';
      }
    }
  }

  return {
    updHUD:updHUD, setHint:setHint, floatText:floatText, showCard:showCard,
    showScanRing:showScanRing, hideScanRing:hideScanRing, setScanProgress:setScanProgress,
    setActBtn:setActBtn, hideIntro:hideIntro, hideOpening:hideOpening,
    showOpening:showOpening, skipOpeningVideo:skipOpeningVideo, renderOpening:renderOpening, showDeath:showDeath, showWin:showWin,
    fatal:fatal, armProbe:armProbe, toggleDiplomacy:toggleDiplomacy,
    registerModal:registerModal, open:open, close:close, toggle:toggle, isOpen:isOpen,
    closeActive:closeActive, hasActiveModal:hasActiveModal, getActiveModal:getActiveModal,
    renderCodex:renderCodex, renderTechMap:renderTechMap, tryBuySelectedTech:tryBuySelectedTech,
    moveTechSel:moveTechSel, bindLLMPanel:bindLLMPanel, refreshLLMStatus:refreshLLMStatus,
    renderDiplomacy:renderDiplomacy, doSendTribute:doSendTribute, doSignTradePact:doSignTradePact, doDeterRival:doDeterRival,
    renderTradePanel:renderTradePanel, doTradeRow:doTradeRow, moveTradeSel:moveTradeSel,
    renderBuildRow:renderBuildRow, renderOrdersRow:renderOrdersRow, renderResPanel:renderResPanel, movePrioCursor:movePrioCursor, setPrioAtCursor:setPrioAtCursor, prioGridHtml:prioGridHtml,
    inspectorHtml:inspectorHtml,
    colonistBarHtml:colonistBarHtml, renderColonistBar:renderColonistBar
  };
})();
