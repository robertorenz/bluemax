import * as THREE from 'three';
import {
  airfoilRing, loft, superRing, pointRing, spline, strut, wires, mergeStatics, stat,
  type Ring,
} from './loft';
import { getSkins, type SkinSet, type Tier } from './skins';
import type { PlaneForm, PlaneModel, WingSpec } from './types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);
const Y = V(0, 1, 0);
const Z = V(0, 0, 1);

// ---------------------------------------------------------------- fuselage profiles

interface FuseKey { z: number; w: number; h: number; y: number; k?: number; kb?: number }

/** Cross-section keyframes: width, height, centreline height, corner squareness (top / bottom). */
const FUSELAGES: Record<string, FuseKey[]> = {
  box: [
    { z: -2.85, w: 0.95, h: 0.95, y: 0.92, k: 3.2 },
    { z: -2.2, w: 1.08, h: 1.05, y: 0.92, k: 3.4 },
    { z: -1.0, w: 1.1, h: 1.12, y: 0.95, k: 3.6 },
    { z: 0.2, w: 1.02, h: 1.05, y: 0.95, k: 3.4 },
    { z: 1.5, w: 0.72, h: 0.8, y: 1.0, k: 3.0 },
    { z: 2.6, w: 0.4, h: 0.55, y: 1.02, k: 2.6 },
    { z: 3.25, w: 0.1, h: 0.35, y: 1.03, k: 2.2 },
  ],
  round: [
    { z: -2.9, w: 0.7, h: 0.8, y: 0.95, k: 2 },
    { z: -2.0, w: 1.05, h: 1.15, y: 0.95, k: 2.1 },
    { z: -0.8, w: 1.1, h: 1.2, y: 0.97, k: 2.1 },
    { z: 0.6, w: 0.95, h: 1.05, y: 0.98, k: 2.1 },
    { z: 2.0, w: 0.55, h: 0.7, y: 1.0, k: 2 },
    { z: 3.0, w: 0.2, h: 0.5, y: 1.02, k: 2 },
    { z: 3.4, w: 0.05, h: 0.4, y: 1.03, k: 2 },
  ],
  slim: [
    { z: -3.05, w: 0.62, h: 0.72, y: 0.95, k: 2.1 },
    { z: -2.2, w: 0.9, h: 1.0, y: 0.95, k: 2.3 },
    { z: -0.9, w: 0.98, h: 1.1, y: 0.97, k: 2.4 },
    { z: 0.5, w: 0.9, h: 1.02, y: 0.98, k: 2.4 },
    { z: 2.0, w: 0.6, h: 0.75, y: 1.02, k: 2.2 },
    { z: 3.1, w: 0.3, h: 0.5, y: 1.05, k: 2 },
    { z: 3.6, w: 0.12, h: 0.4, y: 1.07, k: 2 },
  ],
  deep: [
    { z: -3.0, w: 0.75, h: 0.9, y: 0.9, k: 2.3 },
    { z: -2.1, w: 1.05, h: 1.3, y: 0.85, k: 2.6 },
    { z: -0.8, w: 1.15, h: 1.35, y: 0.9, k: 2.8 },
    { z: 0.6, w: 1.0, h: 1.15, y: 0.95, k: 2.6 },
    { z: 2.0, w: 0.62, h: 0.8, y: 1.0, k: 2.3 },
    { z: 3.1, w: 0.3, h: 0.5, y: 1.05, k: 2 },
    { z: 3.5, w: 0.1, h: 0.4, y: 1.06, k: 2 },
  ],
  stubby: [
    { z: -2.0, w: 1.15, h: 1.15, y: 0.95, k: 2 },
    { z: -1.3, w: 1.35, h: 1.32, y: 0.95, k: 2.2 },
    { z: -0.2, w: 1.3, h: 1.3, y: 0.97, k: 2.3 },
    { z: 1.0, w: 0.85, h: 0.95, y: 1.0, k: 2.2 },
    { z: 2.0, w: 0.4, h: 0.55, y: 1.03, k: 2 },
    { z: 2.5, w: 0.1, h: 0.4, y: 1.05, k: 2 },
  ],
  tbf: [
    { z: -3.1, w: 1.4, h: 1.4, y: 1.1, k: 2 },
    { z: -2.0, w: 1.55, h: 1.7, y: 1.12, k: 2.3 },
    { z: -0.5, w: 1.55, h: 1.75, y: 1.15, k: 2.4 },
    { z: 1.2, w: 1.3, h: 1.5, y: 1.18, k: 2.3 },
    { z: 2.6, w: 0.8, h: 1.05, y: 1.2, k: 2.1 },
    { z: 3.6, w: 0.4, h: 0.7, y: 1.25, k: 2 },
    { z: 4.1, w: 0.12, h: 0.5, y: 1.28, k: 2 },
  ],
  me262: [
    { z: -3.9, w: 0.06, h: 0.08, y: 0.95, k: 2 },
    { z: -2.8, w: 0.7, h: 0.8, y: 0.95, k: 2.2, kb: 1.5 },
    { z: -1.4, w: 1.0, h: 1.1, y: 0.97, k: 2.4, kb: 1.4 },
    { z: 0.2, w: 1.0, h: 1.1, y: 0.98, k: 2.4, kb: 1.4 },
    { z: 2.0, w: 0.7, h: 0.85, y: 1.0, k: 2.2, kb: 1.6 },
    { z: 3.4, w: 0.35, h: 0.55, y: 1.05, k: 2 },
    { z: 4.0, w: 0.12, h: 0.4, y: 1.08, k: 2 },
  ],
  bomber: [
    { z: -4.2, w: 1.2, h: 1.2, y: 1.0, k: 2 },
    { z: -3.0, w: 1.55, h: 1.5, y: 1.0, k: 2.3 },
    { z: -1.0, w: 1.6, h: 1.55, y: 1.0, k: 2.4 },
    { z: 1.5, w: 1.4, h: 1.4, y: 1.05, k: 2.3 },
    { z: 3.3, w: 0.9, h: 1.0, y: 1.1, k: 2.1 },
    { z: 4.5, w: 0.4, h: 0.6, y: 1.15, k: 2 },
    { z: 5.0, w: 0.12, h: 0.45, y: 1.18, k: 2 },
  ],
  p38pod: [
    { z: -3.3, w: 0.35, h: 0.4, y: 1.0, k: 2 },
    { z: -2.4, w: 0.95, h: 1.0, y: 1.0, k: 2.3 },
    { z: -1.2, w: 1.1, h: 1.15, y: 1.0, k: 2.4 },
    { z: 0.2, w: 1.0, h: 1.05, y: 1.0, k: 2.4 },
    { z: 1.2, w: 0.5, h: 0.5, y: 0.9, k: 2 },
    { z: 1.6, w: 0.08, h: 0.1, y: 0.85, k: 2 },
  ],
  p38boom: [
    { z: -4.3, w: 0.55, h: 0.62, y: 0.95, k: 2 },
    { z: -3.2, w: 0.92, h: 1.05, y: 0.95, k: 2.3 },
    { z: -1.5, w: 0.98, h: 1.1, y: 0.95, k: 2.4 },
    { z: 0.8, w: 0.8, h: 0.9, y: 0.95, k: 2.3 },
    { z: 2.8, w: 0.55, h: 0.65, y: 0.97, k: 2.1 },
    { z: 4.4, w: 0.3, h: 0.45, y: 1.0, k: 2 },
    { z: 4.9, w: 0.1, h: 0.3, y: 1.0, k: 2 },
  ],
};

interface Fuse {
  z0: number;
  z1: number;
  length: number;
  perimeter: number;
  w: (z: number) => number;
  h: (z: number) => number;
  y: (z: number) => number;
  top: (z: number) => number;
  bottom: (z: number) => number;
  halfW: (z: number) => number;
  v: (z: number) => number;
}

function fuseFns(keys: FuseKey[]): Fuse {
  const w = spline(keys.map((k) => ({ z: k.z, v: k.w })));
  const h = spline(keys.map((k) => ({ z: k.z, v: k.h })));
  const y = spline(keys.map((k) => ({ z: k.z, v: k.y })));
  const z0 = keys[0].z, z1 = keys[keys.length - 1].z;
  let perimeter = 0;
  let best = 0;
  for (const k of keys) if (k.w * k.h > best) { best = k.w * k.h; perimeter = Math.PI * Math.sqrt((k.w * k.w + k.h * k.h) / 2); }
  return {
    z0, z1, length: z1 - z0, perimeter, w, h, y,
    top: (z) => y(z) + h(z) / 2,
    bottom: (z) => y(z) - h(z) / 2,
    halfW: (z) => w(z) / 2,
    v: (z) => THREE.MathUtils.clamp((z - z0) / (z1 - z0), 0, 1),
  };
}

/** Loft a fuselage from its keyframes; flat nose face for radiator/radial types. */
function fuselageMesh(keys: FuseKey[], f: Fuse, mat: THREE.Material, n: number, m: number, flatNose: boolean, dx = 0): THREE.Mesh {
  const k = spline(keys.map((q) => ({ z: q.z, v: q.k ?? 2.2 })));
  const kb = spline(keys.map((q) => ({ z: q.z, v: q.kb ?? q.k ?? 2.2 })));
  const rings: Ring[] = [];
  const vs: number[] = [];
  const noseCap = flatNose ? f.z0 : f.z0 - 0.02;
  rings.push(pointRing(V(dx, f.y(f.z0), noseCap), n));
  vs.push(0);
  for (let i = 0; i < m; i++) {
    const t = i / (m - 1);
    // Denser stations at the nose where the curvature is highest.
    const z = f.z0 + (f.z1 - f.z0) * (t < 0.3 ? t * 0.7 : 0.21 + (t - 0.3) * (0.79 / 0.7));
    rings.push(superRing(f.w(z), f.h(z), k(z), n, dx, f.y(z), kb(z)).map((r) => ({ p: V(r.p.x, r.p.y, z), u: r.u })));
    vs.push(f.v(z));
  }
  rings.push(pointRing(V(dx, f.y(f.z1), f.z1 + 0.04), n));
  vs.push(1);
  const mesh = new THREE.Mesh(loft(rings, vs), mat);
  return stat(mesh);
}

// ---------------------------------------------------------------- wings

interface Outline { zLE: (s: number) => number; zTE: (s: number) => number }

function outline(spec: WingSpec): Outline {
  const c0 = spec.chord;
  const b = spec.span / 2;
  const sweep = (s: number) => Math.tan(spec.sweep ?? 0) * s * b;
  const round = (s: number, s0: number) => {
    if (s <= s0) return 0;
    const f = (s - s0) / (1 - s0);
    return 1 - Math.sqrt(Math.max(0, 1 - f * f));
  };
  if (spec.planform === 'elliptical') {
    return {
      zLE: (s) => sweep(s) + c0 * 0.25 * (1 - Math.sqrt(Math.max(0, 1 - s * s))),
      zTE: (s) => sweep(s) + c0 * 0.25 + c0 * 0.75 * Math.sqrt(Math.max(0, 1 - s * s)),
    };
  }
  if (spec.planform === 'taper') {
    const t = spec.taper ?? 0.5;
    const chord = (s: number) => c0 * (1 - (1 - t) * s);
    return {
      zLE: (s) => sweep(s) + chord(s) * 0.3 * round(s, 0.93),
      zTE: (s) => sweep(s) + chord(s) - chord(s) * 0.7 * round(s, 0.93),
    };
  }
  return {
    zLE: (s) => sweep(s) + c0 * 0.42 * round(s, 0.82),
    zTE: (s) => sweep(s) + c0 - c0 * 0.58 * round(s, 0.82),
  };
}

interface WingOpts {
  side: -1 | 1;
  dihedral: number;
  thick: number;
  camber: number;
  mat: THREE.Material;
  /** Control surface: spanwise range and chord fraction, or none. */
  ctrl?: { range: [number, number]; frac: number };
  n: number;
  m: number;
  /** Root position in the plane frame (leading edge at the centreline). */
  root: THREE.Vector3;
  /** Extra spanwise offset of the root (for outer panels that start off-centre). */
  rootX?: number;
}

interface WingHalf {
  group: THREE.Group;
  ctrl?: THREE.Object3D;
  /** Surface point in the plane frame at span fraction s and chord fraction x. */
  at: (s: number, x: number, top: boolean) => THREE.Vector3;
  chordAt: (s: number) => number;
}

function halfWing(spec: WingSpec, o: WingOpts): WingHalf {
  const ol = outline(spec);
  const b = spec.span / 2;
  const chordAt = (s: number) => Math.max(0, ol.zTE(s) - ol.zLE(s));
  const group = new THREE.Group();
  group.position.copy(o.root);
  group.rotation.z = o.side * o.dihedral;
  const rx = o.rootX ?? 0;

  const station = (s: number, x0: number, x1: number) => airfoilRing({
    o: V(o.side * (rx + s * b), 0, ol.zLE(s)), c: Z, t: Y,
    chord: chordAt(s), thick: o.thick, camber: o.camber, x0, x1,
  }, o.n);

  // Station list with doubled stations at the control-surface cut-out so the step is crisp.
  const base: number[] = [];
  for (let i = 0; i < o.m; i++) base.push(Math.sin((Math.PI / 2) * (i / (o.m - 1))));
  const rings: Ring[] = [];
  const vs: number[] = [];
  const push = (s: number, x1: number) => { rings.push(station(s, 0, x1)); vs.push(s); };
  if (o.ctrl) {
    const [a, c] = o.ctrl.range;
    const cut = 1 - o.ctrl.frac;
    for (const s of base) if (s < a) push(s, 1);
    push(a, 1); push(a, cut);
    for (const s of base) if (s > a && s < c) push(s, cut);
    push(c, cut); push(c, 1);
    for (const s of base) if (s > c) push(s, 1);
  } else {
    for (const s of base) push(s, 1);
  }
  group.add(stat(new THREE.Mesh(loft(rings, vs), o.mat)));

  let ctrl: THREE.Object3D | undefined;
  if (o.ctrl) {
    const [a, c] = o.ctrl.range;
    const cut = 1 - o.ctrl.frac;
    const cr: Ring[] = [];
    const cv: number[] = [];
    for (let i = 0; i <= 4; i++) {
      const s = a + ((c - a) * i) / 4;
      cr.push(station(s, cut, 1));
      cv.push(s);
    }
    const mesh = new THREE.Mesh(loft(cr, cv), o.mat);
    mesh.castShadow = true;
    const hIn = V(o.side * (rx + a * b), 0, ol.zLE(a) + cut * chordAt(a));
    const hOut = V(o.side * (rx + c * b), 0, ol.zLE(c) + cut * chordAt(c));
    const pivot = new THREE.Group();
    pivot.position.copy(hIn);
    const dir = hOut.clone().sub(hIn).multiplyScalar(o.side).normalize();
    pivot.quaternion.setFromUnitVectors(X, dir);
    pivot.userData.base = pivot.quaternion.clone();
    group.add(pivot);
    group.add(mesh);
    group.updateMatrixWorld(true);
    pivot.attach(mesh);
    ctrl = pivot;
  }

  const at = (s: number, x: number, top: boolean): THREE.Vector3 => {
    const chord = chordAt(s);
    const yt = (o.thick / 0.2) * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const y = (o.camber * 4 * x * (1 - x) + (top ? yt : -yt)) * chord;
    return V(o.side * (rx + s * b), y, ol.zLE(s) + x * chord)
      .applyAxisAngle(Z, o.side * o.dihedral)
      .add(o.root);
  };
  return { group, ctrl, at, chordAt };
}

// ---------------------------------------------------------------- tails

/** Fin/rudder outlines: rows of [y, zLE, zHinge, zTE] relative to the tail post. */
const TAILS: Record<string, number[][]> = {
  comma: [[-0.45, 0, 0, 0.45], [0, 0, 0, 0.8], [0.4, -0.05, 0, 0.95], [0.8, -0.35, 0, 0.85], [1.1, -0.35, 0, 0.6], [1.28, -0.15, 0, 0.3]],
  fokker: [[-0.45, 0, 0, 0.45], [0, -1.1, 0, 0.8], [0.4, -0.6, 0, 0.95], [0.75, -0.25, 0, 0.85], [1.05, -0.2, 0, 0.6], [1.22, -0.05, 0, 0.3]],
  rounded: [[-0.35, -0.2, 0, 0.55], [0, -1.35, -0.1, 0.75], [0.5, -0.9, -0.05, 0.8], [1.0, -0.5, 0, 0.7], [1.4, -0.15, 0.1, 0.5], [1.65, 0.1, 0.2, 0.3]],
  square: [[-0.3, -0.1, 0, 0.55], [0, -1.3, -0.1, 0.75], [0.8, -0.85, -0.05, 0.72], [1.4, -0.55, 0, 0.65], [1.7, -0.35, 0.05, 0.55], [1.78, -0.28, 0.06, 0.5]],
  angular: [[-0.3, -0.1, 0, 0.5], [0, -1.05, -0.1, 0.7], [0.7, -0.7, -0.05, 0.7], [1.2, -0.45, 0, 0.6], [1.4, -0.35, 0.02, 0.5]],
};

interface FinBuilt { rudder: THREE.Object3D; chord: number; height: number; hinge: number }

function buildFin(
  g: THREE.Group, style: string, scale: number, post: THREE.Vector3, mat: THREE.Material, n: number,
): FinBuilt {
  const rows = TAILS[style] ?? TAILS.rounded;
  const thick = 0.075;
  const row = (r: number[]) => ({ y: r[0] * scale, zLE: r[1] * scale, zH: r[2] * scale, zTE: r[3] * scale });
  const st = (r: number[], x0: number, x1: number) => {
    const q = row(r);
    const chord = q.zTE - q.zLE;
    return airfoilRing({
      o: V(post.x, post.y + q.y, post.z + q.zLE), c: Z, t: X,
      chord, thick: Math.min(0.4, thick / Math.max(chord, 0.05)), camber: 0, x0, x1,
    }, n);
  };
  const hingeFrac = (r: number[]) => {
    const q = row(r);
    return THREE.MathUtils.clamp((q.zH - q.zLE) / Math.max(q.zTE - q.zLE, 1e-3), 0, 1);
  };
  const finRows = rows.filter((r) => row(r).zH - row(r).zLE > 0.05);
  if (finRows.length >= 2) {
    const rings = finRows.map((r) => st(r, 0, hingeFrac(r)));
    const vs = finRows.map((r) => (row(r).y - row(rows[0]).y) / (row(rows[rows.length - 1]).y - row(rows[0]).y));
    // Close the top with a point so the fin has a cap.
    const top = row(finRows[finRows.length - 1]);
    rings.push(pointRing(V(post.x, post.y + top.y + 0.03, post.z + (top.zLE + top.zH) / 2), rings[0].length - 1));
    vs.push(1);
    g.add(stat(new THREE.Mesh(loft(rings, vs), mat)));
  }
  const rr = rows.map((r) => st(r, hingeFrac(r), 1));
  const rv = rows.map((r) => (row(r).y - row(rows[0]).y) / (row(rows[rows.length - 1]).y - row(rows[0]).y));
  const rudderMesh = new THREE.Mesh(loft(rr, rv), mat);
  rudderMesh.castShadow = true;
  const bottom = row(rows[0]);
  const topR = row(rows[rows.length - 1]);
  const pivot = new THREE.Group();
  pivot.position.set(post.x, post.y + bottom.y, post.z + bottom.zH);
  const dir = V(0, topR.y - bottom.y, topR.zH - bottom.zH).normalize();
  pivot.quaternion.setFromUnitVectors(Y, dir);
  pivot.userData.base = pivot.quaternion.clone();
  g.add(pivot);
  g.add(rudderMesh);
  g.updateMatrixWorld(true);
  pivot.attach(rudderMesh);
  const mid = row(rows[Math.floor(rows.length / 2)]);
  return {
    rudder: pivot,
    chord: Math.max(...rows.map((r) => row(r).zTE - row(r).zLE)),
    height: topR.y - bottom.y,
    hinge: THREE.MathUtils.clamp((mid.zH - mid.zLE) / (mid.zTE - mid.zLE), 0, 1),
  };
}

// ---------------------------------------------------------------- small parts

function ringLoft(keys: { z: number; w: number; h: number; y: number }[], k: number, n: number, mat: THREE.Material, dx = 0, cap = true): THREE.Mesh {
  const rings: Ring[] = [];
  const vs: number[] = [];
  const first = keys[0], last = keys[keys.length - 1];
  if (cap) { rings.push(pointRing(V(dx, first.y, first.z), n)); vs.push(0); }
  keys.forEach((q, i) => {
    rings.push(superRing(q.w, q.h, k, n, dx, q.y).map((r) => ({ p: V(r.p.x, r.p.y, q.z), u: r.u })));
    vs.push((i + 1) / (keys.length + 1));
  });
  if (cap) { rings.push(pointRing(V(dx, last.y, last.z), n)); vs.push(1); }
  return new THREE.Mesh(loft(rings, vs), mat);
}

function cyl(r1: number, r2: number, len: number, mat: THREE.Material, seg = 12): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), mat);
}

function boxMesh(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return stat(m);
}

/** Spinner + blades + blur disc. The group spins about its local z. */
function propeller(
  g: THREE.Group, at: THREE.Vector3, r: number, blades: number, sk: SkinSet, spinnerR: number, spinnerLen: number,
): { prop: THREE.Group; disc: THREE.Mesh } {
  const prop = new THREE.Group();
  prop.position.copy(at);
  if (spinnerR > 0) {
    const rings: Ring[] = [pointRing(V(0, 0, -spinnerLen), 12)];
    const vs = [0];
    for (let i = 1; i <= 5; i++) {
      const t = i / 5;
      const rr = spinnerR * Math.pow(Math.sin((t * Math.PI) / 2), 0.7);
      rings.push(superRing(rr * 2, rr * 2, 2, 12).map((p) => ({ p: V(p.p.x, p.p.y, -spinnerLen * (1 - t)), u: p.u })));
      vs.push(t);
    }
    rings.push(pointRing(V(0, 0, 0.05), 12));
    vs.push(1);
    const spin = new THREE.Mesh(loft(rings, vs), sk.detail);
    spin.castShadow = true;
    prop.add(spin);
  } else {
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), sk.dark);
    hub.scale.z = 1.4;
    prop.add(hub);
  }
  for (let i = 0; i < blades; i++) {
    const blade = bladeMesh(r, spinnerR > 0.25 ? sk.gun : sk.wood);
    blade.position.z = -spinnerLen * 0.35;
    const holder = new THREE.Group();
    holder.rotation.z = (i * Math.PI * 2) / blades;
    holder.add(blade);
    prop.add(holder);
  }
  g.add(prop);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 1.02, 32), sk.disc.clone());
  disc.position.copy(at).add(V(0, 0, -spinnerLen * 0.35));
  g.add(disc);
  return { prop, disc };
}

/** One propeller blade along +y: tapered planform, twisted from a coarse root pitch to a fine tip. */
function bladeMesh(r: number, mat: THREE.Material): THREE.Mesh {
  const stations = [
    { t: 0.06, c: 0.075, tw: 1.15 },
    { t: 0.25, c: 0.13, tw: 0.8 },
    { t: 0.55, c: 0.135, tw: 0.55 },
    { t: 0.82, c: 0.11, tw: 0.38 },
    { t: 0.96, c: 0.06, tw: 0.32 },
    { t: 1.0, c: 0.005, tw: 0.3 },
  ];
  const rings = stations.map((s) => {
    const chord = s.c * r;
    const c = V(Math.cos(s.tw), 0, -Math.sin(s.tw));
    const t = V(Math.sin(s.tw), 0, Math.cos(s.tw));
    return airfoilRing({ o: V(0, s.t * r, 0).addScaledVector(c, -chord * 0.4), c, t, chord, thick: 0.1, camber: 0.04 }, 6);
  });
  const m = new THREE.Mesh(loft(rings), mat);
  m.castShadow = true;
  return m;
}

function radialEngine(g: THREE.Group, zFront: number, y: number, r: number, sk: SkinSet, n: number, dx = 0): void {
  const rings: Ring[] = [];
  const vs: number[] = [];
  const add = (rr: number, z: number, v: number) => {
    rings.push(superRing(rr * 2, rr * 2, 2, n, dx, y).map((p) => ({ p: V(p.p.x, p.p.y, z), u: p.u })));
    vs.push(v);
  };
  add(r * 0.7, zFront + 0.1, 0);
  add(r * 0.94, zFront, 0.1);
  add(r, zFront + 0.25, 0.3);
  add(r * 0.98, zFront + 1.0, 0.8);
  add(r * 0.88, zFront + 1.25, 1);
  g.add(stat(new THREE.Mesh(loft(rings, vs), sk.dark)));
  // Crankcase and a ring of cylinder heads visible through the cowl opening.
  const face = cyl(r * 0.36, r * 0.36, 0.2, sk.gun, 14);
  face.rotation.x = Math.PI / 2;
  face.position.set(dx, y, zFront + 0.28);
  g.add(stat(face));
  const cylinders = 9;
  for (let i = 0; i < cylinders; i++) {
    const a = (i * Math.PI * 2) / cylinders;
    const head = cyl(0.09, 0.11, r * 0.42, sk.gun, 8);
    head.position.set(dx + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, zFront + 0.32);
    head.rotation.z = a + Math.PI / 2;
    g.add(stat(head));
  }
}

function pilot(g: THREE.Group, x: number, y: number, z: number, sk: SkinSet, helmet: boolean): void {
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), sk.skin);
  head.position.set(x, y, z);
  g.add(stat(head, false));
  if (helmet) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), sk.leather);
    cap.position.set(x, y + 0.01, z);
    g.add(stat(cap, false));
    g.add(boxMesh(0.3, 0.07, 0.1, sk.gun, x, y + 0.03, z - 0.12)); // goggles
  }
  g.add(boxMesh(0.5, 0.22, 0.34, sk.uniform, x, y - 0.24, z + 0.04)); // shoulders
}

function windscreen(g: THREE.Group, x: number, y: number, z: number, w: number, h: number, sk: SkinSet): void {
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sk.glass);
  pane.position.set(x, y, z);
  pane.rotation.x = -0.55;
  g.add(stat(pane, false));
  const frame = boxMesh(w + 0.04, 0.03, 0.03, sk.dark, x, y + h * 0.42, z - h * 0.25);
  g.add(frame);
}

function wheel(g: THREE.Group, x: number, y: number, z: number, r: number, sk: SkinSet, hub = true): void {
  const tire = cyl(r, r, r * 0.55, sk.rubber, 16);
  tire.rotation.z = Math.PI / 2;
  tire.position.set(x, y, z);
  g.add(stat(tire));
  if (hub) {
    const disc = cyl(r * 0.62, r * 0.62, r * 0.6, sk.detail, 14);
    disc.rotation.z = Math.PI / 2;
    disc.position.set(x, y, z);
    g.add(stat(disc));
  }
}

function muzzleFlash(sk: SkinSet, size: number): THREE.Group {
  const m = new THREE.Group();
  for (const ry of [0, Math.PI / 2]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(size, size), sk.flash);
    q.rotation.y = ry;
    m.add(q);
  }
  m.visible = false;
  return m;
}

function flame(sk: SkinSet, x: number, y: number, z: number, len: number): THREE.Mesh {
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, len, 6), sk.flame);
  f.rotation.x = Math.PI / 2; // points aft
  f.position.set(x, y, z + len / 2);
  return f;
}

// ---------------------------------------------------------------- the builder

const tess = (tier: Tier) => (tier === 'photoreal'
  ? { n: 36, m: 30, wn: 22, wm: 12 }
  : { n: 24, m: 20, wn: 14, wm: 9 });

/**
 * Lofted, textured aircraft assembled from a PlaneForm recipe. Nose points
 * toward -z; origin at the fuselage centreline so altitude == position.y.
 */
export function makePlaneDetailed(form: PlaneForm, body: number, wing: number, detail: number, tier: Tier): PlaneModel {
  if (form.fuselage === 'p38') return makeP38(form, body, wing, detail, tier);
  if (form.fuselage === 'ho229') return makeHo229(form, body, wing, detail, tier);
  const T = tess(tier);
  const era = form.era ?? 'ww1';
  const fabric = era === 'ww1';
  const fuseKey = FUSELAGES[form.fuselage] ? form.fuselage : 'box';
  const keys = FUSELAGES[fuseKey];
  const f = fuseFns(keys);
  const g = new THREE.Group();
  const model: PlaneModel = { group: g, prop: new THREE.Object3D() };

  // Layout anchors.
  const zCockpit = ({ box: 0.1, round: 0.2, slim: 0.0, deep: 0.1, stubby: 0.2, tbf: -0.9, me262: -0.7, bomber: -2.6 } as Record<string, number>)[fuseKey] ?? 0.1;
  const wingSpecs = form.wingsDetailed ?? form.wings;
  const wingsSorted = [...wingSpecs].sort((a, b) => b.y - a.y);
  const topWing = wingsSorted[0];
  const bottomWing = wingsSorted[wingsSorted.length - 1];
  const wingThick = fabric ? 0.075 : 0.13;

  const topOutline = topWing ? outline(topWing) : null;
  const sk = getSkins({
    tier, body, wing, detail, nation: form.nation, era, fabric, metal: !!form.metal,
    wingChord: topOutline ? topOutline.zTE(0.68) - topOutline.zLE(0.68) : 2,
    wingHalfSpan: topWing ? topWing.span / 2 : 5,
    bodyLength: f.length, bodyPerimeter: f.perimeter,
    sideMarkV: f.v(zCockpit + 1.4), cockpitV: f.v(zCockpit - 0.7),
    exhaustV: form.exhaust ? f.v(f.z0 + 0.7) : undefined,
    mouth: !!form.mouth,
    finChord: 1, finHeight: 1.5, finHinge: 0.45, livery: form.livery,
  });

  // Fuselage.
  const flatNose = form.nose === 'flat' || form.nose === 'radial';
  g.add(fuselageMesh(keys, f, sk.body, T.n, T.m, flatNose));

  // Wings (top wing carries the insignia and, for biplanes, the ailerons).
  const wingHalves: THREE.Object3D[] = [];
  const built: { spec: WingSpec; L: WingHalf; R: WingHalf }[] = [];
  model.aileronsL = [];
  model.aileronsR = [];
  for (const w of wingSpecs) {
    const zc = -0.6 + (w.stagger ?? 0);
    const root = V(0, w.y, zc - w.chord / 2);
    const hasAil = w.ailerons ?? w === topWing;
    const mat = w === topWing ? sk.wing : sk.wingPlain;
    const opts = (side: -1 | 1): WingOpts => ({
      side, dihedral: w.dihedral ?? form.dihedral ?? 0.03, thick: w.thick ?? wingThick,
      camber: fabric ? 0.035 : 0.02, mat, n: T.wn, m: T.wm, root,
      ctrl: hasAil ? { range: [0.52, 0.94], frac: 0.26 } : undefined,
    });
    const L = halfWing(w, opts(-1));
    const R = halfWing(w, opts(1));
    L.group.userData.side = -1;
    R.group.userData.side = 1;
    g.add(L.group, R.group);
    wingHalves.push(L.group, R.group);
    if (L.ctrl) model.aileronsL.push(L.ctrl);
    if (R.ctrl) model.aileronsR.push(R.ctrl);
    built.push({ spec: w, L, R });
  }
  model.wingHalves = wingHalves;

  // Tail: tailplane with elevators, fin with rudder.
  const tailStyle = form.tail ?? (era === 'ww1' ? 'comma' : 'rounded');
  const finScale = form.finScale ?? 1;
  const post = V(0, f.y(f.z1), f.z1);
  const fin = buildFin(g, tailStyle, finScale, post, sk.fin, T.wn);
  model.rudders = [fin.rudder];
  const tailSpec: WingSpec = era === 'ww1'
    ? { y: post.y, span: 3.3, chord: 1.15, planform: 'rect' }
    : { y: post.y, span: 3.7, chord: 1.25, planform: 'taper', taper: 0.6 };
  if (fuseKey === 'tbf' || fuseKey === 'bomber') { tailSpec.span = 5.4; tailSpec.chord = 1.5; }
  if (fuseKey === 'me262') { tailSpec.y = post.y + 1.1; tailSpec.span = 4.2; tailSpec.sweep = 0.35; }
  const tailRoot = V(0, tailSpec.y, f.z1 - 1.0 - (tailStyle === 'comma' || tailStyle === 'fokker' ? 0.2 : 0));
  model.elevators = [];
  for (const side of [-1, 1] as const) {
    const h = halfWing(tailSpec, {
      side, dihedral: 0, thick: 0.08, camber: 0, mat: sk.wingPlain, n: T.wn, m: 7, root: tailRoot,
      ctrl: { range: [0.1, 0.9], frac: 0.42 },
    });
    g.add(h.group);
    if (h.ctrl) model.elevators.push(h.ctrl);
  }
  if (era === 'ww1' && form.struts) {
    // Tail bracing wires down to the tail skid and up to the fin post.
    const pairs: [THREE.Vector3, THREE.Vector3][] = [];
    for (const side of [-1, 1]) {
      const tip = V(side * tailSpec.span * 0.45, post.y, f.z1 - 0.55);
      pairs.push([tip, V(0, post.y + 1.0 * finScale, f.z1 - 0.2)], [tip, V(0, f.bottom(f.z1 - 0.9) - 0.15, f.z1 - 0.9)]);
    }
    g.add(wires(pairs));
  }

  // Nose and engine.
  const zN = f.z0;
  const yN = f.y(zN);
  const blades = form.blades ?? (era === 'ww1' ? 2 : 3);
  if (form.nose === 'radial') {
    const r = Math.max(f.w(zN), f.h(zN)) * 0.5 + 0.04;
    radialEngine(g, zN - 0.35, yN, r, sk, T.n);
    const p = propeller(g, V(0, yN, zN - 0.5), fuseKey === 'tbf' || fuseKey === 'bomber' ? 1.7 : 1.45, blades, sk, era === 'ww1' ? 0 : 0.2, 0.4);
    model.prop = p.prop;
    model.propDiscs = [p.disc];
  } else if (form.nose === 'spinner' || form.nose === 'chin') {
    if (fuseKey === 'me262') {
      model.prop.visible = false;
    } else {
      const p = propeller(g, V(0, yN, zN - 0.05), era === 'ww1' ? 1.4 : 1.55, blades, sk, f.h(zN) * 0.42, era === 'ww1' ? 0.45 : 0.7);
      model.prop = p.prop;
      model.propDiscs = [p.disc];
    }
    if (form.nose === 'chin') {
      g.add(stat(ringLoft([
        { z: zN + 0.15, w: 0.55, h: 0.4, y: f.bottom(zN + 0.15) - 0.1 },
        { z: zN + 0.8, w: 0.85, h: 0.7, y: f.bottom(zN + 0.8) - 0.2 },
        { z: zN + 1.7, w: 0.9, h: 0.75, y: f.bottom(zN + 1.7) - 0.18 },
        { z: zN + 2.6, w: 0.6, h: 0.3, y: f.bottom(zN + 2.6) + 0.05 },
      ], 2.4, T.n, sk.body)));
      const intake = cyl(0.3, 0.3, 0.06, sk.gun, 14);
      intake.rotation.x = Math.PI / 2;
      intake.scale.x = 1.4;
      intake.position.set(0, f.bottom(zN + 0.4) - 0.16, zN + 0.32);
      g.add(stat(intake));
    }
  } else {
    // Flat nose: car-type radiator face and a hub-mounted prop.
    g.add(boxMesh(f.w(zN) * 0.82, f.h(zN) * 0.8, 0.12, sk.gun, 0, yN, zN + 0.02));
    const p = propeller(g, V(0, yN, zN - 0.12), 1.4, blades, sk, 0.14, 0.25);
    model.prop = p.prop;
    model.propDiscs = [p.disc];
  }
  if (form.cylinders) {
    // Exposed inline cylinder heads along the top of the nose, plus the manifold.
    for (let i = 0; i < 6; i++) {
      const z = zN + 0.55 + i * 0.3;
      g.add(boxMesh(0.2, 0.24, 0.24, sk.gun, 0, f.top(z) + 0.08, z));
    }
    const pipe = cyl(0.06, 0.06, 1.9, sk.dark, 8);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(f.halfW(zN + 1.4) + 0.02, f.top(zN + 1.4) - 0.2, zN + 1.4);
    g.add(stat(pipe));
  }
  if (form.scoop) {
    g.add(stat(ringLoft([
      { z: 0.1, w: 0.4, h: 0.3, y: f.bottom(0.1) - 0.05 },
      { z: 0.8, w: 0.62, h: 0.55, y: f.bottom(0.8) - 0.22 },
      { z: 2.0, w: 0.6, h: 0.5, y: f.bottom(2.0) - 0.18 },
      { z: 2.7, w: 0.4, h: 0.2, y: f.bottom(2.7) },
    ], 2.6, T.n, sk.body)));
  }
  model.flames = [];
  if (form.exhaust) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const z = zN + 0.7 + i * 0.28;
        const x = side * (f.halfW(z) + 0.03);
        const y = f.y(z) + f.h(z) * 0.28;
        const stack = cyl(0.045, 0.045, 0.34, sk.gun, 6);
        stack.rotation.set(Math.PI / 2 - 0.6, 0, side * 0.5);
        stack.position.set(x, y, z);
        g.add(stat(stack));
        if (i === 5) {
          const fl = flame(sk, x + side * 0.08, y - 0.05, z + 0.1, 0.36);
          g.add(fl);
          model.flames.push(fl);
        }
      }
    }
  }

  // Guns and muzzle flashes.
  model.muzzles = [];
  if (form.guns) {
    for (const sx of [-0.2, 0.2]) {
      const z = zCockpit - 1.15;
      const y = f.top(z) + 0.06;
      g.add(boxMesh(0.08, 0.09, 0.95, sk.gun, sx, y, z));
      const jacket = cyl(0.05, 0.05, 0.5, sk.gun, 8);
      jacket.rotation.x = Math.PI / 2;
      jacket.position.set(sx, y, z - 0.2);
      g.add(stat(jacket));
      const mf = muzzleFlash(sk, 0.5);
      mf.position.set(sx, y, z - 0.55);
      g.add(mf);
      model.muzzles.push(mf);
    }
  } else if (topWing) {
    for (const side of [-1, 1] as const) {
      const h = side < 0 ? built[0].L : built[0].R;
      for (const s of [0.32, 0.46]) {
        const p = h.at(s, 0, true);
        const mf = muzzleFlash(sk, 0.45);
        mf.position.copy(p).add(V(0, 0, -0.1));
        g.add(mf);
        model.muzzles.push(mf);
        const barrel = cyl(0.03, 0.03, 0.35, sk.gun, 6);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.copy(p).add(V(0, -0.02, 0.05));
        g.add(stat(barrel));
      }
    }
  }

  // Cockpit.
  const zC = zCockpit;
  const topC = f.top(zC);
  if (form.canopy === 'closed' || form.canopy === 'bubble' || fuseKey === 'tbf' || fuseKey === 'bomber') {
    const long = fuseKey === 'tbf' || fuseKey === 'bomber';
    const bubble = form.canopy === 'bubble';
    const keysC = bubble
      ? [
        { z: zC - 0.85, w: 0.55, h: 0.03 }, { z: zC - 0.35, w: 0.8, h: 0.55 }, { z: zC + 0.5, w: 0.86, h: 0.62 },
        { z: zC + 1.3, w: 0.62, h: 0.38 }, { z: zC + 1.95, w: 0.2, h: 0.03 },
      ]
      : long
        ? [
          { z: zC - 0.8, w: 0.9, h: 0.03 }, { z: zC - 0.45, w: 0.95, h: 0.55 }, { z: zC + 1.2, w: 0.95, h: 0.6 },
          { z: zC + 2.4, w: 0.9, h: 0.55 }, { z: zC + 3.0, w: 0.75, h: 0.45 }, { z: zC + 3.4, w: 0.4, h: 0.03 },
        ]
        : [
          { z: zC - 0.75, w: 0.7, h: 0.03 }, { z: zC - 0.42, w: 0.78, h: 0.45 }, { z: zC + 0.45, w: 0.8, h: 0.52 },
          { z: zC + 0.95, w: 0.66, h: 0.32 }, { z: zC + 1.55, w: 0.3, h: 0.03 },
        ];
    const glassKeys = keysC.map((q) => ({ ...q, y: f.top(q.z) + q.h / 2 - 0.02 }));
    g.add(stat(ringLoft(glassKeys, bubble ? 2 : 2.6, T.n, sk.glass, 0, false), false));
    // Frames: windscreen bow and hood rails.
    const frameAt = (q: { z: number; w: number; h: number }) => {
      const band = ringLoft([
        { z: q.z - 0.025, w: q.w + 0.03, h: q.h + 0.03, y: f.top(q.z) + q.h / 2 },
        { z: q.z + 0.025, w: q.w + 0.03, h: q.h + 0.03, y: f.top(q.z) + q.h / 2 },
      ], bubble ? 2 : 2.6, T.n, sk.dark, 0, false);
      g.add(stat(band));
    };
    frameAt(keysC[1]);
    if (!bubble) frameAt(keysC[long ? 3 : 2]);
    if (long) frameAt(keysC[2]);
    pilot(g, 0, topC + 0.22, zC + 0.15, sk, false);
    if (fuseKey === 'tbf') {
      // Dorsal turret and the torpedo slung under the belly.
      const turret = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), sk.glass);
      turret.position.set(0, f.top(zC + 3.1) + 0.25, zC + 3.1);
      g.add(stat(turret, false));
      const tg = boxMesh(0.07, 0.07, 1.0, sk.gun, 0, f.top(zC + 3.1) + 0.5, zC + 3.6);
      tg.rotation.x = -0.5;
      g.add(tg);
      const torp = cyl(0.3, 0.3, 3.2, sk.dark, 12);
      torp.rotation.x = Math.PI / 2;
      torp.position.set(0, f.bottom(0) - 0.2, 0.2);
      g.add(stat(torp));
      const tn = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), sk.dark);
      tn.scale.z = 1.5;
      tn.position.set(0, f.bottom(0) - 0.2, -1.4);
      g.add(stat(tn));
    }
    if (fuseKey === 'bomber') {
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), sk.glass);
      nose.rotation.x = -Math.PI / 2;
      nose.position.set(0, f.y(f.z0), f.z0 + 0.02);
      g.add(stat(nose, false));
      const dg = boxMesh(0.07, 0.07, 1.0, sk.gun, 0, f.top(zC + 3.4) + 0.2, zC + 3.9);
      dg.rotation.x = -0.4;
      g.add(dg);
    }
  } else {
    // Open cockpit: coaming, dark interior, pilot with goggles, a small windscreen.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 20), sk.leather);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1, 1.35, 1);
    rim.position.set(0, topC + 0.02, zC + 0.1);
    g.add(stat(rim));
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), sk.gun);
    hole.rotation.x = -Math.PI / 2;
    hole.scale.y = 1.35;
    hole.position.set(0, topC + 0.015, zC + 0.1);
    g.add(stat(hole, false));
    pilot(g, 0, topC + 0.26, zC + 0.15, sk, true);
    windscreen(g, 0, topC + 0.18, zC - 0.45, 0.55, 0.3, sk);
    if (form.canopy === 'hump') {
      g.add(stat(ringLoft([
        { z: zC - 1.7, w: 0.45, h: 0.05, y: f.top(zC - 1.7) },
        { z: zC - 1.3, w: 0.6, h: 0.32, y: f.top(zC - 1.3) + 0.12 },
        { z: zC - 0.8, w: 0.62, h: 0.36, y: f.top(zC - 0.8) + 0.14 },
        { z: zC - 0.5, w: 0.5, h: 0.2, y: f.top(zC - 0.5) + 0.06 },
      ], 2.4, T.n, sk.bodySolid)));
    }
  }
  if (form.headrest) {
    const fair = [
      { z: zC + 0.45, w: 0.55, h: 0.55 }, { z: zC + 1.0, w: 0.5, h: 0.5 },
      { z: zC + 1.7, w: 0.35, h: 0.3 }, { z: zC + 2.4, w: 0.15, h: 0.05 },
    ].map((q) => ({ ...q, y: f.top(q.z) + q.h / 2 - 0.02 }));
    g.add(stat(ringLoft(fair, 2.4, T.n, sk.bodySolid, 0, false)));
  }
  if (form.gunner) {
    const zG = zC + 1.55;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 20), sk.dark);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, f.top(zG) + 0.08, zG);
    g.add(stat(ring));
    pilot(g, 0, f.top(zG) + 0.3, zG + 0.05, sk, true);
    const lewis = boxMesh(0.07, 0.07, 0.9, sk.gun, 0.25, f.top(zG) + 0.42, zG + 0.3);
    lewis.rotation.x = -0.35;
    g.add(lewis);
  }

  // Undercarriage.
  const gearZ = bottomWing ? -0.6 + (bottomWing.stagger ?? 0) - bottomWing.chord * 0.25 : -0.9;
  const gearKind = form.gear ?? 'open';
  const gearGroup = new THREE.Group();
  g.add(gearGroup);
  if (gearKind === 'retract') {
    // Wide-track oleos folding out from the wing, plus a tail wheel.
    const sx = topWing ? topWing.span * 0.16 : 1.4;
    for (const side of [-1, 1]) {
      const topPt = topWing ? (side < 0 ? built[0].L : built[0].R).at(sx / (topWing.span / 2), 0.35, false) : V(side * sx, 0.5, gearZ);
      const foot = V(side * sx, -0.32, topPt.z);
      gearGroup.add(stat(strut(topPt, foot, 0.06, sk.detail, 1)));
      gearGroup.add(boxMesh(0.06, topPt.y - foot.y, 0.42, sk.bodySolid, side * (sx + 0.14), (topPt.y + foot.y) / 2, topPt.z)); // door
      wheel(gearGroup, side * sx, -0.32, topPt.z, 0.34, sk);
    }
    const tw = V(0, f.bottom(f.z1 - 0.7), f.z1 - 0.7);
    gearGroup.add(stat(strut(tw, V(0, -0.05, f.z1 - 0.6), 0.04, sk.detail, 1)));
    wheel(gearGroup, 0, -0.05, f.z1 - 0.6, 0.15, sk, false);
    gearGroup.visible = false;
    model.gear = gearGroup;
  } else if (gearKind === 'spat') {
    for (const side of [-1, 1]) {
      const x = side * 0.95;
      gearGroup.add(stat(ringLoft([
        { z: gearZ - 0.55, w: 0.3, h: 0.5, y: 0.05 }, { z: gearZ - 0.1, w: 0.42, h: 0.85, y: 0.08 },
        { z: gearZ + 0.4, w: 0.36, h: 0.75, y: 0.12 }, { z: gearZ + 1.2, w: 0.14, h: 0.25, y: 0.3 },
      ], 2.3, 12, sk.bodySolid, x)));
      wheel(gearGroup, x, -0.25, gearZ, 0.3, sk, false);
      const top = bottomWing ? V(x, bottomWing.y - 0.1, gearZ) : V(side * 0.5, f.bottom(gearZ), gearZ);
      const leg = boxMesh(0.14, top.y - 0.35, 0.5, sk.bodySolid, x, (top.y + 0.35) / 2, gearZ);
      gearGroup.add(leg);
    }
    const tw = V(0, f.bottom(f.z1 - 0.6), f.z1 - 0.6);
    gearGroup.add(stat(strut(tw, V(0, -0.02, f.z1 - 0.5), 0.04, sk.detail, 1)));
    wheel(gearGroup, 0, -0.02, f.z1 - 0.5, 0.13, sk, false);
  } else {
    // Classic V-strut undercarriage with an axle and spreader bar, and a tail skid.
    const x = 0.82;
    const axleY = -0.24;
    for (const side of [-1, 1]) {
      const foot = V(side * x, axleY, gearZ);
      const a = V(side * f.halfW(gearZ - 0.55) * 0.9, f.bottom(gearZ - 0.55) + 0.05, gearZ - 0.55);
      const b = V(side * f.halfW(gearZ + 0.7) * 0.9, f.bottom(gearZ + 0.7) + 0.05, gearZ + 0.7);
      gearGroup.add(stat(strut(a, foot, 0.045, sk.detail)));
      gearGroup.add(stat(strut(b, foot, 0.045, sk.detail)));
      wheel(gearGroup, side * (x + 0.1), axleY, gearZ, 0.36, sk);
    }
    const axle = cyl(0.035, 0.035, x * 2 + 0.3, sk.gun, 8);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, axleY, gearZ);
    gearGroup.add(stat(axle));
    if (form.axleWing) {
      gearGroup.add(boxMesh(x * 2 + 0.1, 0.12, 0.85, sk.wingSolid, 0, axleY + 0.02, gearZ + 0.1));
    } else {
      gearGroup.add(boxMesh(x * 2 - 0.2, 0.07, 0.3, sk.wingSolid, 0, axleY + 0.02, gearZ + 0.05));
    }
    const skid = V(0, f.bottom(f.z1 - 0.6) - 0.02, f.z1 - 0.6);
    gearGroup.add(stat(strut(skid, V(0, Math.max(0.28, skid.y - 0.45), f.z1 - 0.3), 0.04, sk.wood, 1)));
  }

  // Interplane struts, cabane struts, and rigging.
  if (form.struts && form.struts !== 'none' && built.length >= 2) {
    const pairs: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i < built.length - 1; i++) {
      const upper = built[i], lower = built[i + 1];
      const s = form.struts === 'pair' ? 0.62 : 0.6;
      for (const side of [-1, 1] as const) {
        const U = side < 0 ? upper.L : upper.R;
        const D = side < 0 ? lower.L : lower.R;
        const sd = s * (upper.spec.span / lower.spec.span);
        if (form.struts === 'pair') {
          // V-strut: one foot on the lower wing, two arms up to the top wing.
          const foot = D.at(Math.min(sd, 0.9), 0.5, true);
          g.add(stat(strut(foot, U.at(s, 0.2, false), 0.045, sk.detail)));
          g.add(stat(strut(foot, U.at(s, 0.75, false), 0.045, sk.detail)));
        } else {
          for (const x of [0.22, 0.75]) g.add(stat(strut(D.at(Math.min(sd, 0.9), x, true), U.at(s, x, false), 0.045, sk.detail)));
        }
        // Flying and landing wires cross the bay.
        if (form.wires ?? era === 'ww1') {
          pairs.push([U.at(s, 0.22, false), D.at(0.12, 0.22, true)]);
          pairs.push([U.at(s, 0.75, false), D.at(0.12, 0.75, true)]);
          pairs.push([D.at(Math.min(sd, 0.9), 0.22, true), U.at(0.1, 0.22, false)]);
          pairs.push([D.at(Math.min(sd, 0.9), 0.75, true), U.at(0.1, 0.75, false)]);
        }
      }
    }
    // Cabane struts from the fuselage up to the top wing.
    const U = built[0];
    for (const side of [-1, 1] as const) {
      const H = side < 0 ? U.L : U.R;
      const sRoot = 0.6 / (U.spec.span / 2);
      for (const x of [0.2, 0.75]) {
        const up = H.at(sRoot, x, false);
        const down = V(side * f.halfW(up.z) * 0.85, f.top(up.z) - 0.05, up.z);
        if (up.y > down.y + 0.15) g.add(stat(strut(down, up, 0.04, sk.detail)));
      }
    }
    if (pairs.length) g.add(wires(pairs));
  }

  // Jet nacelles for the Schwalbe.
  if (fuseKey === 'me262' && topWing) {
    for (const side of [-1, 1] as const) {
      const H = side < 0 ? built[0].L : built[0].R;
      const p = H.at(0.32, 0.3, false);
      const nac = ringLoft([
        { z: p.z - 1.9, w: 0.95, h: 0.95, y: p.y - 0.2 }, { z: p.z - 1.2, w: 1.05, h: 1.05, y: p.y - 0.22 },
        { z: p.z + 0.9, w: 1.0, h: 1.0, y: p.y - 0.2 }, { z: p.z + 1.7, w: 0.72, h: 0.72, y: p.y - 0.15 },
      ], 2, T.n, sk.bodySolid, p.x, false);
      g.add(stat(nac));
      const intake = cyl(0.4, 0.4, 0.05, sk.gun, 16);
      intake.rotation.x = Math.PI / 2;
      intake.position.set(p.x, p.y - 0.2, p.z - 1.9);
      g.add(stat(intake));
      const glow = cyl(0.3, 0.3, 0.05, sk.jetGlow, 16);
      glow.rotation.x = Math.PI / 2;
      glow.position.set(p.x, p.y - 0.15, p.z + 1.7);
      g.add(stat(glow, false));
      const fl = flame(sk, p.x, p.y - 0.15, p.z + 1.7, 0.8);
      fl.scale.set(2.2, 1, 2.2);
      g.add(fl);
      model.flames.push(fl);
    }
    for (const [gx, gy] of [[-0.16, 0.16], [0.16, 0.16], [-0.16, -0.1], [0.16, -0.1]]) {
      g.add(boxMesh(0.06, 0.06, 0.8, sk.gun, gx, f.y(f.z0 + 0.9) + gy, f.z0 + 0.9));
    }
  }

  // Wing-mounted engines for the bomber.
  if (fuseKey === 'bomber' && topWing) {
    const discs: THREE.Mesh[] = [];
    for (const side of [-1, 1] as const) {
      const H = side < 0 ? built[0].L : built[0].R;
      const p = H.at(0.36, 0.25, false);
      const nac = ringLoft([
        { z: p.z - 1.0, w: 1.2, h: 1.2, y: p.y + 0.15 }, { z: p.z + 0.4, w: 1.25, h: 1.25, y: p.y + 0.15 },
        { z: p.z + 2.0, w: 0.9, h: 0.9, y: p.y + 0.2 }, { z: p.z + 2.8, w: 0.4, h: 0.4, y: p.y + 0.3 },
      ], 2, T.n, sk.bodySolid, p.x, false);
      g.add(stat(nac));
      radialEngine(g, p.z - 1.4, p.y + 0.15, 0.62, sk, T.n, p.x);
      const pr = propeller(g, V(p.x, p.y + 0.15, p.z - 1.55), 1.5, 3, sk, 0.16, 0.35);
      if (side < 0) model.prop = pr.prop; else model.prop2 = pr.prop;
      discs.push(pr.disc);
    }
    model.propDiscs = discs;
  }

  finish(g, wingHalves, gearGroup);
  return model;
}

/** Merge static geometry per sub-assembly, then at the root. */
function finish(g: THREE.Group, wingHalves: THREE.Object3D[], gear: THREE.Group): void {
  for (const w of wingHalves) mergeStatics(w);
  mergeStatics(gear);
  mergeStatics(g);
}

// ---------------------------------------------------------------- P-38 Lightning

function makeP38(form: PlaneForm, body: number, wing: number, detail: number, tier: Tier): PlaneModel {
  const T = tess(tier);
  const g = new THREE.Group();
  const model: PlaneModel = { group: g, prop: new THREE.Object3D() };
  const boomX = 3.1;
  const pod = fuseFns(FUSELAGES.p38pod);
  const boom = fuseFns(FUSELAGES.p38boom);
  const wingSpec: WingSpec = (form.wingsDetailed ?? form.wings)[0] ?? { y: 0.55, span: 15.6, chord: 2.7, planform: 'taper', taper: 0.5, thick: 0.13 };
  const ol = outline(wingSpec);
  const sk = getSkins({
    tier, body, wing, detail, nation: form.nation, era: 'ww2', fabric: false, metal: !!form.metal,
    wingChord: ol.zTE(0.68) - ol.zLE(0.68), wingHalfSpan: wingSpec.span / 2,
    bodyLength: boom.length, bodyPerimeter: boom.perimeter,
    sideMarkV: boom.v(2.0), cockpitV: boom.v(-1.5), mouth: false,
    finChord: 1.2, finHeight: 1.8, finHinge: 0.5, livery: form.livery,
  });

  g.add(fuselageMesh(FUSELAGES.p38pod, pod, sk.bodySolid, T.n, T.m, false));
  const halves: WingHalf[] = [];
  const wingHalves: THREE.Object3D[] = [];
  model.aileronsL = []; model.aileronsR = [];
  const root = V(0, wingSpec.y, -0.6 - wingSpec.chord / 2);
  for (const side of [-1, 1] as const) {
    const h = halfWing(wingSpec, {
      side, dihedral: form.dihedral ?? 0.08, thick: wingSpec.thick ?? 0.13, camber: 0.02, mat: sk.wing,
      n: T.wn, m: T.wm, root, ctrl: { range: [0.55, 0.95], frac: 0.26 },
    });
    h.group.userData.side = side;
    g.add(h.group);
    halves.push(h);
    wingHalves.push(h.group);
    if (h.ctrl) (side < 0 ? model.aileronsL : model.aileronsR)!.push(h.ctrl);
  }
  model.wingHalves = wingHalves;

  const discs: THREE.Mesh[] = [];
  model.rudders = [];
  model.flames = [];
  for (const side of [-1, 1] as const) {
    const bx = side * boomX;
    g.add(fuselageMesh(FUSELAGES.p38boom, boom, sk.body, T.n, T.m, false, bx));
    const pr = propeller(g, V(bx, boom.y(boom.z0), boom.z0 - 0.05), 1.55, 3, sk, 0.32, 0.7);
    if (side < 0) model.prop = pr.prop; else model.prop2 = pr.prop;
    discs.push(pr.disc);
    g.add(boxMesh(0.5, 0.28, 1.4, sk.dark, bx, boom.top(1.6) + 0.1, 1.6)); // turbo-supercharger
    g.add(stat(ringLoft([
      { z: 0.6, w: 0.7, h: 0.5, y: boom.y(0.6) }, { z: 1.6, w: 1.5, h: 0.85, y: boom.y(1.6) }, { z: 2.6, w: 1.2, h: 0.7, y: boom.y(2.6) }, { z: 3.2, w: 0.5, h: 0.3, y: boom.y(3.2) },
    ], 2.4, 12, sk.bodySolid, bx, false)));
    const fin = buildFin(g, 'square', 1.05, V(bx, boom.y(boom.z1), boom.z1), sk.fin, T.wn);
    model.rudders.push(fin.rudder);
    for (const sx of [-1, 1]) {
      const fl = flame(sk, bx + sx * 0.5, boom.y(boom.z0 + 0.9) + 0.2, boom.z0 + 1.6, 0.4);
      g.add(fl);
      model.flames.push(fl);
    }
  }
  model.propDiscs = discs;
  // Stabilizer bridging the booms, with a full-span elevator.
  const tailSpec: WingSpec = { y: boom.y(4.2) + 0.5, span: boomX * 2 + 1.6, chord: 1.2, planform: 'rect' };
  model.elevators = [];
  for (const side of [-1, 1] as const) {
    const h = halfWing(tailSpec, {
      side, dihedral: 0, thick: 0.08, camber: 0, mat: sk.wingPlain, n: T.wn, m: 6,
      root: V(0, tailSpec.y, 3.7), ctrl: { range: [0.05, 0.95], frac: 0.4 },
    });
    g.add(h.group);
    if (h.ctrl) model.elevators.push(h.ctrl);
  }
  // Bubble canopy and pilot on the pod; nose guns.
  const zC = -0.6;
  g.add(stat(ringLoft([
    { z: zC - 0.8, w: 0.55, h: 0.03 }, { z: zC - 0.3, w: 0.8, h: 0.55 }, { z: zC + 0.5, w: 0.82, h: 0.6 }, { z: zC + 1.2, w: 0.5, h: 0.3 }, { z: zC + 1.6, w: 0.15, h: 0.03 },
  ].map((q) => ({ ...q, y: pod.top(q.z) + q.h / 2 - 0.02 })), 2, T.n, sk.glass, 0, false), false));
  pilot(g, 0, pod.top(zC) + 0.22, zC + 0.2, sk, false);
  model.muzzles = [];
  for (const [gx, gy] of [[-0.25, 0.2], [0.25, 0.2], [-0.25, -0.08], [0.25, -0.08], [0, 0.05]]) {
    g.add(boxMesh(0.07, 0.07, 0.9, sk.gun, gx, pod.y(-2.9) + gy, -3.3));
    const mf = muzzleFlash(sk, 0.4);
    mf.position.set(gx, pod.y(-2.9) + gy, -3.8);
    g.add(mf);
    model.muzzles.push(mf);
  }
  // Tricycle gear.
  const gear = new THREE.Group();
  for (const side of [-1, 1]) {
    const top = V(side * boomX, boom.bottom(-1.2), -1.2);
    gear.add(stat(strut(top, V(side * boomX, -0.3, -1.2), 0.06, sk.detail, 1)));
    wheel(gear, side * boomX, -0.3, -1.2, 0.36, sk);
  }
  gear.add(stat(strut(V(0, pod.bottom(-2.4), -2.4), V(0, -0.3, -2.4), 0.05, sk.detail, 1)));
  wheel(gear, 0, -0.3, -2.4, 0.28, sk);
  gear.visible = false;
  g.add(gear);
  model.gear = gear;

  finish(g, wingHalves, gear);
  return model;
}

// ---------------------------------------------------------------- Horten Ho 229

function makeHo229(form: PlaneForm, body: number, wing: number, detail: number, tier: Tier): PlaneModel {
  const T = tess(tier);
  const g = new THREE.Group();
  const model: PlaneModel = { group: g, prop: new THREE.Object3D() };
  model.prop.visible = false;
  const inner: WingSpec = { y: 0.85, span: 3.8, chord: 4.6, planform: 'taper', taper: 0.62, sweep: 0.5, thick: 0.19 };
  const outer: WingSpec = { y: 0.85, span: 13.2, chord: 2.85, planform: 'taper', taper: 0.28, sweep: 0.55, thick: 0.1 };
  const ol = outline(outer);
  const sk = getSkins({
    tier, body, wing, detail, nation: form.nation, era: 'ww2', fabric: false, metal: !!form.metal,
    wingChord: ol.zTE(0.68) - ol.zLE(0.68), wingHalfSpan: outer.span / 2,
    bodyLength: 5, bodyPerimeter: 4, sideMarkV: 0.5, cockpitV: 0.3, mouth: false,
    finChord: 1, finHeight: 1, finHinge: 0.5, livery: form.livery,
  });
  const wingHalves: THREE.Object3D[] = [];
  model.aileronsL = []; model.aileronsR = []; model.elevators = [];
  const innerRoot = V(0, 0.85, -3.6);
  for (const side of [-1, 1] as const) {
    const hi = halfWing(inner, {
      side, dihedral: 0, thick: 0.19, camber: 0.015, mat: sk.bodySolid, n: T.wn, m: 6, root: innerRoot,
      ctrl: { range: [0.35, 0.95], frac: 0.22 },
    });
    g.add(hi.group);
    if (hi.ctrl) model.elevators.push(hi.ctrl);
    const rootZ = innerRoot.z + Math.tan(0.5) * 1.9 + (inner.chord * 0.62 - outer.chord) * 0.15;
    const ho = halfWing(outer, {
      side, dihedral: 0.03, thick: 0.1, camber: 0.015, mat: sk.wing, n: T.wn, m: T.wm,
      root: V(0, 0.85, rootZ), rootX: 1.9, ctrl: { range: [0.4, 0.92], frac: 0.25 },
    });
    ho.group.userData.side = side;
    g.add(ho.group);
    wingHalves.push(ho.group);
    if (ho.ctrl) (side < 0 ? model.aileronsL : model.aileronsR)!.push(ho.ctrl);
    // Tip drag rudders.
    const tip = ho.at(0.97, 0.3, true);
    g.add(boxMesh(0.05, 0.5, 0.7, sk.bodySolid, tip.x, tip.y + 0.15, tip.z));
  }
  model.wingHalves = wingHalves;
  // Blended centre body over the inner wing, low canopy, and buried jets.
  g.add(stat(ringLoft([
    { z: -3.55, w: 0.4, h: 0.25, y: 0.85 }, { z: -2.6, w: 1.4, h: 0.85, y: 0.9 }, { z: -1.2, w: 2.2, h: 1.1, y: 0.95 },
    { z: 0.4, w: 2.4, h: 1.05, y: 0.95 }, { z: 1.6, w: 1.9, h: 0.7, y: 0.95 }, { z: 2.4, w: 1.0, h: 0.2, y: 0.95 },
  ], 2.2, T.n, sk.body)));
  const zC = -1.4;
  g.add(stat(ringLoft([
    { z: zC - 0.7, w: 0.5, h: 0.03, y: 1.42 }, { z: zC - 0.2, w: 0.7, h: 0.42, y: 1.6 }, { z: zC + 0.6, w: 0.72, h: 0.44, y: 1.63 }, { z: zC + 1.3, w: 0.3, h: 0.03, y: 1.5 },
  ], 2, T.n, sk.glass, 0, false), false));
  pilot(g, 0, 1.55, zC + 0.2, sk, false);
  model.flames = [];
  for (const side of [-1, 1]) {
    const x = side * 1.15;
    const intake = cyl(0.33, 0.33, 0.05, sk.gun, 16);
    intake.rotation.x = Math.PI / 2;
    intake.position.set(x, 0.95, -2.45);
    g.add(stat(intake));
    const glow = cyl(0.28, 0.28, 0.05, sk.jetGlow, 16);
    glow.rotation.x = Math.PI / 2;
    glow.position.set(x, 0.95, 2.25);
    g.add(stat(glow, false));
    const fl = flame(sk, x, 0.95, 2.25, 0.75);
    fl.scale.set(2.2, 1, 2.2);
    g.add(fl);
    model.flames.push(fl);
  }
  model.muzzles = [];
  for (const gx of [-0.6, 0.6]) {
    const mf = muzzleFlash(sk, 0.4);
    mf.position.set(gx, 0.8, -3.0);
    g.add(mf);
    model.muzzles.push(mf);
  }
  const gear = new THREE.Group();
  for (const side of [-1, 1]) {
    gear.add(stat(strut(V(side * 1.5, 0.6, 0.2), V(side * 1.5, -0.3, 0.2), 0.06, sk.detail, 1)));
    wheel(gear, side * 1.5, -0.3, 0.2, 0.34, sk);
  }
  gear.add(stat(strut(V(0, 0.6, -2.6), V(0, -0.3, -2.6), 0.05, sk.detail, 1)));
  wheel(gear, 0, -0.3, -2.6, 0.3, sk);
  gear.visible = false;
  g.add(gear);
  model.gear = gear;
  finish(g, wingHalves, gear);
  return model;
}

/** Twin-engine enemy bomber with a glazed nose and dorsal gun. */
export function makeEnemyBomberDetailed(tier: Tier): PlaneModel {
  return makePlaneDetailed({
    fuselage: 'bomber', nose: 'flat', gear: 'retract', era: 'ww2', tail: 'rounded', finScale: 1.3,
    nation: 'de', dihedral: 0.06, livery: 'splinter',
    wings: [{ y: 1.0, span: 16, chord: 3.0, planform: 'taper', taper: 0.45, thick: 0.14 }],
  }, 0x5a5f52, 0x6b7060, 0x8a8f84, tier);
}
