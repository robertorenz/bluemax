import * as THREE from 'three';
import { P } from './palette';
import { makeTree } from './models';

export const CHUNK_D = 240; // depth (z) of one terrain chunk
export const CHUNK_COUNT = 4;
// Wide enough that ultrawide/fullscreen windows never see the world's edge.
const CHUNK_W = 720;
const COLS = 18;
const ROWS = 8;

/** One farmland chunk: a single vertex-colored mesh of field quads, plus trees. */
export function makeChunk(): THREE.Group {
  const group = new THREE.Group();

  const cw = CHUNK_W / COLS;
  const cd = CHUNK_D / ROWS;
  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];
  const c = new THREE.Color();

  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      const x0 = -CHUNK_W / 2 + col * cw;
      const z0 = -CHUNK_D / 2 + r * cd;
      const x1 = x0 + cw;
      const z1 = z0 + cd;
      c.setHex(P.fields[Math.floor(Math.random() * P.fields.length)]);
      // Two CCW triangles per field cell (normal +y).
      const quad = [
        [x0, z0], [x0, z1], [x1, z1],
        [x0, z0], [x1, z1], [x1, z0],
      ];
      for (const [x, z] of quad) {
        positions.push(x, 0, z);
        colors.push(c.r, c.g, c.b);
        normals.push(0, 1, 0);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  group.add(mesh);

  // Tree clusters, kept clear of the central corridor where targets spawn.
  const treeCount = 7 + Math.floor(Math.random() * 5);
  for (let i = 0; i < treeCount; i++) {
    const tree = makeTree();
    const side = Math.random() < 0.5 ? -1 : 1;
    tree.position.set(
      side * (48 + Math.random() * 290),
      0,
      -CHUNK_D / 2 + Math.random() * CHUNK_D,
    );
    group.add(tree);
  }

  return group;
}
