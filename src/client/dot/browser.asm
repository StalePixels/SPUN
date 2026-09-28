; The M_P3DOS calls that .spun makes itself, and their data. M_P3DOS takes data
; only at $4000-$BFE0; main memory ends below that (the build's main fence).
SECTION code_user

PUBLIC _fileTypes
PUBLIC _browserHelp
PUBLIC _dos_mapping

_fileTypes:
   defb $ff
_browserHelp:
   defm "Go to the install directory and press SPACE"
   defb 0

; unsigned int dos_mapping(unsigned char drive) __z88dk_fastcall
; IDE_DOS_MAPPING ($00F7) for drive 'A'-'P': hl = unit (4 = RAMdisk, $ff = disk
; image), $0100 if the drive is not mapped, $ffff on an error.
_dos_mapping:
   push ix
   push iy
   ld iy,$5c3a                 ; ERR_NR, which IDE_ calls expect in IY
   ld bc,dosMapBuf             ; bc and hl go in B'C' and H'L' for M_P3DOS
   exx
   ld de,$00f7                 ; IDE_DOS_MAPPING
   ld c,7                      ; RAM bank 7
   rst $08
   defb $94                    ; M_P3DOS
   pop iy
   pop ix
   jr nc,dosMapError
   ld hl,$0100
   ret z
   ld l,a
   ld h,0
   ret
dosMapError:
   ld hl,$ffff
   ret

dosMapBuf:
   defs 18
