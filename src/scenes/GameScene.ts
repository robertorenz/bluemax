import Phaser from 'phaser';
import { UI, FONT } from '../colors';

const SCROLL = 90; // world scroll speed, px/s along each diagonal axis
const MAX_ALT = 100;

interface AirEnemy {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  alt: number;
  vx: number;
  vy: number;
  wobble: number;
  hp: number;
  fireAt: number;
}

interface GroundObj {
  sprite: Phaser.GameObjects.Image;
  kind: 'building' | 'aagun' | 'runway';
  hp: number;
  fireAt: number;
}

interface Bullet {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  alt: number;
  hostile: boolean;
  dieAt: number;
}

interface Bomb {
  sprite: Phaser.GameObjects.Image;
  landAt: number;
  totalFall: number;
}

export class GameScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.TileSprite;
  private player!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Image;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyFire!: Phaser.Input.Keyboard.Key;
  private keyBomb!: Phaser.Input.Keyboard.Key;

  private alt = 60;
  private fuel = 100;
  private lives = 3;
  private score = 0;
  private invulnUntil = 0;
  private nextGunAt = 0;
  private nextBombAt = 0;
  private nextEnemyAt = 0;
  private nextGroundAt = 0;
  private nextRunwayAt = 0;
  private over = false;

  private enemies: AirEnemy[] = [];
  private groundObjs: GroundObj[] = [];
  private bullets: Bullet[] = [];
  private bombs: Bomb[] = [];

  private scoreText!: Phaser.GameObjects.Text;
  private altText!: Phaser.GameObjects.Text;
  private fuelBar!: Phaser.GameObjects.Rectangle;
  private altBar!: Phaser.GameObjects.Rectangle;
  private livesIcons: Phaser.GameObjects.Image[] = [];
  private refuelText!: Phaser.GameObjects.Text;

  constructor() {
    super('Game');
  }

  create(): void {
    const { width: W, height: H } = this.scale;
    this.resetState();

    this.ground = this.add.tileSprite(W / 2, H / 2, W, H, 'ground');

    this.playerShadow = this.add.image(0, 0, 'player').setTint(0x000000).setAlpha(0.22);
    this.player = this.add.image(W * 0.32, H * 0.62, 'player').setDepth(10);
    this.playerShadow.setRotation(-Math.PI / 4);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyFire = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyBomb = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B);

    this.buildHud();
  }

  private resetState(): void {
    this.alt = 60;
    this.fuel = 100;
    this.lives = 3;
    this.score = 0;
    this.over = false;
    this.invulnUntil = 0;
    this.nextEnemyAt = 2000;
    this.nextGroundAt = 1000;
    this.nextRunwayAt = 14000;
    this.enemies = [];
    this.groundObjs = [];
    this.bullets = [];
    this.bombs = [];
    this.livesIcons = [];
  }

  // ---------------------------------------------------------------- HUD

  private buildHud(): void {
    const { width: W } = this.scale;
    const hud = this.add.container(0, 0).setDepth(100);

    const bar = this.add.rectangle(W / 2, 24, W, 48, UI.panel, 0.88);
    bar.setStrokeStyle(1, UI.panelBorder);
    hud.add(bar);

    this.scoreText = this.add.text(16, 14, 'SCORE 0', {
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: UI.text,
    });
    hud.add(this.scoreText);

    for (let i = 0; i < 3; i++) {
      const icon = this.add.image(170 + i * 30, 24, 'player').setScale(0.35).setRotation(-Math.PI / 4);
      this.livesIcons.push(icon);
      hud.add(icon);
    }

    // Fuel gauge.
    hud.add(this.add.text(W - 250, 8, 'FUEL', {
      fontFamily: FONT, fontSize: '11px', color: UI.textDim,
    }));
    const fuelBg = this.add.rectangle(W - 130, 14, 220, 10, 0x0e161e).setOrigin(0.5, 0.5);
    fuelBg.setStrokeStyle(1, UI.panelBorder);
    this.fuelBar = this.add.rectangle(W - 239, 10, 218, 8, UI.good).setOrigin(0, 0);
    hud.add(fuelBg);
    hud.add(this.fuelBar);

    // Altitude gauge.
    hud.add(this.add.text(W - 250, 26, 'ALT', {
      fontFamily: FONT, fontSize: '11px', color: UI.textDim,
    }));
    const altBg = this.add.rectangle(W - 130, 34, 220, 10, 0x0e161e).setOrigin(0.5, 0.5);
    altBg.setStrokeStyle(1, UI.panelBorder);
    this.altBar = this.add.rectangle(W - 239, 30, 218, 8, UI.steel).setOrigin(0, 0);
    hud.add(altBg);
    hud.add(this.altBar);

    this.altText = this.add.text(W - 290, 24, '60', {
      fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: UI.text,
    }).setOrigin(0.5);
    hud.add(this.altText);

    this.refuelText = this.add.text(this.scale.width / 2, 70, 'REFUELING', {
      fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: UI.accentText,
    }).setOrigin(0.5).setVisible(false).setDepth(100);
  }

  private updateHud(): void {
    this.scoreText.setText(`SCORE ${this.score}`);
    this.fuelBar.width = Math.max(0, (this.fuel / 100) * 218);
    this.fuelBar.fillColor = this.fuel < 25 ? UI.danger : UI.good;
    this.altBar.width = (this.alt / MAX_ALT) * 218;
    this.altText.setText(String(Math.round(this.alt)));
    this.livesIcons.forEach((icon, i) => icon.setVisible(i < this.lives));
  }

  // ---------------------------------------------------------------- update

  update(time: number, deltaMs: number): void {
    if (this.over) return;
    const dt = deltaMs / 1000;
    const { width: W, height: H } = this.scale;

    // Diagonal scroll: world drifts to the bottom-left, plane flies up-right.
    this.ground.tilePositionX += SCROLL * dt;
    this.ground.tilePositionY -= SCROLL * dt;

    this.updatePlayer(time, dt, W, H);
    this.updateSpawns(time, W, H);
    this.updateEnemies(time, dt, H);
    this.updateGroundObjs(time, dt);
    this.updateBullets(time, dt, W, H);
    this.updateBombs(time, dt);
    this.updateFuel(dt);
    this.updateHud();
  }

  private updatePlayer(time: number, dt: number, W: number, H: number): void {
    const speed = 260;
    let bank = 0;

    if (this.cursors.left.isDown) {
      this.player.x -= speed * dt;
      bank = -0.22;
    } else if (this.cursors.right.isDown) {
      this.player.x += speed * dt;
      bank = 0.22;
    }
    if (this.cursors.up.isDown) this.alt = Math.min(MAX_ALT, this.alt + 40 * dt);
    else if (this.cursors.down.isDown) this.alt -= 45 * dt;

    this.player.x = Phaser.Math.Clamp(this.player.x, 50, W - 120);
    this.player.rotation = Phaser.Math.Linear(this.player.rotation, -Math.PI / 4 + bank, 0.15);
    this.player.y = H * 0.62 - this.alt * 0.35;
    this.player.setScale(0.85 + (this.alt / MAX_ALT) * 0.3);

    // Shadow projects onto the ground, offset down-left with altitude.
    this.playerShadow.x = this.player.x - this.alt * 0.55;
    this.playerShadow.y = H * 0.62 + 20 + this.alt * 0.18;
    this.playerShadow.setScale(this.player.scaleX * 0.9);
    this.playerShadow.setAlpha(0.28 - (this.alt / MAX_ALT) * 0.14);

    // Ground contact: crash unless it's a low pass over a runway.
    if (this.alt <= 0) {
      this.alt = 0;
      if (!this.overRunway()) {
        this.playerHit(time, true);
        this.alt = 40;
      }
    }

    // Weapons.
    if (this.keyFire.isDown && time > this.nextGunAt) {
      this.nextGunAt = time + 160;
      this.spawnBullet(this.player.x + 24, this.player.y - 24, false, this.alt);
    }
    if (this.keyBomb.isDown && time > this.nextBombAt && this.alt > 5) {
      this.nextBombAt = time + 700;
      this.dropBomb(time);
    }

    // Damage flash.
    this.player.setAlpha(time < this.invulnUntil && Math.floor(time / 80) % 2 === 0 ? 0.3 : 1);
  }

  private updateFuel(dt: number): void {
    if (this.alt < 20 && this.overRunway()) {
      this.fuel = Math.min(100, this.fuel + 22 * dt);
      this.refuelText.setVisible(true);
    } else {
      this.fuel -= 1.4 * dt;
      this.refuelText.setVisible(false);
    }
    if (this.fuel <= 0) {
      this.fuel = 0;
      // Engine out — forced descent.
      this.alt -= 18 * dt;
      if (this.alt <= 0 && !this.overRunway()) {
        this.gameOver('OUT OF FUEL');
      }
    }
  }

  private overRunway(): boolean {
    return this.groundObjs.some(
      (o) =>
        o.kind === 'runway' &&
        Math.abs(o.sprite.x - this.playerShadow.x) < 46 &&
        Math.abs(o.sprite.y - this.playerShadow.y) < 150,
    );
  }

  // ---------------------------------------------------------------- spawning

  private updateSpawns(time: number, W: number, H: number): void {
    if (time > this.nextEnemyAt) {
      this.nextEnemyAt = time + Phaser.Math.Between(2200, 4200);
      this.spawnEnemy(W, H);
    }
    if (time > this.nextGroundAt) {
      this.nextGroundAt = time + Phaser.Math.Between(1600, 3200);
      this.spawnGroundObj(W, Math.random() < 0.4 ? 'aagun' : 'building');
    }
    if (time > this.nextRunwayAt) {
      this.nextRunwayAt = time + Phaser.Math.Between(16000, 24000);
      this.spawnGroundObj(W, 'runway');
    }
  }

  /** Spawn point just outside the top/right edge, in the path of the scroll. */
  private edgeSpawn(W: number, H: number): { x: number; y: number } {
    return Math.random() < 0.6
      ? { x: Phaser.Math.Between(120, W + 180), y: -70 }
      : { x: W + 70, y: Phaser.Math.Between(-150, H * 0.45) };
  }

  private spawnEnemy(W: number, H: number): void {
    const { x, y } = this.edgeSpawn(W, H);
    const alt = Phaser.Math.Between(25, 90);
    const sprite = this.add.image(x, y, 'enemy').setRotation((Math.PI * 3) / 4).setDepth(9);
    const shadow = this.add.image(x, y, 'enemy').setTint(0x000000).setAlpha(0.18)
      .setRotation((Math.PI * 3) / 4);
    this.enemies.push({
      sprite,
      shadow,
      alt,
      vx: -Phaser.Math.Between(60, 130),
      vy: Phaser.Math.Between(50, 110),
      wobble: Math.random() * Math.PI * 2,
      hp: 2,
      fireAt: this.time.now + Phaser.Math.Between(800, 2000),
    });
  }

  private spawnGroundObj(W: number, kind: GroundObj['kind']): void {
    const { x, y } = this.edgeSpawn(W, this.scale.height);
    const sprite = this.add.image(x, y, kind).setDepth(1);
    this.groundObjs.push({
      sprite,
      kind,
      hp: kind === 'building' ? 2 : 1,
      fireAt: this.time.now + 1500,
    });
  }

  // ---------------------------------------------------------------- entities

  private updateEnemies(time: number, dt: number, H: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.wobble += dt * 2;
      e.sprite.x += (e.vx - SCROLL * 0.3) * dt;
      e.sprite.y += (e.vy + SCROLL * 0.3) * dt + Math.sin(e.wobble) * 0.6;
      e.sprite.setScale(0.8 + (e.alt / MAX_ALT) * 0.3);
      e.shadow.x = e.sprite.x - e.alt * 0.55;
      e.shadow.y = e.sprite.y + 20 + e.alt * 0.18;
      e.shadow.setScale(e.sprite.scaleX * 0.9);

      // Fire at the player when roughly abeam.
      if (time > e.fireAt && Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, this.player.x, this.player.y) < 420) {
        e.fireAt = time + Phaser.Math.Between(1400, 2600);
        const angle = Phaser.Math.Angle.Between(e.sprite.x, e.sprite.y, this.player.x, this.player.y);
        this.spawnBullet(e.sprite.x, e.sprite.y, true, e.alt, angle, 240);
      }

      // Collision with player (same altitude band).
      if (
        Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, this.player.x, this.player.y) < 34 &&
        Math.abs(e.alt - this.alt) < 14
      ) {
        this.explode(e.sprite.x, e.sprite.y, 18);
        this.removeEnemy(i);
        this.playerHit(time, false);
        continue;
      }

      if (e.sprite.x < -120 || e.sprite.y > H + 120) this.removeEnemy(i);
    }
  }

  private updateGroundObjs(time: number, dt: number): void {
    const { height: H } = this.scale;
    for (let i = this.groundObjs.length - 1; i >= 0; i--) {
      const o = this.groundObjs[i];
      o.sprite.x -= SCROLL * dt;
      o.sprite.y += SCROLL * dt;

      if (o.kind === 'aagun' && time > o.fireAt) {
        const dist = Phaser.Math.Distance.Between(o.sprite.x, o.sprite.y, this.player.x, this.player.y);
        if (dist < 380) {
          o.fireAt = time + Phaser.Math.Between(1600, 2800);
          const angle = Phaser.Math.Angle.Between(o.sprite.x, o.sprite.y, this.player.x, this.player.y);
          this.spawnBullet(o.sprite.x, o.sprite.y, true, this.alt, angle, 200, 'flak');
        }
      }

      if (o.sprite.x < -180 || o.sprite.y > H + 200) {
        o.sprite.destroy();
        this.groundObjs.splice(i, 1);
      }
    }
  }

  private spawnBullet(
    x: number,
    y: number,
    hostile: boolean,
    alt: number,
    angle?: number,
    speed = 480,
    key?: string,
  ): void {
    const a = angle ?? -Math.PI / 4; // player fires along its heading, up-right
    const sprite = this.add
      .image(x, y, key ?? (hostile ? 'flak' : 'bullet'))
      .setRotation(a)
      .setDepth(8);
    this.bullets.push({
      sprite,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      alt,
      hostile,
      dieAt: this.time.now + 1600,
    });
  }

  private updateBullets(time: number, dt: number, W: number, H: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.sprite.x += b.vx * dt;
      b.sprite.y += b.vy * dt;

      let dead = time > b.dieAt || b.sprite.x < -20 || b.sprite.x > W + 20 || b.sprite.y < -20 || b.sprite.y > H + 20;

      if (!dead && b.hostile) {
        if (
          time > this.invulnUntil &&
          Phaser.Math.Distance.Between(b.sprite.x, b.sprite.y, this.player.x, this.player.y) < 22 &&
          Math.abs(b.alt - this.alt) < 16
        ) {
          this.playerHit(time, false);
          dead = true;
        }
      } else if (!dead) {
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (
            Phaser.Math.Distance.Between(b.sprite.x, b.sprite.y, e.sprite.x, e.sprite.y) < 26 &&
            Math.abs(b.alt - e.alt) < 18
          ) {
            dead = true;
            if (--e.hp <= 0) {
              this.explode(e.sprite.x, e.sprite.y, 18);
              this.score += 100;
              this.removeEnemy(j);
            } else {
              this.explode(b.sprite.x, b.sprite.y, 4);
            }
            break;
          }
        }
      }

      if (dead) {
        b.sprite.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  private dropBomb(time: number): void {
    const fallMs = 350 + this.alt * 9; // lower release = shorter fall = better accuracy
    const sprite = this.add.image(this.player.x, this.player.y + 6, 'bomb').setDepth(7);
    this.bombs.push({ sprite, landAt: time + fallMs, totalFall: fallMs });
  }

  private updateBombs(time: number, dt: number): void {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i];
      const remain = bomb.landAt - time;
      if (remain <= 0) {
        this.detonate(bomb.sprite.x, bomb.sprite.y);
        bomb.sprite.destroy();
        this.bombs.splice(i, 1);
        continue;
      }
      const t = 1 - remain / bomb.totalFall;
      // Bomb carries forward momentum early, accelerates downward, shrinks toward the ground.
      bomb.sprite.x += 70 * (1 - t) * dt;
      bomb.sprite.y += 55 * t * dt;
      bomb.sprite.setScale(1 - t * 0.45);
    }
  }

  private detonate(x: number, y: number): void {
    this.explode(x, y, 26);
    for (let i = this.groundObjs.length - 1; i >= 0; i--) {
      const o = this.groundObjs[i];
      if (o.kind === 'runway') continue;
      const halfW = o.kind === 'building' ? 30 : 24;
      if (Math.abs(o.sprite.x - x) < halfW + 20 && Math.abs(o.sprite.y - y) < halfW + 20) {
        if (--o.hp <= 0) {
          this.explode(o.sprite.x, o.sprite.y, 22);
          this.score += o.kind === 'aagun' ? 75 : 50;
          o.sprite.destroy();
          this.groundObjs.splice(i, 1);
        }
      }
    }
  }

  // ---------------------------------------------------------------- damage & fx

  private removeEnemy(i: number): void {
    this.enemies[i].sprite.destroy();
    this.enemies[i].shadow.destroy();
    this.enemies.splice(i, 1);
  }

  private explode(x: number, y: number, count: number): void {
    const em = this.add.particles(x, y, 'spark', {
      speed: { min: 40, max: 180 },
      lifespan: 450,
      scale: { start: 1.1, end: 0 },
      tint: [0xe8a33d, 0xc4574a, 0xf2d16b],
      emitting: false,
    }).setDepth(20);
    em.explode(count);
    this.time.delayedCall(600, () => em.destroy());
  }

  private playerHit(time: number, crash: boolean): void {
    if (time < this.invulnUntil && !crash) return;
    this.invulnUntil = time + 1500;
    this.explode(this.player.x, this.player.y, crash ? 30 : 12);
    this.cameras.main.shake(200, 0.008);
    if (--this.lives <= 0) {
      this.gameOver(crash ? 'CRASHED' : 'SHOT DOWN');
    }
  }

  // ---------------------------------------------------------------- game over

  private gameOver(reason: string): void {
    if (this.over) return;
    this.over = true;
    const { width: W, height: H } = this.scale;

    this.add.rectangle(W / 2, H / 2, W, H, 0x0a1016, 0.65).setDepth(200);
    const panel = this.add.rectangle(W / 2, H / 2, 440, 260, UI.panel, 0.97).setDepth(201);
    panel.setStrokeStyle(2, UI.panelBorder);

    this.add.text(W / 2, H / 2 - 80, reason, {
      fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#c4574a',
    }).setOrigin(0.5).setDepth(202);
    this.add.text(W / 2, H / 2 - 24, `FINAL SCORE`, {
      fontFamily: FONT, fontSize: '14px', color: UI.textDim,
    }).setOrigin(0.5).setDepth(202);
    this.add.text(W / 2, H / 2 + 8, `${this.score}`, {
      fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: UI.accentText,
    }).setOrigin(0.5).setDepth(202);

    const again = this.add.text(W / 2, H / 2 + 84, '↻  PRESS ENTER TO FLY AGAIN', {
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: UI.text,
    }).setOrigin(0.5).setDepth(202).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: again, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 });

    const restart = () => this.scene.restart();
    again.on('pointerdown', restart);
    this.input.keyboard!.once('keydown-ENTER', restart);
  }
}
