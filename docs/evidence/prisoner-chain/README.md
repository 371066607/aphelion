# #189 俘虏身份链 —— 端到端证据

**产物**：`game.html`（2026-09-17 构建，41003KB，`</html>` 结尾）

**探针**：`probe.js`（headless Chrome + CDP；`node docs/evidence/prisoner-chain/probe.js`，脚本内写死本机 Chrome 路径）
做法：`?autostart=1` 冷启动 → `APH.Res.hostilePawn` 造一个人型袭击者 → `embodyHostile` 放到场上下地 → `capturePrisoner` 俘获 → 用真实渲染函数铺开检查器面板与名册面板 → 对检查器里的按钮做**真实 DOM 点击**。

| 步骤 | 实测（2026-09-17 11:33） |
|---|---|
| ① 面板渲染 | `prisoners=1`；检查器囚犯面板 1980 字符；名册 `#resBody` 21570 字符且含俘虏名字（`resHasName=true`） |
| ② 真点击「释放 · 他离开」 | 按钮标签 `["释放 · 他离开","招降入籍"]`；`meta.prisoners=0`；`body.retreat=true`、`captured=false`、`state='flee'`；名册面板立刻不再列出他（`rosterStillLists=false`） |
| ③ 截图 | `prisoner-panel.png`（名册俘虏区 + "已释放…他会自己离开" 飘字） |

**红灯对照（面板刷新）**：没有 `refreshRosterIfOpen` 时，② 的 `rosterStillLists=true` —— 上一版截图里名册仍挂着已释放的「白芷·六号」。这条正是靠截图发现的。

逻辑层的红灯环在 `tests/scenario.test.js`（#189 四条）：修前 3 红（`释放应返回被释放的那个人` / `M.recruitPrisoner is not a function` / `检查器应给释放出口`），修后 150 通过 / 0 失败。
