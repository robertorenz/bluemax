import * as THREE from 'three';
import { AudioFx } from './audio';
import { P } from './palette';
import {
  makeBiplane, makeBuilding, makeAAGun, makeRunway, makeBomb, makeBullet,
  makeCloud, type AAGunModel,
} from './models';
import { makeChunk, CHUNK_D, CHUNK_COUNT } from './terrain';

const WORLD_SPEED = 65;   // ground scroll speed, units/s
const MAX_ALT = 38;
const MIN_SAFE_ALT = 0.6; // below this off-runway = crash
const LATERAL_RANGE = 26;
const GRAVITY = 25;

interface AirEnemy {
  group: THREE.Group;
  prop: THREE.Mesh;
  alt: number;
  speed: number;
  wobble: number;
  hp: number;
  fireAt: number;
}

interface GroundObj {
  group: THREE.Group;
  kind: 'building' | 'aagun' | 'runway';
  barrel?: THREE.Group;
  hp: number;
  fireAt: number;
}

interface Bullet {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  hostile: boolean;
  dieAt: number;
}

interface Bomb {
  mesh: THREE.Mesh;
  vy: number;
  vz: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface Flash {
  mesh: THREE.Mesh;
  life: number;
}

export interface Hud {
  score: HTMLElement;
  lives: HTMLElement;
  fuelbar: HTMLElement;
  altbar: HTMLElement;
  altval: HTMLElement;
  refuel: HTMLElement;
}

export class Game {
  state: 'menu' | 'playing' | 'over' = 'menu';
  onGameOver: (reason: string, score: number) => void = () => {};

  private audio = new AudioFx();
  private mode: 'flying' | 'landing' | 'takeoff' = 'flying';
  private speedFactor = 1;
  private cameraRoll = 0;
  private activeRunway: GroundObj | null = null;

  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private keys = new Set<string>();

  private player!: THREE.Group;
  private playerProp!: THREE.Mesh;
  private chunks: THREE.Group[] = [];
  private clouds: THREE.Group[] = [];

  private enemies: AirEnemy[] = [];
  private groundObjs: GroundObj[] = [];
  private bullets: Bullet[] = [];
  private bombs: Bomb[] = [];
  private particles: Particle[] = [];
  private flashes: Flash[] = [];

  private alt = 15;
  private fuel = 100;
  private lives = 3;
  private score = 0;
  private now = 0;
  private invulnUntil = 0;
  private nextGunAt = 0;
  private nextBombAt = 0;
  private nextEnemyAt = 0;
  private nextGroundAt = 0;
  private nextRunwayAt = 0;

  constructor(container: HTMLElement, private hud: Hud) {
    const W = 960, H = 640;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.prepend(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, W / H, 1, 900);

    this.buildSky();
    this.buildLights();
    this.buildWorld();
    this.buildPlayer();
    this.bindInput();
  }

  // ------------------------------------------------------------- setup

  private buildSky(): void {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, P.skyTop);
    grad.addColorStop(0.55, P.skyMid);
    grad.addColorStop(1, P.horizon);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);
    this.scene.background = new THREE.CanvasTexture(c);
    this.scene.fog = new THREE.Fog(P.fog, 260, 640);
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xbfd6e8, 0x3a5230, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
    sun.position.set(80, 150, -40);
    sun.target.position.set(0, 0, -120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -160;
    cam.right = 160;
    cam.top = 300;
    cam.bottom = -160;
    cam.near = 20;
    cam.far = 450;
    this.scene.add(sun, sun.target);
  }

  private buildWorld(): void {
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk = makeChunk();
      chunk.position.z = 120 - i * CHUNK_D;
      this.chunks.push(chunk);
      this.scene.add(chunk);
    }
    for (let i = 0; i < 6; i++) {
      const cloud = makeCloud();
      cloud.position.set(
        (Math.random() - 0.5) * 300,
        44 + Math.random() * 16,
        60 - Math.random() * 600,
      );
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }

  private buildPlayer(): void {
    const { group, prop } = makeBiplane(P.playerBody, P.playerWing, P.playerDetail);
    group.position.set(0, this.alt, 0);
    this.player = group;
    this.playerProp = prop;
    this.scene.add(group);
  }

  private bindInput(): void {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'm' && !e.repeat) this.audio.toggleMute();
    });
  }

  // ------------------------------------------------------------- lifecycle

  start(): void {
    // Clear any leftover entities from the previous sortie.
    for (const e of this.enemies) this.scene.remove(e.group);
    for (const o of this.groundObjs) this.scene.remove(o.group);
    for (const b of this.bullets) this.scene.remove(b.mesh);
    for (const b of this.bombs) this.scene.remove(b.mesh);
    for (const p of this.particles) this.scene.remove(p.mesh);
    for (const f of this.flashes) this.scene.remove(f.mesh);
    this.enemies = [];
    this.groundObjs = [];
    this.bullets = [];
    this.bombs = [];
    this.particles = [];
    this.flashes = [];

    this.alt = 15;
    this.fuel = 100;
    this.lives = 3;
    this.score = 0;
    this.invulnUntil = 0;
    this.nextEnemyAt = this.now + 2500;
    this.nextGroundAt = this.now + 800;
    this.nextRunwayAt = this.now + 13000;
    this.player.position.set(0, this.alt, 0);
    this.player.visible = true;
    this.mode = 'flying';
    this.speedFactor = 1;
    this.activeRunway = null;
    this.audio.init();
    this.state = 'playing';
  }

  /** Current ground-scroll speed; the world slows while rolling down a runway. */
  private get scroll(): number {
    return WORLD_SPEED * this.speedFactor;
  }

  update(dt: number, now: number): void {
    this.now = now;
    this.playerProp.rotation.z += (30 + 20 * this.speedFactor) * dt;

    this.speedFactor = THREE.MathUtils.damp(
      this.speedFactor,
      this.mode === 'landing' ? 0.35 : 1,
      2.5,
      dt,
    );

    if (this.state === 'playing') {
      const throttle =
        this.keys.has('ArrowUp') ? 0.25 : this.keys.has('ArrowDown') ? -0.1 : 0;
      this.audio.setEngine(THREE.MathUtils.clamp(
        0.4 * this.speedFactor + throttle + (this.alt / MAX_ALT) * 0.25 +
          (this.mode === 'takeoff' ? 0.35 : 0),
        0.12,
        1,
      ));
    } else {
      this.audio.setEngine(this.state === 'over' ? 0 : 0.1);
    }

    if (this.state === 'playing') {
      this.updatePlayer(dt);
      this.updateFuel(dt);
      this.updateSpawns();
      this.updateEnemies(dt);
      this.updateGroundObjs(dt);
      this.updateBullets(dt);
      this.updateBombs(dt);
      this.updateHud();
    }

    this.updateTerrain(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------- player

  private updatePlayer(dt: number): void {
    const p = this.player.position;

    if (this.mode === 'landing') {
      // Rolling down the runway: wheels on, level attitude, tanks filling.
      this.alt = 0.45;
      p.y = this.alt;
      this.player.rotation.z = THREE.MathUtils.lerp(this.player.rotation.z, 0, 0.15);
      this.player.rotation.x = THREE.MathUtils.lerp(this.player.rotation.x, 0, 0.15);
      const runwayEnding = !this.activeRunway || this.activeRunway.group.position.z > 18;
      if (this.fuel >= 100 || runwayEnding) {
        this.mode = 'takeoff';
        this.hud.refuel.textContent = 'TAKING OFF';
      }
      return;
    }

    if (this.mode === 'takeoff') {
      this.alt += 10 * dt;
      p.y = this.alt;
      this.player.rotation.x = THREE.MathUtils.lerp(this.player.rotation.x, -0.24, 0.1);
      if (this.alt >= 12) {
        this.mode = 'flying';
        this.activeRunway = null;
      }
      return;
    }

    let bank = 0;
    let pitch = 0;

    if (this.keys.has('ArrowLeft')) {
      p.x -= 46 * dt;
      bank = 0.42;
    } else if (this.keys.has('ArrowRight')) {
      p.x += 46 * dt;
      bank = -0.42;
    }
    if (this.keys.has('ArrowUp')) {
      this.alt = Math.min(MAX_ALT, this.alt + 14 * dt);
      pitch = -0.28;
    } else if (this.keys.has('ArrowDown')) {
      this.alt -= 17 * dt;
      pitch = 0.3;
    }

    p.x = THREE.MathUtils.clamp(p.x, -LATERAL_RANGE, LATERAL_RANGE);
    p.y = Math.max(0.2, this.alt);
    this.player.rotation.z = THREE.MathUtils.lerp(this.player.rotation.z, bank, 0.12);
    this.player.rotation.x = THREE.MathUtils.lerp(this.player.rotation.x, pitch, 0.12);

    // Ground contact: touching down on a runway starts the landing rollout;
    // anywhere else it's a crash.
    if (this.alt <= MIN_SAFE_ALT) {
      const runway = this.runwayUnder();
      if (runway) {
        this.beginLanding(runway);
        return;
      }
      if (this.alt <= 0.25) {
        this.playerHit(true);
        this.alt = 12;
      }
    }

    // Weapons.
    if (this.keys.has(' ') && this.now > this.nextGunAt) {
      this.nextGunAt = this.now + 150;
      this.audio.gun();
      for (const gx of [-0.9, 0.9]) {
        this.spawnBullet(
          new THREE.Vector3(p.x + gx, p.y + 0.9, p.z - 2.5),
          new THREE.Vector3(0, 0, -230),
          false,
        );
      }
    }
    if (this.keys.has('b') && this.now > this.nextBombAt && this.alt > 3) {
      this.nextBombAt = this.now + 750;
      this.audio.bombWhistle(Math.sqrt((2 * Math.max(1, p.y)) / GRAVITY));
      const bomb = makeBomb();
      bomb.position.set(p.x, p.y - 0.8, p.z);
      this.bombs.push({ mesh: bomb, vy: 0, vz: 0 });
      this.scene.add(bomb);
    }

    // Damage blink.
    this.player.visible =
      this.now > this.invulnUntil || Math.floor(this.now / 90) % 2 === 0;
  }

  private updateFuel(dt: number): void {
    if (this.mode === 'landing') {
      this.fuel = Math.min(100, this.fuel + 45 * dt);
      return;
    }
    if (this.mode === 'flying') this.hud.refuel.classList.add('hidden');
    this.fuel -= 1.3 * dt;

    if (this.fuel <= 0) {
      this.fuel = 0;
      this.alt -= 6 * dt; // engine out, forced descent — a runway can still save you
      if (this.alt <= 0.3 && !this.runwayUnder()) {
        this.gameOver('OUT OF FUEL');
      }
    }
  }

  private runwayUnder(): GroundObj | null {
    const p = this.player.position;
    return (
      this.groundObjs.find(
        (o) =>
          o.kind === 'runway' &&
          Math.abs(o.group.position.x - p.x) < 6.5 &&
          Math.abs(o.group.position.z - p.z) < 34,
      ) ?? null
    );
  }

  private beginLanding(runway: GroundObj): void {
    this.mode = 'landing';
    this.activeRunway = runway;
    this.alt = 0.45;
    this.hud.refuel.textContent = 'REFUELING';
    this.hud.refuel.classList.remove('hidden');
  }

  // ------------------------------------------------------------- spawning

  private updateSpawns(): void {
    if (this.now > this.nextEnemyAt) {
      this.nextEnemyAt = this.now + 2300 + Math.random() * 2200;
      this.spawnEnemy();
    }
    if (this.now > this.nextGroundAt) {
      this.nextGroundAt = this.now + 1700 + Math.random() * 1800;
      this.spawnGroundObj(Math.random() < 0.4 ? 'aagun' : 'building');
    }
    if (this.now > this.nextRunwayAt) {
      this.nextRunwayAt = this.now + 15000 + Math.random() * 9000;
      this.spawnGroundObj('runway');
    }
  }

  private spawnEnemy(): void {
    const { group, prop } = makeBiplane(P.enemyBody, P.enemyWing, 0xeed8d4);
    group.rotation.y = Math.PI; // flying toward the player
    const alt = 6 + Math.random() * 30;
    group.position.set((Math.random() - 0.5) * 2 * LATERAL_RANGE, alt, -480);
    this.scene.add(group);
    this.enemies.push({
      group,
      prop,
      alt,
      speed: 35 + Math.random() * 40,
      wobble: Math.random() * Math.PI * 2,
      hp: 2,
      fireAt: this.now + 1000 + Math.random() * 1500,
    });
  }

  private spawnGroundObj(kind: GroundObj['kind']): void {
    let group: THREE.Group;
    let barrel: THREE.Group | undefined;
    if (kind === 'building') group = makeBuilding();
    else if (kind === 'runway') group = makeRunway();
    else {
      const model: AAGunModel = makeAAGun();
      group = model.group;
      barrel = model.barrel;
    }
    const range = kind === 'runway' ? 20 : 34;
    group.position.set((Math.random() - 0.5) * 2 * range, 0, -500);
    this.scene.add(group);
    this.groundObjs.push({ group, kind, barrel, hp: kind === 'building' ? 2 : 1, fireAt: this.now + 1500 });
  }

  // ------------------------------------------------------------- entities

  private updateEnemies(dt: number): void {
    const p = this.player.position;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const pos = e.group.position;
      e.wobble += dt * 2.2;
      e.prop.rotation.z += 45 * dt;

      pos.z += (this.scroll * 0.35 + e.speed) * dt;
      // Pursue the player at range, but commit to the attack line on final
      // approach so head-on collisions stay dodgeable.
      const pursuing = pos.z < -110 ? 1 : 0;
      pos.x += (THREE.MathUtils.clamp(p.x - pos.x, -1, 1) * 9 * pursuing + Math.sin(e.wobble) * 3) * dt;
      e.alt += THREE.MathUtils.clamp(p.y - e.alt, -1, 1) * 2.4 * pursuing * dt;
      pos.y = e.alt;
      e.group.rotation.z = Math.sin(e.wobble) * 0.15;

      // Fire when in the approach window.
      if (this.now > e.fireAt && pos.z > -280 && pos.z < -30) {
        e.fireAt = this.now + 1500 + Math.random() * 1400;
        const dir = new THREE.Vector3().subVectors(p, pos).normalize().multiplyScalar(85);
        this.spawnBullet(pos.clone(), dir, true);
      }

      // Mid-air collision.
      if (pos.distanceTo(p) < 4.2) {
        this.explode(pos, 16);
        this.removeEnemy(i);
        this.playerHit(false);
        continue;
      }

      if (pos.z > 120) this.removeEnemy(i);
    }
  }

  private updateGroundObjs(dt: number): void {
    const p = this.player.position;
    for (let i = this.groundObjs.length - 1; i >= 0; i--) {
      const o = this.groundObjs[i];
      const pos = o.group.position;
      pos.z += this.scroll * dt;

      if (o.kind === 'aagun' && o.barrel) {
        // Track the player with the barrel.
        const toPlayer = new THREE.Vector3().subVectors(p, pos);
        o.group.rotation.y = Math.atan2(-toPlayer.x, -toPlayer.z) + Math.PI;
        const horiz = Math.hypot(toPlayer.x, toPlayer.z);
        o.barrel.rotation.x = Math.atan2(p.y - 2.3, horiz) + Math.PI / 2 - 0.4;

        if (this.now > o.fireAt && pos.z > -320 && pos.z < -20) {
          o.fireAt = this.now + 2000 + Math.random() * 1400;
          const muzzle = pos.clone().setY(2.5);
          const dir = new THREE.Vector3().subVectors(p, muzzle).normalize().multiplyScalar(70);
          this.spawnBullet(muzzle, dir, true, P.flak);
        }
      }

      if (pos.z > 140) {
        this.scene.remove(o.group);
        this.groundObjs.splice(i, 1);
      }
    }
  }

  private spawnBullet(pos: THREE.Vector3, vel: THREE.Vector3, hostile: boolean, color?: number): void {
    const mesh = makeBullet(color ?? (hostile ? P.flak : P.bullet));
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().add(vel));
    this.bullets.push({ mesh, vel, hostile, dieAt: this.now + 2600 });
    this.scene.add(mesh);
  }

  private updateBullets(dt: number): void {
    const p = this.player.position;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const pos = b.mesh.position;
      pos.addScaledVector(b.vel, dt);

      let dead = this.now > b.dieAt || pos.z < -520 || pos.z > 130 || Math.abs(pos.x) > 250;

      if (!dead && b.hostile) {
        if (this.now > this.invulnUntil && pos.distanceTo(p) < 2.6) {
          this.playerHit(false);
          dead = true;
        }
      } else if (!dead) {
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (pos.distanceTo(e.group.position) < 4.2) {
            dead = true;
            if (--e.hp <= 0) {
              this.explode(e.group.position, 18);
              this.score += 100;
              this.removeEnemy(j);
            } else {
              this.explode(pos, 4);
            }
            break;
          }
        }
      }

      if (dead) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
  }

  private updateBombs(dt: number): void {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.vy -= GRAVITY * dt;
      b.vz = Math.min(b.vz + 14 * dt, this.scroll * 0.55); // falls behind as drag bleeds airspeed
      const pos = b.mesh.position;
      pos.y += b.vy * dt;
      pos.z += b.vz * dt;
      b.mesh.rotation.x = Math.PI / 2 + Math.min(1.2, -b.vy * 0.05); // nose over

      if (pos.y <= 0.4) {
        this.detonate(pos);
        this.scene.remove(b.mesh);
        this.bombs.splice(i, 1);
      }
    }
  }

  private detonate(at: THREE.Vector3): void {
    this.explode(at, 26);
    for (let i = this.groundObjs.length - 1; i >= 0; i--) {
      const o = this.groundObjs[i];
      if (o.kind === 'runway') continue;
      const pos = o.group.position;
      if (Math.hypot(pos.x - at.x, pos.z - at.z) < 13) {
        if (--o.hp <= 0) {
          this.explode(pos.clone().setY(2), 22);
          this.score += o.kind === 'aagun' ? 75 : 50;
          this.scene.remove(o.group);
          this.groundObjs.splice(i, 1);
        }
      }
    }
  }

  // ------------------------------------------------------------- world & fx

  private updateTerrain(dt: number): void {
    for (const chunk of this.chunks) {
      chunk.position.z += this.scroll * dt;
      if (chunk.position.z > 120 + CHUNK_D / 2) {
        chunk.position.z -= CHUNK_D * CHUNK_COUNT;
      }
    }
    for (const cloud of this.clouds) {
      cloud.position.z += this.scroll * 1.15 * dt;
      if (cloud.position.z > 100) {
        cloud.position.z = -620;
        cloud.position.x = (Math.random() - 0.5) * 300;
      }
    }
  }

  private explode(at: THREE.Vector3, count: number): void {
    this.audio.explosion(count >= 20);
    for (let i = 0; i < count; i++) {
      const s = 0.3 + Math.random() * 0.5;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshBasicMaterial({
          color: P.fire[Math.floor(Math.random() * P.fire.length)],
        }),
      );
      mesh.position.copy(at);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.2,
        (Math.random() - 0.5) * 2,
      ).normalize().multiplyScalar(8 + Math.random() * 16);
      const life = 0.5 + Math.random() * 0.3;
      this.particles.push({ mesh, vel, life, maxLife: life });
      this.scene.add(mesh);
    }
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 }),
    );
    flash.position.copy(at);
    this.flashes.push({ mesh: flash, life: 0.32 });
    this.scene.add(flash);
  }

  private updateEffects(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= GRAVITY * 0.6 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 5;
      const s = p.life / p.maxLife;
      p.mesh.scale.setScalar(s);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        this.flashes.splice(i, 1);
        continue;
      }
      const t = 1 - f.life / 0.32;
      f.mesh.scale.setScalar(1 + t * 5);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
    }
  }

  private updateCamera(dt: number): void {
    const p = this.player.position;
    const targetX = p.x * 0.45;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetX, 4, dt);
    this.camera.position.y = 40 + p.y * 0.22;
    this.camera.position.z = 50;
    // Roll the horizon gently with the player's bank.
    this.cameraRoll = THREE.MathUtils.damp(this.cameraRoll, this.player.rotation.z * 0.35, 4, dt);
    this.camera.up.set(Math.sin(this.cameraRoll), Math.cos(this.cameraRoll), 0);
    this.camera.lookAt(p.x * 0.7, 2 + p.y * 0.35, -75);
  }

  // ------------------------------------------------------------- damage

  private removeEnemy(i: number): void {
    this.scene.remove(this.enemies[i].group);
    this.enemies.splice(i, 1);
  }

  private playerHit(crash: boolean): void {
    if (this.now < this.invulnUntil && !crash) return;
    this.invulnUntil = this.now + 1600;
    this.explode(this.player.position, crash ? 30 : 12);
    if (--this.lives <= 0) {
      this.gameOver(crash ? 'CRASHED' : 'SHOT DOWN');
    }
  }

  private gameOver(reason: string): void {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.player.visible = false;
    this.explode(this.player.position, 36);
    this.hud.refuel.classList.add('hidden');
    this.onGameOver(reason, this.score);
  }

  // ------------------------------------------------------------- hud

  private updateHud(): void {
    this.hud.score.textContent = `SCORE ${this.score}`;
    this.hud.lives.textContent = '✈ '.repeat(Math.max(0, this.lives)).trim();
    (this.hud.fuelbar as HTMLElement).style.width = `${Math.max(0, this.fuel)}%`;
    (this.hud.fuelbar as HTMLElement).style.background =
      this.fuel < 25 ? 'var(--danger)' : 'var(--good)';
    (this.hud.altbar as HTMLElement).style.width = `${(this.alt / MAX_ALT) * 100}%`;
    this.hud.altval.textContent = String(Math.round(this.alt));
  }
}
