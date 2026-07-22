import type { PlaneForm } from './models';

/** A pilot's aircraft: geometry recipe, livery, handling, armament, unlock cost. */
export interface PlaneDef {
  id: string;
  label: string;
  year: number;
  desc: string;
  form: PlaneForm;
  steer: number;
  climb: number;
  dive: number;
  bombs: number;
  gunMs: number;
  body: number;
  wing: number;
  detail: number;
  xp: number; // career score required to unlock
}

export type PlaneType = string;

/** The hangar, in unlock order. Career XP = cumulative score across all runs. */
export const PLANES: PlaneDef[] = [
  { id: 'eindecker', label: 'Fokker Eindecker', year: 1915, desc: 'Fast steering, weak climb',
    form: { fuselage: 'box', nose: 'flat', nation: 'de', dihedral: 0.02, guns: true, wings: [{ y: 0.95, span: 10.8, chord: 2.1 }] },
    steer: 58, climb: 11.5, dive: 20, bombs: 30, gunMs: 150,
    body: 0xb8a878, wing: 0xd6c79a, detail: 0x6b5f47, xp: 0 },
  { id: 'camel', label: 'Sopwith Camel', year: 1917, desc: 'Balanced and agile',
    form: { fuselage: 'box', nose: 'radial', struts: 'quad', canopy: 'hump', nation: 'uk', guns: true,
      wings: [{ y: 1.95, span: 9, chord: 1.9 }, { y: 0.3, span: 8, chord: 1.7 }] },
    steer: 48, climb: 14.5, dive: 17, bombs: 30, gunMs: 150,
    body: 0x5d6b3f, wing: 0x8a9460, detail: 0xd8e4ee, xp: 0 },
  { id: 'dr1', label: 'Fokker Dr.I', year: 1917, desc: 'Climbs like a demon',
    form: { fuselage: 'box', nose: 'flat', struts: 'quad', axleWing: true, nation: 'de', dihedral: 0, guns: true,
      wings: [
        { y: 2.55, span: 7.4, chord: 1.6 },
        { y: 1.4, span: 8.4, chord: 1.8 },
        { y: 0.25, span: 7, chord: 1.6 },
      ] },
    steer: 38, climb: 17.5, dive: 15, bombs: 30, gunMs: 150,
    body: 0x4a6d8c, wing: 0x7fa8c9, detail: 0xd8e4ee, xp: 0 },
  { id: 'albatros', label: 'Albatros D.III', year: 1917, desc: 'Quick guns, light bomb load',
    form: { fuselage: 'round', nose: 'spinner', struts: 'pair', nation: 'de', guns: true, exhaust: true,
      wings: [{ y: 1.7, span: 9.4, chord: 1.7, stagger: -0.25 }, { y: 0.35, span: 8.2, chord: 1.4 }] },
    steer: 52, climb: 13, dive: 19, bombs: 24, gunMs: 125,
    body: 0x6e7f6a, wing: 0x9aa98e, detail: 0x3c4a3a, xp: 2000 },
  { id: 'spad', label: 'SPAD S.XIII', year: 1917, desc: 'Dives hard, sturdy gun platform',
    form: { fuselage: 'box', nose: 'flat', struts: 'quad', headrest: true, nation: 'fr', guns: true,
      wings: [{ y: 1.8, span: 9.2, chord: 1.8, stagger: -0.1 }, { y: 0.3, span: 8.6, chord: 1.6 }] },
    steer: 54, climb: 13.5, dive: 20, bombs: 26, gunMs: 130,
    body: 0x8a7a4a, wing: 0xb8a86a, detail: 0x384048, xp: 4000 },
  { id: 'soptri', label: 'Sopwith Triplane', year: 1916, desc: 'The original three-decker climber',
    form: { fuselage: 'slim', nose: 'radial', struts: 'quad', nation: 'uk', guns: true,
      wings: [
        { y: 2.5, span: 8.2, chord: 1.3 },
        { y: 1.4, span: 8.8, chord: 1.4 },
        { y: 0.3, span: 7.8, chord: 1.3 },
      ] },
    steer: 42, climb: 18, dive: 16, bombs: 30, gunMs: 140,
    body: 0x6b5340, wing: 0x9a7d5c, detail: 0xd8e4ee, xp: 6500 },
  { id: 'bristol', label: 'Bristol F.2', year: 1917, desc: 'Two-seater: heavy bomb load',
    form: { fuselage: 'deep', nose: 'flat', struts: 'quad', gunner: true, nation: 'uk', guns: true,
      wings: [{ y: 2.05, span: 11, chord: 1.9 }, { y: 0.1, span: 10, chord: 1.7 }] },
    steer: 46, climb: 14, dive: 18, bombs: 34, gunMs: 145,
    body: 0x4f5d44, wing: 0x7a8a68, detail: 0xd8e4ee, xp: 9000 },
  { id: 'd7', label: 'Fokker D.VII', year: 1918, desc: 'The best all-round of the Great War',
    form: { fuselage: 'box', nose: 'flat', struts: 'quad', nation: 'de', guns: true,
      wings: [{ y: 1.95, span: 9.6, chord: 2.0 }, { y: 0.35, span: 8.6, chord: 1.8 }] },
    steer: 50, climb: 16, dive: 18, bombs: 30, gunMs: 130,
    body: 0x3f4a68, wing: 0x6a7899, detail: 0xd8e4ee, xp: 12000 },
  { id: 'p26', label: 'P-26 Peashooter', year: 1932, desc: 'Interwar speedster',
    form: { fuselage: 'box', nose: 'radial', gear: 'spat', headrest: true, nation: 'us', dihedral: 0.05, guns: true,
      wings: [{ y: 0.55, span: 9.8, chord: 1.9 }] },
    steer: 56, climb: 14, dive: 21, bombs: 28, gunMs: 120,
    body: 0x2a5a8c, wing: 0xd6b93a, detail: 0x1e3c5c, xp: 16000 },
  { id: 'gladiator', label: 'Gloster Gladiator', year: 1937, desc: 'The last great biplane',
    form: { fuselage: 'box', nose: 'radial', struts: 'pair', canopy: 'closed', gear: 'spat', nation: 'uk', dihedral: 0.04, guns: true,
      wings: [{ y: 1.95, span: 9.4, chord: 1.7 }, { y: 0.3, span: 8.2, chord: 1.5 }] },
    steer: 50, climb: 16.5, dive: 19, bombs: 30, gunMs: 125,
    body: 0x5a6b5a, wing: 0x8b9b83, detail: 0xd8e4ee, xp: 20000 },
  { id: 'i16', label: 'Polikarpov I-16', year: 1934, desc: 'Stubby, twitchy, fast',
    form: { fuselage: 'stubby', nose: 'radial', headrest: true, nation: 'ussr', dihedral: 0.06,
      wings: [{ y: 0.55, span: 9.4, chord: 2.0 }] },
    steer: 58, climb: 15, dive: 22, bombs: 28, gunMs: 115,
    body: 0x4a6b4a, wing: 0x87a06b, detail: 0x2f4a2f, xp: 25000 },
  { id: 'spitfire', label: 'Spitfire Mk I', year: 1938, desc: 'Legendary handling',
    form: { fuselage: 'slim', nose: 'spinner', canopy: 'closed', scoop: true, nation: 'uk', dihedral: 0.08, exhaust: true,
      // Two overlapped spans approximate the elliptical wing.
      wings: [{ y: 0.5, span: 11.4, chord: 2.0 }, { y: 0.52, span: 7.2, chord: 2.8 }] },
    steer: 60, climb: 17, dive: 22, bombs: 30, gunMs: 105,
    body: 0x4a5d43, wing: 0x6f7f5a, detail: 0xb8c4cc, xp: 30000 },
  { id: 'bf109', label: 'Bf 109 E', year: 1939, desc: 'Ruthless diving attacker',
    form: { fuselage: 'slim', nose: 'spinner', canopy: 'closed', nation: 'de', dihedral: 0.07, exhaust: true,
      wings: [{ y: 0.5, span: 9.8, chord: 2.1 }] },
    steer: 58, climb: 16, dive: 23, bombs: 28, gunMs: 110,
    body: 0x5a6470, wing: 0x828c98, detail: 0x3a424c, xp: 36000 },
  { id: 'p40', label: 'P-40 Flying Tiger', year: 1941, desc: 'Shark mouth, heavy bomb load',
    form: { fuselage: 'deep', nose: 'chin', mouth: true, canopy: 'closed', nation: 'us', dihedral: 0.07, exhaust: true,
      wings: [{ y: 0.5, span: 11, chord: 2.5 }] },
    steer: 55, climb: 15, dive: 21, bombs: 36, gunMs: 115,
    body: 0x55663f, wing: 0x6b7c4d, detail: 0xd8e4ee, xp: 43000 },
  { id: 'p51', label: 'P-51 Mustang', year: 1944, desc: 'Silver bullet — the finest of all',
    form: { fuselage: 'slim', nose: 'spinner', canopy: 'bubble', scoop: true, nation: 'us', dihedral: 0.09, exhaust: true,
      wings: [{ y: 0.5, span: 11, chord: 2.2 }] },
    steer: 62, climb: 17.5, dive: 24, bombs: 32, gunMs: 100,
    body: 0x9aa2ab, wing: 0xc2c9d1, detail: 0x4a5560, xp: 50000 },
];

export const PLANE_MAP: Record<string, PlaneDef> =
  Object.fromEntries(PLANES.map((p) => [p.id, p]));

export const DEFAULT_PLANE = 'camel';
