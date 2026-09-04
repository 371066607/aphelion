# Aphelion 协作规范

> 本仓库多人共同维护（当前：371066607/Rain + da123wda）。
> 所有改动以 GitHub 为唯一真相源，认领/冲突/收尾一律走下面约定。

## 认领纪律（开工前必须做）

1. **开工前先占位**：`gh issue edit <n> --add-assignee @me`
   —— GitHub 上没有 assignee = 没人认领 = 别人可能撞车。认领是"session 第一次写操作"。
2. **被 Blocked by 卡住的票**：blocker 未全关不接（`Blocked by` 行全部 CLOSED 才解锁）。
3. **撞车即让路**：若发现别人已认领或已在本地做某票，**改做无关票**，不重复开工。

## 认领现状（2026-08-31 更新）

| 人 | 做过的票 | 进行中 | 备注 |
|---|---|---|---|
| **371066607 / Rain** | #59-#63 俯卧全套 / #66 睡觉 / #67 累塌 / #68 居民俯卧 / #69 病重躺舱 / #70 医疗舱 / #71 击倒叠伤 / #72 送医 / 建筑 v3 班 2 / 天气 W4 #89 / 架构深模块重构 4 期（#108-#127） / 居民人际网络与动态社交全套（#128-#132） / #134 置物货架与过滤 | #135 露天劣化与天气腐烂 | git 署名 `Rain <rain@kirin-media.com>` 与 GitHub 账号同一人 |
| **da123wda**（git 署名 wen_king） | #60 脸0俯卧图 / #64 生病走慢（已合入，已关） / T0 #84 建筑 v3 视觉资产（11 项 PNG，PR #90 merge） | — | 分支 `issue-60-face0-prone-sheet` 与 `issue-84-building-v3-sprites` 已 merge |
| **另一终端** | #65 粮边吃（已提交 82c3859） | — | 用户另一个终端在改，勿重复 |

**当前状态**：全部 open 票已关闭（#59-#89 全 done；建筑系统 v3 #73/#81/#82/#83、天气系统 #85-#89 全链完成）。待办已清空。

## 冲突规避

- **push 前先 pull**：`git pull --rebase origin main`，解决完再推。
- **禁止强推**：`push -f` 会覆盖别人的工作，一律不许。
- **分支可选**：票内改动可直推 main（仓库小、单人为主）；多人同票才开分支。
- **同文件并行**：发现别人本地在做相邻逻辑（如 #64 生病 vs #70 医疗舱），改做无关票或等对方落地。

## 收尾流程（做完一张票）

1. **评审**：对 diff 跑双轴 review（Standards 是否符合仓库约定 + Spec 是否满足验收标准）。
2. **构建 + 全量测试**：`python3 build.py` 绿 + `node tests/run.js`（+ scenario/perf/boss）全绿。
3. **提交**：中文 `type: 描述`（feat:/fix:/balance:/docs:/chore:），带票号 `(#n)`。
4. **推送**：`git push origin main`。
5. **issue 收尾**：`gh issue comment <n>`（做了什么 + 验证证据 + 下一步）→ `gh issue close <n>`。
6. **文档**：按各自约定更新 BACKLOG.md（勾 `[x]`）/ DESIGN.md（架构改动）/ JOURNAL.md（只追加）。

## 构建与测试铁律（不可绕过）

- 一切 JS 内联，`game.html` / `sprite_data.js` 是构建产物，**禁止手改**。
- 新模块必须进 `build.py` 的 `MODULE_ORDER`；模块间禁止隐式依赖，挂 `window.APH.*`。
- 完成标准 = **构建绿 + 全部测试绿**，缺一不可。

## 常用命令

```bash
# 认领
gh issue edit <n> --add-assignee @me
# 看别人的票
gh issue list --state open --json number,title,assignees
gh issue view <n>
# 构建 + 测试（cwd 必须在 aphelion/）
python3 build.py
cd aphelion && node tests/run.js
node tests/scenario.test.js && node tests/perf.test.js && node tests/boss.test.js
# 收尾
gh issue comment <n> --body "..."
gh issue close <n>
```

---

*本文档随协作状态更新：认领快照、避开区、约定变更都在这改。*
