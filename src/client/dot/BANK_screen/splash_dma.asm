; void splash_dma(uint16_t from) __z88dk_fastcall
; The DMA's other registers are set by splash.c; the DMA stops at the end of each block.
SECTION BANK_44

PUBLIC _splash_dma
EXTERN _splashLength

_splash_dma:
   ld b,64
next:
   ld a,$7D
   out ($6B),a
   ld a,l
   out ($6B),a
   ld a,h
   out ($6B),a
   ld a,(_splashLength)
   out ($6B),a
   xor a
   out ($6B),a
   ld a,$AD
   out ($6B),a
   dec hl
   dec hl
   ld a,l
   out ($6B),a
   ld a,h
   out ($6B),a
   inc hl
   inc hl
   ld a,$CF
   out ($6B),a
   ld a,$87
   out ($6B),a
   inc h
   djnz next
   ret

; void splash_row(uint8_t *row) __z88dk_fastcall
PUBLIC _splash_row

_splash_row:
   ex de,hl
   ld hl,$4000 + 246
   ld b,64
row_next:
   ld a,(de)
   ld (hl),a
   inc l
   ld (hl),a
   dec l
   inc de
   inc h
   djnz row_next
   ret
