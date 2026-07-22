# Blue Max

A modernized 2.5D homage to **Blue Max** (Synapse Software, 1983) — the classic
isometric WWI biplane shooter. Built with **Three.js + TypeScript + Vite**: a real-time
low-poly 3D world with a tilted chase camera, dynamic shadows, and distance fog. All
models are built procedurally from primitives (zero external assets).

**▶ Play it now: [robertorenz.github.io/bluemax](https://robertorenz.github.io/bluemax/)**

## Gameplay

**Career progression:** every point you score adds to your career XP, which
unlocks new aircraft. The hangar holds 15 classics spanning 1915–1944 — you start
with the Fokker Eindecker, Sopwith Camel, and Fokker Dr.I, and work up through the
Albatros D.III, SPAD S.XIII, Sopwith Triplane, Bristol F.2, Fokker D.VII,
P-26 Peashooter, Gloster Gladiator, Polikarpov I-16, Spitfire Mk I, Bf 109 E,
P-40 Flying Tiger, P-38 Lightning (twin booms, 40 bombs), P-51 Mustang, the
TBF Avenger (46-bomb Navy torpedo bomber), the Me 262 Schwalbe (the first jet),
and finally the Horten Ho 229 flying wing at 70,000 XP. Later aircraft generally
steer faster, dive harder, and shoot quicker.

**High scores:** arcade-style 3-letter initials feed a **shared global leaderboard**
(Supabase, read/insert-only via row-level security), with a local top-10 fallback
when offline. The HUD shows your all-time personal best.

Enemy air traffic is mixed too: biplanes (100 pts), fast monoplanes (120 pts),
tough triplanes (150 pts), and huge slow **zeppelins** (300 pts, 7 hits) that lob
flak from their gondolas and go up in a chain of fireballs.

Fly your biplane over scrolling low-poly farmland. Bomb buildings and AA guns,
dogfight enemy planes at matching altitude, and manage your fuel — line up with a
runway and **dive to touch down**: the plane rolls out, refuels, and takes off again
automatically. Touch down early on the runway for a longer rollout and a fuller tank.

| Control | Action |
|---------|--------|
| ← → | Steer left / right |
| ↑ ↓ | Climb / dive (altitude) |
| SPACE | Machine guns |
| B | Drop bombs (hold to walk a stick of bombs across a target) |
| M | Mute sound |
| F | Fullscreen |

On phones and tablets a **virtual joystick** (left) and fire/bomb buttons (right)
appear automatically — drag the stick to steer and climb/dive.

**Mechanics carried over from the original:**

- **Altitude matters** — your real cast shadow shows your height; you can only hit
  enemies near your altitude, and bombs dropped from low altitude land more accurately.
- **Fuel management** — fuel drains constantly; running dry forces you into a descent
  (a runway underneath can still save you).
- **Landing** — a real touchdown-rollout-takeoff sequence on runways; the world slows
  while you're on the ground and the camera banks with your turns in flight.
- **Damage states** — a direct bomb hit flattens a target; a near miss leaves it
  charred, smoking, and out of action. Wreckage stays on the map instead of vanishing.
- **Living landscape** — the world drifts between biome regions as you fly:
  organic-patchwork farmland (with strip-farmed bands and plowed brown furrows),
  dense forest country, flower-speckled meadows, dry steppe, and snowy alpine.
  Rolling hills, steep peaks, canyons, ponds, villages, windmills, and castles
  punctuate the terrain.
- **Rivers & roads** — long meandering rivers and country roads arrive from the
  distance, wander across the corridor and off to the sides (and back). Rivers
  carry bombable bridges and barges; roads carry truck convoys driving both
  directions, keeping to their side of the road.
- **Limited ordnance** — you carry 30 bombs; the ground crew rearms you during a
  landing rollout alongside refueling.
- **Solid structures** — flying into a building, factory, tank, depot, or ship is
  an instant crash. Bridge decks are solid too, but you can fly *under* them.
- **Overtakers** — a minute into the sortie, some enemy planes come from *behind*,
  blow past you, then swing around and attack head-on.
- **Ground contact** — touching the ground away from a runway is a crash.

**More to fight:** trains on winding railways (kill the locomotive to stop the
whole train), tethered observation balloons, named enemy aces with kill
announcements, bomber formations with fighter escorts, enemy airfields (hangars,
control tower, parked planes, a searchlit guard gun), and — on the coast —
warships and lighthouses.

**Sortie objectives & achievements:** every flight gets a target ("destroy 3
tanks") worth bonus points, with a fresh one after each completion. One-time
achievements (fly under a bridge, run the canyon low, dead-stick landing, down
an ace...) award career XP.

**Day & night:** a five-minute cycle from bright day through orange dusk into
night — when AA searchlights sweep the sky, lock onto you, and shoot faster.

**Photo mode:** press P in flight to freeze the world and orbit the camera
(arrows orbit, W/S zoom).

## Scoring

| Target | Points |
|--------|--------|
| Castle | 400 |
| Zeppelin | 300 |
| Enemy triplane | 150 |
| Bridge | 150 |
| Factory | 125 |
| Enemy monoplane | 120 |
| Enemy biplane | 100 |
| Tank (mobile, fires back) | 100 |
| Ship (river barge) | 100 |
| Fuel depot | 100 |
| AA gun | 75 |
| Truck | 60 |
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
- WebAudio — fully procedural sound (engine drone, guns, bomb whistle, explosions);
  no audio files
- [TypeScript](https://www.typescriptlang.org/) — strict mode
- [Vite](https://vitejs.dev/) — dev server + bundler
- DOM/CSS HUD and modal overlays (no in-canvas UI); fills the browser window and
  supports fullscreen (F key or the ⛶ button)
