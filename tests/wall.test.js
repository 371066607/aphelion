/* T2 墙与闸门 (ADR-13: 墙=不可通行障碍/闸门=可通行+敌延迟)
   seams: APH.Colony.{canPlace, BUILDINGS 目录, wallCells, wallGrid} + 渲染纯函数
   期望值手工推导。 */
'use strict';
const C = window.APH.Colony;
const U = window.APH.U;

/* ---------- 建筑目录 ---------- */
test('BUILDINGS: bl_wall/bl_gate 注册, cells=[1,1], 有 costRes', () => {
  const w = C.get('bl_wall'), g = C.get('bl_gate');
  if (!w) throw new Error('缺 bl_wall');
  if (!g) throw new Error('缺 bl_gate');
  const c = w.cells || [1, 1];
  if (c[0] !== 1 || c[1] !== 1) throw new Error('墙应1x1格: '+JSON.stringify(c));
  if (!w.costRes || !w.costRes.stone) throw new Error('墙应耗石料: '+JSON.stringify(w.costRes));
  if (!g.costRes) throw new Error('闸门应有建材: '+JSON.stringify(g.costRes));
  if (!w.reqTech) throw new Error('墙应有科技挂靠: '+w.reqTech);
});

/* ---------- canPlace 墙/闸门特殊规则 ---------- */
test('canPlace: 墙豁免离核心130px(贴家围起来)', () => {
  // CFG.HAB={x:1100,y:1100}; 普通建筑 1130,1100 拒绝; 墙同位置应允许
  const r = C.canPlace([], 999, 'bl_wall', 1130, 1100, { stone: 99 });
  if (!r.ok) throw new Error('墙应可贴核心: '+r.why);
});

test('canPlace: 墙与墙相邻允许(围一圈)', () => {
  const walls = [{ id: 'bl_wall', x: 600, y: 600 }];
  const r = C.canPlace(walls, 999, 'bl_wall', 648, 600, { stone: 99 });   // 右邻一格(48px)
  if (!r.ok) throw new Error('墙-墙相邻应允许: '+r.why);
});

test('canPlace: 墙与其他建筑重叠仍拒绝', () => {
  const r = C.canPlace([{ id: 'bl_mine', x: 600, y: 600 }], 999, 'bl_wall', 615, 608, { stone: 99 });
  if (r.ok) throw new Error('墙压建筑应拒绝');
});

test('canPlace: 闸门可放墙线上(与墙同类相邻)', () => {
  const walls = [{ id: 'bl_wall', x: 600, y: 600 }];
  const r = C.canPlace(walls, 999, 'bl_gate', 648, 600, { stone: 99, wood: 99 });
  if (!r.ok) throw new Error('闸门贴墙应允许: '+r.why);
});

test('canPlace: 同格墙叠放拒绝', () => {
  const r = C.canPlace([{ id:'bl_wall', x:600, y:600 }], 999, 'bl_wall', 600, 600, { stone: 99 });
  if (r.ok) throw new Error('同格叠放应拒绝: '+r.why);
});

/* ---------- 退款: 素材建筑退建材(非研/矿) ---------- */
test('refundOf: 墙拆退石料半价(5石→2石)', () => {
  const w = C.get('bl_wall');
  const r = C.refundResOf(w);
  if (!r || r.stone !== 2) throw new Error('墙应退石料2: '+JSON.stringify(r));
});
test('refundOf: 闸门拆退石+木半价', () => {
  const g = C.get('bl_gate');
  const r = C.refundResOf(g);
  if (!r || r.stone !== 1 || r.wood !== 2) throw new Error('闸门应退石1木2: '+JSON.stringify(r));
});
test('refundOf: 普通建筑(矿井)仍走研/矿退款不变', () => {
  // bl_mine: cost=0 costMineral=30 → refundResOf 应 null(不抢退款), 旧退款语义保留
  const m = C.get('bl_mine');
  const rr = C.refundResOf(m);
  if (rr !== null) throw new Error('有矿成本的建筑应不走实物退款: '+JSON.stringify(rr));
  const r = C.refundOf(m);
  if (r !== 22) throw new Error('矿井退款应22(45半价): '+r);
  const rm = C.refundMineralOf(m);
  if (rm !== 15) throw new Error('矿井退矿应15: '+rm);
});

/* ---------- 格子坐标辅助 ---------- */
test('wallCells: 屏幕坐标→格中心(48px)', () => {
  // 600=格中心(12.5格? 不是: 600/48=12.5 → round=13 → 624)。用非边界值:
  // 620=12.9→13→624; 590=12.29→12→576
  const c = C.wallCells(620, 590);
  if (c.x !== 624 || c.y !== 576) throw new Error('应格中心: '+JSON.stringify(c));
  const c2 = C.wallCells(624, 624);   // 已是格心: 保持
  if (c2.x !== 624 || c2.y !== 624) throw new Error('格心应不动: '+JSON.stringify(c2));
});

test('wallGrid: 用于拖拽连续放置的行列', () => {
  // 从 a 拖到 b: 输出沿线格子序列
  const cells = C.wallLine({ x: 600, y: 600 }, { x: 792, y: 600 });
  if (!Array.isArray(cells) || cells.length !== 5) throw new Error('5格横线: '+JSON.stringify(cells));
  const cells2 = C.wallLine({ x: 600, y: 600 }, { x: 600, y: 792 });
  if (cells2.length !== 5) throw new Error('5格竖线: '+cells2.length);
});

/* ---------- 拼接检测(渲染用纯函数) ---------- */
test('wallNeighbors: 四邻墙判定', () => {
  const walls = [
    { id: 'bl_wall', x: 600, y: 600 },    // 中心
    { id: 'bl_wall', x: 648, y: 600 },    // 右
    { id: 'bl_wall', x: 600, y: 552 },    // 上
  ];
  const n = C.wallNeighbors(walls, 600, 600);
  if (!n.east) throw new Error('右邻应true: '+JSON.stringify(n));
  if (!n.north) throw new Error('上邻应true: '+JSON.stringify(n));
  if (n.west || n.south) throw new Error('左/下应false: '+JSON.stringify(n));
});

test('wallNeighbors: 闸门不算墙邻(独立物)', () => {
  const walls = [
    { id: 'bl_wall', x: 600, y: 600 },
    { id: 'bl_gate', x: 648, y: 600 },   // 闸门在右: 不算相邻墙
  ];
  const n = C.wallNeighbors(walls, 600, 600);
  if (n.east) throw new Error('闸门不应算墙邻: '+JSON.stringify(n));
});
