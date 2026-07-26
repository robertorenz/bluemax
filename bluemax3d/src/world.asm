; ---------------------------------------------------------------------------
; world.asm -- targets, enemies and ordnance, projected into the forward view.
;
; Entities carry absolute world coordinates (u across, v into the screen).
; Every frame:
;     zrel   = v - camv          depth ahead of the camera
;     row    = rowtab[zrel >> 2] screen row, from the perspective table
;     screen x = u - camu + 160
;
; There is no horizontal convergence -- the ground plane has none either, since
; that would need per-band DC_HSCALE and that shears sprites. Depth is sold by
; the vertical squash plus swapping to half-size art in the far field.
; ---------------------------------------------------------------------------

K_FREE    = 0
K_BLDG    = 1
K_FACTORY = 2
K_AAGUN   = 3
K_DEPOT   = 4
K_TRUCK   = 5
K_TANK    = 6
K_HANGAR  = 7
K_TREE    = 8
K_WRECK   = 9

FAR_ROW   = 108                         ; above this, use the half-size sprite
; VERA gives the sprite renderer 798 cycles per scanline. Perspective crams
; every distant target into the few rows below the horizon, and a pile of them
; on one line blows that budget -- which silently drops sprites, including the
; player's. They are a couple of pixels tall up there anyway, so don't draw
; them until they are worth looking at.
NEAR_ROW  = 88
Z_SPAWN   = 460                         ; world depth new things appear at
Z_GONE    = 20                          ; and where they drop off the bottom

k_img:    .byte 0, I_BLDG, I_FACTORY, I_AAGUN, I_DEPOT, I_TRUCK, I_TANK
          .byte I_HANGAR, I_TREE, I_BLDG_HIT
k_far:    .byte 0, I_BLDG_F, I_FACTORY_F, I_AAGUN_F, I_DEPOT_F, I_TRUCK_F
          .byte I_TANK_F, I_HANGAR_F, I_TREE_F, I_BLDG_HIT_F
k_wreck:  .byte 0, I_BLDG_HIT, I_FACTORY_HIT, I_AAGUN_HIT, I_BLDG_HIT
          .byte I_BLDG_HIT, I_AAGUN_HIT, I_BLDG_HIT, I_BLDG_HIT, I_BLDG_HIT
k_hp:     .byte 0, 1, 2, 1, 1, 1, 2, 2, 1, 0
k_slo:    .byte 0, $50, $25, $75, $00, $60, $00, $00, $10, $00
k_shi:    .byte 0, $00, $01, $00, $01, $00, $01, $01, $00, $00
k_spawn:  .byte K_TREE, K_BLDG, K_TREE, K_AAGUN, K_BLDG, K_TRUCK, K_TANK
          .byte K_FACTORY, K_TREE, K_BLDG, K_AAGUN, K_HANGAR, K_DEPOT
          .byte K_TREE, K_TRUCK, K_BLDG
K_SPAWN_N = 16

a_img:    .byte I_FOE_BI, I_FOE_MONO
a_hp:     .byte 2, 1
a_slo:    .byte $00, $20
a_shi:    .byte $01, $01

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
        ldx #MAXCLOUD-1
:       stz cl_a,x
        dex
        bpl :-
        stz spawn_t
        stz airspawn_t
        stz cloud_t
        rts

; ---------------------------------------------------------------------------
; proj -- entity .X of an array: work out zrel, screen row and screen x.
; Inputs: ent_v / ent_u already loaded. Outputs: prow, px (16-bit).
; Carry set if the entity is off screen and should be retired.
; ---------------------------------------------------------------------------
proj:
        lda ent_v
        sec
        sbc camv
        sta zrel
        lda ent_v+1
        sbc camv+1
        sta zrel+1
        bmi @gone                       ; already behind us
        lda zrel+1
        cmp #4                          ; further than 1023 -> not yet visible
        bcs @gone
        lda zrel
        cmp #<Z_GONE
        lda zrel+1
        sbc #>Z_GONE
        bcc @gone
        jsr depth_row
        bcs @gone
        sta prow
        lda ent_u                       ; screen x = u - camu + 160
        sec
        sbc camu
        sta tmpa
        lda ent_u+1
        sbc camu+1
        sta tmpa+1                      ; finish the subtract before adding
        lda tmpa
        clc
        adc #<160
        sta px
        lda tmpa+1
        adc #>160
        sta px+1
        clc
        rts
@gone:  sec
        rts

; ===========================================================================
; Ground targets
; ===========================================================================
obj_spawn:
        ldx #MAXOBJ-1
@find:  lda obj_k,x
        beq @got
        dex
        bpl @find
        rts
@got:   lda camv                        ; drop it in at the far edge
        clc
        adc #<Z_SPAWN
        sta obj_v,x
        lda camv+1
        adc #>Z_SPAWN
        sta obj_vh,x
        jsr rand                        ; spread across the visible width
        sta tmpa
        lda camu
        clc
        adc tmpa
        sta obj_u,x
        lda camu+1
        adc #0
        sta obj_uh,x
        lda obj_u,x                     ; centre it: -128..+127 around camu
        sec
        sbc #128
        sta obj_u,x
        lda obj_uh,x
        sbc #0
        sta obj_uh,x

        jsr rand
        and #(K_SPAWN_N-1)
        tay
        lda k_spawn,y
        sta obj_k,x
        tay
        lda k_hp,y
        sta obj_hp,x
        jsr rand
        and #63
        clc
        adc #40
        sta obj_t,x
        rts

obj_update:
        ldx #MAXOBJ-1
@lp:    lda obj_k,x
        bne :+
        jmp @next
:       lda obj_v,x
        sta ent_v
        lda obj_vh,x
        sta ent_v+1
        lda obj_u,x
        sta ent_u
        lda obj_uh,x
        sta ent_u+1
        jsr proj
        bcc @alive
        stz obj_k,x
        txa
        clc
        adc #SL_OBJ
        jsr spr_hide
        bra @next
@alive:
        ; --- AA guns and tanks shoot once they are close enough ------------
        lda obj_k,x
        cmp #K_AAGUN
        beq @gun
        cmp #K_TANK
        bne @draw
@gun:   lda game_state
        cmp #ST_PLAY
        bne @draw
        lda prow
        cmp #130                        ; only when reasonably near
        bcc @draw
        dec obj_t,x
        lda obj_t,x
        bne @draw
        jsr rand
        and #63
        clc
        adc #75
        sta obj_t,x
        jsr flak_fire

@draw:  lda prow
        cmp #NEAR_ROW                   ; still a speck on the horizon
        bcs :+
        txa
        clc
        adc #SL_OBJ
        jsr spr_hide
        jmp @next
:       ldy obj_k,x
        lda prow
        cmp #FAR_ROW
        bcs :+
        lda k_far,y                     ; distant: half-size art
        bra @img
:       lda k_img,y
@img:   sta pimg
        lda prow
        sec
        sbc #6                          ; sit the base on the ground line
        sta py
        stz py+1
        lda #Z_AIR
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
flak_fire:
        ldy #MAXFLAK-1
@find:  lda fl_a,y
        beq @got
        dey
        bpl @find
        rts
@got:   lda #1
        sta fl_a,y
        lda px
        sta fl_x,y
        lda px+1
        sta fl_xh,y
        lda prow
        sta fl_y,y
        lda #70
        sta fl_life,y
        ; aim at the aeroplane's screen position
        lda px
        cmp #<160
        lda px+1
        sbc #>160
        lda #2
        bcs :+
        lda #<-2
:       sta fl_vx,y
        lda #<-3                        ; climb toward the aeroplane
        sta fl_vy,y
        jsr sfx_flak
        rts

; ===========================================================================
; Enemy aircraft -- they close head-on out of the distance
; ===========================================================================
air_spawn:
        ldx #MAXAIR-1
@find:  lda air_k,x
        beq @got
        dex
        bpl @find
        rts
@got:   lda camv
        clc
        adc #<Z_SPAWN
        sta air_v,x
        lda camv+1
        adc #>Z_SPAWN
        sta air_vh,x
        jsr rand
        sta tmpa
        lda camu
        clc
        adc tmpa
        sta air_u,x
        lda camu+1
        adc #0
        sta air_uh,x
        lda air_u,x
        sec
        sbc #128
        sta air_u,x
        lda air_uh,x
        sbc #0
        sta air_uh,x

        jsr rand
        and #1
        sta air_kind,x
        tay
        iny
        tya
        sta air_k,x
        dey
        lda a_hp,y
        sta air_hp,x
        jsr rand
        and #31
        clc
        adc #24
        sta air_alt,x
        lda #50
        sta air_tm,x
        rts

air_update:
        ldx #MAXAIR-1
@lp:    lda air_k,x
        bne :+
        jmp @next
:       ; They fly toward us, so close faster than the ground scrolls.
        lda air_v,x
        sec
        sbc #3
        sta air_v,x
        lda air_vh,x
        sbc #0
        sta air_vh,x
        sta ent_v+1
        lda air_v,x
        sta ent_v
        lda air_u,x
        sta ent_u
        lda air_uh,x
        sta ent_u+1
        jsr proj
        bcc @alive
        stz air_k,x
        txa
        clc
        adc #SL_AIR
        jsr spr_hide
        bra @next
@alive:
        lda prow
        cmp #FAR_ROW
        bcs :+
        lda #I_FOE_FAR
        bra @img
:       ldy air_kind,x
        lda a_img,y
@img:   sta pimg
        lda prow
        sec
        sbc air_alt,x                   ; altitude lifts it off the ground
        sta py
        lda #0
        sbc #0
        sta py+1
        lda #Z_AIR
        sta pz
        txa
        clc
        adc #SL_AIR
        jsr spr_put
@next:  dex
        bmi @done
        jmp @lp
@done:  rts

; ===========================================================================
; Flak / tracers -- plain screen-space projectiles
; ===========================================================================
flak_update:
        ldx #MAXFLAK-1
@lp:    lda fl_a,x
        bne :+
        jmp @next
:       lda fl_x,x
        clc
        adc fl_vx,x
        sta fl_x,x
        lda fl_vx,x
        bpl :+
        lda #$FF
        bra :++
:       lda #0
:       adc fl_xh,x
        sta fl_xh,x
        lda fl_y,x
        clc
        adc fl_vy,x
        sta fl_y,x

        dec fl_life,x
        beq @kill
        lda fl_y,x
        cmp #240
        bcs @kill

        ; does it have us?
        lda game_state
        cmp #ST_PLAY
        bne @draw
        lda ply_inv
        bne @draw
        lda fl_x,x
        sec
        sbc #160
        jsr abs8
        cmp #12
        bcs @draw
        lda fl_y,x
        sec
        sbc ply_row
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

@draw:  lda fl_x,x
        sta px
        lda fl_xh,x
        sta px+1
        lda fl_y,x
        sta py
        stz py+1
        lda #I_FLAK
        sta pimg
        lda #Z_AIR
        sta pz
        txa
        clc
        adc #SL_FLAK
        jsr spr_put
        bra @next
@kill:  stz fl_a,x
        txa
        clc
        adc #SL_FLAK
        jsr spr_hide
@next:  dex
        bmi @done
        jmp @lp
@done:  rts

; ===========================================================================
; Player bullets -- they race away into the distance
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
        lda #160
        sta sh_x,x
        lda ply_row
        sec
        sbc #10
        sta sh_y,x
        lda #26
        sta sh_life,x
        rts

shot_update:
        ldx #MAXSHOT-1
@lp:    lda sh_a,x
        beq @next
        lda sh_y,x
        sec
        sbc #6                          ; up the screen = away from us
        sta sh_y,x
        cmp #HORIZON
        bcc @kill
        dec sh_life,x
        beq @kill
        jsr shot_vs_air
        lda sh_a,x
        beq @next

        lda sh_x,x
        sta px
        stz px+1
        lda sh_y,x
        sta py
        stz py+1
        lda #I_BULLET
        sta pimg
        lda #Z_AIR
        sta pz
        txa
        clc
        adc #SL_SHOT
        jsr spr_put
        bra @next
@kill:  stz sh_a,x
        txa
        clc
        adc #SL_SHOT
        jsr spr_hide
@next:  dex
        bpl @lp
        rts

; ---------------------------------------------------------------------------
; shot_vs_air -- bullets only bite what is drawn near them on screen
; ---------------------------------------------------------------------------
shot_vs_air:
        ldy #MAXAIR-1
@lp:    lda air_k,y
        bne :+
        jmp @next
:       lda air_v,y                     ; project to compare on screen
        sta ent_v
        lda air_vh,y
        sta ent_v+1
        lda air_u,y
        sta ent_u
        lda air_uh,y
        sta ent_u+1
        phx
        jsr proj
        plx
        bcs @next
        lda prow
        sec
        sbc air_alt,y
        sec
        sbc sh_y,x
        jsr abs8
        cmp #14
        bcs @next
        lda px
        sec
        sbc sh_x,x
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
        bne @out
        lda px
        sta ex
        lda px+1
        sta ex+1
        lda prow
        sec
        sbc air_alt,y
        sta ey
        stz ey+1
        phy
        jsr fx_spawn
        jsr sfx_boom
        ply
        lda air_kind,y
        tax
        lda a_shi,x
        pha
        lda a_slo,x
        plx
        phy
        jsr add_score
        ply
        lda #0
        sta air_k,y
        tya
        clc
        adc #SL_AIR
        jsr spr_hide
@out:   rts
@next:  dey
        bmi @done
        jmp @lp
@done:  rts

; ===========================================================================
; Bombs -- they keep our velocity, so they hold a screen position and fall.
; Drop height decides how far ahead the ground has moved by impact.
; ===========================================================================
bomb_fire:
        ldx #MAXBOMB-1
@find:  lda bm_a,x
        beq @got
        dex
        bpl @find
        rts
@got:   lda #1
        sta bm_a,x
        lda #160
        sta bm_x,x
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
        beq @next
        inc bm_g,x
        lda bm_g,x
        and #7
        bne @fall
        lda bm_vy,x
        cmp #5
        bcs @fall
        inc bm_vy,x
@fall:  lda bm_alt,x
        sec
        sbc bm_vy,x
        bcc @land
        sta bm_alt,x
        bne @draw
@land:  stz bm_a,x
        lda bm_x,x
        sta ex
        stz ex+1
        lda #PLY_GROUND                 ; impact is on the deck, not at our height
        sta ey
        stz ey+1
        phx                             ; bomb_vs_ground walks the target list
        jsr fx_spawn                    ; with .X, so save the bomb index
        jsr sfx_boom
        jsr bomb_vs_ground
        plx
        txa
        clc
        adc #SL_BOMB
        jsr spr_hide
        bra @next
@draw:  lda bm_x,x
        sta px
        stz px+1
        lda #PLY_GROUND                 ; falls from our altitude down to the deck
        sec
        sbc bm_alt,x
        sta py
        stz py+1
        lda #I_BOMB
        sta pimg
        lda #Z_AIR
        sta pz
        txa
        clc
        adc #SL_BOMB
        jsr spr_put
@next:  dex
        bpl @lp
        rts

; ---------------------------------------------------------------------------
; bomb_vs_ground -- anything drawn near the impact point takes it
; ---------------------------------------------------------------------------
bomb_vs_ground:
        ldx #MAXOBJ-1
@lp:    lda obj_k,x
        beq @next
        cmp #K_WRECK
        beq @next
        cmp #K_TREE
        beq @next
        lda obj_v,x
        sta ent_v
        lda obj_vh,x
        sta ent_v+1
        lda obj_u,x
        sta ent_u
        lda obj_uh,x
        sta ent_u+1
        phx
        jsr proj
        plx
        bcs @next
        lda prow
        sec
        sbc ey
        jsr abs8
        cmp #14
        bcs @next
        lda px
        sec
        sbc ex
        jsr abs8
        cmp #16
        bcs @next
        phx
        jsr obj_damage
        plx
@next:  dex
        bpl @lp
        rts

obj_damage:
        lda obj_hp,x
        beq @dead
        dec obj_hp,x
        bne @done
@dead:  phx
        ldy obj_k,x
        lda k_shi,y
        pha
        lda k_slo,y
        plx
        jsr add_score
        plx
        lda #K_WRECK
        sta obj_k,x
        inc kills
        jmp fx_spawn
@done:  rts

; ===========================================================================
; Explosions
; ===========================================================================
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
        sta fx_x,x
        lda ex+1
        sta fx_xh,x
        lda ey
        sta fx_y,x
        stz fx_f,x
        rts

fx_update:
        ldx #MAXFX-1
@lp:    lda fx_a,x
        beq @next
        inc fx_f,x
        lda fx_f,x
        lsr
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
        lda fx_x,x
        sta px
        lda fx_xh,x
        sta px+1
        lda fx_y,x
        sta py
        stz py+1
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
; Clouds -- pure scenery, drifting down the sky as we fly into them
; ===========================================================================
cloud_update:
        ldx #MAXCLOUD-1
@lp:    lda cl_a,x
        beq @next
        lda frame
        and #1
        bne @draw
        inc cl_y,x
        lda cl_y,x
        cmp #HORIZON
        bcc @draw
        stz cl_a,x
        txa
        clc
        adc #SL_CLOUD
        jsr spr_hide
        bra @next
@draw:  lda cl_x,x
        sta px
        lda cl_xh,x
        sta px+1
        lda cl_y,x
        sta py
        stz py+1
        lda cl_img,x
        sta pimg
        lda #Z_AIR
        sta pz
        txa
        clc
        adc #SL_CLOUD
        jsr spr_put
@next:  dex
        bpl @lp
        rts

cloud_spawn:
        ldx #MAXCLOUD-1
@find:  lda cl_a,x
        beq @got
        dex
        bpl @find
        rts
@got:   lda #1
        sta cl_a,x
        jsr rand
        sta cl_x,x
        stz cl_xh,x
        lda cl_x,x
        cmp #150
        bcc :+
        sec
        sbc #150
        sta cl_x,x
:       asl cl_x,x
        rol cl_xh,x
        jsr rand
        and #31
        clc
        adc #6
        sta cl_y,x
        jsr rand
        and #1
        clc
        adc #I_CLOUD0
        sta cl_img,x
        rts

; ===========================================================================
abs8:
        bpl :+
        eor #$FF
        inc
:       rts

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
