#!/usr/bin/env node
/* Aphelion 极简测试器: node tests/run.js [文件名.test.js ...]
   无框架依赖。为 src 模块打桩 window/localStorage。 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---- 浏览器环境打桩 ---- */
global.window = global;
const memStore = {};
global.localStorage = {
  getItem: k => (k in memStore ? memStore[k] : null),
  setItem: (k, v) => { memStore[k] = String(v); },
  removeItem: k => { delete memStore[k]; },
  get length() { return Object.keys(memStore).length; },
  key: i => Object.keys(memStore)[i] || null,
};
global.document = { getElementById: () => null };   // 逻辑模块不应触 DOM

/* ---- 微型用例注册器 ---- */
const cases = [];
function test(name, fn) { cases.push({ name, fn }); }
global.test = test;

/* ---- 加载被测模块(顺序同 build.py, 不含 DOM 依赖模块) ---- */
const SRC = path.join(__dirname, '..', 'src');
for (const f of ['config.js', 'utils.js', 'humanoid.js', 'save.js', 'planet.js', 'combat.js', 'colony.js', 'rivals.js', 'events.js', 'nav.js', 'weather.js', 'residents.js', 'sprites.js', 'llm.js']) {
  new Function(fs.readFileSync(path.join(SRC, f), 'utf-8'))();
}

/* ---- 加载测试文件 ---- */
const argFiles = process.argv.slice(2);
const EXCLUDE = ['scenario.test.js', 'perf.test.js', 'boss.test.js'];   // 独立入口(DOM桩/require)   // 独立入口(自带DOM桩+全模块加载)
let files = argFiles.length ? argFiles
  : fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && !EXCLUDE.includes(f));

/* ---- 执行 ---- */
let pass = 0, fail = 0;
for (const file of files) {
  const p = path.isAbsolute(file) ? file : path.join(__dirname, file);
  if (!fs.existsSync(p)) { console.error(`✗ 找不到 ${p}`); process.exit(1); }
  new Function('test', fs.readFileSync(p, 'utf-8'))(test);
}
console.log('');
for (const c of cases) {
  try {
    // 每个用例前清空存档, 保证隔离
    localStorage.clear && localStorage.clear();
    for (const k of Object.keys(memStore)) delete memStore[k];
    c.fn();
    pass++;
    console.log(`  ✓ ${c.name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${c.name}\n      ${e.message}`);
  }
}
console.log(`\n${pass} 通过 / ${fail} 失败 / 共 ${cases.length}`);
process.exit(fail ? 1 : 0);
