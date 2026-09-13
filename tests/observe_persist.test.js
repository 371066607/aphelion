function snap(grid){ return JSON.stringify(grid); }

test('#193 persist: 新档家园观测一次，存读格子相同，再 ensure 不重测', () => {
  const colony = { buildings: [], builtAt: 1, ground: [] };
  APH.Observe.ensureHome(colony, { seed: 7, widthCells: 6, heightCells: 6 });
  const g1 = APH.Observe.gridOf(colony);
  if (!g1) throw new Error('新档应观测出格网');
  APH.Save.saveColony(colony);
  const loaded = APH.Save.loadColony();
  if (snap(APH.Observe.gridOf(loaded)) !== snap(g1)) throw new Error('家园存读格子应相同');
  loaded._seedPoison = 1;
  APH.Observe.ensureHome(loaded, { seed: 99999, widthCells: 6, heightCells: 6 });
  if (snap(APH.Observe.gridOf(loaded)) !== snap(g1)) throw new Error('已有格网不得第二次观测');
});

test('#193 persist: 星球第一次观测写入星球存档，再读相同', () => {
  const spec = APH.Planet.fallbackPlanet(123);
  const beacons = JSON.stringify(spec.beacons);
  const laws = JSON.stringify(spec.laws);
  const biome = spec.biome && spec.biome.id;
  APH.Observe.ensurePlanet(spec, { widthCells: 6, heightCells: 6 });
  const g1 = APH.Observe.gridOf(spec);
  if (!g1) throw new Error('星球应观测出格网');
  APH.Save.savePlanet(spec.id, spec);
  const loaded = APH.Save.loadPlanet(spec.id);
  if (snap(APH.Observe.gridOf(loaded)) !== snap(g1)) throw new Error('星球存读格子应相同');
  if (JSON.stringify(loaded.beacons) !== beacons) throw new Error('不得改信标');
  if (JSON.stringify(loaded.laws) !== laws) throw new Error('不得改法则');
  if (loaded.biome.id !== biome) throw new Error('不得改群系');
  const v = APH.Planet.validate(loaded);
  if (!v.ok) throw new Error('PlanetSpec 校验应仍通过: ' + (v.errors || []).join(','));
  loaded.seed = 1;
  APH.Observe.ensurePlanet(loaded, { widthCells: 6, heightCells: 6 });
  if (snap(APH.Observe.gridOf(loaded)) !== snap(g1)) throw new Error('已观测星球不得重测');
});

test('#193 persist: 旧家园存档加载不观测，建筑还在', () => {
  APH.Save.saveColony({
    buildings: [{ id: 'bl_house', x: 1100, y: 1100, lv: 1 }],
    builtAt: 9,
    ground: []
  });
  const old = APH.Save.loadColony();
  if (APH.Observe.gridOf(old)) throw new Error('旧档加载不得观测');
  if (!old.buildings || old.buildings[0].id !== 'bl_house') throw new Error('旧档地面/建筑应原样');
});
