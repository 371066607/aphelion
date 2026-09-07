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
  const w = { id: 'wx_clear', t: 1e7 };          // 超过任何 dur 上限, 必掷
  const r = W.tickWeather(w, 1, () => 0);       // rng=0 → 第一权重 = wx_clear
  if (r.id !== 'wx_clear') throw new Error('rng=0应继续晴(自身权重最大): ' + r.id);
  if (r.t !== 0) throw new Error('掷后 t 应归零: ' + r.t);
});

/* 确定性抽选: rng→权重区间映射 */
test('tickWeather: 晴朗到时长后 rng=0.99 命中末位权重(雨/雪/雾之外的冷门)', () => {
  // wx_clear 转移: {wx_clear:4, wx_rain:3, wx_snow:2, wx_fog:1, wx_heat:1, wx_cold:1} total=12
  // rng=0.99*12=11.88 → 逐个减去: 4→7.88, 3→4.88, 2→2.88, 1→1.88, 1→0.88, 1→-0.12 → wx_cold
  const w = { id: 'wx_clear', t: 1e7 };
  const r = W.tickWeather(w, 1, () => 0.99);
  if (r.id !== 'wx_cold') throw new Error('rng=0.99应命中末位 wx_cold: ' + r.id);
});

test('tickWeather: 冷却中的天气被排除(雷暴cd期内雨→雨不选雷暴)', () => {
  // 从 wx_rain 出发且 wx_thunder 在冷却 → 转移表排除 thunder
  // wx_rain: {wx_clear:4, wx_rain:3, wx_rain_heavy:2, wx_fog:2, wx_acid:1, wx_thunder:1} total=13
  // rng=0.999*13=12.987 → 4→8.987, 3→5.987, 2→3.987, 2→1.987, 1→0.987, 1→-0.013 → wx_thunder 被cd排除
  // 排除后 total=12: 4→8.987, 3→5.987, 2→3.987, 2→1.987, 1→0.987 → wx_acid(最后一个)
  const w = { id: 'wx_rain', t: 1e7, cd: { wx_thunder: 500 } };
  const r = W.tickWeather(w, 1, () => 0.999);
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
  const w = { id: 'wx_rain', t: 1e7 };
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
  const day = (APH.CFG.weather && APH.CFG.weather.dayLen) || 3600;
  const w = { id: 'wx_thunder', t: 0, cd: { wx_thunder: 630 } };
  const r1 = W.tickWeather(w, day - 1, () => 0.5);
  if (r1.id !== 'wx_thunder') throw new Error((day-1)+'s应仍雷暴: ' + r1.id);
  const r2 = W.tickWeather(w, day, () => 0);
  // rng=0 → pick 命中首权重; wx_thunder 转移 {wx_rain:3, wx_clear:3, wx_blizzard:1} → wx_rain
  if (r2.id !== 'wx_rain') throw new Error('到时应切雨: ' + r2.id);
});

test('tickWeather: 热浪/寒潮属极端(写cd) — 冷却清单与 exposureGain>0 唯一真源一致', () => {
  // 热浪进入: 从 wx_clear 到时, rng 命中 wx_heat (wx_clear 转移 {clear:4,rain:3,snow:2,fog:1,heat:1,cold:1} total=12; cum heat=[10,11)
  const w = { id: 'wx_clear', t: 1e7 };
  const r = W.tickWeather(w, 1, () => 0.88);   // 0.88*12=10.56 → 4→6.56,3→3.56,2→1.56,1→0.56,1→-0.44 → wx_heat
  if (r.id !== 'wx_heat') throw new Error('应选热浪: ' + r.id);
  if (!r.cd || r.cd.wx_heat !== 630) throw new Error('热浪应写cd630: ' + JSON.stringify(r.cd));
  // 寒潮同理: cum cold=[11,12) → rng=0.95*12=11.4 → wx_cold
  const r2 = W.tickWeather(w, 1, () => 0.95);
  if (r2.id !== 'wx_cold') throw new Error('应选寒潮: ' + r2.id);
  if (!r2.cd || r2.cd.wx_cold !== 630) throw new Error('寒潮应写cd630: ' + JSON.stringify(r2.cd));
});

test('tickWeather: wx_storm 不算极端冷却真源(exposureGain=0, 极端期间衰减)', () => {
  // wx_storm exposureGain=0 (磁暴=特殊事件), cd 里有 storm 时: 处于 storm 期间 → 不衰减? 否:
  // isExtreme 按 exposureGain>0 → storm 非极端 → cd 衰减
  const w = { id: 'wx_storm', t: 0, cd: { wx_storm: 630 } };
  const r = W.tickWeather(w, 100, () => 0.5);
  if (!(r.cd && r.cd.wx_storm < 630)) throw new Error('storm期间cd应衰减(非极端): ' + JSON.stringify(r.cd));
});

/* ============ P1a 天气预报 (#92) ============ */
test('#92 forecast: 当前晴 → 权重最高目标是晴(自身权重4)/预报应给 rain 或雪? —— 取转移表最高=wx_clear', () => {
  /* 晴的转移表: wx_clear:4, wx_rain:3, wx_snow:2, ... → 最高=wx_clear(继续晴) */
  const f = W.forecast({ weather: { id: 'wx_clear', t: 0 } });
  if (f !== 'wx_clear') throw new Error('晴时应预报继续晴(权重最高自身): ' + f);
});
test('#92 forecast: 当前雨 → 预报最高=wx_clear(权重4)', () => {
  const f = W.forecast({ weather: { id: 'wx_rain', t: 10 } });
  if (f !== 'wx_clear') throw new Error('雨时应预报晴: ' + f);
});
test('#92 forecast: 冷却中的目标被排除 (晴的 cd 含 rain → 预报转向 snow)', () => {
  const f = W.forecast({ weather: { id: 'wx_clear', t: 0, cd: { wx_rain: 300 } } });
  /* 晴转移: clear4 / rain3(cd中排除) / snow2 → 最高=clear */
  if (f !== 'wx_clear') throw new Error('排除rain后仍应为自身clear(权重4): ' + f);
});
test('#92 forecast: 无转转移/全冷却兑底 wx_clear, 老档无 weather 兜底晴', () => {
  const f1 = W.forecast({});
  if (f1 !== 'wx_clear') throw new Error('无weather应兜底晴: ' + f1);
  const f2 = W.forecast(null);
  if (f2 !== 'wx_clear') throw new Error('空 meta 也应晴: ' + f2);
});
test('#92 forecast: 确定性 — 同输入重复调用结果一致(不消费rng)', () => {
  const a = W.forecast({ weather: { id: 'wx_thunder', t: 0 } });
  const b = W.forecast({ weather: { id: 'wx_thunder', t: 0 } });
  if (a !== b) throw new Error('预报应确定: ' + a + ' vs ' + b);
  /* 雷暴转移: wx_rain:3, wx_clear:3, wx_blizzard:1 → 最高=rain(先到者) */
  if (a !== 'wx_rain') throw new Error('雷暴转移最高应rain: ' + a);
});

/* ---------- 殖民地优先 T3: 季节 (docs/colony-first-redesign.md) ---------- */
test('T3 season: 按世界时钟推导季节, 一年循环', () => {
  const S = APH.CFG.seasons, DL = APH.CFG.DAY_LEN;
  const per = S.daysPerSeason, order = S.order;
  const at = d => APH.Weather.seasonAt(d * DL, DL);

  if (at(0).id !== order[0]) throw new Error('第 0 天应是 ' + order[0]);
  if (at(per).id !== order[1]) throw new Error('第 ' + per + ' 天应换季到 ' + order[1]);
  if (at(per * 3).id !== 'winter') throw new Error('第四季应是冬天');

  const yearLen = per * order.length;
  if (at(yearLen).id !== order[0]) throw new Error('满一年应回到 ' + order[0]);
  if (at(yearLen + per * 3).id !== 'winter') throw new Error('第二年冬天也应是冬天');

  const w = at(per * 3);
  if (!w.isWinter) throw new Error('冬天 isWinter 应为 true');
  if (w.growMul !== 0) throw new Error('冬天生长乘子必须为 0 —— 这是压力的来源');
  if (!(at(per).growMul > 0)) throw new Error('非冬季应能生长');
});

test('T3 season: daysUntilWinter 正确倒数, 入冬即 0', () => {
  const S = APH.CFG.seasons, DL = APH.CFG.DAY_LEN;
  const per = S.daysPerSeason;
  const d2w = d => APH.Weather.daysUntilWinter(d * DL, DL);
  if (d2w(per * 3) !== 0) throw new Error('冬天当天应为 0, got ' + d2w(per * 3));
  if (d2w(per * 3 - 1) !== 1) throw new Error('入冬前一天应为 1, got ' + d2w(per * 3 - 1));
  if (d2w(0) !== per * 3) throw new Error('开年距冬应为 ' + per * 3 + ', got ' + d2w(0));
  const mid = d2w(per * 3 + 1);
  if (mid !== 0) throw new Error('冬季中途仍应为 0, got ' + mid);
});

test('T3 season: 气温叠加季节偏移, 省略季节时行为不变', () => {
  const amb = APH.Weather.ambientTemperatureOf;
  const base = amb('wx_clear', true);
  const winter = amb('wx_clear', true, 'winter');
  const summer = amb('wx_clear', true, 'summer');
  if (winter >= base) throw new Error('冬天应更冷: ' + winter + ' vs ' + base);
  if (summer <= base) throw new Error('夏天应更热: ' + summer + ' vs ' + base);
  const off = APH.CFG.seasons.tempOffset.winter;
  if (winter !== base + off) throw new Error('冬天应正好是基础+偏移');
  if (amb('wx_clear', true, null) !== base) throw new Error('省略季节应与老行为一致');
});

test('T3 season: 冬天的作物生长乘子会让田停长', () => {
  const winterMul = APH.CFG.seasons.growMul.winter;
  const plot = { stage: 0, t: 0 };
  const out = APH.Colony.cropPlotTick(plot, 9, 1, winterMul, 'crop_glow_shroom');
  if (out.t !== 0) throw new Error('冬天不应累积生长进度, got ' + out.t);
  if (out.stage !== 0) throw new Error('冬天不应推进生长阶段');
  const summer = APH.Colony.cropPlotTick({ stage: 0, t: 0 }, 9, 1, APH.CFG.seasons.growMul.summer, 'crop_glow_shroom');
  if (!(summer.t > 0 || summer.stage > 0)) throw new Error('夏天应该长');
});

test('T3 season: tickGrowZones 冬天不长, 省略参数时按 1', () => {
  const mk = () => ([{ type:'grow', cropType:'crop_glow_shroom', cells:[{ x:0, y:0, plant:{ stage:1, t:0 } }] }]);
  const zw = mk();
  APH.Colony.tickGrowZones(zw, 9, 1, 0);
  if (zw[0].cells[0].plant.t !== 0) throw new Error('冬天划区田不应生长');
  const zn = mk();
  APH.Colony.tickGrowZones(zn, 9, 1);
  const p = zn[0].cells[0].plant;
  /* 技能 9 一跳就够推进一个阶段, 推进时 t 会归零 —— 所以看 stage 或 t 任一前进 */
  if (!(p.stage > 1 || p.t > 0)) throw new Error('省略 seasonMul 应按 1 生长(老调用零改动)');
});
