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
    /* P1b 玩家暴露 (#93): 极端天气室外累积/室内消退; >阈值减速(不转化伤病) */
    exposureGain: 8,           // 极端天气室外每生产跳累积 (居民 10, 玩家轻量)
    exposureDecay: 12,         // 室内/房间每跳消退
    exposureSlowAt: 80,        // 暴露超过此值减速
    exposureSlowMul: 0.9,      // 减速乘子(×walkSpeed)
    o2HomeRefill: 10,          // 家园氧气补给 /s
    o2Max: 100,
    o2Drain: 0.72,
    o2Refill: 16,
    carryMax: 40,              // 负重上限
    homeFoodStart: 80,         // 家园需求: 玩家开局饱食
    homeRestStart: 100,        // 家园需求: 玩家开局精力
    homeIllnessStart: 0,        // 家园需求: 玩家开局病情 (0=HUD 隐藏)
    bedSleepRadius: 60,        // #66 床边睡眠: 与居住舱交互半径 px
    clinicSleepRadius: 60,     // #70 医疗舱躺下: 与医疗舱交互半径 px (镜像 bedSleepRadius)
    bedRecover: 25,            // #66 床边睡眠: 床上恢复 /tick
    floorRecover: 18,          // #66 床边睡眠: 打地铺恢复 /tick (慢 ~30%)
    restWakeAt: 100,           // #66 床边睡眠: 精力回满自动醒
    restCollapseAt: 0,          // #67 累塌: 家园精力见底阈值 (0=精力归零原地睡着)
    downedTime: 90,             // #72 家园击倒: 击倒倒计时秒数 (镜像 CFG.residents.bleedOutTime)
    downedCarrySpeed: 70,       // #72 家园击倒: 送医拖行速度 px/s (小于 walkSpeed 150, 有被拖感)
    /* #65 走到粮边吃: 玩家饥饿阈值/近粮半径/每次E吃回饱食(生食兜底; 熟食用 itemDef.foodGain 覆盖) */
    foodEatBelow: 60,           // 饥饿阈值: 饱食低于此值显示🍽且可E吃 (镜像 CFG.residents.eatBelow)
    foodEatRadius: 60,          // 近粮判定半径 px (镜像 bedSleepRadius/clinicSleepRadius)
    foodEatGain: 25,            // 生食/仓库口粮每次E吃回的饱食
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
    wxParticles: 240,            // W4 天气粒子预算上限 (雨/雪/溅点合计, ADR-15)
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

  /* T10 阵地设备 (#83): 尖刺陷阱与沙袋数值 */
  defense: {
    trapDamage: 12,            // 尖刺陷阱穿刺伤害
    trapBleedSec: 5,           // 触发后出血减速时长(秒)
    bleedSpeedMul: 0.7,        // 出血减速乘子(×敌人速度)
    sandbagMul: 0.5,           // 沙袋减速乘子(敌人/居民穿过)
    trapResetCost: { stone: 1 }, // 居民重置陷阱耗材(默认1石)
    trapAvoidCost: 6,          // P2: 敌人寻路绕陷阱的格代价惩罚(绕路总代价<直踩才绕)
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
    it_seed_glow:     { name: '荧蕈孢子', w: 1, v: 10, tint:'#59d9ff', store:'it_seed_glow' },
    it_seed_crystal:  { name: '晶藤插条', w: 1, v: 12, tint:'#ff9ad0', store:'it_seed_crystal' },
    it_seed_dew:      { name: '露果种荚', w: 1, v: 8, tint:'#80cbc4', store:'it_seed_dew' },
    it_seed_star:     { name: '星绒绒种', w: 1, v: 15, tint:'#e0e0e0', store:'it_seed_star' },
    /* 5 大外星特种装备 (Craft #46) */
    it_pickaxe:       { name: '精工采矿斧', w: 2, v: 8, tint:'#cfd8dc', slot:'tool', toolMul:2.0 },
    it_suit_hazard:   { name: '星绒防酸服', w: 3, v: 15, tint:'#7dffab', slot:'suit', acidResist:0.80 },
    it_suit_cryo:     { name: '极地防寒羽绒', w: 3, v: 15, tint:'#b2ebf2', slot:'suit', cryoResist:0.80 },
    it_goggles_night: { name: '荧光夜视镜', w: 1, v: 12, tint:'#00e5ff', slot:'head', sightBoost:80 },
    it_medkit_adv:    { name: '复合急救包', w: 1, v: 10, tint:'#ff80ab', store:'med', healBonus:25 },
    /* 5 大外星熟食菜肴 (Cooking #49) */
    it_roasted_meat:  { name: '炙烤异星肉排', w: 1, v: 6, tint:'#d97d64', store:'food', isCooked:true, foodGain:40, moodGain:4, recGain:10, desc:'炭火炙烤的外星嫩肉排，外焦里嫩' },
    it_berry_stew:    { name: '晶核浆果浓汤', w: 1, v: 8, tint:'#ff80ab', store:'food', isCooked:true, foodGain:35, moodGain:6, recGain:15, desc:'晶核果与野果熬制的甜汤，滋润心神' },
    it_dew_pudding:   { name: '清甜露果布丁', w: 1, v: 8, tint:'#80cbc4', store:'food', isCooked:true, foodGain:30, moodGain:8, recGain:20, desc:'露珠膨果凝炼而成的清甜点心，极度愉悦' },
    it_glow_fondue:   { name: '荧光温热浓汤', w: 1, v: 10, tint:'#4dd0e1', store:'food', isCooked:true, foodGain:35, moodGain:5, recGain:12, warmBonus:20, desc:'微光发热的暖胃汤，驱散严寒' },
    it_alien_feast:   { name: '外星珍馐盛宴', w: 2, v: 20, tint:'#ffd54f', store:'food', isCooked:true, foodGain:50, moodGain:12, recGain:30, desc:'聚合多种外星奇珍的丰盛大餐，极大提升身心机能' },
    /* 7 大异星实物标本 (Science #51) */
    specimen_flora_glow:    { name: '荧蕈胚囊标本', w: 1, v: 15, tint:'#59d9ff', isSpecimen:true, store:'specimen_flora_glow' },
    specimen_dew:           { name: '露果组织切片', w: 1, v: 12, tint:'#80cbc4', isSpecimen:true, store:'specimen_dew' },
    specimen_crystal_vine:  { name: '晶藤胚根标本', w: 1, v: 18, tint:'#ff9ad0', isSpecimen:true, store:'specimen_crystal_vine' },
    specimen_star_velvet:   { name: '星绒孢子活体', w: 1, v: 20, tint:'#e0e0e0', isSpecimen:true, store:'specimen_star_velvet' },
    specimen_chitin:        { name: '异质硅壳标本', w: 2, v: 25, tint:'#7a8ba9', isSpecimen:true, store:'specimen_chitin' },
    specimen_acid_gland:    { name: '强酸活体腺囊', w: 1, v: 22, tint:'#b8e986', isSpecimen:true, store:'specimen_acid_gland' },
    specimen_ancient_chip:  { name: '未解密古代芯片', w: 1, v: 50, tint:'#ffc857', isSpecimen:true, store:'specimen_ancient_chip' },
    it_reagent:             { name: '精纯试剂', w: 1, v: 8, tint:'#b8e986', store:'it_reagent', desc:'由强酸腺体提炼的高能催化试剂' },
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
    sickMarkAt: 20,             // 病情达到此值显示场上病号标记
    sickMarkFontPx: 14,
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
    sickBedAt: 50,             // #69 病情严格超过此值自动前往医疗舱床位俯卧 (轻病: >20 慢走+✚ 不躺)
    downedCrawlMul: 0.5,       // #69 击倒者匍匐去床速度倍率 (×walk.speed 56 → 28 px/s)
    clinicBedArriveR: 6,       // #69 到床判定半径 px (比 walk.arriveR 3 略宽, 提前上床)
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
    /* T8 餐桌椅 (#81): 有桌吃心情增益/无桌罚/椅位分配 (纯函数 diningSeatAlloc 读) */
    diningMoodGain: 4,         // 在餐桌用餐的心情增益 (进 eatMeal 结算)
    noTableMoodPenalty: -3,    // 无桌吃饭的心情惩罚 (与 eatMeal 无桌分支)
    roomMoodGain: 2,           // T9 卧室级房间(含居住舱)心情增益/生产跳
    /* P3 家具心情 (#97): 房间内逐件加成 [建筑id→心情值] */
    furnitureMood: { bl_tv: 1, bl_shelf: 1, bl_carpet: 1 },
    diningChairR: 300,         // 居民分配空椅的最大距离 (椅须在桌旁 chairTableR 内; 300≈从居住舱走到食堂)
    chairTableR: 60,           // 椅子须在桌旁此距离内才算可用餐位
    diningArriveR: 6,          // 到椅坐下判定半径
    diningTableEatR: 90,       // 坐椅后从桌旁粮堆取食的最大距离 (桌/椅在食堂内, 比 grabR 宽)
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
    /* 外星烹饪与篝火餐饮社交 (Cooking #49) */
    campfireSocialR: 90,       // 社交与取暖辐射半径
    campfireRecGain: 10,       // 围炉娱乐增益
    campfireWarmR: 90,         // 驱寒保暖半径
    campfireExposureRelief: 15,// 围炉暴露消退
    campfireBondGain: 3,       // 围炉夜话羁绊增益
    campfireMoodGain: 1,       // 围炉夜话心情增益
    mealImpressCooked: 35,     // 熟食款待过客好感增益
  },

  /* 居民动态社交与人际网络 (ADR-22 / Spec #128) */
  social: {
    tiers: [
      { id: 'rival', name: '宿怨', min: 0, max: 20, icon: '⚡', color: '#ff6b6b' },
      { id: 'disliked', name: '不和', min: 20, max: 40, icon: '😒', color: '#ffa07a' },
      { id: 'neutral', name: '平淡', min: 40, max: 60, icon: '😐', color: '#dcdcdc' },
      { id: 'friend', name: '朋友', min: 60, max: 80, icon: '😊', color: '#8fd4ff' },
      { id: 'close_friend', name: '挚友', min: 80, max: 100.01, icon: '❤️', color: '#ff85c0' },
    ],
    friendSynergy: 1.15,          // 好友同岗产出协同乘子 (+15%)
    rivalPenalty: 0.85,           // 宿怨同岗产出惩罚乘子 (-15%)
    roomRivalMoodPenalty: -5,     // 同室死敌夜间避嫌心情减益
    encounterCooldown: 90,        // 同对居民场上停步偶遇冷却 (s)
    encounterArriveR: 40,         // 偶遇触发判定距离 (px)
    encounterPauseTime: 1.5,      // 偶遇停步时长 (s)
    greetCooldown: 60,            // 玩家靠近按 E 打招呼冷却 (s)
    greetBondGain: 2,             // 玩家打招呼好感增量
    calmComfortMood: 10,          // 安抚成功心情增益
    calmComfortDur: 120,          // 开导心情增益持续时间 (s)
    interventionBaseChance: 0.40, // 崩溃安抚基础成功率 (40%)
    interventionSkillScale: 0.06, // 每点社交技能提供 +6% 成功率
    interventionBondScale: 0.005, // 好感偏离中值增益 (每点 +0.5%)
    interventionMinChance: 0.15,  // 安抚成功率保底下限 (15%)
    interventionMaxChance: 0.90,  // 安抚成功率封顶上限 (90%)
  },

  /* 精细化仓储与智能物流 (ADR-23 / Spec #133) */
  storage: {
    presets: [
      { id: 'all', name: '全部允许', icon: '📦' },
      { id: 'food', name: '仅食材熟食', icon: '🍞' },
      { id: 'materials', name: '仅工业建材', icon: '🧱' },
      { id: 'medical', name: '仅医疗药品', icon: '💊' },
      { id: 'specimens_gear', name: '仅标本装备', icon: '🔬' },
    ],
    decayHpMax: 100,
    decayPerishableBase: 1.5,     // 易腐品基础损耗 /跳 (30s)
    decayNormalBase: 0.5,         // 药品装备基础损耗 /跳
    weatherDecayMul: {
      wx_clear: 1,
      wx_fog: 1,
      wx_heat: 1.5,
      wx_cold: 1.5,
      wx_rain: 2,
      wx_rain_heavy: 2.5,
      wx_snow: 2,
      wx_blizzard: 2.5,
      wx_storm: 2,
      wx_acid: 4,
      wx_aurora: 1,
    },
    sourcingRadius: 120,          // 车间与就餐就近取料优先半径 (px)
    bulkHaulRadius: 48,           // 搬运工多堆相邻拾取吸附半径 (px)
    bulkHaulMaxPiles: 3,          // 搬运工单次携带最大堆数
    bulkHaulMaxCount: 50,         // 搬运工单次携带最大单位数
  },

  /* 工坊: 矿材→殖民地药品(给医疗舱用, 不是远征消耗品) */
  workshop: {
    mineralCost: 2,
    medGain: 1,
  },

  /* 科研站实物化验 (Science #52) */
  science: {
    scholarSkillMul: 0.15,
    defaultCraftTime: 15,
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
  /* 家园走位: 居民短距无寻路; 玩家与居民共用病情减速规则 */
  walk: {
    speed: 56,
    sickAbove: 20,             // 严格超过此病情才减速
    sickSpeedMul: 0.6,
    arriveR: 3,
  },
  /* T3 居民绕墙走位 (ADR-13 寻路, issue #76): 路径目标一致判定容差 */
  navWalk: {
    goalEps: 1e-6,
  },
  /* 地上物(RimWorld 式): 产出堆在地上, 搬进仓库才入账 */
  haul: {
    pickR: 52,           // 有岗时脚边捡
    seekR: 1200,         // 闲人全殖民地搜索搬运 (ADR-23: 扩展至 1200px)
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
    slots: { bl_farm:2, bl_pasture:2, bl_clinic:1, bl_mine:1, bl_workshop:1, bl_lab:1, bl_kitchen:1, bl_crop_plot:1 },
  },

  /* 事件叙事者 (ADR-12: 事件导演; 单位分钟) */
  events: {
    checkPeriod: 30,           // 与 ADR-6 生产跳对齐(秒); 导演每跳检查一次
    intervalMin: 2.2,          // 事件间隔下限
    intervalMax: 4.5,          // 事件间隔上限
    firstDelay: 3,             // 开局宽限
    restMinutes: [2, 4],      // 负面事件后强制 2~4 分钟喘息窗口
    weatherStepSec: 210,        // ev_weather 每次掷骰至少推进的天气时钟(秒; 1天=DAY_LEN)
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
      /* 天气: 环境压力源(ADR-15), 权重高=导演常掷骰; 冷却期不可选 */
      ev_weather:       { w: 30, cd: 3 },
    },
    baseWeights: {
      ev_droppod:10, ev_refugee_wave:7, ev_herd:8, ev_aurora:8,
      ev_trader_caravan:9, ev_plague:8, ev_blight:8, ev_solar_flare:7, ev_raid:14,
      ev_weather:30,
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
                 campMeleeR: 40,      // 士兵拆营近战距离
                 /* T4 围攻炮击目标优先级: 优先墙/炮塔, 其余按距离+惩罚比较 */
                 shellPrefer: { bl_wall:1, bl_turret:1 },
                 shellPreferPenalty: 300 },
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

  /* 势力外交与战略威慑 (ADR-17) */
  diplomacy: {
    tiers: {
      hostile: -30,       // < -30 为宿敌
      allied: 40,         // > 40 为盟友 (之间为中立)
    },
    defaultRelations: {
      aggressive: -40,
      expansionist: -15,
      trader: 20,
    },
    defaultRelationFallback: -20,
    tributes: {
      mineral: { cost: 15, relationGain: 15, angerCalm: 6, label: '矿石 15' },
      food:    { cost: 10, relationGain: 20, angerCalm: 8, label: '粮食 10' },
      med:     { cost: 2,  relationGain: 25, angerCalm: 10, label: '药品 2' },
    },
    tradePact: {
      minRelation: 0,     // 需关系度 ≥ 0
      costMineral: 20,    // 消耗20矿材
      visitorBonus: 1.5,  // 游商到访概率倍率
      discount: 0.1,      // 交易优惠 10%
    },
    deterrence: {
      defRatio: 1.2,      // 防御力 ≥ 敌军力 × 1.2
      duration: 300,      // 威慑持续 300 秒 (5分钟)
    },
    baseRaidDamage: {
      milCut: 0.3,        // 基地被毁军力扣减 30%
      cowedSec: 180,      // 基地被毁陷入畏缩 180 秒
      relationPenalty: 15,// 关系度扣减 15
    },
    neutralRaidMul: 1.5,  // 中立势力发起袭击所需军力倍率提高至 1.5 (宿敌为1.3)
    neutralAngerMul: 1.5, // 中立势力所需怒气累积时长倍率
  },

  /* 家园天气 (ADR-15: 马尔可夫状态机; 单位: 秒; 一天=DAY_LEN) */
  weather: {
    dayLen: 210,                    // 与 DAY_LEN 同步(一天秒数)
    /* 转移表: from→to 权重(每次到时掷骰); 晴→雨/雪 高freq, 极端低freq */
    transitions: {
      wx_clear:        { wx_clear: 4, wx_rain: 3, wx_snow: 2, wx_fog: 1, wx_heat: 1, wx_cold: 1 },
      wx_rain:         { wx_clear: 4, wx_rain: 3, wx_rain_heavy: 2, wx_fog: 2, wx_acid: 1, wx_thunder: 1 },
      wx_rain_heavy:   { wx_rain: 3, wx_clear: 3, wx_thunder: 1 },
      wx_thunder:      { wx_rain: 3, wx_clear: 3, wx_blizzard: 1 },
      wx_snow:         { wx_clear: 4, wx_snow: 2, wx_blizzard: 2, wx_cold: 1 },
      wx_blizzard:     { wx_snow: 3, wx_clear: 2 },
      wx_heat:         { wx_clear: 4, wx_rain: 2 },
      wx_cold:         { wx_clear: 3, wx_snow: 3, wx_blizzard: 1 },
      wx_acid:         { wx_clear: 3, wx_rain: 3 },
      wx_storm:        { wx_clear: 3, wx_rain: 2 },
      wx_fog:          { wx_clear: 4, wx_rain: 3, wx_acid: 1 },
    },
    /* 持续时长区间[天] (min..max); t 为当前天气已持续秒数 */
    dur: {
      wx_clear: [2, 5], wx_rain: [1, 3], wx_rain_heavy: [1, 2], wx_thunder: [1, 1],
      wx_snow: [1, 3], wx_blizzard: [1, 2], wx_heat: [1, 3], wx_cold: [1, 3],
      wx_acid: [1, 2], wx_storm: [1, 2], wx_fog: [1, 2],
    },
    /* 极端天气冷却(秒): 触发后此天气不可再选 (极端清单=exposureGain>0: 雷暴/暴雪/热浪/寒潮/酸雨; 磁暴为特殊事件) */
    cd: { wx_thunder: 630, wx_blizzard: 840, wx_acid: 840, wx_storm: 630, wx_heat: 630, wx_cold: 630 },
    /* ---- W4 程序化粒子/天色 (ADR-11 显式例外: 天气即时绘制, 不进 sprite 管线) ----
       fxView=粒子计数参考视口; fx.count=参考视口目标粒子数, 实际按视口面积缩放,
       并被 CFG.caps.wxParticles 封顶; tint/tintA=天色罩色; fogA 仅雾天>0。 */
    fxView: { w: 1280, h: 720 },
    fxRain: {
      speed: 620,                // 雨丝下落速度 px/s
      wind: 46,                  // 横向风漂移 px/s
      len: 15,                   // 雨丝长度 px (速度方向摆线)
      lineW: 1.4,
      alpha: 0.34,
      col: '#a9bdd4',
      splashLife: 0.22,          // 溅点存活秒数
      splashDots: 3,             // 每溅点圆点数
      splashR: 3,                // 溅点圆点半径 px
      splashEdge: 6,             // 溅点离视口底边内缩 px
    },
    fxSnow: {
      fall: 58,                  // 雪花下落速度 px/s
      drift: 20,                 // 横向风漂移 px/s
      swayAmp: 13,               // 飘落摆动幅度 px
      swayFreq: 1.2,             // 摆动频率 rad/s
      r: 1.7,                    // 雪花半径 px
      rJit: 0.7,                 // 半径抖动 ±
      alpha: 0.85,
      col: '#f2f7fb',
    },
    fxFog: {
      edgeFrac: 0.22,            // 雾层边缘渐隐带宽 (占对角半径比例)
    },
    fx: {
      wx_clear:      { parts:'none', count:0,   tint:'#ffffff', tintA:0 },
      wx_rain:       { parts:'rain', count:130, tint:'#5f7189', tintA:0.10 },   // 雨: 灰蓝
      wx_rain_heavy: { parts:'rain', count:200, tint:'#49596e', tintA:0.16 },
      wx_thunder:    { parts:'rain', count:230, tint:'#39485c', tintA:0.20 },
      wx_snow:       { parts:'snow', count:110, tint:'#dfe9f2', tintA:0.12 },   // 雪: 亮白
      wx_blizzard:   { parts:'snow', count:170, tint:'#b9e2ea', tintA:0.18 },   // 暴雪: 偏青
      wx_heat:       { parts:'none', count:0,   tint:'#e0a465', tintA:0.07 },   // 热浪: 暖橙
      wx_cold:       { parts:'none', count:0,   tint:'#9fb8d8', tintA:0.10 },   // 寒潮: 灰蓝
      wx_acid:       { parts:'rain', count:140, tint:'#a9c96f', tintA:0.14 },   // 酸雨: 黄绿
      wx_storm:      { parts:'none', count:0,   tint:'#8b6fd8', tintA:0.13 },   // 磁暴: 紫
      wx_fog:        { parts:'none', count:0,   tint:'#c9ced6', tintA:0.08, fogA:0.26 },
    },
    /* 效果表: speedMul(玩家/居民室外减速) farmMul(农田产量) exposureGain(室外暴露/跳) enemySightMul(敌感知) solarMul(太阳能板, 供T6) */
    effects: {
      wx_clear:       { speedMul: 1,    farmMul: 1,    exposureGain: 0,  enemySightMul: 1,    solarMul: 1 },
      wx_rain:        { speedMul: 0.7,  farmMul: 1.3,  exposureGain: 0,  enemySightMul: 1,    solarMul: 0.5 },
      wx_rain_heavy:  { speedMul: 0.6,  farmMul: 1.2,  exposureGain: 0,  enemySightMul: 1,    solarMul: 0.3 },
      wx_thunder:     { speedMul: 0.6,  farmMul: 1.1,  exposureGain: 10, enemySightMul: 1,    solarMul: 0.15 },
      wx_snow:        { speedMul: 0.8,  farmMul: 0.6,  exposureGain: 0,  enemySightMul: 1,    solarMul: 0.4 },
      wx_blizzard:    { speedMul: 0.6,  farmMul: 0.3,  exposureGain: 12, enemySightMul: 0.8,  solarMul: 0.2 },
      wx_heat:        { speedMul: 1,    farmMul: 1,    exposureGain: 8,  enemySightMul: 1,    solarMul: 1 },
      wx_cold:        { speedMul: 0.85, farmMul: 0.7,  exposureGain: 8,  enemySightMul: 1,    solarMul: 0.9 },
      wx_acid:        { speedMul: 0.85, farmMul: 0.5,  exposureGain: 10, enemySightMul: 1,    solarMul: 0.4 },
      wx_storm:       { speedMul: 1,    farmMul: 1,    exposureGain: 0,  enemySightMul: 1,    solarMul: 0.1 },
      wx_fog:         { speedMul: 1,    farmMul: 1,    exposureGain: 0,  enemySightMul: 0.7, solarMul: 0.6 },
    },
    /* W3 HUD: 天气名与图标 (显示数据; 同 CFG.items 的 name 模式) */
    names: {
      wx_clear:'晴', wx_rain:'雨', wx_rain_heavy:'大雨', wx_thunder:'雷暴',
      wx_snow:'雪', wx_blizzard:'暴雪', wx_heat:'热浪', wx_cold:'寒潮',
      wx_acid:'酸雨', wx_storm:'磁暴', wx_fog:'雾',
    },
    icons: {
      wx_clear:'☀', wx_rain:'🌧', wx_rain_heavy:'🌧', wx_thunder:'⛈',
      wx_snow:'🌨', wx_blizzard:'❄', wx_heat:'🔥', wx_cold:'🥶',
      wx_acid:'☣', wx_storm:'🌀', wx_fog:'🌫',
    },
  },

  /* 墙与闸门 (ADR-13) */
  wall: {
    collideR: 35,               // 玩家碰撞半径 = player.radius(11) + GRID/2(24); <格宽会漏缝穿墙
    dragSpeedMul: 0.55,         // 撞墙完全堵死时速度衰减
    hp: 60,                     // T4 破墙: 墙块耐久(袭击者近战/围攻炮弹可拆)
    shellDmg: 30,               // T4 破墙: 围攻炮弹对墙伤害(两发击穿一墙)
    dropStoneMin: 1,            // T4 破墙: 墙毁掉落石料下限
    dropStoneMax: 2,            // T4 破墙: 墙毁掉落石料上限
  },

  /* T5 弹道掩体 (issue #78): 墙块=弹道障碍(真实掩体) */
  ballistic: {
    wallHalf: 24,               // 墙块碰撞盒半宽 = GRID/2 (48px 格, 墙记录格心±24)
  },

  /* T6 电网 (issue #79): 导线/木柴发电机/太阳能板/蓄电池/供电结算 */
  power: {
    /* 用电建筑: load=功率(抽象单位), prio=停机优先级(小=优先保供; 同级全保才轮到下级) */
    consumers: {
      bl_turret: { load: 10, prio: 1 },   // 防御炮塔: 保供级
      bl_clinic: { load: 6,  prio: 1 },   // 医疗舱: 保供级
      bl_lamp:   { load: 3,  prio: 2 },   // T9 路灯: 预留(本票只入优先级表)
    },
    wood:  { watts: 14, burnSec: 15 },    // 木柴发电机: 额定功率, 每 burnSec 秒烧 1 木材
    solar: { watts: 8 },                  // 太阳能板: 基础功率 × 天气 solarMul (仅白天)
    battery: { cap: 100 },                // 蓄电池容量 (瓦·秒)
    blackoutSec: 60,                      // 停电兜底秒数 (电池耗尽后仍按兜底计时全负荷运行)
    farmPowerMul: 0.5,                    // 农场无电减产乘子 (≠绝收, RimWorld 式半瘫痪)
  },

  /* 开场短片 (ADR-10 / ADR-0007) */
  opening: {
    duration: 30,
    shotCount: 5,
    lastIndex: 4,
    shotEnds: [3.5, 7, 11, 16, 30],
    captions: [
      '新曙光\n船体完整性：临界',
      '迫降申请：已提交\n迫降申请：已接受',
      '',
      '其余生命信号：丢失',
      '活下去。'
    ],
    button: '活下去',
    alarmUntil: 3,
    alarmPeriod: 0.85,
    objectiveHouse: '今夜之前：盖一座居住舱 [G]',
    objectiveSleep: '走进居住舱按 [E] 睡',
    visitorFallback: null,   // null → DAY_LEN
    video: 'assets/opening/opening.mp4',
    assets: [
      'assets/opening/01_ship_break.png',
      'assets/opening/02_forced_landing.png',
      'assets/opening/03_pod_down.png',
      'assets/opening/04_signal_lost.png',
      'assets/opening/05_empty_yard.png'
    ],
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

  /* 输入键位与动作映射 (ADR-19) */
  keybindings: {
    game: {
      KeyE: 'INTERACT',
      KeyF: 'SECONDARY_INTERACT',
      KeyJ: 'FIRE_PLASMA',
      Space: 'FIRE_PLASMA',
      KeyB: 'TOGGLE_BUILD_MODE',
      KeyP: 'CYCLE_JOB',
      KeyU: 'UPGRADE_NEAREST',
      KeyX: 'DEMOLISH_NEAREST',
      KeyH: 'TOGGLE_MARKER',
      KeyK: 'DEBUG_SPAWN',
      KeyC: 'TOGGLE_CAMERA_LOCK',
      KeyM: 'TOGGLE_MUTE',
      KeyO: 'TOGGLE_DIPLOMACY',
      KeyR: 'TOGGLE_ROSTER',
      KeyT: 'TOGGLE_TECH',
      KeyL: 'TOGGLE_CODEX',
      KeyG: 'TOGGLE_BUILD_ROW',
      Escape: 'CANCEL_OR_CLOSE',
    },
    intro: {
      Enter: 'INTRO_CONFIRM',
      Space: 'INTRO_CONFIRM',
      Escape: 'INTRO_CONFIRM',
    },
    'modal:roster': {
      ArrowUp: 'NAV_UP',
      ArrowDown: 'NAV_DOWN',
      ArrowLeft: 'NAV_LEFT',
      ArrowRight: 'NAV_RIGHT',
      Digit0: 'SET_PRIO_0',
      Digit1: 'SET_PRIO_1',
      Digit2: 'SET_PRIO_2',
      Digit3: 'SET_PRIO_3',
      Escape: 'CLOSE_MODAL',
      KeyR: 'CLOSE_MODAL',
    },
    'modal:trade': {
      ArrowUp: 'NAV_UP',
      ArrowDown: 'NAV_DOWN',
      Enter: 'CONFIRM_TRADE',
      NumpadEnter: 'CONFIRM_TRADE',
      Digit1: 'TRADE_ROW_1',
      Digit2: 'TRADE_ROW_2',
      Digit3: 'TRADE_ROW_3',
      Digit4: 'TRADE_ROW_4',
      Digit5: 'TRADE_ROW_5',
      Digit6: 'TRADE_ROW_6',
      Digit7: 'TRADE_ROW_7',
      Digit8: 'TRADE_ROW_8',
      Digit9: 'TRADE_ROW_9',
      Escape: 'CLOSE_MODAL',
    },
    'modal:techMap': {
      ArrowUp: 'NAV_UP',
      ArrowDown: 'NAV_DOWN',
      ArrowLeft: 'NAV_LEFT',
      ArrowRight: 'NAV_RIGHT',
      Enter: 'BUY_TECH',
      NumpadEnter: 'BUY_TECH',
      Escape: 'CLOSE_MODAL',
      KeyT: 'CLOSE_MODAL',
    },
    'modal:diplomacy': {
      Escape: 'CLOSE_MODAL',
      KeyO: 'CLOSE_MODAL',
    },
    'modal:codex': {
      Escape: 'CLOSE_MODAL',
      KeyL: 'CLOSE_MODAL',
    },
    'modal:buildCatalog': {
      Escape: 'CLOSE_MODAL',
      KeyG: 'CLOSE_MODAL',
    }
  },
};
