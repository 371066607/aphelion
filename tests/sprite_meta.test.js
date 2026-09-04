/* 俯卧 sheet 元数据 vs 实测资产回归测试。
   根因(诊断记录见 JOURNAL.md): src/main.js 的 SPRITE_META 里 player_prone/
   hum_1/2/3_nopack_prone 的 h(contentH) 是手抄的旧值，与 assets/*_prone_sheet.png
   实际内容高不符(hum_2 一度偏差 61px)。h 偏大 → spriteScale=drawH/h 偏小 →
   角色躺下时被渲染得比预期小/瘪，正是用户报的"所有角色的躺姿都不对"。
   build_sprites.py 的 baseline_y()/content_bbox_h() 才是真源；本测试独立用
   Node 内置 zlib 解 PNG(无第三方依赖)复现同一测量，锁死 main.js 数值不再手抄漂移。 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function decodePNG(buf) {
  if (!buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('bad PNG signature');
  }
  let off = 8, width, height, bitDepth, colorType;
  const idatParts = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); off += 4;
    const type = buf.toString('ascii', off, off + 4); off += 4;
    const data = buf.subarray(off, off + len); off += len;
    off += 4; // crc
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error('仅支持 8-bit RGBA PNG, got depth=' + bitDepth + ' colorType=' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idatParts));
  const bpp = 4, stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let rawOff = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOff]; rawOff += 1;
    const rowStart = y * stride, prevRowStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rawOff + x];
      const a = x >= bpp ? out[rowStart + x - bpp] : 0;
      const b = y > 0 ? out[prevRowStart + x] : 0;
      const c = (y > 0 && x >= bpp) ? out[prevRowStart + x - bpp] : 0;
      let val;
      if (filterType === 0) val = rawByte;
      else if (filterType === 1) val = (rawByte + a) & 0xff;
      else if (filterType === 2) val = (rawByte + b) & 0xff;
      else if (filterType === 3) val = (rawByte + Math.floor((a + b) / 2)) & 0xff;
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        val = (rawByte + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 0xff;
      } else throw new Error('bad filter ' + filterType);
      out[rowStart + x] = val;
    }
    rawOff += stride;
  }
  return { width, height, pixels: out };
}

/* 与 assets/build_sprites.py 的 cell_of 一致: 横排方格表格宽=图高 */
function cellOf(w, h) { return (w > h && w % h === 0) ? h : 128; }

/* 与 build_sprites.py 的 baseline_y()/content_bbox_h() 同口径: 帧0 alpha>8 的
   内容 bbox(顶行/底行), baseline=底行+1, contentH=baseline-顶行。 */
function measureFrame0(pngPath) {
  const { width, pixels } = decodePNG(fs.readFileSync(pngPath));
  const cell = cellOf(width, pixels.length / width / 4);
  let top = -1, bottom = -1;
  for (let y = 0; y < cell; y++) {
    let any = false;
    for (let x = 0; x < cell; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 0) { any = true; break; }
    }
    if (any) { if (top === -1) top = y; bottom = y; }
  }
  return { baseline: bottom + 1, contentH: bottom + 1 - top };
}

/* 权威测量: 调 build_sprites.py 解析其输出的 SPRITE_META JSON (与真源完全同口径) */
function authMeta() {
  const py = fs.existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3';
  const out = execFileSync(py, [path.join(ROOT, 'assets', 'build_sprites.py')], { encoding: 'utf8' });
  const idx = out.indexOf('SPRITE_META = ');
  if (idx < 0) throw new Error('build_sprites.py 未输出 SPRITE_META');
  return JSON.parse(out.slice(idx + 'SPRITE_META = '.length).trim());
}
let _authMeta = null;
function authOf(key) {
  if (!_authMeta) _authMeta = authMeta();
  return _authMeta[key] || null;
}

/* 从 src/main.js 抠出 SPRITE_META 里某个键的 {baseline,h} 字面量 */
function metaFromMainJs(key) {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\{(?:idle:\\d+,)?baseline:(\\d+),h:(\\d+)\\}');
  const m = src.match(re);
  if (!m) throw new Error('main.js SPRITE_META 未找到键 ' + key);
  return { baseline: Number(m[1]), h: Number(m[2]) };
}

/* bl_ 建筑键: 全部 SPRITE_META 声明的 baseline/h 与实测一致 (扩自 #84 资产; 防手抄漂移) */
const BL_SHEETS = [
  'bl_barracks','bl_battery','bl_carpet','bl_clinic','bl_conduit','bl_dining_chair',
  'bl_dining_table','bl_farm','bl_gate','bl_house','bl_lab','bl_lamp','bl_landing_pad',
  'bl_mine','bl_pasture','bl_sandbag','bl_shelf','bl_solar_panel','bl_spike_trap',
  'bl_turret','bl_tv','bl_wall','bl_warehouse','bl_wood_generator','bl_workshop',
];

const PRONE_SHEETS = [
  'player_prone', 'hum_0_nopack_prone', 'hum_1_nopack_prone',
  'hum_2_nopack_prone', 'hum_3_nopack_prone',
];

BL_SHEETS.forEach(function(key) {
  test('sprite_meta bl: ' + key + ' 的 main.js baseline/h 与 build_sprites.py 权威输出一致', function() {
    const declared = metaFromMainJs(key);
    const measured = authOf(key);
    if (!measured) throw new Error('build_sprites.py 未覆盖键 ' + key);
    if (declared.baseline !== measured.baseline) {
      throw new Error(key + ' baseline declared=' + declared.baseline + ' authoritative=' + measured.baseline);
    }
    if (declared.h !== measured.h) {
      throw new Error(key + ' h(contentH) declared=' + declared.h + ' authoritative=' + measured.h +
        ' — 请把 build_sprites.py 输出的 SPRITE_META 抄回 main.js');
    }
  });
});

PRONE_SHEETS.forEach(function(key) {
  test('sprite_meta: ' + key + ' 的 main.js baseline/h 与实测 PNG 一致', function() {
    const declared = metaFromMainJs(key);
    const measured = measureFrame0(path.join(ROOT, 'assets', key + '_sheet.png'));
    if (declared.baseline !== measured.baseline) {
      throw new Error(key + ' baseline declared=' + declared.baseline + ' measured=' + measured.baseline);
    }
    if (declared.h !== measured.contentH) {
      throw new Error(key + ' h(contentH) declared=' + declared.h + ' measured=' + measured.contentH +
        ' — 请重跑 python3 assets/build_sprites.py 并把打印的 SPRITE_META 抄回 main.js');
    }
  });
});
