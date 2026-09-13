'use strict';

test('combat: low-health home raider enters retreat cleanup on legacy and modern map bounds', () => {
  const APH=window.APH,T=APH.CFG.entType;
  const prior=APH.state;
  try{
    [2200,128*APH.CFG.GRID].forEach(width=>{
      const enemy={id:'flee_'+width,type:T.ENEMY,x:width-30,y:APH.CFG.HAB.y,
        hp:1,state:'chase',atkCd:1,wanderA:0,dead:false,downed:false,isSoldier:false,
        faction:{id:'fx_test',name:'test',behavior:'melee_swarm',hp:100,dmg:1,speed:50,nightBoost:1,gene:{hue:0}}};
      const s={scene:'home',worldDescriptor:{width,height:width,grid:APH.CFG.GRID},
        px:APH.CFG.HAB.x,py:APH.CFG.HAB.y,noiseT:0,parts:[],entities:[enemy],
        colony:{scene:{width,height:width,grid:APH.CFG.GRID,generation:width>2200?1:0},buildings:[]},
        meta:{weather:{id:'wx_clear'},residents:[],stats:{kills:0}},
        war:{raidActive:true},seed:7,shake:0};
      APH.state=s;
      APH.Combat.updateCombat(.1,false);
      if(!enemy.retreat)throw new Error(width+'px home raider entered flee state without retreat cleanup');
      APH.Combat.updateCombat(.1,false);
      if(!enemy.dead)throw new Error(width+'px home raider was not removed past fleeDespawnR');
    });
  }finally{APH.state=prior;}
});
