# 新建筑与遗迹实体视觉资产批量补票（Visual Asset Batch for New Buildings & Ruins Entities）

## 背景
自 Spec #128~#147 四大系统战役落地以来，新增了 9 种建筑/遗迹实体与 1 种机械族敌人，全部使用程序化 Canvas 回退绘制。按照 ADR-11 视觉资产管线规范，所有建筑应有 codex exec 生成的 8 帧 sheet（动森风统一色板），敌人有专属序列帧。`bl_crop_plot`（外星种植圃）自 Issue #38 落地以来也一直缺失 sheet。本次统一补票消灭全部程序化回退。

## 决策

1. **逐张 codex exec 生成（非批量管道）**：
   - 12 次独立生图调用（11 个建筑 + 1 个敌人），每次精准 prompt；
   - 全部走 `codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox -C <tmpdir> - < prompt.txt` 管线；
   - 输出统一 PNG，然后走 `chroma_key.py` → `build_sprites.py` → `sprite_data.js` 内联管线。

2. **动森风统一色板 + 遗迹美学点缀**：
   - 基底色板严格遵循 ADR-11：奶油 #f7f3df / 薄荷 #19c8b9 / 深棕描边 #4c3c33 / 纯绿抠图底 #00FF00；
   - 遗迹系建筑（ancient_wall/gate/terminal/vault/heavy_turret/ancient_generator）点缀青铜色 #b87333 与冷青色 #00e5ff 表达史前科技感；
   - 电暖器（bl_heater）偏暖橙色 #ff8c42；制冷空调（bl_cooler）偏冷蓝 #4fc3f7。

3. **遗迹特殊构件渲染策略**：
   - `ancient_wall`、`ancient_terminal`、`ancient_vault` 走静态 8 帧 sheet（idle:1）；
   - `ancient_gate` 走静态 8 帧 sheet 但运行时叠加程序化青色力场发光层（呼吸动画由渲染层控制，不进 sheet）；
   - 远古构件的金属质感用青铜+冷青双色表达，不引入暗黑冷色调。

4. **机械哨兵敌人 8 帧全规格**：
   - 帧 0-1: 待机（双帧呼吸闪烁）；
   - 帧 2-3: 移动（机械步进）；
   - 帧 4-5: 蓄力发射（脉冲光束展开到击发）；
   - 帧 6: 受击闪烁；
   - 帧 7: 死亡爆散；
   - 与现有敌人（enemy_lighteater 等）保持同规格 2048×256。

5. **bl_crop_plot 历史欠账补票**：
   - 外星种植圃一次性补上 8 帧 sheet（idle:1 静态），消灭最后一个程序化回退建筑。

## 新增 sheet 清单（12 张）

| Sheet 键名 | 实体名 | 帧数 | 描述 |
|---|---|---|---|
| bl_storage_shelf | 置物货架 | 8 | 1×1 木质多层架 |
| bl_heater | 电暖器 | 8 | 暖橙色调方形供暖设备 |
| bl_cooler | 制冷空调 | 8 | 冷蓝色调方形出风口设备 |
| bl_heavy_turret | 等离子重炮 | 8 | 青铜底座+冷青炮管 |
| bl_ancient_generator | 史前永恒发电机 | 8 | 青铜+冷青发光核心装置 |
| bl_crop_plot | 外星种植圃 | 8 | 木质田垄+异星作物 |
| ancient_wall | 远古石壁 | 8 | 青铜铭文符线封闭墙块 |
| ancient_gate | 能量闸门 | 8 | 青铜框架+冷青能量门 |
| ancient_terminal | 古代终端 | 8 | 青铜控制台+冷青屏幕 |
| ancient_vault | 远古遗物箱 | 8 | 金铜色宝箱+冷青锁芯 |
| enemy_automaton | 远古哨兵机械体 | 8 | 青铜+冷青机械八足蜘蛛 |

## 后果
- 消灭全部程序化 Canvas 回退绘制，所有建筑与敌人拥有 codex 生成的动森风统一贴图；
- 远征遗迹地牢从抽象色块变为有质感的古代石室场景；
- `sprite_data.js` 增加 ~12 张 base64 内联数据（约 +500KB），构建体积可控；
- SPRITE_META 需根据 build_sprites.py 实测输出同步 baseline/contentH/idleFrames。
