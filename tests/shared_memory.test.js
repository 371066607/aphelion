'use strict';
const R=APH.Res;
test('shared memory: 共同经历写入实际队员、关系与限时念头，读档重结算不叠加',function(){
  const m={residents:[{id:'a'},{id:'b'},{id:'home'}],bonds:{}};
  const event={id:'expedition:ex_1',kind:'expedition',clock:100,text:'一起带回了异星样本'};
  R.rememberShared(m,['a','b'],event);
  if(m.residents[2].memories||m.bonds[R.bondKey('a','b')]!==54)throw new Error('未参与者获得经历或关系没变');
  const loaded=JSON.parse(JSON.stringify(m));
  if(R.rememberShared(loaded,['a','b'],event)||loaded.residents[0].memories.length!==1||loaded.bonds[R.bondKey('a','b')]!==54)
    throw new Error('重复结算叠加了记忆');
  const recent=R.collectThoughts(loaded.residents[0],{clock:101});
  if(!recent.some(t=>t.id==='memory:expedition:ex_1'&&t.mood===APH.CFG.sharedMemory.mood))throw new Error('记忆未连上心情');
  if(R.collectThoughts(loaded.residents[0],{clock:100+APH.CFG.DAY_LEN*3}).some(t=>t.id.indexOf('memory:')===0))throw new Error('记忆加成不消退');
});
test('shared memory: 历史有界，多个经历的心情不无限堆叠',function(){
  const m={residents:[{id:'a'},{id:'b'}]};
  for(let i=0;i<30;i++)R.rememberShared(m,['a','b'],{id:'run:'+i,clock:i,text:'共同经历'});
  if(m.residents[0].memories.length!==APH.CFG.sharedMemory.limit)throw new Error('历史无界');
  if(R.collectThoughts(m.residents[0],{clock:31}).filter(t=>t.id.indexOf('memory:')===0).length!==1)throw new Error('心情无限叠加');
});
