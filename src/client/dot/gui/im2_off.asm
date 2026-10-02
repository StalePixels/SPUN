; Gives NextZXOS back the interrupt state that im2_save kept: the values it had,
; never zeros. Runs at exit and before a NextZXOS call that needs IM 1.
SECTION code_user

PUBLIC _im2_off

EXTERN _saved_i
EXTERN _saved_c0
EXTERN _saved_c4
EXTERN _saved_c5
EXTERN _saved_c6
EXTERN _saved_22
EXTERN _saved_23

_im2_off:
   di
   ld a,(_saved_c0)
   and $F9
   nextreg $C0,a
   ld a,(_saved_c4)
   nextreg $C4,a
   ld bc,$183B
   ld a,$03
   out (c),a
   ld a,(_saved_c5)
   nextreg $C5,a
   ld a,(_saved_c6)
   nextreg $C6,a
   ld a,(_saved_22)
   and $07
   nextreg $22,a
   ld a,(_saved_23)
   nextreg $23,a
   ld a,(_saved_i)
   ld i,a
   im 1
   ei
   ret
