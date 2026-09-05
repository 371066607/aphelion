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
  A(G.strikePeriod === 0.45, '可见挥砍间隔应为 0.45s');
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

  const tree2 = { kind: 'tree', hp: 30, maxHp: 30, dead: false };
  const res2 = wof(tree2, { skills: { sk_farm: 6 } }, 15);
  A(isFinite(tree2.hp) && tree2.hp < 30, '缺 mood/food 的虚拟工人不得把 HP 打成 NaN, hp=' + tree2.hp);
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

test('designation: applyDesignation 规划打标与取消纯函数', () => {
  const applyD = APH.Colony.applyDesignation;
  A(typeof applyD === 'function', 'applyDesignation 必须存在');

  const des = {};
  const tree = { id: 'fl_tree_1', type: 'flora', kind: 'tree' };
  const rock = { id: 'fl_rock_1', type: 'flora', kind: 'rock_iron' };
  const drop = { id: 'dp_item_1', type: 'dropped', itemId: 'it_wood' };
  const bld = { id: 'bl_house_1', type: 'building', bid: 'bl_house' };
  const pad = { id: 'bl_pad_1', type: 'building', bid: 'bl_landing_pad' };

  // 砍伐树木
  A(applyD(des, tree, 'chop') === true, '砍伐树木应成功');
  A(des['fl_tree_1'] && des['fl_tree_1'].type === 'chop', '标记应为 chop');
  A(applyD(des, rock, 'chop') === false, '砍伐岩石应被拒绝');

  // 开采矿石
  A(applyD(des, rock, 'mine') === true, '开采岩石应成功');
  A(des['fl_rock_1'] && des['fl_rock_1'].type === 'mine', '标记应为 mine');
  A(applyD(des, tree, 'mine') === false, '开采树木应被拒绝');

  // 搬运物资
  A(applyD(des, drop, 'haul') === true, '搬运掉落物应成功');
  A(des['dp_item_1'] && des['dp_item_1'].type === 'haul', '标记应为 haul');

  // 拆除建筑与保护发射台
  A(applyD(des, bld, 'deconstruct') === true, '拆除普通建筑应成功');
  A(applyD(des, pad, 'deconstruct') === false, '拆除发射台必须被拒绝');

  // 取消标记
  A(applyD(des, tree, 'cancel') === true, '取消标记应成功');
  A(!des['fl_tree_1'], '树木标记应被清除');
});

test('designation: boxSelectEntities 矩形框选几何筛选纯函数', () => {
  const boxSel = APH.Colony.boxSelectEntities;
  A(typeof boxSel === 'function', 'boxSelectEntities 必须存在');

  const list = [
    { id: 'e1', x: 100, y: 100, dead: false },
    { id: 'e2', x: 200, y: 250, dead: false },
    { id: 'e3', x: 400, y: 500, dead: false },
    { id: 'e4', x: 150, y: 150, dead: true }, // 死亡实体被排除
  ];

  // 顺向拉框 [50, 50] -> [250, 300]
  const sel1 = boxSel(list, 50, 50, 250, 300);
  A(sel1.length === 2, '应框中 e1 与 e2, got ' + sel1.length);
  A(sel1.some(e => e.id === 'e1') && sel1.some(e => e.id === 'e2'), '应包含 e1 与 e2');

  // 反向拉框 [300, 300] -> [50, 50]
  const sel2 = boxSel(list, 300, 300, 50, 50);
  A(sel2.length === 2, '反向拉框也应框中 2 个');

  // 未框中任何实体
  const sel3 = boxSel(list, 0, 0, 50, 50);
  A(sel3.length === 0, '未命中应返回空数组');
});

test('combat: hasCover 沙袋与墙体掩体加成纯函数', () => {
  const hasCover = APH.Combat.hasCover;
  A(typeof hasCover === 'function', 'hasCover 必须存在');

  const blds = [
    { id: 'bl_sandbag', x: 200, y: 200 },
    { id: 'bl_wall', x: 400, y: 400 },
    { id: 'bl_farm', x: 600, y: 600 },
  ];

  // 1. 靠近沙袋 (距离 30px <= 42px) -> 有掩体
  A(hasCover({ x: 215, y: 200 }, blds) === true, '靠近沙袋应判定有掩体');

  // 2. 靠近墙体 -> 有掩体
  A(hasCover({ x: 400, y: 420 }, blds) === true, '靠近墙体应判定有掩体');

  // 3. 靠近农场 (普通建筑) -> 无掩体
  A(hasCover({ x: 610, y: 600 }, blds) === false, '靠近农场不应算掩体');

  // 4. 远离沙袋 (距离 100px) -> 无掩体
  A(hasCover({ x: 300, y: 200 }, blds) === false, '远离沙袋应判定无掩体');
});
