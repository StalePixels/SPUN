; Enter and leave code for the decoder in inflate.asm, and its two code images.
; Must be linked at $4000 or above, outside MMU2: it runs while MMU0 changes.

INCLUDE "inflate_job.inc"

SECTION code_user

PUBLIC _inflate_call
EXTERN _inflate_progress

; hl = struct inflate_job *
; Saves the machine state into the job and enters the decoder at its start. inflate.asm
; returns to stub_leave with every other slot restored.
_inflate_call:
   push ix
   push iy
   ld a,i
   di
   push af
   ld (stub_sp),sp
   ld (stub_job),hl
   push hl
   pop ix
   ld (ix + J_SELF),l
   ld (ix + J_SELF + 1),h
   ld de,stub_leave
   ld (ix + J_LEAVE),e
   ld (ix + J_LEAVE + 1),d
   ld de,stub_progress
   ld (ix + J_PROGRESS),e
   ld (ix + J_PROGRESS + 1),d
   ld de,$0000

; ix = job, de = address in page A
; Saves the machine state into the job, switches off the automap entry points that fire
; without ROM3 and the NMI buttons, pages the decoder into MMU0 and jumps to de with hl = job.
stub_enter:
   push ix
   pop hl
   ld bc,J_HMMU
   add hl,bc
   ld c,REG_MMU0
stub_mmu:
   ld a,c
   call stub_getreg
   ld (hl),a
   inc hl
   inc c
   ld a,c
   cp REG_MMU7 + 1
   jr nz,stub_mmu
   in a,(PORT_DIVMMC)
   ld (ix + J_HE3),a
   ld a,REG_PERIPH2
   call stub_getreg
   ld (ix + J_R06),a
   and $E7
   nextreg REG_PERIPH2,a
   ld a,REG_VALID0
   call stub_getreg
   ld (ix + J_RB9),a
   cpl
   ld b,a
   ld a,REG_ENTRY0
   call stub_getreg
   ld (ix + J_RB8),a
   and b
   ld (ix + J_B8C),a
   nextreg REG_ENTRY0,a
   ld a,REG_ENTRY1
   call stub_getreg
   ld (ix + J_RBB),a
   and $FC
   ld (ix + J_BBC),a
   nextreg REG_ENTRY1,a
   ld a,(ix + J_PA)
   nextreg REG_MMU0,a
   xor a
   out (PORT_DIVMMC),a
   push ix
   pop hl
   push de
   ret

; a = Next register number
; a <- value
stub_getreg:
   push bc
   ld bc,$243B
   out (c),a
   inc b
   in a,(c)
   pop bc
   ret

; ix = job
; Puts back MMU0, the DivMMC, the automap entry points and the NMI buttons.
stub_restore:
   ld a,(ix + J_HMMU)
   nextreg REG_MMU0,a
   ld a,(ix + J_HE3)
   out (PORT_DIVMMC),a
   ld a,(ix + J_RB8)
   nextreg REG_ENTRY0,a
   ld a,(ix + J_RBB)
   nextreg REG_ENTRY1,a
   ld a,(ix + J_R06)
   nextreg REG_PERIPH2,a
   ret

stub_leave:
   ld sp,(stub_sp)
   ld ix,(stub_job)
   call stub_restore
   ld l,(ix + J_RESULT)
   ld h,0
   pop af
   pop iy
   pop ix
   ret po
   ei
   ret

; de = the address in page A to go back to
; inflate_progress runs on the host's stack, with the caller's ix and iy and interrupts off.
stub_progress:
   ld sp,(stub_sp)
   pop af
   pop iy
   pop ix
   push ix
   push iy
   push af
   push de
   ld ix,(stub_job)
   call stub_restore
   call _inflate_progress
   pop de
   ld ix,(stub_job)
   jp stub_enter

SECTION data_user

stub_sp:  defw 0
stub_job: defw 0
