; ---------------------------------------------------------------------------
; sprite.asm -- a RAM shadow of VERA's sprite attribute table.
;
; Everything writes into sprbuf during the frame; the whole block is pushed to
; $1FC00 in one auto-incrementing burst at the next vblank, so sprites never
; tear and no code has to think about VERA addressing.
; ---------------------------------------------------------------------------

; Static slot assignment -- no allocator, so a given entity always owns the
; same sprite and rendering priority is stable.
;
; VERA renders sprites in ascending index order and will not redraw a pixel
; already covered at the same z-depth, so the LOWEST index wins. This list
; therefore runs from most important to least.
SL_FX     = 0                           ; explosions cover everything
SL_PLAYER = SL_FX + MAXFX
SL_SHOT   = SL_PLAYER + 1
SL_BOMB   = SL_SHOT + MAXSHOT
SL_AIR    = SL_BOMB + MAXBOMB
SL_FLAK   = SL_AIR + MAXAIR
SL_OBJ    = SL_FLAK + MAXFLAK
SL_CLOUD  = SL_OBJ + MAXOBJ             ; scenery, never in front of anything
SL_SHADOW = SL_CLOUD + MAXCLOUD         ; the aeroplane's shadow is bottom-most
NSLOTS    = SL_SHADOW + 1

; Layer 0 is opaque farmland, so z-depth 1 would bury a sprite underneath it.
; Everything the player must see sits at 2: above the landscape, below the HUD.
Z_OFF     = 0
Z_GROUND  = 2
Z_AIR     = 2

; ---------------------------------------------------------------------------
; spr_init -- zero all 128 hardware sprites.
;
; spr_push only ever writes the NSLOTS the game uses; the rest keep whatever
; was in VRAM at boot, and any of those with a non-zero z-depth would render
; garbage from arbitrary memory. They have to be silenced once, up front.
; ---------------------------------------------------------------------------
spr_init:
        VERA_SETADDR VRAM_SPRATTR, 1
        ldx #4                          ; 4 * 256 = 128 sprites * 8 bytes
@p:     ldy #0
@b:     stz VERA_DATA0
        dey
        bne @b
        dex
        bne @p
        rts

; ---------------------------------------------------------------------------
; spr_clear -- disable every sprite the game owns.
; ---------------------------------------------------------------------------
spr_clear:
        ldx #0
@lp:    stz sprbuf,x
        stz sprbuf+256,x
        inx
        bne @lp
        rts

; ---------------------------------------------------------------------------
; spr_push -- sprbuf -> VERA sprite attributes.
; ---------------------------------------------------------------------------
spr_push:
        VERA_SETADDR VRAM_SPRATTR, 1
        ldx #0
@lo:    lda sprbuf,x
        sta VERA_DATA0
        inx
        bne @lo
@hi:    lda sprbuf+256,x
        sta VERA_DATA0
        inx
        cpx #((NSLOTS * 8) - 256)
        bne @hi
        rts

; ---------------------------------------------------------------------------
; spr_addr -- point sptr at sprbuf + slot*8.  .A = slot.  Preserves nothing.
; ---------------------------------------------------------------------------
spr_addr:
        stz sptr+1
        asl
        rol sptr+1
        asl
        rol sptr+1
        asl
        rol sptr+1
        clc
        adc #<sprbuf
        sta sptr
        lda sptr+1
        adc #>sprbuf
        sta sptr+1
        rts

; ---------------------------------------------------------------------------
; spr_hide -- .A = slot
;
; Preserves .X and .Y: every caller is inside an entity loop that is using one
; of them as its index.
; ---------------------------------------------------------------------------
spr_hide:
        phx
        phy
        jsr spr_addr
        ldy #6
        lda #0
        sta (sptr),y
        ply
        plx
        rts

; ---------------------------------------------------------------------------
; spr_put -- place a centred sprite.
;
;   .A   slot
;   pimg image id
;   px   signed 16-bit screen X of the sprite's centre
;   py   signed 16-bit screen Y of the sprite's centre
;   pz   z-depth (Z_GROUND / Z_AIR)
;
; Anything comfortably off screen is disabled instead of drawn, which keeps
; VERA's per-line sprite budget for things that are actually visible.
;
; Preserves .X and .Y for the same reason spr_hide does.
; ---------------------------------------------------------------------------
spr_put:
        phx
        phy
        jsr spr_put_i
        ply
        plx
        rts

spr_put_i:
        jsr spr_addr
        ldx pimg

        ; --- cull ---------------------------------------------------------
        lda px+1
        bmi @xneg
        beq @xok                        ; 0..255 always fine
        lda px
        cmp #<400                       ; > 400 is well past the right edge
        lda px+1
        sbc #>400
        bcs @off
        bra @xok
@xneg:  lda px+1
        cmp #$FF                        ; only -1..-255 can still be visible
        bne @off
        lda px
        cmp #200                        ; i.e. >= -56
        bcc @off
@xok:
        lda py+1
        bmi @yneg
        beq @yok
        lda py
        cmp #<320
        lda py+1
        sbc #>320
        bcs @off
        bra @yok
@yneg:  lda py+1
        cmp #$FF
        bne @off
        lda py
        cmp #200
        bcc @off
@yok:
        ; --- image ---------------------------------------------------------
        lda imgadr_lo,x
        ldy #0
        sta (sptr),y
        lda imgadr_hi,x
        iny
        sta (sptr),y

        ; --- position, biased by half the image so px/py mean the centre ---
        lda px
        sec
        sbc imghw,x
        sta tmpa
        lda px+1
        sbc #0
        and #$03
        sta tmpa+1
        lda tmpa
        ldy #2
        sta (sptr),y
        lda tmpa+1
        iny
        sta (sptr),y

        lda py
        sec
        sbc imghh,x
        sta tmpa
        lda py+1
        sbc #0
        and #$03
        sta tmpa+1
        lda tmpa
        ldy #4
        sta (sptr),y
        lda tmpa+1
        iny
        sta (sptr),y

        ; --- depth and size ------------------------------------------------
        lda pz
        asl
        asl
        ldy #6
        sta (sptr),y
        lda imgattr,x
        iny
        sta (sptr),y
        rts

@off:   ldy #6
        lda #0
        sta (sptr),y
        rts
