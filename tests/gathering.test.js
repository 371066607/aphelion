/* tests/gathering.test.js — 环世界式自动采集系统测试集 (ADR-28 / Spec #151)
   纯函数模式，由 tests/run.js 自动加载运行 */
'use strict';

function A(ok, msg) { if (!ok) throw new Error(msg || 'assert failed'); }

test('gathering: CFG.gathering 配置完整', () => {
  const G = APH.CFG.gathering;
  A(G, 'CFG.gathering 必须存在');
  A(G.searchRadius === 800, '搜索半径应为 800');
  A(G.regenTicks, 'regenTicks 必须存在');
  A(G.regenTicks.tree === 8, '树再生 8 跳');
  A(G.regenTicks.rock_iron === 12, '铁矿再生 12 跳');
  A(G.regenTicks.rock_stone === 10, '石块再生 10 跳');
  A(Array.isArray(G.typePriority), 'typePriority 必须为数组');
  A(G.typePriority[0] === 'tree', '优先类型首位为 tree');
});

test('gathering: workOnFlora 砍树推进与掉落', () => {
  const wof = APH.Colony.workOnFlora;
  A(typeof wof === 'function', 'workOnFlora 必须为函数');

  const tree = { kind: 'tree', hp: 30, maxHp: 30, dead: false };
  const farmer = { skills: { sk_farm: 5 }, mood: 80, food: 80 };

  // 推进 10 秒
  var res = wof(tree, farmer, 10);
  A(res.done === false, '未砍完时 done 应为 false');
  A(tree.hp < 30 && !isNaN(tree.hp), '树 HP 应减少, 实际: ' + tree.hp);

  // 推进剩余直到砍完
  var done = false;
  for(var i = 0; i < 30 && !done; i++){
    res = wof(tree, farmer, 10);
    done = res.done;
  }
  A(done === true, '多次推进后应砍完');
  A(res.dropItemId === 'it_wood', '树应掉落 it_wood');
  A(res.dropCount === 4, '掉落 4 个木材');
  A(tree.dead === true, '树应标记 dead');
});

test('gathering: workOnFlora 采浆果与矿石掉落', () => {
  // 浆果丛
  const bush = { kind: 'bush_berry', hp: 15, maxHp: 15, dead: false };
  const r1 = APH.Colony.workOnFlora(bush, { skills: { sk_farm: 3 }, mood: 80, food: 80 }, 999);
  A(r1.done === true && r1.dropItemId === 'it_berry', '浆果丛应掉落 it_berry, got ' + r1.dropItemId);

  // 铁矿
  const iron = { kind: 'rock_iron', hp: 40, maxHp: 40, dead: false };
  const r2 = APH.Colony.workOnFlora(iron, { skills: { sk_craft: 3 }, mood: 80, food: 80 }, 999);
  A(r2.done === true && r2.dropItemId === 'it_iron', '铁矿应掉落 it_iron');
});

test('gathering: floraRespawnTick 再生系统', () => {
  const respTick = APH.Colony.floraRespawnTick;
  A(typeof respTick === 'function', 'floraRespawnTick 必须为函数');

  // 状态有 1 个待重生树（还剩 1 跳）
  var s = {
    floraRespawn: [
      { kind: 'tree', x: 1100, y: 1200, ticksLeft: 1 },
    ],
    entities: [],
    seed: 42,
  };

  // 推进 1 跳：应再生
  var out = respTick(s);
  A(s.floraRespawn.length === 0, '重生队列应清空');
  A(out.length === 1, '应生成 1 个新实体');
  A(out[0].kind === 'tree', '再生实体 kind 应为 tree');
  A(out[0].type === 'flora', '再生实体 type 应为 flora');
  A(out[0].hp > 0, '再生实体应有 HP');
  A(Math.abs(out[0].x - 1100) <= 200, '再生 x 应在 ±200px 范围内');
  A(Math.abs(out[0].y - 1200) <= 200, '再生 y 应在 ±200px 范围内');

  // 还剩 5 跳时不生成
  var s2 = { floraRespawn: [{ kind: 'rock_iron', x: 1000, y: 1100, ticksLeft: 5 }], entities: [], seed: 42 };
  var out2 = respTick(s2);
  A(out2.length === 0, '未到期不应再生');
  A(s2.floraRespawn.length === 1, '重生队列应保留');
  A(s2.floraRespawn[0].ticksLeft === 4, '倒计时应递减到 4');
});
