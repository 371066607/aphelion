# ADR-31: 念头驱动心情（心情从累加器改为「基线 + 念头之和」）

## 状态
已通过（Accepted） · 2026-09-07

## 上下文

`CFG.thoughts` 里有 28 条环世界式念头，`collectThoughts` / `thoughtMoodSum`
实现完整、单测齐全，检查器也把它们连同一个合计值渲染出来。

但这套东西的调用方**只有 `ui.js` 和测试**——`main.js` 零引用。

真正驱动模拟的心情，是 `residents.js` 里散落十几处的累加式算术：

```js
if(r.food>wellF && r.mood<cap) r.mood += wellG;
else if(r.food<stAt)           r.mood = Math.max(0, r.mood-stN);
if(r.illness>moodSickAt)       r.mood = Math.max(0, r.mood-moodSick);
if(r.bedId)                    r.mood += bedMood;
if(r.recreation >= recBuffAt)  r.mood += recBuffMood;
```

外加 `residentsTick` 里两次事后加减（T9 房间品质、ADR-22 同室死敌）。

后果：**检查器在对玩家撒谎**。面板上那行「念头 -12」与真正决定小人会不会
崩溃的 `r.mood`，是两套互不相干的数字。而且累加器模型本身不对——环世界的
心情是一个**水平值**（基线 + 各念头偏移），不是一路加减的余额。

## 决策

1. 心情 = `clamp(moodBase + thoughtMoodSum(collectThoughts(pawn, ctx)), floor, cap)`
   作为**目标值**，每生产跳按 `moodLerp` 缓动逼近，不再一跳到位。
2. `collectThoughts` 是**唯一权威**。`needsTick` 里所有针对饱食/病情/床铺/
   娱乐的 `r.mood ±= n` 全部删除；房间品质与同室死敌也改成念头。
3. `needsTick` 把当跳算出的清单挂到 `pawn.thoughts` / `pawn.moodTarget`；
   检查器**优先渲染这份清单**（`thoughtsHtml(pawn, ctx, precomputed)`），
   面板与模拟从此不可能分叉。
4. 幅度可变的念头（房间家具档次、关系恶劣程度）走 `addVar(id, mood)`：
   沿用目录文案，幅度由上下文给出——对应环世界的 opinion 类念头。
5. 新数值全进 CFG：`moodBase` / `moodLerp` / `moodFloor` / `thoughtCtx.*`。

## 后果

- 检查器里的每一条理由，都是真的在推动那个数字。
- 心情变化变平滑：一跳只走 34%，不再出现「吃一口饭心情跳 8 点」。
- **行为变更**：旧测试里断言「一跳后心情正好 +N」的，改成断言方向、收敛
  与念头在场（见 `tests/thoughts.test.js` / `survival.test.js` / `scenario.test.js`）。
- 指挥官（`meta.playerNeeds`）**没有 mood 字段**，其检查器念头面板仍是纯展示。
  要让指挥官心情也进模拟，是独立的一票（对应总计划 A8）。

## 上下文来源

`thoughtCtxAt(x, y, env)`（`main.js`）负责把世界状态翻译成 `collectThoughts`
认识的字段：房间/温度/庇护、袭击、污秽、火、尸体、篝火、房间品质、同室摩擦。
它与 `pawnWorldAt` 分工明确——那个回答「去哪干什么」，这个回答「此刻为什么难受」。
