/* Map overview and camera controls. The overview reads the active world's
   canonical entities; clicking it only moves the camera. */
window.APH=window.APH||{};
APH.MapUI=(function(){
  'use strict';
  var panel,canvas,controls,zoomLabel,list,cache,key='';
  function el(tag,text){var e=document.createElement(tag);if(text!=null)e.textContent=text;return e;}
  function button(text,fn){var b=el('button',text);b.type='button';b.style.cssText='padding:7px 10px;border:1px solid #798674;border-radius:7px;background:#424d42;color:#f1e8cc;font:inherit;cursor:pointer';b.addEventListener('click',fn);return b;}
  function viewport(){return APH.World.getViewport();}
  function zoom(factor,anchor){var s=APH.state;APH.Camera.setZoom(s,APH.Camera.zoom(s)*factor,anchor,viewport());update(s);}
  function focus(x,y){var s=APH.state;s.camX=x;s.camY=y;s.camFollow=false;APH.Camera.clamp(s,viewport());}
  function close(){APH.UI.close('mapOverview');}
  function ensure(){
    if(controls)return;
    controls=el('div');controls.id='mapControls';controls.style.cssText='position:fixed;right:12px;bottom:16px;z-index:40;display:flex;gap:6px;align-items:center;padding:6px;background:#252a28e8;color:#eee3c6;border:1px solid #66766b;border-radius:9px';
    controls.appendChild(button('−',function(){zoom(1/APH.CFG.camera.zoomStep);}));zoomLabel=button('100%',function(){APH.Camera.setZoom(APH.state,1,null,viewport());update(APH.state);});zoomLabel.setAttribute('aria-label','恢复默认缩放');controls.appendChild(zoomLabel);
    controls.appendChild(button('+',function(){zoom(APH.CFG.camera.zoomStep);}));controls.appendChild(button('地图 [V]',open));document.body.appendChild(controls);
    panel=el('div');panel.id='mapOverviewOverlay';panel.style.cssText='display:none;position:fixed;inset:0;z-index:85;background:#101816df;align-items:center;justify-content:center;padding:12px';
    var card=el('section');card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.style.cssText='background:#302f29;color:#efe3c8;border:1px solid #8a987d;border-radius:12px;padding:16px;max-height:94vh;overflow:auto;max-width:94vw';
    card.appendChild(el('h2','地图总览'));
    card.appendChild(el('p','点击地图定位；方向键移动视野，Enter 返回。青色为居民，红色为危险，米色为建筑。'));
    canvas=el('canvas');canvas.width=512;canvas.height=512;canvas.tabIndex=0;canvas.setAttribute('aria-label','地图，点击定位；方向键移动视野');canvas.style.cssText='width:min(512px,78vw);height:auto;border:1px solid #6f7a66;cursor:crosshair;vertical-align:top';
    canvas.addEventListener('click',function(ev){var rect=canvas.getBoundingClientRect(),d=APH.Scene.of();focus((ev.clientX-rect.left)/rect.width*d.width,(ev.clientY-rect.top)/rect.height*d.height);close();});
    canvas.addEventListener('keydown',function(ev){var dx=0,dy=0;if(ev.key==='ArrowLeft')dx=-1;if(ev.key==='ArrowRight')dx=1;if(ev.key==='ArrowUp')dy=-1;if(ev.key==='ArrowDown')dy=1;if(dx||dy){ev.preventDefault();ev.stopPropagation();focus(APH.state.camX+dx*APH.CFG.GRID*4,APH.state.camY+dy*APH.CFG.GRID*4);render();}if(ev.key==='Enter'){ev.preventDefault();close();}});
    card.appendChild(canvas);list=el('div');list.style.cssText='display:inline-flex;vertical-align:top;flex-direction:column;gap:6px;padding:8px;max-width:220px';card.appendChild(list);card.appendChild(button('返回 [Esc]',close));panel.appendChild(card);document.body.appendChild(panel);
    APH.UI.registerModal('mapOverview',{elId:'mapOverviewOverlay',isOverlay:true});
  }
  function render(){
    var s=APH.state,d=APH.Scene.of(s),ctx=canvas.getContext('2d'),k=[s.scene,d.width,d.height,d.seed,d.generation].join(':');
    if(!cache||key!==k){key=k;cache=document.createElement('canvas');cache.width=512;cache.height=512;var g=cache.getContext('2d');for(var y=0;y<64;y++)for(var x=0;x<64;x++){g.fillStyle=s.scene==='home'?APH.TerrainModel.regionColor(d,(x+.5)*d.width/64,(y+.5)*d.height/64,'#526052'):'#334550';g.fillRect(x*8,y*8,8,8);}}
    ctx.drawImage(cache,0,0);(s.entities||[]).forEach(function(e){if(e.dead)return;var color=e.type==='resident'?'#86f4d1':(e.type==='enemy'||e.wild&&e.warning)?'#ff6d67':e.type==='building'?'#efdcac':null;if(!color)return;ctx.fillStyle=color;ctx.fillRect(e.x/d.width*512-2,e.y/d.height*512-2,4,4);});
    var view=viewport(),z=APH.Camera.zoom(s),w=view.w/z,h=view.h/z;ctx.strokeStyle='#fff2c9';ctx.lineWidth=2;ctx.strokeRect((s.camX-w/2)/d.width*512,(s.camY-h/2)/d.height*512,w/d.width*512,h/d.height*512);
    list.innerHTML='';list.appendChild(el('strong',s.scene==='home'?'家园':'当前远征'));
    if(s.scene==='home'){var names={landing:'迫降旷地',woodland:'林地',lakeshore:'湖岸沃土',ridge:'岩丘矿脉',alien:'异星植物丛',wreckage:'残骸带'};APH.TerrainModel.REGIONS.forEach(function(r){var label=el('span',names[r.id]);label.style.cssText='border-left:10px solid '+r.color+';padding-left:7px;font-size:12px';list.appendChild(label);});}
    (s.entities||[]).filter(function(e){return !e.dead&&e.type==='resident';}).forEach(function(e){list.appendChild(button(e.name||'居民',function(){focus(e.x,e.y);close();}));});
    if(s.scene==='home'&&APH.Alerts)(APH.Alerts.collect(s)||[]).slice(0,5).forEach(function(a){list.appendChild(button(a.text,function(){APH.Alerts.focus(s,a);APH.Camera.clamp(s,viewport());close();}));});
  }
  function open(){ensure();render();APH.UI.open('mapOverview');panel.style.display='flex';canvas.focus();return true;}
  function update(s){ensure();controls.style.display=s.mode==='running'?'flex':'none';zoomLabel.textContent=Math.round(APH.Camera.zoom(s)*100)+'%';}
  return {open:open,close:close,update:update,zoom:zoom,focus:focus};
})();
