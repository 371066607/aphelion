/* W2 导演调度接线 (issue #87): ev_weather 卡资格/导演掷骰(rng注入)/喘息窗口
   seams: APH.Events.{DECK,pickEvent,directorTick} + APH.Weather.tickWeather
   期望值手工推导; 天气时钟单位=秒, 事件状态单位=分钟。 */
'use strict';
const Ev = window.APH.Events;
const CFG = window.APH.CFG;
const A = window.APH.U.assert;

function baseCtx(over){
  return Object.assign({
    threat:0, moodAvg:80, sinceNeg:99, cooldowns:{},
    residentCount:2, hasSpareBed:true, hasPasture:true, hasFarm:true,
    hasTurret:true, visitorSlot:true, rivalReady:true, raidActive:false,
    /* 天气上下文: main.js storyCtx 必带; 单元测试带上即可让 ev_weather 参与 */
    weather:{ id:'wx_clear', t:0 },
  }, over||{});
}
function seqRng(vals){
  let i=0;
  return () => vals[Math.min(i++, vals.length-1)];
}
/* 除 keep 外全部卡 99 分钟冷却 */
function otherCds(keep){
  const cds={};
  Object.keys(CFG.events.deck).forEach(id=>{ if(id!==keep) cds[id]=99; });
  return cds;
}

/* ---------- 卡组与资格 ---------- */
test('ev_weather: 进卡组且 w/cd/文案齐备', () => {
  const card=Ev.DECK.find(c=>c.id==='ev_weather');
  A(!!card, 'ev_weather 应在 DECK');
  const cfg=CFG.events.deck.ev_weather;
  A(cfg && cfg.w>0 && cfg.cd>0, 'CFG.events.deck.ev_weather 应有 w/cd');
  const t=Ev.textOf('ev_weather');
  A(t.name && t.name.length>=2 && t.lore && t.lore.length>=10, 'ev_weather 缺文案');
  A(card.can(baseCtx())===true, '晴天+无冷却应可参与');
});

test('ev_weather: can 谓词 = 非冷却期 且 需天气上下文', () => {
  const card=Ev.DECK.find(c=>c.id==='ev_weather');
  A(card.can({ weather:{id:'wx_clear',t:0}, cooldowns:{} })===true, '非冷却应可选');
  A(card.can({ weather:{id:'wx_clear',t:0}, cooldowns:{ ev_weather:1 } })===false,
    '冷却期不可选');
  A(card.can({ cooldowns:{} })===false, '无天气上下文不可选');
});

test('pickEvent: 冷却期 ev_weather 不可选(全卡冷却→抽空)', () => {
  const cds=otherCds(null); cds.ev_weather=5;
  const p=Ev.pickEvent(baseCtx({ cooldowns:cds }), seqRng([0.5]));
  A(p===null, '全冷却应抽空, got '+(p&&p.id));
});

test('pickEvent: 仅剩 ev_weather 未冷却时必抽中', () => {
  const p=Ev.pickEvent(baseCtx({ cooldowns:otherCds('ev_weather') }), seqRng([0.5]));
  A(p && p.id==='ev_weather', '只剩天气卡, got '+(p&&p.id));
});

test('pickEvent: 无天气上下文时 ev_weather 不参与(兼容资格过滤)', () => {
  const ctx=baseCtx(); delete ctx.weather;
  for(let i=0;i<20;i++){
    const p=Ev.pickEvent(ctx, seqRng([i/20]));
    A(p===null || p.id!=='ev_weather', '无天气上下文不应抽到天气, got '+(p&&p.id));
  }
});

/* ---------- 导演掷骰 ---------- */
test('directorTick: ev_weather 推进天气时钟(晴 → 保底1天, 不切)', () => {
  const st={ nextIn:0.1, sinceNeg:99, cooldowns:otherCds('ev_weather'), weatherAcc:0 };
  const r=Ev.directorTick(st, baseCtx(), seqRng([0.5,0.5,0.5]), 0.5);
  A(r.fired==='ev_weather', '应掷出天气事件, got '+r.fired);
  A(r.neg===false, 'ev_weather 非负面');
  A(r.weather && r.weather.id==='wx_clear' && r.weather.t===CFG.events.weatherStepSec,
    '晴天应推进 1 天, got '+JSON.stringify(r.weather));
  A(r.state.weatherAcc===0, '掷骰后天气时钟应归零, got '+r.state.weatherAcc);
  A(r.state.cooldowns.ev_weather===CFG.events.deck.ev_weather.cd, 'ev_weather 应进冷却');
});

test('directorTick: 未到期不发事件, 天气时钟仍累计', () => {
  const st={ nextIn:5, sinceNeg:99, cooldowns:{}, weatherAcc:600 };
  const r=Ev.directorTick(st, baseCtx(), seqRng([0.5]), 0.5);
  A(r.fired===null && r.weather===undefined, '未到期不应掷骰');
  A(r.state.weatherAcc===630, '天气时钟应累计 600+30, got '+r.state.weatherAcc);
});

test('directorTick: 非天气事件不动天气时钟', () => {
  const st={ nextIn:0.1, sinceNeg:99, cooldowns:otherCds('ev_droppod'), weatherAcc:300 };
  const r=Ev.directorTick(st, baseCtx(), seqRng([0.5,0.5]), 0.5);
  A(r.fired==='ev_droppod', '应发补给舱, got '+r.fired);
  A(r.weather===undefined, '非天气事件不应返回天气');
  A(r.state.weatherAcc===330, '天气时钟应保留累计, got '+r.state.weatherAcc);
});

/* ---------- 喘息窗口(极端天气结束强制缓解) ----------
   暴雪转移表 {wx_snow:3, wx_clear:2}; rng_weather=0 → wx_snow(非极端)
   → 导演覆写为强制晴天窗口 + sinceNeg=0 + restFor=rollRest([2,4]) */
test('directorTick: 极端结束 → 强制晴天窗口+喘息(sinceNeg=0, restFor∈[2,4])', () => {
  const st={ nextIn:0.1, sinceNeg:99, cooldowns:otherCds('ev_weather'), weatherAcc:600 };
  const ctx=baseCtx({ weather:{ id:'wx_blizzard', t:2000, cd:{ wx_blizzard:840 } } });
  const r=Ev.directorTick(st, ctx, seqRng([0.5,0.5,0.5,0,0.5]), 0.5);
  A(r.fired==='ev_weather', '应掷出天气事件, got '+r.fired);
  A(r.weather && r.weather.id==='wx_clear' && r.weather.t===0,
    '极端结束应强制晴天窗口, got '+JSON.stringify(r.weather));
  A(r.weather.cd && r.weather.cd.wx_blizzard===840,
    '极端冷却应保留防连击, got '+JSON.stringify(r.weather.cd));
  A(r.state.sinceNeg===0, '极端结束 sinceNeg 应归零, got '+r.state.sinceNeg);
  A(r.state.restFor!=null && r.state.restFor>=2 && r.state.restFor<=4,
    '喘息窗口应设置 restFor, got '+r.state.restFor);
});

test('directorTick: 极端→极端连击不强制不清零(马尔可夫原样)', () => {
  /* 雷暴转移 {wx_rain:3, wx_clear:3, wx_blizzard:1}; rng=0.99×7=6.93 → wx_blizzard */
  const st={ nextIn:0.1, sinceNeg:99, cooldowns:otherCds('ev_weather'), weatherAcc:600 };
  const ctx=baseCtx({ weather:{ id:'wx_thunder', t:2000, cd:{ wx_thunder:630 } } });
  const r=Ev.directorTick(st, ctx, seqRng([0.5,0.5,0.5,0.99]), 0.5);
  A(r.weather && r.weather.id==='wx_blizzard',
    '雷暴→暴雪应原样连锁, got '+(r.weather&&r.weather.id));
  A(r.weather.cd.wx_blizzard===840 && r.weather.cd.wx_thunder===630,
    '新旧极端冷却应俱备, got '+JSON.stringify(r.weather.cd));
  A(r.state.sinceNeg===99.5, '连击不触发喘息, got '+r.state.sinceNeg);
  A(r.state.restFor===null, '连击不设缓息窗口, got '+r.state.restFor);
});

test('directorTick: 喘息窗口内负面事件被抑制, 天气卡照常', () => {
  /* 只留 ev_weather(非负面) 与 ev_raid(负面) 未冷却; sinceNeg=0 < restFor=3 */
  const cds=otherCds(null); delete cds.ev_weather; delete cds.ev_raid;
  const st={ nextIn:0.1, sinceNeg:0, restFor:3, cooldowns:cds, weatherAcc:0 };
  const r=Ev.directorTick(st, baseCtx(), seqRng([0.5,0.5,0.5]), 0.5);
  A(r.fired==='ev_weather', '喘息内 raid 应被抑制而天气照常, got '+r.fired);
  A(r.state.cooldowns.ev_raid===undefined, '被抑制的 raid 不应进冷却');
});
