/* Shared spatial contract: test only the public APH.BuildGrid / APH.Nav seams. */
'use strict';
require('../src/build_grid.js');
const Grid = window.APH.BuildGrid;
const Nav = window.APH.Nav;

function sameCells(actual, expected, label) {
  const got = actual.map(c => c.gx + ',' + c.gy).sort().join('|');
  const want = expected.slice().sort().join('|');
  if (got !== want) throw new Error(label + ': ' + got + ' !== ' + want);
}

const defs = {
  table: { cells:[2,1], layer:'furniture', solid:true, interaction:'front' },
  floor: { cells:[1,1], layer:'floor', solid:false },
  wall: { cells:[1,1], layer:'structure', solid:true, roomEdge:true },
  gate: { cells:[1,1], layer:'structure', solid:false, roomEdge:true },
  rug: { cells:[2,1], layer:'floor', solid:false }
};

test('BuildGrid: 新记录四向旋转占格与矩形', () => {
  const r = { uid:'t', id:'table', gx:10, gy:20, rotation:1, geometryVersion:1 };
  const fp = Grid.footprint(r, defs);
  if (fp.w !== 1 || fp.h !== 2) throw new Error('90度桌子应为1×2: '+JSON.stringify(fp));
  sameCells(Grid.cellsOf(r, defs), ['10,20','10,21'], '旋转后的占格');
  const rect = Grid.rectOf(r, defs, { grid:48 });
  if (rect.x !== 480 || rect.y !== 960 || rect.w !== 48 || rect.h !== 96) throw new Error('矩形应贴格: '+JSON.stringify(rect));
});

test('BuildGrid: 新记录分层索引允许地板与家具同格', () => {
  const objects = [
    { uid:'f', id:'floor', gx:3, gy:4, geometryVersion:1 },
    { uid:'t', id:'table', gx:3, gy:4, geometryVersion:1 }
  ];
  const ix = Grid.index(objects, defs);
  if (!ix.layers.floor['3,4'] || !ix.layers.furniture['3,4']) throw new Error('两层都必须可索引');
  if (ix.physical['3,4'].length !== 1) throw new Error('物理层只能有桌子');
});

test('BuildGrid: 新记录字段覆盖目录，bid 实体也能查定义', () => {
  const r={uid:'e',bid:'table',gx:2,gy:2,cells:[1,2],layer:'structure',solid:false,interaction:'front',geometryVersion:1};
  const fp=Grid.footprint(r,defs);
  if(fp.w!==1||fp.h!==2) throw new Error('记录cells必须覆盖目录: '+JSON.stringify(fp));
  const ix=Grid.index([r],defs,{width:240,height:240,grid:48});
  if(!ix.layers.structure['2,2'] || ix.blocked['2,2']) throw new Error('record layer/solid覆盖未生效');
});

test('BuildGrid: 互动格随朝向转到家具前方且排除阻挡', () => {
  const r = { uid:'t', id:'table', gx:5, gy:5, rotation:1, geometryVersion:1 };
  sameCells(Grid.interactionCells(r, defs), ['4,5','4,6'], '左朝向前格');
  const blocked = Grid.interactionCells(r, defs, { blocked:{'4,5':true,'4,6':true} });
  if (blocked.length !== 0) throw new Error('被阻挡互动格不可用');
});

test('BuildGrid: legacy 记录保持像素锚点和旧占格', () => {
  const r = { id:'table', x:96, y:144, cells:[2,1], legacyFootprint:true, geometryVersion:0 };
  sameCells(Grid.cellsOf(r, defs, { grid:48 }), ['2,3'], '旧记录不能扩展/旋转');
  const rect = Grid.rectOf(r, defs, { grid:48 });
  if (rect.x !== 48 || rect.y !== 120 || rect.w !== 96 || rect.h !== 48) throw new Error('旧矩形要保留中心锚点: '+JSON.stringify(rect));
});

test('Nav: 新家具占格阻挡，legacy 家具继续可通行', () => {
  const scene = { width:240, height:240, grid:48, definitions:defs };
  const g = Nav.gridOf([
    { id:'table', gx:1, gy:1, rotation:1, geometryVersion:1 },
    { id:'table', x:144, y:144, cells:[2,1], geometryVersion:0 }
  ], scene);
  if (g[1][1] !== 1 || g[2][1] !== 1) throw new Error('新旋转桌子两格都要挡路');
  if (g[3][3] !== 0) throw new Error('legacy家具保持旧可通行契约');
});

function ring(gx, gy, w, h) {
  const b=[];
  for (let x=0;x<w;x++) { b.push({id:'wall',gx:gx+x,gy,geometryVersion:1}); b.push({id:'wall',gx:gx+x,gy:gy+h-1,geometryVersion:1}); }
  for (let y=1;y<h-1;y++) { b.push({id:'wall',gx,gy:gy+y,geometryVersion:1}); b.push({id:'wall',gx:gx+w-1,gy:gy+y,geometryVersion:1}); }
  return b;
}

test('Nav: descriptor 地图尺寸驱动 A*，不再固定46格', () => {
  const scene={width:144,height:144,grid:48,definitions:defs};
  const g=Nav.gridOf([],scene);
  if(g.length!==3 || g[0].length!==3) throw new Error('3×3场景尺寸错误');
  const p=Nav.astar(g,{x:24,y:24},{x:120,y:120},null,scene);
  if(!p || p[p.length-1].x!==120 || p[p.length-1].y!==120) throw new Error('小地图A*终点错误');
});

test('Nav: 房间缓存跨同一数组复用，split/merge按重叠继承温度', () => {
  const scene={width:336,height:336,grid:48,definitions:defs};
  const b=ring(1,1,5,5);
  const first=Nav.roomsOf(b,scene);
  if(first.length!==1) throw new Error('应有一个房间');
  first[0].temp=7;
  if(Nav.roomsOf(b,scene)[0] !== first[0]) throw new Error('未变结构必须复用同一房间对象');
  b.push({id:'wall',gx:3,gy:2,geometryVersion:1});
  b.push({id:'wall',gx:3,gy:3,geometryVersion:1});
  b.push({id:'wall',gx:3,gy:4,geometryVersion:1});
  const split=Nav.roomsOf(b,scene);
  if(split.length!==2 || split.some(r => r.temp !== 7)) throw new Error('分房应按重叠继承7度: '+JSON.stringify(split));
  b.splice(-3,3);
  const merged=Nav.roomsOf(b,scene);
  if(merged.length!==1 || merged[0].temp!==7) throw new Error('合房应按面积权重保温: '+JSON.stringify(merged));
});
