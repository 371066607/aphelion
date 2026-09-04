/* tests/ruins.test.js — 远征古代遗迹与机械哨兵测试集 (ADR-24 / Spec #138)
   纯函数模式，由 tests/run.js 自动加载运行 */
'use strict';

function A(ok, msg) { if (!ok) throw new Error(msg || 'assert failed'); }

test('ruins: generateAncientRuins 确定性生成遗迹复合体', () => {
  const genRuins = APH.Planet.generateAncientRuins;
  A(typeof genRuins === 'function', 'generateAncientRuins 必须为函数');

  const specT2 = { tier: 2, seed: 4242 };
  const r1 = genRuins(specT2, 4242);
  A(r1, 'T2 星球应成功生成古代遗迹');
  A(typeof r1.cx === 'number' && typeof r1.cy === 'number', '遗迹应有中心坐标');
  A(Array.isArray(r1.walls) && r1.walls.length > 8, '应包含环状远古石壁');
  A(r1.gate && typeof r1.gate.x === 'number', '应包含能量闸门');
  A(r1.gate.locked === true, '初始能量门应为锁定状态');
  A(r1.gate.hp === 80, '能量门基础耐久应为 80');
  A(r1.terminal && typeof r1.terminal.x === 'number', '内部应生成古代数据终端');
  A(r1.vault && typeof r1.vault.x === 'number', '深处应生成远古遗物箱');
  A(Array.isArray(r1.sentries) && r1.sentries.length >= 1, '遗迹内应包含至少1名机械哨兵守卫');

  // 确定性验证 (ADR-5: 同 seed 同序列)
  const r2 = genRuins(specT2, 4242);
  A(r1.cx === r2.cx && r1.cy === r2.cy, '同 seed 遗迹中心必须完全一致');
  A(r1.gate.x === r2.gate.x && r1.gate.y === r2.gate.y, '同 seed 闸门位置必须完全一致');
  A(r1.walls.length === r2.walls.length, '同 seed 石壁数量必须完全一致');

  // 异 seed 异坐标
  const r3 = genRuins({ tier: 2, seed: 9999 }, 9999);
  A(r1.cx !== r3.cx || r1.cy !== r3.cy, '异 seed 遗迹位置应不同');
});

test('ruins: 能量闸门可被伤害击破或按 E 解除', () => {
  const damageGate = APH.Planet.damageAncientGate;
  A(typeof damageGate === 'function', 'damageAncientGate 必须为函数');

  const gate = { hp: 80, locked: true, broken: false };

  // 等离子攻击伤害扣耐久
  const r1 = damageGate(gate, 30);
  A(gate.hp === 50, '闸门受击 30 耐久应剩余 50, 实际: ' + gate.hp);
  A(gate.locked === true, '未破门时仍应处于锁定状态');

  // 伤害击穿 (剩余50，造成60伤害)
  const r2 = damageGate(gate, 60);
  A(gate.hp === 0, '耐久应归零');
  A(gate.locked === false, '击穿后锁定应解除');
  A(gate.broken === true, '击穿后 broken 应为 true');
  A(r2.breached === true, '击穿返回值 breached 应为 true');
});
