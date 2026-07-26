; ---------------------------------------------------------------------------
; vera.inc -- Commander X16 hardware definitions (VERA, PSG, KERNAL)
; Verified against "X16 Reference - 09 - VERA Programmer's Reference".
; ---------------------------------------------------------------------------

; --- VERA registers -------------------------------------------------------
VERA_ADDRx_L    = $9F20
VERA_ADDRx_M    = $9F21
VERA_ADDRx_H    = $9F22         ; bit7-4 increment, bit3 DECR, bit0 addr bit16
VERA_DATA0      = $9F23
VERA_DATA1      = $9F24
VERA_CTRL       = $9F25         ; bit0 ADDRSEL, bit1 DCSEL, bit7 RESET
VERA_IEN        = $9F26
VERA_ISR        = $9F27
VERA_IRQLINE_L  = $9F28

; DCSEL = 0
VERA_DC_VIDEO   = $9F29         ; b0-1 outmode, b4 L0en, b5 L1en, b6 sprEn
VERA_DC_HSCALE  = $9F2A
VERA_DC_VSCALE  = $9F2B
VERA_DC_BORDER  = $9F2C
; DCSEL = 1
VERA_DC_HSTART  = $9F29
VERA_DC_HSTOP   = $9F2A
VERA_DC_VSTART  = $9F2B
VERA_DC_VSTOP   = $9F2C

VERA_L0_CONFIG  = $9F2D         ; b7-6 mapH, b5-4 mapW, b3 T256C, b2 bitmap, b1-0 depth
VERA_L0_MAPBASE = $9F2E         ; addr(16:9)
VERA_L0_TILEBASE= $9F2F         ; addr(16:11) | b1 tileH | b0 tileW
VERA_L0_HSCROLL_L = $9F30
VERA_L0_HSCROLL_H = $9F31
VERA_L0_VSCROLL_L = $9F32
VERA_L0_VSCROLL_H = $9F33

VERA_L1_CONFIG  = $9F34
VERA_L1_MAPBASE = $9F35
VERA_L1_TILEBASE= $9F36
VERA_L1_HSCROLL_L = $9F37
VERA_L1_HSCROLL_H = $9F38
VERA_L1_VSCROLL_L = $9F39
VERA_L1_VSCROLL_H = $9F3A

; --- VRAM layout used by this game ---------------------------------------
; $00000  ground tilemap   64x64 x 2 bytes            = $2000
; $02000  ground tiles     256 x 16x16 @4bpp (128 B)  = $8000
; $0A000  sprite pixels                               = ~$6000
; $10000  HUD tilemap      128x32 x 2 bytes           = $2000
; $1F000  the KERNAL's charset, borrowed for the HUD  = $0800
VRAM_MAP        = $00000
VRAM_TILES      = $02000
VRAM_SPR        = $0A000
VRAM_HUDMAP     = $10000
VRAM_HUDFONT    = $1F000

VRAM_PSG        = $1F9C0
VRAM_PALETTE    = $1FA00
VRAM_SPRATTR    = $1FC00

; --- KERNAL ---------------------------------------------------------------
JOYSTICK_SCAN   = $FF53
JOYSTICK_GET    = $FF56
CHROUT          = $FFD2
CINT            = $FF81
SCNKEY          = $FF9F
GETIN           = $FFE4

; Joystick byte 0 (returned in .A) -- a 0 bit means pressed
JOY_B           = %10000000
JOY_Y           = %01000000
JOY_SELECT      = %00100000
JOY_START       = %00010000
JOY_UP          = %00001000
JOY_DOWN        = %00000100
JOY_LEFT        = %00000010
JOY_RIGHT       = %00000001
; Joystick byte 1 (returned in .X)
JOY_A           = %10000000
JOY_X           = %01000000
JOY_L           = %00100000
JOY_R           = %00010000

; ---------------------------------------------------------------------------
; VERA_SETADDR -- point data port 0 at a 17-bit VRAM address.
; `inc` is the raw increment nibble (1 = +1, 2 = +2, ... see the reference).
; ---------------------------------------------------------------------------
.macro VERA_SETADDR addr, inc
    .if (.paramcount = 1)
        lda #<(addr)
        sta VERA_ADDRx_L
        lda #>(addr)
        sta VERA_ADDRx_M
        lda #(^(addr)) | $10
        sta VERA_ADDRx_H
    .else
        lda #<(addr)
        sta VERA_ADDRx_L
        lda #>(addr)
        sta VERA_ADDRx_M
        lda #(^(addr)) | ((inc) << 4)
        sta VERA_ADDRx_H
    .endif
.endmacro
