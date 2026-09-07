/* hints.test.js — 家园提示层 (ADR-41)
   提示层原先埋在 main.js 里, node 跑不到, 于是「哪句话该盖过哪句话」
   从来没有用例把关 —— 只能靠人开着游戏站到东西旁边一个个试。
   独立成 APH.Hints 之后, 优先级表可以直接断言。 */

/* 造一个刚好够提示层读的最小 state */
function mkState(over){
  const s = {
    scene: 'home', mode: 'running', px: 100, py: 100, playerDrafted: false,
    hp: 100, gathering: false,
    colony: { buildings: [] }, entities: [],
    war: { raidActive: false, raidWarn: 0 },
    /* 粮/矿备足, 否则 shortageBrief 的 urgent 会盖在最前面(见下面那条用例) */
    meta: { residents: [], res: { food: 40, mineral: 40, med: 5 }, tech: {}, bonds: {},
            playerNeeds: { food: 80, rest: 100, illness: 0, isSleeping: false, downed: false } },
  };
  Object.assign(s, over || {});
  return s;
}
const ENV = { quiet: true, needs: null, clinicB: null, cDist: 1e9, weatherHint: null };
function env(over){ return Object.assign({}, ENV, over || {}); }

test('hints: 优先级第一档是物资告急 —— 它连「击倒昏迷」都盖得住', () => {
  const s = mkState();
  s.meta.res.food = 0;                    // 触发 shortageBrief.urgent
  s.meta.playerNeeds.downed = true;
  const prev = APH.state; APH.state = s;
  try {
    const h = APH.Hints.forHome(s, env({ needs: { downed: true } }), '');
    /* 这是当前的既定行为, 不是笔误 —— forHome 的 1) 就是物资告急。
       但「生命垂危」被「食物将尽」盖住是否合理, 见 BACKLOG 的存疑项。 */
    if (h.indexOf('食物将尽') !== 0)
      throw new Error('物资告急应在第一档, got ' + h);
  } finally { APH.state = prev; }
});

test('hints: 物资不告急时, 昏迷压过其余一切', () => {
  const s = mkState({ nearBed: { x: 1, y: 1 } });
  s.meta.playerNeeds.downed = true;
  const prev = APH.state; APH.state = s;
  try {
    const h = APH.Hints.forHome(s, env({ needs: { downed: true } }), '');
    if (!h || h.indexOf('击倒昏迷') !== 0)
      throw new Error('昏迷应压过床边提示, got ' + h);
    if (h.indexOf('无人救援') < 0)
      throw new Error('没人来救时应说明, got ' + h);
  } finally { APH.state = prev; }
});

test('hints: 站在发射器旁 —— 通电与否给不同的话', () => {
  const s = mkState();
  const prev = APH.state; APH.state = s;
  try {
    const tx = { bid: 'bl_transmitter', x: 50, y: 50 };
    s.colony.buildings = [{ id: 'bl_transmitter', x: 50, y: 50, powered: false }];
    s.nearTransmitter = tx;
    let h = APH.Hints.forHome(s, env(), '');
    if (h.indexOf('未通电') < 0) throw new Error('没电时应说未通电, got ' + h);
    s.colony.buildings[0].powered = true;
    h = APH.Hints.forHome(s, env(), '');
    if (h.indexOf('[E] 呼叫救援') !== 0) throw new Error('通电后应给通关提示, got ' + h);
  } finally { APH.state = prev; }
});

test('hints: 交互提示压过天气播报(否则站在东西旁边按不了键)', () => {
  const s = mkState({ nearBed: { x: 1, y: 1 } });
  const prev = APH.state; APH.state = s;
  try {
    const h = APH.Hints.forHome(s, env({ weatherHint: '☔ 酸雨' }), '');
    if (h.indexOf('[E] 上床睡觉') !== 0)
      throw new Error('可交互的东西应压过天气, got ' + h);
  } finally { APH.state = prev; }
});

test('hints: 没有可说的就返回目标阶梯, 而不是 null', () => {
  const s = mkState();
  const prev = APH.state; APH.state = s;
  try {
    const h = APH.Hints.forHome(s, env(), '');
    /* T2 目标阶梯永不枯竭: 空殖民地应该被要求做点什么 */
    if (h == null) throw new Error('空殖民地不该无话可说');
    if (typeof h !== 'string') throw new Error('应返回字符串, got ' + typeof h);
  } finally { APH.state = prev; }
});

test('hints: 目标阶梯永不枯竭 —— 走到终局也还有话说', () => {
  const s = mkState();
  const prev = APH.state; APH.state = s;
  try {
    s.meta.opening = { nightDone: true };            // 开场引导已结束
    s.meta.res.food = 0;                             // 让「囤粮」那一档也露面
    /* 一路把阶梯走到底: 人 → 农场 → 存粮 → 电 → 防线 → 医疗舱 → 终局科技 → 发射器 */
    const seen = new Set();
    const steps = [
      () => { s.meta.residents = [{ id: 'r1', name: '老张' }]; },
      () => { s.colony.buildings.push({ id: 'bl_farm', x: 1, y: 1 }); },
      () => { s.meta.res.food = 9999; },
      () => { s.colony.buildings.push({ id: 'bl_solar_panel', x: 2, y: 2 }); },
      () => { s.colony.buildings.push({ id: 'bl_turret', x: 3, y: 3 }); },
      () => { s.colony.buildings.push({ id: 'bl_clinic', x: 4, y: 4 }); },
      () => { s.meta.tech.te_deep_signal = 1; },
      () => { s.colony.buildings.push({ id: 'bl_transmitter', x: 5, y: 5 }); },
    ];
    for (const advance of steps) {
      const h = APH.Hints.objective(s);
      if (h == null) throw new Error('阶梯中途不该无话可说');
      seen.add(h);
      advance();
    }
    const last = APH.Hints.objective(s);
    if (last == null) throw new Error('全部做完后仍应给出终局提示, got null');
    seen.add(last);
    if (seen.size !== steps.length + 1)
      throw new Error('每一档都应给出不同的话, 实得 ' + seen.size + ' 种');
  } finally { APH.state = prev; }
});

test('hints: 围攻期间不唠叨目标(打仗时别念叨盖房子)', () => {
  const s = mkState();
  s.war.raidActive = true;
  const prev = APH.state; APH.state = s;
  try {
    if (APH.Hints.objective(s, '') !== null)
      throw new Error('袭击中不应给目标提示');
    s.war.raidActive = false; s.war.raidWarn = 8;
    if (APH.Hints.objective(s, '') !== null)
      throw new Error('预警中也不应给目标提示');
  } finally { APH.state = prev; }
});

test('hints: 是纯读取 —— 调用前后 state 不变', () => {
  const s = mkState({ nearBed: { x: 1, y: 1 } });
  const prev = APH.state; APH.state = s;
  try {
    const before = JSON.stringify(s);
    APH.Hints.forHome(s, env(), '');
    if (JSON.stringify(s) !== before)
      throw new Error('提示层不得改动 state');
  } finally { APH.state = prev; }
});

test('hints: 饿了 —— 有粮说在路上, 没粮说没粮', () => {
  const s = mkState();
  s.meta.playerNeeds.food = 10;          // 低于 foodEatBelow
  const prev = APH.state; APH.state = s;
  try {
    const h = APH.Hints.forHome(s, env(), '');
    if (h.indexOf('前往进食') < 0)
      throw new Error('仓里有粮时应说正在前往, got ' + h);

    /* 全场无粮。注意 env.quiet 要关掉 —— 否则 shortageBrief 的「食物将尽」
       会在第一档就把这句盖住, 玩家永远看不到「请标记浆果丛采摘」的具体指路。
       这条 shadowing 已记进 BACKLOG。 */
    s.meta.res.food = 0;
    const h2 = APH.Hints.forHome(s, env({ quiet: false }), '');
    if (h2.indexOf('没有口粮') < 0)
      throw new Error('全场无粮时应明说没粮, got ' + h2);

    /* 地上放一堆粮, 话就该变回「正前往进食」 */
    s.entities.push({ type: APH.CFG.entType.DROPPED, itemId: 'it_food', x: 300, y: 300, n: 5 });
    const h3 = APH.Hints.forHome(s, env({ quiet: false }), '');
    if (h3.indexOf('前往进食') < 0)
      throw new Error('地上有粮时应说正在前往, got ' + h3);
  } finally { APH.state = prev; }
});
