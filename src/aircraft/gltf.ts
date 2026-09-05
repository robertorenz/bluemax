import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { environment } from './skins';
import type { PlaneModel } from './types';

/**
 * Optional drop-in real models for the photoreal style. Put glTF files under
 * public/models/ and describe them in public/models/manifest.json (or run
 * `npm run models` to generate it):
 *
 *   { "spitfire": { "file": "spitfire/scene.gltf" } }
 *
 * A loaded model is fitted automatically: its wingspan is laid along x, the
 * nose is turned toward -z (the fin is assumed to be the tallest thing at one
 * end), it is scaled to the procedural airframe's span and centred on it.
 * `rotY` (radians) is applied on top when the guess is wrong; `scale`, `x`,
 * `y`, `z` fine-tune. A missing manifest or file falls back silently to the
 * procedural photoreal build.
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

/** Tallest vertex within the front and rear fifths of the model's length (world z). */
function endHeights(obj: THREE.Object3D, box: THREE.Box3): { front: number; rear: number } {
  const len = box.max.z - box.min.z;
  const frontZ = box.min.z + len * 0.2;
  const rearZ = box.max.z - len * 0.2;
  let front = -Infinity, rear = -Infinity;
  const v = new THREE.Vector3();
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position');
    if (!pos) return;
    const stride = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += stride) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.z < frontZ) front = Math.max(front, v.y);
      else if (v.z > rearZ) rear = Math.max(rear, v.y);
    }
  });
  return { front, rear };
}

const worldBox = (obj: THREE.Object3D): THREE.Box3 => {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
};

/**
 * Orient, scale and centre a loaded model onto the procedural airframe's box.
 * Exported for testing; `inst` must not have a parent yet.
 */
export function fitModel(inst: THREE.Object3D, fit: THREE.Box3, entry: Partial<RealModelEntry> = {}): void {
  inst.rotation.set(0, 0, 0);
  inst.scale.setScalar(1);
  inst.position.set(0, 0, 0);

  // Wingspan along x: if the model is longer than it is wide, it is lying sideways.
  let box = worldBox(inst);
  let size = box.getSize(new THREE.Vector3());
  let yaw = 0;
  if (size.z > size.x * 1.1) {
    yaw = Math.PI / 2;
    inst.rotation.y = yaw;
    box = worldBox(inst);
  }
  // Nose toward -z: the fin makes the tail the taller end.
  const ends = endHeights(inst, box);
  if (ends.front > ends.rear) {
    yaw += Math.PI;
    inst.rotation.y = yaw;
  }
  inst.rotation.y = yaw + (entry.rotY ?? 0);
  box = worldBox(inst);
  size = box.getSize(new THREE.Vector3());

  const want = fit.getSize(new THREE.Vector3());
  const s = (entry.scale ?? 1) * (Math.max(want.x, want.z) / Math.max(size.x, size.z, 1e-6));
  inst.scale.setScalar(s);
  const centre = worldBox(inst).getCenter(new THREE.Vector3());
  const target = fit.getCenter(new THREE.Vector3());
  inst.position.set(
    target.x - centre.x + (entry.x ?? 0),
    target.y - centre.y + (entry.y ?? 0),
    target.z - centre.z + (entry.z ?? 0),
  );
}

/** If a real model exists for this airframe id, swap it in over the procedural build. */
export function upgradeToRealModel(id: string, model: PlaneModel): void {
  void realModelManifest().then(async (m) => {
    const entry = m?.[id];
    if (!entry) return;
    const scene = await loadScene(entry);
    if (!scene) return;
    const fit = (model.group.userData.fitBox as THREE.Box3 | undefined) ?? new THREE.Box3().setFromObject(model.group);
    const inst = scene.clone(true);
    fitModel(inst, fit, entry);
    inst.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true;
      // Give downloaded PBR materials the same sky to reflect as the procedural skins.
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial && !mat.envMap) {
          mat.envMap = environment();
          mat.envMapIntensity = 0.6;
          mat.needsUpdate = true;
        }
      }
    });
    for (const child of [...model.group.children]) child.visible = false;
    model.group.add(inst);
    model.group.userData.realModel = true;
  });
}
