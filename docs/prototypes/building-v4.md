# 房间试建 v4（#186）

状态：独立、可丢弃的玩法原型。正式建造系统迁移须等玩家验收后另拆任务。

## 打开

在 `prototype/building-v4` 分支执行 `python3 build.py`。浏览器打开本目录对应的 `game.html`，地址末尾加 `?prototype=building-v4`。

本次工作区的完整地址：

```text
file:///Users/mac/aphelion-building-v4/game.html?prototype=building-v4
```

入口在 `main.js` 的整个初始化之前返回。原型状态只存在内存；不读取、迁移或写回任何正式存档。刷新恢复示范，“空地重建”清除的仅是本次试建。

## 要回答的问题

统一 48px 俯视格、墙体邻接和真实家具占地之后，玩家是否能直接围出可用的卧室和工作间？建造范围、看见的图形、居民通路与电网连接是否一致？

示范是一间 5×5 内部卧室和相邻的 6×5 工作间，共用一道带门的墙，各有外门。内有三张床、病床、餐桌椅、科研台、厨房台、工作台、货架；发电机在外部，导线接到工作台。

## 操作

| 动作 | 操作 |
|---|---|
| 连续墙 / 导线 | 选工具，左键拖直线 |
| 地板 | 左键拖矩形 |
| 家具 / 门 | 左键放蓝图，空闲居民走到现场施工 |
| 旋转 | 建造状态下 R 或“旋转”按钮 |
| 键盘放置 | 选工具后方向键选格，Enter 放置 |
| 取消工具 | Esc / 右键 |
| 居民命令 | 先选人，右键地面移动，右键床 / 椅子 / 工作台使用 |
| 键盘居民命令 | Tab 选居民；地图方向键选格，Enter 选家具，再 Tab 到检查器动作按钮执行 |
| 拆除 | 开启拆除并选建筑 / 地板 / 导线层；只删除该层 |
| 镜头 | 中键拖动 / WASD 平移，滚轮缩放，Home 适配 |
| 观察环境 | 网格 V、屋顶 H、电力 P；右侧选择晴 / 雨 / 寒潮 / 热浪 |
| 时间 | 暂停按钮 / 地图聚焦时 Space，速度按钮切换 1–3 倍 |

## 原型契约

- 实例 `{uid,bid,gx,gy,rotation}`，左上角为整数格锚点；`footprint/cellsOf/rectOf` 是唯一几何来源。
- 墙门椅 1×1、床/病床 1×2、工作台/货架 2×1、餐桌/发电机 2×2。旋转交换实际宽高。
- 建筑实体、地板、导线、自动屋顶分层；地板和导线可以铺在实体下面。
- 四邻接墙体沿共同边连续绘制；门参与围合且可通行。
- 固体家具阻挡通行，使用时预约对象及可达互动格。拆除、断电或堵路会释放失效任务。
- 蓝图占规划位而不挡路；居民走到邻接位置施工，不能在居民所在格完成固体建筑。
- 房间根据墙门围合形成，屋顶默认隐藏；室内外环境影响以原型温度和效率体现。
- 建筑由格内 Canvas 绘图生成，人物复用已有序列帧。原型不改正式资产，不生成或复制第三方游戏贴图。

## 实现边界

`building_proto_model.js` 负责纯模型，`building_proto_draw.js` 负责绘制，`building_proto.js` 负责本模式的输入与 DOM。它们在普通入口加载时无启动副作用。正常入口、殖民地存档和正式建造接口维持原有行为。

这是交互验证场，不接正式资源扣款、任务经济、战斗、医疗效果、完整天气导演或存档迁移。室内效率仅用于比较环境保护，不构成生产平衡结论。

## 验证与验收

```sh
python3 build.py
node tests/run.js
node tests/scenario.test.js
node tests/perf.test.js
node tests/boss.test.js
node tests/ui_modals.test.js
node tests/building_proto.test.js
node tests/building_proto_boot.test.js
node tests/building_proto_ui.test.js
```

Node 模型测试覆盖占地、层叠、房间、命令、预约、路径及施工；入口探针覆盖精确 query 和不触碰正式初始化；DOM 探针按构建顺序加载全部模块，检查零存档访问、控制器事件、键盘选择和停止后重启。

可选离线绘图取证脚本 `tests/building_proto_canvas.cjs` 不属于默认零依赖测试套件。它需要在仓库外临时安装 `@napi-rs/canvas@1.0.8`，再通过 `NODE_PATH` 运行：

```sh
npm install --prefix /tmp/aphelion-building-qa @napi-rs/canvas@1.0.8 --no-audit --no-fund
NODE_PATH=/tmp/aphelion-building-qa/node_modules node tests/building_proto_canvas.cjs docs/prototypes/evidence/building-v4-canvas.png
```

该脚本对 13 类建筑 × 4 方向的实际世界绘制与图标检查边界，检查地板/导线蓝图可见、非整数缩放墙缝，再复用实际人物贴图与 `drawWorld` 导出 [离线画面](evidence/building-v4-canvas.png)。不新增项目运行依赖。

浏览器本地 URL 自动访问被安全策略拒绝，未使用其他浏览器、代理 URL 或服务器绕过。因此浏览器实机视觉和操作手感仍由玩家在上述入口验收，Node / 离线绘图结果不等同于浏览器验收。

建议验收顺序：旋转床贴墙摆放 → 三人穿门使用床/工作台 → 拆共用墙观察合并 → 补墙观察分间 → 断一格导线观察停工 → 雨天拆外墙观察失去屋顶保护 → 空地重建一间房。确认后再转正式规格和实施票据，不能直接把此原型合入主线当作完成迁移。
