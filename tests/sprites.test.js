/* sprites.js 纯函数测试: framePos/advance/frameAt (不依赖图片加载) */
'use strict';
const SP = window.APH.Sprites;

test('framePos: 4列sheet的索引映射', () => {
  const def = { cols:4, rows:2, fw:64, fh:64, count:8 };
  const p0 = SP.framePos(def, 0);
  if (p0.sx!==0 || p0.sy!==0) throw new Error('第0帧应在(0,0)');
  const p3 = SP.framePos(def, 3);
  if (p3.sx!==192 || p3.sy!==0) throw new Error('第3帧应在(192,0): '+JSON.stringify(p3));
  const p5 = SP.framePos(def, 5);
  if (p5.sx!==64 || p5.sy!==64) throw new Error('第5帧应在第二行(64,64)');
});
test('framePos: 负数与超界索引回绕', () => {
  const def = { cols:4, rows:1, fw:64, fh:64, count:4 };
  const a = SP.framePos(def, -1);          // -1 % 4 → 回绕到第3帧
  if (a.sx !== 192) throw new Error('-1应回绕到192: '+a.sx);
  const b = SP.framePos(def, 9);           // 9%4=1
  if (b.sx !== 64) throw new Error('9应等于帧1: '+b.sx);
});
test('advance: fps推进与loop回绕', () => {
  const def = { fps:4, count:4, loop:true };
  let st = { t:0, frame:0 };
  st = SP.advance(st, def, 0.25);          // 一整帧
  if (st.frame !== 1) throw new Error('0.25s@4fps应到帧1: '+st.frame);
  st = SP.advance(st, def, 0.75);          // 再过3帧 → 回绕到0
  if (st.frame !== 0) throw new Error('应回绕到0: '+st.frame);
});
test('advance: loop=false 停在末帧', () => {
  const def = { fps:10, count:3, loop:false };
  let st = { t:0, frame:0 };
  st = SP.advance(st, def, 10);
  if (st.frame !== 2) throw new Error('应停在末帧2: '+st.frame);
});
test('frameAt: 无状态便捷式计算', () => {
  const def = { fps:6, count:4, loop:true };
  if (SP.frameAt(def, 0) !== 0) throw new Error('t=0→帧0');
  if (SP.frameAt(def, 0.5) !== 3) throw new Error('0.5s@6fps=3帧');
});
