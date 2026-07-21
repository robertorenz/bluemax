import Phaser from 'phaser';

/**
 * Procedurally generates every texture the game uses so the project
 * runs with zero external assets. Called once from the Boot scene.
 */
export function generateTextures(scene: Phaser.Scene): void {
  makeGroundTile(scene);
  makeRunway(scene);
  makePlane(scene, 'player', 0x4a6d8c, 0x7fa8c9, 0xd8e4ee);
  makePlane(scene, 'enemy', 0x8c4a45, 0xc47a6e, 0xeed8d4);
  makeBuilding(scene);
  makeAAGun(scene);
  makeBullet(scene, 'bullet', 0xf2d16b);
  makeBullet(scene, 'flak', 0xe8863d);
  makeBomb(scene);
  makeSpark(scene);
}

/** 256x256 seamless farmland tile — field grid with hedgerows and tree clusters. */
function makeGroundTile(scene: Phaser.Scene): void {
  const S = 256;
  const g = scene.add.graphics();
  g.fillStyle(0x55803f);
  g.fillRect(0, 0, S, S);

  // Field patches aligned to a 64px grid so the tile wraps seamlessly.
  const fieldColors = [0x6a8f4a, 0x7ba05b, 0x4c6b3a, 0x91a05e, 0x55803f];
  for (let cx = 0; cx < 4; cx++) {
    for (let cy = 0; cy < 4; cy++) {
      const color = fieldColors[(cx * 7 + cy * 3) % fieldColors.length];
      g.fillStyle(color);
      g.fillRect(cx * 64, cy * 64, 64, 64);
    }
  }
  // Hedgerow lines between fields.
  g.lineStyle(2, 0x3a5230, 0.9);
  for (let i = 0; i <= 4; i++) {
    g.lineBetween(i * 64, 0, i * 64, S);
    g.lineBetween(0, i * 64, S, i * 64);
  }
  // Tree clusters, kept away from tile edges so wrapping stays clean.
  g.fillStyle(0x2f4a28);
  const trees = [
    [40, 40], [50, 32], [180, 90], [190, 100], [172, 100],
    [90, 200], [100, 210], [220, 180], [140, 140], [148, 132],
  ];
  for (const [tx, ty] of trees) {
    g.fillCircle(tx, ty, 7);
  }
  g.generateTexture('ground', S, S);
  g.destroy();
}

/** Concrete runway strip with dashed centerline. */
function makeRunway(scene: Phaser.Scene): void {
  const W = 84, H = 300;
  const g = scene.add.graphics();
  g.fillStyle(0x6b6f72);
  g.fillRect(0, 0, W, H);
  g.lineStyle(3, 0x4d5154);
  g.strokeRect(1, 1, W - 2, H - 2);
  g.fillStyle(0xd8d8d2);
  for (let y = 14; y < H - 20; y += 34) {
    g.fillRect(W / 2 - 3, y, 6, 18);
  }
  // Threshold bars.
  for (const y of [4, H - 12]) {
    for (let x = 8; x < W - 8; x += 14) {
      g.fillRect(x, y, 8, 8);
    }
  }
  g.generateTexture('runway', W, H);
  g.destroy();
}

/** Top-down biplane pointing right (rotation 0). */
function makePlane(
  scene: Phaser.Scene,
  key: string,
  body: number,
  wing: number,
  detail: number,
): void {
  const W = 64, H = 48;
  const g = scene.add.graphics();

  // Lower wing (slightly darker, offset back for the biplane look).
  g.fillStyle(Phaser.Display.Color.IntegerToColor(wing).darken(20).color);
  g.fillRoundedRect(22, 2, 14, 44, 4);
  // Tailplane.
  g.fillStyle(wing);
  g.fillRoundedRect(2, 14, 10, 20, 3);
  // Fuselage.
  g.fillStyle(body);
  g.fillRoundedRect(2, 19, 54, 10, 5);
  // Upper wing.
  g.fillStyle(wing);
  g.fillRoundedRect(28, 0, 14, 48, 4);
  // Cockpit + engine cowl details.
  g.fillStyle(detail);
  g.fillCircle(24, 24, 4);
  g.fillStyle(0x2b3238);
  g.fillRect(53, 20, 4, 8);
  // Propeller disc.
  g.fillStyle(0xcfd6dc, 0.35);
  g.fillEllipse(59, 24, 6, 26);
  g.generateTexture(key, W, H);
  g.destroy();
}

function makeBuilding(scene: Phaser.Scene): void {
  const S = 48;
  const g = scene.add.graphics();
  g.fillStyle(0x8a7a5e);
  g.fillRect(4, 8, 40, 36);
  g.fillStyle(0x6e5f47);
  g.fillRect(4, 8, 40, 10); // roof ridge shadow
  g.fillStyle(0xa8562f);
  g.fillRect(0, 0, 48, 12); // roof
  g.fillStyle(0x3c342a);
  g.fillRect(12, 24, 8, 8);
  g.fillRect(28, 24, 8, 8);
  g.generateTexture('building', S, S);
  g.destroy();
}

function makeAAGun(scene: Phaser.Scene): void {
  const S = 36;
  const g = scene.add.graphics();
  g.fillStyle(0x5a5f52);
  g.fillCircle(18, 18, 13); // emplacement ring
  g.fillStyle(0x3d4238);
  g.fillCircle(18, 18, 8);
  g.fillStyle(0x2b2f28);
  g.fillRect(16, 2, 4, 18); // barrel
  g.generateTexture('aagun', S, S);
  g.destroy();
}

function makeBullet(scene: Phaser.Scene, key: string, color: number): void {
  const g = scene.add.graphics();
  g.fillStyle(color);
  g.fillRoundedRect(0, 0, 10, 4, 2);
  g.generateTexture(key, 10, 4);
  g.destroy();
}

function makeBomb(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0x2f3540);
  g.fillEllipse(5, 7, 8, 14);
  g.fillStyle(0x4d5560);
  g.fillRect(3, 0, 4, 3); // tail fin
  g.generateTexture('bomb', 10, 14);
  g.destroy();
}

function makeSpark(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0xffffff);
  g.fillCircle(4, 4, 4);
  g.generateTexture('spark', 8, 8);
  g.destroy();
}
