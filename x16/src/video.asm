; ---------------------------------------------------------------------------
; video.asm -- VERA bring-up and asset upload.
;
; Layer 0  ground: 64x64 map of 16x16 4bpp tiles, hardware-scrolled diagonally.
; Layer 1  HUD: the KERNAL's own 1bpp text layer, left as-is so we get the
;          system charset for free. A background colour of 0 is transparent,
;          which lets the text float over the game.
; ---------------------------------------------------------------------------

; ---------------------------------------------------------------------------
; video_init
; ---------------------------------------------------------------------------
video_init:
        stz VERA_CTRL                   ; DCSEL=0, ADDRSEL=0
        lda #64                         ; 640x480 -> 320x240 logical pixels
        sta VERA_DC_HSCALE
        sta VERA_DC_VSCALE

        lda #(1 << 6) | (1 << 4) | %10  ; map 64x64, 4bpp, tile mode
        sta VERA_L0_CONFIG
        lda #(VRAM_MAP >> 9)
        sta VERA_L0_MAPBASE
        lda #((VRAM_TILES >> 11) << 2) | %11    ; 16x16 tiles
        sta VERA_L0_TILEBASE
        stz VERA_L0_HSCROLL_L
        stz VERA_L0_HSCROLL_H
        stz VERA_L0_VSCROLL_L
        stz VERA_L0_VSCROLL_H

        ; Layer 1 is the HUD. It borrows the KERNAL's charset at $1F000 but
        ; uses our own map, so the layout is known rather than assumed. A
        ; background colour of 0 is transparent, so text floats over the game.
        lda #(0 << 6) | (2 << 4) | %00  ; map 128x32, 1bpp text
        sta VERA_L1_CONFIG
        lda #(VRAM_HUDMAP >> 9)
        sta VERA_L1_MAPBASE
        lda #((VRAM_HUDFONT >> 11) << 2)        ; 8x8 tiles
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

        lda #$71                        ; VGA out | layer0 | layer1 | sprites
        sta VERA_DC_VIDEO
        rts

; ---------------------------------------------------------------------------
; load_palette -- 256 entries into $1FA00
; ---------------------------------------------------------------------------
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

; ---------------------------------------------------------------------------
; load_tiles -- TILE_BYTES of 4bpp tile data to VRAM_TILES
; ---------------------------------------------------------------------------
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

; ---------------------------------------------------------------------------
; load_sprites -- SPR_BYTES of 4bpp sprite data to VRAM_SPR
; ---------------------------------------------------------------------------
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

; ---------------------------------------------------------------------------
; blit -- copy `cnt` bytes from (ptr) into the already-armed VERA data port.
; ---------------------------------------------------------------------------
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
@tail:  cpy cnt                         ; .Y is 0 here
        beq @done
@last:  lda (ptr),y
        sta VERA_DATA0
        iny
        cpy cnt
        bne @last
@done:  rts

; ---------------------------------------------------------------------------
; Asset blobs
; ---------------------------------------------------------------------------
        .segment "RODATA"
pal_data:   .incbin "data/palette.bin"
tile_data:  .incbin "data/tiles.bin"
spr_data:   .incbin "data/sprites.bin"
        .segment "CODE"
