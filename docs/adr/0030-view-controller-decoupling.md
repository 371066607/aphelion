# ADR-39: 拆掉 ui.js → main.js 的 27 处反向依赖

## 状态
已通过（Accepted） · 2026-09-07

前置：[ADR-38 模拟循环单一归属](0029-module-layering.md)

---

## 上下文

ADR-38 把模拟层（colony/combat）对 `APH.Main` 的 12 处反向调用清零，
但写护栏 `tests/layering.test.js` 时当场抓到一处我没数到的：
**ui.js 有 27 处 `APH.Main.`** —— 视图反向调控制器。

当时没有硬修，而是登记进棘轮（`MAIN_DEBT = { 'ui.js': 27 }`）：
数字可见、不许增长、修一处删一行。这份 ADR 就是来删那一行的。

### 27 处不是一种问题，是三种

| 类别 | 例子 | 病灶 |
|---|---|---|
| 存档 | `saveMetaQuiet` `saveRivals` `saveColony` `loadRivals` | 持久化逻辑住在 main，谁想存档谁就得认识 main |
| 领域查询 | `haveStock` `playerDefPower` `applyTech` | 领域知识住在 main，且 ui 各留了一份 fallback |
| 命令派发 | `togglePlayerDraft` `cycleZoneFilter` … | 视图直接点名控制器 |

### 棘轮数不到的那 10 处

命令派发这一类写成：

```js
h += '<button onclick="window.APH.Main&&APH.Main.togglePlayerDraft()">征召</button>';
```

`layering.test.js` 的 `codeOf` 会剥掉字符串字面量再判定 —— 而这些调用
**正好住在字符串里**。所以真实数字是 37：27 处代码 + 10 处藏在 HTML 属性里，
护栏对后者完全没有视野。**一个只数得到自己看得见的东西的护栏，会让人误以为债更小。**

### ui 的 fallback 已经在分叉了

这是 ADR-37「念头上下文两份」的同一个病，只是换了张脸：

```js
function getStock(key){
  if(window.APH.Main && APH.Main.haveStock) return APH.Main.haveStock(key);
  /* ↓ main 缺席时的 fallback —— 它不认识地上堆 */
  return (s.meta.res && s.meta.res[key]) || 0;
}
```

main 那份 `haveStock` 算 `仓 + 地上堆`，ui 的 fallback 只算仓。
外交面板的「我有多少矿可以纳贡」在两条路径下会给出不同答案。

---

## 决策

三类各归各家，**不是把 27 个调用换个写法，而是让 ui 根本不需要认识 main**。

### 1. 存档 → 谁的状态谁存

原先 `saveColony` / `saveRivals` 不但住在 main，还**绕开 `APH.Save` 直接写裸
`localStorage`** —— 于是 Save 那层为隐私模式/测试环境做的内存兜底对它们无效，
存档会静默丢失。

- `APH.Save.metaQuiet()` —— meta 的静默保存
- `APH.Save.loadColony()` / `saveColony(colony)` —— 键仍是 `aphelion_colony_v1`
- `APH.Save.loadRivalStates()` / `saveRivalStates(list)` —— 键仍是 `aphelion_rivals_v1`
- `APH.Colony.persist()` —— 落盘前先 `serializeGround` 进 `colony.ground`
- `APH.Rivals.hydrateStates()` / `persistStates()` —— 含老存档字段补齐

键名一个没动，老存档照常读得到。

**势力关系存的是数组**，走不了 `Save.read/write`（`migrate` 只认存档对象，
会把数组判成损坏并返回 null）。这一对直接用 `rawGet/rawSet`，仍享有内存兜底。

一个刻意的行为变化：殖民地存档现在经过 `migrate`，因此**未来版本的殖民地存档会抛错**
而不是静默回退成空殖民地。这是 ADR-2 的既定契约，且这里更该如此 —— 静默回退意味着
下一次 `Colony.persist()` 会把那份更新的存档覆盖掉。boot 本来就整体包在 try 里。

### 2. 领域查询 → 下沉到概念的归属地

`APH.Colony.haveStock` / `playerDefPower` / `applyTech` / `applyAllTech`。
`TECHS` 表本来就住在 Colony，科技效果的应用也该在那里。
main 与 ui 各留转发壳，**两边不再各自实现一遍**。

### 3. 命令派发 → 命令表

ui.js 持有一张表，main 在**加载期**（不是 boot 期 —— 面板可能在 boot 前就被渲染）
把实现挂进来：

```js
/* ui.js */                          /* main.js */
var commands = {};                   APH.UI.registerCommands({
function cmd(name){                    togglePlayerDraft:togglePlayerDraft,
  var f = commands[name];              cycleZoneFilter:cycleZoneFilter,
  if(typeof f !== 'function') return;  ...
  return f.apply(null, ...);         });
}
```

按钮变成 `onclick="APH.UI.cmd('togglePlayerDraft')"`。
未注册的命令**静默 no-op**，不抛错。

---

## 护栏

1. `MAIN_DEBT` 从 `{ 'ui.js': 27 }` 变成 `{}`，`ALLOWED` 里的 `'ui.js': ['Main']` 删除
   —— 现在任何模块反向调 main 都直接红。
2. **新增一条只剥注释、保留字符串的用例**，专门堵 `onclick="…APH.Main…"`
   这个棘轮数不到的洞。
3. `tests/ui_modals.test.js` 新增 9 条命令表用例：未注册静默 no-op、参数透传、
   返回值回传、同名覆盖、检查器 HTML 不含 `APH.Main`、点击链路真的接得上。
4. `tests/core.test.js` 新增 8 条：殖民地/势力关系存档往返、数组不被 migrate 判损坏、
   老存档字段补齐、`persist` 确实序列化地上堆、`haveStock` 确实算上地上堆。

---

## 验证

```
python3 build.py        → ✓ game.html
node tests/run.js       → 803 通过 / 0 失败   (795 → 803)
node tests/scenario.js  → 162 通过 / 0 失败
node tests/perf.test.js → 4 通过 / 0 失败
node tests/boss.test.js → 7 通过 / 0 失败
node tests/ui_modals.test.js → 77 通过 / 0 失败  (68 → 77)
```

实机（无头 Chrome + CDP 驱动 `game.html?autostart=1`）：
检查器 HTML 不含 `APH.Main`、含 `APH.UI.cmd('togglePlayerDraft')`；
**派真实鼠标事件点那颗按钮**，`playerDrafted` 翻转，console 零错误。
—— 内联 onclick 是测试跑不到的地方，必须真点一次。

`src/ui.js` 的 `APH.Main` 出现次数：**37 → 0**（连注释里的说明性引用也一并改写掉，
免得日后 grep 出假阳性）。

---

## 后果

- ui.js 不再认识 main。视图与控制器之间只剩两条窄口：命令表、事件总线。
- 顺带修掉两个真 bug：ui 的 `getStock` fallback 漏算地上堆；
  殖民地与势力存档绕开 Save 的降级兜底。
- 剩下的架构债见 BACKLOG：模拟层直接驱动 UI（combat 38 / colony 5）、
  main.js 6000+ 行、CFG 单层对象。

## 教训

**护栏只挡得住它看得见的东西。** 27 是 `codeOf` 剥完字符串后的数字，
真实是 37；差的 10 处恰恰是最脏的一类 —— 从 HTML 属性里跨模块调用。
写护栏时要多问一句：*我这次测量，漏掉了哪一类写法？*
