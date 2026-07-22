import * as THREE from 'three';
import { Game, type Hud } from './game';
import {
  makePlane, ENEMY_FORMS, makeBlimp, makeBridge, makeFactory, makeTank,
  makeShip, makeDepot, makeAAGun, makeCar, makeBuilding,
} from './models';
import { PLANES, PLANE_MAP, DEFAULT_PLANE, type PlaneType } from './planes';
import {
  loadScores, addScore, qualifies, best, fetchGlobalScores, remoteEnabled,
  type ScoreEntry,
} from './highscores';

const $ = (id: string) => document.getElementById(id)!;

const hud: Hud = {
  score: $('score'),
  lives: $('lives'),
  bombs: $('bombs'),
  fuelbar: $('fuelbar'),
  altbar: $('altbar'),
  altval: $('altval'),
  refuel: $('refuel'),
};

const game = new Game($('app'), hud);
// Dev console access for debugging/testing.
(window as unknown as { game: Game }).game = game;

const menuEl = $('menu');
const overEl = $('gameover');
const hudEl = $('hud');

// ---------------------------------------------------------------- career XP

let careerXp = Number(localStorage.getItem('bluemax-xp') ?? 0);
if (!Number.isFinite(careerXp) || careerXp < 0) careerXp = 0;

const unlocked = (id: PlaneType): boolean => (PLANE_MAP[id]?.xp ?? 0) <= careerXp;

// ---------------------------------------------------------------- plane selection

const LEGACY_PLANES: Record<string, PlaneType> = { mono: 'eindecker', bi: 'camel', tri: 'dr1' };
let stored = localStorage.getItem('bluemax-plane') ?? DEFAULT_PLANE;
stored = LEGACY_PLANES[stored] ?? stored;
let selectedPlane: PlaneType =
  PLANE_MAP[stored] && unlocked(stored) ? stored : DEFAULT_PLANE;

/** Render each hangar model once into a small transparent thumbnail. */
function makePlaneThumbs(): Record<string, string> {
  const W = 220, H = 130;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xbfd6e8, 0x55584a, 1.15));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.9);
  sun.position.set(-4, 7, -5);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
  cam.position.set(-9, 5.5, -10); // 3/4 front-left; models face -z
  cam.lookAt(0, 1.1, 0.4);

  const copy = document.createElement('canvas');
  copy.width = W;
  copy.height = H;
  const ctx = copy.getContext('2d')!;
  const thumbs: Record<string, string> = {};
  for (const def of PLANES) {
    const { group } = makePlane(def.form, def.body, def.wing, def.detail);
    scene.add(group);
    renderer.render(scene, cam);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(renderer.domElement, 0, 0);
    thumbs[def.id] = copy.toDataURL();
    scene.remove(group);
  }
  renderer.dispose();
  return thumbs;
}

const planeThumbs = makePlaneThumbs();

// ---------------------------------------------------------------- scoring help

/** Every scoreable target, best first, with a builder for its 3D thumbnail. */
const SCORE_TABLE: { label: string; pts: number; build: () => THREE.Object3D }[] = [
  { label: 'Zeppelin', pts: 300, build: () => makeBlimp().group },
  { label: 'Enemy Triplane', pts: 150, build: () => makePlane(ENEMY_FORMS.tri, 0x9c3b34, 0xd0685c, 0xeed8d4).group },
  { label: 'Bridge', pts: 150, build: makeBridge },
  { label: 'Factory', pts: 125, build: makeFactory },
  { label: 'Enemy Monoplane', pts: 120, build: () => makePlane(ENEMY_FORMS.mono, 0x5a5f66, 0x7d838c, 0xeed8d4).group },
  { label: 'Enemy Biplane', pts: 100, build: () => makePlane(ENEMY_FORMS.bi, 0x8c4a45, 0xc47a6e, 0xeed8d4).group },
  { label: 'Tank', pts: 100, build: () => makeTank().group },
  { label: 'River Barge', pts: 100, build: makeShip },
  { label: 'Fuel Depot', pts: 100, build: makeDepot },
  { label: 'AA Gun', pts: 75, build: () => makeAAGun().group },
  { label: 'Truck', pts: 60, build: makeCar },
  { label: 'Building', pts: 50, build: makeBuilding },
];

/** Render each target model into a thumbnail, auto-framed by its bounding box. */
function buildScoreGrid(): void {
  const W = 220, H = 120;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xbfd6e8, 0x55584a, 1.15));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.9);
  sun.position.set(-4, 7, -5);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);
  const copy = document.createElement('canvas');
  copy.width = W;
  copy.height = H;
  const ctx = copy.getContext('2d')!;

  const grid = $('scoreGrid');
  for (const target of SCORE_TABLE) {
    const obj = target.build();
    scene.add(obj);
    const bbox = new THREE.Box3().setFromObject(obj);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z * 0.8);
    const dist = (maxDim / (2 * Math.tan((30 * Math.PI) / 360))) * 1.2;
    cam.position.set(center.x - dist * 0.55, center.y + dist * 0.42, center.z - dist * 0.62);
    cam.lookAt(center);
    renderer.render(scene, cam);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(renderer.domElement, 0, 0);
    scene.remove(obj);

    const item = document.createElement('div');
    item.className = 'score-item';
    const img = document.createElement('img');
    img.src = copy.toDataURL();
    img.alt = target.label;
    img.draggable = false;
    const name = document.createElement('div');
    name.className = 's-name';
    name.textContent = target.label;
    const pts = document.createElement('div');
    pts.className = 's-pts';
    pts.textContent = `${target.pts} PTS`;
    item.append(img, name, pts);
    grid.appendChild(item);
  }
  renderer.dispose();
}
buildScoreGrid();

const helpEl = $('help');
$('helpBtn').addEventListener('click', () => helpEl.classList.remove('hidden'));
$('helpClose').addEventListener('click', () => helpEl.classList.add('hidden'));

function rebuildPlaneCards(): void {
  $('career').textContent = `CAREER ${careerXp.toLocaleString()} XP`;
  const grid = $('planeGrid');
  grid.innerHTML = '';
  for (const def of PLANES) {
    const card = document.createElement('div');
    const isUnlocked = unlocked(def.id);
    card.className = 'plane-card';
    card.classList.toggle('locked', !isUnlocked);
    card.classList.toggle('selected', def.id === selectedPlane);

    const icon = document.createElement('img');
    icon.className = 'p-thumb';
    icon.src = planeThumbs[def.id];
    icon.alt = def.label;
    icon.draggable = false;
    const name = document.createElement('div');
    name.className = 'p-name';
    name.textContent = def.label.toUpperCase();
    const desc = document.createElement('div');
    desc.className = 'p-desc';
    desc.textContent = `${def.year} · ${def.desc}`;
    card.append(icon, name, desc);

    if (!isUnlocked) {
      const lock = document.createElement('div');
      lock.className = 'p-lock';
      lock.textContent = `UNLOCK AT ${def.xp.toLocaleString()} XP`;
      card.appendChild(lock);
    } else {
      card.addEventListener('click', () => {
        selectedPlane = def.id;
        localStorage.setItem('bluemax-plane', selectedPlane);
        rebuildPlaneCards();
        game.choosePlane(selectedPlane); // live preview behind the menu
      });
    }
    grid.appendChild(card);
  }
}

rebuildPlaneCards();
game.choosePlane(selectedPlane);

// ---------------------------------------------------------------- high scores

let pendingScore: number | null = null;
const hsEntry = $('hsEntry');
const hsName = $('hsName') as HTMLInputElement;

function renderList(entries: ScoreEntry[], highlight: ScoreEntry | null): void {
  const list = $('hsList');
  list.innerHTML = '';
  for (const [i, s] of entries.slice(0, 5).entries()) {
    const li = document.createElement('li');
    if (highlight && s.name === highlight.name && s.score === highlight.score) {
      li.className = 'latest';
    }
    const name = document.createElement('span');
    name.className = 'hs-name';
    name.textContent = `${i + 1}. ${s.name}`;
    const score = document.createElement('span');
    score.className = 'hs-score';
    score.textContent = s.score.toLocaleString();
    li.append(name, score);
    list.appendChild(li);
  }
}

function renderScores(highlight: ScoreEntry | null): void {
  // Local table shows instantly; the shared leaderboard replaces it when it answers.
  $('hsHeading').textContent = remoteEnabled() ? 'GLOBAL TOP 5' : 'TOP 5';
  renderList(loadScores(), highlight);
  if (remoteEnabled()) {
    void fetchGlobalScores().then((global) => {
      if (global && global.length) renderList(global, highlight);
    });
  }
}

function updateBest(): void {
  $('best').textContent = `HI ${best().toLocaleString()}`;
}
updateBest();

function saveHighScore(): void {
  if (pendingScore == null) return;
  const name = (hsName.value.trim().toUpperCase() || 'ACE').slice(0, 3);
  localStorage.setItem('bluemax-pilot', name);
  const entry: ScoreEntry = {
    name,
    score: pendingScore,
    plane: selectedPlane,
    date: new Date().toISOString().slice(0, 10),
  };
  addScore(entry);
  pendingScore = null;
  hsEntry.classList.add('hidden');
  hsName.blur();
  renderScores(entry);
  updateBest();
  // Give the remote submit a moment to land, then refresh the global board.
  if (remoteEnabled()) setTimeout(() => renderScores(entry), 900);
}

$('hsSave').addEventListener('click', saveHighScore);
hsName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.stopPropagation();
    saveHighScore();
  }
});

// ---------------------------------------------------------------- game flow

function startGame(): void {
  pendingScore = null;
  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  updateBest();
  game.start(selectedPlane);
  updateTouchVisibility();
}

game.onGameOver = (reason, score) => {
  $('overReason').textContent = reason;
  $('finalScore').textContent = score.toLocaleString();

  // Career XP accumulates across every sortie; new planes may unlock.
  const prevXp = careerXp;
  careerXp += score;
  localStorage.setItem('bluemax-xp', String(careerXp));
  const fresh = PLANES.filter((p) => p.xp > prevXp && p.xp <= careerXp);
  const unlockedEl = $('unlocked');
  unlockedEl.classList.toggle('hidden', fresh.length === 0);
  unlockedEl.textContent = fresh.length
    ? `✈ NEW AIRCRAFT UNLOCKED: ${fresh.map((p) => p.label).join(', ')}`
    : '';
  rebuildPlaneCards();

  if (qualifies(score)) {
    pendingScore = score;
    hsEntry.classList.remove('hidden');
    hsName.value = localStorage.getItem('bluemax-pilot') ?? '';
    setTimeout(() => hsName.focus(), 50);
  } else {
    hsEntry.classList.add('hidden');
  }
  renderScores(null);
  overEl.classList.remove('hidden');
  updateTouchVisibility();
};

$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('changeBtn').addEventListener('click', () => {
  overEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
});

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}
$('fsBtn').addEventListener('click', toggleFullscreen);

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
  if (e.key === 'Escape') helpEl.classList.add('hidden');
  if (helpEl.classList.contains('hidden') === false) return; // help modal is open
  if (e.key === 'Enter' && game.state !== 'playing') startGame();
  if (e.key.toLowerCase() === 'f' && !e.repeat) toggleFullscreen();
});

// ---------------------------------------------------------------- touch controls

const touchEl = $('touch');
let touchEnabled = false;

/** Joystick and buttons appear only on touch devices, and only while flying. */
function updateTouchVisibility(): void {
  touchEl.classList.toggle('hidden', !(touchEnabled && game.state === 'playing'));
}

function enableTouch(): void {
  if (touchEnabled) return;
  touchEnabled = true;
  wireTouch();
  updateTouchVisibility();
}

if (
  'ontouchstart' in window ||
  navigator.maxTouchPoints > 0 ||
  window.matchMedia('(pointer: coarse)').matches
) {
  enableTouch();
} else {
  // Fallback: the first real touch anywhere proves this is a touch device.
  window.addEventListener('touchstart', enableTouch, { once: true });
}

function wireTouch(): void {
  const stick = $('stick');
  const nub = $('stickNub');

  const DEAD = 14; // px of drag before a direction engages
  const held = new Set<string>();
  const setDir = (key: string, on: boolean) => {
    if (on && !held.has(key)) {
      held.add(key);
      game.press(key);
    } else if (!on && held.has(key)) {
      held.delete(key);
      game.release(key);
    }
  };

  let origin: { x: number; y: number } | null = null;
  const handle = (e: TouchEvent) => {
    e.preventDefault();
    const t = e.targetTouches[0];
    if (!t) return;
    if (!origin) origin = { x: t.clientX, y: t.clientY };
    const dx = t.clientX - origin.x;
    const dy = t.clientY - origin.y;
    const clamp = (v: number) => Math.max(-44, Math.min(44, v));
    nub.style.transform = `translate(${clamp(dx)}px, ${clamp(dy)}px)`;
    setDir('ArrowLeft', dx < -DEAD);
    setDir('ArrowRight', dx > DEAD);
    setDir('ArrowUp', dy < -DEAD);   // drag up = climb
    setDir('ArrowDown', dy > DEAD);
  };
  stick.addEventListener('touchstart', handle, { passive: false });
  stick.addEventListener('touchmove', handle, { passive: false });
  stick.addEventListener('touchend', (e) => {
    e.preventDefault();
    origin = null;
    nub.style.transform = '';
    for (const key of [...held]) setDir(key, false);
  });

  const bindButton = (id: string, key: string) => {
    const el = $(id);
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      game.press(key);
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      e.preventDefault();
      game.release(key);
    });
  };
  bindButton('fireBtn', ' ');
  bindButton('bombBtn', 'b');
}

// Fixed-ish timestep loop with a delta clamp so tab-switches don't teleport things.
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.update(dt, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
