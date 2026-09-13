/* 动态远征 UI：测试内自带极小 DOM 桩，纯注册式，不需要模板。 */

if(!window.APH.Storage) require('../src/storage.js');

function fakeDocument(){
  var byId={}, events={};
  function index(c){ if(c.id) byId[c.id]=c; (c.children||[]).forEach(index); }
  function node(tag){
    var listeners={}, n={tagName:tag.toUpperCase(),style:{},children:[],parentNode:null,textContent:'',value:'',checked:false,disabled:false,
      appendChild:function(c){ c.parentNode=n; n.children.push(c); index(c); return c; },
      removeChild:function(c){ var i=n.children.indexOf(c); if(i>=0)n.children.splice(i,1); c.parentNode=null; },
      addEventListener:function(k,f){ (listeners[k]||(listeners[k]=[])).push(f); },
      dispatchEvent:function(ev){ev=ev||{};if(!ev.target)ev.target=n;(listeners[ev.type]||[]).forEach(function(f){f(ev);});},
      click:function(){n.dispatchEvent({type:'click',target:n,preventDefault:function(){}});},
      setAttribute:function(k,v){ n[k]=String(v); }, focus:function(){ n.focused=true; }};
    Object.defineProperty(n,'firstChild',{get:function(){ return n.children[0]||null; }});
    Object.defineProperty(n,'lastChild',{get:function(){ return n.children[n.children.length-1]||null; }});
    return n;
  }
  var body=node('body');
  return {body:body,createElement:node,getElementById:function(id){ return byId[id]||null; },
    addEventListener:function(k,f){ events[k]=f; },
    keydown:function(key,target){var prevented=false;if(events.keydown)events.keydown({key:key,target:target,preventDefault:function(){prevented=true;}});return prevented;}};
}

test('expeditionUI 编组只提交健康队员与显式补给目标', function(){
  var oldDoc=document, oldState=APH.state, oldUI=APH.UI, oldObjectives=APH.CFG.expedition.objectives;
  var oldNewPlanet=APH.Planet.newObservedPlanet,generated=0;
  var doc=fakeDocument(), got=null;
  try{
    global.document=doc;
    var commands={};
    APH.UI={registerCommands:function(map){ Object.keys(map||{}).forEach(function(k){ commands[k]=map[k]; }); },
      cmd:function(name){ var f=commands[name]; return f&&f.apply(null,[].slice.call(arguments,1)); }};
    if(!APH.ExpeditionUI) require('../src/expedition_ui.js');
    APH.CFG.expedition.objectives={survey:{name:'勘测',description:'记录异常',target:3,itemIds:['it_relic']}};
    APH.UI.registerCommands({beginExpedition:function(payload){ got=payload; return {ok:true}; }});
    APH.Planet.newObservedPlanet=function(){generated++;return oldNewPlanet.apply(APH.Planet,arguments);};
    var s={mode:'running',scene:'home',colony:{rulesVersion:1,buildings:[],zones:[],logistics:{reservations:[]}},
      meta:{res:{food:2},residents:[{id:'ok',name:'健康'},{id:'down',name:'倒地',downed:true}]},
      entities:[{id:'berry',type:APH.CFG.entType.DROPPED,itemId:'it_berry',n:3,x:1,y:1}]};
    APH.state=s;
    var beforeAtlas=JSON.stringify(s.meta.atlas||null),beforePlanet=s.meta.currentPlanet;
    if(!APH.ExpeditionUI.open(s)) throw new Error('面板未打开');
    function all(node,out){out=out||[];out.push(node);(node.children||[]).forEach(function(c){all(c,out);});return out;}
    if(!all(doc.body).some(function(n){return n.tagName==='LABEL'&&n.textContent.indexOf('可用 5')>=0;}))
      throw new Error('面板应显示实体加兼容库存的实际可用粮');
    doc.getElementById('expeditionSupplyFood').value='4';
    if(doc.getElementById('expeditionSupplyFood').max!=='5') throw new Error('面板应显示实体加兼容库存的实际可用粮');
    doc.getElementById('expeditionObjective').value='survey';
    var destination=doc.getElementById('expeditionDestination');
    if(!destination||destination.tagName!=='SELECT')throw new Error('目的地必须使用原生 select');
    destination.value='unknown';
    if(generated!==0||JSON.stringify(s.meta.atlas||null)!==beforeAtlas||s.meta.currentPlanet!==beforePlanet)
      throw new Error('打开面板不得生成星球或改写 Atlas');
    var start=all(doc.body).filter(function(n){return n.tagName==='BUTTON'&&n.textContent==='出发';}).slice(-1)[0];
    if(!start||!start.focused)throw new Error('打开后应保留出发按钮焦点');
    start.click();
    if(!got || got.memberIds.length!==1 || got.memberIds[0]!=='ok') throw new Error('鼠标出发未提交健康队员');
    if(got.supply.food!==4 || got.objective!=='survey') throw new Error('补给或目标未显式传递');
    if(!got.destination||got.destination.kind!=='unknown')throw new Error('原生目的地选择未提交');
    if(!got.context||got.context.entities!==s.entities) throw new Error('launch 应携带当前实体库存 context');
    if(s.mode!=='running') throw new Error('成功关闭没有恢复 modal manager 的运行状态');

    got=null;APH.ExpeditionUI.open(s);
    destination=doc.getElementById('expeditionDestination');destination.value='unknown';
    if(doc.keydown('Enter',destination)||got)throw new Error('目的地下拉框内 Enter 应保留浏览器原生选择行为');
    start=all(doc.body).filter(function(n){return n.tagName==='BUTTON'&&n.textContent==='出发';}).slice(-1)[0];
    if(!doc.keydown('Enter',start)||!got||got.destination.kind!=='unknown')throw new Error('纯键盘 Enter 未经同一命令提交目的地');
  }finally{
    APH.ExpeditionUI.close(); APH.Planet.newObservedPlanet=oldNewPlanet;APH.CFG.expedition.objectives=oldObjectives; global.document=oldDoc; APH.state=oldState; APH.UI=oldUI;
  }
});

test('#202 expeditionUI 必须重选目的地，并可提交已知 observed/legacy 星球身份', function(){
  var oldDoc=document,oldState=APH.state,oldUI=APH.UI,oldExpeditionUI=APH.ExpeditionUI,doc=fakeDocument(),got=null,commands={};
  try{
    global.document=doc;
    APH.UI={registerCommands:function(map){Object.keys(map||{}).forEach(function(k){commands[k]=map[k];});},
      cmd:function(name){var f=commands[name];return f&&f.apply(null,[].slice.call(arguments,1));}};
    delete require.cache[require.resolve('../src/expedition_ui.js')];delete APH.ExpeditionUI;require('../src/expedition_ui.js');
    APH.UI.registerCommands({beginExpedition:function(payload){got=payload;return {ok:true};}});
    var observed=APH.Planet.newObservedPlanet(0x20204),legacy=APH.Planet.fallbackPlanet(0xABC),meta={res:{food:0},residents:[{id:'r1',name:'甲'}]};
    APH.Atlas.record(meta,observed,100);APH.Atlas.record(meta,legacy,200);
    var s={mode:'running',scene:'home',paused:false,colony:{rulesVersion:1,buildings:[],zones:[],logistics:{reservations:[]}},
      meta:meta,entities:[]};
    APH.state=s;
    function all(node,out){out=out||[];out.push(node);(node.children||[]).forEach(function(c){all(c,out);});return out;}
    function startButton(){return all(doc.body).filter(function(n){return n.tagName==='BUTTON'&&n.textContent==='出发';}).slice(-1)[0];}

    APH.ExpeditionUI.open(s);
    var select=doc.getElementById('expeditionDestination');
    var labels=select.children.map(function(option){return option.textContent;});
    if(select.value!==''||labels[0]!=='请选择目的地'||labels.indexOf(observed.name+' · 已观测')<0||labels.indexOf(legacy.name+' · 旧版地图')<0)
      throw new Error('目的地列表没有明确提示或已知星类型: '+JSON.stringify(labels));
    var prevented=false;
    select.dispatchEvent({type:'keydown',key:'End',target:select,preventDefault:function(){prevented=true;}});
    if(!prevented||select.value!=='planet:'+legacy.id)throw new Error('End 键没有选择最后一个已知目的地');
    select.dispatchEvent({type:'keydown',key:'Home',target:select,preventDefault:function(){}});
    if(select.value!=='unknown')throw new Error('Home 键没有选择第一个可用目的地');
    select.value='';
    startButton().click();
    if(got)throw new Error('未选择目的地时不得调用出发命令');
    var error=all(doc.body).find(function(n){return n.textContent==='请选择远征目的地';});
    if(!error)throw new Error('未选择目的地应给出可恢复错误');

    select.value='planet:'+observed.id;startButton().click();
    if(!got||got.destination.kind!=='planet'||got.destination.planetId!==observed.id||got.destination.seed!==observed.seed)
      throw new Error('observed 已知星没有提交稳定身份: '+JSON.stringify(got));
    got=null;APH.ExpeditionUI.open(s);select=doc.getElementById('expeditionDestination');
    if(select.value!=='')throw new Error('返航后重新打开必须要求再次选择，不能沿用上次目的地');
    select.value='planet:'+legacy.id;startButton().click();
    if(!got||got.destination.planetId!==legacy.id||got.destination.seed!==legacy.seed)
      throw new Error('legacy 已知星没有提交原始 P ID/seed: '+JSON.stringify(got));
  }finally{APH.ExpeditionUI.close();APH.ExpeditionUI=oldExpeditionUI;global.document=oldDoc;APH.state=oldState;APH.UI=oldUI;}
});
