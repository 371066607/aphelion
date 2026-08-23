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
    healInHab: 7,              // 舱内回血 /s
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
    rocks: 64,
    crystals: 26,
    spores: 70,
    particles: 240,
    enemies: 18,
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
    deaggroR: 430,
    attackR: 27,
    attackCd: 1.15,
    fleeHpPct: 0.22,
    projSpeed: 185,
    projLife: 2.4,
    despawnR: 900,             // 远离玩家后回收
  },

  /* 刷怪导演 */
  spawn: {
    intervalDay: 11,           // 白天平均间隔 s
    intervalNight: 4.2,        // 夜晚密度×2.2+
    minDistFromPlayer: 380,
    maxDistFromPlayer: 680,
  },

  /* 物品表 (ADR-9: it_ 前缀; w=负重 v=研究点价值) */
  items: {
    it_crystal_ore: { name: '晶体矿', w: 2, v: 2 },
    it_mineral:     { name: '矿材',   w: 3, v: 4 },
    it_alloy:       { name: '合金碎片', w: 5, v: 10 },
    it_relic:       { name: '信标遗件', w: 1, v: 40 },
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
