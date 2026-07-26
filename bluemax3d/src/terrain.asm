; ---------------------------------------------------------------------------
; terrain.asm -- the ground the raster engine looks along.
;
; Unlike the isometric build this map is plain top-down: camv counts forward
; (into the screen) and camu sideways. The perspective all happens in
; raster.asm, so here the map is just a scrolling texture.
;
; The visible depth window is 17..933 world pixels, i.e. 58 of the map's 64
; tile rows -- only six rows of slack, but enough: the row that falls out
; behind the camera is exactly the one needed 64 rows ahead.
; ---------------------------------------------------------------------------

MAP_ROWBYTES = 128                      ; 64 tiles * 2 bytes

terrain_init:
        ; byte 1 of every entry is always zero (palette bank 0, no flip)
        VERA_SETADDR (VRAM_MAP + 1), 2
        ldx #16
@z1:    ldy #0
@z0:    stz VERA_DATA0
        dey
        bne @z0
        dex
        bne @z1

        ; generate all 64 rows
        lda camv+1
        lsr
        lda camv
        ror
        lsr
        lsr
        lsr
        sta trow_wv
        lda camv+1
        lsr
        lsr
        lsr
        lsr
        sta trow_wv+1
        lda trow_wv
        and #63
        sta trow
        ldx #64
@row:   phx
        jsr fill_row
        plx
        inc trow
        lda trow
        and #63
        sta trow
        inc trow_wv
        bne :+
        inc trow_wv+1
:       dex
        bne @row
        rts

; ---------------------------------------------------------------------------
; terrain_step -- advance the camera and refill any row/column that changed
; meaning. Called once per frame before the scroll registers are pushed.
; ---------------------------------------------------------------------------
terrain_step:
        ; --- forward ------------------------------------------------------
        lda camv
        clc
        adc spd
        sta camv
        bcc :+
        inc camv+1
:       lda camv+1                      ; tile = camv >> 4
        lsr
        lda camv
        ror
        lsr
        lsr
        lsr
        sta tmpa
        lda camv+1
        lsr
        lsr
        lsr
        lsr
        sta tmpa+1
        lda tmpa
        cmp wv0
        bne @newrow
        lda tmpa+1
        cmp wv0+1
        beq @lateral
@newrow:
        ; the row just behind us becomes the row 64 ahead
        lda wv0
        and #63
        sta trow
        lda tmpa
        sta wv0
        lda tmpa+1
        sta wv0+1
        lda wv0
        clc
        adc #63
        sta trow_wv
        lda wv0+1
        adc #0
        sta trow_wv+1
        jsr fill_row

@lateral:
        lda camu+1
        lsr
        lda camu
        ror
        lsr
        lsr
        lsr
        sta tmpa
        lda camu+1
        lsr
        lsr
        lsr
        lsr
        sta tmpa+1
        lda tmpa
        cmp wu0
        bne @newcol
        lda tmpa+1
        cmp wu0+1
        beq @done
@newcol:
        ; steering can go either way, so refill both edge columns
        lda tmpa
        sta wu0
        lda tmpa+1
        sta wu0+1
        lda wu0
        sec
        sbc #1
        sta tcol_wu
        lda wu0+1
        sbc #0
        sta tcol_wu+1
        lda tcol_wu
        and #63
        sta tcol
        jsr fill_col
        lda wu0
        clc
        adc #21
        sta tcol_wu
        lda wu0+1
        adc #0
        sta tcol_wu+1
        lda tcol_wu
        and #63
        sta tcol
        jsr fill_col
@done:  rts

; ---------------------------------------------------------------------------
; terrain_push -- lateral scroll only; the raster handler owns VSCROLL.
; ---------------------------------------------------------------------------
terrain_push:
        lda camu
        sta VERA_L0_HSCROLL_L
        lda camu+1
        and #$03
        sta VERA_L0_HSCROLL_H
        rts

; ---------------------------------------------------------------------------
; fill_row -- 64 entries across map row `trow`, world V = trow_wv
; ---------------------------------------------------------------------------
fill_row:
        lda trow_wv
        sta twv
        lda trow_wv+1
        sta twv+1
        lda wu0
        sta twu
        lda wu0+1
        sta twu+1

        lda wu0
        and #63
        jsr row_addr

        ldx #64
        lda wu0
        and #63
        sta mrow
@lp:    phx
        jsr tile_at                     ; clobbers tmpa/tmpb
        plx
        sta VERA_DATA0
        inc twu
        bne @nc
        inc twu+1
@nc:    inc mrow
        lda mrow
        cmp #64
        bne @tail
        stz mrow                        ; wrapped: rearm at column 0
        phx
        lda #0
        jsr row_addr
        plx
@tail:  dex
        bne @lp
        rts

; row_addr -- arm VERA at map row `trow`, column .A, stride 2
row_addr:
        pha
        lda trow
        stz tmpa+1
        sta tmpa
        ldx #7
:       asl tmpa
        rol tmpa+1
        dex
        bne :-
        pla
        asl
        clc
        adc tmpa
        sta VERA_ADDRx_L
        lda tmpa+1
        adc #0
        sta VERA_ADDRx_M
        lda #(2 << 4) | (^VRAM_MAP)
        sta VERA_ADDRx_H
        rts

; ---------------------------------------------------------------------------
; fill_col -- 64 entries down map column `tcol`, world U = tcol_wu
; ---------------------------------------------------------------------------
fill_col:
        lda tcol_wu
        sta twu
        lda tcol_wu+1
        sta twu+1
        lda wv0
        sta twv
        lda wv0+1
        sta twv+1

        lda wv0
        and #63
        jsr col_addr

        ldx #64
        lda wv0
        and #63
        sta mrow
@lp:    phx
        jsr tile_at
        plx
        sta VERA_DATA0
        inc twv
        bne @nc
        inc twv+1
@nc:    inc mrow
        lda mrow
        cmp #64
        bne @tail
        stz mrow                        ; wrapped: rearm at row 0
        phx
        lda #0
        jsr col_addr
        plx
@tail:  dex
        bne @lp
        rts

; col_addr -- arm VERA at map column `tcol`, row .A, stride 128
col_addr:
        stz tmpa+1
        sta tmpa
        ldx #7
:       asl tmpa
        rol tmpa+1
        dex
        bne :-
        lda tcol
        asl
        clc
        adc tmpa
        sta VERA_ADDRx_L
        lda tmpa+1
        adc #0
        sta VERA_ADDRx_M
        lda #(8 << 4) | (^VRAM_MAP)     ; stride 128 = one map row
        sta VERA_ADDRx_H
        rts

; ---------------------------------------------------------------------------
; tile_at -- world tile (twu, twv) -> tile index in .A
;
; Runways run along V so you can fly down them; rivers and roads run along U so
; you cross them.
; ---------------------------------------------------------------------------
tile_at:
        ; --- runway: 3 tiles wide, in long stretches ----------------------
        lda twu
        and #63
        cmp #2                          ; narrow: with no horizontal
        bcs @norun                      ; convergence, a wide strip reads as a wall
        lda twv+1
        and #3                          ; V & 1023 < 160
        bne @norun
        lda twv
        cmp #160
        bcs @norun
        lda twv
        and #3
        bne :+
        lda #T_RUNWAYS
        rts
:       lda #T_RUNWAY
        rts
@norun:
        ; --- river crossing our path --------------------------------------
        lda twu+1                       ; meander keyed on U
        asl
        asl
        asl
        sta tmpa
        lda twu
        lsr
        lsr
        lsr
        lsr
        lsr
        ora tmpa
        sta tmpa
        stz tmpb
        jsr thash
        lsr
        lsr
        lsr
        lsr
        lsr
        clc
        adc twv
        and #127
        cmp #2
        bcs @noriv
        lda #T_RIVER
        rts
@noriv:
        ; --- road crossing --------------------------------------------------
        lda twu+1
        asl
        asl
        asl
        sta tmpa
        lda twu
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
        adc twv
        and #63
        cmp #2
        bcs @noroad
        lda #T_ROAD
        rts
@noroad:
        ; --- woodland in 8x8 blocks -----------------------------------------
        lda twu+1
        asl
        asl
        asl
        asl
        asl
        sta tmpa
        lda twu
        lsr
        lsr
        lsr
        ora tmpa
        sta tmpa
        lda twv+1
        asl
        asl
        asl
        asl
        asl
        sta tmpb
        lda twv
        lsr
        lsr
        lsr
        ora tmpb
        sta tmpb
        jsr thash
        cmp #38
        bcs @nowood
        lda #T_WOODS
        rts
@nowood:
        ; --- field patchwork in 4x4 blocks ----------------------------------
        lda twu+1
        asl
        asl
        asl
        asl
        asl
        asl
        sta tmpa
        lda twu
        lsr
        lsr
        ora tmpa
        sta tmpa
        lda twv+1
        asl
        asl
        asl
        asl
        asl
        asl
        sta tmpb
        lda twv
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
        .byte T_FIELD3, T_FIELD4, T_CROP1,  T_PLOW1
        .byte T_PLOW2,  T_GRASS1, T_CROP2,  T_STEPPE
        .byte T_HEDGE,  T_PLOW1,  T_GRASS2, T_FIELD1

thash:
        ldx tmpb
        lda permtab,x
        clc
        adc tmpa
        tax
        lda permtab,x
        rts
