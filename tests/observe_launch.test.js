function io(){
  return {
    makePlanet: function(seed){ return APH.Planet.fallbackPlanet(seed); },
    savePlanet: function(id, spec){ APH.Save.savePlanet(id, spec); },
    loadPlanet: function(id){ return APH.Save.loadPlanet(id); },
    widthCells: 4, heightCells: 4
  };
}

test('#195 launch: 没有目的地时出发被拒绝', () => {
  const r = APH.Observe.land(null, Object.assign({}, io(), { seed: 1 }));
  if (r.ok) throw new Error('不选星不能飞');
  if (APH.Observe.canLaunch(null).ok) throw new Error('canLaunch(null) 应拒绝');
});

test('#195 launch: 目的地含未知新星与已知星', () => {
  const meta = {};
  const list0 = APH.Observe.destinations(meta);
  if (!list0.some(function(d){ return d.kind === 'unknown'; })) throw new Error('应有未知新星');
  const first = APH.Observe.land({ kind: 'unknown' }, Object.assign({}, io(), { seed: 21, meta: meta }));
  if (!first.ok || !first.first) throw new Error('未知新星应第一次观测');
  const list1 = APH.Observe.destinations(meta);
  if (list1.filter(function(d){ return d.kind === 'known'; }).length < 1) throw new Error('着陆后应出现已知星');
});

test('#195 launch: 未知新星着陆才观测，再登陆不重铺', () => {
  const meta = {};
  const a = APH.Observe.land({ kind: 'unknown' }, Object.assign({}, io(), { seed: 33, meta: meta, widthCells: 5, heightCells: 5 }));
  const g1 = JSON.stringify(APH.Observe.gridOf(a.spec));
  const known = APH.Observe.destinations(meta).filter(function(d){ return d.kind === 'known'; })[0];
  a.spec.seed = 1;
  const b = APH.Observe.land(known, Object.assign({}, io(), { meta: meta, widthCells: 5, heightCells: 5 }));
  if (b.first) throw new Error('已知星不应再第一次观测');
  if (JSON.stringify(APH.Observe.gridOf(b.spec)) !== g1) throw new Error('再登陆必须读旧图');
  if (JSON.stringify(b.spec.beacons) !== JSON.stringify(a.spec.beacons)) throw new Error('信标应还在');
});

test('#195 launch: 图鉴点星不发射', () => {
  const r = APH.Observe.fromCodex({ id: 'P1' });
  if (r.ok) throw new Error('图鉴只读，不得出发');
});

test('#195 launch: 同一趟远征中途回家再进不重测', () => {
  const meta = {};
  const a = APH.Observe.land({ kind: 'unknown' }, Object.assign({}, io(), { seed: 44, meta: meta }));
  const g1 = JSON.stringify(APH.Observe.gridOf(a.spec));
  const b = APH.Observe.land(null, Object.assign({}, io(), { run: { spec: a.spec }, seed: 99999, meta: meta }));
  if (!b.ok || !b.resumed) throw new Error('应恢复同一趟');
  if (JSON.stringify(APH.Observe.gridOf(b.spec)) !== g1) throw new Error('同一趟格网不得新观测');
});
