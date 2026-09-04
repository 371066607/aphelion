# UI 模态生命周期收拢至深 UI 模块（Modal Management Seam）

## 背景
随着游戏系统（外交、游商、科技树、居民名册、图鉴、建造）不断扩充，`src/main.js` 已膨胀至 4,305 行。其中近 1,400 行（约 33% 体积）纯粹是 6 大全屏或抽屉面板的 DOM 创建、字符串拼装、按键监听与状态控制代码。
这种浅接口编排带来了严重的架构摩擦：
1. **局部性缺失**：修改一个面板的 UI 样式或按钮，必须进入主循环文件 `main.js`；
2. **状态泄露与悬挂**：各面板各自手工写 `state.mode = 'paused'` 与 `state.mode = 'running'`，容易在异常关闭时产生状态死锁；
3. **按键拦截混乱**：Esc 键和功能快捷键（O/R/T/B）在 `main.js` 中存在长达数百行的级联 `if (!overlayClosed(...))` 检查；
4. **单测成本高昂**：场景测试需要为 `main.js` 打桩大量无实质业务意义的 DOM 节点与方法。

## 决策

1. **深化 `src/ui.js`，对外提供统一的 `APH.UI.Modals` / `APH.UI` 接缝**：
   - 不增加独立文件，不改动 `build.py` 的加载流水线；将 `ui.js` 从纯 HUD 扩展为完整的界面深模块。
   - 对外只暴露高阶语义接缝：
     - `APH.UI.open(modalId, options)`
     - `APH.UI.close(modalId)`
     - `APH.UI.toggle(modalId, options)`
     - `APH.UI.closeActive()`（Esc 键统一一键关闭）
     - `APH.UI.hasActiveModal()`（供按键/主循环查询是否存在阻断级模态）
     - `APH.UI.getActiveModal()`

2. **模态分类与自动暂停不变量保证**：
   - **全屏模态 (Full Overlays)**：`diplomacy` (外交)、`roster` (名册)、`codex` (图鉴)、`techTree` (科技树)、`trade` (游商交易)、`llmSettings` (设置)。
     - **行为**：全屏互斥展示；打开时自动保存前序 `state.mode` 并挂起游戏主循环（`state.mode = 'paused'`）；关闭时自动恢复前序状态；独占 Esc 与键盘交互。
   - **抽屉式组件 (Docked Drawer)**：`buildCatalog` (建造栏)。
     - **行为**：非互斥、非暂停；允许玩家在背景继续移动视口并挑选建筑蓝图。

3. **单例挂载与按需惰性渲染（Singleton Mount + Lazy Render）**：
   - 面板的宿主根节点在页面中以单例形式常驻（`display: none`），避免反复 `document.createElement` 带来的 GC 抖动与全局监听器泄漏；
   - 每次 `open` 时按需调取渲染纯函数注入当前最新的殖民地状态。

4. **`main.js` 全面瘦身**：
   - 从 `main.js` 彻底剥离所有面板的具体 DOM 拼接与 `closeColonyOverlays` 代码，降幅约 1,400 行；
   - 键盘监听器全部收敛为一行语义动作分发。

## 后果
- `src/main.js` 体积将直接回落至 ~2,900 行，大幅提升代码的可读性与 AI 维护效率。
- 模态的打开、关闭与 Esc 栈式管理在 `APH.UI` 内部严格闭环，消灭游戏暂停态死锁隐患。
- 场景测试无需为 `main.js` 逐一伪造复杂的弹窗 DOM 结构，单测接缝更为轻便。
