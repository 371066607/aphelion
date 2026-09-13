# ADR-48: 地图由观测从群系砖表产生

已通过（Accepted）· 2026-09-13

远征「每次的地图」不是摄像机看见才变成地，也不是每出发重铺一张。它是对一颗星的**第一次着陆观测**：从该星的群系砖表里选出一张确定的复合格网，写入 `planet_<id>`，再登陆读旧图。家园是第五张群系（迫降点），新档迫降观测一次后写入殖民地存档。游戏词表里的「坍缩」只留给累塌。

## 没采用的

- **格子未看见就处于叠加，走进去才变成地。** 寻路、生态、存档都需要地在观测之后是经典的。
- **每次出发重铺格网。** 图鉴再登陆会变成换皮抽卡；信标坐标对不上岸线。
- **只有远征走砖表。** 家和远征共用观测这一种测量，表不同。
- **湖是必有地标。** 水是砖；家和远征都可以没湖，无湖则岸砖权重为 0、酸化法则本局熄火。
- **图鉴发射。** 选星是出发面板的事；图鉴只读。
- **观测失败就改群系或无限回溯。** 与 LLM 富化同一姿态：子种子有限重试，再失败则可复现降级到现有生成。

## 决策

**观测是测量。群系砖表是生态的物理。格网是测量结果，随家园或星球持久。**

| 有的 | 没有的 |
|---|---|
| 五种群系、五张砖表（四张远征 + 迫降点） | 一颗星一张邻接表 |
| 观测格 = 一个 Ground Tile + 可选初局自然资源 | 树矿覆盖地面、建筑占地或划区当砖 |
| 砍光后同格同种再生 | 再生时重跑观测 |
| 家园新档观测一次；旧档不跑 | 读档重铺家 |
| 未知新星着陆才抽群系并第一次观测 | 不选星就发射 |
| 出发面板选已知星或未知新星 | 图鉴里起飞 |
| 求解器失败则降级 | 失败改群系、卡在着陆 |

迫降点 Ground Tile 沿用 landing / woodland / lakeshore / ridge / alien / wreckage。HAB 20×20 核心只钉 `landing` 地面；第一夜木石环是同次观测的资源占用 pin，不参与地面邻接，也不覆盖核心地面。

「每次的地图」= 每颗星的第一次观测，不是每走一格，也不是每次出发。

## 与已有 ADR

- ADR-1：PlanetSpec 只增字段（格网）；不改现有 biome / 信标 / 法则。
- ADR-2：星球格网走 `planet_<id>`；家园格网走殖民地存档。迁移只经 save。
- ADR-5：观测用 seeded RNG；同 seed 同图；降级路径也必须可复现。
- ADR-9：群系继续 `biome_`。第五张是迫降点，不是六个家园分区六个群系。
- ADR-16：家园仍是末舰迫降点；观测发生在新档迫降，不把家变成另一颗远征星。
- ADR-35：远征仍是补给副本；持久的是那颗星的地，不是把家搬到星上。

## 2026-09-14 修订：复合观测格与统一查询缝（#198）

原文“一格一种，砖是地面或初局自然实体”会让 300–500px 木石环覆盖 20×20 `landing` 核心；默认 pins 因此与邻接约束矛盾，正常家园只能走 degraded。修订后，格网保存两个由同一次 Observation 决定的部分：

- `ground` 是稳定的行优先 Ground Tile；唯一决定水体、通行、移动代价、肥力与建设能力。
- `resources` 是可选的初局自然资源占用物；只决定资源种类、位置和产物语义，不改写 ground。
- `APH.Observe.observe` 是纯 seeded 观测入口，接受尺寸、群系、ground pins、resource pins 和可注入 fallback；有限重试后返回 `degraded:true`，不改群系、不阻塞落地。
- `APH.TerrainModel` 是运行系统的唯一地形查询缝。它兼容新的行优先 observation、已合入版本的二维 `observation.grid`、未观测 generation 1，以及不读取 Observation 的 generation 0。
- 水格为零时不保留无来源的 lakeshore。湖仍不是保证存在的地标。

Observation 的持久化版本从 `v: 1` 开始，归属家园或某颗星球的场景描述；只在该场景第一次观测时创建。`v`、`widthCells`、`heightCells`、`biomeId`、`degraded`、行优先 `ground` 与 `resources` 是 v1 字段。每条 resource 至少包含 `gx`、`gy`、`kind`、`yieldItemId` 和 `amount`；同格最多一条，越界、未知种类或与 Ground Tile 不兼容的记录不进入结果。版本演进只增字段，持久化迁移仍统一走 `save.js`。

资源产物由 `CFG.observe.resourceSemantics` 定义；调用方传入的产物 ID 或数量不能覆盖这张表。每张群系砖表的 `resourceGround` 再声明该资源允许占用哪些 Ground Tile。求解时 resource pin 会限制所在格的地面候选，但不会把资源种类写进 `ground`。Ground pin 与 fallback 输出都要经过当前群系砖表校验；非法约束进入确定性 degraded 路径，表外地面不会写进 Observation。未知群系 ID 原样保留并进入确定性 degraded 路径，`Observe` 不修改全局配置或把它伪装成迫降点群系。Observed 场景也不再从 `landmarks` 补一座固定圆湖；水体只来自 `ground`。

本修订先做 expand：新旧路径并存，后续票逐个迁移存档、渲染、碰撞、寻路、肥力、生态与总览；所有消费者迁完前不删除 legacy 分支。

## 2026-09-14 修订：家园首次观测与保守迁移（#199）

殖民地存档 envelope 升至 `v:3`，PlanetSpec 仍为 `v:1`。全新家园由 `TerrainModel.newHome(seed)` 在创建时完成一次 Observation；`Save.loadColony` 把完整地面、自然资源与当时的 `metaSnapshot` 作为同一份殖民地 JSON 立即写入，因此开场仍处于 `intro` 时地图已经稳定，进入 `running` 不再触发观测。

两类旧档分开处理：

- generation 0 的 2200×2200 家园只升级 envelope，不添加 Observation，继续使用原边界、湖泊、地形与实体规则。
- 缺少 Observation 的 generation 1 家园经 `save.js` 唯一迁移入口，把旧确定性 `cellAt` 与 `resources` 的结果完整快照一次；建筑坐标、占地版本与旋转不参与重算。后续读取只认已保存的 Observation，不再重复快照。

迁移先在内存生成完整 Observation，再把字段挂到解析出的殖民地对象，并以一次完整 JSON 写入持久层。若 `localStorage` 拒绝写入，原持久化 JSON 保持原样，完整 v3 对象留在会话内存覆盖层；本次会话继续读同一快照，后续写入恢复时可整份落盘。这个兜底避免半张地图，但浏览器存储始终不可用时仍只能保证当前会话。

Observation 按“只增字段”演进：未来 `v>=1` 只要仍含 v1 的完整行优先地面，就由旧构建读取已知字段并原样保留未知字段；若未来版本缺少旧构建可读取的基础字段，则明确拒绝且不改写，不能降级重算成 v1。新家园的特殊资源仍从 `CFG.observe.resourceSemantics` 取产物和数量；例如核心残骸使用表内 `homeCore` 变体。运行时 traits 不能覆盖 `yieldItemId`、`amount` 或修复语义。

## 2026-09-14 修订：家园单一事实源（#200）

已观测场景不再信任 envelope 中可能陈旧的像素尺寸；正式宽高由 Observation 的格数乘场景 grid 得出。`TerrainModel.cellAt` 是每格地表语义的唯一入口，并返回原 tile、归一 region、水/岸标记、显示颜色、通行、建设、肥力和移动代价。

- `World` 的地形块和 `MapUI` 总览使用同一个 `regionColor`；generation 1 的水格已在地形块内绘制，因此不会再叠加旧固定圆湖。零水 Observation 既没有可见圆湖，也没有圆湖碰撞。
- 相机、建筑占格与玩家候选位置都按 Observation 边界截断，玩家再以 `cellAt.walkable` 做轴分离碰撞。A* 用同一 Observation 格数建矩阵，每格的阻挡和代价分别对应 `walkable` 与 `moveCost`；越界目标直接不可达，不能钳到边缘后再追加原始坐标。
- 正式种植区从 `fertilityMultiplier` 保存格肥力；动物只在 `cellAt` 判定的 woodland/ridge 栖息，居民的娱乐与崩溃游荡、家畜移动都消费同一份 A* 地形格。observed 场景即使全图无障碍也不能绕开 A* 边界检查；野生动物只由 Ecology 推进一步。矩形 Observation 的世界渲染分别按宽高计算区块数量。
- generation 1 家园的自然对象只由 `TerrainModel.resources` 把 Observation `resources` 实体化；旧的 22 组随机岩石只保留给 generation 0。恢复旧 homeRuntime 时移除历史 `rock`/`crystal` 覆盖物并立即写回干净快照，Observation 对应的 `flora` 不受影响。

Observation 在运行时按不可变快照使用。世界块、总览和导航缓存把 Observation 对象 revision 纳入键；生成、迁移或恢复若要换图，必须替换整个 Observation 对象，不能原地改 `ground` 或 `resources`。为保持显式依赖顺序，`TerrainModel` 先于 `BuildGrid` 加载。generation 0 不进入上述分支，继续保留 2200×2200、固定圆湖与旧实体散布；描述中即使残留 Observation 也不能改变旧边界。

## 2026-09-14 修订：未知目的地远征事务（#201）

`APH.Atlas` 是 `meta.atlas` 的纯数据索引，结构为 `{v, order, planets}`。每个条目只保存 `planetId`、32 位 `seed`、名称、调色板名、群系 ID、首次发现时间和访问次数；完整 PlanetSpec 仍由 `planet_<id>` 保存。这样规划器可以列目的地而不复制地图，后续 #202 重访时再按 ID 读取同一 PlanetSpec。新发现使用 `P` 加八位大写十六进制 seed，避免旧低 12 位算法的碰撞；历史短 ID 仍是合法持久身份，不做迁移改名。

未知选项是意图而不是 PlanetSpec。打开或浏览原生 `<select>` 只读状态；点击出发或在非下拉控件上按 Enter 后，`main.js` 才选择 seed、调用 `Planet.newObservedPlanet` 并校验 Observation。着陆点周围固定半径的格子作为可走地面约束参与同一次观测，因此返回舱和远征队不会落在水格。普通入口的 seed 避开 Atlas 与已有 PlanetSpec，`?exp=1` 和调试 E 键使用配置中的固定 seed，但仍经过完全相同的事务。

保存顺序是一条显式提交边界：

1. 在副本中生成下一份 Atlas、PlanetSpec 和殖民地 `metaSnapshot`，并完成迁移与 JSON 序列化。
2. 写入 `planet_<id>`、`meta` 和存在时的殖民地快照；任一普通写失败便按相反顺序恢复各 key 的原始 JSON 字节，第三步失败也必须撤回前两步。
3. 全部写成功后才替换运行中 `meta.atlas`；再由 `ExpeditionState.begin` 扣粮、转移名册和建立 Active Run。

事务准备和失败分支都不 checkpoint 当前家园或双世界容器，因此保存拒绝时内存中的 `meta`、colony、homeRuntime、ground 与 activeWorld 也保持原样。未来版本的 PlanetSpec 或 Atlas 会被明确拒绝，不能被旧构建降级；当前版本条目合并时保留未知顶层字段。`localStorage` 没有跨 key 原子提交，因此进程在两次 `setItem` 之间被强制终止时仍可能留下孤立 PlanetSpec。这个孤立条目没有 Atlas 引用，且保存发生在补给扣除和 Active Run 之前；它不会伪造一次已经出发的远征。可捕获的配额、序列化和未来存档错误都返回 `persistence-failed`，调用方继续停在家园。

Active Run 的 `destination` 必须是已解析 `{kind:'planet', planetId, seed}`，会随 snapshot、restore 和返航回执保存。WorldRuntime 只恢复同时满足以下条件的远征容器：scene 为 expedition、实体数组存在、spec 的 ID/seed 与 destination 一致、descriptor 明确为 generation 1 expedition，且两份 Observation 都与持久 PlanetSpec 相同。恢复层会完整校验持久 PlanetSpec 的地形、调色板和敌人运行结构，再以持久 spec 和由它派生的 descriptor 覆盖 runtime 镜像；runtime 镜像缺字段不会制造半颗星，持久档自身损坏则不安装。无目的地、身份或 Observation 不一致的旧/损坏 run 会沿幂等返航路径回收队员与已有货物。

`main.js` 只编排发现保存、状态机提交、WorldRuntime 切换和异步文案富化。旧结算页直接创建 generation 0 星球的 `buildWorld/newPlanet` 路径已删除。AI 返回时沿用原 ID、seed 和 Observation，并在重写展示文案前先 checkpoint 当前 runtime，避免晚到的响应覆盖远征进度。远征地面、边界、敌人落点和酸性水域均查询 `TerrainModel`；岩石、水晶、植物、矿点和遗迹目前仍由既有生成器补入实体列表，#203 将把这些覆盖物收口到 Observation。
