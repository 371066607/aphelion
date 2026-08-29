/* tests/agri.test.js — 深度农耕生态系统测试 (Tickets #28~#32)
   纯注册式测试文件，由 run.js 自动加载。 */
'use strict';

test('soil: soilFertilityAt 根据地形返回对应肥力倍率', function(){
  var Colony = APH.Colony;
  var LAKE = APH.CFG.LAKE || { x: 1660, y: 1560, r: 148 };

  // 1. 湖畔沃土 -> 1.40
  var fRich = Colony.soilFertilityAt(LAKE.x, LAKE.y);
  if (fRich !== 1.40) throw new Error('湖畔应为沃土 (1.40)，实际: ' + fRich);

  // 2. 核心平原普通土 -> 1.00
  var fNormal = Colony.soilFertilityAt(1100, 1100);
  if (fNormal !== 1.00) throw new Error('平原中心应为普通土 (1.00)，实际: ' + fNormal);

  // 3. 边陲贫瘠砂砾 -> 0.70
  var fPoor = Colony.soilFertilityAt(100, 100);
  if (fPoor !== 0.70) throw new Error('边缘荒地应为贫瘠土 (0.70)，实际: ' + fPoor);
});

test('zones: createGrowingZone 圈定种植区并生成网格单元', function(){
  var Colony = APH.Colony;
  var zone = Colony.createGrowingZone('zone_1', 1000, 1000, 2, 3, 'crop_glow_shroom');
  if (zone.id !== 'zone_1') throw new Error('id 错误');
  if (zone.cropType !== 'crop_glow_shroom') throw new Error('cropType 错误');
  if (!Array.isArray(zone.cells) || zone.cells.length !== 6) {
    throw new Error('2x3 种植区应生成 6 个网格单元，实际: ' + (zone.cells && zone.cells.length));
  }
  if (!zone.cells[0].fertility) throw new Error('单元格应计算肥力');
});

test('zones: removeGrowingZone 正确移除种植区', function(){
  var zones = [{ id: 'z1' }, { id: 'z2' }];
  var filtered = APH.Colony.removeGrowingZone(zones, 'z1');
  if (filtered.length !== 1 || filtered[0].id !== 'z2') {
    throw new Error('removeGrowingZone 移除失败');
  }
});


