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
for (const f of ['config.js', 'utils.js', 'input.js', 'ui.js']) {
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
assert('模态打开自动同步 APH.Input 上下文栈', window.APH.Input.currentContext() === 'modal:diplomacy');

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
assert('所有模态关闭后，APH.Input 上下文栈回到 game', window.APH.Input.currentContext() === 'game');

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
createStubElement('ordersRow');
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
assert('orders 默认已注册并能打开', UI.open('orders') === true);
assert('orders 作为抽屉模态不阻断主循环', UI.hasActiveModal() === false);
UI.close('orders');

// 10. ADR-28 补丁: 指挥官(玩家)行出现在命令表
window.APH.Res = window.APH.Res || { SKILLS: ['sk_build','sk_farm'], SKILL_NAMES: {} };
assert('prioGridHtml 已导出', typeof UI.prioGridHtml === 'function');
const gridHtml = UI.prioGridHtml({ residents: [] });
assert('命令表应含指挥官行', gridHtml.indexOf('指挥官') !== -1);
assert('指挥官单元格应带 data-prio-r="player"', gridHtml.indexOf('data-prio-r="player"') !== -1);

// 11. ADR-28 / Ticket #156: 通用检查器 (Inspector) HTML 纯函数断言
assert('inspectorHtml 已导出', typeof UI.inspectorHtml === 'function');

const mockState = {
  hp: 85, o2: 90, scene: 'home',
  meta: {
    playerNeeds: { food: 75, rest: 80, isSleeping: false, downed: false },
    residents: [
      { id: 'rs_1', name: '阿尔法', job: 'bl_farm', trait: '勤勉', mood: 88, food: 70, rest: 95 }
    ]
  },
  colony: { buildings: [] }
};

// 1) 指挥官检查器
const playerHtml = UI.inspectorHtml({ type: 'player' }, mockState);
assert('指挥官检查器含标题', playerHtml.indexOf('⭐ 指挥官(你)') !== -1);
assert('指挥官检查器含生命', playerHtml.indexOf('85') !== -1);
assert('指挥官检查器含饱食', playerHtml.indexOf('75') !== -1);

// 2) 居民检查器
const resHtml = UI.inspectorHtml({
  type: 'resident',
  entity: { id: 'rs_1', rid: 'rs_1', name: '阿尔法', job: 'bl_farm' }
}, mockState);
assert('居民检查器含姓名', resHtml.indexOf('阿尔法') !== -1);
assert('居民检查器含特质', resHtml.indexOf('勤勉') !== -1);

// 3) 自然实体/树木检查器
const floraHtml = UI.inspectorHtml({
  type: 'flora',
  entity: { id: 'fl_1', kind: 'tree', hp: 20, maxHp: 30 }
}, mockState);
assert('树木检查器含名称', floraHtml.indexOf('红树') !== -1);
assert('树木检查器含耐久', floraHtml.indexOf('20/30') !== -1);

// 4) 地表/地形检查器
const terrainHtml = UI.inspectorHtml({
  type: 'terrain', x: 1000, y: 1000
}, mockState);
assert('地表检查器非空且含坐标', terrainHtml.indexOf('1000') !== -1);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
