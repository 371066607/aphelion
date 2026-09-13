'use strict';

if(!window.APH.Storage){
  const fs=require('fs'),path=require('path');
  new Function(fs.readFileSync(path.join(__dirname,'..','src','storage.js'),'utf8'))();
}

const Storage=APH.Storage,L=APH.Logistics,T=APH.CFG.entType;

function state(buildings,zones){
  return {scene:'home',colony:{rulesVersion:1,buildings:buildings||[],zones:zones||[],
    scene:APH.TerrainModel.home(31),logistics:{v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]}},
    meta:{res:{food:7,leather:5,wood:4},research:0},entities:[]};
}

test('physical storage: geometry1 容器目的地是合法互动格并保留温度坐标',()=>{
  const shelf=APH.Construction.record('bl_storage_shelf',960,960,0);shelf.uid='shelf_1';shelf.filter='food';
  const s=state([shelf]),d=Storage.destination(s,'it_berry',{x:840,y:960});
  if(!d||d.containerId!=='shelf_1')throw new Error('未选中兼容货架: '+JSON.stringify(d));
  if(d.x===shelf.x&&d.y===shelf.y)throw new Error('现代实体容器不得把取料点放在实体占格中心');
  if(d.storageX!==shelf.x||d.storageY!==shelf.y)throw new Error('温度判定必须保留容器自身坐标');
});

test('physical storage: 精确物品实体是唯一库存且不修改 meta.res',()=>{
  const shelf={id:'bl_storage_shelf',uid:'food_shelf',x:500,y:500,filter:'food'};
  const s=state([shelf]),before=JSON.stringify(s.meta.res);
  const d=Storage.destination(s,'it_berry',{x:480,y:500});
  const a=Storage.deposit(s,'it_berry',2,d),b=Storage.deposit(s,'it_crystal_berry',1,d);
  if(!a.ok||!b.ok||s.entities.length!==2)throw new Error('不同精确食材不得折叠或互相合并');
  if(JSON.stringify(s.meta.res)!==before)throw new Error('实体入库不得再镜像进数字库存');
  if(s.entities.some(e=>!e.containerId)||s.entities.reduce((n,e)=>n+e.n,0)!==3)throw new Error('容器所有权或数量错误');
  const merged=Storage.deposit(s,'it_berry',3,d);
  if(!merged.merged||s.entities.length!==2||a.entity.n!==5)throw new Error('同容器同物品应合并为单一实体堆');
});

test('physical storage: 不同 owner 的同物品不得误合并',()=>{
  const a={id:'bl_storage_shelf',uid:'a',x:400,y:400,filter:'food'};
  const b={id:'bl_storage_shelf',uid:'b',x:700,y:400,filter:'food'};
  const s=state([a,b]);
  Storage.deposit(s,'it_berry',2,{x:400,y:400,containerId:'a',storageX:400,storageY:400});
  Storage.deposit(s,'it_berry',3,{x:700,y:400,containerId:'b',storageX:700,storageY:400});
  if(s.entities.length!==2||s.entities[0].containerId===s.entities[1].containerId)throw new Error('不同容器所有权被错误合并');
});

test('physical storage: 容器拆除、过滤变化和仓储区删格只释放所有权不改数量',()=>{
  const shelf={id:'bl_storage_shelf',uid:'shelf',x:500,y:500,filter:'food'};
  const removedShelf={id:'bl_storage_shelf',uid:'removed',x:620,y:500,filter:'materials'};
  const zone={id:'zone_a',type:'stockpile',filter:'materials',forbid:[],cells:[{x:720,y:720}]};
  const s=state([shelf,removedShelf],[zone]);
  const food=Storage.deposit(s,'it_berry',4,{x:500,y:500,containerId:'shelf',storageX:500,storageY:500}).entity;
  const stone=Storage.deposit(s,'it_stone',3,{x:620,y:500,containerId:'removed',storageX:620,storageY:500}).entity;
  const wood=Storage.deposit(s,'it_wood',6,{x:720,y:720,containerId:'zone_a',storageX:720,storageY:720}).entity;
  const total=food.n+stone.n+wood.n;
  shelf.filter='materials';s.colony.buildings=[shelf];zone.cells=[];
  const out=Storage.prepare(s);
  if(out.released.length!==3||food.containerId||stone.containerId||wood.containerId)throw new Error('失效容器应把实体释放到地面');
  if(food.n+stone.n+wood.n!==total||s.meta.res.food!==7||s.meta.res.wood!==4)throw new Error('释放容器不得增减或镜像物资');
  if(food.x!==500||stone.x!==620||wood.x!==720)throw new Error('释放后应留在原合法取料点');
});

test('physical storage: 重复 prepare 不抹除合法已入库实体',()=>{
  const shelf={id:'bl_storage_shelf',uid:'shelf',x:500,y:500,filter:'food'};
  const s=state([shelf]),e=Storage.deposit(s,'it_berry',2,{x:500,y:500,containerId:'shelf',storageX:500,storageY:500}).entity;
  Storage.prepare(s);Storage.prepare(s);
  if(e.containerId!=='shelf'||e.n!==2||!Storage.isStored(e,s))throw new Error('合法库存不应被重复搬运或丢失所有权');
});

test('physical storage: Logistics 锁定同一库存实体，追加合并后取料仍守恒',()=>{
  const shelf={id:'bl_storage_shelf',uid:'shelf',x:0,y:0,filter:'food'};
  const s=state([shelf]),d={x:0,y:0,containerId:'shelf',storageX:0,storageY:0};
  const pile=Storage.deposit(s,'it_berry',2,d).entity;
  const task=L.ensureTask(s.colony,{kind:'production',targetId:'k',x:100,y:0,need:{it_berry:1}});
  const reserved=L.reserveForTask(s.colony,s.meta.res,s.entities,task,'r1',{from:{x:0,y:0},stockSpot:{x:900,y:900}}).reservation;
  if(!reserved||reserved.source.id!==pile.id)throw new Error('物流必须锁定精确实体来源');
  Storage.deposit(s,'it_berry',1,d);
  const picked=L.pickup(s.colony,s.meta.res,s.entities,reserved.id,'r1',{x:0,y:0});
  if(!picked.ok||pile.n!==2||reserved.cargo.itemId!=='it_berry')throw new Error('合并与取料后精确实体数量不守恒');
  const copy=JSON.parse(JSON.stringify(s));
  if(copy.entities[0].containerId!=='shelf'||copy.colony.logistics.reservations[0].cargo.itemId!=='it_berry')
    throw new Error('JSON 存读不得丢容器所有权或在途货物类型');
});

test('physical storage: 无容器回落迫降舱实体，legacy 才写数字库存',()=>{
  const s=state([]),before=s.meta.res.food,d=Storage.destination(s,'it_berry',{x:0,y:0});
  if(!d||d.containerId!=='landing_cargo'||d.x!==APH.CFG.HAB.x||d.y!==APH.CFG.HAB.y+140)
    throw new Error('现代无容器时应回落迫降舱实体点');
  Storage.deposit(s,'it_berry',2,d);
  if(s.meta.res.food!==before||s.entities[0].itemId!=='it_berry')throw new Error('现代回落不得折叠食材类型');
  const legacy=state([]);legacy.colony.rulesVersion=0;
  const out=Storage.deposit(legacy,'it_berry',2,d);
  if(!out.legacy||legacy.meta.res.food!==9||legacy.entities.length)throw new Error('仅老档沿用 collectHome 数字库存');
});

test('physical storage: 现代几何容器没有合法互动格时 destination 返回 null',()=>{
  const shelf={id:'bl_storage_shelf',uid:'shelf',x:500,y:500,filter:'food',geometryVersion:1};
  const s=state([shelf]),original=APH.Construction.spot;
  try{
    APH.Construction.spot=()=>null;
    if(Storage.destination(s,'it_berry',{x:400,y:400})!==null)throw new Error('无路可达时不得生成穿墙入库点');
  }finally{APH.Construction.spot=original;}
});
