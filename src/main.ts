import { Game, type Hud } from './game';
import { PLANES, PLANE_MAP, DEFAULT_PLANE, type PlaneType } from './planes';
import { loadScores, addScore, qualifies, best, type ScoreEntry } from './highscores';

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

const WING_BARS: Record<string, number> = { mono: 1, bi: 2, tri: 3, bisleek: 2, ww2: 1 };

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

    const icon = document.createElement('div');
    icon.className = 'wing-icon';
    for (let i = 0; i < (WING_BARS[def.shape] ?? 1); i++) {
      icon.appendChild(document.createElement('i'));
    }
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

function renderScores(highlight: ScoreEntry | null): void {
  const list = $('hsList');
  list.innerHTML = '';
  for (const [i, s] of loadScores().slice(0, 5).entries()) {
    const li = document.createElement('li');
    if (highlight && s.name === highlight.name && s.score === highlight.score && s.date === highlight.date) {
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
  if (e.key === 'Enter' && game.state !== 'playing') startGame();
  if (e.key.toLowerCase() === 'f' && !e.repeat) toggleFullscreen();
});

// Fixed-ish timestep loop with a delta clamp so tab-switches don't teleport things.
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.update(dt, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
