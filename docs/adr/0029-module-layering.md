# ADR-37/38: 念头上下文收口 · 模拟循环单一归属

## 状态
已通过（Accepted） · 2026-09-07

---

## ADR-37 — 念头上下文只有一份

### 上下文

我在实现 ADR-31（念头驱动心情）时把 `thoughtCtxAt` 写进了 main.js，
又没有动 ui.js 里既有的 `thoughtCtxOf`。两份很快分叉：

| | `thoughtCtxAt`(main) | `thoughtCtxOf`(ui) |
|---|---|---|
| 字段 | roomMood, roomPretty, roomFriction, atJoy, raid, night, sheltered, exposed, temp, filth, fireNearby, corpseNearby | raid, night, sheltered, temp, exposed, filth, corpseNearby, fireNearby |

UI 那份**缺了我后来加的每一项**（含全部美观 P2 工作）。
指挥官的检查器走 `thoughtCtxOf`，而他的心情模拟走 `thoughtCtxAt` ——
**这正是 ADR-31 修掉的「检查器对玩家撒谎」，两轮之后我自己又造了一遍。**
居民侥幸没中招，只因为渲染时传的是预算好的 `r.thoughts`。

### 决策

收口到 `APH.Res`（「念头」这个概念的归属模块，且在 MODULE_ORDER 里排在
colony/nav/weather 之后、ui/main 之前，两边都够得着）：

- `Res.thoughtCtxAt(x, y, env)` —— 唯一实现
- `Res.thoughtEnvOf(state)` —— 环境量构造器；main 每生产跳算一次并复用，
  ui 渲染时按需算一次，**两边拿到同一套定义**

main.js 与 ui.js 各留一个三行转发壳，不再自留逻辑。

---

## ADR-38 — 模拟循环必须只有一个归属者

### 上下文

`build.py` 的 `MODULE_ORDER` 声明 colony/combat 加载在 main 之前，
但它们共有 **12 处反向调用 `APH.Main`**：

```
main.simStep → updateHome → simHome → Colony.tickProduction
                                            ↓
        colony.js  APH.Main.tickRivals / storyTick / residentsTick
                                            ↓
                                       回到 main.js
```

30 秒生产跳**由 colony.js 拥有**，却**派发回 main.js**，main 再调回 colony。
AGENTS.md 写着「模块间禁止隐式依赖」——这是那条规则在结构层面被破掉，
而不是偶发。后果：模拟循环没有唯一的归属者，读代码追不出一跳到底发生了什么。

### 决策

**编排权归还给 main.js；低层模块只做本职 + 广播。**

- `Colony.tickProduction(s, dt)` 改为**返回本跳是否发生**；
  rivals / story / residents 三跳的编排移回 main.js。
- 建筑落成的存档与开场推进 → `U.emit('built')`，main.js 订阅（复用 ADR-8 事件总线）。
- 围攻扎营/撤营 → `U.emit('raidBegan' / 'raidEnded')`，main.js 订阅；
  `siegeTick` 改由 main 在自己的循环里驱动。
- `U.emit` 是**同步**的，顺序与原先的直接调用完全一致。

结果：`colony.js` 与 `combat.js` 的 `APH.Main` 引用 **12 → 0**。

### 用测试钉死，而不是靠自觉

新增 `tests/layering.test.js`：

1. **模拟层零反向调用** —— colony/combat 再出现 `APH.Main.` 直接红。
2. **棘轮**：其余模块反向调用 main 的次数**只减不增**（当前登记 `ui.js: 27`）。
3. **向后依赖白名单**：模块引用加载顺序在自己之后的模块，须登记；
   新增未登记的依赖直接红。

测试读源码并**剥掉注释与字符串**，避免把说明文字误判成调用。

### 仍欠的债（已在棘轮里可见）

- `ui.js → APH.Main` 27 处，分三类：
  存档类（应直接走 `APH.Save`）、领域查询（应下沉 Colony/Res）、
  命令派发（应走事件或命令表）。
- `combat.js → APH.UI` 38 处、`colony.js` 5 处：模拟层直接驱动表现层。
- main.js 仍有 6100+ 行。

这三项是下一步，不在本轮范围内 —— 但现在它们**有数字、有护栏、不会再悄悄变大**。
