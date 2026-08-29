/* tests/biome.test.js — 多群系异星生态系统测试 (Tickets #40~#44)
   纯注册式测试文件，由 run.js 自动加载。 */
'use strict';

test('biomes: 4 大异星生态群系规格定义完整', function(){
  var BIOMES = APH.Planet.BIOMES;
  if (!BIOMES) throw new Error('缺失 APH.Planet.BIOMES');
  if (!BIOMES.biome_spore_forest || BIOMES.biome_spore_forest.lawId !== 'lw_bioglow') {
    throw new Error('缺失或未配置 biome_spore_forest');
  }
  if (!BIOMES.biome_crystal_wasteland || BIOMES.biome_crystal_wasteland.lawId !== 'lw_crystal_resonance') {
    throw new Error('缺失或未配置 biome_crystal_wasteland');
  }
  if (!BIOMES.biome_acid_marsh || BIOMES.biome_acid_marsh.lawId !== 'lw_acid_mist') {
    throw new Error('缺失或未配置 biome_acid_marsh');
  }
  if (!BIOMES.biome_cryo_tundra || BIOMES.biome_cryo_tundra.lawId !== 'lw_cryo_freeze') {
    throw new Error('缺失或未配置 biome_cryo_tundra');
  }
});

test('biomes: biomeOf 根据 seed 确定性派生群系', function(){
  var b1 = APH.Planet.biomeOf(1001);
  var b2 = APH.Planet.biomeOf(1001);
  var b3 = APH.Planet.biomeOf(9999);

  if (b1.id !== b2.id) throw new Error('同 seed 应产生相同群系 (ADR-5 确定性)');
  if (!b1.name || !b1.desc || !b1.lawId) throw new Error('群系数据结构不全: ' + JSON.stringify(b1));
});

test('biomes: fallbackPlanet 正确包含 spec.biome', function(){
  var p = APH.Planet.fallbackPlanet(54321);
  if (!p.biome || !p.biome.id) throw new Error('fallbackPlanet 应包含 spec.biome');
  if (!p.biome.name) throw new Error('spec.biome 应包含中文名');
});

test('biome_laws: 远征星球必带当前群系的核心环境法则', function(){
  var p = APH.Planet.fallbackPlanet(12345);
  var lawId = p.biome.lawId;
  var hasCoreLaw = p.laws.some(function(l){ return l.id === lawId; });
  if (!hasCoreLaw) throw new Error('星球法则列表中应包含群系核心法则: ' + lawId);
});

test('biome_flora: generateExpeditionFlora 依据群系主导生成植被', function(){
  var bioForest = APH.Planet.BIOMES.biome_spore_forest;
  var floraForest = APH.Planet.generateExpeditionFlora(101, 1, bioForest);
  var glowCount = floraForest.filter(function(f){ return f.kind === 'flora_glow'; }).length;
  if (glowCount < floraForest.length / 2) {
    throw new Error('荧光菌林星主导植被应为荧蕈 (flora_glow)');
  }

  var bioCryo = APH.Planet.BIOMES.biome_cryo_tundra;
  var floraCryo = APH.Planet.generateExpeditionFlora(102, 1, bioCryo);
  var starCount = floraCryo.filter(function(f){ return f.kind === 'flora_star'; }).length;
  if (starCount < floraCryo.length / 2) {
    throw new Error('极地雪原星主导植被应为星绒草 (flora_star)');
  }
});

test('biome_atmosphere: 根据群系派生对应环境氛围粒子类型', function(){
  var biomes = APH.Planet.BIOMES;
  var pForest = { biome: biomes.biome_spore_forest };
  var pCryo = { biome: biomes.biome_cryo_tundra };
  var pAcid = { biome: biomes.biome_acid_marsh };
  var pCrystal = { biome: biomes.biome_crystal_wasteland };

  if (APH.Planet.particleTypeOf(pForest) !== 'spore') throw new Error('菌林应为 spore 粒子');
  if (APH.Planet.particleTypeOf(pCryo) !== 'snow') throw new Error('雪原应为 snow 粒子');
  if (APH.Planet.particleTypeOf(pAcid) !== 'steam') throw new Error('酸沼应为 steam 粒子');
  if (APH.Planet.particleTypeOf(pCrystal) !== 'spark') throw new Error('晶原应为 spark 粒子');
});


