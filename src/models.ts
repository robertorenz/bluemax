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

export function makeTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.38, 1.3, 6), lambert(P.treeTrunk));
  trunk.position.y = 0.65;
  g.add(trunk);
  const s = 0.8 + Math.random() * 0.7;
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.7 * s, 3.4 * s, 7), lambert(P.treeTop));
  top.position.y = 1.2 + 1.7 * s;
  top.castShadow = true;
  g.add(top);
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
