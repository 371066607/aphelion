'use strict';
const Nav = window.APH.Nav;
const Colony = window.APH.Colony;
const G = (window.APH.CFG && APH.CFG.GRID) || 48;

test('#176 roomRole: 有居住舱是卧室', () => {
  if (typeof Nav.roomRoleOf !== 'function') throw new Error('缺失 roomRoleOf');
  const walls = [];
  for (let x = 10; x <= 14; x++) {
    walls.push({ id: 'bl_wall', x: x * G, y: 10 * G });
    walls.push({ id: 'bl_wall', x: x * G, y: 14 * G });
  }
  for (let y = 10; y <= 14; y++) {
    walls.push({ id: 'bl_wall', x: 10 * G, y: y * G });
    walls.push({ id: 'bl_wall', x: 14 * G, y: y * G });
  }
  const rooms = Nav.roomsOf(walls);
  if (!rooms.length) throw new Error('应围出房间');
  const b = walls.concat([{ id: 'bl_house', x: 12 * G, y: 12 * G }]);
  const role = Nav.roomRoleOf(rooms[0], b);
  if (role !== 'bedroom') throw new Error('应是卧室, 实际: ' + role);
});

test('#175 grow: addGrowZone 与成熟收割', () => {
  if (typeof Colony.addGrowZone !== 'function') throw new Error('缺失 addGrowZone');
  const cells = [{ x: G, y: G }];
  const r = Colony.addGrowZone([], cells);
  if (r.zone.type !== 'grow') throw new Error('应是种植区');
  let harvested = [];
  for (let i = 0; i < 40 && !harvested.length; i++) {
    harvested = Colony.tickGrowZones(r.zones, 5, 1).harvested;
  }
  if (!harvested.length) throw new Error('有农民应能种熟并收');
  if (!harvested[0].drop || !harvested[0].drop.dropItemId) throw new Error('应收作物');
});
