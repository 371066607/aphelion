/* ============================================================
   Aphelion · sfx.js — 合成音效 (Phase 5)
   挂载: window.APH.SFX
   零素材: 全部 WebAudio 振荡器合成。
   通过事件总线(ADR-8)自动接线, 无 AudioContext 时静默降级。
   M 键静音切换(main.js)。
   ============================================================ */
window.APH = window.APH || {};

APH.SFX = (function(){
  'use strict';
  var ctx=null, muted=false;

  function ensure(){
    if(ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return false;
    try{ ctx = new AC(); }catch(e){ return false; }
    return true;
  }
  /* 浏览器自动播放策略: 首次用户手势时 resume */
  function unlock(){ if(ensure() && ctx.state==='suspended') ctx.resume(); }

  function tone(opt){
    if(muted || !ensure()) return;
    try{
      var t=ctx.currentTime+(opt.delay||0);
      var o=ctx.createOscillator(), g=ctx.createGain();
      o.type=opt.type||'square';
      o.frequency.setValueAtTime(opt.f0||440,t);
      if(opt.f1) o.frequency.exponentialRampToValueAtTime(Math.max(1,opt.f1),t+(opt.dur||.1));
      g.gain.setValueAtTime(opt.vol||.08,t);
      g.gain.exponentialRampToValueAtTime(.0008,t+(opt.dur||.1));
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t+(opt.dur||.1)+.02);
    }catch(e){}
  }
  function noise(dur,vol,f){
    if(muted || !ensure()) return;
    try{
      var n=ctx.sampleRate*dur, buf=ctx.createBuffer(1,n,ctx.sampleRate);
      var d=buf.getChannelData(0);
      for(var i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
      var src=ctx.createBufferSource(); src.buffer=buf;
      var flt=ctx.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value=f||900;
      var g=ctx.createGain(); g.gain.value=vol||.12;
      src.connect(flt); flt.connect(g); g.connect(ctx.destination);
      src.start();
    }catch(e){}
  }

  /* ---------- 音效定义 ---------- */
  var LIB={
    playerFired:  function(){ tone({type:'square',f0:880,f1:220,dur:.09,vol:.05});
                             noise(.04,.03,2400); },
    enemyHit:     function(){ tone({type:'triangle',f0:300,f1:120,dur:.07,vol:.06}); },
    enemyKilled:  function(){ noise(.18,.14,700);
                              tone({type:'sawtooth',f0:160,f1:40,dur:.22,vol:.08}); },
    lootPicked:   function(){ tone({type:'sine',f0:660,dur:.07,vol:.06});
                              tone({type:'sine',f0:990,dur:.09,vol:.05,delay:.06}); },
    beaconScan:   function(){ tone({type:'sine',f0:520,dur:.12,vol:.05});
                              tone({type:'sine',f0:780,dur:.12,vol:.05,delay:.11});
                              tone({type:'sine',f0:1040,dur:.2,vol:.06,delay:.22}); },
    playerHurt:   function(){ tone({type:'sawtooth',f0:200,f1:70,dur:.16,vol:.1});
                              noise(.1,.08,500); },
    built:        function(){ tone({type:'square',f0:392,dur:.08,vol:.06});
                              tone({type:'square',f0:523,dur:.1,vol:.06,delay:.08}); },
    techDone:     function(){ [523,659,784].forEach(function(f,i){
                                tone({type:'sine',f0:f,dur:.12,vol:.06,delay:i*.09}); }); },
    raidWarn:     function(){ tone({type:'square',f0:440,dur:.15,vol:.09});
                              tone({type:'square',f0:440,dur:.15,vol:.09,delay:.25}); },
    raidStarted:  function(){ tone({type:'sawtooth',f0:110,f1:55,dur:.6,vol:.12}); },
    raidDefended: function(){ [392,494,587,784].forEach(function(f,i){
                                tone({type:'triangle',f0:f,dur:.16,vol:.07,delay:i*.11}); }); },
    raidSuccess:  function(){ noise(.3,.16,600);
                              [330,392,523,659].forEach(function(f,i){
                                tone({type:'square',f0:f,dur:.14,vol:.07,delay:i*.1}); }); },
    died:         function(){ tone({type:'sawtooth',f0:220,f1:30,dur:.9,vol:.12}); },
    launched:     function(){ tone({type:'sawtooth',f0:80,f1:400,dur:.5,vol:.08}); },
    openingAlarm: function(){ tone({type:'square',f0:392,dur:.12,vol:.05});
                              tone({type:'sawtooth',f0:90,f1:48,dur:.28,vol:.06,delay:.04});
                              noise(.08,.04,380); },
  };

  /* 接线事件总线 */
  function bindBus(){
    var U=APH.U; if(!U||!U.on) return;
    Object.keys(LIB).forEach(function(ev){
      U.on(ev, function(){ LIB[ev](); });
    });
    /* 死亡走 playerHurt 之外单独事件 */
    U.on('gameOver', function(){ LIB.died(); });
  }
  function toggleMute(){
    muted=!muted;
    /* T7: 持久化到 meta(经 Save), 失败静默 */
    try{
      var m=APH.state&&APH.state.meta;
      if(m){ m.sfxMuted=muted; APH.Save.saveMeta(m); }
    }catch(e){}
    return muted;
  }
  function restore(meta){
    if(meta && meta.sfxMuted===true) muted=true;
  }
  function isMuted(){ return muted; }

  return { unlock:unlock, bindBus:bindBus, toggleMute:toggleMute, restore:restore,
           isMuted:isMuted, play:function(n){ if(LIB[n]) LIB[n](); } };
})();
