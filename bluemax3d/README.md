# Blue Max 3D — Commander X16

**Status: work in progress.** The renderer is done and working; the game logic
layered on top still has bugs. See *Known issues* below.

A third take on Blue Max, aiming at the look of the
[Three.js version](../README.md) rather than the isometric
[x16 port](../x16/README.md): sky and horizon up top, the ground falling away in
perspective, and the aeroplane seen from behind with its shadow tracking
underneath.

## The perspective is real, not painted

VERA has no Mode 7. But its display registers can be rewritten mid-frame, so the
screen is split into raster bands and each one gets its own `L0_VSCROLL`:

```
    VSCROLL(y) = camv + PC/(y - HORIZON + DMIN) - y
```

Each screen row therefore samples the tilemap at a different depth, which
squashes the ground toward the horizon. Above the horizon layer 0 is switched
off entirely, so the sky is just palette entry 0 — rewritten per band through
VERA's *second* data port (DATA1) to paint a gradient without ever disturbing
the main loop's DATA0 transfers.

**Horizontal scale is deliberately left alone.** `DC_HSCALE` can be varied per
band too, and it does give true convergence — but the display composer scales
the sprite renderer as well, so an aeroplane spanning several bands shears into
a parallelogram. This was measured, not assumed:

| | |
|---|---|
| per-band HSCALE + a 64×64 sprite | sprite shears badly |
| constant HSCALE, per-band VSCROLL | sprite stays square |

Vertical-only costs horizontal convergence (a runway keeps its width all the way
to the horizon) but keeps every sprite intact and has unlimited depth range.
Runways are drawn narrow to make the compromise less obvious.

Depth for entities comes from the same curve, via a 256-entry reciprocal table:

```
    zrel = v - camv                 depth ahead of the camera
    row  = rowtab[zrel >> 2]        screen row
    x    = u - camu + 160
```

Objects past `FAR_ROW` swap to half-size art so they shrink with distance.

## Known issues

- The player's aeroplane sprite renders only partially in some frames; the
  shadow beside it is always correct, so this is not the image data or the
  palette. Under investigation.
- Ground targets spawn and project but are not reliably visible.
- Landing on a runway is implemented but untested.
- `PERSP`/`DMIN` in `tools/bands.cjs` still need tuning: perspective naturally
  crowds distant objects into a few rows near the horizon, which is correct but
  leaves a short window in which targets are actually attackable.

## Controls

Same as the isometric port: arrows fly, **Z** guns, **X** bombs, **Enter**
starts. A SNES pad on port 1 works too.

## Building

```powershell
node tools/gfx.cjs      # art
node tools/bands.cjs    # raster band + projection tables
cl65 -t cx16 -C cx16-asm.cfg -u __EXEHDR__ -I src --bin-include-dir src \
     -o BLUEMAX3D.PRG src/bluemax3d.asm
```

`tools/shot.sh <out.png> <frame> [flags]` builds, runs the emulator headless and
extracts a frame, so rendering can be checked without sitting in front of it.
`--asm-define AUTOSTART` skips the title screen; `--asm-define DEMO` synthesises
stick input.

## Layout

```
src/bluemax3d.asm  entry point, state machine, variables
src/raster.asm     the perspective engine: sky gradient + per-band VSCROLL
src/terrain.asm    top-down scrolling tilemap the raster engine looks along
src/world.asm      targets, enemies, ordnance, and the depth projection
src/player.asm     the aeroplane
src/video.asm      VERA bring-up      src/sprite.asm  attribute shadow buffer
src/hud.asm        text overlay       src/sound.asm   PSG driver
tools/gfx.cjs      draws every tile and sprite
tools/bands.cjs    generates the raster band and projection tables
```
