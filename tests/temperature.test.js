/* tests/temperature.test.js — 微环境温度与热传导测试集 (ADR-25 / Spec #143)
   纯函数模式，由 tests/run.js 自动加载运行 */
'use strict';

function A(ok, msg) { if (!ok) throw new Error(msg || 'assert failed'); }

test('temperature: CFG.temperature 包含完整天气温标与舒适区间', () => {
  const T = APH.CFG.temperature;
  A(T, 'CFG.temperature 必须存在');
  A(T.weatherBaseTemp, 'weatherBaseTemp 配置必须存在');
  A(T.weatherBaseTemp.wx_clear, '应包含 wx_clear');
  A(T.weatherBaseTemp.wx_cold, '应包含 wx_cold (寒潮)');
  A(T.weatherBaseTemp.wx_heat, '应包含 wx_heat (热浪)');
  A(T.weatherBaseTemp.wx_blizzard, '应包含 wx_blizzard (暴雪)');
  A(T.comfortMin === 10, '舒适下限应为 10°C');
  A(T.comfortMax === 35, '舒适上限应为 35°C');
});

test('temperature: ambientTemperatureOf 纯函数推导室外环境气温', () => {
  const ambTemp = APH.Weather.ambientTemperatureOf;
  A(typeof ambTemp === 'function', 'ambientTemperatureOf 必须为函数');

  // 晴天白天 22°C，夜间 10°C
  A(ambTemp('wx_clear', true) === 22, '晴天白天应为 22°C');
  A(ambTemp('wx_clear', false) === 10, '晴天夜间应为 10°C');

  // 寒潮与暴雪
  A(ambTemp('wx_cold', true) === -25, '寒潮白天应为 -25°C');
  A(ambTemp('wx_cold', false) === -32, '寒潮夜间应为 -32°C');
  A(ambTemp('wx_blizzard', true) === -15, '暴雪白天应为 -15°C');

  // 热浪
  A(ambTemp('wx_heat', true) === 42, '热浪白天应为 42°C');

  // 未知天气默认回退晴天
  A(ambTemp('wx_unknown', true) === 22, '未知天气应回退晴天 22°C');
});

test('temperature: roomTemperatureTick 封闭房间热阻隔热与缓慢传导', () => {
  const roomTick = APH.Colony.roomTemperatureTick;
  A(typeof roomTick === 'function', 'roomTemperatureTick 必须为函数');

  // 初始室内 21°C，室外寒潮 -25°C (温差 46°C)
  const room = { temp: 21, isEnclosed: true };
  
  // 经历 30s，按 15% 传导衰减向室外趋近: 21 + (-25 - 21) * 0.15 = 21 - 6.9 = 14.1°C
  const t1 = roomTick(room, -25, 30);
  A(Math.abs(room.temp - 14.1) < 0.01, '30s 后室温应降至 14.1°C, 实际: ' + room.temp);

  // 非封闭或破损房间（isEnclosed === false）：隔热失效，直接与室外同温
  const openRoom = { temp: 21, isEnclosed: false };
  roomTick(openRoom, -25, 30);
  A(openRoom.temp === -25, '非封闭房间应直接与室外同温 -25°C');
});

test('temperature: BUILDINGS 注册电暖器与制冷空调', () => {
  const heater = APH.Colony.get('bl_heater');
  A(heater, 'bl_heater 必须注册于 BUILDINGS');
  A(heater.cells[0] === 1 && heater.cells[1] === 1, '电暖器必须为 1x1 规格');

  const cooler = APH.Colony.get('bl_cooler');
  A(cooler, 'bl_cooler 必须注册于 BUILDINGS');
  A(cooler.cells[0] === 1 && cooler.cells[1] === 1, '制冷空调必须为 1x1 规格');

  // 电力负载配置
  const con = APH.CFG.power.consumers;
  A(con.bl_heater && con.bl_heater.load === 40, '电暖器负载应为 40W');
  A(con.bl_cooler && con.bl_cooler.load === 50, '制冷空调负载应为 50W');
});

test('temperature: roomTemperatureTick 电暖器升温与空调降温控温', () => {
  const roomTick = APH.Colony.roomTemperatureTick;

  // 1. 寒潮室外 -25°C，通电电暖器将室内升温至 21°C
  const coldRoom = { temp: 0, isEnclosed: true };
  const heater = { id: 'bl_heater', powered: true };
  roomTick(coldRoom, -25, 30, [heater]);
  A(coldRoom.temp > 10, '通电电暖器应显著提高室内温度, 实际: ' + coldRoom.temp);

  // 持续工作逼近 21°C
  for (let i = 0; i < 5; i++) roomTick(coldRoom, -25, 30, [heater]);
  A(Math.abs(coldRoom.temp - 21) <= 1, '电暖器应将室温维持在 21°C 左右, 实际: ' + coldRoom.temp);

  // 2. 晴天室外 25°C，通电冷库空调将室内降温至 -5°C
  const larderRoom = { temp: 20, isEnclosed: true };
  const cooler = { id: 'bl_cooler', mode: 'freezer', targetTemp: -5, powered: true };
  for (let i = 0; i < 6; i++) roomTick(larderRoom, 25, 30, [cooler]);
  A(larderRoom.temp <= 0, '冷库空调应将室温降低至 0°C 以下, 实际: ' + larderRoom.temp);

  // 3. 断电 (powered: false)：电器停机，温度衰退回向室外同化
  cooler.powered = false;
  roomTick(larderRoom, 25, 30, [cooler]);
  A(larderRoom.temp > -5, '断电后室温应逐渐回暖上升, 实际: ' + larderRoom.temp);
});
