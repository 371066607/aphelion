const childProcess = require('child_process');
const path = require('path');

test('后台世界继续模拟，但视觉 UI 与异步事件文案只属于当前前台会话', () => {
  const root = path.resolve(__dirname, '..');
  const probe = String.raw`
    'use strict';
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');
    const assert = require('assert');

    const scenarioPath = path.join(process.cwd(), 'tests', 'scenario.test.js');
    let bootstrap = fs.readFileSync(scenarioPath, 'utf8').replace(/^#!.*\n/, '');
    bootstrap = bootstrap.slice(0, bootstrap.indexOf('/* ---------- 极简断言器 ---------- */'));
    const sandbox = {
      require, console, process, Buffer, Uint8ClampedArray,
      setTimeout, clearTimeout, setInterval, clearInterval,
      __dirname: path.join(process.cwd(), 'tests')
    };
    sandbox.global = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(bootstrap, sandbox, { filename: 'background-ui-bootstrap.js' });

    const APH = sandbox.APH;
    APH.Main.start();
    const member = APH.state.meta.residents[0];
    const launched = APH.Main.launchExpedition({
      memberIds: [member.id], supply: { food: 0 }, objective: 'resources'
    });
    assert.ok(launched && launched.ok, '测试前置：远征应成功启动');

    const calls = [];
    ['setHint', 'showCard', 'floatText', 'setActBtn', 'setScanProgress', 'hideScanRing']
      .forEach(function(name){
        APH.UI[name] = function(){ calls.push([name].concat(Array.from(arguments))); };
      });

    const home = APH.state.worlds.home;
    home.war = home.war || {};
    const camp = {
      id: 'background-ui-camp', type: APH.CFG.entType.BUILDING,
      bid: 'bl_siege_camp', x: 1000, y: 1000, hp: 10, maxHp: 10
    };
    home.entities.push(camp);
    home.war.siege = {
      phase: 'camp', t: 10, shellT: 999,
      campId: camp.id, cx: camp.x, cy: camp.y
    };
    const siegeBefore = home.war.siege.t;
    APH.Main.simStep(0.016);
    assert.ok(home.war.siege.t < siegeBefore, '后台围攻危机必须继续推进');
    assert.ok(!calls.some(function(c){
      return c[0] === 'floatText' && String(c[1]).indexOf('围攻') >= 0;
    }), '后台围攻不能把提示画到远征前台');

    const vig = sandbox.document.getElementById('vig');
    vig.style.opacity = 'probe-opacity';
    calls.length = 0;
    APH.WorldRuntime.run(APH.state.worlds.home, function(ctx){
      ctx._background = true;
      ctx.war.pendingWave = { count: 0, tactic: 'assault', waves: 1 };
      APH.Main.startRaid();
    });
    assert.strictEqual(vig.style.opacity, 'probe-opacity',
      '后台袭击不能改写前台暗角 DOM');
    assert.ok(!calls.some(function(c){ return c[0] === 'setHint'; }),
      '后台袭击不能清空前台提示');

    APH.Main.switchWorld('home');
    const expedition = APH.state.worlds.expedition;
    const scout = expedition.entities.find(function(e){
      return e.type === APH.CFG.entType.RESIDENT && !e.dead;
    });
    const beacon = expedition.entities.find(function(e){
      return e.type === APH.CFG.entType.BEACON && !e.done;
    });
    assert.ok(scout && beacon, '测试前置：后台远征需有队员与未扫描信标');
    scout.x = beacon.x; scout.y = beacon.y;
    scout.tx = beacon.x; scout.ty = beacon.y;
    scout.userOrder = null;
    expedition.px = beacon.x; expedition.py = beacon.y;
    expedition.scanning = beacon; expedition.scanT = 0.99;
    calls.length = 0;
    APH.Main.simStep(0.05);
    assert.ok(beacon.done, '后台扫描必须继续完成');
    assert.ok(!calls.some(function(c){
      return c[0] === 'showCard' || c[0] === 'setScanProgress' ||
        c[0] === 'hideScanRing' || c[0] === 'setActBtn';
    }), '后台扫描不能更新前台扫描控件或事件卡');

    let deferred = null;
    APH.Events.enrichEvent = function(){
      return { then: function(fn){ deferred = fn; } };
    };
    calls.length = 0;
    APH.Main.applyEvent('ev_aurora', function(){ return 0.5; });
    assert.ok(deferred, '事件富化回调应被登记');
    calls.length = 0;
    deferred({ name: '当前家园富化', lore: '当前会话应显示的富化文案' });
    assert.ok(calls.some(function(c){
      return c[0] === 'showCard' && c[1] === '当前家园富化';
    }), '仍在相同前台会话时应显示富化文案');

    APH.Main.applyEvent('ev_aurora', function(){ return 0.5; });
    const staleDeferred = deferred;
    APH.Main.switchWorld('expedition');
    calls.length = 0;
    staleDeferred({ name: '过期家园富化', lore: '切走后不应出现' });
    assert.ok(!calls.some(function(c){ return c[0] === 'showCard'; }),
      '切换世界后，旧会话的异步富化不能污染新前台');

    const resident = APH.state.meta.residents[0];
    resident.mood = 10;
    calls.length = 0;
    APH.WorldRuntime.run(home, function(ctx){
      ctx._background = true;
      APH.Main.applyEvent('ev_aurora', function(){ return 0.5; });
    });
    const backgroundDeferred = deferred;
    assert.ok(resident.mood > 10, '后台事件效果必须照常落地');
    assert.strictEqual(calls.length, 0, '后台事件不能同步写前台视觉 UI');
    backgroundDeferred({ name: '后台富化', lore: '后台回调也不能显示' });
    assert.strictEqual(calls.length, 0, '后台事件的异步富化不能写前台视觉 UI');
  `;

  childProcess.execFileSync(process.execPath, ['-e', probe], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });
});
