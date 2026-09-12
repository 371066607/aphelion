# 暖色迫降殖民地图集

用于 `?prototype=building-v4` 的静态俯视家具与材质。所有源矩形实测于 1254×1254 原稿，不假设生图器准确遵守等分网格。目的尺寸由建造模型决定，旋转不改变逻辑面积。

- `warm-settlement-atlas.raw.png`：内置 `image_gen` 原始输出，保留来源，含烘焙棋盘背景，**不能用于运行时**。
- `warm-settlement-atlas.png`：沿 ADR-11 PIL 管线准备的 RGBA 图集，清除中性亮背景和边缘残留；暖色枕头、舱板及三种材质保留。
- `warm-settlement-atlas.prompt.txt`：生成及透明底修正的完整提示词。生图修正一次超时、一次仍输出 RGB，因此最终使用原稿经现有管线准备。

仅更换原稿时准备资源（Pillow 12.3.0）：

```sh
python3 assets/prepare_building_art.py
python3 build.py
```

普通 `python3 build.py` 只使用标准库，校验成品尺寸/位深/RGBA 后生成 `src/building_art_data.js` 并内联进 `game.html`，不重跑 PIL、不改 `src/sprite_data.js`。

发布前需跑 `tests/building_proto_canvas.cjs`：真实 alpha、代码回退与图集两轮 13×4 旋转占格、图标范围及缩放接缝检查。加载错误回退逻辑与 RGB 原稿构建拒绝同时在默认 `tests/run.js` 中覆盖。
