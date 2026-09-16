# 渲染侧帧成本 profile（#208 定位证据）

固定 seed 58098、128×128 家园、20 居民、2059 世界对象的隔离 Chrome 里，对 120 个实测帧
开 CDP `Profiler`（采样间隔 100µs），原始 profile 见 [frame.cpuprofile](frame.cpuprofile)，
聚合见 [analysis.txt](analysis.txt)。

复现：把 `tests/colony_perf_live_probe.js` 复制一份，在 frame 测量块前后加
`Profiler.enable/setSamplingInterval(100)/start` 与 `Profiler.stop`（写到
`/tmp/aph_cpu.cpuprofile`），然后 `node <副本> /tmp/out`。副本必须放在 `tests/` 下 ——
探针按 `__dirname/../game.html` 解析入口。

## 结论

| 归属 | ms/帧 | 占比 |
| --- | --- | --- |
| `(native)`（画布光栅/浏览器内部） | 16.44 | 87.1% |
| `game.html`（全部游戏 JS） | 2.43 | 12.9% |
| 其中 `fillText` | 1.19 | 6.3% |
| 其中 `drawImage` | 0.97 | 5.1% |

JS 里排前面的自耗（ms/帧）：

1. **`EntityIndex.prepare` 0.31 + 它的 `signature` 回调 0.36 = 0.67** —— 每帧被调两次
   （`resident_work.js` 的 update 一次 + `world.js` 渲染前一次）。每次都要重建
   ~5×2059 项的签名数组再逐项比较；外加 GC 0.27ms/帧的一部分就是它的分配。
2. `pawnWorldAt` 0.26 —— 每个居民每帧一次实体查询。
3. `groundTally` 0.11 + `groundCount` 0.10 —— 内部是 4 次全表扫描，且 hints/ui/main
   三处各调一次。
4. `drawResidentMarks` 0.10、`render` 0.08、`nearestMeal` 0.07。

合计 JS ≈ 2.43ms/帧，而 frame CPU p95 是 7.4ms —— 差值主要是画布文本/贴图光栅与浏览器
开销。也就是说：**帧预算目前没有被游戏逻辑压住**（16.7ms 预算用掉约 44%），
优化空间集中在画布绘制（`fillText` 调用次数）与上面 1–3 的每帧全表扫描。
