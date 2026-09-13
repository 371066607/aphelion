'use strict';
const assert=require('assert');

function fullCircle(list,x,y,r,type){
  return list.filter(function(e){return e&&!e.dead&&(!type||e.type===type)&&Math.hypot(e.x-x,e.y-y)<r;}).map(function(e){return e.id;}).sort();
}
function ids(list){return (list||[]).map(function(e){return e.id;}).sort();}

test('entity index: circle result matches full scan across bucket boundaries',()=>{
  const I=APH.EntityIndex,T=APH.CFG.entType;
  const list=[{id:'a',type:T.FLORA,x:191,y:10},{id:'b',type:T.ROCK,x:193,y:10},{id:'c',type:T.RESIDENT,x:210,y:10},{id:'far',type:T.FLORA,x:600,y:10}];
  I.prepare(list);
  assert.deepEqual(ids(I.queryCircle(list,192,10,30)),fullCircle(list,192,10,30));
  assert.deepEqual(ids(I.queryCircle(list,192,10,30,T.FLORA)),fullCircle(list,192,10,30,T.FLORA));
});

test('entity index: dynamic movement is never stale and unprepared queries fall back',()=>{
  const I=APH.EntityIndex,T=APH.CFG.entType;
  const list=[{id:'runner',type:T.RESIDENT,x:20,y:20},{id:'tree',type:T.FLORA,x:500,y:20}];
  I.invalidate();
  assert.equal(I.queryCircle(list,20,20,10),null);
  I.prepare(list);list[0].x=400;
  assert.deepEqual(ids(I.queryCircle(list,400,20,10)),['runner']);
  list[0]={id:'restored_runner',type:T.RESIDENT,x:30,y:20};
  I.prepare(list);
  assert.deepEqual(ids(I.queryCircle(list,30,20,10)),['restored_runner']);
  list.push({id:'new_drop',type:T.DROPPED,x:30,y:20});
  assert.equal(I.queryCircle(list,30,20,10),null,'同帧新增后必须回退全扫，不能遗漏');
});

test('entity index: reused array detects static move/death, delete, and restored same uid object',()=>{
  const I=APH.EntityIndex,T=APH.CFG.entType;
  const old={id:'flora_uid',type:T.FLORA,x:20,y:20},list=[old];
  I.prepare(list);old.x=300;I.prepare(list);
  assert.deepEqual(ids(I.queryCircle(list,300,20,10)),['flora_uid']);
  old.dead=true;I.prepare(list);assert.deepEqual(ids(I.queryCircle(list,300,20,10)),[]);
  list.splice(0,1);list.push({id:'flora_uid',type:T.FLORA,x:40,y:40});I.prepare(list);
  assert.deepEqual(ids(I.queryCircle(list,40,40,10)),['flora_uid']);
  list.pop();I.prepare(list);assert.deepEqual(ids(I.queryCircle(list,40,40,10)),[]);
});

test('entity index: rect candidates preserve boundary inclusivity and full-scan membership',()=>{
  const I=APH.EntityIndex,T=APH.CFG.entType;
  const list=[{id:'left',type:T.ROCK,x:0,y:0},{id:'right',type:T.FLORA,x:192,y:192},{id:'dyn',type:T.ENEMY,x:96,y:96},{id:'out',type:T.ROCK,x:193,y:192}];
  I.prepare(list);
  const expected=list.filter(function(e){return e.x>=0&&e.x<=192&&e.y>=0&&e.y<=192;}).map(function(e){return e.id;}).sort();
  assert.deepEqual(ids(I.queryRect(list,0,0,192,192)),expected);
});
