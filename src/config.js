/* ============================================================
   Aphelion · config.js — 全局数值表 (ADR-10: 逻辑代码零魔数)
   挂载: window.APH.CFG
   ============================================================ */
window.APH = window.APH || {};

APH.CFG = {
  /* 场景 (设计支柱: 殖民地优先) */
  scene: { COLONY:'colony', PLANET:'planet' },

  /* 世界 */
  WORLD: 2200,
  CHUNK: 550,
  GRID: 48,                    // ADR-4 逻辑格网
  LAKE: { x: 1660, y: 1560, r: 148 },
  HAB: { x: 1100, y: 1100, r: 92 },
  DAY_LEN: 210,                // 一天的秒数

  /* 土壤肥力体系 (RimWorld 农业) */
  soil: {
    rich: 1.40,                // 沃土(湖畔/沼泽)
    normal: 1.00,              // 普通土壤(平原)
    poor: 0.70,                // 贫瘠砂砾(边陲荒原)
    hydro: 2.80,               // 温控水培槽
  },

  /* 人形贴图 (ADR-0001) */
  humanoid: {
    drawH: 78,                 // 所有人形目标内容高
    chibiH: 43,                // 程序化小人未缩放的发顶到脚
    chibiBodyR: 21.5,          // 士兵程序化半径；脚钉后直径 ≈ chibiH
    walkPerDir: 8,
    idlePerDir: 4,
    idleFps: 1,                // 4 帧一轮 ≈ 4s，慢呼吸，不像喘气
    walkFps: 10,
    sheetBaseline: 248,        // 256 格人形脚底（walk/idle 同锚）
    sheetContentH: 240         // 走循环实测内容高；idle 缺 meta 时同此以免跳高
  },

  /* 玩家 */
  player: {
    walkSpeed: 150,
    runSpeed: 235,
    accel: 9,
    radius: 11,
    hpMax: 100,
    healInHab: 7,              // 远征返回舱回血 /s
    healAtClinic: 4,           // 家园靠近医疗舱回血 /s
    clinicHealR: 80,           // 医疗舱治疗半径 px
    o2HomeRefill: 10,          // 家园氧气补给 /s
    o2Max: 100,
    o2Drain: 0.72,
    o2Refill: 16,
    carryMax: 40,              // 负重上限
  },

  /* 相机 */
  camLerp: 0.002,
  lookAhead: 40,

  /* 实体数量预算 */
  caps: {
    entitiesHard: 400,
    rocks: 64,
    crystals: 26,
    spores: 70,
    particles: 240,
    enemies: 18,
  },

  /* 防御炮塔 (Task4) */
  turret: {
    range: 240,
    cd: 1.2,
    dmgBase: 8,
    dmgPerLv: 8,
  },
  /* 兵营士兵 */
  soldier: {
    hp: 40,
    speed: 120,
    dmg: 6,
    perBarracks: 2,      // 每级兵营+2兵
  },

  /* 战斗 */
  combat: {
    plasmaDmg: 13,
    plasmaSpeed: 430,
    fireCd: 0.32,              // 射击间隔 s
    plasmaLife: 0.85,
    noiseRadius: 300,          // 枪声惊动半径
    hitStop: 0.035,            // 击杀顿帧
  },

  /* 敌人通用 */
  enemy: {
    aggroR: 195,
    nightAggroMul: 1.6,
    noiseAggroR: 300,          // 枪声 idle→alert 半径(须定义, 否则 heardShot 永不生效)
    deaggroR: 430,
    attackR: 27,
    attackCd: 1.15,
    fleeHpPct: 0.22,
    projSpeed: 207,   // T6: +12%
    projLife: 2.4,
    despawnR: 900,             // 远离玩家后回收
  },

  /* 刷怪导演 */
  spawn: {
    intervalDay: 11,           // 白天平均间隔 s
    intervalNight: 4.94,        // 夜晚密度×2.2+
    minDistFromPlayer: 380,
    maxDistFromPlayer: 680,
  },

  /* 物品表 (ADR-9: it_ 前缀; w=负重 v=研究点价值; store=家园入库字段) */
  items: {
    it_wood:          { name: '木材',     w: 1, v: 0, tint:'#b8874a', store:'wood' },
    it_stone:         { name: '石料',     w: 2, v: 0, tint:'#8fa3cc', store:'stone' },
    it_iron:          { name: '铁矿',     w: 2, v: 0, tint:'#7a8ba9', store:'iron' },
    it_berry:         { name: '野果',     w: 1, v: 0, tint:'#ff6d7a', store:'food' },
    it_herb:          { name: '草药',     w: 1, v: 0, tint:'#7dffab', store:'herb' },
    it_glow_fluid:    { name: '荧光浆液', w: 1, v: 5, tint:'#59d9ff', store:'glow_fluid' },
    it_crystal_berry: { name: '晶核果',   w: 1, v: 3, tint:'#ff9ad0', store:'food' },
    it_dew_fruit:     { name: '清甜露果', w: 1, v: 4, tint:'#80cbc4', store:'food' },
    it_star_fiber:    { name: '星绒纤维', w: 1, v: 6, tint:'#e0e0e0', store:'leather' },
    it_seed_glow:     { name: '荧蕈孢子', w: 1, v: 10, tint:'#59d9ff' },
    it_seed_crystal:  { name: '晶藤插条', w: 1, v: 12, tint:'#ff9ad0' },
    it_seed_dew:      { name: '露果种荚', w: 1, v: 8, tint:'#80cbc4' },
    it_seed_star:     { name: '星绒绒种', w: 1, v: 15, tint:'#e0e0e0' },
    it_crystal_ore:   { name: '晶体矿',   w: 2, v: 2, tint:'#ff9ad0' },
    it_mineral:       { name: '矿材',     w: 3, v: 4, tint:'#8fa3cc', store:'mineral' },
    it_alloy:         { name: '合金碎片', w: 5, v: 10, tint:'#b8874a', store:'mineral', storeN:3 },
    it_relic:         { name: '信标遗件', w: 1, v: 40, tint:'#ffc857' },
    it_food:          { name: '食物',     w: 1, v: 0, tint:'#c8e89a', store:'food' },
    it_med:           { name: '药品',     w: 1, v: 0, tint:'#7dffab', store:'med' },
    it_leather:       { name: '皮革',     w: 2, v: 0, tint:'#d4a574', store:'leather' },
  },

  /* 实体 type 枚举 (ADR-3) */
  entType: {
    ROCK: 'rock',
    CRYSTAL: 'crystal',
    BEACON: 'beacon',
    PLAYER: 'player',
    ENEMY: 'enemy',
    BUILDING: 'building',
    SOLDIER: 'soldier',
    PROJECTILE: 'projectile',
    DROPPED: 'dropped',
    BLUEPRINT: 'blueprint',
    RESIDENT: 'resident',
    VISITOR: 'visitor',
    FLORA: 'flora',
  },

  /* 经营（矿材盖房 / 开局赠矿 / 袭击掠夺） */
  economy: {
    startMineral: 100,
    clinicHeal: 40,
    pillageFood: 3,
    pillageMineral: 2,
    pillageMed: 1,
    foodWarnTicks: 2,
    mineralWarn: 15,
  },

  /* 家园气候 + 远征法则 */
  laws: {
    acidFarmMul: 0.5,
    stormLabMul: 0,
    stormPeriod: 90,
    stormLen: 30,
    echoSightMul: 0.45,        // lw_echo 目不能视: 视觉 aggro 缩小
    echoNoiseMul: 1.8,         // lw_echo 循声: 枪声半径放大
    sporePartR: 52,            // lw_spore_light 近距排开
    sporeAttractR: 200,        // 中距趋光
    sporeSpd: 36,
  },

  /* 殖民者需求(饱食/心情/病情). 不是玩家 HP/O2, 也不是远征消耗品 */
  residents: {
    illnessMax: 100,
    eatBelow: 60,
    eatGain: 25,
    foodDrain: 6,
    moodWellFood: 65,
    moodWellGain: 2,
    moodCap: 95,
    moodStarveAt: 30,
    moodStarve: 8,
    moodHungryAt: 45,
    moodHungry: 3,
    hungerSickAt: 30,
    hungerSick: 4,
    ambientSickChance: 0.08,
    ambientSick: 2,
    selfHealFood: 65,
    selfHeal: 1,
    clinicHeal: 6,
    medicHealPerLv: 1.2,
    moodSickAt: 40,
    moodSick: 3,
    effSickAt: 20,
    effSickFloor: 0.35,
    /* F 健康分型 (ailments: wound/infection/plague) */
    ailMax: 2,                 // 每人同时最多几条病症
    woundInfectAge: 2,         // 外伤拖满此跳数未进舱 → 升级感染
    infectBump: 5,             // 升级感染时病情加重
    infectMood: 8,             // 升级感染的心情打击
    plagueFloor: 12,           // 无药时医疗舱压疫病的地板(压不能除)
    medPlagueMul: 2,           // 药对疫病效果倍率
    effInfectFloor: 0.25,      // 感染者效率地板(低于普通病)
    raidWound: 18,
    raidMood: 12,
    raidIFrame: 0.8,
    medHeal: 8,
    sickSkipAt: 60,            // 病情超过此值不派岗
    tantrumR: 140,             // 怠工抱怨影响半径(px)
    clinicNearR: 80,           // 进舱判定: 离医疗舱此距离内
    /* 心情崩溃(RimWorld mental break; 时间单位=生产跳30s) */
    breakMinorAt: 35,          // 心情低于此值开始掷骰
    breakMajorAt: 15,          // 低于此值概率×breakMajorMul
    breakChance: 0.08,
    breakMajorMul: 3,
    breakTicksMin: 1,          // 崩溃持续跳数
    breakTicksMax: 2,
    breakCdTicks: 10,          // 崩溃后冷却(10跳=5分钟)
    breakRecoverMood: 45,      // 宣泄回弹: 结束后心情至少回到此值
    brawlMoodHit: 15,          // 斗殴: 对方心情损失
    brawlIll: 8,               // 斗殴: 双方病情上涨
    brawlBondHit: 8,           // 斗殴: 好感损失
    tantrumMoodHit: 5,         // 怠工抱怨: 周围居民心情损失
    /* 深度生存: 精力/睡眠/床位 (Survival #15) */
    restDrain: 7,              // 生产跳自然精力衰减
    restSleepAt: 20,           // 精力低于此值入睡
    restWakeAt: 100,           // 精力回满醒来
    bedRecover: 25,            // 床铺睡眠恢复 /跳
    floorRecover: 18,          // 地铺睡眠恢复 /跳 (慢 ~30%)
    bedMood: 3,                // 有床舒适心情增益
    floorMood: -5,             // 无床打地铺心情惩罚
    disturbedMood: -4,         // 惊醒心情惩罚
    disturbedTicks: 3,         // 惊醒持续跳数
    /* 深度生存: 娱乐与抗压 (Survival #18) */
    recreationDrain: 5,        // 生产跳自然娱乐衰减
    recreationJoyAt: 30,       // 娱乐低于此值渴望休闲
    recreationGain: 25,        // 每次休闲恢复
    recreationBuffAt: 80,      // 娱乐高值给 Buff
    recreationBuffMood: 8,     // 身心愉悦心情增益
    recreationBoredAt: 20,     // 极度枯燥阈值
    recreationBoredMood: -5,   // 极度枯燥心情惩罚
    /* 深度生存: 击倒与救援 (Survival #17) */
    downedConAt: 0.30,         // 认知低于此值触发击倒
    downedMoveAt: 0.15,        // 移动低于此值触发击倒
    bleedOutTime: 90,          // 濒死倒计时 90 秒
    deathGriefMood: -8,        // 居民死亡全员悲痛心情
    deathGriefTicks: 4,        // 悲痛持续跳数
    /* 深度生存: 外星环境暴露与避难所 (Survival #19) */
    exposureGain: 10,          // 极端天气室外每跳累积
    shelterCooldown: 15,       // 避难所内每跳消退
    exposureDiscomfortAt: 50,  // 暴露不适阈值
    exposureDiscomfortMood: -4,// 暴露不适心情减益
    exposureAcuteAt: 80,       // 急性伤病转化阈值
    exposureAcuteSev: 12,      // 转化伤病严重度
    shelterRadius: 48,         // 建筑避难所判定半径
    /* 深度生存: 三维机能损毁 (Survival #16) */
    woundMoveCut: 0.005,       // 外伤削弱移动
    woundManipCut: 0.004,      // 外伤削弱操作
    infectManipCut: 0.008,     // 感染削弱操作
    plagueConCut: 0.009,       // 疫病削弱认知
    painConCut: 0.003,         // 疼痛削弱认知
    tiredConCut: 0.2,          // 极度疲倦削弱认知
    coldMoveCut: 0.003,        // 严寒暴露削弱移动
  },

  /* 工坊: 矿材→殖民地药品(给医疗舱用, 不是远征消耗品) */
  workshop: {
    mineralCost: 2,
    medGain: 1,
  },

  /* 过客拜访 */
  visitor: {
    max: 2,
    arriveChance: 0.45,
    stayMin: 50,
    stayMax: 90,
    speed: 48,
    yardR: 220,
    recruitR: 54,
    idleChance: 0.35,          // 一段走完后站住喘气的概率
    idleMin: 4.2,              // ≥ 一轮 idle（idleFps=1 × 4 帧）
    idleMax: 7.0,
    walkMin: 1.4,
    walkMax: 4.6
  },
  /* 招募(RimWorld 式: 看人下菜, 不买人). 数值全进表 */
  recruit: {
    guestBase: 45,
    traitEasy: 12,
    traitHard: 15,
    traitAngry: 10,
    foodGoodTicks: 3,
    foodGood: 20,
    foodBad: 30,
    clinic: 10,
    jobBldg: 10,
    raid: 40,
    chanceMin: 5,
    chanceMax: 95,
    askCd: 15,
    impressStart: 50,
    impressMin: 0,
    impressMax: 100,
    rateSpareBed: 0.40,
    rateFoodOk: 0.28,
    rateClinic: 0.18,
    rateNoBed: 0.12,
    rateNoFood: 0.55,
    rateRaid: 1.1,
    mealCost: 2,
    mealImpress: 20,
  },
  /* 居民短距走位(无寻路、无作息): 家↔岗位, 袭击回家 */
  walk: {
    speed: 56,
    arriveR: 3,
  },
  /* 地上物(RimWorld 式): 产出堆在地上, 搬进仓库才入账 */
  haul: {
    pickR: 52,           // 有岗时脚边捡
    seekR: 420,          // 闲人去搬远处
    grabR: 18,           // 捡起距离
    dumpR: 36,           // 卸到仓库/发射台
    stackR: 44,          // 同种叠堆
    stealR: 28,          // 袭击顺手偷地上
  },

  /* 贸易(游商; 矿材=硬通货, 不新增货币物品)
     出售=游商卖给你(药品/合金/皮革); 收购=游商买你的(食物/皮革/晶体矿) */
  trade: {
    sellBase: { med: 6, alloy: 4, leather: 3 },
    buyBase:  { food: 1, leather: 2, crystal: 3 },
    priceJitter: 0.25,         // 游商个体价格浮动 ±25% (seeded)
    stockMin: 2,               // 每种商品库存件数下限
    stockMax: 6,
    demandExtra: 2,            // 收购需求额外件数
    listMin: 2,                // 买卖栏各上架 2~3 种
    listMax: 3,
    socialPricePerLv: 0.02,    // 最高社交每级改善 2% 价格
    socialPriceCap: 0.12,
  },

  /* 岗位席位(建筑数×每座席位 = 可派岗上限) */
  jobs: {
    slots: { bl_farm:2, bl_pasture:2, bl_clinic:1, bl_mine:1, bl_workshop:1, bl_lab:1 },
  },

  /* 事件叙事者 (ADR-12: 事件导演; 单位分钟) */
  events: {
    checkPeriod: 30,           // 与 ADR-6 生产跳对齐(秒); 导演每跳检查一次
    intervalMin: 2.2,          // 事件间隔下限
    intervalMax: 4.5,          // 事件间隔上限
    firstDelay: 3,             // 开局宽限
    restMinutes: [2, 4],      // 负面事件后强制 2~4 分钟喘息窗口
    moodMercyAt: 40,           // 心情均值低于此值 → 负面权重×moodMercyMul
    moodMercyMul: 0.5,
    wealthPerThreat: 120,      // 每 120 财富 +1 威胁级
    threatMax: 5,
    threatNegMul: 0.15,        // 每威胁级负面权重 +15%
    wealthPerPop: 40,          // 人口财富权重
    wealthPerTech: 40,         // 科技财富权重
    wealthLeather: 2,          // 皮革折算财富
    wealthMed: 3,              // 药品折算财富
    /* 卡组: w=权重 cd=冷却(分钟) neg=负面 */
    deck: {
      ev_droppod:       { w: 10, cd: 5 },
      ev_refugee_wave:  { w: 7,  cd: 8 },
      ev_herd:          { w: 8,  cd: 7 },
      ev_aurora:        { w: 8,  cd: 6 },
      ev_trader_caravan:{ w: 9,  cd: 7 },
      ev_plague:        { w: 8,  cd: 9,  neg: true },
      ev_blight:        { w: 8,  cd: 8,  neg: true },
      ev_solar_flare:   { w: 7,  cd: 8,  neg: true },
      ev_raid:          { w: 14, cd: 5,  neg: true },
    },
    baseWeights: {
      ev_droppod:10, ev_refugee_wave:7, ev_herd:8, ev_aurora:8,
      ev_trader_caravan:9, ev_plague:8, ev_blight:8, ev_solar_flare:7, ev_raid:14,
    },
    /* 事件效果数值 */
    droppodMineral: [4, 8],
    droppodFood: [2, 4],
    droppodDist: [160, 240],  // 坠落点距家园
    droppodJitter: 26,
    refugeeSecondP: 0.5,      // 第二名难民概率
    historyMax: 40,
    auroraMood: 10,
    plagueRatio: 0.3,          // 疫病感染人口比例
    plagueIll: 15,
    herdMul: 3,                // 兽群过境: 本跳牧场产出×3
    flareOffline: 60,          // 耀斑炮塔停机秒数
    blightCut: 0.5,            // 枯萎: 农田进度保留比例
  },

  /* 袭击战术 (阶段E: rival 个性 → 战术分流) */
  raidTactics: {
    byTrait: { aggressive:'assault', trader:'pillage', expansionist:'siege' },
    tactics: {
      assault: { countMul: 1.2, label: '强攻' },
      pillage: { countMul: 0.7, label: '盗掠', stealCap: 6 },   // 偷够即撤
      siege:   { countMul: 1.0, label: '围攻',
                 campDist: 500,        // 扎营距家园距离(px)
                 campSec: 90,          // 扎营时长(秒), 结束转强攻
                 shellPeriod: 15,      // 炮击间隔(秒)
                 campHp: 60,           // 营地可拆血量
                 shellOffline: 20,   // 每发炮击建筑停机秒数
                 shellSpeed: 280,     // 围攻弹速度
                 shellLife: 5,        // 弹丸寿命(须能飞完 campDist)
                 campMeleeR: 40 },    // 士兵拆营近战距离
    },
    bigWaveAt: 90,        // 军力 ≥ 此值 → 拆两波
    waveGap: 45,          // 波次间隔(秒)
    wave2Angle: 2.4,      // 第二波换向(rad)
    routAt: 0.6,          // 伤亡比例 ≥60% → 全体溃退
    routDropChance: 0.5,  // 溃退者掉落随身赃物概率
    fleeDespawnR: 1000,   // 溃退者离家园此距离消失(须<轴向可达上限1070, 防卡边)
    fleeSpdMul: 1.15,
    siegeWanderR: 46,
    siegeWalkMul: 0.35,
  },

  /* 存档 */
  save: {
    PREFIX: 'aphelion_',
    KEY_META: 'aphelion_meta',
    KEY_PLANET: 'aphelion_planet_',
    KEY_RIVALS: 'aphelion_rivals_',
    VERSION: 1,
  },

  /* LLM (Phase2 启用) */
  llm: {
    dailyLimit: 30,
    timeoutMs: 12000,
    retry: 1,
  },
};
