// ---------------------------------------------------------------------------
// gfx.js -- procedurally generates every pixel the X16 build needs.
//
//   src/data/palette.bin   256 x 2 bytes, VERA 12-bit GB/R format
//   src/data/tiles.bin     16x16 @4bpp ground tiles
//   src/data/sprites.bin   4bpp sprite images
//   src/data/gfx.inc       ca65 constants (tile ids, sprite VRAM offsets)
//   build/preview.png      a contact sheet, so the art can be eyeballed
//
// Keeps the parent project's "zero external assets" rule: no image files in,
// everything drawn from primitives.
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

// --- deterministic PRNG ----------------------------------------------------
let _s = 0x1337beef;
function rnd() {
  _s ^= _s << 13; _s >>>= 0;
  _s ^= _s >>> 17;
  _s ^= _s << 5; _s >>>= 0;
  return _s / 4294967296;
}
const ri = (n) => Math.floor(rnd() * n);
function seed(v) { _s = v >>> 0; }

// ---------------------------------------------------------------------------
// Palette: six 16-colour banks. Bank 0 doubles as the HUD palette because
// 1bpp text mode indexes entries 0-15 directly.
// ---------------------------------------------------------------------------
const BANKS = [
  // 0 - terrain + HUD
  ['#000000', '#6a8f4a', '#7ba05b', '#55803f', '#91a05e', '#4c6b3a',
   '#8a6a45', '#6e5236', '#9a8f7a', '#3f6f9c', '#2f4a28', '#7a7f86',
   '#d8d8d2', '#e8a33d', '#c4574a', '#1a1f24'],
  // 1 - player aircraft
  ['#000000', '#4a6d8c', '#7fa8c9', '#d8e4ee', '#1e2a36', '#9aa2ab',
   '#2b3a48', '#c46a3a', '#e8c46b', '#5f7f9c', '#38516b', '#b8c4cc',
   '#8a5a2f', '#243040', '#6f93b0', '#0f151c'],
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
  // 5 - water / misc
  ['#000000', '#3f6f9c', '#5f8fbc', '#8fb4d4', '#2c5478', '#1e3c5c',
   '#d8d8d2', '#6a8f4a', '#55803f', '#8a6a45', '#62666a', '#e8a33d',
   '#c4574a', '#1a1f24', '#9aa2ab', '#ffffff'],
];

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

const palette = Buffer.alloc(512);
const rgbOf = new Array(256).fill(null).map(() => [0, 0, 0]);
BANKS.forEach((bank, b) => {
  bank.forEach((c, i) => {
    const [r, g, bl] = hex(c);
    const idx = b * 16 + i;
    // VERA: byte0 = Green<<4 | Blue, byte1 = Red   (4 bits each)
    palette[idx * 2] = ((g >> 4) << 4) | (bl >> 4);
    palette[idx * 2 + 1] = r >> 4;
    // preview uses the 12-bit-quantised colour the hardware will actually show
    rgbOf[idx] = [(r >> 4) * 17, (g >> 4) * 17, (bl >> 4) * 17];
  });
});
fs.writeFileSync(path.join(DATA, 'palette.bin'), palette);

// ---------------------------------------------------------------------------
// Canvas of 4bpp palette indices (0 = transparent)
// ---------------------------------------------------------------------------
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
  /** Filled disc -- the brush behind every thick line. */
  disc(cx, cy, r, c) {
    const r2 = r * r;
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++)
        if (i * i + j * j <= r2) this.set(cx + i, cy + j, c);
    return this;
  }
  /** Thick line: steps the segment and stamps a disc of radius `t`. */
  line(x0, y0, x1, y1, c, t = 0) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = Math.round(x0 + (x1 - x0) * u);
      const y = Math.round(y0 + (y1 - y0) * u);
      if (t > 0) this.disc(x, y, t, c); else this.set(x, y, c);
    }
    return this;
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let j = -ry; j <= ry; j++)
      for (let i = -rx; i <= rx; i++)
        if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) this.set(cx + i, cy + j, c);
    return this;
  }
  /** 1px halo of `c` around every non-transparent pixel (drawn underneath). */
  outline(c) {
    const src = Uint8Array.from(this.p);
    const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : src[y * this.w + x];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (at(x, y)) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.set(x, y, c);
    }
    return this;
  }
  /** Replace every non-transparent pixel with `c` -- used for cast shadows. */
  silhouette(c) {
    for (let i = 0; i < this.p.length; i++) if (this.p[i]) this.p[i] = c & 15;
    return this;
  }
  /** Pack to VERA 4bpp: high nibble is the left pixel. */
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
// GROUND TILES (16x16)
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

/** Speckle a field with a couple of lighter/darker grains. */
function grain(c, base, alt, n) {
  for (let i = 0; i < n; i++) c.set(ri(16), ri(16), alt);
}

seed(0xA11CE);
// Plain grass / fields, several shades so the patchwork reads as farmland.
tile('grass1', (c) => { c.fill(1); grain(c, 1, 2, 26); });
tile('grass2', (c) => { c.fill(2); grain(c, 2, 1, 26); });
tile('field1', (c) => { c.fill(3); grain(c, 3, 5, 20); });
tile('field2', (c) => { c.fill(4); grain(c, 4, 2, 20); });
tile('field3', (c) => { c.fill(5); grain(c, 5, 3, 20); });
// Strip-farmed bands, running with the isometric grain.
tile('crop1', (c) => { c.fill(2); for (let y = 0; y < 16; y += 3) c.rect(0, y, 16, 1, 3); });
tile('crop2', (c) => { c.fill(4); for (let x = 0; x < 16; x += 3) c.rect(x, 0, 1, 16, 3); });
// Ploughed earth.
tile('plow1', (c) => { c.fill(6); for (let y = 1; y < 16; y += 3) c.rect(0, y, 16, 1, 7); });
tile('plow2', (c) => { c.fill(7); for (let x = 1; x < 16; x += 3) c.rect(x, 0, 1, 16, 6); });
// Woodland: dark canopy with lighter crowns.
tile('woods', (c) => {
  c.fill(10);
  for (let i = 0; i < 7; i++) { const x = ri(14) + 1, y = ri(14) + 1; c.disc(x, y, 2, 3); c.disc(x, y - 1, 1, 1); }
});
// Hedgerow-bounded field, gives the patchwork visible seams.
tile('hedgeN', (c) => { c.fill(1); grain(c, 1, 2, 14); c.rect(0, 0, 16, 2, 10); });
tile('hedgeW', (c) => { c.fill(1); grain(c, 1, 2, 14); c.rect(0, 0, 2, 16, 10); });
// Road: solid band -- laid on a 45-degree tile diagonal it renders as a road.
tile('road', (c) => {
  c.fill(8);
  for (let i = 0; i < 16; i += 4) c.rect(i, 7, 2, 2, 12);
});
// River.
tile('river', (c) => {
  c.fill(9);
  for (let i = 0; i < 5; i++) { const y = ri(16); c.rect(ri(10), y, 5, 1, 2 + 0); }
  for (let i = 0; i < 4; i++) c.rect(ri(12), ri(16), 4, 1, 2);
});
// Runway: grey strip with centre stripes, laid along the flight diagonal.
tile('runway', (c) => { c.fill(11); grain(c, 11, 8, 10); });
tile('runwayS', (c) => { c.fill(11); grain(c, 11, 8, 10); c.rect(6, 2, 4, 6, 12); c.rect(6, 10, 4, 4, 12); });
// Dry steppe and rock, for variety between farm belts.
tile('steppe', (c) => { c.fill(4); grain(c, 4, 6, 30); });
tile('rock', (c) => { c.fill(11); grain(c, 11, 15, 18); grain(c, 11, 8, 14); });

// ===========================================================================
// SPRITES
// ===========================================================================
const SPRITES = [];
const spriteName = {};
function sprite(name, w, h, bank, fn) {
  const c = new Canvas(w, h);
  fn(c);
  spriteName[name] = SPRITES.length;
  SPRITES.push({ name, w, h, bank, c });
  return SPRITES.length - 1;
}

// --- aircraft --------------------------------------------------------------
// Everything flies north-east, matching the diagonal scroll. Drawing is done
// along the fuselage axis (1,-1) with wings on the perpendicular (1,1).
function drawPlane(c, o) {
  const {
    body = 1, wing = 2, detail = 3, dark = 4, prop = 5, cockpit = 6,
    wings = [[0, 9], [3, 8]],       // [offset along fuselage, half-span]
    len = 11, tail = 5, roll = 0, twin = false,
  } = o;
  const cx = c.w / 2, cy = c.h / 2;
  // unit vectors: forward = NE, perpendicular = SE
  const fx = 0.7071, fy = -0.7071;
  const px = 0.7071, py = 0.7071;
  const P = (a, b) => [cx + fx * a + px * b, cy + fy * a + py * b];

  // Wings first so the fuselage sits on top of them.
  for (let i = 0; i < wings.length; i++) {
    const [off, span] = wings[i];
    // Rolling foreshortens the far wing, which reads as a bank.
    const l = span * (1 - Math.max(0, -roll) * 0.35);
    const r = span * (1 - Math.max(0, roll) * 0.35);
    const [ax, ay] = P(off, -l);
    const [bx, by] = P(off, r);
    c.line(ax, ay, bx, by, i === 0 ? wing : body, 1);
  }
  // Tailplane
  {
    const [ax, ay] = P(-tail, -4);
    const [bx, by] = P(-tail, 4);
    c.line(ax, ay, bx, by, wing, 1);
    const [vx, vy] = P(-tail - 2, 0);
    c.disc(vx, vy, 1, detail);
  }
  // Fuselage
  {
    const [ax, ay] = P(-tail - 2, 0);
    const [bx, by] = P(len, 0);
    c.line(ax, ay, bx, by, body, 1);
  }
  // Engine, propeller disc, cockpit
  {
    const [nx, ny] = P(len, 0);
    c.disc(nx, ny, 2, dark);
    const [p1x, p1y] = P(len + 2, -5);
    const [p2x, p2y] = P(len + 2, 5);
    c.line(p1x, p1y, p2x, p2y, prop, 0);
    const [kx, ky] = P(-1, 0);
    c.disc(kx, ky, 1, cockpit);
  }
  if (twin) {
    for (const s of [-6, 6]) {
      const [bx, by] = P(2, s);
      c.line(bx - 5 * fx, by - 5 * fy, bx + 7 * fx, by + 7 * fy, body, 1);
      c.disc(bx + 7 * fx, by + 7 * fy, 1, dark);
    }
  }
}

for (const [nm, roll] of [['plane_l', -1], ['plane_c', 0], ['plane_r', 1]]) {
  sprite(nm, 32, 32, 1, (c) => {
    drawPlane(c, { roll, wings: [[1, 9], [4, 8]] });
    c.outline(15);
  });
}
// Cast shadow: the player silhouette flattened to one dark colour.
sprite('shadow', 32, 32, 1, (c) => {
  drawPlane(c, { roll: 0, wings: [[1, 9], [4, 8]] });
  c.silhouette(13);
});

sprite('foe_bi', 32, 32, 2, (c) => {
  drawPlane(c, { wings: [[1, 9], [4, 8]] });
  c.outline(15);
});
sprite('foe_mono', 32, 32, 2, (c) => {
  drawPlane(c, { wings: [[2, 10]], len: 12, tail: 6 });
  c.outline(15);
});
sprite('foe_tri', 32, 32, 2, (c) => {
  drawPlane(c, { wings: [[0, 8], [3, 9], [6, 7]] });
  c.outline(15);
});
// Zeppelin: fat hull on the flight diagonal with two gondolas.
sprite('zep', 64, 64, 2, (c) => {
  const cx = 32, cy = 32;
  for (let t = -22; t <= 22; t++) {
    const r = Math.round(8 * Math.sqrt(Math.max(0, 1 - (t / 23) ** 2)));
    const x = cx + 0.7071 * t, y = cy - 0.7071 * t;
    c.disc(x, y, r, t % 7 === 0 ? 6 : 8);
  }
  for (const s of [-8, 8]) {
    const x = cx + 0.7071 * s + 0.7071 * 7, y = cy - 0.7071 * s + 0.7071 * 7;
    c.disc(x, y, 2, 7);
  }
  // tail fins
  c.line(cx - 0.7071 * 20 - 6, cy + 0.7071 * 20 - 6, cx - 0.7071 * 20 + 6, cy + 0.7071 * 20 + 6, 11, 1);
  c.outline(15);
});

// --- ordnance and effects --------------------------------------------------
sprite('bullet', 8, 8, 4, (c) => { c.disc(4, 4, 1, 1); c.set(4, 3, 11); c.set(3, 4, 11); });
sprite('flak', 8, 8, 4, (c) => { c.disc(4, 4, 2, 2); c.disc(4, 4, 1, 1); });
sprite('bomb', 8, 8, 4, (c) => {
  c.line(2, 5, 5, 2, 9, 1);
  c.set(6, 1, 7); c.set(1, 6, 7);
});
for (let f = 0; f < 4; f++) {
  sprite('boom' + f, 32, 32, 4, (c) => {
    seed(0x5EED + f * 977);
    const r = 5 + f * 4;
    for (let i = 0; i < 60; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * r;
      const x = 16 + Math.cos(a) * d, y = 16 + Math.sin(a) * d;
      const t = d / r;
      c.disc(x, y, 2, t < 0.35 ? (f > 1 ? 6 : 10) : t < 0.7 ? 1 : f > 2 ? 5 : 3);
    }
    if (f > 1) for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2, d = r * (0.7 + rnd() * 0.5);
      c.disc(16 + Math.cos(a) * d, 16 + Math.sin(a) * d, 1, 8);
    }
  });
}

// --- structures ------------------------------------------------------------
/** Isometric box: top face, then the two visible side faces. */
function isoBox(c, cx, cy, hw, hd, ht, top, left, right) {
  for (let y = -hd; y <= hd; y++)
    for (let x = -hw; x <= hw; x++) {
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

sprite('bldg', 32, 32, 3, (c) => {
  isoBox(c, 14, 20, 6, 6, 9, 2, 1, 3);      // red roof, tan walls
  c.outline(13);
});
sprite('bldg_hit', 32, 32, 3, (c) => {
  isoBox(c, 14, 22, 6, 6, 3, 5, 5, 13);     // collapsed to a charred stump
  for (let i = 0; i < 10; i++) c.set(6 + ri(20), 16 + ri(12), 4);
  c.outline(13);
});
sprite('factory', 32, 32, 3, (c) => {
  isoBox(c, 13, 22, 8, 7, 8, 8, 7, 11);
  isoBox(c, 24, 14, 2, 2, 12, 12, 3, 13);   // chimney
  c.outline(13);
});
sprite('factory_hit', 32, 32, 3, (c) => {
  isoBox(c, 13, 23, 8, 7, 3, 5, 5, 13);
  for (let i = 0; i < 14; i++) c.set(3 + ri(26), 14 + ri(14), 4);
  c.outline(13);
});
sprite('hangar', 32, 32, 3, (c) => {
  isoBox(c, 13, 22, 9, 7, 7, 12, 8, 11);
  c.outline(13);
});
sprite('aagun', 16, 16, 3, (c) => {
  isoBox(c, 6, 11, 3, 3, 3, 4, 5, 5);
  c.line(8, 7, 13, 2, 5, 0);                // barrel, pointing NE
  c.disc(7, 8, 1, 12);
  c.outline(13);
});
sprite('aagun_hit', 16, 16, 3, (c) => {
  isoBox(c, 6, 12, 3, 3, 1, 5, 5, 13);
  for (let i = 0; i < 6; i++) c.set(2 + ri(11), 8 + ri(6), 4);
  c.outline(13);
});
sprite('depot', 16, 16, 3, (c) => {
  for (const [dx, dy] of [[0, 0], [6, 3], [-1, 5]]) c.ellipse(5 + dx, 8 + dy, 3, 2, 10);
  for (const [dx, dy] of [[0, 0], [6, 3], [-1, 5]]) c.ellipse(5 + dx, 7 + dy, 3, 2, 9);
  c.outline(13);
});
sprite('truck', 16, 16, 3, (c) => {
  isoBox(c, 6, 10, 4, 2, 3, 12, 4, 7);
  isoBox(c, 11, 8, 1, 1, 2, 15, 8, 8);
  c.outline(13);
});
sprite('tank', 16, 16, 3, (c) => {
  isoBox(c, 6, 11, 4, 3, 2, 4, 5, 5);
  isoBox(c, 6, 9, 2, 2, 2, 4, 5, 5);
  c.line(8, 6, 13, 3, 5, 0);
  c.outline(13);
});
sprite('bridge', 32, 32, 3, (c) => {
  // Deck laid on the road diagonal, with girders and two piers.
  c.line(1, 1, 30, 30, 7, 3);
  c.line(1, 1, 30, 30, 15, 2);
  for (let t = 3; t < 30; t += 5) { c.disc(t + 3, t - 3, 1, 7); c.disc(t - 3, t + 3, 1, 7); }
  c.outline(13);
});
sprite('balloon', 32, 32, 2, (c) => {
  c.ellipse(16, 12, 7, 9, 9);
  c.ellipse(14, 10, 4, 6, 10);
  c.disc(16, 22, 2, 7);
  c.line(16, 24, 16, 31, 4, 0);
  c.outline(15);
});

// ===========================================================================
// Emit binaries
// ===========================================================================
const tileBuf = Buffer.concat(TILES.map((c) => c.pack()));
fs.writeFileSync(path.join(DATA, 'tiles.bin'), tileBuf);

// Sprite images must start on a 32-byte boundary (VERA stores addr>>5).
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

// --- ca65 include ----------------------------------------------------------
const SZ = { 8: 0, 16: 1, 32: 2, 64: 3 };
let inc = '; Generated by tools/gfx.cjs -- do not edit.\n\n';
inc += `TILE_COUNT = ${TILES.length}\n`;
inc += `TILE_BYTES = ${tileBuf.length}\n`;
inc += `SPR_BYTES  = ${off}\n\n`;
for (const [n, i] of Object.entries(tileName)) inc += `T_${n.toUpperCase().padEnd(10)} = ${i}\n`;
// Sprite image ids, plus the attribute bytes each one needs. Precomputing
// these here keeps the 6502 side to three table reads per sprite.
const VRAM_SPR = 0x0A000;
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
inc += tbl('imgattr', (s) => (SZ[s.h] << 6) | (SZ[s.w] << 4) | s.bank, 'attr+7: size | palette bank');
inc += tbl('imghw', (s) => s.w >> 1, 'half width, for centring');
inc += tbl('imghh', (s) => s.h >> 1, 'half height, for centring');
fs.writeFileSync(path.join(DATA, 'gfx.inc'), inc);

// ---------------------------------------------------------------------------
// tables.inc -- the terrain hash permutation and the PSG note table.
// ---------------------------------------------------------------------------
{
  seed(0xC0FFEE);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = ri(i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }

  // PSG frequency word = Hz * 2^17 / 48828.125
  const notes = [];
  for (let n = 0; n < 72; n++) {                 // 6 octaves from C1
    const hz = 32.7032 * Math.pow(2, n / 12);
    notes.push(Math.min(65535, Math.round(hz * 131072 / 48828.125)));
  }

  const rows = (arr, fmt) => {
    let s = '';
    for (let i = 0; i < arr.length; i += 16)
      s += '        .byte ' + arr.slice(i, i + 16).map(fmt).join(',') + '\n';
    return s;
  };
  let t = '; Generated by tools/gfx.cjs -- do not edit.\n\n';
  t += 'permtab:\n' + rows(perm, (v) => '$' + v.toString(16).padStart(2, '0'));
  t += '\nNOTE_COUNT = ' + notes.length + '\n';
  t += 'notelo:\n' + rows(notes.map((v) => v & 255), (v) => '$' + v.toString(16).padStart(2, '0'));
  t += 'notehi:\n' + rows(notes.map((v) => v >> 8), (v) => '$' + v.toString(16).padStart(2, '0'));
  fs.writeFileSync(path.join(DATA, 'tables.inc'), t);
}

// ===========================================================================
// Preview contact sheet (uncompressed-ish PNG via zlib)
// ===========================================================================
function writePNG(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 3;
      raw[o++] = rgb[p]; raw[o++] = rgb[p + 1]; raw[o++] = rgb[p + 2];
    }
  }
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

{
  const SC = 2, PAD = 4;
  const cells = [
    ...TILES.map((c, i) => ({ c, bank: 0, label: 'tile' + i })),
    ...SPRITES.map((s) => ({ c: s.c, bank: s.bank, label: s.name })),
  ];
  const COLS = 10;
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

console.log(`tiles   ${TILES.length} (${tileBuf.length} bytes)`);
console.log(`sprites ${SPRITES.length} (${off} bytes)`);
console.log(`preview build/preview.png`);
