const assert=require('assert');
const fs=require('fs');
const path=require('path');

if(!APH.WorldRuntime){
  const source=fs.readFileSync(path.join(__dirname,'..','src','world_runtime.js'),'utf8');
  new Function(source)();
}
const WR=APH.WorldRuntime;

test('world runtime: capture is shallow and excludes manager fields',()=>{
  const entities=[{id:'e1'}],state={scene:'home',entities,clock:12,worlds:{},_background:true};
  const world=WR.capture(state);
  assert.strictEqual(world.entities,entities);
  assert.equal(world.clock,12);
  assert.equal(Object.prototype.hasOwnProperty.call(world,'worlds'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(world,'_background'),false);
});

test('world runtime: install keeps facade identity and global controls',()=>{
  const target={scene:'home',entities:[{id:'home'}],homeOnly:1,clock:90,paused:true,timeScale:3,mode:'running',keys:{KeyW:true},joy:{active:true},worlds:{home:{}}};
  const identity=target,world={scene:'expedition',entities:[{id:'exp'}],expOnly:2,clock:1,paused:false,timeScale:1,mode:'dead',keys:{},joy:{}};
  WR.install(target,world);
  assert.strictEqual(target,identity);
  assert.equal(target.scene,'expedition');
  assert.equal(target.homeOnly,undefined);
  assert.equal(target.expOnly,2);
  assert.equal(target.clock,90);
  assert.equal(target.paused,true);
  assert.equal(target.timeScale,3);
  assert.equal(target.mode,'running');
  assert.equal(target.keys.KeyW,true);
  assert.equal(target.joy.active,true);
  assert(target.worlds.home);
});

test('world runtime: run binds synchronously and always restores APH.state',()=>{
  const foreground={scene:'home'},background={scene:'expedition'};
  const prior=APH.state;
  APH.state=foreground;
  try{
    const value=WR.run(background,w=>{
      assert.strictEqual(APH.state,background);
      assert.strictEqual(w,background);
      assert.equal(w._background,true);
      return 7;
    });
    assert.equal(value,7);
    assert.strictEqual(APH.state,foreground);
    assert.equal('_background' in background,false);
    assert.throws(()=>WR.run(background,()=>{throw new Error('boom');}),/boom/);
    assert.strictEqual(APH.state,foreground);
    assert.throws(()=>WR.run(background,()=>Promise.resolve(1)),/synchronous/);
    assert.strictEqual(APH.state,foreground);
  }finally{APH.state=prior;}
});

test('world runtime: manager swaps isolated home and expedition behind one facade',()=>{
  const canonicalColony={scene:{seed:1},logistics:{tasks:[{id:'canonical-haul'}]}};
  const home={scene:'home',entities:[{id:'h'}],parts:[{life:1}],carry:{wood:2},navCache:{revision:1},tasks:[{id:'home-task'}],colony:canonicalColony};
  const expedition={scene:'expedition',entities:[{id:'x'}],parts:[],carry:{ore:3},navCache:{revision:2},tasks:[{id:'exp-task'}],colony:canonicalColony};
  const facade={scene:'home',entities:[],parts:[],carry:{},clock:40,paused:false,timeScale:2,mode:'running',keys:{},joy:{}};
  const identity=facade;
  const manager=WR.createManager(facade,{home,expedition});
  manager.activate('home');
  assert.strictEqual(facade,identity);
  assert.equal(facade.entities[0].id,'h');
  facade.entities.push({id:'h2'});
  manager.activate('expedition');
  assert.equal(facade.entities.length,1);
  assert.equal(facade.entities[0].id,'x');
  assert.equal(facade.clock,40);
  assert.notStrictEqual(manager.get('home').entities,manager.get('expedition').entities);
  assert.notStrictEqual(manager.get('home').parts,manager.get('expedition').parts);
  assert.notStrictEqual(manager.get('home').carry,manager.get('expedition').carry);
  assert.notStrictEqual(manager.get('home').navCache,manager.get('expedition').navCache);
  assert.notStrictEqual(manager.get('home').tasks,manager.get('expedition').tasks);
  assert.strictEqual(manager.get('home').colony,canonicalColony);
  assert.strictEqual(manager.get('expedition').colony,canonicalColony);
  const clock=facade.clock;
  manager.run('home',w=>{w.parts.push({life:2}); assert.equal(w._background,true);});
  assert.equal(facade.clock,clock);
  manager.activate('home');
  assert.equal(facade.entities.length,2);
  assert.equal(facade.parts.length,2);
});

test('world runtime: serializable restore keeps entities groups carry and recoverable orders',()=>{
  const enemy={id:'enemy-1',type:'enemy',x:8,y:9,def:{draw(){}}};
  const pawn={id:'pawn-1',type:'resident',x:1,y:2,path:[{x:2,y:2}],cache:{hit:true},userOrder:{type:'attack',enemy}};
  const gate={x:20,y:30,broken:false};
  const gateEntity={id:'rg_0',type:'building',bid:'ancient_gate',x:20,y:30,gate};
  const bedEntity={id:'home_bed_1',type:'building',bid:'bl_bed',x:40,y:50,def:APH.Colony.get('bl_bed')};
  const canonicalMeta={res:{mineral:9}},canonicalColony={buildings:[{id:'bl_bed'}]};
  const world={scene:'expedition',worldDescriptor:{kind:'expedition'},entities:[pawn,enemy,gateEntity,bedEntity],group:[pawn],selectedPawns:[pawn],carry:{it_alloy:7},parts:[{life:.5}],navCache:{revision:3},scanning:enemy,nearBeacon:enemy,selectedTarget:{type:'enemy',entity:enemy},ruins:{gate},squadNeedT:4,_expeditionReturn:true,meta:{stale:true},colony:{stale:true},unknownRuntimeThing:{omit:true}};
  const snapshot=WR.serializable(world);
  assert.doesNotThrow(()=>JSON.stringify(snapshot));
  assert.equal(snapshot.entities[0].def,undefined);
  assert.equal(snapshot.entities[0].path,undefined);
  assert.equal(snapshot.entities[0].cache,undefined);
  assert.equal(snapshot.entities[0].userOrder.enemyId,'enemy-1');
  assert.deepEqual(snapshot.group,['pawn-1']);
  assert.equal(snapshot.scanningId,'enemy-1');
  assert.equal(snapshot.nearBeaconId,'enemy-1');
  assert.equal(snapshot.selectedTarget.entityId,'enemy-1');
  assert.equal(snapshot.meta,undefined);
  assert.equal(snapshot.colony,undefined);
  assert.equal(snapshot.squadNeedT,4);
  assert.equal(snapshot._expeditionReturn,true);
  assert.equal(snapshot.unknownRuntimeThing,undefined);
  const persisted=JSON.parse(JSON.stringify(snapshot));
  persisted.meta={wrong:true};persisted.colony={wrong:true};
  const restored=WR.restore(persisted,{mode:'running',meta:canonicalMeta,colony:canonicalColony});
  assert.equal(restored.mode,'running');
  assert.strictEqual(restored.meta,canonicalMeta);
  assert.strictEqual(restored.colony,canonicalColony);
  assert.deepEqual(restored.carry,{it_alloy:7});
  assert.strictEqual(restored.group[0],restored.entities[0]);
  assert.strictEqual(restored.selectedPawns[0],restored.entities[0]);
  assert.strictEqual(restored.entities[0].userOrder.enemy,restored.entities[1]);
  assert.strictEqual(restored.scanning,restored.entities[1]);
  assert.strictEqual(restored.nearBeacon,restored.entities[1]);
  assert.strictEqual(restored.selectedTarget.entity,restored.entities[1]);
  assert.strictEqual(restored.entities[2].gate,restored.ruins.gate);
  assert.strictEqual(restored.entities[3].def,APH.Colony.get('bl_bed'));
});

test('#203 world runtime: corrupt expedition regen clocks are bounded at persistence seams',()=>{
  const period=APH.CFG.time.prodTick;
  [1e12,-1,Infinity,NaN,'30'].forEach(function(value){
    const restored=WR.restore({scene:'expedition',expeditionRegenT:value,entities:[]});
    assert.equal(typeof restored.expeditionRegenT,'number');
    assert(restored.expeditionRegenT>=0&&restored.expeditionRegenT<period,'恢复后时钟未归一: '+String(value));
    const snapshot=WR.serializable({scene:'expedition',expeditionRegenT:value,entities:[]});
    assert(snapshot.expeditionRegenT>=0&&snapshot.expeditionRegenT<period,'写盘前时钟未归一: '+String(value));
  });
  assert.equal(WR.restore({expeditionRegenT:period+7,entities:[]}).expeditionRegenT,7,'合法余数被错误丢弃');
});
