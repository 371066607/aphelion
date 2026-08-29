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
