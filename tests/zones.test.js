'use strict';
const Colony = window.APH.Colony;
const CFG = window.APH.CFG;
const G = CFG.GRID || 48;

test('#174 zones: cellsFromBox 吸附格网', () => {
  if (typeof Colony.cellsFromBox !== 'function') throw new Error('缺失 cellsFromBox');
  const cells = Colony.cellsFromBox(G + 2, G + 3, G * 2 + 10, G + 5);
  if (!cells.length) throw new Error('应产出格子');
  cells.forEach(function(c){
    if (c.x % G !== 0 || c.y % G !== 0) throw new Error('应在格心: ' + JSON.stringify(c));
  });
});

test('#174 zones: addStockpileZone 写入 type=stockpile', () => {
  const cells = [{ x: G, y: G }, { x: G * 2, y: G }];
  const r = Colony.addStockpileZone([], cells);
  if (!r.zone || r.zone.type !== 'stockpile') throw new Error('应是仓储区');
  if (r.zones.length !== 1) throw new Error('应追加一区');
  if ((r.zone.forbid || []).length !== 0) throw new Error('默认禁止列表空');
});

test('#174 zones: 禁止口粮则不允许食物', () => {
  const z = { type: 'stockpile', filter: 'all', forbid: ['food'] };
  if (Colony.zoneAllowsItem(z, 'it_food')) throw new Error('禁止口粮后不应收 it_food');
  if (!Colony.zoneAllowsItem(z, 'it_wood')) throw new Error('仍应收木材');
});

test('#174 zones: findBestStorageSpot 优先仓储格', () => {
  const zones = Colony.addStockpileZone([], [{ x: 600, y: 600 }]).zones;
  const pad = [{ id: 'bl_landing_pad', x: 1100, y: 1340 }];
  const spot = Colony.findBestStorageSpot('it_wood', pad, [], { x: 580, y: 580 }, zones);
  if (!spot || Math.abs(spot.x - 600) > 1) throw new Error('应送到仓储格, 实际: ' + JSON.stringify(spot));
});
