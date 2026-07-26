; ---------------------------------------------------------------------------
; player.asm -- the aeroplane.
;
; It holds a fixed spot on screen and the world moves instead. Steering slides
; it sideways; climb and dive change `ply_alt`, which lifts the sprite off its
; shadow. The gap between aeroplane and shadow is the altitude readout, just as
; it was in 1983.
; ---------------------------------------------------------------------------

CLIMB_RATE = 1
DIVE_RATE  = 2
STEER_RATE = 2
GUN_COOL   = 6                          ; frames between rounds
GUN_HEAT   = 8                          ; heat added per round
GUN_MAX    = 240
BOMB_COOL  = 18
FUEL_DRAIN = 1                          ; per FUEL_TICK frames
FUEL_TICK  = 26
FUEL_MAX   = 200

player_reset:
        lda #<160
        sta ply_x
        lda #>160
        sta ply_x+1
        lda #40
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

; ---------------------------------------------------------------------------
; player_update
; ---------------------------------------------------------------------------
player_update:
        lda ply_inv
        beq :+
        dec ply_inv
:
        ; --- steering -----------------------------------------------------
        stz ply_roll
        lda joy0
        and #JOY_LEFT
        bne @noleft
        lda ply_x
        sec
        sbc #STEER_RATE
        sta ply_x
        lda ply_x+1
        sbc #0
        sta ply_x+1
        ; clamp to PLY_XMIN
        lda ply_x
        cmp #<PLY_XMIN
        lda ply_x+1
        sbc #>PLY_XMIN
        bpl :+
        lda #<PLY_XMIN
        sta ply_x
        lda #>PLY_XMIN
        sta ply_x+1
:       lda #<-1
        sta ply_roll
@noleft:
        lda joy0
        and #JOY_RIGHT
        bne @noright
        lda ply_x
        clc
        adc #STEER_RATE
        sta ply_x
        lda ply_x+1
        adc #0
        sta ply_x+1
        ; clamp to PLY_XMAX
        lda #<PLY_XMAX
        cmp ply_x
        lda #>PLY_XMAX
        sbc ply_x+1
        bpl :+
        lda #<PLY_XMAX
        sta ply_x
        lda #>PLY_XMAX
        sta ply_x+1
:       lda #1
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
        beq @noup                       ; a dry tank will only go down
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
        ; out of fuel: a forced glide down
        lda fuel
        bne @fuelok
        lda frame
        and #3
        bne @fuelok
        lda ply_alt
        beq @fuelok
        dec ply_alt
@fuelok:

        ; --- guns ----------------------------------------------------------
        lda ply_heat
        beq :+
        dec ply_heat                    ; always cooling
:       lda ply_over
        beq @canfire
        lda ply_heat
        cmp #GUN_MAX/2
        bcs @nofire                     ; locked out until half cool
        stz ply_over
@canfire:
        lda ply_gunt
        beq :+
        dec ply_gunt
        bra @nofire
:       lda joy1
        and #JOY_B                      ; Z key / SNES B
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

        ; --- bombs ---------------------------------------------------------
        lda ply_bombt
        beq :+
        dec ply_bombt
        bra @nobomb
:       lda joy1
        and #JOY_A                      ; X key / SNES A
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

        ; --- fuel ----------------------------------------------------------
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
        ; --- rolling out on a runway: refuel and rearm ---------------------
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
:       ; still on the strip? if not, or once topped up, take off again
        jsr on_runway
        bcc @takeoff
        lda fuel
        cmp #FUEL_MAX
        bcc @stay
@takeoff:
        stz ply_land
        lda #SPD_FLY
        sta spd
        lda #4
        sta ply_alt
        rts
@stay:  rts

@ground:
        ; --- touching down / hitting the deck -------------------------------
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
        sta spd                         ; the world slows for the rollout
        stz ply_alt
        rts
@crash: lda ply_inv
        bne @flying
        jmp player_hit
@flying:
        jsr player_vs_solid
        rts

; ---------------------------------------------------------------------------
; player_vs_solid -- flying into a building is as fatal as being shot down.
; ---------------------------------------------------------------------------
player_vs_solid:
        lda ply_inv
        bne @no
        ldx #MAXOBJ-1
@lp:    lda obj_k,x
        beq @next
        tay
        lda k_hgt,y
        beq @next                       ; nothing to hit
        cmp ply_alt
        bcc @next                       ; we are above it
        lda obj_xl,x
        sec
        sbc ply_x
        jsr abs8
        cmp #12
        bcs @next
        lda obj_yl,x
        sec
        sbc #PLY_Y
        jsr abs8
        cmp #12
        bcs @next
        jmp player_hit
@next:  dex
        bpl @lp
@no:    rts

; ---------------------------------------------------------------------------
; player_hit -- lose the aeroplane.
; ---------------------------------------------------------------------------
player_hit:
        lda ply_inv
        bne @out
        lda msg_t                       ; don't stamp on "OUT OF FUEL"
        bne :+
        lda #<s_downed
        ldx #>s_downed
        jsr hud_msg
:       lda ply_x
        sta ex
        lda ply_x+1
        sta ex+1
        lda #PLY_Y
        sec
        sbc ply_alt
        sta ey
        lda #0
        sbc #0
        sta ey+1
        jsr fx_spawn
        jsr sfx_boom
        lda #ST_DEAD
        sta game_state
        lda #100
        sta state_t
@out:   rts

; ---------------------------------------------------------------------------
; player_draw -- shadow on the deck, aeroplane lifted by its altitude.
; ---------------------------------------------------------------------------
player_draw:
        lda ply_x
        sta px
        lda ply_x+1
        sta px+1
        lda #PLY_Y
        sta py
        stz py+1
        lda #I_SHADOW
        sta pimg
        lda #Z_GROUND
        sta pz
        lda #SL_SHADOW
        jsr spr_put

        ; blink while invulnerable so the respawn reads clearly
        lda ply_inv
        beq @show
        and #4
        beq @show
        lda #SL_PLAYER
        jmp spr_hide
@show:
        lda ply_x
        sta px
        lda ply_x+1
        sta px+1
        lda #PLY_Y
        sec
        sbc ply_alt
        sta py
        lda #0
        sbc #0
        sta py+1
        lda ply_roll
        clc
        adc #I_PLANE_C                  ; -1/0/+1 picks bank-left/level/right
        sta pimg
        lda #Z_AIR
        sta pz
        lda #SL_PLAYER
        jmp spr_put
