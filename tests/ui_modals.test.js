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
/* ADR-40 的通知落地要真的写进 DOM, 所以桩里得有 body 和可赋值的 style/textContent */
const appended = [];
global.document = {
  getElementById: (id) => elements[id] || null,
  createElement: (tag) => ({
    tag, style: {}, textContent: '', innerHTML: '',
    classList: { add(){}, remove(){} }, appendChild(){}, querySelector(){ return null; }
  }),
  body: { appendChild: (el) => { appended.push(el); } }
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
assert('指挥官检查器含娱乐条', playerHtml.indexOf('娱乐') !== -1);
assert('指挥官需求是进度条', playerHtml.indexOf('width:') !== -1);

// 2) 居民检查器
const resHtml = UI.inspectorHtml({
  type: 'resident',
  entity: { id: 'rs_1', rid: 'rs_1', name: '阿尔法', job: 'bl_farm' }
}, mockState);
assert('居民检查器含姓名', resHtml.indexOf('阿尔法') !== -1);
assert('居民检查器含特质', resHtml.indexOf('勤勉') !== -1);
assert('居民检查器含娱乐条', resHtml.indexOf('娱乐') !== -1);

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

// 12. ADR-29 / Ticket #161: 顶部殖民者头像栏 (Colonist Bar) HTML 纯函数断言
assert('colonistBarHtml 已导出', typeof UI.colonistBarHtml === 'function');
assert('renderColonistBar 已导出', typeof UI.renderColonistBar === 'function');

const barHtml = UI.colonistBarHtml(mockState.meta.residents, mockState);
assert('头像条包含指挥官卡片', barHtml.indexOf('data-pawn-id="player"') !== -1);
assert('头像条包含居民卡片', barHtml.indexOf('data-pawn-id="rs_1"') !== -1);
assert('头像条包含居民姓名', barHtml.indexOf('阿尔法') !== -1);

// 征召状态卡片标记
mockState.playerDrafted = true;
const draftedBarHtml = UI.colonistBarHtml(mockState.meta.residents, mockState);
assert('征召指挥官卡片带 drafted 样式', draftedBarHtml.indexOf('drafted') !== -1);
assert('征召卡片含武器角标', draftedBarHtml.indexOf('aph-card-badge') !== -1);

// 13. ADR-29 工作面板 (Roster) 中无论是否有其他居民，均展示指挥官行与专属角色卡
createStubElement('resBody');
createStubElement('resFood');
createStubElement('resMineral');
createStubElement('resLeather');
createStubElement('resMed');
createStubElement('resPop');

window.APH.state = {
  hp: 100, o2: 100, scene: 'home',
  meta: {
    residents: [], // 开局零居民
    playerNeeds: { food: 80, rest: 100 }
  }
};
UI.renderResPanel();
const bodyHtml = elements.resBody.innerHTML;
assert('开局零居民时工作面板应渲染指挥官角色卡', bodyHtml.indexOf('⭐ 指挥官 (你)') !== -1);
assert('开局零居民时工作面板应包含指挥官工作表', bodyHtml.indexOf('⭐ 指挥官(你)') !== -1);

/* ---------- ADR-39 命令表: 视图 → 控制器的唯一通道 ---------- */
console.log('--- ADR-39 Command Table ---');

/* 未注册的命令必须静默 no-op: 面板可能在 main 就绪前渲染 */
let threw = false;
try { UI.cmd('nope_not_registered', 1, 2); } catch(e){ threw = true; }
assert('未注册命令不抛错(静默 no-op)', threw === false);
assert('未注册命令返回 undefined', UI.cmd('nope_not_registered') === undefined);

/* 注册后按名派发, 参数原样透传, 返回值回传 */
let seen = null;
UI.registerCommands({ probe: function(a, b){ seen = [a, b]; return 'ok:' + a; } });
const ret = UI.cmd('probe', 'x', 7);
assert('已注册命令被调用且参数透传', JSON.stringify(seen) === JSON.stringify(['x', 7]));
assert('已注册命令的返回值原样回传', ret === 'ok:x');

/* registerCommands 可多次调用, 后注册的覆盖同名命令 */
UI.registerCommands({ probe: function(){ return 'second'; } });
assert('同名命令可被后注册的覆盖', UI.cmd('probe') === 'second');
assert('registerCommands 接受空参数不抛错', (function(){
  try { UI.registerCommands(); UI.registerCommands(null); return true; }
  catch(e){ return false; }
})());

/* 检查器面板发出的按钮必须走命令表, 不得直呼 APH.Main */
window.APH.state = {
  hp: 100, o2: 100, scene: 'home', selectedRid: null, playerDrafted: false,
  colony: { buildings: [] }, entities: [],
  meta: { residents: [], playerNeeds: { food: 80, rest: 100 } }
};
const inspHtml = UI.inspectorHtml() || '';
assert('检查器 HTML 不含 APH.Main', inspHtml.indexOf('APH.Main') === -1);
assert('检查器的征召按钮走 APH.UI.cmd', inspHtml.indexOf("APH.UI.cmd('togglePlayerDraft')") !== -1);

/* 命令表真的接得上: 模拟 main 注册后点按钮 */
let drafted = 0;
UI.registerCommands({ togglePlayerDraft: function(){ drafted++; } });
UI.cmd('togglePlayerDraft');
assert('检查器命令经命令表抵达实现', drafted === 1);

/* ---------- ADR-40 模拟层通知的落地点 ---------- */
console.log('--- ADR-40 Sim → UI via bus ---');

const U = window.APH.U;

/* notice: 文案与颜色都要落到飘字元素上 */
appended.length = 0;
U.emit('notice', { text: '⚠ 仓库被盗掠', color: '#ff9a9a' });
const ft = appended[appended.length - 1];
assert('notice 事件创建了飘字元素', !!ft);
assert('notice 的文案落到 DOM', ft && ft.textContent === '⚠ 仓库被盗掠');
assert('notice 的颜色落到 DOM', ft && ft.style.color === '#ff9a9a');

/* 飘字元素是复用的, 第二条只改内容不再新建 */
const beforeN = appended.length;
U.emit('notice', { text: '✔ 袭击被击退!', color: '#7dffab' });
assert('第二条 notice 复用同一个元素', appended.length === beforeN);
assert('第二条 notice 更新了文案', ft.textContent === '✔ 袭击被击退!');
assert('第二条 notice 更新了颜色', ft.style.color === '#7dffab');

/* hint: 空字符串要把提示条隐藏 */
createStubElement('hint');
U.emit('hint', { text: '⚠ 敌军来袭! 12s' });
assert('hint 事件落到提示条', elements.hint.textContent === '⚠ 敌军来袭! 12s');
assert('有内容时提示条可见', elements.hint.style.opacity === 1);
U.emit('hint', { text: '' });
assert('空 hint 清空提示条', elements.hint.textContent === '');
assert('空 hint 隐藏提示条', elements.hint.style.opacity === 0);

/* 畸形/缺失载荷不得让订阅者炸 —— U.emit 会吞异常, 所以直接查订阅函数本身 */
let noticeThrew = false;
try { U.emit('notice', null); U.emit('notice', {}); U.emit('hint', null); }
catch (e) { noticeThrew = true; }
assert('缺失载荷不抛错', noticeThrew === false);
assert('空载荷的 hint 视作清空', elements.hint.textContent === '');

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
