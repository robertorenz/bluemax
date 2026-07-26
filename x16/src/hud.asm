; ---------------------------------------------------------------------------
; hud.asm -- text overlay on layer 1.
;
; The KERNAL's own text layer is reused as-is, so the system charset comes for
; free. Every cell is written with a background colour of 0, which VERA treats
; as transparent, so the HUD floats over the landscape.
;
; The map is 128 columns of 2 bytes = exactly 256 bytes per row, which makes
; the address arithmetic a single byte add.
; ---------------------------------------------------------------------------

HUD_COLS = 40
HUD_ROWS = 30
C_WHITE  = 12
C_AMBER  = 13
C_RED    = 14
C_GREEN  = 2

; ---------------------------------------------------------------------------
; hud_at -- arm VERA at text cell (.A = row, .X = column)
; ---------------------------------------------------------------------------
; The map is 128 columns wide, so a row is exactly 256 bytes and the address
; falls out as (low = col*2, mid = row) above VRAM_HUDMAP.
hud_at:
        clc
        adc #>VRAM_HUDMAP
        sta tmpa
        txa
        asl
        sta VERA_ADDRx_L
        lda tmpa
        sta VERA_ADDRx_M
        lda #(1 << 4) | (^VRAM_HUDMAP)
        sta VERA_ADDRx_H
        rts

; ---------------------------------------------------------------------------
; hud_init -- blank the entire map once, so nothing the KERNAL or a previous
; program left behind can show through.
; ---------------------------------------------------------------------------
hud_init:
        VERA_SETADDR VRAM_HUDMAP, 1
        ldx #32                         ; 32 rows of 256 bytes
@row:   ldy #128                        ; 128 cells
@col:   lda #$20
        sta VERA_DATA0
        stz VERA_DATA0
        dey
        bne @col
        dex
        bne @row
        rts

; ---------------------------------------------------------------------------
; hud_clear -- blank the visible window
; ---------------------------------------------------------------------------
hud_clear:
        lda #0
        sta tmpb
@row:   lda tmpb
        ldx #0
        jsr hud_at
        ldx #HUD_COLS
@col:   lda #$20                        ; space
        sta VERA_DATA0
        stz VERA_DATA0                  ; transparent background
        dex
        bne @col
        inc tmpb
        lda tmpb
        cmp #HUD_ROWS
        bne @row
        rts

; ---------------------------------------------------------------------------
; hud_str -- print the string at (strp) at row .A / column .X in colour `hcol`
; The string is screen codes, terminated by $FF.
; ---------------------------------------------------------------------------
hud_str:
        jsr hud_at
        ldy #0
@lp:    lda (strp),y
        cmp #$FF
        beq @done
        sta VERA_DATA0
        lda hcol
        sta VERA_DATA0
        iny
        bra @lp
@done:  rts

; ---------------------------------------------------------------------------
; hud_bcd -- print `hnum` bytes of BCD from (numsrc), most significant first
; ---------------------------------------------------------------------------
hud_bcd:
        ldy hnum
        dey
@lp:    lda (numsrc),y
        pha
        lsr
        lsr
        lsr
        lsr
        clc
        adc #$30
        sta VERA_DATA0
        lda hcol
        sta VERA_DATA0
        pla
        and #$0F
        clc
        adc #$30
        sta VERA_DATA0
        lda hcol
        sta VERA_DATA0
        dey
        bpl @lp
        rts

; ---------------------------------------------------------------------------
; hud_dec2 -- print .A (0..99) as two digits
; ---------------------------------------------------------------------------
hud_dec2:
        ldx #0
@d:     cmp #10
        bcc @done
        sbc #10
        inx
        bra @d
@done:  pha
        txa
        clc
        adc #$30
        sta VERA_DATA0
        lda hcol
        sta VERA_DATA0
        pla
        clc
        adc #$30
        sta VERA_DATA0
        lda hcol
        sta VERA_DATA0
        rts

; ---------------------------------------------------------------------------
; hud_bar -- `hnum` cells, `hval` of them lit in `hcol`, rest dim
; ---------------------------------------------------------------------------
hud_bar:
        ldy #0
@lp:    cpy hval
        bcs @empty
        lda #$A0                        ; solid block
        sta VERA_DATA0
        lda hcol
        sta VERA_DATA0
        bra @next
@empty: lda #$A0
        sta VERA_DATA0
        lda #15                         ; near-black: the unfilled part
        sta VERA_DATA0
@next:  iny
        cpy hnum
        bne @lp
        rts

; ---------------------------------------------------------------------------
; hud_draw -- the in-flight readouts
; ---------------------------------------------------------------------------
hud_draw:
        ; --- row 0: score, bombs, altitude, aircraft left -------------------
        lda #C_WHITE
        sta hcol
        lda #<s_score
        sta strp
        lda #>s_score
        sta strp+1
        lda #0
        ldx #0
        jsr hud_str

        lda #C_AMBER
        sta hcol
        lda #0
        ldx #6
        jsr hud_at
        lda #<score
        sta numsrc
        lda #>score
        sta numsrc+1
        lda #3
        sta hnum
        jsr hud_bcd

        lda #C_WHITE
        sta hcol
        lda #<s_bombs
        sta strp
        lda #>s_bombs
        sta strp+1
        lda #0
        ldx #15
        jsr hud_str
        lda #C_AMBER
        sta hcol
        lda #0
        ldx #21
        jsr hud_at
        lda bombs
        jsr hud_dec2

        lda #C_WHITE
        sta hcol
        lda #<s_alt
        sta strp
        lda #>s_alt
        sta strp+1
        lda #0
        ldx #25
        jsr hud_str
        lda #C_AMBER
        sta hcol
        lda #0
        ldx #29
        jsr hud_at
        lda ply_alt
        jsr hud_dec2

        lda #C_WHITE
        sta hcol
        lda #<s_men
        sta strp
        lda #>s_men
        sta strp+1
        lda #0
        ldx #33
        jsr hud_str
        lda #C_AMBER
        sta hcol
        lda #0
        ldx #37
        jsr hud_at
        lda lives
        jsr hud_dec2

        ; --- row 28: fuel and gun heat --------------------------------------
        lda #C_WHITE
        sta hcol
        lda #<s_fuel
        sta strp
        lda #>s_fuel
        sta strp+1
        lda #28
        ldx #0
        jsr hud_str
        lda #28
        ldx #5
        jsr hud_at
        lda fuel                        ; 0..200 -> 0..12 cells
        lsr
        lsr
        lsr
        lsr
        sta hval
        lda #12
        sta hnum
        lda fuel
        cmp #50
        bcs :+
        lda #C_RED
        bra :++
:       lda #C_GREEN
:       sta hcol
        jsr hud_bar

        lda #C_WHITE
        sta hcol
        lda #<s_guns
        sta strp
        lda #>s_guns
        sta strp+1
        lda #28
        ldx #21
        jsr hud_str
        lda #28
        ldx #26
        jsr hud_at
        lda ply_heat                    ; 0..240 -> 0..12 cells
        lsr
        lsr
        lsr
        lsr
        sta hval
        lda #12
        sta hnum
        lda ply_over
        beq :+
        lda #C_RED
        bra :++
:       lda #C_AMBER
:       sta hcol
        jsr hud_bar

        ; --- transient banner ------------------------------------------------
        lda msg_t
        beq @nomsg
        dec msg_t
        lda #C_WHITE
        sta hcol
        lda msgp
        sta strp
        lda msgp+1
        sta strp+1
        lda #14
        ldx #14
        jmp hud_str
@nomsg: lda msg_clr
        beq @done
        stz msg_clr
        lda #C_WHITE
        sta hcol
        lda #<s_blank
        sta strp
        lda #>s_blank
        sta strp+1
        lda #14
        ldx #14
        jmp hud_str
@done:  rts

; ---------------------------------------------------------------------------
; hud_msg -- show a banner for a couple of seconds. .A/.X = string pointer.
; ---------------------------------------------------------------------------
hud_msg:
        sta msgp
        stx msgp+1
        lda #110
        sta msg_t
        lda #1
        sta msg_clr
        rts

; ---------------------------------------------------------------------------
; Screen-code strings, $FF terminated.
;
; The cx16 target translates source literals to PETSCII before `.strat` sees
; them, so an upper-case letter arrives as $C1-$DA rather than $41-$5A. Screen
; codes want A-Z at $01-$1A; digits and punctuation are already correct.
; ---------------------------------------------------------------------------
        .macro SCR str
        .repeat .strlen(str), i
            .if (.strat(str, i) >= $C1) .and (.strat(str, i) <= $DA)
                .byte .strat(str, i) - $C0      ; PETSCII upper case
            .elseif (.strat(str, i) >= $41) .and (.strat(str, i) <= $5A)
                .byte .strat(str, i) - $40      ; untranslated ASCII
            .else
                .byte .strat(str, i)
            .endif
        .endrepeat
        .byte $FF
        .endmacro

s_score:  SCR "SCORE"
s_bombs:  SCR "BOMBS"
s_alt:    SCR "ALT"
s_men:    SCR "AC"
s_fuel:   SCR "FUEL"
s_guns:   SCR "GUNS"
s_blank:  SCR "                "   ; must cover the longest banner
s_title1: SCR "BLUE MAX"
s_title2: SCR "COMMANDER X16"
s_title3: SCR "ARROWS FLY   Z GUNS   X BOMBS"
s_title4: SCR "PRESS ENTER TO SCRAMBLE"
s_over:   SCR "GAME OVER"
s_downed: SCR "AIRCRAFT DOWN"
s_dry:    SCR "OUT OF FUEL"
s_land:   SCR "REFUELLING"
s_hi:     SCR "BEST"
