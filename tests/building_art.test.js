/* Asset loading stays lazy so the normal game does not decode the building atlas. */
const artFS = require('fs');
const artEqual = require('assert').strictEqual;
const artVM = require('vm');
const artPath = require('path');

function artSandbox() {
  const images = [];
  class AtlasImage { constructor() { images.push(this); } }
  const context = { window: {}, Image: AtlasImage };
  context.window = context;
  context.APH = { BUILD_ART_DATA: 'data:image/png;base64,fixture' };
  artVM.runInNewContext(artFS.readFileSync(artPath.join(__dirname, '../src/building_art.js'), 'utf8'), context);
  return { art: context.APH.BuildArt, images };
}

test('building art: only an explicit load decodes the atlas; concurrent consumers share it', () => {
  const { art, images } = artSandbox(), completions = [];
  artEqual(images.length, 0);
  artEqual(art.isReady(), false);
  art.load(ok => completions.push(ok));
  art.load(ok => completions.push(ok));
  artEqual(images.length, 1);
  images[0].naturalWidth = images[0].naturalHeight = 1024;
  images[0].onload();
  artEqual(art.isReady(), true);
  artEqual(completions.join(','), 'true,true');
  art.load(ok => completions.push(ok));
  artEqual(images.length, 1);
  artEqual(completions.length, 3);
});

test('building art: corrupt or missing images leave a usable fallback', () => {
  for (const malformed of [false, true]) {
    const { art, images } = artSandbox();
    let result;
    art.load(ok => { result = ok; });
    if (malformed) { images[0].naturalWidth = 1000; images[0].naturalHeight = 300; images[0].onload(); }
    else images[0].onerror();
    artEqual(result, false);
    artEqual(art.isReady(), false);
    artEqual(art.drawSprite({}, 'bl_bed', 0, 0, 48, 96), false);
    artEqual(art.fillMaterial({}, 'ground', 0, 0, 48, 48), false);
  }
});

test('building art: the build accepts the prepared atlas and rejects the generated RGB master', () => {
  const check = require('child_process').spawnSync('python3', ['-c', [
    'from pathlib import Path',
    'from assets.build_building_art import validate_atlas',
    "validate_atlas(Path('assets/building/warm-settlement-atlas.png').read_bytes())",
    'try:',
    "    validate_atlas(Path('assets/building/warm-settlement-atlas.raw.png').read_bytes())",
    'except ValueError:',
    '    pass',
    'else:',
    "    raise AssertionError('RGB master must never enter the distributed game')"
  ].join('\n')], { cwd: artPath.join(__dirname, '..'), encoding:'utf8' });
  artEqual(check.status, 0, check.stderr);
});
