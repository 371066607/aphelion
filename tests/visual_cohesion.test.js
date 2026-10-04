'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
test('visual catalog: every buildable item occurs once, structure first',()=>{
 const ids=APH.CFG.visual.buildCategories.flatMap(c=>c.ids),expected=Object.keys(APH.Colony.list()).filter(id=>id!=='bl_landing_pad');
 if(new Set(ids).size!==ids.length||expected.some(id=>!ids.includes(id))||ids.some(id=>!expected.includes(id)))throw Error('catalog missing or duplicating buildings');
 if(ids.slice(0,3).join(',')!=='bl_wall,bl_gate,bl_floor')throw Error('structure not first');
});
test('environment atlas: measured crop is contained, aspect and foot anchor preserved',()=>{
 let img;const box={APH:{CFG:APH.CFG},Image:function(){img=this;this.naturalWidth=1024;this.naturalHeight=768;}};box.window=box;vm.createContext(box);
 for(const f of ['environment_art_data.js','environment_art.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'),box);
 const art=box.APH.EnvironmentArt;art.load();img.onload();const calls=[];
 art.names.forEach(name=>{if(!art.draw({drawImage(...args){calls.push(args)}},name,100,200))throw Error('missing asset '+name)});
 calls.forEach(a=>{if(a[1]<0||a[2]<0||a[1]+a[3]>1024||a[2]+a[4]>768)throw Error('invalid crop');if(Math.abs(a[7]/a[8]-a[3]/a[4])>1e-8)throw Error('distortion');if(Math.abs(a[6]+a[8]-200)>1e-8)throw Error('floating foot');});
});
test('environment atlas: unavailable image falls back without mutating entities',()=>{
 const box={APH:{CFG:APH.CFG}};box.window=box;vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/environment_art.js'),'utf8'),box);box.APH.EnvironmentArt.load();
 if(box.APH.EnvironmentArt.draw({},'tree_a',0,0)!==false)throw Error('missing art must fall back');
});
test('visual floor: grid floor never draws again as a generic furniture box',()=>{
 APH.Ent.bindCtx({});
 APH.Ent.drawBuilding({type:APH.CFG.entType.BUILDING,bid:'bl_floor',geometryVersion:1,gx:20,gy:20,layer:'floor'},0);
 APH.Ent.drawBuilding({type:APH.CFG.entType.BUILDING,bid:'bl_conduit',geometryVersion:1,gx:20,gy:20,layer:'conduit'},0);
});

test('visual keyboard: native button activation does not pause, canvas Space still does',()=>{
 const events={},box={APH:{CFG:APH.CFG,state:{mode:'running'}},addEventListener:(name,fn)=>events[name]=fn};box.window=box;vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/input.js'),'utf8'),box);
 let pauses=0,prevented=0;box.APH.Input.onAction('TOGGLE_PAUSE',()=>{pauses++;return true});box.APH.Input.bind();
 events.keydown({code:'Space',target:{closest:()=>({})},preventDefault:()=>prevented++});
 if(pauses||prevented)throw Error('native Space activation intercepted');
 events.keydown({code:'Space',target:{closest:()=>null},preventDefault:()=>prevented++});
 if(pauses!==1||prevented!==1)throw Error('canvas pause broken');
});
