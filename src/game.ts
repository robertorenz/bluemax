import * as THREE from 'three';
import { AudioFx } from './audio';
import { P } from './palette';
import {
  makePlane, makeBlimp, ENEMY_FORMS, makeBuilding, makeAAGun, makeRunway, makeBomb, makeBullet,
  makeCloud, makeRubble, makeFactory, makeTank, makeDepot,
  makeRiver, makeRoad, makeCar, makeBridge, makeBrokenBridge, makeShip, makeLightning,
  makeCottage, makeChurch, makeCastle, makeHill, makeWindmill, makeCanyon,
  canyonTaper, CANYON_WIDTH, CANYON_WALL_H,
  riverXAt, RIVER_LEN,
  type AAGunModel, type RiverParams, type PlaneShape,
} from './models';
import { PLANE_MAP, DEFAULT_PLANE, type PlaneType } from './planes';

export type { PlaneType };

type EnemyKind = 'bi' | 'mono' | 'tri' | 'blimp';

const ENEMY_INFO: Record<EnemyKind, {
  hp: number; score: number; hitR: number;
  shape: PlaneShape | 'blimp';
  body: number; wing: number;
}> = {
  bi:    { hp: 2, score: 100, hitR: 4.2, shape: 'bi',    body: 0x8c4a45, wing: 0xc47a6e },
  mono:  { hp: 1, score: 120, hitR: 4.2, shape: 'mono',  body: 0x5a5f66, wing: 0x7d838c },
  tri:   { hp: 3, score: 150, hitR: 4.2, shape: 'tri',   body: 0x9c3b34, wing: 0xd0685c },
  blimp: { hp: 7, score: 300, hitR: 10,  shape: 'blimp', body: 0, wing: 0 },
};
import { makeChunk, CHUNK_D, CHUNK_COUNT } from './terrain';

const WORLD_SPEED = 65;   // ground scroll speed, units/s
const PLAYER_Z = -48;     // plane sits well ahead of the camera so bomb impacts land mid-screen
const MAX_ALT = 38;
const MIN_SAFE_ALT = 0.6; // below this off-runway = crash
const LATERAL_RANGE = 26;
const GRAVITY = 25;

interface AirEnemy {
  group: THREE.Group;
  prop: THREE.Mesh;
  kind: EnemyKind;
  mode: 'attack' | 'overtake';
  alt: number;
  speed: number;
  wobble: number;
  hp: number;
  fireAt: number;
}

type GroundKind =
  | 'building' | 'aagun' | 'runway' | 'factory' | 'tank' | 'depot'
  | 'river' | 'bridge' | 'ship' | 'road' | 'car' | 'castle'
  | 'hill' | 'windmill' | 'canyon';

/** Lane kinds share the long wandering-strip behavior. */
const isLane = (k: GroundKind): boolean => k === 'river' || k === 'road' || k === 'canyon';

interface GroundObj {
  group: THREE.Group;
  kind: GroundKind;
  barrel?: THREE.Group;
  hp: number;
  fireAt: number;
  vx?: number;
  vz?: number;
  river?: RiverParams;
  host?: GroundObj;
  hillR?: number;
  hillH?: number;
  damaged?: boolean;
  dead?: boolean;
  nextSmokeAt?: number;
}

/** Solid extents for plane-vs-structure crashes: square half-width and height. */
const STRUCT_HIT: Partial<Record<GroundKind, { r: number; h: number }>> = {
  building: { r: 5.5, h: 9 },
  factory:  { r: 8.5, h: 7.5 },
  aagun:    { r: 2.8, h: 3.4 },
  tank:     { r: 2.8, h: 3 },
  depot:    { r: 5, h: 3.6 },
  ship:     { r: 4, h: 4 },
  car:      { r: 2.2, h: 2.4 },
  castle:   { r: 12, h: 11 },
  windmill: { r: 2.6, h: 11.5 },
};

const GROUND_STATS: Record<GroundKind, { hp: number; score: number; radius: number }> = {
  building: { hp: 2, score: 50, radius: 16 },
  aagun:    { hp: 1, score: 75, radius: 16 },
  factory:  { hp: 2, score: 125, radius: 20 },
  tank:     { hp: 1, score: 100, radius: 14 },
  depot:    { hp: 1, score: 100, radius: 18 },
  bridge:   { hp: 2, score: 150, radius: 16 },
  ship:     { hp: 1, score: 100, radius: 14 },
  car:      { hp: 1, score: 60, radius: 12 },
  castle:   { hp: 4, score: 400, radius: 22 },
  windmill: { hp: 1, score: 100, radius: 14 },
  hill:     { hp: 99, score: 0, radius: 0 },
  canyon:   { hp: 99, score: 0, radius: 0 },
  river:    { hp: 99, score: 0, radius: 0 },
  road:     { hp: 99, score: 0, radius: 0 },
  runway:   { hp: 99, score: 0, radius: 0 },
};

interface Bullet {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  hostile: boolean;
  dieAt: number;
}

interface Bomb {
  mesh: THREE.Group;
  vy: number;
  vz: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  grav: number;
  life: number;
  maxLife: number;
}

interface Flash {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
  opacity0: number;
}

export interface Hud {
  score: HTMLElement;
  lives: HTMLElement;
  bombs: HTMLElement;
  fuelbar: HTMLElement;
  altbar: HTMLElement;
  altval: HTMLElement;
  refuel: HTMLElement;
}

export class Game {
  state: 'menu' | 'playing' | 'over' = 'menu';
  onGameOver: (reason: string, score: number) => void = () => {};

  private audio = new AudioFx();
  private planeType: PlaneType = DEFAULT_PLANE;
  private maxBombs = 30;
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
  private playerProp2?: THREE.Mesh;
  private chunks: THREE.Group[] = [];
  private clouds: THREE.Group[] = [];
  private cloudMats: THREE.MeshLambertMaterial[] = [];

  // Weather: 0 = clear skies, 1 = full storm.
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private skyCtx!: CanvasRenderingContext2D;
  private skyTex!: THREE.CanvasTexture;
  private rain!: THREE.Points;
  private rainPos!: Float32Array;
  private weather = 0;
  private weatherTarget = 0;
  private nextWeatherAt = 0;
  private lastSkyW = -1;
  private lightningBoost = 0;
  private nextStrikeAt = 0;

  private enemies: AirEnemy[] = [];
  private groundObjs: GroundObj[] = [];
  private bullets: Bullet[] = [];
  private bombs: Bomb[] = [];
  private particles: Particle[] = [];
  private flashes: Flash[] = [];

  private alt = 15;
  private fuel = 100;
  private bombsLeft = 30;
  private lives = 3;
  private score = 0;
  private now = 0;
  private invulnUntil = 0;
  private nextGunAt = 0;
  private nextBombAt = 0;
  private nextEnemyAt = 0;
  private nextGroundAt = 0;
  private nextRunwayAt = 0;
  private nextRiverAt = 0;
  private nextRoadAt = 0;
  private nextVillageAt = 0;
  private nextCastleAt = 0;
  private nextHillsAt = 0;
  private nextCanyonAt = 0;
  private startedAt = 0;

  constructor(container: HTMLElement, private hud: Hud) {
    const W = container.clientWidth || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.prepend(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, W / H, 1, 900);

    window.addEventListener('resize', () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });

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
    this.skyCtx = c.getContext('2d')!;
    this.skyTex = new THREE.CanvasTexture(c);
    this.scene.background = this.skyTex;
    this.scene.fog = new THREE.Fog(P.fog, 260, 640);
    this.paintSky(0);
  }

  /** Repaint the sky gradient blended toward storm colors by w (0..1). */
  private paintSky(w: number): void {
    const mix = (a: string, b: string): string =>
      '#' + new THREE.Color(a).lerp(new THREE.Color(b), w).getHexString();
    const grad = this.skyCtx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, mix(P.skyTop, '#38434f'));
    grad.addColorStop(0.55, mix(P.skyMid, '#5a6570'));
    grad.addColorStop(1, mix(P.horizon, '#727d87'));
    this.skyCtx.fillStyle = grad;
    this.skyCtx.fillRect(0, 0, 2, 512);
    this.skyTex.needsUpdate = true;
    this.lastSkyW = w;
  }

  private buildLights(): void {
    this.hemi = new THREE.HemisphereLight(0xbfd6e8, 0x3a5230, 0.95);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
    this.sun = sun;
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
      this.cloudMats.push((cloud.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial);
      this.scene.add(cloud);
    }
    this.buildRain();
  }

  private buildRain(): void {
    const COUNT = 900;
    this.rainPos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * 480;
      this.rainPos[i * 3 + 1] = Math.random() * 55;
      this.rainPos[i * 3 + 2] = 80 - Math.random() * 500;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xaebfce,
        size: 0.4,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  /** Slow weather cycles: clear → overcast → rain and back. */
  private updateWeather(dt: number): void {
    if (this.now > this.nextWeatherAt) {
      const roll = Math.random();
      this.weatherTarget = roll < 0.45 ? 0 : roll < 0.75 ? 0.55 : 1;
      this.nextWeatherAt = this.now + 45000 + Math.random() * 40000;
    }
    this.weather = THREE.MathUtils.damp(this.weather, this.weatherTarget, 0.12, dt);
    const w = this.weather;

    // Lightning strikes during a full storm.
    if (w > 0.85 && this.now > this.nextStrikeAt) {
      this.strikeLightning();
      this.nextStrikeAt = this.now + 3500 + Math.random() * 8500;
    } else if (w < 0.5) {
      this.nextStrikeAt = Math.max(this.nextStrikeAt, this.now + 4000);
    }
    this.lightningBoost = THREE.MathUtils.damp(this.lightningBoost, 0, 9, dt);

    this.sun.intensity = THREE.MathUtils.lerp(1.7, 0.55, w) + this.lightningBoost * 0.9;
    this.hemi.intensity = THREE.MathUtils.lerp(0.95, 0.55, w) + this.lightningBoost * 1.3;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(P.fog).lerp(new THREE.Color(0x6b7683), w);
    fog.near = THREE.MathUtils.lerp(260, 170, w);
    fog.far = THREE.MathUtils.lerp(640, 430, w);
    for (const m of this.cloudMats) {
      m.color.set(0xffffff).lerp(new THREE.Color(0x4b525c), w);
    }
    if (Math.abs(w - this.lastSkyW) > 0.02) this.paintSky(w);

    // Rain streaks fade in past the overcast stage.
    const rainAmount = THREE.MathUtils.clamp((w - 0.6) / 0.4, 0, 1);
    this.rain.visible = rainAmount > 0.02;
    (this.rain.material as THREE.PointsMaterial).opacity = 0.55 * rainAmount;
    if (this.rain.visible) {
      for (let i = 0; i < this.rainPos.length; i += 3) {
        this.rainPos[i + 1] -= 58 * dt;
        if (this.rainPos[i + 1] < 0) {
          this.rainPos[i] = (Math.random() - 0.5) * 480;
          this.rainPos[i + 1] = 50 + Math.random() * 8;
          this.rainPos[i + 2] = 80 - Math.random() * 500;
        }
      }
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    this.audio.setRain(rainAmount);
  }

  /** One lightning strike: bolt in the distance, screen flash, delayed thunder. */
  strikeLightning(lifeMs = 170): void {
    const bolt = makeLightning();
    bolt.position.set((Math.random() - 0.5) * 440, 0, -120 - Math.random() * 280);
    this.scene.add(bolt);
    setTimeout(() => this.scene.remove(bolt), lifeMs);
    this.lightningBoost = 1;
    const flash = document.getElementById('flash');
    if (flash) {
      flash.style.opacity = '0.3';
      setTimeout(() => { flash.style.opacity = '0'; }, 70);
    }
    this.audio.thunder(0.5 + Math.random() * 2);
  }

  private buildPlayer(): void {
    this.choosePlane(this.planeType);
  }

  /** Swap the player's airframe; safe to call from the menu for a live preview. */
  choosePlane(type: PlaneType): void {
    const def = PLANE_MAP[type] ?? PLANE_MAP[DEFAULT_PLANE];
    this.planeType = def.id;
    this.maxBombs = def.bombs;
    const pos = this.player?.position.clone();
    if (this.player) this.scene.remove(this.player);
    const { group, prop, prop2 } = makePlane(def.form, def.body, def.wing, def.detail);
    group.position.copy(pos ?? new THREE.Vector3(0, this.alt, PLAYER_Z));
    group.scale.setScalar(1.25); // offset the extra camera distance
    this.player = group;
    this.playerProp = prop;
    this.playerProp2 = prop2;
    this.scene.add(group);
  }

  private bindInput(): void {
    const typing = (e: KeyboardEvent) =>
      (e.target as HTMLElement | null)?.tagName === 'INPUT';
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    });
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (e.key.toLowerCase() === 'm' && !e.repeat) this.audio.toggleMute();
    });
  }

  // ------------------------------------------------------------- lifecycle

  start(plane?: PlaneType): void {
    if (plane && plane !== this.planeType) this.choosePlane(plane);
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
    this.bombsLeft = this.maxBombs;
    this.lives = 3;
    this.score = 0;
    this.invulnUntil = 0;
    this.nextEnemyAt = this.now + 2500;
    this.nextGroundAt = this.now + 800;
    this.nextRunwayAt = this.now + 13000;
    this.nextRiverAt = this.now + 8000;
    this.nextRoadAt = this.now + 24000;
    this.nextVillageAt = this.now + 30000;
    this.nextCastleAt = this.now + 80000;
    this.nextHillsAt = this.now + 14000;
    this.nextCanyonAt = this.now + 90000 + Math.random() * 30000;
    this.startedAt = this.now;
    this.player.position.set(0, this.alt, PLAYER_Z);
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

  /** Touch-control hooks: virtual buttons feed the same key set as the keyboard. */
  press(key: string): void {
    this.keys.add(key);
  }

  release(key: string): void {
    this.keys.delete(key);
  }

  update(dt: number, now: number): void {
    this.now = now;
    this.playerProp.rotation.z += (30 + 20 * this.speedFactor) * dt;
    if (this.playerProp2) this.playerProp2.rotation.z -= (30 + 20 * this.speedFactor) * dt; // counter-rotating

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
    this.updateWeather(dt);
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
      const runwayEnding =
        !this.activeRunway || this.activeRunway.group.position.z > this.player.position.z + 18;
      if (this.fuel >= 100 || runwayEnding) {
        this.mode = 'takeoff';
        this.hud.refuel.textContent = 'TAKING OFF';
      }
      return;
    }

    if (this.mode === 'takeoff') {
      this.alt += 10 * dt;
      p.y = this.alt;
      this.player.rotation.x = THREE.MathUtils.lerp(this.player.rotation.x, 0.24, 0.1);
      if (this.alt >= 12) {
        this.mode = 'flying';
        this.activeRunway = null;
      }
      return;
    }

    const stats = PLANE_MAP[this.planeType] ?? PLANE_MAP[DEFAULT_PLANE];
    let bank = 0;
    let pitch = 0;

    if (this.keys.has('ArrowLeft')) {
      p.x -= stats.steer * dt;
      bank = 0.42;
    } else if (this.keys.has('ArrowRight')) {
      p.x += stats.steer * dt;
      bank = -0.42;
    }
    if (this.keys.has('ArrowUp')) {
      this.alt = Math.min(MAX_ALT, this.alt + stats.climb * dt);
      pitch = 0.28; // nose up
    } else if (this.keys.has('ArrowDown')) {
      this.alt -= stats.dive * dt;
      pitch = -0.3; // nose down
    }

    p.x = THREE.MathUtils.clamp(p.x, -LATERAL_RANGE, LATERAL_RANGE);
    p.y = Math.max(0.2, this.alt);
    this.player.rotation.z = THREE.MathUtils.lerp(this.player.rotation.z, bank, 0.12);
    this.player.rotation.x = THREE.MathUtils.lerp(this.player.rotation.x, pitch, 0.12);

    // Flying into a structure is an immediate crash.
    this.checkStructureCollision();

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
      this.nextGunAt = this.now + stats.gunMs;
      this.audio.gun();
      for (const gx of [-1.1, 1.1]) {
        this.spawnBullet(
          new THREE.Vector3(p.x + gx, p.y + 1.1, p.z - 3.2),
          new THREE.Vector3(0, 0, -230),
          false,
        );
      }
    }
    if (this.keys.has('b') && this.now > this.nextBombAt && this.alt > 3 && this.bombsLeft >= 1) {
      this.nextBombAt = this.now + 750;
      this.bombsLeft -= 1;
      this.audio.bombWhistle(Math.sqrt((2 * Math.max(1, p.y)) / GRAVITY));
      const bomb = makeBomb();
      bomb.position.set(p.x, p.y - 0.8, p.z);
      bomb.rotation.x = Math.PI / 2; // carried level, nose forward
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
      this.bombsLeft = Math.min(this.maxBombs, this.bombsLeft + 12 * dt); // ground crew rearming
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

  /** Crash when the plane occupies the same space as solid structure or terrain. */
  private checkStructureCollision(): void {
    const p = this.player.position;
    for (const o of this.groundObjs) {
      const pos = o.group.position;
      const dx = Math.abs(pos.x - p.x);
      const dz = Math.abs(pos.z - p.z);
      let hit = false;
      let safeAlt = 14;
      if (o.kind === 'bridge' && !o.dead) {
        // The deck is solid, but a daring pilot can fly under it.
        hit = dz < 3.5 && dx < 15.5 && this.alt > 2.6 && this.alt < 5.4;
      } else if (o.kind === 'hill') {
        // Conical terrain: the closer to the summit, the higher you must be.
        const d = Math.hypot(pos.x - p.x, pos.z - p.z);
        const r = o.hillR ?? 10;
        const h = o.hillH ?? 10;
        hit = d < r && this.alt < h * (1 - d / r) + 0.7;
        safeAlt = Math.min(MAX_ALT - 4, h + 5);
      } else if (o.kind === 'canyon' && o.river) {
        // Inside the gorge you can fly below the rims; the walls are solid.
        const rel = p.z - pos.z;
        if (Math.abs(rel) < RIVER_LEN / 2) {
          const wallH = CANYON_WALL_H * canyonTaper(rel);
          const dxc = p.x - (pos.x + riverXAt(o.river, rel));
          hit = Math.abs(dxc) > CANYON_WIDTH / 2 - 2 && this.alt < wallH + 0.7;
          safeAlt = wallH + 6;
        }
      } else {
        const dims = STRUCT_HIT[o.kind];
        if (!dims) continue;
        const h = o.dead ? 2.2 : dims.h; // wreckage is low enough to skim over
        hit = dz < dims.r && dx < dims.r && this.alt < h;
      }
      if (hit) {
        this.playerHit(true); // crash explosion + lost life
        this.alt = safeAlt;
        return;
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
      const r = Math.random();
      const kind: GroundKind =
        r < 0.26 ? 'building' :
        r < 0.46 ? 'aagun' :
        r < 0.62 ? 'tank' :
        r < 0.75 ? 'factory' :
        r < 0.87 ? 'depot' : 'windmill';
      this.spawnGroundObj(kind);
    }
    if (this.now > this.nextRunwayAt) {
      // If targets are blocking the lane right now, retry shortly instead.
      this.nextRunwayAt = this.spawnGroundObj('runway')
        ? this.now + 15000 + Math.random() * 9000
        : this.now + 4000;
    }
    // Canyons check first so rivers/roads don't monopolize the lane slot.
    if (this.now > this.nextCanyonAt) {
      this.nextCanyonAt = this.spawnCanyon()
        ? this.now + 90000 + Math.random() * 60000
        : this.now + 9000;
    }
    if (this.now > this.nextRiverAt) {
      this.nextRiverAt = this.spawnRiver()
        ? this.now + 40000 + Math.random() * 16000
        : this.now + 6000;
    }
    if (this.now > this.nextRoadAt) {
      this.nextRoadAt = this.spawnRoad()
        ? this.now + 40000 + Math.random() * 16000
        : this.now + 6000;
    }
    if (this.now > this.nextVillageAt) {
      this.nextVillageAt = this.spawnVillage()
        ? this.now + 55000 + Math.random() * 35000
        : this.now + 8000;
    }
    if (this.now > this.nextCastleAt) {
      this.nextCastleAt = this.spawnCastle()
        ? this.now + 140000 + Math.random() * 80000
        : this.now + 10000;
    }
    if (this.now > this.nextHillsAt) {
      this.nextHillsAt = this.spawnHills()
        ? this.now + 24000 + Math.random() * 18000
        : this.now + 7000;
    }
  }

  private spawnEnemy(): void {
    const roll = Math.random();
    const kind: EnemyKind =
      roll < 0.45 ? 'bi' : roll < 0.65 ? 'mono' : roll < 0.85 ? 'tri' : 'blimp';
    const info = ENEMY_INFO[kind];

    // Deeper into the sortie, some fighters come from behind and overtake you.
    const fromBehind =
      kind !== 'blimp' && this.now - this.startedAt > 45000 && Math.random() < 0.35;

    const { group, prop } =
      kind === 'blimp'
        ? makeBlimp()
        : makePlane(ENEMY_FORMS[info.shape as PlaneShape], info.body, info.wing, 0xeed8d4);

    const alt = kind === 'blimp' ? 22 + Math.random() * 12 : 6 + Math.random() * 30;
    if (fromBehind) {
      group.rotation.y = 0; // flying away from the camera, faster than you
      group.position.set((Math.random() - 0.5) * 2 * LATERAL_RANGE, alt, 70);
    } else {
      group.rotation.y = Math.PI; // heading toward the player
      group.position.set((Math.random() - 0.5) * 2 * LATERAL_RANGE, alt, -480);
    }
    this.scene.add(group);

    const speed =
      kind === 'blimp' ? 8 + Math.random() * 8 :
      kind === 'mono' ? 55 + Math.random() * 30 :
      kind === 'tri' ? 30 + Math.random() * 30 :
      35 + Math.random() * 40;

    this.enemies.push({
      group,
      prop,
      kind,
      mode: fromBehind ? 'overtake' : 'attack',
      alt,
      speed: fromBehind ? -(WORLD_SPEED * 0.35) - (45 + Math.random() * 30) : speed,
      wobble: Math.random() * Math.PI * 2,
      hp: info.hp,
      fireAt: this.now + 1000 + Math.random() * 1500,
    });
  }

  private spawnGroundObj(kind: GroundKind): boolean {
    const range = kind === 'runway' ? 20 : 34;
    let x = (Math.random() - 0.5) * 2 * range;
    for (let tries = 0; tries < 8 && this.blocksRunwayLane(kind, x); tries++) {
      x = (Math.random() - 0.5) * 2 * range;
    }
    if (this.blocksRunwayLane(kind, x)) return false;

    let group: THREE.Group;
    let barrel: THREE.Group | undefined;
    let vx: number | undefined;
    if (kind === 'building') group = makeBuilding();
    else if (kind === 'runway') group = makeRunway();
    else if (kind === 'factory') group = makeFactory();
    else if (kind === 'depot') group = makeDepot();
    else if (kind === 'windmill') {
      const model = makeWindmill();
      group = model.group;
      barrel = model.barrel;
    }
    else if (kind === 'tank') {
      const model = makeTank();
      group = model.group;
      barrel = model.barrel;
      vx = (Math.random() < 0.5 ? -1 : 1) * (3.5 + Math.random() * 3.5);
    } else {
      const model: AAGunModel = makeAAGun();
      group = model.group;
      barrel = model.barrel;
    }
    group.position.set(x, 0, -500);
    this.scene.add(group);
    this.groundObjs.push({
      group, kind, barrel, vx,
      hp: GROUND_STATS[kind].hp,
      fireAt: this.now + 1500,
    });
    return true;
  }

  /** True when another long lane (river/road) still overlaps the spawn horizon. */
  private laneBusy(): boolean {
    return this.groundObjs.some(
      (o) => isLane(o.kind) && o.group.position.z - RIVER_LEN / 2 < -480,
    );
  }

  /** Village: a church surrounded by a loose cluster of cottages. */
  private spawnVillage(): boolean {
    const cx = (Math.random() - 0.5) * 44;
    if (this.blocksRunwayLane('building', cx, 10)) return false;
    const church = makeChurch();
    church.position.set(cx, 0, -520);
    this.scene.add(church);
    this.groundObjs.push({ group: church, kind: 'building', hp: 2, fireAt: Infinity });
    let placed = 1;
    const count = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const hx = cx + (Math.random() - 0.5) * 42;
      if (Math.abs(hx) > 44 || this.blocksRunwayLane('building', hx)) continue;
      const house = Math.random() < 0.7 ? makeCottage() : makeBuilding();
      house.position.set(hx, 0, -498 - Math.random() * 85);
      this.scene.add(house);
      this.groundObjs.push({ group: house, kind: 'building', hp: 2, fireAt: Infinity });
      placed++;
    }
    return placed >= 4;
  }

  /** Rare landmark fortress — the biggest prize on the map. */
  private spawnCastle(): boolean {
    const x = (Math.random() - 0.5) * 52;
    if (this.blocksRunwayLane('building', x, 10)) return false;
    const castle = makeCastle();
    castle.position.set(x, 0, -515);
    this.scene.add(castle);
    this.groundObjs.push({ group: castle, kind: 'castle', hp: GROUND_STATS.castle.hp, fireAt: Infinity });
    return true;
  }

  /** A short ridge of 1-3 hills — solid terrain you must out-climb. */
  private spawnHills(): boolean {
    const cx = (Math.random() - 0.5) * 90;
    const count = 1 + Math.floor(Math.random() * 3);
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const r = 9 + Math.random() * 8;
      const h = 9 + Math.random() * 11;
      const hx = cx + i * (r * 1.5) * (Math.random() < 0.5 ? -1 : 1);
      if (this.blocksRunwayLane('hill', hx, r - 10)) continue;
      const hill = makeHill(r, h);
      hill.position.set(hx, 0, -505 - Math.random() * 40);
      this.scene.add(hill);
      this.groundObjs.push({ group: hill, kind: 'hill', hp: 99, fireAt: Infinity, hillR: r, hillH: h });
      placed++;
    }
    return placed > 0;
  }

  /** A long canyon run: dive below the rim, follow the gorge, climb out. */
  private spawnCanyon(): boolean {
    if (this.laneBusy()) return false;
    const params: RiverParams = {
      amp: 18 + Math.random() * 20,
      waveLen: 700 + Math.random() * 300,
      phase: Math.random() * Math.PI * 2,
      amp2: 4 + Math.random() * 4,
      waveLen2: 160 + Math.random() * 80,
      phase2: Math.random() * Math.PI * 2,
      sideIn: 1,
      sideOut: 1,
      edgePush: 0, // canyon ends stay in line; you fly in over the tapered walls
    };
    const baseX = (Math.random() - 0.5) * 20;
    const group = makeCanyon(params);
    group.position.set(baseX, 0, -500 - RIVER_LEN / 2);
    this.scene.add(group);
    this.groundObjs.push({ group, kind: 'canyon', hp: 99, fireAt: Infinity, river: params });
    return true;
  }

  /** True when placing here would collide with a runway or a lane's course. */
  private blocksRunwayLane(kind: GroundKind, x: number, extra = 0): boolean {
    for (const o of this.groundObjs) {
      if (isLane(o.kind) && o.river) {
        // Everything scrolls at the same speed, so a newly spawned object stays
        // aligned with the river section sharing its spawn z forever — check
        // the course at exactly that section (plus the object's z extent).
        const rel = -500 - o.group.position.z;
        const halfSpan = kind === 'runway' ? 45 : 20;
        const laneMargin = o.kind === 'canyon' ? 56 : 24;
        for (let dz = -halfSpan; dz <= halfSpan; dz += 15) {
          const r = rel + dz;
          if (Math.abs(r) > RIVER_LEN / 2) continue;
          if (Math.abs(o.group.position.x + riverXAt(o.river, r) - x) < laneMargin + extra) return true;
        }
      } else if ((kind === 'runway' || o.kind === 'runway') && o.kind !== 'river') {
        if (o.group.position.z < -380 && Math.abs(o.group.position.x - x) < 18 + extra) return true;
      }
    }
    return false;
  }

  /** Long meandering river with bridges where it crosses the corridor, and barges. */
  private spawnRiver(): boolean {
    if (this.laneBusy()) return false;
    const params: RiverParams = {
      amp: 60 + Math.random() * 70,
      waveLen: 500 + Math.random() * 400,
      phase: Math.random() * Math.PI * 2,
      amp2: 10 + Math.random() * 14,
      waveLen2: 120 + Math.random() * 100,
      phase2: Math.random() * Math.PI * 2,
      sideIn: Math.random() < 0.5 ? -1 : 1,
      sideOut: Math.random() < 0.5 ? -1 : 1,
    };
    const baseX = (Math.random() - 0.5) * 30;
    const group = makeRiver(params);
    const centerZ = -500 - RIVER_LEN / 2;
    group.position.set(baseX, 0, centerZ);
    this.scene.add(group);
    const river: GroundObj = { group, kind: 'river', hp: 99, fireAt: Infinity, river: params };
    this.groundObjs.push(river);

    // Bridges only where the river actually crosses the play corridor.
    const bridgeSpots: number[] = [];
    for (let tries = 0; tries < 40 && bridgeSpots.length < 3; tries++) {
      const rz = (Math.random() - 0.5) * (RIVER_LEN - 400);
      if (Math.abs(baseX + riverXAt(params, rz)) > 36) continue;
      if (bridgeSpots.some((s) => Math.abs(s - rz) < 240)) continue;
      bridgeSpots.push(rz);
    }
    for (const rz of bridgeSpots) {
      const bridge = makeBridge();
      bridge.position.set(baseX + riverXAt(params, rz), 0, centerZ + rz);
      this.scene.add(bridge);
      this.groundObjs.push({ group: bridge, kind: 'bridge', hp: GROUND_STATS.bridge.hp, fireAt: Infinity });
    }

    const shipCount = 2 + (Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < shipCount; i++) {
      const rz = (Math.random() - 0.5) * (RIVER_LEN - 300);
      const ship = makeShip();
      ship.position.set(baseX + riverXAt(params, rz), 0, centerZ + rz);
      this.scene.add(ship);
      this.groundObjs.push({
        group: ship, kind: 'ship', hp: GROUND_STATS.ship.hp, fireAt: Infinity,
        host: river, vz: (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 5),
      });
    }
    return true;
  }

  /** Country road with truck traffic running both directions. */
  private spawnRoad(): boolean {
    if (this.laneBusy()) return false;
    const params: RiverParams = {
      amp: 40 + Math.random() * 55,
      waveLen: 620 + Math.random() * 380,
      phase: Math.random() * Math.PI * 2,
      amp2: 6 + Math.random() * 9,
      waveLen2: 150 + Math.random() * 120,
      phase2: Math.random() * Math.PI * 2,
      sideIn: Math.random() < 0.5 ? -1 : 1,
      sideOut: Math.random() < 0.5 ? -1 : 1,
    };
    const baseX = (Math.random() - 0.5) * 30;
    const group = makeRoad(params);
    const centerZ = -500 - RIVER_LEN / 2;
    group.position.set(baseX, 0, centerZ);
    this.scene.add(group);
    const road: GroundObj = { group, kind: 'road', hp: 99, fireAt: Infinity, river: params };
    this.groundObjs.push(road);

    const carCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < carCount; i++) {
      const rz = (Math.random() - 0.5) * (RIVER_LEN - 300);
      const car = makeCar();
      car.position.set(baseX + riverXAt(params, rz), 0, centerZ + rz);
      this.scene.add(car);
      this.groundObjs.push({
        group: car, kind: 'car', hp: GROUND_STATS.car.hp, fireAt: Infinity,
        host: road,
        // Alternate direction so traffic runs both ways.
        vz: (i % 2 === 0 ? 1 : -1) * (9 + Math.random() * 6),
      });
    }
    return true;
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

      // Overtakers race ahead, then swing around and join the attack.
      if (e.mode === 'overtake' && pos.z < -350) {
        e.mode = 'attack';
        e.speed = 35 + Math.random() * 40;
        e.group.rotation.y = Math.PI;
      }

      const blimp = e.kind === 'blimp';

      // Pursue the player at range, but commit to the attack line on final
      // approach so head-on collisions stay dodgeable. Blimps just drift.
      const pursuing = !blimp && e.mode === 'attack' && pos.z < PLAYER_Z - 70 ? 1 : 0;
      pos.x += (THREE.MathUtils.clamp(p.x - pos.x, -1, 1) * 9 * pursuing + Math.sin(e.wobble) * (blimp ? 0.6 : 3)) * dt;
      e.alt += THREE.MathUtils.clamp(p.y - e.alt, -1, 1) * 2.4 * pursuing * dt;
      pos.y = e.alt;
      e.group.rotation.z = Math.sin(e.wobble) * (blimp ? 0.03 : 0.15);

      // Fire when in the approach window; blimp gondolas lob slow flak.
      if (e.mode === 'attack' && this.now > e.fireAt && pos.z > -300 && pos.z < PLAYER_Z - 10) {
        e.fireAt = this.now + (blimp ? 2600 + Math.random() * 1600 : 1500 + Math.random() * 1400);
        const muzzle = blimp ? pos.clone().setY(pos.y - 3.5) : pos.clone();
        const dir = new THREE.Vector3().subVectors(p, muzzle).normalize().multiplyScalar(blimp ? 60 : 85);
        this.spawnBullet(muzzle, dir, true, blimp ? P.flak : undefined);
      }

      // Mid-air collision.
      if (pos.distanceTo(p) < ENEMY_INFO[e.kind].hitR) {
        this.explode(pos, blimp ? 40 : 16);
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

      // Windmill sails turn until the mill is knocked out.
      if (o.kind === 'windmill' && o.barrel && !o.damaged) {
        o.barrel.rotation.z += 1.1 * dt;
      }

      // Tanks patrol laterally until knocked out.
      if (o.kind === 'tank' && o.vx && !o.damaged) {
        pos.x += o.vx * dt;
        if (Math.abs(pos.x) > 42) o.vx = -o.vx;
        o.group.rotation.y = o.vx > 0 ? -Math.PI / 2 : Math.PI / 2;
      }

      // Barges and trucks follow their lane's course, turning back near its ends.
      if ((o.kind === 'ship' || o.kind === 'car') && o.host?.river && o.vz && !o.damaged) {
        pos.z += o.vz * dt;
        const rel = pos.z - o.host.group.position.z;
        if (Math.abs(rel) > RIVER_LEN / 2 - 130) o.vz = -o.vz;
        // Trucks keep to their side: right lane heads away, left lane comes toward you.
        const laneOffset = o.kind === 'car' ? (o.vz < 0 ? 2.4 : -2.4) : 0;
        pos.x = o.host.group.position.x + riverXAt(o.host.river, rel) + laneOffset;
        // Point the nose along the local course direction.
        const dzs = o.vz > 0 ? 6 : -6;
        const dx = o.host.group.position.x + riverXAt(o.host.river, rel + dzs) + laneOffset - pos.x;
        o.group.rotation.y = Math.atan2(-dx, -dzs);
      }

      // Damaged or destroyed objects trail smoke instead of fighting back.
      if (o.damaged && this.now > (o.nextSmokeAt ?? 0) && pos.z > -420) {
        o.nextSmokeAt = this.now + (o.dead ? 100 : 190);
        this.spawnSmoke(pos, o.dead ? 1.3 : 0.8);
      }

      if ((o.kind === 'aagun' || o.kind === 'tank') && o.barrel && !o.damaged) {
        // Track the player: AA guns swivel their whole mount, tanks just the turret.
        const toPlayer = new THREE.Vector3().subVectors(p, pos);
        const yaw = Math.atan2(-toPlayer.x, -toPlayer.z) + Math.PI;
        if (o.kind === 'aagun') {
          o.group.rotation.y = yaw;
          const horiz = Math.hypot(toPlayer.x, toPlayer.z);
          o.barrel.rotation.x = Math.atan2(p.y - 2.3, horiz) + Math.PI / 2 - 0.4;
        } else {
          o.barrel.rotation.y = yaw - o.group.rotation.y;
        }

        const tank = o.kind === 'tank';
        const zMin = tank ? -280 : -340;
        if (this.now > o.fireAt && pos.z > zMin && pos.z < PLAYER_Z + 5) {
          o.fireAt = this.now + (tank ? 3400 + Math.random() * 1600 : 2000 + Math.random() * 1400);
          const muzzle = pos.clone().setY(2.5);
          const dir = new THREE.Vector3()
            .subVectors(p, muzzle)
            .normalize()
            .multiplyScalar(tank ? 58 : 70);
          this.spawnBullet(muzzle, dir, true, P.flak);
        }
      }

      if (pos.z > (isLane(o.kind) ? RIVER_LEN / 2 + 200 : 140)) {
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
          const info = ENEMY_INFO[e.kind];
          if (pos.distanceTo(e.group.position) < info.hitR) {
            dead = true;
            if (--e.hp <= 0) {
              const epos = e.group.position;
              this.explode(epos, e.kind === 'blimp' ? 44 : 18);
              if (e.kind === 'blimp') {
                // A burning airship goes up along its whole length.
                this.explode(epos.clone().add(new THREE.Vector3(0, 1, -6)), 18);
                this.explode(epos.clone().add(new THREE.Vector3(0, -1, 6)), 18);
              }
              this.score += info.score;
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
      b.mesh.rotation.x = Math.PI / 2 - Math.min(Math.PI / 2, -b.vy * 0.06); // noses over as it falls

      if (pos.y <= 0.4) {
        this.detonate(pos);
        this.scene.remove(b.mesh);
        this.bombs.splice(i, 1);
      }
    }
  }

  private detonate(at: THREE.Vector3): void {
    this.explode(at, 42, 11, true);
    for (const o of this.groundObjs) {
      if (o.kind === 'runway' || isLane(o.kind) || o.dead) continue;
      const pos = o.group.position;
      const dist = Math.hypot(pos.x - at.x, pos.z - at.z);
      if (dist >= GROUND_STATS[o.kind].radius) continue;
      // Direct hits flatten the target; near misses leave it damaged and burning.
      o.hp -= dist < 9 ? 2 : 1;
      if (o.hp <= 0) this.destroyGroundObj(o);
      else this.damageGroundObj(o);
    }
  }

  /** Char the meshes and tilt the roof — the "damaged and burning" state. */
  private damageGroundObj(o: GroundObj): void {
    if (o.damaged) return;
    o.damaged = true;
    o.fireAt = Infinity; // damaged AA guns stop firing
    o.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        (child.material as THREE.MeshLambertMaterial).color.multiplyScalar(0.5);
      }
    });
    const roof = o.group.children[o.group.children.length - 1];
    roof.rotation.z += 0.18;
    roof.position.y -= 0.5;
  }

  /** Destroyed: score it, then leave burning wreckage on the map instead of vanishing. */
  private destroyGroundObj(o: GroundObj): void {
    const pos = o.group.position;
    const big = o.kind === 'depot' || o.kind === 'castle';
    this.explode(pos.clone().setY(2), big ? 44 : 22, big ? 13 : 6, big);
    this.score += GROUND_STATS[o.kind].score;
    o.dead = true;
    o.damaged = true;
    o.fireAt = Infinity;
    if (o.kind === 'building' || o.kind === 'factory' || o.kind === 'castle') {
      o.group.clear();
      const rubble = makeRubble();
      if (o.kind === 'factory') rubble.scale.set(1.7, 1, 1.3);
      if (o.kind === 'castle') rubble.scale.set(2.6, 1.4, 2.6);
      o.group.add(rubble);
    } else if (o.kind === 'bridge') {
      o.group.clear();
      o.group.add(makeBrokenBridge());
    } else {
      // Tanks, guns, and depots burn out in place.
      o.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          (child.material as THREE.MeshLambertMaterial).color.multiplyScalar(0.3);
        }
      });
      if (o.barrel) o.barrel.rotation.x = 1.5; // barrel slumps
      if (o.kind === 'ship') o.group.position.y = -0.55; // settles into the water
    }
  }

  private spawnSmoke(at: THREE.Vector3, scale: number): void {
    const s = (0.7 + Math.random() * 0.7) * scale;
    const shade = 0.18 + Math.random() * 0.25;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(shade, shade, shade) }),
    );
    mesh.position.set(
      at.x + (Math.random() - 0.5) * 2,
      at.y + 1 + Math.random() * 2,
      at.z + (Math.random() - 0.5) * 2,
    );
    const vel = new THREE.Vector3((Math.random() - 0.5) * 1.5, 5 + Math.random() * 3, (Math.random() - 0.5) * 1.5);
    const life = 1.1 + Math.random() * 0.6;
    this.particles.push({ mesh, vel, grav: -1.5, life, maxLife: life });
    this.scene.add(mesh);
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

  private explode(at: THREE.Vector3, count: number, flashScale = 6, ring = false): void {
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
      this.particles.push({ mesh, vel, grav: GRAVITY * 0.6, life, maxLife: life });
      this.scene.add(mesh);
    }
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 }),
    );
    flash.position.copy(at);
    this.flashes.push({ mesh: flash, life: 0.32, maxLife: 0.32, maxScale: flashScale, opacity0: 0.9 });
    this.scene.add(flash);

    if (ring) {
      // Expanding ground shockwave.
      const wave = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.2, 0.1, 22),
        new THREE.MeshBasicMaterial({ color: 0xd8c9a8, transparent: true, opacity: 0.5 }),
      );
      wave.position.set(at.x, 0.3, at.z);
      this.flashes.push({ mesh: wave, life: 0.55, maxLife: 0.55, maxScale: 16, opacity0: 0.5 });
      this.scene.add(wave);
    }
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
      p.vel.y -= p.grav * dt;
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
      const t = 1 - f.life / f.maxLife;
      f.mesh.scale.setScalar(1 + t * (f.maxScale - 1));
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = f.opacity0 * (1 - t);
    }
  }

  private updateCamera(dt: number): void {
    const p = this.player.position;
    const targetX = p.x * 0.45;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetX, 4, dt);
    this.camera.position.y = 38 + p.y * 0.22;
    this.camera.position.z = 44;
    // Roll the horizon gently with the player's bank.
    this.cameraRoll = THREE.MathUtils.damp(this.cameraRoll, -this.player.rotation.z * 0.35, 4, dt);
    this.camera.up.set(Math.sin(this.cameraRoll), Math.cos(this.cameraRoll), 0);
    this.camera.lookAt(p.x * 0.7, 2 + p.y * 0.35, -90);
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
    const bombCount = Math.floor(this.bombsLeft);
    this.hud.bombs.textContent = `💣 ${bombCount}`;
    this.hud.bombs.style.color = bombCount <= 5 ? 'var(--danger)' : 'var(--text)';
    (this.hud.fuelbar as HTMLElement).style.width = `${Math.max(0, this.fuel)}%`;
    (this.hud.fuelbar as HTMLElement).style.background =
      this.fuel < 25 ? 'var(--danger)' : 'var(--good)';
    (this.hud.altbar as HTMLElement).style.width = `${(this.alt / MAX_ALT) * 100}%`;
    this.hud.altval.textContent = String(Math.round(this.alt));
  }
}
