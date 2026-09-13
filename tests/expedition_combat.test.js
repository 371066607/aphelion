const assert=require('assert');

function expeditionState(resident,entities){
  const run={status:'active',id:'ex_1',memberIds:['r1'],supply:{food:0},cargo:{}};
  return {
    scene:'expedition',worldDescriptor:{kind:'expedition',width:2200,height:2200,grid:48},
    colony:{expedition:{v:1,sequence:2,active:run,settled:{}}},
    meta:{residents:[resident],stats:{kills:0,deaths:0},playerNeeds:{}},
    entities,px:100,py:100,hp:100,iFrameT:0,shake:0,hurtFlash:0,
    seed:7,parts:[],noiseT:0,spec:{laws:[]},mode:'running'
  };
}

function enemyAt(x,y){
  return {id:'enemy-1',type:APH.CFG.entType.ENEMY,x,y,hp:20,state:'attack',atkCd:0,
    wanderA:0,walkPh:0,faction:{name:'测试敌人',hp:20,dmg:9,speed:0,nightBoost:1,behavior:'melee',gene:{size:1,hue:0}}};
}

test('expedition combat: all downed squad never damages ghost player',()=>{
  const resident={id:'r1',name:'队员',downed:true,mood:80};
  const pawn={id:'pawn-r1',rid:'r1',type:APH.CFG.entType.RESIDENT,x:100,y:100,downed:true};
  const enemy=enemyAt(100,100);
  const state=expeditionState(resident,[pawn,enemy]);
  const prior=APH.state;
  APH.state=state;
  try{
    APH.Combat.updateCombat(.1,false);
    assert.equal(state.hp,100);
    assert.equal(state.mode,'running');
    assert.equal(enemy.state,'idle');
  }finally{APH.state=prior;}
});

test('expedition combat: enemy projectile cannot fall back to ghost player',()=>{
  const resident={id:'r1',name:'队员',downed:true,mood:80};
  const pawn={id:'pawn-r1',rid:'r1',type:APH.CFG.entType.RESIDENT,x:100,y:100,downed:true};
  const projectile=APH.Combat.makeProj(90,100,20,0,'enemy',11);
  const state=expeditionState(resident,[pawn,projectile]);
  const prior=APH.state;
  APH.state=state;
  try{
    APH.Combat.updateCombat(.5,false);
    assert.equal(state.hp,100);
    assert.equal(state.mode,'running');
  }finally{APH.state=prior;}
});

test('expedition combat: living member receives melee instead of player',()=>{
  const resident={id:'r1',name:'队员',downed:false,mood:80,food:80,ailments:[]};
  const pawn={id:'pawn-r1',rid:'r1',type:APH.CFG.entType.RESIDENT,x:100,y:100,downed:false};
  const state=expeditionState(resident,[pawn,enemyAt(100,100)]);
  const prior=APH.state;
  APH.state=state;
  try{
    APH.Combat.updateCombat(.1,false);
    assert.equal(state.hp,100);
    assert(resident.mood<80);
    assert(pawn.hurtCd>0);
  }finally{APH.state=prior;}
});
