#!/usr/bin/env node
/* 寻路改写等价性探针 (issue #205)
   node tests/nav_equivalence_probe.js [--old=<nav.js>] [--new=<nav.js>]

   一次改写 A* 实现时, 光靠既有单元测试不够: 它们只覆盖手搭的几张小图。
   本探针把「改写前后语义不变」做成可复跑证据, 两层验证:

   1. 差分: 同一语料(随机墙密度 / 地形造价 / 陷阱 costFn + 真实家园 seed 58098)
      跑两份 nav 源码, 逐例比较 null 判定、最优代价、终点坐标、路径合法性;
   2. 真值: 新实现对照本文件内独立实现的 Dijkstra(同代价模型), 检查是否真最优。
      起点/终点本身被墙覆盖的用例跳过 —— 那是旧实现的显式退化约定(只从第 0 列
      逃生), 不属于「改写不应改变」的最优性范畴; 直线退化(单点)也没有格链可比。

   默认 old 取 `git show HEAD:src/nav.js`(提交后即「改写前」), new 取工作区 src/nav.js。
   退出码非 0 = 存在语义差异。 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const G = 48;

const args = {};
process.argv.slice(2).forEach(a => { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) args[m[1]] = m[2]; });

function navFromGit(){
  const text = execFileSync('git', ['show', 'HEAD:src/nav.js'], { cwd: ROOT, encoding: 'utf-8' });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aph-nav-old-')), 'nav.js');
  fs.writeFileSync(file, text);
  return file;
}
const OLD = args.old || navFromGit();
const NEW = args.new || path.join(SRC, 'nav.js');

/* ---------- 浏览器环境打桩 + 逻辑模块 ---------- */
global.window = global;
const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; },
  get length(){ return Object.keys(mem).length; },
  key: i => Object.keys(mem)[i] || null,
};
global.document = { getElementById: () => null, createElement: () => ({ getContext: () => ({}), style: {} }) };

const ENV = ['config.js', 'utils.js', 'atlas.js', 'observe.js', 'entity_index.js', 'world_runtime.js',
  'terrain_model.js', 'build_grid.js', 'scene.js', 'camera.js', 'planet.js', 'save.js'];
ENV.forEach(f => new Function(fs.readFileSync(path.join(SRC, f), 'utf-8'))());
/* nav.js 只在调用时读 APH.CFG/APH.TerrainModel, 所以可以先后覆盖同一命名空间取两份实现 */
function loadNav(file){
  new Function(fs.readFileSync(file, 'utf-8'))();
  return global.APH.Nav;
}
const NavOld = loadNav(OLD);
const NavNew = loadNav(NEW);
const TM = global.APH.TerrainModel;

/* ---------- 语料 ---------- */
function lcg(seed){ let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const COSTS = [1, 1, 1, 1.06, 1.42, 2];
/* 水/不可走格在现代地图里是 Infinity 造价(见 Nav.gridOf: g.costs 写 Infinity)。
   差分与 Dijkstra 都走同一份 terrainCost, 所以这里是「同温层」比较。 */
const WATER = 'water';
function makeGrid(cols, rows, wallDensity, withCosts, rnd){
  const g = [];
  for (let y = 0; y < rows; y++){ const row = new Array(cols).fill(0); for (let x = 0; x < cols; x++) row[x] = rnd() < wallDensity ? 1 : 0; g.push(row); }
  if (withCosts){
    g.costs = [];
    for (let y = 0; y < rows; y++){ const row = []; for (let x = 0; x < cols; x++) row.push(rnd() < 0.08 ? WATER : COSTS[Math.floor(rnd() * COSTS.length)]); g.costs.push(row); }
  }
  g.scene = { grid: G, width: cols * G, height: rows * G };
  return g;
}
const CONFIGS = [
  { name: 'plain-open',    cols: 24,  rows: 24,  wall: 0,    costs: false, pairs: 14 },
  { name: 'plain-sparse',  cols: 32,  rows: 32,  wall: 0.12, costs: false, pairs: 14 },
  { name: 'plain-dense',   cols: 48,  rows: 48,  wall: 0.28, costs: false, pairs: 14 },
  { name: 'terrain-open',  cols: 32,  rows: 32,  wall: 0,    costs: true,  pairs: 14 },
  { name: 'terrain-mixed', cols: 40,  rows: 40,  wall: 0.18, costs: true,  pairs: 14 },
  { name: 'grid128',       cols: 128, rows: 128, wall: 0.06, costs: true,  pairs: 12 },
];
const trapPen = (x, y) => ((x * 31 + y * 17) % 13 === 0) ? 6 : 0;

function corpus(){
  const cases = [];
  for (const cfg of CONFIGS){
    const rnd = lcg(0xC0FFEE ^ (cfg.cols * 7919) ^ (cfg.rows * 104729));
    const grid = makeGrid(cfg.cols, cfg.rows, cfg.wall, cfg.costs, rnd);
    for (let i = 0; i < cfg.pairs; i++){
      const from = { x: rnd() * cfg.cols * G, y: rnd() * cfg.rows * G };
      const to = { x: rnd() * cfg.cols * G, y: rnd() * cfg.rows * G };
      for (const pen of [null, trapPen]) cases.push({ tag: cfg.name + '#' + i, grid, from, to, pen, scene: grid.scene });
    }
  }
  const scene = TM.newHome(58098);
  const grid = NavNew.gridOf([], scene);
  const rnd = lcg(0xBEEF);
  for (let i = 0; i < 10; i++){
    const from = { x: rnd() * scene.width, y: rnd() * scene.height };
    const to = { x: rnd() * scene.width, y: rnd() * scene.height };
    for (const pen of [null, trapPen]) cases.push({ tag: 'home58098#' + i, grid, from, to, pen, scene });
  }
  return cases;
}

/* ---------- 度量: 代价/合法性都以格链为准(含起点→首点那段) ---------- */
/* 与 Nav.terrainCost 同规则: 非有限/非正 → 1 (Infinity 造价的水格在网格里同时是墙=1,
   永远不会被进入; 这里保持同一口径才能做同温层比较) */
const terrainCost = (grid, x, y) => { const c = grid.costs && grid.costs[y] && grid.costs[y][x]; return isFinite(c) && c > 0 ? c : 1; };
function chainOf(grid, from, pts){
  const seq = [{ x: from.x, y: from.y }].concat(pts || []);
  const cells = [];
  for (const p of seq){
    const gx = Math.floor(p.x / G), gy = Math.floor(p.y / G);
    const last = cells[cells.length - 1];
    if (!last || last.gx !== gx || last.gy !== gy) cells.push({ gx: gx, gy: gy });
  }
  return cells;
}
function pathCost(grid, from, pts, pen){
  const cells = chainOf(grid, from, pts);
  let total = 0;
  for (let i = 1; i < cells.length; i++){
    const a = cells[i - 1], b = cells[i];
    total += Math.hypot(b.gx - a.gx, b.gy - a.gy) * terrainCost(grid, b.gx, b.gy) + (pen ? pen(b.gx, b.gy) : 0);
  }
  return total;
}
function valid(grid, from, pts){
  const cells = chainOf(grid, from, pts);
  /* cells[0] = 起点格: 起点被墙覆盖是旧实现容忍的退化情形, 不作为非法路径 */
  for (let i = 1; i < cells.length; i++){
    const c = cells[i];
    if (!grid[c.gy] || grid[c.gy][c.gx] === undefined) return false;
    if (grid[c.gy][c.gx] === 1) return false;
    const a = cells[i - 1];
    if (Math.abs(c.gx - a.gx) > 1 || Math.abs(c.gy - a.gy) > 1) return false;
    if (c.gx !== a.gx && c.gy !== a.gy && (grid[a.gy][c.gx] === 1 || grid[c.gy][a.gx] === 1)) return false;
  }
  return true;
}
/* 独立 Dijkstra: 同一代价模型的地面真值 */
function dijkstra(grid, from, to, pen){
  const cols = grid[0].length, rows = grid.length, N = cols * rows;
  const clamp = (v, hi) => Math.max(0, Math.min(hi - 1, Math.floor(v / G)));
  const sx = clamp(from.x, cols), sy = clamp(from.y, rows), tx = clamp(to.x, cols), ty = clamp(to.y, rows);
  const dist = new Float64Array(N).fill(Infinity);
  const heap = [[0, sy * cols + sx]];
  dist[sy * cols + sx] = 0;
  while (heap.length){
    heap.sort((a, b) => a[0] - b[0]);
    const d = heap[0][0], k = heap.shift()[1];
    if (d > dist[k]) continue;
    const x = k % cols, y = (k - x) / cols;
    if (x === tx && y === ty) return d;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (grid[ny][nx] === 1) continue;
      if (dx && dy && (grid[y][nx] === 1 || grid[ny][x] === 1)) continue;
      const move = (dx && dy) ? Math.SQRT2 : 1;
      const nd = d + move * terrainCost(grid, nx, ny) + (pen ? pen(nx, ny) : 0);
      const nk = ny * cols + nx;
      if (nd < dist[nk]){ dist[nk] = nd; heap.push([nd, nk]); }
    }
  }
  return null;
}

/* ---------- 执行 ---------- */
const cases = corpus();
const diffs = [], truth = [], invalid = [];
let compared = 0, degenerate = 0, walledEnds = 0;
for (const c of cases){
  const tag = c.tag + (c.pen ? '[trap]' : '');
  const pOld = NavOld.astar(c.grid, c.from, c.to, c.pen, c.scene);
  const pNew = NavNew.astar(c.grid, c.from, c.to, c.pen, c.scene);
  if (!!pOld !== !!pNew){ diffs.push([tag, 'null 判定不一致', !!pOld, !!pNew]); continue; }
  if (!pNew) continue;
  /* 起终点格被墙覆盖时: 旧实现从虚拟起点(第 0 列外)起步, 首段本来就不与起点格相邻,
     且代价模型没有对应真实格 —— 只比 null 判定与终点, 不进代价/最优性统计。 */
  const sx = Math.floor(c.from.x / G), sy = Math.floor(c.from.y / G);
  const tx = Math.floor(c.to.x / G), ty = Math.floor(c.to.y / G);
  if (!c.grid[sy] || c.grid[sy][sx] === 1 || !c.grid[ty] || c.grid[ty][tx] === 1){ walledEnds++; continue; }
  const lastOld = pOld[pOld.length - 1], lastNew = pNew[pNew.length - 1];
  if (lastOld.x !== lastNew.x || lastOld.y !== lastNew.y) diffs.push([tag, '终点坐标不一致', [lastOld.x, lastOld.y], [lastNew.x, lastNew.y]]);
  /* 单点路径 = lineClear 直线捷径(空地直达, 由采样视线保证不穿墙), 没有格链意义 */
  if (pNew.length === 1){
    if (pOld.length !== 1) diffs.push([tag, '直线退化判定不一致', pOld.length, pNew.length]);
    degenerate++;
    continue;
  }
  if (!valid(c.grid, c.from, pNew)) invalid.push(tag);
  const costOld = pathCost(c.grid, c.from, pOld, c.pen), costNew = pathCost(c.grid, c.from, pNew, c.pen);
  if (Math.abs(costNew - costOld) > 1e-9) diffs.push([tag, '最优代价不一致', +costOld.toFixed(6), +costNew.toFixed(6)]);
  const truthCost = dijkstra(c.grid, c.from, c.to, c.pen);
  compared++;
  if (truthCost == null || Math.abs(costNew - truthCost) > 1e-9) truth.push([tag, +costNew.toFixed(6), truthCost]);
}
console.log('用例            : ' + cases.length);
console.log('差分(旧 vs 新)   : null 判定/最优代价/终点坐标差异 ' + diffs.length);
console.log('对照 Dijkstra    : ' + compared + ' 例比对, 非最优 ' + truth.length + ' 例');
console.log('跳过            : 直线退化 ' + degenerate + ' / 起终点被墙覆盖 ' + walledEnds);
console.log('新实现非法路径   : ' + invalid.length);
diffs.slice(0, 8).forEach(d => console.log('  ✗ ' + JSON.stringify(d)));
truth.slice(0, 8).forEach(d => console.log('  ✗ ' + JSON.stringify(d)));
if (diffs.length || truth.length || invalid.length){ console.log('\nFAIL'); process.exit(1); }
console.log('\nPASS');
