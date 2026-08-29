/* tests/science.test.js — 外星实物标本化验与科研系统测试 (Tickets #51~#55)
   纯注册式测试文件，由 run.js 自动加载。 */
'use strict';

test('specimen_items: 7 大异星实物标本定义齐全', function(){
  var items = APH.CFG.items;
  if (!items.specimen_flora_glow || !items.specimen_flora_glow.isSpecimen) throw new Error('缺失 specimen_flora_glow');
  if (!items.specimen_dew || !items.specimen_dew.isSpecimen) throw new Error('缺失 specimen_dew');
  if (!items.specimen_crystal_vine) throw new Error('缺失 specimen_crystal_vine');
  if (!items.specimen_star_velvet) throw new Error('缺失 specimen_star_velvet');
  if (!items.specimen_chitin) throw new Error('缺失 specimen_chitin');
  if (!items.specimen_acid_gland) throw new Error('缺失 specimen_acid_gland');
  if (!items.specimen_ancient_chip) throw new Error('缺失 specimen_ancient_chip');
});

test('specimen_analysis: 标本化验表与回报契约合法', function(){
  var analysis = APH.Colony.SPECIMEN_ANALYSIS;
  if (!analysis) throw new Error('缺失 APH.Colony.SPECIMEN_ANALYSIS');
  for (var k in analysis){
    var a = analysis[k];
    if (!a.name || !a.craftTime || !a.eurekaResearch) {
      throw new Error('化验数据残缺: ' + k);
    }
  }
  if (!analysis.specimen_flora_glow.unlockCrop) throw new Error('荧蕈化验应解锁作物');
  if (!analysis.specimen_flora_glow.seedOutput) throw new Error('荧蕈化验应产出纯净种子');
});

test('lab_pipeline: labAnalysisTick 推进标本化验与样本消耗', function(){
  var lab = { id: 'bl_lab', analysisTarget: 'specimen_flora_glow', analysisProgress: 0 };
  var stock = { specimen_flora_glow: 2 };

  var res1 = APH.Colony.labAnalysisTick(lab, 6, 1.0, stock, 6);
  if (res1.done) throw new Error('6s 工时未完成化验');
  if (lab.analysisProgress < 5) throw new Error('分析进度应推进');

  var res2 = APH.Colony.labAnalysisTick(lab, 6, 1.0, stock, 12);
  if (!res2.done || res2.specimenId !== 'specimen_flora_glow') {
    throw new Error('化验应完成: ' + JSON.stringify(res2));
  }
  if (stock.specimen_flora_glow !== 1) {
    throw new Error('实物标本应被消耗 1 个，实际剩余: ' + stock.specimen_flora_glow);
  }
});

test('expedition_specimens: 远征野生植株掉落实物标本而非现成种子', function(){
  var flora = APH.Planet.generateExpeditionFlora(101, 1);
  var glowPlant = flora.find(function(f){ return f.kind === 'flora_glow'; });
  if (!glowPlant || glowPlant.seedItem !== 'specimen_flora_glow') {
    throw new Error('野外荧蕈应提供 specimen_flora_glow 标本，实际: ' + (glowPlant && glowPlant.seedItem));
  }
  var dewPlant = flora.find(function(f){ return f.kind === 'flora_dew'; });
  if (dewPlant && dewPlant.seedItem !== 'specimen_dew') {
    throw new Error('野外露果应提供 specimen_dew，实际: ' + dewPlant.seedItem);
  }
});

test('specimen_drops: 酸吐者/硅壳/Boss 掉落实物标本', function(){
  var spit = APH.Combat.specimenDropsOf({ faction:{ id:'fx_spit', behavior:'spitter' } });
  if (!spit.some(function(d){ return d.id === 'specimen_acid_gland'; })) {
    throw new Error('酸吐者应掉落 specimen_acid_gland: ' + JSON.stringify(spit));
  }
  var tank = APH.Combat.specimenDropsOf({ faction:{ id:'fx_bulwark', behavior:'tank' } });
  if (!tank.some(function(d){ return d.id === 'specimen_chitin'; })) {
    throw new Error('硅壳壁垒应掉落 specimen_chitin: ' + JSON.stringify(tank));
  }
  var boss = APH.Combat.specimenDropsOf({ isBoss:true, faction:{ id:'fx_maw', behavior:'melee_swarm' } });
  if (!boss.some(function(d){ return d.id === 'specimen_ancient_chip'; })) {
    throw new Error('Boss 应掉落 specimen_ancient_chip: ' + JSON.stringify(boss));
  }
});

test('settleGoods: 返航保留实物标本，不折算研究点', function(){
  var g = APH.Combat.settleGoods({
    specimen_flora_glow: 2,
    specimen_chitin: 1,
    it_crystal_ore: 3
  });
  if (!g.specimens || g.specimens.specimen_flora_glow !== 2) {
    throw new Error('返航应保留荧蕈标本: ' + JSON.stringify(g.specimens));
  }
  if (g.specimens.specimen_chitin !== 1) throw new Error('应保留甲壳标本');
  if (g.research !== 6) throw new Error('晶体矿仍应结算研究点，实际: ' + g.research);
});

test('collectHome: 标本入库而不是立刻变成研究点', function(){
  var meta = { research: 0, res: {} };
  var r = APH.Colony.collectHome(meta, 'specimen_flora_glow', 2);
  if (r.kind !== 'stock') throw new Error('标本应入库, 实际: ' + r.kind);
  if ((meta.res.specimen_flora_glow || 0) !== 2) {
    throw new Error('仓内应有 2 份荧蕈标本, 实际: ' + meta.res.specimen_flora_glow);
  }
  if ((meta.research || 0) !== 0) throw new Error('标本不应折算研究点, 实际: ' + meta.research);
});

test('eureka: applySpecimenAnalysis 解锁作物、吐出种子并注入研究点', function(){
  var meta = { research: 10, tech: {}, analyzedFlora: {} };
  var stock = {};
  var def = APH.Colony.SPECIMEN_ANALYSIS.specimen_flora_glow;
  var out = APH.Colony.applySpecimenAnalysis(meta, stock, def, 'specimen_flora_glow');
  if (!meta.analyzedFlora.crop_glow_shroom) throw new Error('应点亮荧蕈种植权限');
  if (!meta.analyzedSpecimens || !meta.analyzedSpecimens.specimen_flora_glow) {
    throw new Error('应标记标本已化验');
  }
  if (out.seeds.it_seed_glow !== 3) throw new Error('应产出 3 份纯净种荚: ' + JSON.stringify(out.seeds));
  if (meta.research !== 40) throw new Error('应注入 +30 尤里卡, 实际: ' + meta.research);
  if (!APH.Colony.canPlantCrop('crop_glow_shroom', meta.analyzedFlora)) {
    throw new Error('化验后应可种植荧蕈');
  }
  if (APH.Colony.canPlantCrop('crop_dew_fruit', meta.analyzedFlora)) {
    throw new Error('未化验露果不可种植');
  }
});

test('crop_lock: 未化验作物不可选，化验后可循环切换', function(){
  if (APH.Colony.cycleAnalyzedCrop('crop_glow_shroom', {}) !== null) {
    throw new Error('未化验时应无法切换作物');
  }
  var analyzed = { crop_glow_shroom: true, crop_dew_fruit: true };
  var next = APH.Colony.cycleAnalyzedCrop('crop_glow_shroom', analyzed);
  if (next !== 'crop_dew_fruit') throw new Error('应切到下一已化验作物, 实际: ' + next);
});

test('lab_cycle: cycleAnalysisTarget 轮换化验队列', function(){
  var next = APH.Colony.cycleAnalysisTarget('specimen_flora_glow');
  if (!next || next === 'specimen_flora_glow') throw new Error('应切到下一标本: ' + next);
  var keys = Object.keys(APH.Colony.SPECIMEN_ANALYSIS);
  if (keys.indexOf(next) < 0) throw new Error('切换目标必须在化验表内');
});

test('lab_starved: 标本库存为 0 时化验不推进', function(){
  var lab = { id: 'bl_lab', analysisTarget: 'specimen_flora_glow', analysisProgress: 0 };
  var stock = { specimen_flora_glow: 0 };
  var res = APH.Colony.labAnalysisTick(lab, 8, 1.0, stock, 20);
  if (res.done) throw new Error('无标本不应完成化验');
  if (lab.analysisProgress) throw new Error('无标本进度不应推进, 实际: ' + lab.analysisProgress);
});

test('chitin_unlock: 无水培时硅壳化验不授予科技，仍记已化验并注入尤里卡', function(){
  var meta = { research: 0, tech: {}, analyzedFlora: {} };
  var def = APH.Colony.SPECIMEN_ANALYSIS.specimen_chitin;
  var out = APH.Colony.applySpecimenAnalysis(meta, {}, def, 'specimen_chitin');
  if (out.unlockTech) throw new Error('无前置不应授予科技: ' + out.unlockTech);
  if (meta.tech.te_bio_adaptation) throw new Error('无水培时不应写入 te_bio_adaptation');
  if (meta.research !== 50) throw new Error('应注入 +50 尤里卡, 实际: ' + meta.research);
  if (!meta.analyzedSpecimens.specimen_chitin) throw new Error('应标记甲壳已化验');
});

test('chitin_unlock: 已有水培时硅壳化验授予 te_bio_adaptation', function(){
  var meta = { research: 0, tech: { te_hydroponics: 1 }, analyzedFlora: {} };
  var def = APH.Colony.SPECIMEN_ANALYSIS.specimen_chitin;
  var out = APH.Colony.applySpecimenAnalysis(meta, {}, def, 'specimen_chitin');
  if (out.unlockTech !== 'te_bio_adaptation') throw new Error('应解锁 te_bio_adaptation');
  if (!meta.tech.te_bio_adaptation) throw new Error('meta.tech 应写入 te_bio_adaptation');
});

test('collectHome_seeds: 纯净种荚入库不折算研究点', function(){
  var meta = { research: 0, res: {} };
  var r = APH.Colony.collectHome(meta, 'it_seed_glow', 3);
  if (r.kind !== 'stock') throw new Error('种荚应入库, 实际: ' + r.kind);
  if ((meta.res.it_seed_glow || 0) !== 3) {
    throw new Error('仓内应有 3 份荧蕈孢子, 实际: ' + JSON.stringify(meta.res));
  }
  if ((meta.research || 0) !== 0) throw new Error('种荚不应折算研究点, 实际: ' + meta.research);
});

test('reagent: 强酸腺囊化验产出精纯试剂', function(){
  if (!APH.CFG.items.it_reagent) throw new Error('缺失 it_reagent');
  var meta = { research: 0, tech: {} };
  var def = APH.Colony.SPECIMEN_ANALYSIS.specimen_acid_gland;
  var out = APH.Colony.applySpecimenAnalysis(meta, {}, def, 'specimen_acid_gland');
  if (out.seeds.it_reagent !== 2) {
    throw new Error('应产出 2 份精纯试剂: ' + JSON.stringify(out.seeds));
  }
  if (meta.research !== 45) throw new Error('腺囊应注入 +45 尤里卡, 实际: ' + meta.research);
});

test('codex_entries: specimenCodexEntries 区分已化验与未化验', function(){
  var fn = APH.Colony.specimenCodexEntries;
  if (!fn) throw new Error('缺失 APH.Colony.specimenCodexEntries');
  var entries = fn({ analyzedSpecimens: { specimen_flora_glow: true } });
  if (!entries || entries.length !== 7) {
    throw new Error('应列出 7 大标本, 实际: ' + (entries && entries.length));
  }
  var glow = null, dew = null;
  for (var i = 0; i < entries.length; i++){
    if (entries[i].id === 'specimen_flora_glow') glow = entries[i];
    if (entries[i].id === 'specimen_dew') dew = entries[i];
  }
  if (!glow || !glow.analyzed) throw new Error('荧蕈标本应标记已化验');
  if (!dew || dew.analyzed) throw new Error('未化验露果不应点亮');
  if (!glow.name || glow.name.indexOf('荧蕈') < 0) throw new Error('已化验条目应带中文名');
  if (!glow.analysisName) throw new Error('已化验条目应带化验课题名');
});
