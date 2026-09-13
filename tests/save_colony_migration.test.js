const assert = require('assert');
const S=APH.Save;
test('colony v1 migration preserves coordinates, stock, paid blueprints and legacy beds',()=>{
  const old={v:1,buildings:[{id:'bl_house',x:1104,y:1056,lv:2},{id:'bl_transmitter',x:1600,y:1500,lv:1}],
    buildQueue:[{bid:'bl_lab',x:1296,y:1200,total:25,progress:12}],
    ground:[{itemId:'it_wood',n:17,x:1010,y:990}]};
  localStorage.setItem(APH.CFG.save.KEY_COLONY,JSON.stringify(old));
  const c=S.loadColony();
  assert.strictEqual(c.v,2); assert.strictEqual(c.scene.width,2200);
  assert.deepStrictEqual(c.ground,old.ground);
  assert.strictEqual(c.buildings[0].x,1104); assert.strictEqual(c.buildings[0].lv,2);
  assert.deepStrictEqual(c.buildings[0].legacyFootprint,[2,2]);
  assert.deepStrictEqual(c.buildings[1].legacyFootprint,[3,3]);
  assert.strictEqual(c.buildQueue[0].materialsPaid,true); assert.strictEqual(c.buildQueue[0].progress,12);
  const once=JSON.stringify(c); S.saveColony(c); assert.strictEqual(JSON.stringify(S.loadColony()),once);
});
test('colony migration stable IDs do not collide and explicit scene is preserved',()=>{
  const scene={v:1,kind:'home',width:6144,height:6144,grid:48,generation:1,seed:19};
  const c=S.migrate({v:1,scene,buildings:[{id:'bl_house',uid:'b_legacy_1',x:41,y:83},{id:'bl_wall',x:48,y:48}]});
  assert.strictEqual(c.scene,scene); assert.notStrictEqual(c.buildings[0].uid,c.buildings[1].uid);
  assert.strictEqual(c.buildings[0].x,41); assert.strictEqual(c.buildings[0].y,83);
});
test('colony future envelope rejected without overwriting and PlanetSpec remains v1',()=>{
  const raw=JSON.stringify({v:3,buildings:[]}); localStorage.setItem(APH.CFG.save.KEY_COLONY,raw);
  assert.throws(()=>S.loadColony(),/高于/); assert.strictEqual(localStorage.getItem(APH.CFG.save.KEY_COLONY),raw);
  S.savePlanet('compat',{v:1,id:'compat',laws:[]}); assert.strictEqual(S.loadPlanet('compat').v,1);
});
