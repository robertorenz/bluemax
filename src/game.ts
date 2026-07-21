import * as THREE from 'three';
import { AudioFx } from './audio';
import { P } from './palette';
import {
  makeBiplane, makeBuilding, makeAAGun, makeRunway, makeBomb, makeBullet,
  makeCloud, makeRubble, makeFactory, makeTank, makeDepot,
  makeRiver, makeBridge, makeBrokenBridge, makeShip, riverXAt, RIVER_LEN,
  type AAGunModel, type RiverParams,
} from './models';
import { makeChunk, CHUNK_D, CHUNK_COUNT } from './terrain';

const WORLD_SPEED = 65;   // ground scroll speed, units/s
const PLAYER_Z = -20;     // plane sits ahead of the camera line so bomb falls stay in view
const MAX_ALT = 38;
const MIN_SAFE_ALT = 0.6; // below this off-runway = crash
const LATERAL_RANGE = 26;
const GRAVITY = 25;

interface AirEnemy {
  group: THREE.Group;
  prop: THREE.Mesh;
  mode: 'attack' | 'overtake';
  alt: number;
  speed: number;
  wobble: number;
  hp: number;
  fireAt: number;
}

type GroundKind =
  | 'building' | 'aagun' | 'runway' | 'factory' | 'tank' | 'depot'
  | 'river' | 'bridge' | 'ship';

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
  damaged?: boolean;
  dead?: boolean;
  nextSmokeAt?: number;
}

const GROUND_STATS: Record<GroundKind, { hp: number; score: number; radius: number }> = {
  building: { hp: 2, score: 50, radius: 16 },
  aagun:    { hp: 1, score: 75, radius: 16 },
  factory:  { hp: 2, score: 125, radius: 20 },
  tank:     { hp: 1, score: 100, radius: 14 },
  depot:    { hp: 1, score: 100, radius: 18 },
  bridge:   { hp: 2, score: 150, radius: 16 },
  ship:     { hp: 1, score: 100, radius: 14 },
  river:    { hp: 99, score: 0, radius: 0 },
  runway:   { hp: 99, score: 0, radius: 0 },
};

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
  grav: number;
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
  private nextRiverAt = 0;
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
    group.position.set(0, this.alt, PLAYER_Z);
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
    this.nextRiverAt = this.now + 8000;
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
      const r = Math.random();
      const kind: GroundKind =
        r < 0.3 ? 'building' :
        r < 0.52 ? 'aagun' :
        r < 0.7 ? 'tank' :
        r < 0.85 ? 'factory' : 'depot';
      this.spawnGroundObj(kind);
    }
    if (this.now > this.nextRunwayAt) {
      // If targets are blocking the lane right now, retry shortly instead.
      this.nextRunwayAt = this.spawnGroundObj('runway')
        ? this.now + 15000 + Math.random() * 9000
        : this.now + 4000;
    }
    if (this.now > this.nextRiverAt) {
      this.nextRiverAt = this.spawnRiver()
        ? this.now + 26000 + Math.random() * 14000
        : this.now + 5000;
    }
  }

  private spawnEnemy(): void {
    // Deeper into the sortie, some bandits come from behind and overtake you.
    const fromBehind = this.now - this.startedAt > 45000 && Math.random() < 0.35;
    const { group, prop } = makeBiplane(P.enemyBody, P.enemyWing, 0xeed8d4);
    const alt = 6 + Math.random() * 30;
    if (fromBehind) {
      group.rotation.y = 0; // flying away from the camera, faster than you
      group.position.set((Math.random() - 0.5) * 2 * LATERAL_RANGE, alt, 70);
    } else {
      group.rotation.y = Math.PI; // flying toward the player
      group.position.set((Math.random() - 0.5) * 2 * LATERAL_RANGE, alt, -480);
    }
    this.scene.add(group);
    this.enemies.push({
      group,
      prop,
      mode: fromBehind ? 'overtake' : 'attack',
      alt,
      speed: fromBehind
        ? -(WORLD_SPEED * 0.35) - (45 + Math.random() * 30)
        : 35 + Math.random() * 40,
      wobble: Math.random() * Math.PI * 2,
      hp: 2,
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

  /** True when placing here would collide with a runway or river lane (or vice versa). */
  private blocksRunwayLane(kind: GroundKind, x: number): boolean {
    const isLane = (k: GroundKind) => k === 'runway' || k === 'river';
    return this.groundObjs.some((o) => {
      if (!isLane(kind) && !isLane(o.kind)) return false;
      // Rivers are long and meander, so they claim a wider corridor for longer.
      const margin = kind === 'river' || o.kind === 'river' ? 34 : 18;
      const zWindow = o.kind === 'river' ? -240 : -380;
      return o.group.position.z < zWindow && Math.abs(o.group.position.x - x) < margin;
    });
  }

  /** Meandering river with bridges across it and barges steaming along it. */
  private spawnRiver(): boolean {
    const baseX = (Math.random() - 0.5) * 50;
    if (this.blocksRunwayLane('river', baseX)) return false;
    const params: RiverParams = {
      amp: 6 + Math.random() * 8,
      waveLen: 170 + Math.random() * 130,
      phase: Math.random() * Math.PI * 2,
    };
    const group = makeRiver(params);
    const centerZ = -500 - RIVER_LEN / 2;
    group.position.set(baseX, 0, centerZ);
    this.scene.add(group);
    const river: GroundObj = { group, kind: 'river', hp: 99, fireAt: Infinity, river: params };
    this.groundObjs.push(river);

    const bridgeCount = 1 + (Math.random() < 0.45 ? 1 : 0);
    for (let i = 0; i < bridgeCount; i++) {
      const rz = -160 + i * 160 + Math.random() * 80;
      const bridge = makeBridge();
      bridge.position.set(baseX + riverXAt(params, rz), 0, centerZ + rz);
      this.scene.add(bridge);
      this.groundObjs.push({ group: bridge, kind: 'bridge', hp: GROUND_STATS.bridge.hp, fireAt: Infinity });
    }

    const shipCount = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < shipCount; i++) {
      const rz = (Math.random() - 0.5) * 360;
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

      // Pursue the player at range, but commit to the attack line on final
      // approach so head-on collisions stay dodgeable.
      const pursuing = e.mode === 'attack' && pos.z < -110 ? 1 : 0;
      pos.x += (THREE.MathUtils.clamp(p.x - pos.x, -1, 1) * 9 * pursuing + Math.sin(e.wobble) * 3) * dt;
      e.alt += THREE.MathUtils.clamp(p.y - e.alt, -1, 1) * 2.4 * pursuing * dt;
      pos.y = e.alt;
      e.group.rotation.z = Math.sin(e.wobble) * 0.15;

      // Fire when in the approach window.
      if (e.mode === 'attack' && this.now > e.fireAt && pos.z > -280 && pos.z < -30) {
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

      // Tanks patrol laterally until knocked out.
      if (o.kind === 'tank' && o.vx && !o.damaged) {
        pos.x += o.vx * dt;
        if (Math.abs(pos.x) > 42) o.vx = -o.vx;
        o.group.rotation.y = o.vx > 0 ? -Math.PI / 2 : Math.PI / 2;
      }

      // Barges follow their river's meander, reversing near its ends.
      if (o.kind === 'ship' && o.host?.river && o.vz && !o.damaged) {
        pos.z += o.vz * dt;
        const rel = pos.z - o.host.group.position.z;
        if (Math.abs(rel) > RIVER_LEN / 2 - 30) o.vz = -o.vz;
        pos.x = o.host.group.position.x + riverXAt(o.host.river, rel);
        o.group.rotation.y = o.vz > 0 ? Math.PI : 0;
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
        const zMin = tank ? -260 : -320;
        if (this.now > o.fireAt && pos.z > zMin && pos.z < -20) {
          o.fireAt = this.now + (tank ? 3400 + Math.random() * 1600 : 2000 + Math.random() * 1400);
          const muzzle = pos.clone().setY(2.5);
          const dir = new THREE.Vector3()
            .subVectors(p, muzzle)
            .normalize()
            .multiplyScalar(tank ? 58 : 70);
          this.spawnBullet(muzzle, dir, true, P.flak);
        }
      }

      if (pos.z > (o.kind === 'river' ? 400 : 140)) {
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
    for (const o of this.groundObjs) {
      if (o.kind === 'runway' || o.kind === 'river' || o.dead) continue;
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
    this.explode(pos.clone().setY(2), o.kind === 'depot' ? 38 : 22);
    this.score += GROUND_STATS[o.kind].score;
    o.dead = true;
    o.damaged = true;
    o.fireAt = Infinity;
    if (o.kind === 'building' || o.kind === 'factory') {
      o.group.clear();
      const rubble = makeRubble();
      if (o.kind === 'factory') rubble.scale.set(1.7, 1, 1.3);
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
      this.particles.push({ mesh, vel, grav: GRAVITY * 0.6, life, maxLife: life });
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
      const t = 1 - f.life / 0.32;
      f.mesh.scale.setScalar(1 + t * 5);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
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
    (this.hud.fuelbar as HTMLElement).style.width = `${Math.max(0, this.fuel)}%`;
    (this.hud.fuelbar as HTMLElement).style.background =
      this.fuel < 25 ? 'var(--danger)' : 'var(--good)';
    (this.hud.altbar as HTMLElement).style.width = `${(this.alt / MAX_ALT) * 100}%`;
    this.hud.altval.textContent = String(Math.round(this.alt));
  }
}
