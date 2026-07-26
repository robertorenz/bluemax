; ---------------------------------------------------------------------------
; player.asm -- the aeroplane, seen from behind.
;
; It holds the centre of the screen; steering slides the world sideways via
; camu instead of moving the sprite. Altitude lifts the aeroplane off its
; shadow, and the gap between the two is the altitude readout.
; ---------------------------------------------------------------------------

PLY_X      = 160                        ; fixed screen column
PLY_GROUND = 198                        ; screen row the shadow runs along
ALT_MAX    = 64
CLIMB_RATE = 1
DIVE_RATE  = 2
STEER_RATE = 3
GUN_COOL   = 6
GUN_HEAT   = 8
GUN_MAX    = 240
BOMB_COOL  = 18
FUEL_TICK  = 26
FUEL_MAX   = 200

player_reset:
        lda #34
        sta ply_alt
        stz ply_heat
        stz ply_over
        stz ply_gunt
        stz ply_bombt
        stz ply_roll
        lda #FUEL_MAX
        sta fuel
        stz fuel_t
        lda #30
        sta bombs
        lda #90
        sta ply_inv
        stz ply_land
        rts

player_update:
        lda ply_inv
        beq :+
        dec ply_inv
:
        ; --- steering slides the world -----------------------------------
        stz ply_roll
        lda joy0
        and #JOY_LEFT
        bne @noleft
        lda camu
        sec
        sbc #STEER_RATE
        sta camu
        lda camu+1
        sbc #0
        sta camu+1
        lda #<-1
        sta ply_roll
@noleft:
        lda joy0
        and #JOY_RIGHT
        bne @noright
        lda camu
        clc
        adc #STEER_RATE
        sta camu
        lda camu+1
        adc #0
        sta camu+1
        lda #1
        sta ply_roll
@noright:

        ; --- climb and dive ------------------------------------------------
        lda ply_land
        beq :+
        jmp @grounded
:       lda joy0
        and #JOY_UP
        bne @noup
        lda fuel
        beq @noup
        lda ply_alt
        clc
        adc #CLIMB_RATE
        cmp #ALT_MAX
        bcc :+
        lda #ALT_MAX
:       sta ply_alt
@noup:
        lda joy0
        and #JOY_DOWN
        bne @nodown
        lda ply_alt
        sec
        sbc #DIVE_RATE
        bcs :+
        lda #0
:       sta ply_alt
@nodown:
        lda fuel                        ; a dry tank only goes down
        bne @fuelok
        lda frame
        and #3
        bne @fuelok
        lda ply_alt
        beq @fuelok
        dec ply_alt
@fuelok:

        ; --- guns -----------------------------------------------------------
        lda ply_heat
        beq :+
        dec ply_heat
:       lda ply_over
        beq @canfire
        lda ply_heat
        cmp #GUN_MAX/2
        bcs @nofire
        stz ply_over
@canfire:
        lda ply_gunt
        beq :+
        dec ply_gunt
        bra @nofire
:       lda joy1
        and #JOY_B
        bne @nofire
        lda #GUN_COOL
        sta ply_gunt
        lda ply_heat
        clc
        adc #GUN_HEAT
        bcc :+
        lda #GUN_MAX
:       cmp #GUN_MAX
        bcc :+
        lda #GUN_MAX
        sta ply_over
:       sta ply_heat
        jsr shot_fire
        jsr sfx_gun
@nofire:

        ; --- bombs ----------------------------------------------------------
        lda ply_bombt
        beq :+
        dec ply_bombt
        bra @nobomb
:       lda joy1
        and #JOY_A
        bne @nobomb
        lda bombs
        beq @nobomb
        lda ply_alt
        cmp #6
        bcc @nobomb
        dec bombs
        lda #BOMB_COOL
        sta ply_bombt
        jsr bomb_fire
@nobomb:

        ; --- fuel -----------------------------------------------------------
        inc fuel_t
        lda fuel_t
        cmp #FUEL_TICK
        bcc @fuelend
        stz fuel_t
        lda fuel
        beq @fuelend
        dec fuel
@fuelend:
        jmp @ground

@grounded:
        lda frame
        and #3
        bne :+
        lda fuel
        cmp #FUEL_MAX
        bcs :+
        inc fuel
:       lda frame
        and #15
        bne :+
        lda bombs
        cmp #30
        bcs :+
        inc bombs
:       jsr on_runway
        bcc @takeoff
        lda fuel
        cmp #FUEL_MAX
        bcc @stay
@takeoff:
        stz ply_land
        lda #SPD_FLY
        sta spd
        lda #6
        sta ply_alt
@stay:  rts

@ground:
        lda ply_alt
        cmp #4
        bcs @flying
        jsr on_runway
        bcc @crash
        lda ply_land
        bne :+
        lda #<s_land
        ldx #>s_land
        jsr hud_msg
:       lda #1
        sta ply_land
        lda #SPD_ROLL
        sta spd
        stz ply_alt
        rts
@crash: lda ply_inv
        bne @flying
        jmp player_hit
@flying:
        rts

; ---------------------------------------------------------------------------
; on_runway -- is the ground under the aeroplane a runway strip?
; The aeroplane sits at screen centre, so the world tile below it is the
; camera plus a fixed forward offset.
; ---------------------------------------------------------------------------
PLY_DEPTH = 26                          ; world depth the shadow sits at

on_runway:
        lda camu
        clc
        adc #<160
        sta tmpa
        lda camu+1
        adc #>160
        sta tmpa+1
        ldx #4
:       lsr tmpa+1
        ror tmpa
        dex
        bne :-
        lda tmpa
        sta twu
        lda tmpa+1
        sta twu+1

        lda camv
        clc
        adc #<PLY_DEPTH
        sta tmpa
        lda camv+1
        adc #>PLY_DEPTH
        sta tmpa+1
        ldx #4
:       lsr tmpa+1
        ror tmpa
        dex
        bne :-
        lda tmpa
        sta twv
        lda tmpa+1
        sta twv+1

        jsr tile_at
        cmp #T_RUNWAY
        beq @yes
        cmp #T_RUNWAYS
        beq @yes
        clc
        rts
@yes:   sec
        rts

; ---------------------------------------------------------------------------
player_hit:
        lda ply_inv
        bne @out
        lda msg_t
        bne :+
        lda #<s_downed
        ldx #>s_downed
        jsr hud_msg
:       lda #PLY_X
        sta ex
        stz ex+1
        lda ply_row
        sta ey
        stz ey+1
        jsr fx_spawn
        jsr sfx_boom
        lda #ST_DEAD
        sta game_state
        lda #100
        sta state_t
@out:   rts

; ---------------------------------------------------------------------------
; player_draw -- shadow on the ground, aeroplane lifted by its altitude
; ---------------------------------------------------------------------------
player_draw:
        lda #PLY_GROUND
        sec
        sbc ply_alt
        sta ply_row

        lda #PLY_X
        sta px
        stz px+1
        lda #PLY_GROUND
        sta py
        stz py+1
        lda #I_SHADOW
        sta pimg
        lda #Z_AIR
        sta pz
        lda #SL_SHADOW
        jsr spr_put

        lda ply_inv                     ; blink while invulnerable
        beq @show
        and #4
        beq @show
        lda #SL_PLAYER
        jmp spr_hide
@show:
        lda #PLY_X
        sta px
        stz px+1
        lda ply_row
        sta py
        stz py+1
        lda ply_roll
        clc
        adc #I_PLANE_C
        sta pimg
        lda #Z_AIR
        sta pz
        lda #SL_PLAYER
        jsr spr_put
        rts
