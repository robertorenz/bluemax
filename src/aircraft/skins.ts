import * as THREE from 'three';
import type { Nation } from './types';

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

function base(c: Canvas, color: RGB, tier: Tier): void {
  const { ctx, W, H } = c;
  ctx.fillStyle = css(color);
  ctx.fillRect(0, 0, W, H);
  if (tier !== 'photoreal') return;
  // Mottled, sun-faded paint: overlapping soft blobs a few percent lighter and darker.
  for (let i = 0; i < 140; i++) {
    const f = 0.9 + rnd() * 0.2;
    ctx.fillStyle = css(shade(color, f), 0.14);
    ctx.beginPath();
    ctx.ellipse(rnd() * W, rnd() * H, 20 + rnd() * 90, 12 + rnd() * 60, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fine grain.
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
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
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (const x of xs) ctx.fillRect(x * W, 0, 1.5, H);
  for (const y of ys) ctx.fillRect(0, y * H, W, 1.5);
  if (c.h) {
    c.h.fillStyle = '#5a5a5a';
    for (const x of xs) c.h.fillRect(x * W - 1, 0, 3, H);
    for (const y of ys) c.h.fillRect(0, y * H - 1, W, 3);
  }
  if (!rivets) return;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
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

// ---------------------------------------------------------------- skin painters

function wingSkin(o: SkinOpts, marked: boolean): Canvas {
  const W = o.tier === 'photoreal' ? 1024 : 512;
  const H = W / 2;
  const c = makeCanvas(W, H, o.tier, o.metal ? 0.38 : o.fabric ? 0.78 : 0.6, o.metal ? 1 : 0);
  base(c, rgb(o.wing), o.tier);
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
  const c = makeCanvas(W, H, o.tier, o.metal ? 0.38 : o.fabric ? 0.72 : 0.58, o.metal ? 1 : 0);
  base(c, rgb(o.body), o.tier);
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
  const c = makeCanvas(W, H, o.tier, o.fabric ? 0.78 : 0.6, o.metal ? 1 : 0);
  base(c, rgb(o.body), o.tier);
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
    params.normalScale = new THREE.Vector2(0.55, 0.55);
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
