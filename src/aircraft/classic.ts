import * as THREE from 'three';
import type { PlaneForm, PlaneModel, Nation } from './types';

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
export function makePlaneClassic(form: PlaneForm, body: number, wing: number, detail: number): PlaneModel {
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


/** Twin-engine enemy bomber with a glass nose. */
export function makeEnemyBomberClassic(): PlaneModel {
  const g = new THREE.Group();
  g.add(box(1.6, 1.5, 8, 0x5a5f52, 0, 1.0, 0.3));
  g.add(box(16, 0.3, 3, 0x6b7060, 0, 1.2, -0.5));
  g.add(box(6.5, 0.2, 1.4, 0x6b7060, 0, 1.6, 3.9));
  for (const s of [-1, 1]) g.add(box(0.15, 1.4, 1.2, 0x5a5f52, s * 3, 2.1, 3.9));
  let prop!: THREE.Mesh;
  let prop2: THREE.Mesh | undefined;
  for (const s of [-1, 1]) {
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.5, 10), lambert(0x4a4f44));
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(s * 3.4, 1.1, -1.5);
    cowl.castShadow = true;
    g.add(cowl);
    const blade = box(0.16, 2.4, 0.1, 0x3c342a, s * 3.4, 1.1, -2.35);
    g.add(blade);
    if (s < 0) prop = blade;
    else prop2 = blade;
  }
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x7fa8c9, transparent: true, opacity: 0.85 }),
  );
  nose.position.set(0, 1.0, -3.7);
  g.add(nose);
  return { group: g, prop, prop2 };
}
