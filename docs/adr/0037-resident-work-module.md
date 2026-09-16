# ADR-49: 居民世界侧接线独立成 APH.ResidentWork

## 状态
已通过（Accepted） · 2026-09-16 · issue #206

前置：[ADR-41/42 main.js 拆分第一批](0032-colony-tick-module.md) ·
[ADR-43 绘制层与访客系统](0033-draw-and-visitors-modules.md)

---

## 上下文

拆分第三批。ADR-43 当时量过四块候选的耦合度，`updateResidents`（473 行）被记成
「依赖 10 个 main 本地函数，多个是实打实的大函数」而留待下批。这次先用调用图把它量准：

- 闭包 **28 个函数**（`updateResidents` 559 行 + 27 个 helper）。
- 其中 **20 个只被本簇调用**（375 行）→ 可整体搬走，不需缝。
- **7 个簇外也有调用者** → 需要缝：`residentOf`/`nearestMeal`/`nibblePile`/`foodEatBelow`
  其实只是转发已被归位的领域函数（`APH.Res.residentOf` 等），直接删壳改直连；
  剩下 `freeDropCount`（装备命令用）、`nearestDrop`（搬运命令用）、
  `syncResidentEntities`（世界切换/事件用）三个是真的共享入口。
- 被搬代码引用到的 main 模块作用域符号只有 `CFG/U/T` 三个 —— 闭包是干净的。
- **顺带查到死代码**：`doHaul`（39 行）全项目零调用点，它的四条搬运原语已被
  `updateResidents` 内的等价路径取代，只剩一句「同 doHaul 逻辑」的注释。
- 13 处 `APH.UI.floatText` 必须按 [ADR-40](0031-sim-ui-event-bus.md) 改成 `U.emit`，
  否则新模块过不了层级用例的「模拟层不得直接调用 `APH.UI`」。

`updateCmdPanel`/`updateInspectorNow` 曾被怀疑是缝：它们各有 14/36 处 main 调用点。
实测本簇一次都不调用它们（main 的帧循环每帧已经在刷），所以**不需要**给它们做缝。

## 决策

### 新模块 `src/resident_work.js`（`APH.ResidentWork`，1045 行）

模块职责一句话：**每个 home tick 把 roster 投影成场上实体，再按优先级驱动它们** ——
任务/医学床位 → 社交停步 → 征召 → 饥饿进食 → 搬运与仓储 → 采集/建造/游荡。

接口只暴露被外部真正需要的五个：

```
update(s, dt)                  帧循环/场景测试的主入口（原 updateResidents(dt)）
syncResidentEntities()         roster → 场上实体的投影（世界切换、rosterChanged 事件）
tryResidentJoy(e,r,dt,mul,grid) 娱乐移动（scenario 的正式验证入口）
nearestDrop(from, r, pred)     搬运命令选目标
freeDropCount(s, e)            一件地面物资还剩多少可拿（生产工单预订感知）
```

`main.js` 保留三个**旧名薄委托**（`updateResidents`/`syncResidentEntities`/
`tryResidentJoy`），因为帧循环与 scenario/perf/season_soak 都按旧名调 ——
和 ADR-43 给访客系统留 `nearestVisitor` 转发是同一形态。

### 位置与层级

放在 `visitors.js` 之后、`colonytick.js` 之前。它引用 `Res/Colony/Nav/Combat/
Construction/Weather/Storage/Logistics/ProductionJobs/Ent/World/Scene/TerrainModel/
EntityIndex`，全部在它之前加载 → 零新增向后依赖；对 `APH.Main` 与 `APH.UI` 引用均为 0。

## 结果

```
src/main.js          4730 → 3675 行（本批 −1055；含 slice1 的 −44）
src/resident_work.js 1045 行   APH.ResidentWork  对 UI/Main 引用 0
```

累计（ADR-41/42/43/49）：**6048 → 3675 行，−2373**。

## 护栏

- `layering.test.js`：`ORDER`、两条模拟层清单（反向调用 main / 直接调 `APH.UI`）、
  `NS` 映射都加了 `resident_work.js` —— 新模块必须零 `APH.Main.`、零 `APH.UI.`。
- 构建与全部测试入口的模块清单同步加了它（`build.py`、`run.js`、`scenario`、`perf`、
  `boss`、`season_soak`）；layering 的一致性用例专治漏改。
- `tests/nav_equivalence_probe.js` 之外，本批新增长仿真对拍手法：同一 seed 夹具下
  逐帧比较居民状态摘要（见「验证」）。

## 验证

```
python3 build.py                 ✓ 40995KB
node tests/run.js                1061 通过 / 0 失败
node tests/scenario.test.js      145 通过 / 0 失败
node tests/perf.test.js          5 通过 / 0 失败
node tests/boss.test.js          7 通过 / 0 失败
```

**行为不变的长仿真对拍**：同 seed（9301）+ 同夹具，只差源码树，逐帧比较居民
job/food/位置/workReason + 实体表 + 殖民地库存。基线树（`5200d9c`，pre-#206）与
搬迁后**前 600 步逐字节一致**，且基线树连跑两次也一致（该窗口内探针自洽）。

**该对拍的边界（诚实记录）**：窗口放宽到 ~760 步后，同一棵树的两次运行会开始出现
浮点级差异（同一步位移 1.7469 vs 1.7839，随后累积），且此时 `Math.random` 调用
次数、天气、库存、任务分配完全一致 —— 是既有的仿真不确定性，不是本批引入
（在未改动的基线树上同样复现）。ADR-5 承诺的可复现性目前只在 ~25 秒仿真窗口内成立，
需要单独排查。

**另一条既有红灯（不属于本批）**：`tests/season_soak.test.js` 在
`5200d9c`（pre-#206）与 `2037419`（pre-#205）上同样失败于
`right-click defense intervention must capture downed raider rs_h290165`，
连 raider id 都相同 —— 与本次搬迁和寻路改写无关，需另开票。
