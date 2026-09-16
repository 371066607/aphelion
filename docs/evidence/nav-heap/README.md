# 寻路 open 集换二叉堆（#205）

分支 `fix/map-observation-repair-main`，源 `src/nav.js`。只替换 `APH.Nav.astar` 的 open 集实现，**对外语义逐项不变**：越界拒绝、直线退化单点、目标在墙内 null、起点被墙覆盖时的逃生约定、对角禁穿角、`costFn` 罚权 + 地形倍率、终点精确坐标。

改写前的实现是普通数组：每轮线性扫描找最小 f、`splice` 取出、每个邻居再 `Array.find` 闭包查重。改写后是二叉堆（懒删除）+ 整数节点索引 `y*cols+x` + `gScore/prevOf/closed` 三个 TypedArray，起点被墙覆盖时的虚拟起点用索引 `total` 承载，堆是模块级 scratch、容量翻倍增长。`costFn` 全程是纯查表（`combat.js` 陷阱罚权），不会重入。

## 语义等价与最优性

`node tests/nav_equivalence_probe.js --old=<旧 nav.js>` 输出见 [equivalence.txt](equivalence.txt)：

| 检查 | 结果 |
| --- | --- |
| 语料 | 184 例：随机墙密度 0 / 0.12 / 0.28、地形造价表、陷阱 `costFn`、真实家园 seed 58098 |
| 差分（旧 vs 新） | null 判定 / 最优代价 / 终点坐标差异 **0** |
| 独立 Dijkstra 对照 | 135 例逐例比对，非最优 **0** |
| 新实现非法路径（穿墙、跳格、对角穿角） | **0** |
| 跳过 | 直线退化 19 例、起终点本身被墙覆盖 8 例（旧实现的显式退化约定，不属于最优性范畴） |

`tests/nav.test.js` 另加 `#205 astar: 长绕行的累计代价=手推最优`：60×60 空格网 + x=30 单列墙只剩 (30,55) 一个缺口，最优代价手推为 `102 + 48(√2-1)`（缺口格上下邻居是墙，进出它的对角步被防贴角穿墙禁掉，只能正交进出）。该用例在改写前后两份实现上都通过，锁的是契约不是实现。

## 实测（隔离 Chrome，固定 seed 58098、128×128、2059 世界对象）

复现：`node tests/colony_perf_live_probe.js /tmp/aphelion-nav-heap`

| 探针 | 20 次 A* | frame CPU p50 / p95 | 错误 |
| --- | --- | --- | --- |
| 改写前（`map-observation` 证据，三次） | 73.5 / 71.7 / 71.1 ms | 3.1/7.4 · 5.5/6.2 · 5.5/6.5 ms | 0 |
| 改写后 [主记录](performance.json) | **12.0 ms** | 3.4 / 6.6 ms | 0 |
| 改写后 [重复 1](performance-repeat-1.json) | **10.9 ms** | 2.6 / 6.3 ms | 0 |
| 改写后 [重复 2](performance-repeat-2.json) | **10.8 ms** | 2.6 / 6.1 ms | 0 |
| 改写后 [重复 3](performance-repeat-3.json)（前一构建，仅差一个常量改名） | 14.2 ms | 6.5 / 8.3 ms | 0 |

- 20 次 A* 中位数 71.7ms → 10.9ms（约 **6.6×**），逐条路径长度与改写前完全一致（127/117/111/105/99/93…）。
- 帧耗时与改写前同量级波动：帧成本由渲染主导，寻路只在重算路径的那些帧里出现；本次改写消除的是「一次多人同时重算寻路」时的成帧尖峰（旧实现 20 条即 71ms，超过一个 16.7ms 帧预算的 4 倍）。
- DOM 桩 `tests/perf.test.js` 记录（同一 harness 对照，基线副本只替换 `src/nav.js`）：`simulationP95Ms` 12 → 2~3、`navigation20Ms` 109 → 36~39（桩内计时波动较大，只作方向性证据）。

## 构建指纹

`python3 build.py` → `game.html` 41,979,666 字节，SHA-256 `adfb40115a0d82fdd31ac51e1a18f0b87b02197ff45c5f2e4653bd01d7603ab5`（连续两次构建字节一致；主记录与重复 1/2 三次探针都跑在这份字节上）。1061 单元、145 scenario、5 perf、7 boss 全绿，`git diff --check` 通过。
