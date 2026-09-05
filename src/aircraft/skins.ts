import * as THREE from 'three';
import type { Nation, Livery } from './types';

/** Material fidelity: detailed = clean painted finish, photoreal = weathered PBR skins. */
export type Tier = 'detailed' | 'photoreal';

export interface SkinOpts {
  tier: Tier;
  body: number;
  wing: number;
  detail: number;
  nation?: Nation;
  era: 'ww1' | 'ww2';
  /** Doped fabric (rib tapes) vs stressed-skin metal (panel lines, rivets). */
  fabric: boolean;
  /** Natural-metal finish. */
  metal: boolean;
  /** Geometry the painter needs to keep insignia round and place weathering. */
  wingChord: number;
  wingHalfSpan: number;
  bodyLength: number;
  bodyPerimeter: number;
  /** Fuselage v (0 nose .. 1 tail) of the side insignia, cockpit, and exhaust stacks. */
  sideMarkV: number;
  cockpitV: number;
  exhaustV?: number;
  mouth?: boolean;
  finChord: number;
  finHeight: number;
  finHinge: number; // chord fraction where the rudder starts
  /** Historical paint scheme (photoreal only). */
  livery?: Livery;
}

export interface SkinSet {
  body: THREE.Material;
  wing: THREE.Material;
  wingPlain: THREE.Material;
  fin: THREE.Material;
  bodySolid: THREE.Material;
  wingSolid: THREE.Material;
  detail: THREE.Material;
  dark: THREE.Material;
  gun: THREE.Material;
  rubber: THREE.Material;
  wood: THREE.Material;
  glass: THREE.Material;
  skin: THREE.Material;
  leather: THREE.Material;
  uniform: THREE.Material;
  flame: THREE.Material;
  flash: THREE.Material;
  disc: THREE.Material;
  jetGlow: THREE.Material;
}

// ---------------------------------------------------------------- colour helpers

type RGB = [number, number, number];
const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const css = (c: RGB, a = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const shade = (c: RGB, f: number): RGB => [
  Math.min(255, Math.max(0, c[0] * f)),
  Math.min(255, Math.max(0, c[1] * f)),
  Math.min(255, Math.max(0, c[2] * f)),
];
const NAVY: RGB = [29, 63, 122];
const RED: RGB = [163, 50, 38];
const WHITE: RGB = [232, 228, 218];
const BLACK: RGB = [22, 22, 24];

// ---------------------------------------------------------------- canvas plumbing

interface Canvas {
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Height canvas (photoreal only) painted alongside the albedo. */
  h?: CanvasRenderingContext2D;
  /** Roughness (G) / metalness (B) canvas. */
  r?: CanvasRenderingContext2D;
  W: number;
  H: number;
}

function makeCanvas(W: number, H: number, tier: Tier, rough: number, metal: number): Canvas {
  const el = document.createElement('canvas');
  el.width = W;
  el.height = H;
  const ctx = el.getContext('2d')!;
  const c: Canvas = { el, ctx, W, H };
  if (tier === 'photoreal') {
    const hc = document.createElement('canvas');
    hc.width = W; hc.height = H;
    c.h = hc.getContext('2d')!;
    c.h.fillStyle = '#808080';
    c.h.fillRect(0, 0, W, H);
    const rc = document.createElement('canvas');
    rc.width = W; rc.height = H;
    c.r = rc.getContext('2d')!;
    c.r.fillStyle = `rgb(0,${(rough * 255) | 0},${(metal * 255) | 0})`;
    c.r.fillRect(0, 0, W, H);
  }
  return c;
}

let seed = 1;
const rnd = (): number => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function tex(el: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(el);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

/** Turn a grayscale height canvas into a tangent-space normal map. */
function normalFromHeight(hc: CanvasRenderingContext2D, W: number, H: number, strength: number): HTMLCanvasElement {
  const src = hc.getImageData(0, 0, W, H).data;
  const out = hc.createImageData(W, H);
  const d = out.data;
  const hAt = (x: number, y: number) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * strength;
      const dy = (hAt(x, y - 1) - hAt(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
      d[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len) * 0.5 * 255 + 127;
      d[i + 3] = 255;
    }
  }
  const el = document.createElement('canvas');
  el.width = W; el.height = H;
  el.getContext('2d')!.putImageData(out, 0, 0);
  return el;
}

// ---------------------------------------------------------------- paint primitives

/** Base coat: the historical livery in photoreal, otherwise the plane's solid colour; then weathering. */
function paintPart(c: Canvas, part: 'wing' | 'body' | 'fin', o: SkinOpts): void {
  const color = rgb(part === 'wing' ? o.wing : o.body);
  const { ctx, W, H } = c;
  if (!(o.tier === 'photoreal' && paintLivery(c, part, o))) {
    ctx.fillStyle = css(color);
    ctx.fillRect(0, 0, W, H);
  }
  if (o.tier !== 'photoreal') return;
  // Sun-faded, mottled paint: soft blobs a few percent lighter and darker.
  for (let i = 0; i < 160; i++) {
    const f = 0.86 + rnd() * 0.28;
    ctx.fillStyle = `rgba(${f > 1 ? 255 : 0},${f > 1 ? 255 : 0},${f > 1 ? 255 : 0},${Math.abs(f - 1) * 0.9})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * W, rnd() * H, 20 + rnd() * 90, 12 + rnd() * 60, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fine grain.
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 16;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Raised rib tapes across a fabric surface (horizontal = along canvas x). */
function ribs(c: Canvas, spacing: number, horizontal: boolean, from: number, to: number): void {
  const { ctx, W, H } = c;
  const len = horizontal ? W : H;
  const cross = horizontal ? H : W;
  for (let p = from * cross + spacing / 2; p < to * cross; p += spacing) {
    const line = (col: string, off: number, w: number, tgt: CanvasRenderingContext2D) => {
      tgt.fillStyle = col;
      if (horizontal) tgt.fillRect(0, p + off, len, w);
      else tgt.fillRect(p + off, 0, w, len);
    };
    line('rgba(255,255,255,0.13)', -2, 2, ctx);
    line('rgba(0,0,0,0.16)', 1, 2, ctx);
    if (c.h) {
      line('#a0a0a0', -3, 6, c.h);
      line('#b8b8b8', -1, 2, c.h);
    }
  }
}

/** Panel lines with rivet rows for stressed-skin airframes. */
function panels(c: Canvas, xs: number[], ys: number[], rivets: boolean): void {
  const { ctx, W, H } = c;
  ctx.fillStyle = c.h ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.28)';
  for (const x of xs) ctx.fillRect(x * W, 0, 1.5, H);
  for (const y of ys) ctx.fillRect(0, y * H, W, 1.5);
  if (c.h) {
    c.h.fillStyle = '#5a5a5a';
    for (const x of xs) c.h.fillRect(x * W - 1, 0, 3, H);
    for (const y of ys) c.h.fillRect(0, y * H - 1, W, 3);
  }
  if (!rivets) return;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  const dot = (x: number, y: number) => {
    ctx.fillRect(x, y, 2, 2);
    if (c.h) { c.h.fillStyle = '#9a9a9a'; c.h.fillRect(x - 1, y - 1, 3, 3); }
  };
  for (const x of xs) for (let y = 6; y < H; y += 11) { dot(x * W + 5, y); dot(x * W - 6, y); }
  for (const y of ys) for (let x = 6; x < W; x += 11) { dot(x, y * H + 5); dot(x, y * H - 6); }
}

function roundel(c: Canvas, cx: number, cy: number, rx: number, ry: number, rings: RGB[], fracs: number[]): void {
  const { ctx } = c;
  rings.forEach((col, i) => {
    ctx.fillStyle = css(col);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * fracs[i], ry * fracs[i], 0, 0, Math.PI * 2);
    ctx.fill();
  });
  if (c.h) {
    c.h.fillStyle = '#868686';
    c.h.beginPath();
    c.h.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    c.h.fill();
  }
}

function star(c: Canvas, cx: number, cy: number, rx: number, ry: number, era: 'ww1' | 'ww2'): void {
  const { ctx } = c;
  ctx.fillStyle = css(NAVY);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = css(WHITE);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 0.95 : 0.4;
    ctx.lineTo(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r);
  }
  ctx.closePath();
  ctx.fill();
  if (era === 'ww1') {
    ctx.fillStyle = css(RED);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.28, ry * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function cross(c: Canvas, cx: number, cy: number, rx: number, ry: number, era: 'ww1' | 'ww2'): void {
  const { ctx } = c;
  const arm = (col: RGB, w: number, l: number) => {
    ctx.fillStyle = css(col);
    ctx.fillRect(cx - rx * l, cy - ry * w, rx * l * 2, ry * w * 2);
    ctx.fillRect(cx - rx * w, cy - ry * l, rx * w * 2, ry * l * 2);
  };
  if (era === 'ww1') {
    // Balkenkreuz with a thin white surround.
    arm(WHITE, 0.4, 1.0);
    arm(BLACK, 0.3, 0.9);
  } else {
    // Luftwaffe: black cross, white bars, thin black outline.
    arm(BLACK, 0.34, 1.0);
    arm(WHITE, 0.28, 0.94);
    arm(BLACK, 0.16, 0.9);
  }
}

function redStar(c: Canvas, cx: number, cy: number, rx: number, ry: number): void {
  const { ctx } = c;
  ctx.fillStyle = css(RED);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 1 : 0.42;
    ctx.lineTo(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r);
  }
  ctx.closePath();
  ctx.fill();
}

/** National insignia centred at (cx, cy) with semi-axes (rx, ry). */
function insignia(c: Canvas, nation: Nation | undefined, era: 'ww1' | 'ww2', cx: number, cy: number, rx: number, ry: number): void {
  if (!nation) return;
  if (nation === 'uk') roundel(c, cx, cy, rx, ry, [NAVY, WHITE, RED], [1, 0.66, 0.33]);
  else if (nation === 'fr') roundel(c, cx, cy, rx, ry, [RED, WHITE, NAVY], [1, 0.66, 0.33]);
  else if (nation === 'us') star(c, cx, cy, rx, ry, era);
  else if (nation === 'ussr') redStar(c, cx, cy, rx, ry);
  else cross(c, cx, cy, rx, ry, era);
}

/** Soot streak fading along +x (or -x) from (x, y). */
function soot(c: Canvas, x: number, y: number, len: number, w: number, dir: 1 | -1, alpha = 0.55): void {
  const { ctx } = c;
  const g = ctx.createLinearGradient(x, 0, x + len * dir, 0);
  g.addColorStop(0, `rgba(20,18,16,${alpha})`);
  g.addColorStop(1, 'rgba(20,18,16,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y - w * 0.35);
  ctx.lineTo(x + len * dir, y - w);
  ctx.lineTo(x + len * dir, y + w);
  ctx.lineTo(x, y + w * 0.35);
  ctx.closePath();
  ctx.fill();
  if (c.r) {
    c.r.fillStyle = 'rgba(0,255,0,0.35)'; // soot is rough
    c.r.fillRect(Math.min(x, x + len * dir), y - w, len, w * 2);
  }
}

/** Paint chips: bright bare-metal flecks along an edge. */
function chips(c: Canvas, x0: number, y0: number, x1: number, y1: number, n: number): void {
  const { ctx } = c;
  for (let i = 0; i < n; i++) {
    const t = rnd();
    const x = x0 + (x1 - x0) * t + (rnd() - 0.5) * 6;
    const y = y0 + (y1 - y0) * t + (rnd() - 0.5) * 6;
    ctx.fillStyle = `rgba(190,196,204,${0.5 + rnd() * 0.5})`;
    ctx.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 2);
    if (c.r) { c.r.fillStyle = 'rgb(0,60,255)'; c.r.fillRect(x, y, 3, 2); }
  }
}

// ---------------------------------------------------------------- liveries (photoreal)

type Rect = [number, number, number, number]; // x0, y0, x1, y1 in canvas pixels

const K = {
  cdl: [201, 185, 143] as RGB,
  pc10: [90, 82, 54] as RGB,
  turquoise: [106, 154, 138] as RGB,
  streakOlive: [70, 82, 50] as RGB,
  lozUpper: [[63, 86, 112], [79, 106, 72], [106, 77, 95], [138, 123, 74], [107, 111, 122]] as RGB[],
  lozLower: [[154, 167, 184], [183, 176, 138], [201, 169, 164], [159, 184, 144], [185, 194, 201]] as RGB[],
  ply: [165, 131, 79] as RGB,
  olive: [107, 114, 72] as RGB,
  mauve: [122, 107, 124] as RGB,
  fr: [[191, 174, 122], [127, 143, 90], [79, 95, 63], [126, 90, 58], [43, 43, 43]] as RGB[],
  darkEarth: [108, 91, 63] as RGB,
  darkGreen: [61, 74, 52] as RGB,
  sky: [180, 191, 160] as RGB,
  codeGrey: [176, 182, 178] as RGB,
  rlm71: [60, 74, 61] as RGB,
  rlm02: [127, 138, 106] as RGB,
  rlm65: [143, 164, 179] as RGB,
  rlmYellow: [216, 183, 58] as RGB,
  rlm81: [91, 79, 67] as RGB,
  rlm82: [90, 107, 62] as RGB,
  rlm76: [159, 176, 182] as RGB,
  od: [92, 90, 60] as RGB,
  odFade: [116, 112, 78] as RGB,
  neutralGrey: [139, 143, 140] as RGB,
  alu: [200, 204, 208] as RGB,
  seaBlue: [43, 62, 85] as RGB,
  midBlue: [94, 119, 145] as RGB,
  navyWhite: [220, 223, 224] as RGB,
  amt4: [76, 107, 63] as RGB,
  amt7: [126, 161, 184] as RGB,
};

function fillRect(c: Canvas, r: Rect, col: RGB): void {
  c.ctx.fillStyle = css(col);
  c.ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
}

function clipped(c: Canvas, r: Rect, fn: () => void): void {
  const { ctx } = c;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
  ctx.clip();
  fn();
  ctx.restore();
}

/** One wobbly organic blob. */
function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  const n = 12;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.65 + rnd() * 0.7;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(p[0], p[1], mx, my);
  }
  const p = pts[0], q = pts[1];
  ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  ctx.closePath();
}

/** Disruptive camouflage: large soft-edged patches of `col` over whatever is underneath. */
function blobs(c: Canvas, r: Rect, col: RGB, n: number, size: number, alpha = 1): void {
  clipped(c, r, () => {
    const w = r[2] - r[0], h = r[3] - r[1];
    c.ctx.fillStyle = css(col, alpha);
    for (let i = 0; i < n; i++) {
      blobPath(c.ctx, r[0] + rnd() * w, r[1] + rnd() * h, w * size * (0.6 + rnd() * 0.8), h * size * (0.6 + rnd() * 0.8));
      c.ctx.fill();
    }
  });
}

/** Angular splinter pattern (Luftwaffe RLM 70/71 style). */
function splinter(c: Canvas, r: Rect, cols: RGB[]): void {
  clipped(c, r, () => {
    const w = r[2] - r[0], h = r[3] - r[1];
    fillRect(c, r, cols[0]);
    c.ctx.fillStyle = css(cols[1]);
    for (let i = 0; i < 9; i++) {
      const x = r[0] + rnd() * w, y = r[1] + rnd() * h;
      c.ctx.beginPath();
      c.ctx.moveTo(x, y);
      c.ctx.lineTo(x + (rnd() - 0.3) * w * 0.9, y + (rnd() - 0.5) * h * 0.25);
      c.ctx.lineTo(x + (rnd() - 0.5) * w * 0.7, y + (rnd() + 0.2) * h * 0.5);
      c.ctx.lineTo(x + (rnd() - 0.7) * w * 0.6, y + (rnd() - 0.2) * h * 0.4);
      c.ctx.closePath();
      c.ctx.fill();
    }
  });
}

/** Printed lozenge fabric: staggered rows of hexagons in the given palette. */
function lozenge(c: Canvas, r: Rect, cols: RGB[], size: number): void {
  clipped(c, r, () => {
    const dx = size * 1.5, dy = size * 0.87;
    for (let row = -1, y = r[1]; y < r[3] + size; y += dy, row++) {
      for (let x = r[0] - size + (row % 2 ? dx * 0.5 : 0); x < r[2] + size; x += dx) {
        c.ctx.fillStyle = css(cols[Math.floor(rnd() * cols.length)]);
        c.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          c.ctx.lineTo(x + Math.cos(a) * size * 0.58, y + Math.sin(a) * size * 0.58);
        }
        c.ctx.closePath();
        c.ctx.fill();
      }
    }
  });
}

/** Brush-streaked dope (Fokker style): long diagonal strokes over the base. */
function streaks(c: Canvas, r: Rect, col: RGB, n: number, along: 'x' | 'y'): void {
  clipped(c, r, () => {
    const w = r[2] - r[0], h = r[3] - r[1];
    c.ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      c.ctx.strokeStyle = css(col, 0.35 + rnd() * 0.4);
      c.ctx.lineWidth = 2 + rnd() * 5;
      const x = r[0] + rnd() * w, y = r[1] + rnd() * h;
      const len = (along === 'x' ? w : h) * (0.08 + rnd() * 0.2);
      const tilt = (rnd() - 0.5) * 0.5;
      c.ctx.beginPath();
      c.ctx.moveTo(x, y);
      if (along === 'x') c.ctx.lineTo(x + len, y + len * tilt);
      else c.ctx.lineTo(x + len * tilt, y + len);
      c.ctx.stroke();
    }
  });
}

/** Varnished plywood: warm base with long grain lines and panel tone shifts. */
function woodgrain(c: Canvas, r: Rect, base: RGB): void {
  fillRect(c, r, base);
  clipped(c, r, () => {
    const w = r[2] - r[0], h = r[3] - r[1];
    for (let i = 0; i < 5; i++) {
      c.ctx.fillStyle = css(shade(base, 0.9 + rnd() * 0.2), 0.5);
      c.ctx.fillRect(r[0], r[1] + (i / 5) * h, w, h / 5);
    }
    for (let i = 0; i < 90; i++) {
      c.ctx.strokeStyle = css(shade(base, 0.6 + rnd() * 0.3), 0.18 + rnd() * 0.2);
      c.ctx.lineWidth = 1 + rnd() * 1.5;
      const x = r[0] + rnd() * w;
      c.ctx.beginPath();
      c.ctx.moveTo(x, r[1]);
      c.ctx.bezierCurveTo(x + (rnd() - 0.5) * 12, r[1] + h * 0.33, x + (rnd() - 0.5) * 12, r[1] + h * 0.66, x + (rnd() - 0.5) * 8, r[3]);
      c.ctx.stroke();
    }
  });
}

/** Alternating bands along the canvas y axis (fuselage length / wing span). */
function bandsY(c: Canvas, r: Rect, cols: RGB[], n: number): void {
  const h = (r[3] - r[1]) / n;
  for (let i = 0; i < n; i++) fillRect(c, [r[0], r[1] + i * h, r[2], r[1] + (i + 1) * h], cols[i % cols.length]);
}

/** Natural metal with per-panel tone differences. */
function bareMetal(c: Canvas, r: Rect): void {
  fillRect(c, r, K.alu);
  clipped(c, r, () => {
    const w = r[2] - r[0], h = r[3] - r[1];
    for (let i = 0; i < 26; i++) {
      c.ctx.fillStyle = css(shade(K.alu, 0.9 + rnd() * 0.18), 0.6);
      c.ctx.fillRect(r[0] + rnd() * w, r[1] + rnd() * h, w * (0.1 + rnd() * 0.25), h * (0.05 + rnd() * 0.15));
    }
  });
}

/**
 * Text on a fuselage flank, sized in world units. The body canvas runs
 * nose→tail along y and around the hull along x, so letters are laid down
 * with a custom basis (mirrored per side so both read the right way round).
 */
function flankText(c: Canvas, o: SkinOpts, text: string, v: number, heightUnits: number, col: RGB, outline?: RGB): void {
  const { ctx, W, H } = c;
  const kx = W / o.bodyPerimeter; // px per unit around
  const ky = H / o.bodyLength;    // px per unit along
  const s = heightUnits / 50;     // font drawn at 50px
  for (const side of [1, -1] as const) {
    const cx = side > 0 ? W * 0.25 : W * 0.75;
    const cy = H * (1 - v);
    ctx.save();
    ctx.setTransform(0, side * ky * s, side * kx * s, 0, cx, cy);
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (outline) {
      ctx.lineWidth = 8;
      ctx.strokeStyle = css(outline);
      ctx.strokeText(text, 0, 0);
    }
    ctx.fillStyle = css(col);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}

/** Paint the photoreal scheme for one skin; returns false when the plain base colour should be used. */
function paintLivery(c: Canvas, part: 'wing' | 'body' | 'fin', o: SkinOpts): boolean {
  const L = o.livery;
  if (!L || L === 'interwar') return false;
  const { W, H } = c;
  const all: Rect = [0, 0, W, H];
  // Wing halves: upper surface on the left of the canvas, underside on the right.
  const upper: Rect = [0, 0, W / 2, H];
  const lower: Rect = [W / 2, 0, W, H];
  // Fuselage bands: the seam at x = 0 is the spine, x = W/2 the keel.
  const topL: Rect = [0, 0, W * 0.2, H];
  const topR: Rect = [W * 0.8, 0, W, H];
  const upperL: Rect = [0, 0, W * 0.4, H];
  const upperR: Rect = [W * 0.6, 0, W, H];
  const belly: Rect = [W * 0.4, 0, W * 0.6, H];
  const flankS: Rect = [W * 0.15, 0, W * 0.4, H];
  const flankP: Rect = [W * 0.6, 0, W * 0.85, H];
  const vy = (v: number) => H * (1 - v);

  const upperCamo = (paint: (r: Rect) => void, under: RGB) => {
    if (part === 'wing') { paint(upper); fillRect(c, lower, under); }
    else if (part === 'body') { fillRect(c, belly, under); paint(upperL); paint(upperR); }
    else paint(all);
  };

  switch (L) {
    case 'linen':
      fillRect(c, all, K.cdl);
      return true;
    case 'pc10':
      upperCamo((r) => fillRect(c, r, K.pc10), K.cdl);
      return true;
    case 'streak':
      fillRect(c, all, K.turquoise);
      upperCamo((r) => streaks(c, r, K.streakOlive, part === 'body' ? 260 : 220, part === 'wing' ? 'x' : 'y'), K.turquoise);
      return true;
    case 'lozenge':
      upperCamo((r) => lozenge(c, r, K.lozUpper, W / 16), K.cdl);
      if (part === 'wing') lozenge(c, lower, K.lozLower, W / 16);
      if (part === 'body') lozenge(c, belly, K.lozLower, W / 16);
      return true;
    case 'wood':
      if (part === 'wing') {
        fillRect(c, upper, K.olive);
        blobs(c, upper, K.mauve, 5, 0.28);
        fillRect(c, lower, K.cdl);
      } else {
        woodgrain(c, all, K.ply);
      }
      return true;
    case 'french':
      upperCamo((r) => {
        fillRect(c, r, K.fr[0]);
        blobs(c, r, K.fr[1], 5, 0.26);
        blobs(c, r, K.fr[2], 4, 0.24);
        blobs(c, r, K.fr[3], 4, 0.2);
        blobs(c, r, K.fr[4], 2, 0.14);
      }, K.cdl);
      return true;
    case 'raf':
      upperCamo((r) => {
        fillRect(c, r, K.darkEarth);
        blobs(c, r, K.darkGreen, 6, 0.3);
      }, K.sky);
      if (part === 'body') {
        fillRect(c, [0, vy(0.9), W, vy(0.85)], K.sky); // Sky tail band
        flankText(c, o, 'QV', o.sideMarkV - 0.13, 0.42, K.codeGrey);
        flankText(c, o, 'K', o.sideMarkV + 0.11, 0.42, K.codeGrey);
      }
      return true;
    case 'splinter':
      if (part === 'wing') {
        splinter(c, upper, [K.rlm71, K.rlm02]);
        fillRect(c, lower, K.rlm65);
      } else if (part === 'body') {
        fillRect(c, all, K.rlm65);
        splinter(c, topL, [K.rlm71, K.rlm02]);
        splinter(c, topR, [K.rlm71, K.rlm02]);
        blobs(c, flankS, K.rlm71, 140, 0.03, 0.55);
        blobs(c, flankP, K.rlm71, 140, 0.03, 0.55);
        blobs(c, flankS, K.rlm02, 90, 0.03, 0.5);
        blobs(c, flankP, K.rlm02, 90, 0.03, 0.5);
        fillRect(c, [0, vy(0.13), W, vy(0.01)], K.rlmYellow); // yellow nose
        flankText(c, o, '7', o.sideMarkV - 0.14, 0.5, [24, 24, 26], [232, 228, 218]);
      } else {
        fillRect(c, all, K.rlm65);
        blobs(c, all, K.rlm71, 60, 0.05, 0.5);
        // Yellow rudder aft of the hinge line.
        fillRect(c, [0, 0, W * 0.5 * (1 - o.finHinge), H], K.rlmYellow);
        fillRect(c, [W * (0.5 + 0.5 * o.finHinge), 0, W, H], K.rlmYellow);
      }
      return true;
    case 'rlmlate':
      upperCamo((r) => {
        fillRect(c, r, K.rlm82);
        blobs(c, r, K.rlm81, 6, 0.3);
      }, K.rlm76);
      if (part !== 'wing') {
        const fl: Rect[] = part === 'body' ? [flankS, flankP] : [all];
        for (const r of fl) { blobs(c, r, K.rlm81, 50, 0.06, 0.5); blobs(c, r, K.rlm82, 40, 0.06, 0.45); }
      }
      return true;
    case 'olive':
      upperCamo((r) => {
        fillRect(c, r, K.od);
        blobs(c, r, K.odFade, 7, 0.22, 0.7);
      }, K.neutralGrey);
      return true;
    case 'metal':
      bareMetal(c, all);
      if (part === 'wing') bandsY(c, [0, vy(0.62), W, vy(0.26)], [K.navyWhite, [28, 28, 30]], 5);
      if (part === 'body') bandsY(c, [0, vy(0.8), W, vy(0.6)], [K.navyWhite, [28, 28, 30]], 5);
      return true;
    case 'navy':
      if (part === 'wing') { fillRect(c, upper, K.seaBlue); fillRect(c, lower, K.navyWhite); }
      else if (part === 'body') {
        fillRect(c, all, K.midBlue);
        fillRect(c, topL, K.seaBlue); fillRect(c, topR, K.seaBlue);
        fillRect(c, belly, K.navyWhite);
      } else { fillRect(c, all, K.seaBlue); blobs(c, all, K.midBlue, 3, 0.4, 0.6); }
      return true;
    case 'soviet':
      upperCamo((r) => fillRect(c, r, K.amt4), K.amt7);
      if (part === 'body') flankText(c, o, '9', o.sideMarkV - 0.14, 0.5, [232, 228, 218]);
      return true;
    case 'enemy': {
      const base = rgb(part === 'wing' ? o.wing : o.body);
      fillRect(c, all, base);
      upperCamo((r) => streaks(c, r, shade(rgb(o.body), 0.55), part === 'body' ? 200 : 180, part === 'wing' ? 'x' : 'y'), base);
      return true;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------- skin painters

function wingSkin(o: SkinOpts, marked: boolean): Canvas {
  const W = o.tier === 'photoreal' ? 1024 : 512;
  const H = W / 2;
  const c = makeCanvas(W, H, o.tier, o.metal ? 0.35 : o.fabric ? 0.7 : 0.5, o.metal ? 1 : 0);
  paintPart(c, 'wing', o);
  if (o.fabric) {
    // Rib tapes run chordwise: horizontal on this canvas (u = chord, v = span).
    ribs(c, H * (0.38 / o.wingHalfSpan), true, 0.02, 0.97);
    // Slightly darker doped fabric right at the trailing edge and tip.
    c.ctx.fillStyle = 'rgba(0,0,0,0.08)';
    c.ctx.fillRect(0, 0, W * 0.04, H);
    c.ctx.fillRect(W * 0.96, 0, W * 0.04, H);
  } else {
    panels(c, [0.14, 0.3, 0.42, 0.62, 0.78], [0.22, 0.45, 0.68, 0.86], o.tier === 'photoreal');
  }
  if (marked) {
    const r = Math.min(o.wingChord * 0.34, o.wingHalfSpan * 0.16);
    const rx = W * 0.5 * (r / o.wingChord);
    const ry = H * (r / o.wingHalfSpan);
    const cy = H * (1 - 0.68); // 68% out along the half-span
    insignia(c, o.nation, o.era, W * 0.25, cy, rx, ry); // upper surface
    insignia(c, o.nation, o.era, W * 0.75, cy, rx, ry); // lower surface
  }
  if (o.tier === 'photoreal') {
    // Boot-scuffed walkway at the root, chipped leading edge, oil under the wing.
    c.ctx.fillStyle = 'rgba(0,0,0,0.12)';
    c.ctx.fillRect(W * 0.05, H * 0.86, W * 0.4, H * 0.14);
    chips(c, W * 0.5, H * 0.05, W * 0.5, H * 0.98, 60);
    for (let i = 0; i < 5; i++) soot(c, W * 0.5, H * (0.05 + rnd() * 0.9), W * 0.45, 3 + rnd() * 6, 1, 0.22);
  }
  return c;
}

function bodySkin(o: SkinOpts): Canvas {
  const W = o.tier === 'photoreal' ? 512 : 256;
  const H = W * 2;
  const c = makeCanvas(W, H, o.tier, o.metal ? 0.35 : o.fabric ? 0.66 : 0.48, o.metal ? 1 : 0);
  paintPart(c, 'body', o);
  const vy = (v: number) => H * (1 - v); // fuselage v runs nose -> tail, canvas rows run top -> bottom
  if (o.fabric) {
    // Stringers along the length, formers across.
    ribs(c, W * 0.1, false, 0.03, 0.97);
    ribs(c, H * (0.55 / o.bodyLength), true, 0.05, 0.95);
  } else {
    panels(c, [0.25, 0.5, 0.75], [0.12, 0.2, 0.3, 0.42, 0.55, 0.7, 0.84], o.tier === 'photoreal');
    // Anti-glare panel ahead of the windscreen.
    c.ctx.fillStyle = 'rgba(28,30,26,0.9)';
    c.ctx.fillRect(0, vy(o.cockpitV), W * 0.09, vy(0) - vy(o.cockpitV));
    c.ctx.fillRect(W * 0.91, vy(o.cockpitV), W * 0.09, vy(0) - vy(o.cockpitV));
  }
  // Side insignia on both flanks.
  const r = Math.min(o.bodyPerimeter * 0.12, o.bodyLength * 0.07);
  const rx = W * (r / o.bodyPerimeter);
  const ry = H * (r / o.bodyLength);
  insignia(c, o.nation, o.era, W * 0.25, vy(o.sideMarkV), rx, ry);
  insignia(c, o.nation, o.era, W * 0.75, vy(o.sideMarkV), rx, ry);
  if (o.mouth) {
    // Shark mouth around the chin: white jaw, red gums, teeth.
    const y0 = vy(0.02), y1 = vy(0.26);
    for (const [ux, dir] of [[0.25, 1], [0.75, -1]] as const) {
      const x = ux * W;
      c.ctx.fillStyle = css(RED);
      c.ctx.beginPath();
      c.ctx.moveTo(x - dir * W * 0.02, y0);
      c.ctx.quadraticCurveTo(x + dir * W * 0.16, (y0 + y1) / 2, x - dir * W * 0.02, y1);
      c.ctx.closePath();
      c.ctx.fill();
      c.ctx.fillStyle = css(WHITE);
      for (let i = 0; i < 7; i++) {
        const ty = y0 + ((y1 - y0) * (i + 0.5)) / 7;
        c.ctx.beginPath();
        c.ctx.moveTo(x - dir * W * 0.005, ty - 8);
        c.ctx.lineTo(x + dir * W * (0.11 - Math.abs(i - 3) * 0.02), ty);
        c.ctx.lineTo(x - dir * W * 0.005, ty + 8);
        c.ctx.closePath();
        c.ctx.fill();
      }
      c.ctx.fillStyle = css(WHITE);
      c.ctx.beginPath();
      c.ctx.ellipse(x + dir * W * 0.1, vy(0.3), W * 0.035, H * 0.02, 0, 0, Math.PI * 2);
      c.ctx.fill();
      c.ctx.fillStyle = css(BLACK);
      c.ctx.beginPath();
      c.ctx.ellipse(x + dir * W * 0.1, vy(0.3), W * 0.016, H * 0.011, 0, 0, Math.PI * 2);
      c.ctx.fill();
    }
  }
  if (o.tier === 'photoreal') {
    if (o.exhaustV != null) {
      // Exhaust staining streams aft from the stacks on both sides.
      for (const ux of [0.14, 0.86]) {
        const ctx = c.ctx;
        const g = ctx.createLinearGradient(0, vy(o.exhaustV), 0, vy(o.exhaustV + 0.35));
        g.addColorStop(0, 'rgba(25,22,18,0.7)');
        g.addColorStop(1, 'rgba(25,22,18,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ux * W - W * 0.02, vy(o.exhaustV));
        ctx.lineTo(ux * W + W * 0.02, vy(o.exhaustV));
        ctx.lineTo(ux * W + W * 0.07, vy(o.exhaustV + 0.35));
        ctx.lineTo(ux * W - W * 0.07, vy(o.exhaustV + 0.35));
        ctx.closePath();
        ctx.fill();
      }
    }
    // Grime along the belly and chipping around the cockpit sill.
    c.ctx.fillStyle = 'rgba(0,0,0,0.16)';
    c.ctx.fillRect(W * 0.42, 0, W * 0.16, H);
    chips(c, W * 0.03, vy(o.cockpitV), W * 0.03, vy(o.cockpitV + 0.12), 20);
    chips(c, W * 0.97, vy(o.cockpitV), W * 0.97, vy(o.cockpitV + 0.12), 20);
  }
  return c;
}

function finSkin(o: SkinOpts): Canvas {
  const W = o.tier === 'photoreal' ? 512 : 256;
  const H = W;
  const c = makeCanvas(W, H, o.tier, o.fabric ? 0.7 : 0.5, o.metal ? 1 : 0);
  paintPart(c, 'fin', o);
  if (o.fabric) ribs(c, H * (0.3 / o.finHeight), true, 0.02, 0.98);
  // u: 0..0.5 starboard (TE -> LE), 0.5..1 port (LE -> TE); x = chord fraction.
  const band = (x0: number, x1: number, col: RGB, v0 = 0.02, v1 = 0.98) => {
    c.ctx.fillStyle = css(col);
    const y = H * (1 - v1), h = H * (v1 - v0);
    c.ctx.fillRect(W * 0.5 * (1 - x1), y, W * 0.5 * (x1 - x0), h);
    c.ctx.fillRect(W * (0.5 + 0.5 * x0), y, W * 0.5 * (x1 - x0), h);
  };
  const hz = o.finHinge;
  if (o.nation === 'uk' && o.era === 'ww2') {
    band(0.12, 0.26, RED); band(0.26, 0.4, WHITE); band(0.4, 0.54, NAVY);
  } else if (o.nation === 'uk' || o.nation === 'fr') {
    const w = (1 - hz) / 3;
    band(hz, hz + w, NAVY); band(hz + w, hz + 2 * w, WHITE); band(hz + 2 * w, 1, RED);
  } else if (o.nation === 'us' && o.era === 'ww1') {
    band(hz, hz + 0.12, NAVY);
    for (let i = 0; i < 13; i++) {
      band(hz + 0.12, 1, i % 2 ? WHITE : RED, 0.02 + (i * 0.96) / 13, 0.02 + ((i + 1) * 0.96) / 13);
    }
  } else if (o.nation === 'ussr') {
    redStar(c, W * 0.25, H * 0.5, W * 0.1, H * 0.2);
    redStar(c, W * 0.75, H * 0.5, W * 0.1, H * 0.2);
  } else if (o.nation === 'de' && o.era === 'ww1') {
    cross(c, W * 0.5 * (1 - (hz + 1) / 2), H * 0.5, W * 0.11, H * 0.22, 'ww1');
    cross(c, W * (0.5 + 0.5 * ((hz + 1) / 2)), H * 0.5, W * 0.11, H * 0.22, 'ww1');
  }
  return c;
}

function standard(c: Canvas, o: SkinOpts, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.Material {
  const params: THREE.MeshStandardMaterialParameters = {
    map: tex(c.el),
    roughness: o.metal ? 0.38 : o.fabric ? 0.8 : 0.62,
    metalness: o.metal ? 0.85 : 0.05,
    ...extra,
  };
  if (c.h) {
    params.normalMap = tex(normalFromHeight(c.h, c.W, c.H, 2.2), false);
    params.normalScale = new THREE.Vector2(0.9, 0.9);
  }
  if (c.r) {
    const rm = tex(c.r.canvas, false);
    params.roughnessMap = rm;
    params.metalnessMap = rm;
    params.roughness = 1;
    params.metalness = 1;
  }
  if (o.tier === 'photoreal' || o.metal) {
    params.envMap = environment();
    params.envMapIntensity = o.metal ? 1.1 : 0.45;
  }
  return new THREE.MeshStandardMaterial(params);
}

// ---------------------------------------------------------------- environment

let envTex: THREE.Texture | null = null;

/** A painted sky/ground equirect used for reflections on canopies and bare metal. */
export function environment(): THREE.Texture {
  if (envTex) return envTex;
  const W = 512, H = 256;
  const el = document.createElement('canvas');
  el.width = W; el.height = H;
  const ctx = el.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#3b78bb');
  g.addColorStop(0.45, '#a9c9e2');
  g.addColorStop(0.5, '#d9e4ec');
  g.addColorStop(0.52, '#7a955a');
  g.addColorStop(1, '#3d5230');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const sun = ctx.createRadialGradient(W * 0.3, H * 0.22, 0, W * 0.3, H * 0.22, 60);
  sun.addColorStop(0, 'rgba(255,250,235,1)');
  sun.addColorStop(0.2, 'rgba(255,245,220,0.8)');
  sun.addColorStop(1, 'rgba(255,245,220,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  envTex = new THREE.CanvasTexture(el);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  return envTex;
}

// ---------------------------------------------------------------- shared accessories

let shared: Partial<Record<string, THREE.Material>> = {};
let discTex: THREE.Texture | null = null;

function sharedMat(key: string, make: () => THREE.Material): THREE.Material {
  let m = shared[key];
  if (!m) {
    m = make();
    m.userData.shared = true;
    shared[key] = m;
  }
  return m;
}

function discTexture(): THREE.Texture {
  const S = 256;
  const el = document.createElement('canvas');
  el.width = S; el.height = S;
  const ctx = el.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(60,52,42,0)');
  g.addColorStop(0.25, 'rgba(60,52,42,0.25)');
  g.addColorStop(0.7, 'rgba(70,62,52,0.45)');
  g.addColorStop(0.92, 'rgba(120,110,90,0.55)');
  g.addColorStop(1, 'rgba(120,110,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(el);
}

function flashTexture(): THREE.Texture {
  const S = 128;
  const el = document.createElement('canvas');
  el.width = S; el.height = S;
  const ctx = el.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,230,1)');
  g.addColorStop(0.3, 'rgba(255,200,90,0.9)');
  g.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(el);
}

// ---------------------------------------------------------------- public API

const cache = new Map<string, SkinSet>();
const MAX_CACHED = 12;
let caching = true;

/** Thumbnail rendering builds every airframe once; skip the cache so they can be freed. */
export function setSkinCaching(on: boolean): void {
  caching = on;
}

export function getSkins(o: SkinOpts): SkinSet {
  const key = JSON.stringify(o);
  const hit = cache.get(key);
  if (hit) return hit;
  seed = 7 + (o.body % 1000) + (o.wing % 977);
  const glass = o.tier === 'photoreal'
    ? new THREE.MeshPhysicalMaterial({
      color: 0x9fc5e0, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0,
      envMap: environment(), envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide,
    })
    : new THREE.MeshStandardMaterial({
      color: 0x8fb8d8, transparent: true, opacity: 0.5, roughness: 0.12, metalness: 0.1, depthWrite: false,
      envMap: environment(), envMapIntensity: 0.8,
    });
  const plain = (color: number, roughness: number, metalness = 0.05) =>
    new THREE.MeshStandardMaterial({
      color, roughness, metalness,
      ...(o.tier === 'photoreal' || metalness > 0.5 ? { envMap: environment(), envMapIntensity: metalness > 0.5 ? 1 : 0.35 } : {}),
    });
  const set: SkinSet = {
    body: standard(bodySkin(o), o),
    wing: standard(wingSkin(o, true), o),
    wingPlain: standard(wingSkin(o, false), o),
    fin: standard(finSkin(o), o),
    bodySolid: plain(o.body, o.metal ? 0.4 : 0.7, o.metal ? 0.8 : 0.05),
    wingSolid: plain(o.wing, o.metal ? 0.4 : 0.7, o.metal ? 0.8 : 0.05),
    detail: plain(o.detail, 0.6),
    dark: sharedMat('dark' + o.tier, () => plain(0x2b3238, 0.5, 0.6)),
    gun: sharedMat('gun' + o.tier, () => plain(0x1d2024, 0.45, 0.8)),
    rubber: sharedMat('rubber' + o.tier, () => plain(0x232527, 0.95, 0)),
    wood: sharedMat('wood' + o.tier, () => plain(0x5a4630, 0.65, 0)),
    glass,
    skin: sharedMat('skin', () => plain(0xd9a882, 0.8)),
    leather: sharedMat('leather', () => plain(0x5b3d28, 0.75)),
    uniform: sharedMat('uniform', () => plain(0x4c4a3f, 0.9)),
    flame: sharedMat('flame', () => new THREE.MeshBasicMaterial({
      color: 0xff9a40, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    })),
    flash: sharedMat('flash', () => new THREE.MeshBasicMaterial({
      map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })),
    disc: new THREE.MeshBasicMaterial({
      map: (discTex ??= discTexture()),
      transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    }),
    jetGlow: sharedMat('jetGlow', () => new THREE.MeshBasicMaterial({ color: 0xe8863d })),
  };
  if (caching) {
    cache.set(key, set);
    // Bound GPU memory: evict the oldest sets (a live model simply re-uploads its textures).
    while (cache.size > MAX_CACHED) {
      const oldest = cache.keys().next().value as string;
      const gone = cache.get(oldest);
      cache.delete(oldest);
      if (gone) disposeSkins(gone);
    }
  }
  return set;
}

/** Free textures for a skin set that is not cached (thumbnail builds). */
export function disposeSkins(set: SkinSet): void {
  for (const m of [set.body, set.wing, set.wingPlain, set.fin]) {
    const s = m as THREE.MeshStandardMaterial;
    s.map?.dispose();
    s.normalMap?.dispose();
    s.roughnessMap?.dispose();
    m.dispose();
  }
  set.bodySolid.dispose();
  set.wingSolid.dispose();
  set.detail.dispose();
  set.glass.dispose();
  set.disc.dispose();
}

/** Drop every cached skin (used when the model style changes). */
export function clearSkinCache(): void {
  for (const set of cache.values()) disposeSkins(set);
  cache.clear();
  shared = {};
}
