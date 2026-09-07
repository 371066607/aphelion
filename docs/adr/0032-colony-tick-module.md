# ADR-42: 30 秒生产跳独立成 APH.ColonyTick

## 状态
已通过（Accepted） · 2026-09-07

前置：[ADR-41 提示层独立](0031-sim-ui-event-bus.md 的同批工作) ·
[ADR-40 模拟层不再直接驱动视图](0031-sim-ui-event-bus.md)

---

## 上下文

BACKLOG 的「main.js 拆分」点名了两块：**提示层**（ADR-41 已做）与
**殖民地跳编排**。后者就是 `residentsTick` —— 454 行，一跳里串起
天气、房间、床位、体温、需求、心情、崩溃、农牧、烹饪、工坊、社交、
覆灭判定，约 20 个子系统。

它不是「领域逻辑」——各子系统的规则本来就住在 Colony/Res/Weather/Nav。
它是**编排**：按正确顺序把它们串起来，把结果落进 state。
编排也该有自己的文件；埋在 6000 行的 main 里，没人看得出这一跳的全貌。

### 挡在前面的三根线

搬走之前，`residentsTick` 还牵着 main 的三个函数：

| 函数 | 性质 | 处置 |
|---|---|---|
| `checkColonyFall` | 殖民地覆灭判定 | 一起搬走（它本来就是这一跳的一部分） |
| `refreshTechMapIfOpen` | 纯界面刷新 | 删掉，改由 ui 订阅 |
| `tryFirstNightVisitor` | 依赖开场状态机 | 留在 main，改由 main 订阅 |

另外它自己还有 **21 处 `APH.UI.floatText`** —— ADR-40 清理 combat/colony 时
漏掉的同一种债，只是它当时还住在 main（main 调 UI 不算层级倒置，所以护栏没报）。

---

## 决策

### 一个事件收掉最后两根线

```js
/* colonytick.js 跳末 */          /* main.js */
U.emit('productionTick', {});     U.on('productionTick', () => tryFirstNightVisitor());
                                  /* ui.js */
                                  U.on('productionTick', () => { if(isOpen('techMap')) renderTechMap(); });
```

`U.emit` 同步派发，顺序与原先两行直调完全一致。

### 覆灭判定的死亡结算也走总线

`checkColonyFall` 原先直接 `APH.UI.showDeath(...)`。改成
`U.emit('death', {reason, stats})`，与 ADR-40 里战死那条走同一条路。
`stats.colonyFall: true` 让结算页知道这是「无人生还」而不是「你战死了」。

### 21 处飘字按 ADR-40 的既定形态改

`U.emit('notice', {text, color})`。至此模拟层（colony / combat / colonytick）
对 `APH.UI` 的引用全部为 0，护栏已把 `colonytick.js` 加进那条用例。

---

## 结果

```
src/colonytick.js   498 行   APH.ColonyTick.run / checkFall / founded
src/main.js        6048 → 5297 行（ADR-41 与本条合计 −751）
```

`main.js` 里剩下三行转发壳（`APH.Main` 的导出与场景用例都在用旧名）。

`colonytick.js` 对 `APH.UI` 与 `APH.Main` 的引用都是 **0**。
它在模拟层（`entities.js` 之后、`sfx.js` 之前），没有视图也能跑完整一跳。

---

## 护栏

- `layering.test.js` 的两条模拟层用例把 `colonytick.js` 一并纳入：
  不得反向调 main、不得直接调 UI。
- `core.test.js` +3：跳末发且只发一次 `productionTick`；
  覆灭判定的三态（没立过 / 还有人 / 立过再归零）与不重复结算；
  无人订阅时照跑。

## 验证

```
python3 build.py             → ✓ game.html
node tests/run.js            → 821 通过 / 0 失败   (818 → 821)
node tests/scenario.js       → 162 通过 / 0 失败
node tests/perf.test.js      → 4 通过 / 0 失败
node tests/boss.test.js      → 7 通过 / 0 失败
node tests/ui_modals.test.js → 89 通过 / 0 失败
```

实机（无头 Chrome + CDP）：

```
模块就位:       {"ColonyTick":"object","run":"function","Hints":"object"}
真实生产跳:     {"productionTickFired":1}
确实在结算需求: {"foodBefore":80,"foodAfter":79.65,"changed":true}
覆灭判定:       {"fell":true,"mode":"dead"}   ← 死亡结算页确实弹出
console 错误:   (无)
```

第三条是关键：不是「函数没抛错」，而是**这一跳真的把居民的饱食扣掉了** ——
搬 454 行编排代码，最容易出的错就是某个子系统被静默跳过。

---

## 后果

- main.js 从 6048 降到 5297。剩下的仍是大头：输入绑定（~600 行）、
  居民世界侧接线 `updateResidents`（~470 行）、绘制层（~340 行）、
  访客系统（~220 行）。都可以按同样的方式继续切。
- 模拟层对视图的引用彻底归零（ADR-40 收尾）。
