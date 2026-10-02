; Tiles 0-31 would be the system variables at $5C00, so they are never written. DivMMC is over the
; ROM in a dot command, so the copy from ROM 3 unmaps it (port $E3) and runs from this bank at $C000.
SECTION BANK_44

PUBLIC _font_load

defc TILES = $5C00

_font_load:
   ld a,$52
   call read_reg
   push af
   ld a,$53
   call read_reg
   push af
   nextreg $52,10
   nextreg $53,11

   ld a,$8E
   call read_reg
   ld e,a
   in a,($E3)
   ld d,a
   push de
   ld a,e
   and $F0
   or $03
   nextreg $8E,a
   ld a,d
   and $7F
   out ($E3),a

   ld hl,$3D00
   ld de,TILES + 32 * 8
   ld bc,96 * 8
   ldir

   pop de
   ld a,d
   out ($E3),a
   ld a,e
   and $F7
   nextreg $8E,a

   ld hl,upper
   ld de,TILES + 128 * 8
   ld bc,128 * 8
   ldir

   pop af
   nextreg $53,a
   pop af
   nextreg $52,a
   ret

read_reg:
   ld bc,$243B
   out (c),a
   inc b
   in a,(c)
   ret

upper:
   BINARY "specp437_128-255.bin"
