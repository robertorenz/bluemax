import Phaser from 'phaser';
import { generateTextures } from '../textures';
import { UI, FONT } from '../colors';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    generateTextures(this);

    const { width: W, height: H } = this.scale;

    // Scrolling ground behind the menu for atmosphere.
    const ground = this.add.tileSprite(W / 2, H / 2, W, H, 'ground').setAlpha(0.35);
    this.events.on('preupdate', () => {
      ground.tilePositionX += 0.4;
      ground.tilePositionY -= 0.4;
    });
    this.add.rectangle(W / 2, H / 2, W, H, UI.bg, 0.72);

    // Title panel.
    const panel = this.add.rectangle(W / 2, H / 2, 560, 420, UI.panel, 0.96);
    panel.setStrokeStyle(2, UI.panelBorder);

    this.add
      .text(W / 2, H / 2 - 150, 'BLUE MAX', {
        fontFamily: FONT,
        fontSize: '56px',
        fontStyle: 'bold',
        color: UI.accentText,
        letterSpacing: 10,
      })
      .setOrigin(0.5);
    this.add
      .text(W / 2, H / 2 - 102, 'A modernized homage to the 1983 classic', {
        fontFamily: FONT,
        fontSize: '16px',
        color: UI.textDim,
      })
      .setOrigin(0.5);

    this.add.image(W / 2, H / 2 - 40, 'player').setRotation(-Math.PI / 4).setScale(1.3);

    const controls = [
      ['← →', 'Steer'],
      ['↑ ↓', 'Climb / Dive'],
      ['SPACE', 'Machine guns'],
      ['B', 'Drop bomb'],
      ['', ''],
      ['Bomb targets, dogfight at matching altitude,', ''],
      ['and make low passes over runways to refuel.', ''],
    ];
    controls.forEach(([key, desc], i) => {
      const y = H / 2 + 14 + i * 24;
      if (desc) {
        this.add.text(W / 2 - 120, y, key, {
          fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: UI.accentText,
        }).setOrigin(0, 0.5);
        this.add.text(W / 2 - 30, y, desc, {
          fontFamily: FONT, fontSize: '15px', color: UI.text,
        }).setOrigin(0, 0.5);
      } else if (key) {
        this.add.text(W / 2, y, key, {
          fontFamily: FONT, fontSize: '14px', color: UI.textDim,
        }).setOrigin(0.5);
      }
    });

    const start = this.add
      .text(W / 2, H / 2 + 180, '▶  PRESS ENTER TO FLY', {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        color: UI.accentText,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.tweens.add({
      targets: start,
      alpha: 0.45,
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    const begin = () => this.scene.start('Game');
    start.on('pointerdown', begin);
    this.input.keyboard!.once('keydown-ENTER', begin);
  }
}
