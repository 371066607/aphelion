/* tests/social.test.js — 居民人际网络与动态社交测试集 (ADR-22 / Spec #128)
   纯函数模式，由 tests/run.js 自动加载运行 */
'use strict';

function A(ok, msg) { if (!ok) throw new Error(msg || 'assert failed'); }

test('social: CFG.social.tiers 定义完整五级关系状态机', () => {
  const S = APH.CFG.social;
  A(S, 'CFG.social 应存在');
  A(Array.isArray(S.tiers), 'CFG.social.tiers 应为数组');
  A(S.tiers.length === 5, '应包含 5 个等级, 实际: ' + S.tiers.length);
  const ids = S.tiers.map(t => t.id);
  A(ids.includes('rival'), '应包含 rival');
  A(ids.includes('disliked'), '应包含 disliked');
  A(ids.includes('neutral'), '应包含 neutral');
  A(ids.includes('friend'), '应包含 friend');
  A(ids.includes('close_friend'), '应包含 close_friend');
  S.tiers.forEach(t => {
    A(typeof t.min === 'number' && typeof t.max === 'number', 'tier 须包含 min/max 范围: ' + t.id);
    A(t.icon, 'tier 须包含图标: ' + t.id);
    A(t.name, 'tier 须包含中文名: ' + t.id);
    A(t.color, 'tier 须包含主题色: ' + t.id);
  });
});

test('social: relationshipTierOf 纯函数边界判定准确', () => {
  const tierOf = APH.Res.relationshipTierOf;
  A(typeof tierOf === 'function', 'relationshipTierOf 必须为函数');

  A(tierOf(0).id === 'rival', '0 应为 rival');
  A(tierOf(19.9).id === 'rival', '19.9 应为 rival');
  A(tierOf(20).id === 'disliked', '20 应为 disliked');
  A(tierOf(39.9).id === 'disliked', '39.9 应为 disliked');
  A(tierOf(40).id === 'neutral', '40 应为 neutral');
  A(tierOf(50).id === 'neutral', '50 应为 neutral');
  A(tierOf(59.9).id === 'neutral', '59.9 应为 neutral');
  A(tierOf(60).id === 'friend', '60 应为 friend');
  A(tierOf(79.9).id === 'friend', '79.9 应为 friend');
  A(tierOf(80).id === 'close_friend', '80 应为 close_friend');
  A(tierOf(100).id === 'close_friend', '100 应为 close_friend');

  // 默认缺省值回退为 neutral
  A(tierOf(null).id === 'neutral', 'null 应回退 neutral (50)');
  A(tierOf(undefined).id === 'neutral', 'undefined 应回退 neutral (50)');
});

test('social: applyBond 支持 player 参与者与键位归一化', () => {
  const applyBond = APH.Res.applyBond;
  let bonds = {};

  // 普通居民之间
  bonds = applyBond(bonds, 'rs_1', 'rs_2', 10);
  A(bonds['rs_1|rs_2'] === 60, '默认50+10=60, 实际: ' + bonds['rs_1|rs_2']);

  // player 与居民（无序归一化：player|rs_1）
  bonds = applyBond(bonds, 'player', 'rs_1', 25);
  A(bonds['player|rs_1'] === 75, 'player|rs_1 应为 75, 实际: ' + bonds['player|rs_1']);

  // 反向输入同样归一化到 player|rs_1
  bonds = applyBond(bonds, 'rs_1', 'player', -10);
  A(bonds['player|rs_1'] === 65, '反向输入应修改同一键 player|rs_1, 实际: ' + bonds['player|rs_1']);
  A(bonds['rs_1|player'] === undefined, '不应生成 rs_1|player 倒序键');

  // 边界 clamp (0~100)
  bonds = applyBond(bonds, 'player', 'rs_2', 1000);
  A(bonds['player|rs_2'] === 100, '上限应 clamp 到 100');
  bonds = applyBond(bonds, 'player', 'rs_2', -200);
  A(bonds['player|rs_2'] === 0, '下限应 clamp 到 0');
});

test('social: keyBondsOf 提取最亲密与最敌对关系', () => {
  const keyBondsOf = APH.Res.keyBondsOf;
  A(typeof keyBondsOf === 'function', 'keyBondsOf 必须为函数');

  const residents = [
    { id: 'rs_1', name: '阿澈' },
    { id: 'rs_2', name: '铁蛋' },
    { id: 'rs_3', name: '晚星' },
  ];
  const bonds = {
    'rs_1|rs_2': 85, // 阿澈与铁蛋是挚友
    'rs_1|rs_3': 15, // 阿澈与晚星是宿怨
    'player|rs_1': 70, // 玩家对阿澈是朋友
  };

  const key1 = keyBondsOf('rs_1', residents, bonds);
  A(key1.closest && key1.closest.otherId === 'rs_2', '阿澈最近应为铁蛋');
  A(key1.closest.tier.id === 'close_friend', '铁蛋等级应为 close_friend');
  A(key1.worst && key1.worst.otherId === 'rs_3', '阿澈最差应为晚星');
  A(key1.worst.tier.id === 'rival', '晚星等级应为 rival');
  A(key1.player && key1.player.bond === 70, '玩家好感应为 70');
  A(key1.player.tier.id === 'friend', '玩家关系应为 friend');

  // 孤立居民（无记录，默认 50 中立）
  const key3 = keyBondsOf('rs_3', residents, bonds);
  A(key3.player && key3.player.bond === 50, '未互动居民与玩家应默认 50 中立');
  A(key3.player.tier.id === 'neutral', '应为 neutral');
});

test('social: workSynergyOf 好友协同增产与宿怨减产', () => {
  const workSynergyOf = APH.Res.workSynergyOf;
  A(typeof workSynergyOf === 'function', 'workSynergyOf 必须为函数');

  const w = { id: 'rs_1', name: '阿澈' };
  const friend = { id: 'rs_2', name: '铁蛋' };
  const rival = { id: 'rs_3', name: '晚星' };
  const neutral = { id: 'rs_4', name: '老周' };

  const bonds = {
    'rs_1|rs_2': 75, // 好友
    'rs_1|rs_3': 10, // 宿怨
    'rs_1|rs_4': 50, // 平淡
  };

  // 独自工作
  A(workSynergyOf(w, [], bonds) === 1.0, '独自工作协同应为 1.0');

  // 与好友共事 (+15%)
  const synFriend = workSynergyOf(w, [friend], bonds);
  A(synFriend === 1.15, '好友共事协同应为 1.15, 实际: ' + synFriend);

  // 与宿怨共事 (-15%)
  const synRival = workSynergyOf(w, [rival], bonds);
  A(synRival === 0.85, '宿怨共事协同应为 0.85, 实际: ' + synRival);

  // 与平淡同僚共事 (1.0)
  const synNeutral = workSynergyOf(w, [neutral], bonds);
  A(synNeutral === 1.0, '平淡同僚协同应为 1.0, 实际: ' + synNeutral);

  // 一友一敌混合 (平均: (1.15 + 0.85)/2 = 1.0)
  const synMix = workSynergyOf(w, [friend, rival], bonds);
  A(Math.abs(synMix - 1.0) < 0.001, '一友一敌协同应相抵为 1.0, 实际: ' + synMix);
});

test('social: roomFrictionOf 同室死敌心情惩罚', () => {
  const roomFrictionOf = APH.Res.roomFrictionOf;
  A(typeof roomFrictionOf === 'function', 'roomFrictionOf 必须为函数');

  const r = { id: 'rs_1', name: '阿澈' };
  const friend = { id: 'rs_2', name: '铁蛋' };
  const rival = { id: 'rs_3', name: '晚星' };

  const bonds = {
    'rs_1|rs_2': 80, // 挚友
    'rs_1|rs_3': 10, // 宿怨
  };

  // 独居或与好友同室 (0 惩罚)
  A(roomFrictionOf(r, [], bonds) === 0, '独居应无避嫌惩罚');
  A(roomFrictionOf(r, [friend], bonds) === 0, '与好友同室应无避嫌惩罚');

  // 与宿怨同室 (-5 惩罚)
  const f1 = roomFrictionOf(r, [rival], bonds);
  A(f1 === -5, '与宿怨同室惩罚应为 -5, 实际: ' + f1);

  // 与好友和宿怨同室 (只要有宿怨就有惩罚)
  const f2 = roomFrictionOf(r, [friend, rival], bonds);
  A(f2 === -5, '室内含宿怨惩罚应为 -5, 实际: ' + f2);
});
