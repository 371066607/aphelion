'use strict';
const Colony = window.APH.Colony;
const Res = window.APH.Res;
const G = (window.APH.CFG && APH.CFG.GRID) || 48;

test('#178 filth: 加脏与清扫', () => {
  if (typeof Colony.addFilth !== 'function') throw new Error('缺失 addFilth');
  let map = {};
  map = Colony.addFilth(map, G, G, 30);
  if (Colony.filthAt(map, G + 2, G) < 30) throw new Error('同格应脏');
  map = Colony.cleanCells(map, [{ x: G, y: G }], 30);
  if (Colony.filthAt(map, G, G) !== 0) throw new Error('扫完应干净');
});

test('#179 building hp: 掉耐久可修理', () => {
  const b = { id: 'bl_house', hp: 50, maxHp: 80 };
  Colony.decayBuilding(b, 5);
  if (b.hp !== 45) throw new Error('应掉 5, 实际: ' + b.hp);
  Colony.repairBuilding(b, 10);
  if (b.hp !== 55) throw new Error('应修到 55');
});

test('#180 parts: 六部位与腿伤减速', () => {
  const r = Res.generate('p2', 1);
  Res.ensureParts(r);
  ['head','torso','armL','armR','legL','legR'].forEach(function(p){
    if (r.parts[p] !== 1) throw new Error(p + ' 初始应为 1');
  });
  Res.hurtPart(r, 'legL', 0.6);
  if (r.parts.legL > 0.41) throw new Error('腿应受伤');
  const mul = Res.partsMoveMul(r);
  if (!(mul < 1)) throw new Error('腿伤应减速');
});

test('#181 corpse: 埋葬标记死亡', () => {
  const c = Res.makeCorpse({ id: 'rs_x', name: '青禾' }, 100, 200);
  if (c.type !== 'corpse' || c.name !== '青禾') throw new Error('应是尸体');
  Res.buryCorpse(c);
  if (!c.dead) throw new Error('埋葬后应 dead');
});

test('#182 fire: 火会蔓延或熄灭', () => {
  let fires = Colony.addFire([], 48, 48);
  fires[0].hp = 3;
  fires = Colony.tickFires(fires, function(){ return 0; });
  if (fires.length !== 0 && fires[0].hp >= 3) throw new Error('应变弱');
});

test('#184 hunt: workOnAnimal 猎杀掉肉', () => {
  const an = { hp: 5, dead: false };
  const r = Colony.workOnAnimal(an, 1);
  if (!r.done || r.dropItemId !== 'it_food') throw new Error('应猎获食物');
  if (!an.dead) throw new Error('羊应倒下');
});

test('#182 fire: 灭火格熄灭', () => {
  let fires = Colony.addFire([], G, G);
  if (!fires.length) throw new Error('应着火');
  fires = Colony.douseFires(fires, [{ x: G, y: G }]);
  if (fires.length) throw new Error('灭火后应空');
});

test('#185 prisoner: 俘虏与释放', () => {
  const meta = { prisoners: [] };
  const en = { id:'en_1', name:'袭击者', x:10, y:10, dead:false };
  const p = Res.capturePrisoner(meta, en);
  if (!p || meta.prisoners.length !== 1) throw new Error('应入监');
  if (!en.dead) throw new Error('俘虏后战场实体应消失');
  if (!Res.releasePrisoner(meta, p.id) || meta.prisoners.length !== 0) throw new Error('应释放');
});

test('#184 animals: 牧场同步出羊', () => {
  const pasture = { id:'bl_pasture', x:600, y:600, herd:2 };
  const ents = Colony.syncPastureAnimals(pasture, []);
  const sheep = ents.filter(e => e.type==='animal');
  if (sheep.length !== 2) throw new Error('应有 2 只羊, 实际: '+sheep.length);
});

test('#183 restrict: 活动区外不允许', () => {
  const z = Colony.addRestrictZone([], [{ x: G, y: G }]).zone;
  const pawn = { restrictId: z.id };
  if (!Colony.pointAllowed([z], pawn, G, G)) throw new Error('区内应允许');
  if (Colony.pointAllowed([z], pawn, G * 5, G * 5)) throw new Error('区外不应允许');
  if (!Colony.pointAllowed([z], {}, G * 5, G * 5)) throw new Error('无限制应到处可去');
});
