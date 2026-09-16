# ADR-50: 袭击必须有出口 —— 久攻不下即撤

## 状态

已落地（2026-09-16，#210）。`CFG.raidTactics.giveUpSec` 是数据表里的唯一旋钮。

## 上下文

家园袭击的结束条件只有两个：场上敌人全部被清掉（杀、击倒后俘虏都算），或者伤亡比例达到 `routAt`（0.6）触发溃退。两条都由玩家驱动，而且都需要「对敌人造成伤害」：

- 炮塔只会**击倒**，不会击杀；
- 玩家的合法处置是**俘虏**（ADR-47），俘虏按 `!e.captured` 从敌军里排除；
- 溃退计数 `casualties` 只统计**击杀**，击倒与俘虏都不进去；
- 敌人自己的逃跑条件 `CFG.enemy.fleeHpPct = 0.22` 也只在挨打掉血后才可能触发。

于是存在一条没有任何出口的状态：**残血敌人打不动、也逃不掉，`war.raidActive` 永远为真**。战时工作门控（`resident_work.js` 的安全房间判定、`thoughtCtxAt` 的 `raid` 上下文）会让居民拒绝正常出工 → 没人补燃料 → 没人取暖 → 室温掉到 −10℃ → 低体温、感染、全灭，而袭击仍然挂着。

这条路径在六日生存长测里被实测抓到（`docs/evidence/colony-home/season.json`）：袭击持续 8647 秒时，场上还剩两个 `state:'attack'`、hp 15/12、未倒地未俘获的袭击者蹲在离庇护所 120 的**围墙内侧**，而六座炮塔全部 `powered:true` 却在墙外打不到；`casualties:0`，`wavesLeft:0`，三居民随后冻饿而死。`pillage` 战术本来有 `stealCap`（「偷够即走」，`main.js` 里已有 `⚠ 盗掠者偷够就跑!` 分支），但 `assault`（强攻）——也是精英双波最常用的战术——**一条撤离条件都没有**。

## 决策

给袭击加一条与战术无关的耐心上限：

1. `CFG.raidTactics.giveUpSec = 600`（秒，游戏内时钟）。`startRaid` 记 `s.war.beganAt = s.clock`，`tickRaid` 在战斗进行中的每帧比较 `s.clock - beganAt > giveUpSec`。
2. 到点调用**既有的** `Combat.raidRetreat(s, msg, escaped)`，不新增撤离实现：它会把所有存活敌人置 `retreat`（由「溃退者背向家园撤离、越界消失」分支回收）、清零 `wavesLeft`/`betweenWaves`、广播 `raidEnded` 并发提示。`escaped` 取 `war.stolen > 0`（偷了东西就是「满载而归」，否则只是「久攻不下，敌军撤走」）。
3. 旧档没有 `beganAt` 时在 `tickRaid` 首帧补记，避免读档即撤。
4. `pillage` 的 `stealCap` 仍然先到先算；`routAt` 的伤亡溃退优先级不变（`raidRetreat` 自身有 `routed` 幂等守卫）。

语义上这是「强攻没有耐心」：打不出结果就带走战利品撤走，而不是把殖民地锁死到饿死。玩家侧的对抗手段（击倒后俘虏、主动开火、修塔补电）一条都没变，只是不再存在无限对峙。

## 结果

- 袭击仍然可以输：居民照样会被打死、建筑照样会被拆、战利品照样会被偷走。变的只有「残兵永远杵在场上」这一种状态不再可能。
- 战时门控有了最大持续时间，殖民地的后勤链不会因为一场无法推进的战斗而永久停摆。
- 长测里 `raid.resolved` 这条断言重新变得可达；此前它自 ADR-47 落地后就没再有机会成立。

## 护栏

- 常量只在 `CFG.raidTactics` 里（ADR-10，代码零魔数）。
- 不改 `routAt`、`stealCap`、`fleeHpPct`、`attR` 等既有平衡参数；不新增第二种撤离实现。
- 撤离必须走 `retreat` 回收分支，不能让 `raidRetreat` 直接删实体——否则赃物掉落与 `raidEnded` 事件的时序会变。

## 验证

- `tests/combat_subsystem.test.js`「#210 combat: 久攻不下的袭击必须撤走并解除 raidActive」：三段落 ——（1）未到时限不得提前撤走；（2）超过时限进入撤退且所有存活敌人置 `retreat`；（3）残兵真的走出 `fleeDespawnR` 被回收后，终盘结算把 `raidActive` 落下；（4）旧档缺 `beganAt` 时首帧补记而不立即撤走。
- 六日生存长测另见 `docs/evidence/colony-home/season.json`（`raidStuck` 现场 + `raid.resolved`）。
- 1062 单元 / 146 scenario / 5 perf / 7 boss 全绿；`game.html` 重建字节一致。
