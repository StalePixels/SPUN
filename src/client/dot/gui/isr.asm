; All of it is in main memory, which stays paged in, and it uses only I/O ports and its own
; variables: no nextreg and nothing in $4000-$7FFF, where the NBN block is paged during a read.
SECTION code_user

PUBLIC _im2_table
PUBLIC _isr_ula
PUBLIC _isr_spurious
PUBLIC _ptr_x
PUBLIC _ptr_y
PUBLIC _mouse_btn
PUBLIC _mouse_last_x
PUBLIC _mouse_last_y

; 16 vectors at the top of main memory, so on a 32-byte boundary, and the mouse
; variables below them; the stack starts below those (REGISTER_SP = $BFD8)
defc _im2_table = $BFE0
defc _ptr_x = $BFD8
defc _ptr_y = $BFDA
defc _mouse_btn = $BFDC
defc _mouse_last_x = $BFDD
defc _mouse_last_y = $BFDE

defc POINTER_PATTERN = 63
; Rows 1-30 of the tilemap: rows 0 and 31 are outside the picture on a 60 Hz display
defc POINTER_TOP = 8
defc POINTER_BOTTOM = 247

_isr_ula:
   push af
   push bc
   push de
   push hl
   call mouse
   pop hl
   pop de
   pop bc
   pop af
   ei
   reti

_isr_spurious:
   ei
   reti

; The Kempston counters wrap at 256, so the change since the last read is a signed
; byte. Their Y goes up when the mouse moves up; the screen Y goes down.
mouse:
   ld bc,$FBDF
   in a,(c)
   ld hl,_mouse_last_x
   ld e,a
   sub (hl)
   ld (hl),e
   ld e,a
   ld d,0
   bit 7,a
   jr z,x_add
   dec d
x_add:
   ld hl,(_ptr_x)
   add hl,de
   bit 7,h
   jr z,x_low
   ld hl,0
x_low:
   ld de,320
   push hl
   or a
   sbc hl,de
   pop hl
   jr c,x_set
   ld hl,319
x_set:
   ld (_ptr_x),hl

   ld bc,$FFDF
   in a,(c)
   ld hl,_mouse_last_y
   ld e,a
   sub (hl)
   ld (hl),e
   neg
   ld e,a
   ld d,0
   bit 7,a
   jr z,y_add
   dec d
y_add:
   ld hl,(_ptr_y)
   add hl,de
   bit 7,h
   jr nz,y_top
   ld a,h
   or a
   jr nz,y_bottom
   ld a,l
   cp POINTER_TOP
   jr c,y_top
   cp POINTER_BOTTOM + 1
   jr c,y_set
y_bottom:
   ld hl,POINTER_BOTTOM
   jr y_set
y_top:
   ld hl,POINTER_TOP
y_set:
   ld (_ptr_y),hl

   ld bc,$FADF
   in a,(c)
   ld (_mouse_btn),a

   ld bc,$303B
   xor a
   out (c),a
   ld a,(_ptr_x)
   out ($57),a
   ld a,(_ptr_y)
   out ($57),a
   ld a,(_ptr_x + 1)
   and 1
   out ($57),a
   ld a,$80 | POINTER_PATTERN
   out ($57),a
   ret

