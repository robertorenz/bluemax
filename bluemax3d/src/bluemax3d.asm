; ===========================================================================
; BLUE MAX 3D -- Commander X16
;
; The second X16 build: same game, but rendered as the Three.js version looks
; -- sky and horizon up top, the ground falling away in perspective, the
; aeroplane seen from behind with its shadow tracking underneath.
;
; The perspective is real, not painted: raster.asm rewrites VERA's vertical
; scroll on every band so each screen row samples the tilemap at a different
; depth. See README.md for why horizontal scaling had to be left alone.
; ===========================================================================
        .setcpu "65C02"
        .include "vera.inc"

        .segment "RODATA"
        .include "data/gfx.inc"
        .segment "CODE"

SPD_FLY   = 2                           ; world pixels forward per frame
SPD_ROLL  = 1

MAXOBJ    = 14
MAXAIR    = 4
MAXSHOT   = 6
MAXBOMB   = 3
MAXFLAK   = 6
MAXFX     = 5
MAXCLOUD  = 3

OBJ_RATE  = 16
AIR_RATE  = 160
CLOUD_RATE = 90

ST_TITLE  = 0
ST_PLAY   = 1
ST_DEAD   = 2
ST_OVER   = 3

PLOT      = $FFF0

        .segment "ZEROPAGE"
ptr:      .res 2
cnt:      .res 2
sptr:     .res 2
px:       .res 2
py:       .res 2
pimg:     .res 1
pz:       .res 1
prow:     .res 1
tmpa:     .res 2
tmpb:     .res 1
twu:      .res 2
twv:      .res 2
camu:     .res 2
camv:     .res 2
wu0:      .res 2
wv0:      .res 2
zrel:     .res 2
ent_u:    .res 2
ent_v:    .res 2
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
ex:       .res 2
ey:       .res 2

        .segment "CODE"
start:
        sei
        jsr sound_init
        jsr video_init
        jsr spr_clear

        clc                             ; park the KERNAL cursor out of sight
        ldx #50
        ldy #70
        jsr PLOT

        lda #$34
        sta rng
        lda #$9B
        sta rng+1

        jsr new_game
        jsr raster_init
.ifdef AUTOSTART
        lda #ST_PLAY
.else
        lda #ST_TITLE
.endif
        sta game_state
        stz hiscore
        stz hiscore+1
        stz hiscore+2

mainloop:
        jsr wait_vsync
        jsr spr_push
        jsr terrain_push

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

do_title:
        stz eng_on
        lda #SPD_FLY
        sta spd
        jsr terrain_step
        jsr cloud_update
        jsr cloud_spawner
        jsr player_draw
        jsr draw_title
        jsr start_pressed
        bcc :+
        jsr new_game
        lda #ST_PLAY
        sta game_state
        jsr hud_clear
:       jmp mainloop

do_play:
        lda #1
        sta eng_on
        jsr terrain_step
        jsr player_update
        jsr cloud_update
        jsr obj_update
        jsr air_update
        jsr shot_update
        jsr bomb_update
        jsr flak_update
        jsr fx_update
        jsr player_draw
        jsr spawner

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

do_dead:
        stz eng_on
        lda #SPD_FLY
        sta spd
        jsr terrain_step
        jsr cloud_update
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
        jsr world_reset
        jsr spr_clear
        bra :+
@respawn:
        jsr player_reset
        lda #ST_PLAY
        sta game_state
:       jmp mainloop

do_over:
        stz eng_on
        lda #SPD_FLY
        sta spd
        jsr terrain_step
        jsr cloud_update
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
        jsr player_reset
:       jmp mainloop

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
        lda frame
        and #$3F
        cmp #$20
        lda joy0
        bcc :+
        and #<(~JOY_LEFT & $FF)
        bra :++
:       and #<(~JOY_RIGHT & $FF)
:       sta joy0
        lda frame
        cmp #$C0
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
        and #<(~JOY_B & $FF)
        sta joy1
        lda frame
        and #$5F
        bne :+
        lda joy1
        and #<(~JOY_A & $FF)
        sta joy1
:
.endif
        rts

start_pressed:
        lda joy0
        eor #$FF
        and #JOY_START
        beq @fire
        lda joy0p
        eor #$FF
        and #JOY_START
        beq @yes
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
        stz camu
        stz camu+1
        stz camv
        stz camv+1
        stz wu0
        stz wu0+1
        stz wv0
        stz wv0+1
        jsr terrain_init
        jsr spr_clear
        jsr world_reset
        jsr player_reset
        rts

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
:       ; fall through
cloud_spawner:
        inc cloud_t
        lda cloud_t
        cmp #CLOUD_RATE
        bcc :+
        stz cloud_t
        jsr cloud_spawn
:       rts

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
draw_title:
        lda #C_AMBER
        sta hcol
        lda #<s_title1
        sta strp
        lda #>s_title1
        sta strp+1
        lda #2
        ldx #16
        jsr hud_str

        lda #C_WHITE
        sta hcol
        lda #<s_title2
        sta strp
        lda #>s_title2
        sta strp+1
        lda #4
        ldx #13
        jsr hud_str

        lda #<s_title3
        sta strp
        lda #>s_title3
        sta strp+1
        lda #26
        ldx #6
        jsr hud_str

        lda frame
        and #32
        bne @skip
        lda #C_AMBER
        sta hcol
        lda #<s_title4
        sta strp
        lda #>s_title4
        sta strp+1
        lda #28
        ldx #8
        jsr hud_str
        rts
@skip:  lda #C_WHITE
        sta hcol
        lda #<s_blank
        sta strp
        lda #>s_blank
        sta strp+1
        lda #28
        ldx #8
        jsr hud_str
        lda #28
        ldx #22
        jmp hud_str

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
        .include "raster.asm"
        .include "terrain.asm"
        .include "sprite.asm"
        .include "world.asm"
        .include "player.asm"
        .include "hud.asm"
        .include "sound.asm"

        .segment "BSS"
sprbuf:   .res 512
old_irq:  .res 2
vbl:      .res 1
joy0:     .res 1
joy1:     .res 1
joy0p:    .res 1
joy1p:    .res 1
band:     .res 1

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
cloud_t:  .res 1
msg_t:    .res 1
msg_clr:  .res 1

ply_alt:  .res 1
ply_row:  .res 1
ply_roll: .res 1
ply_heat: .res 1
ply_over: .res 1
ply_gunt: .res 1
ply_bombt:.res 1
ply_inv:  .res 1
ply_land: .res 1

tcol:     .res 1
tcol_wu:  .res 2
trow:     .res 1
trow_wv:  .res 2
mrow:     .res 1

obj_k:    .res MAXOBJ
obj_u:    .res MAXOBJ
obj_uh:   .res MAXOBJ
obj_v:    .res MAXOBJ
obj_vh:   .res MAXOBJ
obj_hp:   .res MAXOBJ
obj_t:    .res MAXOBJ

air_k:    .res MAXAIR
air_kind: .res MAXAIR
air_u:    .res MAXAIR
air_uh:   .res MAXAIR
air_v:    .res MAXAIR
air_vh:   .res MAXAIR
air_alt:  .res MAXAIR
air_hp:   .res MAXAIR
air_tm:   .res MAXAIR

sh_a:     .res MAXSHOT
sh_x:     .res MAXSHOT
sh_y:     .res MAXSHOT
sh_life:  .res MAXSHOT

bm_a:     .res MAXBOMB
bm_x:     .res MAXBOMB
bm_alt:   .res MAXBOMB
bm_vy:    .res MAXBOMB
bm_g:     .res MAXBOMB

fl_a:     .res MAXFLAK
fl_x:     .res MAXFLAK
fl_xh:    .res MAXFLAK
fl_y:     .res MAXFLAK
fl_vx:    .res MAXFLAK
fl_vy:    .res MAXFLAK
fl_life:  .res MAXFLAK

fx_a:     .res MAXFX
fx_x:     .res MAXFX
fx_xh:    .res MAXFX
fx_y:     .res MAXFX
fx_f:     .res MAXFX

cl_a:     .res MAXCLOUD
cl_x:     .res MAXCLOUD
cl_xh:    .res MAXCLOUD
cl_y:     .res MAXCLOUD
cl_img:   .res MAXCLOUD

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
