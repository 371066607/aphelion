/* hints.test.js — 家园提示层 (ADR-41 · ADR-45 后)
   ADR-45 拆掉主角之后, 「站在 X 旁边按 E」那一整档提示随之删除,
   对应的四条用例也删了 —— 它们测的是不存在的交互。
   现在提示层只回答两类问题: 场上有谁要你处置 · 下一个目标是什么。 */
/* 原始说明 (ADR-41)
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


/* ---------- ADR-45: 没有主角之后的提示层 ---------- */

test('hints: 过客在场时提示他值不值得招', () => {
  const s = mkState();
  s.nearVisitor = { profile: { name:'老张', mainSkill:'sk_build', skills:{sk_build:7}, intent:'refugee' },
                    impression: 80 };
  const prev = APH.state; APH.state = s;
  try {
    const h = APH.Hints.forHome(s, env(), '');
    if (h.indexOf('老张') < 0) throw new Error('应报出过客名字, got ' + h);
    if (h.indexOf('印象') < 0) throw new Error('应给出印象值(玩家据此决定招不招)');
    if (h.indexOf('[E]') >= 0) throw new Error('不该再出现按键提示 —— 没有化身可以走过去按 E');
  } finally { APH.state = prev; }
});

test('hints: 有人崩溃时提示「派人去安抚」而不是「你走过去安抚」', () => {
  const s = mkState();
  s.nearBrokenResident = { resident: { name:'小林', breakType:'break_daze' } };
  const prev = APH.state; APH.state = s;
  try {
    const h = APH.Hints.forHome(s, env(), '');
    if (h.indexOf('小林') < 0) throw new Error('应报出崩溃者是谁, got ' + h);
    if (h.indexOf('派人') < 0) throw new Error('应是「派人去」—— 玩家自己没有身体');
  } finally { APH.state = prev; }
});

test('hints: 提示层不再读 playerNeeds(主角已不存在)', () => {
  const s = mkState();
  delete s.meta.playerNeeds;                  // 彻底没有这个字段
  const prev = APH.state; APH.state = s;
  try {
    const h = APH.Hints.forHome(s, env(), '');   // 不抛错即通过
    if (h == null) throw new Error('仍应给出目标提示');
  } finally { APH.state = prev; }
});
