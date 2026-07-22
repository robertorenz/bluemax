import { Game, type Hud, type PlaneType } from './game';

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

// ---------------------------------------------------------------- plane selection
const LEGACY_PLANES: Record<string, PlaneType> = { mono: 'eindecker', bi: 'camel', tri: 'dr1' };
const PLANE_IDS = ['eindecker', 'camel', 'dr1', 'albatros', 'p40'];
let stored = localStorage.getItem('bluemax-plane') ?? 'camel';
stored = LEGACY_PLANES[stored] ?? stored;
let selectedPlane: PlaneType = PLANE_IDS.includes(stored) ? (stored as PlaneType) : 'camel';

const planeCards = Array.from(document.querySelectorAll<HTMLElement>('.plane-card'));
function refreshPlaneCards(): void {
  for (const card of planeCards) {
    card.classList.toggle('selected', card.dataset.plane === selectedPlane);
  }
}
for (const card of planeCards) {
  card.addEventListener('click', () => {
    selectedPlane = card.dataset.plane as PlaneType;
    localStorage.setItem('bluemax-plane', selectedPlane);
    refreshPlaneCards();
    game.choosePlane(selectedPlane); // live preview behind the menu
  });
}
refreshPlaneCards();
game.choosePlane(selectedPlane);

function startGame(): void {
  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  game.start(selectedPlane);
}

game.onGameOver = (reason, score) => {
  $('overReason').textContent = reason;
  $('finalScore').textContent = String(score);
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
