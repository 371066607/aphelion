# ADR-33: 指针输入并入统一分发器

## 状态
已通过（Accepted） · 2026-09-07

## 上下文

ADR-19 建了 `APH.Input`：上下文栈 + 动作分发 + `modal:*` 阻断。键盘完全走它——
`main.js` 里**零**裸键盘分支。

指针没有。画布上的 `pointerdown` / `pointermove` / `pointerup` / `contextmenu`
是四个裸 `addEventListener`，包着 200 多行拖拽、框选、右键上下文逻辑。

而环世界的手感**主要就是指针**（拉框规划、框选小人、右键强制微操）。
最需要抽象的那一半，恰恰是唯一没有抽象的。模态是否该挡住画布点击，也散落在
各处零散判断里。

## 决策

`input.js` 补上对称的一半，但**不搬玩法**：

- 监听与上下文判定收进 `APH.Input.bindPointer(el)`，派发
  `POINTER_DOWN` / `POINTER_MOVE` / `POINTER_UP` / `POINTER_CONTEXT`。
- payload 归一化：`{ type, event, button, pointerId, clientX, clientY, tool, context }`。
- **工具单一真源**：`setToolProvider(fn)` —— Input 反过来问游戏「现在什么工具」，
  而不是自己存一份（避免与 `s.orderTool` / `s.buildMode` 失同步）。
  工具形如 `order:chop` / `build:bl_wall` / `select`。
- **模态阻断与键盘一致**，但 `pointerup` / `pointermove` 永远放行——
  否则拖拽中途弹出模态会让拖拽永远结束不了（拖拽状态机卡死）。
- `main.js` 的处理器体**一行没改**，只是从 `cv.addEventListener(...)` 改为
  `onPointer('POINTER_*', fn)` 注册；`onPointer` 适配旧的事件签名，
  且在 `APH.Input` 缺席时回退到裸监听。

## 后果

- 画布世界输入的四个裸监听消失；`main.js` 剩下的是虚拟摇杆与 HUD 按钮点击，
  那些是 DOM 控件，本就该留在 DOM 上。
- 「现在是什么工具、这一下该不该被模态吃掉」有了唯一的判定处。
- 由 `tests/input.test.js` 覆盖：派发与 payload、模态阻断与 up/move 放行、
  右键 button=2、`toolProvider` 抛错回退 `select`。

## 没做

指针**按键位映射表**（类似 `CFG.keybindings`）暂不做——现在只有左键/右键两种，
表会比逻辑长。等出现第三种指针语义再引入。
