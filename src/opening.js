/* ============================================================
   Aphelion · opening.js — 开场短片时钟 (APH.Opening seam 1)
   挂载: window.APH.Opening
   纯函数: 静帧时钟 / shouldPlay / skip / markPlayed。零 DOM。
   ============================================================ */
window.APH = window.APH || {};

APH.Opening = (function(){
  'use strict';

  function cfg(){ return (APH.CFG && APH.CFG.opening) || {}; }

  function defaults(existed){
    return { played: !!existed };
  }

  function isPlayed(opening){
    return !!(opening && (opening.played || opening.seen));
  }
  function shouldPlay(opening, flags){
    flags = flags || {};
    if(flags.autostart) return false;
    if(isPlayed(opening)) return false;
    return true;
  }

  function createClock(){
    return { t: 0, shot: 0, skipped: false };
  }

  function tick(clock, dt){
    var c = cfg();
    var ends = c.shotEnds || [];
    var last = c.lastIndex != null ? c.lastIndex : Math.max(0, ends.length - 1);
    var cap = ends[last] != null ? ends[last] : 0;
    clock.t = Math.min((clock.t || 0) + (dt || 0), cap);
    clock.shot = last;
    var i;
    for(i = 0; i <= last; i++){
      if(clock.t < (ends[i] != null ? ends[i] : cap)){
        clock.shot = i;
        break;
      }
    }
    return clock;
  }

  function skipToLast(clock){
    var c = cfg();
    var ends = c.shotEnds || [];
    var last = c.lastIndex != null ? c.lastIndex : Math.max(0, ends.length - 1);
    clock.skipped = true;
    clock.shot = last;
    clock.t = (last > 0 && ends[last - 1] != null) ? ends[last - 1] : 0;
    return clock;
  }

  function isLast(clock){
    var c = cfg();
    var last = c.lastIndex != null ? c.lastIndex : 0;
    return !!(clock && clock.shot === last);
  }

  function captionOf(clock){
    var caps = cfg().captions || [];
    var i = clock && clock.shot != null ? clock.shot : 0;
    return caps[i] != null ? caps[i] : '';
  }
  function audioOf(clock){
    var i = clock && clock.shot != null ? clock.shot : 0;
    var until = cfg().alarmUntil != null ? cfg().alarmUntil : 3;
    return i < until ? 'alarm' : 'silence';
  }

  function assetOf(clock){
    var assets = cfg().assets || [];
    var i = clock && clock.shot != null ? clock.shot : 0;
    return assets[i] || '';
  }

  function markPlayed(opening){
    opening = opening || {};
    opening.played = true;
    return opening;
  }

  return {
    defaults: defaults,
    shouldPlay: shouldPlay,
    createClock: createClock,
    tick: tick,
    skipToLast: skipToLast,
    isLast: isLast,
    captionOf: captionOf,
    audioOf: audioOf,
    assetOf: assetOf,
    isPlayed: isPlayed,
    markPlayed: markPlayed,
  };
})();
