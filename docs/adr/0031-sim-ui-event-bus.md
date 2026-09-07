# ADR-40: 模拟层不再直接驱动视图

## 状态
已通过（Accepted） · 2026-09-07

前置：[ADR-38 模拟循环单一归属](0029-module-layering.md) ·
[ADR-39 拆掉 ui → main 反向依赖](0030-view-controller-decoupling.md)

---

## 上下文

ADR-38 修的是 `模拟层 → main`，ADR-39 修的是 `ui → main`。
剩下最后一条反向箭头，方向正好相反：**模拟层直接调视图**。

```
combat.js  52 处 APH.UI.floatText / setHint / showDeath
colony.js   6 处 APH.UI.floatText
```

写法长这样：

```js
if(window.APH.UI && APH.UI.floatText)
  APH.UI.floatText('⚠ 仓库被盗掠','#ff9a9a');
```

那个 `if(window.APH.UI && ...)` 守卫本身就是供词：**作者知道 UI 可能不在**
（无头、测试、加载顺序靠前），于是每处都手写一遍兜底。
58 处守卫，是 58 次「这里的依赖方向不对」的自白。

`ALLOWED` 里给 colony/combat 登记的 `'UI'` 就是这笔债。ADR-8 的事件总线
（`U.on/off/emit`）从第一天就在，只是没人用它走这条路。

---

## 决策

模拟层只 `emit`，ui.js 订阅并落到 DOM。

```js
/* combat.js / colony.js */          /* ui.js */
U.emit('notice', {text, color});     U.on('notice', p => floatText(p.text, p.color));
U.emit('hint',   {text});            U.on('hint',   p => setHint((p && p.text) || ''));
U.emit('death',  {reason, stats});   U.on('death',  p => showDeath(p.reason, p.stats || {}));
```

三个事件覆盖全部 58 处。

### 为什么载荷里还带 `color`

`emit` 里仍然写着 `#ff9a9a` —— 模拟层还在描述表现，这看着不够干净。
更好的形态是语义等级（`level:'danger'`），由 ui 决定调色板。

**这一版刻意不做**：现有 58 处用了 15 种不同色值，映射到几个等级
必然改变画面。层级重构应当是**零视觉变化**的，颜色收敛是一次独立的、
需要拍板调色板的改动。留在 BACKLOG。

即便如此，方向已经修好了：combat/colony 不再引用 `APH.UI`，
没有 UI 时照常运行（`emit` 无监听者即 no-op，与原先的手写守卫等价），
而且这一点现在由用例钉死，不再靠 58 处自觉。

### 顺带修掉的实参错位

改到这里时发现 ui.js 内部有 11 处：

```js
floatText('✕ ' + res.reason, 400, 300, '#ff9a9a');   // 签名其实是 (txt, col)
```

`col` 收到的是 `400`。实机复核（headless Chrome）：

```js
d.style.color = '#123456';
d.style.color = 400;        // → 仍然是 rgb(18, 52, 86)
```

非法值被 CSS-OM 静默忽略，元素**沿用上一条飘字的颜色**。
所以外交/交易/工作面板的 11 条消息一直在用「上一条消息的颜色」显示 ——
失败提示可能是绿的，成功提示可能是红的，取决于你上一步做了什么。
不是崩溃，所以没人报；一直没被发现，因为它只在特定顺序下才看得出不对。

---

## 护栏

1. `ALLOWED` 里 colony/combat 的 `'UI'` 删除 —— 再出现直接调用即红。
2. 新增用例：模拟层（colony/combat）的 `APH.UI.` 计数必须为 0。
3. `tests/core.test.js` +4：溃退发 `notice` 且载荷是 `{text,color}`、
   玩家死亡发 `death` 且不丢 `gameOver`、**无人订阅时模拟层照跑**、
   **单个订阅者抛错不拖垮模拟层**（后两条正是那 58 处守卫想保证的事，
   现在由 `emit` 的内部 try/catch 统一保证）。
4. `tests/ui_modals.test.js` +12：notice 的文案与颜色确实写进 DOM、
   飘字元素复用、hint 空串会隐藏提示条、畸形载荷不抛错。

---

## 验证

```
python3 build.py             → ✓ game.html
node tests/run.js            → 808 通过 / 0 失败   (803 → 808)
node tests/scenario.js       → 162 通过 / 0 失败
node tests/perf.test.js      → 4 通过 / 0 失败
node tests/boss.test.js      → 7 通过 / 0 失败
node tests/ui_modals.test.js → 89 通过 / 0 失败   (77 → 89)
```

实机（无头 Chrome + CDP 驱动 `game.html?autostart=1`）：

```
style.color=400 的后果:  {"after":"rgb(18, 52, 86)"}     ← 实参错位确认
notice 落地:             {"found":true,"color":"rgb(255, 154, 154)"}
hint 落地:               {"opacity":"1"} / 清空后 {"opacity":"0"}
经 Combat.raidRetreat:   {"found":true,"color":"rgb(255, 217, 122)"}   ← 走真实模拟路径
console 错误:            (无)
```

第三条是关键：不是直接 `emit` 一下，而是调真正的模拟函数
`Combat.raidRetreat`，看它一路走到 DOM。

---

## 后果

- `MODULE_ORDER` 里所有反向箭头清零：
  模拟层 → main（ADR-38）、ui → main（ADR-39）、模拟层 → ui（本条）。
- 模拟层现在可以在完全没有视图的环境里跑完整逻辑，而这由用例保证。
- 剩下的架构债：main.js 6000+ 行（现在依赖方向理顺了，可以动了）、
  CFG 1110 行单层对象、以及本条留下的「颜色 → 语义等级」。
