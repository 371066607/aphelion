/* tests/layering.test.js — 模块层级铁律 (ADR-38)
   MODULE_ORDER 声明了加载顺序; 排在前面的模块**不得**反向引用排在后面的。
   曾经 colony.js / combat.js 共 12 处调用 APH.Main, 使模拟循环没有唯一归属者
   (main → colony → main), 是本项目最深的一处结构问题。 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');

/* 去掉注释与字符串字面量, 避免把说明文字误判成调用 */
function codeOf(file) {
  let t = fs.readFileSync(path.join(SRC, file), 'utf-8');
  t = t.replace(/\/\*[\s\S]*?\*\//g, ' ');      // 块注释
  t = t.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');  // 行注释
  t = t.replace(/'(?:[^'\\]|\\.)*'/g, "''");    // 单引号串
  t = t.replace(/"(?:[^"\\]|\\.)*"/g, '""');    // 双引号串
  return t;
}

/* build.py 的 MODULE_ORDER (含 DOM 层); main.js 是入口, 排最后 */
const ORDER = [
  'config.js','utils.js','building_art_data.js','building_art.js','input.js','humanoid.js','save.js','opening.js',
  'planet.js','llm.js','colony.js','rivals.js','events.js','nav.js','weather.js',
  'residents.js','alerts.js','combat.js','world.js','entities.js','visitors.js','colonytick.js','draw.js','sfx.js',
  'sprites.js','ui.js','hints.js','building_proto_model.js','building_proto_draw.js','building_proto.js','main.js',
];

/* 反向调用 main 的历史债: 棘轮式登记 —— 只许减少, 不许增加。
   ADR-39 已把 ui.js 的 27 处清零, 三类各有归宿:
     存档类(saveMetaQuiet/saveRivals/saveColony) → APH.Save / APH.Colony.persist / APH.Rivals.persistStates
     领域查询(haveStock/playerDefPower/applyTech) → 下沉到 APH.Colony
     命令派发(toggle / cycle 系列)               → APH.UI 命令表, main 启动时 registerCommands
   现在这张表是空的。想再往里加一行, 先说明为什么这个模块必须认识 main。 */
const MAIN_DEBT = {};

test('layering: 反向调用 main 的次数只减不增 (棘轮)', () => {
  const grew = [];
  ORDER.forEach(f => {
    if (f === 'main.js') return;
    const hits = (codeOf(f).match(/APH\.Main\./g) || []).length;
    const budget = MAIN_DEBT[f] || 0;
    if (hits > budget)
      grew.push(`${f}: ${hits} 处 > 允许的 ${budget}`);
  });
  if (grew.length)
    throw new Error('层级倒置增加了 —— 低层模块不得反向调用 main: ' + grew.join('; '));
});

test('layering: 模拟层已彻底不再反向调用 main (ADR-38/43)', () => {
  ['colony.js', 'combat.js', 'colonytick.js', 'visitors.js', 'draw.js'].forEach(f => {
    const hits = (codeOf(f).match(/APH\.Main\./g) || []).length;
    if (hits)
      throw new Error(f + ' 仍有 ' + hits + ' 处反向调用 main —— 模拟循环必须只有一个归属者');
  });
});

/* codeOf 会把字符串字面量剥掉, 而 onclick="...APH.Main.xxx()" 正好藏在字符串里 ——
   ADR-39 之前 ui.js 有 10 处这种从 HTML 里发起的反向调用, 棘轮根本数不到。
   这条用例读原文, 专门堵这个洞。 */
test('layering: 内联事件处理器里不得出现 APH.Main (ADR-39 命令表)', () => {
  /* 只剥注释, 保留字符串 —— 要找的东西就住在字符串里 */
  const raw = fs.readFileSync(path.join(SRC, 'ui.js'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const bad = (raw.match(/onclick="[^"]*APH\.Main/g) || []).length;
  if (bad)
    throw new Error(`ui.js 有 ${bad} 处 onclick 直接调 APH.Main —— 应改走 APH.UI.cmd('<命令名>')`);
});

/* ADR-40: 模拟层不得直接驱动视图。combat 52 处 + colony 6 处 APH.UI.* 已清零,
   改为 U.emit('notice'|'hint'|'death') 由 ui.js 订阅。 */
test('layering: 模拟层不得直接调用 APH.UI (ADR-40/43)', () => {
  ['colony.js', 'combat.js', 'colonytick.js', 'visitors.js', 'draw.js'].forEach(f => {
    const hits = (codeOf(f).match(/APH\.UI\./g) || []).length;
    if (hits)
      throw new Error(f + ' 有 ' + hits + ' 处直接调 APH.UI —— 模拟层应 emit 事件, 由 ui 订阅');
  });
});

test('layering: 模块不得引用加载顺序在自己之后的模块', () => {
  const NS = {
    'colony.js':'Colony','rivals.js':'Rivals','events.js':'Events','nav.js':'Nav',
    'weather.js':'Weather','residents.js':'Res','alerts.js':'Alerts','combat.js':'Combat',
    'world.js':'World','entities.js':'Ent','visitors.js':'Visitors','colonytick.js':'ColonyTick','draw.js':'Draw',
    'building_art.js':'BuildArt','sfx.js':'SFX','sprites.js':'Sprites',
    'building_proto_model.js':'BuildProtoModel','building_proto_draw.js':'BuildProtoDraw','building_proto.js':'BuildPrototype',
    'ui.js':'UI','hints.js':'Hints','main.js':'Main','planet.js':'Planet',
    'llm.js':'LLM','save.js':'Save',
    'opening.js':'Opening','input.js':'Input','humanoid.js':'Humanoid',
  };
  /* 已知的、暂时容忍的向后引用: 这些是本轮之后仍待处理的债, 列在此处使其可见。
     新增违规会让本用例变红; 修好一处就从这里删掉一行。 */
  const ALLOWED = {
    'colony.js':  ['Ent','Res','Combat','Weather','World','Save','Nav','Opening'],
    'combat.js':  ['Ent','Res','Weather','World','Save','Nav','Rivals','Colony'],
    'residents.js':['Combat','World','Nav','Colony'],
    'entities.js':['Res','Sprites','World','Weather','Colony'],
    'events.js':  ['Weather','Colony'],
    'world.js':   ['Ent','Weather'],
    'alerts.js':  ['Colony','Weather'],
    'save.js':    ['Res'],
    'sfx.js':     ['Save'],
    'llm.js':     ['Planet','Save'],
    'opening.js': ['OpeningData','OpeningVideo'],
  };
  const problems = [];
  ORDER.forEach((f, i) => {
    const code = codeOf(f);
    const later = ORDER.slice(i + 1).map(x => NS[x]).filter(Boolean);
    later.forEach(ns => {
      if (ns === 'Main') return;                       // 上一条用例专门管它
      if (!new RegExp('APH\\.' + ns + '\\.').test(code)) return;
      if ((ALLOWED[f] || []).indexOf(ns) >= 0) return; // 已登记的历史债
      problems.push(`${f} → APH.${ns}`);
    });
  });
  if (problems.length)
    throw new Error('新增的向后依赖(未登记): ' + problems.join(', '));
});

/* build.py 的 MODULE_ORDER 被几个测试入口各抄了一份。ADR-41 加 hints.js 时
   漏改 scenario 那份, 当场 55 条红 —— 而红的原因跟 hints 毫无关系, 只是模块没加载。
   这条用例只管一件事: 凡是加载 main.js 的入口, 不得漏掉 build.py 里的任何非 DOM 模块。
   (顺序不查 —— 各入口按需裁剪, 且模块间靠函数提升, 顺序容忍度比构建产物高。)
   故意不装某个模块是允许的, 但要写进该入口的 SKIP_MODULES 并说明理由 ——
   「漏了」和「不要」必须能分开, 否则这条护栏很快会被人用注释绕过去。 */
test('layering: 加载 main.js 的测试入口不得漏掉 build.py 里的模块', () => {
  const ROOT = path.join(__dirname, '..');
  const build = fs.readFileSync(path.join(ROOT, 'build.py'), 'utf-8');
  const block = build.slice(build.indexOf('MODULE_ORDER = ['));
  const canonical = block.slice(0, block.indexOf(']'))
    .match(/"([\w.]+\.js)"/g).map(s => s.replace(/"/g, ''));

  const DOM_ONLY = ['opening_data.js', 'sprite_data.js'];   // 这两个由入口另行注入
  const problems = [];
  ['run.js', 'scenario.test.js', 'perf.test.js', 'boss.test.js'].forEach(entry => {
    const src = fs.readFileSync(path.join(__dirname, entry), 'utf-8');
    const listed = (src.match(/'([\w.]+\.js)'/g) || []).map(s => s.replace(/'/g, ''));
    if (listed.indexOf('main.js') < 0) return;              // 不装 main 的入口自行裁剪
    /* 入口可以显式声明「故意不装」, 但必须写在 SKIP_MODULES 里说明理由 */
    const skipDecl = src.match(/const SKIP_MODULES = \[([^\]]*)\]/);
    const skip = skipDecl ? (skipDecl[1].match(/'([\w.]+\.js)'/g) || []).map(s => s.replace(/'/g, '')) : [];
    canonical.forEach(f => {
      if (DOM_ONLY.indexOf(f) >= 0 || skip.indexOf(f) >= 0) return;
      if (listed.indexOf(f) < 0) problems.push(`${entry} 漏了 ${f}`);
    });
  });
  if (problems.length) throw new Error('测试入口与 build.py 不一致: ' + problems.join('; '));
});
