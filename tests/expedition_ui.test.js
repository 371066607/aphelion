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
      setAttribute:function(k,v){ n[k]=String(v); }, focus:function(){ n.focused=true; }};
    Object.defineProperty(n,'firstChild',{get:function(){ return n.children[0]||null; }});
    Object.defineProperty(n,'lastChild',{get:function(){ return n.children[n.children.length-1]||null; }});
    return n;
  }
  var body=node('body');
  return {body:body,createElement:node,getElementById:function(id){ return byId[id]||null; },
    addEventListener:function(k,f){ events[k]=f; }};
}

test('expeditionUI 编组只提交健康队员与显式补给目标', function(){
  var oldDoc=document, oldState=APH.state, oldUI=APH.UI, oldObjectives=APH.CFG.expedition.objectives;
  var doc=fakeDocument(), got=null;
  try{
    global.document=doc;
    var commands={};
    APH.UI={registerCommands:function(map){ Object.keys(map||{}).forEach(function(k){ commands[k]=map[k]; }); },
      cmd:function(name){ var f=commands[name]; return f&&f.apply(null,[].slice.call(arguments,1)); }};
    if(!APH.ExpeditionUI) require('../src/expedition_ui.js');
    APH.CFG.expedition.objectives={survey:{name:'勘测',description:'记录异常',target:3,itemIds:['it_relic']}};
    APH.UI.registerCommands({beginExpedition:function(payload){ got=payload; return {ok:true}; }});
    var s={mode:'running',scene:'home',colony:{rulesVersion:1,buildings:[],zones:[],logistics:{reservations:[]}},
      meta:{res:{food:2},residents:[{id:'ok',name:'健康'},{id:'down',name:'倒地',downed:true}]},
      entities:[{id:'berry',type:APH.CFG.entType.DROPPED,itemId:'it_berry',n:3,x:1,y:1}]};
    APH.state=s;
    if(!APH.ExpeditionUI.open(s)) throw new Error('面板未打开');
    function all(node,out){out=out||[];out.push(node);(node.children||[]).forEach(function(c){all(c,out);});return out;}
    if(!all(doc.body).some(function(n){return n.tagName==='LABEL'&&n.textContent.indexOf('可用 5')>=0;}))
      throw new Error('面板应显示实体加兼容库存的实际可用粮');
    doc.getElementById('expeditionSupplyFood').value='4';
    if(doc.getElementById('expeditionSupplyFood').max!=='5') throw new Error('面板应显示实体加兼容库存的实际可用粮');
    doc.getElementById('expeditionObjective').value='survey';
    var res=APH.ExpeditionUI.submit(s);
    if(!res.ok || !got || got.memberIds.length!==1 || got.memberIds[0]!=='ok') throw new Error('健康队员筛选未传给命令');
    if(got.supply.food!==4 || got.objective!=='survey') throw new Error('补给或目标未显式传递');
    if(!got.context||got.context.entities!==s.entities) throw new Error('launch 应携带当前实体库存 context');
    if(s.mode!=='running') throw new Error('成功关闭没有恢复 modal manager 的运行状态');
  }finally{
    APH.ExpeditionUI.close(); APH.CFG.expedition.objectives=oldObjectives; global.document=oldDoc; APH.state=oldState; APH.UI=oldUI;
  }
});
