/* #186 · 可丢弃的房间试建界面；只由 main 的显式 query 入口启动。 */
window.APH = window.APH || {};
APH.BuildPrototype = (function(){
  'use strict';
  var active = null;
  var reasons = {
    occupied:'这块地已有建筑或蓝图', out_of_bounds:'超出地图边界', pawn_occupied:'居民还在占地内',
    blocked:'目标被挡住了', unreachable:'没有可走的路径', no_path:'没有可走的路径',
    reserved:'已有居民预订这个位置', no_interaction:'没有空闲的互动位置',
    unpowered:'设备没有接通电力', invalid_target:'目标已不存在', target_not_found:'目标尚未建好或已拆除', not_found:'没有可拆的对象'
  };
  function boot(){
    if(active) return active;
    var previousTitle=document.title;
    var M=APH.BuildProtoModel, D=APH.BuildProtoDraw, G=M.G;
    var state=M.createState(true), selectedPawn=state.pawns[0].id, selectedUid=null;
    var tool=null, rotation=0, demolition=false, layer='structure';
    var paused=false, speed=1, grid=false, roof=false, power=false;
    var hover={gx:11,gy:12}, drag=null, camera={x:0,y:0,z:1}, width=0,height=0;
    var frameId=0,last=0,lastUI=0,stopped=false;
    var root=document.createElement('div');root.id='building-prototype-root';
    root.innerHTML='<style>'+[
      'body.bp-active{margin:0;overflow:hidden;background:#394737}',
      'body.bp-active> :not(#building-prototype-root):not(script){display:none!important}',
      '#building-prototype-root{position:fixed;inset:0;color:#eee7d6;font:14px/1.5 system-ui,sans-serif;z-index:10000}',
      '#building-prototype-root *{box-sizing:border-box}',
      '#bp-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;outline:none}',
      '#building-prototype-root button,#building-prototype-root select{font:inherit;color:inherit;background:#303e35;border:1px solid #73806a;border-radius:5px;padding:7px 10px;cursor:pointer}',
      '#building-prototype-root button:hover{background:#455649} #building-prototype-root button:focus-visible,#bp-canvas:focus-visible{outline:2px solid #f4d77d;outline-offset:2px}',
      '#building-prototype-root button[aria-pressed=true]{background:#655d3d;border-color:#e0c46e;color:#fff1b0}',
      '.bp-top{position:absolute;left:16px;right:16px;top:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;pointer-events:none}',
      '.bp-top>*{pointer-events:auto}.bp-brand{background:#202e27ed;padding:9px 15px;border:1px solid #65735b;border-radius:7px}.bp-brand strong{font-size:19px;letter-spacing:2px}.bp-brand small{display:block;color:#c4c9b6}',
      '.bp-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.bp-panel{position:absolute;background:#202e27f2;border:1px solid #65735b;border-radius:7px;padding:12px;overflow:auto}',
      '#bp-palette{left:16px;top:104px;bottom:98px;width:196px}.bp-panel h2{font-size:14px;color:#d8c991;margin:9px 0 7px}.bp-tools{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
      '#building-prototype-root .bp-tool{padding:5px 3px;font-size:12px;text-align:center;min-width:0}.bp-tool canvas{display:block;margin:auto;width:64px;height:48px}.bp-tool small{display:block;color:#b9c3ad}',
      '#bp-inspector{right:16px;top:104px;width:210px;max-height:calc(100% - 202px)}.bp-muted{font-size:12px;color:#bfc7b5}.bp-value{white-space:pre-line;margin:7px 0 12px}.bp-action{width:100%;margin:3px 0}',
      '.bp-bottom{position:absolute;left:228px;right:242px;bottom:16px;background:#202e27f2;border:1px solid #65735b;border-radius:7px;padding:10px 14px}#bp-status{min-height:21px;margin-top:7px;color:#efe0a7}',
      '#bp-pawns button{min-width:86px;background:#24392feF}#bp-pawns small{display:block;font-size:11px;color:#c7d2bf}',
      '@media(max-width:900px){#bp-palette{width:154px}.bp-bottom{left:182px;right:204px}#bp-inspector{width:176px}.bp-top{gap:5px}.bp-brand strong{font-size:15px}.bp-tool canvas{width:52px}}',
      '@media(max-height:680px){#bp-palette,#bp-inspector{top:85px}.bp-tool canvas{height:34px}.bp-panel{padding:8px}}'
    ].join('')+'</style>'+
      '<canvas id="bp-canvas" tabindex="0" aria-label="建造地图；方向键选格，回车选择或放置，WASD移动镜头"></canvas>'+
      '<header class="bp-top"><div class="bp-brand"><strong>远日点 · 房间试建</strong><small>两间房，从每一格开始</small></div><div id="bp-pawns" class="bp-row"></div><div class="bp-row"><button id="bp-demo">双房间示范</button><button id="bp-empty">空地重建</button></div></header>'+
      '<aside id="bp-palette" class="bp-panel" aria-label="建筑目录"></aside>'+
      '<aside id="bp-inspector" class="bp-panel"><h2>殖民地</h2><div id="bp-probe" class="bp-value"></div><select id="bp-weather" aria-label="环境场景"><option value="clear">晴天 · 14°C</option><option value="rain">下雨 · 8°C</option><option value="cold">寒潮 · −12°C</option><option value="hot">热浪 · 38°C</option></select><h2>当前选择</h2><div id="bp-detail" class="bp-value"></div><div id="bp-actions"></div><h2>建造操作</h2><div class="bp-muted">墙 / 导线：拖出直线<br>地板：拖出矩形<br>R 旋转 · Esc 取消<br>方向键选格 · Enter 放置<br>右键下令 · 中键拖动镜头<br>滚轮缩放 · Home 适配视野</div><p class="bp-muted">此处进度只保留到关闭页面。</p></aside>'+
      '<footer class="bp-bottom"><div class="bp-row"><button id="bp-pause" aria-pressed="false">暂停</button><button id="bp-speed">速度 ×1</button><button id="bp-grid" aria-pressed="false">网格 V</button><button id="bp-roof" aria-pressed="false">屋顶 H</button><button id="bp-power" aria-pressed="false">电力 P</button><button id="bp-demolish" aria-pressed="false">拆除</button><select id="bp-layer" aria-label="拆除图层"><option value="structure">建筑层</option><option value="floor">地板层</option><option value="conduit">导线层</option></select><button id="bp-rotate">旋转 R</button></div><div id="bp-status" role="status" aria-live="polite"></div></footer>';
    document.body.classList.add('bp-active');document.body.appendChild(root);
    var $=function(id){return root.querySelector('#'+id);},canvas=$('bp-canvas'),ctx=canvas.getContext('2d');
    function message(value){$('bp-status').textContent=value;}
    function resultMessage(r,success){message(r.ok?success:(reasons[r.why]||('无法执行：'+r.why)));return r.ok;}
    function focusMap(){canvas.focus({preventScroll:true});}
    function clearTool(){tool=null;demolition=false;drag=null;updateToolButtons();}
    function choose(bid){tool=bid;demolition=false;drag=null;updateToolButtons();focusMap();message(M.DEFS[bid].label+'：选择位置放置，R 旋转');}
    function updateToolButtons(){
      root.querySelectorAll('[data-bid]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.bid===tool));});
      $('bp-demolish').setAttribute('aria-pressed',String(demolition));
    }
    var groups=[['结构',['bl_wall','bl_gate','bl_floor']],['生活',['bl_bed','bl_clinic','bl_dining_table','bl_dining_chair']],['工作',['bl_lab','bl_kitchen','bl_workshop','bl_storage_shelf']],['电力',['bl_wood_generator','bl_conduit']]];
    groups.forEach(function(group){
      var heading=document.createElement('h2');heading.textContent=group[0];$('bp-palette').appendChild(heading);
      var list=document.createElement('div');list.className='bp-tools';$('bp-palette').appendChild(list);
      group[1].forEach(function(bid){
        var d=M.DEFS[bid],button=document.createElement('button');button.className='bp-tool';button.dataset.bid=bid;button.setAttribute('aria-pressed','false');
        var icon=document.createElement('canvas');icon.width=128;icon.height=96;icon.setAttribute('aria-hidden','true');button.appendChild(icon);
        var name=document.createElement('span');name.textContent=d.label;button.appendChild(name);
        var size=document.createElement('small');size.textContent=d.w+' × '+d.h+' 格';button.appendChild(size);
        button.addEventListener('click',function(){choose(bid);});list.appendChild(button);
        var g=icon.getContext('2d');g.translate(64,48);D.drawIcon(g,bid,0,Math.min(72/d.w,76/d.h));
      });
    });
    var statuses={idle:'空闲',moving:'赶路',sleeping:'睡眠',sitting:'休息',working:'工作',building:'建造'};
    function pawnButtons(){
      $('bp-pawns').textContent='';
      state.pawns.forEach(function(p){var b=document.createElement('button');b.dataset.pawn=p.id;b.addEventListener('click',function(){selectedPawn=p.id;refresh();focusMap();});$('bp-pawns').appendChild(b);});
    }
    pawnButtons();
    function selectedObject(){return state.objects.concat(state.blueprints).find(function(o){return o.uid===selectedUid;});}
    function actionFor(o){if(!o)return null;if(o.bid==='bl_bed'||o.bid==='bl_clinic')return 'sleep';if(o.bid==='bl_dining_chair')return 'sit';if(['bl_lab','bl_kitchen','bl_workshop'].indexOf(o.bid)>=0)return 'work';return null;}
    function send(action,target){var r=M.command(state,selectedPawn,action,target);resultMessage(r,'命令已下达');refresh();return r;}
    function refresh(){
      var p=state.pawns.find(function(q){return q.id===selectedPawn;}),o=selectedObject();
      root.dataset.rooms=String(state.rooms.length);root.dataset.blueprints=String(state.blueprints.length);root.dataset.pawns=String(state.pawns.length);
      $('bp-probe').textContent=state.rooms.length+' 间封闭房间 · '+state.pawns.length+' 位居民\n'+state.blueprints.length+' 项待建 · 室外 '+Math.round(state.ambient)+'°C';
      root.querySelectorAll('[data-pawn]').forEach(function(b){var q=state.pawns.find(function(t){return t.id===b.dataset.pawn;});b.textContent=q.name+' · '+(statuses[q.status]||q.status);b.setAttribute('aria-pressed',String(q.id===selectedPawn));});
      var detail=(p?p.name+' · '+(statuses[p.status]||p.status):'选择一位居民');
      if(p&&typeof p.workEfficiency==='number')detail+='\n'+(p.sheltered?'屋顶庇护':'室外暴露')+' · 效率 '+Math.round(p.workEfficiency*100)+'%';
      if(o){var d=M.DEFS[o.bid],r=M.footprint(o.bid,o.rotation);detail+='\n'+d.label+' · '+r.w+' × '+r.h+' 格 · '+o.rotation*90+'°';
        if(actionFor(o)==='work')detail+='\n'+(o.powered?'已通电':'未通电');
        var room=state.rooms.find(function(room){return room.cells.some(function(c){return c.gx===o.gx&&c.gy===o.gy;});});
        detail+='\n'+(room?'室内 · '+Math.round(room.temp)+'°C':'室外');
      }else detail+='\n点击家具查看；右键地面移动';
      $('bp-detail').textContent=detail;
      var actions=$('bp-actions'),action=actionFor(o),signature=(o?o.uid:'')+':'+(action||'');
      if(actions.dataset.signature!==signature){actions.dataset.signature=signature;actions.textContent='';
        if(action){var b=document.createElement('button');b.className='bp-action';b.textContent={sleep:'让选中居民睡觉',sit:'让选中居民就座',work:'让选中居民工作'}[action];b.addEventListener('click',function(){send(action,o.uid);focusMap();});actions.appendChild(b);}
        var move=document.createElement('button');move.className='bp-action';move.textContent='移动到光标格';move.addEventListener('click',function(){send('move',hover);focusMap();});actions.appendChild(move);
        var cancel=document.createElement('button');cancel.className='bp-action';cancel.textContent='取消居民当前命令';cancel.addEventListener('click',function(){send('cancel');focusMap();});actions.appendChild(cancel);
      }
      document.title='房间试建 · '+state.rooms.length+' 间房 · 远日点';
    }
    function fit(){
      var cells=[];state.objects.forEach(function(o){cells=cells.concat(M.cellsOf(o));});
      if(!cells.length)cells=[{gx:8,gy:8},{gx:25,gy:23}];
      var xs=cells.map(function(c){return c.gx;}),ys=cells.map(function(c){return c.gy;});
      var minX=Math.min.apply(null,xs)*G-2*G,maxX=(Math.max.apply(null,xs)+1)*G+2*G,minY=Math.min.apply(null,ys)*G-2*G,maxY=(Math.max.apply(null,ys)+1)*G+2*G;
      var left=width<900?182:228,right=width<900?204:242,top=96,bottom=120;
      camera.z=Math.max(.25,Math.min(1.35,(width-left-right)/(maxX-minX),(height-top-bottom)/(maxY-minY)));
      camera.x=left+(width-left-right)/2-(minX+maxX)/2*camera.z;camera.y=top+(height-top-bottom)/2-(minY+maxY)/2*camera.z;
    }
    function resize(){var rect=canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;var first=!width;width=rect.width;height=rect.height;var dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(first)fit();}
    function reset(demo){state=M.createState(demo);$('bp-weather').value='clear';selectedPawn=state.pawns[0].id;selectedUid=null;clearTool();pawnButtons();fit();refresh();message(demo?'双房间示范：选居民，再右键床、椅子或工作台试用':'空地就绪。先铺地板和家具，留好通道，再围墙与门。');}
    $('bp-demo').addEventListener('click',function(){reset(true);});$('bp-empty').addEventListener('click',function(){reset(false);});
    $('bp-weather').addEventListener('change',function(){state.weather=this.value==='rain'?'rain':'clear';state.ambient={clear:14,rain:8,cold:-12,hot:38}[this.value];M.rebuild(state);refresh();message('环境已切换；打开屋顶视图，观察室内外差别。');});
    function toggle(name){if(name==='grid')grid=!grid;if(name==='roof')roof=!roof;if(name==='power')power=!power;$('bp-'+name).setAttribute('aria-pressed',String({grid:grid,roof:roof,power:power}[name]));}
    ['grid','roof','power'].forEach(function(name){$('bp-'+name).addEventListener('click',function(){toggle(name);});});
    function togglePause(){paused=!paused;$('bp-pause').setAttribute('aria-pressed',String(paused));$('bp-pause').textContent=paused?'继续':'暂停';}
    $('bp-pause').addEventListener('click',togglePause);
    $('bp-speed').addEventListener('click',function(){speed=speed%3+1;$('bp-speed').textContent='速度 ×'+speed;});
    function rotate(){if(tool){rotation=(rotation+1)%4;message(M.DEFS[tool].label+' · '+rotation*90+'°');}}
    $('bp-rotate').addEventListener('click',rotate);
    $('bp-layer').addEventListener('change',function(){layer=this.value;});
    $('bp-demolish').addEventListener('click',function(){tool=null;demolition=!demolition;updateToolButtons();focusMap();message('拆除模式：只移除选定图层。Esc 取消');});
    function cellAt(e){var rect=canvas.getBoundingClientRect();return {gx:Math.floor((e.clientX-rect.left-camera.x)/camera.z/G),gy:Math.floor((e.clientY-rect.top-camera.y)/camera.z/G)};}
    function selectCell(){var pawn=state.pawns.find(function(p){return Math.hypot(p.x-(hover.gx+.5)*G,p.y-(hover.gy+.5)*G)<G*.7;});if(pawn)selectedPawn=pawn.id;var obj=M.objectAt(state,hover.gx,hover.gy);selectedUid=obj?obj.uid:null;refresh();}
    function dragCells(a,b){var cells=[],x,y;if(tool==='bl_floor'){for(y=Math.min(a.gy,b.gy);y<=Math.max(a.gy,b.gy);y++)for(x=Math.min(a.gx,b.gx);x<=Math.max(a.gx,b.gx);x++)cells.push({gx:x,gy:y});}
      else if(tool==='bl_wall'||tool==='bl_conduit'||demolition){if(Math.abs(b.gx-a.gx)>=Math.abs(b.gy-a.gy)){for(x=Math.min(a.gx,b.gx);x<=Math.max(a.gx,b.gx);x++)cells.push({gx:x,gy:a.gy});}else for(y=Math.min(a.gy,b.gy);y<=Math.max(a.gy,b.gy);y++)cells.push({gx:a.gx,gy:y});}
      else cells=[b];return cells.filter(function(c){return c.gx>=0&&c.gy>=0&&c.gx<45&&c.gy<45;});}
    function apply(cells){var okay=0,why='';cells.forEach(function(c){var r=demolition?M.demolish(state,c.gx,c.gy,layer):M.place(state,tool,c.gx,c.gy,rotation,false);if(r.ok)okay++;else why=r.why;});
      message(okay?(demolition?'已拆除 ':'已安排 ')+okay+' 格 / 项'+(why?'；部分位置不可用':''):(reasons[why]||('无法放置：'+why)));refresh();}
    canvas.addEventListener('contextmenu',function(e){e.preventDefault();});
    canvas.addEventListener('pointerdown',function(e){hover=cellAt(e);focusMap();
      if(e.button===2){e.preventDefault();if(tool||demolition){clearTool();message('已取消建造');}else{var obj=M.objectAt(state,hover.gx,hover.gy),a=actionFor(obj);if(a){selectedUid=obj.uid;send(a,obj.uid);}else send('move',hover);}return;}
      if(e.button===1||(e.button===0&&e.altKey)){e.preventDefault();drag={pan:true,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);return;}
      if(e.button!==0)return;
      if(tool||demolition){drag={start:hover,end:hover};canvas.setPointerCapture(e.pointerId);}else selectCell();
    });
    canvas.addEventListener('pointermove',function(e){hover=cellAt(e);if(!drag)return;if(drag.pan){camera.x+=e.clientX-drag.x;camera.y+=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;}else drag.end=hover;});
    canvas.addEventListener('pointerup',function(e){if(drag&&!drag.pan&&(tool||demolition))apply(dragCells(drag.start,cellAt(e)));drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
    canvas.addEventListener('pointercancel',function(){drag=null;});
    canvas.addEventListener('wheel',function(e){e.preventDefault();var rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,old=camera.z;camera.z=Math.max(.25,Math.min(2.5,old*Math.exp(-e.deltaY*.001)));camera.x=x-(x-camera.x)*camera.z/old;camera.y=y-(y-camera.y)*camera.z/old;},{passive:false});
    function keydown(e){if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;var k=e.key.toLowerCase(),dirs={arrowleft:[-1,0],arrowright:[1,0],arrowup:[0,-1],arrowdown:[0,1]};
      if(k==='escape'){clearTool();message('已取消建造');}else if(k==='r')rotate();else if(k==='v')toggle('grid');else if(k==='h')toggle('roof');else if(k==='p')toggle('power');else if(k==='home'){fit();e.preventDefault();}
      else if(k===' '&&e.target===canvas){togglePause();e.preventDefault();}
      else if(dirs[k]&&e.target===canvas){e.preventDefault();hover.gx=Math.max(0,Math.min(44,hover.gx+dirs[k][0]));hover.gy=Math.max(0,Math.min(44,hover.gy+dirs[k][1]));var at=M.objectAt(state,hover.gx,hover.gy);message('光标 '+hover.gx+', '+hover.gy+' · '+(at?M.DEFS[at.bid].label:'空地')+' · Enter 选择或放置');}
      else if(e.target===canvas&&{w:1,a:1,s:1,d:1}[k]){e.preventDefault();camera.x+=({a:1,d:-1}[k]||0)*G;camera.y+=({w:1,s:-1}[k]||0)*G;}
      else if(k==='enter'&&e.target===canvas){e.preventDefault();if(tool||demolition)apply([hover]);else selectCell();}
    }
    window.addEventListener('keydown',keydown);window.addEventListener('resize',resize);
    function loadPeople(){if(!APH.Sprites||!APH.Humanoid||!APH.SPRITE_DATA)return;for(var face=0;face<4;face++)['walk','idle','prone'].forEach(function(cycle){var name='hum_'+face+'_nopack_'+cycle,src=APH.SPRITE_DATA[name];if(!src)return;var layout=APH.Humanoid.sheetLayout(name);APH.Sprites.define(name,{src:src,cols:layout.cols,count:layout.count,fps:layout.fps,baseline:cycle==='prone'?[248,248,249,198][face]:248,contentH:cycle==='prone'?[122,138,102,124][face]:(cycle==='idle'?236:240)});});APH.Sprites.loadAll();}
    function frame(now){if(stopped)return;var dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(!paused)M.tick(state,dt*speed);
      var dpr=width?canvas.width/width:1;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#394737';ctx.fillRect(0,0,width,height);ctx.setTransform(dpr*camera.z,0,0,dpr*camera.z,dpr*camera.x,dpr*camera.y);
      var placement=tool?Object.assign({bid:tool,gx:hover.gx,gy:hover.gy,rotation:rotation},M.canPlace(state,tool,hover.gx,hover.gy,rotation)):null;
      D.drawWorld(ctx,state,{grid:grid,roof:roof,power:power,selectedUid:selectedUid,selectedPawnId:selectedPawn,hover:hover,placement:placement,dragCells:drag&&!drag.pan?dragCells(drag.start,drag.end):null,demolishLayer:demolition?layer:null,time:state.clock});
      if(now-lastUI>200){refresh();lastUI=now;}frameId=requestAnimationFrame(frame);
    }
    resize();refresh();loadPeople();message('先选居民，再右键床、椅子或工作台。选“空地重建”从头造一遍。');frameId=requestAnimationFrame(frame);
    active={getState:function(){return state;},snapshot:function(){return M.snapshot(state);},reset:reset,command:send,stop:function(){stopped=true;cancelAnimationFrame(frameId);window.removeEventListener('keydown',keydown);window.removeEventListener('resize',resize);document.body.removeChild(root);document.body.classList.remove('bp-active');document.title=previousTitle;active=null;}};
    return active;
  }
  return {boot:boot,getState:function(){return active&&active.getState();},snapshot:function(){return active&&active.snapshot();}};
})();
