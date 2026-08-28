# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

《远日点 Aphelion》：2.5D 俯视外星游戏——殖民地经营(主城) ↔ 星球远征(副本：勘测/战斗/搜刮)。核心循环：探索勘测(氧气管理) → 战斗掉落 → 回殖民地建造/科技 → 战争攻防。LLM 驱动星球差异化，无 API 时静默走程序降级。

**设计支柱「殖民地优先」不可动摇**：出生永远在家，星球是副本，资源只在殖民地花。

## 常用命令

```bash
python3 build.py                  # 构建: 内联 src/*.js → game.html (唯一分发文件)
node tests/run.js                 # 全部单元测试 (90 用例)
node tests/run.js core.test.js    # 单个测试文件
node tests/scenario.test.js       # 场景链路冒烟 (独立入口，自带 DOM 桩)
node tests/perf.test.js           # 性能护栏测试 (独立入口)
node tests/boss.test.js           # Boss 掉落测试 (独立入口)
```

- 预览：浏览器直接打开 `game.html`；调试参数 `?autostart=1`(跳过开场)、`exp=1`(直接远征)、`debugmark`(视口中心标记)。无 dev server、无依赖安装。
- **完成标准：构建绿 + 全部测试绿**（scenario/perf/boss 也要跑）。
- `game.html` 是构建产物，禁止手改；改动一律进 `src/*.js` 后重新构建。
- `src/sprite_data.js` 是自动生成的 base64 贴图数据，禁止手改。

## 架构

### 无打包器内联管线 (ADR-7)

`build.py` 按 `MODULE_ORDER` 数组的手工声明顺序，把每个 `src/*.js` 过 `node --check` 后内联进 `template.html` 的 `<!--SCRIPTS-->` 注入点。**新模块必须加进 MODULE_ORDER**；模块间禁止隐式依赖、禁止裸全局，一律挂 `window.APH.*` 命名空间：

| 模块 | 挂载 | 职责 |
|---|---|---|
| config.js | `APH.CFG` | 全局数值表 (ADR-10: 代码零魔数) |
| utils.js | `APH.U` | 工具 + 事件总线 `on/off/emit` (ADR-8) |
| humanoid.js | `APH.Humanoid` | 人形 pose 缝：朝向/走停/脸/包 → sheet+帧 (ADR-0001) |
| save.js | `APH.Save` | 三层存档读写/迁移收口 |
| planet.js | `APH.Planet` | PlanetSpec 生成/tier 难度 |
| llm.js | `APH.LLM` | OpenAI 兼容适配器+双层缓存+配额 |
| colony.js | `APH.Colony` | 建筑/建造队列/科技/生产 |
| rivals.js | `APH.Rivals` | 敌对殖民地战争态势 |
| events.js | `APH.Events` | 事件叙事者：财富值威胁标尺+事件卡组+喘息窗口 (ADR-12) |
| residents.js | `APH.Res` | 居民六维技能/心情/饱食/社交 |
| combat.js | `APH.Combat` | 战斗/炮塔/士兵/Boss |
| world.js | `APH.World` | 地形/视口/昼夜 |
| entities.js | `APH.Ent` | 统一实体列表渲染/更新/Y排序 |
| sfx.js | `APH.SFX` | 音效 |
| sprite_data.js | 数据 | base64 序列帧贴图 (自动生成) |
| sprites.js | `APH.Sprites` | sheet 注册/切帧/动画推进/环境融合 tint |
| ui.js / main.js | `APH.UI` / `APH.state`·`APH.Main` | HUD 浮层 / 全局状态+输入+主循环 |

### 锁定的关键契约 (DESIGN.md ADR 表，改前先在文档追加修订记录)

- **ADR-2 存档**：localStorage 三层 `aphelion_meta` / `aphelion_planet_<id>` / `aphelion_rivals_<id>`，各带版本号；迁移只走 `save.js` 的 migrate 入口。
- **ADR-1 PlanetSpec**：字段只增不改不删，顶层带 `v:1`——它是所有系统的交汇点。
- **ADR-3 统一实体列表**：所有世界对象进 `state.entities[]` + `type` 标签，共用 Y排序/碰撞/序列化循环。
- **ADR-4 坐标**：世界单位=像素；逻辑格网 48px；世界 2200×2200。
- **ADR-5 双 RNG**：mulberry32 seeded(世界生成/掉落判定) ∥ Math.random(纯表现)。可复现性从第一天起。
- **ADR-6 时间**：渲染变步长 dt≤50ms；殖民地/AI 发展固定 30s 生产 tick；非 running 态不 update。
- **ADR-9 ID 前缀永不重命名**：`fx_`阵营 `it_`物品 `bl_`建筑 `bk_`信标 `rv_`敌殖民 `lw_`法则 `ev_`事件（存档引用兼容）。
- **ADR-10 数据/逻辑分离**：LLM 只产 schema 内数据；数值全进 CFG 表。LLM 配置存运行时 meta，**代码中永远没有 API key**。

### 视觉资产管线 (ADR-11)

生图(codex exec，动森风统一色板) → PIL 切帧缩放 128 格 → `python3 assets/build_sprites.py`(建筑/敌人质心配准；走循环 `*_walk_sheet` 脚底对齐 + 实测定 idleFrames+重生成 sprite_data.js) → sprites.js 注册加载渲染(无图回退程序化绘制)。建筑 8 帧 sheet；人形走 32 帧横排 + idle 16 帧另张（ADR-0001）；敌人按状态选帧。建筑昼夜渲染=原版/tint 版整张切换，**全不透明，禁止用透明度混合**(用户红线)；日常只播实测平静帧，未配准合格的 sheet 静态帧 0。

### 测试体系

- `tests/run.js`：零框架自研测试器，打桩 window/localStorage/document；只加载无 DOM 依赖的逻辑模块。**测试文件必须纯注册式**(不能顶层 exit，否则破坏扫描机制)；每用例前自动清空存档保证隔离。
- scenario/perf/boss 自带完整 DOM 桩并加载含 main.js 的全部模块，独立入口运行。
- 业务逻辑写成纯函数导出(node 可测)，DOM 只留在渲染层——新功能照此模式。

## 工作流约定

- 三份文档各司其职：`DESIGN.md`(架构决策+铁律) / `BACKLOG.md`(待办清单+用户红线) / `JOURNAL.md`(夜班日志，**只追加不覆写**)。
- 做完一项待办：勾选 `[x]` + 在 JOURNAL.md 追加一条(时间戳/做了什么/验证证据/下一步)；没实质进展也写明 no-op。
- 工程铁律：一切 JS 内联(预览环境挂相对路径 script)；交互必须有键盘等价路径；端到端验证用标题探针/DOM 断言而非截图比对。

## 用户红线 (BACKLOG「已知不做」)

不做文字聊天玩法、不回退 3D、不加"重生"叙事；不动 `/Volumes/DevSpace/tuite` 等 X 运营资产；不加任何 API key。

## 已知深坑 (JOURNAL 血泪史)

- **同名函数重复定义静默覆盖**：函数提升会让后定义覆盖前者，`node --check` 不报错——entities.js 曾因此双 `drawBuilding` 导致历次"验证通过"全是死代码。
- **canvas 默认尺寸污染**：布局完成前 `getBoundingClientRect()` 返回 300×200 默认值会锁死视口——涉及显示尺寸的测量必须防御布局时序。
- **bash 关联数组在管道子 shell 中展开失败**：批量生图曾因此 10 张 prompt 相同——批处理用 python 循环逐张调用并做 MD5 唯一性校验。
- **测试构造须遵守世界规则**：如敌人 y 坐标被 clamp ≥30，违反规则的测试数据会产生假阳性/假阴性。

## Agent skills

### Issue tracker

GitHub Issues via `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (root `CONTEXT.md` + `docs/adr/`). See `docs/agents/domain.md`.

