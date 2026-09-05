import { makePlaneClassic, makeEnemyBomberClassic } from './classic';
import { makePlaneDetailed, makeEnemyBomberDetailed } from './detailed';
import { clearSkinCache, setSkinCaching } from './skins';
import { upgradeToRealModel, rememberFit } from './gltf';
import type { PlaneForm, PlaneModel, PlaneShape, PlaneStyle } from './types';

export type { PlaneForm, PlaneModel, PlaneShape, PlaneStyle, Nation, WingSpec } from './types';
export { setSkinCaching, clearSkinCache };

const STYLE_KEY = 'bluemax-style';

export const PLANE_STYLES: { id: PlaneStyle; label: string; desc: string }[] = [
  { id: 'classic', label: 'Classic', desc: 'The original low-poly blocks' },
  { id: 'detailed', label: 'Detailed', desc: 'Lofted airframes, painted markings, working control surfaces' },
  { id: 'photoreal', label: 'Photoreal', desc: 'Weathered PBR skins, rivets, reflections (heavier)' },
];

function readStyle(): PlaneStyle {
  const s = localStorage.getItem(STYLE_KEY);
  return s === 'classic' || s === 'photoreal' || s === 'detailed' ? s : 'detailed';
}

let style: PlaneStyle = readStyle();

export function getPlaneStyle(): PlaneStyle {
  return style;
}

export function setPlaneStyle(s: PlaneStyle): void {
  if (s === style) return;
  style = s;
  localStorage.setItem(STYLE_KEY, s);
  clearSkinCache();
}

/**
 * Build an aircraft in the selected style. `id` is the hangar id (or an enemy
 * tag) so the photoreal style can swap in a real model when one is provided.
 */
export function makePlane(
  form: PlaneForm, body: number, wing: number, detail: number, id?: string, override?: PlaneStyle,
): PlaneModel {
  const s = override ?? style;
  if (s === 'classic') return makePlaneClassic(form, body, wing, detail);
  const model = makePlaneDetailed(form, body, wing, detail, s);
  if (s === 'photoreal' && id) {
    rememberFit(model);
    upgradeToRealModel(id, model);
  }
  return model;
}

export function makeEnemyBomber(override?: PlaneStyle): PlaneModel {
  const s = override ?? style;
  if (s === 'classic') return makeEnemyBomberClassic();
  const model = makeEnemyBomberDetailed(s);
  if (s === 'photoreal') {
    rememberFit(model);
    upgradeToRealModel('enemy-bomber', model);
  }
  return model;
}

/** Enemy archetype geometry: generic mono/bi/tri forms for the red air force. */
export const ENEMY_FORMS: Record<PlaneShape, PlaneForm> = {
  mono: {
    fuselage: 'box', nose: 'flat', era: 'ww1', nation: 'de', tail: 'comma', livery: 'enemy',
    wings: [{ y: 0.95, span: 10.5, chord: 2.2 }],
  },
  bi: {
    fuselage: 'box', nose: 'flat', struts: 'quad', era: 'ww1', nation: 'de', tail: 'fokker', livery: 'enemy',
    wings: [{ y: 1.95, span: 9, chord: 1.9 }, { y: 0.3, span: 8, chord: 1.7 }],
  },
  tri: {
    fuselage: 'box', nose: 'flat', struts: 'quad', axleWing: true, era: 'ww1', nation: 'de', tail: 'comma', livery: 'enemy',
    wings: [
      { y: 2.55, span: 7.4, chord: 1.6 },
      { y: 1.4, span: 8.4, chord: 1.8 },
      { y: 0.25, span: 7, chord: 1.6 },
    ],
  },
};
