'use strict';
const Res = window.APH.Res;
const Ent = window.APH.Ent;

test('ADR-47: 小人缝生成人型袭击者，有名字和阵营，不进玩家名册', () => {
  const roster = [];
  const p = Res.hostilePawn(42, [], { faction: 'rv_ash' });
  if (!p || !p.name) throw new Error('人型袭击者必须有名字');
  if (!p.id || String(p.id).indexOf('rs_') !== 0) throw new Error('人型 id 应 rs_ 前缀: ' + (p && p.id));
  if (p.faction !== 'rv_ash') throw new Error('阵营应是字段: ' + (p && p.faction));
  if (roster.length !== 0) throw new Error('生成袭击者不得写入玩家名册');
  if (p.food == null || p.mood == null) throw new Error('袭击者是完整的人，要有需求');
});

test('ADR-47: 人型袭击者在袭击上下文有念头', () => {
  const p = Res.hostilePawn(7, []);
  Res.moodFromThoughts(p, { raid: true, fireNearby: true });
  if (!p.thoughts || !p.thoughts.length) throw new Error('生产结算后应有念头清单');
  if (!p.thoughts.some(function(t){ return t.id === 'th_raid'; }))
    throw new Error('袭击中应有袭击念头: ' + JSON.stringify(p.thoughts));
  if (!p.thoughts.some(function(t){ return t.id === 'th_fire'; }))
    throw new Error('附近着火应有火的念头');
});

test('ADR-47: 体现到场上后仍是同一个人，检查器能读念头', () => {
  const p = Res.hostilePawn(11, []);
  Res.moodFromThoughts(p, { raid: true });
  const e = Res.embodyHostile(p, 400, 500);
  if (!e || e.x !== 400 || e.y !== 500) throw new Error('场上位置不对');
  if (e.id !== p.id) throw new Error('场上实体必须是同一个人: ' + e.id + ' vs ' + p.id);
  if (!e.name || e.name !== p.name) throw new Error('场上要看得见名字');
  if (!Res.isHumanlike(e)) throw new Error('场上实体应被认作人型');
  const html = window.APH.UI && APH.UI.inspectorHtml
    ? APH.UI.inspectorHtml({ type: 'enemy', entity: e }, { meta: {}, colony: {} })
    : '';
  if (html) {
    if (html.indexOf(p.name) < 0) throw new Error('检查器应显示名字');
    if (html.indexOf('念头') < 0 && !(p.thoughts || []).some(function(t){ return html.indexOf(t.text) >= 0; }))
      throw new Error('检查器应能读到念头');
  }
});

test('ADR-47: 家园袭击刷出的是人型小人', () => {
  const prev = APH.state;
  const s = {
    seed: 9, meta: { residents: [] }, entities: [],
    war: { raidActive: true, spawned: 0, wave: { count: 1, waves: 1 }, raidSpawnT: 0, routed: false },
    colony: { buildings: [], scene: { width: 2200, height: 2200 } },
    clock: 0, px: 1100, py: 1100, parts: []
  };
  APH.state = s;
  try {
    APH.Combat.tickRaid(s, 0.16);
    const foes = (s.entities || []).filter(function(e){ return e && e.type === (APH.CFG.entType.ENEMY) && !e.isSoldier; });
    if (!foes.length) throw new Error('应刷出袭击者');
    if (!Res.isHumanlike(foes[0])) throw new Error('家园袭击者应是人型');
    if (!foes[0].name) throw new Error('应有名字');
    if (!foes[0].pawn || foes[0].pawn.id !== foes[0].id) throw new Error('场上应是同一小人');
  } finally { APH.state = prev; }
});

test('ADR-47: 俘虏保持同一 id 与伤势，不标死、不进名册', () => {
  const p = Res.hostilePawn(3, []);
  p.skills.sk_build = 7;
  p.parts.armL = 0.4;
  const e = Res.embodyHostile(p, 10, 20);
  const meta = { prisoners: [], residents: [] };
  const cap = Res.capturePrisoner(meta, e);
  if (!cap || cap.id !== p.id) throw new Error('俘虏必须是同一个人: ' + (cap && cap.id));
  if (e.dead) throw new Error('俘虏不得把原对象标死');
  if (cap.skills.sk_build !== 7 || cap.parts.armL !== 0.4) throw new Error('技能与伤势应保留');
  if (meta.residents.length) throw new Error('未招降不得进玩家名册');
  if (meta.prisoners.length !== 1 || meta.prisoners[0].id !== p.id) throw new Error('应持久化到俘虏名单');
});

test('ADR-47: 释放仍是同一对象，招降只改阵营', () => {
  const p = Res.hostilePawn(5, []);
  p.origin = '本地出生';
  const e = Res.embodyHostile(p, 1, 1);
  const meta = { prisoners: [], residents: [] };
  const cap = Res.capturePrisoner(meta, e);
  if (!Res.releasePrisoner(meta, cap.id) || meta.prisoners.length) throw new Error('应释放');
  const again = Res.capturePrisoner(meta, e);
  if (again.id !== p.id) throw new Error('再俘虏仍是同一 id');
  const rec = Res.recruitPrisoner(meta, again.id, 4);
  if (!rec || !rec.ok) throw new Error('招降应成功: ' + JSON.stringify(rec));
  if (meta.residents.length !== 1 || meta.residents[0].id !== p.id) throw new Error('名册应是同一 id');
  if (meta.residents[0].faction !== 'home') throw new Error('招降后阵营应是玩家');
  if (meta.prisoners.length) throw new Error('招降后应离开俘虏名单');
});

test('ADR-47: 招募过客保持同一 id', () => {
  const guest = Res.generate('v_keep', 8);
  guest.origin = '本地出生';
  const meta = { residents: [] };
  const rec = Res.recruitInto(meta, guest, 2);
  if (!rec.ok || meta.residents[0].id !== guest.id) throw new Error('过客招募应保持 id');
});

test('ADR-47: 工作指派跳过敌对与俘虏', () => {
  const home = Res.generate('wk_home', 4);
  home.faction = 'home';
  home.skills.sk_farm = 9;
  const foe = Res.hostilePawn(8, []);
  foe.skills.sk_farm = 9;
  const capP = Res.hostilePawn(9, []);
  capP.skills.sk_farm = 9;
  const meta = { prisoners: [], residents: [] };
  Res.capturePrisoner(meta, Res.embodyHostile(capP, 0, 30));
  const out = APH.Colony.assignByPriority([home, foe, capP], [{ id: 'bl_farm' }], {}, false);
  if (out[foe.id]) throw new Error('敌对不应上岗');
  if (out[capP.id]) throw new Error('俘虏不应上岗');
  if (out[home.id] !== 'bl_farm') throw new Error('玩家阵营应能上农场: ' + out[home.id]);
});

test('ADR-47: 士兵是玩家阵营小人，不是敌人旗', () => {
  const p = Res.generate('sol_1', 6);
  const e = Res.embodySoldier(p, 200, 210);
  if (e.type !== APH.CFG.entType.RESIDENT) throw new Error('士兵应是居民实体');
  if (!e.drafted || p.faction !== 'home') throw new Error('士兵应征召且属玩家阵营');
  if (!Res.isPlayerFaction(p) || Res.isPlayerFaction(Res.hostilePawn(1, [])))
    throw new Error('isPlayerFaction 应区分敌我');
});

test('ADR-47: 基因团敌人不是小人缝产物', () => {
  const en = Ent.makeEnemy(null, 100, 120);
  if (Res.isHumanlike(en)) throw new Error('基因团不应被人型缝认领');
  if (en.thoughts) throw new Error('基因团不应带着念头清单');
});
