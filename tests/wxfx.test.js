/* W4 粒子渲染 (ADR-15 / docs/adr/0006; issue #89)
   seams: APH.Weather.{fxParams, rgbaOf, tintRGBA, fxCount}
   纯函数: 色表/参数/预算全部只读 CFG, node 直测。
   渲染层 (world.js drawWeather/drawFog) 为 canvas 绘制, 走 scenario 冒烟。
   数值期望手工推导: fxView 1280x720=921600; caps.wxParticles=240。 */
'use strict';
const W = window.APH.Weather;
const CFG = window.APH.CFG;

/* ---------- 色表 (fxParams 全天气) ----------
   期望值手工核对 CFG.weather.fx: parts/count/tintA/fogA */
test('fxParams: 全天气表与 CFG 一致 (null=无粒子无tint的天气)', () => {
  const exp = {
    wx_clear:      null,                              // 晴: 全空
    wx_rain:       { parts:'rain', count:130, tintA:0.10, fogA:0 },
    wx_rain_heavy: { parts:'rain', count:200, tintA:0.16, fogA:0 },
    wx_thunder:    { parts:'rain', count:230, tintA:0.20, fogA:0 },
    wx_snow:       { parts:'snow', count:110, tintA:0.12, fogA:0 },
    wx_blizzard:   { parts:'snow', count:170, tintA:0.18, fogA:0 },
    wx_heat:       { parts:'none', count:0,   tintA:0.07, fogA:0 },
    wx_cold:       { parts:'none', count:0,   tintA:0.10, fogA:0 },
    wx_acid:       { parts:'rain', count:140, tintA:0.14, fogA:0 },
    wx_storm:      { parts:'none', count:0,   tintA:0.13, fogA:0 },
    wx_fog:        { parts:'none', count:0,   tintA:0.08, fogA:0.26 },
  };
  for (const id in exp){
    const got = W.fxParams(id);
    const e = exp[id];
    if (e === null){
      if (got !== null) throw new Error(id + ' 应为 null(无粒子无tint): ' + JSON.stringify(got));
      continue;
    }
    if (!got || got.parts !== e.parts || got.count !== e.count ||
        Math.abs(got.tintA - e.tintA) > 1e-9 || Math.abs(got.fogA - e.fogA) > 1e-9)
      throw new Error(id + ' 与期望不符: ' + JSON.stringify(got) + ' 期望 ' + JSON.stringify(e));
  }
});

test('fxParams: 未知天气 → null (渲染层静默跳过)', () => {
  if (W.fxParams('wx_nonexistent') !== null) throw new Error('未知天气应为 null');
});

/* ---------- 运动学合并 (rain/snow 互斥, 值来自 CFG.weather.fxRain/fxSnow) ---------- */
test('fxParams: 雨天气合并 fxRain, 不含 snow', () => {
  const p = W.fxParams('wx_rain');
  if (!p.rain) throw new Error('雨天气应带 rain 运动学');
  if (p.rain.speed !== 620 || p.rain.wind !== 46 || p.rain.len !== 15 ||
      p.rain.splashLife !== 0.22 || p.rain.splashDots !== 3)
    throw new Error('fxRain 值不符: ' + JSON.stringify(p.rain));
  if (p.snow !== null) throw new Error('雨天气不应带 snow: ' + JSON.stringify(p.snow));
});

test('fxParams: 雪天气合并 fxSnow, 不含 rain', () => {
  const p = W.fxParams('wx_snow');
  if (!p.snow) throw new Error('雪天气应带 snow 运动学');
  if (p.snow.fall !== 58 || p.snow.drift !== 20 || p.snow.swayAmp !== 13 || p.snow.swayFreq !== 1.2)
    throw new Error('fxSnow 值不符: ' + JSON.stringify(p.snow));
  if (p.rain !== null) throw new Error('雪天气不应带 rain: ' + JSON.stringify(p.rain));
});

test('fxParams: 暴雪也走 snow(密度不同, tint 偏青)', () => {
  const p = W.fxParams('wx_blizzard');
  if (!p.snow) throw new Error('暴雪应带 snow 运动学');
  if (p.count !== 170) throw new Error('暴雪 count 应 170: ' + p.count);
  if (W.tintRGBA('wx_blizzard') === W.tintRGBA('wx_snow')) throw new Error('暴雪 tint 应区别于雪');
});

/* ---------- 颜色解析 (rgbaOf) ---------- */
test('rgbaOf: #rrggbb + alpha → rgba 字符串', () => {
  if (W.rgbaOf('#5f7189', 0.10) !== 'rgba(95,113,137,0.1)') throw new Error('灰蓝: ' + W.rgbaOf('#5f7189', 0.10));
  if (W.rgbaOf('#ffc857', 0.5) !== 'rgba(255,200,87,0.5)') throw new Error('金: ' + W.rgbaOf('#ffc857', 0.5));
  if (W.rgbaOf('#000000', 0) !== 'rgba(0,0,0,0)') throw new Error('全透明: ' + W.rgbaOf('#000000', 0));
});
test('rgbaOf: 非 # 前缀/空 → null', () => {
  if (W.rgbaOf('ffc857', 0.5) !== null) throw new Error('无#应 null');
  if (W.rgbaOf(null, 0.5) !== null) throw new Error('null 应 null');
});

/* ---------- 天色 tint (验收: 雨灰蓝/雪亮白/暴雪偏青/酸雨黄绿/磁暴紫) ---------- */
test('tintRGBA: 雨灰蓝', () => {
  if (W.tintRGBA('wx_rain') !== 'rgba(95,113,137,0.1)') throw new Error('雨: ' + W.tintRGBA('wx_rain'));
});
test('tintRGBA: 雪亮白 / 暴雪偏青', () => {
  if (W.tintRGBA('wx_snow') !== 'rgba(223,233,242,0.12)') throw new Error('雪: ' + W.tintRGBA('wx_snow'));
  if (W.tintRGBA('wx_blizzard') !== 'rgba(185,226,234,0.18)') throw new Error('暴雪: ' + W.tintRGBA('wx_blizzard'));
});
test('tintRGBA: 酸雨黄绿 / 磁暴紫', () => {
  if (W.tintRGBA('wx_acid') !== 'rgba(169,201,111,0.14)') throw new Error('酸雨: ' + W.tintRGBA('wx_acid'));
  if (W.tintRGBA('wx_storm') !== 'rgba(139,111,216,0.13)') throw new Error('磁暴: ' + W.tintRGBA('wx_storm'));
});
test('tintRGBA: 大雨/雷暴更暗, 热浪暖橙, 寒潮灰蓝', () => {
  if (W.tintRGBA('wx_rain_heavy') !== 'rgba(73,89,110,0.16)') throw new Error('大雨: ' + W.tintRGBA('wx_rain_heavy'));
  if (W.tintRGBA('wx_thunder') !== 'rgba(57,72,92,0.2)') throw new Error('雷暴: ' + W.tintRGBA('wx_thunder'));
  if (W.tintRGBA('wx_heat') !== 'rgba(224,164,101,0.07)') throw new Error('热浪: ' + W.tintRGBA('wx_heat'));
  if (W.tintRGBA('wx_cold') !== 'rgba(159,184,216,0.1)') throw new Error('寒潮: ' + W.tintRGBA('wx_cold'));
});
test('tintRGBA: 晴天/未知 → null (无色罩)', () => {
  if (W.tintRGBA('wx_clear') !== null) throw new Error('晴应 null');
  if (W.tintRGBA('wx_nonexistent') !== null) throw new Error('未知应 null');
});

/* ---------- 粒子预算 (fxCount: 视口面积缩放 + caps 封顶) ----------
   ref=1280x720=921600; 800x600=480000(比例 0.520833) */
test('fxCount: 800x600 视口面积缩放 (130*0.520833=67.7→68)', () => {
  if (W.fxCount('wx_rain', 800, 600) !== 68) throw new Error('雨 800x600: ' + W.fxCount('wx_rain', 800, 600));
  if (W.fxCount('wx_snow', 800, 600) !== 57) throw new Error('雪 800x600: ' + W.fxCount('wx_snow', 800, 600));
});
test('fxCount: 参考视口 1280x720 → 原值', () => {
  if (W.fxCount('wx_thunder', 1280, 720) !== 230) throw new Error('雷暴参考视口: ' + W.fxCount('wx_thunder', 1280, 720));
});
test('fxCount: 超大视口被 caps.wxParticles 封顶 (雨 130*4=520→240)', () => {
  if (W.fxCount('wx_rain', 2560, 1440) !== 240) throw new Error('雨 4x 应封顶 240: ' + W.fxCount('wx_rain', 2560, 1440));
  if (W.fxCount('wx_rain_heavy', 2560, 1440) !== 240) throw new Error('大雨 4x 应封顶: ' + W.fxCount('wx_rain_heavy', 2560, 1440));
});
test('fxCount: 无粒子天气/极小视口 → 0 或 1', () => {
  if (W.fxCount('wx_clear', 800, 600) !== 0) throw new Error('晴应为 0');
  if (W.fxCount('wx_heat', 800, 600) !== 0) throw new Error('热浪应 0');
  if (W.fxCount('wx_fog', 800, 600) !== 0) throw new Error('雾应 0(只有雾层)');
  if (W.fxCount('wx_rain', 100, 100) !== 1) throw new Error('极小视口应≥1: ' + W.fxCount('wx_rain', 100, 100));
  if (W.fxCount('wx_unknown', 800, 600) !== 0) throw new Error('未知应 0');
});
test('fxCount: caps.wxParticles 存在且为雨雪上限 (ADR-10 预算)', () => {
  if (!(CFG.caps && CFG.caps.wxParticles > 0)) throw new Error('caps.wxParticles 缺失');
  if (W.fxCount('wx_rain', 8192, 8192) !== CFG.caps.wxParticles)
    throw new Error('任意大视口应恰为 caps: ' + W.fxCount('wx_rain', 8192, 8192));
});
