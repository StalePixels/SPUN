; Hardware IM2 with only the ULA interrupt, once a frame, and the pointer in the
; middle of the screen. NextZXOS's stackless NMI bit in NR 0xC0 is kept.
SECTION code_user

PUBLIC _im2_on

EXTERN _im2_table
EXTERN _isr_ula
EXTERN _isr_spurious
EXTERN _mouse_last_x
EXTERN _mouse_last_y
EXTERN _ptr_x
EXTERN _ptr_y
EXTERN _mouse_btn
EXTERN _saved_c0

defc VECTOR_ULA = 11

PUBLIC _im2_quiet

_im2_quiet:
   ld hl,_isr_spurious
   ld (_im2_table + VECTOR_ULA * 2),hl
   ret

_im2_on:
   di
   ld hl,_im2_table
   ld de,_isr_spurious
   ld b,16
fill:
   ld (hl),e
   inc hl
   ld (hl),d
   inc hl
   djnz fill
   ld hl,_isr_ula
   ld (_im2_table + VECTOR_ULA * 2),hl

   ld hl,160
   ld (_ptr_x),hl
   ld hl,128
   ld (_ptr_y),hl
   ld a,$FF
   ld (_mouse_btn),a
   ld bc,$FBDF
   in a,(c)
   ld (_mouse_last_x),a
   ld bc,$FFDF
   in a,(c)
   ld (_mouse_last_y),a

   ld a,_im2_table / 256
   ld i,a
   im 2
   ld a,(_saved_c0)
   and $08
   or (_im2_table & $E0) | 1
   nextreg $C0,a
   nextreg $22,$00
   nextreg $C4,$01
   nextreg $C5,$00
   nextreg $C6,$00
   nextreg $C8,$FF
   nextreg $C9,$FF
   nextreg $CA,$FF
   ei
   ret
