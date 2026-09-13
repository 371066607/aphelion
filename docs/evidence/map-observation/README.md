# 地图观测修复正式验收（#204）

本目录只记录 #197 系列在最终正式 `game.html` 上的验收证据。自动化夹具和人工新档流程分开陈述，二者不能互相替代。

最终构建由 `python3 build.py` 从 `template.html`、`src/*.js` 和构建脚本直接读取的视觉资产生成，大小 41,977,626 字节，SHA-256 为 `19b8d718dbeb54ad73b26b464833545c73941b24bb63fce28d6000e13f5441fb`。精确输入哈希见 [build-fingerprint.json](build-fingerprint.json)。

## 回归覆盖矩阵

| 验收场景 | 自动化证据 | 结论与边界 |
| --- | --- | --- |
| 默认新家园 | `tests/save_colony_migration.test.js` 的 `#199 new home`；`tests/scenario.test.js` 的 `#199 boot`；[人工新档](manual-fresh-save.md) | 新档在 running 前已有 128×128 Observation；人工入口仍从家园出生并可移动、建造。 |
| 零水体 | `tests/observe.test.js` 的 `#198 零水体`；`tests/map_single_source.test.js` 的 `#200 player`；scenario 的 `#200 世界渲染` | 无水 Observation 不产生水格、干湖岸、旧圆湖绘制或隐形碰撞。 |
| legacy 2200 | `tests/map_single_source.test.js` 的 generation 0 边界；scenario 的 `#202 legacy revisit` | 旧 2200×2200 星球保留固定湖、原 ID 和原始 PlanetSpec 字节，不静默补 Observation。 |
| generation 1 迁移 | `tests/save_colony_migration.test.js` 的 `#199 generation 1 migration` 与 `snapshotted once` | 旧确定性地图只快照一次，地面、资源、建筑和已付蓝图保持不变。 |
| 未知星首次远征 | `tests/expedition_destination.test.js` 的 `#201 new planet/discovery`；scenario 的 `#201 unknown destination` | 提交后才生成并持久化 PlanetSpec/Observation，落盘成功后才建立 Active Run。 |
| 已观测星重访与标题 | `tests/expedition_destination.test.js` 的 `#202 atlas/visit`；scenario 的 `#202 revisit`、`#204 LLM enrichment`；[双世界浏览器探针](automated-dual-world.json) | 重访读取同一 PlanetSpec，不重观测；首次着陆、LLM 富化、刷新和重访都显示同一名称与群系。浏览器探针的移动和货物是显式夹具。 |
| 采集、刷新、返航、新 Run | scenario 的 `#203 expedition resources`；[双世界浏览器探针](automated-dual-world.json)；[人工新档](manual-fresh-save.md) | 运行时保存采集/货物，返航只结算一次，再次着陆从持久 Observation 开新副本。人工流程没有写状态或注入货物。 |
| 128×128 / 20 居民 / 约 2000 对象 | [主性能记录](performance.json)、[重复 1](performance-repeat-1.json)、[重复 2](performance-repeat-2.json)、[基线比较](performance-comparison.json) | 三次最终实测 frame CPU p95 为 6.2–7.4ms；20 次 A* 为 71.1–73.5ms；三类浏览器错误均为 0。 |

## 自动化浏览器证据

[automated-dual-world.json](automated-dual-world.json) 使用隔离 Chrome profile 和正式 planner DOM，覆盖 DOM `button.click()` 首次提交、队员移动、刷新、幂等返航、纯键盘选择原星重访、访问次数 1→2、PlanetSpec 字节不变和返航后强制重选。对应画面为 [普通家园](automated-ordinary-home.png)、[远征](automated-expedition.png) 和 [返航家园](automated-returned-home.png)。它为缩短链路显式设置移动目标和 2 件货物，因此只算自动化状态/交互证据；首次提交也不是鼠标输入证明。该探针监听 Runtime exception 与 console error，记录的 `runtimeErrors` 为 0，没有启用 Chrome Log 域。

复现命令：

```bash
node tests/dual_world_live_probe.js /tmp/aphelion-map-observation-dual
```

| 探针输出 | 仓库证据文件 |
| --- | --- |
| `/tmp/aphelion-map-observation-dual/report.json` | `automated-dual-world.json` |
| `/tmp/aphelion-map-observation-dual/ordinary-home.png` | `automated-ordinary-home.png` |
| `/tmp/aphelion-map-observation-dual/expedition-squad.png` | `automated-expedition.png` |
| `/tmp/aphelion-map-observation-dual/returned-home.png` | `automated-returned-home.png` |

## 性能与存档边界

性能探针固定家园 seed `58098`，与既有 `docs/evidence/colony-home/performance.json` 使用相同 128×128、20 居民、Chrome 152 和 1280×657 环境。当前地图有 2059 个世界对象，历史基线为 2144 个，都满足“约 2000 对象”。

- frame CPU p95：历史 5.9ms，最终三次 7.4 / 6.2 / 6.5ms；帧间隔 p95 为 16.7–16.8ms。
- 20 次 A*：历史 52.6ms，最终 73.5 / 71.7 / 71.1ms，即每条 3.555–3.675ms。当前路线总长 1582 格，历史为 1504 格；网格身份复用均成立。
- 存档：历史 743,481 字节，当前主记录 1,090,398 字节（+46.66%）。新增 Observation 的精确 envelope 增量为 398,208 字节；移除该增量后为 692,190 字节，比历史低 6.90%。`homeRuntime` 没有第二份 `worldDescriptor/Observation`。
- 主记录持久化 8.4ms、JSON 序列化 3.0ms；三次性能探针监听 Runtime、console 与 Log 三类错误，均为 0。

复现三轮命令：

```bash
node tests/colony_perf_live_probe.js /tmp/aphelion-map-observation-perf
node tests/colony_perf_live_probe.js /tmp/aphelion-map-observation-perf-repeat-1
node tests/colony_perf_live_probe.js /tmp/aphelion-map-observation-perf-repeat-2
```

三个输出目录中的 `report.json` 依次对应 `performance.json`、`performance-repeat-1.json` 和 `performance-repeat-2.json`；`performance-comparison.json` 由这三份记录与 `docs/evidence/colony-home/performance.json` 逐项计算。

这次接受的边界是：Observation 作为“一次观测、长期复用”的事实必须进入家园存档，因此存档体积和序列化成本会上升；当前没有重复副本，实际帧 CPU 仍有明显余量。若后续地图尺寸、观测字段或保存频率继续增长，再评估紧凑编码或拆分 blob；本次不为单一 128×128 快照引入新存档格式。

## 最终门禁

最终源码重建后，`node tests/run.js` 为 1060/1060，`node tests/scenario.test.js` 为 145/145，`node tests/perf.test.js` 为 5/5，`node tests/boss.test.js` 为 7/7；`git diff --check` 通过。浏览器探针和普通入口人工流程是额外的正式产物证据，不计入这些 Node 用例。

人工普通入口证据及浏览器日志边界见 [manual-fresh-save.md](manual-fresh-save.md)。
