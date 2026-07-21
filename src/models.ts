import * as THREE from 'three';
import { P } from './palette';

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });

function box(
  w: number, h: number, d: number,
  color: number,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export interface PlaneModel {
  group: THREE.Group;
  prop: THREE.Mesh;
}

/**
 * Low-poly biplane, nose pointing toward -z (the direction of flight).
 * Origin sits at the fuselage centerline so altitude == group.position.y.
 */
export function makeBiplane(body: number, wing: number, detail: number): PlaneModel {
  const g = new THREE.Group();

  g.add(box(1.1, 1.0, 5.2, body, 0, 0.9, 0));           // fuselage
  g.add(box(9, 0.22, 1.9, wing, 0, 1.95, -0.7));         // upper wing
  g.add(box(8, 0.22, 1.7, wing, 0, 0.3, -0.6));          // lower wing
  for (const sx of [-3.1, -1.2, 1.2, 3.1]) {             // struts
    g.add(box(0.12, 1.6, 0.12, detail, sx, 1.1, -0.7));
  }
  g.add(box(3.2, 0.15, 1.2, wing, 0, 1.0, 2.5));         // tailplane
  g.add(box(0.15, 1.15, 1.2, body, 0, 1.55, 2.6));       // fin
  g.add(box(0.7, 0.45, 0.9, detail, 0, 1.45, 0.35));     // cockpit rim

  for (const sx of [-0.85, 0.85]) {                      // wheels
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.22, 10),
      lambert(0x2b3238),
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx, -0.25, -0.9);
    wheel.castShadow = true;
    g.add(wheel);
    g.add(box(0.1, 0.8, 0.1, body, sx, 0.25, -0.9));     // gear legs
  }

  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 8), lambert(0x2b3238));
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.set(0, 0.9, -2.85);
  g.add(spinner);

  const prop = box(0.18, 2.8, 0.1, 0x3c342a, 0, 0.9, -2.72);
  g.add(prop);

  return { group: g, prop };
}

export function makeBuilding(): THREE.Group {
  const g = new THREE.Group();
  const w = 6 + Math.random() * 4;
  const h = 4.5 + Math.random() * 3;
  const d = 6 + Math.random() * 4;
  g.add(box(w, h, d, P.buildingWall, 0, h / 2, 0));
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.6, 4),
    lambert(P.buildingRoof),
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + 1.3;
  roof.castShadow = true;
  g.add(roof);
  return g;
}

export interface AAGunModel {
  group: THREE.Group;
  barrel: THREE.Group;
}

export function makeAAGun(): AAGunModel {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 1.2, 10), lambert(P.gun));
  base.position.y = 0.6;
  base.castShadow = true;
  g.add(base);
  g.add(box(1.8, 1.3, 1.8, P.gun, 0, 1.85, 0));

  const barrel = new THREE.Group();
  barrel.position.set(0, 2.3, 0);
  barrel.add(box(0.32, 0.32, 3.8, P.gunBarrel, 0, 0, -1.7));
  barrel.rotation.x = 0.5; // resting elevation
  g.add(barrel);

  return { group: g, barrel };
}

export function makeRunway(): THREE.Group {
  const g = new THREE.Group();
  const strip = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 70), lambert(P.runway));
  strip.position.y = 0.06;
  strip.receiveShadow = true;
  g.add(strip);
  for (let z = -28; z <= 28; z += 8) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 3.4), lambert(P.stripe));
    stripe.position.set(0, 0.14, z);
    g.add(stripe);
  }
  return g;
}

/** Random tree: pine, broadleaf, poplar, or bush. */
export function makeTree(): THREE.Group {
  const g = new THREE.Group();
  const s = 0.8 + Math.random() * 0.7;
  const kind = Math.random();

  if (kind >= 0.9) {
    // Low bush, no trunk.
    const bush = new THREE.Mesh(new THREE.SphereGeometry(1.3 * s, 7, 5), lambert(0x3d5c33));
    bush.scale.y = 0.6;
    bush.position.y = 0.7 * s;
    bush.castShadow = true;
    g.add(bush);
    return g;
  }

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.38, 1.3, 6), lambert(P.treeTrunk));
  trunk.position.y = 0.65;
  g.add(trunk);

  if (kind < 0.4) {
    // Pine.
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.7 * s, 3.4 * s, 7), lambert(P.treeTop));
    top.position.y = 1.2 + 1.7 * s;
    top.castShadow = true;
    g.add(top);
  } else if (kind < 0.72) {
    // Broadleaf: a cluster of leafy blobs.
    const shades = [0x3f6b32, 0x4a7a3a, 0x35592b];
    for (let i = 0; i < 3; i++) {
      const blob = new THREE.Mesh(new THREE.SphereGeometry((1.0 + Math.random() * 0.6) * s, 7, 5), lambert(shades[i]));
      blob.position.set((Math.random() - 0.5) * 1.4 * s, (1.9 + Math.random() * 1.1) * s, (Math.random() - 0.5) * 1.4 * s);
      blob.castShadow = true;
      g.add(blob);
    }
  } else {
    // Poplar: tall and narrow.
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 5.4 * s, 7), lambert(0x46703a));
    top.position.y = 1.1 + 2.7 * s;
    top.castShadow = true;
    g.add(top);
  }
  return g;
}

export interface RiverParams {
  amp: number;
  waveLen: number;
  phase: number;
}

export const RIVER_LEN = 480;
export const RIVER_WIDTH = 14;

/** X offset of the river centerline at a z-position relative to the river's center. */
export function riverXAt(params: RiverParams, relZ: number): number {
  return params.amp * Math.sin((relZ * Math.PI * 2) / params.waveLen + params.phase);
}

/** Meandering river strip, built as one vertex-strip mesh. */
export function makeRiver(params: RiverParams): THREE.Group {
  const g = new THREE.Group();
  const positions: number[] = [];
  const normals: number[] = [];
  const step = 20;
  // Ends taper to a point so the river doesn't cut off in a blunt square.
  const halfW = (z: number) =>
    (RIVER_WIDTH / 2) *
    Math.max(0.05, Math.min((z + RIVER_LEN / 2) / 70, (RIVER_LEN / 2 - z) / 70, 1));
  for (let z = -RIVER_LEN / 2; z < RIVER_LEN / 2; z += step) {
    const c0 = riverXAt(params, z);
    const c1 = riverXAt(params, z + step);
    const w0 = halfW(z);
    const w1 = halfW(z + step);
    const quad = [
      [c0 - w0, z], [c1 - w1, z + step], [c1 + w1, z + step],
      [c0 - w0, z], [c1 + w1, z + step], [c0 + w0, z],
    ];
    for (const [x, zz] of quad) {
      positions.push(x, 0.06, zz);
      normals.push(0, 1, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3d6b96 }));
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

/** Road bridge spanning the river along x. */
export function makeBridge(): THREE.Group {
  const g = new THREE.Group();
  for (const px of [-5, 5]) g.add(box(1.2, 3.4, 1.6, 0x5d5348, px, 1.7, 0));
  for (const px of [-13, 13]) g.add(box(4.5, 3.4, 6, 0x6b5f4e, px, 1.7, 0));
  g.add(box(30, 0.9, 5, 0x7a6a55, 0, 3.8, 0));
  for (const rz of [-2.2, 2.2]) g.add(box(30, 0.7, 0.25, 0x4d4438, 0, 4.6, rz));
  return g;
}

/** Collapsed bridge: charred abutments and deck stubs dropped into the water. */
export function makeBrokenBridge(): THREE.Group {
  const g = new THREE.Group();
  for (const px of [-13, 13]) g.add(box(4.5, 3.4, 6, 0x3a332c, px, 1.7, 0));
  const left = box(9, 0.8, 5, 0x40382e, -8.5, 2.6, 0);
  left.rotation.z = -0.4;
  g.add(left);
  const right = box(9, 0.8, 5, 0x40382e, 8.5, 2.6, 0);
  right.rotation.z = 0.4;
  g.add(right);
  return g;
}

/** River barge; the funnel is the last child so it tilts when damaged. */
export function makeShip(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3, 1.1, 9, 0x4a4740, 0, 0.75, 0));
  g.add(box(2.4, 0.6, 6.6, 0x6b675c, 0, 1.55, -0.5));
  g.add(box(1.7, 1.5, 2.1, 0x8a4a3a, 0, 2.2, 2.9));
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.7, 8), lambert(0x2f3540));
  funnel.position.set(0, 3.3, 2.6);
  funnel.castShadow = true;
  g.add(funnel);
  return g;
}

/** Industrial hall with sawtooth roof and a chimney (last child, slumps when damaged). */
export function makeFactory(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(16, 5, 10, 0x7a6a58, 0, 2.5, 0));
  for (let i = -1; i <= 1; i++) {
    const seg = box(4.6, 1.6, 10, 0x5d5348, i * 5.2, 5.7, 0);
    seg.rotation.z = 0.18;
    g.add(seg);
  }
  g.add(box(3.4, 3.4, 3.4, 0x6a5c4c, -8.8, 1.7, 2.5));
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.05, 8, 8), lambert(0x5a4a42));
  chimney.position.set(6.5, 6.4, -3);
  chimney.castShadow = true;
  g.add(chimney);
  return g;
}

/** Olive tank; the turret aims independently of the driving hull. */
export function makeTank(): AAGunModel {
  const g = new THREE.Group();
  g.add(box(1.2, 0.9, 5.2, 0x3f4a33, -1.7, 0.45, 0));
  g.add(box(1.2, 0.9, 5.2, 0x3f4a33, 1.7, 0.45, 0));
  g.add(box(3.2, 1.0, 4.6, 0x55663f, 0, 1.2, 0));
  const turret = new THREE.Group();
  turret.position.set(0, 2.0, 0.2);
  turret.add(box(1.9, 0.9, 2.1, 0x4c5c38));
  turret.add(box(0.28, 0.28, 3.4, 0x2f3a28, 0, 0.1, -2.4));
  g.add(turret);
  return { group: g, barrel: turret };
}

/** Fuel depot: three silver storage tanks — goes up with a big bang. */
export function makeDepot(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 7, 10), lambert(0x9aa0a6));
    drum.rotation.x = Math.PI / 2;
    drum.position.set((i - 1) * 3.4, 1.5, 0);
    drum.castShadow = true;
    g.add(drum);
  }
  g.add(box(0.6, 1.4, 6, 0x6a6f74, 5.4, 0.7, 0));
  return g;
}

/** Collapsed-building rubble left behind after a kill. */
export function makeRubble(): THREE.Group {
  const g = new THREE.Group();
  const colors = [0x3a342c, 0x4a4238, 0x2e2a24];
  for (let i = 0; i < 4; i++) {
    const m = box(
      3 + Math.random() * 3.5,
      0.7 + Math.random() * 1.3,
      3 + Math.random() * 3.5,
      colors[i % 3],
      (Math.random() - 0.5) * 4.5,
      0.5,
      (Math.random() - 0.5) * 4.5,
    );
    m.rotation.y = Math.random();
    g.add(m);
  }
  return g;
}

export function makeBomb(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 3, 8), lambert(P.bomb));
  m.rotation.x = Math.PI / 2;
  m.castShadow = true;
  return m;
}

export function makeBullet(color: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.22, 2.2),
    new THREE.MeshBasicMaterial({ color }),
  );
}

export function makeCloud(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const s = 4 + Math.random() * 6;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 7, 5), mat);
    puff.scale.y = 0.45;
    puff.position.set((i - n / 2) * s * 1.1, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 6);
    g.add(puff);
  }
  return g;
}
