/* T7 耗电联动: 供电状态 → 消费方停机/减产/HUD
   seams: APH.Colony.powerSettle(已有) + 消费方判断纯函数(本票)
   期望值手工推导。 */
'use strict';
const C = window.APH.Colony;

/* ---------- 供电状态写入建筑(纯函数) ---------- */
test('applyPowerState: status 写入各建筑 powered/grid 标志', () => {
  const bs = [
    { id:'bl_turret', x:0, y:0 },
    { id:'bl_farm', x:48, y:0 },
    { id:'bl_house', x:96, y:0 },   // 非耗电
  ];
  const status = {
    '0,0': { grid:true, powered:true },
    '48,0': { grid:true, powered:false },
  };
  const r = C.applyPowerState(bs, status);
  if (r['0,0'].powered !== true || r['0,0'].grid !== true) throw new Error('炮塔应供上电');
  if (r['48,0'].powered !== false) throw new Error('农场应停机');
  if (r['96,0'] && r['96,0'].powered !== undefined) throw new Error('非耗电不应有Powered: '+JSON.stringify(r['96,0']));
});

/* ---------- 农场减产 ---------- */
test('farmPowerMul: 无电农场减产50%', () => {
  const mul = C.farmPowerMul(false);
  if (mul !== 0.5) throw new Error('应0.5: '+mul);
});
test('farmPowerMul: 通电/未激活=满产', () => {
  if (C.farmPowerMul(true) !== 1) throw new Error('通电应1');
  if (C.farmPowerMul(null) !== 1) throw new Error('未激活应1');
});

/* ---------- 炮塔停机 ---------- */
test('turretFireAllowed: 无电+未超时→禁射', () => {
  const ok = C.turretFireAllowed({ powered:false, offlineT:0 });
  if (ok !== false) throw new Error('无电应禁射');
});
test('turretFireAllowed: 通电且无offline→可射', () => {
  const ok = C.turretFireAllowed({ powered:true, offlineT:0 });
  if (ok !== true) throw new Error('通电应可射');
});
test('turretFireAllowed: offlineT(耀斑)仍然禁射', () => {
  const ok = C.turretFireAllowed({ powered:true, offlineT:10 });
  if (ok !== false) throw new Error('耀斑应禁射');
});

/* ---------- 医疗舱 ---------- */
test('clinicPowered: 无电→停诊', () => {
  const r = C.clinicPowered({ powered:false, grid:true });
  if (r !== false) throw new Error('无电应停诊');
});
test('clinicPowered: 未激活默认(无grid字段)→照常', () => {
  const r = C.clinicPowered({});
  if (r !== true) throw new Error('未激活应照常');
});
