/* succession.test.js — ADR-44 指挥官继任
   设计支柱是「殖民地优先：还有人活着，殖民地就还在」。
   在此之前有三处「指挥官死 = 本局结束」直接和它打架。这些用例钉住新契约。 */

function mkState(residents){
  return {
    scene: 'home', mode: 'running', clock: 1000, landedAt: 0,
    px: 500, py: 500, hp: 100, o2: 100, cry: 0, found: 0, totalBeacons: 6,
    carry: {}, runLoot: 0, entities: [], parts: [],
    colony: { buildings: [] }, war: {},
    meta: {
      residents: residents || [], res: {}, tech: {}, bonds: {},
      stats: { deaths: 0, colonistsLost: 0 },
      playerNeeds: { food: 30, rest: 20, illness: 5, mood: 40, downed: true, downT: 0 },
    },
  };
}
function mkResident(id, name, over){
  return Object.assign({
    id: id, name: name, origin: '外环矿场',
    skills: { sk_build: 7, sk_farm: 2, sk_social: 5, sk_lore: 3, sk_craft: 1, sk_ranch: 0 },
    mainSkill: 'sk_build', mood: 66, food: 71, rest: 55, illness: 0, recreation: 62,
  }, over || {});
}

test('ADR-44: 还有人活着 → 有人接班, 本局继续', () => {
  const prev = APH.state;
  APH.state = mkState([mkResident('r1', '老张'), mkResident('r2', '小林')]);
  const s = APH.state;
  try {
    const ok = APH.ColonyTick.commanderFell('测试死因', { x: 500, y: 500 });
    if (ok !== true) throw new Error('有人接班时应返回 true');
    if (s.mode !== 'running') throw new Error('本局不该结束, got mode=' + s.mode);
    if (APH.Res.commanderName(s.meta) !== '老张')
      throw new Error('最资深(名册首位)的应接任, got ' + APH.Res.commanderName(s.meta));
    if (s.meta.residents.length !== 1) throw new Error('接任者应从名册移出 —— 人数是真的少了一个');
    if (s.meta.residents[0].id !== 'r2') throw new Error('留下的应是小林');
    if (s.meta.commander.succeeded !== 1) throw new Error('应记为第二任, got ' + s.meta.commander.succeeded);
    if ((s.meta.stats.commandersLost || 0) !== 1) throw new Error('应记一次指挥官阵亡');
  } finally { APH.state = prev; }
});

test('ADR-44: 名册空了才是真的结束, 且发 death 而不是继任', () => {
  const prev = APH.state;
  APH.state = mkState([]);
  const s = APH.state;
  const seen = [];
  const h1 = APH.U.on('death', p => seen.push(['death', p]));
  const h2 = APH.U.on('commanderSucceeded', () => seen.push(['succeeded']));
  try {
    const ok = APH.ColonyTick.commanderFell('最后一个人也倒下了', { x: 1, y: 1 });
    if (ok !== false) throw new Error('无人接班时应返回 false');
    if (s.mode !== 'dead') throw new Error('应结束本局, got ' + s.mode);
    const d = seen.find(x => x[0] === 'death');
    if (!d) throw new Error('应发 death');
    if (!d[1].stats.lastCommander) throw new Error('结算页要知道这是「最后一任也没了」');
    if (seen.find(x => x[0] === 'succeeded')) throw new Error('没人接班就不该发继任事件');
  } finally { APH.U.off('death', h1); APH.U.off('commanderSucceeded', h2); APH.state = prev; }
});

test('ADR-44: 继任者带着自己的身体状况上任, 不是满状态复活', () => {
  const prev = APH.state;
  APH.state = mkState([mkResident('r1', '老张', { food: 41, rest: 33, mood: 58, illness: 12 })]);
  const s = APH.state;
  try {
    APH.ColonyTick.commanderFell('测试', null);
    const n = s.meta.playerNeeds;
    if (n.food !== 41 || n.rest !== 33 || n.mood !== 58 || n.illness !== 12)
      throw new Error('需求应取继任者本人的值, got ' + JSON.stringify(n));
    if (n.downed !== false || n.downT !== null) throw new Error('新指挥官不该继承击倒状态');
    if (s.hp !== APH.CFG.player.hpMax) throw new Error('但生命值是新的身体, 应满');
  } finally { APH.state = prev; }
});

test('ADR-44: 家园阵亡留下尸体, 让殖民地看得见代价', () => {
  const prev = APH.state;
  APH.state = mkState([mkResident('r1', '老张')]);
  const s = APH.state;
  try {
    APH.ColonyTick.commanderFell('失血过多', { x: 321, y: 654 });
    const corpse = s.entities.find(e => e && e.type === APH.CFG.entType.CORPSE);
    if (!corpse) throw new Error('家园阵亡应留下尸体');
    if (corpse.name !== '指挥官') throw new Error('尸体应挂前任的名字, got ' + corpse.name);
    if (corpse.x !== 321 || corpse.y !== 654) throw new Error('尸体应在倒下的地方');
  } finally { APH.state = prev; }
});

test('ADR-44: 死在远征 —— 战利品随人留在荒原, 镜头回家', () => {
  const prev = APH.state;
  APH.state = mkState([mkResident('r1', '老张')]);
  const s = APH.state;
  s.scene = 'expedition';
  s.carry = { it_mineral: 9 };
  s.runLoot = 7;
  let wentHome = 0;
  const h = APH.U.on('forceReturnHome', () => wentHome++);
  try {
    APH.ColonyTick.commanderFell('死在荒原', { x: 10, y: 10 });
    if (Object.keys(s.carry).length) throw new Error('背包应随前任留在荒原, got ' + JSON.stringify(s.carry));
    if (s.runLoot !== 0) throw new Error('本次远征收益应清零');
    if (wentHome !== 1) throw new Error('应发一次 forceReturnHome, got ' + wentHome);
    if (s.entities.find(e => e && e.type === APH.CFG.entType.CORPSE))
      throw new Error('远征阵亡不该在家园凭空出现尸体');
  } finally { APH.U.off('forceReturnHome', h); APH.state = prev; }
});

test('ADR-44: 继任者在场时, 指挥官的身体挪到他站的位置', () => {
  const prev = APH.state;
  APH.state = mkState([mkResident('r1', '老张')]);
  const s = APH.state;
  const heirEnt = { type: APH.CFG.entType.RESIDENT, rid: 'r1', x: 888, y: 999 };
  s.entities.push(heirEnt);
  try {
    APH.ColonyTick.commanderFell('测试', null);
    if (s.px !== 888 || s.py !== 999)
      throw new Error('指挥官应出现在继任者原来站的地方, got ' + s.px + ',' + s.py);
    if (!heirEnt.dead) throw new Error('继任者的居民实体应退场(他现在是玩家了)');
  } finally { APH.state = prev; }
});

test('ADR-44: 覆灭判定仍是唯一的失败出口 —— 继任不影响它', () => {
  const prev = APH.state;
  APH.state = mkState([mkResident('r1', '老张')]);
  const s = APH.state;
  try {
    APH.ColonyTick.founded(s.meta);            // 立过殖民地
    APH.ColonyTick.commanderFell('测试', null); // 老张接任, 名册归零
    if (s.meta.residents.length !== 0) throw new Error('用例前提: 名册应已空');
    if (s.mode !== 'running') throw new Error('继任之后本局还在跑');
    /* 但殖民地已经没有居民了 —— 下一次覆灭判定应该判负 */
    if (APH.ColonyTick.checkFall() !== true)
      throw new Error('立过殖民地且居民归零, 应判覆灭');
    if (s.mode !== 'dead') throw new Error('覆灭后应结束本局');
  } finally { APH.state = prev; }
});

test('ADR-44: 老档没有 commander 字段也能跑(零迁移)', () => {
  const meta = { residents: [], playerNeeds: {} };
  const c = APH.Res.ensureCommander(meta);
  if (!c || c.name !== '指挥官') throw new Error('应补一位无名初代');
  if (c.succeeded !== 0) throw new Error('初代应记为第 0 任');
  if (APH.Res.commanderName(meta) !== '指挥官') throw new Error('名字读取应可用');
  /* 初代没有技能表 → 沿用调用点原先写死的值, 行为一字不变 */
  if (APH.Res.commanderSkill(meta, 'sk_social', 4) !== 4)
    throw new Error('初代应回退到 fallback');
  /* 继任者有真实技能 → 用他自己的 */
  meta.residents = [{ id: 'r1', name: '老张', skills: { sk_social: 9 } }];
  APH.Res.succeedCommander(meta);
  if (APH.Res.commanderSkill(meta, 'sk_social', 4) !== 9)
    throw new Error('继任者应用自己的技能, got ' + APH.Res.commanderSkill(meta, 'sk_social', 4));
});
