// ---------------------------------------------------------------------------
// gfx.cjs -- art for the 2.5D build. Same procedural-only rule as the rest of
// the project: nothing is loaded, everything is drawn from primitives.
//
// The camera looks forward over the nose, so aircraft are drawn from behind
// and structures in three-quarter view, matching the Three.js chase camera.
// ---------------------------------------------------------------------------
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'src', 'data');
const BUILD = path.join(ROOT, 'build');
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(BUILD, { recursive: true });

let _s = 0x1337beef;
function rnd() {
  _s ^= _s << 13; _s >>>= 0;
  _s ^= _s >>> 17;
  _s ^= _s << 5; _s >>>= 0;
  return _s / 4294967296;
}
const ri = (n) => Math.floor(rnd() * n);
const seed = (v) => { _s = v >>> 0; };

// ---------------------------------------------------------------------------
// Palette. Bank 0 is terrain and doubles as the HUD palette (1bpp text mode
// indexes 0-15 directly). Entry 0 is the sky, rewritten every raster band to
// paint the gradient, so nothing else may use it.
// ---------------------------------------------------------------------------
const BANKS = [
  // 0 - terrain + HUD  (0 is the live sky colour)
  ['#4f92cf', '#6a8f4a', '#7ba05b', '#55803f', '#91a05e', '#4c6b3a',
   '#3f5f33', '#7a4a32', '#8f5a3c', '#2f4a28', '#a8b27a', '#63666a',
   '#d8d8d2', '#e8a33d', '#c4574a', '#1a1f24'],
  // 1 - player aircraft
  ['#000000', '#4a6d8c', '#7fa8c9', '#d8e4ee', '#1e2a36', '#9aa2ab',
   '#2b3a48', '#38516b', '#5f7f9c', '#b8c4cc', '#243040', '#6f93b0',
   '#c46a3a', '#e8c46b', '#8a5a2f', '#0f151c'],
  // 2 - enemy aircraft
  ['#000000', '#8c4a45', '#c47a6e', '#e8d4c4', '#2a1a18', '#9aa2ab',
   '#5c2f2c', '#3a3f46', '#6e7076', '#a85f52', '#d8b8a8', '#4a4f56',
   '#7a3f38', '#1a1012', '#c9968a', '#0d0808'],
  // 3 - structures
  ['#000000', '#8a7a5e', '#a8562f', '#6b5f47', '#4d5346', '#2b2f28',
   '#d8d8d2', '#3a4048', '#5f6670', '#7d5a3a', '#c48a4a', '#2f3540',
   '#9aa2ab', '#1a1f24', '#6a4a2a', '#b8bcc0'],
  // 4 - fire, smoke, ordnance
  ['#000000', '#f2d16b', '#e8a33d', '#c4574a', '#8a4a3a', '#4a3028',
   '#d8d8d2', '#8f959c', '#4f545a', '#2f3540', '#ffffff', '#ffe9a8',
   '#a83828', '#5c1f18', '#3a2018', '#12080a'],
  // 5 - clouds and haze
  ['#000000', '#ffffff', '#e8f0f6', '#c3d7e6', '#a9c9e2', '#8fb4d4',
   '#d5e3ee', '#7ba3c6', '#b8ccdc', '#96b6d0', '#6a8f4a', '#55803f',
   '#d8d8d2', '#e8a33d', '#c4574a', '#1a1f24'],
];

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

const palette = Buffer.alloc(512);
const rgbOf = new Array(256).fill(null).map(() => [0, 0, 0]);
BANKS.forEach((bank, b) => bank.forEach((c, i) => {
  const [r, g, bl] = hex(c);
  const idx = b * 16 + i;
  palette[idx * 2] = ((g >> 4) << 4) | (bl >> 4);   // VERA: byte0 = G:B
  palette[idx * 2 + 1] = r >> 4;                    //       byte1 = R
  rgbOf[idx] = [(r >> 4) * 17, (g >> 4) * 17, (bl >> 4) * 17];
}));
fs.writeFileSync(path.join(DATA, 'palette.bin'), palette);

class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.p = new Uint8Array(w * h); }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.p[y * this.w + x] = c & 15;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.p[y * this.w + x];
  }
  fill(c) { this.p.fill(c & 15); return this; }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }
  disc(cx, cy, r, c) {
    const r2 = r * r;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++)
      if (i * i + j * j <= r2) this.set(cx + i, cy + j, c);
    return this;
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++)
      if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) this.set(cx + i, cy + j, c);
    return this;
  }
  line(x0, y0, x1, y1, c, t = 0) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = Math.round(x0 + (x1 - x0) * u), y = Math.round(y0 + (y1 - y0) * u);
      if (t > 0) this.disc(x, y, t, c); else this.set(x, y, c);
    }
    return this;
  }
  outline(c) {
    const src = Uint8Array.from(this.p);
    const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : src[y * this.w + x];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (at(x, y)) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.set(x, y, c);
    }
    return this;
  }
  silhouette(c) { for (let i = 0; i < this.p.length; i++) if (this.p[i]) this.p[i] = c & 15; return this; }
  /** Shrink by 2x with nearest sampling -- the "far away" version of a sprite. */
  half() {
    const o = new Canvas(this.w >> 1, this.h >> 1);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      const a = this.get(x * 2, y * 2), b = this.get(x * 2 + 1, y * 2);
      const c = this.get(x * 2, y * 2 + 1), d = this.get(x * 2 + 1, y * 2 + 1);
      o.set(x, y, a || b || c || d);
    }
    return o;
  }
  pack() {
    const out = Buffer.alloc((this.w * this.h) >> 1);
    let o = 0;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x += 2)
        out[o++] = (this.get(x, y) << 4) | this.get(x + 1, y);
    return out;
  }
}

// ===========================================================================
// Ground tiles (16x16). The raster engine squashes these vertically with
// distance, so the patterns are drawn bold enough to survive compression.
// ===========================================================================
const TILES = [];
const tileName = {};
function tile(name, fn) {
  const c = new Canvas(16, 16);
  fn(c);
  tileName[name] = TILES.length;
  TILES.push(c);
  return TILES.length - 1;
}
const grain = (c, alt, n) => { for (let i = 0; i < n; i++) c.set(ri(16), ri(16), alt); };

seed(0xA11CE);
tile('grass1', (c) => { c.fill(1); grain(c, 2, 20); });
tile('grass2', (c) => { c.fill(2); grain(c, 1, 20); });
tile('field1', (c) => { c.fill(3); grain(c, 5, 16); });
tile('field2', (c) => { c.fill(4); grain(c, 2, 16); });
tile('field3', (c) => { c.fill(5); grain(c, 3, 16); });
tile('field4', (c) => { c.fill(6); grain(c, 5, 16); });
// Ploughed strips -- the red-brown bands that give the patchwork its colour
tile('plow1', (c) => { c.fill(7); for (let y = 1; y < 16; y += 3) c.rect(0, y, 16, 1, 8); });
tile('plow2', (c) => { c.fill(8); for (let y = 0; y < 16; y += 4) c.rect(0, y, 16, 2, 7); });
tile('crop1', (c) => { c.fill(2); for (let y = 0; y < 16; y += 3) c.rect(0, y, 16, 1, 4); });
tile('crop2', (c) => { c.fill(4); for (let y = 0; y < 16; y += 4) c.rect(0, y, 16, 2, 3); });
tile('woods', (c) => {
  c.fill(9);
  for (let i = 0; i < 8; i++) { const x = ri(14) + 1, y = ri(14) + 1; c.disc(x, y, 2, 5); c.disc(x, y - 1, 1, 3); }
});
tile('hedge', (c) => { c.fill(1); grain(c, 2, 10); c.rect(0, 0, 16, 2, 9); });
tile('road', (c) => { c.fill(11); for (let y = 2; y < 16; y += 6) c.rect(7, y, 2, 3, 12); });
tile('river', (c) => {
  c.fill(0);                            // sky colour doubles as water
  for (let i = 0; i < 6; i++) c.rect(ri(11), ri(16), 5, 1, 4);
});
tile('runway', (c) => { c.fill(11); grain(c, 5, 8); });
tile('runwayS', (c) => { c.fill(11); grain(c, 5, 8); c.rect(6, 3, 4, 10, 12); });
tile('steppe', (c) => { c.fill(10); grain(c, 4, 22); });

// ===========================================================================
// Sprites
// ===========================================================================
const SPRITES = [];
const spriteName = {};
function sprite(name, bank, canvas) {
  spriteName[name] = SPRITES.length;
  SPRITES.push({ name, w: canvas.w, h: canvas.h, bank, c: canvas });
  return SPRITES.length - 1;
}

// --- aircraft, seen from behind --------------------------------------------
/**
 * Rear three-quarter view: two stacked wings, a short fuselage, a rudder and a
 * tailplane. `bank` shifts the wings to read as a roll.
 */
function rearPlane(o) {
  const {
    body = 1, wing = 2, detail = 3, dark = 4, prop = 5,
    span = 15, biplane = true, bank = 0, w = 40, h = 24,
  } = o;
  const c = new Canvas(w, h);
  const cx = w >> 1, cy = h >> 1;
  // Seen from behind, banking right drops the RIGHT wing, so a positive roll
  // has to lower the right-hand end of each wing, not the left.
  const tilt = -bank * 2;

  // lower wing
  if (biplane) {
    c.line(cx - span, cy + 2 + tilt, cx + span, cy + 2 - tilt, body, 1);
    c.line(cx - span, cy + 2 + tilt, cx + span, cy + 2 - tilt, wing, 0);
  }
  // interplane struts
  const uy = biplane ? cy - 5 : cy + 1;
  if (biplane) for (const s of [-9, -4, 4, 9]) c.line(cx + s, uy, cx + s, cy + 2, dark, 0);

  // upper (or only) wing
  c.line(cx - span, uy + tilt, cx + span, uy - tilt, wing, 1);
  c.line(cx - span, uy - 1 + tilt, cx + span, uy - 1 - tilt, detail, 0);

  // fuselage seen end-on, rudder above, tailplane across
  c.rect(cx - 3, cy - 3, 7, 7, body);
  c.rect(cx - 2, cy - 2, 5, 3, dark);
  c.rect(cx - 1, cy - 9, 3, 7, body);          // fin
  c.rect(cx, cy - 9, 1, 7, detail);
  c.line(cx - 7, cy - 7, cx + 7, cy - 7, wing, 0);   // tailplane
  c.disc(cx, cy + 1, 1, prop);
  return c;
}

for (const [nm, bk] of [['plane_l', -1], ['plane_c', 0], ['plane_r', 1]]) {
  sprite(nm, 1, rearPlane({ bank: bk }).outline(15));
}
// Cast shadow: the planform flattened, so it reads as lying on the ground.
{
  const c = new Canvas(40, 16);
  c.line(4, 8, 35, 8, 1, 1);                  // wings
  c.rect(17, 3, 5, 11, 1);                    // fuselage
  c.line(14, 4, 25, 4, 1, 0);                 // tailplane
  sprite('shadow', 1, c.silhouette(10));
}

// Enemies come at you head-on, so they are drawn nose-first.
function frontPlane(o) {
  const c = rearPlane(o);
  // swap the rudder for a nose and prop disc
  const cx = c.w >> 1, cy = c.h >> 1;
  c.rect(cx - 1, cy - 9, 3, 7, 0);
  c.disc(cx, cy - 1, 3, o.dark || 4);
  c.line(cx - 8, cy - 1, cx + 8, cy - 1, o.prop || 5, 0);
  return c;
}
sprite('foe_bi', 2, frontPlane({ span: 14 }).outline(15));
sprite('foe_mono', 2, frontPlane({ span: 16, biplane: false }).outline(15));
sprite('foe_far', 2, frontPlane({ span: 14 }).outline(15).half());

// --- clouds ----------------------------------------------------------------
for (let n = 0; n < 2; n++) {
  const c = new Canvas(64, 32);
  seed(0xC10D + n * 31);
  for (let i = 0; i < 10; i++) {
    const x = 8 + ri(48), y = 12 + ri(10), r = 4 + ri(6);
    c.ellipse(x, y, r, Math.max(2, r - 2), 3);
  }
  for (let i = 0; i < 8; i++) {
    const x = 10 + ri(44), y = 10 + ri(6), r = 3 + ri(5);
    c.ellipse(x, y, r, Math.max(2, r - 2), 1);
  }
  sprite('cloud' + n, 5, c);
}

// --- ordnance and effects --------------------------------------------------
{
  const c = new Canvas(8, 8); c.disc(4, 4, 1, 1); c.set(4, 2, 11);
  sprite('bullet', 4, c);
}
{
  const c = new Canvas(8, 8); c.disc(4, 4, 2, 2); c.disc(4, 4, 1, 1);
  sprite('flak', 4, c);
}
{
  const c = new Canvas(8, 8); c.ellipse(4, 4, 2, 3, 9); c.set(4, 1, 7); c.set(4, 7, 7);
  sprite('bomb', 4, c);
}
for (let f = 0; f < 4; f++) {
  const c = new Canvas(32, 32);
  seed(0x5EED + f * 977);
  const r = 5 + f * 4;
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r;
    const t = d / r;
    c.disc(16 + Math.cos(a) * d, 16 + Math.sin(a) * d, 2,
      t < 0.35 ? (f > 1 ? 6 : 10) : t < 0.7 ? 1 : f > 2 ? 5 : 3);
  }
  sprite('boom' + f, 4, c);
}

// --- structures, in three-quarter view -------------------------------------
function isoBox(c, cx, cy, hw, hd, ht, top, left, right) {
  for (let y = -hd; y <= hd; y++) for (let x = -hw; x <= hw; x++) {
    const sx = cx + x - y, sy = cy + ((x + y) >> 1) - ht;
    c.set(sx, sy, top); c.set(sx + 1, sy, top);
  }
  for (let h = 0; h < ht; h++) {
    for (let x = -hw; x <= hw; x++) {
      const sx = cx + x - hd, sy = cy + ((x + hd) >> 1) - ht + h;
      c.set(sx, sy, right); c.set(sx + 1, sy, right);
    }
    for (let y = -hd; y <= hd; y++) {
      const sx = cx + hw - y, sy = cy + ((hw + y) >> 1) - ht + h;
      c.set(sx, sy, left); c.set(sx + 1, sy, left);
    }
  }
}

/** Registers a structure at full size and at half size for the far field. */
function structure(name, build) {
  const c = new Canvas(32, 32);
  build(c);
  c.outline(13);
  sprite(name, 3, c);
  sprite(name + '_f', 3, c.half());
}

structure('bldg', (c) => isoBox(c, 14, 22, 6, 6, 9, 2, 1, 3));
structure('bldg_hit', (c) => {
  isoBox(c, 14, 24, 6, 6, 3, 5, 5, 13);
  for (let i = 0; i < 10; i++) c.set(6 + ri(20), 18 + ri(12), 4);
});
structure('factory', (c) => { isoBox(c, 13, 24, 8, 7, 8, 8, 7, 11); isoBox(c, 24, 16, 2, 2, 12, 12, 3, 13); });
structure('factory_hit', (c) => {
  isoBox(c, 13, 25, 8, 7, 3, 5, 5, 13);
  for (let i = 0; i < 14; i++) c.set(3 + ri(26), 16 + ri(14), 4);
});
structure('hangar', (c) => isoBox(c, 13, 24, 9, 7, 7, 12, 8, 11));
structure('aagun', (c) => { isoBox(c, 13, 25, 4, 4, 4, 4, 5, 5); c.line(15, 20, 22, 13, 5, 0); c.disc(14, 21, 1, 12); });
structure('aagun_hit', (c) => {
  isoBox(c, 13, 26, 4, 4, 1, 5, 5, 13);
  for (let i = 0; i < 8; i++) c.set(7 + ri(14), 22 + ri(6), 4);
});
structure('depot', (c) => {
  for (const [dx, dy] of [[0, 0], [8, 4], [-2, 7]]) c.ellipse(12 + dx, 22 + dy, 4, 3, 10);
  for (const [dx, dy] of [[0, 0], [8, 4], [-2, 7]]) c.ellipse(12 + dx, 20 + dy, 4, 3, 9);
});
structure('truck', (c) => { isoBox(c, 12, 24, 5, 3, 4, 12, 4, 7); isoBox(c, 19, 21, 2, 2, 3, 15, 8, 8); });
structure('tank', (c) => { isoBox(c, 13, 25, 6, 4, 3, 4, 5, 5); isoBox(c, 13, 22, 3, 3, 3, 4, 5, 5); c.line(16, 18, 23, 14, 5, 0); });
structure('tree', (c) => { c.line(15, 28, 15, 20, 14, 0); c.disc(15, 17, 6, 5); c.disc(13, 15, 4, 4); });

// ===========================================================================
// Emit
// ===========================================================================
const tileBuf = Buffer.concat(TILES.map((c) => c.pack()));
fs.writeFileSync(path.join(DATA, 'tiles.bin'), tileBuf);

const VRAM_SPR = 0x0A000;
let off = 0;
const chunks = [];
for (const s of SPRITES) {
  if (off % 32) { const pad = 32 - (off % 32); chunks.push(Buffer.alloc(pad)); off += pad; }
  s.off = off;
  const b = s.c.pack();
  chunks.push(b);
  off += b.length;
}
fs.writeFileSync(path.join(DATA, 'sprites.bin'), Buffer.concat(chunks));

const SZ = { 8: 0, 16: 1, 32: 2, 64: 3 };
const sizeCode = (v) => SZ[v] !== undefined ? SZ[v] : (v > 32 ? 3 : v > 16 ? 2 : v > 8 ? 1 : 0);
// VERA sprites only come in 8/16/32/64; round each axis up to the next legal size.
for (const s of SPRITES) {
  const up = (v) => v <= 8 ? 8 : v <= 16 ? 16 : v <= 32 ? 32 : 64;
  if (up(s.w) !== s.w || up(s.h) !== s.h) {
    const c2 = new Canvas(up(s.w), up(s.h));
    const ox = (c2.w - s.w) >> 1, oy = (c2.h - s.h) >> 1;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) c2.set(x + ox, y + oy, s.c.get(x, y));
    s.c = c2; s.w = c2.w; s.h = c2.h;
  }
}
// re-pack now that every sprite is a legal size
off = 0;
const chunks2 = [];
for (const s of SPRITES) {
  if (off % 32) { const pad = 32 - (off % 32); chunks2.push(Buffer.alloc(pad)); off += pad; }
  s.off = off;
  const b = s.c.pack();
  chunks2.push(b);
  off += b.length;
}
fs.writeFileSync(path.join(DATA, 'sprites.bin'), Buffer.concat(chunks2));

let inc = '; Generated by tools/gfx.cjs -- do not edit.\n\n';
inc += `TILE_COUNT = ${TILES.length}\nTILE_BYTES = ${tileBuf.length}\nSPR_BYTES  = ${off}\n\n`;
for (const [n, i] of Object.entries(tileName)) inc += `T_${n.toUpperCase().padEnd(10)} = ${i}\n`;
inc += `\nIMG_COUNT = ${SPRITES.length}\n\n`;
SPRITES.forEach((s, i) => { inc += `I_${s.name.toUpperCase().padEnd(12)} = ${i}\n`; });

const tbl = (name, fn, comment) => {
  let s = `\n${name}:  ; ${comment}\n`;
  for (let i = 0; i < SPRITES.length; i += 8)
    s += '        .byte ' + SPRITES.slice(i, i + 8)
      .map((v) => '$' + (fn(v) & 255).toString(16).padStart(2, '0')).join(',') + '\n';
  return s;
};
inc += tbl('imgadr_lo', (s) => (VRAM_SPR + s.off) >> 5, 'attr+0: address (12:5)');
inc += tbl('imgadr_hi', (s) => ((VRAM_SPR + s.off) >> 13) & 15, 'attr+1: 4bpp | address (16:13)');
inc += tbl('imgattr', (s) => (sizeCode(s.h) << 6) | (sizeCode(s.w) << 4) | s.bank, 'attr+7: size | bank');
inc += tbl('imghw', (s) => s.w >> 1, 'half width');
inc += tbl('imghh', (s) => s.h >> 1, 'half height');
fs.writeFileSync(path.join(DATA, 'gfx.inc'), inc);

// --- permutation + note tables ---------------------------------------------
{
  seed(0xC0FFEE);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = ri(i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const notes = [];
  for (let n = 0; n < 72; n++)
    notes.push(Math.min(65535, Math.round(32.7032 * Math.pow(2, n / 12) * 131072 / 48828.125)));
  const rows = (arr, fmt) => {
    let s = '';
    for (let i = 0; i < arr.length; i += 16) s += '        .byte ' + arr.slice(i, i + 16).map(fmt).join(',') + '\n';
    return s;
  };
  const hx = (v) => '$' + v.toString(16).padStart(2, '0');
  let t = '; Generated by tools/gfx.cjs -- do not edit.\n\n';
  t += 'permtab:\n' + rows(perm, hx);
  t += '\nnotelo:\n' + rows(notes.map((v) => v & 255), hx);
  t += 'notehi:\n' + rows(notes.map((v) => v >> 8), hx);
  fs.writeFileSync(path.join(DATA, 'tables.inc'), t);
}

console.log(`tiles   ${TILES.length} (${tileBuf.length} bytes)`);
console.log(`sprites ${SPRITES.length} (${off} bytes)`);

// --- preview ---------------------------------------------------------------
function writePNG(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) { const p = (y * w + x) * 3; raw[o++] = rgb[p]; raw[o++] = rgb[p + 1]; raw[o++] = rgb[p + 2]; }
  }
  const ct = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; ct[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = ct[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t, 'ascii'), d]);
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, cr]);
  };
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
{
  const SC = 2, PAD = 4, COLS = 9;
  const cells = [...TILES.map((c, i) => ({ c, bank: 0 })), ...SPRITES.map((s) => ({ c: s.c, bank: s.bank }))];
  const cw = 64 * SC + PAD, ch = 64 * SC + PAD;
  const W = COLS * cw, H = Math.ceil(cells.length / COLS) * ch;
  const rgb = Buffer.alloc(W * H * 3, 24);
  cells.forEach((cell, n) => {
    const ox = (n % COLS) * cw + PAD / 2, oy = Math.floor(n / COLS) * ch + PAD / 2;
    for (let y = 0; y < cell.c.h; y++) for (let x = 0; x < cell.c.w; x++) {
      const v = cell.c.get(x, y);
      const col = v === 0 ? [40, 40, 48] : rgbOf[cell.bank * 16 + v];
      for (let j = 0; j < SC; j++) for (let i = 0; i < SC; i++) {
        const px = ox + x * SC + i, py = oy + y * SC + j;
        if (px >= W || py >= H) continue;
        const p = (py * W + px) * 3;
        rgb[p] = col[0]; rgb[p + 1] = col[1]; rgb[p + 2] = col[2];
      }
    }
  });
  writePNG(path.join(BUILD, 'preview.png'), W, H, rgb);
}
