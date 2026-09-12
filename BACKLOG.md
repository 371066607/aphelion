# Aphelion 夜班待办（按优先级，做完一项勾一项）

> 规则：每班只做 1~2 项；每项必须「构建绿 + 测试绿」才算完成；
> 完成后把 `[ ]` 改 `[x]` 并在 JOURNAL.md 记录证据。
> 方向（2026-08-27）：经营是主循环，远征是补给，战争是砸家。

## 经营主循环重构

- [x] P0 锁方向：DESIGN 经营优先、intro/教程改成「这是你的家」、`te_exosuit` ADR-9、保留家园袭击修复
- [x] P1 经济闭环：矿材盖建筑、有人才产、settleGoods 分账、医疗舱急救、短缺 HUD
- [x] P2 人在场上：`entType.RESIDENT` 站在岗位旁，不存 xy
- [x] P3 管家：居民施工蓝图、R 面板换岗、雷达标晶体
- [x] P4 补给远征：发射台按短缺出任务、教程延后远征、`lw_night_acid` 一条法则
- [x] P5 战争打家：袭击打仓库/农场、偷资源、士兵可死、战争并入 meta
- [x] 过客拜访：流浪者在家园闲逛，走近 [E] 招募
- [x] 招募意向：难民绿灯 / 过路客掷骰 / 游商不招（RimWorld 式, 不买人）
- [x] 招待涨印象 / 请吃饭加分（空床余粮医疗缓涨；[F] 请客 -2粮 +20印象）
- [x] 居民居住舱 ↔ 岗位短距离走过去（直线无寻路、无作息；袭击回家）
- [x] 殖民者生命：饱食 + 心情 + 病情；医疗舱给人治病（远征急救仍保留）；家园病情 >20 时居民（含游荡）与玩家走/跑统一减速至 60%，远征不减速；病号标记从 20 起放大显示（Issue #64）

## 阶段 6+（计划内、不本轮）


- [x] `bl_workshop`：手工岗（矿材→殖民地药品；明确不做远征消耗品）
- [x] 法则作收成修正（酸雨减农产、磁暴停实验室）
- [x] 袭击受伤居民 / 医疗舱给玩家家园缓慢回血
- [x] 袭击抢药品（工坊可被锁定）
- [x] 远征法则落地：声追者弱视循声 / 孢子趋光开路；补 `noiseAggroR`
- [x] 东西堆在地上（RimWorld 式入库）
- [x] 仓不够也能用地上堆（吃粮/用药/请客/盖房/工坊先仓后堆）
- [x] 饿了走去吃饭（仓库或地上粮，直线无寻路；生产跳不隔空吃）

## RimWorld 化路线图（2026-08-28）

- [x] A 事件叙事者：events.js（财富值+卡组+喘息窗口+怜悯），9 张事件卡，ev_ 前缀进 ADR-9，袭击开打时机并入导演（ADR-12）
- [x] B 心情崩溃：按性格分流的四种崩溃行为 + 宣泄回弹
- [x] C 游商贸易：seeded 库存、矿材硬通货、T 键交易面板、社交议价
- [x] D 工作优先级面板：人×技能 0~3 网格 + assignByPriority
- [x] E 袭击多样性：按 rival 个性分战术（强攻/盗掠/围攻）+ 多波次 + 溃退
- [x] F 健康分型：ailments 数组（外伤/感染/疫病），illness 保留为聚合值

## 自然资源生态与阶梯科技树（2026-08-29，Issue #21）

- [x] 1/5 基础自然资源模型：木材/石料/铁矿/野果/草药定义与仓库存储 (#22)
- [x] 2/5 家园自然生态实体生成：树木、铁矿脉、石块、灌木生成与渲染 (#23)
- [x] 3/5 居民采集作业循环：伐木、凿矿、采摘推进与物理掉落 (#24)
- [x] 4/5 建筑多材料配方与研究点解耦：物理建材消耗、0 研究点放置 (#25)
- [x] 5/5 阶梯前置科技树与蓝图解锁：4 大分支 requires 依赖链、蓝图解锁与 UI 展现 (#26)

## 异星奇幻农耕与远征驯化系统（2026-08-29，Issue #33）

- [x] 1/5 4 种异星作物定义与特产物品数据模型 (#34)
- [x] 2/5 家园外星种植槽与夜间生物发光系统 (#35)
- [x] 3/5 远征野生异星植物探索与种子采集返航 (#36)
- [x] 4/5 居民生态培育、田园照料与多维丰产结算 (#37)
- [x] 5/5 田园治愈动效、品种切换与全链路集成 (#38)

## 多群系异星生态系统与勘测图鉴（2026-08-29，Issue #39）

- [x] 1/5 4 大异星生态群系定义与 PlanetSpec 扩展 (#40)
- [x] 2/5 生态群系专属地表调色板与环境法则分化 (#41)
- [x] 3/5 群系主导原生植被与野生生物链分布 (#42)
- [x] 4/5 远征生态图鉴 (L 键) 与群系勘测档案 (#43)
- [x] 5/5 群系环境氛围粒子、光照调色与全链路集成 (#44)

## 工坊深度加工与外星装备系统（2026-08-29，Issue #45）

- [x] 1/4 5 大外星特种装备与配方表定义 (#46)
- [x] 2/4 工坊流水线加工推进与成品产出 (#47)
- [x] 3/4 装备穿戴机制与实战/环境抗性增益 (#48)
- [x] 4/4 工坊配方切换 UI 与全链路集成 (#49)

## 外星烹饪与餐饮社交闭环系统（2026-08-29）

- [x] 5 大外星熟食菜肴定义与身心增益（炙烤肉排/浆果浓汤/露果布丁/荧光温汤/珍馐盛宴）
- [x] 石料篝火 bl_campfire 与烹饪灶台 bl_kitchen 建筑定义与厨师岗位
- [x] 烹饪配方表 COOK_RECIPES 与 cookingTick 制作流水线
- [x] 篝火身心光环 campfireAuraTick（驱寒、恢复娱乐、围炉夜话羁绊提升）
- [x] 熟食款待过客大额好感 (+35) 与熟食优先就餐寻路
- [x] 篝火火焰动效、厨房蒸汽粒子与夜间发光源集成

## 异星实物标本化验与双轨制科研系统（2026-08-29，Issue #50）

- [x] 1/5 7 大异星实物标本与分析产物数据模型 (#51)
- [x] 2/5 科研站化验流水线与学者分析作业引擎 (#52)
- [x] 3/5 远征标本采集、狩猎掉落与背包带回 (#53)
- [x] 4/5 化验突破：定向蓝图解锁、纯净种荚、精纯试剂与尤里卡 (#54)
- [x] 5/5 科研站化验 UI、科学图鉴点亮与全链路集成 (#55)

## 全屏科技树与化验钥匙（2026-08-29）

- [x] T 键循环列表换成全屏四列科技图；游商改走近 [E]；硅壳化验是「外星生态适应」的唯一钥匙



## 开场起源与第一夜（2026-09-03，Issue #99）

- [x] 开场短片可玩：五镜时钟 + 跳过 + 「活下去」按钮 + 存档/死亡闸门 (#101)
- [x] 第一夜当前目标与过客闸门：盖居住舱 → 去睡 → 睡后过客来 (#102)
- [x] 开场五张静帧：动森风全屏插画 + 数据内联 (#100)
- [x] 开场视频接入：2.4MB H.264/AAC 全屏播放 + 自动/跳过显现「活下去」

## 玩家家园 HUD

- [x] 玩家病情进 HUD (#58)：家园 >0 显示, 远征隐藏且不结算

## 玩家俯卧图（Issue #59）

- [x] 俯卧一张 `player_prone`(4 向 × 4 呼吸横排 16 帧), 睡/倒共用, 击倒叠程序化伤痕+血泊不换色不叠五官; 全人形共用不另画脸 (ADR-0003); 玩家侧触发 flag 惰性(累塌/床边 E 另票)

## 居民脸 0 无包俯卧图（Issue #60）

- [x] `hum_0_nopack_prone` 16 帧横排（四向各 4），整人预烘焙；不旋转 walk、不运行时换色、不叠五官；缺图回退 `player_prone`

## 居民脸 1 无包俯卧图（Issue #61）

- [x] `hum_1_nopack_prone` 16 帧横排（四向各 4），codex 生成 + chroma_key + build_sprites 管线；同脸同风格；缺图回退 `player_prone`、绝不旋转走循环

## 居民脸 2 无包俯卧图（Issue #62）

- [x] `hum_2_nopack_prone` 16 帧横排（四向各 4），codex 生成 + chroma_key + build_sprites 管线；同脸同风格；缺图回退 `player_prone`、绝不旋转走循环

## 居民脸 3 无包俯卧图（Issue #63）

- [x] `hum_3_nopack_prone` 16 帧横排（四向各 4），codex **分向生成**（4 张 4 帧 strip 再拼 16 格——整张 16 帧生成时帧 4/12 易割裂/裁切）；同脸同风格；缺图回退 `player_prone`、绝不旋转走循环

## 击倒叠伤痕、睡着不叠（Issue #71）

- [x] 击倒与睡着共用同一张俯卧身子：玩家/居民/过客各自验证 drawPlayer/drawResident/drawVisitor 下 downed 与 isSleeping 都命中同一 prone sheet（`player_prone` / `hum_0_nopack_prone`），不另画 downed sheet、不运行时换色、不叠五官（ADR-0003）
- [x] 击倒叠伤痕/血迹、睡着不叠：`drawProneWounds` 仅 `lying && e.downed` 触发；渲染测试按 fillStyle 过滤伤痕 ellipse，击倒≥4 处、睡着 0 处；`updatePlayer` downed 分支清 `isSleeping`、`checkDowned` 清 `isSleeping`、`syncPlayerSleep` 双标志镜像 → 互斥成立
- [x] 几何不变式锁定：任意 contentH 的俯卧 sheet 均满足 `contentH × spriteScale(contentH) = drawH(78)` → 身体一律映射到 y∈[-78,0]，伤痕坐标固定贴体，绝不按 contentH 再乘缩放（防新增俯卧表错位）
- [x] 测试锁定：scenario 新增 3 渲染冒烟（居民/过客/玩家击倒叠伤痕 vs 睡着不叠 + 同 sheet + drawImage 走贴图路径非程序化回退），humanoid 新增 1 几何不变式；全量 375 单元 + 65 场景 + 3 perf + 7 boss = 450 项绿灯

## 玩家床边睡眠与唤醒（Issue #66）

- [x] 靠床 E 入睡用俯卧图：靠近居住舱 `bl_house` 60px 内按 E 睡（`meta.playerNeeds.isSleeping` → 实体每帧同步 → `drawPlayer` 俯卧）；只置 `nearBed` 提示位，绝不自动走向床
- [x] 唤醒：WASD/方向键（先醒后动）、E 再按、或受伤（伤害真正落地时）；睡着时除 E 外全部按键忽略
- [x] 睡中精力恢复：床铺 +25 / 地铺 +18 / 跳，回满自动醒；清醒时委托 `homeRestTick`（家园 -7、远征冻结）
- [x] 纯函数 seam 供 #67 累塌/#70 医疗舱躺复用：`setPlayerSleeping` / `playerWake` / `playerRestTick`（export 于 `APH.Res`，纯测试锁定）

## 玩家精力累塌（Issue #67）

- [x] 家园精力归零（`<=0`）原地强制睡着：`playerRestTick` 清醒跳委托 `homeRestTick` 掉到 0 后触发 `setPlayerSleeping(true,false)`——**打地铺**（`bedId=null`），不绑床、不走向床，即使正在操纵/站在床边
- [x] 只在家园触发：远征精力冻结不会见底，`scene==='home'` 门防老档/调试 0 值远征误塌（`CFG.player.restCollapseAt:0` 阈值可测）
- [x] 唤醒与 #66 完全一致：WASD（先醒后动同帧）/ E 再按 / 受伤均走同一 `playerWake`；睡中 `updatePlayer` 同步实体俯卧并清 `moving` 防残留走帧
- [x] 对齐修复：`playerRestTick` 自动醒也清 `bedId`；`setPlayerSleeping` 增可选床ID参（#70 医疗舱预留，默认保留 `bed_player`）
- [x] 测试锁定：survival 新增 6 纯例（累塌/地铺恢复/回满清床/远征不塌/床ID默认与覆盖/自动醒清床），scenario 新增 3 冒烟（累塌→实体俯卧+清走位、WASD 唤醒同帧移动、E/受伤唤醒）

## 玩家家园击倒送医（Issue #72）

- [x] 家园 hp<=0 → 击倒而非死亡：`hurtPlayer` 家园分支先于远征 clinicKit 复活/死亡分支（顺带修复远征残余 clinicKit 在家被误消耗）；不动 `clinicKit`/`stats.deaths`/`showDeath`，不进死亡画面
- [x] 击倒是与睡眠并行的昏迷态：`meta.playerNeeds.downed/downT` 持久真源 → 运行时 `s.downed` + 实体 `pe.downed`（`drawProneWounds` 叠伤痕）；WASD/E/全部按键忽略，无 E 唤醒，`firePlasma` 禁射
- [x] 有居民+医疗舱 → 送医拖行：`carryPlayerToClinic` 世界侧 lerp 拖向 `bl_clinic`（`CFG.player.downedCarrySpeed:70`），拖入治疗半径后 `playerDownedTick` 判复活（回血 `CFG.economy.clinicHeal:40`）
- [x] 无居民 → 倒计时死亡：`playerDownedTick` 纯函数按 `CFG.player.downedTime:90` 递减，归零由 `updateHome` 走死亡收口（`mode='dead'` + `stats.deaths++` + `showDeath`）
- [x] 远征死法不变：击倒只在家园分支生效，远征 hp<=0 仍走现有 clinicKit 急救/死亡；`playerDownedTick` 远征 no-op（老档保护）；`enterHome` 防御性清 stale downed
- [x] HUD：家园击倒显示红色倒计时条 `rowDowned`（`downT/downedTime` 百分比 + 剩余秒数），复活/死亡自动隐藏
- [x] 测试锁定：survival 新增 6 纯例（倒计时递减/送医复活/有舱无居民不解救/归零死亡/远征 no-op/未击倒 no-op + ensurePlayerNeeds 默认），combat 新增 3 例（家园击倒≠死亡/不消耗 clinicKit/远征仍死亡），scenario 新增 6 冒烟（击倒→实体俯卧+绘制不崩、WASD 不移动不醒、hurtPlayer 家园 vs 远征、送医复活、远处拖行、无居民倒计时死亡）

## 居民睡着改俯卧（Issue #68）

- [x] 睡着的居民**原地冻结、俯卧贴地**：`updateResidents` 对 `isSleeping` 居民短路（跳过进食/搬运/岗位/行走，清 `walking`），`walkToward` 睡眠守卫冻结位置并清走位残留（俯卧身不再滑动）；不瞬移、不改变 `bumpWalkPh`/`face`
- [x] 按脸用对应专用俯卧 sheet：睡/倒共用 `hum_0..3_nopack_prone`（脸由 FNV-1a mod 4 决定，`rs_3→0/rs_4→1/rs_1→2/rs_6→3`），**不再站立待机+💤**（`drawResidentMarks` 删除 Zzz 分支；俯卧身+拉长阴影即睡眠指示；恢复面板 `💤[睡眠]` 徽标属 UI 保留）
- [x] 过客/士兵/玩家不动：过客无 `isSleeping` 触发（`drawVisitorMarks` 本无 Zzz 分支）、士兵 `drawEnemy` 无俯卧路径、玩家睡眠已由 #66/#67/#70/#71 接入；袭击唤醒（`disturbSleep` 清 `isSleeping`）不受影响
- [x] 测试锁定：residents 单元 walkToward 睡眠守卫（不移动/清 walking/不推进 walkPh）+ humanoid poseFor 脸1/脸2 专用俯卧 sheet + scenario 渲染（四脸 sleep 命中对应 `hum_*_nopack_prone`、无 `*_walk`、无伤痕、无💤）+ scenario 场景（睡着居民 20 帧原地不动、walking=false、不拾取）

## 玩家病了躺医疗舱（Issue #70）

- [x] 病了不自动走向医疗舱：`updateHome` 检测 60px 内最近医疗舱 `bl_clinic` 实体 → `s.nearClinic`（只置提示位，绝不写 `s.target`，无自动寻路）
- [x] 靠近医疗舱按 E 躺下：生病（`illness>0`，`playerSick()` 纯helper）玩家靠舱 E 调 `setPlayerSleeping(needs,true,true,'bed_med')`（绑 `bedId='bed_med'`，复用 #66 seam 第 4 参），实体标志每帧同步 → `drawPlayer` 俯卧；E 再按唤醒
- [x] 舱内躺卧按床速恢复：`residentsTick` 的 `playerRestTick` 调用 `hasBed=!!nearBed||!!nearClinic` → 舱内躺卧 +25/跳（非地铺 18），回满自动醒并清 `bedId`；健康玩家按 E 不躺（E 躺入仅生病可触发）
- [x] 与 #72 击倒互斥：击倒玩家靠舱按 E 被 `playerDowned()` 短路阻断（无 E 躺入）；与 #67 累塌不冲突（累塌只从清醒分支触发，不会覆盖舱内躺卧）
- [x] 配置：`CFG.player.clinicSleepRadius:60`（镜像 `bedSleepRadius`，读时回退 60）
- [x] 测试锁定：survival 新增 3 纯例（bed_med 床速恢复/回满自动醒清床/playerWake 清 bed_med），scenario 新增 6 冒烟（不自动躺/不自动寻路、生病+靠舱 E 躺入+俯卧+绘制不崩、躺舱中再按 E 唤醒、健康玩家不躺、击倒玩家 E 阻断、舱内按床速 +25 恢复）

## 病重/击倒居民躺医疗舱（Issue #69）

- [x] 病情**严格超过 `CFG.residents.sickBedAt:50`**（`needsMedBed` 纯函数；恰 50 不躺，边界测试锁定）或击倒（`downed`）的居民**自动走向医疗舱床位**（`clinicBedSpot` 纯函数 = `bl_clinic` 实体 +16/+22，与 `residentSpot` 同款偏移；只覆写 `e.tx/ty`，镜像 #64 饥饿分支）
- [x] 到床（`clinicBedArriveR:6`）即**俯卧**：`e.medLying`/`r.medLying` 并行标志（不复用 `isSleeping`，避免 rest≥100 自动醒冲突），复用 `hum_0..3_nopack_prone`（`drawNpcSprite` 的 `lying` 含 `medLying`）；`walkToward` 守卫冻结卧位，`updateResidents` 短路过正常岗位/走位；躺床撤岗（`r.job=null`），`assignByPriority` 缺勤，`syncResidentEntities` 每帧镜像
- [x] 轻病（>20 且 ≤50）**不强制躺**：仍慢走（`sickSpeedMul:0.6`）+ ✚（`sickMarkAt:20`），渲染测试锁定两档病情都画 ✚
- [x] 击倒者匍匐去床：`downedCrawlMul:0.5`（×56 → 28px/s）；无医疗舱时击倒者原地俯卧（`e.downed` 渲染接管）；病重无舱者走正常流程
- [x] 接线孤儿 `checkDowned`/`rescueTick`（生产跳=30s）：`residentsTick` 每户一判、倒计时递减、舱内有药救活（扣 1 药、击倒者不参与选病剂 `applyMed` 双扣）、超时死亡收口（名册 filter + `saveMetaQuiet`）；病情回落 ≤50 且未击倒自动起身（`needsTick` 起床门）；医疗舱被拆躺舱者起身
- [x] 测试锁定：residents 单元 +4（needsMedBed 边界/clinicBedSpot 偏移/walkToward 躺舱守卫/needsTick 起身门），scenario +4（病重自动去床俯卧+sync 保留+俯卧 sheet、轻病慢走+✚、击倒匍匐 14px/帧、residentsTick 击倒判定+送医接线）

## 建筑系统 v3 · 基建联动（2026-08-30 grilling 定案，以环世界为参考）

- [x] ADR 落盘：`docs/adr/0004-grid-pathfinding.md`（网格寻路）+ `docs/adr/0005-power-grid.md`（实体导线电力网）+ DESIGN.md 表 ADR-13/14
- [x] to-spec 发布：GitHub **#73** Spec（ready-for-agent）；to-tickets 发布：#74-T1 寻路引擎 / #75-T2 墙+门 / #76-T3 居民绕墙 / #77-T4 袭击破墙+围攻打墙 / #78-T5 弹道掩体 / #79-T6 电网核心 / #80-T7 耗电联动 / #81-T8 餐桌椅 / #82-T9 无顶房间+路灯 / #83-T10 陷阱+沙袋，blocking 边已挂（native dependencies）
- [x] 资产补票：**#84-T0 建筑v3视觉资产**（Issue 数量歧义已统一为 11 项，走 ADR-11 管线；Blocked by None）；#75/#79/#81/#82/#83 全部加 `Blocked by #84`（用户指出「建筑还没有模型」——从 Out of Scope 移入范围，spec #73 已修订）
- [x] 班 1（T0,T1-T7）：**#74 T1 寻路引擎 ✅**（已合入 be8e527，闸门=可通行语义锁定）；**#84 T0 视觉资产 ✅**（da123wda：11 项 PNG 走 ADR-11 管线，PR #90 merge 7ed1509）
- [x] 班 1：**#75 T2 墙与闸门 ✅**（建筑目录/格层渲染/拖拽连续放置/玩家撞墙推挤/素材拆退建材；HP→T4 拆分）
- [x] 班 1：**#76 T3 居民绕墙 ✅**（walkAround+Nav.astar+缓存，无墙逐帧一致）
- [x] 班 1：**#77 T4 袭击破墙 ✅**（绕墙找门/无路拆墙/墙HP/围攻打墙）
- [x] 班 1：**#78 T5 弹道掩体 ✅**（segHitBox/统一拦截层/自家墙不豁免/墙碎穿透恢复）
- [x] 班 1：**#79 T6 电网核心 ✅**（BFS连网/供电结算/电池兜底/未激活兼容/太阳能×天气）
- [x] 班 1：**#80 T7 耗电联动 ✅**（powered写建筑/炮塔停机/农场减产/医疗舱停诊/HUD电网行）—— **班 1 全部完成**
- [x] 班 2：**#81 T8 餐桌椅 ✅**（colony 注册/座位分配纯函数/坐椅面桌吃/无桌罚/😋浮标；见 JOURNAL 2026-08-31）
- [x] 班 2：**#82 T9 无顶房间+路灯 ✅**（Nav.roomsOf flood fill 围合判定/房间暴露免疫/卧室心情增益/bl_lamp 夜亮断电灭；见 JOURNAL 2026-08-31）
- [x] 班 2：**#83 T10 尖刺陷阱+沙袋 ✅**（格上静态物/敌踩触发一次性/居民重置耗石/沙袋减速50%/已触发警示渲染；见 JOURNAL 2026-08-31）—— **班 2 全部完成**
- [x] 数值全部进 CFG（ADR-10）：dining*/roomMoodGain 进 CFG.residents、trap*/sandbag*/bleed* 进 CFG.defense、路灯 load/prio 进 CFG.power（T8-T10 落地时已随票完成）；寻路/BFS/房间判定/座位分配均为纯函数 node 可测（nav.test/residents.test/colony.test 锁定）

## 天气系统 v1（2026-08-30 grilling 定案，以环世界为参考）

- [x] ADR 落盘：`docs/adr/0006-weather-system.md`（马尔可夫状态机/导演调度/暴露缝合）+ DESIGN.md 表 ADR-15 + 天气系统 v1 章节 + CONTEXT.md 天气术语节
- [x] to-spec 发布：GitHub **#85** Spec（12 种天气/导演调度/暴露复活/玩家轻量裁剪/solarMul 预留）；to-tickets：#86-W1 状态机 / #87-W2 导演接线 / #88-W3 效果接线 / #89-W4 粒子渲染，blocking 边已挂
- [x] **W1 天气状态机（#86）**：✅ 已完成合入（d356778）；W2-W4 并行实现已完成合入（a8840ea）
- [x] W2 导演调度接线（#87）：✅ ev_weather 进事件卡组 + directorTick 掷骰 → meta.weather + 喘息窗口
- [x] W3 效果接线（#88）：✅ exposureTick 复活 + 农场乘子 + 玩家减速 + HUD 天气行 + 雾天敌感知 + 装备减免
- [x] W4 粒子渲染（#89）：✅ 雨/雪/雾粒子 + 天色 tint + fxParams 纯函数 + caps 预算
- [x] 天气系统收尾：W1-W4 全链完成合入（3ad9a9f→63cdde2）；三票已关（#86/#87/#88/#89），Spec #85 已关（2026-08-31）
- [x] 数值全进 CFG（ADR-10）；solarMul 已被 `colony.js:487 powerSolarOutput` 读取；玩家不新增 exposure 条（显式裁剪）

## 新排期 · 家园纵深轮（2026-08-31 定，基建/天气闭环之后）

> 方向：基建搭完了，下一步让「家像家、天看得见、敌人会玩」。
> 原则：小步快跑（每班 1~2 项）；数值全进 CFG；纯函数可测；RimWorld 为参考但不照搬。

### P1 天气闭环补齐（小，2 项连做）

- [x] 天气预报 HUD (#92)：`APH.Weather.forecast` 确定性权重推导（排除冷却中, 不消费rng）+ HUD「明日 X」段 —— 已完成合入 9c58412
- [x] 玩家 exposure 条 (#93)：`playerExposureTick` 纯函数（+8/跳累积 / -12/跳消退 / 防酸服减免 / 不转伤病）+ HUD 第六行 + >80 减速 —— 已完成；顺带修复 scenario 桩缺 nav.js（T9 场景测试此前假阳性）

### P2 战争纵深（小→中, 2 项）

- [x] 敌人会躲陷阱 (#94)：A* costFn 代价惩罚（陷阱格+6）绕行优先；lineClear 途经陷阱强制寻路比较；绕无可绕仍踩不卡死；已触发/沙袋不罚 —— 已完成
- [x] 围攻工兵拆陷阱 (#95)：path 途经待触发陷阱 → trapAtkId 拆陷阱意图 → 48px 内 strikeTrap（记录移除+掉石料+豁免踩）；无陷阱堵点回归破墙 —— 已完成
- [x] **P2 战争纵深全链完成**（#94 绕陷阱 + #95 拆陷阱）

### P3 生活家具（中, RimWorld 房间幸福度方向）

- [x] 家具三件套逻辑 (#97)：bl_tv/bl_shelf/bl_carpet 注册（te_machining/成本/核心豁免）+ roomMoodGain 聚合扩展（卧室级+家具逐件, CFG.furnitureMood）—— 已完成（渲染待 #96 资产）
- [x] 房间幸福度聚合：(#97) 房间心情 = 卧室级(2) + 家具加成(电视/书架/地毯各1)；T9 兼容（无家具仍 +2）—— 已完成
- [x] P3a 家具视觉资产 (#96)：codex exec 生图（tv/shelf/carpet）→ flood fill 抠绿打包 8 帧 sheet → build_sprites.py → SPRITE_META 实测值 → 截图验证 —— **P3 全链完成**

### P4 远景（大, 单独立项, 本排期不排细节）

- [x] 势力外交与战略威慑系统（#103）：关系度三级状态机（宿敌/中立/盟友，-100~+100）+ 纯函数外交行动（纳贡平息/通商协定/军事威慑）+ 远征基地击破重创联动 + O 键全屏外交面板（#104~#107 全链完成）
- 温度/湿度模拟（DESIGN 天气 Out of Scope：RimWorld 温度是独立大系统）
- 屋顶与多层建筑（无顶是显式裁剪；除非用户点名再做）

### 收尾惯例（每项完成时）

- 构建绿 + 全量测试绿（run/scenario/perf/boss 四件套）
- JOURNAL 追加（时间戳/做了什么/验证证据/下一步）
- BACKLOG 勾选 + GitHub issue 认领（如开票）

## 架构深模块重构 · 第一期（2026-09-04，Spec #108 / ADR-18）

- [x] **M1** 建立 APH.UI 模态管理器与通用生命周期接缝 (#109)：`registerModal, open, close, toggle, closeActive, hasActiveModal` + 自动暂停/恢复 + 35 个单测通过
- [x] **M2** 图鉴、科技树与设置面板迁移至 APH.UI (#110)：`codex`, `techMap`, `llmSettings` 迁移，`main.js` 改走高阶接缝
- [x] **M3** 势力外交与游商交易面板迁移至 APH.UI (#111)：`diplomacy`, `trade` 迁移，纳贡/通商/威慑/买卖逻辑内聚
- [x] **M4** 居民名册与建造抽屉迁移 + main.js 深度瘦身与全量回归 (#112)：`roster`, `buildCatalog` 迁移，Esc 键收敛为一行 `APH.UI.closeActive()`，`main.js` 削减 700 行代码，全量测试 100% 绿灯

## 架构深模块重构 · 第二期（2026-09-04，Spec #113 / ADR-19）

- [x] **I1** 建立 APH.Input 基础分发器与上下文栈核心 (#114)：`CFG.keybindings` 键位隔离 + 上下文栈管理 + 4 个纯单测通过
- [x] **I2** APH.UI 模态生命周期联动上下文栈与流水线接入 (#115)：`build.py` 纳入编译管线，模态打开自动 `pushContext`、关闭自动 `popContext`
- [x] **I3** 迁移全量键盘动作为语义 Action 分发并精简 main.js (#116)：消灭 308 行巨型 keydown 嵌套分支，声明式动作订阅
- [x] **I4** 全量端到端测试与场景回归验收 (#117)：全量 802+ 自动化测试 100% 绿灯，构建绿

## 架构深模块重构 · 第三期（2026-09-04，Spec #118 / ADR-20）

- [x] **E1** 建立 APH.Ent 空间检索与生命周期接缝核心 (#119)：`findNearest`, `findNearestBuilding`, `findNearestFood`, `destroy`, `sweepDead` + 4 个单测通过
- [x] **E2** 迁移 updateHome 8处手写建筑与食物就近扫描至 APH.Ent (#120)：农田/工坊/厨房/篝火/实验室/床铺/医疗舱/发射台及食物挑拣全部走空间接缝
- [x] **E3** 统一实体安全销毁与帧尾 SweepDead 清洗接缝 (#121)：根除 9 处散落的 `entities.filter` 与遍历 `splice`，统一帧尾安全过滤
- [x] **E4** 全量端到端测试与场景回归验收 (#122)：全量 806+ 自动化测试 100% 绿灯，构建绿

## 架构深模块重构 · 第四期（2026-09-04，Spec #123 / ADR-21）

- [x] **S1** 建立 APH.Colony 建造与生产高阶推进接缝 (#124)：`tickConstruction` 建造蓝图粒子同步 + `tickProduction` 30s电网与产出
- [x] **S2** 建立 APH.Combat 袭家与防务高阶推进接缝 (#125)：`tickRaid` 袭击预警、炮塔索敌开火动画、围攻刷怪与溃退盘点
- [x] **S3** updateHome 上帝函数彻底瘦身与高层时序调度化 (#126)：410 行上帝循环收敛为 ~25 行纯阶段调度，main.js 进一步瘦身
- [x] **S4** 全量回归、性能护栏与四期收尾验收 (#127)：全量 810+ 自动化测试 100% 绿灯，构建绿

## 居民人际网络与动态社交系统（2026-09-04，Spec #128 / ADR-22）

- [x] **S1** 关系五级状态机与名册卡片展示 (#129)：`CFG.social.tiers` + `APH.Res.relationshipTierOf` + `player` 羁绊支持 + R 键名册卡片展示
- [x] **S2** 生产岗位协同与同室避嫌 (#130)：同岗好友 +15% 产出协同，宿怨打折且爆发口角；同室死敌夜间避嫌心情减益
- [x] **S3** 场上微互动与动森式 Emoji 微气泡 (#131)：擦肩停步 1.5s 转向交流 + 16px 矢量 Emoji 微气泡 + 90s 对偶冷却与紧急状态豁免
- [x] **S4** 玩家日常互动与精神崩溃安抚干预 (#132)：玩家 E 键打招呼/安抚语义切换 + 社交技能与好感综合安抚判定 + 暴躁失败转火反噬

## 精细化仓储分类与智能物流系统（2026-09-04，Spec #133 / ADR-23）

- [x] **L1** 1×1 置物货架建筑与仓储品类过滤 (#134)：`bl_storage_shelf` + `CFG.storage` 五大品类映射 + E 键单键预设轮转
- [x] **L2** 掉落物露天劣化与天气腐烂模型 (#135)：100 HP 耐久模型 + 雨雪×2/酸雨×4加速腐烂 + 封闭房间与货架永久免疫
- [x] **L3** 搬运工全图巡视与 48px 批量多堆抓取 (#136)：1200px 视野 + 48px 邻近多堆顺带拾取（至多3堆/50件）
- [x] **L4** 车间工位 120px 就近取料与全场景冒烟闭环 (#137)：厨房/工坊/诊所/就餐 120px 就近货架优先取料 + 货架实物陈列渲染

## 远征探险与异星古代遗迹系统（2026-09-04，Spec #138 / ADR-24）

- [x] **R1** 远征古遗迹确定性生成与密封石室结构 (#139)：`generateAncientRuins` 纯函数 + 石壁/闸门实体 + 破门揭开迷雾
- [x] **R2** 机械族守卫远古哨兵与能量护盾系统 (#140)：`fx_automaton` 机械族 + 能量护盾削扣与脱战回充 + 掉落史前核心
- [x] **R3** 古代终端学识破译与密室防御反制 (#141)：`sk_lore` 破译解谜 + 激活防御反水协助作战 + 失败警报反噬
- [x] **R4** 远古遗物箱与家园终极科技反哺闭环 (#142)：远古遗物箱开箱 + 科研站化验突破终极科技 + 史前永恒发电机

## 微环境温度与冷热生存控制系统（2026-09-04，Spec #143 / ADR-25）

- [x] **T1** 环境气温与房间热阻传导模型 (#144)：`ambientTemperatureOf` + 房间热阻传导 + HUD 天气行温度显示
- [x] **T2** 电暖器与制冷空调温控电器建筑 (#145)：`bl_heater` (40W) + `bl_cooler` (50W) 接入实体电网与目标控温
- [x] **T3** 冷冻冷库食物永久保鲜与温室防冻 (#146)：<0°C 食物腐烂锁零永久保鲜 + 作物适温生长与冻害减产
- [x] **T4** 失温与中暑生理机制及全场景冒烟闭环 (#147)：失温/中暑累积与消退 + 防寒服拓展至-35°C + 虚脱击倒与全链路冒烟

## 新建筑与遗迹实体视觉资产补票（2026-09-04，Spec #148 / ADR-26）

- [x] **V1** codex exec 批量生成 12 张建筑与敌人 sheet PNG (#149)：置物货架/电暖器/制冷空调/等离子重炮/永恒发电机/种植圃/远古石壁/闸门/终端/遗物箱/机械哨兵
- [x] **V2** SPRITE_META 注册与实体渲染接线 (#150)：SPRITE_META 实测值 + drawBuilding/drawEnemy sprite 优先 + 闸门力场叠加 + 全量回归

## 环世界式全自动命令体系（2026-09-04，Spec #151 / ADR-28）

- [x] **G1** 优先级网格扩展 + 居民自动采集 AI (#152)：R 面板 8 列 + 采集/搬运优先级 + 居民自动砍树挖矿 + 就近优先 + 袭家豁免
- [x] **G2** 自然资源再生与烹饪产出入货架 (#153)：死亡 flora 定时重生 + 烹饪产出入 120px 食材货架

## 环世界全量对齐（2026-09-06）

总计划：`docs/rimworld-full-alignment-plan.md`（先拍板第 3 节五个分叉，再拆票）。

> **对账（2026-09-07）**：这四行长期挂着未勾，但代码里绝大部分早已落地——
> 勾选没跟上实现，看起来像「什么都没做」。下面按逐项核对结果重写，
> 每项附证据位置；只有确实没做的才留空框。

**P0 — 能看着过日子：已完成**

- [x] 暂停 / 倍速（空格 + ×1/×2/×3）：`main.js` `s.paused` / `s.timeScale`，`setTimeScale`
- [x] 警报条（可点击跳镜头）：`alerts.js` → `ui.js` `APH.Alerts.collect/focus`
- [x] 指挥官与居民同一套大脑：`residents.js thinkPawn`，指挥官与居民共用（`updateCommanderAutonomy` / `updateResidents`）
- [x] 一天时长对齐：`config.js dayLen: 3600`（60 分钟）
- [x] 右键上下文：`handleContextMenu`（出航/开箱/破译/送医/返航/强制微操）

**P1 — 生活与生产闭环：已完成**

- [x] 作息表 24 格：`residents.js scheduleAt / cycleScheduleSlot`，`tests/schedule.test.js`
- [x] 念头 Thought（28 条）：`CFG.thoughts` + `collectThoughts`
      —— **2026-09-07 起真正驱动心情**（ADR-31），此前只在检查器里显示，不影响模拟
- [x] 检查器需求条：`ui.js inspNeedRow`（饱食/精力/娱乐）
- [x] 工单 Bills：`tests/bills.test.js`，厨房/工坊工单
- [x] 仓储划区 + 禁止物品：`colony.js` zones + `zone.forbid`，`tests/zones.test.js`
- [x] 种植划区：同 zones（`type:'grow'`）
- [x] 房间职能判定：`nav.js roomsOf/roomAt`，`tests/rooms.test.js`
- [x] 工作动画：`entities.js` workAnim（🪓 砍 / 🔨 建 / 🍳 炊 / 📦 搬）

**P2 — 质量、身体、动物、火：多数完成**

- [x] 清洁与清扫工作：`colony.js addFilth/filthAt/cleanCells` + 清扫工作
- [x] 修理与建筑掉耐久：`colony.js decayBuilding/repairBuilding`（`main.js` 每跳修 1.2）
- [x] 部位伤与机能：`residents.js BODY_PARTS / capacitiesOf`
- [x] 尸体与埋葬：`corpse` 实体 + 埋葬交互 + `th_saw_corpse` 念头
- [x] 动物个体：`colony.js makeAnimal / syncPastureAnimals`
- [x] 火灾与灭火：`colony.js addFire/tickFires/douseFires`
- [x] 活动区 Restrict：`colony.js` `type:'restrict'` 区 + `pawn.restrictId`
- [x] 打猎规划：`pickHuntedAnimal` + 打猎工作
- [x] **美观 Beauty**：`Res.roomBeauty` —— 正分复用 `roomMoodGain`，负分为工业设施
      （发电机/采矿机 −3）、污秽（−0.6/单位）、尸体（−5/具）；汇入 ADR-31 念头，
      一个房间只挂一条。`th_pretty_room` 终于有了来源，「别把发电机塞进卧室」成为真决策
- [ ] **屠宰台**：⚠ **需先拍板**——本作动物死亡直接掉 `it_food`（`workOnAnimal`），
      根本不产生尸体；唯一会变成尸体的是**殖民者**。所以「屠宰台」当前只有两种落法：
      (a) 对动物 = 与现有掉落重复，(b) 对殖民者尸体 = 食人。后者是很重的黑暗机制，
      不像用户想要的东西，故不擅自实现

**P3 — 可选深度**

- [x] 囚犯（非奴隶）：`residents.js releasePrisoner` + 囚犯状态
- [x] 性格崩溃：4 种（`BREAK_NAMES`）——环世界有数十种，按需再扩
- [ ] 技能热情 Passion：未实现（只有技能数字，没有学得快/爱做的区分）
- [ ] 更多崩溃类型 / 义体 / 装备磨损
- 奴隶与四大 DLC：**不做**（用户红线）

## 殖民地优先重设计（2026-09-07 拍板）

> 诊断与完整计划：`docs/colony-first-redesign.md`
> **拍板：殖民地是游戏本体**；远征降级为「只带回种不出来的东西」的短程补给跑。
>
> 根因不是缺系统，是缺循环：过了第一夜 `objective()` 永远返回 null（游戏不再要求
> 任何东西），且**没有任何失败条件**——殖民地不可能覆灭、死亡只是换个星球。
> 威胁阶梯造得很好，但在不可能输的游戏里只是烟花。

- [x] **T1 赌注成立**：殖民地覆灭判定（立过殖民地再归零 = 本局结束，研究/科技/库存
      随之失去）+ 指挥官获得 `mood` 并由念头驱动（此前 `playerNeeds` 根本没有 mood）
      + 覆灭结算页「重建殖民地」清档重来
- [x] **T2 目标阶梯**：`APH.Colony.colonyGoal` 按真实殖民地状态逐级发问
      （招人 → 农场 → 囤粮 → 通电 → 防线 → 医疗舱 → 发射器），永不枯竭
- [x] **T3 季节**：`Weather.seasonAt` 纯函数（一年 4×6=24 天）；冬天 `growMul=0`
      田里不长 + 气温 −18°C；入冬预警进警报条；过冬存粮由 `Colony.winterFoodNeed`
      从真实经济推导（**拍脑袋的 40/人与 120 存粮分别高了 4× 与 12×，已实测纠正**）
- [x] **T4 远征降级**：掉落表进 `CFG.expedition.lootTable`，只留晶体矿/遗件（换研究点）；
      散装资源禁入（`bulkStores` 测试钉死）；种荚仍只来自实验室化验；
      任务简报不再承诺「出门补给食物/矿材」
- [x] **T5 结局**：`te_deep_signal` → `bl_transmitter`（max:1，耗电 80）→ 通电按 E
      呼叫救援通关；通关页讲这一局的故事（存续天数/登船人数/失去的同伴）

### T1 之后仍悬而未决（需要设计拍板，不要闷头写）

- [x] **ADR-45 没有主角**：玩家化身整个拆掉（自治 171 行 + `[E]/[F]` 交互 366 行
      + `near*` 探测 + 玩家需求结算 + 击倒送医链路 + 四处 UI 卡 + 六条 HUD 状态条
      + `T.PLAYER` 实体）。开局播种 3 名殖民者；HUD 改报人口/床位；
      检查器默认给殖民地概览；远征改成派队（队员是普通 RESIDENT，指挥层原样复用）。
      **只要还有一个人活着本局就继续，覆灭是唯一失败出口**

- [ ] **`[E]` 拆掉后暂时没有入口的动作**（各自要变成殖民者命令或面板动作）：
      招募过客 / 请客 · 安抚崩溃者（提示已在说「派人去安抚」，但还没这条命令）·
      远古遗物箱 / 数据终端 / 能量闸门（远征）· 切菜谱 / 切配方 / 切化验目标
- [ ] **清掉 `s.px/s.py` 残留**：主角没了，这两个字段还在少数地方当「镜头焦点」用，
      应彻底改成 `camX/camY` 或删除
- [ ] **远征队员的伤亡**：`s.hp` 仍是全局一条血。应改成每名队员各自的生命，
      队员战死 = 名册少一个人（而不是本局结束）

## 架构债（2026-09-07 复盘，逐项有护栏）

> 详见 `docs/adr/0029-module-layering.md`；护栏在 `tests/layering.test.js`。
> 这些**不是**游戏跑不起来的原因，是让「下一个十个功能」变贵的原因。

- [x] **ADR-37 念头上下文收口**：main 与 ui 各有一份且已分叉（ui 少了美观/房间/同室/篝火），
      指挥官检查器又开始撒谎。统一挂 `APH.Res`
- [x] **ADR-38 模拟循环单一归属**：colony/combat 的 12 处 `APH.Main` 反向调用清零；
      `tickProduction` 改为返回「本跳是否发生」，编排归还 main；落成/围攻改走事件总线
- [x] **ADR-39 ui.js → APH.Main 清零**（27 处代码 + 10 处藏在 onclick 字符串里，棘轮数不到）：
      存档 → `APH.Save` / `Colony.persist` / `Rivals.persistStates`（且不再绕开 Save 的降级兜底）；
      领域查询 → 下沉 `APH.Colony`（ui 的 `getStock` fallback 曾漏算地上堆）；
      命令派发 → `APH.UI` 命令表，main 加载期 `registerCommands`。
      棘轮表清空 + 新增一条只剥注释的用例专堵内联 onclick
- [x] **ADR-40 模拟层不再直接驱动 UI**：`combat.js` 52 处、`colony.js` 6 处
      （实际比登记的 38/5 更多）改为 `U.emit('notice'|'hint'|'death')` 由 ui 订阅。
      那 58 处手写的 `if(window.APH.UI && ...)` 守卫本身就是「方向不对」的自白，
      现在由 `emit` 统一保证。顺带修掉 ui.js 11 处 `floatText` 实参错位
      （传了 `(txt,400,300,col)`，签名却是 `(txt,col)` → 一直沿用上一条飘字的颜色）
- [x] **ADR-41/42 main.js 拆分第一批**：提示层 → `src/hints.js`（`APH.Hints`，217 行，
      纯读取、不碰 DOM）；30 秒生产跳与覆灭判定 → `src/colonytick.js`
      （`APH.ColonyTick`，498 行，对 UI/Main 引用为 0）。
      顺带把 main 代管的领域助手送回归属地（`Res.playerFood` 等 5 个、
      `Res.residentOf/recruitCtx`、`Colony.recordOf/nearestMeal`）。
      **main.js 6048 → 5297 行**
- [x] **ADR-43 main.js 拆分第二批**：绘制层 → `src/draw.js`（`APH.Draw`，349 行，纯输出）；
      访客拜访/请客/招募 → `src/visitors.js`（`APH.Visitors`，232 行）。
      顺带 `Ent.selectedPawn` / `Colony.nibblePile` 归位。
      **main.js 5297 → 4787 行**（ADR-41/42/43 累计 6048 → 4787，−1261）
- [ ] **main.js 拆分第三批**：`updateResidents` ~470 行（居民世界侧接线，
      依赖 10 个 main 本地函数，需先把 `pawnWorldAt`/`tryEatHere`/`doHaul` 理清）
- [ ] **`selfCenter` 接不接**：T11 相机自愈保护（画面偏移超阈值就硬对齐），
      ADR-43 发现**全项目从来没有调用过它** —— 写完没接上。代码已放回相机段并标注。
      要么接进 `updateCamera`，要么删掉，别让它继续挂着
- [~] ~~输入绑定 `bindInput` ~600 行~~（**不做，已结论**）：ADR-43 复核后认为不该搬 ——
      main 是组合根，把 DOM 事件接到各模块上本来就是它的活。
      真要动，该拆的是处理器里顺手写的业务逻辑，不是绑定本身
- [ ] **CFG 1110 行单层对象**：按域拆命名空间
- [ ] **提示优先级存疑两处**（ADR-41 搬出提示层后才看清，用例已按现状钉死，
      要改先拍板）：① 第一档「物资告急」盖得住「击倒昏迷 · 生命垂危」——
      快死了却在提示种田；② 「没有口粮 · 请标记浆果丛采摘」这句具体指路
      被「食物将尽」盖住，玩家看不到该怎么办
- [ ] **飘字颜色 → 语义等级**：模拟层 emit 里仍写死 `#ff9a9a` 这类色值，
      应改成 `level:'danger'` 由 ui 决定调色板。ADR-40 刻意没做 ——
      现有 58 处用了 15 种色值，收敛必然改变画面，**需要先拍板调色板**

## 建筑 v4 试建（#186，独立入口）

- [x] 两间自建房原型：统一 48px 占格、四向旋转、连续墙门、地板/导线/屋顶分层、家具实体碰撞、可预约互动格与蓝图施工。内存入口 `?prototype=building-v4`，不读写正式存档。
- [x] 原型验证：几何与行为、完整模块入口/DOM、键盘命令、离线 Canvas 占地与墙缝检查；正常游戏构建与全套回归。
- [x] 将已确认的暖色迫降殖民地美术接入试建：回收舱板、织物床褥、旧设备、桌灯、土色地面与舱内面板 UI；图标/预览/实体共用图集和占格。
- [x] 普通游戏墙层改用连续格网轮廓，保留旧坐标、伤条与昼夜链路，去除巨型独立等轴墙块及逐格内框。
- [ ] 玩家实机视觉与操作手感验收；通过后再拆正式建造系统迁移规格与票据。试建入口已按玩家要求合入 main。

## 已知不做（用户红线）

- 不做文字聊天型玩法、不回退 3D、不引入"重生"叙事
- 殖民地优先结构不可动摇（出生永远在家）
- 经营优先：不把主循环做成射击游戏
- 不动 /Volumes/DevSpace/tuite 等 X 运营资产；不加任何 API key
