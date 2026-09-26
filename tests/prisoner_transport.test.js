'use strict';
const plan = APH.ResidentWork.planPrisonerTransport;

test('收容规划：一格一人，优先已建收容点，其余进家园临时区', () => {
  const captives = [
    {id:'rs_cap_a',x:600,y:600},
    {id:'rs_cap_b',x:640,y:600},
  ];
  const workers = [{id:'rs_guard_a',x:500,y:600},{id:'rs_guard_b',x:700,y:600}];
  const spots = [{id:'bl_prison_spot',uid:'hold_1',x:1000,y:1000}];
  const before = JSON.stringify({captives,workers,spots});
  const out = plan(captives,workers,spots,{x:1100,y:1100},()=>true);
  if(out.length!==2 || out[0].holdingId!=='hold_1' || out[1].holdingId.indexOf('temporary@')!==0)
    throw new Error('应有独占建成点与临时兜底：'+JSON.stringify(out));
  if(out[0].workerId===out[1].workerId)throw new Error('押送员不得重复认领');
  if(JSON.stringify({captives,workers,spots})!==before)throw new Error('规划函数不得修改输入');
});

test('收容规划：已到达者占位；不可达点不分派；中断后可换押送员', () => {
  const spot={id:'bl_prison_spot',uid:'hold_1',x:1000,y:1000};
  const captives=[
    {id:'rs_held',x:1000,y:1000,held:true,holdingId:'hold_1'},
    {id:'rs_waiting',x:600,y:600,escortId:'rs_old'},
  ];
  const out=plan(captives,[{id:'rs_new',x:610,y:600}],[spot],{x:1100,y:1100},
    (from,to)=>to.id!=='temporary@0');
  if(out.length!==1||out[0].prisonerId!=='rs_waiting'||out[0].workerId!=='rs_new'||out[0].holdingId==='hold_1'||out[0].holdingId==='temporary@0')
    throw new Error('应保留已占点并避开不可达点：'+JSON.stringify(out));
  if(plan(captives,[],[spot],{x:1100,y:1100},()=>true).length)
    throw new Error('无人可押送时不可凭空移动俘虏');
});

test('收容规划：释放其他人后仍保留高序号临时收容位', () => {
  const prisoner={id:'rs_late',x:1100-168+3*48,y:1100+144+Math.floor(83/8)*48,
    held:true,holdingId:'temporary@83'};
  if(plan([prisoner],[{id:'rs_guard',x:1100,y:1100}],[],{x:1100,y:1100},()=>true).length)
    throw new Error('名单缩短后不得把已收容的人重新送走');
});
