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

test('ruins: applyDamageWithShield 能量护盾吸收与穿透', () => {
  const applyDmg = APH.Combat.applyDamageWithShield;
  A(typeof applyDmg === 'function', 'applyDamageWithShield 必须为函数');

  const sentry = { hp: 50, maxHp: 50, shield: 40, maxShield: 40 };

  // 1. 伤害 25 被护盾完全吸收，HP 不掉
  const r1 = applyDmg(sentry, 25);
  A(sentry.shield === 15, '护盾应吸收 25 剩余 15, 实际: ' + sentry.shield);
  A(sentry.hp === 50, '本体 HP 不应受损');
  A(r1.absorbed === 25, '吸收量应为 25');
  A(r1.shieldBroken === false, '护盾尚未破损');

  // 2. 伤害 30 破盾且溢出穿透到本体 HP (15 削盾 + 15 扣血)
  const r2 = applyDmg(sentry, 30);
  A(sentry.shield === 0, '护盾应被击破归零');
  A(sentry.hp === 35, '本体 HP 应扣除 15 剩余 35, 实际: ' + sentry.hp);
  A(r2.shieldBroken === true, 'shieldBroken 应为 true');

  // 3. 破盾后直接扣本体 HP
  const r3 = applyDmg(sentry, 20);
  A(sentry.hp === 15, '本体 HP 应剩余 15');
});

test('ruins: shieldRechargeTick 脱战4s后护盾回充', () => {
  const rechargeTick = APH.Combat.shieldRechargeTick;
  A(typeof rechargeTick === 'function', 'shieldRechargeTick 必须为函数');

  const sentry = { hp: 35, shield: 0, maxShield: 40, lastHitTime: 0 };

  // 2s 未达到 4s 延迟，不回充
  rechargeTick(sentry, 2.0);
  A(sentry.shield === 0, '未达 4s 延迟不应回充');

  // 再过 1.5s 累计 3.5s 仍不回充
  rechargeTick(sentry, 1.5);
  A(sentry.shield === 0, '累计 3.5s 仍不回充');

  // 再过 0.5s (累计 4.0s >= 4s)，开始回充 (8/s * 0.5s = 4 护盾)
  rechargeTick(sentry, 0.5);
  A(sentry.shield === 4, '脱战 4s 后应回充 4 护盾, 实际: ' + sentry.shield);

  // 持续回充至 maxShield (40) 封顶
  rechargeTick(sentry, 10.0);
  A(sentry.shield === 40, '护盾回充应封顶 maxShield 40, 实际: ' + sentry.shield);
});

test('ruins: hackTerminal 学识技能加成与成功/警报分支', () => {
  const hack = APH.Res.hackTerminal;
  A(typeof hack === 'function', 'hackTerminal 必须为函数');

  const terminal = { type: 'ancient_terminal', hacked: false };
  const scholar = { id: 'player', name: '学者指挥官', skills: { sk_lore: 6 } };

  // 1. 成功分支 (rng = 0.1)
  const r1 = hack(terminal, scholar, () => 0.1);
  A(r1 && r1.success === true, '高学识+低随机值应破译成功');
  A(terminal.hacked === true, '破译成功后 hacked 应为 true');
  A(terminal.alarm === false, '成功后 alarm 应为 false');

  // 2. 失败分支与警报触发 (rng = 0.99)
  const unhackedTerm = { type: 'ancient_terminal', hacked: false };
  const novice = { id: 'player', name: '新手', skills: { sk_lore: 1 } };
  const r2 = hack(unhackedTerm, novice, () => 0.99);
  A(r2.success === false, '高随机值应破译失败');
  A(r2.alarm === true, '破译失败应触发警报');
  A(unhackedTerm.alarm === true, '终端 alarm 属性应置为 true');

  // 3. 成功率随 sk_lore 提升
  const rNoviceChance = hack({ hacked: false }, novice, () => 0).chance;
  const rScholarChance = hack({ hacked: false }, scholar, () => 0).chance;
  A(rScholarChance > rNoviceChance, '高学识成功率必须大于低学识');
});

test('ruins: openArtifactVault 开箱产出古代蓝图与史前核心', () => {
  const openVault = APH.Planet.openArtifactVault;
  A(typeof openVault === 'function', 'openArtifactVault 必须为函数');

  const vault = { type: 'ancient_vault', opened: false };
  const res = openVault(vault);

  A(res && res.opened === true, '开箱应成功');
  A(vault.opened === true, '遗物箱状态应置为 opened');
  A(Array.isArray(res.drops), '应产出掉落物数组');
  A(res.drops.some(d => d.id === 'it_ancient_blueprint'), '必须掉落古代蓝图残卷');
  A(res.drops.some(d => d.id === 'it_ancient_core'), '必须掉落史前高能核心');

  // 再次开启无效
  const r2 = openVault(vault);
  A(r2 && r2.opened === false, '已开启的遗物箱不可再次开箱');
});

test('ruins: 终极科技与史前永恒发电机零燃料200W发电', () => {
  const bldg = APH.Colony.get('bl_ancient_generator');
  A(bldg, 'bl_ancient_generator 必须注册于 BUILDINGS');
  A(bldg.reqTech === 'te_heavy_plasma', '应依赖 te_heavy_plasma 终极科技');

  // 电网结算测试: 孤立的发电机并网产生 200W 电力
  const buildings = [
    { id: 'bl_ancient_generator', x: 500, y: 500, dead: false },
    { id: 'bl_conduit', x: 548, y: 500 },
    { id: 'bl_turret', x: 596, y: 500 }
  ];
  const powerRes = APH.Colony.powerSettle(buildings, {}, {}, 30);
  A(powerRes && powerRes.prodW >= 200, '史前永恒发电机应提供至少 200W 电力, 实际: ' + (powerRes && powerRes.prodW));
});
