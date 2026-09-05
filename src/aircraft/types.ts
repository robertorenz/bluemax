import * as THREE from 'three';

/** Enemy archetype ids kept for the red air force. */
export type PlaneShape = 'mono' | 'bi' | 'tri';

export type Nation = 'uk' | 'de' | 'fr' | 'us' | 'ussr';

/** Which generation of models to build. Persisted in localStorage. */
export type PlaneStyle = 'classic' | 'detailed' | 'photoreal';

/** One wing (or wing pair for a biplane/triplane) in the recipe. */
export interface WingSpec {
  y: number;
  span: number;
  chord: number;
  stagger?: number;
  /** Outline: constant chord with rounded tips (WWI), straight taper, or elliptical. */
  planform?: 'rect' | 'taper' | 'elliptical';
  /** Tip/root chord ratio for 'taper'. */
  taper?: number;
  /** Leading-edge sweep, radians (positive = swept back). */
  sweep?: number;
  /** Thickness/chord ratio. */
  thick?: number;
  /** Per-wing dihedral override, radians. */
  dihedral?: number;
  /** Carry ailerons (default: the top wing only). */
  ailerons?: boolean;
}

/** Geometry recipe for one aircraft — enough knobs to make each type recognizable. */
export interface PlaneForm {
  fuselage: 'box' | 'round' | 'slim' | 'deep' | 'stubby' | 'p38' | 'tbf' | 'me262' | 'ho229' | 'bomber';
  nose: 'flat' | 'spinner' | 'radial' | 'chin';
  wings: WingSpec[];
  /** Wing recipe for the lofted builders when the classic boxes need a different one. */
  wingsDetailed?: WingSpec[];
  struts?: 'none' | 'pair' | 'quad';
  gear?: 'open' | 'spat' | 'retract';
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
  // --- detailed/photoreal builders only ---
  era?: 'ww1' | 'ww2';                 // insignia style
  tail?: 'comma' | 'fokker' | 'rounded' | 'square' | 'angular' | 'tall';
  finScale?: number;                   // fin height multiplier
  blades?: 2 | 3 | 4;                  // propeller blade count
  cylinders?: boolean;                 // exposed inline cylinder heads on the nose
  metal?: boolean;                     // bare-metal finish (photoreal reflections)
  wires?: boolean;                     // rigging wires between the wings
  length?: number;                     // fuselage length scale
}

/** A built aircraft plus its animatable parts. Absent parts mean "not on this airframe". */
export interface PlaneModel {
  group: THREE.Group;
  /** Spun about local z by the game. */
  prop: THREE.Object3D;
  prop2?: THREE.Object3D; // twin-engine types
  /** Blur discs behind the props; opacity follows engine speed. */
  propDiscs?: THREE.Mesh[];
  /** Control-surface pivots. rotation.x on ailerons/elevators (+ = trailing edge down), rotation.y on rudders. */
  aileronsL?: THREE.Object3D[];
  aileronsR?: THREE.Object3D[];
  elevators?: THREE.Object3D[];
  rudders?: THREE.Object3D[];
  /** Retractable undercarriage — hidden in cruise, shown for landing and takeoff. */
  gear?: THREE.Group;
  /** Exhaust flames to flicker while the engine runs. */
  flames?: THREE.Object3D[];
  /** Muzzle-flash meshes, hidden until the guns fire. */
  muzzles?: THREE.Object3D[];
  /** Wing half groups (userData.side = -1 | 1) for a touch of flex under load. */
  wingHalves?: THREE.Object3D[];
}
