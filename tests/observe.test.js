test('#192 observe: 同 seed 同群系同钉子 → 同一张格网', () => {
  const a = APH.Observe.observe({ seed: 7, biomeId: 'biome_landing', widthCells: 8, heightCells: 8 });
  const b = APH.Observe.observe({ seed: 7, biomeId: 'biome_landing', widthCells: 8, heightCells: 8 });
  if (!a || !a.grid || !b.grid) throw new Error('应返回格网');
  if (JSON.stringify(a.grid) !== JSON.stringify(b.grid)) throw new Error('同输入必须同图');
  if (a.grid.length !== 8 || a.grid[0].length !== 8) throw new Error('尺寸应为 8×8');
});

test('#192 observe: 钉子格观测后仍是钉进去的砖', () => {
  const pins = [
    { gx: 0, gy: 0, tile: 'landing' },
    { gx: 1, gy: 0, tile: 'woodland' },
    { gx: 2, gy: 0, tile: 'lakeshore' },
    { gx: 3, gy: 0, tile: 'ridge' },
    { gx: 4, gy: 0, tile: 'alien' },
    { gx: 5, gy: 0, tile: 'wreckage' },
    { gx: 2, gy: 2, tile: 'tree' },
    { gx: 3, gy: 3, tile: 'rock_stone' }
  ];
  const r = APH.Observe.observe({ seed: 11, biomeId: 'biome_landing', widthCells: 8, heightCells: 8, pins: pins });
  pins.forEach(function(p){
    if (r.grid[p.gy][p.gx] !== p.tile) throw new Error(p.tile + ' 钉子丢了，得到 ' + r.grid[p.gy][p.gx]);
  });
});

test('#192 observe: 五张群系都能观测，远征邻接不是换皮', () => {
  const ids = ['biome_landing','biome_spore_forest','biome_crystal_wasteland','biome_acid_marsh','biome_cryo_tundra'];
  const sets = {};
  ids.forEach(function(id){
    const r = APH.Observe.observe({ seed: 42, biomeId: id, widthCells: 10, heightCells: 10 });
    if (!r.grid || r.grid.length !== 10) throw new Error(id + ' 没有格网');
    const uniq = {};
    r.grid.forEach(function(row){ row.forEach(function(t){ uniq[t] = 1; }); });
    sets[id] = Object.keys(uniq).sort().join(',');
    if (!sets[id]) throw new Error(id + ' 空砖集');
  });
  if (sets.biome_spore_forest === sets.biome_cryo_tundra)
    throw new Error('菌林与雪原砖集相同，邻接表是换皮');
  if (sets.biome_acid_marsh === sets.biome_crystal_wasteland)
    throw new Error('酸沼与晶蚀砖集相同，邻接表是换皮');
});

test('#192 observe: 不可能的钉子则降级，仍可复现且不改群系', () => {
  const pins = [{ gx: 0, gy: 0, tile: 'water' }, { gx: 1, gy: 0, tile: 'landing' }];
  const a = APH.Observe.observe({ seed: 99, biomeId: 'biome_landing', widthCells: 2, heightCells: 1, pins: pins });
  const b = APH.Observe.observe({ seed: 99, biomeId: 'biome_landing', widthCells: 2, heightCells: 1, pins: pins });
  if (!a.degraded) throw new Error('水贴着陆应观测失败并降级');
  if (a.biomeId !== 'biome_landing') throw new Error('失败不得改群系');
  if (a.grid[0][0] !== 'water' || a.grid[0][1] !== 'landing') throw new Error('降级仍须保住钉子');
  if (JSON.stringify(a.grid) !== JSON.stringify(b.grid)) throw new Error('降级也必须可复现');
});
