; ---------------------------------------------------------------------------
; world.asm -- everything that lives in the world: ground targets, enemy
; aircraft, bullets, bombs, flak and explosions.
;
; Coordinates are screen pixels, 16-bit signed, because entities only live for
; a few seconds. Anything anchored to the ground is drifted by `spd` every
; frame in step with the tilemap scroll, so it stays welded to the landscape
; without any world-coordinate bookkeeping.
; ---------------------------------------------------------------------------

; --- ground target kinds ---------------------------------------------------
K_FREE    = 0
K_BLDG    = 1
K_FACTORY = 2
K_AAGUN   = 3
K_DEPOT   = 4
K_TRUCK   = 5
K_TANK    = 6
K_BRIDGE  = 7
K_HANGAR  = 8
K_BALLOON = 9
K_WRECK   = 10
K_COUNT   = 11

; ---------------------------------------------------------------------------
; Per-kind property tables
; ---------------------------------------------------------------------------
k_img:    .byte 0, I_BLDG, I_FACTORY, I_AAGUN, I_DEPOT, I_TRUCK, I_TANK
          .byte I_BRIDGE, I_HANGAR, I_BALLOON, I_BLDG_HIT
k_wreck:  .byte 0, I_BLDG_HIT, I_FACTORY_HIT, I_AAGUN_HIT, I_BLDG_HIT
          .byte I_BLDG_HIT, I_AAGUN_HIT, I_BLDG_HIT, I_BLDG_HIT, I_BLDG_HIT
          .byte I_BLDG_HIT
k_hp:     .byte 0, 1, 2, 1, 1, 1, 2, 2, 2, 3, 0
k_rad:    .byte 0, 14, 16, 9, 10, 9, 9, 16, 16, 12, 0
k_hgt:    .byte 0, 26, 26, 12, 12, 10, 10, 14, 22, 0, 0   ; 0 = safe to overfly
k_slo:    .byte 0, $50, $25, $75, $00, $60, $00, $50, $00, $50, $00
k_shi:    .byte 0, $00, $01, $00, $01, $00, $01, $01, $01, $02, $00
; how often each kind turns up (cumulative thresholds over a random byte)
k_spawn:  .byte K_BLDG, K_BLDG, K_BLDG, K_AAGUN, K_AAGUN, K_TRUCK, K_TANK
          .byte K_FACTORY, K_DEPOT, K_BLDG, K_AAGUN, K_HANGAR, K_BRIDGE
          .byte K_BALLOON, K_TRUCK, K_BLDG
K_SPAWN_N = 16

; --- enemy aircraft --------------------------------------------------------
a_img:    .byte I_FOE_BI, I_FOE_MONO, I_FOE_TRI
a_hp:     .byte 2, 1, 3
a_slo:    .byte $00, $20, $50
a_shi:    .byte $01, $01, $01

; ===========================================================================
; world_reset
; ===========================================================================
world_reset:
        ldx #MAXOBJ-1
:       stz obj_k,x
        dex
        bpl :-
        ldx #MAXAIR-1
:       stz air_k,x
        dex
        bpl :-
        ldx #MAXSHOT-1
:       stz sh_a,x
        dex
        bpl :-
        ldx #MAXBOMB-1
:       stz bm_a,x
        dex
        bpl :-
        ldx #MAXFLAK-1
:       stz fl_a,x
        dex
        bpl :-
        ldx #MAXFX-1
:       stz fx_a,x
        dex
        bpl :-
        stz spawn_t
        stz airspawn_t
        rts

; ===========================================================================
; Spawning
; ===========================================================================
; Entities arrive on the two edges the landscape flows in from: the top and
; the right.
spawn_pos:
        jsr rand
        and #1
        bne @right
        jsr rand                        ; along the top edge
        sta ex
        stz ex+1
        lda ex
        cmp #200
        bcc :+
        lda #200
        sta ex
:       asl ex                          ; 0..398
        rol ex+1
        lda #<-40
        sta ey
        lda #>-40
        sta ey+1
        rts
@right: lda #<380                       ; down the right edge
        sta ex
        lda #>380
        sta ex+1
        jsr rand
        sta ey
        stz ey+1
        lda ey
        cmp #140
        bcc :+
        sec
        sbc #140
        sta ey
:       lda ey
        sec
        sbc #40
        sta ey
        lda ey+1
        sbc #0
        sta ey+1
        rts

; ---------------------------------------------------------------------------
; obj_spawn -- add one ground target, if a slot is free.
; ---------------------------------------------------------------------------
obj_spawn:
        ldx #MAXOBJ-1
@find:  lda obj_k,x
        beq @got
        dex
        bpl @find
        rts
@got:   phx
        jsr spawn_pos
        plx
        lda ex
        sta obj_xl,x
        lda ex+1
        sta obj_xh,x
        lda ey
        sta obj_yl,x
        lda ey+1
        sta obj_yh,x
        phx
        jsr rand
        and #(K_SPAWN_N-1)
        tay
        lda k_spawn,y
        plx
        sta obj_k,x
        tay
        lda k_hp,y
        sta obj_hp,x
        lda k_img,y
        sta obj_img,x
        phx
        jsr rand
        and #63
        plx
        sta obj_t,x
        rts

; ---------------------------------------------------------------------------
; air_spawn -- add one enemy aircraft.
; ---------------------------------------------------------------------------
air_spawn:
        ldx #MAXAIR-1
@find:  lda air_k,x
        beq @got
        dex
        bpl @find
        rts
@got:   phx
        jsr spawn_pos
        plx
        lda ex
        sta air_xl,x
        lda ex+1
        sta air_xh,x
        lda ey
        sta air_yl,x
        lda ey+1
        sta air_yh,x
        phx
        jsr rand
        plx
        and #3
        cmp #3
        bne :+
        lda #0
:       sta air_kind,x
        tay
        iny
        tya
        sta air_k,x                     ; 1..3, 0 means free
        dey
        lda a_hp,y
        sta air_hp,x
        lda a_img,y
        sta air_img,x
        ; Come in near the player's height so a dogfight is actually possible.
        phx
        jsr rand
        and #31
        sec
        sbc #16
        clc
        adc ply_alt
        plx
        bpl :+
        lda #0
:       cmp #ALT_MAX
        bcc :+
        lda #ALT_MAX-1
:       sta air_alt,x
        lda #40
        sta air_tm,x
        rts

; ===========================================================================
; Ground targets: drift, fire, draw
; ===========================================================================
obj_update:
        ldx #MAXOBJ-1
@lp:    lda obj_k,x
        bne :+
        jmp @next
:
        ; drift with the landscape
        lda obj_xl,x
        sec
        sbc spd
        sta obj_xl,x
        lda obj_xh,x
        sbc #0
        sta obj_xh,x
        lda obj_yl,x
        clc
        adc spd
        sta obj_yl,x
        lda obj_yh,x
        adc #0
        sta obj_yh,x

        ; retire once it has left through the bottom or the left
        lda obj_yh,x
        bmi @alive
        lda obj_yl,x
        cmp #<300
        lda obj_yh,x
        sbc #>300
        bcs @kill
        lda obj_xh,x
        bpl @alive
        lda obj_xl,x
        cmp #<-60
        bcs @alive
@kill:  stz obj_k,x
        txa
        clc
        adc #SL_OBJ
        jsr spr_hide
        bra @next
@alive:
        ; --- AA guns and tanks shoot back --------------------------------
        lda obj_k,x
        cmp #K_AAGUN
        beq @gun
        cmp #K_TANK
        bne @draw
@gun:   lda game_state
        cmp #ST_PLAY
        bne @draw
        dec obj_t,x
        lda obj_t,x
        bne @draw
        jsr rand
        and #63
        clc
        adc #70
        sta obj_t,x
        phx
        jsr flak_fire
        plx

@draw:  ; --- render -------------------------------------------------------
        lda obj_xl,x
        sta px
        lda obj_xh,x
        sta px+1
        lda obj_yl,x
        sta py
        lda obj_yh,x
        sta py+1
        lda obj_img,x
        sta pimg
        lda #Z_GROUND
        sta pz
        txa
        clc
        adc #SL_OBJ
        jsr spr_put
@next:  dex
        bmi @done
        jmp @lp
@done:  rts

; ---------------------------------------------------------------------------
; flak_fire -- object .X launches a shell at the player.
; ---------------------------------------------------------------------------
flak_fire:
        ldy #MAXFLAK-1
@find:  lda fl_a,y
        beq @got
        dey
        bpl @find
        rts
@got:   lda #1
        sta fl_a,y
        lda obj_xl,x
        sta fl_xl,y
        lda obj_xh,x
        sta fl_xh,y
        lda obj_yl,x
        sta fl_yl,y
        lda obj_yh,x
        sta fl_yh,y
        lda #0
        sta fl_alt,y
        lda #90
        sta fl_life,y
        ; aim: one pixel per frame toward where the player is right now
        lda ply_x
        sec
        sbc obj_xl,x
        lda #1
        bcs :+
        lda #<-1
:       sta fl_vx,y
        lda #PLY_Y
        sec
        sbc obj_yl,x
        lda #1
        bcs :+
        lda #<-1
:       sta fl_vy,y
        lda #4
        sta fl_valt,y
        jsr sfx_flak
        rts

; ===========================================================================
; Enemy aircraft
; ===========================================================================
air_update:
        ldx #MAXAIR-1
@lp:    lda air_k,x
        bne :+
        jmp @next
:
        ; steer one pixel per frame toward the player's screen position
        lda air_xl,x
        cmp ply_x
        lda air_xh,x
        sbc ply_x+1
        bmi @xr
        lda air_xl,x
        sec
        sbc #2
        sta air_xl,x
        lda air_xh,x
        sbc #0
        sta air_xh,x
        bra @ydir
@xr:    lda air_xl,x
        clc
        adc #1
        sta air_xl,x
        lda air_xh,x
        adc #0
        sta air_xh,x
@ydir:  lda air_yl,x
        cmp #PLY_Y
        lda air_yh,x
        sbc #0
        bmi @yd
        lda air_yl,x
        sec
        sbc #1
        sta air_yl,x
        lda air_yh,x
        sbc #0
        sta air_yh,x
        bra @alt
@yd:    lda air_yl,x
        clc
        adc #2
        sta air_yl,x
        lda air_yh,x
        adc #0
        sta air_yh,x
@alt:   ; ease toward the player's altitude
        lda frame
        and #3
        bne @off
        lda air_alt,x
        cmp ply_alt
        beq @off
        bcs :+
        inc air_alt,x
        bra @off
:       dec air_alt,x

@off:   ; retire when it wanders well clear
        lda air_yl,x
        cmp #<300
        lda air_yh,x
        sbc #>300
        bcs @kill
        lda air_xh,x
        bpl @fire
        lda air_xl,x
        cmp #<-70
        bcs @fire
@kill:  stz air_k,x
        txa
        clc
        adc #SL_AIR
        jsr spr_hide
        bra @next

@fire:  lda game_state
        cmp #ST_PLAY
        bne @draw
        dec air_tm,x
        lda air_tm,x
        bne @draw
        jsr rand
        and #31
        clc
        adc #60
        sta air_tm,x
        phx
        jsr tracer_fire
        plx

@draw:  lda air_xl,x
        sta px
        lda air_xh,x
        sta px+1
        lda air_yl,x
        sec
        sbc air_alt,x                   ; altitude lifts it up the screen
        sta py
        lda air_yh,x
        sbc #0
        sta py+1
        lda air_img,x
        sta pimg
        lda #Z_AIR
        sta pz
        txa
        clc
        adc #SL_AIR
        jsr spr_put
@next:  dex
        bmi :+
        jmp @lp
:       rts

; ---------------------------------------------------------------------------
; tracer_fire -- enemy .X shoots at the player (reuses the flak array).
; ---------------------------------------------------------------------------
tracer_fire:
        ldy #MAXFLAK-1
@find:  lda fl_a,y
        beq @got
        dey
        bpl @find
        rts
@got:   lda #1
        sta fl_a,y
        lda air_xl,x
        sta fl_xl,y
        lda air_xh,x
        sta fl_xh,y
        lda air_yl,x
        sta fl_yl,y
        lda air_yh,x
        sta fl_yh,y
        lda air_alt,x
        sta fl_alt,y
        lda #70
        sta fl_life,y
        lda ply_x
        sec
        sbc air_xl,x
        lda #2
        bcs :+
        lda #<-2
:       sta fl_vx,y
        lda #PLY_Y
        sec
        sbc air_yl,x
        lda #2
        bcs :+
        lda #<-2
:       sta fl_vy,y
        lda #0
        sta fl_valt,y                   ; already at height
        rts

; ===========================================================================
; Flak / tracers
; ===========================================================================
flak_update:
        ldx #MAXFLAK-1
@lp:    lda fl_a,x
        bne :+
        jmp @next
:       ; own velocity
        lda fl_xl,x
        clc
        adc fl_vx,x
        sta fl_xl,x
        lda fl_vx,x
        bpl :+
        lda #$FF
        bra :++
:       lda #0
:       adc fl_xh,x
        sta fl_xh,x

        lda fl_yl,x
        clc
        adc fl_vy,x
        sta fl_yl,x
        lda fl_vy,x
        bpl :+
        lda #$FF
        bra :++
:       lda #0
:       adc fl_yh,x
        sta fl_yh,x

        ; climb, then level off
        lda frame
        and #1
        bne :+
        lda fl_alt,x
        clc
        adc fl_valt,x
        cmp #ALT_MAX+16
        bcc :+
        lda #ALT_MAX+16
:       sta fl_alt,x

        dec fl_life,x
        bne @hit
        stz fl_a,x
        txa
        clc
        adc #SL_FLAK
        jsr spr_hide
        bra @next

@hit:   ; --- does it have the player? -------------------------------------
        lda game_state
        cmp #ST_PLAY
        bne @draw
        lda ply_inv
        bne @draw
        lda fl_xl,x
        sec
        sbc ply_x
        jsr abs8
        cmp #10
        bcs @draw
        lda fl_yl,x
        sec
        sbc #PLY_Y
        jsr abs8
        cmp #10
        bcs @draw
        lda fl_alt,x
        sec
        sbc ply_alt
        jsr abs8
        cmp #12
        bcs @draw
        stz fl_a,x
        txa
        clc
        adc #SL_FLAK
        jsr spr_hide
        jsr player_hit
        bra @next

@draw:  lda fl_xl,x
        sta px
        lda fl_xh,x
        sta px+1
        lda fl_yl,x
        sec
        sbc fl_alt,x
        sta py
        lda fl_yh,x
        sbc #0
        sta py+1
        lda #I_FLAK
        sta pimg
        lda #Z_AIR
        sta pz
        txa
        clc
        adc #SL_FLAK
        jsr spr_put
@next:  dex
        bmi :+
        jmp @lp
:       rts

; ===========================================================================
; Player bullets
; ===========================================================================
shot_fire:
        ldx #MAXSHOT-1
@find:  lda sh_a,x
        beq @got
        dex
        bpl @find
        rts
@got:   lda #1
        sta sh_a,x
        lda ply_x
        sta sh_xl,x
        lda ply_x+1
        sta sh_xh,x
        lda #PLY_Y-6
        sta sh_yl,x
        stz sh_yh,x
        lda ply_alt
        sta sh_alt,x
        lda #26
        sta sh_life,x
        rts

shot_update:
        ldx #MAXSHOT-1
@lp:    lda sh_a,x
        bne :+
        jmp @next
:       ; race ahead of the aeroplane, up and to the right
        lda sh_xl,x
        clc
        adc #5
        sta sh_xl,x
        lda sh_xh,x
        adc #0
        sta sh_xh,x
        lda sh_yl,x
        sec
        sbc #5
        sta sh_yl,x
        lda sh_yh,x
        sbc #0
        sta sh_yh,x

        dec sh_life,x
        bne @chk
        stz sh_a,x
        txa
        clc
        adc #SL_SHOT
        jsr spr_hide
        bra @next

@chk:   jsr shot_vs_air
        lda sh_a,x
        beq @next
        jsr shot_vs_ground
        lda sh_a,x
        beq @next

        lda sh_xl,x
        sta px
        lda sh_xh,x
        sta px+1
        lda sh_yl,x
        sec
        sbc sh_alt,x
        sta py
        lda sh_yh,x
        sbc #0
        sta py+1
        lda #I_BULLET
        sta pimg
        lda #Z_AIR
        sta pz
        txa
        clc
        adc #SL_SHOT
        jsr spr_put
@next:  dex
        bmi :+
        jmp @lp
:       rts

; ---------------------------------------------------------------------------
; shot_vs_air -- bullet .X against every enemy aircraft.
; ---------------------------------------------------------------------------
shot_vs_air:
        ldy #MAXAIR-1
@lp:    lda air_k,y
        beq @next
        lda sh_alt,x
        sec
        sbc air_alt,y
        jsr abs8
        cmp #14                         ; only what you are level with
        bcs @next
        lda sh_xl,x
        sec
        sbc air_xl,y
        jsr abs8
        cmp #14
        bcs @next
        lda sh_yl,x
        sec
        sbc air_yl,y
        jsr abs8
        cmp #14
        bcs @next

        stz sh_a,x
        txa
        clc
        adc #SL_SHOT
        jsr spr_hide
        lda air_hp,y
        dec
        sta air_hp,y
        bne @spark
        ; downed
        lda air_xl,y
        sta ex
        lda air_xh,y
        sta ex+1
        lda air_yl,y
        sec
        sbc air_alt,y
        sta ey
        lda air_yh,y
        sbc #0
        sta ey+1
        phy
        jsr fx_spawn
        jsr sfx_boom
        ply
        lda air_kind,y
        tax
        lda a_shi,x
        pha
        lda a_slo,x
        plx                             ; .X = BCD high byte
        phy
        jsr add_score
        ply
        lda #0
        sta air_k,y
        tya
        clc
        adc #SL_AIR
        jsr spr_hide
        rts
@spark: rts
@next:  dey
        bmi @done
        jmp @lp
@done:  rts

; ---------------------------------------------------------------------------
; shot_vs_ground -- strafing only bites from low altitude.
; ---------------------------------------------------------------------------
shot_vs_ground:
        lda sh_alt,x
        cmp #26
        bcs @no
        ldy #MAXOBJ-1
@lp:    lda obj_k,y
        beq @next
        cmp #K_WRECK
        beq @next
        lda sh_xl,x
        sec
        sbc obj_xl,y
        jsr abs8
        cmp #12
        bcs @next
        lda sh_yl,x
        sec
        sbc obj_yl,y
        jsr abs8
        cmp #12
        bcs @next
        stz sh_a,x
        phx
        txa
        clc
        adc #SL_SHOT
        jsr spr_hide
        tya
        tax
        jsr obj_damage
        plx
        rts
@next:  dey
        bpl @lp
@no:    rts

; ===========================================================================
; Bombs
; ===========================================================================
; A bomb keeps the aeroplane's velocity, so it holds its screen position while
; it falls and the landscape slides underneath. Drop height therefore decides
; how far ahead it lands -- lead the target, exactly like the original.
bomb_fire:
        ldx #MAXBOMB-1
@find:  lda bm_a,x
        beq @got
        dex
        bpl @find
        rts
@got:   lda #1
        sta bm_a,x
        lda ply_x
        sta bm_xl,x
        lda ply_x+1
        sta bm_xh,x
        lda #PLY_Y
        sta bm_yl,x
        stz bm_yh,x
        lda ply_alt
        sta bm_alt,x
        lda #1
        sta bm_vy,x
        stz bm_g,x
        jsr sfx_whistle
        rts

bomb_update:
        ldx #MAXBOMB-1
@lp:    lda bm_a,x
        bne :+
        jmp @next
:       inc bm_g,x                      ; gravity ramp
        lda bm_g,x
        and #7
        bne @fall
        lda bm_vy,x
        cmp #6
        bcs @fall
        inc bm_vy,x
@fall:  lda bm_alt,x
        sec
        sbc bm_vy,x
        bcc @land
        sta bm_alt,x
        bne @draw
@land:  ; --- impact -------------------------------------------------------
        stz bm_a,x
        lda bm_xl,x
        sta ex
        lda bm_xh,x
        sta ex+1
        lda bm_yl,x
        sta ey
        lda bm_yh,x
        sta ey+1
        phx
        jsr fx_spawn
        jsr sfx_boom
        jsr bomb_vs_ground
        plx
        txa
        clc
        adc #SL_BOMB
        jsr spr_hide
        txa
        clc
        adc #SL_BSHAD
        jsr spr_hide
        bra @next

@draw:  ; shadow on the ground, bomb lifted by its remaining altitude
        lda bm_xl,x
        sta px
        lda bm_xh,x
        sta px+1
        lda bm_yl,x
        sta py
        lda bm_yh,x
        sta py+1
        lda #I_FLAK
        sta pimg
        lda #Z_GROUND
        sta pz
        txa
        clc
        adc #SL_BSHAD
        jsr spr_put

        lda bm_xl,x
        sta px
        lda bm_xh,x
        sta px+1
        lda bm_yl,x
        sec
        sbc bm_alt,x
        sta py
        lda bm_yh,x
        sbc #0
        sta py+1
        lda #I_BOMB
        sta pimg
        lda #Z_AIR
        sta pz
        txa
        clc
        adc #SL_BOMB
        jsr spr_put
@next:  dex
        bmi :+
        jmp @lp
:       rts

; ---------------------------------------------------------------------------
; bomb_vs_ground -- blast at (ex, ey) against every target.
; ---------------------------------------------------------------------------
bomb_vs_ground:
        ldx #MAXOBJ-1
@lp:    lda obj_k,x
        beq @next
        cmp #K_WRECK
        beq @next
        cmp #K_BALLOON
        beq @next                       ; airborne, bombs miss it
        tay
        lda ex
        sec
        sbc obj_xl,x
        jsr abs8
        cmp k_rad,y
        bcs @next
        lda ey
        sec
        sbc obj_yl,x
        jsr abs8
        cmp k_rad,y
        bcs @next
        phx
        jsr obj_damage
        plx
@next:  dex
        bpl @lp
        rts

; ---------------------------------------------------------------------------
; obj_damage -- one hit on target .X; scores and wrecks it when it gives out.
; ---------------------------------------------------------------------------
obj_damage:
        lda obj_hp,x
        beq @dead
        dec obj_hp,x
        bne @done
@dead:  phx                             ; .X is the target index throughout
        ldy obj_k,x
        lda k_shi,y
        pha
        lda k_slo,y
        plx                             ; .X = BCD high byte
        jsr add_score
        plx
        ldy obj_k,x
        lda k_wreck,y
        sta obj_img,x
        lda #K_WRECK
        sta obj_k,x
        inc kills
        lda obj_xl,x
        sta ex
        lda obj_xh,x
        sta ex+1
        lda obj_yl,x
        sta ey
        lda obj_yh,x
        sta ey+1
        jmp fx_spawn
@done:  rts

; ===========================================================================
; Explosions
; ===========================================================================
; Preserves .X/.Y -- it is raised from inside collision loops that are indexing
; with them.
fx_spawn:
        phx
        phy
        jsr fx_spawn_i
        ply
        plx
        rts

fx_spawn_i:
        ldx #MAXFX-1
@find:  lda fx_a,x
        beq @got
        dex
        bpl @find
        rts
@got:   lda #1
        sta fx_a,x
        lda ex
        sta fx_xl,x
        lda ex+1
        sta fx_xh,x
        lda ey
        sta fx_yl,x
        lda ey+1
        sta fx_yh,x
        stz fx_f,x
        rts

fx_update:
        ldx #MAXFX-1
@lp:    lda fx_a,x
        beq @next
        ; drift with the landscape it is burning on
        lda fx_xl,x
        sec
        sbc spd
        sta fx_xl,x
        lda fx_xh,x
        sbc #0
        sta fx_xh,x
        lda fx_yl,x
        clc
        adc spd
        sta fx_yl,x
        lda fx_yh,x
        adc #0
        sta fx_yh,x

        inc fx_f,x
        lda fx_f,x
        lsr                             ; 3 frames per image
        lsr
        cmp #4
        bcc @draw
        stz fx_a,x
        txa
        clc
        adc #SL_FX
        jsr spr_hide
        bra @next
@draw:  clc
        adc #I_BOOM0
        sta pimg
        lda fx_xl,x
        sta px
        lda fx_xh,x
        sta px+1
        lda fx_yl,x
        sta py
        lda fx_yh,x
        sta py+1
        lda #Z_AIR
        sta pz
        txa
        clc
        adc #SL_FX
        jsr spr_put
@next:  dex
        bpl @lp
        rts

; ===========================================================================
; helpers
; ===========================================================================
; abs8 -- .A = |.A| treated as signed
abs8:
        bpl :+
        eor #$FF
        inc
:       rts

; add_score -- .A = BCD low byte, .X = BCD high byte
add_score:
        sed
        clc
        adc score
        sta score
        txa
        adc score+1
        sta score+1
        lda #0
        adc score+2
        sta score+2
        cld
        rts

; rand -- permutation-table PRNG, .A = next byte. Preserves .X/.Y.
rand:
        phx
        inc rng
        bne :+
        inc rng+1
:       lda rng
        eor rng+1
        tax
        lda permtab,x
        eor rng+1
        tax
        lda permtab,x
        plx
        rts
