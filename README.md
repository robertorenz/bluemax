# Blue Max

A modernized homage to **Blue Max** (Synapse Software, 1983) — the classic isometric
WWI biplane shooter. Built with **Phaser 3 + TypeScript + Vite**, with all graphics
generated procedurally at runtime (zero external assets).

**▶ Play it now: [robertorenz.github.io/bluemax](https://robertorenz.github.io/bluemax/)**

## Gameplay

Fly your biplane over diagonally scrolling farmland. Bomb buildings and AA guns,
dogfight enemy planes at matching altitude, and manage your fuel — make a **low pass
over a runway** to refuel before the tank runs dry.

| Control | Action |
|---------|--------|
| ← → | Steer left / right |
| ↑ ↓ | Climb / dive (altitude) |
| SPACE | Machine guns |
| B | Drop bomb |

**Mechanics carried over from the original:**

- **Altitude matters** — your shadow shows your height; guns only hit enemies near
  your altitude, and bombs dropped from low altitude land more accurately.
- **Fuel management** — fuel drains constantly; running dry forces you into a descent.
- **Ground contact** — touching the ground away from a runway is a crash.

## Scoring

| Target | Points |
|--------|--------|
| Enemy plane | 100 |
| AA gun | 75 |
| Building | 50 |

## Development

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # type-check + production build to dist/
```

## Deployment

Pushes to `master` auto-deploy to GitHub Pages via the workflow in
`.github/workflows/deploy.yml` (build → upload `dist/` → deploy).

## Stack

- [Phaser 3](https://phaser.io/) — game framework (scenes, tilesprites, particles)
- [TypeScript](https://www.typescriptlang.org/) — strict mode
- [Vite](https://vitejs.dev/) — dev server + bundler
