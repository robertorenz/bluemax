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
  prop2?: THREE.Mesh; // twin-engine types
}

/** Enemy archetype ids kept for the red air force. */
export type PlaneShape = 'mono' | 'bi' | 'tri';

export type Nation = 'uk' | 'de' | 'fr' | 'us' | 'ussr';

/** Geometry recipe for one aircraft — enough knobs to make each type recognizable. */
export interface PlaneForm {
  fuselage: 'box' | 'round' | 'slim' | 'deep' | 'stubby' | 'p38' | 'tbf' | 'me262' | 'ho229';
  nose: 'flat' | 'spinner' | 'radial' | 'chin';
  wings: { y: number; span: number; chord: number; stagger?: number }[];
  struts?: 'none' | 'pair' | 'quad';
  gear?: 'open' | 'spat';
  canopy?: 'none' | 'hump' | 'closed' | 'bubble';
  headrest?: boolean;
  scoop?: boolean;    // ventral radiator scoop
  mouth?: boolean;    // shark-mouth nose art
  axleWing?: boolean; // Fokker Dr.I stub wing between the wheels
  gunner?: boolean;   // rear observer cockpit
  nation?: Nation;    // wing markings
  dihedral?: number;  // outer wing panel tilt, radians
  exhaust?: boolean;  // inline-engine exhaust stacks
  guns?: boolean;     // cowl machine guns
}

/** National insignia painted on the top wing surfaces. */
function addMarking(g: THREE.Group, nation: Nation, x: number, ySurf: number, z: number): void {
  const disc = (r: number, color: number, dy: number): void => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 16), lambert(color));
    m.position.set(x, ySurf + dy, z);
    g.add(m);
  };
  if (nation === 'uk') {
    disc(0.58, 0x1d3f7a, 0); disc(0.4, 0xe8e4da, 0.02); disc(0.2, 0xa33226, 0.04);
  } else if (nation === 'fr') {
    disc(0.58, 0xa33226, 0); disc(0.4, 0xe8e4da, 0.02); disc(0.2, 0x1d3f7a, 0.04);
  } else if (nation === 'us') {
    disc(0.58, 0x1d3f7a, 0); disc(0.32, 0xe8e4da, 0.02); disc(0.13, 0xa33226, 0.04);
  } else if (nation === 'ussr') {
    disc(0.58, 0xe8e4da, 0); disc(0.46, 0xa33226, 0.02);
  } else {
    g.add(box(1.22, 0.04, 0.52, 0xe8e4da, x, ySurf, z));
    g.add(box(0.52, 0.04, 1.22, 0xe8e4da, x, ySurf, z));
    g.add(box(1.05, 0.05, 0.36, 0x1c1c1c, x, ySurf + 0.02, z));
    g.add(box(0.36, 0.05, 1.05, 0x1c1c1c, x, ySurf + 0.02, z));
  }
}

/**
 * Low-poly military plane assembled from a PlaneForm recipe; nose points
 * toward -z. Origin sits at the fuselage centerline so altitude == position.y.
 */
export function makePlane(form: PlaneForm, body: number, wing: number, detail: number): PlaneModel {
  if (form.fuselage === 'p38') return makeP38(body, wing, detail, form);
  if (form.fuselage === 'tbf') return makeTBF(body, wing, detail, form);
  if (form.fuselage === 'me262') return makeMe262(body, wing, detail, form);
  if (form.fuselage === 'ho229') return makeHo229(body, wing, detail, form);
  const g = new THREE.Group();

  // Fuselage.
  let noseZ = -2.7;
  if (form.fuselage === 'round') {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 5.6, 10), lambert(body));
    f.rotation.x = Math.PI / 2;
    f.position.set(0, 0.95, 0.1);
    f.castShadow = true;
    g.add(f);
  } else if (form.fuselage === 'slim') {
    g.add(box(0.95, 0.95, 6.2, body, 0, 0.9, 0.2));
    noseZ = -2.9;
  } else if (form.fuselage === 'deep') {
    g.add(box(1.3, 1.15, 6, body, 0, 0.95, 0.1));
    noseZ = -2.9;
  } else if (form.fuselage === 'stubby') {
    g.add(box(1.4, 1.25, 4.0, body, 0, 0.95, 0.2));
    noseZ = -1.9;
  } else {
    g.add(box(1.1, 1.0, 5.2, body, 0, 0.9, 0));
  }

  // Nose treatment.
  if (form.nose === 'radial') {
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.82, 0.95, 12), lambert(0x3a4046));
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(0, 0.95, noseZ + 0.25);
    cowl.castShadow = true;
    g.add(cowl);
  } else if (form.nose === 'spinner' || form.nose === 'chin') {
    const spin = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.85, 10), lambert(0x2b3238));
    spin.rotation.x = -Math.PI / 2;
    spin.position.set(0, 0.95, noseZ - 0.3);
    g.add(spin);
    if (form.nose === 'chin') {
      g.add(box(0.85, 0.55, 1.6, 0x3a4046, 0, 0.35, noseZ + 0.9)); // chin radiator
    }
  } else {
    const spin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 8), lambert(0x2b3238));
    spin.rotation.x = -Math.PI / 2;
    spin.position.set(0, 0.9, noseZ - 0.15);
    g.add(spin);
  }
  if (form.mouth) {
    g.add(box(0.95, 0.4, 1.2, 0xe8e4da, 0, 0.5, noseZ + 0.55));
    g.add(box(1.0, 0.14, 1.25, 0xa33226, 0, 0.5, noseZ + 0.56));
  }
  if (form.scoop) {
    g.add(box(0.7, 0.5, 1.9, 0x3a4046, 0, 0.22, 0.9));
  }

  // Wings: center section plus tapered outer panels with dihedral and tip caps.
  const dihedral = form.dihedral ?? 0.03;
  const topWingY = Math.max(...form.wings.map((w) => w.y));
  for (const w of form.wings) {
    const zc = -0.6 + (w.stagger ?? 0);
    const centerSpan = w.span * 0.5;
    const outerSpan = w.span * 0.27;
    g.add(box(centerSpan, 0.22, w.chord, wing, 0, w.y, zc));
    for (const side of [-1, 1] as const) {
      const px = side * (centerSpan / 2 + outerSpan / 2 - 0.06);
      const py = w.y + Math.sin(dihedral) * (outerSpan / 2);
      const panel = box(outerSpan, 0.2, w.chord * 0.82, wing, px, py, zc + w.chord * 0.05);
      panel.rotation.z = side * dihedral;
      g.add(panel);
      const tipY = w.y + Math.sin(dihedral) * outerSpan;
      const tip = box(
        outerSpan * 0.34, 0.18, w.chord * 0.55, wing,
        side * (centerSpan / 2 + outerSpan * 1.05), tipY, zc + w.chord * 0.12,
      );
      tip.rotation.z = side * dihedral;
      g.add(tip);
      // Insignia on the outer panels of the top wing.
      if (form.nation && w.y === topWingY) {
        addMarking(g, form.nation, px, py + 0.13, zc + w.chord * 0.05);
      }
    }
  }
  if (form.axleWing) g.add(box(2.7, 0.14, 0.9, wing, 0, -0.15, -0.85));

  // Struts between the highest and lowest wings.
  const ys = form.wings.map((w) => w.y);
  if (form.struts && form.struts !== 'none' && ys.length >= 2) {
    const top = Math.max(...ys);
    const bottom = Math.min(...ys);
    const xs = form.struts === 'pair' ? [-2.1, 2.1] : [-2.2, -1.05, 1.05, 2.2];
    for (const sx of xs) {
      g.add(box(0.12, top - bottom + 0.2, 0.12, detail, sx, (top + bottom) / 2, -0.65));
    }
  }

  // Inline-engine exhaust stacks along the nose.
  if (form.exhaust) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        g.add(box(0.09, 0.13, 0.42, 0x23272b, side * 0.54, 1.28, noseZ + 1.0 + i * 0.55));
      }
    }
  }

  // Cowl machine guns.
  if (form.guns) {
    for (const sx of [-0.22, 0.22]) {
      g.add(box(0.11, 0.11, 1.0, 0x22262a, sx, 1.44, -1.5));
    }
  }

  // Tail.
  g.add(box(3.2, 0.15, 1.2, wing, 0, 1.0, 2.5));
  g.add(box(0.15, 1.15, 1.2, body, 0, 1.55, 2.6));

  // Cockpit furniture.
  if (form.canopy === 'hump') {
    g.add(box(0.55, 0.32, 0.95, 0x3a4046, 0, 1.55, -0.85)); // twin-gun hump
    g.add(box(0.7, 0.45, 0.9, detail, 0, 1.45, 0.35));
  } else if (form.canopy === 'closed') {
    g.add(box(0.95, 0.55, 1.7, 0x2b3238, 0, 1.6, 0.3));
  } else if (form.canopy === 'bubble') {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0x7fa8c9, transparent: true, opacity: 0.85 }),
    );
    dome.scale.set(0.85, 0.9, 1.5);
    dome.position.set(0, 1.5, 0.3);
    g.add(dome);
  } else {
    g.add(box(0.7, 0.45, 0.9, detail, 0, 1.45, 0.35)); // open cockpit rim
  }
  if (form.headrest) g.add(box(0.45, 0.5, 1.5, body, 0, 1.5, 1.1));
  if (form.gunner) g.add(box(0.75, 0.4, 0.75, 0x2f3540, 0, 1.4, 1.6));

  // Landing gear.
  for (const sx of [-0.85, 0.85]) {
    if (form.gear === 'spat') {
      g.add(box(0.36, 0.95, 1.35, body, sx, -0.1, -0.9)); // teardrop spat
      g.add(box(0.1, 0.6, 0.1, body, sx, 0.35, -0.9));
    } else {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.22, 10), lambert(0x2b3238));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx, -0.25, -0.9);
      wheel.castShadow = true;
      g.add(wheel);
      g.add(box(0.1, 0.8, 0.1, body, sx, 0.25, -0.9));
    }
  }

  const prop = box(0.18, 2.8, 0.1, 0x3c342a, 0, 0.9, noseZ - 0.02);
  g.add(prop);

  return { group: g, prop };
}

/**
 * P-38 Lightning, drawn in detail: central gondola with the concentrated nose
 * armament and bubble canopy, twin engine booms with counter-rotating props,
 * turbo-superchargers and radiator bulges, and the twin-fin tail bridged by
 * the horizontal stabilizer.
 */
function makeP38(body: number, wing: number, detail: number, form: PlaneForm): PlaneModel {
  const g = new THREE.Group();
  const boomX = 3.1;

  // Central gondola.
  g.add(box(1.15, 1.1, 4.6, body, 0, 1.0, -0.5));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), lambert(body));
  nose.position.set(0, 1.0, -2.75);
  nose.scale.set(1, 0.95, 1.7);
  nose.castShadow = true;
  g.add(nose);
  // Nose armament: four machine guns around a 20mm cannon.
  for (const [gx, gy] of [[-0.27, 1.2], [0.27, 1.2], [-0.27, 0.92], [0.27, 0.92]]) {
    g.add(box(0.09, 0.09, 0.95, 0x22262a, gx, gy, -3.5));
  }
  g.add(box(0.14, 0.14, 1.2, 0x1a1d20, 0, 1.06, -3.6));
  // Bubble canopy.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0x7fa8c9, transparent: true, opacity: 0.85 }),
  );
  dome.scale.set(0.9, 0.85, 1.5);
  dome.position.set(0, 1.72, 0.1);
  g.add(dome);

  // Center wing carrying gondola and booms.
  g.add(box(boomX * 2 + 2.4, 0.26, 2.7, wing, 0, 0.55, -0.4));
  // Outer panels with dihedral, tips, and insignia.
  const dih = 0.08;
  const outerSpan = 3.4;
  for (const side of [-1, 1] as const) {
    const px = side * (boomX + 1.2 + outerSpan / 2 - 0.05);
    const py = 0.55 + (Math.sin(dih) * outerSpan) / 2;
    const panel = box(outerSpan, 0.22, 2.2, wing, px, py, -0.35);
    panel.rotation.z = side * dih;
    g.add(panel);
    const tip = box(
      1.1, 0.18, 1.4, wing,
      side * (boomX + 1.2 + outerSpan + 0.35), 0.55 + Math.sin(dih) * outerSpan, -0.3,
    );
    tip.rotation.z = side * dih;
    g.add(tip);
    if (form.nation) addMarking(g, form.nation, px, py + 0.15, -0.35);
  }

  // Twin booms: engine cowls, spinners, props, superchargers, radiators, fins.
  let prop!: THREE.Mesh;
  let prop2: THREE.Mesh | undefined;
  for (const side of [-1, 1] as const) {
    const bx = side * boomX;
    g.add(box(0.95, 1.0, 8.2, body, bx, 0.9, 0.6));
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 1.7, 10), lambert(body));
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(bx, 0.95, -3.4);
    cowl.castShadow = true;
    g.add(cowl);
    const spin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.72, 10), lambert(detail));
    spin.rotation.x = -Math.PI / 2;
    spin.position.set(bx, 0.95, -4.5);
    g.add(spin);
    const blade = box(0.16, 2.7, 0.1, 0x3c342a, bx, 0.95, -4.32);
    g.add(blade);
    if (side < 0) prop = blade;
    else prop2 = blade;
    g.add(box(0.5, 0.3, 1.5, 0x3a4046, bx, 1.52, 1.5));   // turbo-supercharger
    g.add(box(1.28, 0.5, 1.7, 0x3a4046, bx, 0.62, 1.2));  // radiator bulges
    g.add(box(0.14, 1.9, 1.35, body, bx, 1.85, 4.35));    // vertical fin
    g.add(box(0.14, 0.85, 1.9, body, bx, 1.5, 4.3));      // fin fillet
  }
  // Stabilizer bridging the booms.
  g.add(box(boomX * 2 + 1.3, 0.15, 1.15, wing, 0, 1.45, 4.35));

  return { group: g, prop, prop2 };
}

/**
 * Grumman TBF Avenger, drawn in detail: portly carrier-bomber fuselage, big
 * radial cowl, long greenhouse canopy ending in a dorsal gun turret, ventral
 * gunner station, tall rounded fin — and the torpedo slung under the belly.
 */
function makeTBF(body: number, wing: number, detail: number, form: PlaneForm): PlaneModel {
  const g = new THREE.Group();
  const glass = new THREE.MeshLambertMaterial({ color: 0x7fa8c9, transparent: true, opacity: 0.85 });

  // Portly fuselage with rounded spine and tapering tail.
  g.add(box(1.6, 1.7, 6.4, body, 0, 1.15, 0.2));
  g.add(box(1.15, 0.55, 4.2, body, 0, 2.1, 0.9));
  g.add(box(1.0, 1.15, 1.8, body, 0, 1.25, 3.6));

  // Big radial engine.
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.98, 1.35, 12), lambert(0x3a4046));
  cowl.rotation.x = Math.PI / 2;
  cowl.position.set(0, 1.15, -3.05);
  cowl.castShadow = true;
  g.add(cowl);
  const spin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 10), lambert(detail));
  spin.rotation.x = -Math.PI / 2;
  spin.position.set(0, 1.15, -3.9);
  g.add(spin);
  const prop = box(0.2, 3.1, 0.1, 0x3c342a, 0, 1.15, -3.78);
  g.add(prop);

  // Long greenhouse canopy stepping down toward the turret.
  const seg1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.62, 1.5), glass);
  seg1.position.set(0, 2.45, -0.8);
  g.add(seg1);
  const seg2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.7), glass);
  seg2.position.set(0, 2.42, 0.8);
  g.add(seg2);
  // Dorsal ball turret with gun.
  const turret = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), glass);
  turret.position.set(0, 2.5, 2.2);
  g.add(turret);
  const tGun = box(0.08, 0.08, 1.1, 0x22262a, 0, 2.75, 2.9);
  tGun.rotation.x = -0.5;
  g.add(tGun);
  // Ventral gunner step.
  g.add(box(0.85, 0.5, 1.2, body, 0, 0.45, 2.9));
  const vWin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.7), glass);
  vWin.position.set(0, 0.4, 3.4);
  g.add(vWin);

  // Mid-set wings with strong dihedral and insignia.
  g.add(box(6, 0.26, 2.8, wing, 0, 1.0, -0.3));
  const dih = 0.09;
  const outerSpan = 3.8;
  for (const side of [-1, 1] as const) {
    const px = side * (3 + outerSpan / 2 - 0.05);
    const py = 1.0 + (Math.sin(dih) * outerSpan) / 2;
    const panel = box(outerSpan, 0.24, 2.3, wing, px, py, -0.25);
    panel.rotation.z = side * dih;
    g.add(panel);
    const tip = box(1.2, 0.2, 1.5, wing, side * (3 + outerSpan + 0.4), 1.0 + Math.sin(dih) * outerSpan, -0.2);
    tip.rotation.z = side * dih;
    g.add(tip);
    if (form.nation) addMarking(g, form.nation, px, py + 0.16, -0.25);
  }

  // Tall rounded fin and broad tailplane.
  g.add(box(0.16, 2.3, 1.6, body, 0, 2.9, 4.3));
  g.add(box(0.16, 1.0, 2.1, body, 0, 2.1, 4.2));
  g.add(box(5.6, 0.16, 1.3, wing, 0, 1.5, 4.2));

  // The torpedo.
  const torp = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.1, 10), lambert(0x6e7276));
  torp.rotation.x = Math.PI / 2;
  torp.position.set(0, 0.05, 0.2);
  torp.castShadow = true;
  g.add(torp);
  const tNose = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), lambert(0x5a5e62));
  tNose.position.set(0, 0.05, -1.4);
  tNose.scale.z = 1.4;
  g.add(tNose);
  g.add(box(0.7, 0.08, 0.5, 0x5a5e62, 0, 0.05, 1.85));
  g.add(box(0.08, 0.7, 0.5, 0x5a5e62, 0, 0.05, 1.85));

  return { group: g, prop };
}

/**
 * Messerschmitt Me 262 Schwalbe, drawn in detail: shark-like pointed nose
 * packing four 30mm cannon, triangular-ish sleek fuselage, swept wings with
 * two underslung turbojet nacelles (glowing exhausts, no propeller), and the
 * tall swept fin with high-set tailplane.
 */
function makeMe262(body: number, wing: number, _detail: number, form: PlaneForm): PlaneModel {
  const g = new THREE.Group();

  // Sleek fuselage and pointed nose.
  g.add(box(1.0, 1.05, 6.4, body, 0, 1.0, 0.5));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.56, 2.0, 10), lambert(body));
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 1.0, -3.6);
  nose.castShadow = true;
  g.add(nose);
  // Four 30mm cannon muzzles clustered in the nose.
  for (const [gx, gy] of [[-0.17, 1.14], [0.17, 1.14], [-0.17, 0.86], [0.17, 0.86]]) {
    g.add(box(0.07, 0.07, 0.7, 0x1a1d20, gx, gy, -3.2));
  }
  // Canopy.
  const glass = new THREE.MeshLambertMaterial({ color: 0x7fa8c9, transparent: true, opacity: 0.85 });
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.52, 1.6), glass);
  canopy.position.set(0, 1.72, -0.5);
  g.add(canopy);

  // Swept wings with insignia.
  g.add(box(2.6, 0.24, 2.5, wing, 0, 0.55, 0.3));
  for (const side of [-1, 1] as const) {
    const panel = box(4.8, 0.22, 2.0, wing, side * 3.4, 0.55, 0.85);
    panel.rotation.y = side * 0.28; // leading-edge sweep
    g.add(panel);
    const tip = box(1.2, 0.18, 1.3, wing, side * 5.5, 0.55, 1.5);
    tip.rotation.y = side * 0.28;
    g.add(tip);
    if (form.nation) addMarking(g, form.nation, side * 3.6, 0.72, 0.9);

    // Underslung turbojet nacelle.
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 3.6, 12), lambert(0x4d5157));
    jet.rotation.x = Math.PI / 2;
    jet.position.set(side * 2.15, 0.1, 0.4);
    jet.castShadow = true;
    g.add(jet);
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12), lambert(0x1a1d20));
    intake.rotation.x = Math.PI / 2;
    intake.position.set(side * 2.15, 0.1, -1.45);
    g.add(intake);
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.14, 12),
      new THREE.MeshBasicMaterial({ color: 0xe8863d }),
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(side * 2.15, 0.1, 2.25);
    g.add(exhaust);
  }

  // Swept fin and high tailplane.
  const fin = box(0.14, 2.1, 1.7, body, 0, 2.15, 4.15);
  fin.rotation.x = 0.25;
  g.add(fin);
  g.add(box(4.4, 0.14, 1.25, wing, 0, 2.5, 4.35));

  // Jets have no propeller — hand back an invisible stub for the spinner hook.
  const prop = box(0.01, 0.01, 0.01, body, 0, 0, 0);
  prop.visible = false;

  return { group: g, prop };
}

/**
 * Horten Ho 229, drawn in detail: a pure flying wing — no fuselage, no tail.
 * Thick blended center section with a low bubble canopy, twin jet intakes in
 * the leading edge and glowing exhausts at the trailing edge, long swept and
 * tapered outer wings with small wingtip drag rudders.
 */
function makeHo229(body: number, wing: number, _detail: number, form: PlaneForm): PlaneModel {
  const g = new THREE.Group();

  // Blended center body, thick at the root, with a wedge nose.
  g.add(box(3.4, 0.95, 4.4, body, 0, 0.85, 0.4));
  const noseWedge = box(2.4, 0.65, 1.8, body, 0, 0.78, -2.2);
  noseWedge.rotation.x = -0.08;
  g.add(noseWedge);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.4, 4), lambert(body));
  nose.rotation.x = -Math.PI / 2;
  nose.rotation.z = Math.PI / 4;
  nose.scale.set(1.6, 1, 0.5);
  nose.position.set(0, 0.8, -3.6);
  g.add(nose);

  // Low blended canopy.
  const glass = new THREE.MeshLambertMaterial({ color: 0x7fa8c9, transparent: true, opacity: 0.85 });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8), glass);
  canopy.scale.set(0.85, 0.7, 1.5);
  canopy.position.set(0, 1.45, -1.3);
  g.add(canopy);

  // Twin jets buried in the wing roots: intakes forward, glowing exhausts aft.
  for (const side of [-1, 1] as const) {
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 12), lambert(0x1a1d20));
    intake.rotation.x = Math.PI / 2;
    intake.position.set(side * 1.15, 0.95, -2.45);
    g.add(intake);
    g.add(box(0.75, 0.75, 3.6, body, side * 1.15, 0.95, -0.4)); // engine bulge
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.14, 12),
      new THREE.MeshBasicMaterial({ color: 0xe8863d }),
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(side * 1.15, 0.95, 2.35);
    g.add(exhaust);
  }

  // Long swept, tapered outer wings with tip drag rudders.
  for (const side of [-1, 1] as const) {
    const inner = box(3.6, 0.5, 3.0, wing, side * 3.2, 0.85, 0.6);
    inner.rotation.y = side * 0.42;
    g.add(inner);
    const outer = box(3.4, 0.32, 1.9, wing, side * 6.1, 0.85, 1.9);
    outer.rotation.y = side * 0.42;
    g.add(outer);
    const tip = box(1.2, 0.22, 1.1, wing, side * 8.1, 0.85, 2.9);
    tip.rotation.y = side * 0.42;
    g.add(tip);
    const rudder = box(0.1, 0.55, 1.0, body, side * 8.4, 1.1, 3.0);
    rudder.rotation.y = side * 0.42;
    g.add(rudder);
    if (form.nation) addMarking(g, form.nation, side * 4.4, 1.12, 1.1);
  }

  // No propeller on a flying wing jet.
  const prop = box(0.01, 0.01, 0.01, body, 0, 0, 0);
  prop.visible = false;

  return { group: g, prop };
}

/** Enemy archetype geometry: generic mono/bi/tri forms for the red air force. */
export const ENEMY_FORMS: Record<PlaneShape, PlaneForm> = {
  mono: { fuselage: 'box', nose: 'flat', wings: [{ y: 0.95, span: 10.5, chord: 2.2 }] },
  bi: {
    fuselage: 'box', nose: 'flat', struts: 'quad',
    wings: [{ y: 1.95, span: 9, chord: 1.9 }, { y: 0.3, span: 8, chord: 1.7 }],
  },
  tri: {
    fuselage: 'box', nose: 'flat', struts: 'quad', axleWing: true,
    wings: [
      { y: 2.55, span: 7.4, chord: 1.6 },
      { y: 1.4, span: 8.4, chord: 1.8 },
      { y: 0.25, span: 7, chord: 1.6 },
    ],
  },
};

export const CANYON_WIDTH = 30;
export const CANYON_WALL_H = 16;

/** Height taper at the canyon ends so you can fly in and out over them. */
export function canyonTaper(relZ: number): number {
  return Math.max(0, Math.min((relZ + RIVER_LEN / 2) / 150, (RIVER_LEN / 2 - relZ) / 150, 1));
}

/**
 * Canyon: rock walls rising to elevated grassy mesas on both sides of a
 * gorge, with a rock floor and a stream. Wall height tapers to zero at the
 * ends so the gorge can be entered and exited along its length.
 */
export function makeCanyon(params: RiverParams): THREE.Group {
  const g = new THREE.Group();
  g.add(makeLaneStrip(params, CANYON_WIDTH, 0x6e6252, 0.02)); // rock floor
  g.add(makeLaneStrip(params, 4, 0x3d6b96, 0.07));            // stream

  const rock = new THREE.Color(0x7a6a52);
  const rockDark = new THREE.Color(0x60533f);
  const grass = new THREE.Color(0x6a8f4a);
  // Lateral profile per side: [x offset, height factor, color].
  const prof: [number, number, THREE.Color][] = [
    [CANYON_WIDTH / 2, 0, rockDark],
    [CANYON_WIDTH / 2 + 6, 1, rock],
    [CANYON_WIDTH / 2 + 44, 1, grass],
    [CANYON_WIDTH / 2 + 54, 0, grass],
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  const push = (pnt: number[], c: THREE.Color): void => {
    positions.push(pnt[0], pnt[1], pnt[2]);
    colors.push(c.r, c.g, c.b);
  };
  const step = 20;
  for (let z = -RIVER_LEN / 2; z < RIVER_LEN / 2; z += step) {
    const z1 = z + step;
    const c0 = riverXAt(params, z);
    const c1 = riverXAt(params, z1);
    const h0 = CANYON_WALL_H * canyonTaper(z);
    const h1 = CANYON_WALL_H * canyonTaper(z1);
    for (const side of [-1, 1]) {
      for (let i = 0; i < prof.length - 1; i++) {
        const [xa, ya, ca] = prof[i];
        const [xb, yb, cb] = prof[i + 1];
        const A = [c0 + side * xa, ya * h0, z];
        const B = [c1 + side * xa, ya * h1, z1];
        const C = [c1 + side * xb, yb * h1, z1];
        const D = [c0 + side * xb, yb * h0, z];
        push(A, ca); push(B, ca); push(C, cb);
        push(A, ca); push(C, cb); push(D, cb);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

/** Irregular pond or lake: jittered water polygon with a sandy shore ring. */
export function makeLake(): THREE.Group {
  const g = new THREE.Group();
  const n = 14;
  const rBase = 8 + Math.random() * 13;
  const radii: number[] = [];
  for (let i = 0; i < n; i++) radii.push(rBase * (0.7 + Math.random() * 0.55));

  const fan = (scale: number, y: number, color: number): THREE.Mesh => {
    const pos: number[] = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = (((i + 1) % n) / n) * Math.PI * 2;
      const r0 = radii[i] * scale;
      const r1 = radii[(i + 1) % n] * scale;
      pos.push(
        0, y, 0,
        Math.cos(a1) * r1, y, Math.sin(a1) * r1,
        Math.cos(a0) * r0, y, Math.sin(a0) * r0,
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }),
    );
    mesh.receiveShadow = true;
    return mesh;
  };

  g.add(fan(1.15, 0.03, 0x9a8d64)); // sandy shore
  g.add(fan(1, 0.06, 0x3d6b96));    // water
  return g;
}

/** Smooth rolling hill: a wide grassy dome (stretched a little along z). */
export function makeRollingHill(r: number, h: number, rz: number): THREE.Group {
  const g = new THREE.Group();
  const greens = [0x5f8046, 0x6a8c50, 0x557a40];
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    lambert(greens[Math.floor(Math.random() * greens.length)]),
  );
  dome.scale.set(r, h, rz);
  dome.castShadow = true;
  g.add(dome);
  return g;
}

/** Grassy hill with a rocky crown — a solid obstacle you must climb over. */
export function makeHill(r: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), lambert(0x5c7d44));
  base.position.y = h / 2;
  base.castShadow = true;
  g.add(base);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, h * 0.32, 8), lambert(0x8a8069));
  crown.position.y = h * 0.86;
  g.add(crown);
  return g;
}

/** Tall windmill; the sail cross (returned as barrel) spins until knocked out. */
export function makeWindmill(): AAGunModel {
  const g = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 9.5, 9), lambert(0xb8a88a));
  tower.position.y = 4.75;
  tower.castShadow = true;
  g.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.8, 9), lambert(0x6e5340));
  cap.position.y = 10.4;
  cap.castShadow = true;
  g.add(cap);
  g.add(box(1.1, 1.5, 0.15, 0x4a3c30, 0, 0.8, -2.1)); // door

  const sails = new THREE.Group();
  sails.position.set(0, 9.6, -2.2);
  for (let i = 0; i < 4; i++) {
    const holder = new THREE.Group();
    const blade = box(0.6, 4.4, 0.1, 0xd8d2c2, 0, 2.5, 0);
    holder.add(blade);
    holder.rotation.z = (i * Math.PI) / 2;
    sails.add(holder);
  }
  g.add(sails);
  return { group: g, barrel: sails };
}

/** Jagged lightning bolt from cloud height to the ground. */
export function makeLightning(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xeaf2ff });
  let x = 0, y = 48, z = 0;
  while (y > 2) {
    const ny = y - (5 + Math.random() * 6);
    const nx = x + (Math.random() - 0.5) * 8;
    const nz = z + (Math.random() - 0.5) * 3;
    const dir = new THREE.Vector3(nx - x, ny - y, nz - z);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5, dir.length(), 0.5), mat);
    seg.position.set((x + nx) / 2, (y + ny) / 2, (z + nz) / 2);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.add(seg);
    x = nx; y = ny; z = nz;
  }
  return g;
}

/** Big slow zeppelin: ellipsoid hull, tail fins, gondola with a pusher prop. */
export function makeBlimp(): PlaneModel {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), lambert(0x8e939b));
  hull.scale.set(3.1, 3.1, 9);
  hull.castShadow = true;
  g.add(hull);
  g.add(box(0.25, 3.6, 2.6, 0x767b83, 0, 0, 7.6));   // vertical fin
  g.add(box(4.8, 0.25, 2.6, 0x767b83, 0, 0, 7.6));   // horizontal fins
  g.add(box(1.5, 1.2, 4.4, 0x4d5157, 0, -3.5, 0));   // gondola
  const prop = box(0.12, 1.5, 0.08, 0x3c342a, 0, -3.5, 2.5);
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
  amp2: number;
  waveLen2: number;
  phase2: number;
  sideIn: -1 | 1;  // side the far end swings off to
  sideOut: -1 | 1; // side the near end swings off to
  edgePush?: number; // override the end swing distance (0 = ends stay in line)
}

export const RIVER_LEN = 2000;
export const RIVER_WIDTH = 14;
const EDGE_PUSH = 340;  // how far off-corridor the ends swing
const EDGE_RAMP = 280;  // over how many units the swing happens

const smooth01 = (t: number): number => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};

/**
 * X offset of the river centerline at a z relative to the river's center.
 * Two superimposed sine wanders make it drift off the play corridor and
 * return; both ends push far off to one side so the river enters and exits
 * the world laterally instead of stopping dead.
 */
export function riverXAt(p: RiverParams, relZ: number): number {
  const wander =
    p.amp * Math.sin((relZ * Math.PI * 2) / p.waveLen + p.phase) +
    p.amp2 * Math.sin((relZ * Math.PI * 2) / p.waveLen2 + p.phase2);
  const push = p.edgePush ?? EDGE_PUSH;
  const tIn = smooth01((-relZ - (RIVER_LEN / 2 - EDGE_RAMP)) / EDGE_RAMP);
  const tOut = smooth01((relZ - (RIVER_LEN / 2 - EDGE_RAMP)) / EDGE_RAMP);
  return wander + p.sideIn * push * tIn + p.sideOut * push * tOut;
}

/**
 * Winding lane strip (river or road) built as one vertex-strip mesh.
 * Edges are offset perpendicular to the local path direction so the lane
 * keeps a constant true width through every bend.
 */
function makeLaneStrip(params: RiverParams, width: number, color: number, y: number): THREE.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const step = 18;
  // Ends taper to a point so the lane doesn't cut off in a blunt square.
  const halfW = (z: number) =>
    (width / 2) *
    Math.max(0.05, Math.min((z + RIVER_LEN / 2) / 90, (RIVER_LEN / 2 - z) / 90, 1));
  // Unit normal (perpendicular in the ground plane) of the path at z.
  const edgeNormal = (z: number): { nx: number; nz: number } => {
    const dx = riverXAt(params, z + 6) - riverXAt(params, z - 6);
    const len = Math.hypot(dx, 12);
    return { nx: 12 / len, nz: -dx / len };
  };
  for (let z = -RIVER_LEN / 2; z < RIVER_LEN / 2; z += step) {
    const z1 = z + step;
    const c0 = riverXAt(params, z);
    const c1 = riverXAt(params, z1);
    const n0 = edgeNormal(z);
    const n1 = edgeNormal(z1);
    const w0 = halfW(z);
    const w1 = halfW(z1);
    const quad = [
      [c0 - n0.nx * w0, z - n0.nz * w0], [c1 - n1.nx * w1, z1 - n1.nz * w1], [c1 + n1.nx * w1, z1 + n1.nz * w1],
      [c0 - n0.nx * w0, z - n0.nz * w0], [c1 + n1.nx * w1, z1 + n1.nz * w1], [c0 + n0.nx * w0, z + n0.nz * w0],
    ];
    for (const [x, zz] of quad) {
      positions.push(x, y, zz);
      normals.push(0, 1, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  mesh.receiveShadow = true;
  return mesh;
}

export function makeRiver(params: RiverParams): THREE.Group {
  const g = new THREE.Group();
  g.add(makeLaneStrip(params, RIVER_WIDTH, 0x3d6b96, 0.06));
  return g;
}

/** Country road: dark shoulders, asphalt surface, and a bold dashed centerline. */
export function makeRoad(params: RiverParams): THREE.Group {
  const g = new THREE.Group();
  g.add(makeLaneStrip(params, 12, 0x4d5154, 0.06));   // dark edge/shoulder
  g.add(makeLaneStrip(params, 10.2, 0x6e7276, 0.08)); // asphalt surface
  for (let z = -RIVER_LEN / 2 + 80; z < RIVER_LEN / 2 - 80; z += 26) {
    const dx = riverXAt(params, z + 3) - riverXAt(params, z - 3);
    const dash = box(0.7, 0.04, 5.5, 0xe8e6da, riverXAt(params, z), 0.15, z);
    dash.rotation.y = Math.atan2(dx, 6);
    dash.castShadow = false;
    g.add(dash);
  }
  return g;
}

/** Small military truck for road traffic. */
export function makeCar(): THREE.Group {
  const g = new THREE.Group();
  const colors = [0x51602f, 0x6b4a3a, 0x4a5560, 0x7a6a45];
  const c = colors[Math.floor(Math.random() * colors.length)];
  g.add(box(1.6, 1.0, 3.4, c, 0, 0.75, 0.5));          // cargo body
  g.add(box(1.4, 0.55, 1.2, c, 0, 0.5, -1.6));         // hood
  g.add(box(1.25, 0.5, 0.8, 0x2b3238, 0, 1.05, -1.4)); // cab glass
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

/** Proper aerial bomb: cylindrical body, ogive nose, tapered tail with fins.
 *  Built nose-down (-y); rotate x by PI/2 to carry it level. */
export function makeBomb(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.15, 10), lambert(0x3a4046));
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), lambert(0x2f3540));
  nose.position.y = -0.58;
  nose.scale.y = 1.5;
  nose.castShadow = true;
  g.add(nose);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.14, 10), lambert(0xd6b93a));
  ring.position.y = -0.3;
  g.add(ring);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.16, 0.55, 10), lambert(0x4d5560));
  tail.position.y = 0.85;
  g.add(tail);
  g.add(box(0.95, 0.5, 0.06, 0x4d5560, 0, 1.05, 0)); // fins
  g.add(box(0.06, 0.5, 0.95, 0x4d5560, 0, 1.05, 0));
  return g;
}

/** Whitewashed village cottage. */
export function makeCottage(): THREE.Group {
  const g = new THREE.Group();
  const w = 4 + Math.random() * 2;
  const h = 2.8 + Math.random() * 0.8;
  const d = 4 + Math.random() * 2;
  g.add(box(w, h, d, 0xd8d2c2, 0, h / 2, 0));
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2, 4),
    lambert(Math.random() < 0.5 ? 0x8a4a3a : 0x9a7d4a),
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + 1;
  roof.castShadow = true;
  g.add(roof);
  g.add(box(1, 1.4, 0.15, 0x4a3c30, 0, 0.7, d / 2)); // door
  return g;
}

/** Village church: whitewashed nave with a spired bell tower. */
export function makeChurch(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(5, 4, 9, 0xd8d2c2, 0, 2, 0.8));
  const naveRoof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.4, 4), lambert(0x6e5f47));
  naveRoof.rotation.y = Math.PI / 4;
  naveRoof.scale.z = 1.7;
  naveRoof.position.set(0, 5.2, 0.8);
  naveRoof.castShadow = true;
  g.add(naveRoof);
  g.add(box(2.6, 7.5, 2.6, 0xcfc8b8, 0, 3.75, -4.4)); // tower
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2, 3.2, 4), lambert(0x5a4a42));
  spire.rotation.y = Math.PI / 4;
  spire.position.set(0, 9.1, -4.4);
  spire.castShadow = true;
  g.add(spire);
  return g;
}

/** Stone castle: curtain walls, corner towers with cone roofs, central keep. */
export function makeCastle(): THREE.Group {
  const g = new THREE.Group();
  const stone = 0x8a8d92;
  g.add(box(20, 5, 1.6, stone, 0, 2.5, -10));
  g.add(box(20, 5, 1.6, stone, 0, 2.5, 10));
  g.add(box(1.6, 5, 20, stone, -10, 2.5, 0));
  g.add(box(1.6, 5, 20, stone, 10, 2.5, 0));
  for (const tx of [-9.5, 9.5]) {
    for (const tz of [-9.5, 9.5]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 8.5, 9), lambert(0x7e8186));
      tower.position.set(tx, 4.25, tz);
      tower.castShadow = true;
      g.add(tower);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.7, 2.6, 9), lambert(0x5a4a42));
      cap.position.set(tx, 9.8, tz);
      cap.castShadow = true;
      g.add(cap);
    }
  }
  g.add(box(7, 9, 7, 0x6e7176, 0, 4.5, 0)); // keep
  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 3, 4), lambert(0x5a4a42));
  keepRoof.rotation.y = Math.PI / 4;
  keepRoof.position.y = 10.5;
  keepRoof.castShadow = true;
  g.add(keepRoof);
  g.add(box(3.2, 3.6, 1, 0x3a342c, 0, 1.8, 10.3)); // gate
  return g;
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
