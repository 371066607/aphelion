test('#194 query: 已观测格的可行走与肥力跟砖一致', () => {
  const h = {};
  APH.Observe.ensureHome(h, {
    seed: 3, widthCells: 4, heightCells: 4,
    pins: [
      { gx: 0, gy: 0, tile: 'water' },
      { gx: 1, gy: 0, tile: 'lakeshore' },
      { gx: 2, gy: 0, tile: 'woodland' },
      { gx: 3, gy: 0, tile: 'ridge' }
    ]
  });
  const w = APH.Observe.cellAt(h, 0, 0);
  const s = APH.Observe.cellAt(h, 1, 0);
  const d = APH.Observe.cellAt(h, 2, 0);
  const r = APH.Observe.cellAt(h, 3, 0);
  if (!w || w.walkable) throw new Error('水不可走');
  if (!s || !s.walkable || !s.shore) throw new Error('岸可走且是岸');
  if (!d || !d.walkable || !(d.fertility > r.fertility)) throw new Error('林应比脊肥');
  if (APH.Observe.cellAt({}, 0, 0) != null) throw new Error('未观测查询应为空，走旧行为');
});

test('#194 flora: 初局树矿来自砖，不另撒一层', () => {
  const h = { buildings: [] };
  APH.Observe.ensureHome(h, {
    seed: 4, widthCells: 3, heightCells: 1,
    pins: [
      { gx: 0, gy: 0, tile: 'tree' },
      { gx: 1, gy: 0, tile: 'rock_stone' },
      { gx: 2, gy: 0, tile: 'woodland' }
    ]
  });
  const flora = APH.Colony.generateFlora(4, h);
  if (flora.length !== 2) throw new Error('只应有砖上的树和石，实际 ' + flora.length);
  const kinds = flora.map(function(f){ return f.kind; }).sort().join(',');
  if (kinds !== 'rock_stone,tree') throw new Error('种类不对: ' + kinds);
  const scatter = APH.Colony.generateFlora(4);
  if (scatter.length < 15) throw new Error('未观测仍走旧撒点');
});

test('#194 respawn: 同格同种，不改邻居', () => {
  const colony = {};
  APH.Observe.ensureHome(colony, {
    seed: 5, widthCells: 3, heightCells: 1,
    pins: [
      { gx: 0, gy: 0, tile: 'tree' },
      { gx: 1, gy: 0, tile: 'woodland' },
      { gx: 2, gy: 0, tile: 'woodland' }
    ]
  });
  const G = APH.CFG.GRID;
  const before = APH.Observe.gridOf(colony).map(function(row){ return row.slice(); });
  const s = { seed: 5, clock: 0, colony: colony, floraRespawn: [{ kind: 'tree', x: 0.5 * G, y: 0.5 * G, ticksLeft: 1 }] };
  const spawned = APH.Colony.floraRespawnTick(s);
  if (spawned.length !== 1 || spawned[0].kind !== 'tree') throw new Error('应再生一棵树');
  if (spawned[0].x !== 0.5 * G || spawned[0].y !== 0.5 * G) throw new Error('必须回同一格');
  if (JSON.stringify(APH.Observe.gridOf(colony)) !== JSON.stringify(before)) throw new Error('再生不得改邻居格');
});

test('#194 acid: 零水则岸不算岸，酸化熄火；未观测仍酸化', () => {
  const dry = {};
  APH.Observe.ensureHome(dry, {
    seed: 8, widthCells: 2, heightCells: 2,
    pins: [
      { gx: 0, gy: 0, tile: 'woodland' },
      { gx: 1, gy: 0, tile: 'woodland' },
      { gx: 0, gy: 1, tile: 'woodland' },
      { gx: 1, gy: 1, tile: 'woodland' }
    ]
  });
  if (APH.Observe.hasWater(dry)) throw new Error('全林不应有水');
  const laws = [{ id: 'lw_night_acid' }];
  const off = APH.Colony.harvestMods(laws, 0, true, dry);
  if (off.acid || off.farmMul !== 1) throw new Error('无水本局酸化应熄火');
  const on = APH.Colony.harvestMods(laws, 0, true);
  if (!on.acid) throw new Error('未观测夜间酸雨仍应生效');
});

test('#194 pins: 默认钉 HAB 核心为 landing', () => {
  const h = {};
  APH.Observe.ensureHome(h, { seed: 2, widthCells: 32, heightCells: 32 });
  const G = APH.CFG.GRID, hab = APH.CFG.HAB;
  const gx = Math.floor(hab.x / G), gy = Math.floor(hab.y / G);
  const c = APH.Observe.cellAt(h, gx, gy);
  if (!c || c.tile !== 'landing') throw new Error('HAB 格应为 landing，得到 ' + (c && c.tile));
});

test('#194 dry: 无水则无岸砖且 lakeR=0', () => {
  const dry = { terrain: { lakeR: 90 } };
  APH.Observe.ensureHome(dry, {
    seed: 8, widthCells: 2, heightCells: 2,
    pins: [
      { gx: 0, gy: 0, tile: 'woodland' }, { gx: 1, gy: 0, tile: 'woodland' },
      { gx: 0, gy: 1, tile: 'woodland' }, { gx: 1, gy: 1, tile: 'woodland' }
    ]
  });
  const g = APH.Observe.gridOf(dry);
  g.forEach(function(row){ row.forEach(function(t){ if (t === 'lakeshore') throw new Error('无水不应有岸砖'); }); });
  if (dry.terrain.lakeR !== 0) throw new Error('无水 lakeR 应为 0');
});

test('#194 ruins: 有格网时落在可走格', () => {
  const spec = APH.Planet.fallbackPlanet(9);
  spec.tier = 3;
  APH.Observe.ensurePlanet(spec, { widthCells: 20, heightCells: 20 });
  const ruins = APH.Planet.generateAncientRuins(spec, spec.seed);
  if (!ruins) throw new Error('应仍能生成遗迹');
  const G = APH.CFG.GRID;
  const c = APH.Observe.cellAt(spec, Math.floor(ruins.cx / G), Math.floor(ruins.cy / G));
  if (!c || !c.walkable) throw new Error('遗迹中心必须可走');
});
