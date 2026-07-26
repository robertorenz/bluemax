; ---------------------------------------------------------------------------
; sound.asm -- VERA PSG driver.
;
; Registers are written straight into VRAM at $1F9C0 rather than through the
; KERNAL audio API, which keeps the driver self-contained (no ROM banking).
;
;   voice 0  engine drone      voice 4  melody
;   voice 1  machine guns      voice 5  counter-melody
;   voice 2  explosions        voice 6  bass
;   voice 3  bomb whistle
;
; Voices 1-3 are one-shots driven by a countdown with a falling pitch and
; volume; the music voices are stepped by an 8-frame sequencer.
; ---------------------------------------------------------------------------

V_ENGINE = 0
V_GUN    = 1
V_BOOM   = 2
V_WHIST  = 3
V_LEAD   = 4
V_HARM   = 5
V_BASS   = 6

WF_PULSE = 0 << 6
WF_SAW   = 1 << 6
WF_TRI   = 2 << 6
WF_NOISE = 3 << 6
PAN_BOTH = $C0

; ---------------------------------------------------------------------------
; psg_at -- arm VERA at voice .A's register block
; ---------------------------------------------------------------------------
psg_at:
        asl
        asl
        clc
        adc #<VRAM_PSG
        sta VERA_ADDRx_L
        lda #>VRAM_PSG
        adc #0
        sta VERA_ADDRx_M
        lda #(1 << 4) | (^VRAM_PSG)
        sta VERA_ADDRx_H
        rts

; ---------------------------------------------------------------------------
; psg_write -- voice .A: freq `sfreq`, volume `svol`, waveform byte `swave`
; ---------------------------------------------------------------------------
psg_write:
        jsr psg_at
        lda sfreq
        sta VERA_DATA0
        lda sfreq+1
        sta VERA_DATA0
        lda svol
        ora #PAN_BOTH
        sta VERA_DATA0
        lda swave
        sta VERA_DATA0
        rts

; ---------------------------------------------------------------------------
; sound_init -- silence everything
; ---------------------------------------------------------------------------
sound_init:
        VERA_SETADDR VRAM_PSG, 1
        ldx #64
:       stz VERA_DATA0
        dex
        bne :-
        stz gun_t
        stz boom_t
        stz whist_t
        stz mus_step
        stz mus_t
        stz eng_on
        rts

; ---------------------------------------------------------------------------
; One-shot triggers
; ---------------------------------------------------------------------------
sfx_gun:
        lda #6
        sta gun_t
        rts

sfx_boom:
        lda #34
        sta boom_t
        rts

sfx_flak:
        lda #10
        sta gun_t
        rts

sfx_whistle:
        lda #48
        sta whist_t
        rts

; ---------------------------------------------------------------------------
; sound_update -- once per frame
; ---------------------------------------------------------------------------
sound_update:
        jsr snd_engine
        jsr snd_gun
        jsr snd_boom
        jsr snd_whistle
        jsr snd_music
        rts

; --- engine: a saw drone that rises with altitude --------------------------
snd_engine:
        lda eng_on
        bne :+
        stz svol
        stz sfreq
        stz sfreq+1
        lda #WF_SAW
        sta swave
        lda #V_ENGINE
        jmp psg_write
:       lda ply_alt
        lsr
        lsr
        clc
        adc #38
        sta sfreq
        stz sfreq+1
        lda frame                       ; slight beat, so it is not a dead tone
        and #7
        clc
        adc sfreq
        sta sfreq
        lda #16
        sta svol
        lda #WF_SAW | 20
        sta swave
        lda #V_ENGINE
        jmp psg_write

; --- guns: a short noise crack ---------------------------------------------
snd_gun:
        lda gun_t
        bne :+
        stz svol
        lda #WF_NOISE
        sta swave
        stz sfreq
        stz sfreq+1
        lda #V_GUN
        jmp psg_write
:       dec gun_t
        asl
        asl
        sta svol
        cmp #48
        bcc :+
        lda #48
        sta svol
:       lda #$40
        sta sfreq
        lda #$18
        sta sfreq+1
        lda #WF_NOISE
        sta swave
        lda #V_GUN
        jmp psg_write

; --- explosions: noise with a falling pitch and volume ----------------------
snd_boom:
        lda boom_t
        bne :+
        stz svol
        lda #WF_NOISE
        sta swave
        stz sfreq
        stz sfreq+1
        lda #V_BOOM
        jmp psg_write
:       dec boom_t
        sta svol                        ; 0..33 fades out naturally
        asl
        asl
        sta sfreq
        lda #$04
        sta sfreq+1
        lda #WF_NOISE
        sta swave
        lda #V_BOOM
        jmp psg_write

; --- falling bomb: a descending triangle whistle ---------------------------
snd_whistle:
        lda whist_t
        bne :+
        stz svol
        lda #WF_TRI
        sta swave
        stz sfreq
        stz sfreq+1
        lda #V_WHIST
        jmp psg_write
:       dec whist_t
        lsr
        clc
        adc #12
        sta svol
        lda whist_t
        asl
        asl
        asl
        sta sfreq
        lda whist_t
        lsr
        lsr
        lsr
        lsr
        lsr
        clc
        adc #2
        sta sfreq+1
        lda #WF_TRI
        sta swave
        lda #V_WHIST
        jmp psg_write

; ---------------------------------------------------------------------------
; Music: three voices stepped every 8 frames through a 64-step pattern.
; Encoding: 0 = hold, 1 = rest, >=2 = note (semitone = value - 2, C1 = 0).
; ---------------------------------------------------------------------------
MUS_TICK = 8

snd_music:
        lda mus_off
        beq :+
        rts
:       inc mus_t
        lda mus_t
        cmp #MUS_TICK
        bcc @decay
        stz mus_t

        ldx mus_step
        lda mus_lead,x
        ldy #V_LEAD
        ldx #26
        jsr mus_note
        ldx mus_step
        lda mus_harm,x
        ldy #V_HARM
        ldx #17
        jsr mus_note
        ldx mus_step
        lda mus_bass,x
        ldy #V_BASS
        ldx #24
        jsr mus_note

        inc mus_step
        lda mus_step
        cmp #64
        bcc @decay
        stz mus_step
@decay:
        ; let each note fall away so the loop breathes
        ldx #V_LEAD
@dl:    lda mus_vol-V_LEAD,x
        beq @dn
        dec mus_vol-V_LEAD,x
        lda mus_frq_lo-V_LEAD,x
        sta sfreq
        lda mus_frq_hi-V_LEAD,x
        sta sfreq+1
        lda mus_vol-V_LEAD,x
        lsr
        sta svol
        lda mus_wave-V_LEAD,x
        sta swave
        txa
        phx
        jsr psg_write
        plx
@dn:    inx
        cpx #V_BASS+1
        bne @dl
        rts

; ---------------------------------------------------------------------------
; mus_note -- .A = pattern byte, .Y = voice, .X = attack volume
; ---------------------------------------------------------------------------
mus_note:
        cmp #0
        beq @hold
        cmp #1
        beq @rest
        sec
        sbc #2
        pha
        tya
        tax
        pla
        tay                             ; .Y = semitone, .X = voice
        lda notelo,y
        sta sfreq
        sta mus_frq_lo-V_LEAD,x
        lda notehi,y
        sta sfreq+1
        sta mus_frq_hi-V_LEAD,x
        lda mus_atk-V_LEAD,x
        sta svol
        asl
        sta mus_vol-V_LEAD,x
        lda mus_tone-V_LEAD,x
        sta swave
        sta mus_wave-V_LEAD,x
        txa
        jmp psg_write
@rest:  tya
        tax
        stz mus_vol-V_LEAD,x
        stz svol
        stz sfreq
        stz sfreq+1
        lda mus_tone-V_LEAD,x
        sta swave
        txa
        jmp psg_write
@hold:  rts

; per-voice timbre and attack level, indexed from V_LEAD
mus_tone: .byte WF_PULSE | 40, WF_TRI, WF_SAW | 12
mus_atk:  .byte 22, 14, 20

; --- the theme: eight bars in D minor --------------------------------------
mus_lead:
        .byte 40,0,43,0,47,0,52,0
        .byte 50,0,47,0,43,0,47,0
        .byte 48,0, 0,0,45,0, 0,0
        .byte 47,0, 0,0, 0,0, 0,0
        .byte 40,0,43,0,47,0,52,0
        .byte 54,0,52,0,50,0,47,0
        .byte 48,0,47,0,45,0,43,0
        .byte 40,0, 0,0, 0,0, 1,0
mus_harm:
        .byte 31,0,0,0,0,0,0,0
        .byte 30,0,0,0,0,0,0,0
        .byte 28,0,0,0,0,0,0,0
        .byte 27,0,0,0,0,0,0,0
        .byte 31,0,0,0,0,0,0,0
        .byte 35,0,0,0,0,0,0,0
        .byte 33,0,0,0,39,0,0,0
        .byte 31,0,0,0,0,0,1,0
mus_bass:
        .byte 16,0,0,0,16,0,0,0
        .byte 23,0,0,0,23,0,0,0
        .byte 12,0,0,0,12,0,0,0
        .byte 23,0,0,0,23,0,0,0
        .byte 16,0,0,0,16,0,0,0
        .byte 19,0,0,0,19,0,0,0
        .byte 21,0,0,0,23,0,0,0
        .byte 16,0,0,0, 0,0,1,0

        .segment "RODATA"
        .include "data/tables.inc"
        .segment "CODE"
