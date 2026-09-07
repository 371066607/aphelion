(function(root){
  'use strict';

  var APH = root.APH = root.APH || {};
  var G = 48;
  var WORLD = 2200;
  var NC = Math.floor(WORLD / G);
  var BUILD_SECONDS = 2;
  var WALK_SPEED = 192;
  var DIRS = [[0,-1],[1,0],[0,1],[-1,0]];

  var DEFS = {
    bl_wall:            def('墙',       1, 1, 'structure', true,  'wall',        '#657080'),
    bl_gate:            def('门',       1, 1, 'structure', false, 'gate',        '#a77a45'),
    bl_dining_table:    def('餐桌',     2, 2, 'furniture', true,  'table',       '#8d6548'),
    bl_dining_chair:    def('餐椅',     1, 1, 'furniture', true,  'chair',       '#b48357'),
    bl_lab:             def('科研台',   2, 1, 'furniture', true,  'workstation', '#73a9b7'),
    bl_kitchen:         def('厨房台',   2, 1, 'furniture', true,  'workstation', '#c69354'),
    bl_workshop:        def('工作台',   2, 1, 'furniture', true,  'workstation', '#887461'),
    bl_clinic:          def('病床',     1, 2, 'furniture', true,  'bed',         '#d8dedc'),
    bl_storage_shelf:   def('货架',     2, 1, 'furniture', true,  'storage',     '#7a674f'),
    bl_wood_generator:  def('木质发电机',2, 2, 'furniture', true,  'generator',   '#bd7843'),
    bl_conduit:         def('导线',     1, 1, 'conduit',   false, 'conduit',     '#e6bd55'),
    bl_bed:             def('床',       1, 2, 'furniture', true,  'bed',         '#6b91ad'),
    bl_floor:           def('地板',     1, 1, 'floor',     false, 'floor',       '#7d7366')
  };

  function def(label, w, h, layer, solid, kind, color){
    return { id: null, label: label, w: w, h: h, layer: layer, solid: solid, kind: kind, color: color };
  }
  Object.keys(DEFS).forEach(function(id){ DEFS[id].id = id; });

  function key(gx, gy){ return gx + ',' + gy; }
  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  function validCell(gx, gy){
    return Number.isInteger(gx) && Number.isInteger(gy) && gx >= 0 && gy >= 0 && gx < NC && gy < NC;
  }
  function fullCellInWorld(gx, gy){
    return validCell(gx, gy) && (gx + 1) * G <= WORLD && (gy + 1) * G <= WORLD;
  }
  function physicalLayer(layer){ return layer === 'structure' || layer === 'furniture'; }

  function footprint(bid, rotation){
    var d = DEFS[bid];
    if (!d) return { w: 0, h: 0 };
    var r = normalizeRotation(rotation);
    return r % 2 ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
  }

  function normalizeRotation(rotation){
    var r = Number(rotation) || 0;
    r = Math.round(r) % 4;
    return r < 0 ? r + 4 : r;
  }

  function cellsOf(obj){
    if (!obj || !DEFS[obj.bid]) return [];
    var size = footprint(obj.bid, obj.rotation);
    var cells = [];
    for (var y = 0; y < size.h; y++) {
      for (var x = 0; x < size.w; x++) cells.push({ gx: obj.gx + x, gy: obj.gy + y });
    }
    return cells;
  }

  function rectOf(obj){
    var size = footprint(obj && obj.bid, obj && obj.rotation);
    return { x: (obj ? obj.gx : 0) * G, y: (obj ? obj.gy : 0) * G, w: size.w * G, h: size.h * G };
  }

  function makePawn(id, name, gx, gy){
    return {
      id: id,
      name: name,
      x: gx * G + G / 2,
      y: gy * G + G / 2,
      status: 'idle',
      order: null,
      path: [],
      face: Math.PI / 2,
      walkPh: 0,
      walking: false,
      poseX: null,
      poseY: null,
      sheltered: false,
      roofed: false,
      temperature: 14,
      workEfficiency: 1
    };
  }

  function blankState(){
    return {
      objects: [],
      blueprints: [],
      floors: {},
      conduits: {},
      roofs: {},
      pawns: [makePawn('pawn_1', '林', 7, 14), makePawn('pawn_2', '陈', 7, 15), makePawn('pawn_3', '吴', 7, 16)],
      rooms: [],
      reservations: {},
      spotReservations: {},
      ambient: 14,
      weather: 'clear',
      clock: 0,
      revision: 0,
      nextId: 1,
      message: ''
    };
  }

  function createState(demo){
    var state = blankState();
    if (demo !== false) seedDemo(state);
    rebuild(state);
    state.revision = 0;
    return state;
  }

  function makeRecord(state, bid, gx, gy, rotation){
    return { uid: 'bp_' + state.nextId++, bid: bid, gx: gx, gy: gy, rotation: normalizeRotation(rotation) };
  }

  function canPlace(state, bid, gx, gy, rotation){
    var d = DEFS[bid];
    if (!state || !d) return { ok: false, why: 'unknown_blueprint' };
    var candidate = { bid: bid, gx: gx, gy: gy, rotation: normalizeRotation(rotation) };
    var cells = cellsOf(candidate);
    if (!cells.length || cells.some(function(c){ return !fullCellInWorld(c.gx, c.gy); })) {
      return { ok: false, why: 'out_of_bounds' };
    }
    var occupied = occupancyForPlacement(state, d.layer);
    if (cells.some(function(c){ return occupied[key(c.gx, c.gy)]; })) return { ok: false, why: 'occupied' };
    return { ok: true, why: '' };
  }

  function occupancyForPlacement(state, layer){
    var occupied = {};
    if (layer === 'floor') Object.keys(state.floors || {}).forEach(function(k){ occupied[k] = true; });
    if (layer === 'conduit') Object.keys(state.conduits || {}).forEach(function(k){ occupied[k] = true; });
    (state.objects || []).concat(state.blueprints || []).forEach(function(obj){
      var d = DEFS[obj.bid];
      if (!d) return;
      var same = physicalLayer(layer) ? physicalLayer(d.layer) : d.layer === layer;
      if (!same) return;
      cellsOf(obj).forEach(function(c){ occupied[key(c.gx, c.gy)] = true; });
    });
    return occupied;
  }

  function materialize(state, record){
    var d = DEFS[record.bid];
    if (d.layer === 'floor') {
      cellsOf(record).forEach(function(c){ state.floors[key(c.gx, c.gy)] = true; });
    } else if (d.layer === 'conduit') {
      cellsOf(record).forEach(function(c){ state.conduits[key(c.gx, c.gy)] = true; });
    } else {
      state.objects.push(record);
    }
    return record;
  }

  function place(state, bid, gx, gy, rotation, instant){
    var check = canPlace(state, bid, gx, gy, rotation);
    if (!check.ok) return check;
    var record = makeRecord(state, bid, gx, gy, rotation);
    if (instant) materialize(state, record);
    else state.blueprints.push(record);
    state.revision++;
    state.message = instant ? DEFS[bid].label + '已放置' : DEFS[bid].label + '等待施工';
    rebuild(state);
    return { ok: true, why: '', object: record };
  }

  function objectAt(state, gx, gy){
    var lists = [state.objects || [], state.blueprints || []];
    for (var li = 0; li < lists.length; li++) {
      for (var i = lists[li].length - 1; i >= 0; i--) {
        if (cellsOf(lists[li][i]).some(function(c){ return c.gx === gx && c.gy === gy; })) return lists[li][i];
      }
    }
    return null;
  }

  function demolish(state, gx, gy, layer){
    var removed = null;
    function matches(obj){
      var d = DEFS[obj.bid];
      return d && (!layer || d.layer === layer) && cellsOf(obj).some(function(c){ return c.gx === gx && c.gy === gy; });
    }
    for (var sourceName of ['objects', 'blueprints']) {
      var source = state[sourceName];
      var index = source.findIndex(function(obj){
        if (layer === 'structure') {
          var d = DEFS[obj.bid];
          return d && physicalLayer(d.layer) && cellsOf(obj).some(function(c){ return c.gx === gx && c.gy === gy; });
        }
        return matches(obj);
      });
      if (index >= 0) {
        removed = source.splice(index, 1)[0];
        break;
      }
    }
    if (!removed && (!layer || layer === 'floor') && state.floors[key(gx, gy)]) {
      delete state.floors[key(gx, gy)];
      removed = { bid: 'bl_floor', gx: gx, gy: gy, rotation: 0 };
    }
    if (!removed && (!layer || layer === 'conduit') && state.conduits[key(gx, gy)]) {
      delete state.conduits[key(gx, gy)];
      removed = { bid: 'bl_conduit', gx: gx, gy: gy, rotation: 0 };
    }
    if (!removed) return { ok: false, why: 'not_found' };
    if (removed.uid) clearTargetOrders(state, removed.uid, 'target_removed');
    state.revision++;
    state.message = DEFS[removed.bid].label + '已拆除';
    rebuild(state);
    return { ok: true, why: '', object: removed };
  }

  function roleForRoom(state, roomCells){
    var inside = {};
    roomCells.forEach(function(c){ inside[key(c.gx, c.gy)] = true; });
    var bids = {};
    state.objects.forEach(function(obj){
      if (cellsOf(obj).some(function(c){ return inside[key(c.gx, c.gy)]; })) bids[obj.bid] = true;
    });
    if (bids.bl_lab || bids.bl_kitchen || bids.bl_workshop) return 'workshop';
    if (bids.bl_clinic) return 'hospital';
    if (bids.bl_bed) return 'bedroom';
    if (bids.bl_dining_table) return 'dining';
    return 'empty';
  }

  function rebuildRooms(state){
    var boundary = {};
    state.objects.forEach(function(obj){
      var d = DEFS[obj.bid];
      if (!d || d.layer !== 'structure') return;
      cellsOf(obj).forEach(function(c){ boundary[key(c.gx, c.gy)] = true; });
    });
    var oldRooms = state.rooms || [], oldBySignature = {};
    oldRooms.forEach(function(room){ oldBySignature[roomSignature(room.cells)] = room; });
    var outside = {}, outsideQueue = [], outsideHead = 0;
    function seed(gx, gy){
      var k = key(gx, gy);
      if (!boundary[k] && !outside[k]) { outside[k] = true; outsideQueue.push({ gx: gx, gy: gy }); }
    }
    for (var edge = 0; edge < NC; edge++) {
      seed(edge, 0); seed(edge, NC - 1); seed(0, edge); seed(NC - 1, edge);
    }
    while (outsideHead < outsideQueue.length) {
      var out = outsideQueue[outsideHead++];
      DIRS.forEach(function(dir){
        var gx = out.gx + dir[0], gy = out.gy + dir[1], k = key(gx, gy);
        if (!validCell(gx, gy) || boundary[k] || outside[k]) return;
        outside[k] = true;
        outsideQueue.push({ gx: gx, gy: gy });
      });
    }
    var seen = {}, rooms = [];
    for (var gy = 0; gy < NC; gy++) {
      for (var gx = 0; gx < NC; gx++) {
        var startKey = key(gx, gy);
        if (boundary[startKey] || outside[startKey] || seen[startKey]) continue;
        var queue = [{ gx: gx, gy: gy }], head = 0, cells = [];
        seen[startKey] = true;
        while (head < queue.length) {
          var cur = queue[head++];
          cells.push(cur);
          DIRS.forEach(function(dir){
            var nx = cur.gx + dir[0], ny = cur.gy + dir[1], nk = key(nx, ny);
            if (!validCell(nx, ny) || boundary[nk] || outside[nk] || seen[nk]) return;
            seen[nk] = true;
            queue.push({ gx: nx, gy: ny });
          });
        }
        cells.sort(cellSort);
        var signature = roomSignature(cells), exact = oldBySignature[signature];
        var overlapTemp = inheritedTemperature(cells, oldRooms, state.ambient);
        rooms.push({
          id: exact ? exact.id : 'room_' + cells[0].gx + '_' + cells[0].gy,
          cells: cells,
          role: roleForRoom(state, cells),
          temp: exact && typeof exact.temp === 'number' ? exact.temp : overlapTemp,
          roofed: true
        });
      }
    }
    rooms.sort(function(a, b){ return a.id.localeCompare(b.id); });
    state.rooms = rooms;
    state.roofs = {};
    rooms.forEach(function(room){ room.cells.forEach(function(c){ state.roofs[key(c.gx, c.gy)] = true; }); });
  }

  function inheritedTemperature(cells, oldRooms, ambient){
    var wanted = {};
    cells.forEach(function(c){ wanted[key(c.gx, c.gy)] = true; });
    var weighted = 0, overlaps = 0;
    oldRooms.forEach(function(room){
      if (typeof room.temp !== 'number') return;
      var overlap = room.cells.reduce(function(n, c){ return n + (wanted[key(c.gx, c.gy)] ? 1 : 0); }, 0);
      weighted += room.temp * overlap;
      overlaps += overlap;
    });
    return overlaps ? weighted / overlaps : ambient;
  }

  function cellSort(a, b){ return a.gy - b.gy || a.gx - b.gx; }
  function roomSignature(cells){ return cells.slice().sort(cellSort).map(function(c){ return key(c.gx, c.gy); }).join('|'); }

  function touchesSet(cells, set){
    return cells.some(function(c){
      if (set[key(c.gx, c.gy)]) return true;
      return DIRS.some(function(dir){ return set[key(c.gx + dir[0], c.gy + dir[1])]; });
    });
  }

  function rebuildPower(state){
    var generators = state.objects.filter(function(obj){ return DEFS[obj.bid].kind === 'generator'; });
    var source = {};
    generators.forEach(function(obj){ cellsOf(obj).forEach(function(c){ source[key(c.gx, c.gy)] = true; }); });
    var powered = {}, queue = [];
    Object.keys(state.conduits || {}).forEach(function(k){
      if (!state.conduits[k]) return;
      var p = k.split(',').map(Number), c = { gx: p[0], gy: p[1] };
      if (touchesSet([c], source)) { powered[k] = true; queue.push(c); }
    });
    while (queue.length) {
      var cur = queue.shift();
      DIRS.forEach(function(dir){
        var nk = key(cur.gx + dir[0], cur.gy + dir[1]);
        if (state.conduits[nk] && !powered[nk]) {
          powered[nk] = true;
          queue.push({ gx: cur.gx + dir[0], gy: cur.gy + dir[1] });
        }
      });
    }
    var network = {};
    Object.keys(source).forEach(function(k){ network[k] = true; });
    Object.keys(powered).forEach(function(k){ network[k] = true; });
    generators.forEach(function(obj){ obj.powered = true; });
    state.objects.forEach(function(obj){
      var kind = DEFS[obj.bid].kind;
      if (kind === 'generator') return;
      obj.powered = kind === 'workstation' ? touchesSet(cellsOf(obj), network) : false;
    });
    state.poweredConduits = powered;
  }

  function roomAtCell(state, cell){
    for (var i = 0; i < state.rooms.length; i++) {
      var room = state.rooms[i];
      if (room.cells.some(function(c){ return c.gx === cell.gx && c.gy === cell.gy; })) return room;
    }
    return null;
  }

  function temperatureEfficiency(temp){
    var discomfort = Math.max(0, Math.abs(temp - 21) - 7);
    return Math.max(0.35, 1 - discomfort * 0.035);
  }

  function updateEnvironment(state, dt){
    var target = Math.max(8, Math.min(28, state.ambient));
    var blend = dt > 0 ? 1 - Math.exp(-dt / 60) : 0;
    state.rooms.forEach(function(room){ room.temp += (target - room.temp) * blend; });
    state.pawns.forEach(function(pawn){
      var room = roomAtCell(state, pawnCell(pawn));
      pawn.sheltered = !!(room && room.roofed);
      pawn.roofed = pawn.sheltered;
      pawn.temperature = pawn.sheltered ? room.temp : state.ambient;
      var efficiency = temperatureEfficiency(pawn.temperature);
      if (!pawn.sheltered && state.weather === 'rain') efficiency *= 0.8;
      pawn.workEfficiency = Math.max(0.2, Math.min(1, efficiency));
    });
  }

  function rebuild(state){
    rebuildRooms(state);
    rebuildPower(state);
    validateOrders(state);
    updateEnvironment(state, 0);
    return state;
  }

  function blockedSet(state){
    var blocked = {};
    state.objects.forEach(function(obj){
      var d = DEFS[obj.bid];
      if (!d || !d.solid) return;
      cellsOf(obj).forEach(function(c){ blocked[key(c.gx, c.gy)] = true; });
    });
    return blocked;
  }

  function perimeterCells(obj){
    var own = {}, candidates = {};
    cellsOf(obj).forEach(function(c){ own[key(c.gx, c.gy)] = true; });
    cellsOf(obj).forEach(function(c){
      DIRS.forEach(function(dir){
        var gx = c.gx + dir[0], gy = c.gy + dir[1], k = key(gx, gy);
        if (validCell(gx, gy) && !own[k]) candidates[k] = { gx: gx, gy: gy };
      });
    });
    return Object.keys(candidates).map(function(k){ return candidates[k]; }).sort(cellSort);
  }

  function frontCells(obj){
    var size = footprint(obj.bid, obj.rotation), rotation = normalizeRotation(obj.rotation), cells = [];
    if (rotation === 0) {
      for (var x = 0; x < size.w; x++) cells.push({ gx: obj.gx + x, gy: obj.gy + size.h });
    } else if (rotation === 1) {
      for (var y = 0; y < size.h; y++) cells.push({ gx: obj.gx - 1, gy: obj.gy + y });
    } else if (rotation === 2) {
      for (var x2 = 0; x2 < size.w; x2++) cells.push({ gx: obj.gx + x2, gy: obj.gy - 1 });
    } else {
      for (var y2 = 0; y2 < size.h; y2++) cells.push({ gx: obj.gx + size.w, gy: obj.gy + y2 });
    }
    return cells;
  }

  function interactionCandidates(state, obj, pawnId, allSides, ignoreSpots){
    if (!state || !obj || !DEFS[obj.bid]) return [];
    var d = DEFS[obj.bid], directional = d.kind === 'bed' || d.kind === 'chair' || d.kind === 'workstation';
    var candidates = allSides || !directional ? perimeterCells(obj) : frontCells(obj);
    var blocked = blockedSet(state), spots = state.spotReservations || {};
    return candidates.filter(function(c){
      var k = key(c.gx, c.gy);
      return validCell(c.gx, c.gy) && !blocked[k] && (ignoreSpots || !spots[k] || spots[k] === pawnId);
    }).sort(cellSort);
  }

  function interactionsOf(state, obj){
    return interactionCandidates(state, obj, null, false, true);
  }

  function pawnCell(pawn){
    return { gx: Math.max(0, Math.min(NC - 1, Math.floor(pawn.x / G))), gy: Math.max(0, Math.min(NC - 1, Math.floor(pawn.y / G))) };
  }

  function findPath(state, start, goal){
    if (!validCell(goal.gx, goal.gy)) return null;
    var blocked = blockedSet(state), goalKey = key(goal.gx, goal.gy), startKey = key(start.gx, start.gy);
    if (blocked[goalKey] && goalKey !== startKey) return null;
    var queue = [start], head = 0, previous = {};
    previous[startKey] = null;
    while (head < queue.length) {
      var cur = queue[head++], ck = key(cur.gx, cur.gy);
      if (ck === goalKey) break;
      DIRS.forEach(function(dir){
        var nx = cur.gx + dir[0], ny = cur.gy + dir[1], nk = key(nx, ny);
        if (!validCell(nx, ny) || blocked[nk] || Object.prototype.hasOwnProperty.call(previous, nk)) return;
        previous[nk] = ck;
        queue.push({ gx: nx, gy: ny });
      });
    }
    if (!Object.prototype.hasOwnProperty.call(previous, goalKey)) return null;
    var path = [], walk = goalKey;
    while (walk !== startKey) {
      var p = walk.split(',').map(Number);
      path.unshift({ gx: p[0], gy: p[1] });
      walk = previous[walk];
    }
    return path;
  }

  function bestInteractionPath(state, pawn, obj, allSides){
    var start = pawnCell(pawn), best = null;
    interactionCandidates(state, obj, pawn.id, !!allSides).forEach(function(cell){
      var path = findPath(state, start, cell);
      if (path && (!best || path.length < best.path.length)) best = { cell: cell, path: path };
    });
    return best;
  }

  function findByUid(state, uid){
    return state.objects.concat(state.blueprints).find(function(obj){ return obj.uid === uid; }) || null;
  }

  function releaseOrder(state, pawn, reason){
    if (pawn.order && pawn.order.action === 'build') {
      var blueprint = findByUid(state, pawn.order.target);
      if (blueprint) blueprint.progress = 0;
    }
    if (pawn.order && typeof pawn.order.target === 'string' && state.reservations[pawn.order.target] === pawn.id) {
      delete state.reservations[pawn.order.target];
    }
    if (pawn.order && pawn.order.spotKey && state.spotReservations[pawn.order.spotKey] === pawn.id) {
      delete state.spotReservations[pawn.order.spotKey];
    }
    pawn.order = null;
    pawn.path = [];
    pawn.status = 'idle';
    pawn.walking = false;
    pawn.poseX = null;
    pawn.poseY = null;
    if (reason) state.message = reason;
  }

  function command(state, pawnId, action, target){
    var pawn = state.pawns.find(function(p){ return p.id === pawnId; });
    if (!pawn) return { ok: false, why: 'pawn_not_found' };
    if (action === 'cancel') {
      releaseOrder(state, pawn, 'order_cancelled');
      return { ok: true, why: '' };
    }
    releaseOrder(state, pawn);
    if (action === 'move') {
      if (!target || !Number.isInteger(target.gx) || !Number.isInteger(target.gy)) return { ok: false, why: 'invalid_target' };
      var movePath = findPath(state, pawnCell(pawn), target);
      if (!movePath) return { ok: false, why: 'blocked' };
      if (!movePath.length) return { ok: true, why: '' };
      pawn.order = { action: action, target: { gx: target.gx, gy: target.gy }, destination: { gx: target.gx, gy: target.gy }, progress: 0 };
      pawn.path = movePath;
      pawn.status = 'moving';
      pawn.walking = true;
      return { ok: true, why: '' };
    }
    var obj = typeof target === 'string' ? findByUid(state, target) : null;
    if (!obj || state.blueprints.indexOf(obj) >= 0) return { ok: false, why: 'target_not_found' };
    var kind = DEFS[obj.bid].kind;
    if ((action === 'sleep' && kind !== 'bed') ||
        (action === 'sit' && kind !== 'chair') ||
        (action === 'work' && kind !== 'workstation')) return { ok: false, why: 'wrong_target' };
    if (action === 'work' && !obj.powered) return { ok: false, why: 'unpowered' };
    if (state.reservations[obj.uid] && state.reservations[obj.uid] !== pawn.id) return { ok: false, why: 'reserved' };
    var route = bestInteractionPath(state, pawn, obj);
    if (!route) return { ok: false, why: 'blocked' };
    var spotKey = key(route.cell.gx, route.cell.gy);
    state.reservations[obj.uid] = pawn.id;
    state.spotReservations[spotKey] = pawn.id;
    pawn.order = { action: action, target: obj.uid, destination: route.cell, spotKey: spotKey, progress: 0 };
    pawn.path = route.path;
    if (route.path.length) { pawn.status = 'moving'; pawn.walking = true; }
    else setActivePose(state, pawn);
    return { ok: true, why: '' };
  }

  function activeStatus(action){
    return action === 'sleep' ? 'sleeping' : action === 'sit' ? 'sitting' : action === 'work' ? 'working' : action === 'build' ? 'building' : 'idle';
  }

  function setActivePose(state, pawn){
    if (!pawn.order) return;
    pawn.status = activeStatus(pawn.order.action);
    pawn.walking = false;
    pawn.poseX = null;
    pawn.poseY = null;
    if (typeof pawn.order.target !== 'string') return;
    var obj = findByUid(state, pawn.order.target);
    if (!obj) return;
    var rect = rectOf(obj), centerX = rect.x + rect.w / 2, centerY = rect.y + rect.h / 2;
    if (pawn.order.action === 'sleep' || pawn.order.action === 'sit') {
      pawn.poseX = centerX;
      pawn.poseY = centerY;
    }
    pawn.face = pawn.order.action === 'sleep'
      ? Math.PI / 2 + normalizeRotation(obj.rotation) * Math.PI / 2
      : Math.atan2(centerY - pawn.y, centerX - pawn.x);
  }

  function clearTargetOrders(state, uid, reason){
    state.pawns.forEach(function(pawn){ if (pawn.order && pawn.order.target === uid) releaseOrder(state, pawn, reason); });
    delete state.reservations[uid];
  }

  function validateOrders(state){
    state.pawns.forEach(function(pawn){
      if (!pawn.order || typeof pawn.order.target !== 'string') return;
      var target = findByUid(state, pawn.order.target);
      if (!target) { releaseOrder(state, pawn, 'target_removed'); return; }
      if (pawn.order.action === 'work' && !target.powered) { releaseOrder(state, pawn, 'unpowered'); return; }
      var allSides = pawn.order.action === 'build';
      var validDestination = interactionCandidates(state, target, pawn.id, allSides).some(function(c){
        return pawn.order.destination && c.gx === pawn.order.destination.gx && c.gy === pawn.order.destination.gy;
      });
      if (!validDestination) {
        if (!repath(state, pawn)) releaseOrder(state, pawn, 'path_blocked');
        else if (pawn.path.length) { pawn.status = 'moving'; pawn.walking = true; }
        else setActivePose(state, pawn);
      }
    });
  }

  function assignBuilders(state){
    state.pawns.forEach(function(pawn){
      if (pawn.order || pawn.status !== 'idle') return;
      var choice = null;
      for (var i = 0; i < state.blueprints.length; i++) {
        var bp = state.blueprints[i];
        if (state.reservations[bp.uid]) continue;
        var route = bestInteractionPath(state, pawn, bp, true);
        if (route && (!choice || route.path.length < choice.route.path.length)) choice = { bp: bp, route: route };
      }
      if (!choice) return;
      state.reservations[choice.bp.uid] = pawn.id;
      var spotKey = key(choice.route.cell.gx, choice.route.cell.gy);
      state.spotReservations[spotKey] = pawn.id;
      choice.bp.progress = 0;
      pawn.order = { action: 'build', target: choice.bp.uid, destination: choice.route.cell, spotKey: spotKey, progress: 0 };
      pawn.path = choice.route.path;
      pawn.status = pawn.path.length ? 'moving' : 'building';
    });
  }

  function repath(state, pawn){
    if (!pawn.order) return false;
    var route;
    if (pawn.order.action === 'move') {
      var path = findPath(state, pawnCell(pawn), pawn.order.target);
      if (!path) return false;
      route = { cell: pawn.order.target, path: path };
    } else {
      var obj = findByUid(state, pawn.order.target);
      if (!obj) return false;
      route = bestInteractionPath(state, pawn, obj, pawn.order.action === 'build');
      if (!route) return false;
    }
    var oldSpot = pawn.order.spotKey;
    var newSpot = key(route.cell.gx, route.cell.gy);
    if (oldSpot && oldSpot !== newSpot && state.spotReservations[oldSpot] === pawn.id) delete state.spotReservations[oldSpot];
    if (typeof pawn.order.target === 'string') state.spotReservations[newSpot] = pawn.id;
    pawn.order.destination = route.cell;
    pawn.order.spotKey = typeof pawn.order.target === 'string' ? newSpot : null;
    pawn.path = route.path;
    return true;
  }

  function walkPawn(state, pawn, dt){
    var distance = WALK_SPEED * dt;
    var travelled = 0;
    pawn.walking = true;
    while (pawn.path.length && distance >= 0) {
      var next = pawn.path[0], blocked = blockedSet(state);
      if (blocked[key(next.gx, next.gy)]) {
        if (!repath(state, pawn)) { releaseOrder(state, pawn, 'path_blocked'); return 0; }
        if (!pawn.path.length) break;
        next = pawn.path[0];
        blocked = blockedSet(state);
        if (blocked[key(next.gx, next.gy)]) { releaseOrder(state, pawn, 'path_blocked'); return 0; }
      }
      var tx = next.gx * G + G / 2, ty = next.gy * G + G / 2;
      var dx = tx - pawn.x, dy = ty - pawn.y, length = Math.sqrt(dx * dx + dy * dy);
      if (length > 1e-8) pawn.face = Math.atan2(dy, dx);
      if (length <= distance + 1e-8) {
        pawn.x = tx; pawn.y = ty; pawn.path.shift(); distance -= length; travelled += length;
      } else {
        pawn.x += dx / length * distance;
        pawn.y += dy / length * distance;
        travelled += distance;
        distance = -1;
      }
    }
    pawn.walkPh += travelled / G * 8;
    if (!pawn.path.length && pawn.order) {
      if (pawn.order.action === 'move') releaseOrder(state, pawn);
      else setActivePose(state, pawn);
    }
    return distance > 0 ? distance / WALK_SPEED : 0;
  }

  function blueprintCellsOccupied(state, bp){
    var wanted = {};
    cellsOf(bp).forEach(function(c){ wanted[key(c.gx, c.gy)] = true; });
    return state.pawns.some(function(pawn){ var c = pawnCell(pawn); return wanted[key(c.gx, c.gy)]; });
  }

  function completeBuild(state, pawn, bp){
    var index = state.blueprints.indexOf(bp);
    if (index < 0) { releaseOrder(state, pawn, 'target_removed'); return; }
    if (blueprintCellsOccupied(state, bp)) {
      pawn.order.progress = 0;
      state.message = 'construction_cell_occupied';
      return;
    }
    state.blueprints.splice(index, 1);
    materialize(state, bp);
    delete state.reservations[bp.uid];
    if (pawn.order.spotKey && state.spotReservations[pawn.order.spotKey] === pawn.id) delete state.spotReservations[pawn.order.spotKey];
    pawn.order = null;
    pawn.path = [];
    pawn.status = 'idle';
    pawn.walking = false;
    state.revision++;
    state.message = DEFS[bp.bid].label + '施工完成';
    rebuild(state);
  }

  function tick(state, dt){
    dt = Math.max(0, Number(dt) || 0);
    state.clock += dt;
    validateOrders(state);
    assignBuilders(state);
    state.pawns.slice().forEach(function(pawn){
      if (!pawn.order) return;
      var actionDt = dt;
      if (pawn.path.length) actionDt = walkPawn(state, pawn, dt);
      if (!pawn.order || pawn.path.length || pawn.status !== 'building') return;
      var bp = findByUid(state, pawn.order.target);
      if (!bp || state.blueprints.indexOf(bp) < 0) { releaseOrder(state, pawn, 'target_removed'); return; }
      var interactions = interactionCandidates(state, bp, pawn.id, true), at = pawnCell(pawn);
      if (!interactions.some(function(c){ return c.gx === at.gx && c.gy === at.gy; })) {
        if (!repath(state, pawn)) releaseOrder(state, pawn, 'path_blocked');
        else pawn.status = pawn.path.length ? 'moving' : 'building';
        return;
      }
      if (blueprintCellsOccupied(state, bp)) {
        pawn.order.progress = 0;
        bp.progress = 0;
        state.message = 'construction_cell_occupied';
        return;
      }
      pawn.order.progress += actionDt * pawn.workEfficiency;
      bp.progress = Math.max(0, Math.min(1, pawn.order.progress / BUILD_SECONDS));
      if (pawn.order.progress >= BUILD_SECONDS) completeBuild(state, pawn, bp);
    });
    updateEnvironment(state, dt);
    return state;
  }

  function snapshot(state){ return clone(state); }

  function seedDemo(state){
    function add(bid, gx, gy, rotation){ materialize(state, makeRecord(state, bid, gx, gy, rotation || 0)); }
    for (var y = 13; y <= 17; y++) {
      for (var x = 11; x <= 15; x++) add('bl_floor', x, y);
      for (var rx = 17; rx <= 22; rx++) add('bl_floor', rx, y);
    }
    for (var wx = 10; wx <= 23; wx++) { add('bl_wall', wx, 12); add('bl_wall', wx, 18); }
    for (var wy = 13; wy <= 17; wy++) {
      if (wy === 16) add('bl_gate', 10, wy, 1); else add('bl_wall', 10, wy);
      if (wy === 15) add('bl_gate', 16, wy, 1); else add('bl_wall', 16, wy);
      if (wy === 15) add('bl_gate', 23, wy, 1); else add('bl_wall', 23, wy);
    }
    add('bl_bed', 11, 13); add('bl_bed', 13, 13); add('bl_bed', 15, 13);
    add('bl_lab', 17, 13); add('bl_kitchen', 20, 13);
    add('bl_storage_shelf', 19, 13, 1); add('bl_clinic', 22, 13);
    add('bl_workshop', 17, 17, 2);
    add('bl_dining_table', 20, 16); add('bl_dining_chair', 19, 16, 2); add('bl_dining_chair', 22, 16, 2);
    add('bl_wood_generator', 24, 12);
    for (var cx = 17; cx <= 23; cx++) add('bl_conduit', cx, 12);
    add('bl_conduit', 24, 12);
    for (var cy = 13; cy <= 17; cy++) add('bl_conduit', 17, cy);
    state.pawns[0].x = 12 * G + G / 2; state.pawns[0].y = 16 * G + G / 2;
    state.pawns[1].x = 14 * G + G / 2; state.pawns[1].y = 16 * G + G / 2;
    state.pawns[2].x = 19 * G + G / 2; state.pawns[2].y = 15 * G + G / 2;
  }

  APH.BuildProtoModel = {
    G: G,
    DEFS: DEFS,
    createState: createState,
    footprint: footprint,
    cellsOf: cellsOf,
    rectOf: rectOf,
    canPlace: canPlace,
    place: place,
    demolish: demolish,
    objectAt: objectAt,
    interactionsOf: interactionsOf,
    command: command,
    tick: tick,
    rebuild: rebuild,
    snapshot: snapshot
  };
})(window);
