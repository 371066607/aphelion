# 地图观测修复与当前殖民地 WIP 整合计划

## 目标

用户要求检查今天的地图生成改造，并明确表示“我认为你得修复”。本计划把已经确认的问题转成可执行的修复工作，使一次地图观测真正决定地面、资源、通行、渲染、生产和存档，并把它接入当前尚未提交的殖民地/双世界 WIP。

本轮按 `scout-to-plan` 工作流只形成计划，不修改游戏实现、不运行构建和测试。实施阶段的完成标准仍是：源码修复、生成 `game.html`、全部自动化验证通过，并单独完成新档的可视化人工验收。

## 当前基线与保护范围

### Git 基线

- 当前分支：`main`
- 本地 HEAD：`136a097170dc9867c77dc5d7fe4cf0f66c151181`
- `origin/main`：`914501befb7b086beba5c4abe94bb07a79de2cdd`
- 本地相对远端落后 7 个提交。远端地图改造由 `#192`、`#193`、`#194`、`#195` 和 PR `#196` 汇总，相关提交包括 `72bcfcc`、`a655494`、`1988596`、`56927a8`、`d78edea`、`f6be39a`、`914501b`。
- 当前工作树包含规模较大的未提交 WIP。远端 PR `#196` 基于旧的单世界实现，和本地双世界、场景、地形、远征状态等 WIP 有职责重叠，不能直接 `git pull`、merge 或整体 cherry-pick。
- `origin/wip/pi-w3-leftover` 是天气 WIP，不属于本次地图修复。

### 开始勘察前已经存在的改动

这些改动都视为用户现有工作，实施时必须保留，不能用 `reset --hard`、`clean`、checkout 覆盖或批量回退。

已修改的跟踪文件：

```text
BACKLOG.md
CONTEXT.md
DESIGN.md
JOURNAL.md
build.py
docs/rimworld-full-alignment-plan.md
game.html
src/colony.js
src/colonytick.js
src/combat.js
src/config.js
src/draw.js
src/entities.js
src/events.js
src/main.js
src/nav.js
src/planet.js
src/residents.js
src/save.js
src/ui.js
src/visitors.js
src/world.js
tests/boss.test.js
tests/colony.test.js
tests/colony_subsystem.test.js
tests/cooking.test.js
tests/core.test.js
tests/layering.test.js
tests/p2.test.js
tests/perf.test.js
tests/run.js
tests/scenario.test.js
tests/t3_nav_walk.test.js
tests/ui_modals.test.js
tests/wall.test.js
```

未跟踪的实现模块：

```text
src/build_grid.js
src/camera.js
src/construction.js
src/ecology.js
src/entity_index.js
src/expedition_state.js
src/expedition_ui.js
src/home_progress.js
src/logistics.js
src/map_ui.js
src/production_jobs.js
src/recovery.js
src/scene.js
src/storage.js
src/terrain_model.js
src/world_runtime.js
```

未跟踪的文档和证据：

```text
docs/adr/0035-dual-world-runtime.md
docs/adr/0036-observed-grid-generation.md
docs/colony-home-plan.md
docs/evidence/**
```

未跟踪的测试和探针：

```text
tests/build_grid.test.js
tests/camera.test.js
tests/colony_home_live_probe.js
tests/construction.test.js
tests/dual_world_live_probe.js
tests/ecology.test.js
tests/entity_index.test.js
tests/expedition_state.test.js
tests/expedition_ui.test.js
tests/home_progress.test.js
tests/logistics.test.js
tests/map_ui.test.js
tests/production_jobs.test.js
tests/recovery.test.js
tests/scene.test.js
tests/storage.test.js
tests/terrain_model.test.js
tests/terrain_movement.test.js
tests/world_runtime.test.js
```

实施前先为本修复创建或确认一个独立 GitHub Issue，并按仓库约定执行 `gh issue edit <n> --add-assignee @me`。不得认领或修改 da123wda 正在处理的 `#64`，也不得把生病系统纳入本次范围。随后记录完整 `git status`、跟踪文件补丁和未跟踪文件清单；只有在当前 WIP 已有可恢复的检查点后，才在隔离副本或明确的 WIP 分支上集成地图修复。

## 勘察结论

### 已确认事实

1. 远端 `914501b` 的默认家园观测会退化。`src/observe.js` 先把 20×20 着陆核心钉为 `landing`，随后半径 8/9 的树木和岩石钉覆盖其中一部分；邻接表又禁止 `landing` 和这些格相邻。默认种子探针得到 `degraded: true`，核心内有 42 格不是着陆地，WFC 无法满足自身约束并落入固定湖泊降级图。
2. 远端观测网格没有贯通地图消费者。`src/world.js` 仍画旧噪声和圆形湖，`src/entities.js` 仍按固定湖圆做玩家碰撞，`src/colony.js` 仍按径向公式算肥力；因此保存的观测结果和玩家看到、走到、生产使用的地图可能不同。
3. 远端远征资源种类没有进入既有资源语义。观测生成的 flora 缺少 `yieldItemId`、`seedItem` 等字段，旧回退会把未知种类当木材处理，且部分种类没有对应画法。
4. `src/planet.js` 当前以 `seed % 4096` 生成星球 ID。种子 1 和 4097 都得到 `P1`，可覆盖既有 PlanetSpec 与图鉴记录。
5. 远端图鉴变更没有在发现时立即持久化；异常退出可能丢失刚发现的星球。
6. 远端把新的目的地选择叠加在旧远征流程上：旧 `expeditionRun` 未完整清理，目的地 UI 使用仅鼠标可点的 `div`，且调试入口 `?exp=1` 不再符合流程。
7. 远端对旧的 2200×2200 存档也生成观测，会改变老档地图；同时 45 格的 `floor(2200/48)` 与其他按向上取整的格网逻辑不一致。
8. 四套生物群系邻接表只是重命名后的同构表，测试只比较 ID 集合，没有证明它们产生不同空间规律。
9. 当前本地 WIP 已经建立更合适的承载层：`src/scene.js` 负责活动场景，`src/world_runtime.js` 隔离家园和远征的可变世界，`src/terrain_model.js` 已成为家园地形/资源入口，`src/expedition_state.js` 已有幂等返回与运行态快照，`src/expedition_ui.js` 已有键盘可用的原生表单。
10. 当前 WIP 仍有断口：`src/world.js` 只为家园解析新场景，远征仍走旧地形；`src/entities.js` 仍使用固定世界边界和圆湖碰撞；`src/map_ui.js` 的远征缩略图还是纯色；`src/main.js` 启动远征时仍额外散布岩石、水晶和 flora。

### 工程判断

- 修复的核心不是单独修 WFC，而是确立一个稳定契约：一次观测产生持久化地图，所有系统经 `APH.TerrainModel` 查询同一份结果。
- `APH.Observe` 应保持为无 DOM、无存档副作用的纯生成模块；场景切换和持久化分别由 `ExpeditionState`、`WorldRuntime`、`Save` 和 `Main` 协调。
- 远端改造中可复用的是观测器思路和部分纯算法，不能复用其旧主流程。应逐段移植并按当前 WIP 接口重写，不整体合并 PR `#196`。
- 当前性能证据 `docs/evidence/colony-home/performance.json` 记录的 WIP 基线为：128×128、2164 个实体、存档 743481 字节、帧 CPU p95 5.9ms、20 次寻路 52.6ms。它只能作为修复后的对比基线，不能提前宣称新方案满足性能目标。

### 必须先明确并写入 ADR 的契约

ADR-48 当前同时要求“一个格子一个 tile”、20×20 全着陆核心，以及距中心 300–500 像素的初始资源环。资源环落在核心内部，如果树/石本身占用地面 tile，这三个要求无法同时成立。

推荐把一次观测定义为一个复合格：

```text
ObservedCell = GroundTile + optional InitialNaturalResource
```

- `GroundTile` 唯一决定地表、通行代价、肥力和水体。
- 可选的自然资源占用同一格的实体层，由同一次观测一起决定，不再由另一套随机散布生成。
- 20×20 核心的 `GroundTile` 全部是 `landing`；资源环可以位于核心内，但不能把核心地面改写成 tree/stone tile。
- “一个格子一个 tile”应修订为“每格恰有一个地面 tile，可带一个初始自然资源占用物”。

这能保留已有 300–500 像素资源要求，也与当前 `TerrainModel` 的地面/资源分层相容。另一方案是保持资源即 tile，并把资源环移到 20×20 核心外；它会直接改变当前玩法距离要求，不推荐。

## 目标数据契约

### 观测结果

在不删除或改名既有字段的前提下，为家园场景描述和 `PlanetSpec` 增加可选字段：

```js
observation: {
  v: 1,
  widthCells,
  heightCells,
  biomeId,
  degraded,
  ground,      // 稳定的行优先 tile code 数组或等价紧凑表示
  resources    // 含格坐标、kind、产物、耗尽/再生语义的初始自然资源
}
```

具体编码在实现时以可读、可迁移和存档体积测量为准。只有测量证明原始数组造成实质问题时才增加压缩；不得为了节省理论空间引入难以迁移的自定义二进制格式。

### 单一查询入口

`APH.TerrainModel` 继续作为其他模块唯一可见的地形门面：

- `normalize(descriptor)` 保留合法 observation，识别 generation 0 老档和 generation 1 当前 WIP。
- `cellAt(descriptor, gx, gy)` 返回地面类型、区域/生物群系、通行性、移动代价、肥力、水体等完整语义。
- `resources(descriptor)` 把观测资源转换成殖民地实体需要的丰富结构，包括 `yieldItemId`、`amount`、`seedItem`、`depleted`、`mineralRemains`、`exposureRisk`、`repairable` 等。
- generation 0 的 2200×2200 老档继续走原有圆湖和旧世界规则，不触发 Observe。

渲染、玩家碰撞、A*、农场、生态、缩略图和资源实体都只调用这个门面，避免各自再次解释 observation。

## 实施步骤

### 1. 建立安全实施基线

涉及文件和动作：Git 工作树、GitHub Issue，不修改业务模块。

1. 创建或确认“地图观测修复与双世界整合”Issue，检查 assignee 后认领；在 Issue 写清不碰 `#64`、生病系统和 X 运营资产。
2. 保存当前本地 HEAD、远端 HEAD、`git status --short`、跟踪补丁和未跟踪清单。当前 WIP 没有可恢复检查点时，先建立不会覆盖用户工作的本地检查点。
3. 在安全的隔离副本或用户现有 WIP 分支上工作。只从 `914501b` 手工提取需要的纯观测算法；禁止整体 merge/cherry-pick，也禁止清理当前未跟踪模块。
4. 给核心文件设单一修改顺序：`observe.js` → `terrain_model.js` → `save.js` → `expedition_state.js` → `main.js`。这些共享契约完成前，不并行改写其消费者。

退出条件：可以准确恢复实施前 WIP，Issue 已认领，没有协作冲突。

### 2. 修订设计契约

涉及文件：`docs/adr/0036-observed-grid-generation.md`、`DESIGN.md`、`CONTEXT.md`。

1. 在 ADR-48 的修订记录中明确复合格、观测结果归属、生成时点、保存时点和 generation 0 兼容规则。
2. 明确 observation 是事实快照，不是在每次加载时用 seed 重算；seed 只用于首次生成和可复现测试。
3. 明确家园 observation 属于家园 scene descriptor，远征 observation 属于对应 `PlanetSpec`；运行时快照只引用/携带这个事实，不能形成第二份可独立变化的地图。
4. 更新领域词义：Observation 同时决定地面和初始自然资源；Lake 是可能为零的水体结构，不是每张地图强制存在的圆。
5. 把旧档策略写清：generation 0 原样保留；缺少 observation 的 generation 1 当前 WIP 需要按其现有确定性 `TerrainModel` 结果一次性快照，确保已有建筑下方地形和资源位置不变。

退出条件：实现所需 schema 和兼容边界不存在互相矛盾的描述。

### 3. 实现纯观测生成器并消除默认退化

涉及文件：`src/observe.js`（新增）、`src/config.js`、`build.py`、`tests/run.js`、各独立场景测试加载清单、`tests/observe.test.js`（新增）。

1. 新增 `APH.Observe`，放在 `utils.js` 之后、`terrain_model.js` 之前加载；所有常量进入 `APH.CFG`，不引入裸全局或 DOM 依赖。
2. 输入只包含 seed、场景尺寸、生物群系与明确 pins；输出符合 observation v1。随机性全部使用 seeded RNG，表现随机不得参与地图事实。
3. 地面 pins 和资源 pins 分开：20×20 核心只钉 ground=`landing`；资源环写入 resource overlay，绝不覆盖核心地面。
4. WFC 使用有限次数、确定性的重试。降级图由当前 `TerrainModel` 的分区地表和资源算法注入/转换得到，不再使用固定半径湖泊或硬编码默认地图。
5. 四个生物群系必须有可观察的拓扑差异，例如水体连通倾向、岩地团簇、开阔地比例或危险地带边缘规则；测试比较结构指标和允许/禁止关系，不能只比较改名后的 ID。
6. 允许生成零水体地图；此时 observation 中没有 lake/shore，后续系统不得凭空补圆湖。
7. 所有宽高来自 scene descriptor 的明确格数。对不可整除像素尺寸明确边缘格规则，禁止一处 `floor`、另一处 `ceil`。

重点测试：

- 默认家园多个固定 seed 的 20×20 核心地面全部为 landing，默认正常路径 `degraded === false`。
- 同 seed 同输入字节级稳定；不同 seed 有合理差异。
- 零水体、边界 pins、矛盾约束、有限重试和确定性 fallback。
- 四种生物群系的邻接规则和结构指标确实不同。
- 128×128、2200×2200 legacy 边界以及非整除尺寸不会越界。

退出条件：观测器自身可以证明默认输入可满足、失败可控、输出确定。

### 4. 让 TerrainModel 接管观测、旧档和资源语义

涉及文件：`src/terrain_model.js`、`src/save.js`、`src/colony.js`、`tests/terrain_model.test.js`、`tests/terrain_movement.test.js`、存档迁移测试。

1. 扩展 `TerrainModel.normalize/cellAt/resources` 读取 observation，同时保留 generation 0 分支。
2. 新档在进入 running 前生成一次家园 observation，并立即进入 `metaSnapshot` 的可保存状态。
3. 对缺 observation 的 generation 1 WIP，使用当前确定性分区和 `TerrainModel.resources()` 生成等价快照；测试对比迁移前后每格关键语义、资源坐标和已有建筑占地，防止“迁移成功但地图改变”。
4. generation 0 的 2200×2200 存档不生成 observation、不改变湖、边界或已有实体。
5. `Colony.init` 只从 `TerrainModel.resources()` 建立初始自然资源；删除 observed map 上的第二套 `generateFlora`/岩石散布入口。
6. 采集、耗尽、种子、再生沿用当前 WIP 的丰富资源字段。未知资源类型不得回退成木材；遇到不支持的 kind 应在开发日志中显式暴露并安全跳过或使用 schema 指定产物。
7. 如果 schema 需要版本变化，只通过 `src/save.js` 的 migrate 入口升级；不得在加载各处临时补字段。

退出条件：新档、generation 1 WIP 和 generation 0 老档各有明确且测试覆盖的行为，地图不会在 reload 时重掷。

### 5. 贯通渲染、碰撞、寻路、肥力、生态和缩略图

涉及文件：`src/world.js`、`src/entities.js`、`src/nav.js`、`src/colony.js`、`src/ecology.js`、`src/map_ui.js`、对应逻辑与场景测试。

1. `World.activeDescriptor()` 同时解析 home 与 expedition；现代场景按 `TerrainModel.cellAt()` 绘制观测地面，generation 0 继续走旧画法。
2. 删除现代场景“有 descriptor 就再画固定圆湖”的逻辑。水、岸和无水地图完全由查询结果决定。
3. 玩家边界取 `Scene.of(state)` 的尺寸；现代场景碰撞查询目标格通行性，generation 0 保留旧圆湖碰撞。
4. `Nav` 从 descriptor 的格尺寸构建矩阵，和渲染/碰撞共用边界定义；墙、闸门等 ADR-13 静态障碍继续叠加在地形通行性之上。
5. 农场肥力、居民/动物活动区、生态生成与 `MapUI` 缩略图全部调用相同地形门面。它们不能自行按半径、场景名或旧 `CFG.LAKE` 推导地形。
6. 增加跨消费者契约测试：抽取同一批坐标，断言渲染分类、碰撞、A*、肥力、生态和缩略图拿到一致的地面事实。

退出条件：同一格在视觉和所有逻辑系统中具有同一含义，零水体地图不会出现隐形障碍或幽灵湖泊。

### 6. 修复星球 ID、图鉴和观测持久化

涉及文件：`src/planet.js`、`src/save.js`、可能的 `src/config.js`、对应 Planet/Save 测试。

1. 保留 ADR-9 的 `P` 前缀和所有现有短 ID，不重命名存量记录。
2. 新星球 ID 使用完整无符号 seed 或持久化序列，并在 atlas/PlanetSpec 存储中做碰撞检查；用 seed 1 与 4097 写回归测试。
3. 已知目的地只读取已保存的 PlanetSpec/observation，不重新生成 biome。未知目的地只在玩家提交目的地并实际落地时生成。
4. 新 PlanetSpec 先保存，再把 atlas 变更写入 meta；只有两个写入都成功，才进入扣物资和切换活动世界的副作用阶段。失败时留在家园并显示可恢复错误。
5. 对已有但缺 observation 的已知 PlanetSpec，推荐保持 legacy 行为，避免再次登陆突然换地图；如果产品以后希望补观测，应另立显式迁移决策，不能在本修复中静默改变。

退出条件：不同种子不覆盖、发现后异常退出不丢记录、已知星球 reload/relaunch 地图稳定。

### 7. 把目的地并入当前远征状态机

涉及文件：`src/expedition_ui.js`、`src/expedition_state.js`、`src/main.js`、`src/world_runtime.js`、`tests/expedition_ui.test.js`、`tests/expedition_state.test.js`、`tests/world_runtime.test.js`。

1. 在现有 `ExpeditionUI` 表单加入原生 `<select>` 或同等键盘可操作控件，列出已知目的地和“未知星球”。保留焦点管理、Esc、Enter 和现有成员/补给/目标选择。
2. `ExpeditionUI` 只提交结构化选择；`ExpeditionState.validateSelection/begin` 校验 destination，并把 `planetId`、destination kind 和必要的 spec 引用写入 active run。
3. `Main.launchExpedition` 只做编排：解析/创建并持久化 PlanetSpec → 调用 `ExpeditionState.begin` → 创建或恢复 `WorldRuntime` → 切换场景。移除旧的并行 `expeditionRun` 生命周期。
4. 远征返回继续使用当前幂等 `ExpeditionState.returnHome` 和事务式 world checkpoint；成功结算后清空 active run。下一次出发必须重新经过目的地选择。
5. `?exp=1` 调试入口提供明确且确定的默认目的地，并经过同一高层流程，不能绕过保存和状态机。
6. `ui.js` 中当前只读 Codex 保持只读，不在其中再实现一套发射入口。

退出条件：选择、扣费、切换、reload、返回、再次发射只有一套状态来源，键盘和鼠标都能完成流程。

### 8. 清除观测地图上的重复散布并约束覆盖物

涉及文件：`src/main.js`、`src/colony.js`、`src/entities.js`，以及资源/远征场景测试。

1. observed map 的树、石、可采自然物只来自 observation resources；删除启动远征时额外生成同类 rocks/crystals/flora 的路径。
2. 废墟、敌方基地、任务矿藏等不是自然地形的内容可以作为覆盖实体保留，但放置前必须查询完整 footprint 的通行性，而不只检查中心点。
3. 覆盖物放置使用 seeded、有限重试和显式 fallback；不能落水、越界、堵死着陆区或覆盖关键建筑。
4. 每种可采资源必须在 schema、画法、掉落和再生策略之间有完整映射；测试至少验证不会把未知 flora 静默掉成木材。

退出条件：每一类世界对象只有一个生成责任方，资源视觉与实际掉落一致。

### 9. 文档、回归与验收

涉及文件：`DESIGN.md`、`CONTEXT.md`、`BACKLOG.md`、`JOURNAL.md`、`game.html`、测试与证据目录。

先跑与改动最接近的测试，修复本次引入的问题后再跑完整门禁：

```bash
node tests/run.js observe.test.js
node tests/run.js terrain_model.test.js
node tests/run.js terrain_movement.test.js
node tests/run.js expedition_state.test.js
node tests/run.js expedition_ui.test.js
node tests/run.js world_runtime.test.js
python3 build.py
node tests/run.js
node tests/scenario.test.js
node tests/perf.test.js
node tests/boss.test.js
```

补充自动化场景：

- 新档首次进入家园后 observation 已保存；刷新后逐格摘要和资源位置不变。
- 默认家园 20×20 核心可建、两块建设区连通、没有强制湖泊。
- generation 0 老档加载前后地图规则不变；generation 1 WIP 迁移前后关键格和资源不变。
- 未知目的地落地后加入 atlas；刷新、返回、再次选择该已知星球时恢复同一地图。
- 两个旧算法会冲突的 seed 获得不同 ID，且不会覆盖各自存档。
- 远征 reload、返回、再次发射没有残留 active run，也不会把远征实体带回家园。
- 零水体和有水地图在画面、玩家碰撞、A*、农场肥力、生态和缩略图上保持一致。
- 所有覆盖实体的完整占地可通行并远离着陆安全区。

性能和体积验证：

- 沿用当前 128×128、2164 实体的探针条件重新测量帧 CPU p95、20 次寻路耗时和序列化存档体积。
- 与现有证据的 5.9ms、52.6ms、743481 字节分别比较，记录环境和原始输出；没有测量前不声称性能提升。
- 如果 observation 令存档体积或读写时间明显恶化，先分析 ground 编码，再决定是否加入简单 RLE；优化后必须有迁移与往返一致性测试。

人工验收必须使用最终重新生成的 `game.html`，并把它和 fixture/probe 证据分开记录：

1. 清空测试用存档，正常开场出生在家园。
2. 查看 20×20 着陆核心、两块建设区、资源环和可能为零的湖泊；实际走到边界、水边和资源旁，确认画面与碰撞一致。
3. 建造墙、闸门、导线、农场，观察寻路和肥力取值没有落在不同地图上。
4. 用键盘打开远征规划，选择未知目的地，完成落地、采集、刷新恢复、返回家园和再次选择该已知目的地。
5. 验证星球图鉴、货物结算、家园建筑和两个世界的实体均保持隔离。

完成后：

- 勾选本次对应的 `BACKLOG.md` 项。
- 在 `JOURNAL.md` 只追加一条，写明时间、修复内容、精确测试结果、人工验收范围和剩余风险。
- 更新 ADR 修订记录和 `DESIGN.md`，重新运行 `python3 build.py` 生成唯一分发文件 `game.html`；不得手改构建产物。

## 并行与顺序边界

核心 schema 和门面必须由单一实现路径依次稳定下来：ADR/schema → Observe → TerrainModel → Save → ExpeditionState → Main。否则多个模块会各自猜测 observation 结构，造成新的双数据源。

核心契约稳定后，可并行处理这些低冲突消费者和测试：

- `world.js` + `entities.js` 的显示/碰撞验证。
- `nav.js` + `terrain_movement.test.js` 的格网边界验证。
- `ecology.js` + `map_ui.js` 的查询接入。
- `expedition_ui.js` 的可访问目的地控件和 DOM 测试。

合并每组工作前都要以 `TerrainModel` 公共契约为准，并在修改共享文件前重新检查工作树，避免覆盖当前 WIP。

## 风险、待验证假设与停止条件

1. **现有 generation 1 存档是否已被真实玩家使用**：当前推荐做等价快照迁移。若探针发现旧数据缺少重建资源所需字段，应停止并先设计保守的 legacy 分支，不能猜测迁移。
2. **复合格是否接受为 ADR-48 修订**：这是满足核心全着陆和 300–500 资源环的推荐方案。若产品坚持“资源就是唯一 tile”，必须先重新确定资源距离，不能同时实现矛盾约束。
3. **PlanetSpec 历史 ID**：新增算法只用于新星球。任何需要重命名已有 `P*` ID 的方案都会违反 ADR-9，应停止并另做迁移评审。
4. **存档体积**：128×128 ground 数组可能增大 meta/planet 快照；必须以最终编码测量决定是否优化，不能在没有证据时引入复杂压缩。
5. **远端代码与本地 WIP 冲突**：发现无法逐段移植、需要回退用户现有模块或扩展到生病/#64 时立即停止并报告具体冲突。
6. **自动化和人工证据边界**：`dual_world_live_probe.js` 等 fixture 可以证明流程断言，不等于一次真实新档人工游玩。最终报告必须分别列出。

## 交付判定

只有同时满足以下条件，地图生成修复才算完成：

- 默认家园不退化，20×20 核心地面契约成立，地图允许没有湖。
- observation 被持久化，reload 不重掷；generation 0 和现有 generation 1 的兼容策略有回归证据。
- 渲染、碰撞、寻路、肥力、生态、缩略图和资源实体读取同一地图事实。
- 星球 ID 不碰撞，未知/已知目的地、图鉴保存、双世界切换与返回形成单一生命周期。
- 不再有第二套自然资源散布，资源类型、画法和掉落一致。
- 构建、unit、scenario、perf、boss 全绿；最终 `game.html` 完成人工新档验收。
- 现有 WIP 和协作者工作保持完整，文档、BACKLOG、JOURNAL 与实际实现同步。

## 勘察依据

- 当前本地：`src/terrain_model.js`、`src/scene.js`、`src/world_runtime.js`、`src/expedition_state.js`、`src/expedition_ui.js`、`src/world.js`、`src/entities.js`、`src/nav.js`、`src/colony.js`、`src/ecology.js`、`src/map_ui.js`、`src/main.js`、`src/save.js`、`src/planet.js`。
- 设计与协作约束：`AGENTS.md`、`COLLABORATION.md`、`CONTEXT.md`、`DESIGN.md`、`docs/adr/0036-observed-grid-generation.md`、`docs/colony-home-plan.md`、`docs/agents/issue-tracker.md`、`docs/agents/domain.md`。
- 远端对照：`914501b:src/observe.js` 及对应的 world/entities/colony/planet/ui/main/tests。
- 先前只读隔离验证记录：远端 `914501b` 当时可构建，unit 863、scenario 112、perf 4、boss 7 均通过；这些结果只说明现有测试未捕获上述契约问题，本次计划阶段没有重新执行测试。
