/* Optional offline raster QA. Install @napi-rs/canvas outside the repository,
   then NODE_PATH=<temporary prefix>/node_modules node tests/building_proto_canvas.cjs [capture.png]. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
global.window = global;
global.APH = {};
for (const file of ['config', 'humanoid', 'sprites', 'sprite_data', 'building_proto_model', 'building_proto_draw']) {
  require('../src/' + file + '.js');
}
const M = APH.BuildProtoModel, D = APH.BuildProtoDraw;
function raster(objects, blueprints) {
  const canvas = createCanvas(240, 240);
  D.drawWorld(canvas.getContext('2d'), { objects, blueprints, pawns: [] }, {});
  return canvas.getContext('2d').getImageData(0, 0, 240, 240).data;
}
const ground = raster([], []);
for (const bid of Object.keys(M.DEFS)) for (let rotation = 0; rotation < 4; rotation++) {
  const obj = { uid: 'probe', bid, gx: 1, gy: 1, rotation }, r = M.rectOf(obj);
  // Furniture/walls use the actual world renderer, not a second geometry implementation.
  const pixels = raster([obj], []);
  for (let y = 0; y < 240; y++) for (let x = 0; x < 240; x++) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
    const i = (y * 240 + x) * 4;
    assert.equal(pixels[i], ground[i], `${bid} r${rotation} draws outside footprint at ${x},${y}`);
    assert.equal(pixels[i + 1], ground[i + 1]);
    assert.equal(pixels[i + 2], ground[i + 2]);
  }
  // Palette and rotation previews share drawIcon, whose complete alpha bounds must fit.
  const icon = createCanvas(240, 240), ctx = icon.getContext('2d');
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);D.drawIcon(ctx, bid, rotation, M.G);
  const alpha = ctx.getImageData(0, 0, 240, 240).data;
  for (let y = 0; y < 240; y++) for (let x = 0; x < 240; x++) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
    assert.equal(alpha[(y * 240 + x) * 4 + 3], 0, `${bid} r${rotation} icon exceeds footprint`);
  }
}
for (const bid of ['bl_floor', 'bl_conduit']) {
  const pixels = raster([], [{ uid: 'bp', bid, gx: 1, gy: 1, rotation: 0 }]);
  assert(pixels.some((p, i) => p !== ground[i]), bid + ' blueprint must be visible');
}
// Fractional zoom must not expose ground between adjacent wall tiles.
const seam = createCanvas(600, 200), seamCtx = seam.getContext('2d');
seamCtx.scale(1.3, 1.3);
D.drawWorld(seamCtx, { objects: [1, 2, 3, 4].map(gx => ({ bid: 'bl_wall', gx, gy: 1 })), pawns: [] }, {});
const row = seamCtx.getImageData(80, 94, 210, 1).data;
for (let i = 0; i < row.length; i += 4) assert.deepEqual(Array.from(row.slice(i, i + 4)), [215, 208, 193, 255]);
console.log('canvas: 52 world/icon footprint checks, floor/conduit ghosts and fractional wall joins passed');

(async function capture() {
  if (!process.argv[2]) return;
  for (let face = 0; face < 4; face++) for (const cycle of ['walk', 'idle', 'prone']) {
    const name = `hum_${face}_nopack_${cycle}`, src = APH.SPRITE_DATA[name];
    if (!src) continue;
    const image = await loadImage(src), layout = APH.Humanoid.sheetLayout(name);
    APH.Sprites.define(name, { src, fw: image.height, fh: image.height, cols: layout.cols, count: layout.count,
      baseline: cycle === 'prone' ? [248,248,249,198][face] : 248,
      contentH: cycle === 'prone' ? [122,138,102,124][face] : cycle === 'idle' ? 236 : 240 });
    APH.Sprites._images[name] = image;
  }
  const canvas = createCanvas(1400, 780), ctx = canvas.getContext('2d');
  ctx.translate(-424, -560);ctx.scale(1.3, 1.3);
  D.drawWorld(ctx, M.createState(true), { time: 0 });
  fs.writeFileSync(process.argv[2], canvas.toBuffer('image/png'));
  console.log('offline actual drawWorld capture:', process.argv[2]);
})().catch(error => { console.error(error); process.exitCode = 1; });
