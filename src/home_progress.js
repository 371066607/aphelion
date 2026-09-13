/* Long-term home objective. Samples real simulation state; never ends the run. */
window.APH=window.APH||{};
APH.HomeProgress=(function(){
  'use strict';
  var CFG=APH.CFG;
  function storedColdFood(s,alive,rooms){
    var coldRooms=[];
    alive.forEach(function(b){
      if(b.id!=='bl_cooler'||b.powered!==true||!b.grid)return;
      var room=APH.Nav.roomAt(b,rooms);if(room&&room.temp<=0)coldRooms.push(room);
    });
    if(!coldRooms.length)return {units:0,cold:false};
    var units=0;
    (s.entities||[]).forEach(function(e){
      if(!e||e.dead||e.type!==CFG.entType.DROPPED||!e.itemId)return;
      var item=(CFG.items||{})[e.itemId]||{};
      if(item.store!=='food'&&!item.isCooked)return;
      if(e.decayHp!=null&&e.decayHp<=0)return;
      /* Modern storage owns a stack by containerId.  Do not count a pile merely
         lying on a cold-room floor: it must survive Storage's ownership check. */
      if(!APH.Storage||!APH.Storage.isStored||!APH.Storage.isStored(e,s))return;
      var at={x:e.storageX!=null?e.storageX:e.x,y:e.storageY!=null?e.storageY:e.y};
      if(coldRooms.indexOf(APH.Nav.roomAt(at,rooms))<0)return;
      units+=Math.max(0,Math.floor(Number(e.n)||0));
    });
    return {units:units,cold:true};
  }
  function checks(s){
    var m=s.meta||{}, b=(s.colony&&s.colony.buildings)||[], r=m.residents||[];
    var alive=b.filter(function(x){return x&&!x.dead;});
    var rooms=APH.Nav.roomsOf(b,s.colony.scene);
    var need=Math.ceil(r.length*CFG.residents.foodDrain/CFG.residents.eatGain*CFG.DAY_LEN/CFG.time.prodTick*CFG.rooting.foodDays);
    var beds={};var allBeds=r.length>0&&r.every(function(p){if(!p.bedId||beds[p.bedId])return false;var actual=alive.some(function(b){return (b.id==='bl_bed'||b.id==='bl_house')&&p.bedId.indexOf((b.uid||(b.id+'@'+b.x+','+b.y))+':')===0;});if(!actual)return false;beds[p.bedId]=true;return true;});
    var coldFood=storedColdFood(s,alive,rooms);
    var backup=alive.some(function(x){return x.id==='bl_battery'&&((s.power&&s.power.charge||{})[Math.round(x.x)+','+Math.round(x.y)]||0)>0;});
    var alien=alive.some(function(x){return x.id==='bl_crop_plot'&&APH.Colony.ALIEN_CROPS[x.crop]&&APH.Colony.canPlantCrop(x.crop,m.analyzedFlora)&&((m.alienHarvests||{})[x.crop]||0)>0;});
    return [
      {id:'beds',ok:allBeds,text:'全员有独立床位'},
      {id:'food',ok:coldFood.units>=need&&alive.some(function(x){return x.id==='bl_farm'||x.id==='bl_crop_plot';}),text:'冷库存放有效两天口粮（'+coldFood.units+'/'+need+'）'},
      {id:'cold',ok:coldFood.cold,text:'通电冷库保持零度以下'},
      {id:'backup',ok:backup,text:'备用蓄电池有储能'},
      {id:'alien',ok:alien,text:'已化验异星作物完成收获并投入家园储备'},
      {id:'beacon',ok:alive.some(function(x){return x.id==='bl_transmitter'&&x.powered===true&&!!x.grid;}),text:'通信灯塔联网运行'}
    ];
  }
  function tick(s,dt){
    var m=s.meta, state=m.rooting||(m.rooting={seconds:0,achieved:false});
    state.checks=checks(s);
    if(!state.achieved){
      state.seconds=state.checks.every(function(c){return c.ok;})?(state.seconds||0)+Math.max(0,dt||0):0;
      if(state.seconds>=CFG.DAY_LEN*CFG.rooting.days){state.achieved=true;state.at=s.clock;APH.U.emit('notice',{text:'新曙光已在异星扎根。家园继续经营。',color:'#9fe8c8'});}
    }
    return state;
  }
  function describe(state){
    if(!state)return null;
    if(state.achieved)return {id:'rooted',text:'新曙光已扎根 · 继续建设你的异星家园'};
    var missing=(state.checks||[]).filter(function(c){return !c.ok;});
    return {id:'rooting',text:missing.length?'扎根：'+missing[0].text:'生活稳定，维持三天（'+((state.seconds||0)/CFG.DAY_LEN).toFixed(1)+'/3天）'};
  }
  return {checks:checks,tick:tick,describe:describe};
})();
