# 殖民地子系统推进接缝深化与上帝函数收拢（Colony Subsystem Simulation Seams）

## 背景
此前，家园主循环 `src/main.js: updateHome(dt)` 高达 410 行，扮演了一个超级上帝函数的角色。
虽然 `colony.js`、`residents.js`、`combat.js` 拥有丰富的领域纯函数，但具体执行**何时推进蓝图、何时同步实体进度、何时触发电网 BFS、何时分发产物掉落、何时计算炮塔开火后坐、何时调度敌人多波次刷怪与溃退**等大量核心时序细节，全部被暴露并硬编码在 `updateHome` 中。
这种浅接口编排造成了明显的架构摩擦：
1. **主循环深度耦合底层细节**：`main.js` 承担了过多不属于编排层的具体物理和状态突变；
2. **缺乏领域局部性 (Loss of Locality)**：维护建造或战斗规则时，经常需要同时修改领域模块和 `updateHome` 内部手写的分支；
3. **调用顺序隐患**：例如电网供电结算与建筑耗电标记、蓝图完工与防卡墙位移，在主循环中稍有顺序变动即引发逻辑 Bug。

## 决策

1. **经济与建造推进收拢至 `APH.Colony` 深模块**：
   - `APH.Colony.tickConstruction(state, dt)`：
     - 整合建造岗工人就近判定、施工进度推进（`queueTick`）、施工扬尘粒子、蓝图实体进度同步、完工出队并实体化建筑、格上静态物处理与防卡墙推挤、以及存档触发。
   - `APH.Colony.tickProduction(state, dt)`：
     - 整合 30 秒大时钟生产周期：建筑离线衰减、电网供电 BFS（`powerSettle` 与 `applyPowerState`）、气候法则折算（`harvestMods`）、各岗位产出（采矿/科研/农场/工坊/牧场）、地面战利品掉落生成（`spawnDrop`），并顺次触发居民状态拍与 AI 势力成长。

2. **战争与防务推进收拢至 `APH.Combat` 深模块**：
   - `APH.Combat.tickRaid(state, dt)`：
     - 整合袭击预警倒计时与自动开战；
     - 炮塔索敌、通电开火判定、冷却与炮管后坐转向动画；
     - 围攻扎营期判定（`siegeTick`）与双波次集结倒计时；
     - 边缘/营地敌军波次刷怪、伤亡溃退与击退胜利盘点。

3. **`updateHome` 蜕变为极简的高层时序调度器**：
   - 将 `updateHome` 压缩为 ~25 行纯粹的阶段调度：
     ```javascript
     function updateHome(dt){
       var s = APH.state;
       updateHomePlayerAndHints(dt);       // 玩家移动/就近交互状态与HUD提示
       updateVisitors(dt);                 // 过客游荡与拜访
       APH.Colony.tickConstruction(s, dt); // 建造子系统推进
       APH.Colony.tickProduction(s, dt);   // 经济与生产结算
       APH.Combat.tickRaid(s, dt);         // 战争防务与波次
       APH.Combat.updateDropped(dt);       // 地面战利品
       updateHomeShortageHint();           // 短缺告警提示
     }
     ```

4. **严格保持数据契约不变**：
   - 保持 `s.colony.buildings`、`s.colony.buildQueue`、`s.war` 的原生引用与数据结构不变，完全契合 ADR-1、ADR-2 与 ADR-3。

## 后果
- `src/main.js` 中的 410 行上帝循环被彻底解构，主循环聚焦于系统间的高层时序组织；
- 建造、生产、防务规则获得了高度集中的代码局部性，未来扩充新建筑、新产线或新敌战术无需触碰 `main.js`；
- 单测可以直接针对 `tickConstruction`、`tickProduction`、`tickRaid` 进行细粒度自动化断言。
