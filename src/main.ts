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
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && game.state !== 'playing') startGame();
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
