#!/usr/bin/env node
/**
 * Build public/models/manifest.json from whatever model folders exist.
 *
 * Drop each downloaded model into public/models/<hangar id>/ (for example the
 * unzipped Sketchfab folder with scene.gltf + scene.bin + textures/), or save a
 * single public/models/<id>.glb, then run `npm run models`. Existing rotY /
 * scale / x / y / z tweaks in manifest.json are preserved; source credits are
 * carried over from manifest.example.json.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'models');
const examplePath = join(dir, 'manifest.example.json');
const manifestPath = join(dir, 'manifest.json');

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});
const example = readJson(examplePath);
const previous = readJson(manifestPath);

/** First .glb / .gltf inside a folder (searching one level of subfolders too). */
function findModel(folder) {
  const entries = readdirSync(folder);
  const hit = entries.find((f) => /\.(glb|gltf)$/i.test(f));
  if (hit) return hit;
  for (const f of entries) {
    const sub = join(folder, f);
    if (statSync(sub).isDirectory()) {
      const inner = findModel(sub);
      if (inner) return `${f}/${inner}`;
    }
  }
  return null;
}

const manifest = {};
const found = [];
for (const name of readdirSync(dir)) {
  if (name.startsWith('manifest')) continue;
  const full = join(dir, name);
  let id;
  let file;
  if (statSync(full).isDirectory()) {
    const inner = findModel(full);
    if (!inner) continue;
    id = name;
    file = `${name}/${inner}`;
  } else if (/\.(glb|gltf)$/i.test(name)) {
    id = name.replace(/\.(glb|gltf)$/i, '');
    file = name;
  } else {
    continue;
  }
  const keep = previous[id] ?? {};
  manifest[id] = {
    file,
    rotY: keep.rotY ?? example[id]?.rotY ?? 0,
    ...(keep.scale != null ? { scale: keep.scale } : {}),
    ...(keep.x != null ? { x: keep.x } : {}),
    ...(keep.y != null ? { y: keep.y } : {}),
    ...(keep.z != null ? { z: keep.z } : {}),
    ...(example[id]?._source ? { _source: example[id]._source } : {}),
  };
  found.push(`${id.padEnd(10)} -> ${file}`);
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
if (found.length) {
  console.log(`Wrote public/models/manifest.json with ${found.length} model(s):`);
  for (const line of found) console.log('  ' + line);
  console.log('If a plane faces backwards, set its "rotY" to 3.1416 in manifest.json and rerun the game.');
} else {
  console.log('No models found. Put each model in public/models/<hangar id>/ (e.g. public/models/spitfire/scene.gltf) and rerun.');
}
