const assert=require('assert');
const fs=require('fs');
const path=require('path');

if(!APH.Camera){
  new Function(fs.readFileSync(path.join(__dirname,'..','src','camera.js'),'utf8'))();
}
const Camera=APH.Camera;
const VP={w:800,h:600};

function state(over){
  return Object.assign({scene:'home',camX:3072,camY:3072,camZoom:1,
    colony:{scene:{width:6144,height:6144,grid:48}}},over||{});
}

test('camera: world and screen projections roundtrip at every zoom',()=>{
  [.5,1,2].forEach(z=>{
    const s=state({camZoom:z}),screen=Camera.toScreen(s,3456,2789,VP);
    const world=Camera.toWorld(s,screen.x,screen.y,VP);
    assert(Math.abs(world.x-3456)<1e-9);
    assert(Math.abs(world.y-2789)<1e-9);
  });
});

test('camera: viewport reports world extent scaled by zoom',()=>{
  const v=Camera.viewport(state({camZoom:.5}),VP);
  assert.equal(v.width,1600);
  assert.equal(v.height,1200);
  assert.equal(v.left,2272);
  assert.equal(v.bottom,3672);
});

test('camera: anchored zoom keeps the same world point under pointer',()=>{
  const s=state(),anchor={x:170,y:440};
  const before=Camera.toWorld(s,anchor.x,anchor.y,VP);
  Camera.setZoom(s,2,anchor,VP);
  const after=Camera.toWorld(s,anchor.x,anchor.y,VP);
  assert(Math.abs(after.x-before.x)<1e-9);
  assert(Math.abs(after.y-before.y)<1e-9);
  assert.equal(s.camZoom,2);
});

test('camera: zoom and center clamp respect limits and 128-grid bounds',()=>{
  const s=state({camX:-50,camY:9999});
  Camera.setZoom(s,.01,null,VP);
  assert.equal(s.camZoom,.5);
  assert.equal(s.camX,800);
  assert.equal(s.camY,5544);
  Camera.setZoom(s,99,null,VP);
  assert.equal(s.camZoom,2);
  Camera.clamp(s,VP);
  assert(s.camX>=200&&s.camX<=5944);
  assert(s.camY>=150&&s.camY<=5994);
});

test('camera: viewport larger than world pins camera to world center',()=>{
  const s=state({camX:0,camY:0,camZoom:.5,
    colony:{scene:{width:600,height:400,grid:48}}});
  Camera.clamp(s,VP);
  assert.equal(s.camX,300);
  assert.equal(s.camY,200);
});
