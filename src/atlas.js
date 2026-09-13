/* ============================================================
   Aphelion · atlas.js — 已观测星球索引
   纯数据层：PlanetSpec 本体仍存 planet_<id>，Atlas 只保存身份与展示摘要。
   ============================================================ */
window.APH = window.APH || {};

APH.Atlas = (function(){
  'use strict';

  var VERSION=1;
  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function blank(){return {v:VERSION,order:[],planets:{}};}
  function validSeed(value){return typeof value==='number'&&isFinite(value)&&value>=0&&value<=0xffffffff&&Math.floor(value)===value;}
  function isFuture(meta){var atlas=meta&&meta.atlas;return !!(atlas&&typeof atlas.v==='number'&&atlas.v>VERSION);}
  function normalize(raw){
    var out=blank(),source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:null;
    if(!source)return out;
    if(typeof source.v==='number'&&source.v>=1&&Math.floor(source.v)===source.v)out.v=source.v;
    var planets=source.planets&&typeof source.planets==='object'&&!Array.isArray(source.planets)?source.planets:{};
    Object.keys(planets).forEach(function(id){
      var entry=planets[id];
      if(!entry||typeof entry!=='object'||entry.planetId!==id||!validSeed(entry.seed))return;
      out.planets[id]=clone(entry);
    });
    (Array.isArray(source.order)?source.order:[]).forEach(function(id){
      if(out.planets[id]&&out.order.indexOf(id)<0)out.order.push(id);
    });
    Object.keys(out.planets).sort().forEach(function(id){if(out.order.indexOf(id)<0)out.order.push(id);});
    return out;
  }
  function snapshot(meta){return normalize(meta&&meta.atlas);}
  function ensure(meta){
    if(!meta||typeof meta!=='object')return blank();
    if(isFuture(meta)){meta.atlas=clone(meta.atlas);return meta.atlas;}
    meta.atlas=normalize(meta.atlas);
    return meta.atlas;
  }
  function record(meta,spec,discoveredAt){
    if(!meta||!spec||typeof spec.id!=='string'||!spec.id||!validSeed(spec.seed))
      return {ok:false,why:'invalid-planet'};
    if(isFuture(meta))return {ok:false,why:'future-atlas'};
    var atlas=ensure(meta),prior=atlas.planets[spec.id],biomeId=spec.biome&&spec.biome.id;
    var at=Number(discoveredAt);
    if(!isFinite(at)||at<0)at=prior&&prior.discoveredAt!=null?prior.discoveredAt:0;
    var entry=clone(prior)||{};
    entry.planetId=spec.id;entry.seed=spec.seed>>>0;entry.name=spec.name||spec.id;
    entry.paletteName=spec.paletteName||'';entry.biomeId=biomeId||'';entry.discoveredAt=at;
    entry.visits=prior&&Math.max(0,Math.floor(Number(prior.visits)||0))||0;
    atlas.planets[spec.id]=entry;
    if(atlas.order.indexOf(spec.id)<0)atlas.order.push(spec.id);
    return {ok:true,entry:clone(entry),atlas:atlas};
  }
  function find(meta,planetId){var atlas=snapshot(meta);return atlas.planets[planetId]?clone(atlas.planets[planetId]):null;}
  function list(meta){var atlas=snapshot(meta);return atlas.order.map(function(id){return clone(atlas.planets[id]);}).filter(Boolean);}
  function has(meta,planetId){return !!find(meta,planetId);}

  return {VERSION:VERSION,blank:blank,normalize:normalize,snapshot:snapshot,ensure:ensure,isFuture:isFuture,record:record,
    find:find,list:list,has:has};
})();
