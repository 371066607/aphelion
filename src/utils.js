/* ============================================================
   Aphelion · utils.js — 工具 / 事件总线(ADR-8) / 双RNG(ADR-5)
   挂载: window.APH.U
   ============================================================ */
window.APH = window.APH || {};

APH.U = (function(){
  'use strict';
  var TAU = Math.PI * 2;

  /* ---------- 基础数学 ---------- */
  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function lerp(a,b,t){ return a+(b-a)*t; }
  function rr(a,b){ return a+Math.random()*(b-a); }        // 表现层随机
  function ri(a,b){ return Math.floor(rr(a,b+1)); }
  function dst(ax,ay,bx,by){ var dx=ax-bx, dy=ay-by; return Math.sqrt(dx*dx+dy*dy); }
  function smooth(a,b,x){ x=clamp((x-a)/(b-a),0,1); return x*x*(3-2*x); }

  /* ---------- Seeded RNG (ADR-5: 世界生成/掉落判定专用) ----------
     mulberry32：确定性、快、统计够用。同 seed 同序列。 */
  function makeRng(seed){
    var a = seed >>> 0;
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash2(x,y){ var h=Math.sin(x*127.1+y*311.7)*43758.5453; return h-Math.floor(h); }
  function vnoise(x,y){
    var xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
    var u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
    return lerp(lerp(hash2(xi,yi),hash2(xi+1,yi),u),
                lerp(hash2(xi,yi+1),hash2(xi+1,yi+1),u), v);
  }

  /* ---------- 事件总线 (ADR-8) ----------
     on(evt,fn) 订阅 · off 反订阅 · emit 发布。
     系统解耦的唯一通道：combat→loot/UI/音效/存档 不互相 import。 */
  var listeners = {};
  function on(evt, fn){
    (listeners[evt] = listeners[evt] || []).push(fn);
    return fn;                       // 返回 fn 方便 off
  }
  function off(evt, fn){
    var arr = listeners[evt];
    if(!arr) return;
    var i = arr.indexOf(fn);
    if(i >= 0) arr.splice(i,1);
  }
  function emit(evt, payload){
    var arr = listeners[evt];
    if(!arr) return;
    for(var i=0;i<arr.length;i++){
      try{ arr[i](payload); }
      catch(e){ console.error('[bus]', evt, e); }   // 单个监听者出错不拖垮其他
    }
  }

  /* ---------- 极简断言（测试与运行时共用） ---------- */
  function assert(cond, msg){
    if(!cond) throw new Error('ASSERT: ' + msg);
  }

  return {
    TAU:TAU, clamp:clamp, lerp:lerp, rr:rr, ri:ri,
    dst:dst, smooth:smooth,
    makeRng:makeRng, hash2:hash2, vnoise:vnoise,
    on:on, off:off, emit:emit,
    assert:assert,
  };
})();
