SECTION code_user

PUBLIC _im2_save
PUBLIC _saved_i
PUBLIC _saved_c0
PUBLIC _saved_c4
PUBLIC _saved_c5
PUBLIC _saved_c6
PUBLIC _saved_22
PUBLIC _saved_23

_im2_save:
   ld a,i
   ld (_saved_i),a
   ld a,$C0
   call read_reg
   ld (_saved_c0),a
   ld a,$C4
   call read_reg
   ld (_saved_c4),a
   ld a,$C5
   call read_reg
   ld (_saved_c5),a
   ld a,$C6
   call read_reg
   ld (_saved_c6),a
   ld a,$22
   call read_reg
   ld (_saved_22),a
   ld a,$23
   call read_reg
   ld (_saved_23),a
   ret

read_reg:
   ld bc,$243B
   out (c),a
   inc b
   in a,(c)
   ret

SECTION bss_user

_saved_i:  defb 0
_saved_c0: defb 0
_saved_c4: defb 0
_saved_c5: defb 0
_saved_c6: defb 0
_saved_22: defb 0
_saved_23: defb 0
