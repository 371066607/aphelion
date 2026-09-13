/* Transient spatial candidate index. It never owns or serializes entities. */
window.APH=window.APH||{};

APH.EntityIndex=(function(){
  'use strict';
  var CFG=APH.CFG||{},T=CFG.entType||{};
  var CELL=CFG.entityIndex.cellPixels, indexCache=new WeakMap();
  function key(x,y){return x+','+y;}
  function isStatic(e){
    return !!e&&(e.type===T.FLORA||e.type===T.ROCK||e.type===T.CRYSTAL||
      e.type===T.BEACON||e.type===T.BUILDING);
  }
  function signature(list){
    var out=[list.length];
    for(var i=0;i<list.length;i++){
      var e=list[i];
      if(!e){out.push(e);continue;}
      /* Dynamic positions intentionally stay out of the signature, but their
         identities do not: a same-length restore must not retain old objects. */
      if(!isStatic(e)){out.push(e,e.type);continue;}
      /* Object identity makes a restored same-UID object a rebuild, and x/y/dead
         make in-place movement/destruction safe on a reused entities array. */
      out.push(e,e.x,e.y,e.type,e.dead?1:0);
    }
    return out;
  }
  function same(a,b){
    if(!a||!b||a.length!==b.length)return false;
    for(var i=0;i<a.length;i++)if(a[i]!==b[i])return false;
    return true;
  }
  function prepare(list){
    list=Array.isArray(list)?list:[];
    var sig=signature(list);
    var cached=indexCache.get(list);
    if(cached&&same(cached.sig,sig))return cached;
    var buckets={},dynamic=[];
    list.forEach(function(e){
      if(!e)return;
      if(!isStatic(e)){dynamic.push(e);return;}
      var x=Math.floor((Number(e.x)||0)/CELL),y=Math.floor((Number(e.y)||0)/CELL),k=key(x,y);
      (buckets[k]||(buckets[k]=[])).push(e);
    });
    cached={list:list,length:list.length,sig:sig,buckets:buckets,dynamic:dynamic};
    indexCache.set(list,cached);return cached;
  }
  function indexFor(list){return Array.isArray(list)?indexCache.get(list):null;}
  function ready(list){var cached=indexFor(list);return !!(cached&&cached.length===list.length);}
  function invalidate(list){
    if(Array.isArray(list))indexCache.delete(list);
    else indexCache=new WeakMap();
  }
  function candidates(index,left,top,right,bottom){
    var out=index.dynamic.slice();
    var x0=Math.floor(left/CELL),x1=Math.floor(right/CELL),y0=Math.floor(top/CELL),y1=Math.floor(bottom/CELL);
    /* A static entity belongs to exactly one bucket, so no de-dup scan. */
    for(var x=x0;x<=x1;x++)for(var y=y0;y<=y1;y++)(index.buckets[key(x,y)]||[]).forEach(function(e){out.push(e);});
    return out;
  }
  function queryRect(list,left,top,right,bottom){
    if(!ready(list))return null;
    return candidates(indexFor(list),left,top,right,bottom).filter(function(e){
      return e&&e.x>=left&&e.x<=right&&e.y>=top&&e.y<=bottom;
    });
  }
  function queryCircle(list,x,y,r,type,predicate){
    if(!ready(list))return null;
    var rr=r==null||r<=0?Infinity:r;
    /* An unbounded nearest query has no useful spatial window.  Returning null
       deliberately selects Ent's canonical linear fallback instead of trying to
       enumerate an infinite grid. */
    if(!isFinite(rr))return null;
    var near=candidates(indexFor(list),x-rr,y-rr,x+rr,y+rr);
    return near.filter(function(e){
      if(!e||e.dead||(type&&e.type!==type))return false;
      var dx=e.x-x,dy=e.y-y,d=Math.sqrt(dx*dx+dy*dy);
      return d<rr&&(!predicate||predicate(e,d));
    });
  }
  function stats(list){var cached=indexFor(list);return {ready:!!cached,staticBuckets:cached?Object.keys(cached.buckets).length:0,dynamic:cached?cached.dynamic.length:0,cell:CELL};}
  return {prepare:prepare,invalidate:invalidate,ready:ready,queryRect:queryRect,queryCircle:queryCircle,stats:stats};
})();
