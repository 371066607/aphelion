#!/usr/bin/env node
/* ui_modals.test.js — UI 模态生命周期接缝单元测试 (独立入口)
   验证 ADR-18 (docs/adr/0009-modal-management-seam.md):
   - APH.UI.open / close / toggle / closeActive / hasActiveModal / getActiveModal
   - 全屏阻断模态互斥与 state.mode 自动挂起/恢复不变量
   - 抽屉模态不影响 state.mode
   - 异常输入与空 DOM 节点安全兜底 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- 极简 DOM 桩 ---------- */
const elements = {};
function createStubElement(id){
  const el = {
    id: id,
    style: { display: 'none' },
    textContent: '',
    innerHTML: '',
    appendChild(){},
    classList: {
      add(){}, remove(){}, toggle(){}
    }
  };
  elements[id] = el;
  return el;
}

global.window = global;
global.document = {
  getElementById: (id) => elements[id] || null,
  createElement: (tag) => ({ style: {}, classList: { add(){}, remove(){} }, appendChild(){} })
};

/* ---------- 加载被测模块 ---------- */
const SRC = path.join(__dirname, '..', 'src');
for (const f of ['config.js', 'utils.js', 'ui.js']) {
  new Function(fs.readFileSync(path.join(SRC, f), 'utf-8'))();
}

const UI = window.APH.UI;
if (!UI) {
  console.error('✗ 无法加载 APH.UI');
  process.exit(1);
}

let pass = 0, fail = 0;
function assert(desc, cond){
  if(cond){
    pass++;
    console.log(`  ✓ ${desc}`);
  } else {
    fail++;
    console.error(`  ✗ ${desc}`);
  }
}

console.log('--- UI Modals Seam Tests ---');

/* 准备环境状态 */
window.APH.state = {
  mode: 'running',
  clock: 100,
  entities: []
};

// 准备测试 DOM 节点
createStubElement('mockDiplomacy');
createStubElement('mockRoster');
createStubElement('mockBuildCatalog');

// 注册测试模态
let renderedDip = 0, renderedRoster = 0, renderedBuild = 0;
UI.registerModal('diplomacy', {
  elId: 'mockDiplomacy',
  isOverlay: true,
  render: (s) => { renderedDip++; }
});
UI.registerModal('roster', {
  elId: 'mockRoster',
  isOverlay: true,
  render: (s) => { renderedRoster++; }
});
UI.registerModal('buildCatalog', {
  elId: 'mockBuildCatalog',
  isOverlay: false,
  render: (s) => { renderedBuild++; }
});

// 1. 初始状态
assert('初始无活动模态', UI.getActiveModal() === null);
assert('初始 hasActiveModal 为 false', UI.hasActiveModal() === false);
assert('初始 closeActive 返回 false', UI.closeActive() === false);

// 2. 打开全屏模态
const openRes = UI.open('diplomacy');
assert('UI.open(diplomacy) 返回 true', openRes === true);
assert('diplomacy DOM display 显示', elements.mockDiplomacy.style.display === '');
assert('diplomacy 触发了 render', renderedDip === 1);
assert('活动模态为 diplomacy', UI.getActiveModal() === 'diplomacy');
assert('hasActiveModal 为 true', UI.hasActiveModal() === true);
assert('全屏模态打开自动将 state.mode 挂起为 paused', window.APH.state.mode === 'paused');

// 3. 全屏模态互斥打开另一个全屏模态 (roster)
const openRoster = UI.open('roster');
assert('UI.open(roster) 返回 true', openRoster === true);
assert('前序模态 diplomacy 被自动隐藏', elements.mockDiplomacy.style.display === 'none');
assert('roster DOM display 显示', elements.mockRoster.style.display === '');
assert('活动模态切换为 roster', UI.getActiveModal() === 'roster');
assert('state.mode 依然保持 paused', window.APH.state.mode === 'paused');

// 4. 关闭活动全屏模态
const closeRes = UI.close('roster');
assert('UI.close(roster) 返回 true', closeRes === true);
assert('roster DOM 隐藏', elements.mockRoster.style.display === 'none');
assert('活动模态清空为 null', UI.getActiveModal() === null);
assert('hasActiveModal 回到 false', UI.hasActiveModal() === false);
assert('所有全屏模态关闭后，state.mode 自动恢复为 running', window.APH.state.mode === 'running');

// 5. 抽屉式模态 (buildCatalog, isOverlay: false)
UI.open('buildCatalog');
assert('buildCatalog DOM display 显示', elements.mockBuildCatalog.style.display === '');
assert('抽屉模态打开不会将 state.mode 改为 paused', window.APH.state.mode === 'running');
assert('抽屉模态不算阻断全屏模态 (hasActiveModal 为 false)', UI.hasActiveModal() === false);
UI.close('buildCatalog');
assert('buildCatalog 正常关闭', elements.mockBuildCatalog.style.display === 'none');
assert('state.mode 保持 running', window.APH.state.mode === 'running');

// 6. closeActive (Esc 统一关闭)
UI.open('diplomacy');
assert('准备关闭: diplomacy 打开且 mode=paused', window.APH.state.mode === 'paused');
const closedActive = UI.closeActive();
assert('closeActive() 返回 true', closedActive === true);
assert('diplomacy 被关闭', elements.mockDiplomacy.style.display === 'none');
assert('state.mode 恢复为 running', window.APH.state.mode === 'running');
assert('再次调用 closeActive 返回 false', UI.closeActive() === false);

// 7. toggle 切换
const t1 = UI.toggle('diplomacy');
assert('toggle 打开返回 true', t1 === true && elements.mockDiplomacy.style.display === '');
const t2 = UI.toggle('diplomacy');
assert('toggle 关闭返回 false', t2 === false && elements.mockDiplomacy.style.display === 'none');
assert('state.mode 正确恢复 running', window.APH.state.mode === 'running');

// 8. 边界与防御测试
assert('打开未知模态返回 false 且不崩溃', UI.open('unknown_modal') === false);
assert('关闭未知模态返回 false 且不崩溃', UI.close('unknown_modal') === false);
UI.registerModal('missingDomModal', { elId: 'nonExistentId', isOverlay: true });
assert('DOM 节点不存在时 open 安全返回 false', UI.open('missingDomModal') === false);

// 9. 默认 6 大核心模态注册就绪
createStubElement('codex');
createStubElement('techMap');
createStubElement('diplomacyOverlay');
createStubElement('buildRow');
createStubElement('resPanel');

assert('codex 默认已注册并能打开', UI.open('codex') === true);
UI.close('codex');
assert('techMap 默认已注册并能打开', UI.open('techMap') === true);
UI.close('techMap');
assert('diplomacy 默认已注册并能打开', UI.open('diplomacy') === true);
UI.close('diplomacy');
assert('buildCatalog 默认已注册并能打开', UI.open('buildCatalog') === true);
UI.close('buildCatalog');
assert('roster 默认已注册并能打开', UI.open('roster') === true);
UI.close('roster');

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
