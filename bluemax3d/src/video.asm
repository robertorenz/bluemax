; ---------------------------------------------------------------------------
; video.asm -- VERA bring-up and asset upload.
;
; Layer 0 is the ground, scrolled per raster band by raster.asm.
; Layer 1 is the HUD, using the KERNAL charset with a transparent background.
; ---------------------------------------------------------------------------

video_init:
        stz VERA_CTRL
        lda #64                         ; 320x240 logical
        sta VERA_DC_HSCALE
        sta VERA_DC_VSCALE

        lda #(1 << 6) | (1 << 4) | %10  ; 64x64 map, 4bpp tiles
        sta VERA_L0_CONFIG
        lda #(VRAM_MAP >> 9)
        sta VERA_L0_MAPBASE
        lda #((VRAM_TILES >> 11) << 2) | %11    ; 16x16
        sta VERA_L0_TILEBASE
        stz VERA_L0_HSCROLL_L
        stz VERA_L0_HSCROLL_H
        stz VERA_L0_VSCROLL_L
        stz VERA_L0_VSCROLL_H

        lda #(0 << 6) | (2 << 4) | %00  ; map 128x32, 1bpp text
        sta VERA_L1_CONFIG
        lda #(VRAM_HUDMAP >> 9)
        sta VERA_L1_MAPBASE
        lda #((VRAM_HUDFONT >> 11) << 2)
        sta VERA_L1_TILEBASE
        stz VERA_L1_HSCROLL_L
        stz VERA_L1_HSCROLL_H
        stz VERA_L1_VSCROLL_L
        stz VERA_L1_VSCROLL_H

        jsr load_palette
        jsr load_tiles
        jsr load_sprites
        jsr spr_init
        jsr hud_init

        lda #$71
        sta VERA_DC_VIDEO
        rts

load_palette:
        VERA_SETADDR VRAM_PALETTE, 1
        ldx #0
@lo:    lda pal_data,x
        sta VERA_DATA0
        inx
        bne @lo
@hi:    lda pal_data+256,x
        sta VERA_DATA0
        inx
        bne @hi
        rts

load_tiles:
        VERA_SETADDR VRAM_TILES, 1
        lda #<tile_data
        sta ptr
        lda #>tile_data
        sta ptr+1
        lda #<TILE_BYTES
        sta cnt
        lda #>TILE_BYTES
        sta cnt+1
        jmp blit

load_sprites:
        VERA_SETADDR VRAM_SPR, 1
        lda #<spr_data
        sta ptr
        lda #>spr_data
        sta ptr+1
        lda #<SPR_BYTES
        sta cnt
        lda #>SPR_BYTES
        sta cnt+1
        ; fall through

blit:
        ldy #0
@page:  lda cnt+1
        beq @tail
@full:  lda (ptr),y
        sta VERA_DATA0
        iny
        bne @full
        inc ptr+1
        dec cnt+1
        bra @page
@tail:  cpy cnt
        beq @done
@last:  lda (ptr),y
        sta VERA_DATA0
        iny
        cpy cnt
        bne @last
@done:  rts

        .segment "RODATA"
pal_data:   .incbin "data/palette.bin"
tile_data:  .incbin "data/tiles.bin"
spr_data:   .incbin "data/sprites.bin"
        .segment "CODE"
