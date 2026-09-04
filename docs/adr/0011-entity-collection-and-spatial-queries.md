# 实体集合与空间检索接缝深化（Entity Collection & Spatial Queries）

## 背景
根据 ADR-3，系统建立了统一实体列表 `state.entities = []`，所有世界对象均带有 `{ id, type, x, y, ... }` 属性并共用 Y-排序与渲染循环。
然而随着游戏规模扩大，`state.entities` 作为原生裸数组直接暴露给所有系统，造成了严重的架构摩擦：
1. **重复的手写空间距离轮询 (15+ 处 O(N) 遍历)**：
   - 每一帧 `updateHome` 中为了更新角色对农田、工坊、厨房、篝火、实验室、床铺、医疗舱、粮堆、仓库的交互接近状态，手写了多达 8 次重复的 `entities.find(...)` 与 `U.dst` 距离遍历；
2. **销毁逻辑分裂与原生 Splice 位移隐患 (9 处裸 filter/splice)**：
   - 全工程存在 9 处不同的 `s.entities = s.entities.filter(...)` 与 `splice(i, 1)`；在循环遍历中直接执行 `splice` 极易引发由于下标位移导致漏更下一实体的经典游戏循环 Bug；
3. **缺少实体管理接缝 (Lack of Locality & Depth)**：
   - `APH.Ent` 此前仅作为“工厂函数”与“绘制函数”的散装工具库，并未形成完整的实体集合生命周期接缝。

## 决策

1. **恪守 ADR-3 契约，深化而不颠覆**：
   - 保留 `state.entities` 作为原生数组形态，不破坏渲染层 Y 排序（`entities.sort((a,b) => a.y - b.y)`）以及存档读写序列化逻辑；
   - 将实体的**就近空间检索、复合筛选、安全销毁、帧尾 Sweep** 全部收口至 `APH.Ent` 深模块。

2. **高内聚空间检索接缝（Spatial Queries）**：
   - `APH.Ent.findNearest(entities, type, x, y, maxRadius, predicate)`：
     通用的就近实体检索，自动计算平面几何距离 `U.dst`，支持半径截断与可选谓词；
   - `APH.Ent.findNearestBuilding(entities, bid, x, y, maxRadius, predicate)`：
     针对建筑实体的专用检索接缝，一行消灭 `main.js` 逐帧手写的各类工坊、床铺、医疗舱检索；
   - `APH.Ent.findNearestFood(entities, x, y, maxRadius, warehouseFoodStock)`：
     将“熟食优先 → 地上生食粮堆 → 仓库储备粮兜底”的复杂判定内聚封装于实体模块中；
   - `APH.Ent.findAll(entities, type, predicate)`：
     统一带类型与条件过滤的高性能列表查询。

3. **统一安全销毁与帧尾清理（Safe Destroy & Frame Sweep）**：
   - `APH.Ent.destroy(entity)`：统一打标 `entity.dead = true`，禁止在帧中间即时调用 `splice` 破坏活动迭代；
   - `APH.Ent.sweepDead(entities)`：在主循环与战斗帧尾单点收口清洗（强制保护 `type !== T.PLAYER` 永不被清除），彻底替代散落在各处的裸 `filter` 代码。

4. **单测覆盖与零 DOM 依赖**：
   - 所有实体空间检索与清理算法均为纯逻辑函数，在 `tests/entities.test.js` 中直接验证，纳入 `tests/run.js`。

## 后果
- 彻底消除了主循环中 8 处手写的建筑就近扫描和 9 处散落的 `entities.filter`；
- 根除了遍历中直接 `splice` 造成的迭代下标跳位隐患；
- `APH.Ent` 升级为兼具生成、查询、回收与绘制能力的深模块（Deep Module）。
