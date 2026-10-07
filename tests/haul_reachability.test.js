'use strict';

function haulReachabilityFixture(){
  const a=window.APH,G=a.CFG.GRID;
  const wall=a.Construction.record('bl_wall',12*G,12*G,0);
  const from={x:10.5*G,y:12.5*G};
  const blocked={id:'haul_blocked',type:a.CFG.entType.DROPPED,itemId:'it_food',n:3,x:wall.x,y:wall.y};
  const reachable={id:'haul_reachable',type:a.CFG.entType.DROPPED,itemId:'it_stone',n:2,x:13.5*G,y:14.5*G};
  const s={scene:'home',mode:'running',clock:0,parts:[],entities:[blocked,reachable],
    war:{raidActive:false},designations:{},selectedRid:null,selectedPawns:[],meta:a.Save.loadMeta(),
    colony:{rulesVersion:1,scene:a.TerrainModel.legacy(17,'home'),buildings:[wall],buildQueue:[]}};
  return {a,s,from,wall,blocked,reachable};
}

test('haul reachability: modern nearest pile skips a wall cell and keeps the original pile',()=>{
  const old=window.APH.state,{a,s,from,blocked,reachable}=haulReachabilityFixture();
  try{
    a.state=s;
    const grid=a.Nav.gridOf(s.colony.buildings,s.colony.scene);
    if(a.Nav.astar(grid,from,blocked)||!a.Nav.astar(grid,from,reachable))throw Error('fixture must contain blocked and reachable destinations');
    if(a.ResidentWork.nearestDrop(from,1200)!==reachable)throw Error('unreachable nearby food must not hide reachable stone');
    if(blocked.dead||blocked.n!==3||s.entities[0]!==blocked)throw Error('unreachable pile ownership must remain unchanged');
    s.colony.buildings=[];
    if(a.ResidentWork.nearestDrop(from,1200)!==blocked)throw Error('removing the wall must make the original nearest pile eligible again');
  }finally{a.state=old;}
});

test('haul reachability: no reachable pile lets a modern resident gather designated stone',()=>{
  const old=window.APH.state,{a,s,from,blocked}=haulReachabilityFixture();
  try{
    a.state=s;s.entities=[blocked];
    const r=a.Res.generate('rs_haul_reachability',33,[]);
    r.job=null;r.food=100;r.rest=100;r.recreation=100;r.schedule=new Array(24).fill('work');
    s.meta.residents=[r];s.meta.workPrio={[r.id]:{sk_build:0,sk_haul:2,sk_gather:2}};
    const rock={id:'haul_stone_rock',type:a.CFG.entType.FLORA,kind:'rock_stone',x:from.x,y:from.y+24,hp:100,maxHp:100};
    s.entities.push(rock);s.designations[rock.id]={type:'mine',entityId:rock.id};
    a.ResidentWork.syncResidentEntities();
    const e=s.entities.find(en=>en.rid===r.id);e.x=from.x;e.y=from.y;
    a.ResidentWork.update(s,.05);
    if(e.gatherTarget!==rock||!e.gathering||rock.hp>=100)throw Error('blocked food must not permanently preempt actual stone gathering');
    if(blocked.dead||blocked.n!==3||e.haulCarry)throw Error('gather fallback must not consume blocked food');
  }finally{a.state=old;}
});

test('haul reachability: a wall-edge pile already in grab range remains directly pickable',()=>{
  const old=window.APH.state,{a,s,wall,blocked}=haulReachabilityFixture();
  try{
    a.state=s;
    blocked.x=wall.gx*a.CFG.GRID+1;
    const from={x:blocked.x-a.CFG.haul.grabR,y:blocked.y};
    if(a.Nav.astar(a.Nav.gridOf(s.colony.buildings,s.colony.scene),from,blocked))throw Error('edge fixture must still have a blocked destination cell');
    if(a.ResidentWork.nearestDrop(from,1200)!==blocked)throw Error('direct pickup within grab range needs no path into the wall');
  }finally{a.state=old;}
});

test('haul reachability: legacy and missing Nav keep nearest-pile compatibility',()=>{
  const old=window.APH.state,{a,s,from,blocked}=haulReachabilityFixture(),nav=window.APH.Nav;
  try{
    a.state=s;s.colony.rulesVersion=0;
    if(a.ResidentWork.nearestDrop(from,1200)!==blocked)throw Error('legacy nearest selection must remain unchanged');
    s.colony.rulesVersion=1;a.Nav=null;
    if(a.ResidentWork.nearestDrop(from,1200)!==blocked)throw Error('logic environments without navigation retain nearest selection');
  }finally{a.state=old;a.Nav=nav;}
});

test('haul reachability: existing reservation, storage, predicate and strict radius filters still apply',()=>{
  const old=window.APH.state,{a,s,from,blocked,reachable}=haulReachabilityFixture();
  try{
    a.state=s;
    const reserved=Object.assign({},reachable,{id:'haul_reserved',x:from.x+24,y:from.y});
    const stored=Object.assign({},reachable,{id:'haul_stored',x:from.x+30,y:from.y,containerId:'landing_cargo'});
    const ignored=Object.assign({},reachable,{id:'haul_predicate',itemId:'it_wood',x:from.x+35,y:from.y});
    const dead=Object.assign({},reachable,{id:'haul_dead',dead:true,x:from.x+40,y:from.y});
    s.entities=[reserved,stored,ignored,dead,blocked,reachable];
    const task=a.Logistics.ensureTask(s.colony,{kind:'construction',targetId:'haul_filter_task',x:from.x,y:from.y,need:{stone:reserved.n}});
    const rr=a.Logistics.reserveForTask(s.colony,{},[reserved],task,'reservation_worker',{from});
    if(!rr.ok||a.ResidentWork.freeDropCount(s,reserved)!==0||!a.Storage.isStored(stored,s))throw Error('reservation/storage fixtures are invalid');
    const pred=e=>e.itemId==='it_stone';
    if(a.ResidentWork.nearestDrop(from,1200,pred)!==reachable)throw Error('reachability must preserve other eligibility filters');
    const radius=a.U.dst(from.x,from.y,reachable.x,reachable.y);
    if(a.ResidentWork.nearestDrop(from,radius,pred)!==null)throw Error('pile exactly on search radius remains excluded');
  }finally{a.state=old;}
});

test('haul reachability: path search stops at nearest reachable pile and empty searches build no grid',()=>{
  const old=window.APH.state,{a,s,from,reachable}=haulReachabilityFixture();
  const gridOf=a.Nav.gridOf,astar=a.Nav.astar;let grids=0,paths=[];
  try{
    a.state=s;
    s.entities.push(Object.assign({},reachable,{id:'haul_farther',x:from.x+400,y:from.y}));
    a.Nav.gridOf=function(){grids++;return gridOf.apply(this,arguments);};
    a.Nav.astar=function(grid,start,to){paths.push(to.id);return astar.apply(this,arguments);};
    if(a.ResidentWork.nearestDrop(from,1200)!==reachable)throw Error('nearest reachable pile should win');
    if(grids!==1||paths.join(',')!=='haul_blocked,haul_reachable')throw Error('search must reuse one grid and stop before farther piles: '+JSON.stringify({grids,paths}));
    s.entities=[];grids=0;paths=[];
    if(a.ResidentWork.nearestDrop(from,1200)!==null||grids||paths.length)throw Error('empty candidates need no navigation grid or paths');
  }finally{a.state=old;a.Nav.gridOf=gridOf;a.Nav.astar=astar;}
});
