/* llm.js 纯函数测试: extractJSON / mergeEnrichment / cacheKey */
'use strict';
const U = window.APH.U, LLM = window.APH.LLM, Planet = window.APH.Planet;

/* ---------- extractJSON ---------- */
test('extractJSON: 裸 JSON', () => {
  const o = LLM.extractJSON('{"a":1}');
  if (!o || o.a !== 1) throw new Error('解析失败');
});
test('extractJSON: markdown 代码块包裹', () => {
  const o = LLM.extractJSON('好的，以下是结果：\n```json\n{"planetName":"灰岸"}\n```\n完毕');
  if (!o || o.planetName !== '灰岸') throw new Error('代码块解析失败');
});
test('extractJSON: 前后杂文本', () => {
  const o = LLM.extractJSON('输出如下 {"x":[1,2]} 请查收');
  if (!o || o.x.length !== 2) throw new Error('杂文解析失败');
});
test('extractJSON: 非法输入返回 null(不抛错)', () => {
  if (LLM.extractJSON('完全没有 json') !== null) throw new Error('应返回 null');
  if (LLM.extractJSON('{"a":') !== null) throw new Error('坏 JSON 应返回 null');
  if (LLM.extractJSON(null) !== null) throw new Error('null 输入应返回 null');
});

/* ---------- mergeEnrichment ---------- */
const baseSpec = Planet.fallbackPlanet(31415);
test('merge: 合法富化全部生效', () => {
  const en = {
    planetName: '雾锁环带',
    paletteName: '菌紫荒原',
    beaconLore: baseSpec.beacons.map((b, i) => ({
      title: '异常' + i, lore: '档案内容足够长——' + i + '号信标记录到无法解释的规律震动。'
    })),
    laws: [{ id: baseSpec.laws[0].id, name: '夜潮酸涌', fact: '入夜后湖水pH骤降并腐蚀暴露皮肤。' }],
    factions: [{ id: baseSpec.enemies.factions[0].id, name: '哑光游囊', lore: '成群游荡，被光吸引却惧怕持续照明。' }],
  };
  const out = LLM.mergeEnrichment(baseSpec, en);
  if (out.name !== '雾锁环带') throw new Error('星球名未生效: ' + out.name);
  if (out.paletteName !== '菌紫荒原') throw new Error('地貌名未生效');
  if (!out.beacons[0].lore.includes('规律震动')) throw new Error('信标档案未生效');
  if (!out.beacons[0].name.startsWith('信标')) throw new Error('信标名前缀丢失: ' + out.beacons[0].name);
  if (out.laws[0].name !== '夜潮酸涌') throw new Error('法则名未生效');
  if (out.enemies.factions[0].name !== '哑光游囊') throw new Error('阵营名未生效');
  if (out.generatedBy !== 'llm') throw new Error('来源标记缺失');
});
test('merge: 结构不可变承诺(ADR-1 只增不改)', () => {
  const en = {
    planetName: '改名测试',
    beaconLore: baseSpec.beacons.map(b => ({ title: 't', lore: '足够长的档案文本用于测试。' })),
  };
  const out = LLM.mergeEnrichment(baseSpec, en);
  // 坐标/数值结构必须与原 spec 完全一致
  baseSpec.beacons.forEach((b, i) => {
    if (out.beacons[i].x !== b.x || out.beacons[i].y !== b.y)
      throw new Error('信标坐标被改动!');
  });
  if (out.enemies.factions[0].hp !== baseSpec.enemies.factions[0].hp)
    throw new Error('阵营数值被改动!');
  if (out.terrain.lakeR !== baseSpec.terrain.lakeR) throw new Error('地形被改动!');
});
test('merge: beaconLore 长度不匹配 → 整段忽略', () => {
  const en = { planetName:'短名', beaconLore:[{title:'x',lore:'只有一条但应有六条'}] };
  const out = LLM.mergeEnrichment(baseSpec, en);
  if (out.beacons[0].lore === '只有一条但应有六条') throw new Error('长度不符不应替换');
  if (out.generatedBy !== 'llm') throw new Error('名字部分仍应生效');
});
test('merge: 未知 law/faction id 忽略, 已知才替换', () => {
  const en = {
    laws: [
      { id:'lw_不存在', name:'幽灵法则', fact:'这条不该出现。' },
      { id: baseSpec.laws[0].id, name:'真实法则', fact:'这条应该生效了。' },
    ],
    factions: [{ id:'fx_不存在', name:'幽灵生物', lore:'这条也不该出现。' }],
  };
  const out = LLM.mergeEnrichment(baseSpec, en);
  if (out.laws.some(l => l.name === '幽灵法则')) throw new Error('未知 id 不应生效');
  const t = out.laws.find(l => l.id === baseSpec.laws[0].id);
  if (t.name !== '真实法则') throw new Error('已知 id 未生效');
});
test('merge: 恶意/超长输入被截断消毒', () => {
  const en = {
    planetName: 'X'.repeat(500),
    beaconLore: baseSpec.beacons.map(b => ({ title:'y'.repeat(300), lore:'z'.repeat(900) })),
  };
  const out = LLM.mergeEnrichment(baseSpec, en);
  if (out.name.length > 24) throw new Error('星球名未截断');
  if (out.beacons[0].name.split('·')[1].trim().length > 14) throw new Error('代号未截断');
  if (out.beacons[0].lore.length > 220) throw new Error('档案未截断');
});
test('merge: null/garbage 富化 → 原 spec 原样返回', () => {
  if (LLM.mergeEnrichment(baseSpec, null) !== baseSpec) throw new Error('null 应原样返回');
  const r = LLM.mergeEnrichment(baseSpec, 'not an object');
  if (r.generatedBy === undefined || r.generatedBy !== baseSpec.generatedBy)
    throw new Error('垃圾输入应保持原 spec');
});

/* ---------- cacheKey ---------- */
test('cacheKey: 同输入同 key, 异输入异 key', () => {
  const a = LLM.cacheKey({ n:'planet_v1', i:{ seed:1 } });
  const b = LLM.cacheKey({ n:'planet_v1', i:{ seed:1 } });
  const c = LLM.cacheKey({ n:'planet_v1', i:{ seed:2 } });
  if (a !== b) throw new Error('同输入不同 key');
  if (a === c) throw new Error('异输入同 key');
});
