'use strict';

global.window = global;
window.APH = {};
require('../src/building_proto_model.js');

const M = window.APH.BuildProtoModel;
let passed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function equal(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error((message || 'values differ') + '\nexpected: ' + JSON.stringify(expected) + '\nactual:   ' + JSON.stringify(actual));
  }
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (error) {
    console.error('  ✗ ' + name + '\n      ' + error.message);
    process.exitCode = 1;
  }
}

function built(state, bid, gx, gy, rotation) {
  const result = M.place(state, bid, gx, gy, rotation || 0, true);
  assert(result.ok, 'place ' + bid + ' failed: ' + result.why);
  return result.object;
}

test('公开接口、48px 几何和旋转 footprint 稳定', () => {
  assert(M && M.G === 48, 'G must be 48');
  ['createState', 'footprint', 'cellsOf', 'rectOf', 'canPlace', 'place', 'demolish',
    'objectAt', 'interactionsOf', 'command', 'tick', 'rebuild', 'snapshot'].forEach(name => {
    assert(typeof M[name] === 'function', name + ' must be exported');
  });
  equal(M.footprint('bl_bed', 0), { w: 1, h: 2 });
  equal(M.footprint('bl_bed', 1), { w: 2, h: 1 });
  equal(M.cellsOf({ bid: 'bl_workshop', gx: 3, gy: 4, rotation: 1 }), [
    { gx: 3, gy: 4 }, { gx: 3, gy: 5 }
  ]);
  equal(M.rectOf({ bid: 'bl_dining_table', gx: 2, gy: 3, rotation: 0 }),
    { x: 96, y: 144, w: 96, h: 96 });
  assert(M.canPlace(M.createState(false), 'bl_wall', 45, 1, 0).why === 'out_of_bounds',
    'partial edge cell must not extend beyond WORLD=2200');
});

test('楼层、导线和实体分层共存，实体规划位互斥且蓝图不挡路', () => {
  const state = M.createState(false);
  assert(M.place(state, 'bl_floor', 4, 4, 0, true).ok);
  assert(M.place(state, 'bl_conduit', 4, 4, 0, true).ok);
  assert(M.place(state, 'bl_wall', 4, 4, 0, false).ok);
  assert(state.floors['4,4'] && state.conduits['4,4'], 'floor and conduit maps missing');
  assert(state.blueprints.length === 1, 'wall should remain a blueprint');
  assert(M.canPlace(state, 'bl_bed', 4, 4, 0).why === 'occupied', 'physical plan must reserve cells');

  const pawn = state.pawns[0];
  pawn.x = 3 * M.G + M.G / 2;
  pawn.y = 4 * M.G + M.G / 2;
  const move = M.command(state, pawn.id, 'move', { gx: 5, gy: 4 });
  assert(move.ok, 'structural blueprint must not block pawn path: ' + move.why);
});

test('门参与闭合但可通行；拆墙开口后房间与屋顶保护消失', () => {
  const state = M.createState(false);
  state.objects.length = 0;
  state.floors = {};
  for (let y = 11; y <= 15; y++) {
    for (let x = 11; x <= 15; x++) built(state, 'bl_floor', x, y);
  }
  for (let x = 10; x <= 16; x++) {
    built(state, 'bl_wall', x, 10);
    built(state, 'bl_wall', x, 16);
  }
  for (let y = 11; y <= 15; y++) {
    built(state, y === 13 ? 'bl_gate' : 'bl_wall', 10, y);
    built(state, 'bl_wall', 16, y);
  }
  M.rebuild(state);
  assert(state.rooms.length === 1 && state.rooms[0].cells.length === 25, 'expected closed 5x5 room');
  assert(Object.keys(state.roofs).length === 25, 'roof must follow indoor cells');
  state.rooms[0].temp = 23;
  M.rebuild(state);
  assert(state.rooms[0].temp === 23, 'unchanged topology must preserve temperature');

  const pawn = state.pawns[0];
  pawn.x = 9 * M.G + M.G / 2;
  pawn.y = 13 * M.G + M.G / 2;
  assert(M.command(state, pawn.id, 'move', { gx: 11, gy: 13 }).ok, 'gate must be walkable');
  assert(M.demolish(state, 12, 10, 'structure').ok, 'wall demolition failed');
  assert(state.rooms.length === 0 && Object.keys(state.roofs).length === 0, 'opening must remove shelter');
});

test('演示态是双房间、三人和完整家具电网；空态仍有三人', () => {
  const demo = M.createState(true);
  assert(demo.pawns.length === 3, 'demo must have three pawns');
  assert(demo.rooms.length === 2, 'demo must have two rooms, got ' + demo.rooms.length);
  assert(demo.rooms.some(r => r.role === 'bedroom'), 'bedroom role missing');
  assert(demo.rooms.some(r => r.role === 'workshop'), 'workshop role missing');
  ['bl_bed', 'bl_dining_table', 'bl_dining_chair', 'bl_clinic', 'bl_lab', 'bl_kitchen',
    'bl_workshop', 'bl_storage_shelf', 'bl_wood_generator'].forEach(bid => {
    assert(demo.objects.some(o => o.bid === bid), bid + ' missing from demo');
  });
  ['bl_lab', 'bl_kitchen', 'bl_workshop'].forEach(bid => {
    const object = demo.objects.find(o => o.bid === bid);
    assert(object.powered, bid + ' must be powered');
    assert(M.interactionsOf(demo, object).length > 0, bid + ' must be reachable from an interaction cell');
  });
  const empty = M.createState(false);
  assert(empty.pawns.length === 3 && empty.objects.length === 0 && empty.rooms.length === 0,
    'createState(false) must be empty land with three pawns');
});

test('床位按 uid 独占预约，换目标与拆目标都会立即清理预约', () => {
  const state = M.createState(false);
  const bed = built(state, 'bl_bed', 10, 10);
  const chair = built(state, 'bl_dining_chair', 14, 10);
  state.pawns[0].x = 9 * M.G + M.G / 2;
  state.pawns[0].y = 10 * M.G + M.G / 2;
  state.pawns[1].x = 9 * M.G + M.G / 2;
  state.pawns[1].y = 11 * M.G + M.G / 2;

  assert(M.command(state, 'pawn_1', 'sleep', bed.uid).ok, 'first pawn should reserve bed');
  assert(M.command(state, 'pawn_2', 'sleep', bed.uid).why === 'reserved', 'second pawn must not steal bed');
  assert(M.command(state, 'pawn_1', 'sit', chair.uid).ok, 'new order should replace old one');
  assert(!state.reservations[bed.uid] && state.reservations[chair.uid] === 'pawn_1', 'reservation switch failed');
  assert(M.command(state, 'pawn_2', 'sleep', bed.uid).ok, 'released bed should be claimable');
  assert(M.demolish(state, 10, 10, 'furniture').ok, 'bed demolition failed');
  assert(state.pawns[1].order === null && !state.reservations[bed.uid], 'removed target must cancel order and reservation');
});

test('家具阻挡时角色走到床边才入睡，绝不站进床格或瞬移', () => {
  const state = M.createState(false);
  const bed = built(state, 'bl_bed', 8, 8);
  built(state, 'bl_wall', 7, 8);
  const pawn = state.pawns[0];
  pawn.x = 5 * M.G + M.G / 2;
  pawn.y = 8 * M.G + M.G / 2;
  const startX = pawn.x;
  assert(M.command(state, pawn.id, 'sleep', bed.uid).ok, 'sleep route should exist around wall');
  assert(pawn.status === 'moving' && pawn.x === startX, 'command must not teleport pawn');
  M.tick(state, 10);
  const at = { gx: Math.floor(pawn.x / M.G), gy: Math.floor(pawn.y / M.G) };
  assert(pawn.status === 'sleeping', 'pawn should sleep only after arrival');
  assert(!M.cellsOf(bed).some(c => c.gx === at.gx && c.gy === at.gy), 'sleeping pawn must remain beside bed');
  assert(M.interactionsOf(state, bed).some(c => c.gx === at.gx && c.gy === at.gy), 'sleep pose must use interaction cell');
});

test('露天工作台可以工作，但未供电时原因必须明确', () => {
  const state = M.createState(false);
  const lab = built(state, 'bl_lab', 10, 10);
  assert(M.command(state, 'pawn_1', 'work', lab.uid).why === 'unpowered', 'unpowered workstation reason missing');
  built(state, 'bl_wood_generator', 14, 10);
  built(state, 'bl_conduit', 12, 10);
  built(state, 'bl_conduit', 13, 10);
  assert(lab.powered, 'connected outdoor lab should be powered');
  assert(state.rooms.length === 0, 'test workstation must remain outdoors');
  assert(M.command(state, 'pawn_1', 'work', lab.uid).ok, 'powered outdoor work must be accepted');
  M.tick(state, 20);
  assert(state.pawns[0].status === 'working', 'pawn should reach and work at outdoor lab');
});

test('命令发出后封死路线会中断，不穿墙也不保留预约', () => {
  const state = M.createState(false);
  const chair = built(state, 'bl_dining_chair', 6, 2);
  const pawn = state.pawns[0];
  pawn.x = 2 * M.G + M.G / 2;
  pawn.y = 2 * M.G + M.G / 2;
  assert(M.command(state, pawn.id, 'sit', chair.uid).ok, 'initial route should exist');
  built(state, 'bl_wall', 1, 2);
  built(state, 'bl_wall', 2, 1);
  built(state, 'bl_wall', 3, 2);
  built(state, 'bl_wall', 2, 3);
  M.tick(state, 1);
  assert(pawn.order === null && pawn.status === 'idle', 'sealed pawn order must be interrupted');
  assert(!state.reservations[chair.uid], 'blocked order must release chair');
  assert(Math.floor(pawn.x / M.G) === 2 && Math.floor(pawn.y / M.G) === 2, 'pawn must not cross enclosure');
  assert(state.message === 'path_blocked', 'blocked interruption should be explicit');
});

test('蓝图自动施工约 2 秒；施工格有人时等待，离开后才完工', () => {
  const state = M.createState(false);
  state.pawns[0].x = 4 * M.G + M.G / 2;
  state.pawns[0].y = 5 * M.G + M.G / 2;
  state.pawns[1].x = 5 * M.G + M.G / 2;
  state.pawns[1].y = 5 * M.G + M.G / 2;
  state.pawns[2].x = 20 * M.G + M.G / 2;
  state.pawns[2].y = 20 * M.G + M.G / 2;
  const result = M.place(state, 'bl_dining_chair', 5, 5, 0, false);
  assert(result.ok, 'blueprint placement failed');
  M.tick(state, 2.1);
  assert(state.blueprints.length === 1 && !state.objects.some(o => o.uid === result.object.uid),
    'occupied construction cell must not complete');
  assert(state.message === 'construction_cell_occupied', 'occupied build message missing');

  assert(M.command(state, 'pawn_2', 'move', { gx: 6, gy: 6 }).ok, 'occupant should move away');
  M.tick(state, 1);
  M.tick(state, 2.1);
  assert(state.blueprints.length === 0 && state.objects.some(o => o.uid === result.object.uid),
    'blueprint should complete after cell clears');
});

test('演示中的三床、病床、椅子和三工作台都有真实可达命令', () => {
  const seed = M.createState(true);
  const targets = seed.objects.filter(o => ['bed', 'chair', 'workstation'].includes(M.DEFS[o.bid].kind));
  assert(targets.filter(o => o.bid === 'bl_bed').length === 3, 'demo must expose all three beds');
  assert(targets.length === 9, 'expected 3 beds + clinic + 2 chairs + 3 workstations');
  targets.forEach(target => {
    const state = M.createState(true);
    const obj = state.objects.find(o => o.uid === target.uid);
    const action = M.DEFS[obj.bid].kind === 'bed' ? 'sleep' : M.DEFS[obj.bid].kind === 'chair' ? 'sit' : 'work';
    const result = M.command(state, 'pawn_1', action, obj.uid);
    assert(result.ok, obj.bid + '@' + obj.gx + ',' + obj.gy + ' is not reachable: ' + result.why);
    M.tick(state, 30);
    assert(['sleeping', 'sitting', 'working'].includes(state.pawns[0].status), obj.bid + ' command did not finish walking');
  });
});

test('房间由墙门边界决定：无地板可成房，墙下铺地板也不会串房', () => {
  const state = M.createState(false);
  state.objects.length = 0;
  for (let x = 10; x <= 18; x++) {
    built(state, 'bl_wall', x, 10);
    built(state, 'bl_wall', x, 16);
  }
  for (let y = 11; y <= 15; y++) {
    built(state, 'bl_wall', 10, y);
    built(state, 'bl_wall', 18, y);
    built(state, 'bl_wall', 14, y);
  }
  assert(state.rooms.length === 2, 'divider should create two rooms without any floor');
  state.rooms.sort((a, b) => a.cells[0].gx - b.cells[0].gx);
  state.rooms[0].temp = 20;
  state.rooms[1].temp = 30;
  for (let y = 11; y <= 15; y++) {
    for (let x = 11; x <= 17; x++) built(state, 'bl_floor', x, y);
  }
  assert(state.rooms.length === 2, 'floor beneath divider must not merge rooms');
  assert(state.rooms[0].temp === 20 && state.rooms[1].temp === 30, 'floor changes must preserve room temperature');

  assert(M.demolish(state, 14, 13, 'structure').ok, 'divider opening failed');
  assert(state.rooms.length === 1, 'opening divider should merge rooms');
  assert(Math.abs(state.rooms[0].temp - 25) < 1e-9, 'merged temperature must be overlap-weighted, got ' + state.rooms[0].temp);
  Object.keys(state.floors).forEach(k => delete state.floors[k]);
  M.rebuild(state);
  assert(state.rooms.length === 1, 'removing floors must not remove enclosed room');
});

test('寒雨环境下屋顶提供庇护与温度效率，露天角色仍保留可行动状态', () => {
  const state = M.createState(true);
  state.rooms.forEach(r => { r.temp = 22; });
  state.ambient = -12;
  state.weather = 'rain';
  state.pawns[0].x = 12 * M.G + M.G / 2;
  state.pawns[0].y = 16 * M.G + M.G / 2;
  state.pawns[1].x = 7 * M.G + M.G / 2;
  state.pawns[1].y = 7 * M.G + M.G / 2;
  M.rebuild(state);
  assert(state.rooms.every(r => r.temp === 22), 'rebuild must not snap existing room temperature');
  M.tick(state, 10);
  assert(state.pawns[0].sheltered && state.pawns[0].roofed, 'indoor pawn must be sheltered');
  assert(!state.pawns[1].sheltered && !state.pawns[1].roofed, 'outdoor pawn must be exposed');
  assert(state.pawns[0].temperature > state.pawns[1].temperature, 'roof should buffer cold');
  assert(state.pawns[0].workEfficiency > state.pawns[1].workEfficiency, 'cold rain should penalize outdoor efficiency');
  assert(state.rooms[0].temp < 22 && state.rooms[0].temp > state.ambient, 'room temperature should drift gradually');
});

test('UI 的 structure 层可拆墙也可拆家具', () => {
  const state = M.createState(false);
  built(state, 'bl_wall', 4, 4);
  built(state, 'bl_dining_table', 6, 4);
  assert(M.demolish(state, 6, 4, 'structure').ok, 'structure tool must remove furniture');
  assert(!state.objects.some(o => o.bid === 'bl_dining_table'), 'table still present');
  assert(M.demolish(state, 4, 4, 'structure').ok, 'structure tool must remove wall');
});

test('旋转决定唯一互动侧，不同家具不能预约同一个站位；坐姿另给渲染锚点', () => {
  const state = M.createState(false);
  const left = built(state, 'bl_dining_chair', 5, 5, 3);
  const right = built(state, 'bl_dining_chair', 7, 5, 1);
  equal(M.interactionsOf(state, left), [{ gx: 6, gy: 5 }], 'rotation 3 should face east');
  equal(M.interactionsOf(state, right), [{ gx: 6, gy: 5 }], 'rotation 1 should face west');
  state.pawns[0].x = 6 * M.G + M.G / 2;
  state.pawns[0].y = 5 * M.G + M.G / 2;
  state.pawns[1].x = 6 * M.G + M.G / 2;
  state.pawns[1].y = 6 * M.G + M.G / 2;
  assert(M.command(state, 'pawn_1', 'sit', left.uid).ok, 'first chair should claim shared spot');
  assert(M.command(state, 'pawn_2', 'sit', right.uid).why === 'blocked', 'second object must not steal reserved spot');
  M.tick(state, 0);
  const pawn = state.pawns[0];
  assert(pawn.status === 'sitting', 'pawn should sit at interaction spot');
  assert(pawn.poseX === left.gx * M.G + M.G / 2 && pawn.poseY === left.gy * M.G + M.G / 2,
    'render pose must anchor on chair');
  assert(Math.floor(pawn.x / M.G) === 6, 'logical pawn must stay on interaction cell');
});

test('已就位目标的互动格被新结构占用时立即中断并清预约', () => {
  const state = M.createState(false);
  const bed = built(state, 'bl_bed', 8, 8);
  const pawn = state.pawns[0];
  pawn.x = 8 * M.G + M.G / 2;
  pawn.y = 10 * M.G + M.G / 2;
  assert(M.command(state, pawn.id, 'sleep', bed.uid).ok, 'bed should be usable from its front');
  M.tick(state, 0);
  assert(pawn.status === 'sleeping', 'pawn should be sleeping');
  assert(M.place(state, 'bl_wall', 8, 10, 0, true).ok, 'test wall placement failed');
  assert(pawn.order === null && !state.reservations[bed.uid], 'blocked destination must interrupt active order');
});

test('移动维护 face/walkPh，蓝图暴露 0..1 施工进度', () => {
  const state = M.createState(false);
  const pawn = state.pawns[0];
  pawn.x = 2 * M.G + M.G / 2;
  pawn.y = 2 * M.G + M.G / 2;
  assert(M.command(state, pawn.id, 'move', { gx: 5, gy: 2 }).ok);
  M.tick(state, 0.25);
  assert(pawn.face === 0 && pawn.walkPh > 0, 'east movement must update face and walk phase');

  M.command(state, pawn.id, 'cancel');
  pawn.x = 9 * M.G + M.G / 2;
  pawn.y = 10 * M.G + M.G / 2;
  state.pawns[1].x = 20 * M.G + M.G / 2;
  state.pawns[1].y = 20 * M.G + M.G / 2;
  state.pawns[2].x = 21 * M.G + M.G / 2;
  state.pawns[2].y = 21 * M.G + M.G / 2;
  const placed = M.place(state, 'bl_dining_chair', 10, 10, 0, false);
  M.tick(state, 1);
  assert(placed.object.progress > 0.45 && placed.object.progress < 0.55, 'one second should show about half progress');
  M.tick(state, 1.1);
  assert(!state.blueprints.includes(placed.object), 'build should complete after about two working seconds');
});

process.on('exit', () => {
  if (!process.exitCode) console.log('\n' + passed + ' building prototype tests passed.');
});

test('建造、路径和互动共用完整格边界，居民不能绕进地图边缘半格', () => {
  const state = M.createState(false);
  for (let x = 0; x < 45; x++) built(state, 'bl_wall', x, 20);
  state.pawns[0].x = 10.5 * M.G;
  state.pawns[0].y = 19.5 * M.G;
  assert(!M.command(state, state.pawns[0].id, 'move', { gx: 10, gy: 21 }).ok,
    'full-width wall must prevent crossing at the partial boundary cell');
  assert(!M.command(state, state.pawns[0].id, 'move', { gx: 45, gy: 19 }).ok,
    'partial boundary cell must not be a path destination');
  const chair = built(state, 'bl_dining_chair', 44, 18, 3);
  equal(M.interactionsOf(state, chair), [], 'outside interaction cell must not be usable');
});
