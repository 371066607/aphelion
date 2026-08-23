/* ============================================================
   Aphelion · config.js — 全局数值表 (ADR-10: 逻辑代码零魔数)
   挂载: window.APH.CFG
   ============================================================ */
window.APH = window.APH || {};

APH.CFG = {
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
    accel: 9,                  // lerp 系数/秒
    radius: 11,
    hpMax: 100,
    o2Max: 100,
    o2Drain: 0.72,             // /s 舱外
    o2Refill: 16,              // /s 舱内
    carryMax: 40,              // 负重上限 (ADR 预留 Phase1)
  },

  /* 相机 */
  camLerp: 0.002,
  lookAhead: 40,

  /* 实体数量预算 (ADR-3 统一列表的性能上限) */
  caps: {
    rocks: 64,
    crystals: 26,
    spores: 70,
    particles: 240,
    enemies: 18,               // Phase1
  },

  /* 掉落/资源 id 常量 (ADR-9) */
  items: {
    CRYSTAL_ORE: 'it_crystal_ore',   // 氧气原料
    MINERAL: 'it_mineral',           // 通用矿材
    ALLOY: 'it_alloy',               // 合金(冶炼产物)
    RELIC: 'it_relic',               // 信标稀有件
  },

  /* 实体 type 枚举 (ADR-3) */
  entType: {
    ROCK: 'rock',
    CRYSTAL: 'crystal',
    BEACON: 'beacon',
    PLAYER: 'player',
    ENEMY: 'enemy',            // Phase1
    BUILDING: 'building',      // Phase3
    SOLDIER: 'soldier',        // Phase3
    PROJECTILE: 'projectile',  // Phase1
    DROPPED: 'dropped',        // Phase1 地面掉落物
  },

  /* 存档 (ADR-2/9) */
  save: {
    PREFIX: 'aphelion_',
    KEY_META: 'aphelion_meta',
    KEY_PLANET: 'aphelion_planet_',
    KEY_RIVALS: 'aphelion_rivals_',
    VERSION: 1,
  },

  /* LLM (Phase2 启用，接口先定) */
  llm: {
    dailyLimit: 30,
    timeoutMs: 12000,
    retry: 1,
  },
};
