#!/bin/sh
# Headless screenshot: build, run in x16emu for a few seconds, and pull one
# frame out of the recorded GIF as a PNG. Used to check rendering without
# sitting in front of the emulator.
#
#   tools/shot.sh build/shot.png [frame] [extra cl65 flags...]
#   tools/shot.sh build/play.png 400 --asm-define AUTOSTART --asm-define DEMO
set -e

CC65="${CC65_HOME:-/c/ai/tools/cc65}"
EMU="${X16_HOME:-/c/ai/tools/x16emu}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

OUT="${1:-build/shot.png}"; shift 2>/dev/null || true
FRAME="${1:-300}"; shift 2>/dev/null || true

cd "$ROOT"
mkdir -p build
node tools/gfx.cjs >/dev/null

"$CC65/bin/cl65.exe" -t cx16 -C "$CC65/cfg/cx16-asm.cfg" -u __EXEHDR__ \
    -I src --bin-include-dir src "$@" -o BLUEMAX.PRG src/bluemax.asm

rm -f build/run.gif
SECS=$(( FRAME / 60 + 6 ))
timeout -k 2 "$SECS" "$EMU/x16emu.exe" -rom "$EMU/rom.bin" \
    -prg "$ROOT/BLUEMAX.PRG" -run -sound none -gif build/run.gif -scale 1 \
    >/dev/null 2>&1 || true

ffmpeg -v error -y -i build/run.gif -vf "select=eq(n\,$FRAME)" -vframes 1 "$OUT"
echo "wrote $OUT (frame $FRAME)"
