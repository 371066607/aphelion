# ADR-43: 绘制层与访客系统独立成模块

## 状态
已通过（Accepted） · 2026-09-07

前置：[ADR-41/42 main.js 拆分第一批](0032-colony-tick-module.md)

---

## 上下文

拆分第二批。先量了四块候选的耦合度，**按耦合度从低到高做**：

| 候选 | 行数 | 依赖的 main 本地函数 | 结论 |
|---|---|---|---|
| 绘制层 | 328 | 4（`vpW`/`vpH`/`selectedPawnEnt`/`updateCmdPanel`） | 本批做 |
| 访客系统 | 206 | 6（其中 4 个已是转发壳） | 本批做 |
| `updateResidents` | 473 | 10（多个是实打实的大函数） | 留待下批 |
| `bindInput` | 597 | 16 | 留待下批 |

先量再切，比按行数排序有用得多：`bindInput` 最大，却是最不该先动的。

---

## 决策

### 绘制层 → `src/draw.js`（`APH.Draw`，349 行）

搬之前先修一处：`drawSelectedRing` 会在选中者离场时顺手
`s.selectedRid=null; updateCmdPanel();` —— **绘制函数改 state**。
一帧画两次就解除两次；而且它和「清理已死亡实体的规划标记」是同一类事
（实体没了，指向它的东西要跟着清），所以归拢进 `syncHomeChrome`。

`vpW`/`vpH` 是两行视口读取，随模块一起走；`selectedPawnEnt` 就是一次实体查找，
下沉成 `APH.Ent.selectedPawn()` —— 绘制层与输入层都要问这个问题，
谁都不该为此认识 main。

### 访客系统 → `src/visitors.js`（`APH.Visitors`，232 行）

13 处 `floatText` + 1 处 `setHint` 按 ADR-40 的既定形态改成 `U.emit`。
`nibblePile` 下沉 `APH.Colony`（它就是从地上堆里拿走 n 份）。

招募成功后要同步世界侧的居民实体，但实体池归 main 管，所以：

```js
/* visitors.js */              /* main.js */
U.emit('rosterChanged', {});   U.on('rosterChanged', () => syncResidentEntities());
```

---

## 两个搬出来才暴露的问题

### 1. 绘制层读着 main 的闭包变量（会每帧 ReferenceError）

`drawOrderDragBox` / `drawPawnDragBox` 读了 **6 个 main 的模块级 `var`**：

```js
var orderDrag=false, orderFrom=null, orderTo=null;
var pawnDrag=false, pawnDragStart=null, pawnDragEnd=null;
```

搬进 `draw.js` 之后它们全变成未定义 —— **一旦开始拖框选就每帧抛异常**。

是新写的「绘制层不得改动 state」那条用例先炸出来的（`orderDrag is not defined`），
不是靠人去点。修法不是把 `var` 一起搬过去（那样输入层又读不到了），
而是**它本来就是输入与绘制共享的状态，归 `APH.state`**。

### 2. `selfCenter` 从来没有被调用过

T11 的相机自愈保护（DPR/iframe 缩放导致画面偏移时硬对齐），
**全项目没有任何地方调用它** —— 写完就没接上。

没有删：它是有意写的异常保护。但它改的是相机而不是绘制，
所以放回 main 的相机段，并在注释里写明「当前无调用者」。
要不要接进 `updateCamera`，进 BACKLOG 待拍板。

---

## 结果

```
src/draw.js       349 行   APH.Draw      对 UI/Main 引用 0
src/visitors.js   232 行   APH.Visitors  对 UI/Main 引用 0
src/main.js      5297 → 4787 行
```

累计（ADR-41/42/43）：**6048 → 4787 行，−1261**。

## 护栏

- `layering.test.js` 的两条模拟层用例把 `visitors.js` 与 `draw.js` 一并纳入。
- `core.test.js` +5：招募成功发且只发一次 `rosterChanged`、过客实体退场；
  没粮请客给出原因；无订阅者时访客系统照跑；
  **绘制层画一遍不改 state**（就是这条抓到了闭包变量）；
  `Ent.selectedPawn` 只认活着的居民实体。

## 验证

```
python3 build.py             → ✓ game.html
node tests/run.js            → 826 通过 / 0 失败   (821 → 826)
node tests/scenario.js       → 162 通过 / 0 失败
node tests/perf.test.js      → 4 通过 / 0 失败
node tests/boss.test.js      → 7 通过 / 0 失败
node tests/ui_modals.test.js → 89 通过 / 0 失败
```

实机（无头 Chrome + CDP，**派真实鼠标拖拽**）：

```
拖拽中: {"pawnDrag":true,"start":{...},"end":{...}}   ← 框选矩形正常渲染(见截图)
松手后: {"pawnDrag":false}
强刷过客: {"before":0,"after":1,"name":"格里·四号","hasBio":true}
console 错误: (无)
```

拖框选是闭包变量泄漏最直接的现场，所以必须真拖一次。

---

## 后果

- 下批（已进 BACKLOG）：`updateResidents` ~470 行、`bindInput` ~597 行。
- 关于 `bindInput`：它是 DOM 事件绑定，**未必该搬**。
  main 是组合根，把外部事件接到各模块上本来就是它的活。
  真要动，该拆的是它内部那些顺手写在处理器里的业务逻辑，而不是绑定本身。
