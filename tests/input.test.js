/* input.test.js — 统一输入动作分发器与上下文栈测试 (纯注册式, 进 run.js)
   验证 ADR-19 (docs/adr/0010-input-dispatcher-and-context-stack.md):
   - APH.Input.currentContext / pushContext / popContext / resetContext
   - 上下文栈隔离：模态打开时阻断游戏底层的按键映射
   - 动作订阅与派发：onAction / dispatchAction / dispatchKey */
'use strict';

test('input: 默认上下文为 game, 栈底保护不被弹出', () => {
  const Input = window.APH.Input;
  Input.resetContext();
  if (Input.currentContext() !== 'game') {
    throw new Error('初始上下文应为 game, got ' + Input.currentContext());
  }
  Input.popContext('game');
  if (Input.currentContext() !== 'game') {
    throw new Error('栈底 game 不应被弹出, got ' + Input.currentContext());
  }
});

test('input: pushContext 与 popContext 维持 LIFO 栈顺序', () => {
  const Input = window.APH.Input;
  Input.resetContext();
  Input.pushContext('modal:roster');
  if (Input.currentContext() !== 'modal:roster') {
    throw new Error('推入后当前上下文应为 modal:roster');
  }
  if (!Input.hasContext('modal:roster')) {
    throw new Error('hasContext 应为 true');
  }

  Input.pushContext('modal:confirm');
  if (Input.currentContext() !== 'modal:confirm') {
    throw new Error('推入子弹窗后当前应为 modal:confirm');
  }

  Input.popContext('modal:confirm');
  if (Input.currentContext() !== 'modal:roster') {
    throw new Error('弹出子弹窗后应回到 modal:roster, got ' + Input.currentContext());
  }

  Input.popContext('modal:roster');
  if (Input.currentContext() !== 'game') {
    throw new Error('弹出名册后应回到 game, got ' + Input.currentContext());
  }
});

test('input: resolveAction 在不同上下文中实现按键隔离', () => {
  const Input = window.APH.Input;
  Input.resetContext('game');

  // 1. game 上下文: E 为 INTERACT, J 为 FIRE_PLASMA, 空格暂停, 数字切倍速
  const actE = Input.resolveAction('KeyE');
  if (actE !== 'INTERACT') throw new Error('game 下 KeyE 应为 INTERACT, got ' + actE);

  const actJ = Input.resolveAction('KeyJ');
  if (actJ !== 'FIRE_PLASMA') throw new Error('game 下 KeyJ 应为 FIRE_PLASMA, got ' + actJ);

  const actSpace = Input.resolveAction('Space');
  if (actSpace !== 'TOGGLE_PAUSE') throw new Error('game 下 Space 应为 TOGGLE_PAUSE, got ' + actSpace);

  const actScale = Input.resolveAction('Digit2');
  if (actScale !== 'SET_TIME_SCALE_2') throw new Error('game 下 Digit2 应为 SET_TIME_SCALE_2, got ' + actScale);

  // 2. 切换至 modal:roster: Digit1 为 SET_PRIO_1, J 必须被阻断为 null(不能误射击!)
  Input.pushContext('modal:roster');
  const actDigit = Input.resolveAction('Digit1');
  if (actDigit !== 'SET_PRIO_1') throw new Error('roster 下 Digit1 应为 SET_PRIO_1, got ' + actDigit);

  const actJInModal = Input.resolveAction('KeyJ');
  if (actJInModal !== null) {
    throw new Error('roster 模态下 KeyJ(射击) 必须被阻断为 null, got ' + actJInModal);
  }

  // 3. Escape 在模态下统一为 CLOSE_MODAL
  const actEsc = Input.resolveAction('Escape');
  if (actEsc !== 'CLOSE_MODAL') throw new Error('模态下 Escape 应为 CLOSE_MODAL, got ' + actEsc);

  Input.popContext();
});

test('input: onAction 订阅与 dispatchAction / dispatchKey 触发', () => {
  const Input = window.APH.Input;
  Input.resetContext('game');

  let interactCount = 0;
  const handler = () => { interactCount++; };

  Input.onAction('INTERACT', handler);
  Input.dispatchAction('INTERACT');
  if (interactCount !== 1) throw new Error('dispatchAction 应触发 1 次, got ' + interactCount);

  // 通过物理键 KeyE 触发
  Input.dispatchKey('KeyE', 'keydown');
  if (interactCount !== 2) throw new Error('dispatchKey(KeyE) 应派发 INTERACT 触发 2 次, got ' + interactCount);

  // keyup 不应重复触发动作
  Input.dispatchKey('KeyE', 'keyup');
  if (interactCount !== 2) throw new Error('keyup 不应触发动作');

  // 取消订阅
  Input.offAction('INTERACT', handler);
  Input.dispatchKey('KeyE', 'keydown');
  if (interactCount !== 2) throw new Error('offAction 后不应再触发');
});
