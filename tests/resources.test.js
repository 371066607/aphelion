/* tests/resources.test.js — 原生自然生态与多材料资源模型测试
   纯注册式测试文件，由 run.js 自动加载。 */
'use strict';

test('resources: 基础自然原材料定义齐全', function(){
  var items = APH.CFG.items;
  if (!items.it_wood) throw new Error('缺失 it_wood (木材)');
  if (!items.it_stone) throw new Error('缺失 it_stone (石料)');
  if (!items.it_iron) throw new Error('缺失 it_iron (铁矿/钢铁)');
  if (!items.it_berry) throw new Error('缺失 it_berry (野果)');
  if (!items.it_herb) throw new Error('缺失 it_herb (草药)');
});

test('nature: generateFlora 程序化生成自然树木、矿脉与灌木', function(){
  var flora = APH.Colony.generateFlora(12345);
  if (!Array.isArray(flora) || flora.length < 15) {
    throw new Error('generateFlora 应生成至少 15 个自然生态实体，实际: ' + (flora && flora.length));
  }
  var hasTrees = flora.some(function(f){ return f.kind === 'tree'; });
  var hasIron = flora.some(function(f){ return f.kind === 'rock_iron'; });
  var hasStone = flora.some(function(f){ return f.kind === 'rock_stone'; });
  var hasBushes = flora.some(function(f){ return f.kind === 'bush_berry' || f.kind === 'bush_herb'; });

  if (!hasTrees) throw new Error('生态中应包含树木 (tree)');
  if (!hasIron) throw new Error('生态中应包含铁矿脉 (rock_iron)');
  if (!hasStone) throw new Error('生态中应包含石料岩石 (rock_stone)');
  if (!hasBushes) throw new Error('生态中应包含野生灌木 (bush_berry/bush_herb)');
});

test('nature: 采集作业推进与物理掉落产出', function(){
  var target = { id: 'tree_1', type: 'flora', kind: 'tree', hp: 30, maxHp: 30, x: 500, y: 500 };
  var resident = { id: 'rs_worker', skills: { sk_farm: 8 }, mood: 80, food: 80 };

  // 1. 模拟一次短砍伐工时 (dt=5 -> 约 11 进度 < 30)
  var result = APH.Colony.workOnFlora(target, resident, 5);
  if (result.done) throw new Error('HP 30 在短进度时未完成');
  if (target.hp >= 30) throw new Error('目标 HP 应被削减');

  // 2. 推进至完成 (dt=15 -> 约 33 进度 >= 剩余 HP)
  var finalResult = APH.Colony.workOnFlora(target, resident, 15);
  if (!finalResult.done) throw new Error('进度满应判定为完成');
  if (finalResult.dropItemId !== 'it_wood') throw new Error('砍树应掉落 it_wood，实际: ' + finalResult.dropItemId);
  if (finalResult.dropCount <= 0) throw new Error('掉落数量应 > 0');
});
