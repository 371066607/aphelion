# 输入动作分发器与活动上下文栈（Input Dispatcher & Context Stack）

## 背景
此前全游戏的键盘与交互输入直接硬编码在 `src/main.js` 的 `bindInput()` 函数中（长达 450 行）。
这种浅接口上帝监听器带来了多重摩擦：
1. **按键冲突与上下文判断失控**：同一组按键（如方向键、数字键、回车键）在游戏大地图、居民名册面板、游商交易面板、科技树地图中有着截然不同的语义，但全都挤在主循环的同一层 `keydown` 监听器里，依靠层层冗长脆弱的 DOM 判空守卫进行逻辑拦截；
2. **缺乏数据/逻辑分离（违背 ADR-10）**：物理按键（如 `KeyE`, `KeyF`, `KeyO`）与具体业务逻辑硬编码混写，无法实现键位重映射或手柄/触控按键复用；
3. **单测繁琐**：测试必须在 DOM 桩中手工构造复杂的 `KeyboardEvent` 对象并触发 `window.dispatchEvent`，无法针对高阶意图（Intent）进行纯逻辑测试。

## 决策

1. **新建 `src/input.js`，对外挂载 `APH.Input` 深模块**：
   - 纳入 `build.py` 的 `MODULE_ORDER`（位于 `utils.js` 之后、`entities.js` 之前）；
   - 对外暴露高阶接缝：
     - `APH.Input.bind()`：挂载 DOM 监听；
     - `APH.Input.pushContext(ctxId)` / `popContext(ctxId)` / `currentContext()`：活动上下文栈管理；
     - `APH.Input.onAction(actionName, handler)`：注册语义动作响应；
     - `APH.Input.dispatchAction(actionName, payload)`：测试与代码直接派发动作；
     - `APH.Input.dispatchKey(code, type)`：模拟物理按键。

2. **活动上下文栈（Context Stack）优先级分发**：
   - 系统维护一个上下文栈 `contextStack = ['game']`；
   - 打开模态面板时，`APH.UI` 自动执行 `APH.Input.pushContext('modal:' + modalId)`；关闭时自动 `popContext()`；
   - 键盘按下时，优先从栈顶上下文查找按键绑定的动作（Action）；若栈顶未消费，且非模态独占上下文，才回退到栈底基础上下文；
   - 全局兜底动作（如 `Escape`、`KeyM` 静音）具备全局抢先判定，一键关闭栈顶模态并弹出上下文。

3. **键位映射配置化（恪守 ADR-10 零魔数）**：
   - 在 `src/config.js` 中声明 `CFG.keybindings`，按上下文隔离物理按键到语义动作的映射关系：
     - `game`：`KeyE -> INTERACT`, `KeyF -> SECONDARY_INTERACT`, `KeySpace/KeyJ -> FIRE_PLASMA`, `KeyO -> TOGGLE_DIPLOMACY` 等；
     - `modal:roster`：`Digit0~3 -> SET_PRIO`, `ArrowUp/Down/Left/Right -> CURSOR_MOVE` 等；
     - `modal:trade`：`Digit0~9 -> QUICK_TRADE`, `Enter -> CONFIRM_TRADE` 等；
     - `modal:techMap`：`ArrowUp/Down/Left/Right -> TECH_MOVE`, `Enter -> BUY_TECH` 等。

4. **主模块 `src/main.js` 按键逻辑解耦**：
   - 彻底删除 `main.js` 中 400 余行基于 `e.code` 的 `if/switch` 分支；
   - 业务逻辑声明式订阅 `APH.Input.onAction('INTERACT', ...)`，关注“发生了什么意图”，而非“按下了哪个键”。

## 后果
- 根除了按键跨界面互相踩踏、快捷键误触发的顽疾；
- 场景测试与单元测试可直接调用 `dispatchAction`，脱离对浏览器真实事件对象的强依赖；
- 为后续可能的按键自定义（Key Rebiding）和虚拟按键映射预留了天然接缝。
