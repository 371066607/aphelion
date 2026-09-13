'use strict';

test('construction: vertical and horizontal wall gaps have a reachable perimeter work cell', () => {
  const APH=window.APH,G=APH.CFG.GRID;
  function rec(id,gx,gy){return APH.Construction.record(id,gx*G,gy*G,0);}
  const scene=APH.TerrainModel.legacy(17,'home');
  [
    {q:rec('bl_wall',12,12),buildings:[rec('bl_wall',12,11),rec('bl_wall',12,13)],from:{x:10.5*G,y:12.5*G}},
    {q:rec('bl_wall',20,20),buildings:[rec('bl_wall',19,20),rec('bl_wall',21,20)],from:{x:20.5*G,y:18.5*G}},
    {q:rec('bl_gate',28,28),buildings:[rec('bl_wall',27,28),rec('bl_wall',29,28)],from:{x:28.5*G,y:26.5*G}}
  ].forEach((fixture,i)=>{
    const s={colony:{scene,buildings:fixture.buildings}};
    const cells=APH.BuildGrid.interactionCells(fixture.q,APH.Colony.list(),{scene});
    if(cells.length<3)throw new Error('fixture '+i+' wall/gate exposed only a directional work cell');
    const spot=APH.Construction.spot(s,fixture.q,fixture.from);
    if(!spot)throw new Error('fixture '+i+' wall/gate gap has no reachable construction spot');
  });
});
