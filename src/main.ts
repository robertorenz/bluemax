import { Game, type Hud } from './game';

const $ = (id: string) => document.getElementById(id)!;

const hud: Hud = {
  score: $('score'),
  lives: $('lives'),
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

function startGame(): void {
  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  game.start();
}

game.onGameOver = (reason, score) => {
  $('overReason').textContent = reason;
  $('finalScore').textContent = String(score);
  overEl.classList.remove('hidden');
};

$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);

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
