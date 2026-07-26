; ===========================================================================
; BLUE MAX -- Commander X16
;
; A 65C02 port of the Three.js Blue Max homage in the parent directory, built
; around the hardware the X16 actually has: one diagonally scrolling VERA tile
; layer for the landscape, sprites for everything that moves, the KERNAL text
; layer for the HUD, and the VERA PSG for sound.
;
; Build:  tools/build.ps1      (or see README.md)
; ===========================================================================
        .setcpu "65C02"
        .include "vera.inc"

; gfx.inc both defines constants and emits lookup tables, so it has to land in
; RODATA -- anything emitted into CODE here would sit in front of `start`.
        .segment "RODATA"
        .include "data/gfx.inc"
        .segment "CODE"

; --- world tuning -----------------------------------------------------------
PLY_Y     = 168                         ; the aeroplane's fixed screen row
PLY_XMIN  = 26
PLY_XMAX  = 292
ALT_MAX   = 72
SPD_FLY   = 2                           ; pixels of scroll per frame, per axis
SPD_ROLL  = 1                           ; slowed down during a landing rollout

MAXOBJ    = 20
MAXAIR    = 5
MAXSHOT   = 8
MAXBOMB   = 4
MAXFLAK   = 6
MAXFX     = 6

OBJ_RATE  = 26                          ; frames between ground targets
AIR_RATE  = 150                         ; frames between enemy aircraft

ST_TITLE  = 0
ST_PLAY   = 1
ST_DEAD   = 2
ST_OVER   = 3

PLOT      = $FFF0

; ===========================================================================
; Zero page
; ===========================================================================
        .segment "ZEROPAGE"
ptr:      .res 2
cnt:      .res 2
sptr:     .res 2
px:       .res 2                        ; sprite placement, screen centre
py:       .res 2
pimg:     .res 1
pz:       .res 1
tmpa:     .res 2
tmpb:     .res 1
twx:      .res 2                        ; world tile being generated
twy:      .res 2
tS:       .res 2
tD:       .res 2
camX:     .res 2
camY:     .res 2
wx0:      .res 2                        ; world tile at the screen's left/top
wy0:      .res 2
spd:      .res 1
frame:    .res 1
rng:      .res 2
strp:     .res 2
numsrc:   .res 2
msgp:     .res 2
hcol:     .res 1
hnum:     .res 1
hval:     .res 1
sfreq:    .res 2
svol:     .res 1
swave:    .res 1
ex:       .res 2                        ; scratch event position
ey:       .res 2

; ===========================================================================
        .segment "CODE"

start:
        sei
        jsr sound_init
        jsr video_init
        jsr spr_clear

        ; park the KERNAL's cursor outside the 40x30 window we draw in
        clc
        ldx #50
        ldy #70
        jsr PLOT

        lda #$34                        ; seed the PRNG with something non-zero
        sta rng
        lda #$9B
        sta rng+1

        ; --- take over the IRQ vector for frame timing ---------------------
        lda $0314
        sta old_irq
        lda $0315
        sta old_irq+1
        lda #<irq_handler
        sta $0314
        lda #>irq_handler
        sta $0315
        cli

        jsr new_game
.ifdef AUTOSTART
        lda #ST_PLAY                    ; -DAUTOSTART: skip straight into a
.else                                   ; sortie, for screenshots and testing
        lda #ST_TITLE
.endif
        sta game_state
        stz hiscore
        stz hiscore+1
        stz hiscore+2

; ---------------------------------------------------------------------------
; Main loop. Everything that touches VERA's visible state happens right after
; vblank so the picture never tears.
; ---------------------------------------------------------------------------
mainloop:
        jsr wait_vsync
        jsr spr_push
        jsr terrain_push

        ; the readouts only belong on screen while a sortie is running
        lda game_state
        cmp #ST_TITLE
        beq :+
        cmp #ST_OVER
        beq :+
        jsr hud_draw
:
        inc frame
        jsr input_read
        jsr sound_update

        lda game_state
        cmp #ST_TITLE
        beq do_title
        cmp #ST_PLAY
        beq do_play
        cmp #ST_DEAD
        beq do_dead
        jmp do_over

; ---------------------------------------------------------------------------
do_title:
        stz eng_on
        lda #SPD_FLY
        sta spd
        jsr terrain_scroll
        jsr title_weave                 ; an aeroplane on patrol behind the text
        jsr player_draw
        jsr draw_title
        jsr start_pressed
        bcc :+
        jsr new_game
        lda #ST_PLAY
        sta game_state
        jsr hud_clear
:       jmp mainloop

; ---------------------------------------------------------------------------
do_play:
        lda #1
        sta eng_on
        jsr terrain_scroll
        jsr player_update
        jsr obj_update
        jsr air_update
        jsr shot_update
        jsr bomb_update
        jsr flak_update
        jsr fx_update
        jsr player_draw
        jsr spawner

        ; running dry is fatal only once you are on the deck
        lda fuel
        bne :+
        lda ply_alt
        bne :+
        lda ply_land
        bne :+
        lda #<s_dry
        ldx #>s_dry
        jsr hud_msg
        jsr player_hit
:       jmp mainloop

; ---------------------------------------------------------------------------
do_dead:
        stz eng_on
        lda #SPD_FLY
        sta spd
        jsr terrain_scroll
        jsr obj_update
        jsr air_update
        jsr flak_update
        jsr fx_update
        lda #SL_PLAYER
        jsr spr_hide
        lda #SL_SHADOW
        jsr spr_hide

        dec state_t
        bne :+
        dec lives
        bne @respawn
        lda #ST_OVER
        sta game_state
        lda #200
        sta state_t
        jsr check_hiscore
        jsr hud_clear
        jsr world_reset                 ; clear the battlefield behind the text
        jsr spr_clear
        bra :+
@respawn:
        jsr player_reset
        lda #ST_PLAY
        sta game_state
:       jmp mainloop

; ---------------------------------------------------------------------------
do_over:
        stz eng_on
        lda #SPD_FLY
        sta spd
        jsr terrain_scroll
        jsr fx_update
        jsr draw_over
        lda state_t
        beq :+
        dec state_t
        jmp mainloop
:       jsr start_pressed
        bcc :+
        lda #ST_TITLE
        sta game_state
        jsr hud_clear
        jsr player_reset                ; re-centre the aeroplane on the title
:       jmp mainloop

; ===========================================================================
; Frame timing
; ===========================================================================
irq_handler:
        inc vbl
        jmp (old_irq)

wait_vsync:
        lda vbl
:       cmp vbl
        beq :-
        rts

; ===========================================================================
; Input
; ===========================================================================
input_read:
        lda joy0
        sta joy0p
        lda joy1
        sta joy1p
        lda #0
        jsr JOYSTICK_GET
        sta joy0
        stx joy1
.ifdef DEMO
        ; -DDEMO: synthesise input so a headless run exercises guns, bombs and
        ; manoeuvring. Joystick bits are active low, so AND clears = pressed.
        lda frame
        and #$3F
        cmp #$20
        lda joy0
        bcc :+
        and #<(~JOY_LEFT & $FF)
        bra :++
:       and #<(~JOY_RIGHT & $FF)
:       sta joy0
        lda frame                       ; climb, then dive onto the deck, so
        cmp #$C0                        ; landing and crashing get exercised
        bcc :+
        lda joy0
        and #<(~JOY_DOWN & $FF)
        sta joy0
        bra :++
:       cmp #$40
        bcc :+
        lda joy0
        and #<(~JOY_UP & $FF)
        sta joy0
:
        lda joy1
        and #<(~JOY_B & $FF)            ; guns held down
        sta joy1
        lda frame
        and #$5F
        bne :+
        lda joy1
        and #<(~JOY_A & $FF)            ; and a bomb now and then
        sta joy1
:
.endif
        rts

; start_pressed -- carry set on the frame Enter, Z or X goes down.
; Accepting all three means the game still starts on a real SNES pad, and on a
; keyboard whichever of Enter/Z/X the player reaches for first.
start_pressed:
        lda joy0                        ; joystick bits are active low
        eor #$FF
        and #JOY_START
        beq @fire
        lda joy0p
        eor #$FF
        and #JOY_START
        beq @yes                        ; down now, up last frame
@fire:  lda joy1
        eor #$FF
        and #(JOY_A | JOY_B)
        beq @no
        lda joy1p
        eor #$FF
        and #(JOY_A | JOY_B)
        bne @no
@yes:   sec
        rts
@no:    clc
        rts

; ===========================================================================
; Game setup
; ===========================================================================
new_game:
        stz score
        stz score+1
        stz score+2
        lda #3
        sta lives
        stz kills
        stz frame
        stz msg_t
        stz msg_clr
        stz mus_off
        lda #SPD_FLY
        sta spd
        stz camX
        stz camX+1
        stz camY
        stz camY+1
        stz wx0
        stz wx0+1
        stz wy0
        stz wy0+1
        jsr terrain_init
        jsr spr_clear
        jsr world_reset
        jsr player_reset
        rts

; ---------------------------------------------------------------------------
; spawner -- trickle new targets and aircraft in
; ---------------------------------------------------------------------------
spawner:
        inc spawn_t
        lda spawn_t
        cmp #OBJ_RATE
        bcc :+
        stz spawn_t
        jsr obj_spawn
:       inc airspawn_t
        lda airspawn_t
        cmp #AIR_RATE
        bcc :+
        stz airspawn_t
        jsr air_spawn
:       rts

; ---------------------------------------------------------------------------
check_hiscore:
        lda score+2
        cmp hiscore+2
        bcc @no
        bne @yes
        lda score+1
        cmp hiscore+1
        bcc @no
        bne @yes
        lda score
        cmp hiscore
        bcc @no
@yes:   lda score
        sta hiscore
        lda score+1
        sta hiscore+1
        lda score+2
        sta hiscore+2
@no:    rts

; ===========================================================================
; Title and game-over screens
; ===========================================================================
; title_weave -- drift the aeroplane back and forth so the title screen moves
title_weave:
        stz ply_roll
        lda frame
        and #$7F
        cmp #$40
        bcs @left
        inc ply_x
        lda #1
        sta ply_roll
        rts
@left:  dec ply_x
        lda #<-1
        sta ply_roll
        rts

draw_title:
        lda #C_AMBER
        sta hcol
        lda #<s_title1
        sta strp
        lda #>s_title1
        sta strp+1
        lda #4
        ldx #16
        jsr hud_str

        lda #C_WHITE
        sta hcol
        lda #<s_title2
        sta strp
        lda #>s_title2
        sta strp+1
        lda #6
        ldx #13
        jsr hud_str

        lda #<s_title3
        sta strp
        lda #>s_title3
        sta strp+1
        lda #25
        ldx #6
        jsr hud_str

        lda frame                       ; blink the prompt
        and #32
        bne @skip
        lda #C_AMBER
        sta hcol
        lda #<s_title4
        sta strp
        lda #>s_title4
        sta strp+1
        lda #27
        ldx #8
        jsr hud_str
        rts
@skip:  lda #C_WHITE
        sta hcol
        lda #<s_blank
        sta strp
        lda #>s_blank
        sta strp+1
        lda #27
        ldx #8
        jsr hud_str
        lda #27
        ldx #20
        jsr hud_str
        rts

draw_over:
        lda #C_RED
        sta hcol
        lda #<s_over
        sta strp
        lda #>s_over
        sta strp+1
        lda #12
        ldx #15
        jsr hud_str

        lda #C_WHITE
        sta hcol
        lda #<s_score
        sta strp
        lda #>s_score
        sta strp+1
        lda #15
        ldx #13
        jsr hud_str
        lda #C_AMBER
        sta hcol
        lda #15
        ldx #19
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
        lda #<s_hi
        sta strp
        lda #>s_hi
        sta strp+1
        lda #17
        ldx #14
        jsr hud_str
        lda #C_AMBER
        sta hcol
        lda #17
        ldx #19
        jsr hud_at
        lda #<hiscore
        sta numsrc
        lda #>hiscore
        sta numsrc+1
        lda #3
        sta hnum
        jmp hud_bcd

; ===========================================================================
        .include "video.asm"
        .include "terrain.asm"
        .include "sprite.asm"
        .include "world.asm"
        .include "player.asm"
        .include "hud.asm"
        .include "sound.asm"

; ===========================================================================
; Variables
; ===========================================================================
        .segment "BSS"
sprbuf:   .res 512

old_irq:  .res 2
vbl:      .res 1
joy0:     .res 1
joy1:     .res 1
joy0p:    .res 1
joy1p:    .res 1

game_state: .res 1
state_t:  .res 1
score:    .res 3
hiscore:  .res 3
lives:    .res 1
kills:    .res 1
fuel:     .res 1
fuel_t:   .res 1
bombs:    .res 1
spawn_t:  .res 1
airspawn_t: .res 1
msg_t:    .res 1
msg_clr:  .res 1

ply_x:    .res 2
ply_alt:  .res 1
ply_roll: .res 1
ply_heat: .res 1
ply_over: .res 1
ply_gunt: .res 1
ply_bombt:.res 1
ply_inv:  .res 1
ply_land: .res 1

tcol:     .res 1
tcol_wx:  .res 2
trow:     .res 1
trow_wy:  .res 2
mrow:     .res 1                        ; map line cursor; tile_at eats tmpa/tmpb

; ground targets
obj_k:    .res MAXOBJ
obj_xl:   .res MAXOBJ
obj_xh:   .res MAXOBJ
obj_yl:   .res MAXOBJ
obj_yh:   .res MAXOBJ
obj_hp:   .res MAXOBJ
obj_t:    .res MAXOBJ
obj_img:  .res MAXOBJ

; enemy aircraft
air_k:    .res MAXAIR
air_kind: .res MAXAIR
air_xl:   .res MAXAIR
air_xh:   .res MAXAIR
air_yl:   .res MAXAIR
air_yh:   .res MAXAIR
air_alt:  .res MAXAIR
air_hp:   .res MAXAIR
air_img:  .res MAXAIR
air_tm:   .res MAXAIR

; player bullets
sh_a:     .res MAXSHOT
sh_xl:    .res MAXSHOT
sh_xh:    .res MAXSHOT
sh_yl:    .res MAXSHOT
sh_yh:    .res MAXSHOT
sh_alt:   .res MAXSHOT
sh_life:  .res MAXSHOT

; bombs
bm_a:     .res MAXBOMB
bm_xl:    .res MAXBOMB
bm_xh:    .res MAXBOMB
bm_yl:    .res MAXBOMB
bm_yh:    .res MAXBOMB
bm_alt:   .res MAXBOMB
bm_vy:    .res MAXBOMB
bm_g:     .res MAXBOMB

; flak and enemy tracers
fl_a:     .res MAXFLAK
fl_xl:    .res MAXFLAK
fl_xh:    .res MAXFLAK
fl_yl:    .res MAXFLAK
fl_yh:    .res MAXFLAK
fl_alt:   .res MAXFLAK
fl_valt:  .res MAXFLAK
fl_vx:    .res MAXFLAK
fl_vy:    .res MAXFLAK
fl_life:  .res MAXFLAK

; explosions
fx_a:     .res MAXFX
fx_xl:    .res MAXFX
fx_xh:    .res MAXFX
fx_yl:    .res MAXFX
fx_yh:    .res MAXFX
fx_f:     .res MAXFX

; sound state
gun_t:    .res 1
boom_t:   .res 1
whist_t:  .res 1
eng_on:   .res 1
mus_t:    .res 1
mus_step: .res 1
mus_off:  .res 1
mus_vol:  .res 3
mus_frq_lo: .res 3
mus_frq_hi: .res 3
mus_wave: .res 3
