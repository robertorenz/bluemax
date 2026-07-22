import * as THREE from 'three';
import { makeTree, makeCactus, makeSequoia, makeCow, makeSheep } from './models';

export const CHUNK_D = 240; // depth (z) of one terrain chunk
export const CHUNK_COUNT = 4;
const CHUNK_W = 720;
const COLS = 18;
const ROWS = 8;

/** Landscape regions the world drifts between as you fly. */
export type Biome = 'farmland' | 'forest' | 'meadow' | 'steppe' | 'alpine' | 'coast';

const SEAS = [0x2f5a86, 0x35648f, 0x2a5480];

const FIELD_GREENS = [0x6a8f4a, 0x7ba05b, 0x55803f, 0x91a05e, 0x4c6b3a];
const FOREST_FLOOR = [0x3f5c33, 0x46653a, 0x3a5530, 0x4c6b3f];
const MEADOWS = [0x74995a, 0x7fa363, 0x6f945b];
const STEPPES = [0x9a8f5e, 0xa89a66, 0x8a7f52, 0x94885a];
const SNOWS = [0xdfe6ea, 0xd2dae0, 0xc6cfd6];
const STRIPS = [0x7ba05b, 0x55803f];
const PLOWS = [0x8a6a48, 0x76583a];
const FLOWERS = [0xe8e4da, 0xd6b93a, 0xc4574a];

/**
 * One terrain chunk. The field grid's interior corners are jittered so plots
 * read as organic patchwork rather than a perfect checkerboard (edge corners
 * stay straight so chunks keep tiling seamlessly). Farmland mixes solid
 * fields with strip-farmed bands and plowed brown furrows; other biomes get
 * their own palettes and decoration.
 */
export function makeChunk(biome: Biome = 'farmland'): THREE.Group {
  const group = new THREE.Group();
  const cw = CHUNK_W / COLS;
  const cd = CHUNK_D / ROWS;
  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];
  const c = new THREE.Color();

  // Jittered grid corners.
  const gx: number[][] = [];
  const gz: number[][] = [];
  for (let r = 0; r <= ROWS; r++) {
    gx[r] = [];
    gz[r] = [];
    for (let col = 0; col <= COLS; col++) {
      const jC = col > 0 && col < COLS ? (Math.random() - 0.5) * cw * 0.5 : 0;
      const jR = r > 0 && r < ROWS ? (Math.random() - 0.5) * cd * 0.5 : 0;
      gx[r][col] = -CHUNK_W / 2 + col * cw + jC;
      gz[r][col] = -CHUNK_D / 2 + r * cd + jR;
    }
  }

  const quad = (
    ax: number, az: number, bx: number, bz: number,
    cx: number, cz: number, dx: number, dz: number,
    color: number,
  ): void => {
    c.setHex(color);
    // A-B along one edge, D-C along the opposite; wound to face up.
    const pts = [[ax, az], [dx, dz], [cx, cz], [ax, az], [cx, cz], [bx, bz]];
    for (const [x, z] of pts) {
      positions.push(x, 0, z);
      colors.push(c.r, c.g, c.b);
      normals.push(0, 1, 0);
    }
  };
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      const Ax = gx[r][col], Az = gz[r][col];
      const Bx = gx[r][col + 1], Bz = gz[r][col + 1];
      const Cx = gx[r + 1][col + 1], Cz = gz[r + 1][col + 1];
      const Dx = gx[r + 1][col], Dz = gz[r + 1][col];
      const roll = Math.random();

      if (biome === 'coast') {
        // Sea to the west, a sandy shore, farmland to the east.
        const cellMidX = (Ax + Bx + Cx + Dx) / 4;
        const shore = -60 + Math.sin((r + 1) * 1.7) * 16;
        const color =
          cellMidX < shore - 12 ? SEAS[Math.floor(Math.random() * SEAS.length)] :
          cellMidX < shore + 8 ? 0xc9b382 :
          FIELD_GREENS[Math.floor(Math.random() * FIELD_GREENS.length)];
        quad(Ax, Az, Bx, Bz, Cx, Cz, Dx, Dz, color);
      } else if (biome === 'farmland' && roll < 0.2) {
        // Strip farming: narrow medieval bands across the plot.
        const n = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const t0 = i / n;
          const t1 = (i + 1) / n;
          quad(
            lerp(Ax, Bx, t0), lerp(Az, Bz, t0),
            lerp(Ax, Bx, t1), lerp(Az, Bz, t1),
            lerp(Dx, Cx, t1), lerp(Dz, Cz, t1),
            lerp(Dx, Cx, t0), lerp(Dz, Cz, t0),
            STRIPS[i % 2],
          );
        }
      } else if (biome === 'farmland' && roll < 0.34) {
        // Plowed earth: brown furrows along the other axis.
        const n = 5 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const t0 = i / n;
          const t1 = (i + 1) / n;
          quad(
            lerp(Ax, Dx, t0), lerp(Az, Dz, t0),
            lerp(Bx, Cx, t0), lerp(Bz, Cz, t0),
            lerp(Bx, Cx, t1), lerp(Bz, Cz, t1),
            lerp(Ax, Dx, t1), lerp(Az, Dz, t1),
            PLOWS[i % 2],
          );
        }
      } else {
        const palette =
          biome === 'forest' ? FOREST_FLOOR :
          biome === 'meadow' ? MEADOWS :
          biome === 'steppe' ? STEPPES :
          biome === 'alpine' ? SNOWS : FIELD_GREENS;
        quad(Ax, Az, Bx, Bz, Cx, Cz, Dx, Dz, palette[Math.floor(Math.random() * palette.length)]);
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

  // Meadows get flower speckles.
  if (biome === 'meadow') {
    const fp: number[] = [];
    const fc: number[] = [];
    for (let i = 0; i < 70; i++) {
      const x = (Math.random() - 0.5) * CHUNK_W;
      const z = -CHUNK_D / 2 + Math.random() * CHUNK_D;
      const s = 0.4 + Math.random() * 0.4;
      c.setHex(FLOWERS[Math.floor(Math.random() * FLOWERS.length)]);
      const pts = [[x - s, z - s], [x - s, z + s], [x + s, z + s], [x - s, z - s], [x + s, z + s], [x + s, z - s]];
      for (const [px, pz] of pts) {
        fp.push(px, 0.05, pz);
        fc.push(c.r, c.g, c.b);
      }
    }
    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fGeo.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
    group.add(new THREE.Mesh(fGeo, new THREE.MeshBasicMaterial({ vertexColors: true })));
  }

  // Trees, tuned per biome (kept clear of the central target corridor).
  const treeCount =
    biome === 'forest' ? 48 + Math.floor(Math.random() * 18) :
    biome === 'alpine' ? 9 + Math.floor(Math.random() * 6) :
    biome === 'meadow' ? 3 + Math.floor(Math.random() * 4) :
    biome === 'steppe' ? 4 + Math.floor(Math.random() * 5) :
    7 + Math.floor(Math.random() * 5);
  for (let i = 0; i < treeCount; i++) {
    // The dry steppe grows cacti instead of trees.
    const tree = biome === 'steppe' && Math.random() < 0.8 ? makeCactus() : makeTree();
    // On the coast everything living stays on the landward (east) side.
    const side = biome === 'coast' ? 1 : Math.random() < 0.5 ? -1 : 1;
    const minX = biome === 'forest' ? 32 : 48;
    tree.position.set(
      side * (minX + Math.random() * (CHUNK_W / 2 - minX - 20)),
      0,
      -CHUNK_D / 2 + Math.random() * CHUNK_D,
    );
    group.add(tree);
  }

  // Every so often, a grove of giant sequoias towers over the country.
  if ((biome === 'forest' || biome === 'farmland' || biome === 'meadow') && Math.random() < 0.22) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const gx = side * (60 + Math.random() * 200);
    const gz = -CHUNK_D / 2 + 30 + Math.random() * (CHUNK_D - 60);
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const giant = makeSequoia();
      giant.position.set(gx + (Math.random() - 0.5) * 18, 0, gz + (Math.random() - 0.5) * 18);
      group.add(giant);
    }
  }

  // Livestock herds graze the open country.
  const herdCount =
    biome === 'meadow' ? 3 + Math.floor(Math.random() * 2) :
    biome === 'farmland' ? 2 + Math.floor(Math.random() * 2) :
    biome === 'coast' ? 1 :
    biome === 'steppe' ? 1 + Math.floor(Math.random() * 2) : 0;
  for (let h = 0; h < herdCount; h++) {
    const sheep = Math.random() < 0.45;
    const side = biome === 'coast' ? 1 : Math.random() < 0.5 ? -1 : 1;
    const hx = side * (30 + Math.random() * 240);
    const hz = -CHUNK_D / 2 + 20 + Math.random() * (CHUNK_D - 40);
    const animals = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < animals; i++) {
      const animal = sheep ? makeSheep() : makeCow();
      animal.position.set(
        hx + (Math.random() - 0.5) * 14,
        0,
        hz + (Math.random() - 0.5) * 14,
      );
      group.add(animal);
    }
  }

  return group;
}
