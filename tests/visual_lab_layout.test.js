'use strict';

function visualLabLayoutFixture(){
  const fs=require('fs'),path=require('path'),a=window.APH;
  const source=fs.readFileSync(path.join(__dirname,'visual_lab.html'),'utf8');
  const helpers=source.slice(source.indexOf('function roomItems('),source.indexOf('// Staged commands'));
  const roomItems=new Function(helpers+'return roomItems;')();
  // Flat empty terrain isolates furniture geometry from new-game resource placement.
  const s={entities:[],meta:{tech:{}},colony:{scene:{width:24*48,height:20*48,grid:48},buildings:[],buildQueue:[]}};
  const origins=[[6,6],[12,6]];
  const groups=origins.map(([ox,oy],i)=>roomItems(ox,oy,true,i===1));
  for(const [i,items] of groups.entries()){
    for(const [id,x,y,rotation] of items){
      const ghost=a.Construction.ghost(s,id,x,y,rotation);
      if(!ghost.ok)throw Error('illegal lab placement '+JSON.stringify({id,x,y,rotation,why:ghost.why}));
      const record=a.Construction.record(id,x,y,rotation);
      record.uid='lab_'+s.colony.buildings.length;record.roomIndex=i;
      s.colony.buildings.push(record);
    }
  }
  return {a,s,groups,origins};
}

test('visual lab: 72 legal components preserve 5x6 / 6x6 rooms and bed rotations 0/1/2',()=>{
  const {a,s,groups}=visualLabLayoutFixture(),buildings=s.colony.buildings;
  if(buildings.length!==72||groups[0].length!==33||groups[1].length!==39)
    throw Error('room component counts changed: '+JSON.stringify(groups.map(g=>g.length)));
  const rotations=buildings.filter(b=>b.id==='bl_bed').map(b=>b.rotation).sort().join(',');
  if(rotations!=='0,1,2')throw Error('three bed orientations changed: '+rotations);
  const physical=a.BuildGrid.index(buildings,a.Colony.list(),s.colony.scene).physical;
  if(Object.values(physical).some(records=>records.length!==1))throw Error('physical footprints overlap');
  const sizes=a.Nav.roomsOf(buildings,s.colony.scene).map(r=>[r.maxX-r.minX+3,r.maxY-r.minY+3]).sort((a,b)=>a[0]-b[0]);
  if(JSON.stringify(sizes)!=='[[5,6],[6,6]]')throw Error('room envelopes changed: '+JSON.stringify(sizes));
});

test('visual lab: all six completed furniture work cells are reachable from outside their gates',()=>{
  const {a,s,origins}=visualLabLayoutFixture(),buildings=s.colony.buildings;
  const furniture=buildings.filter(b=>b.layer==='furniture');
  if(furniture.length!==6)throw Error('expected six furniture records');
  const nav=a.Nav.gridOf(buildings,s.colony.scene),failures=[];
  for(const b of furniture){
    const [ox,oy]=origins[b.roomIndex],from={x:(ox+2.5)*48,y:(oy+6.5)*48};
    const spot=a.Construction.spot(s,b,from);
    const route=spot&&a.Nav.astar(nav,from,spot,null,s.colony.scene);
    if(!spot||!route||!route.length||nav[Math.floor(spot.y/48)][Math.floor(spot.x/48)]!==0){
      failures.push({id:b.id,gx:b.gx,gy:b.gy,rotation:b.rotation,
        workCells:a.BuildGrid.interactionCells(b,a.Colony.list(),{scene:s.colony.scene})});
    }
  }
  if(failures.length)throw Error('unreachable completed furniture: '+JSON.stringify(failures));
});
