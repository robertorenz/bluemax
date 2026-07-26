; ---------------------------------------------------------------------------
; raster.asm -- the 2.5D ground plane.
;
; VERA has no Mode 7, but the display registers can be rewritten mid-frame. The
; screen is split into raster bands; each band gets its own L0_VSCROLL so it
; samples the tilemap at a different depth, which squashes the ground toward
; the horizon and reads as perspective.
;
; Horizontal scale is deliberately left alone. DC_HSCALE can be changed per
; band too and does give real convergence, but it scales the sprite renderer
; as well -- an aeroplane spanning several bands shears into a parallelogram.
; Vertical-only keeps every sprite square and has unlimited depth range.
;
; Above the horizon layer 0 is switched off, so the sky is simply palette entry
; 0, rewritten each band through VERA's second data port to paint a gradient.
; Using DATA1 means the main loop's DATA0 transfers are never disturbed.
; ---------------------------------------------------------------------------

        .include "data/bands.inc"

; ---------------------------------------------------------------------------
; raster_init -- install the handler and arm the first interrupt.
; ---------------------------------------------------------------------------
raster_init:
        sei
        lda $0314
        sta old_irq
        lda $0315
        sta old_irq+1
        lda #<irq_handler
        sta $0314
        lda #>irq_handler
        sta $0315
        stz band
        lda #%00000011                  ; VSYNC + LINE
        sta VERA_IEN
        lda skyline_l
        sta VERA_IRQLINE_L
        cli
        rts

; ---------------------------------------------------------------------------
; irq_handler
;
; LINE interrupts are serviced and returned from directly -- the KERNAL only
; needs to run once a frame, on VSYNC.
; ---------------------------------------------------------------------------
irq_handler:
        lda VERA_ISR
        and #2
        bne line_irq

; --- VSYNC: reset to the top of the screen ---------------------------------
        stz VERA_CTRL
        stz band
        lda #$61                        ; sky: layer 0 off, layer 1 + sprites on
        sta VERA_DC_VIDEO
        lda skyline_l
        sta VERA_IRQLINE_L
        lda #%00000011
        sta VERA_IEN
        inc vbl
        jmp (old_irq)

; --- LINE: paint one band ---------------------------------------------------
line_irq:
        stz VERA_CTRL                   ; DCSEL=0, ADDRSEL=0
        ldx band
        cpx #NSKY
        bcs @ground

; ......... sky band: just recolour palette entry 0 .........................
        lda #1
        sta VERA_CTRL                   ; ADDRSEL=1 -- our own address register
        lda #<VRAM_PALETTE
        sta VERA_ADDRx_L
        lda #>VRAM_PALETTE
        sta VERA_ADDRx_M
        lda #(1 << 4) | (^VRAM_PALETTE)
        sta VERA_ADDRx_H
        lda skycol_l,x
        sta VERA_DATA1
        lda skycol_h,x
        sta VERA_DATA1
        stz VERA_CTRL
        bra @next

; ......... ground band: depth-dependent vertical scroll ....................
@ground:
        lda #$71                        ; layer 0 back on
        sta VERA_DC_VIDEO
        txa
        sec
        sbc #NSKY
        tay
        lda camv                        ; VSCROLL = camV + PC/d - y
        clc
        adc bandvs_l,y
        sta VERA_L0_VSCROLL_L
        lda camv+1
        adc bandvs_h,y
        and #$0F
        sta VERA_L0_VSCROLL_H

@next:  inx
        cpx #NBANDS
        bcs @done
        stx band
        lda bandline_l,x
        sta VERA_IRQLINE_L
        lda bandline_h,x
        beq :+
        lda #%10000011                  ; scanline bit 8 lives in IEN bit 7
        bra :++
:       lda #%00000011
:       sta VERA_IEN
@done:
        lda #2
        sta VERA_ISR                    ; acknowledge LINE
        ; the ROM entry pushed A, X, Y; unwind and return without the KERNAL
        pla
        tay
        pla
        tax
        pla
        rti

; ---------------------------------------------------------------------------
; wait_vsync
; ---------------------------------------------------------------------------
wait_vsync:
        lda vbl
:       cmp vbl
        beq :-
        rts

; ---------------------------------------------------------------------------
; depth_row -- world depth `zrel` (16-bit, 0..1023) -> screen row in .A
; Carry set when the object is off the bottom of the screen.
; ---------------------------------------------------------------------------
depth_row:
        lda zrel+1                      ; index = zrel >> 2, full 16-bit shift
        sta tmpa+1
        lda zrel
        sta tmpa
        lsr tmpa+1
        ror tmpa
        lsr tmpa+1
        ror tmpa
        lda tmpa+1
        bne @off                        ; zrel >= 1024: past the table
        ldx tmpa
        lda rowtab,x
        cmp #240
        bcs @off
        clc
        rts
@off:   sec
        rts
