'use strict';
const R=APH.Res,C=APH.Combat,CFG=APH.CFG,T=CFG.entType;
function assert(v,m){if(!v)throw new Error(m);}
function fixture(seed=214,n=4){
  const s={scene:'home',mode:'running',seed,clock:0,px:1100,py:1100,parts:[],noiseT:0,
    colony:{buildings:[],scene:{width:2200,height:2200}},
    meta:{residents:[],prisoners:[],res:{},tech:{},bonds:{},stats:{kills:0},weather:{id:'wx_clear'}},
    war:{raidActive:true,raidWarn:0,beganAt:0,wave:{count:n,waves:1},spawned:n,wavesLeft:0,casualties:0},entities:[]};
  for(let i=0;i<n;i++)s.entities.push(R.embodyHostile(R.hostilePawn(seed*100+i,[]),500+i*45,500));
  return s;
}
function withState(s,fn){const old=APH.state;APH.state=s;try{fn();}finally{APH.state=old;}}
function broken(e,type='tantrum'){e.pawn.breakType=type;e.pawn.breakT=2;}

test('#214 崩溃按生产跳推进，规模满足时复用整队撤离并取消后续波次',()=>{
  const s=fixture();broken(s.entities[0]);broken(s.entities[1]);
  s.war.wavesLeft=2;s.war.betweenWaves=true;
  withState(s,()=>{
    C.tickRaiderMorale(s);
    assert(s.entities[0].pawn.breakT===1,'必须调用共享 breakTick 推进持续时间');
    assert(s.war.routed&&s.war.retreatReason==='morale'&&s.war.wavesLeft===0&&!s.war.betweenWaves,'须走 raidRetreat 完整契约');
    assert(s.entities.every(e=>e.type!==T.ENEMY||e.retreat),'全队都应撤离');
    assert(s.war.casualties===0&&s.meta.stats.kills===0,'不依赖击杀');
  });
});
test('#214 非人型、士兵、俘虏与倒地者不触发崩溃；单个崩溃不足以取消整波',()=>{
  const s=fixture(1,5);s.entities[0].captured=true;s.entities[1].isSoldier=true;
  s.entities[2].humanlike=false;s.entities[2].pawn.humanlike=false;s.entities[3].downed=true;
  s.entities.forEach(e=>broken(e));
  withState(s,()=>C.tickRaiderMorale(s));
  assert(s.entities.slice(0,4).every(e=>e.pawn.breakT===2),'非参战人型不应推进');
  assert(s.entities[4].pawn.breakT===1&&!s.war.routed,'一人不能取消整波');
});
test('#214 出走优先于围攻，怠工停止攻击，结束后恢复战斗',()=>{
  const s=fixture(2,2),[a,b]=s.entities;broken(a,'wander');broken(b);a.sieging=b.sieging=true;
  withState(s,()=>{
    const x=a.x;C.updateCombat(0.05,false);assert(a.retreat&&a.x!==x,'出走必须真实移动撤离');
    assert(b.state==='idle'&&!b.walking,'怠工停止进攻');
    b.pawn.breakT=0;b.pawn.breakType=null;b.sieging=false;
    C.updateCombat(0.05,false);assert(b.breaking===null,'恢复后清理表现标记');
  });
});
test('#214 斗殴走向同伴，接触后沿用 hurtResident，一次崩溃只打一架',()=>{
  const s=fixture(3,2),[a,b]=s.entities;broken(a,'brawl');b.x=a.x+100;
  withState(s,()=>{
    const x=a.x;C.updateCombat(0.05,false);assert(a.x>x&&b.pawn.illness===0,'未接触不得隔空伤人');
    b.x=a.x+10;C.updateCombat(0.05,false);const ill=b.pawn.illness;
    assert(ill>0&&a.pawn.illness>0,'斗殴双方必须产生共享伤病');
    C.updateCombat(0.05,false);assert(b.pawn.illness===ill,'不得每帧重复斗殴');
  });
});
test('#214 暴食必须走到粮堆，只扣实物一份；俘虏和库存不受影响',()=>{
  const s=fixture(4,1),a=s.entities[0];broken(a,'binge');a.pawn.food=20;
  const d={type:T.DROPPED,itemId:'it_roasted_meat',n:2,x:a.x+100,y:a.y};s.entities.push(d);s.meta.res.food=7;
  withState(s,()=>{
    const x=a.x;C.updateCombat(0.05,false);assert(a.x>x&&d.n===2,'要先走到食物');
    d.x=a.x+5;C.updateCombat(0.05,false);assert(d.n===1&&a.pawn.food===20+CFG.residents.eatGain,'吃一份实体食物');
    C.updateCombat(0.05,false);assert(d.n===1&&s.meta.res.food===7,'不得重复吃或隔空扣库存');
  });
});
test('#214 饥饿、疼痛、同伴倒下沿同一念头系统降低心情',()=>{
  const p=R.hostilePawn(1,[]),q=JSON.parse(JSON.stringify(p));q.food=10;
  R.moodFromThoughts(p,{raid:true});R.moodFromThoughts(q,{raid:true,pain:true,allyDown:true});
  assert(q.mood<p.mood,'上下文必须影响真实心情');
  ['th_starving','th_pain','th_ally_down'].forEach(id=>assert(q.thoughts.some(t=>t.id===id),'缺少念头 '+id));
});
test('#214 seeded 长测：疲惫饥饿的袭击者无击杀也会整队溃退',()=>{
  const results=[];
  for(let seed=1;seed<=16;seed++){
    const s=fixture(seed,4),foes=s.entities.slice();
    // 唯一初始条件：跋涉后食物/精力/娱乐不足；不设置 mood、breakType，不改概率/时限。
    foes.forEach(e=>{e.pawn.food=20;e.pawn.rest=15;e.pawn.recreation=10;});
    withState(s,()=>{
      for(let frame=1;frame<=12000&&s.war.raidActive;frame++){
        s.clock=frame*0.05;
        if(frame%600===0)APH.ColonyTick.run(s);
        C.tickRaid(s,0.05);
        if(s.war.retreatReason==='morale'&&!s._routAt)s._routAt=s.clock;
      }
    });
    assert(s.war.casualties===0&&s.meta.stats.kills===0,'长测不能靠击杀');
    results.push({seed,reason:s.war.retreatReason||'none',routAt:s._routAt||null,ended:!s.war.raidActive,
      casualties:s.war.casualties,kills:s.meta.stats.kills,departed:foes.filter(e=>e.dead).length});
  }
  console.log('RAID_MORALE_SOAK '+JSON.stringify(results));
  assert(results.some(r=>r.reason==='morale'&&r.ended&&r.routAt<CFG.raidTactics.giveUpSec),'必须有零击杀且在超时前完成的士气溃退');
});
