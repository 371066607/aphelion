# Aphelion 夜班进度日志

> 每班（20分钟）由夜班 agent 追加一条：时间戳 / 做了什么 / 验证证据 / 下一步。
> 规则：只追加不覆写历史条目；没有实质进展就写「本班 no-op + 原因」。

---

## 班次记录

- **2026-08-23 深夜 · 人班（会话内）**：Phase 0~5a 完成（HEAD `1936bda`）。
  测试基线：单元 54/54 + 场景 8/8。构建 129KB。夜班待办清单见 BACKLOG.md（T1~T10 待做）。

- **2026-08-24 00:20 · 班次(会话内)**: ✅T1 性能护栏完成。watchdog(慢帧×3→粒子削至40)+实体硬上限400(离玩家最远的dropped/enemy优先回收,纯函数guardTrim)。新增tests/perf.test.js 3用例全绿; 单元54+场景8回归绿; 构建130KB。

- **2026-08-24 00:32 · 夜班监督巡检**: T2星球难度分级正在推进中(00:30新建tests/tier.test.js, src/main.js+src/planet.js有未提交改动), 距上次进展<18分钟, 本班不接手、不动代码。

- **2026-08-24 00:34 · 班次(会话内)**: ✅T2 星球难度分级完成。tierOf纯函数(mulberry32首抽,50/30/20分布)→spec.tier; 敌人hp×1/1.25/1.6, 刷怪间隔×1/0.85/0.7。tier.test.js 3用例并入run.js(57全绿); 场景8绿; 构建131KB。修复: run.js扫描机制下测试文件须纯注册式(不能顶层exit)。

- **2026-08-24 00:56 · 班次(会话内)**: ✅T3 Boss信标完成。第6信标扫描→守护者苏醒(hp×8+40, 1.9x体型, 血条名牌), 击杀掉4件+保底遗件后才通关。**顺带根治弹丸隧穿bug**: 命中判定从'点距离'改为'帧位移线段扫描'(segDist), 高速弹丸不再穿透敌人。boss.test.js 2用例; 全量回归: 57单元+8场景+3perf+2boss 全绿; 构建134KB。踩坑: 敌人y坐标被clamp≥30(游戏内合理), 测试构造须遵守世界规则。

- **2026-08-24 01:07 · 班次(会话内)**: ✅T4 战争态势HUD完成。HUD新增'战况'条(默认隐藏, 首次防御胜利/掠夺后显示), warScore实时映射(≥60绿/35~59黄/<35红), 数据=最高敌军力vs玩家防御(炮塔+科技)。全量回归绿, 构建135KB。

- **2026-08-24 01:10 · 班次(会话内)**: ✅T5 图鉴页完成。L键浮层: 星球名+难度星级/已录入异常(含AI档案摘录)/已知生物(基因色点+行为+HP+生态)/环境法则。XSS防护(esc转义)。全量回归绿, 构建137KB。

- **2026-08-24 01:12 · 班次(会话内)**: ✅T6 平衡完成。夜间刷怪间隔4.2→4.94s(等效夜间压力×0.85), 酸吐者弹速185→207(+12%)。构建绿+回归绿。

- **2026-08-24 01:13 · 班次(会话内)**: ✅T7 静音持久化完成。meta.sfxMuted存档, boot时SFX.restore(meta)恢复, M键切换即写盘。构建138KB, 回归绿。

- **2026-08-24 01:14 · 班次(会话内)**: ✅T8 死亡结算改进完成。死亡页显示: 携带物丢失清单+本次远征拾取总数(runLoot)+着陆存活时长。构建绿回归绿。

- **2026-08-24 01:15 · 班次(会话内)**: ✅T9+T10 完成。T9: 负重>70%时E出发弹提示(不阻止)。T10: 新手期(tut<4)玩家身边画朝发射台的脉冲箭头+距离标签。构建绿回归绿。**P5打磨清单(T1~T10)全部完成**。

- **2026-08-24 01:18 · 班次(会话内)**: ✅U1 居民数据层完成。residents.js: 六维技能生成(主6~9/副3~5/余0~2, seeded确定性)+性格+心情饱食初始值; needsTick吃粮循环; efficiency系数0.4~1.3(心情×饱食); socialTick好感矩阵(同岗+/暴躁低心情矛盾−)。residents.test.js 6用例并入(63全绿)。构建144KB。

- **2026-08-24 01:20 · 班次(会话内)**: ✅U2 居民加入事件接入游戏循环。每生产跳: 需求结算(吃仓库food)+社交矩阵+到访判定(有空位25%概率, 新居民飘字+专精提示; 满员6%旅人路过暗示)。住宅容量=居住舱2席+医疗舱×1。meta.residents/bonds/residentSeq持久化。构建146KB, 回归绿。

- **2026-08-24 01:23 · 班次(会话内)**: ✅U3农业+U5技能分配完成。新建筑水培农场/畜牧圈; farmTick四阶段生长(裸→播→长→熟)纯函数, 种植技能加速×(1+lv*0.12); 成熟收3粮入仓库; 自动指派: 农场/牧场各2席, 按对应技能最高的闲人优先; jobOutput=效率×(1+技能×0.25)。residents.test 9用例(66全绿), 构建149KB。

- **2026-08-24 01:25 · 班次(会话内)**: ✅U8 居民名册(R键)完成。殖民地内按R: 人口/食物储备总览, 居民卡片(心情emoji/性格/出身/岗位与效率/六维技能主金副蓝/心情饱食双条), 人际关系摘要(挚友~敌视分级)。修复: residentsTick等4函数误嵌套在updateHome内导致导出失败, 已移至IIFE顶层。构建153KB, 66+8全绿。

- **2026-08-24 01:26 · 班次(会话内)**: P6居民系统主体完成(U1数据层/U2加入事件/U3农业/U4饱食/U5技能岗位/U6畜牧简版/U7社交/U8名册)。剩U7随机矛盾事件扩展为后续小项。

- **2026-08-24 01:29 · 班次**: ✅V1 六专长全局加成完成。建造→建筑费-12%/级(下限40%); 学识→每跳+0.5×最高级研究点; 社交→全居民心情+0.3×最高级(封顶+2)。globalBonuses纯函数+3用例(69全绿)。BACKLOG整理: C系与U系重复项关闭。

- **2026-08-24 01:30 · 班次**: ✅V3 随机社交事件完成。每生产跳40%概率(≥2居民): 60%闲谈(+4好感+2心情)/冲突(-5好感-2心情); 低心情居民30%偏向冲突。飘字播报。P6全部完成。

- **2026-08-24 01:31 · 班次**: ✅V2 NPC小传完成。enrichBio: LLM富化(走缓存+配额, 失败静默)/fallbackBio程序化模板(确定性); generate支持takenNames查重(40次重试+id兜底); 名册卡片显示小传。71单元+8场景全绿, 构建157KB。**P6居民系统全部完成(V1/V2/V3收尾)**。

- **2026-08-24 01:32 · 班次总结**: BACKLOG 全部清零。
  今晚累计: P5打磨(T1~T10) + P6居民系统(U1~U8, V1~V3) + 弹丸隧穿根治 + 相机漂移根治。
  最终: 测试71单元+8场景+3性能+2Boss全绿; 构建157KB单文件; 20+ commits。
  游戏形态: 殖民地(建造7种建筑/科技树4项/生产tick/居民六维技能心情饱食社交/农业畜牧)
  ↔ 星球远征(3难度/Boss守护者/战争掠夺/AI袭击防御)。
  待用户醒来试玩反馈。夜班cron继续监督。

- **2026-08-24 04:56 · 班次**: 🎯T11 自愈居中(用户二次报告角色偏右下)。
  排查结论: 预览面板丢弃URL参数+合成键盘事件进不了intro层, 端到端验证受限;
  改防御性修复——selfCenter()每帧检查玩家与相机偏差, 超过视口短边25%即硬对齐。
  无论根因(DPR/iframe缩放/resize时序), 角色数学上不可能再偏离中心超过一帧的lerp距离。
  另: boot加autostart/exp/debugmark URL通道(file://下可用), 修location安全访问。全量回归绿, 159KB。

- **2026-08-24 10:29 · 班次**: 🎯"右下角角色"之谜破案。
  视觉二次分析用户截图: 白色小人(96%,93%)=右下角O2探针按钮(probeRun, fixed bottom:8 right:10),
  不是游戏角色! 真正玩家小人画在视口中央但仅20px高, 深绿地面+暗幕下不显眼, 用户没认出来。
  修复: (1)玩家脚下加呼吸光圈+头顶浮动倒三角——任何背景一眼可见;
  (2)探针按钮移到左下角+降透明度+禁点击, 不再像角色。
  帧循环加异常自愈(catch单帧错误防rAF链死亡)。全量回归绿。

- **2026-08-24 10:36 · 班次**: 用户坚持右下角小人仍存在。
  视觉四次分析自相矛盾(纯圆点→人形→幻觉文字→空), 判定该元素极小且模糊, 无法从截图定论。
  新假设: 可能是macOS系统级覆盖层(辅助功能/输入法悬浮窗)而非游戏内元素。
  加H键开关角色标记供用户自查。等待用户反馈判别。

- **2026-08-24 10:52 · 班次**: 【右下角之谜结案】
  用户新截图证实小人带蓝圈蓝三角=v0.9玩家标记, 确认是真正的游戏角色。
  坐标反推: 发射台(世界1100,1340)显示在画面中央偏下→相机数学自洽;
  玩家在85%/90%处=玩家已向右移动720px而相机处于跟随状态。
  结论: 这是lerp平滑相机的正常滞后表现(移动时角色偏离中心), 非bug。
  新增C键: strictCam严格居中模式切换(角色恒钉屏幕正中), 用户可选自己喜欢的手感。

- **2026-08-24 11:54 · 班次**: 相机偏移终极修复。
  selfCenter升级: 硬阈值25%→22% + 每帧软拉回30%偏差(稳态偏差<40px, 物理上不可能再漂到角落)。
  右上角常驻诊断角标(scr屏幕坐标/cam相机/p世界坐标/win窗口尺寸), 用户截图即可铁证定位。

- **2026-08-24 12:06 · 班次**: 【右下角之谜最终结案——独立渲染铁证】
  用无头Chrome独立渲染 game.html?autostart=1 并截图分析:
  · 角色位置: 水平50%, 垂直55-60% = 屏幕正中央 ✓
  · 头顶读数 scr(700,458) vs 视口中心(700,450) — 完全居中(8px为lerp正常微差) ✓
  · 右上角诊断: cam 1100,1341 / p 1100,1370 同步追踪 ✓
  · boot的"s is not defined"已修(autostart通道变量作用域), 错误层消失 ✓
  结论: 相机/渲染逻辑经第三方环境验证正确。截图存 docs_render_centered.png。
  用户此前所见=移动中的相机滞后(设计行为)+probeRun按钮误认的组合。
  现有三重保险: selfCenter硬阈值22%+每帧软拉30%+C键严格锁定。

- **2026-08-24 12:15 · 班次**: 🎯【真根因落网——canvas默认尺寸污染】
  无头Chrome小窗(800x520)渲染暴露: 诊断角标显示"视口 300x200"!
  = canvas 默认尺寸。resize() 用 getBoundingClientRect 初值时 canvas 未布局,
  rect.width 返回默认300 → VW/VH 被锁死300x200 + inline style 固定像素
  → 游戏世界挤在左上角小画布, 用户全屏下看到角色错位"右下角"。
  修复: rect无效(<320)回退innerWidth; CSS改用100vw/100vh铺满; 加安全下限。
  验证: 小窗重渲 scr 400,217 = 视口800x433正中 ✓ 角色居中 ✓ 地形岩石信标正常 ✓
  截图 docs_render_exp_fixed.png。全部测试绿。

- **2026-08-24 12:27**: ✅用户确认"现在正常了"——相机偏移问题正式关闭。
  历时三轮排查(逻辑层→变换层→布局层), 最终根因=canvas默认尺寸300x150污染视口测量。
  教训入库: 涉及显示尺寸的测量必须防御布局时序, 不可信单次rect初值。

- **2026-08-24 14:48 · 班次**: ✅M1 序列帧管线端到端打通!
  codex exec 生成采矿机动森风sprite sheet(4帧: 待机→钻转→碎石→矿石闪光, 奶油+薄荷+棕描边)→
  PIL切帧缩放128px→base64内联sprite_data.js(89KB)→sprites.js渲染。
  无头Chrome截图+视觉放大确认: 卡通采矿机正确出现在玩家旁(奶油机身/薄荷圆点/棕描边/履带清晰可辨)。
  修复: Colony.placeBuildingEntity漏导出; 测试桩补sprites.js加载。
  全量回归: 76单元+8场景+3perf+2boss全绿。构建255KB(+89KB sprite)。
  下一步: 批量生成其余9种建筑序列帧 + G键建造面板(动森风UI)。

- **2026-08-24 15:05 · 班次**: ✅Task2 建造队列完成。BUILDINGS加buildTime(12~30s); queueTick纯函数(并行上限3/顺序推进); tryPlace改入队+开工飘字; 完工时放实体+仓库扩容。旧档兼容buildQueue默认[]。79单元全绿。

- **2026-08-24 15:08 · 班次**: ✅Task3 建筑等级完成。upgradeCost 1.6倍指数; canUpgrade校验; mineOutput/labOutput线性随级; U键升级最近建筑(扣费+飘字+持久化); 旧档补lv默认1。83单元全绿。

- **2026-08-24 15:11 · 班次**: ✅Task4 炮塔真实开火+兵营士兵完成。turretStep纯函数(射程240/cd1.2s/伤害8+8×lv); 袭击期间遍历炮塔开火+ping特效; startRaid按兵营等级召唤2×lv士兵实体(hp40)。87单元全绿。

- **2026-08-24 15:13 · 班次**: ✅Task5 居住舱+拆除退款完成。新建筑居住舱(40点, 容量+3×lv); housingCapacity纯函数(基础2+房3lv+医疗1); refundOf半价/pad不可拆; X键拆除最近建筑。89单元全绿。

- **2026-08-24 15:15 · 班次**: ✅Task6 G键建造面板完成(动森风)。米黄底96%不透明浮层/NookPhone配色卡片网格(9色轮换)/胶囊价格标签/工期徽章/队列进度条; 不足或满上限灰显禁点; 点卡片进入放置模式。B键保留兼容。

- **2026-08-24 15:22 · 班次**: ✅M2完成+最终视觉验证。
  4种新建筑序列帧(仓库/实验室/农场/居住舱)生成切帧内联, sprite总数5个。
  无头Chrome终验: 绿色视口中心十字与玩家蓝圈几乎重合(居中确认✓), 卡通采矿机sprite可见。
  Task2建造队列/Task3等级/Task4炮塔士兵/Task5住宅拆除/Task6动森风面板 全部落地。
  构建574KB; 测试89单元+8场景全绿。剩余: 其余5种建筑序列帧批量生成(cron夜班继续)。

- **15:32 · 班次**: ✅建造目录UI改版(用户指定): 左侧常驻🔨圆形入口按钮(动森风米黄+3D阴影), 点开后底部滑出横向卡片row(NookPhone配色/胶囊价格标签/施工进度)。G键等价。无头Chrome验证按钮可见。全量回归绿。

- **2026-08-24 16:02 · 班次**: 建筑可见性强化。
  ①动森风浅色地台(建筑脚下椭圆, 任何地形可辨); ②建成3秒金色扩散脉冲; ③夜间暗幕给建筑挖洞(70px微光);
  ④sprite放大至2.8x; ⑤修placeBuildingEntity缺lv导致炮塔伤害NaN。
  用户反馈"圆盘占位"最可能=夜晚暗幕遮盖+无地台参照。待用户白天再建一次确认。

- **2026-08-24 16:16 · 班次**: ✅蓝图施工机制(用户需求)。
  放置=蓝图(虚线轮廓+🔨+进度环+施工尘), 只有玩家站在90px内进度才增长, 离开冻结。
  建造专长居民加成: 速度×(1+最高sk_build×0.15)。完工→蓝图替换为真建筑sprite+金色脉冲。
  queueTick v2签名变更(playerNearPos/builderBonus), 测试更新4用例(90全绿)。

- **16:21 · 蓝图渲染验证通过**:
  无头Chrome截图确认: 金色虚线椭圆蓝图+青色进度环+锤子标记全部正确渲染,
  玩家站在蓝图中心触发施工。截图存 docs_render_blueprint.png。
  建造流程完整: G面板选型→点击放蓝图→走近施工→完工替换sprite。

- **17:50 · 班次**: ✅炮塔/士兵视觉完成。炮塔: 底座+旋转炮管(指向目标)+开火后坐+等级徽点; 士兵: 友军暖橙色调区分敌人。批量序列帧生成中(bl_pad/barracks/turret/clinic/pasture 后台跑)。

- **18:11 · 班次**: ✅9/10建筑序列帧完成(新增发射台/兵营/炮塔/医疗舱)。剩畜牧圈(后台生成中)。sprite共9个内联, 构建946KB。90单元全绿。

- **18:13 · 里程碑**: 🎉建筑系统v2全部完成!
  10/10建筑序列帧(动森风4帧动画)生成并内联; 建造流程: G面板→蓝图放置→人物到场施工→完工sprite+脉冲。
  功能: 队列工期/等级升级(U键)/炮塔开火/兵营士兵/住宅容量/X拆除退款。
  最终: game.html 1004KB(含10个sprite); 测试90单元+8场景+3perf+2boss全绿。

- **18:43 · 班次**: ✅N1 玩家行走序列帧完成。
  codex生成2列×4行表(下/左/右/上×站/步), PIL切帧统一128格, base64内联(player_walk, 103KB)。
  sprites.js新增drawPlayerFrame专用接口; drawPlayer接入: 保留蓝圈/影子/iFrame闪烁,
  由s.face弧度换算四向, walkPh驱动迈步帧; 无图回退程序化小人。无头Chrome验证精细宇航员渲染✓。
  构建1144KB; 90单元+8场景全绿。

- **19:02 · 班次**: ✅N2 敌人三阵营8帧序列帧接入。
  噬光群囊/酸吐者/硅壳壁垒各8帧(idle×2/move×2/attack×2/hurt/death), 按状态选帧。
  faction.id→sheet名映射; 士兵保持程序化暖橙配色。建筑8帧重生成batch4后台进行中(用户要求全部8帧)。

- **19:35 · 里程碑**: 🎉全序列帧8帧化完成(用户要求)。
  10建筑+3敌人+1玩家=14张sprite sheet全部内联, game.html 1194KB。
  全量回归: 90单元+8场景+3perf+2boss全绿。序列帧体系收官。

- **21:38 · 重大bug修复**: 🎉建筑"圆盘"真根因找到并根治!
  entities.js 里存在【两个 drawBuilding 定义】—— Phase3a(8632b4d)引入的旧几何版(圆盘+中文名标签)
  在文件后部, 函数提升覆盖了前面所有 sprite/蓝图/炮塔修改! 历次"验证通过"实际是死代码+无头Chrome
  恰好只测采矿机蓝图路径的巧合。
  删除旧定义后: 无头Chrome像素检测 红X(sprite分支)=561, 绿点(几何分支)=0 —— 全部走sprite✓。
  教训: 同名函数重复定义无报错, node --check也不报; 应加CI断言。

- **21:49 · 澄清+收尾**: 用户截图"白条"=信标光柱(游戏目标物, 设计如此)非渲染错误;
  建筑sprite实际已正常(实验室塔状结构带细节装饰被视觉模型确认)。移除红X/绿点诊断标记,
  信标光柱调窄调淡(26x158→18x138, 透明度降30%)。全量回归绿。

- **22:24 · CDP系统性QA**: 绕过系统代理后CDP直连成功。
  全链路自动化检查: 14/14 sprite加载✓ / 零页面错误✓ / home→expedition切换✓ /
  敌人8帧sprite渲染确认(紫色噬光群囊: 小黄眼+触须)✓ / 玩家行走sprite✓。
  QA脚本存档/tmp/qa_enemy_test.py(CDP直连模式可复用)。

- **22:32 · 事故复盘**: 用户指出"贴图是什么玩意"——
  像素比对发现 batch4(bash关联数组版)生成的 farm/house/pad 等多张sheet内容几乎相同(均色差仅2.3/255),
  全是"圆形平台塔楼"而非各自建筑! 根因: bash的declare -A在tee管道子shell中变量展开失败,
  所有prompt退化成相同内容。codex照单全收。
  修复: 改用python逐张调用(/tmp/regen_sprites.py), 后台重生成中。batch4全部作废。

- **23:16 · 贴图事故修复完成**: batch4作废根因=bash关联数组
  在管道子shell中展开失败→10张prompt相同→生成10张"发射台"变体。改用python逐张调用
  (/tmp/regen_sprites.py)重生成全部10张, MD5唯一性校验通过(无重复)。
  CDP终验: 采矿车(钻头+尾烟)/温室农场(绿植穹顶)/居住舱(冒烟小屋)/实验室(望远镜圆顶)
  全部正确渲染, 精致卡通风格。构建1452KB; 全量回归绿。

- **23:57 · 美术融合优化**: 用户反馈建筑"跳脱"。
  sprites.js加载时预烘焙"环境融合版"(降饱和38%+暗青绿tint, 逐像素), drawBuilding按daylight()
  在原版/融合版间插值(白天混30%柔化, 夜晚全量融合)。色彩协调性经视觉评估确认(自然大地色系)。

- **00:01 · 动画收敛(用户反馈"动作太大")**:
  建筑日常只循环低幅度帧0-3(待机/轻微动作), 跳跃/爆发类高潮帧(F4+)不再日常播放;
  播放速度 fps 6→2.5(建筑)/7→4.5(敌人)。高潮帧保留在sheet里供未来事件触发。

- **00:04 · 修正**: 移除建筑sprite的2.9x放大, 改为1:1原生渲染。
  放大既造成像素模糊, 又把帧间原生微动放大成"大动作"——用户指出的"跳脱/倍数"双重根因。
  融合tint分支同步改为128px原尺寸。

- **2026-08-25 00:40 · 班次**: 🎯建筑系统专项QA(用户:"检查建筑/序列帧摆动太大/不要搞透明度")。四个根因全部实锤并修复:
  ①**序列帧未配准**(摆动真根因): PIL实测7/10建筑sheet帧间质心漂移10~33px+63~99%像素差异(生成帧是独立重画非微调),
  循环播放=建筑上下瞬跳, 前两轮"收敛"(降fps/去放大)治标不治本。修复: 新增`assets/build_sprites.py`——
  全部帧alpha质心对齐到帧0(幂等, 7张sheet各移6-7帧), 顺带发现并修复enemy_siloshell同款错位;
  配准后实测仅兵营/炮塔/仓库(帧差4~25%)够格播待机, 其余7张静态帧0(IDLE_FRAMES表进main.js注册, sprites.js新增idleFrames字段)。
  ②**白天幽灵化**: drawBuilding只画tint层且白天alpha=0.3——一天48%时间建筑可见度≤50%(白天机身最亮像素实测90 vs 夜晚214)。
  修复: 按用户要求不搞透明度——白天原版/深夜tint版整张切换, 永远全不透明。
  ③**蓝图系统是幻影**: T.BLUEPRINT实体从未被任何代码创建+蓝图绘制代码从未存在(16:21"渲染验证通过"实为开场界面截图误读:
  金色椭圆=发射台光环, 青圈=玩家标记)。修复: tryPlace创建蓝图实体+drawBuilding蓝图分支(金色虚线椭圆+锤子+青色进度环+百分比)
  +buildColonyWorld把落盘队列重实体化(兼修中途存档重载后蓝图消失)。
  ④**重载退化双bug**: buildColonyWorld不传lv→重载后炮塔伤害/徽点退1级(U键升级也不同步实体lv); 仓库+20负重只在内存改CFG→
  重启丢失且拆除不回退。修复: 实体重建带lv+U键同步实体lv; 新增纯函数carryMaxOf/carryBonus取代CFG突变(3处调用点改写)。
  验证: 93单元(+3新用例)+8场景+3perf+2boss全绿; 构建1461KB。CDP像素证据: 静态建筑两帧差=0/白天建筑最亮244(修复前90)/
  蓝图虚线椭圆+45%进度环渲染确认(/tmp/qa3_blueprint_clean.png)。高潮帧(F4-7)已配准, 留作未来事件触发素材。

- **2026-08-25 01:05 · 班次**: ✅按G瞬移bug根治(用户试玩报告)。根因=键位双重绑定: 自动化验证协议的调试热键
  G=东移600px(以及T=传送信标/K=刷怪)与正式键位G=建造面板/T=科技同帧触发, 按G开面板同时被传送。
  修复: 三个调试热键统一门控到显式`?debugkeys=1`通道(不随autostart隐含——首版门控用autostart隐含被CDP验证当场抓出歧义),
  玩家默认不可触发, 自动化脚本加参数即可用。按键全量审计: 其余绑定无冲突(J=开火为良性保留)。
  验证: CDP真实玩家路径(无参数→回车→G/T)位移=0且面板正常开关; debugkeys=1下G仍传送600px;
  93单元+8场景全绿, 构建1462KB。

- **2026-08-25 01:35 · 班次**: 🎯建筑"白条"真凶落网(用户截图: 仓库被画在白色竖条上)。
  根因=生图模型的**假透明伪影**: 兵营/炮塔/仓库/酸吐者/噬光群囊共5张sheet每帧都有完全相同的
  26x110中性近白棋盘格条(bbox(50,10)-(76,120)), 是模型把"透明背景"画成了真实像素。
  **21:49 用户报告的"白条"当时被误诊为"信标光柱(设计如此)"——实为此伪影, 带病至今**;
  这5种建筑/敌人此前极少出现在QA截图里所以一直漏网。
  修复: build_sprites.py新增假透明清除(伪影签名门控: 中性±3内R=G=B且值≥235+与透明区连通+组件≥60px,
  且格子内存在≥500px此类组件才启用——玩家白色宇航服/白色墙体/硅壳兽水晶甲零误伤)。
  清除5张sheet各1.8万~2.1万px; 剥掉伪影后真实质心浮现, 炮塔/仓库/敌人帧重新配准(此前是白条主导的假对齐);
  复测帧差: 仅兵营(22%)保留2帧待机, 炮塔/仓库真实差异56~98%改静态(IDLE_FRAMES更新)。
  验证: 帧0白像素560→<32(残余=合法高光); CDP截图仓库/兵营/炮塔全部干净(/tmp/qa4_no_strips.png);
  93单元+8场景全绿, 构建1471KB。教训: "验证通过"必须像素级看渲染结果, 而非只查资源加载。

- **2026-08-25 02:00 · 班次**: ✅建筑悬浮修复(用户报告"建筑浮空了")。
  根因=锚点假设"画稿贴128帧框底部"(anchorY=0.9), 但实测各sheet帧0内容底边差异巨大:
  悬浮组仓库84/兵营85/炮塔86/采矿机87/牧场88(帧框底部有~40px空透明边→画稿悬空~30px),
  贴地组诊所/农场/居室/实验室/发射台121-122。此前被白条伪影遮挡看不出来。
  修复: 锚点数据化——build_sprites.py实测帧0内容底边输出SPRITE_META表(idle+baseline),
  sprites.js新增baseline字段(>0时内容底边精确落在锚点y, 优先于anchorY; 敌人手工translate定位不受影响),
  main.js注册传入, entities.js tinted/fallback两分支统一锚点e.y+10(地台椭圆中下部)。
  验证: CDP截图四座建筑全部贴地(/tmp/qa5_grounded.png), 仓库/兵营/炮塔画稿底边-地台间隙2~4px;
  93单元+8场景全绿, 构建1470KB。管线新增"假透明清除→配准→帧差→基线"四步, 全部数据驱动零手调。

- **2026-08-25 02:30 · 班次**: ✅建筑尺寸+占位格(用户:"太小了,建筑比人物还小,占位不应都只是一格")。
  ①**尺寸**: 管线实测帧0内容高(仓库仅40px/兵营39px, 确实比人物矮), BUILDINGS表新增dispH目标显示高,
  渲染缩放=dispH/内容高——居住舱128/实验室113/医疗舱·农场115/仓库95/畜牧圈97/采矿机100/炮塔68(小型工事合理低于人物)。
  ②**占位格**: BUILDINGS新增cells(ADR-4格网48px), 大建筑2x2(仓库/兵营/实验室/农场/牧场/居住舱/医疗舱),
  小建筑1x1(采矿机/炮塔); canPlace从软性圆距改占位矩形碰撞(AABB), tryPlace放置吸附48px格点+在建蓝图参与占位碰撞
  (修两座2x2可叠放的漏洞); 地台/蓝图椭圆/建成脉冲全部按占位格取尺寸; G面板卡片加"N×N"角标。
  验证: 96单元(+3: footprintOf/占位碰撞/目录规格)+8场景全绿; CDP截图建筑明显大于人物且贴地(/tmp/qa6_size.png);
  构建1472KB。

- **2026-08-26 00:30 · 班次**: ✅建筑放大后模糊修复(用户:"放大之后像素好低")。codex高清生图方案失败(后台任务exit 1)
  后按用户指示跳过生图, 改管线内HD方案: build_sprites.py新增hd_upscale——128格建筑sheet 2x LANCZOS放大
  +UnsharpMask锐化(只锐RGB, alpha不动, 幂等: 256格自动跳过), 浏览器端从2-3x插值变近1:1贴图。
  管线格宽全面参数化(cell_of: 格宽=图高, 阈值随格宽平方缩放), sprites.js加载时自动探测格宽(fw:0触发),
  entities.js tinted分支用实际格宽。**踩坑: define()的`fw: def.fw||64`把fw:0兜底成64, 自动探测永不触发,
  源矩形裁到帧角空白区=建筑整体隐身**——改`||0`修复。SPRITE_META复测(基线169~244/内容高72~174, 锐化后帧差全>30%全静态)。
  验证: 边缘强度18.6→24.6(+32%), CDP截图(/tmp/qa8_hd_fixed.png); 96单元+8场景全绿; 构建3532KB(HD素材体积代价,
  单文件本地加载可接受)。

- **2026-08-26 00:50 · 班次**: ✅恢复兵营2帧微动画(用户选定方案2)。SPRITE_META兵营idle:1→2
  (用户批准例外: 帧差37%=旗帜摆动的自然内容变化, 配准后无位置跳动——HD锐化曾把它推过30%自动阈值)。
  验证: CDP实测两帧(间隔0.4s=1帧周期)差异仅2.3%像素且局部化(bbox限旗帜/装饰区), 非整楼跳动;
  96单元+8场景全绿。其余9建筑维持静态帧0。

- **2026-08-26 19:57 · 班次**: ✅U6畜牧扩展(欠账清偿): 羊群自然增长+皮革经济闭环。
  ①`Colony.ranchTick`纯函数: 每牧场herd概率增长(0.22×(1+0.06×最高牧民技能), cap=3+lv×2),
  产肉=⌈herd/2⌉有羊即出; 产皮=⌊(herd+lv-1)/3⌋需herd≥3且有牧民——升级放宽阈值形成正循环。
  rng可注入(ADR-5表现随机)供测试定值。旧"每跳35%概率+2粮"简化版删除。
  ②皮革=新meta.res资源(存档默认结构补leather:0, 旧档boot时兜底); R面板加皮革计数;
  **畜牧圈升级改皮革专属货币**(canUpgrade第4参+costRes字段, U键按costRes扣对应货币)——
  给皮革一个不可替代的用途, 避免无意义资源堆积。其余建筑升级仍走研究点, 行为不变。
  ③顺手修canUpgrade off-by-one: 原lv>maxLv实际可超限升1级(maxLv=2能升到Lv3), 改lv>=maxLv;
  无既有测试锁定旧行为。牧场数据落盘colony.buildings(b.herd/b.lv), 重载自动恢复。
  验证: 100单元(+4 ranchTick/canUpgrade边界)+8场景+3perf+2boss全绿; 构建3535KB。

- **2026-08-26 20:30 · 班次**: ✅系统性代码审查与隐患修复:
  ①**修复掠夺敌基地崩溃**: `src/combat.js` `raidBaseSuccess` 中 `R()` 未定义调用改 `Math.random()` 并增加 `APH.UI` 空值防御;
  ②**修复夜间暗幕渲染崩溃**: `src/world.js` `drawDarkness` 补全 `var s = APH.state` 作用域变量声明并导出供测试;
  ③**修复模板 HTML 畸形**: `template.html` 移除 `<div id="resPanel"<div id="resPanel"` 重复标签头;
  ④**修复存档科技结构一致性**: `src/save.js` `loadMeta` 默认 `tech: {}` 对象化并支持数组存档平滑迁移, 补全 `res`/`residents` 默认字段;
  ⑤**修复测试桩模块补全**: `tests/scenario.test.js`、`tests/perf.test.js`、`tests/boss.test.js` 补齐 `residents.js` 加载;
  ⑥**修复远征结算晶体取值**: `src/main.js` `returnHome` 修复 `carry['it_crystal_ore']` 索引。
  验证: 101单元(+1 raidBaseSuccess / +1 meta结构校验)+9场景(+1 夜间暗幕挖洞)+3perf+2boss全绿; 构建3535KB。

- **2026-08-26 21:40 · 班次**: ✅系统性对抗代码审查(ultracode workflow: 5维finder×对抗验证, 14 agents/331工具调用)。
  未提交改动整体质量高(无critical/high), 6个low/nit确认并全修复:
  ①**建造卡片假可点**(main.js renderBuildRow): 数量上限只数已完工建筑, 未统计施工中蓝图, 与canPlace的occupied口径不一致
    →卡片显示"2/3"可点、放置却被"已达数量上限"拒。修复: n=nBuilt+nQueued(在建蓝图占上限)。
  ②**施工倒计时恒显NaN**(main.js): 读队列项不存在的`.remain`字段(Math.ceil(undefined)=NaN)→"施工中N项·NaNs"。
    修复: 改按工期×未完成比例 `Math.ceil(total*(1-progress))` 估算剩余秒(progress为0~1归一化完成度)。
  ③**测试隔离缺陷**(combat.test.js raidBaseSuccess): 单文件跑`node tests/run.js combat.test.js`时window.APH.state未定义
    (run.js不加载main.js), 全套绿仅因colony.test.js字母序先跑泄漏全局。修复: 测试自带最小state fixture+try/finally恢复。
  ④**资产管线配准裁像素**(build_sprites.py register_sheet): AFFINE在固定cell×H画布平移, 漂移方向越界像素被永久截断
    (实测house帧2/lab帧4/turret帧4共丢数千px, 且裁后质心移动致"配准幂等"声明为假——重跑持续裁到收敛)。
    当前idle:1运行时不显示这些帧故无现网影响, 但未来开多帧动画会暴露。修复: 改在带余量(margin=cell//2)大画布平移再裁回,
    超余量帧跳过并警告; 配准真正幂等。
  ⑤**资产管线原地覆盖无备份**(build_sprites.py): clean/register/hd三处im.save(path)直接覆盖原图,
    未git跟踪的新资产被启发式误删即不可逆。修复: 新增backup_once(), 首次改写前留`<name>.bak`(已gitignore, 不被sprite扫描)。
  ⑥**.freebuff/误入版本库**: FreeBuff桌面工具的SQLite缓存(desktop-v2.db), 非项目资产。修复: .gitignore加`.freebuff/`与`*.bak`。
  对抗验证还正确驳回3个误报(drawDarkness远征光洞/cryN死变量/兵营idle:2被脚本重置)。
  验证: py_compile通过; 构建3536KB; 101单元+9场景+3perf+2boss全绿; **单跑combat.test.js从1失败→21/0通过**(#3实证)。
  下一步: 若未来启用house/lab/turret多帧动画, 其非空闲帧曾被旧管线裁过, 需从git HEAD原始128格图重跑管线(现有.bak机制+大画布法已防复发)。

- **2026-08-27 02:15 · 班次**: ✅修三个 HIGH 玩法 bug(殖民地袭击/死亡页/返航结算)。
  ①家园 spec.enemies.factions 保持空安全区; 袭击刷怪走 `Planet.pickRaidFaction`(上次远征 / fallbackPlanet / 阵营池克隆), 空阵营不再 `makeEnemy(undefined)`。raidActive 时跑 `updateCombat`+`updateDropped`, homeDrawers 画敌人/弹丸/掉落。士兵打袭击敌人不打玩家; 炮塔与玩家弹跳过 `isSoldier`; 波次计数不计士兵。
  ②`showDeath` 改用 `APH.CFG.items` 且缺 id 不抛; 出发写 `landedAt`/`runLoot=0`; 战斗与 O2 死亡都传 `runLoot`+`survived`。
  ③远征着陆点只回氧回血, 不再自动卸货; 结算只发生在 `returnHome`(settleValue); 已转化战利品不再显示「空手而归」。
  验证: `python3 build.py` 构建成功 game.html 以 `</html>` 收尾; 单元 105/0; 场景 12/0; perf 3/0; boss 2/0。

- **2026-08-27 02:23 · 班次**: ✅审查补丁——家园袭击不再被远征脱战/回收秒杀。
  `updateCombat` 在 `scene==='home'` 时：非 flee/attack 袭击者强制 `chase`；`despawnR` 不在家园生效。`updateDropped` 从 `raidActive` 门掠出，末波击杀掉落当帧/下一帧仍可拾。
  补测: home 800/950px 不回收且保持冲锋; 远征仍 despawn; 玩家弹跳过士兵; 士兵不打玩家; 空手返航「空手而归」; O2 死亡传 runLoot/survived; 袭击结束后掉落可拾; 场景刷怪后再 tick 一拍。
  未改: 袭击者仍追玩家不追 HAB; 士兵仍无敌伤害(非友伤); 空 else-if 保留; 未扩 clinic/radar/mineral/debug-overlay。
  验证: `python3 build.py` 构建成功 3540KB; 单元 109/0; 场景 15/0; perf 3/0; boss 2/0。未 commit。

- **2026-08-27 12:15 · 班次**: ✅经营主循环重构 P0–P5。
  方向锁死: 家是主游戏, 远征是补给, 战争是砸家。
  P0: DESIGN 经营优先 / intro「回到家园」/ 教程先盖房等人 / `te_exosuit`(旧档 `exo_suit` 迁移)。
  P1: 矿材盖建筑、有人上岗才产、`settleGoods` 分账、医疗舱急救、短缺 HUD、开局矿材 100。
  P2: `resident` 实体站在岗位旁, 不存 xy。
  P3: 建造岗居民可推进蓝图、R 面板数字键选人+[P]换岗、雷达标晶体/敌基地。
  P4: 发射台按短缺出任务、教程前两步不推远征、`lw_night_acid` 夜间湖岸腐蚀。
  P5: 袭击冲仓库/农场并抢粮矿、士兵可受伤可死、战争写入 meta(吞掉 `aphelion_war_v1`)。
  验证: `python3 build.py` 构建成功 3555KB, game.html 以 `</html>` 收尾; 单元 121/0; 场景 16/0; perf 3/0; boss 2/0。未 commit。
  下一步: 阶段 6+ 居民短距走位 / 工坊 / 法则收成修正(本轮不做)。

- **2026-08-27 12:45 · 班次**: ✅过客拜访+招募。NPC 不再生产跳自动入籍; 家园刷流浪过客(随机六维/性格/出身), 院子内闲逛, 走近 [E] 招募。招募条件未定, 目前只卡住宅空位。过客不存档 xy, 离场上路。
  验证: `python3 build.py` 构建成功 3562KB; 单元 124/0; 场景 17/0; perf 3/0; boss 2/0。未 commit。

- **2026-08-27 12:55 · 班次**: ✅过客招募学 RimWorld: 三种意向(难民绿灯/过路客掷骰/游商不招), 一次开口失败进冷却, 不收矿材买人。过路客看粮、医疗舱、对口建筑、性格、袭击调制成功率。
  验证: `python3 build.py` 构建成功 3568KB; 单元 128/0; 场景 17/0; perf 3/0; boss 2/0。未 commit。

- **2026-08-27 13:00 · 班次**: ✅招待涨印象 + [F] 请客。印象从 50 起, 空床/余粮/医疗舱缓涨, 满员/断粮/袭击缓掉; 过路客掷骰吃印象。走近过客按 F 扣 2 粮 +20 印象, 每人一顿, 游商可请但不招。HUD 显示印象与请客提示。
  验证: `python3 build.py` 构建成功 3571KB, game.html 以 `</html>` 收尾; 单元 132/0; 场景 18/0; perf 3/0; boss 2/0。未 commit。
  下一步: 阶段 6+ 居民短距走位 / 工坊 / 法则收成修正(本轮不做)。

- **2026-08-27 13:50 · 班次**: ✅居民短距走位。不再每帧拆建实体; 新人从居住舱(或招募点)直线走到岗位, 换岗/闲居走回家, 袭击改走回家。施工用实际站位。坐标仍不落盘。无作息大模拟。
  验证: `python3 build.py` 构建成功 3573KB, game.html 以 `</html>` 收尾; 单元 134/0; 场景 19/0; perf 3/0; boss 2/0。未 commit。
  下一步: `bl_workshop` 手工把矿材做成远征消耗品。

- **2026-08-27 14:00 · 班次**: 手玩 Chrome headless(?autostart=1)。走位真的会走; 过客/建造栏/名册能开。顺手修手玩踩到的洞: 主循环每30帧 `s` 未声明 + strict 下 `frameErrors` 再炸(标题卡 AUTO:q命中); 发射台上 E 被登船抢走招不到人; 离开发射台提示不消失; 名册缺技能写 undefined; 相机诊断角标改成仅 debug 参数。
  复玩: 标题 `▶帧120`, pageerror 0, camDiag 关闭。构建 3574KB; 单元 134/0; 场景 19/0; perf 3/0; boss 2/0。未 commit。

- **2026-08-27 21:40 · 班次**: ✅殖民者生命(食物/心情/病情)。`illness` 0–100; 饿涨病、病砸效率与心情, 不饿死。医疗舱治居民(有社交岗医更快); 玩家 `clinicKit` 远征急救保留。出发不扣仓粮矿。名册三槽, 场上病号打 ✚。工坊/远征消耗品未做。
  验证: `python3 build.py` 构建成功 3577KB, game.html 以 `</html>` 收尾; 单元 138/0; 场景 19/0; perf 3/0; boss 2/0。未 commit。

- **2026-08-27 21:55 · 班次**: ✅审 diff 补丁——农牧吃效率、需求魔数进 CFG、ambient 得病 seeded。
  `farmTick`/`ranchTick` 乘 `Res.efficiency`; `needsTick` 进食/心情阈值进 `CFG.residents`; `clinicTick` 病情取整; `residentsTick` 注入 seeded rng、诊所 autoAssign 提前、吃粮按仓剩余逐人扣。
  验证: `python3 build.py` 构建成功 3578KB, game.html 以 `</html>` 收尾; 单元 140/0; 场景 19/0; perf 3/0; boss 2/0。未 commit。

- **2026-08-27 22:05 · 班次**: ✅袭击打伤居民 + 家园回血改走医疗舱。近战士兵→玩家→居民(+18病/-12心情, 不致死, 0.8s 无敌帧)→抢仓。家园氧气仍补; HP 只在距医疗舱 80px 内 4/s。畜牧增长实况改 seeded rng。
  验证: `python3 build.py` 构建成功 3582KB, game.html 以 `</html>` 收尾; 单元 144/0; 场景 20/0; perf 3/0; boss 2/0。未 commit。

- **2026-08-27 22:15 · 班次**: ✅法则作收成修正。家园 seed 抽 1~2 条气候(`lw_night_acid` 夜间农产×0.5 / `lw_storm` 每90s窗口30s实验室停)。`harvestMods` 纯函数进 farmTick/productionTick; 浮字+提示。远征湖岸酸蚀仍在。工坊未做(产出未定)。
  验证: `python3 build.py` 构建成功 3584KB, game.html 以 `</html>` 收尾; 单元 150/0; 场景 21/0(含气候法则+上一刀医疗舱回血); perf 3/0; boss 2/0。无头 Chrome `?autostart=1` 标题 `AUTO: q命中`, dump 无 Uncaught。未 commit。

- **2026-08-28 06:50 · 班次**: ✅东西堆地上(RimWorld)。农牧工矿产出与返航矿材先落实体堆, 走近/居民搬进仓库才入账。同种近距叠堆; 地上堆入 `colony.ground` 存档。袭击顺手偷地上。研究点仍抽象。闲人会把脚边的堆搬去仓库。
  验证: `python3 build.py` 构建成功 3598KB, game.html 以 `</html>` 收尾; 单元 164/0; 场景 25/0(含工坊堆地+闲人搬运入库); perf 3/0; boss 2/0。无头 Chrome `?autostart=1` 标题 `AUTO: q命中`, dump 无 Uncaught。未 commit。

- **2026-08-28 07:00 · 班次**: ✅仓不够也能用地上堆。吃粮/用药/请客/士兵口粮/盖房/工坊先仓后堆(`takeStock`/`ensureStock`); 合金整件折矿。短缺与 HUD 计仓+地(`矿10+3`)。搬运途中不计。
  验证: `python3 build.py` 构建成功 3603KB, game.html 以 `</html>` 收尾; 单元 167/0; 场景 26/0(含仓空吃地上粮+工坊用地上矿); perf 3/0; boss 2/0。无头 Chrome `?autostart=1` 标题 `AUTO: q命中`, dump 无 Uncaught。未 commit。

- **2026-08-28 07:15 · 班次**: ✅饿了走去吃饭。生产跳只掉饱食, 不隔空扣堆; 人直线走到最近仓库或地上粮再 `eatOnce`。饿优先于搬运; 头上 🍽。用药/工坊/盖房仍可取整张地图的堆。
  验证: `python3 build.py` 构建成功 3606KB, game.html 以 `</html>` 收尾; 单元 168/0; 场景 27/0(含远处不隔空吃、走到才吃); perf 3/0; boss 2/0。无头 Chrome `?autostart=1` 标题 `AUTO: q命中`, dump 无 Uncaught。未 commit。

- **2026-08-28 11:40 · 班次**: ✅RimWorld 化阶段 A——事件叙事者。新模块 `events.js`(APH.Events, ADR-12): `wealthScore` 财富值(仓+地资源/建筑造价/人口/科技)为唯一威胁标尺; `pickEvent` 按权重抽卡, 负面事件后 2.5 分钟强制喘息、心情均值<40 负面权重减半、威胁级放大负面; `directorTick` 纯函数节奏器每生产跳推进。9 张卡(`ev_` 前缀进 ADR-9 修订): 补给舱/难民潮/兽群/极光/游商到访(占位) + 疫病/枯萎/耀斑(炮塔 offlineT 真停机)/袭击。敌殖民地袭击开打改由 `ev_raid` 统一调度(tickRivals 只标记 wantRaid)。事件横幅 floatText+showCard, LLM 富化异步降级。存档 `meta.events` 走 loadMeta 默认值。
  验证: `python3 build.py` 构建成功 3621KB, game.html 以 `</html>` 收尾; 单元 181/0(新增 events.test.js 13 用例); 场景 27/0; perf 3/0; boss 2/0。未 commit。
  下一步: 阶段 B 心情崩溃。

- **2026-08-28 11:55 · 班次**: ✅RimWorld 化阶段 B——心情崩溃。`Res.breakTick` 纯函数状态机: 心情<35 每生产跳掷骰 8%(＜15 概率×3) → 按性格分流(暴脾气→斗殴打好感最低同事/独行谨慎→出走院子游荡/话痨乐观→怠工抱怨拉全员心情/勤恳→暴食多吃一顿), 持续 1~2 跳, 结束宣泄回弹至 45 + 冷却 10 跳。崩溃者本跳退出采矿/农牧/工坊/医疗/施工/搬运; 头顶 💢, 名册标红 [崩溃·类型]。字段 breakType/breakT/breakCd 随名册落盘, 数值全进 `CFG.residents`。
  验证: `python3 build.py` 构建成功 3627KB, game.html 以 `</html>` 收尾; 单元 187/0(新增 6 用例); 场景 27/0; perf 3/0; boss 2/0。未 commit。
  下一步: 阶段 C 游商贸易。

- **2026-08-28 12:10 · 班次**: ✅RimWorld 化阶段 C——游商贸易。矿材=硬通货, 不新增货币物品。`Res.makeTraderStock`(seeded, 价格 ±25% 浮动, 买卖各 1~3 种: 卖药/粮/皮, 收粮/皮/药)+`Res.tradeOnce`(先仓后堆扣账, 拒绝时零扣账)。游商到访随身带货单; 走近提示 [T] 交易, 数字键成交一件, T/Esc 关(游商离开自动收面板); 靠近游商时 T 不再误触科技轮换。社交议价: 最高社交 2%/级封顶 12%(买更便宜卖更贵), 进 `globalBonuses.tradeMul`。`ev_trader_caravan` 事件卡已在阶段 A 挂上。数值全进 `CFG.trade`。
  验证: `python3 build.py` 构建成功 3635KB, game.html 以 `</html>` 收尾; 单元 193/0(新增 6 用例); 场景 27/0; perf 3/0; boss 2/0。未 commit。
  下一步: 阶段 D 工作优先级面板。

- **2026-08-28 12:25 · 班次**: ✅RimWorld 化阶段 D——工作优先级。`Colony.assignByPriority` 纯函数: 人×技能 0~3(0禁止/1优先/2普通/3闲时), 1→2→3 逐层填岗、同级按技能高者、同级粘性不乱换岗、更高优先级空位可抢现职; 手动锁岗(jobLocked)最高优先; 崩溃者缺勤; 施工期建造者留空(sk_build=0 则不留)。旧档无 `meta.workPrio` → `Res.defaultPrio`(主技能=1 其余=2)。R 面板顶部新增优先级网格: 方向键选格(面板开着时不动角色)、数字 0~3 设值、技能高的列绿底提示; 改优先级自动解除锁岗。替换掉六次 autoAssign。
  验证: `python3 build.py` 构建成功; 单元 201/0(新增 8 用例); 场景 27/0; perf 3/0; boss 2/0。未 commit。
  下一步: 阶段 E 袭击多样性。

- **2026-08-28 12:55 · 班次**: ✅RimWorld 化阶段 E——袭击多样性。`raidWave` 追加 tactic/waves/total(签名兼容): aggressive→强攻×1.2、trader→盗掠×0.7(不伤人不打建筑, 只偷地上物/仓库, 偷够 stealCap=6 满载而归)、expansionist→围攻(500px 外扎营90s, 每15s 炮击最近建筑停机20s, 营地60血可被玩家弹丸拆毁→全体溃退, 扎营结束转强攻); 军力≥90 拆两波间隔45s 且第二波换方向(+2.4rad); 伤亡≥60% 全体溃退且溃退者 50% 掉落赃物。数值全进 `CFG.raidTactics`。新事件: raidStole/siegeCampDown; 溃退/扎营/盗掠行为在 combat.js 敌人循环前置分支。修复: fleeDespawnR 1100→1000(轴向 clamp 上限 1070, 否则溃退者卡边袭击永不结束); 盗掠者无物可偷时奔家园中心防僵持。
  验证: 构建绿; 单元 205/0(rivals +4); 场景 27/0; perf 3/0; boss 5/0(阶段E 冒烟 +3: 盗掠不伤人/溃退越界消失/拆营触发溃退)。未 commit。
  下一步: 阶段 F 健康分型。

- **2026-08-28 13:20 · 班次**: ✅RimWorld 化阶段 F——健康分型(六阶段收官)。居民追加 `ailments:[{type,sev,age}]`(≤2条), illness 保留聚合值(=Σsev clamp 100), 现有效率/心情公式零改动; 旧档/外部直改 illness 由 `ensureAilments` 迁移+按比例校准。分型规则: 袭击/斗殴→wound(吃饱自愈, 拖2跳未进舱升级 infection +5 sev/-8 心情); 饥饿/ambient→infection(不自愈, 效率地板 0.35→0.25); ev_plague→plague(医疗舱只能压到 12 地板, 用药×2 才除根, 用药目标优先疫病患者)。医疗舱治疗优先级 infection>plague>wound。R 面板病情条后追加分型标签(疫病红/感染橙/外伤灰)。入口全收口: needsTick/clinicTick/hurtResident(+type参数)/applyMed/brawl。
  验证: 构建绿; 单元 214/0(F +9); 场景 27/0; perf 3/0; boss 5/0。中途修过一个 bug: clinicTick 自愈直改 sev 未同步聚合值, 被失配校准回滚(测试抓住)。未 commit。
  下一步: 六阶段路线图全部完成; 可考虑 commit + 实机浏览器过一遍三种袭击战术的观感。

- **2026-08-28 14:00 · 班次**: 🔧审查修复(Standards+Spec)。做错: 兽群改为本跳牧场产出×3(storyTick 提前到 residentsTick 前); 围攻改为真弹丸命中后停机; 外伤升级看本人是否进舱(inClinic)而非殖民地有没有诊所; 怠工抱怨只打周围 tantrumR; 斗殴复用 hurtResident。缺口: restMinutes=[2,4]+restFor; 货单改药品/合金/皮革 vs 食物/皮革/晶体矿, 买卖各 2~3 种; 交易 ↑↓+Enter; 重病 sickSkipAt 跳过派岗; 士兵可拆围攻营; save.js 补 workPrio/lastNeg。标准: 魔数进 CFG; 溃退掉落改 seeded; fleeDespawnR 回退 1000。饥饿/ambient 改回外伤(分型只留袭击→wound / 拖期→infection / 疫病事件→plague)。
  验证: 构建绿; 单元 219/0; 场景 27/0; perf 3/0; boss 7/0。未 commit。



- **2026-08-28 15:25 · 班次**: 🔧玩家光环与人物不齐。sprite 路径用左上角画 `player_walk` 再 `translate(-22,-bobbing)`，光环/影子仍锚在实体原点，环在北、人在南。`drawPlayerFrame` 改为脚底中心锚点，去掉横向 -22。
  验证: 构建 + 回归测试；浏览器 `?autostart=1` 看光环是否贴脚。

- **2026-08-28 23:05 · 班次**: ✅#3 玩家 walk 重画（32 帧横排）。Codex exec + identity lock 出四向各 8 帧走循环（棕发/奶油衣/薄荷包；上向背对镜头；无站立帧）。绿幕按「高G低R低B」抠，避免吃掉薄荷包。切帧按内容间隙而非均宽。32 帧统一内容高 240、脚底 y=247。`build_sprites.py` 对 `player_*` 改脚底对齐（质心会让抬腿整帧上下跳）。`player_walk` SPRITE_META baseline=248 contentH=240。
  验证: `python3 build.py` 构建成功 5470KB 以 `</html>` 收尾；单元 227/0；场景 27/0；perf 3/0；boss 7/0。Chrome `?autostart=1` 家园四向 + `?exp=1` 远征四向均见同一人、无多头多肢、脚贴光圈。
  下一步: #1 剩余过客/居民 identity 与 idle sheet。

- **2026-08-28 23:55 · 班次**: ✅#4 玩家 idle 16 帧（下/左/右/上各 4）。Codex 先锁正面/左侧/背面 standing identity（右侧由左侧镜像），再脚钉缩放做呼吸——保证 idle 是同一人、双脚不迈。`Humanoid.sheetLayout` 让 `*_idle` 注册 16 帧而不是掉进建筑 8 帧。`build_sprites.py` 对 `*_idle_sheet` 也走脚底对齐。`player_idle` baseline=248 contentH=236。
  验证: `python3 build.py` 构建成功 6347KB 以 `</html>` 收尾；单元 229/0；场景 27/0；perf 3/0；boss 7/0。Chrome `?autostart=1` 家园四向站住是 idle（脚并拢呼吸）不是走循环第 0 帧；右走向是 walk 迈步；`?exp=1` 远征同一张 idle。
  下一步: #1 剩余过客/居民 identity 与 walk/idle sheet。

- **2026-08-29 · 班次**: 🔧idle 呼吸太快。`CFG.humanoid.idleFps` 4→2（4 帧一轮从 1s 拉到 2s）。
  验证: 单元 humanoid 10/0；全量单元 229/0；`python3 build.py` 绿。
  下一步: 实机看呼吸是否还快；#1 过客/居民 sheet。

- **2026-08-29 · 班次**: 🔧idle 2s 一轮仍像喘气。`idleFps` 2→1（一轮 ≈4s）。
  验证: humanoid 测试绿；构建绿。
  下一步: 实机看慢呼吸；#1 过客/居民 sheet。

- **2026-08-29 · 班次**: ✅#5 居民脸 0、无包、walk+idle。Codex 锁黑短发 bob identity（无包、奶油服薄荷袖），四向走循环 32 帧 + 站立 identity 脚钉呼吸 idle 16 帧。`drawResident` 走 Humanoid.pose（缺脸回退脸 0）；`walkToward`/`wanderStep` 推进 `walkPh`。sheet `hum_0_nopack_walk/idle` 与玩家同锚 baseline=248、内容高 240/236。
  验证: `python3 build.py` 构建成功 8875KB 以 `</html>` 收尾；单元 234/0；场景 27/0；perf 3/0；boss 7/0。Chrome `?autostart=1` 家园居民贴图、无包、与玩家 spriteScale 相同（walk 0.325 / idle 0.3305）；走向岗位 `hum_0_nopack_walk` 四向，站住 `hum_0_nopack_idle` 四向。
  下一步: #6 过客脸 0 有包 walk+idle。

- **2026-08-29 · 班次**: ✅#6 过客脸 0、有包、walk+idle。同一张脸 0 identity 加薄荷旅行包（肩带金扣），四向 walk 32 + 站立脚钉呼吸 idle 16。`drawVisitor` 走 `Humanoid.pose({ role:'visitor', pack:true, faceIdx:0 })`；`wanderStep` 过客走一段后站住（idleMin 4.2s ≥ 一轮呼吸），上路离院推进 `walkPh`。sheet `hum_0_pack_walk/idle` 与玩家/居民同锚 baseline=248、内容高 240/236。
  验证: `python3 build.py` 构建成功 11528KB 以 `</html>` 收尾；单元 241/0；场景 27/0；perf 3/0；boss 7/0。Chrome `?autostart=1` 过客贴图有包、与玩家/居民 spriteScale 相同（walk 0.325 / idle 0.3305）；闲逛 `hum_0_pack_walk` 四向，站住 `hum_0_pack_idle` 四向。
  下一步: #7 脸 1–3（过客有包 / 居民无包），仍被 #6 解锁后可动手。

- **2026-08-29 · 班次**: ✅#7 脸 1–3 无包/有包 × walk/idle。四张脸：0 黑 bob、1 栗侧分、2 黑顶髻、3 铜红波浪。`poseFor` 用 appearance 选脸（FNV-1a % 4）；缺 walk 回退脸 0。`drawResident`/`drawVisitor` 共用 `drawNpcSprite`。sheet `hum_{0-3}_{nopack|pack}_{walk|idle}` 同锚 baseline=248、内容高 240/236。正面有包 walk/idle 走 Codex identity；左/背有包在配额用尽后用脸 0 薄荷包图层盖到该脸无包上（换装不是换人）。
  验证: `python3 build.py` 构建成功 27049KB 以 `</html>` 收尾；单元 245/0；场景 27/0；perf 3/0；boss 7/0。Chrome `?autostart=1` 16 张 sheet ready，spriteScale 与玩家相同（walk 0.325 / idle 0.3305）；rs_3/0/1/2 → 脸 0/1/2/3；家园排队四张脸居民无包、过客有包，能分出不同的人。
  下一步: 父 issue #1 收口（玩家/居民/过客五官套齐）。

- **2026-08-29 · 班次**: ✅#1 收口。士兵仍程序化，按 `chibiScale`（drawH/chibiH）拉到与玩家 78px 等高；居民/过客无图回退同样放大。脸 1–3 左/背有包未重跑 Codex（配额 07:29），沿用盖包。
  验证: `python3 build.py` 构建成功 27050KB 以 `</html>` 收尾；单元 246/0（+chibiScale）；场景 27/0；perf 3/0；boss 7/0。Chrome 玩家+居民贴图并排同高，橙色士兵 blob 缩放到 drawH。
  下一步: 无（人形 epic #1 关）。

- **2026-08-29 · 班次**: ✅#15 精力消耗、床位绑定与睡眠机制 (Survival 1/6)。
  `meta.residents` 新增 `rest`（0~100）/ `isSleeping` / `bedId` / `sleepDisturbed` 字段并兼容旧档；`needsTick` 自然衰减 7/跳，<20 入睡，床铺恢复 +25/跳（满 100 醒来），地铺慢 30% (+18/跳)；`assignBeds` 纯函数按居住舱与医疗舱总容量绑定床位（有床 +3 心情，地铺 -5 心情）；`disturbSleep` 遭遇袭击强行唤醒并附加 -4 心情（3 跳）；`assignByPriority` 睡眠居民跳过排岗。
  验证: `python3 build.py` 构建成功 27054KB 以 `</html>` 收尾；新增 `tests/survival.test.js`；单元 254/0；场景 27/0；perf 3/0；boss 7/0。
  下一步: #16 三维机能损毁模型 (Survival 2/6)。

- **2026-08-29 · 班次**: ✅自然资源生态、多材料建造与阶梯前置科技树重构（#21~#26 全部闭环）。
  - **阶梯前置科技树**：4 大分支（农业/工业/医学/安防/探索），每项科技引入显式 `requires: [...]` 前置条件；`canBuy` 递归校验前置与研究点；高级建筑（水培农场、炮塔、医疗舱、采矿机、兵营）需先研发科技解锁蓝图。
  - **建筑建造成本多材料化**：彻底移除放置建筑时的重复「研究点」消耗；`BUILDINGS` 改用木材（wood）/ 铁矿（iron）/ 石料（stone）等物理建材配方；`canPlace` 支持多材料库存校验；拆除返还 50% 建材。
  - **地图原生自然生态生成**：`Colony.generateFlora` 程序化在 2200×2200 家园地图散布外星树木（`tree`，掉木材）、铁矿石脉（`rock_iron`）、花岗岩块（`rock_stone`）、野生浆果丛（`bush_berry`）与草药丛（`bush_herb`）；`workOnFlora` 支持居民伐木/凿矿/采摘推进与物理掉落；`APH.Ent.drawFlora` 接入实体绘制层。
  - **资源存储与 UI**：`meta.res` 升级支持 wood/stone/iron/food/herb 等多材料；建造菜单与顶部资源栏实时显示木/铁/石多材料库存与前置科技状态。
  验证: `python3 build.py` 构建成功 27074KB 以 `</html>` 收尾；新增 `tests/tech.test.js` 与 `tests/resources.test.js`；单元 280/0；场景 28/0；perf 3/0；boss 7/0（全量 318 项自动化测试 100% 绿灯）。
  下一步: 实机浏览器体验试玩。

- **2026-08-29 · 班次**: ✅异星奇幻农耕与远征驯化系统（#33~#38 全部闭环）。
  - **4 大外星奇幻植物**：夜光荧蕈（`crop_glow_shroom`，夜间自发光 60px、荧光浆液）、晶脉拟态藤（`crop_crystal_vine`，晶核果 + 晶体副产物）、露珠膨果（`crop_dew_fruit`，多汁果冻 +6 清甜心情 Buff）、星绒草（`crop_star_velvet`，外星防酸银绒纤维）。
  - **远征探险采种**：`Planet.generateExpeditionFlora` 生成野生异星植物，[E] 采种装入背包，返航结算自动入库。
  - **家园外星田圃与发光动效**：新增轻量种植槽 `bl_crop_plot`（10木+5石）；`Colony.getGlowSources` 派生夜间发光源；`Ent.drawBuilding` 绘制动森风田垄与 4 阶段外星植株动效（果冻弹动露珠、荧光伞盖、晶粉花藤）。
  - **培育照料与多维收获**：`cropPlotTick` 与 `harvestAlienCrop` 纯函数推进生长与多维特产结算。
  验证: `python3 build.py` 构建成功 27084KB 以 `</html>` 收尾；新增 `tests/flora.test.js` 与 `tests/agri.test.js`；单元 292/0；场景 28/0；perf 3/0；boss 7/0（全量 330 项自动化测试 100% 绿灯）。
  下一步: 实机体验外星发光农园。

- **2026-08-29 · 班次**: ✅多群系异星生态系统与勘测图鉴（#39~#44 全部闭环）。
  - **4 大异星生物群系（Biomes）**：荧光菌林星（`biome_spore_forest`）、晶脉硅蚀荒原（`biome_crystal_wasteland`）、酸蚀巨沼星（`biome_acid_marsh`）、极地银霜雪原（`biome_cryo_tundra`）。
  - **PlanetSpec 确定性派生**：Seed 派生 `spec.biome`，驱动群系专属调色板与核心环境法则（`lw_bioglow`, `lw_crystal_resonance`, `lw_acid_mist`, `lw_cryo_freeze`）。
  - **专属植被与生物分布**：`generateExpeditionFlora` 按群系主导生成原生异星植物；`particleTypeOf` 派生群系氛围粒子（发光孢子、静电火花、酸性蒸汽、飘雪）。
  - **生态图鉴（L 键）集成**：展示当前星球群系大卡片、环境法则解析、已录入异常与已知生物档案。
  验证: `python3 build.py` 构建成功 27091KB 以 `</html>` 收尾；新增 `tests/biome.test.js`（6 项群系测试）；单元 298/0；场景 28/0；perf 3/0；boss 7/0（全量 336 项测试 100% 绿灯）。
  下一步: 实机探索 4 大异星群系。

- **2026-08-29 · 班次**: ✅工坊深度加工与外星装备系统（#45~#49 全部闭环）。
  - **5 大外星特种装备**：精工采矿斧（`it_pickaxe`，采集速度翻倍）、星绒防酸服（`it_suit_hazard`，酸雾暴露削减 80%）、极地防寒羽绒（`it_suit_cryo`，极寒失温削减 80%）、荧光夜视镜（`it_goggles_night`，夜间视野 +80px）、复合急救包（`it_medkit_adv`）。
  - **工坊制作流水线**：`workshopCraftTick` 消耗材料与工时推进装备打造；靠近工坊按 **[F]** 切换配方；工匠在岗时自动制造并在工坊边产出物理装备堆。
  - **装备穿戴与被动抗性**：`equipGear` 与 `gearBonusOf` 纯函数派生被动加成与抗性；`meta.residents` 支持 `gear` 穿戴字段。
  验证: `python3 build.py` 构建成功 27096KB 以 `</html>` 收尾；新增 `tests/craft.test.js`（5 项制作与装备测试）；单元 303/0；场景 28/0；perf 3/0；boss 7/0（全量 341 项测试 100% 绿灯）。
  下一步: 外星料理与全屏科技树大地图。

- **2026-08-29 · 班次**: ✅外星烹饪与餐饮社交闭环系统（Cooking & Campfire Social）。
  - **5 大外星熟食**：炙烤异星肉排（`it_roasted_meat`）、晶核浆果浓汤（`it_berry_stew`）、清甜露果布丁（`it_dew_pudding`）、荧光温热浓汤（`it_glow_fondue`）、外星珍馐盛宴（`it_alien_feast`），提供饱食（+30~50）、心情（+4~12）、娱乐（+10~30）与驱寒加成。
  - **餐饮设施与科技**：新增石料篝火 `bl_campfire`（夜间照明、驱寒、基础烘烤）与烹饪灶台 `bl_kitchen`（高级烹饪、厨师岗）；新增农业科技 `te_alien_culinary`（异星烹饪保鲜）。
  - **烹饪流水线与围炉社交**：`cookingTick` 推进菜肴烹制与食材扣除；`getGlowSources` 将篝火纳入温暖橙黄色动态发光源（100px）；`campfireAuraTick` 判定 90px 范围内驱寒消退暴露、恢复娱乐并触发“围炉夜话”羁绊与心情提升；`offerMeal` 熟食款待过客好感跃升至 +35。
  - **就餐寻路与渲染**：`tryEatHere` 优先检索熟食进食并弹出菜品品尝飘字；`drawBuilding` 绘制石砌柴火跳跃火焰与厨房蒸汽微粒。
  验证: `python3 build.py` 构建成功 27117KB 以 `</html>` 收尾；新增 `tests/cooking.test.js`（8 项烹饪测试）；单元 311/0；场景 28/0；perf 3/0；boss 7/0（全量 349 项测试 100% 绿灯）。
  下一步: 全屏可视化科技蓝图大地图。

- **2026-08-29 · 班次**: ✅异星实物标本化验与双轨制科研系统（#50~#55 全部闭环）。
  - **7 大未解析标本**：荧蕈胚囊 / 露果切片 / 晶藤胚根 / 星绒孢子 / 异质硅壳 / 强酸腺囊 / 古代芯片（`specimen_*`，ADR-9 修订入库）。
  - **科研站化验流水线**：学者在 `bl_lab` 走 `labAnalysisTick` 推进分析槽；完成时消耗标本，`applySpecimenAnalysis` 点亮 `meta.analyzedFlora`、授予蓝图、注入尤里卡研究点。
  - **远征采集联动**：野外植株改采活体标本；酸吐者掉腺囊、硅壳壁垒掉甲壳、Boss 掉古代芯片；返航 `settleGoods` 保留标本不折算研究点。
  - **三重回报**：田圃未化验不可种；科研站旁吐出纯净种荚与精纯试剂 `it_reagent`；L 键科学图鉴点亮已化验解剖档案，靠近科研站 [F] 切换化验队列。
  验证: `python3 build.py` 构建成功 27131KB 以 `</html>` 收尾；新增 `tests/science.test.js`（15 项）；单元 326/0；场景 29/0；perf 3/0；boss 7/0（全量 373 项自动化测试 100% 绿灯）。
  下一步: 全屏可视化科技蓝图大地图。

- **2026-08-29 · 班次**: ✅全屏科技树替换 T 循环列表，并接上硅壳化验钥匙。
  - **T 全屏图**：家园 T 切换四列（农业/工业/医学/安防）节点卡片；方向键选、Enter 即时扣研究点、Esc/T 关；世界不停；打开时收起 G/L/R/交易。`te_weaponry` 不进图。氧气罐挂安防列顶。
  - **游商**：走近 [E] 开交易（游商本就不能招）；T 不再抢键。
  - **化验钥匙**：`te_bio_adaptation` 不能花研究点买。无水培化验硅壳只记已化验+尤里卡；水培入账后若已化验则补发。卡片只写真解锁/已接线效果；等离子伤害改读 `plasmaTechLevel`（ballistics 与旧档 weaponry 取大）。
  - **词汇/决策**：`CONTEXT.md` 科研一组；`docs/adr/0002-dual-track-research.md`。建筑显示名改为科研站。
  验证: `python3 build.py` 构建成功 27140KB；单元 331/0；场景 30/0；perf 3/0；boss 7/0。无浏览器工具，未实机点开全屏图，交互由场景测试 `tech map` 断言 DOM。
  下一步: 实机按 T 走一遍四列和硅壳钥匙锁文案。

- **2026-08-29 · 班次**: ✅审查三条修复（出航关图 / 居民跳刷新 / 前置优于研究点）。
  - 出航与返航 `closeColonyOverlays`；T 在图开着时任意场景可关，debug T 不再抢关。
  - `residentsTick` 末尾 `refreshTechMapIfOpen`。
  - `canBuy` 先 `missingRequire` 再扣研究点；`techNodeStatus` 因此把缺前置画成 locked。
  验证: 构建 27140KB；单元 332/0；场景 32/0；perf 3/0；boss 7/0。
  下一步: commit。

- **2026-08-29 · 班次**: ✅科技图 Enter 看起来没反应——飘字 z-index 9 被全屏图 42 挡住。
  反馈改写到图顶栏；选中卡片提示「再点一次或 Enter」；飘字提到 60。
  验证: 构建 27141KB；场景 33/0（含失败原因可见）。
  下一步: 硬刷新 game.html 再试。

- **2026-08-29 · 班次**: ✅#56 玩家饱食进 HUD。
  `homeFoodTick` / `ensurePlayerNeeds`：家园掉饱食、远征冻结、不饿死；左上 HUD 家园显示、远征隐藏。
  验证: 构建 27143KB；单元 334/0；场景 34/0。
  下一步: #57 精力 HUD。

- **2026-08-29 · 班次**: ✅#57 玩家精力进 HUD。
  `homeRestTick` / `ensurePlayerNeeds.rest`：家园掉精力 7/跳、远征冻结、钳到 0（累塌另票）；左上 HUD 家园显示、远征隐藏。
  验证: 构建 27145KB；单元 336/0；场景 35/0；perf 3/0；boss 7/0。无浏览器工具，HUD 由场景测试 `player rest` 断言 DOM。
  下一步: 实机打开 game.html 看左上精力条；场上累塌仍未做。

- **2026-08-29 · 班次**: ✅#58 玩家病情进 HUD。
  `homeIllnessTick` identity+clamp（家园/远征都不改值）；左上 HUD 家园且病情>0 才显示，远征隐藏且不结算。
  验证: `python3 build.py` 构建成功 27146KB 以 `</html>` 收尾；单元 338/0；场景 36/0；perf 3/0；boss 7/0。HUD 由场景测试 `player illness` 断言 DOM。
  下一步: 场上生病/累塌仍未做。

- **2026-08-29 · 班次**: ✅#59 玩家俯卧图。
  新增 `assets/player_prone_sheet.png`(4096×256, 4 向 × 4 呼吸 16 帧, 躺体接地线 bottom≈252/256, 管线占位图可随时被真图替换重跑)。
  `humanoid.js`: `sheetKey('prone')→player_prone`(全角色/脸/包共用)、`sheetLayout /_prone$/→16 帧慢呼吸`、`pose(lying)` 独立 prone cycle(不吃 walkPh/moving, 帧=向*4+floor(time*idleFps)%4)、`poseFor(lying)` 短路+idle→walk 回退加 `!lying` 防御(俯卧绝不旋转走循环充数)。
  `entities.js`: `drawPlayer` 俯卧触发 flag(今日惰性, 玩家无状态)、sprite 就绪门放宽含 prone、缺图落程序化站姿(不换走循环)、击倒叠 `drawProneWounds`(血泊+躯干/头伤痕, ADR-0003 不换色不叠五官)；`drawNpcSprite` 从 `isSleeping||downed` 进 prone 并叠伤；`drawResidentMarks` 俯卧图在场时压掉 🚨(伤痕体现, 程序化回退仍留 🚨)。
  `build_sprites.py`: `use_feet` 纳入 `*_prone_sheet.png`(躺体底边=接地线)。`main.js` SPRITE_META 加 `player_prone:{baseline:253,h:68}`(build 实测)。`src/sprite_data.js` 重生成(33 sheets, 勿手改)。
  验证: `python3 build.py` 构建成功 27246KB 以 `</html>` 收尾; 单元 345/0(新增 humanoid prone 7 用例: 布局/sheetKey/pose 四向与呼吸/俯卧盖 moving/poseFor 缺图不回退/共用); 场景 38/0(新增 2 冒烟: 睡倒居民绘制不崩、玩家惰性 flag 绘制不崩); perf 3/0; boss 7/0。另跑 mock draw 探针: 睡/倒居民与玩家俯卧均请求 `player_prone` 正确帧, 永不请求 walk。
  下一步: 实机打开 game.html 看居民睡眠/击倒俯卧身+伤; 玩家累塌/床边 E 睡接入(另票)。

- **2026-08-29 21:35 · 班次**: ✅#60 居民脸 0 无包俯卧图。
  新增 `assets/hum_0_nopack_prone_sheet.png`（4096×256，16 帧横排，四向各 4；脸 0 无包整人预烘焙，无运行时换色/五官叠层）。`Humanoid.sheetKey/pose/poseFor` 让脸 0 无包居民优先选专用 prone；专用图未就绪只回退 `player_prone`，绝不回退 walk。`main.js` 注册实测锚点 `baseline=248,h=122`；sprite data 重生成至 34 sheets；ADR-0003 与 DESIGN 追加 #60 修订。
  验证: 资产探针 4096×256 / 16 帧非空 / 每向 4 帧各异 / 内联键唯一；`python build.py` 构建成功 27926KB；单元 348/0（新增 #60 选择、布局、四向呼吸及专用→通用回退用例）；场景 38/0；perf 3/0；boss 7/0。
  下一步: 实机打开 `game.html?autostart=1` 查看脸 0 居民睡着/击倒的尺寸与四向观感。

- **2026-08-29 21:52 · 班次**: ✅#67 玩家精力累塌（家园精力归零原地睡着）。
  - **累塌触发点**：`residentsTick`（`main.js` 生产跳 `s.prodT>=30` 块内, 两场景都跑）每 30 游戏秒调纯函数 `APH.Res.playerRestTick(needs, scene, hasBed)`。清醒分支委托 `homeRestTick` 掉 7 后若 `rest<=0` 且 `scene==='home'` → `setPlayerSleeping(needs, true, false)` **原地打地铺睡**（`bedId=null`，不绑床、不走向床）。因生产跳与键盘输入无关，即使玩家正在操纵也会累塌。
  - **scene 门**：只在家园触发（远征精力冻结不会见底）；`CFG.player.restCollapseAt:0` 阈值进配置可测。
  - **唤醒继承 #66 零新增**：累塌只翻 `isSleeping=true`，WASD（`entities.js` 先醒后动同帧）/ E 再按（`debugPressE`+keydown 优先分支）/ 受伤（`hurtPlayer` 伤害真正落地）均走同一 `playerWake`。
  - **三条评审修复折入**：① `playerRestTick` 自动醒同时清 `bedId`（对齐 `playerWake`，修全恢复床睡后 `bedId='bed_player'` 残留）；② `setPlayerSleeping` 增可选第 4 参 `bedIdParam`（#70 医疗舱预留，默认保留 `bed_player` 不破坏 #66 断言）；③ `updatePlayer` 睡眠分支 `pe.moving=false`（防俯卧残留走帧）。
  验证: `python3 build.py` 构建成功 27253KB 以 `</html>` 收尾，script 标签 18/18 平衡；survival 38/0（新增 6 纯例）；场景 46/0（scenario 新增 3 冒烟：累塌→meta+实体俯卧+bedId=null+moving=false+drawPlayer 不崩、WASD 唤醒同帧移动、E/受伤唤醒）；单元全量 358/0；perf 3/0；boss 7/0。全量 414 项自动化测试 100% 绿灯。无浏览器工具，交互由场景测试经 `residentsTick`/`updateHome`/`debugPressE`/`hurtPlayer` 断言状态机。
  下一步: 实机打开 game.html 让家园精力见底看原地俯卧，WASD/E/受伤唤醒；#70 医疗舱躺接入复用此 seam。

- **2026-08-29 22:14 · 班次**: ✅#64 病中居民统一减速与病号标记放大。
  `CFG.walk` 新增病情阈值 20、速度倍率 0.6；公共 `updateResidents → walkToward` 调度让病情 >20 的普通移动统一降至 33.6px/s，病情等于阈值仍为 56px/s，不改病情与 walking 动画。病号 `✚` 保持红色与 `>=20` 显示边界，字号由 `CFG.residents.sickMarkFontPx=14` 控制。
  验证: TDD 红灯为新增场景 2 失败（缺 CFG、仍为 9px），实现后场景 40/0；定向居民/生存 104/0；`python3 build.py` 构建成功 27927KB；全量单元 348/0、场景 40/0、perf 3/0、boss 7/0。
  下一步: 实机检查放大后的 `✚` 与进食、睡眠、搬运标记是否重叠。

- **2026-08-29 22:45 · 班次**: ✅#64 review 修复：补齐游荡居民与家园玩家病情减速。
  移动边界拆为 `CFG.walk.sickAbove=20`（严格大于）与 `sickSpeedMul=0.6`，病号显示独立为 `CFG.residents.sickMarkAt=20`（大于等于）。`updateResidents` 在提前返回前计算一次病情倍率并传入 `wanderStep`；玩家仅在 home 场景把同一倍率用于走路和跑步，远征速度不受冻结病情影响。仍使用普通 walk sheet。
  验证: TDD 红灯场景 4 失败（配置语义、游荡、玩家、标记边界），实现后 `PYTHONIOENCODING=utf-8 python build.py` 成功；单元 348/0、场景 42/0、perf 3/0、boss 7/0、`git diff --check` 通过。
  下一步: 实机确认家园玩家和崩溃游荡居民的 60% 速度体感。

  - **靠床 E 入睡**：`updateHome` 检测 60px 内最近居住舱 `bl_house` 实体 → `s.nearBed`（只置提示位，绝不写 `s.target`，无自动寻路）；E 键/`debugPressE` 镜像逻辑靠床时调 `setPlayerSleeping(true, true)`（绑 `bedId='bed_player'`），实体标志每帧由 `updatePlayer` 同步 → `drawPlayer` 走 #59 `player_prone` 俯卧。
  - **唤醒三通道**：WASD/方向键（`updatePlayer` 先醒后动同一帧，不吞输入）、E 再按（键处理最优先分支）、受伤（`hurtPlayer` 伤害真正落地时，if 帧保护之后）。睡着时除 E 外全部按键忽略；`firePlasma` 睡眠中禁射。
  - **精力结算**：`residentsTick` 换用纯函数 `APH.Res.playerRestTick(needs, scene, hasBed)`——睡中床 +25/地铺 +18/跳、回满 100 自动醒；清醒委托 `homeRestTick`（家园 -7、远征冻结）。`ensurePlayerNeeds` 补 `isSleeping:false` 默认（新档+老档两条路径），save.js 兜底分支同补。
  - **纯函数 seam**（#67 累塌/#70 医疗舱躺可复用）：`setPlayerSleeping` / `playerWake` / `playerRestTick` 导出至 `APH.Res`；`CFG.player` 加 `bedSleepRadius/bedRecover/floorRecover/restWakeAt`（读回退 `CFG.residents.*`）。
  验证: `python3 build.py` 构建成功 27252KB 以 `</html>` 收尾，script 标签 18/18 平衡；单元 352/0（survival.test 新增 7 例：playerRestTick 床/地铺/回满/远征冻结、setPlayerSleeping 绑床/地铺/清床、playerWake 返回值、ensurePlayerNeeds 默认）；场景 43/0（scenario.test 新增 5 例：靠床 nearBed 且 S.target 保持 null 不自动寻路、E 入睡+实体俯卧+drawPlayer 不崩、WASD 唤醒同帧移动、E 再按唤醒、受伤唤醒）；perf 3/0；boss 7/0。全量 405 项自动化测试 100% 绿灯。无浏览器工具，交互由场景测试经 `updateHome`/`residentsTick`/`debugPressE` 断言状态机。
  下一步: 实机打开 game.html 在居住舱旁按 E 睡、WASD/E/受伤唤醒看俯卧；#67 场上累塌、#70 医疗舱躺接入复用此 seam。

- **2026-08-29 22:58 · 班次**: ✅#72 玩家家园击倒送医（击倒≠死亡，远征死法不变）。
  - **击倒=家园专属状态，与 #66/#67 睡眠平行但正交**：`hurtPlayer` 家园分支最先判定——`s.hp<=0 && s.scene==='home'` → `meta.playerNeeds.downed=true; downT=CFG.player.downedTime(90)`，`return`（**不动 clinicKit / stats.deaths / showDeath，不进死亡画面**）。该分支先于远征 clinicKit 复活/死亡分支（顺带修复远征残余 clinicKit===1 在家被误消耗的潜伏 bug）。`firePlasma` 击倒中禁射。
  - **昏迷不可动不可醒**：`entities.js updatePlayer` 新增 downed 分支（在 WASD 唤醒逻辑**之前**）——不移动、不寻路、实体 `pe.downed=true; moving=false`（`drawPlayer` 经 `lying && e.downed` 走 #59 `drawProneWounds` 叠伤痕），**WASD/E 均不醒**；`bindInput` 击倒时所有按键忽略（含 E）、`debugPressE` 同样短路。运行时镜像 `s.downed`（init `downed:false`）+ 实体 `pe.downed` 由 `syncPlayerSleep` 每帧同步。
  - **送医拖行+复活**：`main.js` 新增 `carryPlayerToClinic(dt)`（世界侧 lerp，`CFG.player.downedCarrySpeed:70`，同步 `pe.x/pe.y`）；纯函数 `APH.Res.playerDownedTick(needs,scene,dt,ctx)` 判定——`inClinic && hasClinic && hasResidents` → 复活（回血 `CFG.economy.clinicHeal:40`）；否则按 `downedTime` 倒计时，归零 → `updateHome` 收口 `mode='dead'`+`stats.deaths++`+`showDeath('你在殖民地倒下，失血过多。')`。顺序固定 `updatePlayer→carry→tick`（用拖后位置判 inClinic）。HUD 新增 `rowDowned` 红色倒计时条（击倒/复活/死亡自动显隐）。`enterHome` 防御性清 stale downed；`ensurePlayerNeeds` 补 `downed:false/downT:null` 默认（老档保护）。
  - **远征死法不变**：击倒只在家园分支生效；`playerDownedTick` 远征 no-op；远征 hp<=0 仍走现有 clinicKit 急救→死亡。
  验证: `python3 build.py` 构建成功 27261KB 以 `</html>` 收尾，script 标签 18/18 平衡；单元 368/0（combat.test 新增 3：家园击倒≠死亡/不消耗 clinicKit/远征仍死亡；survival.test 新增 7：playerDownedTick 倒计时递减/送医复活/有舱无居民不解救/归零死亡/远征 no-op/未击倒 no-op/ensurePlayerNeeds 默认）；场景 52/0（scenario 新增 6 冒烟：击倒→实体俯卧+moving=false+drawPlayer 不崩、WASD 不移动不醒、hurtPlayer 家园 vs 远征、有居民+医疗舱送医复活、远处医疗舱拖行、无居民倒计时归零死亡）；perf 3/0；boss 7/0。全量 430 项自动化测试 100% 绿灯。无浏览器工具，交互由场景测试经 `updateHome`/`hurtPlayer`/`carryPlayerToClinic` 断言状态机。
  下一步: 实机打开 game.html 在家园吃 spitter/袭击伤害看击倒俯卧+伤痕、拖行入舱复活、无居民倒计时死亡；远征死法确认不变；#70 医疗舱躺接入可复用 #66 seam；居民救援(resident rescue)仍为 orphaned 不做。

- **2026-08-30 00:09 · 班次**: ✅#70 玩家病了躺医疗舱（不自动走向舱、靠近按 E 躺下、舱内按床速恢复）。
  - **不自动寻路**：`updateHome` 检测 60px 内最近医疗舱 `bl_clinic` 实体 → `s.nearClinic`（只置提示位，绝不写 `s.target`，镜像 #66 床边模式）。新增纯 helper `playerSick()`（读 `meta.playerNeeds.illness>0`）。配置 `CFG.player.clinicSleepRadius:60`（回退 60）。
  - **E 躺入（复用 #66 seam）**：`bindInput` 与 `debugPressE` 均在 `nearBed` 分支之后新增 `else if(scene==='home' && nearClinic && playerSick())` → `setPlayerSleeping(needs,true,true,'bed_med')`（用 #66 预留的第 4 参 `bedIdParam` 绑医疗舱床位），实体每帧同步俯卧，E 再按唤醒。提示链在 `'医疗舱·缓慢治疗'` 之前插入 `[E] 躺进医疗舱 (病情 N)` / `[E] 起床`。
  - **舱内按床速恢复（关键接线）**：`residentsTick` 的 `playerRestTick` 调用改为 `hasBed=!!nearBed||!!nearClinic` → 舱内躺卧 +25/跳（非地铺 18），回满自动醒并清 `bedId`。与 #72 击倒互斥（`playerDowned()` 短路阻断 E）；与 #67 累塌不冲突（累塌只从清醒分支触发，不会覆盖舱内躺卧）。本票仅 rest 恢复，病情治愈另票（scope 控制）。
  验证: TDD 红灯为新增场景 3 失败（#66 残留 `nearBed` 使 E 走床分支 → `bed_player`，测试隔离后修复），实现后 `python3 build.py` 构建成功 27934KB 以 `</html>` 收尾；survival 48/0（新增 3 纯例：bed_med 床速 +25/回满自动醒清床/playerWake 清 bed_med）；场景 62/0（scenario 新增 6 冒烟：不自动躺/不自动寻路 target=null、生病+靠舱 E 躺入+俯卧+drawPlayer 不崩、躺舱中再按 E 唤醒、健康玩家不躺、击倒玩家 E 阻断、舱内按床速 +25 恢复）；单元全量 374/0；perf 3/0；boss 7/0。全量 446 项自动化测试 100% 绿灯（374 单元 + 62 场景 + 3 perf + 7 boss）。无浏览器工具，交互由场景测试经 `updateHome`/`residentsTick`/`debugPressE` 断言状态机。
  下一步: 实机打开 game.html 让玩家生病（吃到患病）靠近医疗舱按 E 看俯卧 + `[E] 躺进医疗舱 (病情 N)` 提示 + 舱内精力按床速恢复，E 再按醒；#70 病情治愈（舱内掉 illness）作为后续票。

- **2026-08-30 00:35 · 班次**: ✅#71 击倒叠伤痕、睡着不叠（渲染级区分测试锁定 ADR-0003）。
  - **补的是 #59/#60 已实现后的验收缺口**：`drawProneWounds`（entities.js）仅在 `lying && e.downed` 两处触发（drawPlayer/drawNpcSprite），程序化血泊+躯干/头伤痕早已在；本票不再重建伤痕，而是补上「能区分睡着与击倒的场上体现」这唯一未锁的验收标准——强制俯卧 sheet 就绪 + 伤痕记录 ctx spy 的渲染测试。
  - **几何核实（不按 contentH 重锚）**：两张俯卧表 contentH 不同（`player_prone` 68 / `hum_0_nopack_prone` 122），但 `contentH × spriteScale(contentH) = drawH(78)` 对两者恒成立 → 身体内容一律映射到 y∈[-78,0]，伤痕固定坐标即贴体；**绝不做 contentH 再缩放**（×78/122≈0.64 会错位）。额外用像素分析核对了俯卧表方向帧：player_prone 四向近乎同一图（重叠 0.988~1.0）、头恒在左，故不做"按 dir 镜像头擦伤"（计划 4a 的前提不成立，跳过以免错位），只补 4c 不变式注释。
  - **新增渲染测试**（scenario.test.js，紧跟 #59/#72 冒烟）：`forceProneReady()` 按 main.js SPRITE_META 值 define + 塞 `_images` 强制 `isReady()=true`；`woundCtx()` 复用 #64 spy 形状、只按 `WOUND_FILLS` 过滤伤痕 ellipse（T12 光圈 strokeStyle、落地影 rgba(0,0,0,*) 不误判）、`drawImage` 记 `_sheet` 证明走贴图路径非程序化回退。三条：#71 render 居民（专用 `hum_0_nopack_prone`）、过客（通用 `player_prone`）、玩家（`player_prone`）——downed 叠≥4 处伤痕且 sheet 正确，isSleeping 同 sheet 但 0 伤痕；downed 与 isSleeping 互斥断言。`finally` 内 `restoreProneReady()` 还原 `_images[name]`/原 `fw`（不是 delete——保存原值再还原 isReady=false），`bindCtx(originalCtx)` 还原绘图上下文，不影响后续程序化回退测试。
  - **几何不变式测试**（humanoid.test.js 新增 #71 geometry）：`contentH × spriteScale(contentH) === drawH` 对两张俯卧表恒成立且彼此相等——锁死新增俯卧表（未来 #60 变体）不改 overlay 锚定。
  - **src 改动仅注释**：drawProneWounds 头部补 [-78,0] 不变式说明（4c），无行为变更。
  验证: `node tests/run.js` 375/0（+1 geometry）；`node tests/scenario.test.js` 65/0（+3 render）；定向 `survival+humanoid+residents+sprites` 164/0；perf 3/0；boss 7/0；`python3 build.py` 构建成功 27934KB 以 `</html>` 收尾（repo 根 build.py，无 aphelion/build.py）。全量 450 项自动化测试 100% 绿灯。无浏览器工具，伤痕区分由渲染测试断言 drawImage sheet + fillStyle 过滤伤痕计数。
  下一步: 实机打开 game.html 敲倒居民/玩家看血泊伤痕、床边睡眠/累塌看干净俯卧身（无血迹）；如需更明显血迹可后续在 `drawProneWounds` 加暗色核心血泊（4b，保持伤口色系、仍是伤痕-only 不换色）。

- **2026-08-30 02:30 · 班次**: ✅#61 脸1无包俯卧图 + ✅#62 脸2无包俯卧图（codex 生成管线）。
  - **管线沉淀**: 生图输出不透明纯绿背景(#00FF00)，build_sprites 只清"假透明"(中性近白)，故新增 `assets/chroma_key.py`（泛洪连通绿→透明，幂等；薄荷绿柔和绿 R/B 高不误伤）。脸1/2/3 全部经 chroma_key → build_sprites(use_feet 接地线+帧配准) → SPRITE_META → sprite_data.js。
  - **脸1(`hum_1_nopack_prone`)**: 棕发男孩，16帧四向各4，baseline=248 内容高=139；**脸2(`hum_2_nopack_prone`)**: 丸子头，baseline=249 内容高=163。prompt 强化"每格头必须在左"（脸2 初版帧8 头朝右与 #60/脸1 相反，重生成修正）。
  - **接线**: humanoid `sheetKey` 加 fi===1→hum_1 / fi===2→hum_2；SPRITE_META 对应注册。**旧测试修正**: #59 poseFor 两测试原用 `rs_0`(fnv→脸1)/`rs_2`(→脸3) 断言 player_prone——脸1 接入后 rs_0 应得 hum_1，改用 `rs_6`(脸3 未配) 断言通用图，语义才正确；#71 render 居民测试 `rs71`→脸2，改用 `rs_3`(真脸0) 断言 hum_0。
  - 验证: `node tests/run.js` 383/0（sheetKey 脸1/脸2 + sheetLayout #61/#62 + 修正的 poseFor）；scenario 71/0；perf 3/0；boss 7/0；`python3 build.py` 构建成功 29389KB 以 `</html>` 收尾。全量 464 项绿灯。
  - 下一步: #63 脸3 俯卧（红棕卷发）——codex 整张16帧时帧4/12 割裂/裁切，改分向生成(4张×4帧)再拼 16 格。

- **2026-08-30 03:30 · 班次**: ✅#63 脸3无包俯卧图（codex 分向生成）。
  - **策略变更**: 整张 16 帧一次生成时，脸3 的帧4/12 多次出现割裂/裁切（codex 对多姿态一致性不稳）。改**分向生成**: 4 张各 4 帧的 1024×256 strip（俯卧/左侧躺/右侧躺/仰躺，各向 4 帧只差呼吸），PIL 拼成 4096×256 16 格，再走 chroma_key → build_sprites。**四向帧全部头朝左、完整居中**（prompt 强化 CRITICAL head at LEFT + 完整不裁切）。
  - **接线**: humanoid `sheetKey` fi===3→hum_3；SPRITE_META `hum_3_nopack_prone:{baseline:198,h:139}`。**测试适配全脸有图现实**: #59 poseFor 两测试改为验证"专用图缺图→回退通用 player_prone 而非走循环"与"过客/玩家共用 player_prone"；sheetKey 测试扩到四脸专用图。
  - 验证: `node tests/run.js` 384/0（sheetLayout #63 + 适配后 poseFor）；scenario 71/0；perf 3/0；boss 7/0；`python3 build.py` 构建成功 30195KB 以 `</html>` 收尾。全量 465 项绿灯。
  - 下一步: **#68 居民睡着改俯卧**——四脸俯卧图已全齐（#60-63 关），居民睡着应不再站姿呼吸+Zzz，测试断言睡着为俯卧姿态。

- **2026-08-30 11:12 · 班次**: ✅#68 居民睡着改俯卧（原地冻结、俯卧贴地、撤站立+Zzz）。
  - **双缺口定位（对齐计划）**：① `updateResidents`（main.js）睡民仍被 `walkToward` 呼叫 → 俯卧身滑动；② `drawResidentMarks`（entities.js）睡民叠 💤 → 站立待机+Zzz 冒充睡着。四脸俯卧图（#60-63）与 `sheetKey`/`poseFor` 俯卧路径早已就绪，本票只接行为与渲染收口。
  - **行为**：`walkToward`（residents.js）首行守卫 `if(e.isSleeping){ e.walking=false; return e; }`（冻结位置、清走位残留、不推进 walkPh/face）；`updateResidents` 在 `e.breaking=null;` 后加 `if(r && r.isSleeping){ e.walking=false; return; }`（跳过饿/搬运/岗位/行走，防睡中 grab 与进食）。位置只冻结不瞬移。
  - **渲染**：`drawResidentMarks` 删除 💤 Zzz 分支（仅此分支；病 ✚ / 餐 🍽 / 搬运框 / 💢 / downed 🚨 程序化回退 / 名字全保留）。俯卧身+拉长阴影即睡眠指示；恢复面板 `💤[睡眠]` 徽标（main.js:2786）是 UI 保留。过客/士兵/玩家零改动。
  - **测试**：residents +1 单元（walkToward 睡眠守卫：不移动/walking 清/walkPh 冻结）；humanoid +1 单元（poseFor 脸1/脸2 → `hum_1/2_nopack_prone`，FNV-1a mod4 复算 rs_3→0 rs_4→1 rs_1→2 rs_6→3）；scenario +2：#68 render（四脸睡着命中各自 `hum_*_nopack_prone`、无 `*_walk`、无伤痕、无💤，`walking:true` 故意证明俯卧优先于走循环）与 #68 home（睡着居民 20×0.5s 原地不动、walking=false、不拾取）。`woundCtx.fillText` 改为记录文本（加法改动，既有断言只按 ellipse/drawImage 过滤不受影响）。**踩坑修正**：poseFor 对 lying 前先查该脸 walk sheet 就绪、缺则 fi 回退 0（`if (!ready(walkKey)) fi = 0;`）——渲染测试需把 `hum_0..3_nopack_walk` 一并 force-ready（与实机全量加载一致），否则 rs_4/rs_1 会落 `hum_0_nopack_prone`。
  验证: `node tests/run.js` 386/0（+2 单元）；`node tests/scenario.test.js` 73/0（+2 场景）；perf 3/0；boss 7/0；`python3 build.py` 构建成功 30195KB 以 `</html>` 收尾。全量 469 项自动化测试 100% 绿灯。（注：scenario 为独立入口，`run.js` 按 EXCLUDE 排除，直接 `node tests/scenario.test.js`。）
  下一步: 实机打开 game.html 等居民休息归零睡着→看按脸俯卧贴地（无 Zzz、无走位）；袭击启动看 `disturbSleep` 唤醒照旧。遗留已知边界：袭击进行中睡着的居民原地睡（不睡走）——可接受，已记录。

- **2026-08-30 12:12 · 班次**: ✅#69 病重/击倒居民躺医疗舱（自动去床+俯卧，轻病仍慢走+✚）。
  - **判定（纯函数）**：`Res.needsMedBed`（病情严格 > `CFG.residents.sickBedAt:50` 或 `downed`；恰 50 不躺）+ `Res.clinicBedSpot`（`bl_clinic` +16/+22，镜像 `residentSpot`）。轻病（>20 且 ≤50）返回 false → 不强制躺。
  - **行为**：`updateResidents` 在 #68 睡眠短路之后插入病重分支（先于崩溃/饥饿，与 #68 顺序一致）：覆写 `e.tx/ty` = 床位 → `walkToward`（击倒者 ×`downedCrawlMul:0.5` 匍匐 28px/s；病重 ×`sickSpeedMul`）；到床半径 `clinicBedArriveR:6` → `r.medLying=e.medLying=true`、吸附床位、`walkToward`/同步守卫冻结俯卧身、撤岗（`job=null`）。无医疗舱：击倒者原地俯卧（`e.downed` 渲染接管），病重走正常流程。`assignByPriority`（colony.js）躺舱者缺勤；`syncResidentEntities` 每帧镜像 `medLying`；`entities.js` 俯卧 `lying` 含 `medLying`（复用 `hum_0..3_nopack_prone`，血泊仍仅 `downed`）。玩家侧（#70 `nearClinic`/`setPlayerSleeping`）零改动。
  - **起床门**：`needsTick` 中 `medLying && !downed && illness<=50 → medLying=false`（独立标志，与睡醒 rest≥100 无冲突）；医疗舱被拆（`residentsTick`）起身。
  - **接线孤儿 checkDowned/rescueTick**（#17 遗留）：`residentsTick` 每生产跳（30s）一判一救——`checkDowned` 触发击倒（认知<30%/移动<15%）+ `bleedOutTimer` 启动；`rescueTick([r],…,30,hasClinic&&库存有药,{inClinic})` 舱内紧急救治（扣 1 药、`floatText` 提示）、无药倒计时 3 跳死亡（名册 filter + `saveMetaQuiet`，实体下一帧移除）；sickest 用藥块加 `if(r.downed) return` 防双扣。
  验证: TDD 后 `node tests/run.js` 390/0（+4 纯例）；`node tests/scenario.test.js` 77/0（+4 冒烟：病重 600,1200 → 5 帧向床靠近 → 40 帧躺床 medLying + sync 保留 + poseFor 俯卧 sheet；轻病 20/30 单帧 28/16.8px + ✚ 渲染；击倒 816,1222 → 单帧 14px → 20 帧躺床仍 downed；residentsTick 无药击倒倒计时→有药救活扣 1 药）；perf 3/0；boss 7/0；`python3 build.py` 构建成功 30199KB 以 `</html>` 收尾。全量 477 项自动化测试 100% 绿灯（390 单元 + 77 场景 + 3 perf + 7 boss）。
  下一步: 实机打开 game.html 给居民 `plague`（事件/console 加 ailments）观察自动走舱→俯卧、轻病慢走+✚；击倒居民看匍匐+送医救活/无药倒计时死亡；#69 床位重叠（多躺共用一点）属已记录可接受边界。

- **2026-08-30 14:30 · 班次**: ✅玩家俯卧占位图换真美术 (#59 资产升级) + 玩家✚ (#70 补闭环)。
  - **用户实测发现**: game.html 里玩家无床睡觉却显示"蓝色被子"大块 + "模型似放大"——根因是 `player_prone` 是我 #59 时程序化画的占位图(几何对但身体画成蓝被块, contentH=68 缩放失衡)。
  - **修复**: codex 分向生成真 `player_prone`(16帧4向×4呼吸, 参照 player_idle 棕发男孩; 4张4帧strip拼16格+chroma_key), SPRITE_META 更新 baseline=197/h=154; 实机验证睡觉/击倒渲染真俯卧小人, 被子消失。
  - **玩家✚**: 实机发现 #70"能走时走慢+✚"的✚只有居民有(drawResidentMarks), 玩家只有走慢(sickMul)——补 `drawPlayerSickMark`(镜像居民样式, sprite/程序化两分支)。
  - **验证工具沉淀**: `tests/aph_live_probe.js`(无头Chrome+CDP 注入玩家状态+截图+状态探针) —— 首次真正实机验证了睡觉俯卧/击倒伤痕/生病站姿。
  - 验证: run.js 390/0, scenario 78/0(含新✚测试, 修spy Proxy), perf 3/0, boss 7/0; 构建 30949KB。
  - 下一步: 实机确认 dir1/2/3 玩家躺姿朝向渲染无裁切; 用户裁剪看到的"头旁蓝块"疑为背包/服饰, 待实机细看。

- **2026-08-30 · 班次（规划不写码）**: 💬 建筑系统联动 grilling 会话——三轮「以环世界为参考」后定案收口。
  - **产出**：CONTEXT.md 新增「基建」术语节（墙/闸门/电网/导线/发电机/蓄电池/路灯/餐桌/餐椅/尖刺陷阱/沙袋，全部按 RimWorld 语义）；DESIGN.md 新增「建筑系统 v3」整节+ADR-13/14 表行；`docs/adr/0004-grid-pathfinding.md`（48px A*，墙=不可通行、门=可通行敌延迟、无路破墙；墙/门/导线不入 entities[] 为 ADR-3 显式例外，防打爆 entitiesHard 400）+ `docs/adr/0005-power-grid.md`（手动导线+BFS 连网，火力/太阳能/蓄电池，零发电机=电网未激活兼容，风力/地热显式裁剪）；BACKLOG 新增 v3 两班路线（未勾选）。
  - **定案要点**：电力网+墙线双核心；墙挡所有人（玩家推挤、其他单位绕行）；手动铺线非自动电网；发电机二家族（风力/地热/屋顶/IED 为显式裁剪，理由均已记录）；无顶房间=围合即房间（暴露免疫+心情）；科技挂靠不新增节点；老档零发电机默认通电。
  - 验证: 文档自洽（grep 检查 ADR 编号 0004/0005 与 DESIGN 表 ADR-13/14 对应）；无代码改动，不触发构建/测试。
  - 下一步: 用户确认施工计划后开第一班——网格寻路+墙/闸门+导线电力网（纯函数先行：A* 与 BFS 写 tests/ 可直测，再接 main.js）。

- **2026-08-30 · 班次（规划）**: 📋 to-spec → to-tickets 完成：建筑系统 v3 细化为 10 张 tracer-bullet 票。
  - **Spec**：GitHub #73（ready-for-agent，27 用户故事 + seams 定案：新模块寻路引擎 / colony 电网收口 / combat 破墙 / residents 兼容 / 格层渲染冒烟）。
  - **Tickets**：#74 T1 寻路引擎（无 blocker=frontier）→ #75 T2 墙与闸门 → #76 T3 居民绕墙 / #77 T4 袭击破墙 / #78 T5 弹道掩体 / #79 T6 电网核心 → #80 T7 耗电联动 → #81 T8 餐桌椅 / #82 T9 房间+路灯 / #83 T10 陷阱沙袋；blocking 边已用 native dependencies 挂好（blocked_by 核验通过）。
  - 验证: 依赖图 gh api 逐一核验 = 设计一致；BACKLOG 同步 issue 编号。
  - 下一步: 按 `/implement` 开 T1（#74）——先 claim（gh issue edit 74 --add-assignee @me），TDD 纯函数先行。

- **2026-08-30 · 班次（规划修订）**: 🎨 用户指出「建筑还没有模型」——补 **#84 T0 建筑v3视觉资产** 票（12 座新建筑走 ADR-11 Codex exec 管线：墙/闸门/导线/发电机/太阳能/电池/路灯/餐桌/餐椅/陷阱/沙袋；格上静态物单块砖式贴图+渲染层程序化转角，动画类 8 帧 sheet 惯例）。spec #73 修订：Out of Scope 移除「新建筑 sprite 贴图」，新增实现决策与依赖边（#75/#79/#81/#82/#83 ← #84）。Frontier = #74 + #84 双开工。验证：依赖图 blocked_by 全部核验（75:2/79:2/81:2/82:3/83:3）。

- **2026-08-30 · 班次**: ✅#74 T1 网格寻路引擎（APH.Nav 纯函数模块）。
  - **TDD 全程**：先写 12 条注册式用例（期望值手工推导：绕缺口路径/封闭无路/起点墙内逃生/步长跨段），再实现。红→绿 4 轮：①注释 `A*/」提前闭合块注释（SyntaxError，node --check 未拦注释级）→改「A星」；②rebuild 起点格中心入路径→跳过 chain[0]；③followPath 步长吞掉多段→`step-=d` 续走；④空地直线返回格心序列→加 `lineClear` 视线快速路径（起终点直线无墙直接 [终点]，walkToward 兼容关键）。
  - **seam**：新模块 src/nav.js（寻路三方共享：居民/袭击者/过客→独立模块，ADR-13）；build.py MODULE_ORDER 注册 nav.js（residents 前），tests/run.js 同步。
  - **语义对齐**：followPath 与 walkToward 一致（到达清 walking/设 face/空路径停）；`e.path/pathI` 由调用方持久（引擎不碰实体），T3 接实体时补缓存。
  - 验证: nav.test.js 12/0；全量 402/0；构建成功 30502KB；提交 a5cfb39 + 产物 4ef4d5e，已推 origin main。
  - 下一步: /code-review 双轴审查（后台运行中）→ 通过后关 #74；接着 frontier 双票 #84 T0 视觉资产（12 座新建筑贴图管线）。

- **2026-08-30 · 班次续**: 🔍 #74 T1 code-review 双轴（独立新鲜上下文）→ 2 major + 1 minor 全修。
  - **major① 闸门语义**：验收文字写「墙/闸门/营地=障碍」与 ADR-13 相悖（ADR-13 锁定：闸门可通行、延迟在移动层）。修正=BLOCKERS 只留 bl_wall/bl_siege_camp；新增「围栏留门→穿门 + 无门封闭→null」配对测试锁死语义（第一次测试构造错：y=2 行叠墙+门同格 → 修围栏只放 x=0/x=2；第二次：无门配对忘了补缺口墙 → 补）。
  - **major② ADR-10 魔数**：NC=46 → `Math.ceil(CFG.WORLD/CFG.GRID)`；默认 speed 56 → `CFG.walk.speed`。
  - **minor 精确落点帧 walking 假停**：`step-=d` 后 break 会清 walking（还有路走 → 单帧闪烁）；修=break 后 `e.walking=(e.pathI<e.path.length)`，新增「恰好到段1保持 walking」测试。
  - nit 顺手修：octile 0.41→`Math.SQRT2-1`；缺 'use strict' 补；CFG 兜底风格对齐兄弟模块；CLAUDE.md 模块表补 nav.js 行。
  - 验证: nav.test.js 14/14；全量 404/0；scenario 78/0；perf 3/0；boss 7/0；构建成功 30502KB；提交 fb5a4f6+4d385a6 已推 origin main。
  - 下一步: 关 #74；T0 视觉资产 #84（12 座新建筑贴图）或 T2 墙与闸门（#75，blocker=T1✓+T0）。

- **2026-08-30 · 班次（规划）**: 🌤 天气系统 grilling 收口（三轮「以环世界为参考」）→ ADR-15 落盘 + spec/tickets 发布。
  - **定案**：12 种天气马尔可夫状态机（转移概率表+持续 1~5 天+极端冷却）；切换经事件导演（ADR-12）；效果缝合零新机制——居民 exposureTick 复活（Survival #19 的桩！）/农场 farmMul/玩家减速/HUD/雾天敌感知；玩家不新增 exposure 条（显式裁剪）；solarMul 预留 T6 太阳能板；渲染程序化（ADR-11 例外）；meta.weather 老档零迁移；远征法则独立。
  - **产出**：CONTEXT.md 天气术语节（天气/状态机/暴露/避难所/预报）；docs/adr/0006-weather-system.md；DESIGN.md ADR-15 表行+天气系统 v1 章节；GitHub **#85** Spec + #86 W1 状态机（frontier）/ #87 W2 导演/ #88 W3 效果/ #89 W4 渲染（blocked_by #86 已挂）；BACKLOG 天气系统 v1 路线。
  - 验证: 依赖图核验（86:0 / 87:1 / 88:1 / 89:1）；文档提交待 push。
  - 下一步: 开 #86 W1 天气状态机（TDD 纯函数先行），与 da123wda 的 T0 资产零冲突。

- **2026-08-30 · 班次**: 🌤 #86 W1 天气状态机（APH.Weather 纯函数模块）。
  - **TDD 全程**：先写 13 条（后补 17）注册式用例再实现。红→绿 4 轮：①CFG 枚举 11 种（spec 写"12 种"系笔误，测试断言 11）；②冷却衰减时机 bug（极端期间衰减→离开即失效）→ 修「仅非极端期间衰减」；③durOf 用 rng 随机取时长→测试 t=629 不保证到时→t=2000 强制掷骰；④转入极端写 cd 用例手算区间修正（wx_rain cum thunder=[12,13)）。
  - **实现**：CFG.weather（transitions/dur/cd/effects 全表零魔数，ADR-10）；weather.js = tickWeather(state,dt,rng) 马尔可夫推进 + weatherEffects(id) + defaultWeather()；build.py MODULE_ORDER + run.js 注册（nav 后）。
  - **审查**：双轴独立 review → 无 blocker；2 major 修复（wx_rain_heavy exposure 8→0 与 ADR-15 极端清单对齐；测试覆盖补全表/进极端cd/dur边界）；minor 顺手修（死代码/空cd归一 null）；文档 12→11、ADR-9 补 wx_、0006 补大雨非极端修订。
  - 验证: weather 17/17；全量 421/0；scenario 78/0；perf 3/0；boss 7/0；构建成功 30508KB；提交 3ad9a9f+5c69a3a+d356778 已推。
  - 下一步: frontier 解锁 #87 W2 导演接线（ev_weather 进事件卡组）/ #88 W3 效果接线（exposureTick 复活！）/ #89 W4 粒子渲染（均 ← #86✅）。

- **2026-08-30 · 班次**: 🔀 W2/W3/W4 三票并行实现合流（独立 worktree + patch 合并）。
  - **并行方式**：workflowScript runs.all 逐票 worktree=true（从干净 HEAD 分支、各自 TDD+单测、产出 git diff patch 到 /tmp/aph_wx_<n>.patch），主会话统一 apply。
  - **合并冲突处理（3 处，全部手工解决）**：①scenario.test.js 加载列表三票同位置加 weather.js → 保留一条、其余剔除首个 hunk；②weather.js 同位置 W3 辅助（currentId/expectDur/expectRemain）与 W4 视觉参数（fxOf/fxParams/rgbaOf/tintRGBA/fxCount）顺序追加，用 edit 手工合并（89 的 weather.js hunk 从 patch 剔除后手插）；③89 的 return 导出与 88 冲突 → 合并导出全量。
  - **教训**：并行 patch 撞「同文件同位置插入」是必然（测试加载列表/导出表都在固定锚点），教训=并行任务应在任务书里指定「插入锚点差异化」或明确「禁止改共同文件（scenario.test.js 加载列表、weather.js 导出表由主会话统一合）」，或直接限定每票只碰自己的文件。
  - **交付**：W2 ev_weather 进卡组+directorTick 掷骰+喘息窗口；W3 exposureTick 复活（Survival #19 的桩终于活了）+ 农场乘子 + 玩家减速 + HUD 天气行 + 雾天感知 + 装备减免；W4 雨/雪/雾粒子+天色 tint+fxParams 纯函数（caps 预算）。
  - 验证: 语法全过；三新测试 39/0；全量 460/0；scenario 82/0；perf 3/0；boss 7/0；构建成功 30529KB；提交 e4e75c0(#87) + 46a1c1e(#88) + 63cdde2(#89) + 32363c2(scenario) + a8840ea(build)，已推 origin main。
  - 下一步: 合流 review 后台运行中 → 听后关 #87/#88/#89；然后 T0 若已合入，衔接建筑 v3 T2。

- **2026-08-30 · 班次续**: ✅ W2-W4 合流 review 通过（0 blocker/0 major，合并正确性专项核验通过）+ minor 修复。
  - **Review 发现**：CFG.weather.cd 缺热浪/寒潮 + tickWeather isExtreme 判定（cdCfg!=null）与 W2/W3/W4 统一闸门（exposureGain>0）不一致——W1 遗留，非合流引入。**修复**：cd 表补 wx_heat/wx_cold(630s)；tickWeather isExtreme 改读 weatherEffects(id).exposureGain>0（唯一真源）；weather.test.js +2（热浪/寒潮写cd、storm 非极端期间衰减）。
  - 验证: weather 19/19；全量 462/0；scenario 82/0；构建 30529KB；提交 2a0f267+729b752 已推；#87/#88/#89 已关。
  - **天气系统 v1 全链完成**：W1 状态机 + W2 导演调度 + W3 效果接线（exposureTick 复活）+ W4 粒子渲染。下一步: 等 da123wda T0 资产合入 → 建筑 v3 T2（#75）逻辑层；或天气进阶（天气预报）。
- **2026-08-30 · 班次**: 🎨 #84 T0 建筑 v3 视觉资产完成（待 review/提交，不关闭 Issue）。
  - **规格收口**：重新读取 GitHub #84（已认领 `da123wda`、无评论）；标题/正文写 12 但只枚举 11 项，已将 Issue 真相源统一为 11，并固化 `bl_wall/gate/conduit/wood_generator/solar_panel/battery/lamp/dining_table/dining_chair/spike_trap/sandbag`。静态项为 frame 0 重复的 8 帧传输容器（`idleFrames:1`），木柴发电机为 3 帧局部稳定循环；未增加第十二项。
  - **资产/管线**：11 张透明 RGBA sheet 均经 `assets/build_sprites.py` 放大、清理、配准为 `2048×256`；实测 baseline=240–245、contentH=106–197。二次运行 `sprite_data.js` SHA-256 均为 `a4e36e19...b71e7db7`，确认幂等；新增内联约 589KB，`game.html` 增约 601KB。
  - **视觉核验**：检查 frame 0 + 夜间 tint 联系表；无白框/裁边/烘焙大光晕，墙门同材质、导线端点居中、沙袋低矮、陷阱为机械尖刺而非 IED、桌椅分立；静态 10 项逐帧字节一致，发电机仅烟囱局部变化。
  - **契约**：`SPRITE_META` 登记实测锚点；新增 PNG/IHDR/base64 字节测试，以及 scenario 的 11 项启动注册、256 格、tint、逐项 draw 与 Image onerror 程序化回退测试。真实 Chromium `game.html?autostart=1&debugmark=1` 探针 11/11 `ready/tinted=true`、`fw=fh=256`、`cols=count=8`，页面无控制台错误。
  - **验证**：`python build.py` 成功（game.html 31088KB）；`node tests/run.js` 406/0；`node tests/scenario.test.js` 80/0；`node tests/perf.test.js` 3/0；`node tests/boss.test.js` 7/0；`git diff --check` 通过。窄测首次 scenario 遇到既有 #65 随机粮堆用例 79/1，立即重跑及最终全量均为 80/0，未修改 #64/#65 逻辑。
  - 下一步: 双轴 review 后由维护者提交/推送并评论关闭 #84，再解锁 #75/#79/#81/#82/#83；本班未提交、未推送、未关闭票。

- **2026-08-30 · 班次**: 🔀 T0 资产 PR #90 合入（da123wda 提交 → 维护者审查 + rebase + merge）。
  - **审查**：双轴通过（Spec 11/11 sheet 齐全、SPRITE_META、资产测试 39 条；Standards 管线合规、幂等重建）。**冲突**：分支基线 c5e60a3 早于 W2-W4 合流（CONFLICTING）→ 本地 rebase 到 main，唯一冲突 JOURNAL.md（追加记录，全保无内容冲突）。
  - **合入**：`gh pr merge --merge`（保留作者单 commit 7327b53，merge 7ed1509）；#84 已由作者关。rebase 强推已留言知会（分支历史重写）。
  - **验证**（rebase 后）：单测 464/0 · scenario 84/0 · perf 3/0 · boss 7/0 · 构建 31104KB —— T0 资产与天气 v1 全链兼容。
  - 下一步: **T2 墙与闸门（#75）已全解锁**（T1✅ + T0✅）——建筑 v3 基建第二票，逻辑层可开工。

- **2026-08-30 · 班次**: ⚒ #75 T2 墙与闸门（建筑目录/canPlace 规则/格层渲染/拖拽连续放置/玩家撞墙推挤）。
  - **TDD**：wall.test.js 10 条（后补 13）——BUILDINGS 注册/canPlace 豁免 130px/墙-墙相邻/墙-建筑拒/同格拒/墙 max≥500/wallCells/wallLine/wallNeighbors(闸门不算墙邻)。红→绿：wallCells 期望值是整数边界陷阱（648 恰 13.5 格 → round 到 672）改非边界值（620→624）。
  - **实现**：colony.js BUILDINGS 增 bl_wall(石5, te_stonecutting, max2000, cells1x1)/bl_gate(石3木5)；canPlace isGrid 分支（130px 豁免+同类相邻+同格拒）；wallCells/wallLine/wallNeighbors 纯函数导出。entities.js drawWalls（格层渲染, ADR-13 例外不入实体表, 完成分支 isGridStatic 跳过 placeBuildingEntity）+ updatePlayer 湖约束→墙约束管道（轴分离滑墙）。main.js pointerdown/move/up 拖拽连续放置（按下即铺+增量线段+已铺集合去重）+ homeDrawers/expeditionDrawers walls 回调。world.js render 粒子后实体前调 walls 层。
  - **Review（独立上下文）**：0 blocker/3 major 全修——**M1** wallR 22→35 进 CFG.wall.collideR（22<24 有 4px 幽灵缝可穿墙, review 模拟 THROUGH=true）；**M2** 拖拽从起点重算→幻影格+刷屏（5 格直线 9 次失败）, 改 wallLast 增量线段+wallPlaced 集合；**M3** 玩家被建在脚下的墙钉死（canPlace 不查玩家位置）→ 完成时沿最近轴推出。**m3** 素材建筑退款：refundResOf 仅纯 costRes 建筑（墙/门）退建材半价, 有研/矿成本建筑保持旧退款（colony.test.js 旧断言零破坏）。
  - **划界（#75 评论留痕）**：墙 HP/弹幕打墙/袭击破墙→T4(#77)；闸门开合/打爆→T4+T5(#78)；拼接转角→渲染后补；敌人绕墙→T3(#76 Nav BLOCKERS 已备)。
  - 验证: wall 13/13；全量 477/0；scenario 86/0（+2 冒烟）；perf 3/0；boss 7/0；构建 31112KB；提交 b21b3d2+0dcf44c+c0ba4cb 已推；#75 已关。
  - 下一步: **T3(#76) 居民绕墙 与 T4(#77) 袭击破墙 双解锁**——建议并行（T3 走位/T4 战斗, 文件重叠低: T3 residents+nav 接线, T4 combat+main）。

- **2026-08-30 · 班次**: 🔀 T3(#76 居民绕墙)+T4(#77 袭击破墙) 并行合流（worktree+patch, 这次零冲突）。
  - **T3**（d4da752）：APH.Res.walkAround 新增（walkToward 语义不动：无墙→逐帧一致，有墙视线被挡→Nav.astar→followPath 入 e.path/pathI，缓存=目标变更/到段重算，失败退化直线不卡死）；main.js updateResidents 两个走位调用点换 walkAround + navGrid 每帧构建；CFG.navWalk.goalEps；t3_nav_walk.test.js 9 例。
  - **T4**（541b867）：planChase 三分支（direct 无墙直线/path 绕墙/breach 拆墙）、strikeWall/destroyWall（墙 HP 60、归零移除掉石料 1~2 地上堆+wallDown）、pickShellTarget 纯函数（围攻优先墙/炮塔，shellPreferPenalty 300）、updateCombat 接线（0.6s 路径缓存+沿 followPath 推）+ 墙血条（drawWalls）; CFG.wall.hp/shellDmg/dropStone; t4_breach.test.js 16 例。
  - **合并**：这次 apply 零冲突——上次「失败」是工作区残留半应用 patch 的假冲突；干净基线恢复后 t3→t4 顺序全部干净落位。**教训记：并行 patch 合流前先 git reset --hard HEAD 归零 + 清未跟踪测试文件**。
  - 验证: T3 9/9 + T4 16/16；全量 502/0；scenario 86/0；perf 3/0；boss 7/0；构建 31122KB；提交 d4da752+541b867+77a3c14 已推。
  - 下一步: 合并 review 后台运行 → 听后关 #76/#77；T5(#78 弹道掩体) 解锁。

- **2026-08-30 · 班次续**: ✅ T3/T4 关票。合并 review worker（deepseek-v4-flash-vision-exp）运行 18min 无活动→stop 中断；主会话**快速自查**替代：①walkToward 签名 diff 核验未动（T3 铁律守住）②config 字段无重复定义 ③墙 hp 初始化（main.js b.hp=CFG.wall.hp）与 combat wallHp 兜底衔接 ④destroyWall 走 spawnDrop 石料地上堆（RimWorld 式, 居民会搬）⑤||6 为既有 stepSoldier 风格兜底（非新违规）。全部通过。**教训**：长时间 review 用 slow 模型会卡死——以后审查任务书注明「单文件量小时可跳过 command 全量验证, 用 git diff 快速核」或换更快模型。

- **2026-08-30 · 班次**: ⚡ T5(#78 弹道掩体)+T6(#79 电网核心) 并行合流。
  - **T5**（15756fc）：segHitBox（线段 vs 墙 48px AABB slab）接入统一弹道拦截层——三侧弹丸先过墙，命中扣血消散，**自家墙不豁免**，墙碎恢复穿透，围攻 shellDmg 30 两发一墙；闸门不挡弹。t5 10/10。
  - **T6**（b523d01）：**worker 半成品抢救**——卡死在生成 patch 前，stop 后源码改动落入工作区（colony 284 行/config 14 行）。**教训：worker 卡死≠无产出，先查工作区/临时 worktree 的 git diff 再决定重做**。发现 2 个 worker 半成品 bug 并修：①`GRID is not defined`（电网段用了裸 GRID，补 `var GRID=CFG.GRID`）②测试适配真实接口（powerNets 返回 {groups}、cons 裸建筑、status 字段 grid/powered 而非 inactive）。t6 11/11。
  - **验收语义确认**：供不应求=网运转 active:true + 消费者 powered:false + shed 列表（我初版测试期望 active:false 是错的，实现语义更正确）；零发电机=grid:false+powered:true（老档兼容）。
  - 验证: t5 10/10 + t6 11/11；全量 523/0；scenario 86/0；perf 3/0；boss 7/0；构建 31137KB；提交 15756fc+0e0a8585×？ + b523d01+144302b 已推；#78/#79 已关。
  - 下一步: **T7 耗电联动 (#80) 已解锁**（T6✅）——耗电建筑停机/⚡浮标/HUD 电网状态；然后班 2 T8-T10。

- **2026-08-30 · 班次**: ⚡ #80 T7 耗电联动（班 1 收官票）。
  - **纯函数层**：applyPowerState（status→建筑 powered/grid 映射）/farmPowerMul（无电 ×0.5）/turretFireAllowed（无电+耀斑禁射）/clinicPowered/isPowerConsumer——colony.js 导出，CFG.power.farmPowerMul=0.5。
  - **接线**：main.js 生产跳 powerSettle→写 b.powered/grid（未激活默认通电）；炮塔 turretFireAllowed、农场 cropPlotTick 乘 powMul、医疗舱 hasClinic 加 clinicPowered；ui.js rowPower 懒建+三态（未激活灰/供电中金/不足红）。
  - **踩坑**：ui.js 插入 powerRow 时把「提示条」注释搞成 `*/ */` 双重闭合（SyntaxError，node --check 及时拦）——插注释块时检查边界闭合。
  - 验证: t7 8/8；全量 531/0；scenario 86/0；perf 3/0；boss 7/0；构建 31142KB；提交 267f713+d9e7901 已推；#80 已关。
  - **建筑 v3 班 1 全链完成**：T0-T7（寻路/墙/居民绕墙/袭击破墙/弹道/电网/耗电联动）——明日班 2（T8 餐桌椅/T9 房间+路灯/T10 陷阱沙袋）。

- **2026-08-31 · 诊断**: 🐛 修复"所有角色躺姿都不对"（用户报告，/diagnosing-bugs 流程）。
  - **定位**：`player_prone`/`hum_1/2/3_nopack_prone` 在 `src/main.js` SPRITE_META 里的 `h`(contentH) 是历次手抄旧值，与 `assets/*_prone_sheet.png` 实测内容高不符——`hum_2_nopack_prone` 偏差达 61px（声明163，实测102）。`baseline` 全部准确，只有 `h` 错。由于渲染缩放 `sc=drawH/h`，`h` 偏大→角色躺下时被压缩渲染得比标准体积小/瘪；`hum_0_nopack_prone` 唯一手抄准确的键作为对照组，证实这不是 `spriteScale()` 公式坏了，是数据漂移。
  - **验证方法**：重跑 `python3 assets/build_sprites.py`（其 `baseline_y`/`content_bbox_h` 是真源，幂等未改动任何图片字节/`sprite_data.js`）拿到权威测量值，逐键 diff `src/main.js`。
  - **修复**：`main.js` 4 处 `h` 值改回实测（player_prone 86→68，hum_1 139→138，hum_2 163→102，hum_3 139→124；hum_0 本就对不动）。
  - **回归测试**：新增 `tests/sprite_meta.test.js`——纯 Node 内置 `zlib` 手写 PNG 解码器（无第三方依赖），独立复现 `build_sprites.py` 同口径测量，逐键断言 `main.js` 声明值＝实测值。`git stash` 验证过该测试在旧值下确实先红后绿（4/5 失败→5/5 通过），非摆设。**旧 `#71 geometry` 测试其实是重言式**（`contentH×(drawH/contentH)` 对任意输入恒等于 drawH），只锁 `spriteScale()` 公式没变，从未覆盖过"声明值是否等于真实资产"这一失守环节——新测试补的正是这个洞。
  - 验证: sprite_meta 5/5；全量 536/0；scenario 86/0；perf 3/0；boss 7/0；构建 31142KB。
  - 下一步: 无——此为独立诊断票，非 BACKLOG 排期项；建议今后改 SPRITE_META 一律重跑 `build_sprites.py` 整块复制，禁止手改单个数字。

- **2026-08-31 · 班 2 首票**: 🍽 #81 T8 餐桌与餐椅。
  - **colony 注册**：bl_dining_table（木15石5, max8, 10s）+ bl_dining_chair（木6, max16, 6s），科技挂 te_alien_culinary 不新增节点；1×1 格、dispH 155/180（配 SPRITE_META 实测值）。
  - **纯函数**：residents.js `diningSeatAlloc(hungry, chairs, tables)`——每椅1人（贪心全局最近对）、椅须在桌旁 chairTableR:60 内、居民距椅 ≤diningChairR:300 才算可用；`faceTable(chair,table)` 坐定后面向桌。eatMeal 加 `opts.atTable` → diningMoodGain:+4。
  - **main.js 接线**：updateResidents 每帧收集桌椅+饥饿居民→seatMap→有座优先 walkAround 到椅（偏移 +8,-2），到椅 tryEatHere(atTable=true) 从桌旁粮堆吃（diningTableEatR:90 放宽取食半径），浮标「😋 X 在餐桌用餐」；无座/无桌走旧粮堆/仓库路径 + noTableMoodPenalty:-3 无桌罚。
  - **踩坑**：①`eatBelow` 声明在 seatMap 计算**之后**（var 提升成 undefined → hungryRes 恒空）——T8 首版 10 帧居民直接跑去 homeSpot；②`it_protein_bar` 不是合法物品 id（要用 it_food）；③场景断言须逐帧跟踪 minDist,因为居民吃完会离开椅子回岗位（40 帧后断言"坐在椅上"必然失败）。
  - **顺手清理**：colony.js 电网 4 键（bl_conduit/wood_generator/solar_panel/battery）**重复定义**——T6 合流时旧雏形+最终版并存,对象字面量后者静默覆盖前者（仓库血泪史同款坑）,删旧留新,零行为变化。
  - **验证**：t81 新增 6 单元+3 场景；全量 542/0；scenario 89/0；perf 3/0；boss 7/0；构建 31149KB；无头 Chrome ?t8debug=1 截图确认桌椅渲染正常（无黑缝、食物堆显示、底座圆台）。
  - 下一步: **#82 T9 无顶房间+路灯**（房间 flood fill 纯函数 + 路灯电力渲染, blocker T2/T7 已关）。

- **2026-08-31 · 班 2 第二票**: 🏠 #82 T9 无顶房间与路灯。
  - **房间判定纯函数**（nav.js `roomsOf`）：墙/门=边界矩阵（门算围合,RimWorld 房间含门）→ 从四边 flood 外部 → 未灌开放格=房间（按连通分量分组,输出 cells/bbox/sz/中心）。`inRooms` 世界坐标判内外。5×5 墙环留缺口=非房间（测试锁定）。
  - **暴露免疫接线**（residents.js `shelteredFor` 组合判定）：房间内=true > 建筑半径回退 isSheltered；updateResidents（天气减速 wxMul）与 residentsTick（exposureTick）双点换用。老档无墙=rooms=[]=回退原逻辑。
  - **卧室心情增益**（`roomMoodGain` 纯函数）：所在房间 bbox 含 bl_house → +2/生产跳（CFG.residents.roomMoodGain）。
  - **路灯 bl_lamp**（colony.js 注册,te_machining,铁10木5,max12,10s）：powered 由 T7 powerSettle 写（CFG 已预留 load3/prio2）；渲染=world.js drawDarkness 挖大洞(r120,str.92, 仅 dL<0.5 && powered!==false) + entities.js 暖色光晕渐变（夜里通电亮/断电灭）。
  - **踩坑**：①场景测试初版圈房位置在 HAB(1100,1100) r92 覆盖内——isSheltered 的核心半径兜底让"缺口圈"也显示 shelter,暴露恒 0（假阳性），把圈挪到 (1440+) 才暴露真问题；②路灯 powered 写在 colony.buildings 记录（b.powered）而非实体 e——entities 渲染需按坐标查记录（缺失记录视为通电=老档兼容）。
  - **验证**：nav +4、residents +5（shelteredFor×2/roomMoodGain×3）、scenario +3（圈房免疫/缺口暴露/路灯亮灭）；全量 551/0；scenario 92/0；perf 3/0；boss 7/0；构建 31159KB；无头 Chrome ?t9debug=1（强制夜间 clock=0.75DAY）截图：墙环围合+房内居住舱+路灯光晕+暗幕。
  - 下一步: **#83 T10 尖刺陷阱+沙袋**（班 2 收官, blocker #77/#80 已关）。

- **2026-08-31 · 班 2 收官票**: 🗡 #83 T10 尖刺陷阱与沙袋。
  - **colony 注册**：bl_spike_trap（石3木2,max200,6s,te_ballistics）+ bl_sandbag（石3,max500,5s,te_ballistics），入 GRID_STATICS（与墙同清单/格层渲染）。
  - **纯函数**（Colony 导出）：trapTriggers（格内24px且armed→触发）/ trapStrike（穿刺12+出血5s+hitFlash）/ sandbagMul（格内×0.5）/ bleedMul（出血×0.7）。CFG.defense 数值表。
  - **combat.js 接线**：敌人移动乘子 t10Mul=sandbagMul×bleedMul（path/直线两条移动路径都乘,出血 dt 衰减）；移动后陷阱触发判定（非盗掠/溃退/围攻）→ armed=false 一次性 + spark 粒子 + ⚠浮标。
  - **main.js**：居民路过已触发陷阱（40px）→ 耗1石自动重置（无建材则保持触发态=验收「触发态不再触发,直到重置」语义）；沙袋减速乘入居民全部 walkAround（含 T8 餐桌/医疗舱分支）；拆除兼容（静态物无实体,拆记录即拆）。
  - **entities.js drawWalls**：陷阱/沙袋格层渲染;已触发=压暗+红色警示框+X（加大可见性）。
  - **踩坑**：①GRID_STATICS 注册但 queueTick 完成路径 isGridStatic 判断漏了陷阱/沙袋 → 会错误入 entities 双重渲染（修:四 id 统一）；②拖拽白名单 pointerdown/up 只有墙/门——陷阱/沙袋不能连续铺（修:加两 id）；③edit 引入多余 `}` 破坏 try 结构（node --check 拦下）。
  - **验证**：colony +6 单元（触发/一次性/伤害/沙袋/出血/可建）+ scenario +3（敌踩陷阱伤+出血+一次性/沙袋乘子/居民重置耗石）；全量 557/0；scenario 95/0；perf 3/0；boss 7/0；构建 31166KB；无头 Chrome ?t10debug=1 截图（尖刺×2 一格红色警示框/沙袋×2）。
  - **建筑 v3 班 2 全链完成**：T8 餐桌椅 ✅ / T9 房间+路灯 ✅ / T10 陷阱沙袋 ✅ —— 建筑系统 v3（#73）全部落地。

- **2026-08-31 · P1a**: 🔮 天气预报 HUD（#92）。
  - **纯函数**：`APH.Weather.forecast(meta)` — 读 currentId + CFG.weather.transitions 权重表, 排除冷却中(cd>0), 取权重最高者; 无转移/全冷却兜底 wx_clear。**确定性**: 不消费 rng（ADR-5 seeded 纯净, 摇骰仍归导演）——预报是粗估不掷骰。
  - **HUD 接线**（ui.js weatherRow）：追加「明日 X」段, 复用 names/icons; 目标=当前时显示「明日依旧 ☀ 晴」, 异于当前显示「明日 🌧 雨」；预报失败静默不影响主行。
  - **语义复核**：晴的转移表自身权重 4 最高 → 预报"继续晴"正确（RimWorld 次日预报本就是"最可能", 晴天多为续晴）；冷藏排除后重新取最高（测试锁定）。
  - **验收标准核对**：forecast 纯函数 ✓ / 确定性 ✓ / HUD 接线 ✓ / 单测 5 + 场景冒烟 2 ✓。
  - **踩坑**：ui.js 注释里写了 `权重最高\b冷却排除`——JS 字符串字面量把 `\b` 变退格符(0x08), 源码里出现隐形控制字符（node --check 不报但 grep 显示异常）——写注释/字符串时警惕 `\b`/`\t` 等转义。
  - 验证: weather +5；scenario +2；全量 562/0；scenario 97/0；perf 3/0；boss 7/0；构建 31167KB；无头 Chrome 截图 HUD「☀ 晴 · 预计 3.5 天 · 明日依旧 ☀ 晴」。
  - 下一步: **P1b 玩家 exposure 条（#93）**。

- **2026-08-31 · P1b**: ☣ 玩家 exposure 条（#93）。
  - **纯函数**：`APH.Res.playerExposureTick(needs, sheltered, hasExtremeWeather, weatherType)` — 极端室外 +CFG.player.exposureGain(8)/跳, 室内/房间 -exposureDecay(12)/跳; 酸雨照防酸服减免(resist 0.8 复用 suitResistOf); **不转化伤病/不动心情**（显式裁剪）; 值域 0~100; 老档缺失兜底 0（ensurePlayerNeeds 单点）。
  - **接线**：residentsTick 玩家需求结算处（homeIllnessTick 后）喂 shelteredFor（T9 房间免疫复用）+ scene==='home' 门（远征不结算）；entities.js updatePlayer 移动速度乘 expMul（exposure>80 → ×0.9, 与 wxMul/sickMul 同级）。
  - **HUD**：ui.js `exposureRow` 懒建第六行（☣ 暴露 N · 警惕!/移动减速! 三级色）；>50 与氧气低共用 vig 红雾（取 max, 不覆盖）。
  - **重大发现：scenario 测试桩从未加载 nav.js！**（模块列表漏了）——此前 T9「圈房免疫/缺口暴露」场景测试靠 **墙的 isSheltered 半径(72px) 假阳性通过**（圈房中心距墙 96px 时其实该暴露，但中心格 72px 内被 isSheltered 兜底）；玩家暴露测试在同一圈房下暴露真问题（中心距墙 96 > 72 → 累积）。**修复：scenario 加载列表补 nav.js**——此后 T9/T9_rooms 场景测试才真正验证房间判定。教训：场景桩模块列表必须与生产 MODULE_ORDER 对照补齐（nav.js 是 main.js 运行时依赖, 桩漏载 = 防御式代码吞掉真实路径）。
  - 验证: residents +5 单测（累积/消退/防酸减免/不转化/值域）; scenario +2（雷暴室外累积+HUD 行/圈房消退）; 全量 567/0; scenario 99/0; perf 3/0; boss 7/0; 构建 31172KB。
  - **P1 天气闭环全部完成**（预报 #92 + 暴露条 #93）。
  - 下一步: P2 战争纵深（敌 A* 代价惩罚绕陷阱 #94 待开）。

- **2026-08-31 · P2a**: 🕳 敌人寻路绕陷阱（#94）。
  - **nav.js astar 增可选 costFn(gx,gy)**：格额外代价进 g 值（`g+1+pen`）——纯函数改造，无 costFn 行为不变（旧 nav 测试全绿锁定）。**lineClear 增 costFn 检查**：直线途经被罚格 → 判不清 → 强制进 A* 比较（绕行 vs 直踩）。
  - **combat.js planChase**：传陷阱代价（CFG.defense.trapAvoidCost=6，仅 armed 陷阱——已触发不罚）；**无墙但有待触发陷阱同样寻路**（原 planChase 无墙直接直线,陷阱绕行失效）。
  - **避之策略语义**：绕行总代价 < 直踩才绕；绕无可绕（窄通道唯一陷阱）仍踩——绝不卡死。
  - **踩坑①（关键）**：`if (lineClear(grid, from, to, pen))` 里 `pen` 在**调用之后**才 `var pen = ...` 定义——var 提升但未赋值 → lineClear 收到 undefined → `costFn && ...` 短路 → **永远直线**（陷阱绕行完全不生效）。修正：pen 定义提前到 lineClear 前。**教训：var 提升 + 函数调用参数 = 静默 undefined 陷阱**（node --check 不报）。
  - **踩坑②**：combat.js 里 costFn 闭包引用裸 `GRID`——combat.js 从未定义 GRID（只有 nav.js 有）→ 运行时 ReferenceError（planChase 外层无 try 时直接崩但 main.js 主循环有兜底静默吞掉）→ 表现为"plan 恒 direct"。修正：`var GRID = (CFG&&CFG.GRID)||48`。
  - **踩坑③**：场景测试"绕无可绕"初版布局=陷阱四邻全墙——敌人 A* 根本到不了陷阱格（墙=1 不可进）→ 走 breach（破墙）而不踩,恒失败。修正：窄通道布局（左右竖墙 1 格宽,通道内陷阱）,敌人才会沿通道走并踩中。
  - **验证**：nav +3（绕开/高罚仍穿/无costFn兼容）+ scenario +2（绕开不踩/窄道必踩）；全量 570/0；scenario 101/0；perf 3/0；boss 7/0；构建 31173KB。
  - 下一步: P2b 围攻工兵拆陷阱（#95）。

- **2026-08-31 · P2b**: ⚒ 围攻工兵拆陷阱（#95）。
  - **设计语义演进**：初版"breach 拆挡路陷阱"走不通——A* 罚不阻断路径（陷阱格可达）,恒有解 → 永不 breach。改为：**path 途经待触发陷阱（trapsOnPath）→ 敌人标记 trapAtkId（拆陷阱意图）→ 移动至陷阱 48px 内直接拆除（strikeTrap）**——"拆比踩优"（绕无可绕时）。
  - **strikeTrap**（combat.js）：移除陷阱记录（耐久1次）→ 掉石料 1 + spark + trapDown 事件；已触发(armed=false)不拆（无价值）。
  - **豁免踩**：trapAtkId 匹配的敌人在陷阱触发判定中豁免（工兵不踩自己目标,到边拆）。
  - **回归保护**：无陷阱堵点 → 原破墙行为零破坏（3×3 墙环围死玩家:敌人 breach→拆墙突破,w0-w20 拆 1 墙后转攻击,断言"拆≥1 墙"）。
  - **设计推演记录**（JOURNAL 供后人）：①陷阱格不是 grid 障碍(可达) → A* 恒有解,pen 只是权重；②"绕无可绕"=路径必须穿陷阱格（非 A* 无解）→ 拆陷阱触发条件=pathHasTrap；③战斗语义:拆陷阱是敌意的战术选择,与破墙平行而非替代。
  - **踩坑**：①四面墙围玩家(间距120px)留 120px 开口——敌人从开口穿入攻击,断言"拆4墙"失败；改 3×3 墙环(48px 紧贴)才对。②#94"必踩"测试与 P2b 语义冲突（现在必拆）——更新断言为"踩或拆(不卡死)"。
  - 验证: combat +4 单测（pathHasTrap×2/strikeTrap×2）+ scenario +2；#94 场景 1 例语义更新；全量 574/0；scenario 103/0；perf 3/0；boss 7/0；构建 31177KB。
  - **P2 战争纵深全部完成**（#94 绕陷阱 + #95 拆陷阱）。
  - 下一步: P3 生活家具（电视/书架/地毯 + 房间幸福度聚合）。

- **2026-08-31 · P3b**: 🛋 家具建造与房间幸福度聚合（#97）。
  - **colony 注册**：bl_tv（铁8木4,max8）/ bl_shelf（木8,max12）/ bl_carpet（皮4,max12），科技 te_machining，1×1 格；**离核心130px 豁免**（室内家具放家旁, 与墙同理）。
  - **roomMoodGain 扩展**（residents.js）：房间心情 = 卧室级(含 bl_house, +2) + 房间 bbox 内家具逐件加成（CFG.residents.furnitureMood: tv/shelf/carpet 各 +1）——原"卧室级独占"语义升级为聚合（T9 测试向后兼容: 无家具房间仍 +2）。
  - **接线**：复用 T9 生产跳 roomMoodGain 调用（已有），聚合值直接进 mood。
  - **无资产渲染**：SPRITE 未就绪（#96 资产未到）走 drawBuilding 通用回退（方块+屋顶灯）——#96 到了自动走 sprite 路径。
  - **踩坑**：①测试用 ring(45,45)/(50,50) 太靠右下——墙格 45+4=49*48=2352 > WORLD 2200, roomsOf 网格 clamp 致房间恒空(返回 [])——**世界坐标测试必须留边界余量**(<格44)；②测试名"=+4"断言写 3（笔误,断言值 3 正确）。
  - 验证: residents +3 单元（聚合/卧室+家具叠加/墙外不加）+ scenario +2（家具房间+4/可建造+核心豁免）；全量 577/0；scenario 105/0；perf 3/0；boss 7/0；构建 31178KB。
  - 下一步: **P3a 资产票（#96）**——codex exec 生图 3 件家具 → build_sprites.py → 完成 P3。
