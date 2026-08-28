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
    it_crystal_ore: { name: '晶体矿', w: 2, v: 2, tint:'#ff9ad0' },
    it_mineral:     { name: '矿材',   w: 3, v: 4, tint:'#8fa3cc', store:'mineral' },
    it_alloy:       { name: '合金碎片', w: 5, v: 10, tint:'#b8874a', store:'mineral', storeN:3 },
    it_relic:       { name: '信标遗件', w: 1, v: 40, tint:'#ffc857' },
    it_food:        { name: '食物',   w: 1, v: 0, tint:'#c8e89a', store:'food' },
    it_med:         { name: '药品',   w: 1, v: 0, tint:'#7dffab', store:'med' },
    it_leather:     { name: '皮革',   w: 2, v: 0, tint:'#d4a574', store:'leather' },
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
    raidWound: 18,
    raidMood: 12,
    raidIFrame: 0.8,
    medHeal: 8,
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
