import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** One point of a cross-section ring plus its texture u coordinate. */
export interface RingPt { p: THREE.Vector3; u: number }
export type Ring = RingPt[];

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Superellipse cross-section in the XY plane: n+1 points with the seam
 * duplicated, starting at the top and running clockwise seen from the nose.
 * k = 2 is an ellipse, larger k squares the corners; kb applies below the waist.
 */
export function superRing(
  w: number, h: number, k: number, n: number, cx = 0, cy = 0, kb = k,
): Ring {
  const ring: Ring = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const s = Math.sin(t);
    const c = Math.cos(t);
    const kk = c >= 0 ? k : kb;
    const x = (w / 2) * Math.sign(s) * Math.pow(Math.abs(s), 2 / kk);
    const y = (h / 2) * Math.sign(c) * Math.pow(Math.abs(c), 2 / kk);
    ring.push({ p: V(x + cx, y + cy, 0), u: i / n });
  }
  return ring;
}

/** Ring collapsed to a single point (a cap for a loft end). */
export function pointRing(p: THREE.Vector3, n: number): Ring {
  const ring: Ring = [];
  for (let i = 0; i <= n; i++) ring.push({ p: p.clone(), u: i / n });
  return ring;
}

/** Move a ring built in the XY plane to sit at z, optionally scaled and offset. */
export function placeRing(ring: Ring, z: number, sx = 1, sy = 1, dx = 0, dy = 0): Ring {
  return ring.map((r) => ({ p: V(r.p.x * sx + dx, r.p.y * sy + dy, z), u: r.u }));
}

/** NACA 00xx half-thickness at chord fraction x (closed trailing edge), in chord units. */
function naca(x: number, t: number): number {
  return (t / 0.2) * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
}

export interface AirfoilStation {
  /** Leading-edge point (chord fraction 0). */
  o: THREE.Vector3;
  /** Unit chord direction, leading edge to trailing edge. */
  c: THREE.Vector3;
  /** Unit thickness direction (the wing's up). */
  t: THREE.Vector3;
  chord: number;
  /** Thickness / chord. */
  thick: number;
  /** Mean-line camber / chord. */
  camber?: number;
  /** Chord fraction range this station covers (defaults to the full 0..1). */
  x0?: number;
  x1?: number;
}

/**
 * Closed airfoil ring for a station: upper surface from the trailing edge to the
 * leading edge, then the lower surface back, then closed. u runs 0 to 0.5 across
 * the upper surface (TE to LE) and 0.5 to 1 underneath (LE to TE), always in terms
 * of the full chord so partial-chord rings (control surfaces) map onto the same skin.
 */
export function airfoilRing(st: AirfoilStation, n: number): Ring {
  const x0 = st.x0 ?? 0;
  const x1 = st.x1 ?? 1;
  const m = st.camber ?? 0.02;
  const ring: Ring = [];
  const pt = (x: number, upper: boolean): RingPt => {
    const yt = naca(x, st.thick);
    const yc = m * 4 * x * (1 - x);
    const y = upper ? yc + yt : yc - yt;
    const p = st.o.clone()
      .addScaledVector(st.c, x * st.chord)
      .addScaledVector(st.t, y * st.chord);
    return { p, u: upper ? 0.5 * (1 - x) : 0.5 + 0.5 * x };
  };
  const xAt = (i: number) => x0 + (x1 - x0) * (1 - Math.cos((i / n) * Math.PI)) / 2;
  for (let i = n; i >= 0; i--) ring.push(pt(xAt(i), true));
  for (let i = x0 === 0 ? 1 : 0; i <= n; i++) ring.push(pt(xAt(i), false));
  ring.push({ p: ring[0].p.clone(), u: ring[ring.length - 1].u });
  return ring;
}

/**
 * Skin a list of rings (all the same length) into an indexed, smooth-shaded
 * BufferGeometry with uv = (ring u, station v). Face winding is chosen so the
 * normals point away from the shape's centroid, whichever way the rings ran.
 */
export function loft(rings: Ring[], vs?: number[]): THREE.BufferGeometry {
  const m = rings.length;
  const n = rings[0].length;
  const pos = new Float32Array(m * n * 3);
  const uv = new Float32Array(m * n * 2);
  for (let i = 0; i < m; i++) {
    const v = vs ? vs[i] : i / (m - 1);
    for (let j = 0; j < n; j++) {
      const r = rings[i][j];
      const k = i * n + j;
      pos[k * 3] = r.p.x; pos[k * 3 + 1] = r.p.y; pos[k * 3 + 2] = r.p.z;
      uv[k * 2] = r.u; uv[k * 2 + 1] = v;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < m - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  orientOutward(geo);
  geo.computeVertexNormals();
  return geo;
}

/** Flip the winding if most faces point at the centroid rather than away from it. */
function orientOutward(geo: THREE.BufferGeometry): void {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const idx = geo.getIndex()!;
  const cen = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) cen.add(V(p.getX(i), p.getY(i), p.getZ(i)));
  cen.divideScalar(p.count);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), fc = new THREE.Vector3();
  let score = 0;
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(p, idx.getX(i));
    b.fromBufferAttribute(p, idx.getX(i + 1));
    c.fromBufferAttribute(p, idx.getX(i + 2));
    ab.subVectors(b, a); ac.subVectors(c, a);
    fc.copy(a).add(b).add(c).divideScalar(3).sub(cen);
    score += ab.cross(ac).dot(fc);
  }
  if (score < 0) flipWinding(idx);
}

function flipWinding(idx: THREE.BufferAttribute): void {
  for (let i = 0; i < idx.count; i += 3) {
    const t = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, t);
  }
  idx.needsUpdate = true;
}

/** Piecewise-cubic interpolation through keyframes (finite-difference tangents, no ringing). */
export function spline(keys: { z: number; v: number }[]): (z: number) => number {
  const k = keys;
  const n = k.length;
  const tan: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = k[Math.max(0, i - 1)], b = k[Math.min(n - 1, i + 1)];
    tan.push(b.z === a.z ? 0 : (b.v - a.v) / (b.z - a.z));
  }
  return (z: number) => {
    if (z <= k[0].z) return k[0].v;
    if (z >= k[n - 1].z) return k[n - 1].v;
    let i = 0;
    while (i < n - 2 && z > k[i + 1].z) i++;
    const a = k[i], b = k[i + 1];
    const h = b.z - a.z;
    const t = (z - a.z) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a.v + (t3 - 2 * t2 + t) * h * tan[i]
      + (-2 * t3 + 3 * t2) * b.v + (t3 - t2) * h * tan[i + 1];
  };
}

/** Thin streamlined tube between two points (an elliptical strut). */
export function strut(
  a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, flat = 1.8,
): THREE.Mesh {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r, r, len, 8, 1);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  m.scale.set(1, 1, flat); // streamline the section along the flight direction
  m.castShadow = true;
  return m;
}

/** Bracing wires as thin line segments. */
export function wires(pairs: [THREE.Vector3, THREE.Vector3][], color = 0x1c1f22): THREE.LineSegments {
  const pts: number[] = [];
  for (const [a, b] of pairs) pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
}

/**
 * Merge every mesh flagged userData.merge under root into one mesh per
 * material (baking transforms relative to root), leaving animated parts alone.
 */
export function mergeStatics(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; shadow: boolean }>();
  const doomed: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.userData.merge) return;
    const rel = rootInv.clone().multiply(o.matrixWorld);
    const g = o.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getIndex()) {
      const n = g.getAttribute('position').count;
      g.setIndex([...Array(n).keys()]);
    }
    g.applyMatrix4(rel);
    if (rel.determinant() < 0) flipWinding(g.getIndex()!);
    const mat = o.material as THREE.Material;
    const entry = byMat.get(mat) ?? { geos: [], shadow: false };
    entry.geos.push(g);
    entry.shadow = entry.shadow || o.castShadow;
    byMat.set(mat, entry);
    doomed.push(o);
  });
  for (const m of doomed) {
    m.parent?.remove(m);
    m.geometry.dispose();
  }
  for (const [mat, { geos, shadow }] of byMat) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadow;
    root.add(mesh);
  }
}

/** Flag a mesh as static so mergeStatics folds it into its parent batch. */
export function stat<T extends THREE.Object3D>(o: T, shadow = true): T {
  o.userData.merge = true;
  if (o instanceof THREE.Mesh) o.castShadow = shadow;
  return o;
}
