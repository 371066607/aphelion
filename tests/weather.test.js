/* W1 天气状态机 (ADR-15 / 0006)
   seams: APH.Weather.{tickWeather, weatherEffects, defaultWeather, weatherDefs}
   纯函数, 无 DOM。期望值手工推导。天气 12 种: wx_ 前缀 (ADR-9)。
   单位: dt=秒; 一天 = CFG.DAY_LEN(210s); meta.weather = {id, t} */
'use strict';
const W = window.APH.Weather;

/* ---------- 基础 ---------- */
test('weatherDefs: 11 种且全部 wx_ 前缀', () => {
  const defs = W.weatherDefs();
  const n = Object.keys(defs).length;
  if (n !== 11) throw new Error('应有11种(枚举为准): ' + n);
  for (const id in defs) if (!id.startsWith('wx_')) throw new Error('前缀违规: ' + id);
});

test('defaultWeather: 无老档→晴天', () => {
  const w = W.defaultWeather();
  if (w.id !== 'wx_clear' || w.t !== 0) throw new Error('默认应晴: ' + JSON.stringify(w));
});

/* ---------- tickWeather: 持续时长 ---------- */
test('tickWeather: 晴天持续(权重自身最大)→到时长后掷骰仍可继续晴', () => {
  // wx_clear: {wx_clear:4, ...} 首条自身; rng=0 → 命中 wx_clear (继续晴)
  const w = { id: 'wx_clear', t: 2000 };          // 超过任何 dur 上限(5天=1050s), 必掷
  const r = W.tickWeather(w, 210, () => 0);       // rng=0 → 第一权重 = wx_clear
  if (r.id !== 'wx_clear') throw new Error('rng=0应继续晴(自身权重最大): ' + r.id);
  if (r.t !== 0) throw new Error('掷后 t 应归零: ' + r.t);
});

/* 确定性抽选: rng→权重区间映射 */
test('tickWeather: 晴朗到时长后 rng=0.99 命中末位权重(雨/雪/雾之外的冷门)', () => {
  // wx_clear 转移: {wx_clear:4, wx_rain:3, wx_snow:2, wx_fog:1, wx_heat:1, wx_cold:1} total=12
  // rng=0.99*12=11.88 → 逐个减去: 4→7.88, 3→4.88, 2→2.88, 1→1.88, 1→0.88, 1→-0.12 → wx_cold
  const w = { id: 'wx_clear', t: 2000 };
  const r = W.tickWeather(w, 210, () => 0.99);
  if (r.id !== 'wx_cold') throw new Error('rng=0.99应命中末位 wx_cold: ' + r.id);
});

test('tickWeather: 冷却中的天气被排除(雷暴cd期内雨→雨不选雷暴)', () => {
  // 从 wx_rain 出发且 wx_thunder 在冷却 → 转移表排除 thunder
  // wx_rain: {wx_clear:4, wx_rain:3, wx_rain_heavy:2, wx_fog:2, wx_acid:1, wx_thunder:1} total=13
  // rng=0.999*13=12.987 → 4→8.987, 3→5.987, 2→3.987, 2→1.987, 1→0.987, 1→-0.013 → wx_thunder 被cd排除
  // 排除后 total=12: 4→8.987, 3→5.987, 2→3.987, 2→1.987, 1→0.987 → wx_acid(最后一个)
  const w = { id: 'wx_rain', t: 2000, cd: { wx_thunder: 500 } };
  const r = W.tickWeather(w, 210, () => 0.999);
  if (r.id === 'wx_thunder') throw new Error('冷却中不应选雷暴: ' + r.id);
  if (r.id !== 'wx_acid') throw new Error('排除后末位应 wx_acid: ' + r.id);
});

/* ---------- 冷却 ---------- */
test('tickWeather: 冷却只在非极端天气期间衰减', () => {
  // 极端天气(雷暴)期间: cd 不衰减
  let w = { id: 'wx_thunder', t: 0, cd: { wx_thunder: 630, wx_acid: 840 } };
  let r = W.tickWeather(w, 100, () => 0.5);
  if (r.cd.wx_thunder !== 630) throw new Error('极端期间cd不应衰减: ' + JSON.stringify(r.cd));
  // 晴期: cd 衰减
  w = { id: 'wx_clear', t: 0, cd: { wx_thunder: 630 } };
  r = W.tickWeather(w, 100, () => 0.5);
  if (!(r.cd.wx_thunder < 630)) throw new Error('非极端期间应衰减: ' + JSON.stringify(r.cd));
  // 衰减到负 → 移除
  w = { id: 'wx_clear', t: 0, cd: { wx_thunder: 50 } };
  r = W.tickWeather(w, 100, () => 0.5);
  if (r.cd && r.cd.wx_thunder) throw new Error('衰减完成后应移除: ' + JSON.stringify(r.cd));
});

/* ---------- 效果表 ---------- */
test('weatherEffects: 晴天基准无负面', () => {
  const e = W.weatherEffects('wx_clear');
  if (e.speedMul !== 1 || e.farmMul !== 1 || e.exposureGain !== 0 || e.enemySightMul !== 1 || e.solarMul !== 1)
    throw new Error('晴天基准: ' + JSON.stringify(e));
});

test('weatherEffects: 雨 speedMul=0.7 farmMul=1.3', () => {
  const e = W.weatherEffects('wx_rain');
  if (e.speedMul !== 0.7 || e.farmMul !== 1.3) throw new Error('雨: ' + JSON.stringify(e));
});

test('weatherEffects: 雷暴 exposureGain>0 solarMul=0.15', () => {
  const e = W.weatherEffects('wx_thunder');
  if (!(e.exposureGain > 0) || e.solarMul !== 0.15) throw new Error('雷暴: ' + JSON.stringify(e));
});

test('weatherEffects: 酸雨 farmMul=0.5(家园版减半)', () => {
  const e = W.weatherEffects('wx_acid');
  if (e.farmMul !== 0.5) throw new Error('酸雨: ' + JSON.stringify(e));
});

test('weatherEffects: 雾 enemySightMul=0.7', () => {
  const e = W.weatherEffects('wx_fog');
  if (e.enemySightMul !== 0.7) throw new Error('雾: ' + JSON.stringify(e));
});

test('weatherEffects: 寒潮 speedMul<1 且暴露>0', () => {
  const e = W.weatherEffects('wx_cold');
  if (!(e.speedMul < 1) || !(e.exposureGain > 0)) throw new Error('寒潮: ' + JSON.stringify(e));
});

test('weatherEffects: 未知天气→回退晴天', () => {
  const e = W.weatherEffects('wx_nonexistent');
  if (e.speedMul !== 1 || e.farmMul !== 1) throw new Error('未知: ' + JSON.stringify(e));
});

/* 数据驱动: 11 种天气 × 5 字段全表断言 (期望值来自 CFG 手工核对) */
test('weatherEffects: 全表 11×5 字段与 CFG 一致', () => {
  const E = {
    wx_clear:       { s:1,   f:1,   e:0,  n:1,   sol:1 },
    wx_rain:        { s:0.7, f:1.3, e:0,  n:1,   sol:0.5 },
    wx_rain_heavy:  { s:0.6, f:1.2, e:0,  n:1,   sol:0.3 },
    wx_thunder:     { s:0.6, f:1.1, e:10, n:1,   sol:0.15 },
    wx_snow:        { s:0.8, f:0.6, e:0,  n:1,   sol:0.4 },
    wx_blizzard:    { s:0.6, f:0.3, e:12, n:0.8, sol:0.2 },
    wx_heat:        { s:1,   f:1,   e:8,  n:1,   sol:1 },
    wx_cold:        { s:0.85,f:0.7, e:8,  n:1,   sol:0.9 },
    wx_acid:        { s:0.85,f:0.5, e:10, n:1,   sol:0.4 },
    wx_storm:       { s:1,   f:1,   e:0,  n:1,   sol:0.1 },
    wx_fog:         { s:1,   f:1,   e:0,  n:0.7, sol:0.6 },
  };
  for (const id in E){
    const got = W.weatherEffects(id);
    const exp = E[id];
    if (got.speedMul !== exp.s || got.farmMul !== exp.f || got.exposureGain !== exp.e ||
        got.enemySightMul !== exp.n || got.solarMul !== exp.sol)
      throw new Error(id + ' 结果与期望不符: ' + JSON.stringify(got) + ' 期望 s='+exp.s+' f='+exp.f+' e='+exp.e+' n='+exp.n+' sol='+exp.sol);
  }
});

test('tickWeather: 进入极端天气写入冷却', () => {
  // 从 wx_rain 到时, rng 命中 wx_thunder → 应写 cd{wx_thunder:630}
  const w = { id: 'wx_rain', t: 2000 };
  // wx_rain total=13: cum thunder=[12,13) → rng∈[0.923,1) 取 0.95
  const r2 = W.tickWeather(w, 1, () => 0.95);
  if (r2.id !== 'wx_thunder') throw new Error('应选雷暴: ' + r2.id);
  if (!r2.cd || r2.cd.wx_thunder !== 630) throw new Error('进入极端应写cd: ' + JSON.stringify(r2.cd));
  // 对照: cum acid=[11,12)/13=[0.846,0.923) 取 0.9 → wx_acid 也应写 cd840
  const r3 = W.tickWeather(w, 1, () => 0.9);
  if (r3.id !== 'wx_acid') throw new Error('应选酸雨: ' + r3.id);
  if (!r3.cd || r3.cd.wx_acid !== 840) throw new Error('进入酸雨应写cd840: ' + JSON.stringify(r3.cd));
});

test('tickWeather: 空cd对象归一为null', () => {
  const w = { id: 'wx_clear', t: 0, cd: {} };
  const r = W.tickWeather(w, 10, () => 0.5);
  if (r.cd !== null) throw new Error('空cd应归一null: ' + JSON.stringify(r.cd));
});

test('tickWeather: dur 边界(1天=210s 内不切, 210s 后切)', () => {
  // wx_thunder dur [1,1]天 → dur = 210 + rng()*0 = 210
  const w = { id: 'wx_thunder', t: 0, cd: { wx_thunder: 630 } };
  const r1 = W.tickWeather(w, 209, () => 0.5);
  if (r1.id !== 'wx_thunder') throw new Error('209s应仍雷暴: ' + r1.id);
  const r2 = W.tickWeather(w, 210, () => 0);
  // rng=0 → pick 命中首权重; wx_thunder 转移 {wx_rain:3, wx_clear:3, wx_blizzard:1} → wx_rain
  if (r2.id !== 'wx_rain') throw new Error('到时应切雨: ' + r2.id);
});
