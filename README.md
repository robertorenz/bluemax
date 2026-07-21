# Blue Max

A modernized 2.5D homage to **Blue Max** (Synapse Software, 1983) — the classic
isometric WWI biplane shooter. Built with **Three.js + TypeScript + Vite**: a real-time
low-poly 3D world with a tilted chase camera, dynamic shadows, and distance fog. All
models are built procedurally from primitives (zero external assets).

**▶ Play it now: [robertorenz.github.io/bluemax](https://robertorenz.github.io/bluemax/)**

## Gameplay

Fly your biplane over scrolling low-poly farmland. Bomb buildings and AA guns,
dogfight enemy planes at matching altitude, and manage your fuel — make a **low pass
over a runway** to refuel before the tank runs dry.

| Control | Action |
|---------|--------|
| ← → | Steer left / right |
| ↑ ↓ | Climb / dive (altitude) |
| SPACE | Machine guns |
| B | Drop bomb |

**Mechanics carried over from the original:**

- **Altitude matters** — your real cast shadow shows your height; you can only hit
  enemies near your altitude, and bombs dropped from low altitude land more accurately.
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

- [Three.js](https://threejs.org/) — WebGL renderer (low-poly meshes, directional
  shadows, fog, vertex-colored terrain chunks)
- [TypeScript](https://www.typescriptlang.org/) — strict mode
- [Vite](https://vitejs.dev/) — dev server + bundler
- DOM/CSS HUD and modal overlays (no in-canvas UI)
