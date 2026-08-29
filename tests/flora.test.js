/* tests/flora.test.js — 异星奇幻农耕与远征驯化测试 (Tickets #34~#38)
   纯注册式测试文件，由 run.js 自动加载。 */
'use strict';

test('flora_items: 异星特产与种子物品定义齐全', function(){
  var items = APH.CFG.items;
  if (!items.it_glow_fluid) throw new Error('缺失 it_glow_fluid');
  if (!items.it_crystal_berry) throw new Error('缺失 it_crystal_berry');
  if (!items.it_dew_fruit) throw new Error('缺失 it_dew_fruit');
  if (!items.it_star_fiber) throw new Error('缺失 it_star_fiber');
  if (!items.it_seed_glow) throw new Error('缺失 it_seed_glow');
  if (!items.it_seed_crystal) throw new Error('缺失 it_seed_crystal');
  if (!items.it_seed_dew) throw new Error('缺失 it_seed_dew');
  if (!items.it_seed_star) throw new Error('缺失 it_seed_star');
});

test('alien_crops: 4 大外星奇幻植物定义', function(){
  var crops = APH.Colony.ALIEN_CROPS;
  if (!crops) throw new Error('缺失 ALIEN_CROPS 表');
  if (!crops.crop_glow_shroom || crops.crop_glow_shroom.glowR !== 60) {
    throw new Error('crop_glow_shroom 应当具有 60px 光圈');
  }
  if (!crops.crop_crystal_vine || !crops.crop_crystal_vine.extraItem) {
    throw new Error('crop_crystal_vine 应当产出副产物晶体');
  }
  if (!crops.crop_dew_fruit || crops.crop_dew_fruit.moodBoost !== 6) {
    throw new Error('crop_dew_fruit 应当提供 +6 心情增益');
  }
  if (!crops.crop_star_velvet) throw new Error('缺失 crop_star_velvet');
});

test('crop_plot: 建筑目录包含轻量外星种植圃 bl_crop_plot', function(){
  var def = APH.Colony.get('bl_crop_plot');
  if (!def) throw new Error('缺失 bl_crop_plot');
  if (!def.costRes || !def.costRes.wood) throw new Error('bl_crop_plot 需消耗木材');
  if (def.cost !== 0) throw new Error('建造不应扣除研究点');
});

test('bioluminescence: getGlowSources 派生夜光荧蕈生物发光源', function(){
  var buildings = [
    { id: 'bl_crop_plot', x: 1000, y: 1000, crop: 'crop_glow_shroom', plot: { stage: 3 } }, // 成熟荧蕈
    { id: 'bl_crop_plot', x: 1200, y: 1200, crop: 'crop_dew_fruit', plot: { stage: 3 } }   // 露果不发光
  ];
  var lights = APH.Colony.getGlowSources(buildings);
  if (!Array.isArray(lights) || lights.length !== 1) {
    throw new Error('应仅有 1 个荧蕈生物发光源，实际: ' + (lights && lights.length));
  }
  if (lights[0].x !== 1000 || lights[0].r !== 60) {
    throw new Error('荧蕈发光源坐标或半径不符: ' + JSON.stringify(lights[0]));
  }
});

test('expedition_flora: generateExpeditionFlora 生成远征野生异星植物', function(){
  var flora = APH.Planet.generateExpeditionFlora(12345, 1);
  if (!Array.isArray(flora) || flora.length < 4) {
    throw new Error('远征地图应生成至少 4 处异星植物样本');
  }
  var hasGlow = flora.some(function(f){ return f.kind === 'flora_glow'; });
  var hasCrystal = flora.some(function(f){ return f.kind === 'flora_crystal'; });
  if (!hasGlow || !hasCrystal) throw new Error('远征生态应包含野生荧蕈与晶藤');
});

test('seeds: 远征采种与返航结算', function(){
  var carry = { it_seed_glow: 2, it_seed_dew: 1, it_crystal_ore: 3 };
  var settled = APH.Combat.settleGoods(carry);
  if (!settled.seeds || settled.seeds.it_seed_glow !== 2) {
    throw new Error('返航结算应正确保留种子样本');
  }
  if (settled.research !== 6) { // 3 * 2 = 6
    throw new Error('晶体矿应正常结算研究点，实际: ' + settled.research);
  }
});

test('cultivation: cropPlotTick 推进异星作物生长并成熟', function(){
  var plot = { stage: 0, t: 0 };
  var crop = 'crop_dew_fruit'; // growTicks=4

  // 1. 无人在岗冻结
  APH.Colony.cropPlotTick(plot, null, 1, 1, crop);
  if (plot.stage !== 0 || plot.t !== 0) throw new Error('无人在岗时作物生长应冻结');

  // 2. 8 级农民推进生长
  for(var i=0; i<6; i++){
    APH.Colony.cropPlotTick(plot, 8, 1.2, 1, crop);
  }
  if (plot.stage < 3) throw new Error('高技能农民经过多跳应培育至成熟 (stage=3)，实际: ' + plot.stage);
});

test('harvest: harvestAlienCrop 产出对应外星特产与副产物', function(){
  var harvestGlow = APH.Colony.harvestAlienCrop('crop_glow_shroom', 5);
  if (harvestGlow.dropItemId !== 'it_glow_fluid' || harvestGlow.dropCount < 4) {
    throw new Error('荧蕈收割应产出荧光浆液: ' + JSON.stringify(harvestGlow));
  }

  var harvestCrystal = APH.Colony.harvestAlienCrop('crop_crystal_vine', 6);
  if (harvestCrystal.dropItemId !== 'it_crystal_berry' || !harvestCrystal.extraItemId) {
    throw new Error('晶藤收割应产出晶核果与额外晶体矿: ' + JSON.stringify(harvestCrystal));
  }

  var harvestDew = APH.Colony.harvestAlienCrop('crop_dew_fruit', 6);
  if (harvestDew.dropItemId !== 'it_dew_fruit' || harvestDew.moodBoost !== 6) {
    throw new Error('露果收割应产出甜美露果与心情增益: ' + JSON.stringify(harvestDew));
  }
});

test('flora_integration: 种植圃品种切换与全链路状态机流通', function(){
  var plot = { id: 'plot_1', bid: 'bl_crop_plot', crop: 'crop_glow_shroom', plot: { stage: 0, t: 0 } };
  var crops = Object.keys(APH.Colony.ALIEN_CROPS);

  // 1. 品种循环轮转
  var nextCrop = crops[(crops.indexOf(plot.crop) + 1) % crops.length];
  plot.crop = nextCrop;
  if (plot.crop !== 'crop_crystal_vine') throw new Error('品种切换应为 crop_crystal_vine');

  // 2. 生长与成熟
  for(var i=0; i<8; i++){
    APH.Colony.cropPlotTick(plot.plot, 6, 1.0, 1, plot.crop);
  }
  if (plot.plot.stage < 3) throw new Error('应成熟');

  // 3. 收割
  var h = APH.Colony.harvestAlienCrop(plot.crop, 6);
  if (!h.dropItemId || h.dropCount <= 0) throw new Error('收割应成功');
});




