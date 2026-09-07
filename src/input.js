/* ============================================================
   Aphelion · input.js — 统一输入动作分发器与活动上下文栈 (ADR-19)
   挂载: window.APH.Input
   ============================================================ */
window.APH = window.APH || {};

APH.Input = (function(){
  'use strict';

  var contextStack = ['game'];
  var actionHandlers = {}; // actionName -> array of handlers
  var keyState = {}; // code -> boolean

  function currentContext(){
    if(contextStack.length === 1 && window.APH && window.APH.state && window.APH.state.mode === 'intro'){
      return 'intro';
    }
    return contextStack[contextStack.length - 1] || 'game';
  }

  function pushContext(ctxId){
    if(!ctxId) return;
    var idx = contextStack.indexOf(ctxId);
    if(idx >= 0) contextStack.splice(idx, 1);
    contextStack.push(ctxId);
  }

  function popContext(ctxId){
    if(!ctxId){
      if(contextStack.length > 1) return contextStack.pop();
      return contextStack[0];
    }
    var idx = contextStack.lastIndexOf(ctxId);
    if(idx > 0){ // 保护栈底 'game'
      return contextStack.splice(idx, 1)[0];
    }
    return null;
  }

  function resetContext(baseCtx){
    contextStack = [baseCtx || 'game'];
  }

  function hasContext(ctxId){
    return contextStack.indexOf(ctxId) >= 0;
  }

  function getContextStack(){
    return contextStack.slice();
  }

  function onAction(actionName, handler){
    if(!actionName || typeof handler !== 'function') return;
    actionHandlers[actionName] = actionHandlers[actionName] || [];
    actionHandlers[actionName].push(handler);
  }

  function registerActions(map){
    if(!map) return;
    Object.keys(map).forEach(function(act){
      onAction(act, map[act]);
    });
  }

  function offAction(actionName, handler){
    if(!actionName || !actionHandlers[actionName]) return;
    if(!handler){
      delete actionHandlers[actionName];
      return;
    }
    var list = actionHandlers[actionName];
    var idx = list.indexOf(handler);
    if(idx >= 0) list.splice(idx, 1);
  }

  function dispatchAction(actionName, payload){
    if(!actionName) return false;
    var list = actionHandlers[actionName];
    if(!list || !list.length) return false;
    var consumed = false;
    for(var i = 0; i < list.length; i++){
      try {
        var res = list[i](payload);
        if(res !== false) consumed = true;
      } catch(err){
        console.error('Action handler error [' + actionName + ']:', err);
      }
    }
    return consumed;
  }

  function resolveAction(code, ctx){
    var bindings = (window.APH && window.APH.CFG && window.APH.CFG.keybindings) || {};
    var activeCtx = ctx || currentContext();

    // 1. 优先查当前上下文
    if(bindings[activeCtx] && bindings[activeCtx][code]){
      return bindings[activeCtx][code];
    }

    // 2. 如果是模态上下文（modal:*），阻断下不回退到 game 基础动作
    if(activeCtx.indexOf('modal:') === 0){
      if(code === 'Escape') return 'CLOSE_MODAL';
      return null;
    }

    // 3. 回退查默认 game 上下文
    if(bindings.game && bindings.game[code]){
      return bindings.game[code];
    }

    // 4. 全局兜底动作
    if(code === 'Escape') return 'CANCEL_OR_CLOSE';
    return null;
  }

  function dispatchKey(code, type, rawEvent){
    var isDown = (type !== 'keyup');
    keyState[code] = isDown;

    if(window.APH && window.APH.state && window.APH.state.keys){
      window.APH.state.keys[code] = isDown;
    }

    if(!isDown) return false;

    var action = resolveAction(code);
    if(action){
      return dispatchAction(action, { code: code, event: rawEvent });
    }
    return false;
  }

  /* ---------- 指针输入 (ADR-33) ----------
     键盘早就走这套分发器了, 指针却还是 main.js 里裸绑的几百行监听。
     这里补上对称的一半: 监听器与「当前工具 / 当前上下文」的判定收在
     input.js, 具体做什么仍留在 main.js 的处理器里 —— 那是玩法, 不是输入。 */
  var toolProvider = null;
  function setToolProvider(fn){ toolProvider = (typeof fn === 'function') ? fn : null; }
  /* 当前指针工具: 规划工具(砍/采/搬/拆) > 建造蓝图 > 默认选择 */
  function currentTool(){
    if(!toolProvider) return 'select';
    try { return toolProvider() || 'select'; }
    catch(err){ console.error('toolProvider error:', err); return 'select'; }
  }

  var POINTER_ACTIONS = {
    pointerdown: 'POINTER_DOWN',
    pointermove: 'POINTER_MOVE',
    pointerup:   'POINTER_UP',
    contextmenu: 'POINTER_CONTEXT'
  };

  /* 模态打开时指针不喂给世界 —— 与按键在 modal:* 上下文里的阻断规则一致。
     但 pointerup/move 必须放行, 否则模态在拖拽中途弹出会让拖拽永远结束不了。 */
  function pointerBlocked(type){
    if(type === 'pointerup' || type === 'pointermove') return false;
    return currentContext().indexOf('modal:') === 0;
  }

  function dispatchPointer(type, e){
    var action = POINTER_ACTIONS[type];
    if(!action) return false;
    if(pointerBlocked(type)) return false;
    return dispatchAction(action, {
      type: type,
      event: e,
      button: e ? e.button : 0,
      pointerId: e ? e.pointerId : 0,
      clientX: e ? e.clientX : 0,
      clientY: e ? e.clientY : 0,
      tool: currentTool(),
      context: currentContext()
    });
  }

  var pointerBound = false;
  function bindPointer(el){
    if(pointerBound || !el || !el.addEventListener) return;
    pointerBound = true;
    Object.keys(POINTER_ACTIONS).forEach(function(type){
      el.addEventListener(type, function(e){ dispatchPointer(type, e); });
    });
  }

  var bound = false;
  function bind(){
    if(bound || typeof addEventListener === 'undefined') return;
    bound = true;

    addEventListener('keydown', function(e){
      if(e.defaultPrevented) return;
      var consumed = dispatchKey(e.code, 'keydown', e);
      if(consumed && e.preventDefault && (e.code.indexOf('Arrow') === 0 || e.code === 'Space')){
        e.preventDefault();
      }
    });

    addEventListener('keyup', function(e){
      dispatchKey(e.code, 'keyup', e);
    });
  }

  return {
    currentContext: currentContext,
    pushContext: pushContext,
    popContext: popContext,
    resetContext: resetContext,
    hasContext: hasContext,
    getContextStack: getContextStack,
    onAction: onAction,
    registerActions: registerActions,
    offAction: offAction,
    dispatchAction: dispatchAction,
    resolveAction: resolveAction,
    dispatchKey: dispatchKey,
    bind: bind,
    bindPointer: bindPointer,
    dispatchPointer: dispatchPointer,
    setToolProvider: setToolProvider,
    currentTool: currentTool,
    getKeyState: function(code){ return !!keyState[code]; }
  };
})();
