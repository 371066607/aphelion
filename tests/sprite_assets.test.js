const fs = require('fs');
const path = require('path');
const assert = require('assert');

const IDS = [
  'bl_wall', 'bl_gate', 'bl_conduit', 'bl_wood_generator',
  'bl_solar_panel', 'bl_battery', 'bl_lamp', 'bl_dining_table',
  'bl_dining_chair', 'bl_spike_trap', 'bl_sandbag',
];
const ROOT = path.join(__dirname, '..');
const spriteSource = fs.readFileSync(path.join(ROOT, 'src', 'sprite_data.js'), 'utf8');

function pngHeader(bytes) {
  assert(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'PNG 签名无效');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
  };
}

test('#84: 11 项建筑 v3 sheet 均为 2048×256 RGBA PNG', () => {
  assert.strictEqual(IDS.length, 11);
  IDS.forEach(id => {
    const bytes = fs.readFileSync(path.join(ROOT, 'assets', id + '_sheet.png'));
    assert.deepStrictEqual(pngHeader(bytes), { width:2048, height:256, bitDepth:8, colorType:6 }, id);
  });
});

test('#84: sprite_data 每个新键唯一且 base64 与 PNG 字节一致', () => {
  IDS.forEach(id => {
    const pattern = new RegExp("APH\\.SPRITE_DATA\\['" + id + "'\\] = 'data:image/png;base64,([^']+)';", 'g');
    const matches = [...spriteSource.matchAll(pattern)];
    assert.strictEqual(matches.length, 1, id + ' 应恰有一个生成键');
    const png = fs.readFileSync(path.join(ROOT, 'assets', id + '_sheet.png'));
    assert(Buffer.from(matches[0][1], 'base64').equals(png), id + ' 内联字节漂移');
  });
});
