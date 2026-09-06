/* 建造幽灵：蓝图黏鼠标、吸到 48px 格、可放/不可放 */
'use strict';
const Colony = window.APH.Colony;
const CFG = window.APH.CFG;

test('placementGhost: 导出并吸到格网', () => {
  if (!Colony.placementGhost) throw new Error('缺失 APH.Colony.placementGhost');
  const g = CFG.GRID || 48;
  const ghost = Colony.placementGhost('bl_campfire', 100, 100, [], { te_stonecutting: true }, { wood: 99, stone: 99 });
  if (!ghost) throw new Error('应返回幽灵');
  if (ghost.x !== Math.round(100 / g) * g || ghost.y !== Math.round(100 / g) * g)
    throw new Error('应吸附格心, 实际: ' + ghost.x + ',' + ghost.y);
  if (ghost.w !== g || ghost.h !== g) throw new Error('1x1 占位应为 ' + g + ', 实际: ' + ghost.w + 'x' + ghost.h);
});

test('placementGhost: 同一鼠标微移仍停在同一格', () => {
  const g = CFG.GRID || 48;
  const a = Colony.placementGhost('bl_wall', g + 2, g + 3, [], { te_stonecutting: true }, { stone: 99 });
  const b = Colony.placementGhost('bl_wall', g + 10, g - 4, [], { te_stonecutting: true }, { stone: 99 });
  if (a.x !== b.x || a.y !== b.y) throw new Error('同格内移动不应跳格: ' + a.x + ',' + a.y + ' vs ' + b.x + ',' + b.y);
});

test('placementGhost: 离核心太近不可放', () => {
  const hab = CFG.HAB || { x: 1100, y: 1100 };
  const ghost = Colony.placementGhost('bl_house', hab.x + 20, hab.y, [], {}, { wood: 99, stone: 99, mineral: 99 });
  if (ghost.ok) throw new Error('核心旁居住舱应不可放');
  if (!ghost.why) throw new Error('不可放应带原因');
});

test('placementGhost: 空地可放', () => {
  const ghost = Colony.placementGhost('bl_house', 600, 600, [], {}, { wood: 99, stone: 99, mineral: 99 });
  if (!ghost.ok) throw new Error('远处空地应可放, 原因: ' + ghost.why);
});

test('placementGhost: 重叠不可放', () => {
  const ghost = Colony.placementGhost('bl_house', 600, 600, [{ id: 'bl_house', x: 600, y: 600 }], {}, { wood: 99, stone: 99, mineral: 99 });
  if (ghost.ok) throw new Error('重叠应不可放');
});

test('placementGhost: 无建筑模式返回 null', () => {
  if (Colony.placementGhost(null, 100, 100, [], {}, {}) != null) throw new Error('无 bid 应 null');
});
