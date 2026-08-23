# 《远日点 Aphelion》设计文档

一句话：2.5D 俯视外星勘测 → 战斗搜刮 → 殖民地经营 → 攻打 AI 殖民地。
LLM 驱动每颗星球的差异化（法则/信标档案/敌人基因），无 API 也可玩（程序降级）。

## 核心循环
探索勘测(氧气管理) → 战斗(掉落负重) → 回殖民地(建造/科技) → 战争(攻防 AI 殖民地) → 更强的探索

## 目录
- prototypes/     历代原型（只读参考）：v2_topdown 是已认可方向
- src/            模块源码（config/utils/save/llm/planet/world/entities/combat/loot/colony/rivals/ui/main）
- template.html   HTML 骨架（含 SCRIPTS 注入点）
- build.py        构建脚本：内联 src/*.js → game.html（强制 node --check + 尾部断言）
- game.html       构建产物（唯一分发文件）
- tests/run.js    极简 node 测试器

## 工程铁律（本会话踩坑换来的）
1. 一切 JS 内联——预览环境挂起相对路径 script src
2. 构建必过 node --check——严格模式语法错误会静默炸整块脚本
3. 构建后断言产物以 </html> 结尾——write 大文件曾截断
4. 交互必须有键盘等价路径；验证用标题探针而非截图


---

## 架构决策记录（ADR）——2026-08-23 锁定

> 改动任何一条之前，先在这里追加修订记录并说明理由。

| # | 决策 | 内容 | 为什么现在锁 |
|---|---|---|---|
| ADR-1 | PlanetSpec 契约 | 字段按路线图 §1.2 定稿；顶层带 `v:1`；只增不改，废弃字段不删 | 所有系统的交汇点，改动=存档迁移+prompt重写 |
| ADR-2 | 存档结构 | 三层 `aphelion_meta` / `aphelion_planet_<id>` / `aphelion_rivals_<id>`，各带 `v`；预留 `migrate(save)` 入口 | 版本迁移的唯一收口点 |
| ADR-3 | 统一实体列表 | 合并原型散数组为 `entities[]` + `type` 标签；Y排序/碰撞/序列化共用一份循环 | 晚改一个月=重写渲染层 |
| ADR-4 | 坐标制 | 世界单位=像素；逻辑格网 48px（刷怪/建造吸附/寻路用格）；世界 2200×2200 | 战斗公式与刷怪表的基础假设 |
| ADR-5 | 双 RNG | mulberry32 seeded（世界生成/掉落判定）∥ Math.random（纯表现） | 可复现性必须从第一天开始 |
| ADR-6 | 时间模型 | 渲染=变步长 dt≤50ms；殖民地/AI发展=固定 30s 游戏时 tick；非 running 态不跑 update | 物理与经济一致性的地基 |
| ADR-7 | 命名空间 | 模块显式挂 `window.APH.*`；build.py 手工声明加载顺序；禁止裸全局 | 无打包器约束下的模块化唯一解 |
| ADR-8 | 事件总线 | 20行 pub/sub；combat→loot/UI/音效/存档全解耦 | 现在加≈0 成本，后补=全项目改 |
| ADR-9 | ID 前缀 | `fx_`阵营 `it_`物品 `bl_`建筑 `bk_`信标 `rv_`敌殖民 `lw_`法则；定后永不重命名 | 存档/掉落表引用兼容性 |
| ADR-10 | 数据/逻辑分离 | LLM 只产 schema 内数据；数值全部进 CFG 表，代码零魔数 | 已有决策的强制化 |

**暂缓决策**（改动成本不随时间增长）：渲染特效、UI 布局、平衡数值、敌人行为参数、音频、瞄准方式。
