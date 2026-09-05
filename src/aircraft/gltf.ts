import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PlaneModel } from './types';

/**
 * Optional drop-in real models for the photoreal style. Put glTF files under
 * public/models/ and describe them in public/models/manifest.json:
 *
 *   { "spitfire": { "file": "spitfire.glb", "scale": 1.0, "rotY": 3.1416, "y": 0, "z": 0 } }
 *
 * Models should face -z at scale 1 (one unit ~ one metre of a ~7 m fighter);
 * use scale/rotY/y/z to fit. Missing manifest or files fall back silently to
 * the procedural photoreal build.
 */
export interface RealModelEntry {
  file: string;
  scale?: number;
  rotY?: number;
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

/** If a real model exists for this airframe id, swap it in over the procedural build. */
export function upgradeToRealModel(id: string, model: PlaneModel): void {
  void realModelManifest().then(async (m) => {
    const entry = m?.[id];
    if (!entry) return;
    const scene = await loadScene(entry);
    if (!scene) return;
    for (const child of [...model.group.children]) child.visible = false;
    const inst = scene.clone(true);
    inst.scale.setScalar(entry.scale ?? 1);
    inst.rotation.y = entry.rotY ?? 0;
    inst.position.set(0, entry.y ?? 0, entry.z ?? 0);
    inst.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    model.group.add(inst);
    model.group.userData.realModel = true;
  });
}
