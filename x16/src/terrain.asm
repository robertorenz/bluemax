; ---------------------------------------------------------------------------
; terrain.asm -- the diagonally scrolling landscape.
;
; The camera walks north-east forever: camX counts up, camY counts down, both
; by the same number of pixels, so the ground streams away to the lower left
; and the aeroplane appears to fly up and to the right -- the Blue Max look.
;
; Both counters are 16-bit and allowed to wrap: 65536 is a whole number of
; 1024-pixel map widths, so the wrap is invisible.
;
; The 64x64 map covers world tiles [wx0, wx0+63] x [wy0, wy0+63] while only
; 21x16 of them are on screen, so there is always 40+ tiles of slack. When
; wx0/wy0 move by one, exactly one map line changes meaning and is refilled --
; 64 entries, once every 16 pixels of travel.
;
; Every terrain entry uses palette bank 0 with no flip, so map byte 1 is always
; zero. It is written once at startup and never touched again, which lets the
; per-line refills use VERA's stride-128 auto-increment.
; ---------------------------------------------------------------------------

MAP_W       = 64
MAP_ROWBYTES = MAP_W * 2

; ---------------------------------------------------------------------------
; terrain_init -- zero byte 1 of every entry, then fill the whole map.
; ---------------------------------------------------------------------------
terrain_init:
        VERA_SETADDR (VRAM_MAP + 1), 2  ; step 2: hit byte 1 of each entry
        ldx #16                         ; 16 * 256 = 4096 entries
@z1:    ldy #0
@z0:    stz VERA_DATA0
        dey
        bne @z0
        dex
        bne @z1

        ; Fill all 64 columns using the normal per-column routine.
        lda wx0
        sta tcol_wx
        lda wx0+1
        sta tcol_wx+1
        lda wx0
        and #63
        sta tcol
        ldx #64
@col:   phx
        jsr fill_col
        plx
        inc tcol
        lda tcol
        and #63
        sta tcol
        inc tcol_wx
        bne :+
        inc tcol_wx+1
:       dex
        bne @col
        rts

; ---------------------------------------------------------------------------
; terrain_scroll -- advance the camera by `spd` pixels and refill any map line
; whose world coordinate just changed. Must run before the scroll registers
; are pushed, because the new top row is immediately visible.
; ---------------------------------------------------------------------------
terrain_scroll:
        ; camX += spd
        lda camX
        clc
        adc spd
        sta camX
        bcc :+
        inc camX+1
:
        ; camY -= spd
        lda camY
        sec
        sbc spd
        sta camY
        bcs :+
        dec camY+1
:
        ; --- did the leftmost world column change? ----------------------
        lda camX+1
        lsr                             ; wx = camX >> 4
        lda camX
        ror
        lsr
        lsr
        lsr
        sta tmpa
        lda camX+1
        lsr
        lsr
        lsr
        lsr
        sta tmpa+1
        lda tmpa
        cmp wx0
        bne @newcol
        lda tmpa+1
        cmp wx0+1
        beq @checkrow
@newcol:
        ; The map line that just fell off the left now has to hold the world
        ; column 64 ahead of the new left edge.
        lda wx0
        and #63
        sta tcol
        lda tmpa
        sta wx0
        lda tmpa+1
        sta wx0+1
        lda wx0
        clc
        adc #63
        sta tcol_wx
        lda wx0+1
        adc #0
        sta tcol_wx+1
        jsr fill_col

@checkrow:
        lda camY+1
        lsr
        lda camY
        ror
        lsr
        lsr
        lsr
        sta tmpa
        lda camY+1
        lsr
        lsr
        lsr
        lsr
        sta tmpa+1
        lda tmpa
        cmp wy0
        bne @newrow
        lda tmpa+1
        cmp wy0+1
        beq @done
@newrow:
        ; wy0 stepped down; the new top row is needed right now.
        lda tmpa
        sta wy0
        sta trow_wy
        lda tmpa+1
        sta wy0+1
        sta trow_wy+1
        lda wy0
        and #63
        sta trow
        jsr fill_row
@done:  rts

; ---------------------------------------------------------------------------
; fill_col -- 64 entries down map column `tcol`, world X = tcol_wx,
;             world Y running from wy0 upward.
; ---------------------------------------------------------------------------
fill_col:
        lda tcol_wx
        sta twx
        lda tcol_wx+1
        sta twx+1
        lda wy0
        sta twy
        lda wy0+1
        sta twy+1

        ; VRAM address = VRAM_MAP + (wy0 & 63) * 128 + tcol * 2, stride 128
        lda wy0
        and #63
        sta tmpa
        stz tmpa+1
        asl tmpa                        ; *128 via two shifts into the high byte
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        lda tcol
        asl
        clc
        adc tmpa
        sta VERA_ADDRx_L
        lda tmpa+1
        adc #0
        sta VERA_ADDRx_M
        lda #(8 << 4) | (^VRAM_MAP)     ; increment 128
        sta VERA_ADDRx_H

        ldx #64
        lda wy0
        and #63
        sta mrow                        ; current map row, for wrap detection
@lp:    phx
        jsr tile_at                     ; note: clobbers tmpa/tmpb
        plx
        sta VERA_DATA0
        ; advance world Y
        inc twy
        bne :+
        inc twy+1
:       ; advance map row, wrapping back to the top of the column
        inc mrow
        lda mrow
        cmp #64
        bne :+
        stz mrow
        lda tcol
        asl
        sta VERA_ADDRx_L
        stz VERA_ADDRx_M
        lda #(8 << 4) | (^VRAM_MAP)
        sta VERA_ADDRx_H
:       dex
        bne @lp
        rts

; ---------------------------------------------------------------------------
; fill_row -- 64 entries across map row `trow`, world Y = trow_wy,
;             world X running from wx0 rightward.
; ---------------------------------------------------------------------------
fill_row:
        lda trow_wy
        sta twy
        lda trow_wy+1
        sta twy+1
        lda wx0
        sta twx
        lda wx0+1
        sta twx+1

        ; VRAM address = VRAM_MAP + trow * 128 + (wx0 & 63) * 2, stride 2
        lda trow
        stz tmpa+1
        sta tmpa
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        lda wx0
        and #63
        asl
        clc
        adc tmpa
        sta VERA_ADDRx_L
        lda tmpa+1
        adc #0
        sta VERA_ADDRx_M
        lda #(2 << 4) | (^VRAM_MAP)     ; increment 2
        sta VERA_ADDRx_H

        ldx #64
        lda wx0
        and #63
        sta mrow
@lp:    phx
        jsr tile_at                     ; note: clobbers tmpa/tmpb
        plx
        sta VERA_DATA0
        inc twx
        bne :+
        inc twx+1
:       inc mrow
        lda mrow
        cmp #64
        bne :+
        stz mrow
        lda trow
        stz tmpa+1
        sta tmpa
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        asl tmpa
        rol tmpa+1
        lda tmpa
        sta VERA_ADDRx_L
        lda tmpa+1
        sta VERA_ADDRx_M
        lda #(2 << 4) | (^VRAM_MAP)
        sta VERA_ADDRx_H
:       dex
        bne @lp
        rts

; ---------------------------------------------------------------------------
; tile_at -- world tile (twx, twy) -> tile index in .A
;
; Features are placed with two derived coordinates:
;   S = twx - twy   runs along the flight axis, so a band of constant S
;                   crosses the player's path (rivers, roads)
;   D = twx + twy   runs across it, so a band of constant D lies parallel to
;                   the flight path (runways you can line up on)
; ---------------------------------------------------------------------------
tile_at:
        lda twx
        sec
        sbc twy
        sta tS
        lda twx+1
        sbc twy+1
        sta tS+1

        lda twx
        clc
        adc twy
        sta tD
        lda twx+1
        adc twy+1
        sta tD+1

        ; --- runways ------------------------------------------------------
        ; Flying north-east keeps camX+camY constant, so D only changes when
        ; the player steers -- about 16 tiles end to end. The lateral period
        ; has to stay inside that or a runway could never be reached. Sorties
        ; are paced by the S window instead: a band of strips every 512 tiles.
        lda tD
        and #15
        cmp #3                          ; 3 tiles wide
        bcs @norun
        lda tS+1
        and #1                          ; S & 511 < 96
        bne @norun
        lda tS
        cmp #96
        bcs @norun
        lda tS
        and #3
        bne :+
        lda #T_RUNWAYS
        rts
:       lda #T_RUNWAY
        rts
@norun:

        ; --- river: 2 wide, period 128, meandering along its length -------
        lda tD+1                        ; hash key = D >> 5
        asl
        asl
        asl
        sta tmpa
        lda tD
        lsr
        lsr
        lsr
        lsr
        lsr
        ora tmpa
        sta tmpa
        stz tmpb
        jsr thash
        lsr                             ; 0..7 of meander
        lsr
        lsr
        lsr
        lsr
        clc
        adc tS
        and #127
        cmp #2
        bcs @noriv
        lda #T_RIVER
        rts
@noriv:

        ; --- road: 1 wide, period 64, its own meander ---------------------
        lda tD+1
        asl
        asl
        asl
        sta tmpa
        lda tD
        lsr
        lsr
        lsr
        lsr
        lsr
        ora tmpa
        sta tmpa
        lda #77
        sta tmpb
        jsr thash
        lsr
        lsr
        lsr
        lsr
        lsr
        clc
        adc tS
        and #63
        cmp #2                          ; two diagonals wide: one only touches
        bcs @noroad                     ; at the corners and reads as dashes
        lda #T_ROAD
        rts
@noroad:

        ; --- woodland in 8x8-tile blocks ----------------------------------
        lda twx+1
        asl
        asl
        asl
        asl
        asl
        sta tmpa
        lda twx
        lsr
        lsr
        lsr
        ora tmpa
        sta tmpa
        lda twy+1
        asl
        asl
        asl
        asl
        asl
        sta tmpb
        lda twy
        lsr
        lsr
        lsr
        ora tmpb
        sta tmpb
        jsr thash
        cmp #46
        bcs @nowood
        lda #T_WOODS
        rts
@nowood:

        ; --- field patchwork in 4x4-tile blocks ---------------------------
        lda twx+1
        asl
        asl
        asl
        asl
        asl
        asl
        sta tmpa
        lda twx
        lsr
        lsr
        ora tmpa
        sta tmpa
        lda twy+1
        asl
        asl
        asl
        asl
        asl
        asl
        sta tmpb
        lda twy
        lsr
        lsr
        ora tmpb
        sta tmpb
        jsr thash
        and #15
        tax
        lda fieldtab,x
        rts

fieldtab:
        .byte T_GRASS1, T_GRASS2, T_FIELD1, T_FIELD2
        .byte T_FIELD3, T_CROP1,  T_CROP2,  T_PLOW1
        .byte T_PLOW2,  T_GRASS1, T_FIELD2, T_STEPPE
        .byte T_HEDGEN, T_HEDGEW, T_GRASS2, T_FIELD1

; ---------------------------------------------------------------------------
; thash -- permutation hash of (tmpa, tmpb) -> .A
; ---------------------------------------------------------------------------
thash:
        ldx tmpb
        lda permtab,x
        clc
        adc tmpa
        tax
        lda permtab,x
        rts

; ---------------------------------------------------------------------------
; terrain_push -- hand the camera to the scroll registers.
; ---------------------------------------------------------------------------
terrain_push:
        lda camX
        sta VERA_L0_HSCROLL_L
        lda camX+1
        and #$03                        ; map is 1024px wide
        sta VERA_L0_HSCROLL_H
        lda camY
        sta VERA_L0_VSCROLL_L
        lda camY+1
        and #$03
        sta VERA_L0_VSCROLL_H
        rts

; ---------------------------------------------------------------------------
; on_runway -- is the player's ground position over a runway strip?
; Returns carry set when it is.
;
; The player sits at a fixed spot on screen, so the world tile under it is
; simply the camera plus that offset.
; ---------------------------------------------------------------------------
on_runway:
        lda camX
        clc
        adc ply_x
        sta tmpa
        lda camX+1
        adc ply_x+1
        sta tmpa+1
        lsr tmpa+1                      ; >> 4 to tiles
        ror tmpa
        lsr tmpa+1
        ror tmpa
        lsr tmpa+1
        ror tmpa
        lsr tmpa+1
        ror tmpa
        lda tmpa
        sta twx
        lda tmpa+1
        sta twx+1

        lda camY
        clc
        adc #PLY_Y
        sta tmpa
        lda camY+1
        adc #0
        sta tmpa+1
        lsr tmpa+1
        ror tmpa
        lsr tmpa+1
        ror tmpa
        lsr tmpa+1
        ror tmpa
        lsr tmpa+1
        ror tmpa
        lda tmpa
        sta twy
        lda tmpa+1
        sta twy+1

        jsr tile_at
        cmp #T_RUNWAY
        beq @yes
        cmp #T_RUNWAYS
        beq @yes
        clc
        rts
@yes:   sec
        rts
