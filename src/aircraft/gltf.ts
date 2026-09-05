import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { environment } from './skins';
import type { PlaneModel } from './types';

/**
 * Optional drop-in real models for the photoreal style. Put glTF files under
 * public/models/ and describe them in public/models/manifest.json:
 *
 *   { "spitfire": { "file": "spitfire.glb", "rotY": 3.1416 } }
 *
 * A loaded model is fitted automatically: it is scaled so its wingspan matches
 * the procedural airframe it replaces and centred on it. Use `rotY` when the
 * model's nose does not point toward -z, and `scale`/`x`/`y`/`z` for fine
 * adjustment. A missing manifest or file falls back silently to the procedural
 * photoreal build. See public/models/manifest.example.json.
 */
export interface RealModelEntry {
  file: string;
  scale?: number;
  rotY?: number;
  x?: number;
  y?: number;
  z?: number;
}

let manifest: Promise<Record<string, RealModelEntry> | null> | null = null;
const loader = new GLTFLoader();
const scenes = new Map<string, Promise<THREE.Group | null>>();

function url(path: string): string {
  return new URL(`models/${path}`, document.baseURI).toString();
}

export function realModelManifest(): Promise<Record<string, RealModelEntry> | null> {
  manifest ??= fetch(url('manifest.json'))
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, RealModelEntry>>) : null))
    .catch(() => null);
  return manifest;
}

function loadScene(entry: RealModelEntry): Promise<THREE.Group | null> {
  let p = scenes.get(entry.file);
  if (!p) {
    p = loader.loadAsync(url(entry.file))
      .then((gltf) => gltf.scene)
      .catch(() => null);
    scenes.set(entry.file, p);
  }
  return p;
}

/** Remember the procedural airframe's extents (at identity) so a real model can be fitted to them. */
export function rememberFit(model: PlaneModel): void {
  model.group.userData.fitBox = new THREE.Box3().setFromObject(model.group);
}

/** If a real model exists for this airframe id, swap it in over the procedural build. */
export function upgradeToRealModel(id: string, model: PlaneModel): void {
  void realModelManifest().then(async (m) => {
    const entry = m?.[id];
    if (!entry) return;
    const scene = await loadScene(entry);
    if (!scene) return;
    const fit = (model.group.userData.fitBox as THREE.Box3 | undefined) ?? new THREE.Box3().setFromObject(model.group);
    for (const child of [...model.group.children]) child.visible = false;

    const inst = scene.clone(true);
    inst.rotation.y = entry.rotY ?? 0;
    inst.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inst);
    const size = box.getSize(new THREE.Vector3());
    const want = fit.getSize(new THREE.Vector3());
    const s = (entry.scale ?? 1) * (Math.max(want.x, want.z) / Math.max(size.x, size.z, 1e-6));
    inst.scale.setScalar(s);
    inst.updateMatrixWorld(true);
    const centre = new THREE.Box3().setFromObject(inst).getCenter(new THREE.Vector3());
    const target = fit.getCenter(new THREE.Vector3());
    inst.position.set(
      target.x - centre.x + (entry.x ?? 0),
      target.y - centre.y + (entry.y ?? 0),
      target.z - centre.z + (entry.z ?? 0),
    );
    inst.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true;
      // Give downloaded PBR materials the same sky to reflect as the procedural skins.
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial && !m.envMap) {
          m.envMap = environment();
          m.envMapIntensity = 0.6;
          m.needsUpdate = true;
        }
      }
    });
    model.group.add(inst);
    model.group.userData.realModel = true;
  });
}
